import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers';
it('failed durable commit rolls memory back as well as removing a newly created directory',async()=>{
 const f=await fixture();try{
 const original=f.service.create({name:'Keep me',notes:'durable'});vi.spyOn(f.db,'persist').mockImplementationOnce(()=>{throw Error('simulated disk failure');});
 expect(()=>f.service.create({name:'Must not survive failed save'})).toThrow('disk failure');expect(f.service.profiles().map(p=>p.id)).toEqual([original.id]);expect(fs.readdirSync(path.join(f.root,'profiles'))).toEqual([original.id]);expect(f.service.profile(original.id).notes).toBe('durable');
 }finally{vi.restoreAllMocks();await f.cleanup();}
});
it('failed persistence does not leave changed metadata that later close could resurrect',async()=>{
 const f=await fixture();try{const p=f.service.create({name:'Before'});vi.spyOn(f.db,'persist').mockImplementationOnce(()=>{throw Error('simulated storage failure');});expect(()=>f.service.edit(p.id,{name:'After'})).toThrow('storage failure');expect(f.service.profile(p.id).name).toBe('Before');}finally{vi.restoreAllMocks();await f.cleanup();}
});
it('actual atomic-rename failure cleans its partial file and preserves durable metadata',async()=>{
 const f=await fixture();try{const p=f.service.create({name:'Original'}),before=fs.readFileSync(f.db.file),rename=fs.renameSync;vi.spyOn(fs,'renameSync').mockImplementationOnce((source,destination)=>{if(String(destination)===f.db.file)throw Error('simulated rename failure');return rename(source,destination);});expect(()=>f.service.edit(p.id,{name:'Uncommitted'})).toThrow('rename failure');expect(f.service.profile(p.id).name).toBe('Original');expect(fs.readFileSync(f.db.file)).toEqual(before);expect(fs.readdirSync(f.root).some(n=>n.endsWith('.partial'))).toBe(false);}finally{vi.restoreAllMocks();await f.cleanup();}
});
