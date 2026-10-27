import {it,expect} from 'vitest';
import {fingerprintIssues} from '../src/main/fingerprint';
import {configSchema} from '../src/shared/schema';
it('accepts native settings and rejects UA/OS/version contradictions rather than injecting stealth patches',()=>{
 expect(fingerprintIssues(configSchema.parse({}),'win32','156.0.8078.4')).toEqual([]);
 const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
 expect(fingerprintIssues(configSchema.parse({userAgent:ua}),'win32','156.0.8078.4')).toEqual([]);
 expect(fingerprintIssues(configSchema.parse({userAgent:ua}),'linux','156.0.8078.4')).toContain('Custom UA must match the native operating system; platform spoofing is unsupported');
 expect(fingerprintIssues(configSchema.parse({userAgent:ua.replace('Chrome/156','Chrome/120')}),'win32','156.0.8078.4').length).toBeGreaterThan(0);
 for(const key of ['hardwareConcurrency','deviceMemory','webglVendor','canvasNoise','platform'])expect(configSchema.safeParse({[key]:'fake'}).success).toBe(false);
});
