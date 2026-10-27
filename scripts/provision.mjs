import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRuntime, validateRuntimeManifest, RUNTIME_VERSION, REVISION} from '../src/shared/runtime-integrity.ts';
import {extractRuntimeArchive, verifyArchiveDigest} from './runtime-archive.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repository, 'browser-runtime');
let stage;
let gate;
let gateOwned = false;
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(repository, 'scripts/runtime-manifests', `${process.platform}-${process.arch}-chromium-${RUNTIME_VERSION}.json`), 'utf8'));
  validateRuntimeManifest(manifest);
  const archives = JSON.parse(fs.readFileSync(path.join(repository, 'scripts/runtime-archives.json'), 'utf8'));
  const source = archives[`${process.platform}-${process.arch}`];
  if (archives.version !== RUNTIME_VERSION || !source || !/^[a-f0-9]{64}$/.test(source.sha256) || new URL(source.url).protocol !== 'https:' || new URL(source.url).hostname !== 'storage.googleapis.com') throw Error('Trusted archive identity unavailable');
  fs.mkdirSync(root, {recursive: true});
  if (fs.lstatSync(root).isSymbolicLink()) throw Error('Runtime directory is unsafe');
  gate = path.join(root, '.provision-lock'); fs.mkdirSync(gate); gateOwned = true;
  stage = fs.mkdtempSync(path.join(root, '.provision-'));
  const response = await fetch(source.url, {redirect: 'error', signal: AbortSignal.timeout(120000)});
  if (!response.ok || !response.body) throw Error('Runtime download failed');
  const archive = path.join(stage, 'download.zip');
  const fd = fs.openSync(archive, 'wx', 0o600);
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length; if (size > 512 * 1024 * 1024) throw Error('Runtime archive too large');
      fs.writeFileSync(fd, chunk);
    }
  } finally {fs.closeSync(fd);}
  verifyArchiveDigest(archive, source.sha256);
  const extracted = path.join(stage, `chromium-${REVISION}`); fs.mkdirSync(extracted);
  await extractRuntimeArchive(archive, extracted);
  for (const marker of ['INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED']) fs.writeFileSync(path.join(extracted, marker), '', {flag: 'wx'});
  const count = verifyRuntime(extracted, manifest);
  const final = path.join(root, `chromium-${REVISION}`);
  const previous = path.join(stage, 'previous');
  if (fs.existsSync(final)) fs.renameSync(final, previous);
  try {fs.renameSync(extracted, final);} catch (e) {if (fs.existsSync(previous)) fs.renameSync(previous, final); throw e;}
  console.log(`Provisioned verified Chromium ${RUNTIME_VERSION}: ${count} files. No trusted hashes were generated or overwritten.`);
} catch {
  console.error('provision: failed. Check supported platform, trusted archive digest/manifest, HTTPS access, available disk space and permissions. Existing trusted data was not replaced.');
  process.exitCode = 1;
} finally {
  if (stage) fs.rmSync(stage, {recursive: true, force: true});
  if (gateOwned) fs.rmSync(gate, {recursive: true, force: true});
}
