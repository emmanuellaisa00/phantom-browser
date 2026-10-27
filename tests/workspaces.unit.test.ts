import {beforeEach, afterEach, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers';
import {configSchema, requestSchema} from '../src/shared/schema';
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {f = await fixture();});
afterEach(async () => {await f.cleanup();});
it('stores description, startup URLs and homepage independently and copies them', async () => {
  const p = f.service.create({name: 'Workspace', description: 'QA profile', startupUrls: ['http://localhost/a', 'http://localhost/b'], homepage: 'http://localhost/home'});
  expect(p.description).toBe('QA profile'); expect(p.startupUrls).toHaveLength(2);
  const copy = await f.service.duplicate(p.id); expect(copy.homepage).toBe(p.homepage); expect(copy.directory).not.toBe(p.directory);
});
it('archives and restores metadata without deleting the profile directory', async () => {
  const p = f.service.create({name: 'Archive'}); fs.writeFileSync(path.join(p.directory, 'keep'), 'session');
  f.service.archive(p.id, true); expect(f.service.profile(p.id).archivedAt).not.toBe(null);
  await expect(f.service.launch(p.id)).rejects.toThrow('archived'); f.service.archive(p.id, false);
  expect(f.service.profile(p.id).archivedAt).toBe(null); expect(fs.readFileSync(path.join(p.directory, 'keep'), 'utf8')).toBe('session');
});
it('accepts bounded DPR, explicit geolocation consent and documented WebRTC policy', () => {
  expect(configSchema.safeParse({deviceScaleFactor: 1.5, geolocationPermission: 'allow', geolocation: {latitude: -0.3, longitude: 36}, webrtcPolicy: 'disable-non-proxied-udp'}).success).toBe(true);
  expect(configSchema.safeParse({deviceScaleFactor: 9}).success).toBe(false);
  expect(configSchema.safeParse({geolocationPermission: 'allow'}).success).toBe(false);
});
it('strictly validates new archive and bounded automation actions', () => {
  const p = f.service.create({name: 'Actions'});
  expect(requestSchema.safeParse({action: 'archive', id: p.id}).success).toBe(true);
  expect(requestSchema.safeParse({action: 'automate', id: p.id, steps: [{action: 'url'}, {action: 'delay', milliseconds: 50}]}).success).toBe(true);
  expect(requestSchema.safeParse({action: 'automate', id: p.id, steps: [{action: 'delay', milliseconds: 999999}]}).success).toBe(false);
});
