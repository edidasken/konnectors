# local-files security

## Assets

| Asset | Where it should live |
|-------|----------------------|
| Allowed filesystem roots | Shared volumes file outside git (default `~/code/mcp/<id>-volumes.conf`), or legacy `LOCAL_FILES_ROOT` / CLI |
| Launch script | Shared MCP config dir outside git (for example `~/code/mcp/local-files.sh`) |
| HTTP bearer token | Env or mode-600 file **outside** git |
| Audit / process logs | Operator host; never commit |

## Mitigations

1. **Allowed roots.** All tool paths resolve under the configured roots from the volumes file (preferred) or legacy CLI/env fallbacks. `..` and symlink escapes are rejected. Cross-volume `move_path` is refused.
2. **HTTP bearer.** MCP paths require `Authorization: Bearer …` (timing-safe compare). `/health` is liveness only and never echoes the token.
3. **Destructive confirms.** `delete_path` and `truncate_file` require `confirmPath` to match `path` exactly. Directory deletes need `recursive=true`.
4. **No secrets in git.** Use `.env.example` and `*.example` placeholders only. Machine-specific volumes lists and launch scripts stay outside the repo.
5. **Network default.** Prefer `127.0.0.1` (or private overlay). Public exposure is off by default and is an operator decision.

## Operator checklist

- [ ] Volumes file / roots are intentional and not a home-directory dump of personal data meant for git
- [ ] MCP clients reference the shared launch script only (no copied volume lists in `mcp.json`)
- [ ] Bearer token is random, stored mode 600, rotated when clients leave
- [ ] Clients use `${env:VAR}` — no raw tokens in `mcp.json`
- [ ] Health endpoint checked without pasting tokens into chat or tickets
