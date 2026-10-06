# TheToolTable v1.1.1

A polish and reliability update to the personal 20-tool studio.

## Highlights

- Restored the tool cards' interactive 3D tilt, with pointer-follow lighting and layered parallax.
- Added scroll-triggered card reveals, a subtle hero parallax, and a page progress indicator, plus coordinated hover/focus motion for card icons, titles, numbers, and actions.
- Kept the menu motion responsive across performance profiles, touch devices, and system reduced-motion preferences.
- Hardened Android dependency resolution against transient Maven Central rate limits; the build now caches Gradle dependencies and retries HTTP 429 failures with backoff.

## Installers

- **Android:** `TheToolTable.apk` — signed APK built for 64-bit ARM and ARMv7 devices.
- **Windows:** `TheToolTable_1.1.1_x64-setup.exe` (per-user NSIS installer) and `TheToolTable_1.1.1_x64_en-US.msi`.

The Windows installers include yt-dlp, FFmpeg, and FFprobe sidecars for Downloader. Android does not bundle a native yt-dlp runtime; configure a network-reachable HTTPS companion engine in Downloader to use it. Other tools remain available without that engine. Models, current currency rates, and optional map lookups may need an internet connection.

This repository is private, so downloads require an account with access. The app is for personal use; review each service's terms and applicable law before downloading media.
