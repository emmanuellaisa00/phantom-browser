import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const RUNTIME_VERSION = '156.0.8078.4';
export const PLAYWRIGHT_VERSION = '1.64.1';
export const REVISION = '1248';
export interface RuntimeManifest {
  format: string; manifest_version: number; playwright: string; platform: string;
  browser: string; version: string; arch: string; fileCount: number;
  files: {path: string; sha256: string}[];
}
export function validRuntimePath(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024 && !/[\\:]/.test(name) && ![...name].some(c => c.charCodeAt(0) < 32) &&
    name.split('/').every(p => !!p && p !== '.' && p !== '..' && !/[. ]$/.test(p) && !/[<>|?*]/.test(p) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p));
}
export function validateRuntimeManifest(raw: unknown, platform: string = process.platform, arch: string = process.arch): RuntimeManifest {
  if (!raw || typeof raw !== 'object') throw Error('Runtime manifest missing or malformed');
  const m = raw as RuntimeManifest;
  const fields = ['format', 'manifest_version', 'playwright', 'platform', 'browser', 'version', 'arch', 'files', 'fileCount'];
  if (Object.keys(m).some(k => !fields.includes(k))) throw Error('Unexpected runtime manifest field');
  if (!['linux', 'win32'].includes(platform) || arch !== 'x64' || m.platform !== platform || m.arch !== arch || m.format !== 'phantom-runtime-manifest' || m.manifest_version !== 1 || m.playwright !== PLAYWRIGHT_VERSION || m.browser !== 'chromium' || m.version !== RUNTIME_VERSION || !Array.isArray(m.files) || !m.files.length || m.files.length > 10000 || m.fileCount !== m.files.length) throw Error('Runtime manifest identity or inventory is invalid');
  const seen = new Set<string>();
  for (const f of m.files) {
    if (!f || typeof f !== 'object' || Object.keys(f).some(k => !['path', 'sha256'].includes(k)) || !validRuntimePath(f.path) || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256) || seen.has(f.path.toLowerCase())) throw Error('Invalid or duplicate runtime manifest entry');
    seen.add(f.path.toLowerCase());
  }
  return m;
}
export function verifyRuntime(root: string, raw: unknown, platform: string = process.platform, arch: string = process.arch): number {
  const manifest = validateRuntimeManifest(raw, platform, arch);
  // Check the runtime root and all its ancestors, not only leaf files.
  for (let p = path.resolve(root); ; p = path.dirname(p)) {
    if (fs.lstatSync(p).isSymbolicLink()) throw Error('Runtime path contains a symbolic link');
    if (p === path.dirname(p)) break;
  }
  const expected = new Map(manifest.files.map(f => [f.path, f.sha256]));
  const directories = new Set<string>();
  for (const name of expected.keys()) {
    let dir = path.posix.dirname(name);
    while (dir !== '.') {directories.add(dir); dir = path.posix.dirname(dir);}
  }
  const found = new Set<string>();
  function walk(dir: string, prefix: string) {
    for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
      const rel = prefix + item.name;
      const full = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw Error('Runtime contains a symbolic link');
      if (item.isDirectory()) {
        if (!directories.has(rel)) throw Error('Unexpected runtime directory');
        walk(full, rel + '/');
      } else if (item.isFile()) {
        const expectedHash = expected.get(rel);
        if (!expectedHash) throw Error('Unexpected runtime file');
        const fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try {
          const digest = createHash('sha256');
          const buffer = Buffer.alloc(1024 * 1024);
          let n: number;
          while ((n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, n));
          if (digest.digest('hex') !== expectedHash) throw Error('Runtime hash mismatch');
        } finally {fs.closeSync(fd);}
        found.add(rel);
      } else throw Error('Unsupported runtime file type');
    }
  }
  walk(root, '');
  if (found.size !== expected.size) throw Error('Missing runtime file');
  const executable = platform === 'win32' ? 'chrome-win64/chrome.exe' : 'chrome-linux64/chrome';
  if (!found.has(executable)) throw Error('Missing Chromium executable');
  return found.size;
}
