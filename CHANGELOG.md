# Changelog

## 0.1.1 — candidate, not published

### Fixed
- Automation now emits ordered records for all six attempted actions with start/end timestamps, safe failure/cancellation outcomes, job timing and screenshot references. Unique files, directory recreation and explicit report-write failure messages replace timestamp collisions and false completion reporting.
- Reports omit raw page titles, URLs, selectors, fill values and exceptions. Screenshots mask page content to avoid saving passwords/cookies rendered by websites. IPC job-message shape remains compatible.
- Launch reservation covers asynchronous initialization; concurrent launches and launch/shutdown races are guarded. Close/cleanup is idempotent and bounded. Unknown browser exit retains locks rather than trusting an Electron PID or transport-disconnect alone.
- Malformed locks fail closed; recovery is gated and ownership-marked. Startup distinguishes unresolved browser history from completed launches.
- Retained HTTP proxy credentials cannot silently turn into authenticated SOCKS5 settings. Credential failures are redacted and fail closed.
- Windows development invocation no longer attempts to execute a Unix `.bin/electron` shim.
- License listing recognizes actual bundled browser notice files rather than falsely reporting an unprovisioned runtime.

### Hardened
- Checked-in archive SHA256 pins plus per-file identity/inventory verification; no ordinary manifest bootstrap/overwrite. ZIP inventory validation precedes extraction. No unverified ffmpeg/headless sibling runtimes are promoted.
- The shared strict runtime verifier runs before browser launches and packaging. A Windows packaging preflight rejects Linux/macOS runtime bundles.
- Backup per-file/count/total/archive/expansion limits, bounded file reads, canonical base64, Unicode/case duplicate and parent-file collision rejection, symlink/path defenses, unique temporary files and cleanup of partially restored profiles.
- Explicitly denied renderer permission checks and webviews without relaxing CSP, IPC authorization or Node isolation.
- Additional unit, real-browser, desktop-security and installed-runtime-tamper regressions. Installer resources are narrowed to the required Chromium revision, with source maps/dev dependencies excluded from packaged app files.
- Build CI remains SHA-pinned and read-only; automatic GitHub Release publication was removed. Build artifacts are not release authorization.

### Limitations
- Backups remain unencrypted. There is no unsafe PID-kill/force-unlock fallback. Some orphan/malformed-lock cases require manual review.
- Screenshots are privacy-masked rather than full-content exports. Stored page-title content is intentionally omitted from reports.
- No stealth, anti-detection, DNS/WebRTC leak-prevention or universal fingerprint-consistency guarantee.
- Windows 10/11 compatibility must be confirmed against the recorded Windows CI and manual installation results. No digital-signature claim is made.

## 0.1.0

Initial published Windows x64 installer with bundled Chromium. See the existing GitHub release for its historical artifacts; v0.1.1 work does not overwrite them.
