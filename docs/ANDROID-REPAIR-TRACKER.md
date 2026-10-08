# Android repair tracker

This is a ten-part Android-only repair cadence: two tool screens checked per part. Windows is out of scope. A passing APK build alone does not close a part; Android launch, visible content, and back navigation must be exercised on the emulator/device. Do not mark the app requirements complete until the corresponding Android checks pass.

## Part status

| Part | Tool screens | Status |
|---|---|---|
| 1 | 04 Media Clipper & Downloader; 06 AI Background Remover | Code changes prepared; GitHub Android-emulator smoke test pending. |
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

- Android-only safe-area fallbacks were added for the sticky header, mobile controls sheet, bottom navigation, toast, and footer. The camera/status-bar area remains reserved even when the WebView reports a zero inset.
- Native Android Back now uses an explicit tool-screen stack rather than trusting unrelated WebView history. The smoke test exercises system Back from Tool 04 and the tool's own Back control from Tool 06, and requires the live home collection to return.
- Eleven additional lightweight discovery animations were added without removing the 3-D card interaction. Reduced-motion preferences disable the added animations; the footer ticker retains its reduced-motion accommodation.
- Android launcher assets were regenerated from `public/icons/icon-512.png`; the Android header Logo selects that same square brand asset. Desktop/Windows icon assets were not changed.
- Tool 06 (`BgRemover`) now shares one exported 8192-pixel edge limit between its output-size estimate and renderer, tests the 4-pixel fitted-output allowance, uses a bounded `MAX_UNDO_STROKES` helper instead of a numeric literal, and updates `itemsRef` synchronously on patch/removal.
- Model downloads already use the native download manager/WorkManager path. Android Media Clipper/Downloader still selects its HTTP companion engine (`/api/ytdlp`) when no native runner is installed. This remains a known functional limitation; do not describe it as a bundled or verified Android yt-dlp downloader.
- A build-time compatibility patch allows the foreground-service lifecycle to start without the optional headless JNI library. The patch and Android UI smoke test still need to pass on GitHub Actions before this part is marked complete.

## Latest Android emulator run

- Run `37725028745` built and signed both ARM release and x86_64 smoke APKs after reclaiming runner disk space. The 2 GB userdata AVD was created and booted successfully; this resolves the earlier userdata-partition setup failure.
- Run `37763406519` again built and signed both APKs and booted the emulator on its default two-core profile. The smoke test still stopped before the collection appeared: UIAutomator found repeated Android system dialogs saying `Quickstep isn't responding`, including one within seconds of choosing Wait. Neither run establishes whether the app itself crashed, and neither reached Tool 04/06 or back-navigation checks. Both used a fresh-install-only fallback signing key, and neither uploaded an APK.
- Returning from four requested cores to the default two did not resolve the launcher ANR. Run `37767140644` built and signed both APKs and booted with a 4 GB AVD, but the new package-only `am start` test command returned Android result `-91` before UI inspection; this is a harness launch-resolution failure, not evidence of an app crash and not a result for the Quickstep hypothesis. The next attempt starts Tauri's explicit `.MainActivity` component, keeps strict visible-screen assertions plus one recorded recovery for an initial system ANR, and now preserves ADB stdout/stderr when a command fails.

## Acceptance checklist

- [ ] App stays open on Android after a fresh install and renders the collection (not a header-only/black screen).
- [ ] System Back and tool Back navigate through app/tool history; root Back is the only point that exits.
- [ ] Tool 04 and Tool 06 open and return without black screens on Android.
- [ ] Status-bar/camera safe area and all header/sheet controls are visible on a cutout-sized viewport.
- [ ] Android APK launcher uses the same TheToolTable brand asset as the Android header.
- [ ] Model downloads and Beam/file transfers continue in the background with visible progress notifications on Android.
- [ ] Media Downloader has a selected, legally compatible native Android engine and a passing end-to-end Android test.
- [ ] All ten tool-pair parts have their own Android screen checks.
