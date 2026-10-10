/**
 * Make the Android app survive its own launch.
 *
 * On a real phone the app died immediately with:
 *
 *   E AndroidRuntime: FATAL EXCEPTION: main
 *   E AndroidRuntime: Process: app.thetooltable.mubashir
 *   E AndroidRuntime: java.lang.RuntimeException: Unable to get provider
 *     androidx.startup.InitializationProvider: Failed to create an instance of
 *     class androidx.work.impl.WorkDatabase.canonicalName
 *     at android.app.ActivityThread.handleBindApplication
 *
 * WorkManager is initialised by androidx.startup inside `InitializationProvider`,
 * which Android runs before a single line of this app's JavaScript executes. It
 * builds a Room database to do it. If that database cannot be instantiated the
 * exception propagates out of `handleBindApplication` and the process is killed -
 * so a background-download dependency decides whether the app opens at all.
 *
 * Two independent changes, because one of them failing should not be fatal:
 *
 *   1. R8 is stripping or mangling Room's generated `*_Impl` classes, which Room
 *      instantiates by name. Keep them. This is the actual repair.
 *   2. Stop WorkManager from being initialised during `handleBindApplication` at
 *      all. If its database is still unhappy for some reason we have not
 *      predicted, the app now opens anyway and the failure is reported as an
 *      ordinary background-transfer error instead of killing the process.
 *
 * Run after the Android project exists (it is generated, not committed):
 *   node scripts/ensure-android-launch-survives.mjs
 */
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'path'

const ANDROID = path.resolve('src-tauri/gen/android/app')
const manifestPath = path.join(ANDROID, 'src/main/AndroidManifest.xml')
const rulesPath = path.join(ANDROID, 'proguard-rules.pro')

/** The build script may be Groovy or Kotlin DSL, and may be absent entirely. */
const GRADLE_FILES = ['build.gradle.kts', 'build.gradle']

const WORK_INITIALIZER = 'androidx.work.WorkManagerInitializer'

const KEEP_RULES = `
# --- TheToolTable: keep AndroidX WorkManager's Room database -------------
# WorkManager builds its database during Application startup, before any of this
# app's code runs, and Room instantiates the generated \`WorkDatabase_Impl\` by
# name. R8 cannot see that reference, so on a real device the class was stripped
# and the app died in handleBindApplication with no way to catch it.
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.room.RoomDatabase_Impl { *; }
-keep class androidx.sqlite.** { *; }
-keep class androidx.work.impl.** { *; }
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**
-dontwarn androidx.sqlite.**
`

/**
 * Remove WorkManager from the startup provider, if it has not been already.
 *
 * The `<meta-data>` this has to cancel out is contributed by the androidx.startup
 * library's own manifest and merged in at build time, so it is absent from the
 * generated one. Looking for `androidx.work.WorkManagerInitializer` to decide
 * whether the patch is needed would therefore match nothing and silently skip the
 * whole repair. The reliable marker is our own `tools:node="remove"` directive.
 */
async function detachWorkManagerFromStartup(xml) {
  if (xml.includes(WORK_INITIALIZER) && xml.includes('tools:node="remove"')) {
    return { xml, changed: false, reason: 'WorkManager is already detached from Application startup.' }
  }

  const application = xml.match(/<application\b[^>]*>/)
  if (!application) throw new Error('Android manifest has no <application> element')

  // `tools:node` needs the tools namespace on <manifest>.
  let out = xml
  if (!/xmlns:tools=/.test(out.match(/<manifest\b[^>]*>/)[0])) {
    out = out.replace(
      /<manifest\b[^>]*>/,
      (tag) => tag.replace(/(>|\/>)$/, ' xmlns:tools="http://schemas.android.com/tools"$1'),
    )
  }

  const provider = `  <!-- WorkManager is not needed to draw the first frame, and a
       failure here kills the process before the app starts. It is initialised on
       first use by the background-transfer plugin instead. -->
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
  return {
    xml: out.replace(application[0], `${application[0]}\n${provider}`),
    changed: true,
    reason: 'WorkManager detached from Application startup',
  }
}

async function keepRoomAndWorkManager() {
  const current = await readFile(rulesPath, 'utf8').catch(() => '')
  if (current.includes('keep class androidx.work.impl.**')) return 'ProGuard rules already present.'

  await writeFile(rulesPath, `${current.trimEnd()}\n${KEEP_RULES}`, 'utf8')

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
  if (gradlePath === null) {
    return 'ProGuard rules added. No build.gradle found; verify it consumes proguard-rules.pro.'
  }
  const file = path.basename(gradlePath)
  if (gradle.includes('proguard-rules.pro')) {
    return `ProGuard rules added (already wired into ${file}).`
  }
  gradle = gradle.replace(
    /((?:is)?[Mm]inifyEnabled\s+(?:true|"true"))(\s*\n(\s*)proguardFiles\s+getDefaultProguardFile\([^)]*\))/g,
    "$1$2, 'proguard-rules.pro'",
  )
  await writeFile(gradlePath, gradle, 'utf8')
  return gradle.includes('proguard-rules.pro')
    ? `ProGuard rules added and wired into the release build (${file}).`
    : `ProGuard rules added. WARNING: could not confirm ${file} consumes them.`
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
const detached = await detachWorkManagerFromStartup(original)
if (detached.changed) {
  await writeFile(manifestPath, detached.xml, 'utf8')
  console.log(detached.reason)
} else {
  console.log('WorkManager is already detached from Application startup.')
}
console.log(await keepRoomAndWorkManager())