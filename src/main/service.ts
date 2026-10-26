import fs from 'node:fs';
import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {chromium, type BrowserContext, type Page} from 'playwright';
import {z} from 'zod';
import {Database} from './database';
import {configSchema, profileInput, profileSchema, proxyInput, proxySchema, type Profile, type Snapshot, type Request, type BrowserConfig} from '../shared/schema';

export interface Secrets {
  seal(value: string): Promise<Buffer>;
  open(value: Buffer): Promise<string>;
}

export type LockState = 'acquiring' | 'starting' | 'running' | 'stopping' | 'released';

export interface LockMeta {
  format: 'phantom-lock';
  version: 1;
  electronPid: number;
  chromiumPid?: number;
  profileId: string;
  launchId: string;
  state: LockState;
  createdAt: string;
  updatedAt: string;
}

interface Runtime {
  context?: BrowserContext;
  launchId: string;
  closing: boolean;
  pid?: number;
  electronPid: number;
}

const manifestSchema = z.strictObject({
  format: z.literal('phantom-backup'),
  version: z.literal(1),
  engine: z.string(),
  profile: profileInput,
  files: z.array(z.strictObject({
    name: z.string().max(1024),
    size: z.number().int().min(0),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    data: z.string(),
  })).max(50000),
});

const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const now = () => new Date().toISOString();

export class Service {
  readonly running = new Map<string, Runtime>();
  readonly jobs = new Map<string, { running: boolean; message: string; cancelled: boolean }>();
  private busy = new Set<string>();
  private logs: Snapshot['logs'] = [];

  constructor(readonly db: Database, readonly root: string, private secrets: Secrets, private headless = false) {
    fs.mkdirSync(path.join(root, 'profiles'), {recursive: true});
    fs.mkdirSync(path.join(root, 'reports'), {recursive: true});
    db.transaction(() => {
      db.run("UPDATE launches SET ended_at=?,outcome='interrupted' WHERE ended_at IS NULL", [now()]);
    });
    void this.recoverOrphans();
    for (const p of this.profiles()) {
      if (!fs.existsSync(this.directory(p.id))) {
        this.log(`Missing storage directory for profile ${p.id}`);
      }
    }
  }

  log(message: string) {
    this.logs.unshift({time: now(), message});
    this.logs = this.logs.slice(0, 300);
    fs.appendFileSync(path.join(this.root, 'application.log'), JSON.stringify({time: now(), message}) + '\n', {mode: 0o600});
    const log = path.join(this.root, 'application.log');
    if (fs.statSync(log).size > 2_000_000) {
      fs.renameSync(log, log + '.previous');
    }
  }

  directory(id: string) {
    return path.join(this.root, 'profiles', z.uuid().parse(id));
  }

  profiles(): Profile[] {
    return this.db.rows('SELECT data FROM profiles').map(r => {
      const p = profileSchema.parse(JSON.parse(String(r.data)));
      return {...p, status: this.running.has(p.id) ? this.running.get(p.id)?.context ? 'running' : 'starting' : p.lastError ? 'error' : 'stopped'};
    });
  }

  profile(id: string) {
    const p = this.profiles().find(p => p.id === id);
    if (!p) throw Error('Profile not found');
    return p;
  }

  private save(p: Profile) {
    this.db.transaction(() => {
      this.db.run('INSERT INTO profiles(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', [p.id, JSON.stringify(p)]);
      this.db.run('DELETE FROM profile_tags WHERE profile_id=?', [p.id]);
      for (const tag of new Set(p.tags)) {
        this.db.run('INSERT INTO profile_tags VALUES(?,?)', [p.id, tag]);
      }
    });
  }

  private patch(id: string, fields: Partial<Profile>) {
    this.save({...this.profile(id), ...fields, updatedAt: now()});
  }

  create(input: unknown) {
    const v = profileInput.parse(input);
    if (v.proxyId && !this.db.rows('SELECT id FROM proxies WHERE id=?', [v.proxyId]).length) {
      throw Error('Proxy not found');
    }
    const id = randomUUID();
    fs.mkdirSync(this.directory(id));
    const p: Profile = {
      ...v, id, createdAt: now(), updatedAt: now(), lastLaunch: null,
      engineVersion: 'Not launched', lastError: null, status: 'stopped',
      directory: this.directory(id),
    };
    try {
      this.save(p);
      return p;
    } catch (e) {
      fs.rmSync(this.directory(id), {recursive: true, force: true});
      throw e;
    }
  }

  edit(id: string, input: unknown) {
    this.assertIdle(id);
    const v = profileInput.parse(input);
    if (v.proxyId && !this.db.rows('SELECT id FROM proxies WHERE id=?', [v.proxyId]).length) {
      throw Error('Proxy not found');
    }
    this.patch(id, v);
  }

  private assertIdle(id: string) {
    this.profile(id);
    if (this.running.has(id) || this.busy.has(id)) {
      throw Error('Stop the profile and wait for pending operations first');
    }
  }

  async duplicate(id: string) {
    this.assertIdle(id);
    this.busy.add(id);
    let copy: Profile | undefined;
    try {
      const p = this.profile(id);
      copy = this.create({...profileInput.parse(pickInput(p)), name: p.name + ' (copy)'});
      fs.cpSync(this.directory(id), this.directory(copy.id), {
        recursive: true,
        filter: source => !['.phantom-lock', 'SingletonLock', 'SingletonSocket', 'SingletonCookie'].includes(path.basename(source)) && !fs.lstatSync(source).isSymbolicLink(),
      });
      return copy;
    } catch (e) {
      if (copy) {
        this.db.transaction(() => this.db.run('DELETE FROM profiles WHERE id=?', [copy!.id]));
        fs.rmSync(this.directory(copy.id), {recursive: true, force: true});
      }
      throw e;
    } finally {
      this.busy.delete(id);
    }
  }

  delete(id: string, confirmed: boolean) {
    if (!confirmed) throw Error('Deletion requires explicit user confirmation');
    this.assertIdle(id);
    const dir = this.directory(id);
    const trash = dir + '.deleted';
    if (fs.existsSync(dir)) fs.renameSync(dir, trash);
    try {
      this.db.transaction(() => this.db.run('DELETE FROM profiles WHERE id=?', [id]));
    } catch (e) {
      if (fs.existsSync(trash)) fs.renameSync(trash, dir);
      throw e;
    }
    fs.rmSync(trash, {recursive: true, force: true});
    this.log(`Deleted profile ${id}`);
  }

  private acquire(id: string, chromiumPid?: number) {
    const lockDir = path.join(this.directory(id), '.phantom-lock');
    const metaPath = path.join(lockDir, 'metadata.json');
    const nowTs = now();
    if (fs.existsSync(lockDir)) {
      let existing: LockMeta | null = null;
      try {
        existing = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as LockMeta;
      } catch {
        /* malformed or incomplete lock */
      }
      if (existing) {
        const electronAlive = this.isProcessAlive(existing.electronPid);
        const chromiumAlive = existing.chromiumPid ? this.isProcessAlive(existing.chromiumPid) : false;
        if (electronAlive || chromiumAlive) {
          throw Error('Profile is locked by a live process');
        }
      }
      fs.rmSync(lockDir, {recursive: true, force: true});
    }
    fs.mkdirSync(lockDir, {recursive: false});
    const meta: LockMeta = {
      format: 'phantom-lock',
      version: 1,
      electronPid: process.pid,
      chromiumPid,
      profileId: id,
      launchId: this.running.get(id)?.launchId ?? randomUUID(),
      state: 'acquiring',
      createdAt: nowTs,
      updatedAt: nowTs,
    };
    try {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), {mode: 0o600});
    } catch (_e) {
      fs.rmSync(lockDir, {recursive: true, force: true});
      throw _e;
    }
  }

  private release(id: string): LockMeta | null {
    const lockDir = path.join(this.directory(id), '.phantom-lock');
    const metaPath = path.join(lockDir, 'metadata.json');
    let meta: LockMeta | null;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as LockMeta;
    } catch {
      return null;
    }
    try {
      fs.rmSync(lockDir, {recursive: true, force: true});
    } catch {
      /* already removed */
    }
    return meta;
  }

  private isProcessAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ESRCH') return false;
      if (err.code === 'EPERM') return true;
      return false;
    }
  }

  private isOurProcess(pid: number, expectedName: string): boolean {
    if (!pid || pid <= 0) return false;
    try {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return cmdline.includes(expectedName);
    } catch {
      return false;
    }
  }

  private updateLock(id: string, state: LockState, chromiumPid?: number) {
    const lockDir = path.join(this.directory(id), '.phantom-lock');
    const metaPath = path.join(lockDir, 'metadata.json');
    let meta: LockMeta | null;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as LockMeta;
    } catch {
      return;
    }
    meta.state = state;
    if (chromiumPid) meta.chromiumPid = chromiumPid;
    meta.updatedAt = now();
    try {
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), {mode: 0o600});
    } catch {
      /* best effort */
    }
  }

  private async recoverOrphans() {
    for (const p of this.profiles()) {
      const lockDir = path.join(this.directory(p.id), '.phantom-lock');
      const metaPath = path.join(lockDir, 'metadata.json');
      if (!fs.existsSync(lockDir) || !fs.existsSync(metaPath)) continue;
      let meta: LockMeta | null;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as LockMeta;
      } catch {
        this.log(`Malformed lock metadata for profile ${p.id}`);
        continue;
      }
      if (meta.electronPid && this.isProcessAlive(meta.electronPid) && this.isOurProcess(meta.electronPid, 'Phantom')) {
        this.log(`Profile ${p.id} has active Electron process ${meta.electronPid}`);
        continue;
      }
      if (meta.chromiumPid && this.isProcessAlive(meta.chromiumPid) && this.isOurProcess(meta.chromiumPid, 'chrome')) {
        this.log(`Profile ${p.id} has orphaned Chromium process ${meta.chromiumPid}; marking for recovery`);
        this.patch(p.id, {lastError: 'Browser process may still be using this profile. Recovery required.'});
        continue;
      }
      this.log(`Stale lock for profile ${p.id}; cleaning up`);
      try {
        fs.rmSync(lockDir, {recursive: true, force: true});
      } catch {
        /* best effort */
      }
    }
  }

  async proxyOptions(id: string | null) {
    if (!id) return undefined;
    const row = this.db.rows('SELECT data,secret FROM proxies WHERE id=?', [id])[0];
    if (!row) throw Error('Assigned proxy is missing');
    const p = proxySchema.parse(JSON.parse(String(row.data)));
    const credentials = row.secret ? JSON.parse(await this.secrets.open(Buffer.from(row.secret as Uint8Array))) as {username?: string; password?: string} : {};
    return {
      server: `${p.protocol}://${p.host.includes(':') ? '[' + p.host + ']' : p.host}:${p.port}`,
      ...credentials,
    };
  }

  async launch(id: string) {
    this.assertIdle(id);
    const p = this.profile(id);
    if (this.running.size >= this.maxConcurrent()) {
      throw Error('Concurrent profile limit reached; change Settings if resources permit');
    }
    if (!fs.existsSync(this.directory(id))) {
      throw Error('Profile storage is missing; restore a backup');
    }
    configSchema.parse(p.config);
    this.acquire(id);
    const runtime: Runtime = {launchId: randomUUID(), closing: false, electronPid: process.pid};
    this.running.set(id, runtime);
    this.db.transaction(() => this.db.run('INSERT INTO launches VALUES(?,?,?,NULL,NULL)', [runtime.launchId, id, now()]));
    try {
      const context = await chromium.launchPersistentContext(this.directory(id), {
        headless: this.headless,
        chromiumSandbox: !this.headless,
        ignoreDefaultArgs: ['--password-store=basic', '--use-mock-keychain'],
        proxy: await this.proxyOptions(p.proxyId),
        ...this.options(p.config),
        acceptDownloads: false,
        timeout: 30000,
        executablePath: chromium.executablePath(),
      });
      runtime.context = context;
      context.on('close', () => this.finished(id, runtime, 'closed'));
      const browser = context.browser();
      if (browser) {
        try {
          const session = await browser.newBrowserCDPSession();
          const info = await session.send('SystemInfo.getProcessInfo');
          runtime.pid = info.processInfo.find(p => p.type === 'browser')?.id;
          await session.detach();
        } catch {
          /* PID unavailable on some distributions */
        }
        this.updateLock(id, 'running', runtime.pid);
      }
      this.patch(id, {engineVersion: browser?.version() ?? 'Unknown', lastLaunch: now(), lastError: null});
      this.log(`Launched profile ${id}${runtime.pid ? ' PID ' + runtime.pid : ''}`);
      const page = context.pages()[0] ?? await context.newPage();
      if (p.launchUrl) {
        await page.goto(p.launchUrl, {waitUntil: 'domcontentloaded', timeout: 30000});
      }
      return context;
    } catch {
      if (runtime.context) {
        await runtime.context.close().catch(() => {});
      }
      this.finished(id, runtime, 'failed');
      this.patch(id, {lastError: 'Launch or navigation failed. Check browser provisioning, configuration, proxy and destination availability.'});
      this.log(`Launch failed for profile ${id}`);
      throw Error('Browser launch failed; see profile error. No credentials were logged.');
    }
  }

  private options(c: BrowserConfig) {
    return {
      viewport: c.viewport,
      screen: c.screen,
      locale: c.locale,
      timezoneId: c.timezoneId,
      colorScheme: c.colorScheme,
      reducedMotion: c.reducedMotion,
      userAgent: c.userAgent,
      geolocation: c.geolocation,
      permissions: c.geolocation ? ['geolocation'] : [],
    };
  }

  private finished(id: string, r: Runtime, outcome: string) {
    if (this.running.get(id) !== r) return;
    this.running.delete(id);
    this.release(id);
    this.updateLock(id, 'released');
    this.db.transaction(() => this.db.run('UPDATE launches SET ended_at=?,outcome=? WHERE id=?', [now(), outcome, r.launchId]));
    const job = this.jobs.get(id);
    if (job) job.cancelled = true;
    this.log(`Profile ${id} ${outcome}`);
  }

  async stop(id: string) {
    const r = this.running.get(id);
    if (!r) return;
    if (!r.context) throw Error('Profile is still starting; wait for launch to finish');
    r.closing = true;
    this.updateLock(id, 'stopping');
    await r.context.close();
    this.finished(id, r, 'stopped');
  }

  async shutdown() {
    await Promise.all([...this.running.keys()].map(id => this.stop(id).catch(() => {})));
  }

  async proxySave(id: string | undefined, input: unknown) {
    const p = proxyInput.parse(input);
    const key = id ?? randomUUID();
    const old = id ? this.db.rows('SELECT data,secret FROM proxies WHERE id=?', [id])[0] : undefined;
    if (id && !old) throw Error('Proxy not found');
    if (this.profiles().some(v => v.proxyId === key && this.running.has(v.id))) {
      throw Error('Stop assigned profiles before editing a proxy');
    }
    const explicit = p.username !== undefined || p.password !== undefined;
    const secret = explicit ? (p.username || p.password ? await this.secrets.seal(JSON.stringify({username: p.username, password: p.password})) : null) : old?.secret ?? null;
    const data = {
      id: key,
      name: p.name,
      protocol: p.protocol,
      host: p.host,
      port: p.port,
      hasCredentials: !!secret,
      lastTest: null,
      result: null,
    };
    this.db.transaction(() => this.db.run('INSERT OR REPLACE INTO proxies VALUES(?,?,?)', [key, JSON.stringify(data), secret]));
  }

  proxyDelete(id: string) {
    if (this.profiles().some(p => p.proxyId === id)) {
      throw Error('Unassign this proxy from profiles first');
    }
    this.db.transaction(() => this.db.run('DELETE FROM proxies WHERE id=?', [id]));
  }

  async proxyTest(id: string) {
    let context: BrowserContext | undefined;
    let result = 'Connection failed (credentials and raw errors withheld)';
    try {
      const browser = await chromium.launch({
        headless: true,
        proxy: await this.proxyOptions(id),
        timeout: 20000,
        executablePath: chromium.executablePath(),
      });
      try {
        context = await browser.newContext();
        const page = await context.newPage();
        const response = await page.goto('https://api.ipify.org?format=json', {timeout: 15000});
        if (!response?.ok()) throw Error();
        const body = z.object({ip: z.string().regex(/^[0-9a-fA-F:.]+$/)}).parse(await response.json());
        result = `Connected — public IP ${body.ip}`;
      } finally {
        await browser.close();
      }
    } catch {
      /* controlled redacted failure */
    }
    const row = this.db.rows('SELECT data FROM proxies WHERE id=?', [id])[0];
    if (!row) throw Error('Proxy not found');
    const p = proxySchema.parse(JSON.parse(String(row.data)));
    this.db.transaction(() => this.db.run('UPDATE proxies SET data=? WHERE id=?', [JSON.stringify({...p, lastTest: now(), result}), id]));
    return result;
  }

  page(id: string): Page {
    const context = this.running.get(id)?.context;
    if (!context) throw Error('Launch the profile first');
    const page = context.pages()[0];
    if (!page) throw Error('No browser tab is open');
    return page;
  }

  async diagnose(id: string) {
    const page = this.page(id);
    const observed = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl');
      return {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: [...navigator.languages],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: {width: innerWidth, height: innerHeight},
        screen: {width: screen.width, height: screen.height},
        colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        hardwareConcurrency: navigator.hardwareConcurrency,
        platform: navigator.platform,
        webglVendor: gl?.getParameter(gl.VENDOR) as string | null,
        webglRenderer: gl?.getParameter(gl.RENDERER) as string | null,
        webdriver: navigator.webdriver,
      };
    });
    const expected = this.profile(id).config;
    const inconsistencies: string[] = [];
    if (expected.userAgent && expected.userAgent !== observed.userAgent) inconsistencies.push('User agent mismatch');
    if (expected.timezoneId !== observed.timezone) inconsistencies.push('Timezone mismatch or canonical alias');
    if (expected.locale !== observed.language) inconsistencies.push('Locale mismatch');
    if (JSON.stringify(expected.viewport) !== JSON.stringify(observed.viewport)) inconsistencies.push('Viewport differs');
    if (expected.screen && JSON.stringify(expected.screen) !== JSON.stringify(observed.screen)) inconsistencies.push('Screen differs');
    if (expected.colorScheme !== 'no-preference' && expected.colorScheme !== observed.colorScheme) inconsistencies.push('Color scheme differs');
    if ((expected.reducedMotion === 'reduce') !== observed.reducedMotion) inconsistencies.push('Reduced motion differs');
    const result = {expected, observed, inconsistencies, processId: this.running.get(id)?.pid ?? null};
    this.db.transaction(() => this.db.run('INSERT INTO diagnostics VALUES(?,?,?,?)', [randomUUID(), id, now(), JSON.stringify(result)]));
    return result;
  }

  async automate(id: string, steps: Extract<Request, {action: 'automate'}>['steps']) {
    if (this.jobs.get(id)?.running) throw Error('An automation job is already running');
    const page = this.page(id);
    const job = {running: true, message: 'Running', cancelled: false};
    this.jobs.set(id, job);
    const report: {step: number; action: string; result: string}[] = [];
    try {
      for (const [index, step] of steps.entries()) {
        if (job.cancelled) throw Error('Stopped');
        page.setDefaultTimeout(10000);
        switch (step.action) {
          case 'navigate':
            await page.goto(step.url, {timeout: 15000, waitUntil: 'domcontentloaded'});
            break;
          case 'title':
            report.push({step: index + 1, action: step.action, result: await page.title()});
            break;
          case 'screenshot':
            await page.screenshot({path: path.join(this.root, 'reports', `${id}-${Date.now()}.png`)});
            break;
          case 'wait':
            await page.locator(step.selector).waitFor({timeout: 10000});
            break;
          case 'click':
            await page.locator(step.selector).click();
            break;
          case 'fill':
            await page.locator(step.selector).fill(step.value);
            break;
        }
        job.message = `Completed step ${index + 1}/${steps.length}`;
      }
      job.message = 'Completed';
    } catch {
      job.message = job.cancelled ? 'Stopped' : 'Failed; selector, navigation or browser operation did not complete';
    } finally {
      job.running = false;
      fs.writeFileSync(path.join(this.root, 'reports', `${id}-${Date.now()}.json`), JSON.stringify({profileId: id, time: now(), outcome: job.message, report}, null, 2), {mode: 0o600});
    }
    return job.message;
  }

  async automationStop(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.cancelled = true;
      job.message = 'Stopping';
      await this.stop(id);
    }
  }

  maxConcurrent() {
    return Number(this.db.rows("SELECT value FROM settings WHERE key='maxConcurrent'")[0]?.value ?? 3);
  }

  settings(max: number) {
    this.db.transaction(() => this.db.run("INSERT OR REPLACE INTO settings VALUES('maxConcurrent',?)", [String(max)]));
  }

  snapshot(): Snapshot {
    return {
      profiles: this.profiles(),
      proxies: this.db.rows('SELECT data FROM proxies').map(r => proxySchema.parse(JSON.parse(String(r.data)))),
      logs: this.logs,
      backups: this.db.rows('SELECT * FROM backups ORDER BY created_at DESC LIMIT 200').map(r => ({id: String(r.id), profileId: String(r.profile_id), createdAt: String(r.created_at), path: String(r.path), checksum: String(r.checksum)})),
      diagnostics: this.db.rows('SELECT * FROM diagnostics ORDER BY created_at DESC LIMIT 100').map(r => ({profileId: String(r.profile_id), createdAt: String(r.created_at), result: JSON.parse(String(r.data)) as z.infer<ReturnType<typeof z.json>>})),
      jobs: [...this.jobs].map(([profileId, j]) => ({profileId, running: j.running, message: j.message})),
      settings: {maxConcurrent: this.maxConcurrent()},
      engine: `Playwright Chromium ${chromium.executablePath().split(path.sep).slice(-3).join('/')}`,
    };
  }

  async backup(id: string, destination: string) {
    this.assertIdle(id);
    this.busy.add(id);
    try {
      const p = this.profile(id);
      const files: z.infer<typeof manifestSchema>['files'] = [];
      let total = 0;
      const walk = (dir: string) => {
        for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
          if (['.phantom-lock', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'Cache', 'Code Cache', 'GPUCache'].includes(item.name)) continue;
          const full = path.join(dir, item.name);
          if (item.isSymbolicLink()) throw Error('Symbolic links cannot be backed up');
          if (item.isDirectory()) walk(full);
          else if (item.isFile()) {
            total += fs.statSync(full).size;
            if (total > 256 * 1024 * 1024) throw Error('Backup exceeds 256 MiB safety limit; clear browser caches first');
            const bytes = fs.readFileSync(full);
            files.push({name: path.relative(this.directory(id), full).split(path.sep).join('/'), size: bytes.length, sha256: hash(bytes), data: bytes.toString('base64')});
          }
        }
      };
      walk(this.directory(id));
      const manifest: z.infer<typeof manifestSchema> = {
        format: 'phantom-backup',
        version: 1,
        engine: p.engineVersion,
        profile: {...pickInput(p), proxyId: null},
        files,
      };
      const bytes = gzipSync(JSON.stringify(manifest));
      const tmp = destination + '.partial';
      fs.writeFileSync(tmp, bytes, {mode: 0o600});
      fs.renameSync(tmp, destination);
      this.db.transaction(() => this.db.run('INSERT INTO backups VALUES(?,?,?,?,?)', [randomUUID(), id, now(), destination, hash(bytes)]));
      return destination;
    } finally {
      this.busy.delete(id);
    }
  }

  async restore(source: string) {
    if (fs.statSync(source).size > 400 * 1024 * 1024) throw Error('Backup archive too large');
    let manifest: z.infer<typeof manifestSchema>;
    try {
      manifest = manifestSchema.parse(JSON.parse(gunzipSync(fs.readFileSync(source), {maxOutputLength: 400 * 1024 * 1024}).toString('utf8')));
    } catch {
      throw Error('Corrupt or unsupported backup');
    }
    const names = new Set<string>();
    let total = 0;
    for (const f of manifest.files) {
      if (!safeArchivePath(f.name) || names.has(f.name.toLowerCase())) throw Error('Unsafe or duplicate archive path');
      names.add(f.name.toLowerCase());
      const data = Buffer.from(f.data, 'base64');
      total += data.length;
      if (total > 256 * 1024 * 1024 || data.length !== f.size || hash(data) !== f.sha256) throw Error('Backup checksum or size mismatch');
    }
    const p = this.create({...manifest.profile, proxyId: null, name: manifest.profile.name + ' (restored)'});
    try {
      for (const file of manifest.files) {
        const dest = path.join(this.directory(p.id), file.name);
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, Buffer.from(file.data, 'base64'), {mode: 0o600});
      }
      this.patch(p.id, {engineVersion: manifest.engine, notes: p.notes + '\nRestored backup. Browser-version compatibility and OS-bound cookie decryption must be checked before use.'});
      return p;
    } catch (e) {
      this.delete(p.id, true);
      throw e;
    }
  }
}

function pickInput(p: Profile) {
  return {name: p.name, notes: p.notes, tags: p.tags, config: p.config, proxyId: p.proxyId, launchUrl: p.launchUrl};
}

export function safeArchivePath(name: string) {
  return !!name && !name.includes('\\') && !name.startsWith('/') && !name.includes(':') && name.split('/').every(p => p !== '.' && p !== '..' && p !== '' && !/[. ]$/.test(p) && !/[<>|?*]/.test(p) && ![...p].some(c => c.charCodeAt(0) < 32) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)) && !name.split('/').some(p => p.toLowerCase() === '.phantom-lock');
}
