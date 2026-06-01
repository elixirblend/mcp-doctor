import type { RepoHealth } from "../types.js";

const GITHUB_API = "https://api.github.com";
const NPM_API = "https://api.npmjs.org";

interface PackageJson {
  repository?: { url?: string } | string;
  name?: string;
}

export function parseGitHubRepo(repo: string | undefined): string | null {
  if (!repo) return null;
  const cleaned = repo.replace(/^git\+/, "").replace(/\.git$/, "");
  const match = cleaned.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

async function fetchNpmRepo(packageName: string): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_API}/${encodeURIComponent(packageName)}/latest`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PackageJson;
    const repo = data.repository;
    if (typeof repo === "string") return parseGitHubRepo(repo);
    if (repo && typeof repo === "object") return parseGitHubRepo(repo.url);
    return null;
  } catch {
    return null;
  }
}

async function fetchNpmDownloads(packageName: string): Promise<number> {
  try {
    const res = await fetch(`${NPM_API}/downloads/point/last-week/${encodeURIComponent(packageName)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { downloads?: number };
    return data.downloads ?? 0;
  } catch {
    return 0;
  }
}

interface GitHubRepo {
  stargazers_count: number;
  open_issues_count: number;
  pushed_at: string;
  archived: boolean;
  default_branch: string;
}

interface GitHubCommit {
  sha: string;
  commit: { author: { date: string } };
}

async function fetchGitHubRepo(repo: string, token?: string): Promise<GitHubRepo | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as GitHubRepo;
  } catch {
    return null;
  }
}

async function fetchLastCommit(repo: string, token?: string): Promise<GitHubCommit | null> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}/commits?per_page=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const data = (await res.json()) as GitHubCommit[];
    return data[0] ?? null;
  } catch {
    return null;
  }
}

interface Advisory {
  cve_id?: string;
  ghsa_id?: string;
  severity?: string;
  withdrawn_at?: string | null;
}

async function fetchAdvisories(repo: string, token?: string): Promise<Advisory[]> {
  try {
    const res = await fetch(`${GITHUB_API}/advisories?ecosystem=npm&affects=${encodeURIComponent(repo)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Advisory[];
    return data.filter((a) => !a.withdrawn_at);
  } catch {
    return [];
  }
}

export async function checkRepoHealth(
  command: string,
  args: string[],
  env: Record<string, string> | undefined,
  token?: string
): Promise<RepoHealth | null> {
  const packageName = extractPackageName(command, args);
  if (!packageName) return null;

  const repo = await fetchNpmRepo(packageName);
  if (!repo) return null;

  const [repoInfo, lastCommit, advisories, weeklyDownloads] = await Promise.all([
    fetchGitHubRepo(repo, token),
    fetchLastCommit(repo, token),
    fetchAdvisories(repo, token),
    fetchNpmDownloads(packageName),
  ]);

  if (!repoInfo) return null;

  const lastCommitDate = lastCommit?.commit?.author?.date ?? repoInfo.pushed_at;
  const daysAgo = Math.floor((Date.now() - new Date(lastCommitDate).getTime()) / 86_400_000);

  return {
    repo,
    lastCommit: lastCommitDate,
    lastCommitDaysAgo: daysAgo,
    stars: repoInfo.stargazers_count,
    openIssues: repoInfo.open_issues_count,
    cveCount: advisories.length,
    weeklyDownloads,
    contributors: 0,
    archived: repoInfo.archived,
    sourceUrl: `https://github.com/${repo}`,
  };
}

export function extractPackageName(command: string, args: string[]): string | null {
  if (command === "npx" || command.endsWith("/npx") || command.endsWith("\\npx.exe")) {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg) continue;
      if (arg === "-y" || arg === "--yes") continue;
      if (arg === "-p" || arg === "--package") {
        return args[i + 1] ?? null;
      }
      if (arg.startsWith("@") || arg.startsWith("npm:")) {
        return arg.replace(/^npm:/, "");
      }
      if (arg && !arg.startsWith("-")) {
        const cleaned = arg.startsWith("npm:") ? arg.slice(4) : arg;
        const match = cleaned.match(/^(@?[\w./-]+)/);
        if (match) return match[1] ?? null;
      }
    }
    return null;
  }
  if (command === "uvx" || command === "uv" || command === "pipx" || command === "python" || command === "python3") {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg) continue;
      if (arg === "run" || arg === "tool" || arg === "exec") continue;
      if (arg === "-m") continue;
      if (arg && !arg.startsWith("-")) {
        return arg;
      }
    }
    return null;
  }
  if (command === "docker") {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (!arg) continue;
      if (arg === "run") continue;
      if (arg === "-i" || arg === "--interactive" || arg === "--rm") continue;
      if (arg === "-e" || arg === "--env") {
        i++;
        continue;
      }
      if (arg.includes("/")) {
        return arg.split("/").pop() ?? null;
      }
    }
    return null;
  }
  return null;
}
