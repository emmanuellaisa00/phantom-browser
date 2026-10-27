import fs from 'node:fs';
import path from 'node:path';
import {verifyRuntime, RUNTIME_VERSION, REVISION} from '../src/shared/runtime-integrity.ts';
try {
  const manifestFile = process.argv[2] || path.resolve('scripts/runtime-manifests', `${process.platform}-${process.arch}-chromium-${RUNTIME_VERSION}.json`);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const count = verifyRuntime(path.resolve('browser-runtime', `chromium-${REVISION}`), manifest);
  console.log(`Runtime verified OK: ${count} files, Chromium ${RUNTIME_VERSION}, ${process.platform}/${process.arch}`);
} catch {
  console.error('verify-runtime: verification failed. Check the trusted manifest, platform, version and runtime files; re-provision from reviewed upstream sources.');
  process.exitCode = 1;
}
