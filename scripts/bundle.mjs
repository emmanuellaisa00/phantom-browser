import {build} from 'esbuild';import fs from 'node:fs';
await build({entryPoints:['src/main/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:'app/main/index.cjs',external:['electron','playwright','sql.js'],sourcemap:true});
await build({entryPoints:['src/preload/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:'app/preload/index.cjs',external:['electron']});
fs.copyFileSync('node_modules/sql.js/dist/sql-wasm.wasm','app/main/sql-wasm.wasm');

fs.writeFileSync('app/main/bootstrap.cjs',`const path=require('node:path');const {app}=require('electron');if(app.isPackaged)process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(process.resourcesPath,'browser-runtime');require('./index.cjs');`);
