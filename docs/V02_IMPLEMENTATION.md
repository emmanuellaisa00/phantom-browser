# Local workspaces development — implementation and verification

**2026-10-27 · 0.2.0-dev.1 · branch `feat/local-workspaces-v0.2`**

**Status: substantial staged implementation, not production-complete.** Actual tested code commit: `6656c90027a8e963f321a2115c87b98125d1221c`. Documentation commits may follow without changing that code. No new release was published and no main merge was performed. Existing published v0.1.1 and v0.1.0 assets were not changed.

## Audit and implementation order

Reconciled restored Git metadata with remote review baseline `d602081` without discarding existing work. Audited the existing architecture, runtime/ownership/backup/IPC safeguards and tests; kept Electron + React + sql.js + Playwright rather than replacing them. Baseline typecheck and all **62** unit tests passed. Four added regressions initially failed on missing archival/startup/metadata/actions. A separate asynchronous credential-edit race was reproduced before its fix. See [audit](V02_AUDIT.md).

Local implementation commits:
- `580c95c`: workspace archival/metadata/native preferences and authenticated JWE backups.
- `079ea09`: guided UI, proxy/preference integration fixtures, DPAPI-save race guard.
- `6656c90`: native session restoration, private conditional automation, Electron regressions and development CI trigger.

These are local commits. **A dry-run push was rejected because this restored workspace has no GitHub credentials.** The GitHub connector lookup reported unsupported. There is no new remote branch or Windows run to cite. The workflow accepts an authorized push to this exact feature branch or manual dispatch and retains read-only permissions/no automatic publication.

## New vs retained

| Area | New implementation | Retained foundations |
|---|---|---|
| Profiles | Description, non-destructive archive/unarchive, last session-activity timestamps; startup URL lists, homepage action; opt-in Chromium tab/session-storage restoration | UUID directories, metadata/tags/notes, duplicate/delete, concurrent persistent contexts, cookies/local storage, launch history |
| UI | Four-step optional wizard/review, typed native preference fields, archive filter/recently-used sort, guarded sequential bulk launch/stop/archive/unarchive/delete, password export/import modal, actual package version labels | Eight pages, native file/delete/session warnings, pagination/search/status filtering, existing React/CSS architecture |
| Proxy | User-entered region labels, measured whole-probe latency; actual local HTTP Basic/SOCKS5 routing and no-direct-fallback tests; reject pending DPAPI write if a profile starts/shutdown begins | Per-profile HTTP/HTTPS/SOCKS5 configuration, DPAPI-only secrets, no authenticated SOCKS5, bounded/redacted explicit IP probe |
| Fingerprint | Native DPR, explicit geolocation grant, Chromium non-proxied-UDP policy, custom-UA Chromium-major/native-desktop-OS contradiction guard; observed DPR/permissions/client hints/device memory/API availability and explicit limitations | Versioned viewport/screen/locale/timezone/color/motion settings, WebGL/CPU/platform/automation observations; no random launch fingerprints |
| Automation | Current URL read, delay (0–30,000 ms), selector state, exact URL/title conditions, run IDs and monotonic per-step/total durations | Navigate/title/wait/click/fill/privacy-masked screenshot, strict bounded steps, cancellation/stop, redacted ordered reports |
| Backups | Standard compact-JWE envelope via pinned jose/WebCrypto, random library salt/IV, bounded PBES2 key wrapping and AES-GCM; authenticate before decompression/profile creation | Gzip v1 manifest compatibility, new UUID restores, credential/assignment exclusion, existing limits/path/hash/symlink/collision defenses |
| Security/build | Credential-save race regression, no new backup writes after shutdown; development-only version and exact branch CI trigger, updated docs/start script/license listing | Strict isolated preload/IPC, sandbox/CSP, bounded shutdown, conservative lock ownership, pinned runtime trust and Windows-only NSIS gate |

Archival retains the directory and refuses launch until unarchived. Last-used means launch/homepage/stop session activity, not surveillance of every navigation. Restored native tabs take precedence when explicitly enabled and available; otherwise startup URLs, legacy launch URL, then homepage are used. Legacy metadata defaults are additive; new fields can prevent old strict app versions from reading newly saved data. Keep separate pre-upgrade data snapshots.

## Actual verification on this development code

Environment: Linux x64 sandbox, Node 24.22.0, Electron 45.0.0, Chromium 156.0.8078.4 revision 1248. Electron uses Xvfb and the existing **test-only Linux `--no-sandbox` adapter**; production security preferences were not relaxed.

| Command | Actual result |
|---|---|
| `npm ci` | Baseline install succeeded; pinned jose added with lockfile |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | **73 passed**, 9 files (includes the 12 runtime tests) |
| `npm run test:runtime` | **12 passed** again; not 12 additional unique unit tests |
| `npm run provision` / `npm run verify:runtime` | Pinned archive provisioned and **303 Linux runtime files verified**; no trust hashes generated/overwritten |
| `npm run test:integration` | **20 passed**, real Chromium; all original 11 tests retained |
| `npm run build` | Passed (typecheck + Vite + esbuild) |
| `xvfb-run -a npm run test:desktop` | **3 passed, 1 skipped**; Windows DPAPI test intentionally skipped on Linux |
| `npm audit --json` | **0 known advisories** reported at execution time, including development dependencies; not an audit of the whole product |
| `npm run licenses` | Passed; includes jose 6.2.13 MIT and bundled browser-notice pointers |
| `git diff --check` | Passed |
| New Windows build/DPAPI/install/upgrade/uninstall | **NOT RUN** — authenticated push/CI unavailable here |

Machine-readable summary: [V02_VERIFICATION.json](V02_VERIFICATION.json).

### Real behavior verified (not just controls)

- Concurrent profiles keep cookies/local storage separate; stopped/relaunched cookies/storage survive. Copies have independent directories and session changes.
- IndexedDB survives relaunch and is absent from the second profile. After graceful stop, each actual Chromium `Default/History` SQLite contains its own controlled URL and not the other profile's URL.
- Two startup tabs load controlled URLs. Homepage navigation, DPR 1.5, granted configured geolocation and repeated stable preferences are observed inside Chromium. Coordinates alone produce **denied**, not granted, geolocation.
- Opt-in `--restore-last-session` restores two controlled tabs and tab session storage after a graceful stop.
- Local HTTP Basic proxy produces an actual authentication challenge and forwards browser traffic. Separate SOCKS5 fixture forwards a concurrently running second profile with independent storage. Fixtures only permit the controlled loopback target; background external traffic is denied.
- Probe latency is measured from actual temporary-browser work. When the proxy disappears, profile launch and probe fail and the controlled target receives **no direct fallback request**.
- Delay/exact URL/title/selector-state waits execute against a changing real page. Cancellation interrupts a 30-second delay within the asserted bound; reports have timestamps/durations and omit private URL/query/title criteria.
- JWE round trips preserve metadata/files to a new UUID. Wrong passwords, modified ciphertext and malicious KDF counts fail authentication before new profile creation. No plaintext `.gz`/partial archive is left behind. Legacy gzip still restores and cannot silently be called password-protected.
- Actual bundled Electron main/preload/renderer pass guided creation, archival/unarchive and JWE export/import through strict IPC. Only native dialogs are stubbed in the **test**, with isolated temp paths; crypto and disk/database operations are real. Renderer Node access/window/navigation defenses still pass.

## Remaining gaps and release gates

1. **New Windows evidence is missing.** Historical v0.1.1 Windows Server 2025 run [40460198692](https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40460198692) is evidence for the old release only. New code has not been built/installed/DPAPI-tested on Windows. Re-run the configured CI at the exact pushed commit, inspect artifacts/checksum/signature status, then execute [consumer Windows upgrade/uninstall checks](WINDOWS_INSTALL.md).
2. No valid digital signature, independent penetration test or full dependency/license audit. Zero npm advisories is not a security guarantee. Reviewed runtime hashes are not independent signed upstream attestation or protection against replacement of app + trust data/TOCTOU.
3. HTTPS proxy configuration remains exposed but actual TLS-proxy transport/provider certificates are not covered by the local HTTP/SOCKS tests. Real-provider auth, remote DNS resolution, STUN/public-IP leak tests, WebRTC policy effects and VPN/firewall interactions remain network-specific/unverified. No insecure TLS bypass was added. Region is not automatic geolocation; probe latency includes browser startup/verification, not a pure RTT benchmark.
4. This uses supported Chromium/Playwright preferences, **not a patched anti-detect engine**. OS/platform spoofing, CPU/device-memory changes, WebGL identity/noise, canvas/audio/font noise, media-device identity rewriting and guaranteed high-entropy client-hint consistency are unsupported. Diagnostics observe native behavior/capability availability; they do not certify leak freedom or undetectability.
5. Raw URL/title read results remain intentionally omitted from persisted automation reports; screenshots are fully privacy-masked. There is no unrestricted script executor, scheduler, remote API, extension/bookmark manager, multi-user role system or cross-device sync.
6. Encrypted exports protect archive contents at rest, not live browser files/metadata, filenames/history, account compromise, OS swap or perfect JavaScript memory erasure. No password recovery. Native OS-bound Chromium cookies may not transfer. Large backups remain memory-bounded, not streaming; maximum accepted input/expanded JSON is 400 MiB, decoded files 256 MiB, individual files 64 MiB, count 50,000. Encryption adds base64 overhead within the same input cap.
7. Native tab/session restore is opt-in and tested after a **graceful** stop; arbitrary OS crashes, every tab type/extension/service worker and every Chromium-version downgrade are not certified. No automatic runtime upgrade/rollback is implemented; follow [reviewed runtime procedure](RUNTIME_UPDATES.md).

## Verified-scope GoLogin comparison

GoLogin statements below describe **officially documented/advertised capabilities**, not an independent security/performance test of GoLogin. Phantom entries describe inspected code/local tests above. No parity or undetectability claim is made; no pricing claim is needed for this free/local design.

| Capability | GoLogin official documentation | This development branch |
|---|---|---|
| Persistent profiles | Cloud-browser docs describe persistent profiles, fingerprint configuration and proxy routing [3](https://gologin.com/docs/api-reference/cloud-browser/what-is-gologin-cloud-browser) | Real local persistent Chromium directories; cookies/storage/IndexedDB/history/session tests |
| Cloud and shared profiles | Automatic cloud saving, access across devices and shared-team profiles are documented [10](https://gologin.com/docs/browser-profiles/profile-management/profile-synchronization) | Intentionally absent: local-only, no account/paid/cloud dependency |
| Automation/API | Hosted Orbita control through a connection URL with Puppeteer/Playwright is documented [3](https://gologin.com/docs/api-reference/cloud-browser/what-is-gologin-cloud-browser); API includes profile/bulk/proxy/fingerprint endpoints [7](https://gologin.com/docs/api-reference/profile/run-profile-in-the-cloud) | Narrow local user-initiated runner; no externally exposed control port or API parity |
| Browser/device settings | Official [create-profile API schema](https://gologin.com/docs/api-reference/profile/create-profile-with-partial-parameters) exposes OS, DPR, timezone, canvas/audio/WebGL/client-rect and storage parameters | Native DPR/timezone/locale/screen/UA/geolocation preferences only; hardware/graphics/audio/font spoofing unsupported |
| Proxy routing | Documented cloud-browser capability [3](https://gologin.com/docs/api-reference/cloud-browser/what-is-gologin-cloud-browser) | Bring-your-own per-profile proxies; local HTTP Basic/SOCKS5 proven, HTTPS/external leak behavior not fully verified |
| Backups/data sharing | Cloud synchronization is documented [10](https://gologin.com/docs/browser-profiles/profile-management/profile-synchronization); no assertion about GoLogin archive encryption is made here | Private local gzip/JWE exports and validated new-UUID restore; no cloud sharing |

## Files changed

- `src/shared/schema.ts`: additive strict metadata/config/proxy/action/password schemas.
- `src/main/service.ts`, `fingerprint.ts`, `encrypted-backup.ts`, `automation.ts`, `ipc.ts`, `index.ts`: real persistence/browser/proxy/crypto/job/native-dialog behavior.
- `src/renderer/main.tsx`, `style.css`: existing UI extended, not replaced.
- `tests/workspaces.unit.test.ts`, `encrypted-backup.unit.test.ts`, `fingerprint.unit.test.ts`, `proxy-fixture.ts`, `browser.integration.spec.ts`, `desktop.integration.spec.ts`: new regressions/real integration coverage; original tests retained.
- `package.json`, `package-lock.json`, `scripts/licenses.mjs`, `.github/workflows/ci.yml`: dev version/start script, pinned jose/notices, exact feature branch trigger and Linux runtime suite.
- `README.md`, `CHANGELOG.md`, `SECURITY.md`, `SECURITY_REMEDIATION.md`, `WORK_CHECKPOINT.md`, `docs/WINDOWS_INSTALL.md`, this report/audit/runtime guide/verification JSON and two actual desktop screenshots: current documentation/evidence.

**Ready for review and authenticated Windows CI, not a newly approved production release.**
