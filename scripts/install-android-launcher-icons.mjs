/**
 * Install TheToolTable's own launcher icons into the generated Android project.
 *
 * Why this step exists
 * --------------------
 * `tauri android init` derives the launcher icons from `icons/icon.png`, which is
 * the full-bleed wordmark. A launcher masks that to a circle or a squircle and
 * shaves an adaptive icon to the centre 66%, so the ends of "TOOL" and "TABLE"
 * are cut off — which is exactly the "the APK shows the wrong icon" complaint.
 *
 * The correct set is committed at `src-tauri/icons/android/` (regenerate it with
 * `node scripts/generate-android-icons.mjs`, which needs ImageMagick and is a
 * design-time tool only). This installer is the part CI runs, and it uses nothing
 * but Node built-ins: `npm ci --ignore-scripts` means no native image library is
 * available on the runner, so an image dependency here would break the build.
 *
 * Run it after `tauri android init` and before `tauri android build`.
 */
import { readFile, writeFile, readdir, cp, rm, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const SOURCE = path.join(ROOT, 'src-tauri/icons/android')
const RES = path.join(ROOT, 'src-tauri/gen/android/app/src/main/res')
const MANIFEST = path.join(ROOT, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml')

const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']
const LEGACY = ['ic_launcher.png', 'ic_launcher_round.png']
const ADAPTIVE = ['ic_launcher_foreground.png', 'ic_launcher_monochrome.png', 'ic_launcher_background.png']

/** The brand cream the adaptive icon is built on. */
const BRAND_BACKGROUND = '#EFEBDE'

function fail(message) {
  console.error(`::error title=Android launcher icons::${message}`)
  process.exit(1)
}

if (!existsSync(RES)) {
  fail('The Android project has not been generated. Run `npx tauri android init` first.')
}
if (!existsSync(SOURCE)) fail(`The committed icon set is missing: ${SOURCE}`)

/* ------------------------------------------------------------------ colours --
 * `tauri android init` writes `values/colors.xml` holding ic_launcher_background.
 * Shipping a second `values/ic_launcher_background.xml` declaring the same name
 * is a duplicate-resource error that fails the build at link time, so the
 * generated file is patched in place rather than shadowed.
 */
const colorsFile = path.join(RES, 'values/colors.xml')
let colors = existsSync(colorsFile) ? await readFile(colorsFile, 'utf8') : null
if (colors === null) {
  colors = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n`
}
const declaration = `<color name="ic_launcher_background">${BRAND_BACKGROUND}</color>`
if (/<color\s+name="ic_launcher_background"[^>]*>[\s\S]*?<\/color>/.test(colors)) {
  colors = colors.replace(/<color\s+name="ic_launcher_background"[^>]*>[\s\S]*?<\/color>/, declaration)
} else {
  colors = colors.replace('</resources>', `  ${declaration}\n</resources>`)
}
await mkdir(path.dirname(colorsFile), { recursive: true })
await writeFile(colorsFile, colors)
await rm(path.join(RES, 'values/ic_launcher_background.xml'), { force: true })

/* ------------------------------------------------------------------- images */
const missing = []
for (const density of DENSITIES) {
  for (const file of [...LEGACY, ...ADAPTIVE]) {
    const from = path.join(SOURCE, `mipmap-${density}`, file)
    try {
      await stat(from)
      await cp(from, path.join(RES, `mipmap-${density}`, file))
    } catch {
      missing.push(`mipmap-${density}/${file}`)
    }
  }
}
if (missing.length) fail(`Committed icons are missing: ${missing.join(', ')}`)

/* ------------------------------------------------------- adaptive manifests */
const adaptiveXml = () => `<?xml version="1.0" encoding="utf-8"?>
<!-- TheToolTable launcher icon. The foreground is transparent and carries the
     wordmark inside the centre circle every launcher mask preserves; the
     background is the brand cream; the monochrome layer drives Android 13+
     themed icons. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const dir = path.join(RES, 'mipmap-anydpi-v26')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), adaptiveXml(name))
}

/* ----------------------------------------------------------------- manifest --
 * The generated manifest points at @mipmap/ic_launcher, which is now the brand
 * icon. Adding roundIcon lets launchers that ask for it use the circular variant
 * instead of masking the square one themselves.
 */
if (existsSync(MANIFEST)) {
  let manifest = await readFile(MANIFEST, 'utf8')
  if (!/android:roundIcon=/.test(manifest) && /android:icon="@mipmap\/ic_launcher"/.test(manifest)) {
    manifest = manifest.replace(
      'android:icon="@mipmap/ic_launcher"',
      'android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"',
    )
    await writeFile(MANIFEST, manifest)
  }
}

/* ------------------------------------------------------------------- verify --
 * A silently missing density is how an APK ships with a blank launcher slot, so
 * the install is checked rather than assumed.
 */
const problems = []
for (const density of DENSITIES) {
  for (const file of [...LEGACY, ...ADAPTIVE]) {
    const target = path.join(RES, `mipmap-${density}`, file)
    try {
      const info = await stat(target)
      if (info.size < 64) problems.push(`mipmap-${density}/${file} is ${info.size} bytes`)
    } catch {
      problems.push(`mipmap-${density}/${file} was not installed`)
    }
  }
}
const adaptiveInstalled = await readFile(path.join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), 'utf8')
if (!adaptiveInstalled.includes('ic_launcher_monochrome')) problems.push('the adaptive icon has no monochrome layer')
if (!colors.includes(BRAND_BACKGROUND)) problems.push('the adaptive background colour was not applied')
if (problems.length) fail(`Launcher icon install is incomplete: ${problems.join('; ')}`)

const installed = (await readdir(path.join(RES, 'mipmap-xxxhdpi'))).filter((f) => f.startsWith('ic_launcher')).length
const summary = [
  '## Android launcher icon installed',
  '',
  `- Set: TheToolTable's own brand launcher icon (\`src-tauri/icons/android/\`)`,
  `- Densities: ${DENSITIES.length} (${DENSITIES.join(', ')})`,
  `- xxxhdpi entries: ${installed} (legacy, round, foreground, monochrome, background)`,
  `- Adaptive background: \`${BRAND_BACKGROUND}\``,
  '- Monochrome layer present, so Android 13+ themed icons show the mark.',
  '- `android:roundIcon` set, so launchers can use the circular variant.',
].join('\n')
console.log(summary)
const summaryFile = process.env.GITHUB_STEP_SUMMARY
if (summaryFile) await writeFile(summaryFile, `${summary}\n`, { flag: 'a' })