/**
 * Test helpers: temp dirs, mock GitHub fetch, fixture config.
 * Never uses a real PAT or live GitHub.
 */
import {mkdtempSync, writeFileSync, mkdirSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseConfigText} from '../src/config.js';
import {issueKey} from '../src/auth/keys.js';
import {createGatewayContext} from '../src/server-context.js';

export const FAKE_TOKEN = 'test-mock-token-not-a-real-pat';

/**
 * @param {object} [opts]
 */
export function makeTempWorkspace(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gmgw-'));
  const keysPath = join(root, 'keys.json');
  const auditPath = join(root, 'audit.jsonl');
  const tokenPath = join(root, 'token');
  writeFileSync(tokenPath, FAKE_TOKEN, {mode: 0o600});
  writeFileSync(keysPath, JSON.stringify({version: 1, keys: []}, null, 2));
  writeFileSync(auditPath, '');

  const issued = issueKey({
    keysPath,
    id: opts.clientId || 'test-client',
    label: opts.label || 'test',
  });

  const configObj = {
    version: 1,
    transport: {
      stdio: {enabled: true},
      http: {
        enabled: true,
        bind: '127.0.0.1',
        port: 0,
        base_path: '/mcp',
        public_exposure: 'none',
        funnel_acknowledged_by_operator: false,
      },
    },
    auth: {
      keys_path: keysPath,
      header: 'Authorization',
      bearer_prefix: true,
      stdio_require_key: false,
    },
    github: {
      token_source: 'file',
      token_file: tokenPath,
      api_base: 'https://api.github.com',
      user_agent: 'edidasken-github-mcp-gateway-test/1',
    },
    allowlist: {
      repositories: ['edidasken/*'],
      actions: ['github_issue_read', 'github_issue_comment', 'github_issue_close'],
    },
    audit: {
      path: auditPath,
      retain_days: 90,
      log_issue_bodies: false,
    },
    rate_limit: {
      per_client_per_minute: 60,
      per_client_per_day: 2000,
      close_per_client_per_hour: 30,
      ...(opts.rate_limit || {}),
    },
  };

  const configPath = join(root, 'config.json');
  writeFileSync(configPath, JSON.stringify(configObj, null, 2));
  const config = parseConfigText(JSON.stringify(configObj), configPath);

  return {
    root,
    keysPath,
    auditPath,
    tokenPath,
    configPath,
    config,
    clientKey: issued.plaintext,
    clientId: issued.id,
  };
}

/**
 * Mock GitHub REST for issue/timeline/PR/comment/close.
 * @param {object} state
 */
export function createMockGitHubFetch(state) {
  const issues = state.issues || {};
  const timelines = state.timelines || {};
  const pulls = state.pulls || {};
  const comments = state.comments || {};

  return async function mockFetch(url, init = {}) {
    const u = String(url);
    const method = (init.method || 'GET').toUpperCase();

    // GET issue
    let m = u.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:\?|$)/);
    if (m && method === 'GET' && !u.includes('/timeline') && !u.includes('/comments')) {
      const key = `${m[1]}/${m[2]}#${m[3]}`;
      const issue = issues[key];
      if (!issue) return json(404, {message: 'Not Found'});
      return json(200, issue);
    }

    // PATCH close
    m = u.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)$/);
    if (m && method === 'PATCH') {
      const key = `${m[1]}/${m[2]}#${m[3]}`;
      const issue = issues[key];
      if (!issue) return json(404, {message: 'Not Found'});
      const body = JSON.parse(init.body || '{}');
      issue.state = body.state || issue.state;
      issue.state_reason = body.state_reason;
      return json(200, issue);
    }

    // POST comment
    m = u.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/comments$/);
    if (m && method === 'POST') {
      const key = `${m[1]}/${m[2]}#${m[3]}`;
      if (!issues[key]) return json(404, {message: 'Not Found'});
      const body = JSON.parse(init.body || '{}');
      const id = 9000 + Object.keys(comments).length;
      const comment = {
        id,
        body: body.body,
        html_url: `https://github.com/${m[1]}/${m[2]}/issues/${m[3]}#issuecomment-${id}`,
      };
      comments[id] = comment;
      return json(201, comment);
    }

    // GET timeline
    m = u.match(/\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)\/timeline/);
    if (m && method === 'GET') {
      const key = `${m[1]}/${m[2]}#${m[3]}`;
      const events = timelines[key] || [];
      return json(200, events);
    }

    // GET pull
    m = u.match(/\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)$/);
    if (m && method === 'GET') {
      const key = `${m[1]}/${m[2]}#${m[3]}`;
      const pr = pulls[key];
      if (!pr) return json(404, {message: 'Not Found'});
      return json(200, pr);
    }

    return json(500, {message: `Unhandled mock URL ${method} ${u}`});
  };
}

function json(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({'content-type': 'application/json'}),
    async text() {
      return JSON.stringify(data);
    },
  };
}

export function readAudit(auditPath) {
  const text = readFileSync(auditPath, 'utf8').trim();
  if (!text) return [];
  return text.split('\n').map((line) => JSON.parse(line));
}

export function seedIssue(state, owner, repo, number, extra = {}) {
  const key = `${owner}/${repo}#${number}`;
  state.issues[key] = {
    number,
    title: extra.title || `Issue ${number}`,
    body: extra.body || 'body',
    state: extra.state || 'open',
    state_reason: null,
    html_url: `https://github.com/${owner}/${repo}/issues/${number}`,
    labels: extra.labels || [],
  };
}

export function seedLinkedPr(state, owner, repo, issueNumber, prNumber, merged) {
  const issueKey = `${owner}/${repo}#${issueNumber}`;
  const timeline = state.timelines[issueKey] || [];
  timeline.push({
    event: 'cross-referenced',
    source: {
      issue: {
        number: prNumber,
        pull_request: {url: `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`},
      },
    },
  });
  state.timelines[issueKey] = timeline;
  state.pulls[`${owner}/${repo}#${prNumber}`] = {
    number: prNumber,
    merged,
    merged_at: merged ? '2026-11-24T00:00:00Z' : null,
    state: merged ? 'closed' : 'open',
  };
}

export function createTestContext(ws, state) {
  return createGatewayContext(ws.config, {
    token: FAKE_TOKEN,
    fetchImpl: createMockGitHubFetch(state),
  });
}

export {mkdirSync, writeFileSync, join};
