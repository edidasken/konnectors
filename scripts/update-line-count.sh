#!/usr/bin/env bash
# Update docs/LINE-COUNT.md from cloc totals (code lines only).
# Direct-to-main write-back: CI commits with [skip ci] when counts change.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

summary_file=""
check_only=0

usage() {
  cat <<'EOF'
Usage: scripts/update-line-count.sh [--summary-file <path>] [--check]

  --summary-file <path>  Write a Markdown summary table (e.g. $GITHUB_STEP_SUMMARY).
  --check                Exit non-zero if docs/LINE-COUNT.md is stale (ignores Date/Commit).
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --summary-file)
      if [[ $# -lt 2 ]]; then
        echo "error: --summary-file requires a path" >&2
        exit 2
      fi
      summary_file="$2"
      shift 2
      ;;
    --check)
      check_only=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v cloc >/dev/null 2>&1; then
  echo "error: cloc not found on PATH" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found on PATH" >&2
  exit 1
fi

tmpdir="$(mktemp -d "${RUNNER_TEMP:-/tmp}/line-count.XXXXXX")"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

cloc_json="$tmpdir/cloc.json"
cloc_txt="$tmpdir/cloc.txt"
new_md="$tmpdir/LINE-COUNT.md"

# Directory names matched anywhere in the tree (aligned with server/stronger).
exclude_dir="node_modules,.git,vendor,dist,build,out,coverage,backups,media,images,fonts,icons,assets,lyrics,target,public-site"
not_match_f='(\.min\.(js|css)$|\.webmanifest$|(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|go\.sum|Cargo\.lock|composer\.lock|poetry\.lock|Gemfile\.lock)$)'
exclude_ext="json,png,jpg,jpeg,gif,webp,avif,svg,ico,woff,woff2,ttf,otf,mp3,mp4,wav,webm,pdf"

run_cloc() {
  cloc . \
    --exclude-dir="$exclude_dir" \
    --fullpath \
    --not-match-f="$not_match_f" \
    --exclude-ext="$exclude_ext" \
    --force-lang='HTML,tmpl' \
    --quiet \
    "$@"
}

run_cloc --json >"$cloc_json"
run_cloc >"$cloc_txt"

commit="${GITHUB_SHA:-}"
if [[ -z "$commit" ]]; then
  commit="$(git rev-parse HEAD 2>/dev/null || true)"
fi
if [[ -z "$commit" ]]; then
  commit="unknown"
fi
commit="${commit:0:12}"
export LINE_COUNT_COMMIT="$commit"
export LINE_COUNT_JSON="$cloc_json"
export LINE_COUNT_OUT="$new_md"

python3 <<'PY'
import json
import os
from datetime import datetime, timezone
from pathlib import Path

data = json.loads(Path(os.environ["LINE_COUNT_JSON"]).read_text())
langs = [
    (name, data[name]["nFiles"], data[name]["code"])
    for name in data
    if name not in ("header", "SUM")
]
langs.sort(key=lambda row: (-row[2], row[0].lower()))
total = data["SUM"]
html = data.get("HTML", {"nFiles": 0, "code": 0})
date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
commit = os.environ["LINE_COUNT_COMMIT"]

rows = "\n".join(f"| {name} | {nfiles} | {code} |" for name, nfiles, code in langs)
lines = [
    "# Line counts",
    "",
    "Automatic `cloc` totals for this repo (code lines only: blanks and comments excluded).",
    "",
    f"- **Date:** {date} (UTC)",
    f"- **Commit:** `{commit}`",
    "",
    "## By language",
    "",
    "| Language | Files | Code |",
    "|----------|------:|-----:|",
    rows,
    f"| **Total** | **{total['nFiles']}** | **{total['code']}** |",
    f"| HTML (`.html` + `.tmpl`) | {html['nFiles']} | {html['code']} |",
    "",
    "Excludes: `.git`, `node_modules`, `vendor`, `dist`, `build`, `out`, `coverage`, `backups`, `media`, `images`, `fonts`, `icons`, `assets`, `lyrics`, `target`, `public-site`, minified `*.min.js`/`*.min.css`, lockfiles, JSON content, and common binary/media extensions.",
    "",
    "Updated by `.github/workflows/line-count.yml` on push to `main` (and `workflow_dispatch`). Commits use `[skip ci]` so the count write-back does not loop.",
]
Path(os.environ["LINE_COUNT_OUT"]).write_text("\n".join(lines) + "\n")
print(f"total_files={total['nFiles']}")
print(f"total_code={total['code']}")
print(f"html_files={html['nFiles']}")
print(f"html_code={html['code']}")
PY

normalize_md() {
  sed -E '/^- \*\*(Date|Commit):\*\*/d' "$1"
}

dest="docs/LINE-COUNT.md"
mkdir -p docs

if [[ -f "$dest" ]]; then
  if cmp -s <(normalize_md "$new_md") <(normalize_md "$dest"); then
    if [[ "$check_only" -eq 1 ]]; then
      echo "docs/LINE-COUNT.md is up to date (totals unchanged)."
      exit 0
    fi
    echo "No count changes; leaving docs/LINE-COUNT.md unchanged."
  else
    if [[ "$check_only" -eq 1 ]]; then
      echo "docs/LINE-COUNT.md is stale (totals differ)." >&2
      exit 1
    fi
    cp "$new_md" "$dest"
    echo "Updated $dest"
  fi
else
  if [[ "$check_only" -eq 1 ]]; then
    echo "docs/LINE-COUNT.md is missing." >&2
    exit 1
  fi
  cp "$new_md" "$dest"
  echo "Wrote $dest"
fi

if [[ -n "$summary_file" ]]; then
  {
    echo "## Line counts"
    echo ""
    echo '```'
    cat "$cloc_txt"
    echo '```'
  } >"$summary_file"
  echo "Wrote summary to $summary_file"
fi
