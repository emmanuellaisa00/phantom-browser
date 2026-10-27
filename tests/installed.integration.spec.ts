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
    const about = path.join(path.dirname(process.env.PHANTOM_INSTALLED_EXE!), 'resources', 'browser-runtime', 'chromium-1248', 'chrome-win64', 'ABOUT');
    const original = fs.readFileSync(about);
    try {
      fs.appendFileSync(about, 'tampered');
      const rejected = await page.evaluate(id => window.phantom!.request({action: 'launch', id}), id);
      expect(rejected.ok).toBe(false);
      const state = await page.evaluate(() => window.phantom!.request({action: 'snapshot'}));
      expect(state.ok && state.snapshot.profiles.every(p => p.status !== 'running')).toBe(true);
    } finally {fs.writeFileSync(about, original);}
    const repaired = await page.evaluate(id => window.phantom!.request({action: 'launch', id}), id);
    expect(repaired.ok).toBe(true);
    expect((await page.evaluate(id => window.phantom!.request({action: 'stop', id}), id)).ok).toBe(true);

  } finally {
    await app.close();
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('installed packaged browser measures coherent persisted fingerprints and native behavior',async({browserName},testInfo)=>{
 expect(browserName).toBe('chromium');
 test.skip(process.platform!=='win32'||!process.env.PHANTOM_INSTALLED_EXE,'Requires installed Windows application');
 const {default:http}=await import('node:http');const {profileInput}=await import('../src/shared/schema');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'phantom-installed-fingerprint-'));let headers:import('node:http').IncomingHttpHeaders|undefined;
 const server=http.createServer((req,res)=>{if(req.url==='/')headers=req.headers;res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Controlled packaged diagnostic</title><p>Local diagnostics only</p>');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const app=await electron.launch({executablePath:process.env.PHANTOM_INSTALLED_EXE!,args:[`--user-data-dir=${root}`]});
 try{
  expect(await app.evaluate(({app})=>app.isPackaged)).toBe(true);const page=await app.firstWindow();
  const input=profileInput.parse({name:'Packaged observed identity',launchUrl:origin,config:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',locale:'en-GB',timezoneId:'Africa/Nairobi',viewport:{width:1000,height:700},screen:{width:1400,height:900},deviceScaleFactor:1.25,geolocationPermission:'allow',geolocation:{latitude:0,longitude:0},webrtcPolicy:'disable-non-proxied-udp'}});
  const create=await page.evaluate(input=>window.phantom!.request({action:'create',input}),input);expect(create.ok).toBe(true);if(!create.ok)throw Error(create.error);const id=create.snapshot.profiles[0]!.id;
  const request=async(action:'launch'|'diagnose'|'stop')=>{const reply=await page.evaluate(({action,id})=>window.phantom!.request({action,id}),{action,id});expect(reply.ok).toBe(true);if(!reply.ok)throw Error(reply.error);return reply;};
  await request('launch');const first=(await request('diagnose')).result as unknown as Awaited<ReturnType<import('../src/main/service').Service['diagnose']>>;
  expect(first.inconsistencies).toEqual([]);expect(first.observed.devicePixelRatio).toBe(1.25);expect(first.observed.language).toBe('en-GB');expect(first.observed.timezone).toBe('Africa/Nairobi');expect(first.observed.screen).toEqual({width:1400,height:900});expect(first.observed.permissions.geolocation).toBe('granted');
  expect(first.observed.clientHints?.platform).toBe('Windows');expect(first.observed.highEntropyClientHints?.fullVersionList?.some(b=>b.version.startsWith('156.'))).toBe(true);expect(first.observed.canvas.sha256).toMatch(/^[a-f0-9]{64}$/);expect(first.observed.audio.sha256).toMatch(/^[a-f0-9]{64}$/);expect(first.observed.permissions.camera).not.toBe('granted');expect(first.observed.permissions.microphone).not.toBe('granted');
  expect(first.observed.webRTC.status).toBe('observed-local-only');expect(first.launchPolicy.nonProxiedUDPArgumentObserved).toBe(true);expect(headers?.['user-agent']).toBe(input.config.userAgent);expect(headers?.['sec-ch-ua-platform']).toContain('Windows');
  await request('stop');await request('launch');const second=(await request('diagnose')).result as unknown as typeof first;expect(second.inconsistencies).toEqual([]);expect(second.observed.canvas.sha256).toBe(first.observed.canvas.sha256);expect(second.observed.audio.sha256).toBe(first.observed.audio.sha256);expect(second.observed.highEntropyClientHints).toEqual(first.observed.highEntropyClientHints);await request('stop');
  const {processId:ignored,...evidence}=second;void ignored;fs.writeFileSync(testInfo.outputPath('installed-fingerprint.json'),JSON.stringify({source:'actual installed Windows EXE and bundled Chromium',result:evidence},null,2));
 }finally{await app.close();await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});}
});
