import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Page} from 'playwright';
import {z} from 'zod';
import {stepSchema} from '../shared/schema';

export interface Job {running: boolean; message: string; cancelled: boolean; done?: Promise<string>}
interface StepRecord {
  step: number;
  action: z.infer<typeof stepSchema>['action'];
  startedAt: string;
  completedAt: string;
  durationMs?:number;
  outcome: 'success' | 'failure' | 'cancelled';
  error?: string;
  screenshot?: string;
  metadata?: {content: 'omitted for privacy'};
}
const now = () => new Date().toISOString();

// No arbitrary input, page title, selector, URL, fill value or raw exception is serialized.
// Page pixels can contain secrets: mask the entire page, including child frames, for
// report screenshots. This is a privacy-first capture, not a sensitive-page export.
export async function runAutomation(page: Page, rawSteps: unknown, directory: string, profileId: string, job: Job): Promise<string> {
  const steps = z.array(stepSchema).min(1).max(100).parse(rawSteps);
  const jobId = randomUUID();
  const startedAt = now();
  const startedClock = performance.now();
  const records: StepRecord[] = [];
  let outcome: 'success' | 'failure' | 'cancelled' = 'success';
  try {
    for (let parent = path.dirname(directory); ; parent = path.dirname(parent)) {
      if (fs.lstatSync(parent).isSymbolicLink()) throw Error('Unsafe reports parent');
      if (parent === path.dirname(parent)) break;
    }
    fs.mkdirSync(directory, {recursive: true, mode: 0o700});
    if (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory()) throw Error('Invalid reports directory');
    for (const [index, step] of steps.entries()) {
      const record: StepRecord = {step: index + 1, action: step.action, startedAt: now(), completedAt: '', outcome: 'cancelled'};
      records.push(record);
      const stepClock = performance.now();
      try {
        if (job.cancelled) throw Error('Cancelled');
        switch (step.action) {
          case 'url': page.url(); record.metadata = {content:'omitted for privacy'}; break;
          case 'delay': {
            const end = performance.now() + step.milliseconds;
            while (!job.cancelled && performance.now() < end) await new Promise(resolve=>setTimeout(resolve, Math.min(50, Math.max(1,end-performance.now()))));
            break;
          }
          case 'navigate': await page.goto(step.url, {timeout: 15000, waitUntil: 'domcontentloaded'}); break;
          case 'title': await page.title(); record.metadata = {content: 'omitted for privacy'}; break;
          case 'screenshot': {
            const name = `${profileId}-${jobId}-${index + 1}.png`;
            const file = path.join(directory, name);
            const bytes = await page.screenshot({timeout: 10000, mask: [page.locator('html')], maskColor: '#111318'});
            fs.writeFileSync(file, bytes, {flag: 'wx', mode: 0o600});
            record.screenshot = name;
            record.metadata = {content: 'omitted for privacy'};
            break;
          }
          case 'wait': await page.locator(step.selector).waitFor({timeout: 10000}); break;
          case 'click': await page.locator(step.selector).click({timeout: 10000}); break;
          case 'fill': await page.locator(step.selector).fill(step.value, {timeout: 10000}); break;
        }
        record.outcome = job.cancelled ? 'cancelled' : 'success';
      } catch {
        record.outcome = job.cancelled ? 'cancelled' : 'failure';
        record.error = job.cancelled ? 'Operation cancelled.' : 'Browser operation failed; sensitive details withheld.';
      } finally {
        record.completedAt = now();
        record.durationMs = Math.round(performance.now()-stepClock);
      }
      if (record.outcome !== 'success') {outcome = record.outcome; break;}
      job.message = `Completed step ${index + 1}/${steps.length}`;
    }
  } catch {
    outcome = job.cancelled ? 'cancelled' : 'failure';
  }
  if (job.cancelled) outcome = 'cancelled';
  job.message = outcome === 'success' ? 'Completed' : outcome === 'cancelled' ? 'Stopped' : 'Failed; browser operation did not complete';
  const report = {format: 'phantom-automation-report', version: 1, jobId, runId:jobId, durationMs:Math.round(performance.now()-startedClock), profileId, startedAt, completedAt: now(), outcome, plannedSteps: steps.length, attemptedSteps: records.length, report: records};
  const destination = path.join(directory, `${profileId}-${jobId}.json`);
  const temporary = destination + '.partial';
  try {
    if (fs.lstatSync(directory).isSymbolicLink()) throw Error('Unsafe reports directory');
    fs.writeFileSync(temporary, JSON.stringify(report, null, 2), {flag: 'wx', mode: 0o600});
    fs.renameSync(temporary, destination);
  } catch {
    try {fs.rmSync(temporary, {force: true});} catch { /* never hide the write failure */ }
    job.message += '; report NOT saved (storage unavailable)';
  } finally {
    job.running = false;
  }
  return job.message;
}
