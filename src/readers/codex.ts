import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { ServerConfig } from "../types.js";

function codexConfigPath(): string {
  const home = homedir();
  if (platform() === "win32") {
    return join(home, ".codex", "config.toml");
  }
  return join(home, ".codex", "config.toml");
}

interface CodexTomlServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

function parseTomlServers(content: string): Record<string, CodexTomlServer> {
  const servers: Record<string, CodexTomlServer> = {};
  const lines = content.split(/\r?\n/);
  let inServers = false;
  let currentName: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed === "[mcp_servers]") {
      inServers = true;
      continue;
    }
    if (trimmed.startsWith("[")) {
      inServers = false;
      currentName = null;
      continue;
    }
    if (!inServers) continue;

    const sectionMatch = trimmed.match(/^\[mcp_servers\.([^\]]+)\]$/);
    if (sectionMatch) {
      currentName = sectionMatch[1] ?? null;
      if (currentName) {
        servers[currentName] = { command: "", args: [] };
      }
      continue;
    }

    if (!currentName) continue;

    const kv = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = (kv[2] ?? "").trim();

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else if (value.startsWith("[") && value.endsWith("]")) {
      try {
        const arr = JSON.parse(value.replace(/'/g, '"')) as unknown[];
        if (Array.isArray(arr)) {
          value = arr.join(" ");
        }
      } catch {
        value = value.slice(1, -1);
      }
    }

    const target = servers[currentName];
    if (!target) continue;
    if (key === "command") target.command = value;
    else if (key === "args") target.args = value.split(/\s+/).filter(Boolean);
    else if (key === "env" && value.startsWith("{")) {
      try {
        target.env = JSON.parse(value) as Record<string, string>;
      } catch {
        target.env = {};
      }
    }
  }
  return servers;
}

export function readCodex(): ServerConfig[] {
  const path = codexConfigPath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const servers = parseTomlServers(raw);
  return Object.entries(servers)
    .filter(([, cfg]) => cfg.command)
    .map(([name, cfg]) => ({
      name,
      command: cfg.command,
      args: cfg.args ?? [],
      env: cfg.env,
      source: "codex",
      configPath: path,
    }));
}
