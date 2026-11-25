# `src/` — MCP server core (ticket 55)

Node.js 22 implementation of the GitHub MCP gateway.

| Module | Role |
|--------|------|
| `index.js` | Process entry: `--config` / `GITHUB_MCP_GATEWAY_CONFIG`, start transports |
| `config.js` | TOML/JSON load + schema validation (rejects embedded PATs, Funnel without flag) |
| `allowlist.js` | Repository (`owner/*`) and action allowlists |
| `audit.js` | Append-only JSONL audit (no secrets) |
| `rate-limit.js` | Per-client minute/day/close-hour limits |
| `server-context.js` | Wire token → GitHub client → tools → audit |
| `mcp-server.js` | MCP SDK tool registration (shared) |
| `auth/keys.js` | Hash / issue / rotate / revoke client API keys |
| `github/token.js` | Load PAT from secure file, macOS Keychain, or `env` (tests only) |
| `github/client.js` | Allowlisted REST: issue read/comment/close + timeline merged-PR check |
| `tools/index.js` | Single tool implementation for stdio + HTTP |
| `transport/stdio.js` | stdio MCP |
| `transport/http.js` | Authenticated Streamable HTTP |

Runtime on the gateway host: `/path/to/node-prefix`. On CI/cloud agents, use whatever Node 22 is available — do not require Homebrew `node`.
