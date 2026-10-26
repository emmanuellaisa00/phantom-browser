import path from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('browser-runtime');
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests',testMatch:'**/*.integration.spec.ts',workers:1,timeout:60000,reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]]});
