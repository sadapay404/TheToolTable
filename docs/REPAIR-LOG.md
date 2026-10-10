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

## Current source validation — v1.2.2 candidate

- `npm test`: **436/436 passing**.
- `npm run build`: passing.
- `git diff --check`: clean.
- Android launch-repair fixtures exercise a pristine generated project,
  idempotence, the direct WorkManager compile dependency, and safe refusal to
  overwrite a custom Application. The APK-verifier harness accepts a sound mock
  artifact and refuses missing WorkManager startup/provider/DEX conditions.

## Releases

- **No Android APK is currently endorsed.** All formerly public Android
  releases, including v1.2.1, were withdrawn into drafts after a real device
  showed that v1.2.1 still aborts during native download-plugin/WorkManager
  initialization. Passing an older first-frame emulator smoke did not prove the
  process remained alive after that initialization.
- The pending **v1.2.2** repair generates a manifest-declared Application that
  implements WorkManager `Configuration.Provider`, in addition to removing the
  eager `WorkManagerInitializer`. Its APK gate checks both conditions in the
  merged manifest; its device smoke waits past launch and fails on native abort
  records or `PluginInitialization("download", …)` failures. The signed APK is
  now held on a temporary source-specific candidate with a SHA-256 record until
  that device smoke passes; only the device-tested bytes can be banked to the
  actual draft release.
- The release workflow creates one distinct draft tag per exact app version and
  source commit (`v<version>-build-<short-sha>`); it does not overwrite an
  unrelated candidate with `--clobber`. A candidate must remain a draft until
  the strengthened CI and physical/device validation are complete.
- A future release asset will include a signed Android APK plus Windows NSIS and
  MSI installers. The Windows installers include yt-dlp/FFmpeg/FFprobe
  sidecars. Android's Downloader instead uses a network-reachable HTTPS
  companion engine; the APK does not bundle yt-dlp.
- The repository is private, so future downloads require an account with
  repository access.
