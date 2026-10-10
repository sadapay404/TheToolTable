/**
 * The local Android build must produce the same thing CI produces.
 *
 * `npm run app:android` is what a person on a Linux box runs to build the APK
 * themselves, and it is the only way most of them will ever build this project.
 * It did not run `scripts/ensure-android-launch-survives.mjs`, which is the patch
 * that removes AndroidX WorkManager from the launch path - the patch that fixes
 * the app closing instantly on launch. Anyone following the project's own
 * documented command would have produced, and installed, the exact crashing APK
 * this repository spent a week diagnosing.
 *
 * So the script is pinned here. The order matters: `tauri android init` generates
 * the project, and the patchers edit generated files, so anything that runs
 * before init silently does nothing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const build = pkg.scripts['app:android']

test('the local Android build applies the launch fix', () => {
  assert.ok(build, 'package.json must still define app:android')
  assert.match(build, /android:launch-fix/,
    'app:android must run the launch patch - without it the built APK crashes on launch')

  const patch = pkg.scripts['android:launch-fix']
  assert.match(patch, /scripts\/ensure-android-launch-survives\.mjs/,
    'the launch fix must point at the script that removes WorkManager from startup')
})

test('the local Android build applies every patch CI applies', () => {
  /* Each of these exists because something was broken without it. Dropping one
     silently returns the project to a state that builds fine and then misbehaves
     on a device, which is the expensive kind of regression. */
  for (const step of ['android:permissions', 'android:patch', 'android:icons']) {
    assert.ok(build.includes(step), `app:android must run ${step}`)
  }
  // Icons are installed, not merely generated: the generator writes source PNGs
  // and the installer is what puts them in the generated Android project.
  assert.match(pkg.scripts['android:icons'], /install-android-launcher-icons\.mjs/)
})

test('the local Android build targets the phone architecture', () => {
  /* armv7 was dropped from the release pipeline after it shipped: a 32-bit
     package installs on one device and dies on another. armv7 in a local build
     reintroduces exactly that. */
  assert.match(build, /--target aarch64/,
    'a modern phone needs the arm64-v8a build')
  assert.doesNotMatch(build, /--target armv7/,
    'armv7 must stay out: a 32-bit package installs on one device and dies on another')
})

test('every patcher the build depends on actually exists', () => {
  /* A typo in a script path fails late, after a full Rust build, which on a slow
     machine is the worst possible moment to find out. */
  const paths = [
    ...Object.values(pkg.scripts).join(' ').matchAll(/scripts\/[\w.-]+\.mjs/g),
  ].map((m) => m[0])
  assert.ok(paths.length >= 4, 'the build should reference several patchers')
  for (const p of new Set(paths)) {
    readFileSync(new URL(`../${p}`, import.meta.url))
  }
})