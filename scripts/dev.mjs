import {spawn} from 'node:child_process';
import {createServer} from 'vite';
import './bundle.mjs';
// Use Node to invoke Electron's CLI: .bin/electron is a .cmd shim on Windows.
const server = await createServer({server: {port: 5173, strictPort: true}});
await server.listen();
const electron = spawn(process.execPath, ['node_modules/electron/cli.js', '.'], {stdio: 'inherit', env: {...process.env, PHANTOM_DEV_URL: 'http://localhost:5173'}});
electron.on('error', async () => {await server.close(); process.exitCode = 1;});
electron.on('exit', async code => {await server.close(); process.exit(code ?? 1);});
