/**
 * Register v1 tools on an MCP Server instance (shared by stdio + HTTP).
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';

/**
 * @param {ReturnType<import('./tools/index.js').createToolRunner>} toolRunner
 * @param {object} opts
 * @param {() => string} opts.getClientId
 * @param {string} opts.transport
 */
export function createMcpServer(toolRunner, {getClientId, transport}) {
  const server = new McpServer({
    name: 'github-mcp-gateway',
    version: '1.0.0',
  });

  const owner = z.string().min(1);
  const repo = z.string().min(1);
  const issueNumber = z.number().int().positive();

  server.tool(
    'github_issue_read',
    'Read a single GitHub issue (allowlisted edidasken repos).',
    {owner, repo, issue_number: issueNumber},
    async (args) => respond(toolRunner, 'github_issue_read', args, getClientId(), transport),
  );

  server.tool(
    'github_issue_comment',
    'Comment on a GitHub issue (allowlisted edidasken repos).',
    {
      owner,
      repo,
      issue_number: issueNumber,
      body: z.string().min(1).max(65536),
    },
    async (args) => respond(toolRunner, 'github_issue_comment', args, getClientId(), transport),
  );

  server.tool(
    'github_issue_close',
    'Close a GitHub issue with state_reason completed|not_planned. Requires a merged linked PR unless override_unmerged_pr is true (audit-logged).',
    {
      owner,
      repo,
      issue_number: issueNumber,
      state_reason: z.enum(['completed', 'not_planned']),
      override_unmerged_pr: z.boolean().optional(),
    },
    async (args) => respond(toolRunner, 'github_issue_close', args, getClientId(), transport),
  );

  return server;
}

async function respond(toolRunner, name, args, clientId, transport) {
  const result = await toolRunner.invoke({name, args, clientId, transport});
  if (result.ok) {
    return {
      content: [{type: 'text', text: JSON.stringify(result.data, null, 2)}],
    };
  }
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(result.error),
      },
    ],
  };
}
