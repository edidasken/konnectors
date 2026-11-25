/**
 * Stdio MCP transport for local clients.
 */
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from '../mcp-server.js';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * @param {ReturnType<import('../config.js').loadConfig>} config
 * @param {ReturnType<import('../tools.js').createToolRunner>} tools
 */
export async function startStdio(config, tools) {
  const mcp = createMcpServer(tools, {
    name: config.serverName,
    version: readVersion(),
  });
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  return {transport};
}

function readVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.2.0';
  } catch {
    return '0.2.0';
  }
}
