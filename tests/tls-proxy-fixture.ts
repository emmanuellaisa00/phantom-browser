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
   trusted=true;
   // CurrentUser Root imports can display an unavoidable Windows trust dialog.
   // Use the disposable elevated CI machine's Root store through .NET instead;
   // require administrator rights and remove this exact certificate afterward.
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; if(-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Ephemeral CI administrator required'}; $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($env:PHANTOM_TLS_CA_PATH); $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','LocalMachine'); try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); $store.Add($cert)}finally{$store.Close()}`],{timeout:30000,stdio:'pipe',windowsHide:true,env:{...process.env,PHANTOM_TLS_CA_PATH:path.join(root,'ca.crt')}});
  },async close(){try{await proxy.close();if(trusted)execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; $store=[Security.Cryptography.X509Certificates.X509Store]::new('Root','LocalMachine'); try{$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite); $found=$store.Certificates.Find([Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,$env:PHANTOM_TLS_CA_THUMBPRINT,$false); foreach($cert in $found){$store.Remove($cert)}}finally{$store.Close()}`],{timeout:30000,stdio:'pipe',windowsHide:true,env:{...process.env,PHANTOM_TLS_CA_THUMBPRINT:thumbprint}});}finally{fs.rmSync(root,{recursive:true,force:true});}}};
 }catch(e){fs.rmSync(root,{recursive:true,force:true});throw e;}
}
