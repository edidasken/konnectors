/**
 * Load operator config from environment variables, a shared volumes file,
 * and optional CLI `--allowed-directory` fallbacks.
 * Placeholders live in .env.example — never commit real values.
 */
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  defaultVolumesFilePath,
  readVolumesFile,
  resolveVolumesFilePath,
} from './volumes.js';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string[]} [argv]
 */
export function loadConfig(env = process.env, argv = process.argv.slice(2)) {
  const cli = parseArgv(argv);
  const serverId = (env.LOCAL_FILES_SERVER_ID || cli.serverId || 'local-files').trim() || 'local-files';
  const volumesFile = resolveVolumesFilePath({
    volumesFile: env.LOCAL_FILES_VOLUMES_FILE || cli.volumesFile || '',
    serverId,
  });
  const roots = resolveRoots({env, cli, volumesFile});

  const httpEnabled = truthy(env.LOCAL_FILES_HTTP);
  const bearer = loadBearer(env);
  if (httpEnabled && !bearer) {
    throw new Error(
      'LOCAL_FILES_HTTP requires LOCAL_FILES_BEARER_TOKEN or LOCAL_FILES_BEARER_TOKEN_FILE',
    );
  }

  return {
    /** @deprecated Prefer `roots`; kept for single-root callers/tests. */
    root: roots[0],
    roots,
    volumesFile,
    serverId,
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
 * Resolution order:
 * 1. Shared volumes file when it exists (LOCAL_FILES_VOLUMES_FILE or ~/code/mcp/<id>-volumes.conf)
 * 2. CLI `--allowed-directory` / positional directory args (legacy fallback)
 * 3. LOCAL_FILES_ROOT (legacy single-root env fallback)
 *
 * @param {{env: NodeJS.ProcessEnv, cli: ReturnType<typeof parseArgv>, volumesFile: string}} opts
 * @returns {string[]}
 */
export function resolveRoots({env, cli, volumesFile}) {
  const fromFile = readVolumesFile(volumesFile);
  if (fromFile && fromFile.length > 0) {
    return validateRoots(fromFile, 'volumes file');
  }

  if (cli.directories.length > 0) {
    return validateRoots(cli.directories, 'CLI --allowed-directory');
  }

  const rootRaw = (env.LOCAL_FILES_ROOT || '').trim();
  if (rootRaw) {
    return validateRoots([rootRaw], 'LOCAL_FILES_ROOT');
  }

  const missingHint = existsSync(volumesFile)
    ? 'volumes file was empty'
    : `volumes file not found at ${volumesFile}`;
  throw new Error(
    `No allowed filesystem roots configured (${missingHint}). ` +
      `Add paths to ${volumesFile} (default ${defaultVolumesFilePath(env.LOCAL_FILES_SERVER_ID || 'local-files')}), ` +
      'pass --allowed-directory, or set LOCAL_FILES_ROOT.',
  );
}

/**
 * @param {string[]} rawRoots
 * @param {string} source
 * @returns {string[]}
 */
function validateRoots(rawRoots, source) {
  /** @type {string[]} */
  const roots = [];
  for (const raw of rawRoots) {
    const root = resolve(String(raw).trim());
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new Error(`${source}: root must be an existing directory: ${raw}`);
    }
    roots.push(root);
  }
  if (roots.length === 0) {
    throw new Error(`${source}: at least one allowed directory is required`);
  }
  return roots;
}

/**
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  /** @type {string[]} */
  const directories = [];
  let volumesFile = '';
  let serverId = '';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--allowed-directory' || arg === '-d') {
      const next = argv[++i];
      if (!next) throw new Error(`${arg} requires a path argument`);
      directories.push(next);
      continue;
    }
    if (arg.startsWith('--allowed-directory=')) {
      directories.push(arg.slice('--allowed-directory='.length));
      continue;
    }
    if (arg === '--volumes-file') {
      const next = argv[++i];
      if (!next) throw new Error('--volumes-file requires a path argument');
      volumesFile = next;
      continue;
    }
    if (arg.startsWith('--volumes-file=')) {
      volumesFile = arg.slice('--volumes-file='.length);
      continue;
    }
    if (arg === '--server-id') {
      const next = argv[++i];
      if (!next) throw new Error('--server-id requires a value');
      serverId = next;
      continue;
    }
    if (arg.startsWith('--server-id=')) {
      serverId = arg.slice('--server-id='.length);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown argument: ${arg}`);
    }
    // Positional directory args — legacy filesystem-server style fallback.
    directories.push(arg);
  }
  return {directories, volumesFile, serverId};
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
