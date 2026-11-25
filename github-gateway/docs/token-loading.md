# GitHub token loading (ticket 55)

The gateway loads The operator’s fine-grained PAT **only on the host process**. Clients never see it. This document matches `src/github/token.js` and `config.example.toml`.

## Sources

| `github.token_source` | How | When to use |
|----------------------|-----|-------------|
| `file` | Read and trim `github.token_file` (absolute path, mode 600, **outside** the git worktree) | Default on the gateway host |
| `keychain` | macOS Keychain via `security find-generic-password -s <service> -a <account> -w` using `keychain_service` / `keychain_account` | Optional on the gateway host (darwin only) |
| `env` | Read `process.env[github.token_env]` | **Tests and local mocks only** — never put the real PAT in CI env for this suite |

## File layout (example on the gateway host)

```
/path/to/github-mcp-gateway-data/
  config.toml          # copy of config.example.toml with real paths
  github-pat           # mode 600; contents = PAT only; NOT in git
  client-keys.json     # hashed client API keys; mode 600
  audit.jsonl          # structured audit
```

`config.toml` may only **point at** the token file (or Keychain names). It must not contain `ghp_`, `github_pat_`, or `ghs_` strings — validation rejects those.

## Keychain (macOS / the gateway host)

```bash
# Example only — the host operator installs the real secret (decision for the host operator).
security add-generic-password -s edidasken-github-mcp-gateway -a github-pat -w
```

Then in config:

```toml
[github]
token_source = "keychain"
keychain_service = "edidasken-github-mcp-gateway"
keychain_account = "github-pat"
```

On Linux CI/cloud VMs, `keychain` fails fast with a clear error; use `file` or `env` for mocks.

## What this ticket does **not** do

- Does **not** install the real PAT on the gateway host (host-operator decision).
- Does **not** commit, log, or ask for the PAT.
- Tests use a placeholder file or `token_source = "env"` with a fake string — never a live GitHub call.

## Failure behavior

If the token cannot be loaded at startup, the process exits non-zero and does not serve tools.
