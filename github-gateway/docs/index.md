# GitHub MCP gateway — documentation index

Design and operations docs for the portable GitHub MCP gateway under `github-gateway/`. Tickets **54–58** (edidasken/code#60–#64) cover design, server core, LaunchAgent/service, MCP control page, and client setup / verification.

## Design + implementation (tickets 54–58)

| Document | Status | Summary |
|----------|--------|---------|
| [../README.md](../README.md) | Done | Overview, will / will not, doc map, constraints, how to run tests |
| [architecture.md](architecture.md) | Done | Components, layout, transports, shared tools, control plane |
| [threat-model.md](threat-model.md) | Done | Assets, boundaries, threats, mitigations, Funnel decision |
| [tools.md](tools.md) | Done | v1 tools, close-with-merged-PR, forbidden actions |
| [config-schema.md](config-schema.md) | Done | Schema + link to example config |
| [auth-and-permissions.md](auth-and-permissions.md) | Done | Client keys, PAT loading, allowlists, no secrets in UI/logs |
| [token-loading.md](token-loading.md) | Done (55) | Secure file / Keychain / test-env load paths |
| [service.md](service.md) | Done (56) | launchd install/start/stop/restart, logs, health, recovery, Tailscale; Funnel = host-operator decision not enabled |
| [control-page.md](control-page.md) | Done (57) | Tailscale-only control UI, own sign-in, registry toggles + audit; no secrets; no Funnel |
| [client-setup.md](client-setup.md) | Done (58) | Cursor desktop/cloud, Claude Code/Desktop, VS Code, Antigravity/Gemini, generic stdio + HTTP; approval-prompt note |
| [troubleshooting.md](troubleshooting.md) | Done (58) | Auth, allowlist, close-not-merged, health, service down, cannot reach the gateway host |
| [token-rotation.md](token-rotation.md) | Done (58) | Rotate/revoke client keys; rotate PAT on the gateway host; leak response |
| [verification.md](verification.md) | Done (58) | Cloud reachability honesty; the host operator two-client + e2e close steps |
| [../config.example.toml](../config.example.toml) | Done | Placeholder config; no real secrets |
| [../examples/](../examples/) | Done (58) | Placeholder MCP client snippets (no real keys) |
| [../src/](../src/) | Done (55) | MCP server core (stdio + HTTP, tools, audit, rate limits) |
| [../launchd/](../launchd/) | Done (56–57) | Gateway + `com.konnectors.mcp-control-plane` LaunchAgent templates (`/path/to/node-prefix`) |
| [../control/](../control/) | Done (57) | Control plane process, registry examples, UI |

## Related SERVER docs (context only)

- Repo `README.txt` — SERVER MCP on each machine at `/mcp` (machine controls; separate from this gateway).
- `docs/HELPER.md` — read-only helper pattern (bearer token file outside git, Tailscale bind). Reuse the same secret-handling habits; do not conflate the two services.
