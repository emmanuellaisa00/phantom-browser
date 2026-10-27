import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';
import {scanProcesses,parseWindowsProcessRows} from '../src/main/process-ownership';
afterEach(()=>vi.restoreAllMocks());
it.skipIf(process.platform!=='linux')('does not treat inaccessible same-user process inspection as proof of exit',()=>{
 vi.spyOn(fs,'readdirSync').mockReturnValue(['123456'] as unknown as ReturnType<typeof fs.readdirSync>);vi.spyOn(fs,'statSync').mockReturnValue({uid:process.getuid!()} as fs.Stats);vi.spyOn(fs,'readFileSync').mockImplementation(()=>{throw Object.assign(Error('denied'),{code:'EACCES'});});expect(scanProcesses()).toBe(null);
});
it.skipIf(process.platform!=='linux')('allows a process that vanished during inspection without treating a permission failure as an exit',()=>{
 vi.spyOn(fs,'readdirSync').mockReturnValue(['123456'] as unknown as ReturnType<typeof fs.readdirSync>);vi.spyOn(fs,'statSync').mockImplementation(()=>{throw Object.assign(Error('gone'),{code:'ENOENT'});});expect(scanProcesses()).toEqual([]);
});
it('retains unknown Windows Chromium inspection but permits known unrelated system rows',()=>{
 expect(parseWindowsProcessRows([{Name:'chrome.exe',ProcessId:123,CommandLine:null,ExecutablePath:null,CreationDate:null}])).toBe(null);
 expect(parseWindowsProcessRows([{Name:'System',ProcessId:4,CommandLine:null,ExecutablePath:null,CreationDate:null}])).toEqual([]);
 expect(parseWindowsProcessRows([{ProcessId:123}])).toBe(null);
 expect(parseWindowsProcessRows([{Name:'chrome.exe',ProcessId:123,CommandLine:'chrome.exe --marker',ExecutablePath:'C:/chrome.exe',CreationDate:'birth'}])).toEqual([{pid:123,command:'chrome.exe --marker',executable:'C:/chrome.exe',birth:'birth'}]);
});
it.skipIf(process.platform!=='linux').each(['chrome','Runner.Worker'])('classifies denied exe reads for %s without losing conservative Chromium ownership',name=>{
 vi.spyOn(fs,'readdirSync').mockReturnValue(['123456'] as unknown as ReturnType<typeof fs.readdirSync>);vi.spyOn(fs,'statSync').mockReturnValue({uid:process.getuid!()} as fs.Stats);vi.spyOn(fs,'readFileSync').mockImplementation(p=>String(p).endsWith('/stat')?`123456 (${name}) S ${Array(25).fill('0').join(' ')}`:'/usr/bin/program');vi.spyOn(fs,'readlinkSync').mockImplementation(()=>{throw Object.assign(Error('denied'),{code:'EACCES'});});expect(scanProcesses()).toEqual(name==='chrome'?null:[]);
});
