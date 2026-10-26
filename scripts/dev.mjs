import {spawn} from 'node:child_process';import {createServer} from 'vite';import './bundle.mjs';
const server=await createServer();await server.listen();const electron=spawn('node_modules/.bin/electron',['.'],{stdio:'inherit',env:{...process.env,PHANTOM_DEV_URL:'http://localhost:5173'}});electron.on('exit',async code=>{await server.close();process.exit(code??0);});
