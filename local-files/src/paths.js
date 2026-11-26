/**
 * Resolve and enforce allowed filesystem roots.
 * Symlinks are never followed for authorization decisions.
 */
import {lstatSync, realpathSync, existsSync} from 'node:fs';
import {dirname, join, normalize, resolve, relative, sep, isAbsolute} from 'node:path';

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
 * Resolve a tool path against one or more allowed roots.
 * Relative paths (and empty/`/`) use the first root. Absolute paths must fall
 * under exactly one allowed root.
 *
 * @param {string[]} roots
 * @param {string} [relOrAbs]
 * @returns {{absolute: string, root: string}}
 */
export function resolveInRoots(roots, relOrAbs = '') {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error('no allowed filesystem roots configured');
  }
  const cleaned = String(relOrAbs ?? '').trim();
  if (!cleaned || cleaned === '/' || cleaned === '.') {
    const root = resolve(roots[0]);
    return {absolute: root, root};
  }
  if (isAbsolute(cleaned)) {
    const abs = resolve(cleaned);
    for (const candidate of roots) {
      const root = resolve(candidate);
      try {
        assertInside(root, abs);
        return {absolute: abs, root};
      } catch {
        /* try next root */
      }
    }
    throw new Error('path escapes allowed root');
  }
  const root = resolve(roots[0]);
  return {absolute: resolveUnderRoot(root, cleaned), root};
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
 * Display path for tool results. Single-root installs keep relative paths;
 * multi-root installs return absolute paths so the volume is unambiguous.
 *
 * @param {string[]} roots
 * @param {string} root
 * @param {string} absolutePath
 */
export function displayInRoots(roots, root, absolutePath) {
  if (roots.length === 1) {
    const rel = displayPath(root, absolutePath);
    return rel === '.' ? '/' : rel;
  }
  return resolve(absolutePath);
}

/**
 * Join under root without resolving beyond it.
 * @param {string} root
 * @param {...string} parts
 */
export function joinUnderRoot(root, ...parts) {
  return resolveUnderRoot(root, join(...parts));
}
