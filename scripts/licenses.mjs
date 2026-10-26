import fs from 'node:fs';
const wanted = ['electron','playwright','playwright-core','react','react-dom','sql.js','zod','yauzl','vite','vitest','esbuild','typescript','electron-builder','tailwindcss'];
const pkgs = wanted.map(n => {
  try {
    const p = JSON.parse(fs.readFileSync(`node_modules/${n}/package.json`,'utf8'));
    return `${n}@${p.version} — ${p.license ?? 'see LICENSE file'} — ${p.homepage ?? ''}`;
  } catch { return `${n} — not installed`; }
});
console.log(pkgs.join('\n'));
if (fs.existsSync('browser-runtime/chromium-1248/chrome-linux64/LICENSE')) console.log('\nChromium LICENSE at browser-runtime/chromium-1248/chrome-linux64/LICENSE');
else console.log('\nRun npm run provision first to fetch Chromium LICENSE');
