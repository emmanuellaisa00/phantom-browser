import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export interface ProcessIdentity {pid: number; birth: string; command: string; executable: string}
/** Inaccessible Chromium rows are unknown, never proof that a browser exited. */
export function parseWindowsProcessRows(value:unknown):ProcessIdentity[]|null {
  if(!Array.isArray(value))return null;
  const result:ProcessIdentity[]=[];
  for(const row of value){
    if(!row||typeof row!=='object'||typeof row.Name!=='string'||!row.Name)return null;
    const complete=Number.isSafeInteger(row.ProcessId)&&row.ProcessId>0&&typeof row.CommandLine==='string'&&!!row.CommandLine&&typeof row.ExecutablePath==='string'&&!!row.ExecutablePath&&!!row.CreationDate;
    if(/^(?:chrome|chromium)\.exe$/i.test(row.Name)&&!complete)return null;
    if(complete)result.push({pid:row.ProcessId,command:row.CommandLine,executable:row.ExecutablePath,birth:String(row.CreationDate)});
  }
  return result;
}

// A failed scan is unknown, never evidence that a browser has exited.
export function scanProcesses(): ProcessIdentity[] | null {
  try {
    if (process.platform === 'linux') {
      const entries: ProcessIdentity[] = [];
      for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
        let browserCandidate:boolean|undefined;
        try {
          const sameUser=fs.statSync(`/proc/${pid}`).uid===process.getuid?.();
          if(!sameUser)continue; // the owned browser's main process uses this service UID
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
          browserCandidate=/chrom/i.test(stat.slice(stat.indexOf('(')+1,stat.lastIndexOf(')')));
          const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          if (fields[0] === 'Z') continue;
          const command=fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join('\n');
          browserCandidate ||= command.includes('--phantom-launch-id=')||command.includes('--user-data-dir=');
          entries.push({pid: Number(pid), birth: fields[19]!, command, executable: fs.readlinkSync(`/proc/${pid}/exe`)});
        } catch(error) {
          const code=(error as NodeJS.ErrnoException).code;
          if(code==='ENOENT'||code==='ESRCH')continue; // exited during inspection
          // Pinned Chromium main processes have a Chrome name and/or profile argv.
          // Known unrelated non-dumpable runner processes are not browser candidates.
          if(browserCandidate===false&&(code==='EACCES'||code==='EPERM'))continue;
          return null; // unknown/denied browser inspection is not exit proof
        }
      }
      return entries;
    }
    if (process.platform === 'win32') {
      const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object Name,ProcessId,CreationDate,CommandLine,ExecutablePath | ConvertTo-Json -Compress'], {timeout: 5000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8'});
      const rows = JSON.parse(raw);
      return parseWindowsProcessRows(Array.isArray(rows) ? rows : [rows]);
    }
  } catch { /* unavailable OS inspection fails closed */ }
  return null;
}
export function ownedProcesses(launchId: string, directory: string, executable: string, processes = scanProcesses()): ProcessIdentity[] | null {
  if (!processes) return null;
  const canonical = (s: string) => process.platform === 'win32' ? path.resolve(s).toLowerCase() : path.resolve(s);
  const dir = canonical(directory);
  return processes.filter(p => {
    if (canonical(p.executable.replace(/ \(deleted\)$/, '')) !== canonical(executable)) return false;
    const command = process.platform === 'win32' ? p.command.toLowerCase() : p.command;
    const marker = `--phantom-launch-id=${launchId}`;
    // Exact argv matching on Linux; quoted/unquoted complete arguments on Windows.
    if (process.platform !== 'win32') return command.split('\n').includes(marker) && command.split('\n').includes(`--user-data-dir=${dir}`);
    const args = command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(v => v.replace(/"/g, '')) ?? [];
    return args.includes(marker.toLowerCase()) && args.includes(`--user-data-dir=${dir}`);
  });
}
