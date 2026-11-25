# Threat model

Scope: the GitHub MCP gateway on **gateway host**, its clients, and the GitHub API it calls. This is a design document for ticket 54; implementation tickets must not weaken these mitigations without updating this file in the same PR.

## Assets

| Asset | Why it matters | Where it should live |
|-------|----------------|----------------------|
| GitHub fine-grained PAT | Issues/PR/Contents write on edidasken; steal = forge closes, comments, content writes | Host file (mode 600) or macOS Keychain; never repo, client config, logs, or UI |
| Client API keys | Authenticate remote MCP callers | Generated on host; **hashed** at rest; plaintext shown once at issue time only |
| Issue contents | Pastoral/private text may appear in some edidasken issues | GitHub; audit should avoid dumping full bodies by default |
| Audit logs | Forensics and abuse detection; may include metadata | Host path from config; retain per policy; no secrets |
| Allowlist config | Defines blast radius | Host config outside git (example only in repo) |
| launchd / process control | Start/stop the gateway | the gateway host user session; control page must not expose shell as root |

## Trust boundaries

```
[ GitHub API ]  ← PAT →  [ gateway process on the gateway host ]  ← API key / stdio →  [ MCP clients ]
                                    ↑
                              [ audit log / config / key store on disk ]
                                    ↑
                         [ Tailscale (default) | optional Funnel ]
                                    ↑
                    [ Cursor cloud VMs / off-tailnet agents — may be OUTSIDE ]
```

| Boundary | Trust assumption |
|----------|------------------|
| the gateway host | the operator’s machine; disk encryption and user account protect token files |
| Gateway process | Trusted code from this repo; only process that may read the PAT |
| Tailscale | Private network among the operator’s devices; identity for serve, not a substitute for API keys |
| Optional public exposure (Funnel, etc.) | **Untrusted Internet**. Not enabled by default. Requires the host operator's explicit decision |
| MCP clients (Cursor, Claude, etc.) | Semi-trusted operators; may be buggy or prompt-injected; never receive the PAT |
| Cursor cloud VMs | Off-tailnet unless something else bridges them; **may not reach** Tailscale-only HTTP |

### Explicit: MCP cannot override client approval prompts

The gateway can refuse tools server-side. It **cannot** force Cursor (or any host) to skip its own “approve tool” UI. Client auto-approval is entirely the client’s setting. Document this so operators do not assume “MCP auth = user already approved.”

### Explicit: Tailscale-only vs cloud agents

Cursor cloud agent VMs and other off-tailnet runners often **cannot** open connections to a Tailscale-only service on the gateway host. Options if remote cloud agents must call the gateway:

1. Run a local/stdio client somewhere already on the tailnet (not always possible for cloud VMs).
2. Ask the host operator to approve a carefully authenticated public exposure (for example Tailscale Funnel + API keys + allowlists).
3. Keep using a GitHub connector that already has network path (separate from this gateway).

**Any public exposure must not be enabled silently.** Ticket 56 may document how Funnel *could* be wired; enabling it is a **decision for the host operator**, recorded outside this design as an ops choice.

## Threats and mitigations

| ID | Threat | Mitigation |
|----|--------|------------|
| T1 | PAT leaked via git, PR, chat, or logs | Load only from secure file/Keychain; refuse config that embeds PAT; tests/docs use placeholders; audit redaction |
| T2 | Stolen client API key | Keys hashed at rest; per-client issuance; rotate/revoke; rate limits; audit by client id |
| T3 | Client asks for merge/push/admin | Action allowlist; tools.md forbids those operations; server returns error; audit |
| T4 | Client targets non-edidasken repo | Repository allowlist defaulting to edidasken only; reject before GitHub call |
| T5 | Close issue without merged PR (accidental or malicious) | Close verifies linked PR merged; override flag required otherwise; override always audit-logged |
| T6 | Prompt injection in issue text tricks a client into calling tools | Server-side allowlists still apply; close still needs merged PR or logged override; clients should keep approvals on for destructive-ish tools |
| T7 | Bind to `0.0.0.0` and expose LAN/Internet | Default Tailscale/localhost only; config review; Funnel off unless the host operator decides |
| T8 | Off-tailnet attacker hits Funnel URL | Only if Funnel enabled: TLS via Tailscale, API keys required, allowlists, rate limits, audit; still the host operator’s call to enable |
| T9 | Path traversal / reading token via control page | Control page never reads or displays PAT/key plaintext; only status and non-secret metadata |
| T10 | Tests or CI use real PAT | Mock GitHub in all automated tests; CI must not require vault access |
| T11 | Confused deputy: SERVER `/mcp` vs this gateway | Separate processes and tool names; docs state they are distinct |
| T12 | Log files world-readable | Audit path mode 600/640 under the operator’s data directory; umask documented in ticket 56 |

## Forbidden capabilities (security policy)

Even if GitHub’s PAT could technically do more, the gateway **must not** implement or proxy:

- Merge pull requests
- Delete repositories, branches, issues, or comments (beyond what v1 explicitly allows — v1 allows **no** deletes)
- Push git content or create commits via API
- Admin, organization, or collaborator changes
- Any GitHub write other than **issue comment** and **issue close** (with state_reason)

Read of issues (and of PR merge state needed to enforce close rules) is allowed. Contents read may be used only as needed to verify linked PRs; do not expose a general Contents write tool.

## Residual risks

- A compromised the gateway host user session can read the PAT file/Keychain item — same class of risk as other SERVER tokens on the host.
- A client with a valid API key and the client’s auto-approval can comment on/close allowlisted issues within policy (including override if the client sends it). Operational discipline on key issuance and client approval settings matters.
- Public Funnel, if ever enabled, expands the attack surface to anyone who can reach the URL and try keys; treat enablement as high impact.

## Decisions that require the host operator

Record and stop — do not silently do these in automation:

1. Install or replace the real GitHub PAT on the gateway host.
2. Enable Tailscale Funnel or any other public exposure.
3. Deploy/restart production services on the gateway host for this gateway without his OK (tickets 56–57).
