import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { ServerConfig } from "../types.js";

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

function claudeConfigPath(): string {
  if (platform() === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "Claude", "claude_desktop_config.json");
}

export function readClaudeDesktop(): ServerConfig[] {
  const path = claudeConfigPath();
  if (!existsSync(path)) return [];
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  let parsed: ClaudeDesktopConfig;
  try {
    parsed = JSON.parse(raw) as ClaudeDesktopConfig;
  } catch {
    return [];
  }
  const servers = parsed.mcpServers ?? {};
  return Object.entries(servers).map(([name, cfg]) => ({
    name,
    command: cfg.command,
    args: cfg.args ?? [],
    env: cfg.env,
    source: "claude",
    configPath: path,
  }));
}
