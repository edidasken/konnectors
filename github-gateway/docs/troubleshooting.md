# Troubleshooting

Diagnose gateway failures without pasting secrets into chat or PRs. Ticket **58** (edidasken/code#64).

## Quick triage order

1. Is the process up? (`launchd-ctl.sh status`, `gateway.log`)
2. Does **local** health answer? (`curl -sS http://127.0.0.1:8743/health`)
3. Can **this client** reach that host? (tailnet vs cloud VM)
4. Is the client API key valid? (401 vs tool errors)
5. Is the repo/action allowlisted?
6. For close: is a linked PR merged?

Never paste `Authorization` headers, PAT file contents, or client key plaintext while debugging.

---

## Auth failures (HTTP)

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| **401** `unauthorized` / `missing_key` | No `Authorization` header, or wrong header name | Send `Authorization: Bearer <client-api-key>` (see `auth.header` / `bearer_prefix` in config) |
| **401** / `invalid_key` | Typo, truncated key, or key not in store | Re-issue or rotate with `scripts/issue-client-key.js`; update client config only |
| **401** / `revoked` | Key revoked | Issue a new key; remove the old one from clients |
| Client “works” on stdio but HTTP 401 | stdio does not require a key by default | Expected — HTTP always requires a hashed client key |

Gateway auth failures are **not** GitHub 401/403. The GitHub PAT never leaves the gateway host; clients never present it.

If GitHub itself returns 401/403 to the gateway (wrong/expired/missing PAT scopes), tool calls fail with a sanitized error. Fix the PAT on the gateway host ([token-rotation.md](token-rotation.md)); do not put a new PAT in the client.

---

## Allowlist denials

| Symptom | Cause | Fix |
|---------|-------|-----|
| Error mentioning allowlist / repository not allowed | `owner/repo` outside `allowlist.repositories` (default `edidasken/*`) | Use an edidasken repo, or change allowlist on the gateway host only after an explicit ticket — not in client config |
| Unknown / forbidden tool | Tool name not in v1 set or not in `allowlist.actions` | Only `github_issue_read`, `github_issue_comment`, `github_issue_close` |

Allowlist checks run **before** GitHub is called.

---

## Close refused — linked PR not merged

`github_issue_close` refuses when:

- Linked PRs exist and **none** are merged, or
- **No** linked PRs exist

…unless `override_unmerged_pr=true` (audited).

| Check | How |
|-------|-----|
| Issue ↔ PR link | Issue timeline / “Development” / closing keywords on the PR |
| PR merged? | GitHub shows merged; gateway uses timeline + pulls API |
| Wrong issue number | Confirm `owner`, `repo`, `issue_number` |
| Need override? | Only with operator intent; expect audit `close_override` |

This is distinct from auth failure: the client was allowed to call the tool; the **close policy** blocked it. See [tools.md](tools.md).

---

## Service down / unhealthy

On the gateway host:

```bash
cd /path/to/konnectors/github-gateway
./scripts/launchd-ctl.sh status
tail -n 80 /path/to/github-mcp-gateway-data/gateway.log
curl -sS http://127.0.0.1:8743/health
```

| Observation | Action |
|-------------|--------|
| LaunchAgent not loaded | `./scripts/install-launchd.sh` or `launchd-ctl.sh start` (**host-operator OK** if not already installed) |
| Process crash loop | Bad config, missing token file, Node path wrong — fix config; confirm `/path/to/node` |
| Health not ok / connection refused | Process not listening; check bind/port; restart after fix |
| Health ok locally, remote fails | Network path — see below |

Health must never show PAT or client keys. Shape is documented in [service.md](service.md).

Control plane (ticket 57) can show running / stopped / unhealthy without secrets — [control-page.md](control-page.md).

---

## Health endpoint

- Path: `/health` (not under `/mcp`)
- Auth: **none** (liveness only)
- Methods: `GET`, `HEAD`

```bash
curl -sS "http://127.0.0.1:8743/health"
```

If health works and `/mcp` returns 401, the service is up — fix the client key. If neither works remotely but local health works, fix Tailscale / serve / DNS — not the PAT.

---

## Client cannot reach the gateway host

| Client location | Expected |
|-----------------|----------|
| On the operator’s private tailnet (desktop, another Mac, phone with Tailscale) | Should reach MagicDNS / `100.x` after serve or Tailscale bind |
| Cursor **cloud** VM / off-tailnet CI | **Often cannot** open Tailscale-only addresses |
| Public Internet without Funnel | **Cannot** — by design |

### Checklist before asking the host operator for Funnel

1. Confirm local `curl` health on the gateway host succeeds.
2. From another **on-tailnet** device, curl health (and optionally MCP with a test key).
3. Confirm the failing client is actually off-tailnet (cloud agent, hotel Wi‑Fi without Tailscale, etc.).
4. Read [service.md](service.md) “Off-tailnet cloud agents” and [threat-model.md](threat-model.md).

**Do not enable Funnel or bind `0.0.0.0` from a coding agent.** Funnel / public exposure is a **host-operator decision**. Ticket 58 does not enable it. Workarounds without Funnel: run the MCP client on-tailnet; have the host operator close on the gateway host; use stdio on the gateway host.

---

## Client still shows an approval form

Expected. MCP cannot override host UI. Options:

- Use the product’s auto-approve / always-allow for the three tools only ([client-setup.md](client-setup.md))
- Confirm manually for that close
- Record in verification that unattended close is **not** available on that client

Do not treat an approval form as a gateway outage.

---

## Rate limits

Repeated `rate_limited` / similar errors: wait or raise limits in host config on the gateway host (`rate_limit.*`). Closes have a separate per-client hourly cap. Do not bypass by sharing one key across many robots without intending shared quotas.

---

## Related

- [client-setup.md](client-setup.md)
- [token-rotation.md](token-rotation.md)
- [verification.md](verification.md)
- [auth-and-permissions.md](auth-and-permissions.md)
