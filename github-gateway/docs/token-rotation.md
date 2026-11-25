# Token rotation and revocation runbook

How to rotate or revoke **client API keys** and the **GitHub PAT** without putting new secrets in git, PRs, client MCP configs that get committed, or chat. Ticket **58** (edidasken/code#64).

Two secrets stay separate ([auth-and-permissions.md](auth-and-permissions.md)):

| Secret | Lives | Clients see it? |
|--------|-------|-----------------|
| Client API key | Hashed in `auth.keys_path`; plaintext only at issue/rotate | Yes (HTTP clients store their own key) |
| GitHub fine-grained PAT | Secure file or Keychain on the gateway host; operator vault | **Never** |

---

## A. Rotate or revoke a per-client API key (GitHub PAT unchanged)

Keys CLI: `scripts/issue-client-key.js` (Node 22; on the gateway host prefer `/path/to/node`).

Store path example: `/path/to/github-mcp-gateway-data/client-keys.json` (mode 600).

### Issue a new client

```bash
cd /path/to/konnectors/github-gateway
/path/to/node scripts/issue-client-key.js \
  --keys /path/to/github-mcp-gateway-data/client-keys.json \
  --id REPLACE_ME_client_id \
  --label "REPLACE_ME label"
```

Stdout: one JSON metadata line, then **one** plaintext key line. Copy into the client secret store immediately; do not commit or paste into chat.

### Rotate (same id, new plaintext)

```bash
/path/to/node scripts/issue-client-key.js \
  --keys /path/to/github-mcp-gateway-data/client-keys.json \
  --id REPLACE_ME_client_id \
  --rotate
```

1. Update the client config with the new plaintext.
2. Confirm `tools/list` / a read succeeds.
3. Old hash for that id is superseded by rotate — treat any cached old key as dead.
4. Restart the client host if it caches the Bearer token at process start.

No gateway LaunchAgent restart is required solely for key store changes if the process re-reads the store per request (current design verifies against the keys file on each HTTP auth). If an older build cached keys in memory, `./scripts/launchd-ctl.sh restart` (**host-operator OK** for production restarts).

### Revoke without replacing

```bash
/path/to/node scripts/issue-client-key.js \
  --keys /path/to/github-mcp-gateway-data/client-keys.json \
  --id REPLACE_ME_client_id \
  --revoke
```

Further HTTP calls with that key → 401 / revoked. Remove the key from client configs so hosts stop sending a dead secret.

### Grace / cutover tips

- Prefer **rotate + update client + confirm**, then drop old key material from password managers.
- Use **one id per product** so revoking `cursor-cloud` does not strand `claude-desktop`.
- Audit log records client **id**, not plaintext — use ids when correlating incidents.

---

## B. Rotate the GitHub PAT on the gateway host (clients unchanged)

Client MCP configs must **not** change when the PAT rotates. Only the gateway host’s token source changes.

### Prerequisites

- New fine-grained PAT created in GitHub (Issues + Pull requests + Contents as the operator vault already documents).
- Old PAT still valid until cutover succeeds (or accept brief outage).
- Access to operator vault + the gateway host filesystem/Keychain.
- **Never** put the new PAT in the repo, example configs, CI, PR text, or client `headers`.

### File-based token (`github.token_source = "file"`)

1. Write the new PAT to a **new** mode-600 file (or overwrite the existing token file in place after backup off-box in the vault only):

   ```bash
   # On the gateway host — operator only. Do not echo the token into shell history if avoidable.
   umask 077
   # paste/write token into the path from config github.token_file
   chmod 600 /path/to/github-mcp-gateway-data/REPLACE_ME_github-pat
   ```

2. Restart the gateway so it reloads the file:

   ```bash
   ./scripts/launchd-ctl.sh restart
   curl -sS http://127.0.0.1:8743/health
   ```

3. Smoke: from an on-tailnet client (or stdio on the gateway host), `github_issue_read` on a harmless allowlisted issue.
4. Revoke the **old** PAT in GitHub settings once smoke passes.
5. Update operator vault to the new PAT; destroy scratch copies.

### Keychain (`github.token_source = "keychain"`)

1. Update the Keychain item named by `github.keychain_service` / `github.keychain_account` (Keychain Access or `security` CLI) with the new PAT.
2. `./scripts/launchd-ctl.sh restart`
3. Smoke read as above; revoke old PAT in GitHub; update vault.

### What clients do

Nothing — they keep presenting the **client API key**. If tools fail after PAT rotate, fix the gateway host token load ([token-loading.md](token-loading.md)); do not “fix” by putting a PAT into MCP headers.

---

## C. Suspected leak

### Client API key may have leaked

1. `--revoke` that `--id` immediately (or `--rotate` and treat old plaintext as burned).
2. Issue a new id if the label/id itself was tied to a compromised channel.
3. Check `audit.path` for unexpected `client_id`, tools, repos, or `close_override` around the leak window.
4. Rotate anyway even if unsure — cheap compared to unauthorized closes.
5. Do **not** rotate the GitHub PAT unless you also believe the PAT leaked (separate secret).

### GitHub PAT may have leaked

1. Revoke/rotate the PAT in GitHub **first** (stops API abuse).
2. Install the replacement on the gateway host (section B); restart gateway.
3. Review GitHub audit / security log for the account.
4. Client API keys can stay unless the same incident exposed them.
5. Never “clean up” by committing a redacted token or discussing the live secret in chat.

### Both / unknown

Revoke PAT and revoke all client keys; re-issue keys per client; reinstall PAT on the gateway host; smoke test; update vault. Prefer short downtime over uncertain exposure.

---

## D. What never changes in git

- No PAT or client key plaintext in `config.example.toml`, docs, tests, or scripts defaults beyond `REPLACE_ME`.
- Rotation does **not** require a PR that contains secrets.
- Docs may describe steps; operators run them on the gateway host with vault material.

## Related

- [token-loading.md](token-loading.md)
- [auth-and-permissions.md](auth-and-permissions.md)
- [client-setup.md](client-setup.md)
- [troubleshooting.md](troubleshooting.md)
- [service.md](service.md) — restart semantics
