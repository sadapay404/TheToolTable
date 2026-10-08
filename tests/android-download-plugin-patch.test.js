import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  locateAndroidDownloadPluginGradle,
  patchAndroidDownloadPluginGradle,
} from '../scripts/patch-android-download-plugin.mjs'

const original = `
android.sourceSets["main"].java.srcDir("lib/src/main/java")
compileSdk = 35
`

const expected = `
extensions.getByType<com.android.build.api.dsl.LibraryExtension>().sourceSets.getByName("main").java.srcDir("lib/src/main/java")
compileSdk = 37
`

test('pinned Android download-plugin patch applies the AGP 9 DSL and compile SDK 37 updates', () => {
  const result = patchAndroidDownloadPluginGradle(original)
  assert.equal(result.changed, true)
  assert.equal(result.source, expected)
})

test('pinned Android download-plugin patch is idempotent with a restored patched Cargo cache', () => {
  const firstPass = patchAndroidDownloadPluginGradle(original)
  const secondPass = patchAndroidDownloadPluginGradle(firstPass.source)
  assert.equal(secondPass.changed, false)
  assert.equal(secondPass.source, expected)
})

test('pinned Android download-plugin patch handles a partially patched cache', () => {
  const partiallyPatched = original.replace(
    'android.sourceSets["main"].java.srcDir("lib/src/main/java")',
    'extensions.getByType<com.android.build.api.dsl.LibraryExtension>().sourceSets.getByName("main").java.srcDir("lib/src/main/java")',
  )
  const result = patchAndroidDownloadPluginGradle(partiallyPatched)
  assert.equal(result.changed, true)
  assert.equal(result.source, expected)
})

test('pinned Android download-plugin patch fails closed if the locked source drifts or is ambiguous', () => {
  assert.throws(
    () => patchAndroidDownloadPluginGradle(original.replace('compileSdk = 35', 'compileSdk = 36')),
    /compile SDK 37 setting/,
  )
  assert.throws(
    () => patchAndroidDownloadPluginGradle(`${original}\ncompileSdk = 35`),
    /compile SDK 37 setting/,
  )
})

test('pinned Android download-plugin lookup selects the locked Cargo checkout', async (t) => {
  const cargoHome = await mkdtemp(path.join(os.tmpdir(), 'thetooltable-cargo-'))
  t.after(() => rm(cargoHome, { recursive: true, force: true }))
  const gradlePath = path.join(
    cargoHome,
    'git',
    'checkouts',
    'tauri-plugin-download-checkout',
    '13fd4e7',
    'android',
    'build.gradle.kts',
  )
  await mkdir(path.dirname(gradlePath), { recursive: true })
  await writeFile(gradlePath, original)

  assert.equal(await locateAndroidDownloadPluginGradle(cargoHome), gradlePath)
})
