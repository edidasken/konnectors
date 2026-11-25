/**
 * Load operator config from environment variables only.
 * Placeholders live in .env.example — never commit real values.
 */
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';

/**
 * @param {NodeJS.ProcessEnv} env
 */
export function loadConfig(env = process.env) {
  const rootRaw = (env.LOCAL_FILES_ROOT || '').trim();
  if (!rootRaw) {
    throw new Error('LOCAL_FILES_ROOT is required (absolute path to the single allowed filesystem root)');
  }
  const root = resolve(rootRaw);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error('LOCAL_FILES_ROOT must be an existing directory');
  }

  const httpEnabled = truthy(env.LOCAL_FILES_HTTP);
  const bearer = loadBearer(env);
  if (httpEnabled && !bearer) {
    throw new Error(
      'LOCAL_FILES_HTTP requires LOCAL_FILES_BEARER_TOKEN or LOCAL_FILES_BEARER_TOKEN_FILE',
    );
  }

  return {
    root,
    serverName: env.LOCAL_FILES_SERVER_NAME || 'konnectors-local-files',
    http: {
      enabled: httpEnabled,
      bind: (env.LOCAL_FILES_BIND || '127.0.0.1').trim(),
      port: intOr(env.LOCAL_FILES_PORT, 8792),
      basePath: normalizePath(env.LOCAL_FILES_BASE_PATH || '/mcp'),
      bearer,
      publicExposure: (env.LOCAL_FILES_PUBLIC_EXPOSURE || 'none').trim(),
    },
    limits: {
      maxReadBytes: intOr(env.LOCAL_FILES_MAX_READ_BYTES, 24 * 1024 * 1024),
      maxChunkBytes: intOr(env.LOCAL_FILES_MAX_CHUNK_BYTES, 8 * 1024 * 1024),
      maxMultiReadBytes: intOr(env.LOCAL_FILES_MAX_MULTI_READ_BYTES, 2 * 1024 * 1024),
      maxMultiFiles: intOr(env.LOCAL_FILES_MAX_MULTI_FILES, 50),
      maxTreeDepth: intOr(env.LOCAL_FILES_MAX_TREE_DEPTH, 20),
      maxListLimit: intOr(env.LOCAL_FILES_MAX_LIST_LIMIT, 1000),
      maxSearchLimit: intOr(env.LOCAL_FILES_MAX_SEARCH_LIMIT, 1000),
    },
  };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function loadBearer(env) {
  const inline = (env.LOCAL_FILES_BEARER_TOKEN || '').trim();
  if (inline) return inline;
  const file = (env.LOCAL_FILES_BEARER_TOKEN_FILE || '').trim();
  if (!file) return null;
  const text = readFileSync(file, 'utf8').trim();
  if (!text) {
    throw new Error('LOCAL_FILES_BEARER_TOKEN_FILE is empty');
  }
  return text;
}

function truthy(v) {
  if (v == null || v === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function intOr(v, fallback) {
  if (v == null || v === '') return fallback;
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizePath(p) {
  if (!p || p === '/') return '/mcp';
  return p.startsWith('/') ? p : `/${p}`;
}
