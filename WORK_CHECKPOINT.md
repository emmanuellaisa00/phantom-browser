# Development checkpoint — 2026-10-27

Baseline reconciled with remote review commit d602081 without discarding previous work. v0.1.1 has been published and remains latest; no new release or main merge is authorized. Current local branch feat/local-workspaces-v0.2, version 0.2.0-dev.1. Local implementation commits 580c95c / 079ea09 / 6656c90; exact tested code 6656c90027a8e963f321a2115c87b98125d1221c. Documentation-only commits follow.

Implemented: non-destructive profile archival, descriptions/last session activity, startup URLs/homepage/opt-in native tab-session restoration, guided editor and guarded sequential bulk controls; stable native preferences/explicit geolocation/observed limits; proxy latency/region and real HTTP Basic + SOCKS5 route/fail-closed coverage; reproduced/fixed pending-DPAPI-save race; bounded conditional automation/read/delay actions/durations; authenticated compact-JWE password backups with pinned jose/WebCrypto and legacy gzip compatibility. Existing security safeguards and original tests retained.

Final local checks: typecheck/lint/build passed; 73 units (includes runtime 12), repeated runtime 12, Chromium browser 20, Linux Electron desktop 3 passed/1 actual-Windows-only DPAPI skip, 303 Linux runtime files verified, npm audit 0 advisories, licenses/diff checks passed. Full evidence/limits: docs/V02_IMPLEMENTATION.md and docs/V02_VERIFICATION.json.

Remote push dry-run failed because this restored workspace has no credentials; GitHub connector unsupported. NO new branch push or Windows run. Provide/import the complete Git bundle, push from an authenticated checkout and inspect actual workflow results. Instructions: docs/WINDOWS_CI_HANDOFF.md. User authorized dedicated branch and Windows CI only, not publication. Manual consumer Windows 10/11 upgrade/uninstall/signature checks remain pending. Never reuse historical Windows v0.1.1 CI as evidence for this new development code.


## Publication update

The user supplied ephemeral push authentication, then explicitly authorized a tested prerelease. Pushed e6089a8; CI 40507389557 succeeded. Windows Server 2025: 73 units (includes runtime 12), repeated runtime12, browser20, Electron4 including DPAPI/JWE wizard, installed-runtime corruption/rejection/repair1 passed;307 runtime files. Published v0.2.0-dev.1 prerelease ID425469022 from exact CI source e6089a8. EXE297340268 bytes SHA2567b03512149e1ee4bcdc2291f9426c8ae71ddea7fc0157aa6c04953fda34ab68e. v0.1.1 remains latest stable and both older releases unchanged. No main merge. Manual consumer Windows10/11 upgrade/uninstall and valid signing remain unverified. Public metadata in docs/v0.2.0-dev.1-release-verification.json. Never store the supplied token in files/config; revoke it after work.
