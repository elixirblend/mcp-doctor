import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPackageName, parseGitHubRepo } from "../src/checks/github.js";

test("parseGitHubRepo handles https URLs", () => {
  assert.equal(parseGitHubRepo("https://github.com/owner/repo.git"), "owner/repo");
  assert.equal(parseGitHubRepo("git+https://github.com/owner/repo"), "owner/repo");
  assert.equal(parseGitHubRepo("git@github.com:owner/repo.git"), "owner/repo");
});

test("parseGitHubRepo returns null for non-github", () => {
  assert.equal(parseGitHubRepo("https://gitlab.com/owner/repo"), null);
  assert.equal(parseGitHubRepo(undefined), null);
});

test("extractPackageName handles npx -y <pkg>", () => {
  assert.equal(extractPackageName("npx", ["-y", "@scope/pkg"]), "@scope/pkg");
  assert.equal(extractPackageName("npx", ["-y", "plain-pkg", "--flag"]), "plain-pkg");
});

test("extractPackageName handles uvx/pipx", () => {
  assert.equal(extractPackageName("uvx", ["some-pkg"]), "some-pkg");
  assert.equal(extractPackageName("python", ["-m", "some_module"]), "some_module");
});

test("extractPackageName handles docker images", () => {
  assert.equal(extractPackageName("docker", ["run", "--rm", "-i", "owner/image"]), "image");
});
