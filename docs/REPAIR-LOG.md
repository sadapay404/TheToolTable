# Repair progress

The requested 20-tool repair is tracked in ten parts, two consecutively numbered tools per part. “Complete” records the code review and repair pass, not the separate Android/Windows packaging and GitHub-release work.

| Part | Tools reviewed | Status |
|---|---|---|
| 1 | 01 Metadata Extractor; 02 Any-to-Any Converter | Complete (carried forward from prior work) |
| 2 | 03 Target-Size Compressor; 04 Media Clipper & Downloader | Complete (carried forward from prior work) |
| 3 | 05 ImagePlayer Studio; 06 AI Background Remover | Complete (carried forward from prior work) |
| 4 | 07 Frame Extractor & Clipper; 08 Audio Visualizer Video | Complete (carried forward from prior work) |
| 5 | 09 Unit & Currency Converter; 10 Decision Hub | Complete (carried forward from prior work) |
| 6 | 11 QR Code Studio; 12 Background Canvas Studio | Complete (carried forward from prior work) |
| 7 | 13 PDF Studio; 14 Scan & OCR | Complete (carried forward from prior work) |
| 8 | 15 Voice & Subtitle Studio; 16 Invoice & Receipt Studio | Complete (carried forward from prior work) |
| 9 | 17 Beam; 18 App Icon & Asset Forge | **Complete.** Hardened Beam signaling/transfer validation and Icon Forge input, pack, export-concurrency, upload-race, and accessibility safeguards. Regression coverage included; the production build passes. |
| 10 | 19 Pakistan Money Kit; 20 Text & Writing Lab | **Complete.** Added calculation/input regression coverage; verified the 2026–27 salary-tax table against [FBR’s official 2027 withholding rate card](https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf), updated through June 30, 2026; clarified the savings-profit withholding estimate; and reviewed the mobile tab layout. |

## Verification at the end of Part 9

- `npm test`: 92/92 passing.
- `npm run build`: passing.
- `git diff --check`: clean.
- The Vite preview remains available on port 5173.

## Releases

- Stable **v1.1.0** was published on [GitHub Releases](https://github.com/sadapay404/TheToolTable/releases/tag/v1.1.0).
- Stable **v1.1.1** is now the latest release: [GitHub Releases](https://github.com/sadapay404/TheToolTable/releases/tag/v1.1.1). It includes the restored interactive 3D tool-card tilt, additional hover and scroll motion, and the Android Gradle dependency retry/cache hardening.
- The v1.1.1 release workflow completed successfully in GitHub Actions run [37395413929](https://github.com/sadapay404/TheToolTable/actions/runs/37395413929): Android APK build and signing, Windows NSIS/MSI builds, and release publication all passed.
- Release assets: signed Android APK, Windows NSIS installer, and Windows MSI. The Windows installers require and include yt-dlp/FFmpeg/FFprobe sidecars.
- Android’s Downloader uses a network-reachable HTTPS companion engine; the APK does not bundle yt-dlp. This limitation is stated on the release page and in the Android UI.
- The repository is private; release downloads are restricted to accounts with repository access. The older `v1.1.0-rc1` remains a prerelease; use stable `v1.1.1`.
