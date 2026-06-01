import * as readline from "node:readline";
import { probeServer } from "../prober/index.js";
import { checkRepoHealth, scoreServer } from "../checks/index.js";
import type { ServerConfig, ServerReport } from "../types.js";

const VERSION = "0.2.0";
const PROTOCOL_VERSION = "2024-11-05";

interface AuditToolInput {
  servers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  noHealth?: boolean;
  concurrency?: number;
}

function send(id: number | undefined, payload: object): void {
  const msg = id !== undefined ? { jsonrpc: "2.0", id, ...payload } : { jsonrpc: "2.0", ...payload };
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function sendResponse(id: number, result: unknown): void {
  send(id, { result });
}

function sendError(id: number | undefined, code: number, message: string, data?: unknown): void {
  send(id, { error: { code, message, data } });
}

function toolResult(text: string, isError = false): unknown {
  return { content: [{ type: "text", text }], isError };
}

function formatReportForAgent(reports: ServerReport[]): string {
  if (reports.length === 0) {
    return "No servers were provided to audit.";
  }
  const lines: string[] = [];
  lines.push(`mcp-trust audit: ${reports.length} server${reports.length === 1 ? "" : "s"} audited`);
  lines.push("");

  for (const r of reports) {
    const icon = r.server.status === "alive" ? "ALIVE" : r.server.status.toUpperCase();
    lines.push(`## ${r.server.config.name}`);
    lines.push(`  status:   ${icon}`);
    lines.push(`  verdict:  ${r.verdict} (score ${r.score})`);
    lines.push(`  source:   ${r.server.config.source} (${r.server.config.command})`);
    lines.push(`  duration: ${r.server.durationMs}ms`);
    if (r.server.toolCount > 0) {
      lines.push(`  tools:    ${r.server.toolCount} (${r.server.emptyArgTools} require args)`);
    }
    if (r.server.errorMessage) {
      lines.push(`  error:    ${r.server.errorMessage}`);
    }
    if (r.health) {
      const age = r.health.lastCommitDaysAgo ?? "?";
      lines.push(`  repo:     ${r.health.repo} | ${r.health.stars} stars | last commit ${age}d ago | ${r.health.weeklyDownloads} weekly downloads`);
      if (r.health.archived) lines.push("  archived: yes");
      if (r.health.cveCount > 0) lines.push(`  cves:     ${r.health.cveCount}`);
    } else if (r.server.status === "alive") {
      lines.push("  repo:     (health lookup skipped or unavailable)");
    }
    if (r.issues.length > 0) {
      lines.push("  issues:");
      for (const i of r.issues) lines.push(`    - ${i}`);
    }
    if (r.recommendations.length > 0) {
      lines.push("  recommendations:");
      for (const rec of r.recommendations) lines.push(`    - ${rec}`);
    }
    lines.push("");
  }

  const alive = reports.filter((r) => r.server.status === "alive").length;
  const failing = reports.length - alive;
  const avg = Math.round(reports.reduce((s, r) => s + r.score, 0) / reports.length);
  lines.push(`summary: ${alive} alive, ${failing} failing, avg score ${avg}`);

  return lines.join("\n");
}

function buildServers(input: AuditToolInput): ServerConfig[] {
  const out: ServerConfig[] = [];
  for (const [name, def] of Object.entries(input.servers ?? {})) {
    if (!def || typeof def !== "object" || typeof def.command !== "string") continue;
    out.push({
      name,
      command: def.command,
      args: Array.isArray(def.args) ? def.args.map(String) : [],
      env: def.env && typeof def.env === "object" ? Object.fromEntries(Object.entries(def.env).map(([k, v]) => [k, String(v)])) : undefined,
      source: "manual",
      configPath: "<mcp-tool-call>",
    });
  }
  return out;
}

async function runAuditTool(input: AuditToolInput): Promise<ServerReport[]> {
  const servers = buildServers(input);
  if (servers.length === 0) return [];
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 4, 16));
  const token = process.env.GITHUB_TOKEN;
  const reports: ServerReport[] = [];

  for (let i = 0; i < servers.length; i += concurrency) {
    const batch = servers.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (cfg) => {
        const probed = await probeServer(cfg);
        const health = input.noHealth ? null : await checkRepoHealth(cfg.command, cfg.args, cfg.env, token);
        return scoreServer(probed, health);
      })
    );
    reports.push(...results);
  }
  return reports;
}

const AUDIT_TOOL = {
  name: "mcp_trust_audit",
  description:
    "Audit a set of MCP server configurations. Spawns each server, performs a real MCP JSON-RPC initialize + tools/list handshake, then scores it A-F based on health, recency, tool surface, and known CVEs. Returns a structured report with issues and recommendations for each server.",
  inputSchema: {
    type: "object",
    properties: {
      servers: {
        type: "object",
        description: "Map of server name to { command, args?, env? }. Each will be spawned and probed.",
        additionalProperties: {
          type: "object",
          properties: {
            command: { type: "string", description: "Executable to run (e.g. 'npx', 'node', 'python')." },
            args: { type: "array", items: { type: "string" }, description: "Arguments to pass." },
            env: { type: "object", additionalProperties: { type: "string" }, description: "Environment variables." },
          },
          required: ["command"],
        },
      },
      noHealth: { type: "boolean", description: "Skip GitHub/npm repo health lookups (faster)." },
      concurrency: { type: "number", description: "Max servers to probe in parallel (default 4, max 16)." },
    },
    required: ["servers"],
  },
};

function handleInitialize(id: number): void {
  sendResponse(id, {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: { name: "mcp-trust", version: VERSION },
  });
}

function handleToolsList(id: number): void {
  sendResponse(id, { tools: [AUDIT_TOOL] });
}

async function handleToolsCall(id: number, params: { name?: string; arguments?: unknown } | undefined): Promise<void> {
  if (!params || params.name !== "mcp_trust_audit") {
    sendError(id, -32602, `Unknown tool: ${params?.name ?? "<none>"}`);
    return;
  }
  const args = (params.arguments ?? {}) as AuditToolInput;
  if (!args.servers || typeof args.servers !== "object") {
    sendResponse(id, toolResult("Error: 'servers' must be an object mapping name -> {command, args?, env?}", true));
    return;
  }
  try {
    const reports = await runAuditTool(args);
    const text = formatReportForAgent(reports);
    sendResponse(id, toolResult(text, false));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    sendResponse(id, toolResult(`Audit failed: ${msg}`, true));
  }
}

export async function runServe(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: { id?: number; method?: string; params?: unknown };
    try {
      msg = JSON.parse(trimmed);
    } catch {
      sendError(undefined, -32700, "Parse error");
      return;
    }
    const { id, method, params } = msg;
    if (method === "initialize") {
      handleInitialize(id ?? 0);
    } else if (method === "tools/list") {
      handleToolsList(id ?? 0);
    } else if (method === "tools/call") {
      void handleToolsCall(id ?? 0, params as { name?: string; arguments?: unknown });
    } else if (method && method.startsWith("notifications/")) {
      // no response for notifications
    } else if (method === "ping") {
      sendResponse(id ?? 0, {});
    } else if (id !== undefined) {
      sendError(id, -32601, `Method not found: ${method}`);
    }
  });
  rl.on("close", () => {
    process.exit(0);
  });
}
