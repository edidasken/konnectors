import {describe, it, before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createToolRunner, TOOL_NAMES} from '../src/tools.js';

describe('tools', () => {
  /** @type {ReturnType<typeof createToolRunner>} */
  let tools;
  /** @type {string} */
  let root;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'kf-tools-'));
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'hello.txt'), 'hello world');
    writeFileSync(join(root, 'docs', 'note.txt'), 'alpha beta alpha');
    tools = createToolRunner({
      root,
      serverName: 'test',
      http: {enabled: false, bind: '127.0.0.1', port: 0, basePath: '/mcp', bearer: null, publicExposure: 'none'},
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
  });

  it('exports the live tool surface', () => {
    for (const name of [
      'list_allowed_directories',
      'list_directory',
      'directory_tree',
      'search_files',
      'get_file_info',
      'set_file_info',
      'read_file',
      'read_text_file',
      'read_file_chunk',
      'read_multiple_files',
      'write_file',
      'write_file_chunk',
      'edit_file',
      'truncate_file',
      'create_directory',
      'move_path',
      'delete_path',
    ]) {
      assert.ok(TOOL_NAMES.includes(name), name);
    }
  });

  it('lists and reads', async () => {
    const listed = await tools.invoke({name: 'list_directory', args: {path: 'docs'}});
    assert.equal(listed.ok, true);
    assert.ok(listed.data.entries.some((e) => e.name === 'hello.txt'));

    const read = await tools.invoke({name: 'read_file', args: {path: 'docs/hello.txt'}});
    assert.equal(read.ok, true);
    assert.equal(read.data.content, 'hello world');
  });

  it('searches names', async () => {
    const r = await tools.invoke({name: 'search_files', args: {query: 'hello'}});
    assert.equal(r.ok, true);
    assert.ok(r.data.matches.some((m) => m.name === 'hello.txt'));
  });

  it('edits exactly once', async () => {
    const bad = await tools.invoke({
      name: 'edit_file',
      args: {path: 'docs/note.txt', oldText: 'alpha', newText: 'ALPHA'},
    });
    assert.equal(bad.ok, false);

    const ok = await tools.invoke({
      name: 'edit_file',
      args: {path: 'docs/note.txt', oldText: 'alpha beta alpha', newText: 'one'},
    });
    assert.equal(ok.ok, true);
    assert.equal(readFileSync(join(root, 'docs', 'note.txt'), 'utf8'), 'one');
  });

  it('write/move/delete with confirms', async () => {
    let r = await tools.invoke({
      name: 'write_file',
      args: {path: 'docs/new.txt', content: 'x', overwrite: false},
    });
    assert.equal(r.ok, true);

    r = await tools.invoke({name: 'move_path', args: {from: 'docs/new.txt', to: 'docs/moved.txt'}});
    assert.equal(r.ok, true);

    r = await tools.invoke({
      name: 'delete_path',
      args: {path: 'docs/moved.txt', confirmPath: 'docs/wrong'},
    });
    assert.equal(r.ok, false);

    r = await tools.invoke({
      name: 'delete_path',
      args: {path: 'docs/moved.txt', confirmPath: 'docs/moved.txt'},
    });
    assert.equal(r.ok, true);
  });

  it('chunks read/write', async () => {
    const payload = Buffer.from('abcdefghij');
    let r = await tools.invoke({
      name: 'write_file_chunk',
      args: {path: 'docs/chunk.bin', offset: 0, content: payload.toString('base64')},
    });
    assert.equal(r.ok, true);

    r = await tools.invoke({
      name: 'read_file_chunk',
      args: {path: 'docs/chunk.bin', offset: 2, length: 4},
    });
    assert.equal(r.ok, true);
    assert.equal(Buffer.from(r.data.content, 'base64').toString('utf8'), 'cdef');
  });

  it('creates directory tree listing', async () => {
    await tools.invoke({name: 'create_directory', args: {path: 'docs/nested/deep'}});
    const tree = await tools.invoke({name: 'directory_tree', args: {path: 'docs', depth: 2, limit: 50}});
    assert.equal(tree.ok, true);
    assert.ok(tree.data.entries.some((e) => e.name === 'nested'));
  });
});
