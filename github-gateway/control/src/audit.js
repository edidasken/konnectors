/**
 * Control-plane audit log (toggle / sign-in events). Never writes secrets.
 */
import {appendFileSync, mkdirSync, existsSync, writeFileSync, readFileSync} from 'node:fs';
import {dirname} from 'node:path';

const FORBIDDEN = /token|authorization|password|secret|api_?key|pat|plaintext/i;

/**
 * @param {object} opts
 * @param {string} opts.path
 */
export function createControlAudit({path}) {
  ensureFile(path);
  return {
    /**
     * @param {object} event
     */
    log(event) {
      const safe = {};
      for (const [k, v] of Object.entries(event || {})) {
        if (FORBIDDEN.test(k)) continue;
        if (typeof v === 'string' && FORBIDDEN.test(v) && /gh[pousr]_|github_pat_/i.test(v)) {
          safe[k] = '[redacted]';
          continue;
        }
        safe[k] = v;
      }
      appendFileSync(path, `${JSON.stringify({ts: new Date().toISOString(), ...safe})}\n`, {
        encoding: 'utf8',
      });
    },
  };
}

/**
 * Summarize a managed server's tool-call audit file (last call + recent errors).
 * Never returns secret-bearing fields.
 * @param {string|null} auditPath
 * @param {number} [errorLimit]
 */
export function summarizeServerAudit(auditPath, errorLimit = 5) {
  const empty = {last_call: null, recent_errors: []};
  if (!auditPath || !existsSync(auditPath)) {
    return empty;
  }
  let text;
  try {
    text = readFileSync(auditPath, 'utf8');
  } catch {
    return empty;
  }
  const lines = text.split('\n').filter(Boolean);
  // Read from the end for recent activity (cap scan).
  const scan = lines.slice(-200);
  let lastCall = null;
  const errors = [];
  for (let i = scan.length - 1; i >= 0; i--) {
    let row;
    try {
      row = JSON.parse(scan[i]);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const tool = typeof row.tool === 'string' ? row.tool : null;
    const outcome = typeof row.outcome === 'string' ? row.outcome : null;
    const ts = typeof row.ts === 'string' ? row.ts : null;
    if (!lastCall && tool && tool !== 'transport_http' && tool !== 'control_toggle') {
      lastCall = {
        ts,
        tool,
        outcome,
        client_id: typeof row.client_id === 'string' ? row.client_id : undefined,
        owner: typeof row.owner === 'string' ? row.owner : undefined,
        repo: typeof row.repo === 'string' ? row.repo : undefined,
        issue_number:
          typeof row.issue_number === 'number' ? row.issue_number : undefined,
      };
    }
    if (
      errors.length < errorLimit &&
      (outcome === 'error' || outcome === 'denied') &&
      tool
    ) {
      errors.push({
        ts,
        tool,
        outcome,
        error_class: typeof row.error_class === 'string' ? row.error_class : undefined,
        error: typeof row.error === 'string' ? redactError(row.error) : undefined,
      });
    }
  }
  return {last_call: lastCall, recent_errors: errors};
}

function redactError(msg) {
  return String(msg)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, '[redacted]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]+\b/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function ensureFile(path) {
  mkdirSync(dirname(path), {recursive: true});
  if (!existsSync(path)) {
    writeFileSync(path, '', {encoding: 'utf8', mode: 0o600});
  }
}
