/**
 * Load the managed-MCP-servers registry for the control plane.
 * GitHub gateway is the first entry; additional servers are more [[managed_servers]] blocks.
 */
import {readFileSync, existsSync} from 'node:fs';
import {parse as parseToml} from 'smol-toml';

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bghs_[A-Za-z0-9_]{20,}\b/,
];

/**
 * @param {string} path
 */
export function loadRegistry(path) {
  if (!existsSync(path)) {
    throw new Error(`Registry not found: ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) {
      throw new Error(`Registry must not embed GitHub tokens (${path})`);
    }
  }
  const trimmed = text.trim();
  const raw = trimmed.startsWith('{') ? JSON.parse(trimmed) : parseToml(trimmed);
  return validateRegistry(raw, path);
}

/**
 * @param {any} raw
 * @param {string} sourcePath
 */
export function validateRegistry(raw, sourcePath = '<registry>') {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid registry in ${sourcePath}`);
  }
  if (raw.version !== 1) {
    throw new Error(`Registry version must be 1 (got ${raw.version})`);
  }
  const list = raw.managed_servers;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('registry.managed_servers must be a non-empty array');
  }

  const servers = list.map((s, i) => normalizeServer(s, i, sourcePath));
  const ids = new Set();
  for (const s of servers) {
    if (ids.has(s.id)) {
      throw new Error(`Duplicate managed server id: ${s.id}`);
    }
    ids.add(s.id);
  }
  return {version: 1, servers, sourcePath};
}

function normalizeServer(s, index, sourcePath) {
  if (!s || typeof s !== 'object') {
    throw new Error(`managed_servers[${index}] invalid in ${sourcePath}`);
  }
  const id = requireString(s.id, `managed_servers[${index}].id`);
  return {
    id,
    display_name: String(s.display_name ?? id),
    description: String(s.description ?? ''),
    unit: requireString(s.unit, `managed_servers[${index}].unit`),
    ctl_script: s.ctl_script ? String(s.ctl_script) : null,
    health_url: s.health_url ? String(s.health_url) : null,
    config_path: s.config_path ? String(s.config_path) : null,
    audit_path: s.audit_path ? String(s.audit_path) : null,
    token_configured_path: s.token_configured_path ? String(s.token_configured_path) : null,
    tools: Array.isArray(s.tools) ? s.tools.map(String) : [],
    allowed_repositories: Array.isArray(s.allowed_repositories)
      ? s.allowed_repositories.map(String)
      : [],
  };
}

function requireString(v, name) {
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return v.trim();
}
