/**
 * Server-side GitHub token loading.
 * Sources: secure file (mode 600), macOS Keychain, or env (tests/mocks only).
 * Never log or return the token to callers beyond the process that needs it.
 */
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

/**
 * @param {import('../config.js').validateConfig extends Function ? any : any} githubConfig
 * @returns {string} PAT (caller must not log)
 */
export function loadGitHubToken(githubConfig) {
  const source = githubConfig.token_source;

  if (source === 'file') {
    const path = githubConfig.token_file;
    if (!existsSync(path)) {
      throw new Error(`GitHub token file not found: ${path}`);
    }
    const token = readFileSync(path, 'utf8').trim();
    if (!token) {
      throw new Error(`GitHub token file is empty: ${path}`);
    }
    return token;
  }

  if (source === 'keychain') {
    return loadFromKeychain(githubConfig.keychain_service, githubConfig.keychain_account);
  }

  if (source === 'env') {
    const name = githubConfig.token_env;
    const token = process.env[name];
    if (!token || !String(token).trim()) {
      throw new Error(`GitHub token env ${name} is missing or empty (tests/mocks only)`);
    }
    return String(token).trim();
  }

  throw new Error(`Unsupported github.token_source: ${source}`);
}

/**
 * macOS Keychain via `security` CLI. Not available on Linux CI — use file/env there.
 */
function loadFromKeychain(service, account) {
  if (process.platform !== 'darwin') {
    throw new Error(
      'github.token_source=keychain is only supported on macOS (the gateway host). Use file (or env for tests).',
    );
  }
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-s', service, '-a', account, '-w'],
      {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
    );
    const token = String(out).trim();
    if (!token) {
      throw new Error('Keychain returned empty password');
    }
    return token;
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    // Do not include stderr that might echo secrets
    throw new Error(`Failed to load GitHub token from Keychain (${service}/${account}): ${msg}`);
  }
}
