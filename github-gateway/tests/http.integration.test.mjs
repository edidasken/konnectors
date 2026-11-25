/**
 * Integration: authenticated Streamable HTTP + tool invoke path with mocked GitHub.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  makeTempWorkspace,
  createTestContext,
  seedIssue,
  seedLinkedPr,
  readAudit,
} from './helpers.mjs';
import {startHttpTransport} from '../src/transport/http.js';

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // SSE fallback: extract first data: line
    const m = /^data:\s*(.+)$/m.exec(text);
    if (m) {
      try {
        data = JSON.parse(m[1]);
      } catch {
        data = text;
      }
    } else {
      data = text;
    }
  }
  return {status: res.status, headers: res.headers, data};
}

test('HTTP rejects unauthenticated requests with 401', async () => {
  const ws = makeTempWorkspace();
  const state = {issues: {}, timelines: {}, pulls: {}, comments: {}};
  const ctx = createTestContext(ws, state);
  const http = await startHttpTransport(ctx, {bind: '127.0.0.1', port: 0});
  try {
    const url = `http://127.0.0.1:${http.port}${http.basePath}`;
    const res = await postJson(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {name: 'test', version: '0'},
      },
    });
    assert.equal(res.status, 401);
    assert.equal(res.data.error, 'unauthorized');

    const audit = readAudit(ws.auditPath);
    assert.ok(audit.some((e) => e.error_class === 'UNAUTHENTICATED'));
  } finally {
    await http.close();
  }
});

test('HTTP accepts valid API key and initializes MCP session', async () => {
  const ws = makeTempWorkspace();
  const state = {issues: {}, timelines: {}, pulls: {}, comments: {}};
  seedIssue(state, 'edidasken', 'code', 1, {title: 'hi'});
  const ctx = createTestContext(ws, state);
  const http = await startHttpTransport(ctx, {bind: '127.0.0.1', port: 0});
  try {
    const url = `http://127.0.0.1:${http.port}${http.basePath}`;
    const res = await postJson(
      url,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {name: 'test', version: '0'},
        },
      },
      {Authorization: `Bearer ${ws.clientKey}`},
    );
    assert.equal(res.status, 200);
    assert.equal(res.data.result?.serverInfo?.name, 'github-mcp-gateway');
    assert.ok(res.headers.get('mcp-session-id'));
  } finally {
    await http.close();
  }
});

test('shared tool layer: allowlist + close paths via runner used by HTTP', async () => {
  // Transport auth is covered above; close semantics share createToolRunner.
  const ws = makeTempWorkspace();
  const state = {issues: {}, timelines: {}, pulls: {}, comments: {}};
  seedIssue(state, 'edidasken', 'code', 55);
  seedLinkedPr(state, 'edidasken', 'code', 55, 1, true);
  const ctx = createTestContext(ws, state);

  const denied = await ctx.tools.invoke({
    name: 'github_issue_read',
    args: {owner: 'someone', repo: 'else', issue_number: 1},
    clientId: ws.clientId,
    transport: 'http',
  });
  assert.equal(denied.error.code, 'REPO_NOT_ALLOWLISTED');

  const closed = await ctx.tools.invoke({
    name: 'github_issue_close',
    args: {
      owner: 'edidasken',
      repo: 'code',
      issue_number: 55,
      state_reason: 'completed',
    },
    clientId: ws.clientId,
    transport: 'http',
  });
  assert.equal(closed.ok, true);
});
