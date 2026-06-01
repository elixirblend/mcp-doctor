import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addServerToConfig, resolveTarget, readExistingServers } from "../src/install/writer.js";
import { fetchPackument, resolveFromPackument } from "../src/install/packument.js";

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), "mcp-trust-test-"));
}

test("addServerToConfig creates config with new server", () => {
  const dir = freshDir();
  const configPath = join(dir, "claude_desktop_config.json");
  const result = addServerToConfig("claude", configPath, {
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
  });
  assert.equal(result.written, true);
  assert.equal(result.finalName, "github");
  assert.ok(existsSync(configPath));
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as { mcpServers: Record<string, { command: string; args: string[] }> };
  assert.deepEqual(parsed.mcpServers.github.command, "npx");
  assert.deepEqual(parsed.mcpServers.github.args, ["-y", "@modelcontextprotocol/server-github"]);
  rmSync(dir, { recursive: true });
});

test("addServerToConfig preserves existing servers", () => {
  const dir = freshDir();
  const configPath = join(dir, "claude_desktop_config.json");
  writeFileSync(configPath, JSON.stringify({
    mcpServers: {
      existing: { command: "node", args: ["server.js"] },
    },
  }, null, 2));
  addServerToConfig("claude", configPath, {
    name: "newone",
    command: "npx",
    args: ["-y", "@scope/pkg"],
  });
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as { mcpServers: Record<string, unknown> };
  assert.ok("existing" in parsed.mcpServers);
  assert.ok("newone" in parsed.mcpServers);
  rmSync(dir, { recursive: true });
});

test("addServerToConfig generates unique name on collision", () => {
  const dir = freshDir();
  const configPath = join(dir, "claude_desktop_config.json");
  writeFileSync(configPath, JSON.stringify({ mcpServers: { github: { command: "x", args: [] } } }));
  const r1 = addServerToConfig("claude", configPath, { name: "github", command: "npx", args: ["a"] });
  const r2 = addServerToConfig("claude", configPath, { name: "github", command: "npx", args: ["b"] });
  assert.equal(r1.finalName, "github-2");
  assert.equal(r2.finalName, "github-3");
  rmSync(dir, { recursive: true });
});

test("readExistingServers returns empty for missing file", () => {
  const servers = readExistingServers(join(freshDir(), "nonexistent.json"), "claude");
  assert.equal(servers.length, 0);
});

test("resolveTarget picks Claude by default", () => {
  const target = resolveTarget(undefined, undefined);
  assert.equal(target.client, "claude");
  assert.ok(target.path.includes("Claude"));
});

test("resolveFromPackument normalizes github url", () => {
  const result = resolveFromPackument({
    name: "test-pkg",
    version: "1.0.0",
    description: "Test",
    bin: undefined,
    repository: { url: "git+https://github.com/owner/repo.git" },
  });
  assert.equal(result.repoUrl, "https://github.com/owner/repo");
});

test("resolveFromPackument handles string repo", () => {
  const result = resolveFromPackument({
    name: "test-pkg",
    version: "1.0.0",
    description: "Test",
    repository: "https://github.com/owner/repo",
  });
  assert.equal(result.repoUrl, "https://github.com/owner/repo");
});

test("fetchPackument rejects 404", async () => {
  await assert.rejects(
    () => fetchPackument("this-package-definitely-does-not-exist-anywhere-xyz-9999"),
    /not found/i
  );
});
