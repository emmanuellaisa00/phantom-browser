import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// ---------------------------------------------------------------------------
// Runtime manifest verification — strict supply-chain check
//
// This verifies that the provisioned browser runtime matches a *trusted,
// version-controlled* manifest. The manifest is authored by maintainers from
// an independently verified upstream release and is NEVER overwritten by
// provisioning or verification runs. A self-generated checksum is never
// accepted as proof of upstream authenticity.
// ---------------------------------------------------------------------------

const MANIFEST_DIR = path.resolve('scripts/runtime-manifests');
const ROOT = path.resolve('browser-runtime/chromium-1248');

function fail(message) {
  console.error(`verify-runtime: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Manifest schema (Zod-free so verification has no runtime dependency beyond Node)
// ---------------------------------------------------------------------------
const MANIFEST_VERSION = 1;

function validateManifestStructure(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest is not an object');
  if (manifest.format !== 'phantom-runtime-manifest') throw new Error('Missing or invalid manifest format');
  if (manifest.manifest_version !== MANIFEST_VERSION) throw new Error('Unsupported manifest version');
  if (typeof manifest.playwright !== 'string' || !manifest.playwright) throw new Error('Missing playwright version');
  if (typeof manifest.browser !== 'string' || !manifest.browser) throw new Error('Missing browser name');
  if (typeof manifest.version !== 'string' || !manifest.version) throw new Error('Missing browser version');
  if (typeof manifest.arch !== 'string' || !manifest.arch) throw new Error('Missing architecture');
  if (typeof manifest.platform !== 'string' || !manifest.platform) throw new Error('Missing platform');
  if (!Array.isArray(manifest.files)) throw new Error('Manifest files must be an array');
  if (manifest.files.length === 0) throw new Error('Manifest must not be empty');
  return manifest;
}

function validateRelativePath(name) {
  if (typeof name !== 'string' || name.length === 0 || name.length > 4096) throw new Error('Invalid manifest entry path');
  if (path.isAbsolute(name)) throw new Error('Absolute path in manifest: ' + name);
  const normalized = path.normalize(name.replace(/\\/g, '/'));
  if (normalized.startsWith('..') || normalized === '..') throw new Error('Path traversal in manifest: ' + name);
  if (normalized.startsWith('/')) throw new Error('Absolute path after normalization: ' + name);
  return normalized;
}

// ---------------------------------------------------------------------------
// Recursive enumeration without following symlinks
// ---------------------------------------------------------------------------
function enumerateRuntime(root) {
  const files = new Map();
  const dirs = new Set();
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      throw new Error('Cannot read runtime directory: ' + path.relative(root, dir));
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) {
        throw new Error('Symlink detected in runtime: ' + rel);
      }
      if (entry.isDirectory()) {
        dirs.add(rel);
        walk(full);
      } else if (entry.isFile()) {
        if (files.has(rel)) throw new Error('Duplicate runtime file: ' + rel);
        files.set(rel, full);
      } else {
        throw new Error('Unsupported runtime file type: ' + rel);
      }
    }
  }
  walk(root);
  return {files, dirs};
}

// ---------------------------------------------------------------------------
// Main verification
// ---------------------------------------------------------------------------
function main() {
  const [manifestFile] = process.argv.slice(2);
  const manifestPath = path.resolve(manifestFile || path.join(MANIFEST_DIR, `linux-x64-chromium-156.0.8078.4.json`));

  if (!fs.existsSync(manifestPath)) fail(`Trusted manifest not found: ${path.relative(process.cwd(), manifestPath)}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    fail(`Cannot parse trusted manifest: ${err.message}`);
  }
  validateManifestStructure(manifest);

  if (manifest.platform !== process.platform) fail(`Platform mismatch: manifest=${manifest.platform}, current=${process.platform}`);
  if (manifest.arch !== (process.arch === 'x64' ? 'x64' : process.arch)) fail(`Architecture mismatch: manifest=${manifest.arch}, current=${process.arch}`);

  // Expected browser executable for this platform/arch
  const expectedExecutable =
    process.platform === 'win32'
      ? 'chrome-win64/chrome.exe'
      : process.platform === 'darwin'
        ? 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
        : 'chrome-linux64/chrome';

  const {files: actualFiles, dirs: actualDirs} = enumerateRuntime(ROOT);

  const expectedFiles = new Map();
  for (const entry of manifest.files) {
    const rel = validateRelativePath(entry.path);
    if (!entry.sha256 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error('Invalid sha256 in manifest for: ' + entry.path);
    }
    if (expectedFiles.has(rel)) throw new Error('Duplicate manifest path: ' + rel);
    expectedFiles.set(rel, entry.sha256);
  }

  if (expectedFiles.size === 0) fail('Manifest lists no files — refusing to verify an empty runtime');

  // 1. Missing files
  for (const [rel] of expectedFiles) {
    if (!actualFiles.has(rel)) fail(`Missing runtime file: ${rel}`);
  }

  // 2. Unexpected additional files
  for (const rel of actualFiles.keys()) {
    if (!expectedFiles.has(rel)) fail(`Unexpected runtime file: ${rel}`);
  }

  // 3. Hash mismatches
  for (const [rel, expectedHash] of expectedFiles) {
    const full = actualFiles.get(rel);
    let actualHash;
    try {
      actualHash = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    } catch {
      fail(`Cannot read runtime file: ${rel}`);
    }
    if (actualHash !== expectedHash) fail(`Hash mismatch: ${rel}`);
  }

  // 4. Expected executable exists
  if (!actualFiles.has(expectedExecutable)) fail(`Expected browser executable not found: ${expectedExecutable}`);

  console.log(`Runtime verified OK: ${expectedFiles.size} files, manifest=${path.basename(manifestPath)}, browser=${manifest.browser} ${manifest.version} (${manifest.platform}/${manifest.arch})`);
}

try {
  main();
} catch (err) {
  fail(err.message || String(err));
}
