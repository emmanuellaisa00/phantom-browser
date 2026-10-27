# 0.2.0-dev.2 — unreleased remediation candidate

**Not published; no new tag/release/main merge authorized.** This file stages notes, not a release announcement. Stable v0.1.1 and prior development/stable assets remain unchanged. Exact final code/test/artifact status is recorded in [the remediation report](REMEDIATION_REPORT.md) and its verification evidence.

## Important privacy/durability fixes

- Old dev.1 automation PNGs can contain fixed-position page content outside the DOM mask. Treat existing reports as sensitive. New screenshot actions write a bounded **fully opaque same-size derivative** outside page-controlled layout; they intentionally do not provide readable content screenshots. A real Chromium regression demonstrates old leaked pixels and the fix.
- Failed durable SQL saves now restore pre-transaction in-memory data, so rejected changes cannot silently be saved later. Unique exclusive partial-file cleanup and atomic-rename failure checks preserve prior durable bytes.
- Incomplete shutdown, changed lock ownership and denied process inspection are reported conservatively; no arbitrary PID killing or unsafe force-unlock introduced.

## Actual capability additions

- Per-step run/profile attribution and required durations; sanitized regressions for original action failures.
- Real native low/high-entropy hints, canvas/audio hashes, WebGL details, generic font metrics, device-kind/permission summaries, local ICE and explicit capabilities/limits.
- Stronger desktop Chromium-UA consistency guards; observed headers and same-environment relaunch stability.
- Real Cache Storage/service-worker isolation/restart, actual dead-manager/live-browser ownership fixture, actual installed Windows diagnostics and manager-interruption regression.
- Public IP validation uses real IP parsing; newer-engine-major archive restore rejected. HTTP/HTTPS/SOCKS5 routing restrictions and Windows DPAPI/JWE formats remain compatible within documented boundaries.

## Intentionally not promised

Arbitrary native hardware/OS/graphics/canvas/audio/font/media spoofing, authenticated SOCKS5, authoritative DNS/public STUN leak certification, stealth/undetectability, complete GoLogin parity, cloud/team services, every consumer Windows/hardware scenario, universal cookie portability and a verified digital signature. Local ICE can still produce `host`/`udp` even with the requested UDP policy present; no no-leak claim follows from that flag.

Read [capabilities](FINGERPRINT_CAPABILITIES.md), [proxy limits](PROXY_LIMITATIONS.md), [backup guide](BACKUP_RESTORE.md), [troubleshooting](TROUBLESHOOTING.md), [security](../SECURITY.md) and [Windows checklist](WINDOWS_INSTALL.md). Keep an independent private pre-upgrade data copy and do not downgrade the only copy. A Windows CI installer artifact is a development candidate, not an authorized publication or manual Win10/11 certification.

## Final candidate verification

Both OS jobs passed in [40565021705](https://github.com/emmanuellaisa00/phantom-browser/actions/runs/40565021705) for code `02d0a4bc6b326d663a0ae5220fc49eaa85d793b2`. Windows: 90 units + 4 Linux-only skips, 27 browser, 4 desktop, 3 installed tests. Linux: 94 units, 26 browser + Windows TLS skip, 3 desktop + Windows DPAPI skip. Both runtime-unit commands: 12 passed. Actual installer hash and controlled native observations are committed, not a mock/demo. This does not authorize publication.
