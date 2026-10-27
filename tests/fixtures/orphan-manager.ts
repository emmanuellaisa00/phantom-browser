// Test-only manager: deliberately leaves a real Chromium process alive on SIGKILL.
// Separate from production launch code so this does not install a recovery backdoor.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
process.on('message',(raw:unknown)=>{
 const {directory,executable,profileId,launchId}=raw as {directory:string;executable:string;profileId:string;launchId:string};
 const lock=path.join(directory,'.phantom-lock');fs.mkdirSync(lock);
 const browser=spawn(executable,['--headless',...(process.platform==='linux'?['--no-sandbox']:[]),'--disable-extensions','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${directory}`,`--phantom-launch-id=${launchId}`,'about:blank'],{detached:true,stdio:'ignore'});
 browser.on('error',()=>process.exit(1));browser.unref();
 const createdAt=new Date().toISOString();fs.writeFileSync(path.join(lock,'metadata.json'),JSON.stringify({format:'phantom-lock',version:1,electronPid:process.pid,chromiumPid:browser.pid,profileId,launchId,state:'running',createdAt,updatedAt:createdAt,browserMayExist:true}));
 const started=Date.now();const check=setInterval(()=>{if(fs.existsSync(path.join(directory,'DevToolsActivePort'))){clearInterval(check);process.send?.({browserPid:browser.pid});}else if(Date.now()-started>15000){clearInterval(check);process.exit(2);}},25);
});
