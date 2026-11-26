/**
 * Parse shared allowed-volume lists (one absolute path per line).
 * Machine-specific files live outside git (for example ~/code/mcp/<server>-volumes.conf).
 */
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';

/**
 * Parse volumes.conf text into absolute path strings.
 * Blank lines and `#` comments are ignored. Surrounding double quotes are stripped.
 * Interior spaces are preserved (for example `/Volumes/grape nuts`).
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseVolumesConfig(text) {
  const paths = [];
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let entry = line;
    if (entry.length >= 2 && entry.startsWith('"') && entry.endsWith('"')) {
      entry = entry.slice(1, -1);
    }
    entry = entry.trim();
    if (!entry) continue;
    paths.push(entry);
  }
  return paths;
}

/**
 * Read and parse a volumes file. Returns null when the file is missing.
 *
 * @param {string} filePath
 * @returns {string[]|null}
 */
export function readVolumesFile(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) return null;
  return parseVolumesConfig(readFileSync(abs, 'utf8'));
}

/**
 * Default shared config path: ~/code/mcp/<serverId>-volumes.conf
 *
 * @param {string} [serverId]
 * @returns {string}
 */
export function defaultVolumesFilePath(serverId = 'local-files') {
  const id = String(serverId || 'local-files').trim() || 'local-files';
  return join(homedir(), 'code', 'mcp', `${id}-volumes.conf`);
}

/**
 * Resolve which volumes file to consult.
 * Prefer an explicit path; otherwise the shared ~/code/mcp default.
 *
 * @param {{volumesFile?: string|null, serverId?: string}} [opts]
 * @returns {string}
 */
export function resolveVolumesFilePath(opts = {}) {
  const explicit = (opts.volumesFile || '').trim();
  if (explicit) return resolve(explicit);
  return defaultVolumesFilePath(opts.serverId);
}
