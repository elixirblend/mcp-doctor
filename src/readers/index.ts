import type { ServerConfig } from "../types.js";
import { readClaudeDesktop } from "./claude.js";
import { readCursor } from "./cursor.js";
import { readCodex } from "./codex.js";
import { readCline } from "./cline.js";

export function readAllConfigs(): ServerConfig[] {
  const all: ServerConfig[] = [...readClaudeDesktop(), ...readCursor(), ...readCodex(), ...readCline()];
  const seen = new Set<string>();
  const unique: ServerConfig[] = [];
  for (const s of all) {
    const key = `${s.source}:${s.name}:${s.command}:${s.args.join(" ")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  return unique;
}
