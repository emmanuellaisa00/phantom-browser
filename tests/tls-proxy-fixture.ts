// Disposable TLS trust fixture. Never imported by production code. No private keys
// are committed. Trust installation is allowed ONLY on an ephemeral Windows CI runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {X509Certificate} from 'node:crypto';
import {httpProxy} from './proxy-fixture';
export async function tlsProxy(port:number,credentials?:string) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phantom-tls-fixture-'));
 const gitOpenSSL=path.join(process.env.ProgramFiles??'C:\\Program Files','Git','usr','bin','openssl.exe');
 const openssl=process.platform==='win32'&&fs.existsSync(gitOpenSSL)?gitOpenSSL:'openssl';
 const run=(args:string[])=>execFileSync(openssl,args,{cwd:root,timeout:30000,stdio:'pipe',windowsHide:true});
 try{
  run(['req','-new','-newkey','rsa:2048','-nodes','-x509','-days','2','-subj','/CN=Phantom Ephemeral Test CA','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout','ca.key','-out','ca.crt']);
  run(['req','-new','-newkey','rsa:2048','-nodes','-subj','/CN=127.0.0.1','-keyout','server.key','-out','server.csr']);
  fs.writeFileSync(path.join(root,'server.ext'),'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n');
  run(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out','server.crt','-days','2','-sha256','-extfile','server.ext']);
  const proxy=await httpProxy(port,credentials,{key:fs.readFileSync(path.join(root,'server.key')),cert:fs.readFileSync(path.join(root,'server.crt'))});
  let trusted=false;const thumbprint=new X509Certificate(fs.readFileSync(path.join(root,'ca.crt'))).fingerprint.replaceAll(':','');
  return {...proxy,trustInEphemeralWindowsCI(){
   if(process.platform!=='win32'||process.env.CI!=='true'||!process.env.RUNNER_TEMP)throw Error('Refusing to change trust outside ephemeral Windows CI');
   execFileSync('certutil.exe',['-user','-f','-addstore','Root',path.join(root,'ca.crt')],{timeout:15000,stdio:'pipe',windowsHide:true});trusted=true;
  },async close(){try{await proxy.close();if(trusted)execFileSync('certutil.exe',['-user','-delstore','Root',thumbprint],{timeout:15000,stdio:'pipe',windowsHide:true});}finally{fs.rmSync(root,{recursive:true,force:true});}}};
 }catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
}
