#!/usr/bin/env bash
# Exercise the workflow's APK-verification step against mock artefacts.
#
# The step's first version hard-coded expectations it had merely guessed, and
# rejected a perfectly good build — discarding an APK that had already compiled
# and signed, which is the exact failure the step exists to prevent. So this runs
# the real step against a good package and against every way one can be bad, and
# checks not only that each case is refused but that it is refused for the right
# reason.
#
# Usage: bash harness.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# The step is read out of the workflow itself, so this can never drift from it.
WF="$ROOT/../.github/workflows/native.yml"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/apk-verify.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/build-tools/35.0.0"
command -v zip >/dev/null || { echo "SKIP: no zip"; exit 0; }

build_apk() { # $1 output, $2 good|no-dex|no-icons
  local out="$1" mode="$2" dir="$WORK/src"
  rm -rf "$dir"; mkdir -p "$dir"
  : > "$dir/AndroidManifest.xml"
  : > "$dir/resources.arsc"
  [ "$mode" = "no-dex" ] || printf 'dex' > "$dir/classes.dex"
  # Every real Tauri APK carries its Rust library for the target ABI. Without
  # this the new arm64 gate would (correctly) refuse the mock as unrunnable.
  if [ "$mode" != "no-arm-lib" ]; then
    mkdir -p "$dir/lib/arm64-v8a"
    printf 'so' > "$dir/lib/arm64-v8a/libthetooltable.so"
  fi
  if [ "$mode" = "good-big" ]; then
    # A real APK holds thousands of entries; the mock above holds five.
    local i
    mkdir -p "$dir/res/drawable" "$dir/assets"
    for i in $(seq 1 1200); do printf 'i' > "$dir/res/drawable/f$i.png"; done
  fi
  if [ "$mode" != "no-icons" ]; then
    local d
    for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
      mkdir -p "$dir/res/mipmap-$d-v4"
      printf 'icon' > "$dir/res/mipmap-$d-v4/ic_launcher.png"
    done
  fi
  rm -f "$out"; (cd "$dir" && zip -qr "$out" .)
}

# aapt2 is fed its badging on stdin and echoes it verbatim, the way the real one does.
write_aapt2() {
  { printf '#!/bin/sh\ncat <<BADGING\n'; cat; printf 'BADGING\n'; } > "$WORK/build-tools/35.0.0/aapt2"
  chmod +x "$WORK/build-tools/35.0.0/aapt2"
}

write_apksigner() { # $1 ok|bad
  if [ "$1" = "ok" ]; then
    cat > "$WORK/build-tools/35.0.0/apksigner" <<'EOF'
#!/bin/sh
case "$1" in
  verify) cat <<'OUT'
Signer #1 certificate SHA-256 digest: 0123456789abcdef
Verified using v2 scheme (JAR signing): true
Verified using v3 scheme: true
OUT
    exit 0 ;;
esac
exit 1
EOF
  else
    cat > "$WORK/build-tools/35.0.0/apksigner" <<'EOF'
#!/bin/sh
echo "ERROR: JAR signer CERT.SF: digest mismatch" >&2
exit 1
EOF
  fi
  chmod +x "$WORK/build-tools/35.0.0/apksigner"
}


mkdir -p "$WORK/badging"
cat > "$WORK/badging/typed-fgs.txt" <<'EOF'
package: name='app.thetooltable.desktop'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.FOREGROUND_SERVICE_DATA_SYNC'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
native-code: 'arm64-v8a'
EOF
cat > "$WORK/badging/no-notifications.txt" <<'EOF'
package: name='app.thetooltable.desktop'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.FOREGROUND_SERVICE'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
native-code: 'arm64-v8a'
EOF
cat > "$WORK/badging/no-fgs.txt" <<'EOF'
package: name='app.thetooltable.desktop'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
native-code: 'arm64-v8a'
EOF
cat > "$WORK/badging/absent-icon.txt" <<'EOF'
package: name='app.thetooltable.desktop'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.FOREGROUND_SERVICE'
application-icon-160:'res/mipmap-mdpi-v4/does-not-exist.png'
native-code: 'arm64-v8a'
EOF
cat > "$WORK/badging/x86-only.txt" <<'EOF'
package: name='app.thetooltable.mubashir' versionCode='120' versionName='1.2.0' compileSdkVersion='35'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.FOREGROUND_SERVICE'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
native-code: 'x86_64'
EOF
cat > "$WORK/badging/no-abi.txt" <<'EOF'
package: name='app.thetooltable.mubashir' versionCode='120' versionName='1.2.0' compileSdkVersion='35'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.FOREGROUND_SERVICE'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
EOF
: > "$WORK/badging/unreadable.txt"
cat > "$WORK/badging/good.txt" <<'EOF'
package: name='app.thetooltable.desktop' versionCode='120' versionName='1.2.0' compileSdkVersion='35'
sdkVersion:'24'
targetSdkVersion:'35'
uses-permission: name='android.permission.INTERNET'
uses-permission: name='android.permission.POST_NOTIFICATIONS'
uses-permission: name='android.permission.FOREGROUND_SERVICE'
uses-permission: name='android.permission.FOREGROUND_SERVICE_DATA_SYNC'
application-label:'TheToolTable'
application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'
application-icon-240:'res/mipmap-hdpi-v4/ic_launcher.png'
application-icon-320:'res/mipmap-xhdpi-v4/ic_launcher.png'
application-icon-480:'res/mipmap-xxhdpi-v4/ic_launcher.png'
application-icon-640:'res/mipmap-xxxhdpi-v4/ic_launcher.png'
native-code: 'arm64-v8a'
EOF

export ANDROID_HOME="$WORK"
export RUNNER_TEMP="$WORK"
export GITHUB_STEP_SUMMARY="$WORK/summary.md"

# Pull the step out of the workflow itself. Copying it would let this pass
# while the shipped step rotted. The indentation rules below are also the only
# thing standing between a mis-indented YAML edit and a step that silently
# stops halfway through.
node -e '
const fs = require("fs");
const lines = fs.readFileSync(process.argv[1], "utf8").split("\n");
const at = lines.findIndex((l) => l.trim() === "- name: Verify the signed APK before it is banked");
if (at < 0) { console.error("the workflow no longer verifies the APK"); process.exit(1); }
const start = lines.findIndex((l, i) => i > at && l.trim() === "run: |");
if (start < 0) { console.error("the verification step has no run block"); process.exit(1); }
const body = [];
for (const line of lines.slice(start + 1)) {
  if (line.trim() === "") { body.push(""); continue; }
  if (!line.startsWith("          ")) break;
  body.push(line.slice(10));
}
const out = body.join("\n");
if (out.trim() === "") { console.error("the verification step is empty"); process.exit(1); }
fs.writeFileSync(process.argv[2], out + "\n");
' "$WF" "$WORK/step.sh" || { echo "could not extract the verification step"; exit 1; }
bash -n "$WORK/step.sh" || { echo "the verification step is not valid shell"; exit 1; }
# A run block that YAML refuses to load would still extract as plausible shell.
node -e '
const fs = require("fs");
const src = fs.readFileSync(process.argv[1], "utf8");
const run = src.split("name: Verify the signed APK before it is banked")[1].split("run: |")[1]
  .split(/\n {6}- name:/)[0];
for (const want of ["set -euo pipefail", "fail()", "APK verified:"]) {
  if (!run.includes(want)) { console.error(`the step lost ${want} - a YAML edit probably broke it`); process.exit(1); }
}
' "$WF" || { echo "the extracted step is truncated"; exit 1; }

pass=0; fail=0
# run <wanted exit> <apk path|""> <description> [expected reason] <badging file>
run() { # $1 wanted exit, $2 apk path ("" = unset), $3 description, $4 expected reason, $5 badging file
  local want="$1" apk="$2" name="$3" needle="${4:-}" got
  if [ -n "$apk" ]; then export ANDROID_RELEASE_APK="$apk"; else unset ANDROID_RELEASE_APK; fi
  if [ -n "${5:-}" ]; then write_aapt2 < "$5"; fi
  write_apksigner "${6:-ok}"
  : > "$GITHUB_STEP_SUMMARY"
  got=$(bash "$WORK/step.sh" > "$WORK/out.txt" 2>&1; echo $?)
  if [ "$got" != "$want" ]; then
    fail=$((fail + 1)); printf '  FAIL  %-52s exit %s, wanted %s\n        %s\n' "$name" "$got" "$want" "$(head -1 "$WORK/out.txt")"
    return
  fi
  if [ -n "$needle" ] && ! grep -qF "$needle" "$WORK/out.txt"; then
    fail=$((fail + 1)); printf '  FAIL  %-52s refused, but for the wrong reason\n        wanted: %s\n        got:    %s\n' "$name" "$needle" "$(head -1 "$WORK/out.txt")"
    return
  fi
  pass=$((pass + 1)); printf '  ok    %s\n' "$name"
}

# run_many <times> <wanted exit> <apk> <description>
# Repeats a case because the defect it guards against is a race: a single run
# that happens to win proves nothing.
run_many() { # $1 times, $2 wanted exit, $3 apk, $4 description
  local times="$1" want="$2" apk="$3" name="$4" i bad=0 got
  write_aapt2 < "$WORK/badging/good.txt"
  write_apksigner ok
  export ANDROID_RELEASE_APK="$apk"
  for i in $(seq 1 "$times"); do
    : > "$GITHUB_STEP_SUMMARY"
    got=$(bash "$WORK/step.sh" > "$WORK/out.txt" 2>&1; echo $?)
    if [ "$got" != "$want" ]; then
      bad=$((bad + 1))
      [ "$bad" = 1 ] && printf '        first failure (run %s of %s): %s\n' "$i" "$times" "$(head -1 "$WORK/out.txt")"
    fi
  done
  if [ "$bad" -ne 0 ]; then
    fail=$((fail + 1))
    printf '  FAIL  %-52s %s of %s runs wrongly failed\n' "$name" "$bad" "$times"
    return
  fi
  pass=$((pass + 1)); printf '  ok    %s (%s runs)\n' "$name" "$times"
}

build_apk "$WORK/good.apk" good
write_apksigner ok

echo "a good package:"
run 0 "$WORK/good.apk" "well-formed, signed, fully-iconed APK is accepted" "" "$WORK/badging/good.txt"
grep -q "Launcher icons | 5" "$GITHUB_STEP_SUMMARY" || { fail=$((fail+1)); echo "        the summary did not record the icons"; pass=$((pass-1)); }

echo
echo "bad packages:"
run 1 ""  "nothing to verify is refused"  "Nothing to verify" "" "$WORK/badging/good.txt"
printf 'junk' > "$WORK/corrupt.apk"
run 1 "$WORK/corrupt.apk" "a corrupt archive is refused" "readable zip" "" "$WORK/badging/good.txt"
build_apk "$WORK/no-dex.apk" no-dex
run 1 "$WORK/no-dex.apk" "a package with no dex is refused" "dex bytecode" "" "$WORK/badging/good.txt"
run 1 "$WORK/good.apk" "a package whose signature fails is refused" "signature does not verify" "$WORK/badging/good.txt" bad

build_apk "$WORK/no-icons.apk" no-icons
# The mocks above hold a handful of entries, which is not enough to trigger the
# race the real step fell into: `grep -q` closes the pipe on a still-writing
# `unzip`, `pipefail` reports that SIGPIPE as failure, and a flawless package is
# rejected for having no dex. It passed here for months and then rejected good
# builds intermittently in CI, where a real APK has thousands of entries. So
# this case has to be repeated enough times to fail if the race is back.
build_apk "$WORK/big.apk" good-big
run_many 30 0 "$WORK/big.apk" "a package with thousands of entries is not mistaken for a broken one"
printf 'package: name=%s\nsdkVersion:%s24%s\ntargetSdkVersion:%s35%s\nuses-permission: name=%sandroid.permission.INTERNET%s\nuses-permission: name=%sandroid.permission.POST_NOTIFICATIONS%s\nuses-permission: name=%sandroid.permission.FOREGROUND_SERVICE%s\nnative-code: %sarm64-v8a%s\n' "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" "'" > "$WORK/badging/no-icons.txt"
run 1 "$WORK/no-icons.apk" "a package with no launcher icon is refused" "default Android robot" "$WORK/badging/no-icons.txt"

run 1 "$WORK/good.apk" "an icon aapt2 names but the archive lacks is refused" "not in the archive" "$WORK/badging/absent-icon.txt"

run 0 "$WORK/good.apk" "Android 14's typed FOREGROUND_SERVICE_DATA_SYNC is accepted" "" "$WORK/badging/typed-fgs.txt"

run 1 "$WORK/good.apk" "a package without notification permission is refused" "POST_NOTIFICATIONS" "$WORK/badging/no-notifications.txt"
run 1 "$WORK/good.apk" "a package with no foreground-service permission is refused" "backgrounded" "$WORK/badging/no-fgs.txt"

run 1 "$WORK/good.apk" "an unreadable manifest is refused" "aapt2 could not read" "$WORK/badging/unreadable.txt"

# The gate that would have caught the crash on a real phone.
run 1 "$WORK/good.apk" "an APK with no arm64 ABI is refused" "advertises no arm64-v8a" "$WORK/badging/x86-only.txt"
run 1 "$WORK/good.apk" "an APK that reports no ABI at all is refused" "advertises no arm64-v8a" "$WORK/badging/no-abi.txt"
build_apk "$WORK/no-arm-lib.apk" no-arm-lib
run 1 "$WORK/no-arm-lib.apk" "an APK with no arm64 native library is refused" "UnsatisfiedLinkError" "$WORK/badging/good.txt"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]