# Android repair tracker

This is a ten-part Android-only repair cadence: two tool screens checked per
part. Windows is out of scope. A passing APK build alone does not close a part;
Android launch, visible content, and back navigation must be exercised on an
emulator/device. Do not mark the app requirements complete until the
corresponding Android checks pass.

## Part status

| Part | Tool screens | Status |
|---|---|---|
| 1 | 04 Media Clipper & Downloader; 06 AI Background Remover | **Launch/shell smoke passed** for the v1.2.0 repair candidate; rerun is required for each promoted source revision. |
| 2 | 01 Metadata Extractor; 02 Any-to-Any Converter | Not started |
| 3 | 03 Target-Size Compressor; 05 ImagePlayer Studio | Not started |
| 4 | 07 Frame Extractor & Clipper; 08 Audio Visualizer Video | Not started |
| 5 | 09 Currency, Unit & Time Converter; 10 Decision & Randomizer Hub | Not started |
| 6 | 11 QR Code Studio; 12 Background Canvas Studio | Not started |
| 7 | 13 PDF Studio; 14 Scan & OCR | Not started |
| 8 | 15 Voice & Subtitle Studio; 16 Invoice & Receipt Studio | Not started |
| 9 | 17 Beam; 18 App Icon & Asset Forge | Not started |
| 10 | 19 Pakistan Money Kit; 20 Text & Writing Lab | Not started |

## Part 1 implementation notes

- Android-only safe-area fallbacks reserve the status/camera area for the
  sticky header, mobile controls sheet, bottom navigation, toast, and footer
  even when a WebView reports zero insets.
- Native Android Back uses an explicit tool-screen stack rather than unrelated
  WebView history. The smoke test exercises system Back from Tool 04 and the
  tool's own Back control from Tool 06, and requires the home collection to
  return.
- Launcher assets are generated from `public/icons/icon-512.png`; the Android
  header uses the same square brand asset.
- Tool 06 (`BgRemover`) shares one bounded 8192-pixel edge limit between its
  output-size estimate and renderer.
- Android Media Clipper/Downloader selects an HTTPS companion engine
  (`/api/ytdlp`) when no native runner is installed. This remains a known
  functional limitation; do not describe it as a bundled Android yt-dlp
  downloader.
- `scripts/ensure-android-launch-survives.mjs` removes WorkManager's AndroidX
  Startup initializer after Tauri generates the project and preserves the
  required generated WorkManager/Room classes. This is the repair for the
  pre-first-frame crash, not a cosmetic manifest change.

## Latest Android emulator run

- [Run 38030486832](https://github.com/sadapay404/TheToolTable/actions/runs/38030486832)
  completed successfully on 2026-10-10 for the `fef23ba` repair candidate:
  `prepare`, `windows`, `android`, and `android-device` all passed.
- The Android job verified the signed universal APK before banking it, including
  both `arm64-v8a` and `x86_64` libraries and the absence of
  `WorkManagerInitializer` from the merged manifest. The `android-device` job
  then booted an x86_64 emulator and smoke-tested the exact release artefact.
- This resolves the former “instant close before the first frame” launch gate
  for that candidate. It does **not** turn an older APK into a valid download:
  every new source candidate, including v1.2.1, must pass the same verifier and
  device job before release promotion.

## Acceptance checklist

- [x] Candidate app stays open after a fresh install and renders the collection
  in the passed Android emulator smoke run.
- [x] Candidate system Back and tool Back navigate through app/tool history in
  the Android smoke path.
- [x] Tool 04 and Tool 06 are covered by the Android smoke/navigation path.
- [x] Launcher package verification checks the expected branded Android icon.
- [ ] Status-bar/camera safe area and every header/sheet control are visually
  reviewed on a physical cutout device.
- [ ] Model downloads and Beam/file transfers continue in the background with
  visible progress notifications on Android.
- [ ] Media Downloader has a selected, legally compatible native Android engine
  and a passing end-to-end Android test.
- [ ] All ten tool-pair parts have their own Android screen checks.
