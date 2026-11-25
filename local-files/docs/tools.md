# Tools

All paths are relative to `LOCAL_FILES_ROOT` (use `""` or omit for the root itself where optional).

## Reads

- `list_allowed_directories` — returns the configured root marker.
- `list_directory` / `directory_tree` / `search_files` — bounded listing; use `limit` / `offset` / `depth`.
- `read_file` — UTF-8 or base64 for binary; oversized files must use `read_file_chunk`.
- `read_text_file` — UTF-8 only (compatibility).
- `read_file_chunk` — base64 slice with `offset` + `length`.
- `read_multiple_files` — batch UTF-8 reads.

## Writes

- `write_file` — create/replace; existing files need `overwrite=true`.
- `write_file_chunk` — base64 write at offset (creates file; does not truncate tail).
- `edit_file` — replace exactly one occurrence of `oldText`.
- `truncate_file` — set size; requires matching `confirmPath`.
- `create_directory` — `mkdir -p` under the root.
- `move_path` — rename/move; directory destinations cannot be overwritten.
- `delete_path` — requires matching `confirmPath`; directories need `recursive=true`.
