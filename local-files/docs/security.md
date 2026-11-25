# local-files security

## Assets

| Asset | Where it should live |
|-------|----------------------|
| Filesystem root contents | Only under `LOCAL_FILES_ROOT` on the operator host |
| HTTP bearer token | Env or mode-600 file **outside** git |
| Audit / process logs | Operator host; never commit |

## Mitigations

1. **Single root.** All tool paths resolve under `LOCAL_FILES_ROOT`. `..` and symlink escapes are rejected.
2. **HTTP bearer.** MCP paths require `Authorization: Bearer …` (timing-safe compare). `/health` is liveness only and never echoes the token.
3. **Destructive confirms.** `delete_path` and `truncate_file` require `confirmPath` to match `path` exactly. Directory deletes need `recursive=true`.
4. **No secrets in git.** Use `.env.example` placeholders only.
5. **Network default.** Prefer `127.0.0.1` (or private overlay). Public exposure is off by default and is an operator decision.

## Operator checklist

- [ ] Root directory is intentional and not a home-directory dump of personal data meant for git
- [ ] Bearer token is random, stored mode 600, rotated when clients leave
- [ ] Clients use `${env:VAR}` — no raw tokens in `mcp.json`
- [ ] Health endpoint checked without pasting tokens into chat or tickets
