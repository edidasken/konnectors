/**
 * Control-plane sign-in: scrypt password hash + hashed session cookies.
 * Distinct from MCP client API keys and the GitHub PAT. Never stores plaintext.
 */
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {dirname} from 'node:path';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SESSION_BYTES = 32;

/**
 * @param {string} password
 * @returns {{algo:string, n:number, r:number, p:number, salt:string, hash:string, updated_at:string}}
 */
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('password must be at least 12 characters');
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return {
    algo: 'scrypt',
    n: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    updated_at: new Date().toISOString(),
  };
}

/**
 * @param {string} path
 * @param {string} password
 */
export function setPasswordFile(path, password) {
  const record = hashPassword(password);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return {updated_at: record.updated_at};
}

/**
 * @param {string} path
 * @param {string} password
 */
export function verifyPasswordFile(path, password) {
  if (!existsSync(path)) {
    return {ok: false, reason: 'password_not_configured'};
  }
  if (typeof password !== 'string' || !password) {
    return {ok: false, reason: 'empty_password'};
  }
  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {ok: false, reason: 'password_file_invalid'};
  }
  if (!record || record.algo !== 'scrypt' || !record.salt || !record.hash) {
    return {ok: false, reason: 'password_file_invalid'};
  }
  const salt = Buffer.from(record.salt, 'base64');
  const expected = Buffer.from(record.hash, 'base64');
  const actual = scryptSync(password, salt, expected.length, {
    N: record.n || SCRYPT_N,
    r: record.r || SCRYPT_R,
    p: record.p || SCRYPT_P,
  });
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return {ok: false, reason: 'bad_password'};
  }
  return {ok: true};
}

/**
 * @param {string} sessionsPath
 * @param {object} opts
 * @param {string} opts.who
 * @param {number} opts.ttlHours
 */
export function createSession(sessionsPath, {who, ttlHours}) {
  const store = loadSessions(sessionsPath);
  const plaintext = randomBytes(SESSION_BYTES).toString('base64url');
  const tokenHash = hashSessionToken(plaintext);
  const now = Date.now();
  const expiresAt = new Date(now + ttlHours * 3600 * 1000).toISOString();
  store.sessions.push({
    token_hash: tokenHash,
    who: String(who || 'operator'),
    created_at: new Date(now).toISOString(),
    expires_at: expiresAt,
  });
  pruneSessions(store);
  saveSessions(sessionsPath, store);
  return {token: plaintext, expires_at: expiresAt, who: String(who || 'operator')};
}

/**
 * @param {string} sessionsPath
 * @param {string|undefined} plaintext
 */
export function verifySession(sessionsPath, plaintext) {
  if (!plaintext) return {ok: false, reason: 'no_session'};
  const store = loadSessions(sessionsPath);
  const tokenHash = hashSessionToken(plaintext);
  const now = Date.now();
  let changed = false;
  const kept = [];
  let match = null;
  for (const s of store.sessions) {
    const exp = Date.parse(s.expires_at);
    if (!Number.isFinite(exp) || exp <= now) {
      changed = true;
      continue;
    }
    kept.push(s);
    if (!match && s.token_hash === tokenHash) {
      match = s;
    }
  }
  if (changed) {
    store.sessions = kept;
    saveSessions(sessionsPath, store);
  }
  if (!match) return {ok: false, reason: 'invalid_or_expired'};
  return {ok: true, who: match.who, expires_at: match.expires_at};
}

/**
 * @param {string} sessionsPath
 * @param {string|undefined} plaintext
 */
export function revokeSession(sessionsPath, plaintext) {
  if (!plaintext) return;
  const store = loadSessions(sessionsPath);
  const tokenHash = hashSessionToken(plaintext);
  store.sessions = store.sessions.filter((s) => s.token_hash !== tokenHash);
  saveSessions(sessionsPath, store);
}

export function hashSessionToken(plaintext) {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/**
 * @param {string|undefined} cookieHeader
 * @param {string} cookieName
 */
export function parseSessionCookie(cookieHeader, cookieName) {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === cookieName) return decodeURIComponent(v);
  }
  return undefined;
}

/**
 * @param {string} cookieName
 * @param {string} token
 * @param {string} expiresAt
 * @param {{secure?:boolean}} [opts]
 */
export function sessionCookieHeader(cookieName, token, expiresAt, opts = {}) {
  const parts = [
    `${cookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * @param {string} cookieName
 */
export function clearSessionCookieHeader(cookieName) {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function loadSessions(path) {
  if (!existsSync(path)) {
    return {version: 1, sessions: []};
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!raw || raw.version !== 1 || !Array.isArray(raw.sessions)) {
    throw new Error(`Invalid sessions store at ${path}`);
  }
  return raw;
}

function saveSessions(path, store) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function pruneSessions(store) {
  const now = Date.now();
  store.sessions = store.sessions.filter((s) => {
    const exp = Date.parse(s.expires_at);
    return Number.isFinite(exp) && exp > now;
  });
}
