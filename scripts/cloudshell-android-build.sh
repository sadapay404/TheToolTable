#!/usr/bin/env bash
# Build a signed arm64 test APK in Google Cloud Shell.
#
# Mirrors the android job in .github/workflows/native.yml, with two changes made
# to fit Cloud Shell's 5 GB persistent home directory:
#   1. Heavy tooling (Android SDK, NDK, Rust, Cargo and Gradle caches, build
#      output) lives in $WORK (default /tmp), not in $HOME.
#   2. Only the arm64-v8a target is built. Phones are arm64, and the x86_64
#      emulator half is not needed for a phone test.
#
# Usage:
#   cd ~/TheToolTable
#   bash scripts/cloudshell-android-build.sh
#
# Output: $OUT (default ~/TheToolTable-fallback-signed.apk), which you can
# download from Cloud Shell with the menu: More > Download.
#
# The APK is signed with a throwaway key, because the repository's real
# signing secret is not available here. It installs as a separate app, so
# uninstall any older copy of TheToolTable first.

set -euo pipefail

REPO="${REPO:-$HOME/TheToolTable}"
WORK="${WORK:-/tmp/ttt-build}"
OUT="${OUT:-$HOME/TheToolTable-fallback-signed.apk}"
PLATFORM="android-35"
BUILD_TOOLS="35.0.0"
NDK_VERSION="27.2.12479018"
CMDLINE_TOOLS_URL="${CMDLINE_TOOLS_URL:-https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip}"
MIN_WORK_GB=10
MIN_HOME_GB=1

step() { printf '\n==== %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
trap 'printf "\nFAILED at line %s (exit %s). Re-run this script to resume; finished steps are skipped.\n" "$LINENO" "$?" >&2' ERR

free_gb() { df -P -BG "$1" | awk 'NR==2 {gsub("G","",$4); print $4}'; }

# ---------------------------------------------------------------- preflight
step "1/9 Preflight: tools and disk space"
[ -f "$REPO/package.json" ] || die "Repository not found at $REPO. Clone it first."
mkdir -p "$WORK"
echo "Free space in \$WORK ($WORK): $(free_gb "$WORK") GB (need about $MIN_WORK_GB GB)"
echo "Free space in \$HOME: $(free_gb "$HOME") GB (need about $MIN_HOME_GB GB)"
[ "$(free_gb "$WORK")" -ge "$MIN_WORK_GB" ] || die "Not enough free space in $WORK. Run 'df -h /tmp \$HOME' and tell me the output; this may not fit in Cloud Shell."
[ "$(free_gb "$HOME")" -ge "$MIN_HOME_GB" ] || die "Not enough free space in \$HOME. Delete large files in ~ and retry."

command -v node >/dev/null || die "node is missing."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || die "Node 20 or newer is required."
command -v git >/dev/null || die "git is missing."
command -v unzip >/dev/null || die "unzip is missing. Install it with: sudo apt-get install -y unzip"

# The build needs JDK 17 (as in CI), even when the default JDK is newer.
jdk_is_17() {
  [ -x "$1/bin/javac" ] && [ "$("$1/bin/javac" -version 2>&1 | awk '{print $2}' | cut -d. -f1)" = "17" ]
}
if ! jdk_is_17 "${JAVA_HOME:-/nonexistent}"; then
  unset JAVA_HOME
  for jdk in /usr/lib/jvm/java-17-openjdk-amd64 /usr/lib/jvm/temurin-17-jdk-amd64; do
    if jdk_is_17 "$jdk"; then export JAVA_HOME="$jdk"; break; fi
  done
fi
[ -n "${JAVA_HOME:-}" ] || die "JDK 17 not found (the default Java here is newer). Install it with: sudo apt-get update && sudo apt-get install -y openjdk-17-jdk-headless   then re-run this script."
export PATH="$JAVA_HOME/bin:$PATH"
echo "JDK: $JAVA_HOME"

# Keep every heavy cache out of $HOME.
export RUSTUP_HOME="$WORK/rustup" CARGO_HOME="$WORK/cargo"
export CARGO_TARGET_DIR="$WORK/cargo-target"
export GRADLE_USER_HOME="$WORK/gradle"
export ANDROID_HOME="$WORK/android-sdk" ANDROID_SDK_ROOT="$WORK/android-sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"
export PATH="$CARGO_HOME/bin:$PATH"

# ---------------------------------------------------------------- Rust
step "2/9 Rust toolchain (minimal profile, aarch64 Android target only)"
if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable --no-modify-path
fi
rustup target add aarch64-linux-android
rustc --version

# ---------------------------------------------------------------- Android SDK
step "3/9 Android SDK, NDK $NDK_VERSION, build-tools $BUILD_TOOLS, $PLATFORM"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  curl -fL --retry 3 -o "$WORK/cmdline-tools.zip" "$CMDLINE_TOOLS_URL"
  unzip -q -o "$WORK/cmdline-tools.zip" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f "$WORK/cmdline-tools.zip"
fi
set +o pipefail
yes | "$SDKMANAGER" --licenses >"$WORK/licenses.log" 2>&1 || true
set -o pipefail
"$SDKMANAGER" --install "platforms;$PLATFORM" "build-tools;$BUILD_TOOLS" "ndk;$NDK_VERSION" >"$WORK/sdk-install.log" 2>&1 \
  || { tail -n 20 "$WORK/sdk-install.log"; die "sdkmanager failed. Log: $WORK/sdk-install.log"; }
BT="$ANDROID_HOME/build-tools/$BUILD_TOOLS"
[ -x "$BT/apksigner" ] || die "apksigner missing from $BT"

# ---------------------------------------------------------------- repo prep
step "4/9 Dependencies and Android project"
cd "$REPO"
npm ci --ignore-scripts --no-audit --no-fund
npx tauri android init

node scripts/install-android-launcher-icons.mjs

# cargo fetch must run before the download-plugin patch can see the checkout.
for attempt in 1 2 3; do
  if cargo fetch --manifest-path src-tauri/Cargo.toml; then break; fi
  [ "$attempt" -lt 3 ] || die "cargo fetch failed three times."
  sleep 15
done
node scripts/patch-android-download-plugin.mjs
node scripts/patch-android-background-service.mjs
node scripts/ensure-android-transfer-permissions.mjs
node scripts/ensure-android-launch-survives.mjs

# Same Gradle retry settings the workflow uses for transient Maven rate limits.
cat >> src-tauri/gen/android/gradle.properties <<'EOF'
systemProp.org.gradle.internal.repository.max.retries=8
systemProp.org.gradle.internal.repository.initial.backoff=1000
EOF

# ---------------------------------------------------------------- build
step "5/9 Build the arm64 release APK (this takes a long time on the first run)"
# Retry only on Maven Central rate limiting (HTTP 429), as native.yml does.
# Real compile errors fail immediately instead of rebuilding for an hour.
for attempt in 1 2 3; do
  log="$WORK/android-build-$attempt.log"
  set +e
  npx tauri android build --apk --target aarch64 2>&1 | tee "$log"
  build_status=${PIPESTATUS[0]}
  set -e
  [ "$build_status" -eq 0 ] && break
  if grep -Eiq 'status code[[:space:]]+429|HTTP[^[:digit:]]*429|too many requests|rate.?limit' "$log" && [ "$attempt" -lt 3 ]; then
    delay=$((attempt * 45))
    echo "Maven Central returned 429; retrying in ${delay}s."
    sleep "$delay"
    continue
  fi
  echo "--- first errors in $log:"
  grep -Ei 'FAILURE:|What went wrong:|Execution failed for task|BUILD FAILED|Caused by:|^e: |^error:' "$log" | head -n 15 || true
  die "Android build failed (exit $build_status). Full log: $log"
done

# ---------------------------------------------------------------- locate
step "6/9 Locate the built APK"
UNSIGNED="$(find src-tauri/gen/android -path '*outputs/apk*' -name '*release*.apk' | head -n 1)"
[ -n "$UNSIGNED" ] || die "No release APK found under src-tauri/gen/android/app/build/outputs/apk."
echo "Built: $UNSIGNED"

# ---------------------------------------------------------------- sign
step "7/9 Align and sign with a throwaway key"
KS="$WORK/ttt-test.jks"
PASS="thetooltable"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias ttt -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=TheToolTable, O=Mubashir"
fi
"$BT/zipalign" -p -f 4 "$UNSIGNED" "$WORK/aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-key-alias ttt --ks-pass "pass:$PASS" --key-pass "pass:$PASS" --out "$OUT" "$WORK/aligned.apk"
"$BT/apksigner" verify "$OUT"

# ---------------------------------------------------------------- verify
step "8/9 Check the package"
unzip -l "$OUT" | grep -q 'lib/arm64-v8a/' || die "The APK has no arm64-v8a native libraries."
"$BT/aapt2" dump badging "$OUT" 2>/dev/null | sed -n "s/^package: name='\([^']*\)' versionCode='\([^']*\)' versionName='\([^']*\)'.*/package \1  versionCode \2  versionName \3/p" || true
echo "Size: $(du -h "$OUT" | cut -f1)"
sha256sum "$OUT"

# ---------------------------------------------------------------- done
step "9/9 Done"
echo "APK: $OUT"
echo "Download it from Cloud Shell: More (three dots) > Download > enter the path above."
echo "Optional cleanup of the heavy caches: rm -rf \"$WORK\""
