/**
 * Build the shared runtime context from validated config.
 */
import {createAuditLogger} from './audit.js';
import {GitHubClient} from './github/client.js';
import {loadGitHubToken} from './github/token.js';
import {createRateLimiter} from './rate-limit.js';
import {createToolRunner} from './tools/index.js';

/**
 * @param {object} config  validated config
 * @param {object} [overrides]
 * @param {string} [overrides.token]  inject token (tests)
 * @param {typeof fetch} [overrides.fetchImpl]
 */
export function createGatewayContext(config, overrides = {}) {
  const token = overrides.token ?? loadGitHubToken(config.github);
  const github = new GitHubClient({
    token,
    apiBase: config.github.api_base,
    userAgent: config.github.user_agent,
    repositories: config.allowlist.repositories,
    fetchImpl: overrides.fetchImpl,
  });
  const audit = createAuditLogger({
    path: config.audit.path,
    logIssueBodies: config.audit.log_issue_bodies,
  });
  const rateLimiter = createRateLimiter(config.rate_limit);
  const tools = createToolRunner({
    github,
    audit,
    rateLimiter,
    allowlist: config.allowlist,
  });
  return {config, github, audit, rateLimiter, tools, tokenLoaded: true};
}
