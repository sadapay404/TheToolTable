import { access, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const crateName = 'tauri-plugin-background-service'
const kotlinRelative = path.join('android', 'src', 'main', 'kotlin', 'app', 'tauri', 'backgroundservice')

function replaceExactlyOnce(source, oldText, newText, label) {
  if (source.includes(newText)) return source
  const count = source.split(oldText).length - 1
  if (count !== 1) throw new Error(`Expected one unpatched ${label}, found ${count}`)
  return source.replace(oldText, newText)
}

function insertBeforeOnce(source, marker, insertion, label) {
  if (source.includes(insertion)) return source
  const count = source.split(marker).length - 1
  if (count !== 1) throw new Error(`Expected one insertion point for ${label}, found ${count}`)
  return source.replace(marker, `${insertion}${marker}`)
}

const failureFactory = `        fun failure(code: String, message: String): HeadlessBridgeResult {
            val json = JSONObject().apply {
                put("ok", false)
                put("state", "failed")
                put("code", code)
                put("message", message)
                put("recoverable", true)
            }.toString()
            return HeadlessBridgeResult(false, "failed", message, true, json)
        }`

const lifecycleOnlyFactory = `        fun lifecycleOnly(message: String): HeadlessBridgeResult {
            val json = JSONObject().apply {
                put("ok", true)
                put("state", LIFECYCLE_ONLY_STATE)
                put("message", message)
                put("recoverable", true)
            }.toString()
            return HeadlessBridgeResult(true, LIFECYCLE_ONLY_STATE, message, true, json)
        }

        const val LIFECYCLE_ONLY_STATE = "lifecycle_only"`

export function patchAndroidBackgroundServiceSources({ headlessBridge, lifecycleService, backgroundServicePlugin }) {
  let headless = replaceExactlyOnce(
    headlessBridge,
    `${failureFactory}\n    }\n}\n\nobject HeadlessBridge`,
    `${failureFactory}\n\n${lifecycleOnlyFactory}\n    }\n}\n\nobject HeadlessBridge`,
    'HeadlessBridgeResult failure factory',
  )

  const oldStart = `    fun start(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { return HeadlessBridgeResult.failure("native_library_load_failed", it) }`
  const newStart = `    fun start(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { loadError ->
            // This app starts the service from its live Tauri process and does not
            // provide the plugin's optional headless JNI core. Keep the FGS itself alive.
            return if (reason == LifecycleService.START_REASON_MANUAL) {
                lifecycleOnly("start", reason, loadError)
            } else {
                HeadlessBridgeResult.failure("native_library_load_failed", loadError)
            }
        }`
  headless = replaceExactlyOnce(headless, oldStart, newStart, 'manual HeadlessBridge.start path')

  const oldStop = `    fun stop(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { return HeadlessBridgeResult.failure("native_library_load_failed", it) }`
  const newStop = `    fun stop(context: Context, reason: String): HeadlessBridgeResult {
        ensureLoaded()?.let { return lifecycleOnly("stop", reason, it) }`
  headless = replaceExactlyOnce(headless, oldStop, newStop, 'HeadlessBridge.stop path')

  const ensureLoadedMarker = '    private fun ensureLoaded(): String? {'
  const lifecycleOnlyHelper = `    private fun lifecycleOnly(op: String, reason: String, loadError: String): HeadlessBridgeResult {
        android.util.Log.i(
            "HeadlessBridge",
            "$op(reason=$reason): native core '$nativeLibName' not loaded ($loadError); lifecycle-only",
        )
        return HeadlessBridgeResult.lifecycleOnly("Native core '$nativeLibName' not loaded: $loadError")
    }

`
  headless = insertBeforeOnce(headless, ensureLoadedMarker, lifecycleOnlyHelper, 'HeadlessBridge lifecycle-only helper')

  const oldStartReason = '        const val EXTRA_START_REASON = "startReason"'
  const newStartReason = `${oldStartReason}\n        // Reason used only when a live Tauri window starts its own FGS.\n        const val START_REASON_MANUAL = "manual_start"`
  const service = replaceExactlyOnce(lifecycleService, oldStartReason, newStartReason, 'manual lifecycle start-reason constant')

  const oldManualExtra = 'putExtra(LifecycleService.EXTRA_START_REASON, "manual_start")'
  const newManualExtra = 'putExtra(LifecycleService.EXTRA_START_REASON, LifecycleService.START_REASON_MANUAL)'
  const plugin = replaceExactlyOnce(backgroundServicePlugin, oldManualExtra, newManualExtra, 'manual start-reason use')

  return {
    headlessBridge: headless,
    lifecycleService: service,
    backgroundServicePlugin: plugin,
    changed: headless !== headlessBridge || service !== lifecycleService || plugin !== backgroundServicePlugin,
  }
}

async function locateCrateSource(cargoHome, repositoryRoot) {
  const lockPath = path.join(repositoryRoot, 'src-tauri', 'Cargo.lock')
  const lock = await readFile(lockPath, 'utf8').catch(() => '')
  const packageBlock = lock.match(new RegExp(`name = "${crateName}"\\nversion = "([^"]+)"`))
  const lockedVersion = packageBlock?.[1]
  if (!lockedVersion) throw new Error(`Could not read ${crateName}'s version from ${lockPath}; run cargo fetch first.`)

  const registrySource = path.join(cargoHome, 'registry', 'src')
  const indexes = await readdir(registrySource, { withFileTypes: true }).catch(() => [])
  for (const index of indexes) {
    if (!index.isDirectory()) continue
    const sourceRoot = path.join(registrySource, index.name)
    const packageDir = path.join(sourceRoot, `${crateName}-${lockedVersion}`)
    try {
      await access(path.join(packageDir, kotlinRelative, 'HeadlessBridge.kt'))
      return packageDir
    } catch { /* try the next Cargo registry index */ }
  }
  throw new Error(`Could not find ${crateName} ${lockedVersion} Android Kotlin sources under ${registrySource}.`)
}

export async function patchInstalledBackgroundService({ cargoHome = process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'), repositoryRoot = process.cwd() } = {}) {
  const packageDir = await locateCrateSource(cargoHome, repositoryRoot)
  const sourceDir = path.join(packageDir, kotlinRelative)
  const filePaths = {
    headlessBridge: path.join(sourceDir, 'HeadlessBridge.kt'),
    lifecycleService: path.join(sourceDir, 'LifecycleService.kt'),
    backgroundServicePlugin: path.join(sourceDir, 'BackgroundServicePlugin.kt'),
  }
  const original = Object.fromEntries(await Promise.all(Object.entries(filePaths).map(async ([key, file]) => [key, await readFile(file, 'utf8')])))
  const patched = patchAndroidBackgroundServiceSources(original)
  if (patched.changed) {
    await Promise.all(Object.entries(filePaths).map(([key, file]) => patched[key] === original[key] ? null : writeFile(file, patched[key])))
  }
  return { packageDir, changed: patched.changed }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  patchInstalledBackgroundService().then(({ packageDir, changed }) => {
    console.log(`${changed ? 'Patched' : 'Already patched'} ${crateName} Android lifecycle-only FGS handling: ${packageDir}`)
  }).catch((error) => {
    console.error(`Android background-service patch failed: ${error.stack || error}`)
    process.exitCode = 1
  })
}
