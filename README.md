# Konnectors

**Konnectors for the connectors that are missing.**

Konnectors is a collection of MCP bridges/adapters for connectors that are missing. Each package is a portable bridge or adapter you can run locally or on a trusted host and wire into MCP clients (Cursor, Antigravity, and others).

## Monorepo layout

| Path | Status |
|------|--------|
| [`github-gateway/`](github-gateway/) | GitHub Issues MCP gateway (v0.1.0) — read, comment, close on allowlisted repos with a server-side PAT |
| [`local-files/`](local-files/) | Local-files MCP bridge/adapter (v0.2.0) — scoped filesystem tools over stdio or authenticated HTTP |
| _(future)_ | Room for more MCP bridge/adapter packages |

## Strict rule (permanent)

Nothing personal or sensitive ever goes in this repository: no secrets, tokens, keys, hostnames, machine names, personal paths, personal emails, or other personal data. Everything is configured by environment variables and `.example` files (never real values). This rule is permanent. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Security model (summary)

- Secrets live only on the operator host (files mode 600, Keychain, or equivalent) — never in git.
- Remote MCP clients authenticate with per-client credentials (gateway API keys or local-files bearer), distinct from upstream credentials where applicable.
- Network defaults to loopback and/or a private overlay. Public exposure is an explicit operator decision and is off by default.
- Packages audit or health-check without logging secrets.

## Install

Requires **Node.js 22+**.

### github-gateway

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

### local-files

```bash
cd konnectors/local-files
npm install
npm test
```

Export variables from [`local-files/.env.example`](local-files/.env.example) (outside git), then:

```bash
node server.mjs
```

Package docs: [`local-files/README.md`](local-files/README.md) and [`local-files/docs/`](local-files/docs/).

## Configuration

| What | Where |
|------|--------|
| Gateway config | Outside git — start from `github-gateway/config.example.toml` |
| Client API keys (gateway) | Outside git — issued by `github-gateway/scripts/issue-client-key.js` |
| GitHub PAT | Outside git — file or Keychain on the gateway host only |
| local-files root + bearer | Outside git — `LOCAL_FILES_ROOT`, `LOCAL_FILES_BEARER_TOKEN_FILE` (see `.env.example`) |
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
    },
    "local-files": {
      "url": "${env:LOCAL_FILES_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${env:LOCAL_FILES_MCP_BEARER}"
      }
    }
  }
}
```

Set the `*_URL` and bearer/key variables in the environment — not in the JSON file.

Stdio and additional host examples: [`github-gateway/examples/`](github-gateway/examples/), [`local-files/examples/`](local-files/examples/).

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
    },
    "local-files": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${env:LOCAL_FILES_MCP_URL}",
        "--header",
        "Authorization: Bearer ${env:LOCAL_FILES_MCP_BEARER}"
      ]
    }
  }
}
```

If your Antigravity build uses a different MCP config path or schema, keep the same idea: remote URL + Bearer credential from the environment, never upstream secrets in the client.

## License

MIT — see [LICENSE](LICENSE). Copyright Greg Granger 2026.

## Releases

Semver going forward:

- **v0.1.0** — GitHub gateway (`github-gateway/`)
- **v0.2.0** — Local files server (`local-files/`)
