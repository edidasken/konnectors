#!/usr/bin/env node
/**
 * Konnectors local-files MCP bridge/adapter entry.
 *
 * Preferred: point MCP clients at a launch script under ~/code/mcp/ that sets
 * LOCAL_FILES_VOLUMES_FILE (or relies on the default ~/code/mcp/<id>-volumes.conf).
 *
 * Fallbacks (existing installs):
 *   LOCAL_FILES_ROOT=/path/to/root node server.mjs
 *   node server.mjs --allowed-directory /path/to/root
 *
 * Never put secrets, hostnames, or personal paths in git.
 */
import {loadConfig} from './src/config.js';
import {createToolRunner} from './src/tools.js';
import {startStdio} from './src/transport/stdio.js';
import {startHttp} from './src/transport/http.js';

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const config = loadConfig(process.env, argv);
  const tools = createToolRunner(config);

  if (config.http.enabled) {
    const http = await startHttp(config, tools);
    console.error(
      `konnectors-local-files http listening on ${config.http.bind}:${http.port} mcp=${config.http.basePath} health=/health roots=${config.roots.length}`,
    );
    return;
  }

  await startStdio(config, tools);
}

function printHelp() {
  console.error(`konnectors-local-files — scoped filesystem MCP bridge/adapter

Roots (first match wins):
  1. Volumes file: LOCAL_FILES_VOLUMES_FILE or ~/code/mcp/<server-id>-volumes.conf
  2. CLI:          --allowed-directory <path>  (repeatable; positional dirs also work)
  3. Env:          LOCAL_FILES_ROOT=<path>

Options:
  --volumes-file <path>     Explicit volumes.conf path
  --server-id <id>          Default volumes filename id (default: local-files)
  --allowed-directory, -d   Legacy allowed root (repeatable)
  --help, -h                Show this help

Add a volume: append one absolute path line to the volumes file, then restart.
`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
