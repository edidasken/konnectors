/**
 * Ticket 54 design-skeleton checks.
 * Asserts required docs/config exist, stay secret-free, and encode key design rules.
 * Does not call GitHub and does not load a real PAT.
 */
import assert from 'node:assert/strict';
import {readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'README.md',
  'config.example.toml',
  'docs/index.md',
  'docs/architecture.md',
  'docs/threat-model.md',
  'docs/tools.md',
  'docs/config-schema.md',
  'docs/auth-and-permissions.md',
  'docs/client-setup.md',
  'docs/troubleshooting.md',
  'docs/token-rotation.md',
  'docs/verification.md',
  'examples/README.md',
  'examples/cursor-mcp.http.json',
  'examples/cursor-mcp.stdio.json',
];

const secretPatterns = [
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bghs_[A-Za-z0-9_]{20,}\b/,
  /\bgho_[A-Za-z0-9_]{20,}\b/,
  /\bghu_[A-Za-z0-9_]{20,}\b/,
  /\bghr_[A-Za-z0-9_]{20,}\b/,
];

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

test('required design docs and example config exist', () => {
  for (const rel of requiredFiles) {
    const st = statSync(join(root, rel));
    assert.ok(st.isFile(), `${rel} must be a file`);
    assert.ok(st.size > 100, `${rel} must be non-trivial`);
  }
  assert.ok(statSync(join(root, 'src')).isDirectory(), 'src/ skeleton');
  assert.ok(statSync(join(root, 'scripts')).isDirectory(), 'scripts/ skeleton');
});

test('no committed secrets under github-gateway', () => {
  const files = walkFiles(root).filter((p) => !p.endsWith('.test.mjs'));
  for (const abs of files) {
    const text = readFileSync(abs, 'utf8');
    for (const re of secretPatterns) {
      assert.equal(re.test(text), false, `${abs} matched ${re}`);
    }
  }
  const example = read('config.example.toml');
  assert.match(example, /REPLACE_ME/);
  assert.doesNotMatch(example, /^\s*token\s*=\s*["'][^"']+["']/m);
});

test('example config covers transports, auth, token loading, allowlists, audit, rate limits', () => {
  const cfg = read('config.example.toml');
  for (const needle of [
    'version = 1',
    '[transport]',
    'stdio.enabled',
    'http.enabled',
    'http.public_exposure',
    '[auth]',
    'keys_path',
    '[github]',
    'token_source',
    'token_file',
    '[allowlist]',
    'edidasken/*',
    'github_issue_read',
    'github_issue_comment',
    'github_issue_close',
    '[audit]',
    '[rate_limit]',
  ]) {
    assert.ok(cfg.includes(needle), `config.example.toml missing ${needle}`);
  }
});

test('docs state close-with-merged-PR, forbidden actions, and Tailscale/Funnel decision', () => {
  const tools = read('docs/tools.md');
  assert.match(tools, /override_unmerged_pr/);
  assert.match(tools, /merged/i);
  for (const word of ['Merge', 'Delete', 'Push', 'Admin']) {
    assert.ok(tools.includes(word), `tools.md must forbid ${word}`);
  }

  const threat = read('docs/threat-model.md');
  assert.match(threat, /Funnel/);
  assert.match(threat, /Tailscale/);
  assert.match(threat, /cannot override/i);
  assert.match(threat, /decision for the host operator/i);

  const arch = read('docs/architecture.md');
  assert.match(arch, /stdio/i);
  assert.match(arch, /Streamable HTTP/i);
  assert.match(arch, /control plane/i);

  const auth = read('docs/auth-and-permissions.md');
  assert.match(auth, /hashed/i);
  assert.match(auth, /Never/);
  assert.match(auth, /control page/i);
});

test('README maps docs and ticket 56–58 constraints', () => {
  const readme = read('README.md');
  assert.match(readme, /architecture\.md/);
  assert.match(readme, /threat-model\.md/);
  assert.match(readme, /token-loading\.md/);
  assert.match(readme, /service\.md/);
  assert.match(readme, /client-setup\.md/);
  assert.match(readme, /verification\.md/);
  assert.match(readme, /\/path\/to\/node/);
  assert.match(readme, /edidasken\/code#64/);
  assert.match(readme, /npm test/);
  assert.match(readme, /cannot override/i);
});

test('index lists service, control-page, and ticket 58 client docs as done', () => {
  const index = read('docs/index.md');
  for (const name of [
    'service.md',
    'control-page.md',
    'client-setup',
    'token-rotation',
    'troubleshooting',
    'verification',
    'token-loading',
  ]) {
    assert.ok(index.includes(name), `docs/index.md should mention ${name}`);
  }
  assert.match(index, /Done \(58\)|ticket 58|#64/i);
  assert.doesNotMatch(index, /Later tickets \(stubs/);
});

test('control-page.md exists and forbids secrets / Funnel', () => {
  const doc = read('docs/control-page.md');
  assert.ok(doc.length > 400);
  assert.match(doc, /Tailscale/);
  assert.match(doc, /sign-in/i);
  assert.match(doc, /Funnel/);
  assert.match(doc, /managed_servers/);
  assert.match(doc, /never/i);
});

test('ticket 58 client docs cover hosts, rotation, troubleshooting, cloud honesty', () => {
  const setup = read('docs/client-setup.md');
  for (const needle of [
    'Cursor desktop',
    'Cursor cloud',
    'Claude Code',
    'Claude Desktop',
    'VS Code',
    'Antigravity',
    'Generic MCP',
    'cannot override',
    'REPLACE_ME',
    'auto-approve',
  ]) {
    assert.ok(setup.includes(needle), `client-setup.md missing ${needle}`);
  }

  const trouble = read('docs/troubleshooting.md');
  for (const needle of [
    '401',
    'allowlist',
    'not merged',
    '/health',
    'cannot reach',
    'Funnel',
  ]) {
    assert.ok(trouble.toLowerCase().includes(needle.toLowerCase()), `troubleshooting.md missing ${needle}`);
  }

  const rotation = read('docs/token-rotation.md');
  assert.match(rotation, /--rotate/);
  assert.match(rotation, /--revoke/);
  assert.match(rotation, /PAT|token_file|Keychain/i);
  assert.match(rotation, /leaked/i);
  assert.doesNotMatch(rotation, /\bghp_[A-Za-z0-9_]{20,}\b/);

  const verification = read('docs/verification.md');
  assert.match(verification, /cloud/i);
  assert.match(verification, /Tailscale/i);
  assert.match(verification, /Funnel/);
  assert.match(verification, /two/i);
  assert.match(verification, /throwaway/i);
  assert.match(verification, /Failed|not possible|cannot/i);
});

test('src entry and package.json exist for ticket 55', () => {
  assert.ok(statSync(join(root, 'src/index.js')).isFile());
  assert.ok(statSync(join(root, 'package.json')).isFile());
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.engines?.node?.includes('22') || pkg.engines?.node?.includes('>=22'));
});
