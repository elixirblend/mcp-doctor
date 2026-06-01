#!/usr/bin/env node
import pc from "picocolors";
import { runAudit, type AuditOptions } from "./commands/index.js";

const HELP = `${pc.bold("mcp-doctor")} ${pc.gray("v0.1.0")}

Audit the MCP servers installed on your machine. Detects dead, dangerous,
or fake servers before they hit production.

${pc.bold("Usage:")}
  mcp-doctor [command] [options]

${pc.bold("Commands:")}
  audit      Probe all configured MCP servers and report health (default)
  version    Print version
  help       Show this message

${pc.bold("Options:")}
  --json              Output machine-readable JSON
  --config-only       List configured servers without probing
  --fail-on-dead      Exit with code 1 if any server is dead, broken, or missing
  --concurrency <n>   Probe N servers in parallel (default: 4)
  --no-health         Skip GitHub/npm health lookups (faster)

${pc.bold("Examples:")}
  mcp-doctor
  mcp-doctor audit --json
  mcp-doctor audit --fail-on-dead
  mcp-doctor audit --concurrency 1
`;

function parseArgs(argv: string[]): { command: string; options: AuditOptions } {
  const args = argv.slice(2);
  let command = "audit";
  const options: AuditOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "help" || arg === "--help" || arg === "-h") {
      command = "help";
    } else if (arg === "version" || arg === "--version" || arg === "-v") {
      command = "version";
    } else if (arg === "audit") {
      command = "audit";
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config-only") {
      options.configOnly = true;
    } else if (arg === "--fail-on-dead") {
      options.failOnDead = true;
    } else if (arg === "--no-health") {
      options.githubToken = ""; // signal to skip
    } else if (arg === "--concurrency") {
      const next = args[++i];
      const n = next ? parseInt(next, 10) : NaN;
      if (!Number.isFinite(n) || n < 1) {
        console.error(pc.red("error:") + " --concurrency requires a positive integer");
        process.exit(2);
      }
      options.concurrency = n;
    } else {
      console.error(pc.red("error:") + " unknown argument: " + arg);
      console.error("Run " + pc.cyan("mcp-doctor help") + " for usage");
      process.exit(2);
    }
  }

  return { command, options };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv);

  if (command === "help") {
    console.log(HELP);
    return;
  }
  if (command === "version") {
    console.log("mcp-doctor v0.1.0");
    return;
  }
  if (command === "audit") {
    await runAudit(options);
    return;
  }
}

main().catch((err) => {
  console.error(pc.red("fatal:") + " " + (err instanceof Error ? err.message : String(err)));
  if (process.env.MCP_DOCTOR_DEBUG) {
    console.error(err);
  }
  process.exit(1);
});
