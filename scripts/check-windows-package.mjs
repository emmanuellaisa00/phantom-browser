import {spawnSync} from 'node:child_process';
if (process.platform !== 'win32' || process.arch !== 'x64') {
  console.error('dist:win: build on Windows x64 with the verified Windows Chromium runtime. Refusing to package a Linux/macOS runtime into a Windows installer.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['scripts/verify-runtime.mjs'], {stdio: 'inherit'});
  process.exitCode = result.status ?? 1;
}
