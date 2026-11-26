import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';
import {
  defaultVolumesFilePath,
  parseVolumesConfig,
  readVolumesFile,
  resolveVolumesFilePath,
} from '../src/volumes.js';

describe('volumes config parsing', () => {
  it('parses paths that contain spaces', () => {
    const text = `
# shared MCP volumes
/Volumes/the diva
/Volumes/grape nuts
"/Volumes/frosted flakes"
/Volumes/data
`;
    assert.deepEqual(parseVolumesConfig(text), [
      '/Volumes/the diva',
      '/Volumes/grape nuts',
      '/Volumes/frosted flakes',
      '/Volumes/data',
    ]);
  });

  it('ignores blanks and comments', () => {
    assert.deepEqual(parseVolumesConfig('# only comment\n\n  \n'), []);
  });

  it('returns null for a missing volumes file', () => {
    const missing = join(tmpdir(), `kf-missing-volumes-${process.pid}-${Date.now()}.conf`);
    assert.equal(readVolumesFile(missing), null);
  });

  it('reads an on-disk volumes file with spaced paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kf-vol-'));
    const file = join(dir, 'local-files-volumes.conf');
    writeFileSync(
      file,
      ['/Volumes/the diva', '/Volumes/grape nuts', '# trailing comment'].join('\n'),
    );
    assert.deepEqual(readVolumesFile(file), ['/Volumes/the diva', '/Volumes/grape nuts']);
  });

  it('defaults to ~/code/mcp/<server>-volumes.conf', () => {
    assert.equal(
      defaultVolumesFilePath('local-files'),
      join(homedir(), 'code', 'mcp', 'local-files-volumes.conf'),
    );
    assert.equal(
      resolveVolumesFilePath({serverId: 'local-files'}),
      join(homedir(), 'code', 'mcp', 'local-files-volumes.conf'),
    );
  });

  it('prefers an explicit volumes file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kf-vol-explicit-'));
    mkdirSync(join(dir, 'nested'), {recursive: true});
    const file = join(dir, 'nested', 'custom.conf');
    assert.equal(resolveVolumesFilePath({volumesFile: file}), file);
  });
});
