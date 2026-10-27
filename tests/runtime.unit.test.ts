import {beforeEach, afterEach, it, expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyRuntime, validateRuntimeManifest, validRuntimePath, type RuntimeManifest} from '../src/shared/runtime-integrity';
import {extractRuntimeArchive, verifyArchiveDigest} from '../scripts/runtime-archive.mjs';
let root: string;
let manifest: RuntimeManifest;
const exe = process.platform === 'win32' ? 'chrome-win64/chrome.exe' : 'chrome-linux64/chrome';
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'phantom-runtime-'));
  fs.mkdirSync(path.join(root, path.dirname(exe)), {recursive: true}); fs.writeFileSync(path.join(root, exe), 'verified test binary');
  manifest = {format: 'phantom-runtime-manifest', manifest_version: 1, playwright: '1.64.1', platform: process.platform, browser: 'chromium', version: '156.0.8078.4', arch: 'x64', fileCount: 1, files: [{path: exe, sha256: createHash('sha256').update('verified test binary').digest('hex')}]};
});
afterEach(() => {fs.rmSync(root, {recursive: true, force: true});});
it('accepts an exactly matching pinned inventory', () => {expect(verifyRuntime(root, manifest)).toBe(1);});
it('rejects altered bytes', () => {fs.appendFileSync(path.join(root, exe), 'tamper'); expect(() => verifyRuntime(root, manifest)).toThrow('hash');});
it('rejects missing files', () => {fs.rmSync(path.join(root, exe)); expect(() => verifyRuntime(root, manifest)).toThrow('Missing');});
it('rejects unexpected files and empty extra directories', () => {
  fs.writeFileSync(path.join(root, 'extra'), 'x'); expect(() => verifyRuntime(root, manifest)).toThrow('Unexpected');
  fs.rmSync(path.join(root, 'extra')); fs.mkdirSync(path.join(root, 'extra')); expect(() => verifyRuntime(root, manifest)).toThrow('Unexpected');
});
it('rejects missing or malformed manifests and unpinned identities', () => {
  for (const bad of [undefined, null, {}, {...manifest, version: '1'}, {...manifest, playwright: 'other'}, {...manifest, browser: 'firefox'}, {...manifest, arch: 'arm64'}, {...manifest, platform: 'darwin'}, {...manifest, fileCount: 2}, {...manifest, files: []}]) expect(() => validateRuntimeManifest(bad)).toThrow();
});
it('rejects duplicate and case-colliding manifest entries', () => {
  for (const name of [exe, exe.toUpperCase()]) expect(() => validateRuntimeManifest({...manifest, fileCount: 2, files: [...manifest.files, {...manifest.files[0]!, path: name}]})).toThrow('duplicate');
});
it('rejects every unsafe path spelling without normalization hiding traversal', () => {
  for (const name of ['../escape', 'a/../escape', '/absolute', 'C:/evil', 'a\\b', 'a//b', 'a/./b', 'a:ads', 'AUX', 'a/foo.', 'a/foo ', 'a/\u0000b']) {
    expect(validRuntimePath(name)).toBe(false); expect(() => validateRuntimeManifest({...manifest, files: [{path: name, sha256: '0'.repeat(64)}]})).toThrow();
  }
});
it('rejects root and descendant symbolic links', () => {
  // Directory junctions require no Developer Mode on Windows.
  const target = path.join(root, 'target'); fs.mkdirSync(target);
  const link = path.join(root, 'link'); fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => verifyRuntime(root, manifest)).toThrow('symbolic'); expect(() => verifyRuntime(link, manifest)).toThrow('symbolic');
});
it('rejects corrupt archives before creating extracted files', async () => {
  const archive = path.join(root, 'corrupt.zip'); fs.writeFileSync(archive, 'invalid archive'); const dest = path.join(root, 'empty'); fs.mkdirSync(dest);
  await expect(extractRuntimeArchive(archive, dest)).rejects.toThrow(); expect(fs.readdirSync(dest)).toEqual([]);
});

// Minimal stored ZIP for adversarial central-directory tests; extraction is never
// reached for unsafe entries, so no executable fixtures or network are required.
function zipEntry(name: string, mode = 0o100600) {
  const n = Buffer.from(name); const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(n.length, 28); central.writeUInt32LE((mode * 65536) >>> 0, 38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + n.length, 12); end.writeUInt32LE(local.length + n.length, 16);
  return Buffer.concat([local, n, central, n, end]);
}
it('rejects traversal and symlink entries in archives before extraction', async () => {
  for (const [name, mode] of [['../escape', 0o100600], ['symlink', 0o120777]] as const) {
    const archive = path.join(root, 'malicious.zip'); fs.writeFileSync(archive, zipEntry(name, mode)); const dest = fs.mkdtempSync(path.join(root, 'empty-'));
    await expect(extractRuntimeArchive(archive, dest)).rejects.toThrow(); expect(fs.readdirSync(dest)).toEqual([]);
  }
});

it('rejects corrupt or untrusted archive digests before extraction', () => {
  const archive = path.join(root, 'tampered.zip'); fs.writeFileSync(archive, 'not trusted');
  expect(() => verifyArchiveDigest(archive, '0'.repeat(64))).toThrow('hash');
  expect(() => verifyArchiveDigest(archive, '')).toThrow('unavailable');
});
it('actual verification CLI fails closed when its manifest is missing', () => {
  const result = spawnSync(process.execPath, [path.resolve('scripts/verify-runtime.mjs')], {cwd: root, encoding: 'utf8'});
  expect(result.status).not.toBe(0); expect(result.stderr).toContain('verification failed');
});
