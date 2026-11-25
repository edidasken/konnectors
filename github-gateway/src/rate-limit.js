/**
 * In-memory per-client rate limits (single process).
 */

/**
 * @param {object} limits
 * @param {number} limits.per_client_per_minute
 * @param {number} limits.per_client_per_day
 * @param {number} limits.close_per_client_per_hour
 */
export function createRateLimiter(limits) {
  /** @type {Map<string, number[]>} */
  const calls = new Map();
  /** @type {Map<string, number[]>} */
  const closes = new Map();

  function prune(arr, sinceMs) {
    const cutoff = Date.now() - sinceMs;
    let i = 0;
    while (i < arr.length && arr[i] < cutoff) i += 1;
    if (i > 0) arr.splice(0, i);
  }

  /**
   * @param {string} clientId
   * @param {string} toolName
   * @returns {{ok:true}|{ok:false, reason:string}}
   */
  function check(clientId, toolName) {
    const id = clientId || 'anonymous';
    const now = Date.now();
    const list = calls.get(id) || [];
    prune(list, 24 * 60 * 60 * 1000);
    const minuteCutoff = now - 60 * 1000;
    const dayCutoff = now - 24 * 60 * 60 * 1000;
    const perMinute = list.filter((t) => t >= minuteCutoff).length;
    const perDay = list.filter((t) => t >= dayCutoff).length;

    if (perMinute >= limits.per_client_per_minute) {
      return {ok: false, reason: 'rate_limit_per_minute'};
    }
    if (perDay >= limits.per_client_per_day) {
      return {ok: false, reason: 'rate_limit_per_day'};
    }

    if (toolName === 'github_issue_close') {
      const cl = closes.get(id) || [];
      prune(cl, 60 * 60 * 1000);
      if (cl.filter((t) => t >= now - 60 * 60 * 1000).length >= limits.close_per_client_per_hour) {
        return {ok: false, reason: 'rate_limit_close_per_hour'};
      }
    }

    return {ok: true};
  }

  /**
   * Record a successful authorization past rate limit (call even on tool errors after check).
   */
  function record(clientId, toolName) {
    const id = clientId || 'anonymous';
    const now = Date.now();
    const list = calls.get(id) || [];
    list.push(now);
    calls.set(id, list);
    if (toolName === 'github_issue_close') {
      const cl = closes.get(id) || [];
      cl.push(now);
      closes.set(id, cl);
    }
  }

  return {check, record};
}
