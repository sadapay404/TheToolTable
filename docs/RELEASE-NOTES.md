# TheToolTable v1.2.1 — Android launch repair and safer spreadsheet conversion

> **Published 2026-10-10.** v1.2.1 was built from commit `5e93a08` and
> [GitHub Actions run 38032876221](https://github.com/sadapay404/TheToolTable/actions/runs/38032876221)
> passed prepare, Windows packaging, Android artefact verification, and Android
> emulator smoke. Download the promoted assets from the repository's
> [latest release](https://github.com/sadapay404/TheToolTable/releases/latest).
>
> Future builds use the same process: GitHub Actions creates a private draft
> candidate for the exact commit it builds and promotes it only after its signed
> APK passes the archive/manifest and Android emulator checks.

## The instant Android crash is fixed

The former launch failure happened before the frontend or WebView could render:

1. AndroidX Startup invoked `WorkManagerInitializer` during
   `ActivityThread.handleBindApplication`.
2. WorkManager constructed its Room `WorkDatabase`.
3. Room failed during that process, so Android terminated the app before its
   first frame.

The Android build now applies `scripts/ensure-android-launch-survives.mjs`
*after* Tauri generates the Android project. The repair removes WorkManager's
startup initializer from the merged manifest and preserves the generated
WorkManager/Room classes needed when WorkManager is started later. The release
workflow then opens the signed APK itself and fails the build if
`WorkManagerInitializer` is still present in its merged manifest.

This is deliberately an artefact-level check: passing JavaScript tests is not
proof that a generated Android manifest contains the repair.

## Spreadsheet conversion is isolated and bounded

SheetJS (`xlsx`) remains necessary for local spreadsheet support, but it has
upstream advisories with no npm-published fix available. This release contains
it rather than treating that dependency as safe:

- SheetJS loads only inside a new module Worker per conversion, never in the
  app/UI realm.
- The page rejects files over **32 MiB** and text-to-workbook input over
  **4 MiB** before they are copied to the Worker.
- A job has a **25-second** wall-clock limit. The Worker is terminated on every
  success, failure, and timeout, discarding parser-created state.
- XLSX/ODS ZIP metadata is checked before decompression: at most 4,096 entries,
  32 MiB per expanded entry, and 64 MiB total expansion. ZIP64, multi-disk, and
  encrypted containers are refused.
- Parsed workbooks are constrained to 64 sheets, 100,000 rows/sheet, 512
  columns/sheet, 1,000,000 cells/sheet, and 2,000,000 cells/workbook. Text and
  binary output are bounded too.

These controls reduce exposure and protect the rest of the app from a malformed
workbook; they are **containment**, not a claim that the upstream `xlsx`
package has no remaining vulnerabilities.

## Other maintenance fixes

- Removed a duplicate system-theme watcher so one OS light/dark change triggers
  one repaint rather than duplicate work.
- Pin the transitive `image-size` dependency used by PptxGenJS to `2.0.4` using
  the root npm override. This removes the separately fixable production audit
  findings; the SheetJS advisory above remains and is handled with containment.
- Release metadata is now version-aligned across `package.json`, Cargo, and the
  Tauri bundle configuration. The candidate tag is derived from the same
  `package.json` version and source commit that CI builds:
  `v<version>-build-<short-sha>`.

## Android installation and updates

Download `TheToolTable.apk` from the current release only. Old links to the
v1.1.1 APK point to a build from before the launch repair.

Android accepts an update only when both APKs use the same signing certificate.
If Android reports an incompatible existing package, back up any local work,
uninstall the old app, then install the current release APK. The build workflow
shows the signing-certificate comparison in its job summary and gives
fallback-signed test packages a distinct filename so they cannot be mistaken
for an in-place update.

## If a device ever still crashes at launch

On Windows with Android Platform Tools installed, capture the startup log and
share the output:

```bat
adb logcat -c && adb shell am force-stop app.thetooltable.mubashir && adb shell monkey -p app.thetooltable.mubashir 1 && timeout /t 8 >nul && adb logcat -d -v time | findstr /I /C:"app.thetooltable.mubashir" /C:"FATAL EXCEPTION" /C:"AndroidRuntime" /C:"WorkManager" /C:"Room" /C:"Caused by"
```

The command clears unrelated history, starts one clean app session, waits eight
seconds, and prints the crash chain relevant to this repair.
