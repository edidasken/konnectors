/**
 * Filesystem tool implementations for the local-files MCP bridge/adapter.
 * Paths are relative to the single configured root. Symlinks are not followed
 * for authorization; write/delete require explicit confirms where noted.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {displayPath, resolveUnderRoot} from './paths.js';

/**
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
export function createToolRunner(config) {
  const {root, limits} = config;

  return {
    listTools() {
      return TOOL_NAMES.slice();
    },

    /**
     * @param {{name: string, args: Record<string, unknown>}} call
     */
    async invoke({name, args}) {
      try {
        const data = await dispatch(name, args || {});
        return {ok: true, data};
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'TOOL_ERROR',
            message: err && err.message ? String(err.message) : String(err),
          },
        };
      }
    },
  };

  /**
   * @param {string} name
   * @param {Record<string, unknown>} args
   */
  async function dispatch(name, args) {
    switch (name) {
      case 'list_allowed_directories':
        return listAllowedDirectories();
      case 'list_directory':
        return listDirectory(args);
      case 'directory_tree':
        return directoryTree(args);
      case 'search_files':
        return searchFiles(args);
      case 'get_file_info':
        return getFileInfo(args);
      case 'set_file_info':
        return setFileInfo(args);
      case 'read_file':
        return readFile(args);
      case 'read_text_file':
        return readTextFile(args);
      case 'read_file_chunk':
        return readFileChunk(args);
      case 'read_multiple_files':
        return readMultipleFiles(args);
      case 'write_file':
        return writeFile(args);
      case 'write_file_chunk':
        return writeFileChunk(args);
      case 'edit_file':
        return editFile(args);
      case 'truncate_file':
        return truncateFile(args);
      case 'create_directory':
        return createDirectory(args);
      case 'move_path':
        return movePath(args);
      case 'delete_path':
        return deletePath(args);
      default:
        throw new Error(`unknown tool: ${name}`);
    }
  }

  function listAllowedDirectories() {
    return {directories: [displayPath(root, root) === '.' ? '/' : displayPath(root, root)], root: '/'};
  }

  function listDirectory(args) {
    const dir = resolveUnderRoot(root, /** @type {string} */ (args.path || ''));
    const limit = clampInt(args.limit, 1, limits.maxListLimit, 100);
    const offset = Math.max(0, Number(args.offset) || 0);
    const entries = readdirSync(dir, {withFileTypes: true})
      .map((e) => {
        const abs = join(dir, e.name);
        let kind = 'other';
        try {
          if (e.isDirectory()) kind = 'directory';
          else if (e.isFile()) kind = 'file';
          else if (e.isSymbolicLink()) kind = 'symlink';
        } catch {
          /* ignore */
        }
        return {name: e.name, type: kind, path: displayPath(root, abs)};
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const slice = entries.slice(offset, offset + limit);
    return {entries: slice, total: entries.length, offset, limit};
  }

  function directoryTree(args) {
    const start = resolveUnderRoot(root, /** @type {string} */ (args.path || ''));
    const depth = clampInt(args.depth, 0, limits.maxTreeDepth, 3);
    const limit = clampInt(args.limit, 1, limits.maxListLimit, 200);
    const offset = Math.max(0, Number(args.offset) || 0);
    /** @type {object[]} */
    const flat = [];
    walkTree(start, 0, depth, flat, limit + offset);
    const slice = flat.slice(offset, offset + limit);
    return {entries: slice, total: flat.length, offset, limit, depth};
  }

  /**
   * @param {string} dir
   * @param {number} level
   * @param {number} maxDepth
   * @param {object[]} out
   * @param {number} hardCap
   */
  function walkTree(dir, level, maxDepth, out, hardCap) {
    if (out.length >= hardCap) return;
    let names;
    try {
      names = readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    names.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of names) {
      if (out.length >= hardCap) return;
      const abs = join(dir, e.name);
      const type = e.isDirectory() ? 'directory' : e.isSymbolicLink() ? 'symlink' : e.isFile() ? 'file' : 'other';
      out.push({name: e.name, type, path: displayPath(root, abs), depth: level});
      if (type === 'directory' && level < maxDepth) {
        walkTree(abs, level + 1, maxDepth, out, hardCap);
      }
    }
  }

  function searchFiles(args) {
    const query = String(args.query || '');
    if (!query) throw new Error('query is required');
    const start = resolveUnderRoot(root, /** @type {string} */ (args.path || ''));
    const maxDepth = clampInt(args.maxDepth, 0, limits.maxTreeDepth, 10);
    const limit = clampInt(args.limit, 1, limits.maxSearchLimit, 100);
    const q = query.toLowerCase();
    /** @type {object[]} */
    const hits = [];
    searchWalk(start, 0, maxDepth, q, hits, limit);
    return {matches: hits, query, limit};
  }

  function searchWalk(dir, level, maxDepth, q, hits, limit) {
    if (hits.length >= limit) return;
    let names;
    try {
      names = readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const e of names) {
      if (hits.length >= limit) return;
      const abs = join(dir, e.name);
      if (e.name.toLowerCase().includes(q)) {
        hits.push({
          name: e.name,
          type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
          path: displayPath(root, abs),
        });
      }
      if (e.isDirectory() && level < maxDepth) {
        searchWalk(abs, level + 1, maxDepth, q, hits, limit);
      }
    }
  }

  function getFileInfo(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    if (!existsSync(abs)) throw new Error('path not found');
    const st = statSync(abs);
    return {
      path: displayPath(root, abs),
      type: st.isDirectory() ? 'directory' : st.isFile() ? 'file' : 'other',
      size: st.size,
      mode: st.mode,
      uid: st.uid,
      gid: st.gid,
      atime: st.atime.toISOString(),
      mtime: st.mtime.toISOString(),
      ctime: st.ctime.toISOString(),
      birthtime: st.birthtime.toISOString(),
      nlink: st.nlink,
      dev: st.dev,
      ino: st.ino,
    };
  }

  function setFileInfo(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    if (!existsSync(abs)) throw new Error('path not found');
    if (args.mode != null) {
      const mode = Number(args.mode);
      if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) {
        throw new Error('mode out of range');
      }
      chmodSync(abs, mode);
    }
    if (args.atime != null || args.mtime != null) {
      const st = statSync(abs);
      const atime = args.atime != null ? new Date(String(args.atime)) : st.atime;
      const mtime = args.mtime != null ? new Date(String(args.mtime)) : st.mtime;
      if (Number.isNaN(atime.getTime()) || Number.isNaN(mtime.getTime())) {
        throw new Error('invalid atime or mtime');
      }
      utimesSync(abs, atime, mtime);
    }
    return getFileInfo({path: args.path});
  }

  function readFile(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const st = statSync(abs);
    if (!st.isFile()) throw new Error('not a file');
    if (st.size > limits.maxReadBytes) {
      throw new Error(`file exceeds max read size (${limits.maxReadBytes} bytes); use read_file_chunk`);
    }
    const buf = readFileSync(abs);
    if (isProbablyBinary(buf)) {
      return {
        path: displayPath(root, abs),
        encoding: 'base64',
        content: buf.toString('base64'),
        bytes: buf.length,
      };
    }
    return {
      path: displayPath(root, abs),
      encoding: 'utf8',
      content: buf.toString('utf8'),
      bytes: buf.length,
    };
  }

  function readTextFile(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const st = statSync(abs);
    if (!st.isFile()) throw new Error('not a file');
    if (st.size > limits.maxMultiReadBytes) {
      throw new Error(`file exceeds text read size (${limits.maxMultiReadBytes} bytes)`);
    }
    const buf = readFileSync(abs);
    if (isProbablyBinary(buf)) throw new Error('binary files are rejected');
    return {
      path: displayPath(root, abs),
      encoding: 'utf8',
      content: buf.toString('utf8'),
      bytes: buf.length,
    };
  }

  function readFileChunk(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const offset = Math.max(0, Number(args.offset) || 0);
    const length = clampInt(args.length, 1, limits.maxChunkBytes, limits.maxChunkBytes);
    const st = statSync(abs);
    if (!st.isFile()) throw new Error('not a file');
    const fd = openSync(abs, 'r');
    try {
      const buf = Buffer.alloc(Math.min(length, Math.max(0, st.size - offset)));
      const n = readSync(fd, buf, 0, buf.length, offset);
      return {
        path: displayPath(root, abs),
        offset,
        length: n,
        totalSize: st.size,
        encoding: 'base64',
        content: buf.subarray(0, n).toString('base64'),
      };
    } finally {
      closeSync(fd);
    }
  }

  function readMultipleFiles(args) {
    const paths = args.paths;
    if (!Array.isArray(paths) || paths.length < 1) throw new Error('paths required');
    if (paths.length > limits.maxMultiFiles) {
      throw new Error(`at most ${limits.maxMultiFiles} files`);
    }
    /** @type {object[]} */
    const files = [];
    for (const p of paths) {
      const abs = resolveUnderRoot(root, String(p));
      const st = statSync(abs);
      if (!st.isFile()) throw new Error(`not a file: ${p}`);
      if (st.size > limits.maxMultiReadBytes) throw new Error(`file too large: ${p}`);
      const buf = readFileSync(abs);
      if (isProbablyBinary(buf)) throw new Error(`binary rejected: ${p}`);
      files.push({
        path: displayPath(root, abs),
        encoding: 'utf8',
        content: buf.toString('utf8'),
        bytes: buf.length,
      });
    }
    return {files};
  }

  function writeFile(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const overwrite = Boolean(args.overwrite);
    if (existsSync(abs) && !overwrite) {
      throw new Error('file exists; pass overwrite=true to replace');
    }
    mkdirSync(dirname(abs), {recursive: true});
    const encoding = args.encoding === 'base64' ? 'base64' : 'utf8';
    const content = args.content == null ? '' : String(args.content);
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
    writeFileSync(abs, buf);
    return {path: displayPath(root, abs), bytes: buf.length, overwritten: existsSync(abs)};
  }

  function writeFileChunk(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const offset = Math.max(0, Number(args.offset) || 0);
    const content = requireString(args.content, 'content');
    const buf = Buffer.from(content, 'base64');
    if (!buf.length) throw new Error('content required');
    mkdirSync(dirname(abs), {recursive: true});
    const fd = openSync(abs, existsSync(abs) ? 'r+' : 'w');
    try {
      writeSync(fd, buf, 0, buf.length, offset);
    } finally {
      closeSync(fd);
    }
    return {path: displayPath(root, abs), offset, bytesWritten: buf.length};
  }

  function editFile(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const oldText = requireString(args.oldText, 'oldText');
    const newText = args.newText == null ? '' : String(args.newText);
    const text = readFileSync(abs, 'utf8');
    const first = text.indexOf(oldText);
    if (first < 0) throw new Error('oldText not found');
    const second = text.indexOf(oldText, first + oldText.length);
    if (second >= 0) throw new Error('oldText appears more than once');
    const next = text.slice(0, first) + newText + text.slice(first + oldText.length);
    writeFileSync(abs, next, 'utf8');
    return {path: displayPath(root, abs), bytes: Buffer.byteLength(next, 'utf8')};
  }

  function truncateFile(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const confirmPath = requireString(args.confirmPath, 'confirmPath');
    if (String(args.path) !== confirmPath) {
      throw new Error('confirmPath must exactly match path');
    }
    const size = Number(args.size);
    if (!Number.isInteger(size) || size < 0) throw new Error('size must be a non-negative integer');
    if (!existsSync(abs)) throw new Error('path not found');
    const fd = openSync(abs, 'r+');
    try {
      ftruncateSync(fd, size);
    } finally {
      closeSync(fd);
    }
    return {path: displayPath(root, abs), size};
  }

  function createDirectory(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    mkdirSync(abs, {recursive: true});
    return {path: displayPath(root, abs), created: true};
  }

  function movePath(args) {
    const from = resolveUnderRoot(root, requireString(args.from, 'from'));
    const to = resolveUnderRoot(root, requireString(args.to, 'to'));
    const overwrite = Boolean(args.overwrite);
    if (!existsSync(from)) throw new Error('from not found');
    if (existsSync(to)) {
      if (!overwrite) throw new Error('destination exists; pass overwrite=true');
      const st = statSync(to);
      if (st.isDirectory()) throw new Error('directory replacement is refused');
      rmSync(to);
    }
    mkdirSync(dirname(to), {recursive: true});
    renameSync(from, to);
    return {
      from: displayPath(root, from),
      to: displayPath(root, to),
      name: basename(to),
    };
  }

  function deletePath(args) {
    const abs = resolveUnderRoot(root, requireString(args.path, 'path'));
    const confirmPath = requireString(args.confirmPath, 'confirmPath');
    if (String(args.path) !== confirmPath) {
      throw new Error('confirmPath must exactly match path');
    }
    if (!existsSync(abs)) throw new Error('path not found');
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (!args.recursive) throw new Error('recursive=true is required for directories');
      rmSync(abs, {recursive: true, force: false});
    } else {
      rmSync(abs);
    }
    return {path: displayPath(root, abs), deleted: true};
  }
}

export const TOOL_NAMES = [
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
];

function requireString(v, name) {
  if (v == null || String(v) === '') throw new Error(`${name} is required`);
  return String(v);
}

function clampInt(v, min, max, fallback) {
  if (v == null || v === '') return fallback;
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {Buffer} buf
 */
function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
