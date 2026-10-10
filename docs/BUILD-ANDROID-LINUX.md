# Building the Android APK on your own Linux machine

This is the procedure for building `TheToolTable.apk` on a Linux computer, for
installing on an Android phone by sideloading.

It exists because the published APK could not be delivered for a while, and
because a local build is genuinely useful: you get the exact source you can read,
and you can rebuild after every change without waiting for anything.

## Before you start

You need, on the machine:

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 20 or newer | the app's build tooling |
| Rust | stable, via rustup | the native side of the app |
| JDK | **17** (Temurin recommended) | Android's build requires exactly this |
| Android SDK | platform 35, build-tools 35.0.0, NDK, platform-tools | Tauri compiles native code against the NDK |
| git, curl, build-essential | any | ordinary build prerequisites |

Roughly **15 GB of free disk**. No GPU is needed.

### A low-end machine is fine

This build spends nearly all of its time waiting - downloading Gradle
dependencies, downloading Rust crates, then compiling - and none of that needs
speed. Expect **40 to 90 minutes** on a slow laptop. If it takes longer, it is
still progressing.

The one thing that genuinely helps is **free disk space and free RAM**. Gradle
plus a Rust build can use several GB; if the machine starts swapping, close other
applications first.

## 1. Get the source

```bash
git clone https://github.com/sadapay404/TheToolTable.git
cd TheToolTable
# For the repaired app, use the current promoted release tag (or the exact
# source commit named by its release candidate).
git checkout <release-tag-or-commit>
```

Do not build the old v1.1.1 source for Android: it predates the launch repair.
The repaired source carries the Android launch fix described below.

## 2. Install the toolchain

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# JDK 17 - the Android build does not work with newer JDKs
sudo apt install openjdk-17-jdk

# Node, if you do not already have it
sudo apt install nodejs npm
```

### Android SDK

Install Android Studio, open it once, and let it install the SDK. Then, using
`sdkmanager` (found under `Android Studio > Settings > Languages & Frameworks >
Android SDK > SDK Tools`), install:

- `platforms;android-35`
- `build-tools;35.0.0`
- `ndk;27.2.12479018`
- `platform-tools`

Then point your shell at the SDK:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

Add those three lines to `~/.bashrc` so they survive a new terminal.

## 3. Build

```bash
npm ci
npx tauri android init
npm run app:android
```

The output APK lands at:

```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

## 4. Install on the phone

1. Copy that APK to your phone, or install with `adb`:

   ```bash
   adb install -r app-universal-release.apk
   ```

2. If Android refuses with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, uninstall the
   old app first. This happens whenever the signing key differs from the one the
   installed app was signed with, which is normal when switching between builds:

   ```bash
   adb uninstall app.thetooltable.mubashir
   adb install app-universal-release.apk
   ```

3. Allow installation from your file manager when Android asks.

## Why `npm run app:android` and not a raw `tauri` command

`app:android` runs four steps in a fixed order, and every one of them is load
bearing:

| Step | What it prevents |
| --- | --- |
| `android:permissions` | background transfers silently failing |
| `android:patch` | the download plugin failing to compile on modern AGP |
| `android:icons` | the app shipping the default Android robot icon |
| `android:launch-fix` | **the app closing instantly on launch** |

That last one is the reason this file exists. `scripts/ensure-android-launch-survives.mjs`
removes AndroidX WorkManager from the application startup path. WorkManager
builds a Room database during `handleBindApplication`, before the first frame; if
that database cannot be created, the exception kills the process and Android
reports "The Tool Table keeps stopping". The patch removes the initializer and
keeps Room's generated classes from being stripped.

The project's `app:android` script originally did **not** run that patch. Anyone
following the documented command would have built and installed the exact APK
that crashes. `tests/android-local-build.test.js` now fails if it is ever dropped.

The order also matters. `tauri android init` generates the Android project, and
these scripts edit generated files, so anything running before `init` does
nothing at all - which is why `init` is a separate step above.

## Verify what you built

To confirm the launch fix actually made it into your APK:

```bash
$ANDROID_HOME/build-tools/35.0.0/aapt2 dump xmltree \
  --file AndroidManifest.xml \
  src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk \
  | grep -c WorkManagerInitializer
```

`0` means the launch path is clean. Any number above `0` means the patch did not
take effect and the app will crash on launch.

The CI pipeline runs exactly this check, and refuses to publish an APK that
fails it.

## If something goes wrong

**`JAVA_HOME` / unsupported class file major version**
You are on the wrong JDK. You need 17:

```bash
sudo update-alternatives --config java
java -version   # must report 17
```

**Gradle fails with 429 or "too many requests"**
Transient Maven Central rate limiting. Retry the build; Gradle resumes from its
cache.

**Out of disk space**
`sudo apt clean && sudo rm -rf ~/.gradle/caches` frees several GB. The build
re-downloads what it needs.

**The build succeeds but the app still crashes on launch**
Run the verification command in the section above. A non-zero result means the
launch patch did not survive the build, and that specific APK will crash. If it
reports `0`, capture a clean startup log on Windows and share it with the
maintainer:

```bat
adb logcat -c && adb shell am force-stop app.thetooltable.mubashir && adb shell monkey -p app.thetooltable.mubashir 1 && timeout /t 8 >nul && adb logcat -d -v time | findstr /I /C:"app.thetooltable.mubashir" /C:"FATAL EXCEPTION" /C:"AndroidRuntime" /C:"WorkManager" /C:"Room" /C:"Caused by"
```

This starts one clean app session and filters the resulting log to the launch
crash chain.