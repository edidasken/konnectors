/**
 * Authenticated Streamable HTTP transport.
 * API key required on MCP paths; /health is unauthenticated liveness (no secrets).
 * Shares tool implementation with stdio.
 */
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import {extractKeyFromHeader, verifyKey} from '../auth/keys.js';
import {createMcpServer} from '../mcp-server.js';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Unauthenticated liveness path — shape kept compatible with ticket 57 control plane. */
export const HEALTH_PATH = '/health';

const startedAt = Date.now();
const PACKAGE_VERSION = readPackageVersion();

/**
 * @param {ReturnType<import('../server-context.js').createGatewayContext>} ctx
 * @param {object} [opts]
 * @param {number} [opts.port]
 * @param {string} [opts.bind]
 */
export async function startHttpTransport(ctx, opts = {}) {
  const {config, tools, audit} = ctx;
  const bind = opts.bind ?? config.transport.http.bind;
  const port = opts.port ?? config.transport.http.port;
  const basePath = normalizePath(config.transport.http.base_path);

  /** @type {Map<string, {transport: StreamableHTTPServerTransport, clientId: string}>} */
  const sessions = new Map();

  const server = createServer(async (req, res) => {
    try {
      await handleRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'internal_error'}));
      }
      audit.log({
        client_id: 'unknown',
        tool: 'transport_http',
        outcome: 'error',
        error_class: 'HTTP_HANDLER',
        error: String(err && err.message ? err.message : err),
        transport: 'http',
      });
    }
  });

  async function handleRequest(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === HEALTH_PATH) {
      writeHealth(req, res, {
        bind,
        port: typeof server.address() === 'object' && server.address()
          ? /** @type {import('node:net').AddressInfo} */ (server.address()).port
          : port,
        basePath,
        sessionCount: sessions.size,
        publicExposure: config.transport.http.public_exposure,
      });
      return;
    }

    if (url.pathname !== basePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'not_found'}));
      return;
    }

    const headerName = config.auth.header.toLowerCase();
    const headerValue = /** @type {string|undefined} */ (req.headers[headerName]);
    const plaintext = extractKeyFromHeader(headerValue, config.auth.bearer_prefix);
    const verified = verifyKey(config.auth.keys_path, plaintext);
    if (!verified.ok) {
      audit.log({
        client_id: 'unknown',
        tool: 'transport_http',
        outcome: 'denied',
        error_class: 'UNAUTHENTICATED',
        error: verified.reason,
        transport: 'http',
      });
      res.writeHead(401, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'unauthorized', reason: verified.reason}));
      return;
    }

    const clientId = verified.clientId;

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const sessionId = /** @type {string|undefined} */ (req.headers['mcp-session-id']);

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId);
        await session.transport.handleRequest(req, res, body);
        return;
      }

      if (!sessionId && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          // JSON responses keep HTTP clients simple (no SSE required for request/response).
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            sessions.set(sid, {transport, clientId});
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        const mcp = createMcpServer(tools, {
          getClientId: () => clientId,
          transport: 'http',
        });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body);
        return;
      }

      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {code: -32000, message: 'Bad Request: No valid session ID provided'},
          id: null,
        }),
      );
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      const sessionId = /** @type {string|undefined} */ (req.headers['mcp-session-id']);
      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'invalid_session'}));
        return;
      }
      const session = sessions.get(sessionId);
      await session.transport.handleRequest(req, res);
      return;
    }

    res.writeHead(405, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'method_not_allowed'}));
  }

  await new Promise((resolve, reject) => {
    server.listen(port, bind, (err) => (err ? reject(err) : resolve()));
  });

  const address = server.address();
  return {
    server,
    bind,
    port: typeof address === 'object' && address ? address.port : port,
    basePath,
    healthPath: HEALTH_PATH,
    sessions,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/**
 * Liveness JSON for operators and the future control plane.
 * Never includes PAT, client keys, key paths, or token source details.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {object} info
 */
export function writeHealth(req, res, info) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {'Content-Type': 'application/json', Allow: 'GET, HEAD'});
    res.end(JSON.stringify({error: 'method_not_allowed'}));
    return;
  }
  const body = {
    ok: true,
    status: 'running',
    service: 'github-mcp-gateway',
    version: PACKAGE_VERSION,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    transport: 'http',
    // Non-secret listen metadata for operators / ticket 57 status probes.
    listen: {
      bind: info.bind,
      port: info.port,
      mcp_path: info.basePath,
      health_path: HEALTH_PATH,
      public_exposure: info.publicExposure ?? 'none',
    },
    sessions: typeof info.sessionCount === 'number' ? info.sessionCount : 0,
  };
  const json = JSON.stringify(body);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(json);
}

function normalizePath(p) {
  if (!p || p === '/') return '/mcp';
  return p.startsWith('/') ? p : `/${p}`;
}

function readPackageVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
