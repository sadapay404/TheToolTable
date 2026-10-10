# Android repair tracker

This is a ten-part Android-only repair cadence: two tool screens checked per
part. Windows is out of scope. A passing APK build alone does not close a part;
Android launch, visible content, and back navigation must be exercised on an
emulator/device. Do not mark the app requirements complete until the
corresponding Android checks pass.

## Part status

| Part | Tool screens | Status |
|---|---|---|
| 1 | 04 Media Clipper & Downloader; 06 AI Background Remover | **Blocked pending v1.2.2 device validation.** The former v1.2.1 first-frame smoke result was invalidated when a physical device later aborted in native download-plugin initialization. |
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
  Startup initializer after Tauri generates the project **and** generates a
  manifest-declared `TheToolTableApplication` implementing WorkManager
  `Configuration.Provider`. The latter is required when the download plugin
  later calls `WorkManager.getInstance(context)`; removing the initializer by
  itself causes a later native abort.

## Latest Android validation state

- [Run 38032876221](https://github.com/sadapay404/TheToolTable/actions/runs/38032876221)
  did complete on 2026-10-10 for v1.2.1 source `5e93a08`, but it is historical
  evidence only. A real device subsequently demonstrated an abort after the
  older smoke check's first visible screen, so v1.2.1 and every public Android
  release were withdrawn.
- The v1.2.2 candidate's APK verifier now requires both `WorkManagerInitializer`
  to be absent and `app.thetooltable.mubashir.TheToolTableApplication` to be
  declared in the merged manifest *and compiled into DEX*. The device smoke then
  waits five seconds after launch, checks foreground/process survival, and
  rejects native abort tombstones or `PluginInitialization("download", …)`
  records.
- No Android release may be marked complete or published until this strengthened
  candidate has passed CI and the exact signed APK has been installed and kept
  open through native/plugin initialization on a device or emulator.

## Acceptance checklist

- [ ] v1.2.2 stays open after a fresh install, delayed native/plugin
  initialization, and collection rendering.
- [ ] v1.2.2 system Back and tool Back navigate through app/tool history in the
  Android smoke path.
- [ ] Tool 04 and Tool 06 are covered by the v1.2.2 Android smoke/navigation
  path.
- [ ] v1.2.2 package verification checks the expected branded Android icon.
- [ ] Status-bar/camera safe area and every header/sheet control are visually
  reviewed on a physical cutout device.
- [ ] Model downloads and Beam/file transfers continue in the background with
  visible progress notifications on Android.
- [ ] Media Downloader has a selected, legally compatible native Android engine
  and a passing end-to-end Android test.
- [ ] All ten tool-pair parts have their own Android screen checks.
