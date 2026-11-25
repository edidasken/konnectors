# `scripts/`

| Script | Ticket | Purpose |
|--------|--------|---------|
| `issue-client-key.js` | 55 | Issue / rotate / revoke hashed client API keys (plaintext printed once) |
| `install-launchd.sh` | 56 | Install gateway LaunchAgent using `/path/to/node-prefix` (host-operator OK before run on the gateway host) |
| `uninstall-launchd.sh` | 56 | Remove gateway LaunchAgent; leave Services data alone |
| `launchd-ctl.sh` | 56 | Gateway `start` / `stop` / `restart` / `status` |
| `set-control-password.js` | 57 | Set scrypt-hashed operator password for the control page |
| `install-control-launchd.sh` | 57 | Install control-plane LaunchAgent (host-operator OK before run on the gateway host) |
| `control-ctl.sh` | 57 | Control plane `start` / `stop` / `restart` / `status` |

Client setup and verification for ticket **58** are documentation + [../examples/](../examples/) (no new scripts). Live two-client / e2e close on the gateway host: [../docs/verification.md](../docs/verification.md).

Do **not** enable Funnel from these scripts. See [../docs/service.md](../docs/service.md) and [../docs/control-page.md](../docs/control-page.md).

Example (paths outside the repo):

```bash
node scripts/issue-client-key.js \
  --keys /path/to/github-mcp-gateway-data/client-keys.json \
  --id cursor-local \
  --label "Cursor on the gateway host"
```
