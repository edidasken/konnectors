#!/usr/bin/env node
/**
 * Konnectors local-files MCP bridge/adapter entry.
 *
 * Usage:
 *   LOCAL_FILES_ROOT=/path/to/root node server.mjs
 *   LOCAL_FILES_ROOT=/path/to/root LOCAL_FILES_HTTP=1 LOCAL_FILES_BEARER_TOKEN=... node server.mjs
 *
 * Configure only via environment variables / .env.example placeholders.
 * Never put secrets, hostnames, or personal paths in git.
 */
import {loadConfig} from './src/config.js';
import {createToolRunner} from './src/tools.js';
import {startStdio} from './src/transport/stdio.js';
import {startHttp} from './src/transport/http.js';

async function main() {
  const config = loadConfig(process.env);
  const tools = createToolRunner(config);

  if (config.http.enabled) {
    const http = await startHttp(config, tools);
    console.error(
      `konnectors-local-files http listening on ${config.http.bind}:${http.port} mcp=${config.http.basePath} health=/health`,
    );
    return;
  }

  await startStdio(config, tools);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
