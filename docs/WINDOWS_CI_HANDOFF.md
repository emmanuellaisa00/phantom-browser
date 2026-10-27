> **Completed:** branch pushed, CI 40507389557 passed, and user-authorized v0.2.0-dev.1 prerelease published. The instructions below describe the earlier unauthenticated handoff and remain reference-only. See V02_IMPLEMENTATION.md for current evidence.

# Authenticated push and Windows CI handoff

The development branch is committed locally but this sandbox has no GitHub credentials. Do **not** post access tokens in chat or put them in repository files/remote URLs. Use your own already-authenticated Git checkout to push the supplied **`phantom-local-workspaces-v02.bundle`**. It contains the complete branch history, not a patch that discards prior work.

## Import into a fresh checkout (PowerShell)

Download the bundle from this conversation/workspace, then adjust only its local file path:

```powershell
git clone https://github.com/emmanuellaisa00/phantom-browser.git phantom-browser-review
cd phantom-browser-review
git bundle verify "C:\Users\YOUR_NAME\Downloads\phantom-local-workspaces-v02.bundle"
git fetch "C:\Users\YOUR_NAME\Downloads\phantom-local-workspaces-v02.bundle" "refs/heads/feat/local-workspaces-v0.2:refs/heads/feat/local-workspaces-v0.2"
git switch feat/local-workspaces-v0.2
git status --short
git log -4 --oneline
git push origin feat/local-workspaces-v0.2
```

This does not merge main or publish a release. If the branch already exists remotely, review differences rather than force-pushing. Use normal Git Credential Manager/device authentication as needed, without pasting a token into commands/chat.

## Run and report CI

The workflow `Build and verify Windows installer (no automatic publication)` triggers on this exact branch push. If needed, open repository Actions and dispatch it selecting this branch. Its pinned actions have read-only contents permission; `electron-builder --publish never` remains in effect.

Share the actual Actions run URL and commit hash. Wait for **both** Linux checks and Windows installer jobs. Inspect all failures rather than weakening tests. The Windows job provisions/verifies its own platform runtime, runs unit/runtime/browser/Electron/DPAPI tests, builds NSIS, installs the actual EXE and runs installed runtime-tamper/repair tests, then uploads EXE/checksum artifacts only.

A successful hosted Windows job is still not manual Windows 10/11 install/upgrade/uninstall testing or a valid digital signature. Follow [the consumer checklist](WINDOWS_INSTALL.md) before any separately authorized production release. Keep v0.1.0/v0.1.1 releases untouched.
