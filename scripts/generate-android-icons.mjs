/**
 * Regenerate the Android launcher icon set in `src-tauri/icons/android/`.
 *
 * This is a design-time tool, not a build step: it needs ImageMagick, and CI
 * never runs it. `scripts/install-android-launcher-icons.mjs` is what copies the
 * committed PNGs into the generated Android project, using nothing but Node
 * built-ins, so a release build never depends on an image library being present.
 *
 * Why the set exists at all
 * ------------------------
 * `tauri android init` derives launcher icons from `icons/icon.png`, which is the
 * full-bleed wordmark. An Android launcher masks that to a circle or a squircle
 * and shaves an adaptive icon down to the centre 66%, so the generated icon
 * loses the ends of "TOOL" and "TABLE". This set is the brand mark laid out for
 * those masks:
 *
 *   - the adaptive foreground is **transparent**, with the wordmark fitted inside
 *     the centre circle that survives every launcher mask (58% of the canvas),
 *   - the adaptive background carries the brand cream instead of white, so the
 *     launcher tile is a deliberate colour rather than a cream square in a hole,
 *   - a monochrome layer gives Android 13+ themed icons the same mark.
 *
 * Usage: node scripts/generate-android-icons.mjs
 */
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT = path.join(ROOT, 'src-tauri/icons/android')

/* Every icon is written as 32-bit RGBA. ImageMagick will otherwise pick a
 * palette or greyscale encoding per file depending on how few colours the
 * artwork happens to use, which is how a launcher icon set ends up mixing five
 * different pixel formats and becomes awkward to verify. */
const png32 = (target) => `PNG32:${target}`

/** Launcher densities: [name, legacy px, adaptive px (108dp)]. */
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]

/** The brand cream, sampled from the shipped wordmark. */
const CREAM = '#EFEBDE'
/* Extracted from the committed wordmark, never from a file this script writes:
   deriving the mark from the generated foreground makes a second run shrink the
   icon again, one pass at a time. */
const SOURCE = path.join(ROOT, 'src-tauri/icons/icon.png')

/**
 * How much of the adaptive canvas the mark may occupy.
 *
 * An adaptive icon is 108dp; launchers show the middle 72dp and mask it. Fitting
 * the wordmark to 66% of the canvas puts its top-left and top-right ends outside
 * the circle a circular launcher shows. The wordmark is 1.79:1, so the corner of
 * its bounding box is further from the centre than its ends: 58% keeps every
 * pixel inside the inscribed circle.
 */
const ADAPTIVE_MARK_RATIO = 0.58
/** The legacy icons are not masked this tightly, so the mark can breathe. */
const LEGACY_MARK_RATIO = 0.78

const tmp = path.join(OUT, '.work')
await mkdir(tmp, { recursive: true })

// The mark itself: everything that is not the cream card, trimmed to its bounds.
const mark = path.join(tmp, 'mark.png')
await run('convert', [SOURCE, '-fuzz', '8%', '-transparent', CREAM, '-trim', '+repage', mark])
const { stdout: markSize } = await run('convert', [mark, '-format', '%w %h', 'info:'])
const [markW, markH] = markSize.trim().split(' ').map(Number)
console.log(`Mark extracted at ${markW}x${markH}.`)

async function renderAdaptive(px, monochrome) {
  const width = Math.round(px * ADAPTIVE_MARK_RATIO)
  const height = Math.round((markH / markW) * width)
  const out = path.join(tmp, `fg-${px}-${monochrome ? 'mono' : 'colour'}.png`)
  const paint = monochrome ? 'black' : null
  const args = [
    mark, '-resize', `${width}x${height}`,
    ...(paint ? ['-fill', paint, '-colorize', '100'] : []),
    '-background', 'none',
    '-gravity', 'center',
    '-extent', `${px}x${px}`,
    png32(out),
  ]
  await run('convert', args)
  return out
}

async function renderLegacy(px, round) {
  const inset = Math.round(px * (round ? 0.042 : 0.083))
  const card = px - inset * 2
  const radius = Math.round(card * (round ? 0.5 : 0.19))
  const width = Math.round(card * LEGACY_MARK_RATIO)
  const height = Math.round((markH / markW) * width)
  const out = path.join(tmp, `legacy-${px}-${round ? 'round' : 'square'}.png`)

  // 1. the cream card, circular for the round variant and a rounded square
  //    otherwise, on a transparent canvas
  const cardPng = path.join(tmp, `card-${px}-${round ? 'round' : 'square'}.png`)
  await run('convert', [
    '-size', `${card}x${card}`, 'xc:none',
    '-fill', CREAM,
    '-draw', round
      ? `circle ${card / 2},${card / 2} ${card / 2},0`
      : `roundrectangle 0,0 ${card - 1},${card - 1} ${radius},${radius}`,
    png32(cardPng),
  ])

  // 2. the wordmark centred on it
  await run('convert', [
    cardPng,
    '(', mark, '-resize', `${width}x${height}`, ')',
    '-gravity', 'center', '-composite',
    '-background', 'none', '-extent', `${px}x${px}`,
    png32(out),
  ])
  return out
}

for (const [name, legacyPx, adaptivePx] of DENSITIES) {
  const dir = path.join(OUT, `mipmap-${name}`)
  await mkdir(dir, { recursive: true })
  const written = []
  for (const [file, src] of [
    ['ic_launcher_foreground.png', await renderAdaptive(adaptivePx, false)],
    ['ic_launcher_monochrome.png', await renderAdaptive(adaptivePx, true)],
    ['ic_launcher_background.png', await renderAdaptive(adaptivePx, false)],
    ['ic_launcher.png', await renderLegacy(legacyPx, false)],
    ['ic_launcher_round.png', await renderLegacy(legacyPx, true)],
  ]) {
    if (file === 'ic_launcher_background.png') {
      // The background layer is a flat fill; the system scales it.
      await run('convert', ['-size', `${adaptivePx}x${adaptivePx}`, `xc:${CREAM}`, png32(src)])
    }
    written.push(await copyInto(src, path.join(dir, file)))
    const { stdout: check } = await run('convert', [path.join(dir, file), '-format', '%w %h %@', 'info:'])
    console.log(`  ${file} -> ${check.trim()}`)
  }
  console.log(`mipmap-${name}: ${written.length} files`)
}

const adaptive = (round) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`
await mkdir(path.join(OUT, 'mipmap-anydpi-v26'), { recursive: true })
await mkdir(path.join(OUT, 'values'), { recursive: true })
await writeFile(path.join(OUT, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive())
await writeFile(path.join(OUT, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive())
await writeFile(path.join(OUT, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="ic_launcher_background">${CREAM}</color>
</resources>
`)
console.log('Adaptive icon XML and brand background colour written.')

async function copyInto(src, dest) {
  const { copyFile, rm } = await import('node:fs/promises')
  await copyFile(src, dest)
  await rm(src, { force: true })
  return dest
}

await (await import('node:fs/promises')).rm(tmp, { recursive: true, force: true })
console.log('Done.')