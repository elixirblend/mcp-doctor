import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cliPath = join(here, "..", "dist", "index.js");

function runMcpServe(requests: object[], timeoutMs = 15000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "serve"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses: unknown[] = [];
    let buf = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out after ${timeoutMs}ms with ${responses.length} responses; buf=${buf.slice(0, 500)}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          responses.push(JSON.parse(line));
        } catch {
          // ignore non-JSON
        }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      // uncomment to debug
      // process.stderr.write("[serve stderr] " + chunk.toString("utf8"));
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(responses);
    });
    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + "\n");
    }
    child.stdin.end();
  });
}

test("serve responds to initialize with mcp-trust serverInfo", async () => {
  const responses = await runMcpServe([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
  ]);
  const init = responses.find((r) => (r as { id?: number }).id === 1) as { result?: { serverInfo?: { name?: string; version?: string } } } | undefined;
  assert.ok(init, "expected initialize response");
  assert.equal(init?.result?.serverInfo?.name, "mcp-trust");
  assert.ok(init?.result?.serverInfo?.version);
});

test("serve responds to tools/list with mcp_trust_audit", async () => {
  const responses = await runMcpServe([
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  const reply = responses.find((r) => (r as { id?: number }).id === 2) as { result?: { tools?: { name: string; inputSchema: unknown }[] } } | undefined;
  assert.ok(reply, "expected tools/list response");
  const tools = reply?.result?.tools ?? [];
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, "mcp_trust_audit");
  assert.ok(tools[0]?.inputSchema);
});

test("serve returns error for unknown method", async () => {
  const responses = await runMcpServe([
    { jsonrpc: "2.0", id: 99, method: "frobnicate" },
  ]);
  const err = responses.find((r) => (r as { id?: number }).id === 99) as { error?: { code?: number; message?: string } } | undefined;
  assert.ok(err?.error);
  assert.equal(err?.error?.code, -32601);
});

test("serve tools/call with empty servers returns a report", async () => {
  const responses = await runMcpServe([
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "mcp_trust_audit", arguments: { servers: {}, noHealth: true } },
    },
  ]);
  const reply = responses.find((r) => (r as { id?: number }).id === 3) as { result?: { content?: { type: string; text: string }[]; isError?: boolean } } | undefined;
  assert.ok(reply, "expected tools/call response");
  assert.equal(reply?.result?.isError, false);
  const text = reply?.result?.content?.[0]?.text ?? "";
  assert.ok(text.includes("No servers were provided"));
});
