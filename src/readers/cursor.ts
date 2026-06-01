import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";
import type { ServerConfig } from "../types.js";

interface CursorConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

function cursorConfigPaths(): string[] {
  const home = homedir();
  if (platform() === "win32") {
    return [
      join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Cursor", "mcp.json"),
      join(home, ".cursor", "mcp.json"),
    ];
  }
  if (platform() === "darwin") {
    return [
      join(home, "Library", "Application Support", "Cursor", "mcp.json"),
      join(home, ".cursor", "mcp.json"),
    ];
  }
  return [join(home, ".config", "Cursor", "mcp.json"), join(home, ".cursor", "mcp.json")];
}

export function readCursor(): ServerConfig[] {
  const out: ServerConfig[] = [];
  for (const path of cursorConfigPaths()) {
    if (!existsSync(path)) continue;
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    let parsed: CursorConfig;
    try {
      parsed = JSON.parse(raw) as CursorConfig;
    } catch {
      continue;
    }
    const servers = parsed.mcpServers ?? {};
    for (const [name, cfg] of Object.entries(servers)) {
      out.push({
        name,
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env,
        source: "cursor",
        configPath: path,
      });
    }
  }
  return out;
}
