# Windows installation

The intended end-user download is **one** `Phantom-Browser-Setup-0.1.0-x64.exe` from this repository's Releases page. It bundles the desktop application and Chromium; Node.js, Git and Playwright are not needed on the user's PC. Windows x64 is the supported target.

Release publication is gated by Linux checks, Windows browser and DPAPI tests, and a silent installation plus installed-browser smoke test. A configured workflow is not proof that a release has passed: check the actual Actions result and release assets.

1. Open https://github.com/emmanuellaisa00/phantom-browser/releases/latest
2. Under Assets, download the setup `.exe`, not the source-code ZIP.
3. Run setup, choose the installation directory, and launch Phantom Browser from Start or the desktop shortcut.
4. Create a profile and click Launch. Each profile stores its own browser data.

The installer is currently unsigned. SmartScreen may warn. Confirm the repository and optionally compare SHA256 with the release checksum. Do not turn off Windows security protections to run an untrusted download.

Profile data is stored under the application's Windows user-data directory, separate from installation files, and retained by uninstall. Keep backups before upgrades. Backups contain sensitive session material and are **not encrypted**. Cookies protected by Windows may not transfer to another computer or user.

## Runtime provenance

Windows Chromium 156.0.8078.4 was downloaded from Playwright's HTTPS CDN and independently downloaded from Google's Chrome for Testing bucket. Both ZIP files matched SHA256 `220021ecfdad08c116fc71a153e65e3861ba841c531afc4f7acc7bd5d44b41db`. The checked-in Windows per-file manifest was generated from that archive, plus empty Playwright installation/validation markers. This establishes matching upstream delivery, not a third-party code audit or code signature.
