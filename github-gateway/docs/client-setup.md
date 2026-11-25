# Client setup guides

How to point MCP hosts at this GitHub MCP gateway. **Placeholder-only** examples — never paste a real client API key, GitHub PAT, or Authorization header into git, chat, or PRs.

This is the ticket **58** (edidasken/code#64) client surface. Transports and auth are defined in [architecture.md](architecture.md), [auth-and-permissions.md](auth-and-permissions.md), and [service.md](service.md).

## Before any client

1. Gateway running on **gateway host** (LaunchAgent or local process). See [service.md](service.md).
2. GitHub PAT installed on the gateway host only (file or Keychain) — **host-operator decision**; never in client configs.
3. Issue a **per-client** API key on the gateway host (plaintext shown once):

   ```bash
   cd /path/to/konnectors/github-gateway
   /path/to/node scripts/issue-client-key.js \
     --keys /path/to/github-mcp-gateway-data/client-keys.json \
     --id REPLACE_ME_client_id \
     --label "REPLACE_ME short label"
   ```

4. Prefer **one key id per client product** (e.g. `cursor-desktop`, `claude-code`, `vscode`) so rotate/revoke is precise. See [token-rotation.md](token-rotation.md).

### Transport choice

| Transport | When to use | Auth |
|-----------|-------------|------|
| **stdio** | Client can spawn Node on a machine that already has the gateway config + PAT (typically the gateway host itself, or a trusted Mac on the same host files) | Client API key optional (`auth.stdio_require_key = false` by default); allowlists still apply |
| **Streamable HTTP** | Client is remote but **on the tailnet** (or otherwise able to reach the gateway host’s listener) | `Authorization: Bearer <client-api-key>` on every `/mcp` request |

Default remote URL shape (placeholders):

- Health (no key): `http://REPLACE_ME_gateway_host:8743/health` or HTTPS via `tailscale serve`
- MCP: `http://REPLACE_ME_gateway_host:8743/mcp` with Bearer key

MagicDNS example from [service.md](service.md): `https://REPLACE_ME_gateway_host.example.ts.net:<serve-port>/mcp` — only if the host operator has wired serve that way.

### MCP cannot override client approval prompts

The gateway cannot suppress a host’s “Allow this tool?” UI. Unattended close only works if **that product** lets you auto-approve specific tools. Where a product supports auto-approve, this doc says how; where it does not, treat every close as an interactive confirm. Test unattended closes **per client** — do not assume one host’s setting applies to another.

---

## Cursor desktop

### Option A — Streamable HTTP (recommended when desktop is on the tailnet)

User MCP config (Cursor → Settings → MCP, or `~/.cursor/mcp.json` depending on Cursor version). Placeholders only:

```json
{
  "mcpServers": {
    "github-gateway": {
      "url": "https://REPLACE_ME_gateway_host/mcp",
      "headers": {
        "Authorization": "Bearer REPLACE_ME_client_api_key"
      }
    }
  }
}
```

If your Cursor build uses `transport: "http"` / `type: "streamableHttp"` instead of bare `url`, keep the same URL + Authorization header — do not put the GitHub PAT anywhere.

### Option B — stdio on the gateway host (or a Mac that mounts the same Services paths)

```json
{
  "mcpServers": {
    "github-gateway": {
      "command": "/path/to/node",
      "args": [
        "/path/to/konnectors/github-gateway/src/index.js",
        "--config",
        "/path/to/github-mcp-gateway-data/config.toml"
      ]
    }
  }
}
```

Use `/path/to/node` on the gateway host — not Homebrew `node`.

### Auto-approve (desktop)

Cursor desktop may prompt on first use of each tool. If the product exposes per-server or per-tool auto-approve / “always allow” in MCP settings, enable only:

- `github_issue_read`
- `github_issue_comment`
- `github_issue_close`

Do **not** auto-approve unknown tools. MCP still cannot force approval if the UI requires a click and no auto-approve exists for that build — document that in your verification notes.

### Smoke check

1. MCP panel shows `github-gateway` connected.
2. Ask the agent to list tools — expect the three `github_issue_*` names.
3. Optionally `github_issue_read` on a known allowlisted issue. Never paste keys into the chat transcript.

---

## Cursor cloud agents

### Reachability (honest default)

**Typical Cursor cloud VMs are off the operator’s private Tailscale tailnet.** A Tailscale-only HTTP listener on the gateway host is **not reachable** from those VMs. That is a network boundary, not a gateway bug. Funnel / public exposure is a **host-operator-only** decision and is **not** enabled by ticket 58 (see [service.md](service.md) and [threat-model.md](threat-model.md)).

Until the host operator enables a deliberate exposure path, cloud agents should:

- Use another GitHub path that already has network reachability for reads, **or**
- Defer gateway closes to a **on-tailnet** client (Cursor desktop, Claude Code on a tailnet machine, the host operator on the gateway host), **or**
- Have the host operator run the close on the gateway host after merge (see [verification.md](verification.md)).

### If / when the cloud VM can reach the HTTP URL

Configure the cloud agent / Project MCP server the same way as desktop HTTP (placeholder URL + Bearer client key). Prefer a dedicated key id such as `cursor-cloud`.

Cursor cloud / Project settings may include an **auto-approve** (or equivalent) list for MCP tools. Where the product supports it, allow only the three `github_issue_*` tools for the gateway server. If the Project still shows a Submit / approval form for `issue_write`-style closes, record that honestly — the gateway cannot clear it.

### What not to do

- Do not enable Funnel from a coding agent.
- Do not put the operator’s GitHub PAT in cloud env vars or MCP headers.
- Do not claim cloud e2e success when health/`/mcp` cannot connect.

---

## Claude Code

Claude Code typically loads MCP from project or user settings (`.mcp.json` / Claude settings — names vary by version).

### Streamable HTTP (on-tailnet host)

```json
{
  "mcpServers": {
    "github-gateway": {
      "type": "http",
      "url": "https://REPLACE_ME_gateway_host/mcp",
      "headers": {
        "Authorization": "Bearer REPLACE_ME_client_api_key"
      }
    }
  }
}
```

If your Claude Code build expects `url` without `type`, or uses `transport: "sse"` / streamable HTTP under a different key, keep Authorization as Bearer and the `/mcp` path.

### stdio

```json
{
  "mcpServers": {
    "github-gateway": {
      "command": "/path/to/node",
      "args": [
        "/path/to/konnectors/github-gateway/src/index.js",
        "--config",
        "/path/to/github-mcp-gateway-data/config.toml"
      ]
    }
  }
}
```

### Approvals

Claude Code often asks before tool runs. Use the product’s allowlist / “don’t ask again” only for the three gateway tools if you need less friction. Unattended close must be verified in that install — do not assume.

---

## Claude Desktop

Edit Claude Desktop’s MCP config (commonly `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS).

### stdio (most common for Desktop)

```json
{
  "mcpServers": {
    "github-gateway": {
      "command": "/path/to/node",
      "args": [
        "/path/to/konnectors/github-gateway/src/index.js",
        "--config",
        "/path/to/github-mcp-gateway-data/config.toml"
      ]
    }
  }
}
```

Restart Claude Desktop after edits. Desktop builds that support remote HTTP MCP can use the same URL + `Authorization` pattern as Cursor; prefer a key id like `claude-desktop`.

Claude Desktop’s tool permission UI is separate from the gateway — auto-approve only if the product offers it for specific MCP tools.

---

## VS Code

VS Code MCP (GitHub Copilot / MCP preview, depending on build) uses a server definition in user or workspace MCP config (often `.vscode/mcp.json` or profile MCP settings).

### HTTP

```json
{
  "servers": {
    "github-gateway": {
      "type": "http",
      "url": "https://REPLACE_ME_gateway_host/mcp",
      "headers": {
        "Authorization": "Bearer REPLACE_ME_client_api_key"
      }
    }
  }
}
```

Some VS Code builds nest under `"mcp": { "servers": { ... } }` — keep placeholders; never commit real keys to the workspace file. Prefer user-level MCP config for secrets, or a local-only untracked file.

### stdio

```json
{
  "servers": {
    "github-gateway": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": [
        "/path/to/konnectors/github-gateway/src/index.js",
        "--config",
        "/path/to/github-mcp-gateway-data/config.toml"
      ]
    }
  }
}
```

Enable / trust the server in the MCP view, then confirm `tools/list` shows the three tools. VS Code may require per-tool confirmation; use built-in allowlists only where available.

---

## Antigravity / Gemini

Antigravity (and Gemini coding hosts that accept custom MCP servers) should use the **generic** patterns below. Prefer:

- **stdio** when the agent runs on the gateway host (or another Mac with the Services config + PAT), using `/path/to/node`.
- **HTTP** when the agent machine is on the tailnet and can open the gateway host’s `/mcp`.

Example key id: `antigravity` or `gemini-local`.

Do not put the GitHub PAT in Antigravity / Gemini env panels. If the host cannot reach Tailscale-only the gateway host, treat it like Cursor cloud: record failure and use an on-tailnet client for closes (see [verification.md](verification.md)). Tool-approval UIs vary; MCP still cannot override them.

---

## Generic MCP client

### stdio

Any host that can spawn a process:

```text
command: /path/to/node   # or another Node 22 binary off gateway host
args:
  - /path/to/konnectors/github-gateway/src/index.js
  - --config
  - /path/to/github-mcp-gateway-data/config.toml
```

Protocol: MCP over stdio (SDK `StdioServerTransport`). After `initialize`, call `tools/list` — expect `github_issue_read`, `github_issue_comment`, `github_issue_close`.

### Authenticated Streamable HTTP

1. `GET` health (no auth): `http://REPLACE_ME_gateway_host:8743/health` → JSON with `"ok": true` and no secrets.
2. MCP endpoint: `POST` (and session follow-ups per Streamable HTTP) to `http://REPLACE_ME_gateway_host:8743/mcp` with:

   ```http
   Authorization: Bearer REPLACE_ME_client_api_key
   Content-Type: application/json
   ```

3. Missing / wrong / revoked key → **401** with a short reason (no PAT). See [troubleshooting.md](troubleshooting.md).

Use the official MCP SDK client or any Streamable HTTP-compatible host. Do not log response headers that might echo Authorization.

---

## Issuing keys without leaking them

| Do | Don’t |
|----|--------|
| Run `issue-client-key.js` on the gateway host; copy plaintext once into the client’s secret store | Paste keys into chat, PR bodies, screenshots, or git |
| Use distinct `--id` per client | Share one key across all products |
| Confirm tools via the client UI | Dump `Authorization` headers into audit tickets |

Rotate and revoke: [token-rotation.md](token-rotation.md).

## Related

- [troubleshooting.md](troubleshooting.md) — auth, allowlist, reachability failures
- [verification.md](verification.md) — recorded two-client + e2e close plan
- [service.md](service.md) — Tailscale vs Funnel
- [tools.md](tools.md) — tool arguments and close rules
