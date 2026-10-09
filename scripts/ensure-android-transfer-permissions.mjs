/**
 * Make sure the generated Android project can actually run a transfer after the
 * app is backgrounded.
 *
 * Two things are needed and neither is added by `tauri android init`:
 *   - FOREGROUND_SERVICE / FOREGROUND_SERVICE_DATA_SYNC, without which Android 14
 *     refuses to start the dataSync service the background-service plugin uses,
 *   - POST_NOTIFICATIONS, without which Android 13+ silently drops every progress
 *     notification, so a model download would run invisibly and look broken.
 *
 * Run after the Android project exists (it is generated, not committed):
 *   node scripts/ensure-android-transfer-permissions.mjs
 */
import { readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'

const manifest = path.resolve('src-tauri/gen/android/app/src/main/AndroidManifest.xml')
const required = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.POST_NOTIFICATIONS',
]

let present = true
try {
  await access(manifest)
} catch {
  present = false
}
if (!present) {
  // `tauri android init` has not run in this checkout. Nothing to fix, and
  // failing here would break CI steps that run before the Android build.
  console.log('Android project not generated yet — nothing to verify. Run `tauri android init` first.')
  process.exit(0)
}

let xml = await readFile(manifest, 'utf8')
const missing = required.filter((permission) => !new RegExp(`<uses-permission[^>]+android:name=["']${permission}["']`).test(xml))
if (missing.length) {
  const openingTag = xml.match(/<manifest\b[^>]*>/)
  if (!openingTag) throw new Error(`Android manifest has no <manifest> element: ${manifest}`)
  const declarations = [
    '  <!-- User-initiated transfers: Android foreground-service and progress-notification permissions. -->',
    ...missing.map((permission) => `  <uses-permission android:name="${permission}" />`),
  ].join('\n')
  xml = xml.replace(openingTag[0], `${openingTag[0]}\n${declarations}`)
  await writeFile(manifest, xml)
  console.log(`Android transfer permissions added: ${missing.join(', ')}`)
} else {
  console.log(`Android transfer permissions verified (${required.length}).`)
}