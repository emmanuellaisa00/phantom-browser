import {test, expect, _electron as electron} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('installed Windows application launches its bundled browser offline', async () => {
  test.skip(process.platform !== 'win32' || !process.env.PHANTOM_INSTALLED_EXE, 'Requires installed Windows application');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phantom-installed-'));
  const app = await electron.launch({executablePath: process.env.PHANTOM_INSTALLED_EXE!, args: [`--user-data-dir=${root}`]});
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading', {name: 'Dashboard', exact: true})).toBeVisible();
    await page.context().setOffline(true);
    const created = await page.evaluate(() => window.phantom!.request({action: 'create', input: {name: 'Installed offline smoke', notes: '', tags: [], config: {version: 1, viewport: {width: 1280, height: 720}, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'dark', reducedMotion: 'no-preference'}, proxyId: null, launchUrl: ''}}));
    expect(created.ok).toBe(true);
    if (!created.ok) throw Error(created.error);
    const id = created.snapshot.profiles[0]!.id;
    const launched = await page.evaluate(id => window.phantom!.request({action: 'launch', id}), id);
    expect(launched.ok).toBe(true);
    if (!launched.ok) throw Error(launched.error);
    expect(launched.snapshot.profiles[0]!.status).toBe('running');
    expect((await page.evaluate(id => window.phantom!.request({action: 'stop', id}), id)).ok).toBe(true);
  } finally {
    await app.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
});
