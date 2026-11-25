# Config schema

The gateway loads a single TOML (preferred) or JSON config from a path **outside the git worktree** (for example `/path/to/github-mcp-gateway-data/config.toml`). The repo ships [config.example.toml](../config.example.toml) with placeholders only.

Ticket 55 will validate this schema in code. Field names below are normative for v1.

## Top-level

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | integer | yes | Schema version; `1` for this design |
| `transport` | table | yes | stdio / HTTP settings |
| `auth` | table | yes | Client API key store |
| `github` | table | yes | Token loading + API base |
| `allowlist` | table | yes | Repositories and actions |
| `audit` | table | yes | Log path and retention |
| `rate_limit` | table | yes | Per-client limits |

## `transport`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stdio.enabled` | bool | `true` | Serve MCP over stdio when the process is launched as a local MCP child |
| `http.enabled` | bool | `false` | Serve authenticated Streamable HTTP |
| `http.bind` | string | `"127.0.0.1"` | Listen address. Prefer Tailscale IP or loopback + `tailscale serve`. Do **not** default to `0.0.0.0` |
| `http.port` | integer | `8743` | TCP port for HTTP MCP |
| `http.base_path` | string | `"/mcp"` | URL path for Streamable HTTP (API key required) |
| `http.public_exposure` | string | `"none"` | `none` \| `tailscale` \| `funnel`. **`funnel` must never be set without the host operator’s recorded decision** |

Unauthenticated liveness is fixed at `GET|HEAD /health` (not configurable). See [service.md](service.md).

stdio and HTTP share one tool implementation ([architecture.md](architecture.md)).

## `auth` (client API keys)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `keys_path` | string | required | Path to the key store file (hashed keys + metadata), mode 600, outside repo |
| `header` | string | `"Authorization"` | HTTP header carrying the key |
| `bearer_prefix` | bool | `true` | Expect `Bearer <key>` |
| `stdio_require_key` | bool | `false` | If true, stdio clients must pass a key via env (normally false: local process trust) |

Keys are **not** the GitHub token. Issuance/rotation/revocation is independent ([auth-and-permissions.md](auth-and-permissions.md)).

## `github` (token loading)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `token_source` | string | required | `file`, `keychain`, or `env` (tests/mocks only) |
| `token_file` | string | — | Required when `token_source=file`. Absolute path outside repo, mode 600 |
| `token_env` | string | — | Required when `token_source=env`. Env var name holding a **mock** token for tests — never the real PAT in CI |
| `keychain_service` | string | — | Required when `token_source=keychain`. macOS Keychain service name |
| `keychain_account` | string | — | Required when `token_source=keychain` |
| `api_base` | string | `"https://api.github.com"` | Override only for mocks/tests |
| `user_agent` | string | `"edidasken-github-mcp-gateway/1"` | Sent on API calls |

**Forbidden:** embedding the PAT in this config, in client MCP JSON, in repo env files, or in logs. Config may only point at a source. See [token-loading.md](token-loading.md).

## `allowlist`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `repositories` | array of `"owner/repo"` or `"owner/*"` | `["edidasken/*"]` | Only these repos; reject everything else |
| `actions` | array of strings | v1 tool names | Must match [tools.md](tools.md); unknown tools stay disabled |

Default repository policy: **edidasken repositories only**.

Suggested default `actions`:

```toml
actions = [
  "github_issue_read",
  "github_issue_comment",
  "github_issue_close",
]
```

## `audit`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | required | Absolute path to JSON-lines audit log |
| `retain_days` | integer | `90` | Retention hint for rotation scripts (ticket 56+) |
| `log_issue_bodies` | bool | `false` | Must stay false unless host-operator OK’s a debug window |

## `rate_limit`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `per_client_per_minute` | integer | `60` | Max tool calls per client id per rolling minute |
| `per_client_per_day` | integer | `2000` | Soft daily cap |
| `close_per_client_per_hour` | integer | `30` | Extra cap on `github_issue_close` |

Exceeding a limit returns an error and writes an audit line; it does not call GitHub.

## Example

See [config.example.toml](../config.example.toml). Copy to the Services directory on the gateway host, then replace paths and issue real keys locally — never commit the live file.

## Validation rules (ticket 55)

- Reject config if `version != 1`.
- Reject if `github.token_source` is missing or if both file and keychain fields are incomplete for the chosen source.
- Reject if any string field looks like a GitHub PAT (`ghp_`, `github_pat_`) or a `ghs_` token — config must not hold secrets.
- Reject `http.public_exposure = "funnel"` unless an explicit `http.funnel_acknowledged_by_operator = true` is also set (still an ops decision; the flag only prevents accidents).
- Reject empty `allowlist.repositories` or empty `allowlist.actions`.
