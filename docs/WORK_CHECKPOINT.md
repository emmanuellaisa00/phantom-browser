# v0.1.1 work checkpoint — 2026-10-27

Current review branch: `fix/v0.1.1-hardening`. Tested code commit `68c741d6f0e1bd0266d76ff77e046e34e382b237`.

- Full local and hosted Windows validation evidence: [SECURITY_REMEDIATION.md](../SECURITY_REMEDIATION.md).
- Linux: 62 unit tests, 12 runtime subset tests, 11 real browser tests, 2 desktop tests; pre-existing DPAPI skip only.
- Hosted Windows Server 2025 x64: 62 unit, 12 runtime subset, 11 browser, 3 desktop (including real DPAPI), NSIS setup/install and installed-app tamper/recovery smoke test passed.
- CI: https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40460198692
- Installer artifact: https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40460198692/artifacts/12714815352
- Installer bytes independently verified against the checksum. Details in `docs/v0.1.1-installer-verification.json`.
- Authorized: review-branch push and CI only. No release publication, main merge, release tag or asset overwrite performed.
- Remaining: manual Windows 10/11 install/upgrade/uninstall, code review and separate publication approval. No independent security audit or signature is claimed.
- Backup archives are not encrypted. Automation screenshots are fully privacy-masked. Unknown/unresponsive browser ownership retains locks; manual recovery may be necessary.
- Keep important source/tests/docs/lockfiles in Git; never commit credentials, session data, dependencies or generated browser binaries. Preserve user profile data and backups during cleanup.
