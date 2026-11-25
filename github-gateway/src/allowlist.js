/**
 * Repository and action allowlist checks.
 */

/**
 * @param {string} owner
 * @param {string} repo
 * @param {string[]} patterns  e.g. ["edidasken/*", "edidasken/code"]
 */
export function isRepoAllowed(owner, repo, patterns) {
  const full = `${owner}/${repo}`;
  for (const pattern of patterns) {
    if (pattern === full) return true;
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // "edidasken/"
      if (full.startsWith(prefix) && !full.slice(prefix.length).includes('/')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string} action
 * @param {string[]} allowed
 */
export function isActionAllowed(action, allowed) {
  return allowed.includes(action);
}
