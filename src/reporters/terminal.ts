import pc from "picocolors";
import type { AuditSummary, ServerReport, Verdict } from "../types.js";

const STATUS_ICONS: Record<string, string> = {
  alive: pc.green("[ALIVE]"),
  dead: pc.red("[DEAD] "),
  hangs: pc.red("[HANG] "),
  auth_required: pc.yellow("[AUTH] "),
  install_error: pc.red("[NOEX] "),
  needs_args: pc.yellow("[ARGS]"),
  needs_env: pc.yellow("[ENV] "),
  broken: pc.red("[BRKN] "),
  not_probed: pc.gray("[----]"),
};

const VERDICT_COLORS: Record<Verdict, (s: string) => string> = {
  A: pc.green,
  B: pc.cyan,
  C: pc.yellow,
  D: pc.yellow,
  F: pc.red,
};

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function shortStatus(status: string): string {
  return STATUS_ICONS[status] ?? pc.gray("[" + status + "]");
}

export function renderReport(reports: ServerReport[]): void {
  console.log();
  console.log(pc.bold(pc.magenta("mcp-trust")) + pc.gray(" v0.2.0"));
  console.log(pc.gray("Auditing MCP servers installed on this machine"));
  console.log();

  if (reports.length === 0) {
    console.log(pc.yellow("No MCP servers found in any known config location."));
    console.log(pc.gray("Searched: Claude Desktop, Cursor, Codex, Cline"));
    console.log();
    return;
  }

  for (const r of reports) {
    const cfg = r.server.config;
    const status = shortStatus(r.server.status);
    const verdict = r.verdict;
    const verdictColor = VERDICT_COLORS[verdict];
    const name = pc.bold(pad(cfg.name, 24));
    const source = pc.gray("[" + cfg.source + "]");

    console.log(`${status} ${verdictColor(verdict)} ${name} ${source}`);

    if (r.server.status === "alive") {
      const toolInfo = pc.gray(
        `${r.server.toolCount} tool${r.server.toolCount === 1 ? "" : "s"}` +
          (r.server.emptyArgTools > 0 ? `, ${r.server.emptyArgTools} no-arg` : "") +
          `, ${r.server.durationMs}ms`
      );
      console.log(`        ${toolInfo}`);
    } else if (r.server.errorMessage) {
      const errMsg = r.server.errorMessage.split("\n")[0]?.trim() ?? "";
      console.log(`        ${pc.gray(truncate(errMsg, 80))}`);
    }

    if (r.health) {
      const h = r.health;
      const age = h.lastCommitDaysAgo !== null ? `${h.lastCommitDaysAgo}d ago` : "unknown";
      const dl = h.weeklyDownloads > 0 ? formatNumber(h.weeklyDownloads) + " dl/wk" : "no dl data";
      console.log(`        ${pc.gray(`[${h.repo}]`)} ${pc.gray(`${age}, ${h.stars}★, ${dl}`)}`);
      if (h.archived) {
        console.log(`        ${pc.red("⚠ Archived")}`);
      }
      if (h.cveCount > 0) {
        console.log(`        ${pc.red(`⚠ ${h.cveCount} CVE${h.cveCount === 1 ? "" : "s"}`)}`);
      }
    }

    for (const issue of r.issues) {
      console.log(`        ${pc.red("•")} ${issue}`);
    }
    for (const rec of r.recommendations) {
      console.log(`        ${pc.cyan("→")} ${rec}`);
    }
    console.log();
  }

  const summary = summarize(reports);
  renderSummary(summary);
}

function renderSummary(s: AuditSummary): void {
  const parts = [
    pc.bold("Total: ") + String(s.total),
    pc.green("Alive: ") + String(s.alive),
    pc.red("Dead: ") + String(s.dead),
    pc.yellow("Other: ") + String(s.other),
    pc.bold("Avg score: ") + s.averageScore + "/100",
  ];
  console.log(pc.gray("─".repeat(60)));
  console.log(parts.join("  "));
  if (s.worstOffenders.length > 0) {
    console.log();
    console.log(pc.red(pc.bold("Worst offenders:")));
    for (const name of s.worstOffenders) {
      console.log(`  ${pc.red("•")} ${name}`);
    }
  }
  console.log();
}

export function summarize(reports: ServerReport[]): AuditSummary {
  const total = reports.length;
  const alive = reports.filter((r) => r.server.status === "alive").length;
  const dead = reports.filter((r) => r.server.status === "dead").length;
  const other = total - alive - dead;
  const avg = total === 0 ? 0 : Math.round(reports.reduce((s, r) => s + r.score, 0) / total);
  const worst = reports
    .filter((r) => r.verdict === "F" || r.verdict === "D")
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r) => r.server.config.name);
  return { total, alive, dead, other, averageScore: avg, worstOffenders: worst };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
