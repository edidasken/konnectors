#!/bin/bash
# start | stop | restart | status for com.konnectors.mcp-control-plane
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "run as the logged-in user on the gateway host, not root" >&2
  exit 1
fi

cmd="${1:-}"
label="com.konnectors.mcp-control-plane"
plist_dir="${MCP_CONTROL_PLIST_DIR:-$HOME/Library/LaunchAgents}"
plist="$plist_dir/$label.plist"
launchctl="${LAUNCHCTL:-launchctl}"
uid="$(id -u)"
domain="gui/$uid"

usage() {
  echo "Usage: $0 {start|stop|restart|status}" >&2
  exit 2
}

case "$cmd" in
  start)
    if [ ! -f "$plist" ]; then
      echo "missing $plist — run scripts/install-control-launchd.sh first" >&2
      exit 1
    fi
    "$launchctl" bootstrap "$domain" "$plist" 2>/dev/null || \
      "$launchctl" kickstart -k "$domain/$label"
    echo "started $label"
    ;;
  stop)
    "$launchctl" bootout "$domain/$label" 2>/dev/null || true
    echo "stopped $label"
    ;;
  restart)
    if [ -f "$plist" ]; then
      "$launchctl" kickstart -k "$domain/$label" 2>/dev/null || {
        "$launchctl" bootout "$domain/$label" 2>/dev/null || true
        "$launchctl" bootstrap "$domain" "$plist"
      }
    else
      echo "missing $plist — run scripts/install-control-launchd.sh first" >&2
      exit 1
    fi
    echo "restarted $label"
    ;;
  status)
    "$launchctl" print "$domain/$label" 2>/dev/null || {
      echo "$label is not loaded"
      exit 1
    }
    ;;
  *)
    usage
    ;;
esac
