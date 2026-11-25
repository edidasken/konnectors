# Example MCP client snippets

Placeholder-only configs. Replace every `REPLACE_ME_*` / `${env:VAR}` locally. **Never** commit real bearer tokens, hostnames, or personal paths.

| File | Use |
|------|-----|
| [cursor-mcp.http.json](cursor-mcp.http.json) | Cursor Streamable HTTP with `${env:VAR}` |
| [cursor-mcp.stdio.json](cursor-mcp.stdio.json) | Cursor local stdio |
| [antigravity-mcp-remote.json](antigravity-mcp-remote.json) | Antigravity via `npx mcp-remote` |

Set `LOCAL_FILES_MCP_URL` (for example `http://127.0.0.1:8792/mcp`) and `LOCAL_FILES_MCP_BEARER` in the environment — not in the JSON file.
