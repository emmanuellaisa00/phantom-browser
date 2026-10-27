import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import yauzl from 'yauzl';
import {validRuntimePath} from '../src/shared/runtime-integrity.ts';

const MAX_ARCHIVE = 512 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024 * 1024;
const MAX_FILE = 512 * 1024 * 1024;
export function verifyArchiveDigest(archive, expected) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw Error('Trusted archive digest unavailable');
  const stat = fs.lstatSync(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARCHIVE) throw Error('Invalid runtime archive');
  const fd = fs.openSync(archive, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const digest = createHash('sha256'); const buffer = Buffer.alloc(1024 * 1024); let total = 0; let size;
    while ((size = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {total += size; if (total > MAX_ARCHIVE) throw Error('Archive too large'); digest.update(buffer.subarray(0, size));}
    if (digest.digest('hex') !== expected) throw Error('Archive hash mismatch');
  } finally {fs.closeSync(fd);}
}
export async function extractRuntimeArchive(archive, destination) {
  const stat = fs.lstatSync(archive);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARCHIVE) throw Error('Invalid runtime archive');
  if (!fs.lstatSync(destination).isDirectory() || fs.lstatSync(destination).isSymbolicLink() || fs.readdirSync(destination).length) throw Error('Archive destination must be a new empty directory');
  const open = () => new Promise((resolve, reject) => yauzl.open(archive, {lazyEntries: true, strictFileNames: true, validateEntrySizes: true}, (e, zip) => e ? reject(e) : resolve(zip)));
  // Validate the complete inventory before extracting a single byte. The archive
  // hash must already match the pinned upstream digest before calling this.
  const inventory = [];
  const names = new Set();
  let total = 0;
  const zip = await open();
  await new Promise((resolve, reject) => {
    const fail = e => {zip.close(); reject(e);};
    zip.on('error', fail); zip.on('end', resolve);
    zip.on('entry', entry => {
      const directory = entry.fileName.endsWith('/');
      const name = directory ? entry.fileName.slice(0, -1) : entry.fileName;
      const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
      const kind = mode & 0o170000;
      if (!validRuntimePath(name) || names.has(name.toLowerCase()) || (kind && kind !== 0o100000 && kind !== 0o040000) || (entry.generalPurposeBitFlag & 1) || entry.uncompressedSize > MAX_FILE || inventory.length >= 10000) return fail(Error('Unsafe archive inventory'));
      names.add(name.toLowerCase()); total += entry.uncompressedSize;
      if (total > MAX_TOTAL) return fail(Error('Runtime archive exceeds extraction limit'));
      inventory.push({name: entry.fileName, mode, size: entry.uncompressedSize});
      zip.readEntry();
    }); zip.readEntry();
  });
  const input = await open();
  let index = 0;
  try {
    await new Promise((resolve, reject) => {
      const fail = e => {input.close(); reject(e);};
      input.on('error', fail); input.on('end', resolve);
      input.on('entry', async entry => {
        try {
          const expected = inventory[index++];
          if (!expected || expected.name !== entry.fileName || expected.size !== entry.uncompressedSize) throw Error('Archive changed during extraction');
          const full = path.join(destination, entry.fileName);
          if (entry.fileName.endsWith('/')) fs.mkdirSync(full, {recursive: true});
          else {
            fs.mkdirSync(path.dirname(full), {recursive: true});
            const stream = await new Promise((res, rej) => input.openReadStream(entry, (e, value) => e ? rej(e) : res(value)));
            await pipeline(stream, fs.createWriteStream(full, {flags: 'wx', mode: expected.mode & 0o111 ? 0o700 : 0o600}));
          }
          input.readEntry();
        } catch (e) {fail(e);}
      }); input.readEntry();
    });
  } catch (e) {fs.rmSync(destination, {recursive: true, force: true}); throw e;}
}
