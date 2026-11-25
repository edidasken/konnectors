# Verification record (ticket 58)

edidasken/code#64 — client docs + proof the gateway works from real MCP hosts when they can reach the gateway host.

**Environment of this coding agent:** Cursor cloud VM **without** Tailscale/the gateway host access. Funnel / public exposure was **not** enabled. Live two-client MCP and live e2e issue close against the gateway host **cannot** be executed from this VM; those steps are owned by the host operator on an on-tailnet machine (below). Automated tests with **mocked** GitHub ran in CI / this PR and do not use The operator’s PAT.

---

## A. What this PR verified in-cloud (no live the gateway host)

| Check | Result | Notes |
|-------|--------|-------|
| `npm test` in `github-gateway` (mocked GitHub) | Pass when run in PR / local Node 22 | No real PAT; see package tests |
| Design / docs skeleton tests | Pass | Client docs present; no committed secrets |
| Reach Tailscale-only gateway on the gateway host from this cloud VM | **Failed / not possible** | No Tailscale interface; cannot open `REPLACE_ME_gateway_host.example.ts.net` or `100.x` listeners |
| Enable Funnel to unblock cloud | **Not done** | Explicitly out of scope; host-operator-only decision ([service.md](service.md)) |
| Live `github_issue_close` via gateway from cloud | **Not attempted** | Would require reachability or Funnel |

### Cloud reachability failure (honest)

Cursor cloud agents (including this VM) typically sit **off** the operator’s private tailnet. The gateway’s supported remote path is Tailscale-only HTTP (or stdio on a host that already has the PAT). Therefore:

- Health and `/mcp` from this cloud environment are expected to fail with network errors (timeout / NXDOMAIN / no route), not with gateway application bugs.
- Closing `edidasken/code` issues through this gateway from a cloud agent remains blocked until either (1) the agent runs on-tailnet, (2) the host operator enables a deliberate exposure path (e.g. Funnel) **with** client keys still required, or (3) an on-tailnet operator/client performs the close.

This is the same limit documented in ticket 56 ([service.md](service.md) “Off-tailnet cloud agents”). Ticket 58 does **not** change that boundary.

---

## B. the host operator — live verification on the gateway host (required for acceptance)

Run these on **gateway host** or another machine **on the tailnet**. Do not paste keys or the PAT into chat.

### B0. Prerequisites (series end — if not already done)

From tickets 54–57; short exact list:

1. Node 22 at `/path/to/node-prefix` (`/path/to/node -v`).
2. Config + secrets dir: `/path/to/github-mcp-gateway-data/` (mode 700), `config.toml` from `config.example.toml`.
3. Install GitHub PAT into the configured file or Keychain (**vault → the gateway host only**).
4. Issue at least two client keys, e.g. `--id cursor-desktop` and `--id claude-code` (or `vscode`).
5. `http.enabled = true`, `public_exposure = "tailscale"`, bind `127.0.0.1` (or Tailscale IP); **not** Funnel.
6. `./scripts/install-launchd.sh` then `./scripts/launchd-ctl.sh status`.
7. Optional: `tailscale serve` to the gateway port ([service.md](service.md)).
8. `curl -sS http://127.0.0.1:8743/health` → `"ok": true`.

### B1. Two different MCP clients (success criteria)

Pick **any two** from: Cursor desktop, Claude Code, Claude Desktop, VS Code, Antigravity/Gemini, or a generic SDK/http client. Configure per [client-setup.md](client-setup.md) with placeholders replaced locally.

For **each** client:

1. Connect to the gateway (stdio on the gateway host **or** HTTP with Bearer client key).
2. Confirm `tools/list` (or UI equivalent) shows:
   - `github_issue_read`
   - `github_issue_comment`
   - `github_issue_close`
3. Call `github_issue_read` on a known allowlisted issue (e.g. a throwaway or already-public issue in `edidasken/code`).
4. Note whether the host showed an **approval prompt**. If yes, and the product supports auto-approve for those three tools only, optionally enable it and re-test — MCP cannot override the prompt itself.

Record results in the table at the bottom of this file (operator fill-in).

### B2. End-to-end close through the gateway (throwaway issue only)

**Do not close unrelated open tickets.** Use a throwaway test issue.

1. Create a throwaway issue on `edidasken/code` (title e.g. `gateway-e2e-test-do-not-keep`).
2. Open a tiny PR that references it (or link via timeline / Development), merge that PR to `main` (or the repo default).
3. From an **on-tailnet** MCP client that passed B1 (Cursor desktop preferred if cloud cannot reach the gateway host), call:

   - `github_issue_close` with `owner=edidasken`, `repo=code`, `issue_number=<throwaway>`, `state_reason=completed`
   - Leave `override_unmerged_pr` false/omitted so the merged-PR rule is exercised.

4. Confirm the issue is **closed** on GitHub with reason completed.
5. Confirm audit log on the gateway host has a close event for that client id (**no** secrets in the line).
6. If the client required a manual approval click, note that — still counts as e2e through the gateway; unattended is a separate per-client checkbox.

### B3. Optional negative checks

- Close before merge → refused.
- HTTP without Bearer → 401.
- Off-tailnet cloud curl to MagicDNS → fail (documents Funnel decision still pending).

---

## C. Operator results (fill in on the gateway host)

_Leave placeholders until the host operator runs B1–B2. Do not invent live successes._

| Item | Result | Date (America/Los_Angeles) | Operator |
|------|--------|------------------------------|----------|
| Client 1 name + transport (stdio / HTTP) | REPLACE_ME | REPLACE_ME | REPLACE_ME |
| Client 1 `tools/list` + read | REPLACE_ME | | |
| Client 1 approval prompt? auto-approve used? | REPLACE_ME | | |
| Client 2 name + transport | REPLACE_ME | | |
| Client 2 `tools/list` + read | REPLACE_ME | | |
| Throwaway issue number | REPLACE_ME | | |
| Linked PR number + merged? | REPLACE_ME | | |
| `github_issue_close` via gateway | REPLACE_ME | | |
| Cloud reachability re-check | Expected fail without Funnel / tailnet | | |

---

## D. Series-end host-operator decision / step list (54–58)

Agents completed in-repo design, server, launchd definitions, control page, and client docs. **Machine and network steps remain the host operator:**

1. **PAT on the gateway host** — copy from vault to mode-600 file or Keychain; never into git/chat.
2. **Client keys** — issue per client; store plaintext only in client secret stores.
3. **Install / restart LaunchAgents** — gateway (`install-launchd.sh` / `launchd-ctl.sh`) and control plane if desired (`install-control-launchd.sh` / `control-ctl.sh`).
4. **Tailscale** — keep Tailscale-only; optional `tailscale serve` to loopback ports; **do not** enable Funnel unless the host operator explicitly decides after reading [threat-model.md](threat-model.md).
5. **Live verify** — complete section B tables above (two clients + throwaway e2e close).
6. **Cloud agents** — until Funnel or another exposure path exists, do not expect Cursor cloud VMs to close issues through this gateway; use on-tailnet clients or operator close after merge.
7. **Rotation** — follow [token-rotation.md](token-rotation.md) when keys or PAT change.

## Related

- [client-setup.md](client-setup.md)
- [troubleshooting.md](troubleshooting.md)
- [token-rotation.md](token-rotation.md)
- [service.md](service.md)
- [control-page.md](control-page.md)
