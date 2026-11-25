/**
 * Authenticated Streamable HTTP transport.
 * Bearer token required on MCP paths; /health is unauthenticated liveness (no secrets).
 */
import {createServer} from 'node:http';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {isInitializeRequest} from '@modelcontextprotocol/sdk/types.js';
import {createMcpServer} from '../mcp-server.js';

export const HEALTH_PATH = '/health';
const startedAt = Date.now();

/**
 * @param {ReturnType<import('../config.js').loadConfig>} config
 * @param {ReturnType<import('../tools.js').createToolRunner>} tools
 */
export async function startHttp(config, tools) {
  const bind = config.http.bind;
  const port = config.http.port;
  const basePath = config.http.basePath;
  const expected = config.http.bearer;
  const version = readVersion();

  /** @type {Map<string, {transport: StreamableHTTPServerTransport}>} */
  const sessions = new Map();

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'internal_error'}));
      }
    }
  });

  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === HEALTH_PATH) {
      writeHealth(req, res, {
        bind,
        port: listenPort(server, port),
        basePath,
        sessionCount: sessions.size,
        publicExposure: config.http.publicExposure,
        version,
        service: config.serverName,
      });
      return;
    }

    if (url.pathname !== basePath) {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'not_found'}));
      return;
    }

    if (!authorize(req, expected)) {
      res.writeHead(401, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'unauthorized'}));
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const sessionId = /** @type {string|undefined} */ (req.headers['mcp-session-id']);

      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId).transport.handleRequest(req, res, body);
        return;
      }

      if (!sessionId && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            sessions.set(sid, {transport});
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        const mcp = createMcpServer(tools, {name: config.serverName, version});
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
      await sessions.get(sessionId).transport.handleRequest(req, res);
      return;
    }

    res.writeHead(405, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'method_not_allowed'}));
  }

  await new Promise((resolve, reject) => {
    server.listen(port, bind, (err) => (err ? reject(err) : resolve()));
  });

  return {
    server,
    port: listenPort(server, port),
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
 * @param {import('node:http').IncomingMessage} req
 * @param {string} expected
 */
export function authorize(req, expected) {
  const header = /** @type {string|undefined} */ (req.headers.authorization);
  if (!header || !expected) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  const got = Buffer.from(m[1]);
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  try {
    return timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

export function writeHealth(req, res, info) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {'Content-Type': 'application/json', Allow: 'GET, HEAD'});
    res.end(JSON.stringify({error: 'method_not_allowed'}));
    return;
  }
  const body = {
    ok: true,
    status: 'running',
    service: info.service || 'konnectors-local-files',
    version: info.version || '0.2.0',
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    transport: 'http',
    listen: {
      bind: info.bind,
      port: info.port,
      mcp_path: info.basePath,
      health_path: HEALTH_PATH,
      public_exposure: info.publicExposure || 'none',
    },
    sessions: typeof info.sessionCount === 'number' ? info.sessionCount : 0,
  };
  const json = JSON.stringify(body);
  res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  res.end(json);
}

function listenPort(server, fallback) {
  const address = server.address();
  return typeof address === 'object' && address ? address.port : fallback;
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

function readVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.2.0';
  } catch {
    return '0.2.0';
  }
}
