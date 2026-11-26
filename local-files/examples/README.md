# Example MCP client snippets

Placeholder-only configs. Replace every `REPLACE_ME_*` / `${env:VAR}` locally. **Never** commit real bearer tokens, hostnames, or personal paths.

| File | Use |
|------|-----|
| [local-files-volumes.conf.example](local-files-volumes.conf.example) | Shared allowed-volume list (copy to `~/code/mcp/`) |
| [local-files.sh.example](local-files.sh.example) | Shared launch script (copy to `~/code/mcp/`) |
| [cursor-mcp.stdio-shared.json](cursor-mcp.stdio-shared.json) | Cursor stdio pointing at the shared launch script |
| [cursor-mcp.http.json](cursor-mcp.http.json) | Cursor Streamable HTTP with `${env:VAR}` |
| [cursor-mcp.stdio.json](cursor-mcp.stdio.json) | Cursor local stdio with legacy `LOCAL_FILES_ROOT` |
| [antigravity-mcp-remote.json](antigravity-mcp-remote.json) | Antigravity via `npx mcp-remote` |

Prefer the shared `~/code/mcp/` launch script + volumes file so clients never embed volume paths. Set `LOCAL_FILES_MCP_URL` (for example `http://127.0.0.1:8792/mcp`) and `LOCAL_FILES_MCP_BEARER` in the environment for HTTP examples — not in the JSON file.
