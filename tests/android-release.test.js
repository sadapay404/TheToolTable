import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

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
  assert.match(upload, /there is nothing to upload/,
    'a missing APK must be said out loud, not left to look like an upload that never happened')
  assert.doesNotMatch(upload, /gh release download[\s\S]{0,400}gh release upload/,
    'the upload must use the APK this run just built, never one fetched back off the tag')
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
/* ------------------------------ the failure that ate a day of Android builds */

test('a finished APK is banked before the emulator smoke test can veto it', () => {
  /* The APK used to be uploaded *after* the smoke test. Every Android build was
     compiled and signed, then discarded because a UI label had been renamed and
     the emulator waited two minutes for a button that no longer existed — while
     the run reported itself as a packaging failure. */
  const wf = read('.github/workflows/native.yml')
  const upload = wf.indexOf('Upload APK to the draft release')
  const smoke = wf.indexOf('Smoke-test Android launch')
  assert.ok(upload > -1 && smoke > -1, 'both steps must exist')
  assert.ok(upload < smoke, 'the artefact must reach the release before anything can fail')
})

test('the emulator smoke test reports instead of vetoing', () => {
  const wf = read('.github/workflows/native.yml')
  assert.match(wf, /- name: Smoke-test Android launch[\s\S]{0,600}?continue-on-error: true/)
  assert.match(wf, /name: Record the Android smoke-test verdict\n\s+if: always\(\)/,
    'the verdict has to be written down either way, not only when it passes')
})

test('the smoke test reads its labels from the app instead of hardcoding them', () => {
  /* It looked for a "Back to the table" button that the mobile redesign renamed
     to "Go back". Two minutes of timeout later, a good build was thrown away. */
  const smoke = read('scripts/android-runtime-smoke.mjs')
  assert.doesNotMatch(smoke, /'Back to the table'/)
  assert.match(smoke, /tool-back-button\[\^>\]\*aria-label/)
  assert.match(smoke, /LABELS\.back/)
  assert.match(smoke, /id: '\\[a-z0-9\\]\+'|LABELS\.cards\.includes/)
  assert.match(smoke, /Could not find the tool back control/, 'a renamed control must fail fast, not time out')
})

test('the smoke test still covers the two navigation bugs', () => {
  const smoke = read('scripts/android-runtime-smoke.mjs')
  assert.match(smoke, /input', 'keyevent', '4'/, 'Android system back must be exercised')
  assert.match(smoke, /tapLabel\(LABELS\.back\)/, 'the app back control must be exercised too')
  assert.match(smoke, /no header-only black screen/)
  assert.match(smoke, /assertNoAppCrash/)
})

/* ============================================== the APK is verified, not assumed */

test('the Android job verifies the APK before it can be banked', () => {
  const wf = read('.github/workflows/native.yml')
  const step = wf.indexOf('name: Verify the signed APK before it is banked')
  assert.notEqual(step, -1, 'nothing verifies the APK any more')

  const upload = wf.indexOf('name: Upload APK to the draft release')
  const smoke = wf.indexOf('name: Smoke-test Android launch')
  assert.ok(step < upload, 'the APK must be verified before it is uploaded')
  assert.ok(upload < smoke, 'the APK must be banked before the emulator can throw it away')

  /* A signed APK is not automatically a working one. These are the ways this
     project's own build can produce a valid package that is still broken. */
  const body = wf.slice(step, upload)
  for (const check of [
    ['is a readable zip', 'unzip -tq'],
    ['carries its manifest', 'AndroidManifest.xml'],
    ['carries its resources', 'resources.arsc'],
    ['is inspected with aapt2', 'aapt2'],
    ['declares the notification permission', 'POST_NOTIFICATIONS'],
    ['declares the foreground-service permission', 'FOREGROUND_SERVICE'],
    ['verifies its own signature', 'apksigner'],
    ['reports to the job summary', 'GITHUB_STEP_SUMMARY'],
  ]) {
    assert.ok(body.includes(check[1]), `the APK verification does not ${check[0]}`)
  }
  /* Dex is matched as a whole family so a multidex build is not mistaken for a
     package with no bytecode. */
  assert.match(body, /grep -qE '\^classes\[0-9\]\*\\\.dex\$'/, 'dex bytecode is not checked')
})

test('a failing APK verification stops the job rather than warning', () => {
  const wf = read('.github/workflows/native.yml')
  const step = wf.indexOf('name: Verify the signed APK before it is banked')
  const body = wf.slice(step, wf.indexOf('name: Remove signing material', step))
  assert.doesNotMatch(body, /continue-on-error/, 'a broken APK must not be allowed to continue')
  assert.ok(body.includes('set -euo pipefail'), 'the step must stop on the first failure')

  /* Every way this step can say "no" funnels through one helper, and that
     helper both annotates the check-run and exits non-zero. A refusal that
     merely logged would let a broken package reach the draft release. */
  const calls = body.match(/^\s*fail "/gm) || []
  assert.ok(calls.length >= 5, `only ${calls.length} refusal paths are handled`)
  const helper = body.slice(body.indexOf('fail() {'), body.indexOf('}\n', body.indexOf('fail() {')))
  assert.match(helper, /::error file=native\.yml,title=/, 'a refusal must be API-readable, not just a log line')
  assert.match(helper, /exit 1/, 'a refusal must stop the job')

  /* `|| true` is allowed only on the lines that build the job summary. On a
     check it would swallow exactly the failure this step exists to catch. */
  const swallowed = body
    .split('\n')
    .filter((line) => /\|\|\s*true/.test(line) && !/^\s*"?[A-Z_]+="?\$\(/.test(line))
  assert.deepEqual(swallowed, [], 'a check must not be allowed to swallow its failure')

  /* The step must not litter the checkout. A previous version wrote its
     certificate report into the repository root and it got committed. */
  assert.doesNotMatch(body, /> verify\.txt/, 'the step must not write into the checkout')
})

/* ====================================== the verification step, actually executed */

test('the APK verification step itself accepts a good build and refuses every broken one', () => {
  /* String-matching the workflow cannot tell a check that works from a check that
     looks right. This runs the shipped step - read out of native.yml, never
     copied - against a real zip and mock aapt2/apksigner, and asserts both the
     exit code and the reason. Its first run caught three bugs that rejected
     builds which had already compiled, signed and smoked. */
  const harness = path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-apk-step.sh')
  if (!existsSync(harness)) throw new Error('tests/verify-apk-step.sh is missing')

  const out = spawnSync('bash', [harness], { encoding: 'utf8', timeout: 120000 })
  if (out.error || out.status !== 0) {
    throw new Error(`the APK verification step did not behave:\n${out.stdout || ''}${out.stderr || ''}`)
  }
  const passed = Number((out.stdout.match(/(\d+) passed/) || [])[1])
  const failed = Number((out.stdout.match(/(\d+) failed/) || [])[1])
  assert.equal(failed, 0, `the APK verification step misbehaved:\n${out.stdout}`)
  assert.ok(passed >= 10, `only ${passed} cases covered - the harness has stopped testing enough`)
  assert.match(out.stdout, /ok {4}well-formed, signed, fully-iconed APK is accepted/)
})
