import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  assertInside,
  displayInRoots,
  displayPath,
  resolveInRoots,
  resolveUnderRoot,
} from '../src/paths.js';

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

  it('resolveInRoots accepts absolute paths under any allowed root', () => {
    const other = mkdtempSync(join(tmpdir(), 'grape nuts-'));
    writeFileSync(join(other, 'note.txt'), 'x');
    const hit = resolveInRoots([root, other], join(other, 'note.txt'));
    assert.equal(hit.root, other);
    assert.equal(displayInRoots([root, other], hit.root, hit.absolute), join(other, 'note.txt'));
  });

  it('resolveInRoots uses the first root for relative paths', () => {
    const other = mkdtempSync(join(tmpdir(), 'kf-other-'));
    const hit = resolveInRoots([root, other], 'sub/a.txt');
    assert.equal(hit.root, root);
    assert.equal(displayInRoots([root], hit.root, hit.absolute), 'sub/a.txt');
  });
});
