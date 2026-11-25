/**
 * Health endpoint: liveness without secrets. No live PAT / GitHub.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeTempWorkspace, createTestContext} from './helpers.mjs';
import {startHttpTransport, HEALTH_PATH} from '../src/transport/http.js';

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bghs_[A-Za-z0-9_]{20,}\b/,
  /test-mock-token-not-a-real-pat/,
];

test('GET /health returns ok without auth and without secrets', async () => {
  const ws = makeTempWorkspace();
  const ctx = createTestContext(ws, {});
  const http = await startHttpTransport(ctx, {bind: '127.0.0.1', port: 0});
  try {
    const res = await fetch(`http://127.0.0.1:${http.port}${HEALTH_PATH}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.status, 'running');
    assert.equal(body.service, 'github-mcp-gateway');
    assert.equal(body.transport, 'http');
    assert.equal(typeof body.uptime_seconds, 'number');
    assert.equal(body.listen.mcp_path, '/mcp');
    assert.equal(body.listen.health_path, HEALTH_PATH);
    assert.equal(http.healthPath, HEALTH_PATH);

    const text = JSON.stringify(body);
    for (const re of SECRET_PATTERNS) {
      assert.equal(re.test(text), false, `health leaked pattern ${re}`);
    }
    assert.ok(!('token' in body));
    assert.ok(!('keys_path' in body));
    assert.ok(!('authorization' in body));
  } finally {
    await http.close();
  }
});

test('HEAD /health is allowed; POST /health is not', async () => {
  const ws = makeTempWorkspace();
  const ctx = createTestContext(ws, {});
  const http = await startHttpTransport(ctx, {bind: '127.0.0.1', port: 0});
  try {
    const head = await fetch(`http://127.0.0.1:${http.port}${HEALTH_PATH}`, {method: 'HEAD'});
    assert.equal(head.status, 200);

    const post = await fetch(`http://127.0.0.1:${http.port}${HEALTH_PATH}`, {method: 'POST'});
    assert.equal(post.status, 405);
  } finally {
    await http.close();
  }
});

test('MCP path still requires auth while /health does not', async () => {
  const ws = makeTempWorkspace();
  const ctx = createTestContext(ws, {});
  const http = await startHttpTransport(ctx, {bind: '127.0.0.1', port: 0});
  try {
    const health = await fetch(`http://127.0.0.1:${http.port}/health`);
    assert.equal(health.status, 200);

    const mcp = await fetch(`http://127.0.0.1:${http.port}${http.basePath}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'ping'}),
    });
    assert.equal(mcp.status, 401);
  } finally {
    await http.close();
  }
});
