import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig} from '../src/config.js';

describe('config', () => {
  const root = mkdtempSync(join(tmpdir(), 'kf-cfg-'));

  it('requires LOCAL_FILES_ROOT', () => {
    assert.throws(() => loadConfig({}), /LOCAL_FILES_ROOT/);
  });

  it('loads root and defaults', () => {
    const cfg = loadConfig({LOCAL_FILES_ROOT: root});
    assert.equal(cfg.root, root);
    assert.equal(cfg.http.enabled, false);
    assert.equal(cfg.http.port, 8792);
  });

  it('requires bearer when HTTP enabled', () => {
    assert.throws(
      () => loadConfig({LOCAL_FILES_ROOT: root, LOCAL_FILES_HTTP: '1'}),
      /BEARER/,
    );
  });

  it('loads bearer from file', () => {
    const tokenFile = join(root, 'token.txt');
    writeFileSync(tokenFile, 'file-token\n');
    const cfg = loadConfig({
      LOCAL_FILES_ROOT: root,
      LOCAL_FILES_HTTP: 'true',
      LOCAL_FILES_BEARER_TOKEN_FILE: tokenFile,
      LOCAL_FILES_PORT: '9001',
    });
    assert.equal(cfg.http.enabled, true);
    assert.equal(cfg.http.bearer, 'file-token');
    assert.equal(cfg.http.port, 9001);
  });
});
