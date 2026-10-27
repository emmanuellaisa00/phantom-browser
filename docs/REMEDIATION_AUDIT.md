# Remediation audit — 2026-10-27

Actual baseline: development branch through `1501297` (published prerelease source `e6089a8`, v0.2.0-dev.1), not v0.1.0. Stable release remains v0.1.1. Reconciled restored stale Git metadata from the verified complete bundle without discarding working files. No profile data is stored in the repository. User authorized development-branch pushes and Windows CI only; no new tag/release/main merge.

Inspected main service lifecycle/proxy/config/diagnostic/automation/backup code, process ownership, schemas, DB persistence, Electron main/preload/IPC, existing renderer/forms/styles, provisioning/archive/pinned manifest verifier, build/package/install gates, dependency lockfile and every existing test module. Baseline `npm ci`, typecheck and **73 unit tests passed**. Historical successful Windows run 40507389557 validates the prerelease only, not new changes.

## Verified gaps before changes

| Area / exact location | Finding | Initial state |
|---|---|---|
| `src/main/automation.ts::runAutomation`, `StepRecord` | Run/profile IDs only at report root, not in each step; duration typed optional despite current writer setting it | Partially implemented |
| `src/main/service.ts::diagnose` | Observes low-entropy hints/boolean API availability only; no canvas/audio behavior, generic font metrics, media permission/device-kind summary, local ICE gathering, or high-entropy hints | Partially implemented |
| `src/main/fingerprint.ts::fingerprintIssues` | Only major/OS-substring guard; allows contradictory browser-family/OS tokens and incorrect non-reduced full versions | Partially implemented |
| `tests/installed.integration.spec.ts` | Installed EXE launches bundled Chromium and rejects/repairs tampering, but does not run measured fingerprint diagnostics | Implemented but incompletely tested |
| `tests/browser.integration.spec.ts` | Cookies/localStorage/IndexedDB/history/native session persistence verified; Cache Storage and service-worker persistence/isolation absent | Implemented but incompletely tested |
| `src/main/service.ts::proxyTest` | Public-IP string regex accepts malformed IP literals; status is whole-probe latency, not network RTT | Partially implemented |
| `tests/proxy-fixture.ts` / proxy tests | HTTP Basic and unauthenticated SOCKS5 tested; no actual TLS proxy transport test | Implemented but incompletely tested |
| `src/main/service.ts::restore` | Strong archive/JWE validation but browser compatibility only mentioned in notes, not checked against newer engine data | Partially implemented |
| `src/main/service.ts::recoverable`, `tests/lifecycle.unit.test.ts` | Conservative ownership/unknown exit/PID-reuse tests exist, but dead-manager/live-browser case is mocked, not real process interruption | Implemented but incompletely tested |
| Runtime provisioning/verifier | Independently pinned reviewed archive and file inventories; ordinary downloads do not generate trust manifests. Upstream signed attestation and TOCTOU/app-replacement remain limitations | Implemented and tested, within documented trust boundary |
| Electron/DPAPI/JWE/profile CRUD | Existing isolation, strict IPC, native confirmations, bounded storage/archive defenses and established authenticated format retained | Implemented and tested (prerelease evidence) |
| Hardware/graphics/audio/font/OS identity spoofing | Native browser values only; no arbitrary per-profile native spoofing in supported Playwright architecture | Not feasible with current supported configuration; requires separately evaluated engine/fork |
| Public DNS/STUN leak certification | Requires opt-in controlled external authoritative-DNS/STUN/IP infrastructure and environment-specific routing tests, absent here | Missing; do not infer protection from ipify/local ICE |

## Implementation decision

Use the existing supported, pinned Playwright Chromium runtime and real observation/consistency tests first. No JavaScript prototype patching, stealth flags, TLS bypass, arbitrary scripts or custom Chromium fork will be introduced. Playwright warns it works best with its bundled Chromium and does not guarantee arbitrary replacement executable compatibility: [official BrowserType documentation](https://playwright.dev/docs/api/class-browsertype). Pinned Playwright 1.64.1 source includes `calculateUserAgentMetadata` and passes metadata through `Emulation.setUserAgentOverride`; this must be verified via actual browser headers/JS rather than assumed from a field. The CDP API documents metadata handling separately from a UA string: [official CDP Emulation](https://chromedevtools.github.io/devtools-protocol/1-3/Emulation/).

A third-party maintained Chromium fork is not interchangeable without audited provenance/licensing, Windows distribution, update cadence and complete context/worker/header regression tests. A custom fork additionally requires a reproducible Chromium toolchain/build farm, security-patch tracking, third-party notices/source obligations, signing and large artifact distribution. No arbitrary hardware/canvas/audio/font changes will be claimed from ordinary context options. Native observed behavior plus clear unsupported labels is the maintainable supported architecture for this pass.

## Additional reproduced security defect

`runAutomation` used `page.screenshot({mask:[html]})`, which masks the root bounding rectangle, not necessarily fixed-position content outside it. A real-browser regression rendered a red fixed-position secret panel outside a 1-pixel HTML root; the saved image still contained red pixels. The fix generates a fully opaque same-dimension PNG derivative in the main process after capture, with bounded dimensions and no copied source pixels; the original bytes are never written and are cleared best-effort. This remains explicitly a privacy-redacted derivative, not a useful full-content screenshot. Browser image decoding confirms the previously exposed region is now opaque. Raw-image pixel retention in published v0.2.0-dev.1 reports is therefore a known issue until an explicitly authorized fixed release is published.

## Further reproduced durability/recovery findings

`Database.transaction` committed SQL before `persist`; a storage failure left memory changed, while `Service.create` removed the new directory. A later close could persist a rejected edit/new dangling profile. Two regressions reproduced this before the fix; atomic-rename failure adds disk-bytes/partial-cleanup checks. Transactions now restore the pre-write database image after a committed-but-not-durable failure and re-enable foreign keys. Persist uses exclusive unique files instead of a reusable `.tmp` path.

`shutdown` collected rejected stops without logging a summary; `release` retained a replaced owner's lock but left the profile looking idle. Regressions reproduced both; failures now produce redacted recovery states/logs without deleting uncertain locks or killing an arbitrary PID.

New real orphan tests initially let raw fixture Chromium create an empty `extensions` directory beside its executable. The unchanged strict runtime verifier correctly rejected subsequent runs. The fixture was corrected to use the supported `--disable-extensions` baseline and only that empty, reproducible fixture-created directory was removed. Trusted manifests/verifier were not weakened.

Windows TLS fixture validation initially failed during CurrentUser Root import (a possible interactive trust prompt was not manually observed). The fixture was corrected to use .NET machine-store operations only on a disposable elevated Windows CI runner, with exact-certificate cleanup. No production validation bypass or skipped authentication assertion was added. Failed run 40561257686 remains recorded rather than called successful.

A final OS-inspection regression also reproduced an unsafe empty result when a same-user `/proc` read was denied. This now returns unknown rather than exit proof; actual ENOENT/ESRCH races remain tolerated. Windows CIM selects process names and treats inaccessible/incomplete Chromium identities as unknown rather than filtering them out. The real orphan integration still passes with the stricter scanner.

Windows run 40562097219 passed the real installed native fingerprint test (controlled evidence saved) and all 27 proxy/browser + 4 desktop tests, but the interruption fixture's assumption that launcher child PID equals actual Electron main PID failed. The fixture now authenticates the attached main process's executable/user-data root/OS identity before terminating its exact PID. That failed run is not relabeled successful. Its independent Linux job failed on a bounded slow-mirror install; official HTTPS Ubuntu archive is selected without changing signed package validation or omitting tests.

Final code `02d0a4bc6b326d663a0ae5220fc49eaa85d793b2` passed both Linux and Windows in run 40565021705. The Windows job includes all three actual installed-app tests and controlled native evidence; the Linux scanner refinement preserves unknown Chromium while excluding known unrelated inaccessible runner processes. Full machine-readable counts and downloaded installer hash are in `REMEDIATION_VERIFICATION.json`.
