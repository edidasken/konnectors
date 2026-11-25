import {describe, it, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createToolRunner} from '../src/tools.js';
import {authorize, startHttp} from '../src/transport/http.js';

describe('http transport', () => {
  const root = mkdtempSync(join(tmpdir(), 'kf-http-'));
  writeFileSync(join(root, 'a.txt'), 'ok');
  const token = 'test-bearer-token-not-a-secret-example';
  const tools = createToolRunner({
    root,
    serverName: 'konnectors-local-files',
    http: {
      enabled: true,
      bind: '127.0.0.1',
      port: 0,
      basePath: '/mcp',
      bearer: token,
      publicExposure: 'none',
    },
    limits: {
      maxReadBytes: 1024 * 1024,
      maxChunkBytes: 64 * 1024,
      maxMultiReadBytes: 1024 * 1024,
      maxMultiFiles: 50,
      maxTreeDepth: 20,
      maxListLimit: 1000,
      maxSearchLimit: 1000,
    },
  });

  /** @type {Awaited<ReturnType<typeof startHttp>>|null} */
  let http = null;

  const config = {
    root,
    serverName: 'konnectors-local-files',
    http: {
      enabled: true,
      bind: '127.0.0.1',
      port: 0,
      basePath: '/mcp',
      bearer: token,
      publicExposure: 'none',
    },
    limits: {
      maxReadBytes: 1024 * 1024,
      maxChunkBytes: 64 * 1024,
      maxMultiReadBytes: 1024 * 1024,
      maxMultiFiles: 50,
      maxTreeDepth: 20,
      maxListLimit: 1000,
      maxSearchLimit: 1000,
    },
  };

  it('starts health without auth and rejects MCP without bearer', async () => {
    http = await startHttp(config, tools);

    const health = await fetch(`http://127.0.0.1:${http.port}/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.ok, true);
    assert.equal(body.service, 'konnectors-local-files');
    assert.ok(!JSON.stringify(body).includes(token));

    const unauth = await fetch(`http://127.0.0.1:${http.port}/mcp`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', method: 'initialize', id: 1, params: {}}),
    });
    assert.equal(unauth.status, 401);
  });

  it('authorize compares bearer safely', () => {
    assert.equal(
      authorize({headers: {authorization: `Bearer ${token}`}}, token),
      true,
    );
    assert.equal(authorize({headers: {authorization: 'Bearer wrong'}}, token), false);
    assert.equal(authorize({headers: {}}, token), false);
  });

  after(async () => {
    if (http) await http.close();
  });
});
