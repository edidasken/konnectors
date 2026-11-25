/**
 * Resolve and enforce a single allowed filesystem root.
 * Symlinks are never followed for authorization decisions.
 */
import {lstatSync, realpathSync, existsSync} from 'node:fs';
import {dirname, join, normalize, resolve, relative, sep} from 'node:path';

/**
 * @param {string} root
 * @param {string} [relPath]
 */
export function resolveUnderRoot(root, relPath = '') {
  const rootResolved = resolve(root);
  const cleaned = String(relPath || '').replace(/^\/+/, '');
  const candidate = cleaned ? resolve(rootResolved, cleaned) : rootResolved;
  assertInside(rootResolved, candidate);
  return candidate;
}

/**
 * @param {string} root
 * @param {string} absolutePath
 */
export function assertInside(root, absolutePath) {
  const rootNorm = normalize(resolve(root));
  const absNorm = normalize(resolve(absolutePath));
  const rel = relative(rootNorm, absNorm);
  if (rel.startsWith('..') || rel.includes(`..${sep}`) || absNorm === '..') {
    throw new Error('path escapes allowed root');
  }
  // Refuse when a symlink would leave the root (check each ancestor).
  let cur = absNorm;
  while (true) {
    if (existsSync(cur)) {
      try {
        const st = lstatSync(cur);
        if (st.isSymbolicLink()) {
          const real = realpathSync(cur);
          const realRel = relative(rootNorm, real);
          if (realRel.startsWith('..') || realRel.includes(`..${sep}`)) {
            throw new Error('symlink escapes allowed root');
          }
        }
      } catch (err) {
        if (err && err.message && /escapes allowed root/.test(err.message)) throw err;
        // ignore missing intermediate for create paths
      }
    }
    const parent = dirname(cur);
    if (parent === cur || parent.length < rootNorm.length) break;
    cur = parent;
  }
  return absNorm;
}

/**
 * Relative path from root for display (POSIX-ish, no leading slash).
 * @param {string} root
 * @param {string} absolutePath
 */
export function displayPath(root, absolutePath) {
  const rel = relative(resolve(root), resolve(absolutePath));
  return rel.split(sep).join('/') || '.';
}

/**
 * Join under root without resolving beyond it.
 * @param {string} root
 * @param {...string} parts
 */
export function joinUnderRoot(root, ...parts) {
  return resolveUnderRoot(root, join(...parts));
}
