/**
 * Ticket 56 service artifacts: launchd unit, install scripts, service docs.
 * No live PAT, no launchctl bootstrap on a real Mac required in CI.
 */
import assert from 'node:assert/strict';
import {readFileSync, statSync, accessSync, constants} from 'node:fs';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('launchd plist uses /path/to/node-prefix and recovery keys', () => {
  const plist = read('launchd/com.konnectors.github-mcp-gateway.plist');
  assert.match(plist, /com\.konnectors\.github-mcp-gateway/);
  assert.match(plist, /\/path\/to\/node-prefix/);
  assert.match(plist, /__NODE_BIN__/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /src\/index\.js/);
  assert.match(plist, /NOT Homebrew/i);
  assert.doesNotMatch(plist, /\/opt\/homebrew\/bin\/node/);
  assert.doesNotMatch(plist, /<string>.*funnel/i);
});

test('install/uninstall/ctl scripts are present shell scripts and document Node path', () => {
  for (const rel of [
    'scripts/install-launchd.sh',
    'scripts/uninstall-launchd.sh',
    'scripts/launchd-ctl.sh',
  ]) {
    const abs = join(root, rel);
    assert.ok(statSync(abs).isFile(), rel);
    const text = read(rel);
    assert.match(text, /^#!/);
    // Execute bit may be missing after Contents-API imports; CI chmods before npm test.
    try {
      accessSync(abs, constants.X_OK);
    } catch {
      // non-fatal when mode bits were not preserved
    }
    assert.match(text, /com\.konnectors\.github-mcp-gateway/);
  }
  const install = read('scripts/install-launchd.sh');
  assert.match(install, /\/path\/to\/node-prefix/);
  assert.match(install, /Homebrew/);
  assert.match(install, /Funnel/);
  assert.match(install, /GITHUB_MCP_GATEWAY_SKIP_START/);
  assert.doesNotMatch(install, /\bghp_/);
  assert.doesNotMatch(install, /\bgithub_pat_/);
});

test('service.md covers install, recovery, health, Tailscale, and Funnel decision', () => {
  const doc = read('docs/service.md');
  assert.ok(doc.length > 500);
  for (const needle of [
    '/path/to/node-prefix',
    'install-launchd.sh',
    'launchd-ctl.sh',
    'start',
    'stop',
    'restart',
    'gateway.log',
    '/health',
    'KeepAlive',
    'reboot',
    'Tailscale',
    'MagicDNS',
    'off-tailnet',
    'Funnel',
    'decision for the host operator',
    'NOT enabled',
  ]) {
    assert.ok(doc.toLowerCase().includes(needle.toLowerCase()) || doc.includes(needle), `service.md missing ${needle}`);
  }
  assert.match(doc, /may not be able to/i);
  assert.match(doc, /off-tailnet/i);
  assert.doesNotMatch(doc, /\bghp_[A-Za-z0-9_]{20,}\b/);
  assert.doesNotMatch(doc, /\bgithub_pat_[A-Za-z0-9_]{20,}\b/);
});

test('docs index and README point at service.md for ticket 56', () => {
  const index = read('docs/index.md');
  assert.match(index, /service\.md/);
  assert.match(index, /56|ticket 56|#62/i);

  const readme = read('README.md');
  assert.match(readme, /service\.md/);
  assert.match(readme, /edidasken\/code#62/);
});
