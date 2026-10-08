import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const crateCheckoutPrefix = 'tauri-plugin-download-'
const pinnedRevisionPrefix = '13fd4e7'
const replacements = [
  {
    oldText: 'android.sourceSets["main"].java.srcDir("lib/src/main/java")',
    newText: 'extensions.getByType<com.android.build.api.dsl.LibraryExtension>().sourceSets.getByName("main").java.srcDir("lib/src/main/java")',
    label: 'AGP 9 Android LibraryExtension source set',
  },
  {
    oldText: 'compileSdk = 35',
    newText: 'compileSdk = 37',
    label: 'compile SDK 37 setting',
  },
]

const countOccurrences = (source, text) => source.split(text).length - 1

export function patchAndroidDownloadPluginGradle(source) {
  let patchedSource = source
  let changed = false

  for (const { oldText, newText, label } of replacements) {
    const oldCount = countOccurrences(patchedSource, oldText)
    const newCount = countOccurrences(patchedSource, newText)
    if (oldCount === 1 && newCount === 0) {
      patchedSource = patchedSource.replace(oldText, newText)
      changed = true
    } else if (oldCount === 0 && newCount === 1) {
      // Cargo's restored git cache can already contain this compatibility patch.
      continue
    } else {
      throw new Error(
        `Expected exactly one unpatched or patched ${label}; found ${oldCount} unpatched and ${newCount} patched occurrence(s)`,
      )
    }
  }

  return { source: patchedSource, changed }
}

export async function patchAndroidDownloadPluginFile(pluginGradlePath) {
  const source = await readFile(pluginGradlePath, 'utf8')
  const result = patchAndroidDownloadPluginGradle(source)
  if (result.changed) await writeFile(pluginGradlePath, result.source)
  return result
}

export async function locateAndroidDownloadPluginGradle(cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo')) {
  const checkoutRoot = path.join(cargoHome, 'git', 'checkouts')
  const checkouts = await readdir(checkoutRoot, { withFileTypes: true }).catch(() => [])

  for (const checkout of checkouts) {
    if (!checkout.isDirectory() || !checkout.name.startsWith(crateCheckoutPrefix)) continue
    const revisionsRoot = path.join(checkoutRoot, checkout.name)
    const revisions = await readdir(revisionsRoot, { withFileTypes: true }).catch(() => [])
    for (const revision of revisions) {
      if (!revision.isDirectory() || !revision.name.startsWith(pinnedRevisionPrefix)) continue
      const gradlePath = path.join(revisionsRoot, revision.name, 'android', 'build.gradle.kts')
      try {
        await access(gradlePath)
        return gradlePath
      } catch { /* try another cached checkout */ }
    }
  }

  throw new Error(`Could not find ${crateCheckoutPrefix} at ${pinnedRevisionPrefix} under ${checkoutRoot}; run cargo fetch first.`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const suppliedPath = process.argv[2]
  const locateAndPatch = suppliedPath
    ? Promise.resolve(suppliedPath)
    : locateAndroidDownloadPluginGradle()
  locateAndPatch.then(async (pluginGradlePath) => {
    const { changed } = await patchAndroidDownloadPluginFile(pluginGradlePath)
    console.log(`${changed ? 'Patched' : 'Already patched'} pinned download plugin for Tauri 2.12 / AGP 9: ${pluginGradlePath}`)
  }).catch((error) => {
    console.error(`Android download-plugin patch failed: ${error.stack || error}`)
    process.exitCode = 1
  })
}
