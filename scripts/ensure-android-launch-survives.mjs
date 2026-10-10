/**
 * Make the Android app survive launch *and* let the download plugin obtain a
 * WorkManager instance after launch.
 *
 * The original real-device failure happened in AndroidX Startup:
 *
 *   androidx.startup.InitializationProvider -> WorkManagerInitializer
 *   -> Room WorkDatabase during ActivityThread.handleBindApplication
 *
 * That is before the Activity/WebView exists. The startup initializer must stay
 * removed so a Room failure cannot kill the process before the first frame.
 *
 * Removing that initializer has an AndroidX contract: the app must either call
 * WorkManager.initialize itself or expose Configuration.Provider on its
 * Application. The download plugin calls WorkManager.getInstance during Tauri
 * plugin setup. Without one of those alternatives Android aborts the process:
 *
 *   WorkManager is not initialized properly ... Application does not implement
 *   Configuration.Provider
 *
 * Install a small generated Application implementation of Configuration.Provider
 * instead of eagerly calling initialize in Application.onCreate. WorkManager then
 * initializes on first real use, after the app has started, with the default
 * configuration. R8 keep rules remain necessary for its Room implementation.
 *
 * Run after `tauri android init` because the Android project is generated:
 *   node scripts/ensure-android-launch-survives.mjs
 */
import { readFile, writeFile, access, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ANDROID = path.resolve('src-tauri/gen/android/app')
const manifestPath = path.join(ANDROID, 'src/main/AndroidManifest.xml')
const rulesPath = path.join(ANDROID, 'proguard-rules.pro')
const tauriConfigPath = path.resolve('src-tauri/tauri.conf.json')
const APPLICATION_CLASS = 'TheToolTableApplication'
const WORK_INITIALIZER = 'androidx.work.WorkManagerInitializer'
// This is the version used by the pinned tauri-plugin-download Android module.
// The generated Application lives in the app module, so it needs a direct
// compile dependency even when the plugin keeps its own dependency internal.
const WORK_MANAGER_DEPENDENCY = 'androidx.work:work-runtime-ktx:2.9.1'

/** The build script may be Groovy or Kotlin DSL, and may be absent entirely. */
const GRADLE_FILES = ['build.gradle.kts', 'build.gradle']

const KEEP_RULES = `
# --- TheToolTable: keep AndroidX WorkManager's Room database -------------
# WorkManager's database classes are reached indirectly and Room constructs its
# generated implementation by name. Keep them in release builds.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.room.RoomDatabase_Impl { *; }
-keep class androidx.sqlite.** { *; }
-keep class androidx.work.impl.** { *; }
-keep class androidx.work.** { *; }
-keep class **.TheToolTableApplication { *; }
-dontwarn androidx.work.**
-dontwarn androidx.sqlite.**
`

function validAndroidPackage(value) {
  return typeof value === 'string'
    && value.split('.').length >= 2
    && value.split('.').every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part))
}

async function applicationId() {
  const raw = await readFile(tauriConfigPath, 'utf8')
  const identifier = JSON.parse(raw).identifier
  if (!validAndroidPackage(identifier)) {
    throw new Error(`tauri.conf.json has an invalid Android application identifier: ${String(identifier)}`)
  }
  return identifier
}

function applicationSource(packageName) {
  return `package ${packageName}

import android.app.Application
import androidx.work.Configuration

/**
 * AndroidX WorkManager's startup provider is deliberately removed from this
 * app's manifest. The download plugin initializes WorkManager on first use and
 * reads this configuration after Application creation instead of during
 * handleBindApplication.
 */
class ${APPLICATION_CLASS} : Application(), Configuration.Provider {
  override val workManagerConfiguration: Configuration
    get() = Configuration.Builder().build()
}
`
}

/** Add the tools namespace only when the WorkManager merge override needs it. */
function withToolsNamespace(xml) {
  const manifest = xml.match(/<manifest\b[^>]*>/)
  if (!manifest) throw new Error('Android manifest has no <manifest> element')
  if (/xmlns:tools=/.test(manifest[0])) return xml
  return xml.replace(
    /<manifest\b[^>]*>/,
    (tag) => tag.replace(/(>|\/>)$/, ' xmlns:tools="http://schemas.android.com/tools"$1'),
  )
}

/**
 * Remove WorkManager from AndroidX Startup. The library contributes its own
 * metadata during manifest merge, so the generated source manifest never has
 * the metadata until this explicit merge-removal block is added.
 */
function detachWorkManagerFromStartup(xml) {
  const marker = `android:name="${WORK_INITIALIZER}"`
  if (xml.includes(marker) && xml.includes('tools:node="remove"')) {
    return { xml, changed: false, reason: 'WorkManager is already detached from AndroidX Startup.' }
  }

  const application = xml.match(/<application\b[^>]*>/)
  if (!application) throw new Error('Android manifest has no <application> element')

  const provider = `  <!-- Do not construct WorkManager's Room database in AndroidX Startup.
       The Application Configuration.Provider below supplies configuration when
       the download plugin first calls WorkManager.getInstance(). -->
  <provider
    android:name="androidx.startup.InitializationProvider"
    android:authorities="\${applicationId}.androidx-startup"
    android:exported="false"
    tools:node="merge">
    <meta-data
      android:name="${WORK_INITIALIZER}"
      android:value="androidx.startup"
      tools:node="remove" />
  </provider>
`
  const namespaced = withToolsNamespace(xml)
  return {
    xml: namespaced.replace(application[0], `${application[0]}\n${provider}`),
    changed: true,
    reason: 'WorkManager detached from AndroidX Startup',
  }
}

/**
 * WorkManager explicitly requires this provider when WorkManagerInitializer is
 * removed. It permits lazy initialization at plugin setup instead of a provider
 * initializing a Room database before the first frame.
 */
async function installWorkManagerConfigurationProvider(xml, packageName) {
  const className = `${packageName}.${APPLICATION_CLASS}`
  const application = xml.match(/<application\b[^>]*>/)
  if (!application) throw new Error('Android manifest has no <application> element')

  const declaredName = application[0].match(/\bandroid:name\s*=\s*(["'])(.*?)\1/)?.[2]
  const acceptedNames = new Set([className, `.${APPLICATION_CLASS}`, APPLICATION_CLASS])
  if (declaredName && !acceptedNames.has(declaredName)) {
    throw new Error(`Android manifest already declares Application ${declaredName}; cannot safely add the WorkManager Configuration.Provider`)
  }

  let out = xml
  let manifestChanged = false
  if (!declaredName) {
    const withApplication = application[0].replace(
      /<application\b/,
      `<application\n    android:name="${className}"`,
    )
    out = out.replace(application[0], withApplication)
    manifestChanged = true
  }

  const sourcePath = path.join(
    ANDROID,
    'src/main/kotlin',
    ...packageName.split('.'),
    `${APPLICATION_CLASS}.kt`,
  )
  const expectedSource = applicationSource(packageName)
  const currentSource = await readFile(sourcePath, 'utf8').catch(() => null)
  if (currentSource !== null && currentSource !== expectedSource) {
    throw new Error(`Refusing to overwrite existing Android Application source: ${sourcePath}`)
  }
  if (currentSource === null) {
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, expectedSource, 'utf8')
  }

  return {
    xml: out,
    changed: manifestChanged || currentSource === null,
    reason: currentSource === null
      ? `Installed ${APPLICATION_CLASS} as WorkManager Configuration.Provider`
      : `${APPLICATION_CLASS} WorkManager Configuration.Provider is already present`,
  }
}

/**
 * The custom Application is compiled by Tauri's app module. A plugin's
 * implementation dependencies are not guaranteed to be exposed to that module,
 * so declare WorkManager directly rather than relying on Gradle transitivity.
 */
async function ensureWorkManagerCompileDependency() {
  let gradlePath = null
  let gradle = ''
  for (const name of GRADLE_FILES) {
    const candidate = path.join(ANDROID, name)
    const contents = await readFile(candidate, 'utf8').catch(() => null)
    if (contents !== null) {
      gradlePath = candidate
      gradle = contents
      break
    }
  }
  if (gradlePath === null) {
    return 'No app build.gradle found; WorkManager compile dependency will be checked when Android is generated.'
  }
  if (gradle.includes(WORK_MANAGER_DEPENDENCY)) {
    return `WorkManager compile dependency already present in ${path.basename(gradlePath)}.`
  }

  const declaration = gradlePath.endsWith('.kts')
    ? `    implementation("${WORK_MANAGER_DEPENDENCY}")`
    : `    implementation '${WORK_MANAGER_DEPENDENCY}'`
  // A Groovy file can contain buildscript { dependencies { … } } before the
  // app's own block. The final dependencies block in Tauri's generated app file
  // is the app compilation classpath; never insert a runtime dependency into the
  // buildscript classpath instead.
  const dependencyBlocks = [...gradle.matchAll(/^\s*dependencies\s*\{/gm)]
  const dependencyBlock = dependencyBlocks.at(-1)
  if (!dependencyBlock || dependencyBlock.index === undefined) {
    throw new Error(`Could not find a dependencies block in ${gradlePath}; cannot compile ${APPLICATION_CLASS}`)
  }
  const insertion = dependencyBlock.index + dependencyBlock[0].length
  const updated = `${gradle.slice(0, insertion)}\n    // Required by TheToolTableApplication's Configuration.Provider.\n${declaration}${gradle.slice(insertion)}`
  await writeFile(gradlePath, updated, 'utf8')
  return `Added WorkManager compile dependency to ${path.basename(gradlePath)}.`
}

async function keepRoomAndWorkManager() {
  const current = await readFile(rulesPath, 'utf8').catch(() => '')
  let updated = current
  let rulesChanged = false
  if (!updated.includes('keep class androidx.work.impl.**')) {
    updated = `${updated.trimEnd()}\n${KEEP_RULES}`
    rulesChanged = true
  } else if (!updated.includes('keep class **.TheToolTableApplication')) {
    // Upgrade projects patched by the earlier launch repair without duplicating
    // its broad WorkManager rules.
    updated = `${updated.trimEnd()}\n-keep class **.TheToolTableApplication { *; }\n`
    rulesChanged = true
  }
  if (rulesChanged) await writeFile(rulesPath, updated, 'utf8')

  // The rules only do anything if the release build actually consumes this file.
  let gradlePath = null
  let gradle = ''
  for (const name of GRADLE_FILES) {
    const candidate = path.join(ANDROID, name)
    const contents = await readFile(candidate, 'utf8').catch(() => null)
    if (contents !== null) {
      gradlePath = candidate
      gradle = contents
      break
    }
  }
  const rulesStatus = rulesChanged ? 'ProGuard rules updated' : 'ProGuard rules already present'
  if (gradlePath === null) {
    return `${rulesStatus}. No build.gradle found; verify it consumes proguard-rules.pro.`
  }
  const file = path.basename(gradlePath)
  const templateCollectsAllProguardFiles = /fileTree\(\s*["']\.\s*["']\s*\)\s*\{[\s\S]*?include\(\s*["']\*\*\/\*\.pro["']\s*\)/.test(gradle)
  if (gradle.includes('proguard-rules.pro') || templateCollectsAllProguardFiles) {
    return `${rulesStatus} (already wired into ${file}).`
  }
  gradle = gradle.replace(
    /((?:is)?[Mm]inifyEnabled\s+(?:true|"true"))(\s*\n(\s*)proguardFiles\s+getDefaultProguardFile\([^)]*\))/g,
    "$1$2, 'proguard-rules.pro'",
  )
  await writeFile(gradlePath, gradle, 'utf8')
  return gradle.includes('proguard-rules.pro')
    ? `${rulesStatus} and wired into the release build (${file}).`
    : `${rulesStatus}. WARNING: could not confirm ${file} consumes them.`
}

let generated = true
try {
  await access(manifestPath)
} catch {
  generated = false
}
if (!generated) {
  // `tauri android init` has not run in this checkout. Nothing to fix, and
  // failing here would break CI steps that run before the Android build.
  console.log('Android project not generated yet — nothing to verify. Run `tauri android init` first.')
  process.exit(0)
}

const original = await readFile(manifestPath, 'utf8')
const detached = detachWorkManagerFromStartup(original)
const provider = await installWorkManagerConfigurationProvider(detached.xml, await applicationId())
if (provider.xml !== original) {
  await writeFile(manifestPath, provider.xml, 'utf8')
}
console.log(detached.changed ? detached.reason : 'WorkManager is already detached from AndroidX Startup.')
console.log(provider.reason)
console.log(await ensureWorkManagerCompileDependency())
console.log(await keepRoomAndWorkManager())
