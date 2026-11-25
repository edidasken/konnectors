# GitHub MCP gateway

Part of **[Konnectors](../README.md)** — *Konnectors for the connectors that are missing.* This package is an MCP bridge/adapter that holds a GitHub fine-grained personal access token **server-side** on a trusted **gateway host**, and exposes only the issue tools clients need after merge (read, comment, close).

This is **not** a Cursor-only integration. Any coding environment that can run a custom MCP server can use it: local clients over **stdio**, remote clients over **authenticated Streamable HTTP**.

## Why this exists

Cursor cloud agents authenticate as the Cursor GitHub App with a `ghs_` installation token. After a Cursor update on 24 Nov 2026, those tokens return `Resource not accessible by integration` (403) on Issues write, so the Cursor Project cannot close `edidasken/code` tickets after merge. The operator’s fine-grained PAT (Issues, Pull requests, and Contents read/write on the edidasken account) already lives in the operator vault. This gateway puts a standard MCP server on the gateway host that loads that token only on the host and never hands it to clients.

## What it does (v1 — tickets 55–58)

- Serve MCP tools to read an issue, comment on an issue, and close an issue with `state_reason` `completed` or `not_planned`.
- Require a linked PR to be merged before close, unless an explicit `override_unmerged_pr` flag is passed (and audit-logged).
- Authenticate remote clients with per-client revocable API keys (hashed at rest), distinct from the GitHub token.
- Restrict actions to an allowlisted set of edidasken repositories and the v1 tool list.
- Write a structured audit log for every tool call (and every close override) with no secrets.
- Enforce per-client rate limits (minute / day / close-per-hour).
- Ship a LaunchAgent (`com.konnectors.github-mcp-gateway`) that runs under `/path/to/node-prefix`, with install/start/stop/restart scripts, crash/reboot recovery via KeepAlive, and a secret-free `/health` endpoint for Tailscale-reachable HTTP.
- Document client setup for Cursor, Claude, VS Code, Antigravity/Gemini, and generic MCP hosts; rotation/troubleshooting; verification that records cloud Tailscale limits honestly ([docs/client-setup.md](docs/client-setup.md), [docs/verification.md](docs/verification.md)).

## What it will not do (v1 and forever in this series)

- Merge, delete, push, admin, repository or collaborator changes, or any GitHub write beyond issue comment/close.
- Put the GitHub PAT in client configs, the repo, environment files in git, logs, or the control page UI.
- Silently expose the service to the public Internet. Tailscale-only is the default; any Funnel / public exposure is a **decision for the host operator** and must not be enabled without that decision.
- Override a client’s own approval prompts. MCP cannot do that; clients still decide what to auto-approve.
- Install, bootstrap, or restart the LaunchAgent on the gateway host from a coding agent; put the real PAT on disk; or enable Funnel — those stay **the host operator** machine decisions ([docs/service.md](docs/service.md)).

## Ticket series

| Ticket | Issue | Scope |
|--------|-------|--------|
| 54 | edidasken/code#60 | Design and docs skeleton (merged) |
| 55 | edidasken/code#61 | MCP server core and tests (merged) |
| 56 | edidasken/code#62 | launchd service and Tailscale network (merged) |
| 57 | edidasken/code#63 | Control page on the gateway host (merged) |
| **58 (this)** | edidasken/code#64 | Client setup guides and end-to-end verification |

## Quick start (dev / tests)

Runtime: **Node.js 22**. On the gateway host use `/path/to/node-prefix` (operator standard). On CI/cloud agents use the available Node 22 binary — do not require Homebrew `node`.

```bash
cd github-gateway
npm install
npm test
# equivalent: node --test tests/*.test.mjs
```

Do **not** commit `node_modules/` (or any dotfiles). This repo forbids committed `.gitignore`; keep local ignores in git `info/exclude` (local habit) if needed. Tests mock GitHub and use a fake token file — they never call live GitHub or need The operator’s PAT.

Run the server against a config **outside** the repo (placeholders in [config.example.toml](config.example.toml)):

```bash
node src/index.js --config /path/to/github-mcp-gateway-data/config.toml
```

Issue a client API key (plaintext printed once):

```bash
node scripts/issue-client-key.js \
  --keys /path/to/github-mcp-gateway-data/client-keys.json \
  --id my-client
```

Token load path: secure file or macOS Keychain — see [docs/token-loading.md](docs/token-loading.md). Installing the real PAT on the gateway host is a **decision for the host operator**.

## Documentation map

| Doc | Contents |
|-----|----------|
| [docs/index.md](docs/index.md) | Full index for tickets 54–58 |
| [docs/architecture.md](docs/architecture.md) | Components, folder layout, shared tool layer, control plane |
| [docs/threat-model.md](docs/threat-model.md) | Assets, trust boundaries, threats, mitigations |
| [docs/tools.md](docs/tools.md) | v1 tool list, close-with-merged-PR rule, forbidden actions |
| [docs/config-schema.md](docs/config-schema.md) | Config fields for transport, auth, token loading, allowlists, audit, rate limits |
| [docs/auth-and-permissions.md](docs/auth-and-permissions.md) | Client keys, GitHub token handling, allowlists, no-secrets-in-UI rule |
| [docs/token-loading.md](docs/token-loading.md) | File / Keychain / test-env load paths (ticket 55) |
| [docs/service.md](docs/service.md) | launchd, health, Tailscale, recovery; Funnel = host-operator decision (ticket 56) |
| [docs/control-page.md](docs/control-page.md) | Control plane UI: Tailscale + own sign-in, toggles, audit (ticket 57) |
| [docs/client-setup.md](docs/client-setup.md) | Cursor / Claude / VS Code / Antigravity / generic MCP hosts (ticket 58) |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Auth, allowlist, close policy, health, reachability (ticket 58) |
| [docs/token-rotation.md](docs/token-rotation.md) | Rotate/revoke client keys and GitHub PAT (ticket 58) |
| [docs/verification.md](docs/verification.md) | Cloud honesty + the host operator live two-client / e2e steps (ticket 58) |
| [examples/](examples/) | Placeholder MCP client snippets (no real keys) |
| [control/config.example.toml](control/config.example.toml) | Control-plane listen/auth/registry paths (no secrets) |
| [control/registry.example.toml](control/registry.example.toml) | Managed servers registry (GitHub gateway first) |
| [config.example.toml](config.example.toml) | Gateway example config with **no real secrets** |

## Service on the gateway host (ticket 56)

Definitions and docs only in-repo. Operators on the gateway host (after host-operator OK):

```bash
cd github-gateway
./scripts/install-launchd.sh          # uses /path/to/node
./scripts/launchd-ctl.sh status
curl -sS http://127.0.0.1:8743/health
```

See [docs/service.md](docs/service.md). Off-tailnet cloud agents may not reach a Tailscale-only listener; Funnel is **not** enabled by this work.

## Control page on the gateway host (ticket 57)

Separate control-plane process with its own sign-in and managed-server registry (GitHub gateway first). Docs: [docs/control-page.md](docs/control-page.md). Install/restart on the gateway host is a **host-operator step**, not done by the coding agent. Funnel is **not** enabled.

```bash
cd github-gateway
# after copying control config + registry outside git and setting the password:
./scripts/install-control-launchd.sh
./scripts/control-ctl.sh status
curl -sS http://127.0.0.1:8750/health
```

## Clients and verification (ticket 58)

Setup guides, troubleshooting, and rotation: [docs/client-setup.md](docs/client-setup.md), [docs/troubleshooting.md](docs/troubleshooting.md), [docs/token-rotation.md](docs/token-rotation.md). Placeholder snippets: [examples/](examples/).

**MCP cannot override a client’s approval prompts.** Auto-approve only where the product supports it, and only for the three `github_issue_*` tools.

Live two-client + e2e close must run on-tailnet (the gateway host / Cursor desktop / etc.). Cursor cloud VMs without Tailscale **cannot** reach a Tailscale-only listener; that failure is recorded in [docs/verification.md](docs/verification.md). This ticket does **not** enable Funnel.

## Implementation constraints

- **Runtime:** Node.js 22 (`/path/to/node-prefix` on the gateway host; any Node 22 on CI/cloud).
- **Tests:** Mock GitHub; never use the real PAT in tests or CI.
- **Secrets:** Never commit, log, or print the GitHub PAT or client API key plaintext (except one-time issue to stdout for operators). Control page never displays secrets.
- **Host work:** Installing the real token on the gateway host, Funnel / public exposure, and deploy/restart on the gateway host require the host operator's explicit OK.

## Layout

```
github-gateway/
  README.md
  package.json              # Node 22; @modelcontextprotocol/sdk
  config.example.toml
  docs/                     # 54–58 design, service, control, clients, verification
  examples/                 # placeholder MCP client snippets (58)
  launchd/                  # gateway + mcp-control-plane plists
  control/                  # control plane UI + registry examples (57)
  src/                      # server, tools, github, auth, audit, transports
  scripts/                  # keys + gateway/control launchd helpers
  tests/                    # unit + HTTP + health + service + control (mocked)
```
