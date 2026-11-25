#!/usr/bin/env node
/**
 * GitHub MCP gateway entry (Node.js 22).
 * Loads config, GitHub token (file/Keychain), starts stdio and/or HTTP transports.
 *
 * Usage:
 *   node src/index.js --config /path/to/config.toml
 *   GITHUB_MCP_GATEWAY_CONFIG=/path/to/config.toml node src/index.js
 *
 * Runtime on the gateway host: /path/to/node-prefix (operator standard). On CI/cloud, use available Node 22.
 */
import {loadConfig} from './config.js';
import {createGatewayContext} from './server-context.js';
import {startStdioTransport} from './transport/stdio.js';
import {startHttpTransport} from './transport/http.js';

async function main() {
  const configPath = resolveConfigPath(process.argv.slice(2));
  if (!configPath) {
    console.error(
      'Usage: node src/index.js --config /path/to/config.toml\n' +
        'Or set GITHUB_MCP_GATEWAY_CONFIG. Config must live outside the git worktree.',
    );
    process.exit(2);
  }

  const config = loadConfig(configPath);
  const ctx = createGatewayContext(config);

  /** @type {Array<{close?: () => Promise<void>}>} */
  const handles = [];

  if (config.transport.http.enabled) {
    const http = await startHttpTransport(ctx);
    handles.push(http);
    console.error(
      `github-mcp-gateway HTTP listening on ${http.bind}:${http.port}${http.basePath}` +
        ` (health ${http.healthPath})`,
    );
  }

  if (config.transport.stdio.enabled) {
    await startStdioTransport(ctx);
    // stdio owns the process stdin/stdout; keep alive
  } else if (config.transport.http.enabled) {
    // HTTP-only: keep process alive until gateway host
    await new Promise(() => {});
  }

  const shutdown = async () => {
    for (const h of handles) {
      if (h.close) await h.close();
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function resolveConfigPath(argv) {
  const idx = argv.indexOf('--config');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  if (process.env.GITHUB_MCP_GATEWAY_CONFIG) {
    return process.env.GITHUB_MCP_GATEWAY_CONFIG;
  }
  return null;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
