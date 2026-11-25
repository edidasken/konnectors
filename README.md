# Konnectors

**Konnectors for the connectors that are missing.**

Konnectors is a collection of MCP bridges/adapters for connectors that are missing. Each package is a portable bridge or adapter you can run locally or on a trusted host and wire into MCP clients (Cursor, Antigravity, and others).

## Monorepo layout

| Path | Status |
|------|--------|
| [`github-gateway/`](github-gateway/) | GitHub Issues MCP gateway (v0.1.0) — read, comment, close on allowlisted repos with a server-side PAT |
| [`local-files/`](local-files/) | Reserved for ticket 62 (local-files MCP bridge/adapter, v0.2.0) |
| _(future)_ | Room for more MCP bridge/adapter packages |

## Strict rule (permanent)

Nothing personal or sensitive ever goes in this repository: no secrets, tokens, keys, hostnames, machine names, personal paths, personal emails, or other personal data. Everything is configured by environment variables and `.example` files (never real values). This rule is permanent. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Security model (summary)

- Secrets live only on the operator host (files mode 600, Keychain, or equivalent) — never in git.
- Remote MCP clients authenticate with per-client API keys (hashed at rest), distinct from upstream credentials.
- Network defaults to loopback and/or a private overlay (e.g. Tailscale). Public exposure is an explicit operator decision and is off by default.
- Packages audit tool calls without logging secrets.

## Install (github-gateway)

Requires **Node.js 22+**.

```bash
git clone https://github.com/edidasken/konnectors.git
cd konnectors/github-gateway
npm install
npm test
```

Copy [`github-gateway/config.example.toml`](github-gateway/config.example.toml) to a path **outside** the repo, fill every `REPLACE_ME` with local paths/env, and point the process at that config. Do not commit real config.

```bash
node src/index.js --config /path/to/github-mcp-gateway-data/config.toml
```

Package docs: [`github-gateway/README.md`](github-gateway/README.md) and [`github-gateway/docs/`](github-gateway/docs/).

## Configuration

| What | Where |
|------|--------|
| Gateway config | Outside git — start from `github-gateway/config.example.toml` |
| Client API keys | Outside git — issued by `github-gateway/scripts/issue-client-key.js` |
| GitHub PAT | Outside git — file or Keychain on the gateway host only |
| Env overrides | Documented in package docs; examples use placeholders only |

## Example client configs

Placeholders only. Never put a real token or API key in these files or in git.

### Cursor (`~/.cursor/mcp.json`) — HTTP with `${env:VAR}`

```json
{
  "mcpServers": {
    "github-gateway": {
      "url": "${env:GITHUB_MCP_GATEWAY_URL}",
      "headers": {
        "Authorization": "Bearer ${env:GITHUB_MCP_GATEWAY_CLIENT_KEY}"
      }
    }
  }
}
```

Set `GITHUB_MCP_GATEWAY_URL` (e.g. `https://REPLACE_ME_gateway_host/mcp`) and `GITHUB_MCP_GATEWAY_CLIENT_KEY` in the environment — not in the JSON file.

Stdio and additional host examples: [`github-gateway/examples/`](github-gateway/examples/) and [`github-gateway/docs/client-setup.md`](github-gateway/docs/client-setup.md).

### Antigravity (`~/.gemini/config/mcp_config.json`) via `npx mcp-remote`

```json
{
  "mcpServers": {
    "github-gateway": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${env:GITHUB_MCP_GATEWAY_URL}",
        "--header",
        "Authorization: Bearer ${env:GITHUB_MCP_GATEWAY_CLIENT_KEY}"
      ]
    }
  }
}
```

If your Antigravity build uses a different MCP config path or schema, keep the same idea: remote URL + Bearer client key from the environment, never a GitHub PAT in the client.

## License

MIT — see [LICENSE](LICENSE). Copyright Greg Granger 2026.

## Releases

Semver going forward:

- **v0.1.0** — GitHub gateway (`github-gateway/`)
- **v0.2.0** — Local files server (`local-files/`, ticket 62)
