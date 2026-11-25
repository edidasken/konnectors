/**
 * stdio MCP transport. Local process trust; optional key via env when configured.
 */
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {verifyKey} from '../auth/keys.js';
import {createMcpServer} from '../mcp-server.js';

/**
 * @param {ReturnType<import('../server-context.js').createGatewayContext>} ctx
 */
export async function startStdioTransport(ctx) {
  const {config, tools, audit} = ctx;
  let clientId = 'stdio-local';

  if (config.auth.stdio_require_key) {
    const key = process.env.GITHUB_MCP_GATEWAY_CLIENT_KEY;
    const verified = verifyKey(config.auth.keys_path, key);
    if (!verified.ok) {
      audit.log({
        client_id: 'unknown',
        tool: 'transport_stdio',
        outcome: 'denied',
        error_class: verified.reason,
        transport: 'stdio',
      });
      throw new Error(`stdio auth failed: ${verified.reason}`);
    }
    clientId = verified.clientId;
  }

  const server = createMcpServer(tools, {
    getClientId: () => clientId,
    transport: 'stdio',
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return {server, transport, clientId};
}
