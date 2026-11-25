/**
 * Per-client API keys: hashed at rest, issue / rotate / revoke.
 * Distinct from the GitHub PAT.
 */
import {createHash, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname} from 'node:path';

const ALGO = 'sha256';
const KEY_PREFIX = 'gmgk_'; // github-mcp-gateway key

/**
 * @param {string} plaintext
 */
export function hashKey(plaintext) {
  return createHash(ALGO).update(plaintext, 'utf8').digest('hex');
}

/**
 * @param {string} path
 * @returns {{version:number, keys: Array<object>}}
 */
export function loadKeyStore(path) {
  if (!existsSync(path)) {
    return {version: 1, keys: []};
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || raw.version !== 1 || !Array.isArray(raw.keys)) {
    throw new Error(`Invalid key store at ${path}`);
  }
  return raw;
}

/**
 * @param {string} path
 * @param {{version:number, keys: Array<object>}} store
 */
export function saveKeyStore(path, store) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/**
 * Generate a high-entropy client key. Plaintext returned once.
 * @param {object} opts
 * @param {string} opts.keysPath
 * @param {string} [opts.id]
 * @param {string} [opts.label]
 */
export function issueKey({keysPath, id, label}) {
  const store = loadKeyStore(keysPath);
  const clientId = id || `client-${randomBytes(4).toString('hex')}`;
  const plaintext = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const record = {
    id: clientId,
    label: label || clientId,
    hash: hashKey(plaintext),
    algo: ALGO,
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  // revoke any prior active keys with same id
  for (const k of store.keys) {
    if (k.id === clientId && !k.revoked_at) {
      k.revoked_at = record.created_at;
    }
  }
  store.keys.push(record);
  saveKeyStore(keysPath, store);
  return {id: clientId, label: record.label, plaintext, created_at: record.created_at};
}

/**
 * Issue a new key for an existing client id and revoke the previous active hash.
 */
export function rotateKey({keysPath, id, label}) {
  if (!id) throw new Error('rotateKey requires id');
  return issueKey({keysPath, id, label});
}

/**
 * @param {object} opts
 * @param {string} opts.keysPath
 * @param {string} opts.id
 */
export function revokeKey({keysPath, id}) {
  const store = loadKeyStore(keysPath);
  let found = false;
  const now = new Date().toISOString();
  for (const k of store.keys) {
    if (k.id === id && !k.revoked_at) {
      k.revoked_at = now;
      found = true;
    }
  }
  if (!found) {
    throw new Error(`No active key for client id ${id}`);
  }
  saveKeyStore(keysPath, store);
  return {id, revoked_at: now};
}

/**
 * Verify a plaintext key against the store.
 * @returns {{ok:true, clientId:string, label:string}|{ok:false, reason:string}}
 */
export function verifyKey(keysPath, plaintext) {
  if (!plaintext || typeof plaintext !== 'string') {
    return {ok: false, reason: 'missing_key'};
  }
  const store = loadKeyStore(keysPath);
  const h = hashKey(plaintext);
  const match = store.keys.find((k) => k.hash === h);
  if (!match) {
    return {ok: false, reason: 'unknown_key'};
  }
  if (match.revoked_at) {
    return {ok: false, reason: 'revoked_key'};
  }
  return {ok: true, clientId: match.id, label: match.label};
}

/**
 * Extract Bearer (or raw) key from an HTTP header value.
 * @param {string|undefined} headerValue
 * @param {boolean} bearerPrefix
 */
export function extractKeyFromHeader(headerValue, bearerPrefix = true) {
  if (!headerValue) return null;
  const v = String(headerValue).trim();
  if (bearerPrefix) {
    const m = /^Bearer\s+(.+)$/i.exec(v);
    return m ? m[1].trim() : null;
  }
  return v || null;
}
