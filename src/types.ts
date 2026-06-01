export type ServerStatus =
  | "alive"
  | "dead"
  | "hangs"
  | "auth_required"
  | "install_error"
  | "needs_args"
  | "needs_env"
  | "broken"
  | "not_probed";

export type Verdict = "A" | "B" | "C" | "D" | "F";

export interface ServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  source: "claude" | "cursor" | "codex" | "cline" | "vscode" | "windsurf" | "manual";
  configPath: string;
}

export interface ProbedServer {
  config: ServerConfig;
  status: ServerStatus;
  probedAt: number;
  durationMs: number;
  protocolVersion?: string;
  toolCount: number;
  emptyArgTools: number;
  toolNames: string[];
  errorMessage?: string;
  stderr?: string;
}

export interface RepoHealth {
  repo: string;
  lastCommit: string | null;
  lastCommitDaysAgo: number | null;
  stars: number;
  openIssues: number;
  cveCount: number;
  weeklyDownloads: number;
  contributors: number;
  archived: boolean;
  sourceUrl: string | null;
}

export interface ServerReport {
  server: ProbedServer;
  health: RepoHealth | null;
  verdict: Verdict;
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface AuditSummary {
  total: number;
  alive: number;
  dead: number;
  other: number;
  averageScore: number;
  worstOffenders: string[];
}
