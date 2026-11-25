# local-files

Konnectors **local-files** MCP bridge/adapter: scoped filesystem tools for one configured root, over **stdio** or **authenticated Streamable HTTP**.

This package is a portable bridge/adapter. Operators point it at a directory they control; MCP clients never see host secrets beyond the per-server bearer they are issued.

## Strict rule

Nothing personal or sensitive ever goes in this repository: no secrets, tokens, keys, hostnames, machine names, personal paths, personal emails, or other personal data. Configure with environment variables and [`.env.example`](.env.example) only.

## Requirements

- Node.js 22+

## Install

```bash
cd local-files
npm install
npm test
```

## Configure

Copy [`.env.example`](.env.example) outside the repo (or export the same variables). Required:

| Variable | Purpose |
|----------|---------|
| `LOCAL_FILES_ROOT` | Absolute path to the **single** allowed filesystem root |
| `LOCAL_FILES_HTTP` | `true` to enable HTTP (default stdio) |
| `LOCAL_FILES_BEARER_TOKEN` or `LOCAL_FILES_BEARER_TOKEN_FILE` | Required when HTTP is on |
| `LOCAL_FILES_BIND` / `LOCAL_FILES_PORT` / `LOCAL_FILES_BASE_PATH` | Listen settings (defaults `127.0.0.1`, `8792`, `/mcp`) |

Prefer binding to loopback and reaching the process over a private network overlay. Public exposure is an explicit operator decision (`LOCAL_FILES_PUBLIC_EXPOSURE`).

## Run

Stdio (local MCP clients):

```bash
export LOCAL_FILES_ROOT=/path/to/REPLACE_ME_allowed_root
node server.mjs
```

HTTP:

```bash
export LOCAL_FILES_ROOT=/path/to/REPLACE_ME_allowed_root
export LOCAL_FILES_HTTP=1
export LOCAL_FILES_BEARER_TOKEN_FILE=/path/to/REPLACE_ME_bearer_token_file
node server.mjs
```

- MCP: `POST` to `LOCAL_FILES_BASE_PATH` (default `/mcp`) with `Authorization: Bearer …`
- Health: `GET /health` (no secrets; unauthenticated liveness)

## Tools

| Tool | Role |
|------|------|
| `list_allowed_directories` | Show the one allowed root |
| `list_directory` | Page directory entries (includes hidden) |
| `directory_tree` | Bounded recursive tree |
| `search_files` | Name search under a path |
| `get_file_info` / `set_file_info` | Metadata / mode / timestamps |
| `read_file` / `read_text_file` / `read_file_chunk` / `read_multiple_files` | Reads |
| `write_file` / `write_file_chunk` / `edit_file` / `truncate_file` | Writes |
| `create_directory` / `move_path` / `delete_path` | Tree changes (`delete_path` / `truncate_file` require matching `confirmPath`) |

Paths in tool arguments are **relative to** `LOCAL_FILES_ROOT`. Symlinks that escape the root are refused.

## Client examples

See [`examples/`](examples/) for Cursor (`~/.cursor/mcp.json` with `${env:VAR}`) and Antigravity (`~/.gemini/config/mcp_config.json` via `npx mcp-remote`).

## Docs

- [docs/security.md](docs/security.md) — auth, root scoping, operator checklist
- [docs/tools.md](docs/tools.md) — tool notes

## License

MIT — see the repository root [LICENSE](../LICENSE).
