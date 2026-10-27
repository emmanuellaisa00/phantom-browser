import type {BrowserConfig} from '../shared/schema';
// Prevent obvious contradictions rather than attempting platform/client-hint spoofing.
// A native UA is safest; no values are randomized at launch.
export function fingerprintIssues(config:BrowserConfig, platform:NodeJS.Platform, runtimeVersion:string):string[] {
 const ua=config.userAgent;if(!ua)return [];
 const issues:string[]=[];
 const version=ua.match(/(?:HeadlessChrome|Chrome)\/(\d+)/)?.[1];
 if(!version || version!==runtimeVersion.split('.')[0])issues.push('Custom UA must identify the bundled Chromium major version');
 const expected=platform==='win32'?'Windows NT':platform==='linux'?'Linux':undefined;
 if(expected&&!ua.includes(expected))issues.push('Custom UA must match the native operating system; platform spoofing is unsupported');
 if(/Mobile|Android|iPhone|iPad/i.test(ua))issues.push('Mobile UA is incompatible with this desktop-only configuration');
 return issues;
}
