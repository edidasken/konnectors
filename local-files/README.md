# local-files

Konnectors **local-files** MCP bridge/adapter: scoped filesystem tools over one or more configured roots, via **stdio** or **authenticated Streamable HTTP**.

This package is a portable bridge/adapter. Operators point it at directories they control; MCP clients never see host secrets beyond the per-server bearer they are issued.

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

## Shared MCP config (preferred)

Keep launch scripts and allowed-volume lists in one shared directory outside git — by default `~/code/mcp/`. Agents and client configs should reference the launch script only; they must not copy the volume list.

| File | Purpose |
|------|---------|
| `~/code/mcp/local-files-volumes.conf` | One absolute allowed root per line |
| `~/code/mcp/local-files.sh` | Launch script that runs this package |

Examples to copy and fill in (placeholders only):

- [`examples/local-files-volumes.conf.example`](examples/local-files-volumes.conf.example)
- [`examples/local-files.sh.example`](examples/local-files.sh.example)
- [`examples/cursor-mcp.stdio-shared.json`](examples/cursor-mcp.stdio-shared.json)

### Adding a volume

1. Append one absolute path line to `~/code/mcp/local-files-volumes.conf` (or the path in `LOCAL_FILES_VOLUMES_FILE`).
2. Restart the MCP server / launch script.

No client config edits are required.

## Configure

| Variable | Purpose |
|----------|---------|
| `LOCAL_FILES_VOLUMES_FILE` | Path to the shared volumes file (default `~/code/mcp/<LOCAL_FILES_SERVER_ID>-volumes.conf`) |
| `LOCAL_FILES_SERVER_ID` | Filename id for the default volumes file (default `local-files`) |
| `LOCAL_FILES_ROOT` | **Legacy fallback:** single allowed root when no volumes file is present |
| `LOCAL_FILES_HTTP` | `true` to enable HTTP (default stdio) |
| `LOCAL_FILES_BEARER_TOKEN` or `LOCAL_FILES_BEARER_TOKEN_FILE` | Required when HTTP is on |
| `LOCAL_FILES_BIND` / `LOCAL_FILES_PORT` / `LOCAL_FILES_BASE_PATH` | Listen settings (defaults `127.0.0.1`, `8792`, `/mcp`) |

Root resolution order:

1. Volumes file (when it exists and lists at least one path)
2. CLI `--allowed-directory` / positional directory args (legacy fallback)
3. `LOCAL_FILES_ROOT` (legacy single-root env fallback)

Prefer binding to loopback and reaching the process over a private network overlay. Public exposure is an explicit operator decision (`LOCAL_FILES_PUBLIC_EXPOSURE`).

## Run

Shared config (stdio):

```bash
# After copying the example volumes file + launch script under ~/code/mcp/
~/code/mcp/local-files.sh
```

Legacy single-root env:

```bash
export LOCAL_FILES_ROOT=/path/to/REPLACE_ME_allowed_root
node server.mjs
```

Legacy CLI args:

```bash
node server.mjs --allowed-directory /path/to/REPLACE_ME_allowed_root
```

HTTP:

```bash
export LOCAL_FILES_VOLUMES_FILE=/path/to/REPLACE_ME/code/mcp/local-files-volumes.conf
export LOCAL_FILES_HTTP=1
export LOCAL_FILES_BEARER_TOKEN_FILE=/path/to/REPLACE_ME_bearer_token_file
node server.mjs
```

- MCP: `POST` to `LOCAL_FILES_BASE_PATH` (default `/mcp`) with `Authorization: Bearer …`
- Health: `GET /health` (no secrets; unauthenticated liveness)

## Tools

| Tool | Role |
|------|------|
| `list_allowed_directories` | Show configured allowed roots |
| `list_directory` | Page directory entries (includes hidden) |
| `directory_tree` | Bounded recursive tree |
| `search_files` | Name search under a path |
| `get_file_info` / `set_file_info` | Metadata / mode / timestamps |
| `read_file` / `read_text_file` / `read_file_chunk` / `read_multiple_files` | Reads |
| `write_file` / `write_file_chunk` / `edit_file` / `truncate_file` | Writes |
| `create_directory` / `move_path` / `delete_path` | Tree changes (`delete_path` / `truncate_file` require matching `confirmPath`) |

Relative tool paths resolve under the first allowed root. Absolute paths must fall under one of the allowed roots. Symlinks that escape a root are refused. `move_path` stays within a single volume.

## Client examples

See [`examples/`](examples/) for Cursor (`~/.cursor/mcp.json` with `${env:VAR}` or a shared launch script) and Antigravity (`~/.gemini/config/mcp_config.json` via `npx mcp-remote`).

## Docs

- [docs/security.md](docs/security.md) — auth, root scoping, operator checklist
- [docs/tools.md](docs/tools.md) — tool notes

## License

MIT — see the repository root [LICENSE](../LICENSE).
