/*
 * Adds the Android permissions the web UI needs to the *generated* Tauri project.
 *
 * Why: `src-tauri/gen/` is produced by `tauri android init` on a clean CI checkout, so hand-editing
 * it never survives. This script runs right after `init` and is idempotent.
 *
 *   CAMERA / RECORD_AUDIO — QR Studio's live scanner uses getUserMedia (camera + optional mic).
 *   INTERNET              — Tool 04 (engine URL) and Tool 09 (live rates) are the only network users.
 *
 * Usage: node scripts/android-permissions.mjs [path/to/AndroidManifest.xml]
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WANTED = [
  ['android.permission.CAMERA', 'QR Studio: scan a code with the camera'],
  ['android.permission.RECORD_AUDIO', 'QR Studio: scanning while a video plays (audio track)'],
  ['android.permission.INTERNET', 'Tool 04 download engine + Tool 09 live rates'],
]

function findManifest() {
  if (process.argv[2]) return process.argv[2]
  const base = 'src-tauri/gen/android/app/src/main'
  if (existsSync(join(base, 'AndroidManifest.xml'))) return join(base, 'AndroidManifest.xml')
  return null
}

const file = findManifest()
if (!file) {
  console.error(`No AndroidManifest.xml found (looked in src-tauri/gen/android/app/src/main). Run \`npx tauri android init\` first.`)
  console.error('Generated project:', existsSync('src-tauri/gen/android') ? readdirSync('src-tauri/gen/android').join(', ') : 'missing')
  process.exit(1)
}

let xml = readFileSync(file, 'utf8')
const added = []
for (const [perm, why] of WANTED) {
  if (xml.includes(`android:name="${perm}"`)) continue
  const tag = `  <!-- ${why} -->\n  <uses-permission android:name="${perm}" />\n`
  if (xml.includes('<application')) xml = xml.replace(/(\s*)<application/, `\n${tag}$1<application`)
  else xml = xml.replace(/<\/manifest>/, `${tag}</manifest>`)
  added.push(perm)
}

// Camera + mic must also be declared as hardware features we can live without, otherwise
// Google Play filters the APK off tablets without a camera.
if (!xml.includes('android.hardware.camera') && xml.includes('<application')) {
  xml = xml.replace(/(\s*)<application/, `\n  <uses-feature android:name="android.hardware.camera" android:required="false" />\n  <uses-feature android:name="android.hardware.microphone" android:required="false" />\n$1<application`)
  added.push('uses-feature camera/mic (optional)')
}

if (added.length) { writeFileSync(file, xml); console.log(`Patched ${file}: added ${added.join(', ')}`) }
else console.log(`${file} already has every permission we need.`)
