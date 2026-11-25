#!/usr/bin/env node
/**
 * Issue (or rotate) a per-client API key. Prints plaintext once to stdout.
 * Stores only the hash in auth.keys_path.
 *
 * Usage:
 *   node scripts/issue-client-key.js --keys /path/to/client-keys.json --id my-client [--label "Cursor"]
 *   node scripts/issue-client-key.js --keys ... --id my-client --rotate
 *   node scripts/issue-client-key.js --keys ... --id my-client --revoke
 */
import {issueKey, rotateKey, revokeKey} from '../src/auth/keys.js';

function usage() {
  console.error(
    'Usage:\n' +
      '  node scripts/issue-client-key.js --keys <path> [--id <id>] [--label <label>]\n' +
      '  node scripts/issue-client-key.js --keys <path> --id <id> --rotate\n' +
      '  node scripts/issue-client-key.js --keys <path> --id <id> --revoke',
  );
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main() {
  const argv = process.argv.slice(2);
  const keysPath = arg(argv, '--keys');
  if (!keysPath) {
    usage();
    process.exit(2);
  }
  const id = arg(argv, '--id');
  const label = arg(argv, '--label');

  if (argv.includes('--revoke')) {
    if (!id) {
      console.error('--revoke requires --id');
      process.exit(2);
    }
    const result = revokeKey({keysPath, id});
    console.log(JSON.stringify({revoked: true, ...result}));
    return;
  }

  if (argv.includes('--rotate')) {
    if (!id) {
      console.error('--rotate requires --id');
      process.exit(2);
    }
    const result = rotateKey({keysPath, id, label});
    console.log(JSON.stringify({rotated: true, id: result.id, label: result.label}));
    console.log(result.plaintext);
    return;
  }

  const result = issueKey({keysPath, id, label});
  console.log(JSON.stringify({issued: true, id: result.id, label: result.label}));
  console.log(result.plaintext);
}

main();
