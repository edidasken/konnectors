/**
 * Append-only JSON-lines audit log. Never writes secrets.
 */
import {appendFileSync, mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {sanitizeErrorMessage} from './github/client.js';

const FORBIDDEN_KEYS = new Set([
  'authorization',
  'token',
  'pat',
  'password',
  'api_key',
  'apikey',
  'plaintext',
  'secret',
]);

/**
 * @param {object} opts
 * @param {string} opts.path
 * @param {boolean} [opts.logIssueBodies]
 */
export function createAuditLogger({path, logIssueBodies = false}) {
  ensureFile(path);

  return {
    /**
     * @param {object} event
     */
    log(event) {
      const safe = sanitizeEvent(event, logIssueBodies);
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        ...safe,
      });
      appendFileSync(path, `${line}\n`, {encoding: 'utf8'});
    },
  };
}

function ensureFile(path) {
  mkdirSync(dirname(path), {recursive: true});
  if (!existsSync(path)) {
    writeFileSync(path, '', {encoding: 'utf8', mode: 0o600});
  }
}

function sanitizeEvent(event, logIssueBodies) {
  const out = {};
  for (const [k, v] of Object.entries(event)) {
    const lk = k.toLowerCase();
    if (FORBIDDEN_KEYS.has(lk) || lk.includes('token') || lk.includes('authorization')) {
      continue;
    }
    if (!logIssueBodies && (lk === 'body' || lk === 'issue_body')) {
      continue;
    }
    if (typeof v === 'string') {
      out[k] = sanitizeErrorMessage(v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
