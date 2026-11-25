/**
 * HTTP control plane: Tailscale-oriented bind, own sign-in, server list + toggles.
 * Unauthenticated HTML/API (except login form POST) is rejected with 401.
 */
import {createServer} from 'node:http';
import {
  verifyPasswordFile,
  createSession,
  verifySession,
  revokeSession,
  parseSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from './auth.js';
import {loadRegistry} from './registry.js';
import {buildAllStatuses} from './status.js';
import {toggleServer} from './toggle.js';
import {renderPage} from './ui.js';

/**
 * @param {object} opts
 * @param {ReturnType<import('./config.js').loadControlConfig>} opts.config
 * @param {{log: Function}} opts.audit
 * @param {object} [opts.deps] test doubles
 */
export async function startControlServer(opts) {
  const {config, audit} = opts;
  const deps = opts.deps || {};
  const bind = config.listen.bind;
  const port = config.listen.port;

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, {'Content-Type': 'text/plain; charset=utf-8'});
        res.end('internal_error');
      }
      audit.log({
        event: 'control_http_error',
        outcome: 'error',
        error: String(err && err.message ? err.message : err).slice(0, 200),
      });
    }
  });

  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    if (path === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
      const body = JSON.stringify({
        ok: true,
        status: 'running',
        service: 'mcp-control-plane',
        public_exposure: config.listen.public_exposure,
      });
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      res.end(body);
      return;
    }

    if (path === '/login' && req.method === 'POST') {
      await handleLogin(req, res);
      return;
    }

    const session = readSession(req);
    if (!session.ok) {
      if (path === '/' && req.method === 'GET') {
        html(res, 401, renderPage({signedIn: false, error: 'Sign in required'}));
        return;
      }
      if (wantsHtml(req)) {
        html(res, 401, renderPage({signedIn: false, error: 'Sign in required'}));
        return;
      }
      json(res, 401, {error: 'unauthorized'});
      return;
    }

    if (path === '/logout' && req.method === 'POST') {
      revokeSession(config.auth.sessions_path, session.token);
      audit.log({event: 'control_logout', who: session.who, outcome: 'ok'});
      res.writeHead(303, {
        Location: '/',
        'Set-Cookie': clearSessionCookieHeader(config.auth.cookie_name),
      });
      res.end();
      return;
    }

    if (path === '/toggle' && req.method === 'POST') {
      await handleToggle(req, res, session);
      return;
    }

    if (path === '/api/servers' && req.method === 'GET') {
      const servers = await listStatuses();
      assertNoSecrets(servers);
      json(res, 200, {servers});
      return;
    }

    if (path === '/' && req.method === 'GET') {
      const servers = await listStatuses();
      assertNoSecrets(servers);
      html(
        res,
        200,
        renderPage({
          signedIn: true,
          who: session.who,
          servers,
          flash: url.searchParams.get('flash') || undefined,
          error: url.searchParams.get('error') || undefined,
        }),
      );
      return;
    }

    json(res, 404, {error: 'not_found'});
  }

  async function handleLogin(req, res) {
    const body = await readForm(req);
    const password = body.password || '';
    const verified = verifyPasswordFile(config.auth.password_path, password);
    if (!verified.ok) {
      audit.log({
        event: 'control_login',
        outcome: 'denied',
        reason: verified.reason,
      });
      html(res, 401, renderPage({signedIn: false, error: 'Sign in failed'}));
      return;
    }
    const sess = createSession(config.auth.sessions_path, {
      who: 'operator',
      ttlHours: config.auth.session_ttl_hours,
    });
    audit.log({event: 'control_login', who: sess.who, outcome: 'ok'});
    const secure = config.listen.public_exposure !== 'none';
    res.writeHead(303, {
      Location: '/?flash=Signed%20in',
      'Set-Cookie': sessionCookieHeader(
        config.auth.cookie_name,
        sess.token,
        sess.expires_at,
        {secure},
      ),
    });
    res.end();
  }

  async function handleToggle(req, res, session) {
    const body = await readForm(req);
    const id = body.id;
    const desired = body.desired;
    const registry = loadRegistry(config.registry.path);
    const server = registry.servers.find((s) => s.id === id);
    if (!server) {
      redirect(res, '/?error=Unknown%20server');
      return;
    }
    if (desired !== 'on' && desired !== 'off') {
      redirect(res, '/?error=Bad%20toggle');
      return;
    }
    const result = toggleServer(server, desired, {
      who: session.who,
      audit,
      runner: deps.toggleRunner,
    });
    if (!result.ok) {
      redirect(res, `/?error=${encodeURIComponent(result.detail || 'toggle_failed')}`);
      return;
    }
    redirect(
      res,
      `/?flash=${encodeURIComponent(`${server.display_name} ${desired === 'on' ? 'started' : 'stopped'}`)}`,
    );
  }

  function readSession(req) {
    const token = parseSessionCookie(req.headers.cookie, config.auth.cookie_name);
    const verified = verifySession(config.auth.sessions_path, token);
    if (!verified.ok) return {ok: false};
    return {ok: true, token, who: verified.who};
  }

  async function listStatuses() {
    const registry = loadRegistry(config.registry.path);
    return buildAllStatuses(registry.servers, {
      fetchImpl: deps.fetchImpl,
      launchdStatus: deps.launchdStatus,
    });
  }

  await new Promise((resolve, reject) => {
    server.listen(port, bind, (err) => (err ? reject(err) : resolve()));
  });

  const address = server.address();
  return {
    server,
    bind,
    port: typeof address === 'object' && address ? address.port : port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') || !accept.includes('application/json');
}

function html(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function json(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function redirect(res, location) {
  res.writeHead(303, {Location: location});
  res.end();
}

function readForm(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const params = new URLSearchParams(raw);
      const out = {};
      for (const [k, v] of params.entries()) out[k] = v;
      resolve(out);
    });
    req.on('error', reject);
  });
}

/** Defense in depth: refuse to serialize anything that looks like a secret. */
export function assertNoSecrets(payload) {
  const text = JSON.stringify(payload);
  if (/\bgh[pousr]_[A-Za-z0-9_]{10,}\b/.test(text) || /\bgithub_pat_[A-Za-z0-9_]{10,}\b/.test(text)) {
    throw new Error('refusing to render payload that looks like a GitHub token');
  }
  if (/"password"\s*:\s*"[^"]+"/i.test(text) && !/"password_path"/i.test(text)) {
    throw new Error('refusing to render payload that looks like a password value');
  }
}
