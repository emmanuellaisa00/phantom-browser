import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {fixture} from './helpers';
import {BACKUP_LIMITS} from '../src/main/service';
const defaults = {...BACKUP_LIMITS};
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {f = await fixture();});
afterEach(async () => {Object.assign(BACKUP_LIMITS, defaults); vi.restoreAllMocks(); await f.cleanup();});
async function archive() {
  const p = f.service.create({name: 'Safety'}); fs.writeFileSync(path.join(p.directory, 'safe.txt'), 'data');
  const file = path.join(f.root, 'backup.gz'); await f.service.backup(p.id, file);
  return {p, file, manifest: JSON.parse(gunzipSync(fs.readFileSync(file)).toString())};
}
it('rejects duplicate case/unicode normalized paths and file-directory conflicts', async () => {
  const {file, manifest} = await archive();
  for (const [a, b] of [['safe.txt', 'SAFE.TXT'], ['caf\u00e9', 'cafe\u0301'], ['parent', 'parent/child']]) {
    const first = {...manifest.files[0], name: a}; const second = {...manifest.files[0], name: b};
    fs.writeFileSync(file, gzipSync(JSON.stringify({...manifest, files: [first, second]})));
    await expect(f.service.restore(file)).rejects.toThrow('Unsafe'); expect(f.service.profiles()).toHaveLength(1);
  }
});
it('rejects malformed fields, invalid base64, lock files and traversal before creating a profile', async () => {
  const {file, manifest} = await archive();
  for (const data of [{...manifest, extra: true}, {...manifest, files: [{...manifest.files[0], data: '!!!!'}]}, {...manifest, files: [{...manifest.files[0], name: '../escape'}]}, {...manifest, files: [{...manifest.files[0], name: 'SingletonLock'}]}, {...manifest, files: [{...manifest.files[0], type: 'symlink'}]}]) {
    fs.writeFileSync(file, gzipSync(JSON.stringify(data))); await expect(f.service.restore(file)).rejects.toThrow();
  }
  expect(f.service.profiles()).toHaveLength(1);
});
it('enforces compressed and decompressed limits before extraction', async () => {
  const {file} = await archive();
  BACKUP_LIMITS.archive = 1; await expect(f.service.restore(file)).rejects.toThrow('large');
  Object.assign(BACKUP_LIMITS, defaults); BACKUP_LIMITS.decompressed = 1; await expect(f.service.restore(file)).rejects.toThrow('Corrupt'); expect(f.service.profiles()).toHaveLength(1);
});
it('enforces per-file and file-count creation limits without reading large files', async () => {
  const p = f.service.create({name: 'Limits'}); const huge = path.join(p.directory, 'huge'); const fd = fs.openSync(huge, 'w'); fs.ftruncateSync(fd, BACKUP_LIMITS.file + 1); fs.closeSync(fd);
  await expect(f.service.backup(p.id, path.join(f.root, 'limit.gz'))).rejects.toThrow('limit');
  fs.rmSync(huge); fs.writeFileSync(path.join(p.directory, 'a'), 'a'); BACKUP_LIMITS.count = 0;
  await expect(f.service.backup(p.id, path.join(f.root, 'limit.gz'))).rejects.toThrow('limit');
});
it('cleans partial restoration and does not change original profile data', async () => {
  const {p, file} = await archive(); const original = fs.writeFileSync;
  vi.spyOn(fs, 'writeFileSync').mockImplementation(((destination, ...args) => {
    if (String(destination).endsWith('safe.txt') && !String(destination).startsWith(p.directory)) throw Error('simulated disk full');
    return Reflect.apply(original, fs, [destination, ...args]);
  }) as typeof fs.writeFileSync);
  await expect(f.service.restore(file)).rejects.toThrow('disk full');
  expect(f.service.profiles()).toHaveLength(1); expect(fs.readdirSync(path.join(f.root, 'profiles'))).toEqual([p.id]); expect(fs.readFileSync(path.join(p.directory, 'safe.txt'), 'utf8')).toBe('data');
});
it('does not follow destination symlinks or overwrite existing profile data', async () => {
  const {p} = await archive();
  await expect(f.service.backup(p.id, path.join(p.directory, 'safe.txt'))).rejects.toThrow('Unsafe');
  const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside);
  const link = path.join(f.root, 'link'); fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await expect(f.service.backup(p.id, path.join(link, 'backup.gz'))).rejects.toThrow('Symbolic'); expect(fs.readdirSync(outside)).toEqual([]);
});
it('excludes proxy credentials from backup bytes and assignment', async () => {
  await f.service.proxySave(undefined, {name: 'Proxy', protocol: 'http', host: 'localhost', port: 8080, username: 'PRIVATE_USER', password: 'PRIVATE_PASSWORD'});
  const p = f.service.create({name: 'Proxy profile', proxyId: f.service.snapshot().proxies[0]!.id}); const file = path.join(f.root, 'private.gz'); await f.service.backup(p.id, file);
  const text = gunzipSync(fs.readFileSync(file)).toString(); expect(text).not.toContain('PRIVATE_'); expect(JSON.parse(text).profile.proxyId).toBe(null);
});
it('temporary backup write failures leave no partial archive', async () => {
  const {p} = await archive(); const destination = path.join(f.root, 'new.gz'); const original = fs.renameSync;
  vi.spyOn(fs, 'renameSync').mockImplementation((a, b) => {if (String(b) === destination) throw Error('destination unavailable'); return original(a, b);});
  await expect(f.service.backup(p.id, destination)).rejects.toThrow('destination unavailable'); expect(fs.existsSync(destination)).toBe(false); expect(fs.readdirSync(f.root).some(n => n.endsWith('.partial'))).toBe(false);
});

it('enforces restore per-file, decoded-total and count limits before new profile creation', async () => {
  const {file} = await archive();
  for (const key of ['file', 'total', 'count'] as const) {
    Object.assign(BACKUP_LIMITS, defaults); BACKUP_LIMITS[key] = 0;
    await expect(f.service.restore(file)).rejects.toThrow(); expect(f.service.profiles()).toHaveLength(1);
  }
});
