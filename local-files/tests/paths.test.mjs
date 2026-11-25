import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assertInside, displayPath, resolveUnderRoot} from '../src/paths.js';

describe('paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'kf-root-'));
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'a.txt'), 'hi');

  it('resolves relative paths under root', () => {
    const abs = resolveUnderRoot(root, 'sub/a.txt');
    assert.equal(displayPath(root, abs), 'sub/a.txt');
  });

  it('rejects escape with ..', () => {
    assert.throws(() => resolveUnderRoot(root, '../outside'), /escapes/);
  });

  it('rejects symlink escape', () => {
    const outside = mkdtempSync(join(tmpdir(), 'kf-out-'));
    writeFileSync(join(outside, 'secret.txt'), 'nope');
    const link = join(root, 'escape-link');
    try {
      symlinkSync(outside, link);
    } catch {
      // skip on platforms without symlink perms
      return;
    }
    assert.throws(() => assertInside(root, join(link, 'secret.txt')), /escapes/);
  });
});
