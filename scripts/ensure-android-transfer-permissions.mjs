import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const manifest = path.resolve('src-tauri/gen/android/app/src/main/AndroidManifest.xml')
const required = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.POST_NOTIFICATIONS',
]

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
}
console.log(`Android transfer permissions verified (${required.length}).`)
