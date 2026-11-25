/**
 * Config validation, key hash/issue/rotate/revoke, rate limits.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseConfigText, validateConfig} from '../src/config.js';
import {
  hashKey,
  issueKey,
  rotateKey,
  revokeKey,
  verifyKey,
  loadKeyStore,
} from '../src/auth/keys.js';
import {loadGitHubToken} from '../src/github/token.js';
import {createRateLimiter} from '../src/rate-limit.js';
import {makeTempWorkspace, FAKE_TOKEN} from './helpers.mjs';

test('config rejects version != 1', () => {
  assert.throws(() => validateConfig({version: 2}), /version must be 1/);
});

test('config rejects embedded PAT-looking strings', () => {
  const text = `
version = 1
[github]
token_source = "file"
token_file = "/tmp/x"
# sneaky
note = "ghp_abcdefghijklmnopqrstuvwxyz12"
`;
  assert.throws(() => parseConfigText(text), /must not embed GitHub tokens/);
});

test('config rejects funnel without greg acknowledgment', () => {
  const ws = makeTempWorkspace();
  const bad = {
    ...ws.config,
    transport: {
      ...ws.config.transport,
      http: {
        ...ws.config.transport.http,
        public_exposure: 'funnel',
        funnel_acknowledged_by_operator: false,
      },
    },
  };
  assert.throws(() => validateConfig(bad), /funnel_acknowledged_by_operator/);
});

test('config rejects empty allowlists', () => {
  assert.throws(
    () =>
      validateConfig({
        version: 1,
        transport: {stdio: {enabled: true}, http: {enabled: false}},
        auth: {keys_path: '/tmp/k'},
        github: {token_source: 'file', token_file: '/tmp/t'},
        allowlist: {repositories: [], actions: ['github_issue_read']},
        audit: {path: '/tmp/a'},
        rate_limit: {},
      }),
    /repositories/,
  );
});

test('token loads from file; env source for mocks', () => {
  const ws = makeTempWorkspace();
  const token = loadGitHubToken(ws.config.github);
  assert.equal(token, FAKE_TOKEN);

  process.env.GMGW_TEST_TOKEN = 'env-mock-token';
  const envToken = loadGitHubToken({
    token_source: 'env',
    token_env: 'GMGW_TEST_TOKEN',
  });
  assert.equal(envToken, 'env-mock-token');
  delete process.env.GMGW_TEST_TOKEN;
});

test('issue / verify / rotate / revoke client keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gmgw-keys-'));
  const keysPath = join(dir, 'keys.json');
  writeFileSync(keysPath, JSON.stringify({version: 1, keys: []}));

  const issued = issueKey({keysPath, id: 'agent-a', label: 'A'});
  assert.match(issued.plaintext, /^gmgk_/);
  assert.equal(verifyKey(keysPath, issued.plaintext).ok, true);
  assert.equal(verifyKey(keysPath, issued.plaintext).clientId, 'agent-a');

  const store1 = loadKeyStore(keysPath);
  assert.equal(store1.keys.length, 1);
  assert.equal(store1.keys[0].hash, hashKey(issued.plaintext));
  assert.equal(store1.keys[0].revoked_at, null);

  const rotated = rotateKey({keysPath, id: 'agent-a'});
  assert.notEqual(rotated.plaintext, issued.plaintext);
  assert.equal(verifyKey(keysPath, issued.plaintext).ok, false);
  assert.equal(verifyKey(keysPath, issued.plaintext).reason, 'revoked_key');
  assert.equal(verifyKey(keysPath, rotated.plaintext).ok, true);

  revokeKey({keysPath, id: 'agent-a'});
  assert.equal(verifyKey(keysPath, rotated.plaintext).reason, 'revoked_key');
});

test('rate limiter blocks excess calls and close storms', () => {
  const rl = createRateLimiter({
    per_client_per_minute: 2,
    per_client_per_day: 100,
    close_per_client_per_hour: 1,
  });
  assert.equal(rl.check('c1', 'github_issue_read').ok, true);
  rl.record('c1', 'github_issue_read');
  assert.equal(rl.check('c1', 'github_issue_read').ok, true);
  rl.record('c1', 'github_issue_read');
  assert.equal(rl.check('c1', 'github_issue_read').ok, false);

  assert.equal(rl.check('c2', 'github_issue_close').ok, true);
  rl.record('c2', 'github_issue_close');
  assert.equal(rl.check('c2', 'github_issue_close').reason, 'rate_limit_close_per_hour');
});
