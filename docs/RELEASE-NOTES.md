# TheToolTable v1.2.2 candidate — Android launch recovery and safer spreadsheet conversion

> **Not published — 2026-10-10.** The earlier v1.2.1 APK was withdrawn after a
> physical device proved that it still aborts during native download-plugin
> initialization. Its prior CI result and first-frame emulator result are not a
> release endorsement. All formerly public Android releases are drafts while the
> corrected v1.2.2 candidate is built and validated.
>
> Do not use GitHub's former `latest` APK URL or an older downloaded APK. A new
> public release may be published only after the exact signed bytes pass the
> strengthened artifact gate and survive full native/plugin initialization on a
> device or emulator.

## The instant Android crash: root cause and corrective path

The former launch failure happened before the frontend or WebView could render:

1. AndroidX Startup invoked `WorkManagerInitializer` during
   `ActivityThread.handleBindApplication`.
2. WorkManager constructed its Room `WorkDatabase`.
3. Room failed during that process, so Android terminated the app before its
   first frame.

The corrected build applies `scripts/ensure-android-launch-survives.mjs`
*after* Tauri generates the Android project. It does both sides of AndroidX
WorkManager's on-demand-initialization contract:

1. it removes `WorkManagerInitializer` from AndroidX Startup, preventing Room
   database construction during `handleBindApplication`; and
2. it generates and declares
   `app.thetooltable.mubashir.TheToolTableApplication`, whose
   `Configuration.Provider` supplies WorkManager configuration when the download
   plugin later calls `WorkManager.getInstance(context)`.

Removing the initializer without the custom Application is also broken: the
plugin then aborts with “WorkManager is not initialized properly.” The workflow
therefore opens the *signed APK's merged manifest* and rejects it if either the
startup initializer remains or the custom Application is absent; it also checks
the Application's DEX descriptor so a manifest declaration cannot point to an
omitted/stripped class. The device smoke waits five seconds after the first
visible collection, confirms the process stays foregrounded, and treats native
abort tombstones and download-plugin initialization failures as crashes.

These are deliberately artifact- and runtime-level checks: passing JavaScript
unit tests is not proof that a generated Android manifest/class or native launch
path survived the build.

## Spreadsheet conversion is isolated and bounded

SheetJS (`xlsx`) remains necessary for local spreadsheet support, but it has
upstream advisories with no npm-published fix available. This unpublished
candidate contains it rather than treating that dependency as safe:

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

There is **no currently endorsed Android APK**. Wait for a v1.2.2 release whose
notes explicitly say that the delayed native/plugin validation passed; do not
install a cached v1.2.1 or older asset.

Android accepts an update only when both APKs use the same signing certificate.
When a corrected release is available, if Android reports an incompatible
existing package, back up any local work, uninstall the old app, then install
the verified APK. The build workflow shows the signing-certificate comparison
in its job summary and gives fallback-signed test packages a distinct filename
so they cannot be mistaken for an in-place update.

## If a device ever still crashes at launch

On Windows with Android Platform Tools installed, capture the startup log and
share the output:

```bat
adb logcat -c && adb shell am force-stop app.thetooltable.mubashir && adb shell monkey -p app.thetooltable.mubashir 1 && timeout /t 8 >nul && adb logcat -d -v time | findstr /I /C:"app.thetooltable.mubashir" /C:"FATAL EXCEPTION" /C:"AndroidRuntime" /C:"WorkManager" /C:"PluginInitialization" /C:"Abort message" /C:"Fatal signal" /C:"Room" /C:"Caused by"
```

The command clears unrelated history, starts one clean app session, waits eight
seconds, and prints the crash chain relevant to this repair.
