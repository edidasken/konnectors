import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadConfig, parseArgv} from '../src/config.js';

describe('config', () => {
  const root = mkdtempSync(join(tmpdir(), 'kf-cfg-'));

  it('requires a volumes file, CLI directory, or LOCAL_FILES_ROOT', () => {
    assert.throws(
      () =>
        loadConfig(
          {LOCAL_FILES_VOLUMES_FILE: join(root, 'missing-volumes.conf')},
          [],
        ),
      /No allowed filesystem roots|volumes file not found|LOCAL_FILES_ROOT/,
    );
  });

  it('loads root and defaults from LOCAL_FILES_ROOT fallback', () => {
    const cfg = loadConfig(
      {
        LOCAL_FILES_ROOT: root,
        LOCAL_FILES_VOLUMES_FILE: join(root, 'does-not-exist.conf'),
      },
      [],
    );
    assert.equal(cfg.root, root);
    assert.deepEqual(cfg.roots, [root]);
    assert.equal(cfg.http.enabled, false);
    assert.equal(cfg.http.port, 8792);
  });

  it('loads multiple roots from a volumes file (paths with spaces)', () => {
    const volA = mkdtempSync(join(tmpdir(), 'the diva-'));
    const volB = mkdtempSync(join(tmpdir(), 'grape nuts-'));
    const conf = join(root, 'spaced-volumes.conf');
    writeFileSync(conf, `${volA}\n${volB}\n`);

    const cfg = loadConfig({LOCAL_FILES_VOLUMES_FILE: conf}, []);
    assert.deepEqual(cfg.roots, [volA, volB]);
    assert.equal(cfg.root, volA);
  });

  it('falls back to CLI --allowed-directory when volumes file is missing', () => {
    const cfg = loadConfig(
      {LOCAL_FILES_VOLUMES_FILE: join(root, 'absent.conf')},
      ['--allowed-directory', root],
    );
    assert.deepEqual(cfg.roots, [root]);
  });

  it('falls back to positional CLI directories', () => {
    const cfg = loadConfig(
      {LOCAL_FILES_VOLUMES_FILE: join(root, 'absent.conf')},
      [root],
    );
    assert.deepEqual(cfg.roots, [root]);
  });

  it('prefers volumes file over LOCAL_FILES_ROOT and CLI', () => {
    const fileRoot = mkdtempSync(join(tmpdir(), 'kf-file-root-'));
    const conf = join(root, 'prefer.conf');
    writeFileSync(conf, `${fileRoot}\n`);
    const other = mkdtempSync(join(tmpdir(), 'kf-other-'));
    const cfg = loadConfig(
      {LOCAL_FILES_VOLUMES_FILE: conf, LOCAL_FILES_ROOT: other},
      ['--allowed-directory', other],
    );
    assert.deepEqual(cfg.roots, [fileRoot]);
  });

  it('requires bearer when HTTP enabled', () => {
    assert.throws(
      () =>
        loadConfig(
          {
            LOCAL_FILES_ROOT: root,
            LOCAL_FILES_VOLUMES_FILE: join(root, 'absent.conf'),
            LOCAL_FILES_HTTP: '1',
          },
          [],
        ),
      /BEARER/,
    );
  });

  it('loads bearer from file', () => {
    const tokenFile = join(root, 'token.txt');
    writeFileSync(tokenFile, 'file-token\n');
    const cfg = loadConfig(
      {
        LOCAL_FILES_ROOT: root,
        LOCAL_FILES_VOLUMES_FILE: join(root, 'absent.conf'),
        LOCAL_FILES_HTTP: 'true',
        LOCAL_FILES_BEARER_TOKEN_FILE: tokenFile,
        LOCAL_FILES_PORT: '9001',
      },
      [],
    );
    assert.equal(cfg.http.enabled, true);
    assert.equal(cfg.http.bearer, 'file-token');
    assert.equal(cfg.http.port, 9001);
  });

  it('parses CLI argv helpers', () => {
    const parsed = parseArgv([
      '--volumes-file',
      '/tmp/vols.conf',
      '--server-id',
      'local-files',
      '-d',
      '/tmp/a',
      '--allowed-directory=/tmp/b',
    ]);
    assert.equal(parsed.volumesFile, '/tmp/vols.conf');
    assert.equal(parsed.serverId, 'local-files');
    assert.deepEqual(parsed.directories, ['/tmp/a', '/tmp/b']);
  });
});
