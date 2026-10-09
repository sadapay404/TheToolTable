import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => existsSync(path.join(ROOT, p))

const ICON_DIR = 'src-tauri/icons/android'
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const LEGACY = ['ic_launcher.png', 'ic_launcher_round.png']
const ADAPTIVE = ['ic_launcher_foreground.png', 'ic_launcher_monochrome.png', 'ic_launcher_background.png']
const BRAND_BACKGROUND = '#EFEBDE'

/**
 * A deliberately small RGBA PNG reader.
 *
 * The icon set has to be checked for transparency and for how far its artwork
 * reaches, which means reading pixels. `sharp` cannot be used: CI installs with
 * `--ignore-scripts`, so its native binary is never built and any test that
 * imports it fails on the runner while passing locally. zlib and the PNG
 * filters are all this needs.
 */
function readPng(file) {
  const buffer = readFileSync(file)
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    `${file} is not a PNG`,
  )
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const bitDepth = buffer[24]
  const colourType = buffer[25]
  assert.equal(bitDepth, 8, `${file} must be 8-bit`)
  assert.equal(colourType, 6, `${file} must be 32-bit RGBA so its alpha is meaningful`)
  assert.equal(buffer[28], 0, `${file} must not be interlaced`)

  const idat = []
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)

  let source = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source]
    source += 1
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const prior = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x]
      const left = x >= 4 ? row[x - 4] : 0
      const up = prior ? prior[x] : 0
      const upLeft = prior && x >= 4 ? prior[x - 4] : 0
      let restored
      if (filter === 0) restored = value
      else if (filter === 1) restored = value + left
      else if (filter === 2) restored = value + up
      else if (filter === 3) restored = value + ((left + up) >> 1)
      else {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        restored = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      }
      row[x] = restored & 0xff
    }
    source += stride
  }

  return {
    width,
    height,
    alphaAt(x, y) { return pixels[y * stride + x * 4 + 3] },
    rgbAt(x, y) { return [pixels[y * stride + x * 4], pixels[y * stride + x * 4 + 1], pixels[y * stride + x * 4 + 2]] },
    /** Bounding box of everything that is not fully transparent. */
    artworkBox() {
      let minX = width; let minY = height; let maxX = -1; let maxY = -1
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (pixels[y * stride + x * 4 + 3] > 8) {
            if (x < minX) minX = x
            if (y < minY) minY = y
            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
          }
        }
      }
      return maxX < 0 ? null : { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 }
    },
  }
}

/* ------------------------------------------------------------- the icon set */

test('every launcher density and layer is committed', () => {
  for (const [density, legacyPx] of Object.entries(DENSITIES)) {
    for (const file of [...LEGACY, ...ADAPTIVE]) {
      assert.ok(exists(`${ICON_DIR}/mipmap-${density}/${file}`), `missing mipmap-${density}/${file}`)
    }
    // Legacy icons are sized for the density; adaptive ones are a 108dp canvas.
    const legacy = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher.png`))
    assert.equal(legacy.width, legacyPx, `mipmap-${density}/ic_launcher.png must be ${legacyPx}px`)
    const adaptive = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher_foreground.png`))
    assert.equal(adaptive.width, Math.round((legacyPx / 48) * 108), `mipmap-${density} adaptive canvas must be 108dp`)
  }
})

test('the adaptive foreground is transparent, so the launcher mask shows through', () => {
  for (const density of Object.keys(DENSITIES)) {
    const png = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher_foreground.png`))
    const corners = [[0, 0], [png.width - 1, 0], [0, png.height - 1], [png.width - 1, png.height - 1]]
    for (const [x, y] of corners) {
      assert.equal(png.alphaAt(x, y), 0,
        `mipmap-${density} adaptive foreground is opaque in the corner (${x},${y}); an opaque layer paints a square over the launcher's mask`)
    }
  }
})

test('the wordmark survives every launcher mask', () => {
  for (const density of Object.keys(DENSITIES)) {
    const png = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher_foreground.png`))
    const box = png.artworkBox()
    assert.ok(box, `mipmap-${density} adaptive foreground has no artwork in it`)
    const ratio = Math.max(box.width, box.height) / png.width
    /* An adaptive icon is 108dp and launchers show the middle 72dp — 66%. The
       artwork has to stay inside that, and because the wordmark is wide its
       corners are further from the centre than its ends, so fitting to 66%
       exactly would clip "TOOL" and "TABLE" on a circular launcher. */
    assert.ok(ratio <= 0.66,
      `mipmap-${density} artwork spans ${(ratio * 100).toFixed(1)}% of the canvas; launchers mask to 66%`)
    // …and it must still be centred, or the mask cuts one side only.
    const offsetX = Math.abs(box.minX + box.width / 2 - png.width / 2)
    const offsetY = Math.abs(box.minY + box.height / 2 - png.height / 2)
    assert.ok(offsetX <= 2 && offsetY <= 2, `mipmap-${density} artwork is off-centre`)
  }
})

test('the adaptive background is the brand colour, not a white hole', () => {
  const [r, g, b] = [0xef, 0xeb, 0xde]
  for (const density of Object.keys(DENSITIES)) {
    const png = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher_background.png`))
    assert.deepEqual(png.rgbAt(0, 0), [r, g, b], `mipmap-${density} background is not the brand cream`)
    assert.equal(png.alphaAt(0, 0), 255, `mipmap-${density} background must be opaque`)
  }
  const colours = read(`${ICON_DIR}/values/ic_launcher_background.xml`)
  assert.match(colours, /<color name="ic_launcher_background">#EFEBDE<\/color>/)
})

test('the monochrome layer is a single colour, so themed icons read cleanly', () => {
  const png = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-xxxhdpi/ic_launcher_monochrome.png`))
  const seen = new Set()
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.alphaAt(x, y) > 200) seen.add(png.rgbAt(x, y).join(','))
    }
  }
  assert.equal(seen.size, 1, `the themed icon must be one flat colour, found ${seen.size}`)
  assert.equal([...seen][0], '0,0,0')
})

test('the legacy icons are shaped, not full-bleed squares', () => {
  for (const [density, px] of Object.entries(DENSITIES)) {
    const square = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher.png`))
    assert.equal(square.alphaAt(0, 0), 0, `mipmap-${density} ic_launcher.png must have rounded corners`)
    assert.ok(square.alphaAt(px / 2, px / 2) > 200, 'the middle of the icon must be painted')
    const round = readPng(path.join(ROOT, `${ICON_DIR}/mipmap-${density}/ic_launcher_round.png`))
    assert.equal(round.alphaAt(0, 0), 0, `mipmap-${density} ic_launcher_round.png must be round`)
  }
})

test('the adaptive icon declares background, foreground and monochrome', () => {
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    const xml = read(`${ICON_DIR}/mipmap-anydpi-v26/${name}`)
    assert.match(xml, /<background android:drawable="@color\/ic_launcher_background"\/>/)
    assert.match(xml, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/)
    assert.match(xml, /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/,
      'without a monochrome layer Android 13+ themed icons fall back to the full-colour one')
  }
})

/* ----------------------------------------------------------- the installer */

test('the installer is wired into the Android build, after android init', () => {
  const workflow = read('.github/workflows/native.yml')
  const initIndex = workflow.indexOf('npx tauri android init')
  const iconIndex = workflow.indexOf('node scripts/install-android-launcher-icons.mjs')
  assert.ok(initIndex > -1 && iconIndex > initIndex,
    'the icons must be installed after `tauri android init` generates the res tree')
  assert.ok(iconIndex < workflow.indexOf('npx tauri android build'),
    'and before Gradle packages the APK')
})

test('the installer patches the generated colour instead of shadowing it', () => {
  /* `tauri android init` writes values/colors.xml holding ic_launcher_background.
     Shipping a second declaration of the same name is a duplicate-resource error
     that only shows up as an AAPT link failure at the end of a 40-minute build. */
  const installer = read('scripts/install-android-launcher-icons.mjs')
  assert.match(installer, /values\/colors\.xml/)
  assert.match(installer, /rm\(path\.join\(RES, 'values\/ic_launcher_background\.xml'\), \{ force: true \}\)/)
})

test('the installer needs no image library, because CI installs without scripts', () => {
  const installer = read('scripts/install-android-launcher-icons.mjs')
  for (const dependency of ['sharp', 'jimp', 'canvas', 'pngjs']) {
    assert.doesNotMatch(installer, new RegExp(`from '${dependency}'|require\\('${dependency}'\\)`),
      `the installer must not import ${dependency}: \`npm ci --ignore-scripts\` leaves it unusable on the runner`)
  }
})

test('the installer fails loudly instead of shipping a blank launcher slot', () => {
  const installer = read('scripts/install-android-launcher-icons.mjs')
  assert.match(installer, /process\.exit\(1\)/)
  assert.match(installer, /not been generated/, 'a missing Android project must be a clear failure')
  assert.match(installer, /was not installed|is not installed|were not installed/)
  assert.match(installer, /android:roundIcon/, 'launchers should be able to use the round variant')
})

test('the icon generator does not read a file it writes', () => {
  /* Deriving the mark from the generated foreground made a second run shrink the
     icon again, one pass at a time. The committed wordmark is the only source. */
  const generator = read('scripts/generate-android-icons.mjs')
  assert.match(generator, /const SOURCE = path\.join\(ROOT, 'src-tauri\/icons\/icon\.png'\)/)
  assert.doesNotMatch(generator, /SOURCE = path\.join\(ROOT, 'src-tauri\/icons\/android\//)
})

/* ------------------------------------------------------------ the workflow */

test('a build runs for every arena branch, not one frozen name', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /branches: \['arena\/\*\*', 'main', 'master'\]/)
  assert.doesNotMatch(workflow, /branches: \['arena\/01a10743-thetooltable'\]/,
    'a single-branch trigger means no build ever runs for later work')
})

test('the draft release tag names the commit its assets came from', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /short="\$\{GITHUB_SHA:0:7\}"/)
  assert.match(workflow, /tag="v1\.2\.0-build-\$\{short\}"/)
  assert.doesNotMatch(workflow, /tag="v1\.2\.0-build-9acfe2f"/,
    'a pinned tag plus --clobber lets every build silently overwrite the same candidate')
})

test('a missing signing key is discovered before the build, not after it', () => {
  const workflow = read('.github/workflows/native.yml')
  const decide = workflow.indexOf('Decide the Android signing key before anything is built')
  const build = workflow.indexOf('Build ARM APK, then reclaim Rust space')
  assert.ok(decide > -1, 'the signing decision must be its own step')
  assert.ok(decide < build, 'and it must run before two hundred megabytes of Android build')
  assert.match(workflow, /ANDROID_KEYSTORE_BASE64/, 'the secret must still be read')
})

test('the build checks its certificate against the published v1.1.1 APK', () => {
  /* The published candidate was signed with a throwaway fallback key, so it
     cannot upgrade a real install. Nothing in the pipeline noticed. */
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /gh release download v1\.1\.1 --pattern 'TheToolTable\.apk'/,
    'the previous release APK is what the fingerprint must be compared with')
  assert.match(workflow, /apksigner" verify --print-certs/)
  assert.match(workflow, /fingerprint_of\(\)/)
  assert.match(workflow, /can upgrade an existing install|\*\*differs from v1\.1\.1\*\*/,
    'both verdicts have to be stated, not just logged')
})

test('an APK signed with the wrong key never gets the plain release name', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /APK_NAME=TheToolTable-fallback-signed\.apk/)
  const upload = workflow.slice(workflow.indexOf('Upload APK to the draft release'))
  assert.match(upload, /ANDROID_RELEASE_APK/)
  assert.match(upload, /refusing to upload a stale asset/,
    'a missing APK must fail rather than re-upload whatever the tag still holds')
})

test('signing material is removed even when a later step fails', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /name: Remove signing material\n\s+if: always\(\)/)
  assert.match(workflow, /rm -f ks\.jks/)
})

test('the release stays a draft', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /--draft/)
  assert.doesNotMatch(workflow, /gh release (publish|edit .*--draft=false)/,
    'nothing here may publish a release')
})