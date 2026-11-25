# Architecture

Design for a self-contained GitHub MCP gateway under `github-gateway/`, intended to run on **gateway host** and stay portable enough to extract later.

## Goals

1. Hold the operator’s GitHub fine-grained PAT **only on the host**; never give it to MCP clients.
2. Expose a **real MCP server** (stdio + authenticated Streamable HTTP) with one shared tool implementation.
3. Restrict blast radius with repository and action allowlists plus audit logging.
4. Fit a trusted gateway-host deployment without becoming a Cursor-only plugin.
5. Design the future control page as a **control plane** for multiple MCP servers, with this gateway as the first managed entry.

## Non-goals (v1 series)

- Control-page UI is ticket 57 (`control/` + `docs/control-page.md`). Client setup and verification are ticket 58 ([client-setup.md](client-setup.md), [verification.md](verification.md)). Funnel remains a host-operator decision and is not enabled.
- No merge/delete/push/admin GitHub capabilities.
- No silent public Internet exposure (Funnel stays a host-operator decision; not enabled by tickets 56–57).

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│ the gateway host (trusted host)                                           │
│                                                                 │
│  ┌──────────────┐   load   ┌─────────────────┐                  │
│  │ Token store  │─────────▶│ GitHub client   │───▶ api.github.com│
│  │ file/Keychain│          │ (server-side)   │                  │
│  └──────────────┘          └────────▲────────┘                  │
│                                     │                           │
│  ┌──────────────┐  verify  ┌────────┴────────┐   append         │
│  │ Client API   │─────────▶│ Tool layer      │────────▶ Audit log│
│  │ key store    │          │ (v1 issue tools)│                  │
│  │ (hashed)     │          └────────▲────────┘                  │
│  └──────────────┘                   │                           │
│                        ┌────────────┴────────────┐              │
│                        │                         │              │
│               ┌────────┴───────┐      ┌──────────┴──────────┐   │
│               │ stdio transport│      │ Streamable HTTP     │   │
│               │ (local MCP)    │      │ + API key auth      │   │
│               └────────┬───────┘      └──────────┬──────────┘   │
│                        │                         │              │
│  ┌─────────────────────┴─────────────────────────┴────────────┐ │
│  │ launchd LaunchAgent (ticket 56)                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Control plane page (ticket 57) — lists/toggles MCP servers │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         ▲ stdio (same machine)          ▲ HTTP over Tailscale
         │                               │ (optional Funnel = host operator only)
    Local MCP hosts                 Remote MCP hosts / agents
```

### MCP server process

Single Node.js 22 process (`/path/to/node-prefix` on the gateway host; any Node 22 on CI/cloud). One process owns both transports when configured; local-only installs may enable stdio only. Ticket 55 implements the process (`src/index.js`); ticket 56 wires launchd.

### Auth

- **Remote (HTTP):** every request presents a client API key (for example `Authorization: Bearer <key>`). Keys are issued per client, stored **hashed**, independently rotatable and revocable. See [auth-and-permissions.md](auth-and-permissions.md).
- **Local (stdio):** the process is started by a trusted local host; still subject to repository/action allowlists. Do not embed the GitHub PAT in the client’s MCP config — only the gateway process loads it.
- **GitHub:** the gateway alone calls GitHub with the PAT. Clients never see it.

### GitHub client

Thin wrapper around the GitHub REST API for the v1 tools only. Must:

- Enforce the repository allowlist before any API call.
- Enforce the action allowlist (tool name → allowed GitHub operations).
- For close: verify a linked PR is merged unless `force`/`override` is set, then audit that override.
- Never log response bodies that could contain tokens; never log the PAT.

### Audit log

Append-only JSON lines (one object per tool call and per security-relevant event). Fields (design target): timestamp, client id (not raw key), tool name, owner/repo, issue number, outcome, error class, and `close_override` when used. Path and retention come from config. Audit logs must not contain the PAT, client key plaintext, or full issue bodies unless a later ticket explicitly narrows that for debugging under host-operator OK.

### launchd service (ticket 56)

LaunchAgent `com.konnectors.github-mcp-gateway` under the host user’s on the gateway host. Template: [`../launchd/com.konnectors.github-mcp-gateway.plist`](../launchd/com.konnectors.github-mcp-gateway.plist). Runs `/path/to/node` (Node prefix `/path/to/node-prefix` — not Homebrew) with config pointing at token/key files outside the git worktree. `KeepAlive` + `RunAtLoad` cover crash and reboot (with the gateway host auto-login). Binds HTTP to a Tailscale address (or localhost + `tailscale serve`), never `0.0.0.0` by default. Unauthenticated `/health` reports liveness without secrets. Full runbook: [service.md](service.md). Installing/starting on the gateway host remains a host-operator decision.

### Control page (ticket 57)

Separate Node process under `control/` (LaunchAgent `com.konnectors.mcp-control-plane`):

- Lists **managed MCP servers** from a registry file (this gateway is entry zero).
- Shows description, tools, allowlisted repos, status (running / stopped / unhealthy), last audit summary, recent errors, and enable/disable toggles.
- Own operator sign-in (scrypt password + hashed sessions); Tailscale-only bind; unauthenticated UI rejected.
- Does **not** hard-wire UI only to this gateway’s internals; adding a second managed server later is another `[[managed_servers]]` block.
- Never displays secrets (PAT, API keys, passwords). May show configured/not-configured flags only.
- Docs: [control-page.md](control-page.md).

## Shared tool implementation

stdio and Streamable HTTP must call the **same** functions:

```
transport (stdio | http)
    → authenticate / identify client (http: API key; stdio: local identity)
    → authorize (repo allowlist + action allowlist + rate limit)
    → tools.<name>(args)     // single implementation
    → audit.log(...)
    → GitHub client (if needed)
```

Do not duplicate close/merge-check logic per transport. MCP protocol framing differs; business rules do not.

## Folder layout (tickets 55–57)

```
github-gateway/
  README.md
  config.example.toml
  package.json
  docs/                     # includes service.md + control-page.md
  launchd/                  # gateway + mcp-control-plane plists
  control/                  # control plane (ticket 57)
  src/                      # server, tools, github, auth, audit, transports
  scripts/                  # issue-client-key + launchd + control install/ctl
  tests/                    # design-skeleton + mocked GitHub + health/service/control
```

`src/` modules:

| Module | Responsibility |
|--------|----------------|
| `src/index.js` | Process entry; load config; start transports |
| `src/config.js` | Parse/validate config (TOML/JSON) |
| `src/server-context.js` | Wire token, GitHub client, tools, audit, rate limits |
| `src/mcp-server.js` | MCP SDK registration of the three v1 tools |
| `src/auth/keys.js` | Hash/verify client API keys; issue/rotate/revoke helpers |
| `src/github/token.js` | Load PAT from file / Keychain / test env |
| `src/github/client.js` | Allowlisted GitHub REST + merged-PR timeline check |
| `src/tools/index.js` | Shared `github_issue_read` / `_comment` / `_close` |
| `src/audit.js` | JSON-lines writer (no secrets) |
| `src/rate-limit.js` | Per-client limits |
| `src/transport/stdio.js` | stdio MCP |
| `src/transport/http.js` | Streamable HTTP + API-key auth + `/health` |

## Control plane registry (ticket 57)

Registry file outside git (example: [`../control/registry.example.toml`](../control/registry.example.toml)):

```toml
[[managed_servers]]
id = "github-gateway"
display_name = "GitHub MCP gateway"
description = "…"
unit = "com.konnectors.github-mcp-gateway"
ctl_script = "/…/github-gateway/scripts/launchd-ctl.sh"
health_url = "http://127.0.0.1:8743/health"
config_path = "/path/to/github-mcp-gateway-data/config.toml"
audit_path = "/path/to/github-mcp-gateway-data/audit.jsonl"
```

The control page reads this registry per request. The GitHub gateway does not own the only UI path — add another `[[managed_servers]]` block for a later MCP server.

## Transports

| Transport | Audience | Auth | Notes |
|-----------|----------|------|-------|
| stdio | Local MCP hosts on the gateway host | Process trust + allowlists | Client config points at `node` + entry script; **no PAT in client JSON** |
| Streamable HTTP | Remote MCP clients on the tailnet | Per-client API key | JSON response mode (`enableJsonResponse`); default bind: Tailscale IP / MagicDNS via serve. Public Funnel = host-operator decision |

Cursor cloud VMs and other **off-tailnet** agents may **not** reach a Tailscale-only listener. Document that limit; do not silently open Funnel. See [threat-model.md](threat-model.md).

## Runtime

- **Node.js 22** from `/path/to/node-prefix` (not Homebrew).
- Config and secrets outside the SERVER git worktree (for example under `~/Services/github-mcp-gateway/`).
- Align with local habits: bearer tokens in mode-600 files, Tailscale-first networking, audit JSON lines.

## Relationship to SERVER’s existing `/mcp`

SERVER already exposes machine-control MCP at each node’s `/mcp` (Go). This gateway is a **separate** Node process with a separate purpose (GitHub Issues). Do not merge the tool lists. The future control page may manage both as registry entries, but they remain different servers.
