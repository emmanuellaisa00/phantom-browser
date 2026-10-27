> Historical v0.1.1 hardening evidence below: v0.1.1 was subsequently explicitly authorized and published. New 0.2.0-dev.1 changes and unexecuted Windows gates are tracked separately in [docs/V02_IMPLEMENTATION.md](docs/V02_IMPLEMENTATION.md).

# v0.1.1 remediation and validation report

Status: **Linux and hosted-Windows CI validated candidate, not released**. Validation date: 2026-10-27. Source baseline: upstream `316dcb0` (v0.1.0 release line). Work preserves the existing Electron/React/TypeScript/Playwright architecture and all original tests. User authorized a new review-branch push and Windows CI only; no release publication or asset overwrite is authorized.

## Findings and reproduction

| Finding | Evidence before the fix | Resolution |
|---|---|---|
| Automation records only title, not every action | Six new automation regressions failed against the unchanged service; original 18 unit tests passed | Dedicated automation reporting module, attempted-step records and job timing |
| Cancelled final step can be reported Completed | Controlled pending wait resolved after automationStop; original result was not a structured cancellation | Check cancellation both before and after awaited operations; safe cancelled record |
| Arbitrary direct service steps are not validated | Direct `file:///private` navigation reached the page mock instead of rejection | Parse complete automation request again at service boundary |
| Missing report directory and write failure throw or mislead | Replaced reports directory with a file / removed it before execution | Recreate/check private directory; explicit NOT saved message; unique names and cleanup |
| Raw title/input content can leak into reports | Mock title contained controlled `password=SECRET` | Omit raw titles, URLs, selectors, values and exceptions; whole-page screenshot mask |
| Runtime verification not run by launch | Source inspection: only a CLI verifier existed; service launched executable directly | Shared verifier embedded with pinned manifests, called before profile/proxy launches |
| Provisioner trusted same-download bootstrap and promoted unverified siblings | Source inspection of `--bootstrap` and ffmpeg/headless sibling promotion | No provisioning bootstrap, pinned archive digests, pre-extraction validation, Chromium-only promotion |
| Manifest identity/path checks incomplete | Adversarial wrong-version/path/duplicate tests now exercise shared validator | Exact version/platform/arch/browser/tooling identity, strict inventory, path/link/type checks |
| Shutdown/starting profile races and indefinite close | Controlled launch race and never-resolving close in regression harness | Reserve before awaits, cancellation state, bounded close/wait/shutdown, conservative lock retention |
| Transport close precedes OS exit | Original real-browser crash regression failed during hardening (9/10 passed) | Observe OS ownership/exit and await settling around the owned browser-close handle; original test now passes unchanged |
| Dead Electron / missing PID insufficient for stale recovery | Source inspection and simulated orphan/PID-reuse/CDP-failure tests | OS ownership marker + executable + profile argument; uncertain state blocks recovery; no arbitrary PID kill |
| Backup lacks per-file/count creation bounds, predictable temp paths, strict normalized collisions | Source inspection and malformed/limit/partial-write regressions | Explicit limits, bounded reads, normalized collisions and base64 validation, exclusive unique temporaries/new-profile writes |
| HTTP credentials retained when switching to SOCKS5 | Save encrypted HTTP credentials, edit protocol without credential fields | Require explicit clearing; authenticated SOCKS5 remains rejected |
| Potential Windows development shim execution failure | Source inspection: Unix `.bin/electron` invoked directly | Invoke Electron CLI through Node, pin dev port |
| Misleading browser license warning | `npm run licenses` claimed runtime unprovisioned despite successful verification | Detect actual ABOUT/notice paths; explicitly not a full license audit |

## Files changed and purpose

- `src/main/service.ts`: lifecycle/locks/history, bounded shutdown, launch verification, backup/restore limits and cleanup, automation integration and proxy credential handling.
- `src/main/automation.ts`: structured, private, ordered job/step report implementation.
- `src/main/process-ownership.ts`: bounded Linux/Windows OS inspection; exact ownership marker, executable and profile-argument checks. Birth identity is captured; unknown/PID-reuse cases block rather than authorize termination.
- `src/shared/runtime-integrity.ts`: single verifier shared by service and tooling.
- `src/main/index.ts`, `src/main/ipc.ts`: deny webviews/permission checks, keep strict bridge/frame/URL protections; redact filesystem/validation errors.
- `scripts/provision.mjs`, `verify-runtime.mjs`, `runtime-archive.mjs` and declaration, `runtime-archives.json`: fail-closed archive+file trust, bounded download/ZIP validation/extraction, staging/promotion and shared verification.
- `scripts/check-windows-package.mjs`: refuse mixed-platform Windows bundles; verify runtime before packaging.
- `scripts/dev.mjs`, `scripts/licenses.mjs`: platform-safe development invocation and accurate browser notice discovery.
- `package.json`, `package-lock.json`: version 0.1.1, real runtime/installed-test scripts, packaging preflight, dev-only ZIP tooling, exclude maps/unneeded sibling runtimes.
- `.github/workflows/ci.yml`: reviewed immutable Action pins retained, time bounds, actual Windows setup/install/tamper smoke test; read-only workflow with automatic release publication removed.
- `tests/{automation,backup,lifecycle,runtime,security}.unit.test.ts`: new negative/behavior regressions; no existing tests removed or skipped.
- Existing browser/desktop/installed integration suites: added real structured report, renderer isolation/navigation and installed runtime tamper/recovery assertions.
- README, SECURITY, CHANGELOG, Windows instructions and this report: boundaries, risks, provenance, install/checksum and release steps.

## Regression coverage

62 unit tests total: 18 original; 6 automation; 15 lifecycle; 12 runtime/ZIP/CLI; 9 backup; 2 proxy/ownership security. Lifecycle edge cases are simulated with deterministic process/browser adapters; that is not an OS-level kill test. Real Chromium persistence, crashes, automation, backup sessions and cancellation are additionally exercised by 11 integration tests.

Malformed locks, stale locks, missing/inaccessible profile storage, partial database initialization, live orphan ownership, PID reuse, CDP failure, launch/shutdown race, repeated cleanup and unresponsive close are covered. Runtime tests include altered/missing/extra files, extra directories, missing/invalid manifest identity, unsafe/duplicate paths, root/descendant links, corrupt archives, archive digest mismatch and pre-extraction traversal/symlink rejection. Backup tests cover compressed/expanded/decoded/file/count bounds, malformed/base64/checksum failures, normalized collisions, partial restore/write cleanup, destination links and credential exclusion. Some boundary tests temporarily reduce configured limits to exercise identical limit branches without allocating hundreds of MiB; default configured values remain unchanged after each test.

## Executed commands and results

Environment: Linux x64 sandbox; Node 24.22.0 installed for the pinned runtime tooling. Initial calls used system Node 20 until the missing Node 24 executable was reinstalled. An initial native `.ts` provisioning import failed on Node 20, and was rerun on the required Node 24. No result from that failure is reported as a successful provision.

| Actual command | Last verified result |
|---|---|
| `npm ci` | Passed clean locked dependency installation |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 62 passed |
| `npm run test:runtime` | 12 passed |
| `npm run provision` | Passed with new digest helper; archive pin and 303 file hashes verified |
| `npm run verify:runtime` | Passed, 303 files |
| `npm run test:integration` | 11 passed, including all original tests |
| `npm run build` | Passed |
| `xvfb-run -a npm run test:desktop` | 2 passed, 1 pre-existing Windows-only DPAPI skip |
| `npm run test:installed` | Pre-existing Windows guard: 1 skipped on Linux; not a packaging pass |
| `npm run dist:win` | Exit 1 as intended on Linux: refuses wrong-platform runtime; no v0.1.1 installer built locally |
| `npm run licenses` | Passed; actual bundled ABOUT/notice location reported |

### Verified Windows CI and installer bytes

Successful build-only run: https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40460198692

Tested source commit: `68c741d6f0e1bd0266d76ff77e046e34e382b237`, branch `fix/v0.1.1-hardening`. Hosted runner log identifies **Microsoft Windows Server 2025 x64**, not a Windows 10/11 desktop. Both jobs concluded success; individual step logs were downloaded and checked, not inferred solely from a green overall build.

| Actual Windows workflow command | Verified result |
|---|---|
| `npm ci` | Passed |
| `npm run provision` / `npm run verify:runtime` | Pinned archive and 307 Windows runtime files passed |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm test` | 62 passed |
| `npm run test:runtime` | 12 passed |
| `npm run test:integration` | 11 passed |
| `npm run build` | Passed |
| `npm run test:desktop` | 3 passed, including actual Windows DPAPI and renderer isolation/navigation checks |
| `npm run dist:win` | NSIS Windows x64 setup built successfully |
| Silent setup installation, then `npm run test:installed` | Exit 0, 1 test passed: installed app launches bundled browser offline, rejects altered runtime, relaunches after original bytes restored |
| PowerShell `Get-FileHash ... -Algorithm SHA256` | Checksum asset generated after tested installer build |

**Artifact download** (GitHub login may be required): https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40460198692/artifacts/12714815352

The artifact ZIP contains one setup executable and its checksum text file. Artifact: `Phantom-Browser-Windows-Setup`; setup: `Phantom-Browser-Setup-0.1.1-x64.exe`, **297,316,237 bytes**.

Independently downloaded the CI artifact after the run and recomputed both the complete ZIP digest and the setup EXE digest. They matched the Actions artifact digest and the embedded `.sha256` file respectively:

```text
EXE SHA256: 5a6bd724842998cda204b8c7d75e2dc19140bd13d63c9a911fb811cab764cdc8
ZIP SHA256: 53d10f0309468e4685b784cc6203b6331f9af747329c5ea3a4813fd76447e0d4
```

No release/tag was published, no main-branch merge performed and no existing assets overwritten. Windows 10/11 manual install/upgrade/uninstall and broad hardware/network behavior remain unverified; hosted Server 2025 tests do not establish those claims.

## Runtime trust provenance and limits

Pinned Windows archive SHA256: `220021ecfdad08c116fc71a153e65e3861ba841c531afc4f7acc7bd5d44b41db`. It comes from the already version-controlled v0.1.0 provenance: matching Playwright HTTPS CDN and Google Chrome for Testing ZIPs. The Windows per-file manifest is retained unchanged.

For this work, Linux ZIPs were independently fetched via the Playwright CDN and Google Chrome for Testing bucket; both matched `43fd31766c7533a02dda2ded5ad50c2f861cd5400be7509c0abad71129f79d79`. The existing 303-file Linux manifest matched extraction of this pinned archive. This is cross-endpoint delivery verification, not a signed upstream attestation or proof of a non-malicious browser build. Ordinary provisioning cannot author or replace trusted pins. Upgrades require maintainer review of version, upstream HTTPS provenance, full archive hashes and per-file inventory, a reviewed source diff and platform tests before committing new trust data.

## Remaining risks and release gate

- This is targeted hardening, not an independent/full security audit. See SECURITY.md for explicit trust boundaries and sensitive-data limitations.
- No arbitrary PID-kill fallback exists. Unknown inspection, stale recovery gates, malformed metadata or a hung browser may require careful manual recovery. Browser ownership scans cannot certify an entire untrusted local operating system.
- POSIX file modes are not Windows ACL enforcement. Local same-account attackers can modify private data and possibly both program and trust pins. Verification cannot fully eliminate check/use races.
- Backups are unencrypted; no new cryptography was invented. Screenshots mask all page content and raw titles are omitted to avoid leaking arbitrary page secrets.
- HTTP/HTTPS and unauthenticated SOCKS5 are the documented proxy surface; no guaranteed DNS/WebRTC leak prevention, anti-detection or universal fingerprint consistency.
- Intended consumer targets are Windows 10/11 x64. Hosted Windows CI does not replace manual checks on both consumer OS versions. No code-signing certificate/signature is supplied.
- v0.1.0 historical release assets are untouched. Branch push/build authorization is not authorization to merge, tag or publish v0.1.1.

## Steps to produce the release

1. Completed: exact local command reruns, authorized review-branch push and read-only workflow dispatch; verified run/commit/artifact above.
2. Completed on hosted Windows Server 2025: all required Windows unit/runtime/browser/desktop, DPAPI, NSIS setup/install and installed tamper/recovery checks passed. No existing test was removed, weakened or newly skipped.
3. Manually validate install, relaunch, profile persistence, upgrade and uninstall-retains-data on Windows 10 and 11 x64. Verify any intended signature explicitly; otherwise label installer unsigned.
4. Review code, remaining risks and trust pins. Obtain separate authorization to merge and publish.
5. Installer artifact/hash verification is completed above. Recheck the exact bytes before publishing. Only after separate approval publish a new v0.1.1 release with that installer, checksum, test run/commit references and known limitations. Never overwrite v0.1.0 assets.
