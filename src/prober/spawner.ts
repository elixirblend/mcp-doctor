import { spawn, type ChildProcess } from "node:child_process";
import type { ProbedServer, ServerConfig, ServerStatus } from "../types.js";

const PROTOCOL_VERSION = "2024-11-05";
const PROBE_TIMEOUT_MS = 15_000;
const HANG_THRESHOLD_MS = 5_000;

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: { required?: string[] };
}

interface McpInitializeResult {
  protocolVersion?: string;
  capabilities?: unknown;
  serverInfo?: { name?: string; version?: string };
}

function send(child: ChildProcess, id: number, method: string, params: unknown = {}): void {
  const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  child.stdin?.write(payload);
}

export async function probeServer(config: ServerConfig): Promise<ProbedServer> {
  const start = Date.now();
  const base: Omit<ProbedServer, "status" | "durationMs" | "toolCount" | "emptyArgTools" | "toolNames"> = {
    config,
    probedAt: start,
    protocolVersion: undefined,
    errorMessage: undefined,
    stderr: undefined,
  };

  let child: ChildProcess;
  try {
    child = spawn(config.command, config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(config.env ?? {}) },
      shell: false,
      windowsHide: true,
    });
  } catch (err) {
    return {
      ...base,
      status: classifySpawnError(err),
      durationMs: 0,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const initResponse = await new Promise<JsonRpcResponse | "hang" | "exit">((resolve) => {
    let buf = "";
    let resolved = false;
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === 1) {
            resolved = true;
            resolve(parsed);
            return;
          }
        } catch {
          // non-JSON output, keep reading
        }
      }
    };
    const onStderr = (chunk: Buffer) => {
      // capture but don't resolve
      base.stderr = (base.stderr ?? "") + chunk.toString("utf8");
    };
    const timer = setTimeout(() => {
      if (!resolved) resolve("hang");
    }, HANG_THRESHOLD_MS);
    const killTimer = setTimeout(() => {
      if (!resolved) resolve("hang");
      child.kill();
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onStderr);
    child.on("exit", () => {
      if (!resolved) resolve("exit");
    });
    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        clearTimeout(killTimer);
        base.errorMessage = err.message;
        resolve("exit");
      }
    });
    send(child, 1, "initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mcp-doctor", version: "0.2.0" },
    });
  });

  if (initResponse === "hang") {
    child.kill();
    return {
      ...base,
      status: "hangs",
      durationMs: Date.now() - start,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: "Server did not respond to initialize within " + HANG_THRESHOLD_MS + "ms",
    };
  }
  if (initResponse === "exit") {
    return {
      ...base,
      status: classifyError(base.errorMessage, base.stderr),
      durationMs: Date.now() - start,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: base.errorMessage ?? base.stderr?.split("\n")[0],
    };
  }
  if (initResponse.error) {
    child.kill();
    return {
      ...base,
      status: "auth_required",
      durationMs: Date.now() - start,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: initResponse.error.message,
    };
  }

  const initResult = initResponse.result as McpInitializeResult | undefined;
  const protocolVersion = initResult?.protocolVersion;

  // Send initialized notification
  send(child, 0, "notifications/initialized", {});

  // Now list tools
  const toolsResponse = await new Promise<JsonRpcResponse | "hang">((resolve) => {
    let buf = "";
    let resolved = false;
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === 2) {
            resolved = true;
            resolve(parsed);
            return;
          }
        } catch {
          // ignore
        }
      }
    };
    setTimeout(() => {
      if (!resolved) resolve("hang");
      child.kill();
    }, PROBE_TIMEOUT_MS - (Date.now() - start));
    child.stdout?.on("data", onData);
    send(child, 2, "tools/list", {});
  });

  child.kill();

  if (toolsResponse === "hang") {
    return {
      ...base,
      status: "hangs",
      durationMs: Date.now() - start,
      protocolVersion,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: "Server responded to initialize but hung on tools/list",
    };
  }

  if (toolsResponse.error) {
    return {
      ...base,
      status: "broken",
      durationMs: Date.now() - start,
      protocolVersion,
      toolCount: 0,
      emptyArgTools: 0,
      toolNames: [],
      errorMessage: toolsResponse.error.message,
    };
  }

  const result = toolsResponse.result as { tools?: McpTool[] } | undefined;
  const tools = result?.tools ?? [];
  const toolNames = tools.map((t) => t.name);
  const emptyArgTools = tools.filter((t) => {
    const req = t.inputSchema?.required;
    return !req || req.length === 0;
  }).length;

  return {
    ...base,
    status: "alive",
    durationMs: Date.now() - start,
    protocolVersion,
    toolCount: tools.length,
    emptyArgTools,
    toolNames,
  };
}

function classifySpawnError(err: unknown): ServerStatus {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("ENOENT")) return "install_error";
  if (msg.includes("EACCES") || msg.includes("EPERM")) return "install_error";
  return "broken";
}

function classifyError(errorMessage: string | undefined, stderr: string | undefined): ServerStatus {
  const text = `${errorMessage ?? ""} ${stderr ?? ""}`.toLowerCase();
  if (text.includes("api_key") || text.includes("token") || text.includes("auth")) return "auth_required";
  if (text.includes("--config") || text.includes("usage") || text.includes("requires")) return "needs_args";
  if (text.includes("env") || text.includes("not set")) return "needs_env";
  if (text.includes("enoent") || text.includes("cannot find")) return "install_error";
  if (text.includes("syntax") || text.includes("unexpected")) return "broken";
  return "broken";
}
