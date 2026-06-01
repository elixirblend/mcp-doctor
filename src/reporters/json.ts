import type { ServerReport } from "../types.js";

export function toJson(reports: ServerReport[]): string {
  return JSON.stringify(
    reports.map((r) => ({
      name: r.server.config.name,
      source: r.server.config.source,
      status: r.server.status,
      score: r.score,
      verdict: r.verdict,
      durationMs: r.server.durationMs,
      toolCount: r.server.toolCount,
      emptyArgTools: r.server.emptyArgTools,
      protocolVersion: r.server.protocolVersion,
      repo: r.health?.repo ?? null,
      lastCommitDaysAgo: r.health?.lastCommitDaysAgo ?? null,
      stars: r.health?.stars ?? null,
      weeklyDownloads: r.health?.weeklyDownloads ?? null,
      cveCount: r.health?.cveCount ?? null,
      archived: r.health?.archived ?? null,
      issues: r.issues,
      recommendations: r.recommendations,
      error: r.server.errorMessage ?? null,
    })),
    null,
    2
  );
}
