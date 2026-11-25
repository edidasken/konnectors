#!/usr/bin/env node
/**
 * Set / rotate the MCP control-plane operator password (hashed at rest).
 * Prints nothing sensitive except confirmation. Password via prompt env or argv once.
 *
 *   node scripts/set-control-password.js --password-file /path/to/mcp-control-plane-data/password.json
 *
 * Prefer piping:  MCP_CONTROL_PASSWORD='...' node scripts/set-control-password.js --password-file ...
 * Never commit the password file or paste the password into chat/PRs.
 */
import {setPasswordFile} from '../control/src/auth.js';

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const passwordPath = arg('--password-file') || process.env.MCP_CONTROL_PASSWORD_FILE;
const password = process.env.MCP_CONTROL_PASSWORD || arg('--password');

if (!passwordPath) {
  console.error('Usage: MCP_CONTROL_PASSWORD=... node scripts/set-control-password.js --password-file PATH');
  process.exit(2);
}
if (!password) {
  console.error('Set MCP_CONTROL_PASSWORD in the environment (not committed).');
  process.exit(2);
}

const result = setPasswordFile(passwordPath, password);
console.log(`control password updated at ${passwordPath} (${result.updated_at})`);
console.log('plaintext was not written to disk; only the scrypt hash is stored.');
