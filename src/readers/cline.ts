import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { ServerConfig } from "../types.js";

interface ClineConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string>; disabled?: boolean }>;
}

function clineConfigPaths(): string[] {
  const home = homedir();
  if (platform() === "win32") {
    return [
      join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".cline", "mcp.json"),
    ];
  }
  if (platform() === "darwin") {
    return [
      join(home, "Library", "Application Support", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      join(home, ".cline", "mcp.json"),
    ];
  }
  return [
    join(home, ".config", "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
    join(home, ".cline", "mcp.json"),
  ];
}

export function readCline(): ServerConfig[] {
  const out: ServerConfig[] = [];
  for (const path of clineConfigPaths()) {
    if (!existsSync(path)) continue;
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    let parsed: ClineConfig;
    try {
      parsed = JSON.parse(raw) as ClineConfig;
    } catch {
      continue;
    }
    const servers = parsed.mcpServers ?? {};
    for (const [name, cfg] of Object.entries(servers)) {
      if (cfg.disabled) continue;
      out.push({
        name,
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env,
        source: "cline",
        configPath: path,
      });
    }
  }
  return out;
}
