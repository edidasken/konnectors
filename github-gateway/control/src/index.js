#!/usr/bin/env node
/**
 * MCP control plane entry (ticket 57 / edidasken/code#63).
 * Usage: node control/src/index.js --config /path/to/mcp-control-plane-data/config.toml
 */
import {loadControlConfig} from './config.js';
import {createControlAudit} from './audit.js';
import {startControlServer} from './server.js';

async function main() {
  const configPath = parseConfigArg(process.argv);
  if (!configPath) {
    console.error('Usage: node control/src/index.js --config /path/to/config.toml');
    process.exit(2);
  }
  const config = loadControlConfig(configPath);
  if (config.listen.public_exposure === 'funnel') {
    console.error('Funnel is a host-operator decision and must not be started from this ticket.');
    process.exit(1);
  }
  const audit = createControlAudit({path: config.audit.path});
  const http = await startControlServer({config, audit});
  console.error(
    `mcp-control-plane listening on http://${http.bind}:${http.port}/ (exposure=${config.listen.public_exposure})`,
  );
}

function parseConfigArg(argv) {
  const idx = argv.indexOf('--config');
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  if (process.env.MCP_CONTROL_CONFIG) return process.env.MCP_CONTROL_CONFIG;
  return null;
}

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
