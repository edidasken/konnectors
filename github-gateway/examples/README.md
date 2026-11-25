# Example MCP client snippets

Placeholder-only configs for ticket **58**. Replace every `REPLACE_ME_*` locally. **Never** commit real client API keys or a GitHub PAT.

| File | Use |
|------|-----|
| [cursor-mcp.http.json](cursor-mcp.http.json) | Cursor (or similar) Streamable HTTP |
| [cursor-mcp.env.json](cursor-mcp.env.json) | Cursor HTTP using `${env:VAR}` (no raw tokens in the file) |
| [cursor-mcp.stdio.json](cursor-mcp.stdio.json) | Cursor / Claude-style stdio on the gateway host |
| [antigravity-mcp-remote.json](antigravity-mcp-remote.json) | Antigravity via `npx mcp-remote` + env vars |
| [generic-http.headers.txt](generic-http.headers.txt) | Header reminder for any HTTP MCP host |

Full guides: [../docs/client-setup.md](../docs/client-setup.md).
