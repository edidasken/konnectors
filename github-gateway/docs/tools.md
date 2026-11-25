# v1 tools

Only these MCP tools ship in v1. Names below are the design target for ticket 55; if MCP host naming rules force a rename, keep the same semantics and update this file in the same PR.

## Tool list

### 1. `github_issue_read`

**Purpose:** Read a single issue (title, body, state, labels, HTML URL, and linked PR references when available).

| Argument | Type | Required | Notes |
|----------|------|----------|-------|
| `owner` | string | yes | Must pass repository allowlist with `repo` |
| `repo` | string | yes | |
| `issue_number` | number | yes | |

**GitHub:** `GET /repos/{owner}/{repo}/issues/{issue_number}` (and PR linkage lookup as needed).

**Errors:** not allowlisted; not found; GitHub/API failure (no PAT in error text).

---

### 2. `github_issue_comment`

**Purpose:** Add a comment on an issue.

| Argument | Type | Required | Notes |
|----------|------|----------|-------|
| `owner` | string | yes | Allowlisted |
| `repo` | string | yes | |
| `issue_number` | number | yes | |
| `body` | string | yes | Non-empty; size-capped in implementation |

**GitHub:** `POST /repos/{owner}/{repo}/issues/{issue_number}/comments`.

**Audit:** client id, owner/repo, issue number, comment created (id), outcome.

---

### 3. `github_issue_close`

**Purpose:** Close an issue with a GitHub `state_reason` of `completed` or `not_planned`.

| Argument | Type | Required | Notes |
|----------|------|----------|-------|
| `owner` | string | yes | Allowlisted |
| `repo` | string | yes | |
| `issue_number` | number | yes | |
| `state_reason` | string | yes | Exactly `completed` or `not_planned` |
| `override_unmerged_pr` | boolean | no | Default `false`. If `true`, skip merged-PR check and **must** be audit-logged |

**GitHub:** `PATCH /repos/{owner}/{repo}/issues/{issue_number}` with `state=closed` and `state_reason`.

## Close-with-merged-PR rule

Before closing when `override_unmerged_pr` is false or omitted:

1. Resolve PRs linked to the issue via the issue **timeline** API (`GET …/issues/{n}/timeline`), collecting `cross-referenced` events whose source is a pull request, then `GET …/pulls/{n}` for `merged` / `merged_at`.
2. If **at least one** linked PR is **merged**, allow close.
3. If there are linked PRs and **none** are merged, **refuse** close with a clear error.
4. If there are **no** linked PRs, **refuse** close unless `override_unmerged_pr=true` (agents should not close bare issues by accident after a “merge” workflow).

When `override_unmerged_pr=true`:

- Perform the close if otherwise authorized.
- Write an audit event that includes `close_override: true`, client id, owner/repo, issue number, and timestamp.
- Do not hide overrides from the audit log or control-page summaries (summaries may count overrides; they still must not show secrets).

## Forbidden actions (v1)

The server must **not** expose tools — and must **not** call GitHub APIs — for:

| Forbidden | Examples |
|-----------|----------|
| Merge | Merge PR, rebase-merge, squash-merge |
| Delete | Delete repo, branch, issue, comment, release |
| Push | Create commit, upload tree, force-push, Contents **write** |
| Admin | Add collaborator, change permissions, org admin, webhook admin |
| Other writes | Labels-only mutations as standalone tools, project boards, Actions dispatch, Packages, etc. |

Issue **comment** and issue **close** (with `state_reason`) are the only writes. Reads are limited to what those tools and the merged-PR check need.

If a client requests an unknown tool name, return MCP “method/tool not found” (or equivalent) and audit the attempt when identifiable.

## Out of scope for later tickets in this series

Tickets 55–58 implement and operate **this** v1 surface. Expanding tools requires a new ticket and an update to this file, the action allowlist, and the threat model.
