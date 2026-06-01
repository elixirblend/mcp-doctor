import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { ServerConfig } from "../types.js";

export type TargetClient = "claude" | "cursor" | "codex";

interface ClaudeJson {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}
interface CursorJson {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

function defaultConfigPath(client: TargetClient): string {
  const home = homedir();
  const win = platform() === "win32";
  if (client === "claude") {
    if (win) {
      return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
    }
    if (platform() === "darwin") {
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    }
    return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude", "claude_desktop_config.json");
  }
  if (client === "cursor") {
    if (win) return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Cursor", "mcp.json");
    if (platform() === "darwin") return join(home, "Library", "Application Support", "Cursor", "mcp.json");
    return join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Cursor", "mcp.json");
  }
  return join(home, ".codex", "config.toml");
}

export function addServerToConfig(
  client: TargetClient,
  configPath: string,
  server: { name: string; command: string; args: string[]; env?: Record<string, string> }
): { path: string; finalName: string; written: boolean } {
  if (client === "codex") {
    throw new Error("Adding to Codex TOML config is not yet supported");
  }

  let parsed: ClaudeJson | CursorJson = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf8");
      parsed = JSON.parse(raw) as ClaudeJson;
    } catch (err) {
      throw new Error(`Failed to read existing config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const servers = parsed.mcpServers ?? {};
  const finalName = ensureUniqueName(servers, server.name);

  servers[finalName] = {
    command: server.command,
    args: server.args,
    env: server.env,
  };
  parsed.mcpServers = servers;

  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    throw new Error(`Config directory does not exist: ${dir}`);
  }

  const tmpPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmpPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    renameSync(tmpPath, configPath);
  } catch (err) {
    throw new Error(`Failed to write config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { path: configPath, finalName, written: true };
}

function ensureUniqueName(
  existing: Record<string, unknown>,
  desired: string
): string {
  if (!(desired in existing)) return desired;
  let i = 2;
  while (`${desired}-${i}` in existing) i++;
  return `${desired}-${i}`;
}

export function resolveTarget(
  client: TargetClient | undefined,
  explicitPath: string | undefined
): { client: TargetClient; path: string } {
  if (explicitPath) {
    const resolvedClient = client ?? "claude";
    return { client: resolvedClient, path: explicitPath };
  }
  if (!client) return { client: "claude", path: defaultConfigPath("claude") };
  return { client, path: defaultConfigPath(client) };
}

export function readExistingServers(configPath: string, client: TargetClient): ServerConfig[] {
  if (!existsSync(configPath)) return [];
  if (client === "codex") return [];
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as ClaudeJson | CursorJson;
    const servers = parsed.mcpServers ?? {};
    return Object.entries(servers).map(([name, cfg]) => ({
      name,
      command: cfg.command,
      args: cfg.args ?? [],
      env: cfg.env,
      source: client,
      configPath,
    }));
  } catch {
    return [];
  }
}
