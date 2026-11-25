#!/bin/bash
# Install the MCP control-plane LaunchAgent for the gateway host (ticket 57).
# Run on the gateway host only when the host operator approves install. Does NOT enable Funnel or write a password.
#
# Usage (logged-in user on the gateway host — never root):
#   github-gateway/scripts/install-control-launchd.sh
#   MCP_CONTROL_SKIP_START=1 github-gateway/scripts/install-control-launchd.sh
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as the logged-in user on the gateway host, not root" >&2
  exit 1
fi

gateway_root="$(cd "$(dirname "$0")/.." && pwd)"
label="com.konnectors.mcp-control-plane"
node_prefix="${MCP_CONTROL_NODE_PREFIX:-/path/to/node-prefix}"
node_bin="${MCP_CONTROL_NODE_BIN:-$node_prefix/bin/node}"
prefix="${MCP_CONTROL_PREFIX:-/path/to/mcp-control-plane-data}"
config="${MCP_CONTROL_CONFIG:-$prefix/config.toml}"
plist_dir="${MCP_CONTROL_PLIST_DIR:-$HOME/Library/LaunchAgents}"
launchctl="${LAUNCHCTL:-launchctl}"
plist_src="$gateway_root/launchd/$label.plist"

if [ ! -x "$node_bin" ] && [ ! -f "$node_bin" ]; then
  echo "missing Node binary at $node_bin (expected Node prefix $node_prefix — not Homebrew)" >&2
  exit 1
fi
if [ ! -f "$plist_src" ]; then
  echo "missing plist template $plist_src" >&2
  exit 1
fi
if [ ! -f "$config" ]; then
  echo "missing config $config" >&2
  echo "Copy github-gateway/control/config.example.toml and registry.example.toml," >&2
  echo "set a password with scripts/set-control-password.js, then retry." >&2
  exit 1
fi

mkdir -p "$prefix" "$plist_dir"
chmod 700 "$prefix" 2>/dev/null || true

tmp="$(mktemp)"
sed \
  -e "s#__NODE_BIN__#$node_bin#g" \
  -e "s#__GATEWAY_ROOT__#$gateway_root#g" \
  -e "s#__CONFIG__#$config#g" \
  -e "s#__PREFIX__#$prefix#g" \
  "$plist_src" > "$tmp"

if command -v plutil >/dev/null 2>&1; then
  plutil -lint "$tmp" >/dev/null
fi

cp "$tmp" "$plist_dir/$label.plist"
rm -f "$tmp"
chmod 644 "$plist_dir/$label.plist"

uid="$(id -u)"
if [ "${MCP_CONTROL_SKIP_START:-}" = "1" ]; then
  echo "plist installed at $plist_dir/$label.plist (start skipped)"
  exit 0
fi

"$launchctl" bootout "gui/$uid/$label" 2>/dev/null || true
"$launchctl" bootstrap "gui/$uid" "$plist_dir/$label.plist"
echo "mcp-control-plane LaunchAgent installed and started"
echo "label: $label"
echo "config: $config"
echo "logs: $prefix/control.log"
echo "Funnel/public exposure is NOT enabled by this script (host-operator decision)."
