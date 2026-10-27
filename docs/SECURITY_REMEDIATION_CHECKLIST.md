> Historical v0.1.0 tracker. Current findings, verified results and remaining risks are in [SECURITY_REMEDIATION.md](../SECURITY_REMEDIATION.md); old checkboxes are not evidence of v0.1.1 verification.

# Security Audit Remediation Checklist

> Created: 2026-10-26 — Tracking audit findings across Phases 2–10.
> Status updated after each phase. Do not mark complete until tests actually pass.

## Phase 2 — Browser Runtime Supply-Chain Verification — COMPLETE
- [x] A. Created `scripts/runtime-manifests/linux-x64-chromium-156.0.8078.4.json` trusted manifest
- [x] A. Manifest is version-controlled, NOT overwritten by provision/verify
- [x] A. Bootstrap process requires reviewed hashes; fail closed when missing
- [x] B. `verify-runtime.mjs` validates manifest schema, paths, symlinks, missing/unexpected files, hash mismatches, executable/version/arch
- [x] B. Non-sensitive error messages, nonzero exit on failure, rejects empty/incomplete
- [x] C. `provision.mjs` pins version, verifies against trusted manifest, prevents traversal, temp extract, atomic promote, cleanup
- [x] C. Uses `--no-shell --force` for deterministic full Chromium download
- [x] D. `.gitignore` excludes `browser-runtime/` binaries, tracks `scripts/runtime-manifests/`
- [x] D. CI runs `npm run verify:runtime` before build; Actions use version tags (SHA pinning documented)
- [x] D. Verifier tests: valid runtime passes, modified/missing/unexpected files rejected (tested manually)

## Phase 3 — Profile Locking and Crash Recovery — IN PROGRESS
- [ ] A. Separate Electron PID, Chromium PID, profile UUID, launch/session ID, lock metadata
- [ ] A. Handle race where Chromium PID not yet available via CDP
- [ ] B. Implement lifecycle acquiring→starting→running→stopping→released
- [ ] B. Atomic lock creation, ownership validation, PID reuse, idempotent cleanup
- [ ] C. Orphan recovery on startup: reconcile persisted state, lock metadata, actual processes
- [ ] C. Bounded timeouts, safe recovery procedure, never terminate solely by stale PID
- [ ] D. Add 10 regression tests

## Phase 4 — Automation Report Completeness — NOT STARTED
- [ ] Record every step with index, action, timestamps, outcome, result summary, error category, screenshot ref
- [ ] Preserve earlier steps on failure, record failing step, cancellation, execution-level failures
- [ ] Redact secrets, safe output paths, prevent traversal, validate schema, handle write failures
- [ ] Update UI to show actual outcome
- [ ] Add 10 tests

## Phase 5 — Browser Process Supervision — NOT STARTED
- [ ] Explicit launch/shutdown states, exit monitoring, bounded graceful shutdown
- [ ] Forced termination only when ownership established, finally cleanup, idempotent lock release
- [ ] Crash recovery, timeouts, accurate status, prevent stale database status
- [ ] Handle Electron before-quit and process termination events
- [ ] Do not block Electron event loop
- [ ] Add tests for normal shutdown, unexpected exit, failed startup, forced termination

## Phase 6 — Backups and Sensitive Data — NOT STARTED
- [ ] Enforce archive-size, decompression, individual file, aggregate limits
- [ ] Reject traversal, duplicate, symlinks, verify schema/checksums, prevent extraction outside dir
- [ ] Temp validation dirs, clean partial restores, no overwrite without confirmation
- [ ] Exclude credentials from backups, explain auth material, keep secrets out of logs
- [ ] Optional passphrase protection with vetted lib (only if done correctly)

## Phase 7 — Proxy and Credential Handling — PARTIALLY COMPLETE
- [x] DPAPI via safeStorage, fail-closed when unavailable
- [x] Credentials never in plaintext SQLite, logs, snapshots, or backups
- [x] Added `executablePath:chromium.executablePath()` to launch and proxyTest
- [ ] Proxy test distinguishes saved vs live connection, sensible timeouts
- [ ] Document DNS/WebRTC limitations

## Phase 8 — Windows Release Hardening — NOT STARTED
- [ ] Packaged runtime paths resolve correctly
- [ ] Browser version/arch match application
- [ ] Installer does not depend on dev-only directory
- [ ] Runtime integrity checks before launch
- [ ] Clear error on missing/tampered runtime
- [ ] Documented upgrade path, uninstall behavior, license notices

## Phase 9 — Regression Tests and Checks — PARTIALLY COMPLETE
- [x] Type checking passes
- [x] Linting passes
- [x] Unit tests: 18 passed
- [x] Browser integration: 10 passed
- [x] Desktop integration: 1 passed / 1 skipped (Windows DPAPI)
- [x] Runtime manifest verification: passes
- [x] Production build: passes
- [ ] Windows installer build: NOT available (Linux only)

## Phase 10 — Documentation and Delivery — NOT STARTED
- [ ] Update README
- [ ] Create docs/SECURITY.md
- [ ] Create docs/SECURITY_REMEDIATION.md

## Phase 11 — Final Report — NOT STARTED
