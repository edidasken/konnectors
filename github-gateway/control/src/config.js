/**
 * Load and validate MCP control-plane config (TOML or JSON).
 * Rejects embedded GitHub tokens and accidental Funnel without acknowledgment.
 */
import {readFileSync} from 'node:fs';
import {parse as parseToml} from 'smol-toml';

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bghs_[A-Za-z0-9_]{20,}\b/,
  /\bgho_[A-Za-z0-9_]{20,}\b/,
  /\bghu_[A-Za-z0-9_]{20,}\b/,
  /\bghr_[A-Za-z0-9_]{20,}\b/,
];

/**
 * @param {string} text
 * @param {string} [sourcePath]
 */
export function parseControlConfigText(text, sourcePath = '<inline>') {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) {
      throw new Error(
        `Control config must not embed GitHub tokens (matched secret pattern in ${sourcePath})`,
      );
    }
  }
  const trimmed = text.trim();
  const raw = trimmed.startsWith('{') ? JSON.parse(trimmed) : parseToml(trimmed);
  return validateControlConfig(raw, sourcePath);
}

/**
 * @param {string} path
 */
export function loadControlConfig(path) {
  return parseControlConfigText(readFileSync(path, 'utf8'), path);
}

/**
 * @param {any} raw
 * @param {string} sourcePath
 */
export function validateControlConfig(raw, sourcePath = '<config>') {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid control config in ${sourcePath}: expected object`);
  }
  if (raw.version !== 1) {
    throw new Error(`Control config version must be 1 (got ${raw.version})`);
  }

  const listen = {
    bind: String(raw.listen?.bind ?? '127.0.0.1'),
    port: Number(raw.listen?.port ?? 8750),
    public_exposure: String(raw.listen?.public_exposure ?? 'none'),
    funnel_acknowledged_by_operator: Boolean(raw.listen?.funnel_acknowledged_by_operator ?? false),
  };

  if (!Number.isInteger(listen.port) || listen.port < 1 || listen.port > 65535) {
    throw new Error('listen.port must be an integer 1–65535');
  }
  if (listen.bind === '0.0.0.0' || listen.bind === '::' || listen.bind === '*') {
    throw new Error(
      'listen.bind must not be a public wildcard (0.0.0.0 / ::). Use 127.0.0.1 + tailscale serve or a Tailscale 100.x address.',
    );
  }
  const exposure = listen.public_exposure;
  if (!['none', 'tailscale', 'funnel'].includes(exposure)) {
    throw new Error('listen.public_exposure must be none | tailscale | funnel');
  }
  if (exposure === 'funnel' && !listen.funnel_acknowledged_by_operator) {
    throw new Error(
      'Funnel requires the host operator acknowledgment (listen.funnel_acknowledged_by_operator = true). Not enabled by ticket 57.',
    );
  }

  const auth = {
    password_path: requireString(raw.auth?.password_path, 'auth.password_path'),
    sessions_path: requireString(raw.auth?.sessions_path, 'auth.sessions_path'),
    session_ttl_hours: Number(raw.auth?.session_ttl_hours ?? 12),
    cookie_name: String(raw.auth?.cookie_name ?? 'mcp_cp_session'),
  };
  if (!Number.isFinite(auth.session_ttl_hours) || auth.session_ttl_hours < 1) {
    throw new Error('auth.session_ttl_hours must be >= 1');
  }

  const registry = {
    path: requireString(raw.registry?.path, 'registry.path'),
  };

  const audit = {
    path: requireString(raw.audit?.path, 'audit.path'),
  };

  return {version: 1, listen, auth, registry, audit, sourcePath};
}

function requireString(v, name) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return v.trim();
}
