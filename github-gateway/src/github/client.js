/**
 * Allowlisted GitHub REST client for v1 issue tools only.
 * Token is held in memory; never logged.
 */
import {isRepoAllowed} from '../allowlist.js';

export class GitHubClient {
  /**
   * @param {object} opts
   * @param {string} opts.token
   * @param {string} opts.apiBase
   * @param {string} opts.userAgent
   * @param {string[]} opts.repositories
   * @param {typeof fetch} [opts.fetchImpl]
   */
  constructor({token, apiBase, userAgent, repositories, fetchImpl}) {
    this.token = token;
    this.apiBase = apiBase.replace(/\/$/, '');
    this.userAgent = userAgent;
    this.repositories = repositories;
    this.fetchImpl = fetchImpl || globalThis.fetch.bind(globalThis);
  }

  assertRepo(owner, repo) {
    if (!isRepoAllowed(owner, repo, this.repositories)) {
      const err = new Error(`Repository not allowlisted: ${owner}/${repo}`);
      err.code = 'REPO_NOT_ALLOWLISTED';
      throw err;
    }
  }

  /**
   * @param {string} method
   * @param {string} path  e.g. /repos/o/r/issues/1
   * @param {object} [body]
   * @param {Record<string,string>} [extraHeaders]
   */
  async request(method, path, body, extraHeaders = {}) {
    const url = path.startsWith('http') ? path : `${this.apiBase}${path}`;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.userAgent,
      Authorization: `Bearer ${this.token}`,
      ...extraHeaders,
    };
    /** @type {RequestInit} */
    const init = {method, headers};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(url, init);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {raw: text.slice(0, 200)};
      }
    }
    if (!res.ok) {
      const msg =
        data && typeof data.message === 'string'
          ? data.message
          : `GitHub API ${res.status}`;
      const err = new Error(sanitizeErrorMessage(msg));
      err.code = 'GITHUB_API_ERROR';
      err.status = res.status;
      throw err;
    }
    return {status: res.status, data, headers: res.headers};
  }

  async getIssue(owner, repo, issueNumber) {
    this.assertRepo(owner, repo);
    const {data} = await this.request(
      'GET',
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
    );
    return data;
  }

  async createComment(owner, repo, issueNumber, body) {
    this.assertRepo(owner, repo);
    const {data} = await this.request(
      'POST',
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {body},
    );
    return data;
  }

  async closeIssue(owner, repo, issueNumber, stateReason) {
    this.assertRepo(owner, repo);
    const {data} = await this.request(
      'PATCH',
      `/repos/${owner}/${repo}/issues/${issueNumber}`,
      {state: 'closed', state_reason: stateReason},
    );
    return data;
  }

  async getPull(owner, repo, pullNumber) {
    this.assertRepo(owner, repo);
    const {data} = await this.request(
      'GET',
      `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    );
    return data;
  }

  /**
   * Collect linked PR numbers from issue timeline cross-references,
   * then check merge state. Behavior per docs/tools.md.
   * @returns {{linked: number[], merged: number[]}}
   */
  async findLinkedPulls(owner, repo, issueNumber) {
    this.assertRepo(owner, repo);
    const linked = new Set();
    let page = 1;
    const perPage = 100;
    for (;;) {
      const {data} = await this.request(
        'GET',
        `/repos/${owner}/${repo}/issues/${issueNumber}/timeline?per_page=${perPage}&page=${page}`,
        undefined,
        {Accept: 'application/vnd.github+json'},
      );
      if (!Array.isArray(data) || data.length === 0) break;
      for (const event of data) {
        if (event.event !== 'cross-referenced') continue;
        const source = event.source;
        if (!source || !source.issue) continue;
        const issue = source.issue;
        if (!issue.pull_request) continue;
        // Same-repo PR number
        if (typeof issue.number === 'number') {
          linked.add(issue.number);
        }
      }
      if (data.length < perPage) break;
      page += 1;
      if (page > 20) break; // safety
    }

    const linkedList = [...linked].sort((a, b) => a - b);
    const merged = [];
    for (const n of linkedList) {
      const pr = await this.getPull(owner, repo, n);
      if (pr.merged === true || pr.merged_at) {
        merged.push(n);
      }
    }
    return {linked: linkedList, merged};
  }
}

/** Strip anything that looks like a token from error strings. */
export function sanitizeErrorMessage(msg) {
  return String(msg)
    .replace(/\b(ghp_|github_pat_|ghs_|gho_|ghu_|ghr_|gmgk_)[A-Za-z0-9._\-]*/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}
