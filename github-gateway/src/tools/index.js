/**
 * Shared tool layer — single implementation for stdio and HTTP.
 */
import {isActionAllowed, isRepoAllowed} from '../allowlist.js';
import {sanitizeErrorMessage} from '../github/client.js';

const MAX_COMMENT_CHARS = 65536;

/**
 * @param {object} deps
 * @param {import('../github/client.js').GitHubClient} deps.github
 * @param {ReturnType<import('../audit.js').createAuditLogger>} deps.audit
 * @param {ReturnType<import('../rate-limit.js').createRateLimiter>} deps.rateLimiter
 * @param {{repositories:string[], actions:string[]}} deps.allowlist
 */
export function createToolRunner(deps) {
  const {github, audit, rateLimiter, allowlist} = deps;

  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {object} opts.args
   * @param {string} opts.clientId
   * @param {string} [opts.transport]
   */
  async function invoke({name, args, clientId, transport = 'unknown'}) {
    const baseAudit = {
      client_id: clientId,
      tool: name,
      transport,
      owner: args?.owner,
      repo: args?.repo,
      issue_number: args?.issue_number,
    };

    try {
      if (!isActionAllowed(name, allowlist.actions)) {
        audit.log({...baseAudit, outcome: 'denied', error_class: 'ACTION_NOT_ALLOWLISTED'});
        return fail('ACTION_NOT_ALLOWLISTED', `Action not allowlisted: ${name}`);
      }

      const rl = rateLimiter.check(clientId, name);
      if (!rl.ok) {
        audit.log({...baseAudit, outcome: 'denied', error_class: rl.reason});
        return fail(rl.reason, `Rate limit exceeded: ${rl.reason}`);
      }
      rateLimiter.record(clientId, name);

      const owner = String(args?.owner ?? '');
      const repo = String(args?.repo ?? '');
      if (!owner || !repo) {
        audit.log({...baseAudit, outcome: 'error', error_class: 'INVALID_ARGS'});
        return fail('INVALID_ARGS', 'owner and repo are required');
      }
      if (!isRepoAllowed(owner, repo, allowlist.repositories)) {
        audit.log({
          ...baseAudit,
          owner,
          repo,
          outcome: 'denied',
          error_class: 'REPO_NOT_ALLOWLISTED',
        });
        return fail('REPO_NOT_ALLOWLISTED', `Repository not allowlisted: ${owner}/${repo}`);
      }

      let result;
      switch (name) {
        case 'github_issue_read':
          result = await toolRead(github, args);
          break;
        case 'github_issue_comment':
          result = await toolComment(github, args);
          break;
        case 'github_issue_close':
          result = await toolClose(github, args, audit, baseAudit);
          break;
        default:
          audit.log({...baseAudit, outcome: 'denied', error_class: 'UNKNOWN_TOOL'});
          return fail('UNKNOWN_TOOL', `Unknown tool: ${name}`);
      }

      audit.log({
        ...baseAudit,
        owner,
        repo,
        outcome: 'ok',
        close_override: result.close_override === true ? true : undefined,
        comment_id: result.comment_id,
        merged_prs: result.merged_prs,
      });
      return {ok: true, data: result.data};
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      const message = sanitizeErrorMessage(err.message || String(err));
      audit.log({
        ...baseAudit,
        outcome: 'error',
        error_class: code,
        error: message,
        close_override: args?.override_unmerged_pr === true ? true : undefined,
      });
      return fail(code, message);
    }
  }

  return {invoke, toolNames: [...allowlist.actions]};
}

async function toolRead(github, args) {
  const issueNumber = requireIssueNumber(args);
  const issue = await github.getIssue(args.owner, args.repo, issueNumber);
  const linked = await github.findLinkedPulls(args.owner, args.repo, issueNumber);
  return {
    data: {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      state_reason: issue.state_reason ?? null,
      html_url: issue.html_url,
      labels: Array.isArray(issue.labels)
        ? issue.labels.map((l) => (typeof l === 'string' ? l : l.name))
        : [],
      linked_prs: linked.linked,
      merged_linked_prs: linked.merged,
    },
  };
}

async function toolComment(github, args) {
  const issueNumber = requireIssueNumber(args);
  const body = args.body;
  if (typeof body !== 'string' || !body.trim()) {
    const err = new Error('body is required and must be non-empty');
    err.code = 'INVALID_ARGS';
    throw err;
  }
  if (body.length > MAX_COMMENT_CHARS) {
    const err = new Error(`body exceeds ${MAX_COMMENT_CHARS} characters`);
    err.code = 'INVALID_ARGS';
    throw err;
  }
  const comment = await github.createComment(args.owner, args.repo, issueNumber, body);
  return {
    comment_id: comment.id,
    data: {
      id: comment.id,
      html_url: comment.html_url,
      body: comment.body,
    },
  };
}

async function toolClose(github, args, audit, baseAudit) {
  const issueNumber = requireIssueNumber(args);
  const stateReason = args.state_reason;
  if (stateReason !== 'completed' && stateReason !== 'not_planned') {
    const err = new Error('state_reason must be completed or not_planned');
    err.code = 'INVALID_ARGS';
    throw err;
  }
  const override = args.override_unmerged_pr === true;

  const linked = await github.findLinkedPulls(args.owner, args.repo, issueNumber);
  if (linked.merged.length === 0 && !override) {
    const err = new Error(
      linked.linked.length === 0
        ? 'Close refused: no linked PR found; pass override_unmerged_pr=true to override (audit-logged)'
        : `Close refused: linked PR(s) ${linked.linked.join(',')} are not merged; pass override_unmerged_pr=true to override (audit-logged)`,
    );
    err.code = 'CLOSE_REQUIRES_MERGED_PR';
    throw err;
  }

  if (override && linked.merged.length === 0) {
    audit.log({
      ...baseAudit,
      outcome: 'override',
      close_override: true,
      linked_prs: linked.linked,
      error_class: 'CLOSE_OVERRIDE',
    });
  }

  const issue = await github.closeIssue(args.owner, args.repo, issueNumber, stateReason);
  return {
    close_override: override && linked.merged.length === 0,
    merged_prs: linked.merged,
    data: {
      number: issue.number,
      state: issue.state,
      state_reason: issue.state_reason ?? stateReason,
      html_url: issue.html_url,
      close_override: override && linked.merged.length === 0,
      merged_linked_prs: linked.merged,
      linked_prs: linked.linked,
    },
  };
}

function requireIssueNumber(args) {
  const n = Number(args.issue_number);
  if (!Number.isInteger(n) || n < 1) {
    const err = new Error('issue_number must be a positive integer');
    err.code = 'INVALID_ARGS';
    throw err;
  }
  return n;
}

function fail(code, message) {
  return {ok: false, error: {code, message}};
}
