#!/usr/bin/env node
import pc from "picocolors";
import { runAudit, type AuditOptions } from "./commands/index.js";
import { runInstall, type InstallOptions } from "./commands/install.js";

const HELP = `${pc.bold("mcp-trust")} ${pc.gray("v0.2.0")}

Audit the MCP servers installed on your machine. Detects dead, dangerous,
or fake servers before they hit production.

${pc.bold("Usage:")}
  mcp-trust [command] [options]

${pc.bold("Commands:")}
  audit      Probe all configured MCP servers and report health (default)
  install    Verify an npm package is a healthy MCP server, then add it to your config
  serve      Run as an MCP server so other agents can call mcp_trust_audit
  version    Print version
  help       Show this message

${pc.bold("Options:")}
  --json              Output machine-readable JSON
  --config-only       List configured servers without probing
  --fail-on-dead      Exit with code 1 if any server is dead, broken, or missing
  --concurrency <n>   Probe N servers in parallel (default: 4)
  --no-health         Skip GitHub/npm health lookups (faster)

${pc.bold("Examples:")}
  mcp-trust
  mcp-trust audit --json
  mcp-trust audit --fail-on-dead
  mcp-trust install @modelcontextprotocol/server-github
  mcp-trust serve
`;

function parseArgs(argv: string[]): { command: string; options: AuditOptions & InstallOptions & { pkg?: string; client?: "claude" | "cursor" | "codex" }; positional: string[] } {
  const args = argv.slice(2);
  let command = "audit";
  const options: AuditOptions & InstallOptions & { pkg?: string; client?: "claude" | "cursor" | "codex" } = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "help" || arg === "--help" || arg === "-h") {
      command = "help";
    } else if (arg === "version" || arg === "--version" || arg === "-v") {
      command = "version";
    } else if (arg === "audit" || arg === "install" || arg === "serve") {
      command = arg;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--config-only") {
      options.configOnly = true;
    } else if (arg === "--fail-on-dead") {
      options.failOnDead = true;
    } else if (arg === "--no-health") {
      options.noHealth = true;
      options.githubToken = "";
    } else if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--client") {
      const next = args[++i];
      if (next === "claude" || next === "cursor" || next === "codex") {
        options.client = next;
      } else {
        console.error(pc.red("error:") + " --client must be one of: claude, cursor, codex");
        process.exit(2);
      }
    } else if (arg === "--config-path" || arg === "--config") {
      options.configPath = args[++i];
    } else if (arg === "--name") {
      options.name = args[++i];
    } else if (arg === "--concurrency") {
      const next = args[++i];
      const n = next ? parseInt(next, 10) : NaN;
      if (!Number.isFinite(n) || n < 1) {
        console.error(pc.red("error:") + " --concurrency requires a positive integer");
        process.exit(2);
      }
      options.concurrency = n;
    } else if (arg?.startsWith("-")) {
      console.error(pc.red("error:") + " unknown argument: " + arg);
      console.error("Run " + pc.cyan("mcp-trust help") + " for usage");
      process.exit(2);
    } else if (arg) {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

async function main(): Promise<void> {
  const { command, options, positional } = parseArgs(process.argv);

  if (command === "help") {
    console.log(HELP);
    return;
  }
  if (command === "version") {
    console.log("mcp-trust v0.2.0");
    return;
  }
  if (command === "audit") {
    await runAudit(options);
    return;
  }
  if (command === "install") {
    if (positional.length === 0) {
      console.error(pc.red("error:") + " install requires a package name");
      console.error("  e.g. mcp-trust install @modelcontextprotocol/server-github");
      process.exit(2);
    }
    const pkg = positional[0];
    if (!pkg) {
      console.error(pc.red("error:") + " install requires a package name");
      process.exit(2);
    }
    await runInstall(pkg, options);
    return;
  }
  if (command === "serve") {
    const { runServe } = await import("./commands/serve.js");
    await runServe();
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
