# Next-version audit — 2026-10-27

Baseline: published v0.1.1 code, plus documentation/screenshots through d602081. The prompt's v0.1.0 release reference is outdated. Existing work was fetched read-only and preserved; no profile data is in this checkout. A dedicated development branch and Windows CI progress pushes are authorized; release publication and merging are not.

Inspected source modules, schemas, main/preload/renderer, sql.js persistence, browser/process service, structured automation, runtime verifier/provisioner/archive pins, backup format and security checks, all existing test suites, package/build/development scripts and pinned Windows CI.

Baseline `npm ci`, `npm run typecheck`, `npm test`: passed, 62 unit tests. Other baseline behavior is historical v0.1.1 evidence, not assumed to pass for new changes.

## Already implemented and retained
- Persistent UUID profile directories, metadata/tags/notes, create/edit/copy/delete and real simultaneous Chromium contexts.
- Cookies/local storage session tests; strict IPC and sender authorization; sandboxed Electron renderer without Node integration; DPAPI credentials with no plaintext fallback.
- Pinned Chromium archive/per-file hashes and prelaunch integrity verification; bounded shutdown and conservative ownership recovery.
- Six-action structured automation, cancellation, private reports/screenshots; validated bounded gzip backup/restore to new profile.
- Eight-page desktop dashboard, native confirmations, Windows NSIS packaging and installed-runtime corruption tests.

## Gaps to address in this stage
- Profile archival metadata, startup URL lists/homepage, description/last-used metadata, more useful bulk controls.
- Guided creation and real form controls rather than JSON-only fingerprint editing.
- Native DPR/explicit geolocation permission/WebRTC policy configuration and richer observed diagnostics, with unsupported spoofing clearly labelled.
- Real local HTTP authentication/SOCKS5 routing tests and fail-closed assertions; proxy latency and user-entered region metadata.
- Automation delay/current-URL steps and total/step duration while retaining strict redaction.
- Authenticated encrypted backup option using a maintained implementation of an established format; keep gzip import/export compatible.
- Existing version label is hardcoded 0.1.0 in v0.1.1 renderer (reproduced in the screenshot suite); replace with package version.

## Explicit limits
This is not a custom patched Chromium project, a GoLogin fork or an undetectability tool. OS/platform spoofing, hardware/WebGL/canvas/audio/font manipulation are not reliable capabilities of the existing supported Playwright configuration and will not be faked. Public DNS/WebRTC leak certification needs controlled external infrastructure. Runtime upgrades must use new reviewed trust pins; no unchecked auto-update endpoint will be added. Hosted Windows CI is not manual Windows 10/11 hardware testing.
