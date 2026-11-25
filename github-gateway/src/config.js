/**
 * Load and validate gateway config (TOML or JSON).
 * Rejects embedded GitHub PATs and accidental Funnel without acknowledgment.
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

const V1_ACTIONS = new Set([
  'github_issue_read',
  'github_issue_comment',
  'github_issue_close',
]);

/**
 * @param {string} text
 * @param {string} [sourcePath]
 */
export function parseConfigText(text, sourcePath = '<inline>') {
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) {
      throw new Error(
        `Config must not embed GitHub tokens (matched secret pattern in ${sourcePath})`,
      );
    }
  }

  const trimmed = text.trim();
  let raw;
  if (trimmed.startsWith('{')) {
    raw = JSON.parse(trimmed);
  } else {
    raw = parseToml(trimmed);
  }
  return validateConfig(raw, sourcePath);
}

/**
 * @param {string} path
 */
export function loadConfig(path) {
  const text = readFileSync(path, 'utf8');
  return parseConfigText(text, path);
}

/**
 * @param {any} raw
 * @param {string} sourcePath
 */
export function validateConfig(raw, sourcePath = '<config>') {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid config in ${sourcePath}: expected object`);
  }
  if (raw.version !== 1) {
    throw new Error(`Config version must be 1 (got ${raw.version})`);
  }

  const transport = raw.transport ?? {};
  const stdio = normalizeSection(transport.stdio, {enabled: true});
  const http = normalizeSection(transport.http, {
    enabled: false,
    bind: '127.0.0.1',
    port: 8743,
    base_path: '/mcp',
    public_exposure: 'none',
    funnel_acknowledged_by_operator: false,
  });

  if (typeof stdio.enabled !== 'boolean') {
    throw new Error('transport.stdio.enabled must be boolean');
  }
  if (typeof http.enabled !== 'boolean') {
    throw new Error('transport.http.enabled must be boolean');
  }
  if (!stdio.enabled && !http.enabled) {
    throw new Error('At least one of transport.stdio.enabled or transport.http.enabled must be true');
  }

  const exposure = http.public_exposure ?? 'none';
  if (!['none', 'tailscale', 'funnel'].includes(exposure)) {
    throw new Error('transport.http.public_exposure must be none|tailscale|funnel');
  }
  if (exposure === 'funnel' && http.funnel_acknowledged_by_operator !== true) {
    throw new Error(
      'transport.http.public_exposure=funnel requires http.funnel_acknowledged_by_operator=true (host-operator decision)',
    );
  }

  const auth = raw.auth;
  if (!auth || typeof auth.keys_path !== 'string' || !auth.keys_path.trim()) {
    throw new Error('auth.keys_path is required');
  }

  const github = raw.github;
  if (!github || typeof github !== 'object') {
    throw new Error('github section is required');
  }
  const tokenSource = github.token_source;
  if (tokenSource !== 'file' && tokenSource !== 'keychain' && tokenSource !== 'env') {
    // env is test/dev only — documented; never for production PAT paste
    throw new Error('github.token_source must be file|keychain (or env for tests/mocks)');
  }
  if (tokenSource === 'file') {
    if (typeof github.token_file !== 'string' || !github.token_file.trim()) {
      throw new Error('github.token_file is required when token_source=file');
    }
  }
  if (tokenSource === 'keychain') {
    if (!github.keychain_service || !github.keychain_account) {
      throw new Error(
        'github.keychain_service and github.keychain_account are required when token_source=keychain',
      );
    }
  }
  if (tokenSource === 'env') {
    if (typeof github.token_env !== 'string' || !github.token_env.trim()) {
      throw new Error('github.token_env is required when token_source=env (tests/mocks only)');
    }
  }

  const allowlist = raw.allowlist;
  if (!allowlist || !Array.isArray(allowlist.repositories) || allowlist.repositories.length === 0) {
    throw new Error('allowlist.repositories must be a non-empty array');
  }
  if (!Array.isArray(allowlist.actions) || allowlist.actions.length === 0) {
    throw new Error('allowlist.actions must be a non-empty array');
  }
  for (const action of allowlist.actions) {
    if (!V1_ACTIONS.has(action)) {
      throw new Error(`allowlist.actions contains unknown/forbidden action: ${action}`);
    }
  }

  const audit = raw.audit;
  if (!audit || typeof audit.path !== 'string' || !audit.path.trim()) {
    throw new Error('audit.path is required');
  }

  const rate = raw.rate_limit ?? {};

  return {
    version: 1,
    transport: {
      stdio: {enabled: !!stdio.enabled},
      http: {
        enabled: !!http.enabled,
        bind: String(http.bind ?? '127.0.0.1'),
        port: Number(http.port ?? 8743),
        base_path: String(http.base_path ?? '/mcp'),
        public_exposure: exposure,
        funnel_acknowledged_by_operator: http.funnel_acknowledged_by_operator === true,
      },
    },
    auth: {
      keys_path: String(auth.keys_path),
      header: String(auth.header ?? 'Authorization'),
      bearer_prefix: auth.bearer_prefix !== false,
      stdio_require_key: auth.stdio_require_key === true,
    },
    github: {
      token_source: tokenSource,
      token_file: github.token_file ? String(github.token_file) : undefined,
      token_env: github.token_env ? String(github.token_env) : undefined,
      keychain_service: github.keychain_service
        ? String(github.keychain_service)
        : undefined,
      keychain_account: github.keychain_account
        ? String(github.keychain_account)
        : undefined,
      api_base: String(github.api_base ?? 'https://api.github.com'),
      user_agent: String(github.user_agent ?? 'edidasken-github-mcp-gateway/1'),
    },
    allowlist: {
      repositories: allowlist.repositories.map(String),
      actions: allowlist.actions.map(String),
    },
    audit: {
      path: String(audit.path),
      retain_days: Number(audit.retain_days ?? 90),
      log_issue_bodies: audit.log_issue_bodies === true,
    },
    rate_limit: {
      per_client_per_minute: Number(rate.per_client_per_minute ?? 60),
      per_client_per_day: Number(rate.per_client_per_day ?? 2000),
      close_per_client_per_hour: Number(rate.close_per_client_per_hour ?? 30),
    },
  };
}

function normalizeSection(value, defaults) {
  if (value == null) return {...defaults};
  if (typeof value !== 'object') return {...defaults};
  return {...defaults, ...value};
}

export {V1_ACTIONS, SECRET_PATTERNS};
