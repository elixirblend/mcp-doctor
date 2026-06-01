import { readAllConfigs } from "../readers/index.js";
import { probeServer } from "../prober/index.js";
import { checkRepoHealth, scoreServer } from "../checks/index.js";
import { renderReport } from "../reporters/index.js";
import type { ServerReport } from "../types.js";

export interface AuditOptions {
  json?: boolean;
  failOnDead?: boolean;
  configOnly?: boolean;
  concurrency?: number;
  githubToken?: string;
}

export async function runAudit(opts: AuditOptions = {}): Promise<ServerReport[]> {
  const configs = readAllConfigs();
  if (configs.length === 0 && !opts.json) {
    renderReport([]);
    return [];
  }

  if (opts.configOnly) {
    const reports = configs.map((c) =>
      scoreServer(
        {
          config: c,
          status: "not_probed",
          probedAt: Date.now(),
          durationMs: 0,
          toolCount: 0,
          emptyArgTools: 0,
          toolNames: [],
        },
        null
      )
    );
    if (opts.json) console.log(JSON.stringify(reports, null, 2));
    else renderReport(reports);
    return reports;
  }

  const concurrency = opts.concurrency ?? 4;
  const token = opts.githubToken ?? process.env.GITHUB_TOKEN;
  const reports: ServerReport[] = [];

  for (let i = 0; i < configs.length; i += concurrency) {
    const batch = configs.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (cfg) => {
        const probed = await probeServer(cfg);
        const health = await checkRepoHealth(cfg.command, cfg.args, cfg.env, token);
        return scoreServer(probed, health);
      })
    );
    reports.push(...batchResults);
  }

  if (opts.json) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    renderReport(reports);
  }

  if (opts.failOnDead) {
    const hasFailing = reports.some((r) => r.server.status !== "alive" && r.server.status !== "not_probed");
    if (hasFailing) {
      process.exitCode = 1;
    }
  }

  return reports;
}
