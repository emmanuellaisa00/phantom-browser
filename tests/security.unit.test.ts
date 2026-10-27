import {beforeEach, afterEach, it, expect} from 'vitest';
import {fixture} from './helpers';
import {proxyInput} from '../src/shared/schema';
import {ownedProcesses, type ProcessIdentity} from '../src/main/process-ownership';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import path from 'node:path';
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {f = await fixture();});
afterEach(async () => {await f.cleanup();});
it('rejects authenticated SOCKS5, including retained encrypted HTTP credentials', async () => {
  expect(proxyInput.safeParse({name: 'SOCKS', protocol: 'socks5', host: 'localhost', port: 1080, password: 'secret'}).success).toBe(false);
  await f.service.proxySave(undefined, {name: 'HTTP', protocol: 'http', host: 'localhost', port: 8080, password: 'secret'});
  const id = f.service.snapshot().proxies[0]!.id;
  await expect(f.service.proxySave(id, {name: 'SOCKS', protocol: 'socks5', host: 'localhost', port: 1080})).rejects.toThrow('Clear');
  await f.service.proxySave(id, {name: 'SOCKS', protocol: 'socks5', host: 'localhost', port: 1080, username: '', password: ''});
  expect(f.service.snapshot().proxies[0]?.hasCredentials).toBe(false);
});
it('never mistakes PID, marker substrings or a different executable for ownership', () => {
  const launch = randomUUID(); const directory = path.join(f.root, 'profile space'); const executable = chromium.executablePath();
  const command = process.platform === 'win32' ? `"${executable}" --phantom-launch-id=${launch} "--user-data-dir=${directory}"` : `${executable}\n--phantom-launch-id=${launch}\n--user-data-dir=${directory}`;
  const good: ProcessIdentity = {pid: 1, birth: 'known birth', executable, command};
  expect(ownedProcesses(launch, directory, executable, [good])).toEqual([good]);
  expect(ownedProcesses(launch, directory, executable, [{...good, executable: path.join(f.root, 'other.exe')}])).toEqual([]);
  expect(ownedProcesses(launch, directory, executable, [{...good, command: command.replace(launch, launch + '-not-exact')}])).toEqual([]);
  expect(ownedProcesses(launch, directory, executable, null)).toBe(null);
});
