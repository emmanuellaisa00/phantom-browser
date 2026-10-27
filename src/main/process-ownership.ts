import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

export interface ProcessIdentity {pid: number; birth: string; command: string; executable: string}
// A failed scan is unknown, never evidence that a browser has exited.
export function scanProcesses(): ProcessIdentity[] | null {
  try {
    if (process.platform === 'linux') {
      const entries: ProcessIdentity[] = [];
      for (const pid of fs.readdirSync('/proc').filter(p => /^\d+$/.test(p))) {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
          const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
          if (fields[0] === 'Z') continue;
          entries.push({pid: Number(pid), birth: fields[19]!, command: fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join('\n'), executable: fs.readlinkSync(`/proc/${pid}/exe`)});
        } catch { /* inaccessible unrelated processes are not ownership candidates */ }
      }
      return entries;
    }
    if (process.platform === 'win32') {
      const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId,CreationDate,CommandLine,ExecutablePath | ConvertTo-Json -Compress'], {timeout: 5000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8'});
      const rows = JSON.parse(raw);
      return (Array.isArray(rows) ? rows : [rows]).filter(r => r.CommandLine && r.ExecutablePath && r.CreationDate).map(r => ({pid: Number(r.ProcessId), birth: String(r.CreationDate), command: String(r.CommandLine), executable: String(r.ExecutablePath)}));
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
