/**
 * Build per-server status for the control page (no secrets).
 */
import {existsSync, readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse as parseToml} from 'smol-toml';
import {summarizeServerAudit} from './audit.js';

/**
 * @param {import('./registry.js').validateRegistry extends Function ? any : never} server
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {(unit:string)=> {running:boolean, detail:string}} [opts.launchdStatus]
 */
export async function buildServerStatus(server, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const launchdStatus = opts.launchdStatus || defaultLaunchdStatus;

  const meta = readServerMeta(server);
  const unit = launchdStatus(server.unit);
  const health = await probeHealth(server.health_url, fetchImpl);
  const audit = summarizeServerAudit(server.audit_path);

  let state = 'stopped';
  if (unit.running || health.ok) {
    state = health.ok ? 'running' : 'unhealthy';
  } else if (unit.running === false && health.ok === false) {
    state = 'stopped';
  }

  return {
    id: server.id,
    display_name: server.display_name,
    description: server.description,
    tools: meta.tools,
    allowed_repositories: meta.allowed_repositories,
    unit: server.unit,
    status: {
      state,
      launchd_running: unit.running,
      launchd_detail: unit.detail,
      health_ok: health.ok,
      health_status: health.status,
      health_error: health.error,
      last_call: audit.last_call,
      recent_errors: audit.recent_errors,
    },
    secrets: {
      // Boolean only — never values or file contents.
      github_token_configured: meta.token_configured,
      client_keys_configured: meta.keys_configured,
    },
  };
}

/**
 * @param {object[]} servers
 * @param {object} [opts]
 */
export async function buildAllStatuses(servers, opts = {}) {
  const out = [];
  for (const s of servers) {
    out.push(await buildServerStatus(s, opts));
  }
  return out;
}

function readServerMeta(server) {
  let tools = [...(server.tools || [])];
  let allowed = [...(server.allowed_repositories || [])];
  let tokenConfigured = false;
  let keysConfigured = false;

  if (server.token_configured_path) {
    tokenConfigured = existsSync(server.token_configured_path);
  }

  if (server.config_path && existsSync(server.config_path)) {
    try {
      const text = readFileSync(server.config_path, 'utf8');
      // Reject if the live config somehow embedded a PAT (should never happen).
      if (/\bgh[pousr]_|github_pat_/i.test(text)) {
        // Still do not return any of that text to the UI.
      } else {
        const raw = text.trim().startsWith('{') ? JSON.parse(text) : parseToml(text);
        const actions = raw?.allowlist?.actions;
        const repos = raw?.allowlist?.repositories;
        if (Array.isArray(actions) && actions.length) {
          tools = actions.map(String);
        }
        if (Array.isArray(repos) && repos.length) {
          allowed = repos.map(String);
        }
        const tokenFile = raw?.github?.token_file;
        if (typeof tokenFile === 'string' && tokenFile && !server.token_configured_path) {
          tokenConfigured = existsSync(tokenFile);
        }
        const keysPath = raw?.auth?.keys_path;
        if (typeof keysPath === 'string' && keysPath) {
          keysConfigured = existsSync(keysPath);
        }
      }
    } catch {
      // Fall back to registry static lists.
    }
  }

  return {
    tools,
    allowed_repositories: allowed,
    token_configured: tokenConfigured,
    keys_configured: keysConfigured,
  };
}

async function probeHealth(url, fetchImpl) {
  if (!url) {
    return {ok: false, status: null, error: 'no_health_url'};
  }
  try {
    const res = await fetchImpl(url, {method: 'GET', signal: AbortSignal.timeout(2000)});
    if (!res.ok) {
      return {ok: false, status: res.status, error: `http_${res.status}`};
    }
    const body = await res.json().catch(() => ({}));
    const ok = body && body.ok === true;
    return {
      ok,
      status: typeof body.status === 'string' ? body.status : ok ? 'running' : 'unknown',
      error: ok ? null : 'health_not_ok',
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: String(err && err.message ? err.message : err).slice(0, 120),
    };
  }
}

/**
 * @param {string} unit
 */
export function defaultLaunchdStatus(unit) {
  const launchctl = process.env.MCP_CONTROL_LAUNCHCTL || 'launchctl';
  const uid = process.env.MCP_CONTROL_UID || String(process.getuid?.() ?? '');
  if (!uid) {
    return {running: false, detail: 'no_uid'};
  }
  const domain = `gui/${uid}/${unit}`;
  const result = spawnSync(launchctl, ['print', domain], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status === 0) {
    const out = `${result.stdout || ''}\n${result.stderr || ''}`;
    const running = /state\s*=\s*running/i.test(out) || /pid\s*=\s*[1-9]/i.test(out);
    return {running, detail: running ? 'loaded' : 'loaded_not_running'};
  }
  return {running: false, detail: 'not_loaded'};
}
