#!/bin/bash
# Install the GitHub MCP gateway LaunchAgent definition for the gateway host.
# Ships with the repo; run on the gateway host only when the host operator approves install (ticket 56).
# Does NOT enable Tailscale Funnel, write a PAT, or start against a missing config.
#
# Usage (as the logged-in user on the gateway host — never root):
#   github-gateway/scripts/install-launchd.sh
#   GITHUB_MCP_GATEWAY_SKIP_START=1 github-gateway/scripts/install-launchd.sh   # copy plist only
#
# Runtime: /path/to/node-prefix (bin/node). Do not use Homebrew node.
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as the logged-in user on the gateway host, not root" >&2
  exit 1
fi

gateway_root="$(cd "$(dirname "$0")/.." && pwd)"
label="com.konnectors.github-mcp-gateway"
# operator standard Node 22 prefix on the gateway host (set GITHUB_MCP_GATEWAY_NODE_PREFIX to your Node 22 prefix).
node_prefix="${GITHUB_MCP_GATEWAY_NODE_PREFIX:-/path/to/node-prefix}"
node_bin="${GITHUB_MCP_GATEWAY_NODE_BIN:-$node_prefix/bin/node}"
prefix="${GITHUB_MCP_GATEWAY_PREFIX:-/path/to/github-mcp-gateway-data}"
config="${GITHUB_MCP_GATEWAY_CONFIG:-$prefix/config.toml}"
plist_dir="${GITHUB_MCP_GATEWAY_PLIST_DIR:-$HOME/Library/LaunchAgents}"
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
  echo "Copy github-gateway/config.example.toml to $config, fill REPLACE_ME paths," >&2
  echo "set http.enabled=true and http.public_exposure=tailscale (or bind + serve), then retry." >&2
  echo "Installing the real GitHub PAT is a host-operator decision — do not invent one here." >&2
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
if [ "${GITHUB_MCP_GATEWAY_SKIP_START:-}" = "1" ]; then
  echo "plist installed at $plist_dir/$label.plist (start skipped)"
  echo "node: $node_bin"
  echo "config: $config"
  exit 0
fi

"$launchctl" bootout "gui/$uid/$label" 2>/dev/null || true
"$launchctl" bootstrap "gui/$uid" "$plist_dir/$label.plist"
echo "github-mcp-gateway LaunchAgent installed and started"
echo "label: $label"
echo "node: $node_bin"
echo "config: $config"
echo "logs: $prefix/gateway.log"
echo "health: curl -s http://127.0.0.1:8743/health   # adjust host/port to config"
echo "Funnel/public exposure is NOT enabled by this script (host-operator decision)."
