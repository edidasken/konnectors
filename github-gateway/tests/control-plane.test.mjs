/**
 * Ticket 57 control plane: auth, registry, toggles, no secrets in UI/API.
 * No live PAT, no real launchctl bootstrap required.
 */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  mkdtempSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {parseControlConfigText, loadControlConfig} from '../control/src/config.js';
import {loadRegistry, validateRegistry} from '../control/src/registry.js';
import {
  setPasswordFile,
  verifyPasswordFile,
  createSession,
  verifySession,
  revokeSession,
} from '../control/src/auth.js';
import {createControlAudit, summarizeServerAudit} from '../control/src/audit.js';
import {buildServerStatus} from '../control/src/status.js';
import {toggleServer} from '../control/src/toggle.js';
import {startControlServer, assertNoSecrets} from '../control/src/server.js';
import {renderPage} from '../control/src/ui.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'mcp-cp-'));
}

function write(path, text) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, text, {encoding: 'utf8', mode: 0o600});
}

function makeWorkspace() {
  const dir = tempDir();
  const passwordPath = join(dir, 'password.json');
  const sessionsPath = join(dir, 'sessions.json');
  const auditPath = join(dir, 'control-audit.jsonl');
  const registryPath = join(dir, 'registry.toml');
  const gatewayAudit = join(dir, 'gateway-audit.jsonl');
  const tokenPath = join(dir, 'token-file');
  const keysPath = join(dir, 'keys.json');
  const gatewayConfig = join(dir, 'gateway-config.toml');

  write(tokenPath, 'not-a-real-pat-placeholder-for-exists-check\n');
  write(keysPath, JSON.stringify({version: 1, keys: []}));
  write(
    gatewayConfig,
    `version = 1
[transport]
stdio.enabled = true
http.enabled = true
http.bind = "127.0.0.1"
http.port = 8743
[auth]
keys_path = "${keysPath}"
[github]
token_source = "file"
token_file = "${tokenPath}"
[allowlist]
repositories = ["edidasken/*"]
actions = ["github_issue_read", "github_issue_comment", "github_issue_close"]
[audit]
path = "${gatewayAudit}"
[rate_limit]
per_client_per_minute = 60
per_client_per_day = 2000
close_per_client_per_hour = 30
`,
  );
  write(
    gatewayAudit,
    `${JSON.stringify({
      ts: '2026-11-25T01:00:00.000Z',
      client_id: 'test-client',
      tool: 'github_issue_read',
      outcome: 'ok',
      owner: 'edidasken',
      repo: 'code',
      issue_number: 63,
    })}\n${JSON.stringify({
      ts: '2026-11-25T01:05:00.000Z',
      client_id: 'test-client',
      tool: 'github_issue_close',
      outcome: 'denied',
      error_class: 'NOT_MERGED',
      error: 'PR not merged',
    })}\n`,
  );

  write(
    registryPath,
    `version = 1
[[managed_servers]]
id = "github-gateway"
display_name = "GitHub MCP gateway"
description = "Server-side GitHub Issues MCP for allowlisted edidasken repos."
unit = "com.konnectors.github-mcp-gateway"
health_url = "http://127.0.0.1:9/health"
config_path = "${gatewayConfig}"
audit_path = "${gatewayAudit}"
token_configured_path = "${tokenPath}"
tools = ["github_issue_read"]
allowed_repositories = ["edidasken/*"]
`,
  );

  const configPath = join(dir, 'config.toml');
  write(
    configPath,
    `version = 1
[listen]
bind = "127.0.0.1"
port = 0
public_exposure = "tailscale"
funnel_acknowledged_by_operator = false
[auth]
password_path = "${passwordPath}"
sessions_path = "${sessionsPath}"
session_ttl_hours = 2
cookie_name = "mcp_cp_session"
[registry]
path = "${registryPath}"
[audit]
path = "${auditPath}"
`,
  );

  setPasswordFile(passwordPath, 'test-operator-password-ok');
  return {
    dir,
    configPath,
    passwordPath,
    sessionsPath,
    auditPath,
    registryPath,
    gatewayAudit,
  };
}

test('example control config and registry exist and name github-gateway first', () => {
  const cfg = readFileSync(join(root, 'control/config.example.toml'), 'utf8');
  const reg = readFileSync(join(root, 'control/registry.example.toml'), 'utf8');
  assert.match(cfg, /version = 1/);
  assert.match(cfg, /public_exposure = "tailscale"/);
  assert.match(cfg, /funnel_acknowledged_by_operator = false/);
  assert.match(reg, /id = "github-gateway"/);
  assert.match(reg, /com\.konnectors\.github-mcp-gateway/);
  assert.match(reg, /\[\[managed_servers\]\]/);
  assert.doesNotMatch(cfg, /\bghp_/);
  assert.doesNotMatch(reg, /\bgithub_pat_/);
});

test('control config rejects public bind and unacked funnel', () => {
  assert.throws(
    () =>
      parseControlConfigText(`version = 1
[listen]
bind = "0.0.0.0"
port = 8750
[auth]
password_path = "/tmp/p"
sessions_path = "/tmp/s"
[registry]
path = "/tmp/r"
[audit]
path = "/tmp/a"
`),
    /wildcard|0\.0\.0\.0/i,
  );
  assert.throws(
    () =>
      parseControlConfigText(`version = 1
[listen]
bind = "127.0.0.1"
port = 8750
public_exposure = "funnel"
funnel_acknowledged_by_operator = false
[auth]
password_path = "/tmp/p"
sessions_path = "/tmp/s"
[registry]
path = "/tmp/r"
[audit]
path = "/tmp/a"
`),
    /Funnel/i,
  );
});

test('password and session auth round-trip; revoke works', () => {
  const ws = makeWorkspace();
  assert.equal(verifyPasswordFile(ws.passwordPath, 'wrong-password-xx').ok, false);
  assert.equal(verifyPasswordFile(ws.passwordPath, 'test-operator-password-ok').ok, true);
  const sess = createSession(ws.sessionsPath, {who: 'operator', ttlHours: 1});
  assert.equal(verifySession(ws.sessionsPath, sess.token).ok, true);
  revokeSession(ws.sessionsPath, sess.token);
  assert.equal(verifySession(ws.sessionsPath, sess.token).ok, false);
  const stored = readFileSync(ws.passwordPath, 'utf8');
  assert.doesNotMatch(stored, /test-operator-password-ok/);
});

test('registry requires managed_servers and validates github-gateway shape', () => {
  const ws = makeWorkspace();
  const reg = loadRegistry(ws.registryPath);
  assert.equal(reg.servers[0].id, 'github-gateway');
  assert.throws(() => validateRegistry({version: 1, managed_servers: []}), /non-empty/);
});

test('audit summary and toggle write control audit without secrets', () => {
  const ws = makeWorkspace();
  const summary = summarizeServerAudit(ws.gatewayAudit);
  assert.equal(summary.last_call.tool, 'github_issue_close');
  assert.equal(summary.recent_errors[0].error_class, 'NOT_MERGED');

  const audit = createControlAudit({path: ws.auditPath});
  const calls = [];
  const result = toggleServer(
    {id: 'github-gateway', unit: 'com.konnectors.github-mcp-gateway', display_name: 'GW'},
    'off',
    {
      who: 'operator',
      audit,
      runner: (server, action) => {
        calls.push({id: server.id, action});
        return {ok: true, detail: 'stopped'};
      },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{id: 'github-gateway', action: 'stop'}]);
  const lines = readFileSync(ws.auditPath, 'utf8').trim().split('\n');
  const last = JSON.parse(lines.at(-1));
  assert.equal(last.event, 'control_toggle');
  assert.equal(last.who, 'operator');
  assert.equal(last.desired, 'off');
  assert.equal(last.server_id, 'github-gateway');
  assert.doesNotMatch(JSON.stringify(last), /\bghp_/);
});

test('status lists tools, allowlist, configured flags; never secrets', async () => {
  const ws = makeWorkspace();
  const reg = loadRegistry(ws.registryPath);
  const status = await buildServerStatus(reg.servers[0], {
    launchdStatus: () => ({running: false, detail: 'not_loaded'}),
    fetchImpl: async () => ({ok: false, status: 503, json: async () => ({})}),
  });
  assert.equal(status.id, 'github-gateway');
  assert.ok(status.tools.includes('github_issue_read'));
  assert.ok(status.allowed_repositories.includes('edidasken/*'));
  assert.equal(status.secrets.github_token_configured, true);
  assert.equal(status.secrets.client_keys_configured, true);
  assert.equal(status.status.state, 'stopped');
  assertNoSecrets(status);
  const html = renderPage({signedIn: true, who: 'operator', servers: [status]});
  assert.match(html, /GitHub MCP gateway/);
  assert.match(html, /configured/);
  assert.doesNotMatch(html, /not-a-real-pat-placeholder/);
  assert.doesNotMatch(html, /test-operator-password/);
});

test('HTTP: unauthenticated UI is 401; login + list + toggle work; /health open', async () => {
  const ws = makeWorkspace();
  // Fix port 0 — validateControlConfig requires integer; load then override listen.port via rewrite
  let cfgText = readFileSync(ws.configPath, 'utf8');
  cfgText = cfgText.replace('port = 0', 'port = 18750');
  write(ws.configPath, cfgText);
  const config = loadControlConfig(ws.configPath);
  // Use ephemeral port
  config.listen.port = 0;
  const audit = createControlAudit({path: ws.auditPath});
  let toggled = null;
  const http = await startControlServer({
    config,
    audit,
    deps: {
      launchdStatus: () => ({running: true, detail: 'loaded'}),
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ok: true, status: 'running'}),
      }),
      toggleRunner: (server, action) => {
        toggled = {id: server.id, action};
        return {ok: true, detail: 'ok'};
      },
    },
  });

  try {
    const health = await fetch(`http://127.0.0.1:${http.port}/health`);
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.service, 'mcp-control-plane');

    const denied = await fetch(`http://127.0.0.1:${http.port}/`, {
      headers: {Accept: 'text/html'},
      redirect: 'manual',
    });
    assert.equal(denied.status, 401);

    const apiDenied = await fetch(`http://127.0.0.1:${http.port}/api/servers`);
    assert.equal(apiDenied.status, 401);

    const login = await fetch(`http://127.0.0.1:${http.port}/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: 'password=test-operator-password-ok',
      redirect: 'manual',
    });
    assert.equal(login.status, 303);
    const cookie = login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie');
    assert.ok(cookie && cookie.includes('mcp_cp_session='));
    assert.ok(cookie.toLowerCase().includes('httponly'));

    const page = await fetch(`http://127.0.0.1:${http.port}/`, {
      headers: {Cookie: cookie.split(';')[0], Accept: 'text/html'},
    });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /GitHub MCP gateway/);
    assert.match(html, /github_issue_read/);
    assert.match(html, /edidasken\/\*/);
    assert.doesNotMatch(html, /\bghp_/);
    assert.doesNotMatch(html, /test-operator-password-ok/);

    const api = await fetch(`http://127.0.0.1:${http.port}/api/servers`, {
      headers: {Cookie: cookie.split(';')[0]},
    });
    assert.equal(api.status, 200);
    const payload = await api.json();
    assert.equal(payload.servers[0].id, 'github-gateway');
    assertNoSecrets(payload);

    const toggle = await fetch(`http://127.0.0.1:${http.port}/toggle`, {
      method: 'POST',
      headers: {
        Cookie: cookie.split(';')[0],
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'id=github-gateway&desired=off',
      redirect: 'manual',
    });
    assert.equal(toggle.status, 303);
    assert.deepEqual(toggled, {id: 'github-gateway', action: 'stop'});

    const auditLines = readFileSync(ws.auditPath, 'utf8');
    assert.match(auditLines, /control_toggle/);
    assert.match(auditLines, /control_login/);
    assert.doesNotMatch(auditLines, /test-operator-password-ok/);
  } finally {
    await http.close();
  }
});

test('control-page.md and launchd/scripts artifacts exist', () => {
  const doc = readFileSync(join(root, 'docs/control-page.md'), 'utf8');
  assert.ok(doc.length > 500);
  for (const needle of [
    'Tailscale',
    'sign-in',
    'Funnel',
    'audit',
    'managed_servers',
    'never',
    'host operator',
    '8750',
  ]) {
    assert.ok(doc.includes(needle), `control-page.md missing ${needle}`);
  }
  assert.doesNotMatch(doc, /\bghp_[A-Za-z0-9_]{20,}\b/);

  const plist = readFileSync(join(root, 'launchd/com.konnectors.mcp-control-plane.plist'), 'utf8');
  assert.match(plist, /com\.konnectors\.mcp-control-plane/);
  assert.match(plist, /\/path\/to\/node-prefix/);
  assert.match(plist, /control\/src\/index\.js/);

  for (const rel of [
    'scripts/install-control-launchd.sh',
    'scripts/control-ctl.sh',
    'scripts/set-control-password.js',
  ]) {
    assert.ok(existsSync(join(root, rel)), rel);
  }
  chmodSync(join(root, 'scripts/install-control-launchd.sh'), 0o755);
  chmodSync(join(root, 'scripts/control-ctl.sh'), 0o755);
});
