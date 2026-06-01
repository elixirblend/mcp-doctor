# mcp-doctor (npm: mcp-trust)

**The MCP ecosystem is sick. 60% of npm-published servers fail basic connectivity. 52% are abandoned.** `mcp-doctor` reads the MCP servers installed on your machine, probes each one with the protocol handshake, and tells you which are alive, dead, dangerous, or fake — before they hit production.

```bash
npx mcp-doctor
```

```
mcp-doctor v0.1.0
Auditing MCP servers installed on this machine

[ALIVE] B github                  [claude]      14 tools, 4 no-arg, 47ms
        [modelcontextprotocol/servers] 12d ago, 48201★, 1.2M dl/wk
[DEAD ] F someones-mcp            [cursor]      
        spawn npx ENOENT
        → Verify the package is installed globally or use the full path
[ALIVE] D postgres                [claude]      28 tools, 0 no-arg, 192ms
        [tylersamples/mcp-postgres] 287d ago, 84★, 210 dl/wk
        • Last commit was 287 days ago (6+ months)
        • Only 210 weekly npm downloads (low usage)
        → Server is likely abandoned
[ALIVE] F rando-ai-tool           [codex]       3 tools, 3 no-arg, 89ms
        [github.com/x/x] 422d ago, 2★, 0 dl/wk
        • 100% of tools take no arguments (3/3)
        • Repository is archived (no longer maintained)
        • Last commit was 422 days ago (over a year)

────────────────────────────────────────────────────────────
Total: 4  Alive: 3  Dead: 1  Other: 0  Avg score: 47/100

Worst offenders:
  • rando-ai-tool
  • someones-mcp
```

## Why this exists

The MCP ecosystem crossed a threshold in 2025–2026 and never looked back. As of April 2026:

- **2,000+ servers** in the official registry, **19,700+** if you count every npm package
- **52% are abandoned** (no commits in 90+ days, broken builds, unpatched CVEs)
- **60% of npm-published servers fail the basic `tools/list` handshake** when probed cold
- **28% of tools exposed are empty-argument stubs** (`list_models`, `ping`) — useless to an agent
- **9,922 distinct tools** across 359 reachable servers — past the 20–128 tool budget of any single LLM client

Every developer who uses Claude Desktop, Cursor, Codex, or Cline has between 4 and 12 MCP servers running. The median team has six of them in the "dead" or "lightly maintained" tier. They just don't know it yet, because the agent doesn't call the broken path every day.

**`mcp-trust` is the missing trust layer for the MCP ecosystem.** It runs locally, takes 5 seconds, and tells you what is actually alive.

## What it checks

For every server it finds in your config, `mcp-doctor` runs:

1. **Protocol probe** — spawns the server, sends `initialize` and `tools/list`, kills the process if it doesn't respond in 15s
2. **GitHub health** — last commit date, star count, open issues, archive status
3. **Security advisories** — pulls active CVEs from the GitHub Advisory Database
4. **npm health** — weekly download count (low numbers = nobody's using it)
5. **Tool quality** — flags servers with >50 tools (exceeds LLM client budgets) and >50% empty-arg tools (usually stubs)
6. **Verdict** — A/B/C/D/F score with specific issues and recommendations

## Install

```bash
npx mcp-trust
```

Or install globally:

```bash
npm install -g mcp-trust
```

## Usage

```bash
mcp-doctor                          # audit everything
mcp-doctor audit --json             # machine-readable output
mcp-doctor audit --config-only      # list configured servers, don't probe
mcp-doctor audit --fail-on-dead     # exit 1 if any server is dead (for CI)
mcp-doctor audit --concurrency 8    # parallelize probes
```

### Config locations scanned

| Client | File |
|---|---|
| Claude Desktop | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | `%APPDATA%\Cursor\mcp.json` |
| Codex | `~/.codex/config.toml` |
| Cline | `~/.cline/mcp.json` |

### CI integration

```yaml
# .github/workflows/mcp-audit.yml
name: MCP audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx mcp-trust audit --fail-on-dead --json > mcp-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: mcp-audit
          path: mcp-report.json
```

### Environment variables

- `GITHUB_TOKEN` — bumps GitHub API rate limit from 60 to 5000 req/h

## Verdict scale

| Score | Verdict | Meaning |
|---|---|---|
| 90–100 | A | Healthy, maintained, responsive |
| 75–89 | B | Good, with minor concerns |
| 60–74 | C | Usable, but watch for issues |
| 40–59 | D | Multiple problems, plan a replacement |
| 0–39 | F | Dead, dangerous, or abandoned — remove it |

## Status types

- `ALIVE` — responded to `initialize` and `tools/list` within timeout
- `DEAD` — process exited before responding
- `HANG` — process started but never completed the handshake
- `AUTH` — server requires credentials to even respond
- `ARGS` — server expects CLI arguments that are missing
- `ENV` — server expects an environment variable that isn't set
- `NOEX` — command not found (not installed globally)
- `BRKN` — other failure (syntax error, runtime exception)

## Output

A grade A through F, a list of specific issues, and concrete recommendations. Designed to be readable by humans in 5 seconds and parseable by tools via `--json`.

## Limitations

- Only audits servers configured locally. Does not see marketplace servers you haven't installed
- For `stdio`-based servers only. HTTP/streamable MCP servers are not yet supported
- Server reputation signals (GitHub stars, downloads) can be gamed. Treat them as one signal among many
- Network access required for GitHub / npm lookups (the local probe works offline)

## Contributing

PRs welcome. The protocol probe is in `src/prober/spawner.ts`, the scoring rules are in `src/checks/scorer.ts`. Add a new client reader by following the pattern in `src/readers/claude.ts`.

## License

MIT
