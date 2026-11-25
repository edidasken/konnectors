# Test-Gap and CI Audit

Audit of `github-gateway/tests`, `local-files/tests`, and `.github/workflows/ci.yml` against documented behavior in each package's `README.md` and `docs/`.

## 1. CI Workflow (`.github/workflows/ci.yml`)

### What CI covers today
- **Triggers:** `push` to `main` and all `pull_request` events, with `permissions: contents: read`.
- **`github-gateway` job:** `ubuntu-latest`, Node 22 with npm cache (`github-gateway/package-lock.json`), `npm ci`, `chmod +x scripts/*.sh`, `npm test` (`node --test tests/*.test.mjs`).
- **`local-files` job:** `ubuntu-latest`, Node 22 with npm cache (`local-files/package-lock.json`), `npm ci`, `npm test` (`node --test tests/*.test.mjs`).

### CI gaps
- **No lint or typecheck step:** Neither `package.json` defines a `lint` or `typecheck` script, and `ci.yml` does not run ESLint, formatting checks, or `tsc --noEmit` (both packages use JSDoc annotations).
- **No repo-wide secret/personal-data scan:** `github-gateway/tests/design-skeleton.test.mjs` checks `github-gateway/` for GitHub token prefixes, but `local-files/` and root files have no automated scan in CI.
- **Linux-only runner:** macOS-specific paths (`keychain` token loading, `launchd` execution) are not exercised on `ubuntu-latest`.

---

## 2. `github-gateway` Test Gaps

Existing suite (`43` tests across 7 files) covers config validation, key issue/verify/rotate/revoke, rate limiter unit checks, allowlist denials, close-with-merged-PR & override auditing, `/health`, HTTP 401/initialize, control plane auth/registry/toggle/UI, and design-doc/service-artifact checks.

### Untested or partially tested documented behavior
- **Tool argument validation (`docs/tools.md`):**
  - `github_issue_comment`: empty/whitespace `body` rejection and 65,536-char cap *(added empty-body test in this PR)*.
  - `github_issue_close`: invalid `state_reason` rejection *(added in this PR)*; `override_unmerged_pr=true` when there are *no* linked PRs.
  - Missing `owner`/`repo` or invalid `issue_number` (`INVALID_ARGS`).
- **HTTP transport & auth (`docs/auth-and-permissions.md`, `docs/troubleshooting.md`):**
  - Full HTTP `tools/list` or `tools/call` round-trip after `initialize` (current test checks `initialize` over HTTP and `tools.invoke` directly).
  - Revoked key or malformed `Authorization` header (e.g. missing `Bearer `) returning `401` over HTTP.
  - Rate-limit enforcement through `tools.invoke` (error response + audit log entry).
- **Token loading failures (`docs/token-loading.md`):**
  - Missing token file, missing env var, or `token_source = "keychain"` on non-macOS failing fast.
- **Stdio & CLI scripts (`docs/architecture.md`, `docs/token-rotation.md`):**
  - `src/transport/stdio.js`, `src/mcp-server.js`, `scripts/issue-client-key.js`, and `scripts/set-control-password.js` have no direct CLI/stdio tests.

---

## 3. `local-files` Test Gaps

Existing suite (`16` tests across 4 files) covers required env/bearer config, `..` and symlink path-escape rejection, `/health` + unauthenticated `/mcp` 401 + `authorize()`, and basic `list_directory`, `read_file`, `search_files`, `edit_file`, `write_file`, `move_path`, `delete_path` (file), `read_file_chunk`/`write_file_chunk`, `create_directory`, and `directory_tree`.

### Untested or partially tested documented behavior
- **Documented tools (`README.md`, `docs/tools.md`):**
  - `list_allowed_directories`, `get_file_info`, `read_text_file` (including binary rejection), `read_multiple_files` *(added in this PR)*.
  - `truncate_file` with matching vs mismatched `confirmPath` *(added in this PR)*.
  - `delete_path` on a directory requiring `recursive=true` *(added in this PR)*.
  - `write_file` refusing to overwrite an existing file when `overwrite=false` *(added in this PR)*.
  - `set_file_info` (mode, `atime`, `mtime`), `read_file` binary (base64) & oversized-file error, `move_path` refusing to overwrite a directory destination, and `read_multiple_files` batch limits.
- **HTTP transport & config (`README.md`, `docs/security.md`):**
  - Authenticated `POST /mcp` (`Authorization: Bearer …`) initializing an MCP session or calling a tool.
  - `LOCAL_FILES_BASE_PATH`, `LOCAL_FILES_BIND`, and `LOCAL_FILES_PUBLIC_EXPOSURE` config handling.
- **Stdio & secret scan:**
  - `src/transport/stdio.js` and `src/mcp-server.js` have no direct tests.
  - No automated secret/placeholder check on `local-files/.env.example` and `local-files/examples/`.
