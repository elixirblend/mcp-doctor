import pc from "picocolors";
import { fetchPackument } from "../install/packument.js";
import { probeServer } from "../prober/index.js";
import { checkRepoHealth, scoreServer } from "../checks/index.js";
import { resolveTarget, addServerToConfig, readExistingServers, type TargetClient } from "../install/writer.js";
import { renderReport, summarize } from "../reporters/index.js";
import type { ServerConfig } from "../types.js";

export interface InstallOptions {
  client?: TargetClient;
  configPath?: string;
  yes?: boolean;
  name?: string;
  noHealth?: boolean;
  dryRun?: boolean;
}

function prompt(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      const answer = data.toString().trim().toLowerCase();
      resolve(answer === "" || answer === "y" || answer === "yes");
    });
    process.stdin.resume();
  });
}

function deriveNameFromPackage(pkg: string): string {
  return pkg.replace(/^@[\w.-]+\//, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

export async function runInstall(pkg: string, opts: InstallOptions = {}): Promise<void> {
  if (!pkg || pkg.startsWith("-")) {
    console.error(pc.red("error:") + " install requires a package name, e.g. `mcp-trust install @modelcontextprotocol/server-github`");
    process.exit(2);
  }

  let resolved;
  try {
    console.log(pc.gray(`Resolving ${pkg} on npm…`));
    resolved = await fetchPackument(pkg);
  } catch (err) {
    console.error(pc.red("error:") + " " + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  console.log(pc.bold(resolved.name) + pc.gray(` v${resolved.version}`));
  if (resolved.description) console.log(pc.gray(resolved.description));
  if (resolved.repoUrl) console.log(pc.gray(resolved.repoUrl));
  console.log();

  const desiredName = opts.name ?? deriveNameFromPackage(resolved.name);
  const target = resolveTarget(opts.client, opts.configPath);
  const existing = readExistingServers(target.path, target.client);
  const collision = existing.find((s) => s.name === desiredName);

  if (collision) {
    console.log(pc.yellow(`A server named "${desiredName}" already exists in ${target.path}`));
  }

  const probeConfig: ServerConfig = {
    name: desiredName,
    command: resolved.installCommand,
    args: resolved.installArgs,
    source: target.client,
    configPath: target.path,
  };

  console.log(pc.bold("Probing server before adding…"));
  const probed = await probeServer(probeConfig);
  const token = opts.noHealth ? "" : process.env.GITHUB_TOKEN;
  const health = opts.noHealth ? null : await checkRepoHealth(resolved.installCommand, resolved.installArgs, undefined, token);
  const report = scoreServer(probed, health);
  const reports = [report];

  console.log();
  const summary = summarize(reports);
  renderReport(reports);

  if (report.server.status !== "alive") {
    console.log(pc.red(pc.bold("Server did not respond to the MCP handshake. Refusing to add a non-functional server.")));
    process.exit(1);
  }

  if (report.verdict === "F" && !opts.yes) {
    console.log(pc.yellow("Server scored F. Use --yes to install anyway."));
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log(pc.gray(`[dry-run] Would add "${desiredName}" to ${target.path}`));
    return;
  }

  if (!opts.yes && process.stdin.isTTY) {
    const ok = await prompt(`Add "${desiredName}" to ${target.path}? [Y/n] `);
    if (!ok) {
      console.log(pc.gray("Cancelled."));
      return;
    }
  }

  try {
    const result = addServerToConfig(target.client, target.path, {
      name: desiredName,
      command: resolved.installCommand,
      args: resolved.installArgs,
    });
    console.log();
    console.log(pc.green(pc.bold("Installed.")) + ` Added "${result.finalName}" to ${result.path}`);
    console.log(pc.gray("Run ") + pc.cyan("mcp-trust audit") + pc.gray(" to verify it's still healthy on next run."));
  } catch (err) {
    console.error(pc.red("error:") + " " + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
