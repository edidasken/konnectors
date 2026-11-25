/**
 * Register local-files tools on an MCP Server (stdio + HTTP share this).
 */
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';

/**
 * @param {ReturnType<import('./tools.js').createToolRunner>} toolRunner
 * @param {{name?: string, version?: string}} [meta]
 */
export function createMcpServer(toolRunner, meta = {}) {
  const server = new McpServer({
    name: meta.name || 'konnectors-local-files',
    version: meta.version || '0.2.0',
  });

  const path = z.string();
  const optPath = z.string().optional();
  const optInt = z.number().int().optional();

  server.tool(
    'list_allowed_directories',
    'Show the one allowed filesystem root.',
    {},
    async () => respond(toolRunner, 'list_allowed_directories', {}),
  );

  server.tool(
    'list_directory',
    'List entries in a directory, including hidden files. Use limit and offset to page.',
    {path: optPath, limit: optInt, offset: optInt},
    async (args) => respond(toolRunner, 'list_directory', args),
  );

  server.tool(
    'directory_tree',
    'Return a recursive tree including hidden entries. Set depth and limit to page large trees.',
    {path: optPath, depth: optInt, limit: optInt, offset: optInt},
    async (args) => respond(toolRunner, 'directory_tree', args),
  );

  server.tool(
    'search_files',
    'Search file and directory names beneath a path, including hidden entries.',
    {
      query: z.string().min(1),
      path: optPath,
      maxDepth: optInt,
      limit: optInt,
    },
    async (args) => respond(toolRunner, 'search_files', args),
  );

  server.tool(
    'get_file_info',
    'Return file or directory type, size, permissions, owner IDs, timestamps, and inode metadata.',
    {path},
    async (args) => respond(toolRunner, 'get_file_info', args),
  );

  server.tool(
    'set_file_info',
    'Change POSIX permissions and/or access and modification timestamps.',
    {
      path,
      mode: optInt,
      atime: z.string().optional(),
      mtime: z.string().optional(),
    },
    async (args) => respond(toolRunner, 'set_file_info', args),
  );

  server.tool(
    'read_file',
    'Read UTF-8 text, or return binary as base64. Large files are rejected; use read_file_chunk.',
    {path},
    async (args) => respond(toolRunner, 'read_file', args),
  );

  server.tool(
    'read_text_file',
    'Read a UTF-8 text file. Binary files and oversized files are rejected. Compatibility alias.',
    {path},
    async (args) => respond(toolRunner, 'read_text_file', args),
  );

  server.tool(
    'read_file_chunk',
    'Read any file in bounded binary chunks (base64). Provide byte offset and length.',
    {
      path,
      offset: z.number().int().min(0),
      length: z.number().int().min(1),
    },
    async (args) => respond(toolRunner, 'read_file_chunk', args),
  );

  server.tool(
    'read_multiple_files',
    'Read several UTF-8 text files in one call. Binary files are rejected.',
    {paths: z.array(z.string()).min(1).max(50)},
    async (args) => respond(toolRunner, 'read_multiple_files', args),
  );

  server.tool(
    'write_file',
    'Create or replace a file. Existing files require overwrite=true. Use encoding=base64 for binary.',
    {
      path,
      content: z.string(),
      encoding: z.enum(['utf8', 'base64']).optional(),
      overwrite: z.boolean().optional(),
    },
    async (args) => respond(toolRunner, 'write_file', args),
  );

  server.tool(
    'write_file_chunk',
    'Write a base64 chunk at a byte offset. Creates a missing file; does not truncate trailing bytes.',
    {
      path,
      offset: z.number().int().min(0),
      content: z.string().min(1),
    },
    async (args) => respond(toolRunner, 'write_file_chunk', args),
  );

  server.tool(
    'edit_file',
    'Replace one exact UTF-8 text occurrence in an existing file. Fails if missing or duplicated.',
    {path, oldText: z.string(), newText: z.string()},
    async (args) => respond(toolRunner, 'edit_file', args),
  );

  server.tool(
    'truncate_file',
    'Set a regular file to an exact byte size, including zero. Must repeat path in confirmPath.',
    {
      path,
      confirmPath: z.string(),
      size: z.number().int().min(0),
    },
    async (args) => respond(toolRunner, 'truncate_file', args),
  );

  server.tool(
    'create_directory',
    'Create a directory and missing parents beneath the allowed root.',
    {path},
    async (args) => respond(toolRunner, 'create_directory', args),
  );

  server.tool(
    'move_path',
    'Move a file or directory within the allowed root. Existing destinations require overwrite=true; directory replacement is refused.',
    {
      from: z.string(),
      to: z.string(),
      overwrite: z.boolean().optional(),
    },
    async (args) => respond(toolRunner, 'move_path', args),
  );

  server.tool(
    'delete_path',
    'Permanently delete a file or directory within the allowed root. Must repeat path in confirmPath; recursive=true required for directories.',
    {
      path,
      confirmPath: z.string(),
      recursive: z.boolean().optional(),
    },
    async (args) => respond(toolRunner, 'delete_path', args),
  );

  return server;
}

async function respond(toolRunner, name, args) {
  const result = await toolRunner.invoke({name, args});
  if (result.ok) {
    return {content: [{type: 'text', text: JSON.stringify(result.data, null, 2)}]};
  }
  return {
    isError: true,
    content: [{type: 'text', text: JSON.stringify(result.error)}],
  };
}
