import type { ProbedServer, RepoHealth, ServerReport, Verdict } from "../types.js";

export function scoreServer(probed: ProbedServer, health: RepoHealth | null): ServerReport {
  let score = 100;
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (probed.status !== "alive") {
    score -= 80;
    issues.push(`Server status: ${probed.status}`);
    if (probed.status === "dead") {
      issues.push("Process exited before responding to initialize");
      recommendations.push("Check the install command and try running it manually");
    } else if (probed.status === "hangs") {
      issues.push("Server did not respond within 5s");
      recommendations.push("Server may be waiting on credentials or external network");
    } else if (probed.status === "install_error") {
      issues.push("Command not found or not executable");
      recommendations.push("Verify the package is installed globally or use the full path");
    } else if (probed.status === "auth_required") {
      issues.push("Server requires credentials before it will respond");
      recommendations.push("Set the required API keys in the env section of your MCP config");
    } else if (probed.status === "needs_args") {
      issues.push("Server expects CLI arguments that are missing");
      recommendations.push("Add the required arguments to the args array");
    } else if (probed.status === "needs_env") {
      issues.push("Server expects an environment variable that is not set");
      recommendations.push("Set the required env var in the env section of your MCP config");
    }
  }

  if (probed.status === "alive") {
    if (probed.emptyArgTools > 0 && probed.toolCount > 0) {
      const pct = Math.round((probed.emptyArgTools / probed.toolCount) * 100);
      if (pct > 50) {
        score -= 10;
        issues.push(`${pct}% of tools take no arguments (${probed.emptyArgTools}/${probed.toolCount})`);
        recommendations.push("Tools with no required args are often stubs or discovery probes");
      } else if (pct > 25) {
        score -= 5;
        issues.push(`${pct}% of tools take no arguments`);
      }
    }

    if (probed.toolCount > 50) {
      score -= 10;
      issues.push(`Exposes ${probed.toolCount} tools (most LLM clients cap at 20-128)`);
      recommendations.push("This server will likely exceed your client's tool budget");
    } else if (probed.toolCount === 0) {
      score -= 20;
      issues.push("Server responds but exposes zero tools");
    }
  }

  if (health) {
    if (health.archived) {
      score -= 70;
      issues.push("Repository is archived (no longer maintained)");
      recommendations.push("Find an actively maintained alternative");
    }
    if (health.lastCommitDaysAgo !== null) {
      if (health.lastCommitDaysAgo > 365) {
        score -= 30;
        issues.push(`Last commit was ${health.lastCommitDaysAgo} days ago (over a year)`);
        recommendations.push("Server is likely abandoned");
      } else if (health.lastCommitDaysAgo > 180) {
        score -= 15;
        issues.push(`Last commit was ${health.lastCommitDaysAgo} days ago (6+ months)`);
      } else if (health.lastCommitDaysAgo > 90) {
        score -= 5;
        issues.push(`Last commit was ${health.lastCommitDaysAgo} days ago`);
      }
    }
    if (health.cveCount > 0) {
      score -= 25;
      issues.push(`${health.cveCount} active security advisory${health.cveCount === 1 ? "" : "ies"} on GitHub`);
      recommendations.push("Review advisories at " + health.sourceUrl + "/security/advisories");
    }
    if (health.weeklyDownloads > 0 && health.weeklyDownloads < 100) {
      score -= 10;
      issues.push(`Only ${health.weeklyDownloads} weekly npm downloads (low usage)`);
    } else if (health.weeklyDownloads >= 1_000_000) {
      score += 5;
    }
  } else if (probed.status === "alive") {
    score -= 5;
    issues.push("Could not resolve to a GitHub repo for health check");
  }

  score = Math.max(0, Math.min(100, score));
  const verdict = scoreToVerdict(score);

  return { server: probed, health, verdict, score, issues, recommendations };
}

function scoreToVerdict(score: number): Verdict {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
