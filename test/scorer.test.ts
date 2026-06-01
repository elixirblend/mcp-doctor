import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreServer } from "../src/checks/scorer.js";
import type { ProbedServer, ServerConfig, ServerReport } from "../src/types.js";

const baseConfig: ServerConfig = {
  name: "test-server",
  command: "npx",
  args: ["-y", "@test/server"],
  source: "claude",
  configPath: "/tmp/test.json",
};

function makeProbed(overrides: Partial<ProbedServer> = {}): ProbedServer {
  return {
    config: baseConfig,
    status: "alive",
    probedAt: 0,
    durationMs: 50,
    toolCount: 10,
    emptyArgTools: 0,
    toolNames: ["foo", "bar"],
    ...overrides,
  };
}

test("alive server with healthy repo gets A", () => {
  const report = scoreServer(
    makeProbed(),
    {
      repo: "owner/repo",
      lastCommit: new Date().toISOString(),
      lastCommitDaysAgo: 5,
      stars: 1000,
      openIssues: 10,
      cveCount: 0,
      weeklyDownloads: 50000,
      contributors: 5,
      archived: false,
      sourceUrl: "https://github.com/owner/repo",
    }
  );
  assert.equal(report.verdict, "A");
  assert.equal(report.issues.length, 0);
});

test("dead server fails immediately", () => {
  const report = scoreServer(
    makeProbed({ status: "dead", toolCount: 0, emptyArgTools: 0, toolNames: [] }),
    null
  );
  assert.equal(report.verdict, "F");
  assert.ok(report.issues.some((i) => i.includes("dead")));
});

test("archived repo gets F", () => {
  const report = scoreServer(
    makeProbed(),
    {
      repo: "owner/repo",
      lastCommit: new Date().toISOString(),
      lastCommitDaysAgo: 30,
      stars: 10,
      openIssues: 1,
      cveCount: 0,
      weeklyDownloads: 100,
      contributors: 1,
      archived: true,
      sourceUrl: "https://github.com/owner/repo",
    }
  );
  assert.equal(report.verdict, "F");
  assert.ok(report.issues.some((i) => i.toLowerCase().includes("archived")));
});

test("CVE triggers security issue", () => {
  const report = scoreServer(
    makeProbed(),
    {
      repo: "owner/repo",
      lastCommit: new Date().toISOString(),
      lastCommitDaysAgo: 10,
      stars: 100,
      openIssues: 5,
      cveCount: 2,
      weeklyDownloads: 1000,
      contributors: 3,
      archived: false,
      sourceUrl: "https://github.com/owner/repo",
    }
  );
  assert.ok(report.issues.some((i) => i.includes("2 active security")));
  assert.ok(report.score < 100);
});

test("auth_required server flags credential issue", () => {
  const report = scoreServer(
    makeProbed({ status: "auth_required", toolCount: 0, emptyArgTools: 0, toolNames: [] }),
    null
  );
  assert.ok(report.issues.some((i) => i.includes("auth_required") || i.toLowerCase().includes("credentials")));
  assert.ok(report.recommendations.some((r) => r.toLowerCase().includes("api key")));
});

test("server with too many tools exceeds budget", () => {
  const report = scoreServer(
    makeProbed({ toolCount: 75, toolNames: new Array(75).fill("t") }),
    {
      repo: "owner/repo",
      lastCommit: new Date().toISOString(),
      lastCommitDaysAgo: 1,
      stars: 500,
      openIssues: 2,
      cveCount: 0,
      weeklyDownloads: 10000,
      contributors: 4,
      archived: false,
      sourceUrl: "https://github.com/owner/repo",
    }
  );
  assert.ok(report.issues.some((i) => i.includes("75 tools")));
});

test("stale repo (over a year) flagged", () => {
  const report = scoreServer(
    makeProbed(),
    {
      repo: "owner/repo",
      lastCommit: new Date(Date.now() - 400 * 86400_000).toISOString(),
      lastCommitDaysAgo: 400,
      stars: 50,
      openIssues: 1,
      cveCount: 0,
      weeklyDownloads: 200,
      contributors: 1,
      archived: false,
      sourceUrl: "https://github.com/owner/repo",
    }
  );
  assert.ok(report.issues.some((i) => i.includes("abandoned") || i.includes("400 days")));
});
