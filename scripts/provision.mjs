// Secure browser runtime provisioning.
//
// Downloads the pinned Playwright Chromium revision from the official HTTPS
// CDN, verifies it against a trusted manifest, and atomically promotes it
// into browser-runtime/. Never silently overwrites a trusted manifest.
//
// Upgrade procedure for maintainers:
//   1. Update the pinned PLAYWRIGHT_VERSION and BROWSER_VERSION below.
//   2. Run `npm run provision` to download the new runtime.
//   3. Run `npm run verify:runtime` to confirm integrity against the trusted manifest.
//   4. Review the diff in scripts/runtime-manifests/ and commit the updated manifest.
//   5. Never commit browser-runtime/ binaries (gitignored).

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Pinned versions — update these intentionally for browser upgrades.
const PLAYWRIGHT_VERSION = '1.64.1';
const BROWSER_VERSION = '156.0.8078.4';
const BROWSER_REVISION = '1248';
const SUPPORTED_PLATFORMS = ['linux', 'win32', 'darwin'];
const SUPPORTED_ARCHS = { linux: 'x64', win32: 'x64', darwin: 'x64' };

const ROOT = path.resolve('browser-runtime');
const MANIFEST_DIR = path.resolve('scripts/runtime-manifests');
const MANIFEST_FILE = path.join(MANIFEST_DIR, `${process.platform}-x64-chromium-${BROWSER_VERSION}.json`);

function fail(message) {
  console.error(`provision: ${message}`);
  process.exit(1);
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, {recursive: true});
}

function walkFiles(dir, base) {
  const files = [];
  function w(d, b) {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const full = path.join(d, entry.name);
      const rel = path.join(b, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) w(full, rel);
      else if (entry.isFile()) files.push({path: rel, full});
    }
  }
  w(dir, base);
  return files;
}

function main() {
  if (!SUPPORTED_PLATFORMS.includes(process.platform)) {
    fail(`Unsupported platform: ${process.platform}`);
  }

  const expectedArch = SUPPORTED_ARCHS[process.platform];
  if (process.arch !== expectedArch) {
    fail(`Unsupported architecture: ${process.arch} (expected ${expectedArch})`);
  }

  ensureDir(ROOT);
  ensureDir(MANIFEST_DIR);

  // If a trusted manifest already exists, never silently overwrite it.
  const manifestExists = fs.existsSync(MANIFEST_FILE);
  if (!manifestExists && !process.argv.includes('--bootstrap')) fail('Trusted manifest missing. Maintainers must explicitly use --bootstrap, review upstream hashes, and commit the manifest.');

  const tmpRoot = path.join(ROOT, `.provision-tmp-${process.pid}`);
  try {
    fs.rmSync(tmpRoot, {recursive: true, force: true});
    ensureDir(tmpRoot);

    const env = {...process.env, PLAYWRIGHT_BROWSERS_PATH: tmpRoot};

    // Download via Playwright's official HTTPS registry.
    // --no-shell ensures the full Chromium browser (not just headless shell) is installed.
    // --force ensures a fresh, deterministic download for reproducible verification.
    const result = spawnSync(process.execPath, [
      'node_modules/playwright/cli.js',
      'install',
      'chromium',
      '--no-shell',
      '--force',
    ], {stdio: 'inherit', env});

    if (result.status !== 0) {
      fail(`Playwright browser install failed (exit ${result.status ?? 'unknown'})`);
    }

    // Enumerate downloaded files under the Chromium revision directory.
    // Paths are stored relative to that directory so they match the trusted manifest.
    const chromiumDir = path.join(tmpRoot, `chromium-${BROWSER_REVISION}`);
    const files = walkFiles(chromiumDir, '').filter(
      f => f.path !== 'checksums.json' && !f.path.endsWith('/checksums.json')
    );

    // Also enumerate sibling installs (ffmpeg) for promotion, but do not
    // compare them against the Chromium manifest.
    const siblingFiles = [];
    for (const entry of fs.readdirSync(tmpRoot, {withFileTypes: true})) {
      if (entry.isDirectory() && entry.name !== `chromium-${BROWSER_REVISION}`) {
        siblingFiles.push(...walkFiles(path.join(tmpRoot, entry.name), entry.name));
      }
    }

    if (files.length === 0) {
      fail('Downloaded Chromium runtime contains no files — aborting');
    }

    // Build inventory for Chromium files only (computes per-file hashes).
    const inventoryFiles = files.map(f => ({path: f.path, sha256: sha256File(f.full), full: f.full}));

    const inventory = {
      format: 'phantom-runtime-manifest',
      manifest_version: 1,
      playwright: PLAYWRIGHT_VERSION,
      platform: process.platform,
      browser: 'chromium',
      version: BROWSER_VERSION,
      arch: process.arch,
      files: inventoryFiles.map(f => ({path: f.path, sha256: f.sha256})),
      fileCount: inventoryFiles.length,
    };

    // If no trusted manifest exists yet, this is the bootstrap step.
    // The maintainer must review and pin the hashes before trusting them.
    if (!manifestExists) {
      fs.writeFileSync(MANIFEST_FILE, JSON.stringify(inventory, null, 2));
      console.log(`Bootstrap: wrote trusted manifest to ${MANIFEST_FILE}`);
      console.log('REVIEW THE HASHES BEFORE TRUSTING. Do not distribute until verified against upstream.');
    } else {
      // Verify downloaded Chromium against the trusted manifest.
      const trusted = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));

      if (trusted.platform !== process.platform) {
        fail(`Trusted manifest platform mismatch: ${trusted.platform} vs ${process.platform}`);
      }
      if (trusted.version !== BROWSER_VERSION) {
        fail(`Trusted manifest version mismatch: ${trusted.version} vs ${BROWSER_VERSION}`);
      }

      const trustedByPath = new Map(trusted.files.map(f => [f.path, f]));
      const downloadedByPath = new Map(inventoryFiles.map(f => [f.path, f]));

      // Missing files
      for (const rel of trustedByPath.keys()) {
        if (!downloadedByPath.has(rel)) fail(`Downloaded runtime missing file: ${rel}`);
      }

      // Unexpected files
      for (const rel of downloadedByPath.keys()) {
        if (!trustedByPath.has(rel)) fail(`Downloaded runtime has unexpected file: ${rel}`);
      }

      // Hash mismatches
      for (const [rel, expected] of trustedByPath) {
        const actual = downloadedByPath.get(rel);
        if (!actual) continue;
        if (actual.sha256 !== expected.sha256) fail(`Hash mismatch for ${rel}`);
      }

      console.log(`Downloaded Chromium matches trusted manifest: ${trustedByPath.size} files`);
    }

    // Atomically promote: move verified Chromium into final location.
    const finalDir = path.join(ROOT, `chromium-${BROWSER_REVISION}`);
    if (fs.existsSync(finalDir)) {
      fs.rmSync(finalDir, {recursive: true, force: true});
    }
    fs.renameSync(chromiumDir, finalDir);

    // Also promote any sibling installs (ffmpeg, headless shell) if present.
    for (const entry of fs.readdirSync(tmpRoot, {withFileTypes: true})) {
      if (entry.isDirectory() && entry.name !== `chromium-${BROWSER_REVISION}`) {
        const dest = path.join(ROOT, entry.name);
        if (fs.existsSync(dest)) fs.rmSync(dest, {recursive: true, force: true});
        fs.renameSync(path.join(tmpRoot, entry.name), dest);
      }
    }

    console.log(`Runtime promoted to ${finalDir}`);
  } finally {
    // Clean up temp directory.
    fs.rmSync(tmpRoot, {recursive: true, force: true});
  }
}

main();
