# Auth and permissions

## Two different secrets

| Secret | Who uses it | Storage | Visible to MCP clients? |
|--------|-------------|---------|-------------------------|
| GitHub fine-grained PAT | Gateway → GitHub API only | Secure file (mode 600) or macOS Keychain on the gateway host | **Never** |
| Client API key | MCP client → gateway HTTP | Hashed at rest in `auth.keys_path`; plaintext only at issuance | Client holds its own key; gateway never returns plaintext after issue |

Confusing these two is a design bug. Client configs may contain a **client API key** for HTTP. They must **never** contain the GitHub PAT.

## Client API key model

1. **Issue:** an admin on the gateway host runs `scripts/issue-client-key.js` (ticket 55) that generates a high-entropy key (`gmgk_…`), stores `sha256` + client id + label + created_at, and prints the plaintext **once**.
2. **Authenticate (HTTP):** gateway reads `Authorization: Bearer <key>`, hashes it, looks up the store, rejects unknown/revoked keys.
3. **Rotate:** issue a new key for the same client id (or a new id), give plaintext to the operator, revoke the old hash after cutover.
4. **Revoke:** set `revoked_at` on the hash record; further calls fail and are audited.

stdio by default trusts the local process invocation (`auth.stdio_require_key = false`) but still applies repository and action allowlists. Do not weaken allowlists for stdio.

## GitHub token handling

- `github.token_source = "file"` → read entire file contents trimmed; file outside repo.
- `github.token_source = "keychain"` → read from macOS Keychain with service/account from config.
- On startup failure to load the token: exit non-zero; do not run with a missing PAT.
- Never put the PAT in: git, example configs, unit tests, CI secrets for this project’s mocks, audit logs, stderr, control page, or chat.

The operator’s PAT stays in the operator vault until he installs it on the gateway host. **Installing the real token on the gateway host is a decision for the host operator** — ticket 54 does not do it; later tickets must stop and ask the host operator if they need it.

## Allowlists

### Repositories

Default: `edidasken/*` only. Every tool call supplies `owner`/`repo`; if the pair is not allowlisted, return an error **before** calling GitHub.

### Actions

Only the v1 tools in [tools.md](tools.md). The action allowlist in config is a second gate so a mis-deployed binary that grows tools still stays clipped until config allows them.

### Close permission

Closing also requires the merged-PR rule (or audited `override_unmerged_pr`). Holding a valid API key is not enough to close an arbitrary open issue without that check.

## Logs and control page: no secrets

| Surface | May show | Must not show |
|---------|----------|---------------|
| Audit log | client id, tool, repo, issue number, outcome, `close_override` | PAT, API key plaintext, Keychain secrets |
| Control page (ticket 57) | server status, enable/disable, key **ids**/labels, override counts | PAT, API key plaintext, raw token file paths’ contents |
| stderr / launchd logs | non-secret errors | Authorization headers, token file contents |

If a library would log HTTP headers by default, disable that or redact `Authorization`.

## Permission summary for operators

A client with a valid key can, on allowlisted edidasken repos only:

- Read an issue
- Comment on an issue
- Close an issue with `completed` or `not_planned`, when a linked PR is merged (or with audited override)

It cannot merge, delete, push, or administer repositories through this gateway.
