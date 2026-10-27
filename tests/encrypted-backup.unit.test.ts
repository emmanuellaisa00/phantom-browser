import {it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers';
import {encryptBackup, decryptBackup} from '../src/main/encrypted-backup';
const password='A strong test-only password 2026';
it('uses authenticated standard compact JWE with fresh salts and rejects wrong passwords and tampering', async()=>{
 const plain=Buffer.from('PRIVATE_SESSION');const a=await encryptBackup(plain,password),b=await encryptBackup(plain,password);
 expect(a.equals(b)).toBe(false); expect(a.toString()).not.toContain('PRIVATE_SESSION');expect(a.toString().split('.')).toHaveLength(5);
 expect((await decryptBackup(a,password)).toString()).toBe('PRIVATE_SESSION');
 await expect(decryptBackup(a,'Incorrect password!')).rejects.toThrow('authentication failed');
 const parts=a.toString().split('.');parts[3]=(parts[3]![0]==='A'?'B':'A')+parts[3]!.slice(1);
 await expect(decryptBackup(Buffer.from(parts.join('.')),password)).rejects.toThrow('authentication failed');
 const header=JSON.parse(Buffer.from(parts[0]!,'base64url').toString());header.p2c=1000000000;parts[0]=Buffer.from(JSON.stringify(header)).toString('base64url');
 await expect(decryptBackup(Buffer.from(parts.join('.')),password)).rejects.toThrow('authentication failed');
});
it('encrypted round trip restores a new profile, authenticates before writing, excludes proxy secrets and leaves no plaintext archive', async()=>{
 const f=await fixture();try{
 await f.service.proxySave(undefined,{name:'Private proxy',protocol:'http',host:'localhost',port:32123,username:'TEST_USER',password:'PROXY_SECRET'});
 const p=f.service.create({name:'Encrypted profile',proxyId:f.service.snapshot().proxies[0]!.id,startupUrls:['https://example.com'],description:'Restore metadata'});
 fs.writeFileSync(path.join(p.directory,'session'),'PRIVATE_SESSION');const file=path.join(f.root,'archive.jwe');await f.service.backup(p.id,file,password);
 expect(fs.readdirSync(f.root).some(n=>n.endsWith('.partial')||n.endsWith('.gz'))).toBe(false);
 const text=fs.readFileSync(file,'utf8');expect(text).not.toContain('PRIVATE_SESSION');expect(text).not.toContain('PROXY_SECRET');
 const before=f.service.profiles().length;await expect(f.service.restore(file,'Incorrect password!')).rejects.toThrow('authentication failed');expect(f.service.profiles()).toHaveLength(before);
 await expect(f.service.restore(file)).rejects.toThrow('password');const restored=await f.service.restore(file,password);
 expect(restored.id).not.toBe(p.id);expect(restored.description).toBe(p.description);expect(restored.proxyId).toBe(null);expect(restored.startupUrls).toEqual(p.startupUrls);expect(fs.readFileSync(path.join(restored.directory,'session'),'utf8')).toBe('PRIVATE_SESSION');
 expect(JSON.stringify(f.service.snapshot())).not.toContain(password);
 }finally{await f.cleanup();}
});
it('preserves unencrypted gzip compatibility and never silently treats plaintext as password-protected', async()=>{
 const f=await fixture();try{const p=f.service.create({name:'Legacy'}),file=path.join(f.root,'legacy.gz');await f.service.backup(p.id,file);await expect(f.service.restore(file,password)).rejects.toThrow('unencrypted');expect((await f.service.restore(file)).name).toContain('restored');}finally{await f.cleanup();}
});
