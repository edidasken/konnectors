#!/bin/bash
# Remove the GitHub MCP gateway LaunchAgent from the current user session.
# Does not delete the Services directory, config, token file, keys, or audit log.
# Run as the logged-in user on the gateway host — never root.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as the logged-in user on the gateway host, not root" >&2
  exit 1
fi

label="com.konnectors.github-mcp-gateway"
plist_dir="${GITHUB_MCP_GATEWAY_PLIST_DIR:-$HOME/Library/LaunchAgents}"
launchctl="${LAUNCHCTL:-launchctl}"
uid="$(id -u)"

"$launchctl" bootout "gui/$uid/$label" 2>/dev/null || true
rm -f "$plist_dir/$label.plist"
echo "removed LaunchAgent $label (Services data left in place)"
