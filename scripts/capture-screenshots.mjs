// Documentation capture harness. Never point this at real user data.
// Linux: xvfb-run -a -s '-screen 0 1440x1000x24' node scripts/capture-screenshots.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {_electron as electron, expect} from '@playwright/test';

const output = path.resolve('docs/screenshots');
fs.mkdirSync(output, {recursive: true});
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phantom-screenshot-demo-'));
const records = [];
const server = http.createServer((_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end('<!doctype html><title>Phantom local QA fixture</title><h1>Local QA fixture</h1><label>Demo input <input id="demo"></label><button id="apply" onclick="document.title=\'Demo completed\'">Apply</button><p>Synthetic documentation data only.</p>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  app = await electron.launch({args: ['.', `--user-data-dir=${root}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env: {...process.env, PHANTOM_DEV_URL: ''}});
  console.log('Electron connected');
  const page = await app.firstWindow();
  await expect(page.getByText('Desktop connected', {exact: true})).toBeVisible();
  console.log('Renderer ready');
  await app.evaluate(({BrowserWindow}) => {const w = BrowserWindow.getAllWindows()[0]; w.setBounds({x: 0, y: 0, width: 1440, height: 1000});});
  if (process.platform === 'linux') {
    // Test-only adapter for container sandbox/display constraints. The actual
    // service, IPC, databases and Chromium profiles remain in use; no statuses
    // or snapshots are mocked. Production source is not changed by this adapter.
    await app.evaluate(() => {
      const pw = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('playwright');
      const launch = pw.chromium.launchPersistentContext.bind(pw.chromium);
      pw.chromium.launchPersistentContext = (dir, options) => launch(dir, {...options, headless: true, chromiumSandbox: false});
    });
  }
  console.log('Capture adapter ready');
  const nav = async name => {
    await page.getByRole('navigation').getByRole('button', {name, exact: true}).click();
    await expect(page.getByRole('heading', {level: 1, name, exact: true})).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  const refresh = async () => {
    await expect.poll(async () => (await page.evaluate(() => window.phantom.request({action: 'snapshot'}))).ok).toBe(true);
    // Let the existing renderer refresh interval consume the service snapshot.
    await page.waitForTimeout(2700);
  };
  const request = async req => {
    const reply = await page.evaluate(req => window.phantom.request(req), req);
    if (!reply.ok) throw Error(`Fixture request ${req.action}: ${reply.error}`);
    return reply;
  };
  const shot = async (name, title, note = '') => {
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({path: path.join(output, name + '.png'), fullPage: true, animations: 'disabled'});
    records.push({file: name + '.png', title, note, kind: 'Electron renderer'});
    console.log(name);
  };
  const nativeShot = async (name, title, note) => {
    if (process.platform !== 'linux') return;
    await page.waitForTimeout(800);
    try {
      const ids = execFileSync('xdotool', ['search', '--onlyvisible', '--pid', String(app.process().pid)], {encoding: 'utf8'}).trim().split(/\s+/);
      for (const id of ids) {
        const geometry = execFileSync('xdotool', ['getwindowgeometry', '--shell', id], {encoding: 'utf8'});
        const width = Number(geometry.match(/^WIDTH=(\d+)/m)?.[1]);
        const height = Number(geometry.match(/^HEIGHT=(\d+)/m)?.[1]);
        if (width > 200 && width < 1200 && height < 950) execFileSync('xdotool', ['windowmove', id, String(Math.floor((1440-width)/2)), String(Math.floor((1000-height)/2))]);
      }
    } catch { /* optional window centering; the original native pixels are retained */ }
    execFileSync('import', ['-window', 'root', path.join(output, name + '.png')]);
    records.push({file: name + '.png', title, note, kind: 'Linux native desktop dialog'});
    console.log(name);
  };
  const pages = ['Dashboard', 'Browser Profiles', 'Proxy Manager', 'Fingerprint Diagnostics', 'Automation', 'Backups', 'Logs', 'Settings'];
  for (const [i, name] of pages.entries()) {await nav(name); await shot(`01-${String(i + 1).padStart(2, '0')}-fresh-${name.toLowerCase().replaceAll(' ', '-')}`, `${name} — fresh workspace`, name === 'Logs' ? 'Contains the genuine startup event.' : 'No profiles or proxies have been seeded yet.');}

  await nav('Browser Profiles'); await page.getByRole('button', {name: '＋ Create profile'}).first().click();
  await shot('02-01-create-profile', 'Create profile dialog');
  await page.getByLabel('Profile name', {exact: true}).fill('QA — Nairobi workspace');
  await page.getByLabel('Tags (comma-separated)').fill('demo, qa, east-africa');
  await page.getByLabel('Notes', {exact: true}).fill('Synthetic documentation profile. No accounts, cookies or credentials.');
  await page.getByLabel('Versioned browser configuration').fill(JSON.stringify({version: 1, viewport: {width: 1280, height: 800}, locale: 'en-GB', timezoneId: 'Africa/Nairobi', colorScheme: 'dark', reducedMotion: 'reduce'}, null, 2));
  await shot('02-02-create-profile-filled', 'Create profile — filled demo configuration');
  await page.locator('.modal').evaluate(el => {el.scrollTop = el.scrollHeight;});
  await shot('02-03-create-profile-config', 'Create profile — configuration and validation guidance');
  await page.getByLabel('Versioned browser configuration').fill('{ invalid JSON');
  await page.getByRole('button', {name: 'Create profile', exact: true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.locator('.modal').evaluate(el => {el.scrollTop = 0;});
  await shot('02-04-profile-validation', 'Profile configuration validation error');
  await page.getByRole('button', {name: 'Close dialog'}).click();

  await nav('Proxy Manager'); await page.getByRole('button', {name: '＋ Add proxy'}).first().click();
  await shot('03-01-add-proxy', 'Add proxy dialog');
  await page.getByLabel('Proxy name').fill('Demo — local HTTP endpoint'); await page.getByLabel('Host', {exact: true}).fill('127.0.0.1');
  await shot('03-02-add-proxy-filled', 'Add proxy — synthetic loopback endpoint', 'No credentials; connectivity is not claimed.');
  await page.getByLabel('Protocol').selectOption('socks5');
  await shot('03-03-socks5-dialog', 'SOCKS5 configuration — authentication disabled');
  await page.getByRole('button', {name: 'Close dialog'}).click();

  await request({action: 'proxySave', input: {name: 'Demo HTTP — offline endpoint', protocol: 'http', host: '127.0.0.1', port: 1}});
  await request({action: 'proxySave', input: {name: 'Demo HTTPS — not tested', protocol: 'https', host: '127.0.0.1', port: 9443}});
  await request({action: 'proxySave', input: {name: 'Demo SOCKS5 — no authentication', protocol: 'socks5', host: '127.0.0.1', port: 1080}});
  const proxy = (await request({action: 'snapshot'})).snapshot.proxies[0];
  for (const input of [
    {name: 'QA — Nairobi workspace', tags: ['demo', 'qa'], notes: 'Synthetic profile for documentation.', launchUrl: origin, config: {locale: 'en-GB', timezoneId: 'Africa/Nairobi'}},
    {name: 'Research — isolated session', tags: ['demo', 'research'], launchUrl: origin},
    {name: 'Staging — direct connection', tags: ['demo', 'staging']},
    {name: 'Archive — backup example', tags: ['demo', 'archive']},
    {name: 'Proxy failure — controlled demo', tags: ['demo', 'error'], proxyId: proxy.id, launchUrl: origin},
  ]) await request({action: 'create', input});
  let profiles = (await request({action: 'snapshot'})).snapshot.profiles;
  const qa = profiles.find(p => p.name.startsWith('QA'));
  const research = profiles.find(p => p.name.startsWith('Research'));
  const archive = profiles.find(p => p.name.startsWith('Archive'));
  const failed = profiles.find(p => p.name.startsWith('Proxy failure'));
  await request({action: 'launch', id: qa.id}); await request({action: 'launch', id: research.id});
  const fail = await page.evaluate(id => window.phantom.request({action: 'launch', id}), failed.id);
  if (fail.ok) throw Error('Expected closed-proxy fixture launch to fail');
  await refresh();
  await nav('Dashboard'); await shot('04-01-dashboard-populated', 'Dashboard — populated and live', 'Two real Chromium profiles are running; one controlled proxy launch failed.');
  await nav('Browser Profiles'); await shot('04-02-profiles-populated', 'Profiles — running, stopped and controlled failure');
  await page.getByLabel('Select displayed profiles').check(); await shot('04-03-profiles-bulk-selection', 'Profiles — bulk selection');
  await page.getByRole('button', {name: 'Clear', exact: true}).click();
  await page.getByLabel('Status filter').selectOption('running'); await shot('04-04-profiles-running-filter', 'Profiles — running filter');
  await page.getByLabel('Status filter').selectOption('all'); await page.getByLabel('Search profiles').fill('no-such-demo-profile');
  await shot('04-05-profiles-no-search-results', 'Profiles — no matching search results'); await page.getByLabel('Search profiles').fill('');
  const archiveRow = page.getByRole('row').filter({hasText: archive.name});
  await archiveRow.getByRole('button', {name: 'Edit', exact: true}).click(); await shot('04-06-edit-profile', 'Edit existing profile'); await page.getByRole('button', {name: 'Close dialog'}).click();
  await page.getByLabel(`More actions for ${archive.name}`, {exact: true}).click(); await shot('04-07-profile-actions-menu', 'Profile actions menu'); await page.getByLabel(`More actions for ${archive.name}`, {exact: true}).click();

  await nav('Proxy Manager'); await shot('05-01-proxy-manager-populated', 'Proxy manager — configured, not falsely connected');
  await page.getByRole('row').filter({hasText: proxy.name}).getByRole('button', {name: 'Edit', exact: true}).click(); await shot('05-02-edit-proxy', 'Edit proxy — credential handling guidance'); await page.getByRole('button', {name: 'Close dialog'}).click();
  await request({action: 'proxyTest', id: proxy.id}); await refresh(); await shot('05-03-proxy-test-failure', 'Proxy connectivity test — genuine failure', 'Loopback port 1 is deliberately unreachable; no fabricated success.');

  await nav('Fingerprint Diagnostics'); await page.getByLabel('Profile to inspect').selectOption(qa.id); await page.getByRole('button', {name: 'Run diagnostics'}).click();
  await expect(page.locator('pre')).toBeVisible(); await shot('06-01-diagnostics-result', 'Diagnostics — actual Chromium observations');

  await nav('Automation'); await page.getByLabel('Running profile').selectOption(qa.id);
  const steps = [{action: 'navigate', url: origin}, {action: 'wait', selector: '#demo'}, {action: 'fill', selector: '#demo', value: 'Synthetic QA input'}, {action: 'click', selector: '#apply'}, {action: 'title'}, {action: 'screenshot'}];
  await page.getByLabel('Steps (JSON)').fill(JSON.stringify(steps, null, 2)); await shot('07-01-automation-ready', 'Automation — six-action local test');
  await page.getByRole('button', {name: '▷ Run test'}).click(); await expect(page.getByRole('status')).toHaveText(/Completed/); await shot('07-02-automation-completed', 'Automation — genuine completed job');
  await page.getByLabel('Steps (JSON)').fill('{invalid JSON'); await page.getByRole('button', {name: '▷ Run test'}).click(); await expect(page.getByRole('alert')).toBeVisible(); await shot('07-03-automation-validation', 'Automation — invalid JSON rejected'); await page.getByLabel('Dismiss error').click();
  await page.getByLabel('Steps (JSON)').fill(JSON.stringify([{action: 'wait', selector: '#never-present-demo'}], null, 2)); await page.getByRole('button', {name: '▷ Run test'}).click();
  await expect(page.getByRole('button', {name: '■ Stop job & close profile'})).toBeEnabled(); await shot('07-04-automation-running', 'Automation — running cancellable wait');
  await page.getByRole('button', {name: '■ Stop job & close profile'}).click(); await expect.poll(async () => (await request({action: 'snapshot'})).snapshot.jobs.find(j => j.profileId === qa.id)?.message).toBe('Stopped'); await refresh(); await shot('07-05-automation-cancelled', 'Automation — cancelled job and closed profile');

  // Seed a real backup through existing IPC using fixture-only dialog answers.
  const backup = path.join(root, 'demo-archive.phantom.gz');
  await app.evaluate(({dialog}, backup) => {
    globalThis.__originalDemoDialogs = {message: dialog.showMessageBox, save: dialog.showSaveDialog, open: dialog.showOpenDialog};
    dialog.showMessageBox = async () => ({response: 1, checkboxChecked: false});
    dialog.showSaveDialog = async () => ({canceled: false, filePath: backup});
    dialog.showOpenDialog = async () => ({canceled: false, filePaths: [backup]});
  }, backup);
  await request({action: 'backup', id: archive.id}); await refresh();
  await nav('Backups'); await page.getByLabel('Profile to back up').selectOption(archive.id); await shot('08-01-backup-history', 'Backups — real archive and SHA-256 history');
  await request({action: 'restore'}); await refresh(); await shot('08-02-backup-restored', 'Backups — completed restore retained in history', 'Restore created a distinct new profile; see the following profile list.');
  await nav('Browser Profiles'); await shot('08-03-restored-profile', 'Profiles — restored copy has a new identity');
  await nav('Logs'); await shot('09-01-logs-populated', 'Logs — genuine demo-session events');
  await nav('Settings'); await page.getByRole('spinbutton').fill('4'); await page.getByRole('button', {name: 'Save settings'}).click(); await expect(page.getByRole('status')).toBeVisible(); await shot('10-01-settings-saved', 'Settings — resource limit saved');

  if (process.platform === 'linux') {
    // Native Linux dialogs are captured separately, never passed off as Windows.
    await app.evaluate(({dialog}) => {
      const original = globalThis.__originalDemoDialogs;
      dialog.showMessageBox = (owner, options) => {const control = new AbortController(); globalThis.__demoDialogAbort = control; return original.message(owner, {...options, signal: control.signal});};
    });
    await nav('Backups'); await page.getByRole('button', {name: '↥ Restore backup'}).click();
    await nativeShot('11-01-native-backup-warning', 'Native backup sensitivity warning', 'Actual Linux GTK dialog; Windows native styling differs.');
    await app.evaluate(() => globalThis.__demoDialogAbort.abort());
    await nav('Browser Profiles'); await page.getByLabel(`More actions for ${archive.name}`, {exact: true}).click(); await page.getByRole('button', {name: 'Delete…', exact: true}).click();
    await nativeShot('11-02-native-delete-confirmation', 'Native permanent-delete confirmation', 'Cancelled after capture; no demo profile is deleted. Linux GTK styling.');
    await app.evaluate(() => globalThis.__demoDialogAbort.abort());
    await app.evaluate(({dialog}, root) => {
      void globalThis.__originalDemoDialogs.open({defaultPath: root, properties: ['openFile'], filters: [{name: 'Phantom backup', extensions: ['gz']}]});
    }, root);
    await nativeShot('11-03-native-restore-file-picker', 'Native restore archive picker', 'Actual Linux file picker, restricted to a disposable synthetic-data directory.');
    execFileSync('xdotool', ['key', 'Escape']);
    await app.evaluate(({dialog}, root) => {
      void globalThis.__originalDemoDialogs.save({defaultPath: root + '/demo-export.phantom.gz', filters: [{name: 'Phantom backup', extensions: ['gz']}]});
    }, root);
    await nativeShot('11-04-native-export-file-picker', 'Native backup export picker', 'Actual Linux save picker. Cancelled without writing outside the fixture.');
    execFileSync('xdotool', ['key', 'Escape']);
  }
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({capturedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), platform: process.platform, resolution: '1440x1000 renderer window; full-page captures where needed', syntheticDataOnly: true, linuxBrowserAdapter: 'Real Chromium contexts run headless with chromiumSandbox=false in this documentation harness only.', note: 'Renderer still contains the existing v0.1.0 display label in the v0.1.1 source. These images reproduce the real UI; the label was not retouched.', screenshots: records}, null, 2) + '\n');
  console.log(`Captured ${records.length} screenshots.`);
} catch (error) {console.error(error); throw error;} finally {
  if (app) await app.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, {recursive: true, force: true});
}
