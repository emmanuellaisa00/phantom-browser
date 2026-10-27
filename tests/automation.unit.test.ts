import {beforeEach, afterEach, it, expect, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type {Page} from 'playwright';
import {fixture} from './helpers';
let f: Awaited<ReturnType<typeof fixture>>;
beforeEach(async () => {f = await fixture();});
afterEach(async () => {vi.restoreAllMocks(); await f.cleanup();});
function mockPage() {
  const locator = {waitFor: vi.fn().mockResolvedValue(undefined), click: vi.fn().mockResolvedValue(undefined), fill: vi.fn().mockResolvedValue(undefined)};
  const page = {goto: vi.fn().mockResolvedValue(undefined), title: vi.fn().mockResolvedValue('password=SECRET'), screenshot: vi.fn().mockResolvedValue(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64')), locator: vi.fn().mockReturnValue(locator), setDefaultTimeout: vi.fn()};
  vi.spyOn(f.service, 'page').mockReturnValue(page as unknown as Page);
  return {page, locator};
}
function report() {
  const dir = path.join(f.root, 'reports');
  return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('.json'))!), 'utf8'));
}
it('reports all six ordered actions, timestamps and private screenshot references', async () => {
  const p = f.service.create({name: 'Report'}); const {page} = mockPage();
  await f.service.automate(p.id, [{action: 'navigate', url: 'http://localhost/?token=SECRET'}, {action: 'title'}, {action: 'screenshot'}, {action: 'wait', selector: '#SECRET'}, {action: 'click', selector: '#SECRET'}, {action: 'fill', selector: '#password', value: 'SECRET'}]);
  const r = report();
  expect(r.report.map((s: {action: string}) => s.action)).toEqual(['navigate', 'title', 'screenshot', 'wait', 'click', 'fill']);
  expect(r.outcome).toBe('success'); expect(Date.parse(r.completedAt)).toBeGreaterThanOrEqual(Date.parse(r.startedAt));
  for (const s of r.report) {expect(s.outcome).toBe('success'); expect(Date.parse(s.completedAt)).toBeGreaterThanOrEqual(Date.parse(s.startedAt));}
  expect(fs.existsSync(path.join(f.root, 'reports', r.report[2].screenshot))).toBe(true);
  expect(page.screenshot.mock.calls[0]?.[0]).toMatchObject({maskColor: '#111318'});
  expect(JSON.stringify(r)).not.toContain('SECRET');
});
it('records failures safely without executing subsequent steps', async () => {
  const p = f.service.create({name: 'Fail'}); const {locator} = mockPage();
  locator.fill.mockRejectedValue(Error('password=SECRET cookie=SECRET Authorization: SECRET'));
  await f.service.automate(p.id, [{action: 'fill', selector: '#password', value: 'SECRET'}, {action: 'title'}]);
  const r = report(); expect(r.outcome).toBe('failure'); expect(r.report).toHaveLength(1); expect(r.report[0].outcome).toBe('failure'); expect(r.report[0].error).toBeTruthy(); expect(JSON.stringify(r)).not.toContain('SECRET');
});
it('reports storage failure instead of claiming completed report', async () => {
  const p = f.service.create({name: 'Storage'}); mockPage();
  fs.rmSync(path.join(f.root, 'reports'), {recursive: true}); fs.writeFileSync(path.join(f.root, 'reports'), 'not a directory');
  expect(await f.service.automate(p.id, [{action: 'title'}])).toContain('report NOT saved');
});
it('validates direct service inputs before executing', async () => {
  const p = f.service.create({name: 'Validation'}); const {page} = mockPage();
  await expect(f.service.automate(p.id, [{action: 'navigate', url: 'file:///private'}])).rejects.toThrow();
  expect(page.goto).not.toHaveBeenCalled();
});
it('cancellation during a step is never reported as success', async () => {
  const p = f.service.create({name: 'Cancel'}); const {locator} = mockPage();
  let finish!: () => void;
  locator.waitFor.mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
  const run = f.service.automate(p.id, [{action: 'wait', selector: '#pending'}, {action: 'title'}]);
  await f.service.automationStop(p.id); finish(); await run;
  expect(report().outcome).toBe('cancelled'); expect(report().report[0].outcome).toBe('cancelled');
  expect(f.service.jobs.get(p.id)?.message).toBe('Stopped');
});
it('uses unique names and recreates removed report directory', async () => {
  const p = f.service.create({name: 'Unique'}); mockPage(); fs.rmSync(path.join(f.root, 'reports'), {recursive: true});
  await f.service.automate(p.id, [{action: 'title'}]); await f.service.automate(p.id, [{action: 'title'}]);
  expect(fs.readdirSync(path.join(f.root, 'reports')).filter(n => n.endsWith('.json'))).toHaveLength(2);
});
it('makes every step independently attributable with required duration',async()=>{
 const p=f.service.create({name:'Step attribution'});mockPage();await f.service.automate(p.id,[{action:'title'},{action:'fill',selector:'#field',value:'SECRET'}]);
 const r=report();for(const step of r.report){expect(step.runId).toBe(r.runId);expect(step.profileId).toBe(p.id);expect(step.durationMs).toBeTypeOf('number');expect(step.durationMs).toBeGreaterThanOrEqual(0);}
});
it.each(['navigate','title','screenshot','wait','click','fill'] as const)('records a sanitized attributable failure for %s',async action=>{
 const p=f.service.create({name:'Failure coverage'}),{page,locator}=mockPage();const failed=Error('token=PRIVATE_RAW_ERROR');
 const steps={navigate:{action:'navigate',url:'http://localhost/'},title:{action:'title'},screenshot:{action:'screenshot'},wait:{action:'wait',selector:'#field'},click:{action:'click',selector:'#field'},fill:{action:'fill',selector:'#field',value:'PRIVATE_FILL'}} as const;
 if(action==='navigate')page.goto.mockRejectedValue(failed);else if(action==='title')page.title.mockRejectedValue(failed);else if(action==='screenshot')page.screenshot.mockRejectedValue(failed);else if(action==='wait')locator.waitFor.mockRejectedValue(failed);else if(action==='click')locator.click.mockRejectedValue(failed);else locator.fill.mockRejectedValue(failed);
 await f.service.automate(p.id,[steps[action],{action:'delay',milliseconds:1}]);const r=report();expect(r.report).toHaveLength(1);expect(r.outcome).toBe('failure');expect(r.report[0]).toMatchObject({runId:r.runId,profileId:p.id,action,outcome:'failure'});expect(r.report[0].durationMs).toBeGreaterThanOrEqual(0);expect(JSON.stringify(r)).not.toContain('PRIVATE_');
});
