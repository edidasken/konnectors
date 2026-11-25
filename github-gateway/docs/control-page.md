# MCP control page (the gateway host)

Local **control plane** on a trusted **gateway host** that lists each registered MCP server, shows a plain-English description of what it does, and provides on/off toggles with an audit trail.

This is ticket **57** (edidasken/code#63). It ships code, registry format, LaunchAgent template, and docs. **Installing or restarting on the gateway host, setting the operator password, and any network exposure beyond Tailscale are host-operator steps** — this PR does not perform them. **Funnel / public Internet exposure is not enabled** and is out of scope.

## What it is

| Piece | Identity / path |
|-------|-----------------|
| Process | Node 22 control plane (`control/src/index.js`) |
| LaunchAgent label | `com.konnectors.mcp-control-plane` |
| Plist template | [`../launchd/com.konnectors.mcp-control-plane.plist`](../launchd/com.konnectors.mcp-control-plane.plist) |
| Host config dir | `/path/to/mcp-control-plane-data/` (outside git) |
| Config example | [`../control/config.example.toml`](../control/config.example.toml) |
| Registry example | [`../control/registry.example.toml`](../control/registry.example.toml) |
| Default local URL | `http://127.0.0.1:8750/` |
| First managed server | GitHub MCP gateway (`com.konnectors.github-mcp-gateway`) |

The page is **not** a Library Page and **not** the operator status page. A Library Page cannot safely start or stop launchd units. This UI is a small control plane for MCP servers on the gateway host. The GitHub gateway is entry zero; more servers are added via the registry file.

## Access: Tailscale-only + own sign-in

1. **Network:** bind `127.0.0.1` (plus `tailscale serve`) or the gateway host’s Tailscale `100.x` address. Config rejects `0.0.0.0` / `::`. `public_exposure` defaults to intent `tailscale`. **Funnel is not enabled** (`funnel_acknowledged_by_operator` must stay false unless the host operator explicitly decides later — not this ticket).
2. **Sign-in:** the control plane has its **own** operator password (scrypt hash in a mode-600 file), separate from MCP client API keys and the GitHub PAT. Unauthenticated requests to `/` and `/api/*` (except `/health` and the login POST) receive **401**.
3. **Sessions:** HttpOnly `SameSite=Strict` cookie; token stored **hashed** in the sessions file. Sign-out revokes the session.

Set / rotate the password on the gateway host (host operator):

```bash
cd /path/to/konnectors/github-gateway
MCP_CONTROL_PASSWORD='…choose a long secret…' \
  node scripts/set-control-password.js \
  --password-file /path/to/mcp-control-plane-data/password.json
```

Do not commit the password file or paste the password into chat or PRs.

### How to reach the page over Tailscale

Recommended: process on loopback + `tailscale serve` (exact serve flags are the host operator’s ops choice; **do not funnel**):

1. Config: `listen.bind = "127.0.0.1"`, `listen.port = 8750`, `listen.public_exposure = "tailscale"`.
2. Open via MagicDNS after serve is wired, for example `https://REPLACE_ME_gateway_host.example.ts.net:<serve-port>/`, and sign in with the operator password.
3. Or bind the process to the gateway host’s Tailscale IPv4 and open `http://<100.x>:8750/`.

`/health` on the control plane is a secret-free liveness probe (same idea as the gateway’s `/health`). The HTML UI still requires sign-in.

## What the page shows for each server

| Field | Source |
|-------|--------|
| Display name + plain-English description | Registry |
| Tools | Registry fallback, or `allowlist.actions` from the server’s `config_path` |
| Allowed repositories | Registry fallback, or `allowlist.repositories` from `config_path` |
| Status | `running` / `stopped` / `unhealthy` from launchd print + health probe |
| Last call | Latest non-transport line from the server’s audit JSONL |
| Recent errors | Recent `outcome=error\|denied` audit lines (redacted) |
| Token / keys configured | **Boolean only** (file exists). Values are never read or shown |

## On / off toggles

Each card has **Turn on** / **Turn off**.

- **On** runs the server’s `ctl_script start` (or `launchctl bootstrap` / `kickstart` for its unit).
- **Off** runs `ctl_script stop` (or `launchctl bootout`). Stopping cuts access right away by unloading the LaunchAgent.
- Every toggle appends a control-plane audit line: who, when, server id, unit, desired state, outcome. Path: `audit.path` in the control config.

For the GitHub gateway, `ctl_script` points at [`../scripts/launchd-ctl.sh`](../scripts/launchd-ctl.sh) (ticket 56).

## Registering another MCP server later

Edit the **registry** file (not hard-coded HTML):

```toml
[[managed_servers]]
id = "example-other-mcp"
display_name = "Example other MCP"
description = "Plain-English description of what this server does."
unit = "com.konnectors.example-other-mcp"
ctl_script = "/path/to/that/launchd-ctl.sh"
health_url = "http://127.0.0.1:9xxx/health"
config_path = "/path/to/example-other-mcp-data/config.toml"
audit_path = "/path/to/example-other-mcp-data/audit.jsonl"
tools = ["example_tool"]
allowed_repositories = []
```

Reload is automatic on the next page load (registry is read per request). Ship a LaunchAgent + ctl script for the new server the same way ticket 56 did for the GitHub gateway.

## What is intentionally not shown

| Never shown | May show |
|-------------|----------|
| GitHub PAT / token file contents | “GitHub token: configured / not configured” |
| Client API key plaintext or hashes | “Client keys: configured / not configured” |
| Operator password / session cookie values | Signed-in operator label |
| Authorization headers | Tool names, allowlisted repos, status, audit summaries |

See [auth-and-permissions.md](auth-and-permissions.md) and [threat-model.md](threat-model.md) (T9).

## Install on the gateway host (host-operator steps — not done by the coding agent)

1. Ensure Node 22 at `/path/to/node-prefix` (`/path/to/node -v`).
2. Create `/path/to/mcp-control-plane-data/` (mode 700).
3. Copy `control/config.example.toml` → `…/config.toml` and `control/registry.example.toml` → `…/registry.toml`. Point registry paths (`ctl_script`, `config_path`, `audit_path`, `token_configured_path`) at the live gateway layout. Replace every `REPLACE_ME`.
4. Set the operator password with `scripts/set-control-password.js` (above).
5. Confirm the GitHub gateway LaunchAgent from ticket 56 is installed (or install it first) so toggles have a real unit to start/stop.
6. From the konnectors checkout: `github-gateway/scripts/install-control-launchd.sh` then `scripts/control-ctl.sh status` and open `http://127.0.0.1:8750/` on the gateway host (or via Tailscale serve).
7. Optionally wire `tailscale serve` to port 8750. **Do not enable Funnel** unless the host operator explicitly decides later.
8. If code on the gateway host needs a pull/restart after merge: pull `main`, then `scripts/control-ctl.sh restart` (and gateway `launchd-ctl.sh restart` if needed). Agents must not do this without listing it here for the host operator.

## Out of scope

- operator status page status card (separate work if wanted later).
- Funnel / public / off-tailnet exposure.
- Client setup guides and end-to-end MCP host verification — [client-setup.md](client-setup.md), [verification.md](verification.md) (ticket 58).
- Performing install/restart on the gateway host from the coding agent.

## Related

- [architecture.md](architecture.md) — control plane registry shape
- [service.md](service.md) — GitHub gateway LaunchAgent (ticket 56)
- [threat-model.md](threat-model.md) — Tailscale vs Funnel; control page must not leak secrets
