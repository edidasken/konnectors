# Service and network (the gateway host)

How to run the GitHub MCP gateway as a managed **LaunchAgent** on a trusted **gateway host**, with crash/reboot recovery, a secret-free health endpoint, and Tailscale reachability for on-tailnet clients.

This document is the ticket **56** (edidasken/code#62) runbook. It ships definitions and instructions only. **Installing or starting the unit on the gateway host, putting the real PAT on disk, and any Funnel/public exposure are decisions for the host operator on the machine** — this PR does not perform those steps.

## What gets installed

| Piece | Path / identity |
|-------|-----------------|
| LaunchAgent label | `com.konnectors.github-mcp-gateway` |
| Plist template (in repo) | [`../launchd/com.konnectors.github-mcp-gateway.plist`](../launchd/com.konnectors.github-mcp-gateway.plist) |
| Installed plist | `~/Library/LaunchAgents/com.konnectors.github-mcp-gateway.plist` |
| Node runtime (the gateway host) | **`/path/to/node-prefix`** prefix → binary **`/path/to/node`** (operator standard). **Do not use Homebrew `node`.** |
| Working directory | Absolute path to `github-gateway/` in the konnectors checkout used on the gateway host |
| Host config / secrets dir | `/path/to/github-mcp-gateway-data/` (outside git) |
| Config file | `/path/to/github-mcp-gateway-data/config.toml` |
| Process log | `/path/to/github-mcp-gateway-data/gateway.log` |
| Health URL (local) | `http://127.0.0.1:<port>/health` (default port `8743`) |
| MCP Streamable HTTP | `http://<tailnet-host>:<port>/mcp` (authenticated) |

On CI or cloud agents, any Node **22** binary is fine for tests. On the gateway host, the LaunchAgent must point at `/path/to/node` so the service does not depend on Homebrew.

## Prerequisites (the host operator on the gateway host)

Before install:

1. konnectors checkout available (for example under `/path/to/konnectors`).
2. Node 22 at `/path/to/node-prefix` (`/path/to/node -v` should print v22.x).
3. Copy [`../config.example.toml`](../config.example.toml) to `/path/to/github-mcp-gateway-data/config.toml`.
4. Create mode-600 files for the GitHub PAT and hashed client keys **outside** the repo (see [token-loading.md](token-loading.md) and [auth-and-permissions.md](auth-and-permissions.md)). Installing the real PAT is a **host-operator decision**.
5. For remote MCP over Tailscale, set in config:
   - `transport.http.enabled = true`
   - `transport.http.public_exposure = "tailscale"` (advertise intent; still **not** Funnel)
   - Prefer `http.bind = "127.0.0.1"` plus `tailscale serve`, **or** bind the process to the gateway host’s Tailscale IPv4. **Do not** set `http.bind = "0.0.0.0"`.
   - Leave `http.funnel_acknowledged_by_operator = false` and `public_exposure` not equal to `funnel` unless the host operator has explicitly decided otherwise (see below).

This ticket does **not** enable Funnel, open a public port, or expose the service off the tailnet.

## Install

As the logged-in user on the gateway host (never `sudo` / never root):

```bash
cd /path/to/konnectors/github-gateway
# Optional: install plist without starting (dry layout)
GITHUB_MCP_GATEWAY_SKIP_START=1 ./scripts/install-launchd.sh
# Full install + bootstrap
./scripts/install-launchd.sh
```

The install script:

- Requires `/path/to/node` (override only via `GITHUB_MCP_GATEWAY_NODE_BIN` for unusual layouts — still not Homebrew).
- Requires an existing config at `/path/to/github-mcp-gateway-data/config.toml`.
- Writes `~/Library/LaunchAgents/com.konnectors.github-mcp-gateway.plist` from the template.
- Bootstraps the LaunchAgent into `gui/$(id -u)` unless `GITHUB_MCP_GATEWAY_SKIP_START=1`.

Uninstall (stops the agent; leaves Services data, token, keys, and audit alone):

```bash
./scripts/uninstall-launchd.sh
```

## Start / stop / restart / status

```bash
./scripts/launchd-ctl.sh start
./scripts/launchd-ctl.sh stop
./scripts/launchd-ctl.sh restart
./scripts/launchd-ctl.sh status
```

Equivalent `launchctl` (uid = your numeric user id):

```bash
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.konnectors.github-mcp-gateway.plist
launchctl kickstart -k "gui/$(id -u)/com.konnectors.github-mcp-gateway"
launchctl bootout "gui/$(id -u)/com.konnectors.github-mcp-gateway"
launchctl print "gui/$(id -u)/com.konnectors.github-mcp-gateway"
```

## Logs

- **stdout/stderr:** `/path/to/github-mcp-gateway-data/gateway.log` (LaunchAgent `StandardOutPath` / `StandardErrorPath`).
- **Audit (tool calls):** path from config `audit.path` (JSON lines; no secrets — see [auth-and-permissions.md](auth-and-permissions.md)).

```bash
tail -n 100 /path/to/github-mcp-gateway-data/gateway.log
```

Do not paste Authorization headers, PAT file contents, or client key plaintext into chat or PRs.

## Health endpoint

Unauthenticated **liveness** probe (no API key):

```bash
curl -sS "http://127.0.0.1:8743/health"
```

Example shape (fields may grow for ticket 57; never secrets):

```json
{
  "ok": true,
  "status": "running",
  "service": "github-mcp-gateway",
  "version": "1.0.0",
  "uptime_seconds": 12,
  "transport": "http",
  "listen": {
    "bind": "127.0.0.1",
    "port": 8743,
    "mcp_path": "/mcp",
    "health_path": "/health",
    "public_exposure": "tailscale"
  },
  "sessions": 0
}
```

What health **must not** include: GitHub PAT, token file path contents, client API keys, key hashes, Authorization material, or issue bodies.

`GET` and `HEAD` are allowed. The MCP path (`/mcp` by default) still requires a client API key on every request.

## Crash and reboot recovery

| Event | Behavior |
|-------|----------|
| Process crash / exit | LaunchAgent `KeepAlive=true` relaunches the process (throttled by `ThrottleInterval=5`). |
| User logout/login | `RunAtLoad=true` starts the agent when the user session loads. |
| Machine reboot | On the gateway host, auto-login (existing local habit) brings the user session back; LaunchAgent loads again. No LaunchDaemon / root unit is used. |
| Bad config / missing token file | Process exits; KeepAlive will retry. Fix config/token then `launchd-ctl.sh restart`. Check `gateway.log`. |

Practical checks without a live PAT in CI: plist contains `KeepAlive` / `RunAtLoad` / `/path/to/node-prefix`; health responds on a test listener; install script refuses missing Node/config. Live reboot verification is an on-machine the host operator step after install.

## Tailscale reachability (on-tailnet clients)

Authenticated Streamable HTTP is meant for **clients already on the operator’s private tailnet**.

### Recommended pattern A — loopback + `tailscale serve`

1. Config: `http.bind = "127.0.0.1"`, `http.port = 8743`, `http.enabled = true`, `http.public_exposure = "tailscale"`.
2. On the gateway host (host-operator decision when to run):

   ```bash
   # Example only — exact serve flags are the host operator’s ops choice; do not funnel.
   tailscale serve --bg 8743
   # or a dedicated HTTPS port → http://127.0.0.1:8743
   ```

3. Clients use MagicDNS, for example:
   - Health: `https://REPLACE_ME_gateway_host.example.ts.net:<serve-port>/health`
   - MCP: `https://REPLACE_ME_gateway_host.example.ts.net:<serve-port>/mcp` with `Authorization: Bearer <client-api-key>`

### Pattern B — bind Tailscale IP directly

1. Discover the gateway host’s Tailscale IPv4 (`tailscale ip -4`).
2. Set `http.bind` to that `100.x` address (still not `0.0.0.0`).
3. Clients call `http://<tailscale-ip>:8743/mcp` (or MagicDNS if DNS points at the same listener).

In both patterns, **API keys remain required** on `/mcp`. Tailscale identity is not a substitute for client keys ([threat-model.md](threat-model.md)).

### How a tailnet client connects

1. Obtain a client API key on the gateway host via `scripts/issue-client-key.js` (plaintext shown once).
2. Point the MCP host at the Streamable HTTP URL above with the Bearer key.
3. Verify health first, then MCP `initialize` / `tools/list` (full client guides: [client-setup.md](client-setup.md)).

## Off-tailnet cloud agents (honest limit)

**Cursor cloud VMs and other off-tailnet agents may not be able to open a connection to a Tailscale-only address on the gateway host.** That is a real network boundary, not a gateway bug.

If cloud agents must call this HTTP transport, someone would need an explicit exposure path, for example:

| Option | What it would mean | Status in this PR |
|--------|--------------------|-------------------|
| Tailscale Funnel (or similar) with TLS + **still** requiring client API keys, allowlists, rate limits, and audit | Authenticated public HTTPS into the same process | **Decision for the host operator. NOT enabled by this PR.** |
| Run a client already on the tailnet | No public exposure | Possible for some hosts; not true for typical Cursor cloud VMs |
| Keep using another GitHub path that already has network reachability | Separate from this gateway | Existing connectors |

### Funnel / public exposure — host-operator decision (not done)

- This PR **does not** turn on Tailscale Funnel.
- This PR **does not** bind `0.0.0.0` or open a public port.
- This PR **does not** set `http.public_exposure = "funnel"` or `http.funnel_acknowledged_by_operator = true` in any shipped live config (example config keeps Funnel off).
- Risks if the host operator later enables Funnel: the listener becomes reachable from the untrusted Internet; stolen client keys become remotely usable; attack surface grows even with TLS and allowlists. See [threat-model.md](threat-model.md) T7/T8.

Record any Funnel enablement as an ops decision outside this ticket. Control page: [control-page.md](control-page.md). Client verification: [verification.md](verification.md).

## What this ticket does not do

- Control page UI is ticket **57** — see [control-page.md](control-page.md).
- No Funnel / public / off-tailnet exposure enabled.
- No install, bootstrap, deploy, or restart performed on the gateway host by the coding agent.
- No GitHub PAT committed, logged, or requested in chat.

## Related

- [architecture.md](architecture.md) — LaunchAgent and transport diagram
- [control-page.md](control-page.md) — MCP control plane (ticket 57)
- [threat-model.md](threat-model.md) — Tailscale vs Funnel trust boundary
- [config-schema.md](config-schema.md) — `http.bind` / `public_exposure`
- [token-loading.md](token-loading.md) — PAT file / Keychain paths
