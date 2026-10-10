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
const packageJson = JSON.parse(read('package.json'))

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

test('the Android runner installs the compile SDK required by Tauri and the patched download plugin', () => {
  const workflow = read('.github/workflows/native.yml')
  const pluginPatch = read('scripts/patch-android-download-plugin.mjs')
  assert.match(workflow, /platforms;android-37/,
    'CI must not rely on an incidental preinstalled SDK when the generated app compiles against API 37')
  assert.match(pluginPatch, /compileSdk = 37/)
})

test('a build runs for every arena branch, not one frozen name', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /branches: \['arena\/\*\*', 'main', 'master'\]/)
  assert.doesNotMatch(workflow, /branches: \['arena\/01a10743-thetooltable'\]/,
    'a single-branch trigger means no build ever runs for later work')
})

test('the draft release tag names the app version and the commit its assets came from', () => {
  const workflow = read('.github/workflows/native.yml')
  assert.match(workflow, /uses: actions\/checkout@v4/,
    'the release job must read version metadata from the same source it builds')
  assert.ok(workflow.includes('app_version="$(node -p "require(\'./package.json\').version")"'),
    'the candidate version must come from package.json, not a stale workflow literal')
  assert.match(workflow, /short="\$\{GITHUB_SHA:0:7\}"/)
  assert.match(workflow, /tag="v\$\{app_version\}-build-\$\{short\}"/)
  assert.match(workflow, /release_version=\$app_version/)
  assert.ok(!/tag="v\d+\.\d+\.\d+-build-/.test(workflow),
    'a pinned tag plus --clobber lets every build silently overwrite the wrong candidate')
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/)
})

test('the workflow shell accepts the version declared by the app', () => {
  const workflow = read('.github/workflows/native.yml')
  const validation = workflow.match(/          app_version=.*?\n          if ! .*?\n            echo .*?\n            exit 1\n          fi/m)?.[0]
  assert.ok(validation, 'the workflow must retain its version-validation shell block')
  const result = spawnSync('bash', ['-c', `set -euo pipefail\n${validation}\nprintf '%s\\n' "$app_version"`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), packageJson.version)
})

test('the web package, native package and Tauri bundle share one release version', () => {
  const cargo = read('src-tauri/Cargo.toml')
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'))
  assert.match(cargo, new RegExp(`^version = "${packageJson.version.replace(/\./g, '\\.')}"$`, 'm'))
  assert.equal(tauri.version, packageJson.version)
})

test('README does not direct Android users to an APK that was withdrawn after a device crash', () => {
  const readme = read('README.md')
  assert.doesNotMatch(readme, /releases\/latest\/download\/TheToolTable\.apk/)
  assert.doesNotMatch(readme, /releases\/download\/v1\.1\.1\/TheToolTable\.apk/)
  assert.match(readme, /temporarily paused/)
  assert.match(readme, /v1\.2\.2/)
  assert.match(readme, /WorkManager\/download-plugin startup/)
})

test('a missing signing key is discovered before the build, not after it', () => {
  const workflow = read('.github/workflows/native.yml')
  const decide = workflow.indexOf('Decide the Android signing key before anything is built')
  const build = workflow.indexOf('name: Build the universal APK carrying arm64-v8a and x86_64')
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
  const bank = workflow.slice(workflow.indexOf('name: Bank the verified APK'))
  assert.match(bank, /cp "\$APK_NAME" TheToolTable\.apk/,
    'the banked file is the one this run signed and verified, copied rather than re-fetched')
  assert.doesNotMatch(bank, /gh release download[\s\S]{0,400}gh release upload/,
    'the upload must use the APK this run just built, never one fetched back off the tag')
  // Banked before it is copied to the device job, so the device job's fate
  // cannot decide whether the file is published.
  assert.ok(workflow.indexOf('name: Bank the verified APK') < workflow.indexOf('name: Hand the signed APK to the device job'),
    'the APK is banked before the device job can possibly fail')
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
/* ------------------- the failure that shipped an APK no ARM phone could run */

test('the release is banked from the verified build, and the emulator only advises', () => {
  /* This design went wrong three times, and the third time it cost somebody an
     install they were waiting on.

     First the APK was uploaded *after* the smoke test, so a renamed UI label
     discarded builds that had already compiled and signed. It was moved
     *before* the test, with `continue-on-error` so nothing could veto it - which
     was worse, because the emulator then ran against a different APK than the
     one that shipped. It was then made a hard precondition again, so the file
     that is banked is the file that was driven. That was correct in principle
     and useless in practice: the emulator is infrastructure, and when it failed
     - `/usr/bin/sh failed with exit code 2`, two minutes, no readable log -
     nobody received the fix that had already been built, signed and verified.

     So the emulator is now a second opinion rather than a veto. What stands in
     front of it is not a hope but a check: the verifier reads the merged
     manifest out of the package and refuses anything that starts WorkManager
     before the first frame, which is the crash this pipeline was built to
     catch. The emulator can still fail, can still report, and its verdict is
     still written down - it just no longer decides whether people get the app. */
  const wf = read('.github/workflows/native.yml')
  const build = wf.slice(wf.indexOf('\n  android:'), wf.indexOf('\n  android-device:'))
  const device = wf.slice(wf.indexOf('\n  android-device:'))

  // Banked by the job that built and verified it.
  const bankStep = build.indexOf('name: Bank the verified APK')
  const verifyStep = build.indexOf('name: Verify the signed APK before it is banked')
  assert.ok(bankStep > verifyStep,
    'the APK is banked only after the verifier has passed it')
  assert.match(build, /gh release upload "\$RELEASE_TAG" TheToolTable\.apk/,
    'the signed, verified APK goes onto the release the user downloads from')

  // Still no artifact transport: that storage is quota-metered and ran out.
  assert.doesNotMatch(build, /actions\/upload-artifact/)
  assert.match(build, /candidate-android-\$\{GITHUB_SHA\}/,
    'the device job still gets the same bytes over the throwaway tag')

  // The emulator reports, and cannot veto.
  const smoke = device.indexOf('id: smoke')
  assert.match(device, /- name: Boot an x86_64 emulator and run the app\n\s+id: smoke\n\s+continue-on-error: true/,
    'a broken emulator must not be able to withhold the app from people waiting on it')
  assert.match(device, /::warning title=Android device test failed/,
    'the failure is still announced - demoted from an error, not silenced')
  assert.match(device, /name: Report what the device test made of that exact APK/,
    'the verdict is recorded even when it is not obeyed')
  assert.match(device, /Banked independently of this result/,
    'the summary must say plainly that the result did not gate the release')
  assert.ok(smoke > -1)

  /* The emulator must still be a real check, run against the shipped bytes.
     Demoting it to advisory is only honest while it is genuinely testing
     something - these keep it from decaying into decoration. */
  assert.match(device, /runs-on: ubuntu-latest/,
    'an emulator needs KVM, which hosted ARM64 runners do not have')
  assert.match(device, /arch: x86_64/, 'the emulator arch must match the library the APK carries')
  assert.match(device, /99-kvm4all\.rules/, 'without /dev/kvm access the emulator cannot boot in time')
  assert.match(device, /android-device-input\.apk/, 'it tests the exact file that is published')
  assert.match(wf, /--target aarch64 --target x86_64/,
    'the package must carry both libraries for a phone and for CI')
  assert.match(wf, /--target aarch64 --target x86_64(?!.*--target armv7)/,
    'armv7 must stay out: a 32-bit package installs on one device and dies on another')

  const verify = wf.slice(wf.indexOf('name: Verify the signed APK before it is banked'))
  assert.match(verify, /native-code:\.\*arm64-v8a/, 'a phone needs the arm64 ABI')
  assert.match(verify, /native-code:\.\*x86_64/, 'the device job needs the x86_64 ABI')
  assert.match(verify, /not an AArch64 ELF/,
    'nothing in an x86_64 emulator loads the ARM library, so its bytes have to be checked directly')
  assert.match(verify, /expected b7/)

  /* The manifest has to prove both halves of the workaround. Badging cannot see
     either one: an APK can have correct ABIs, icons and a valid signature yet
     either construct Room before its first frame or abort later because its
     download plugin has no WorkManager configuration. */
  assert.match(verify, /dump xmltree --file AndroidManifest\.xml/,
    'the launch path can only be judged from the merged manifest, not from badging')
  assert.match(verify, /WorkManagerInitializer/,
    'the crash starts when WorkManager is initialised before the first frame')
  assert.match(verify, /TheToolTableApplication/,
    'removing the startup initializer also requires the custom Application provider')
  assert.match(verify, /WORK_MANAGER_APPLICATION_DESCRIPTOR/,
    'a manifest declaration alone is insufficient; the custom Application must be compiled into DEX')
  assert.match(verify, /compiled Application class is missing from DEX/)
  assert.match(verify, /could not read the merged AndroidManifest\.xml/,
    'if the manifest cannot be read the step must refuse rather than assume the launch path is clean')
  // A herestring, not a pipe: this step may never SIGPIPE its producers.
  assert.match(verify, /grep -q "WorkManagerInitializer" <<< "\$MANIFEST_TREE"/,
    'piping into grep -q is what made this step reject good APKs at random')
  assert.match(verify, /grep -qF "\$WORK_MANAGER_APPLICATION" <<< "\$MANIFEST_TREE"/,
    'the APK must declare the Configuration.Provider Application after removing startup initialization')
})

test('the device job still cleans up and still leaves the crash log behind', () => {
  /* The emulator lost its veto - see the test on banking. It has not lost its
     voice: a failing run still dumps logcat, still announces itself, and still
     removes the throwaway tag it created. A demoted check that also became a
     silent one would be worse than either. */
  const wf = read('.github/workflows/native.yml')
  const device = wf.slice(wf.indexOf('\n  android-device:'))
  assert.match(device, /adb logcat -d/,
    'a failure has to leave the crash log behind, or it is a mystery again')
  assert.match(device, /android-device-input\.apk/, 'it tests the exact file that is published')
  assert.match(device, /name: Delete the temporary candidate release\n\s+if: always\(\)/,
    'the throwaway tag must be cleaned up whether the device passed or not')
  assert.match(device, /name: Report what the device test made of that exact APK\n\s+if: always\(\)/,
    'the verdict is recorded even when the run failed before reaching it')
})

test('the device step reports why it failed instead of dying with an exit code', () => {
  /* This step ran for two minutes and died with `/usr/bin/sh failed with exit
     code 2` and nothing else. That is dash's signature for a redirection it
     could not perform, and the only redirect in play was the action's own
     `printf ... >> <avd>/config.ini`, which `ram-size` and `disk-size` are the
     sole triggers for. Worse, the failure path used to `echo >> $GITHUB_STEP_SUMMARY`
     inline, so when a redirect did fail it took the diagnostics with it: the one
     time the log was most needed was the time it could not be written.

     So the report is assembled in a plain file and appended afterwards, and the
     failure is announced with an annotation, which is the part of a CI run that
     is actually visible. */
  const wf = read('.github/workflows/native.yml')
  const device = wf.slice(wf.indexOf('\n  android-device:'))

  assert.doesNotMatch(device, /ram-size:|disk-size:/,
    'these two are the only inputs that trigger the action\'s config.ini redirect, and a failed redirect exits sh with 2')
  assert.match(device, /smoke test exit status/,
    'the real status has to be reported rather than collapsed into the action\'s exit code')
  assert.match(device, /::warning title=Android device test failed/,
    'an annotation is what a reader sees; a log nobody can open is not a report')
  assert.match(device, /adb logcat -d -t 4000 > "\$LOG"/,
    'logcat goes to a file first, because a failing redirect is what destroyed the last report')
  assert.match(device, /\|\| echo "\(adb logcat failed too\)"/,
    'a missing adb must still produce a readable summary rather than abort the block')

  // The pass path has to report too, or a silent green run proves nothing.
  assert.match(device, /Android device test passed/)
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
  assert.match(smoke, /PluginInitialization\("download"/,
    'the smoke test must recognize the native download-plugin abort reported by a physical device')
  assert.match(smoke, /Abort message:/,
    'Rust panic=abort tombstones must count as crashes even without FATAL EXCEPTION')
  assert.match(smoke, /assertStableForeground/,
    'a splash frame is not a pass; the process must survive plugin initialization')
  assert.match(smoke, /PLUGIN_INITIALIZATION_SETTLE_MS = 5_000/,
    'launch must remain under observation after the first visible frame')
})

/* ============================================== the APK is verified, not assumed */

test('the Android job verifies the APK before it can be banked', () => {
  const wf = read('.github/workflows/native.yml')
  const step = wf.indexOf('name: Verify the signed APK before it is banked')
  assert.notEqual(step, -1, 'nothing verifies the APK any more')

  const handoff = wf.indexOf('name: Hand the signed APK to the device job')
  assert.notEqual(handoff, -1, 'nothing hands the APK to the device job any more')
  assert.ok(step < handoff, 'the APK must be verified before it can be handed on')

  /* A signed APK is not automatically a working one. These are the ways this
     project's own build can produce a valid package that is still broken. */
  const body = wf.slice(step, handoff)
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
  assert.match(body, /grep -cE '\^classes\[0-9\]\*\\\.dex\$'/, 'dex bytecode is not checked')
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

test('the two jobs agree on the candidate release they hand the APK over in', () => {
  /* The android-device job failed to find its input twice over, and neither
     failure was visible: the upload wrote the tag from a 7-character SHA while
     the reader looked up the full 40-character one, and the upload renamed the
     asset with `file#label` - which sets a display label, not the name - so the
     APK arrived as android-device-input.apk while the download searched for
     candidate.apk. Neither could be seen without reading both jobs together. */
  const wf = read('.github/workflows/native.yml')

  const uploaded = wf.match(/CANDIDATE_TAG="([^"]+)"/)
  assert.ok(uploaded, 'the android job never names the candidate release')
  assert.match(uploaded[1], /^candidate-android-\$\{GITHUB_SHA\}$/,
    'the tag must be the full SHA, so an expression can reproduce it exactly')

  const consumed = wf.match(/CANDIDATE_TAG: (candidate-android-\$\{\{[^}]+\}\})/)
  assert.ok(consumed, 'the device job never names the release it downloads from')
  assert.equal(consumed[1], 'candidate-android-${{ github.sha }}',
    'the reader and the writer must build the same tag')
  assert.ok(!wf.includes('candidate-android-${{ github.sha }}:${'),
    'one side truncates the SHA and the other does not, so they can never agree')

  const asset = wf.match(/gh release upload "\$CANDIDATE_TAG" "([^"]+)"/)
  assert.ok(asset, 'nothing uploads the candidate APK')
  assert.ok(!asset[1].includes('#'),
    'the `file#label` form sets a display label, not the asset name, so the download pattern cannot match it')
  const downloaded = wf.match(/--pattern '([^']+)' --dir device-input/)
  assert.ok(downloaded, 'nothing downloads the candidate APK')
  assert.equal(asset[1], downloaded[1],
    'the uploaded asset name and the downloaded pattern must be the same string')
  assert.ok(wf.includes('`device-input/android-device-input.apk`') ||
    wf.includes('device-input/android-device-input.apk'),
    'the smoke test reads the file under its real name')
})

test('the verification step cannot race itself into rejecting a good APK', () => {
  /* `cmd | grep -q ...` looks harmless and is not. grep -q exits the instant it
     finds its match, closing the pipe on whatever is still writing; that writer
     dies of SIGPIPE, `pipefail` promotes the 141 to a failure status, and a
     flawless APK is refused for having no dex, no manifest, or icons it plainly
     ships. It is a race, so the four-entry mocks never showed it while CI
     rejected good builds at random. Swapping the producer does not help - moving
     the pipe from `unzip` to `printf` just found a new victim - so nothing in
     this step may pipe into `grep -q` at all. Matching a herestring cannot race:
     grep reads a temporary file, so there is no writer left to kill. */
  const wf = read('.github/workflows/native.yml')
  const step = wf.slice(wf.indexOf('name: Verify the signed APK before it is banked'))
  const code = step.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
  assert.ok(!/\|\s*grep\s+-q/.test(code),
    'the verification step pipes into grep -q, which can SIGPIPE itself into a false rejection')
  assert.match(code, /LISTING=\$\(unzip -Z1 "\$APK"\)/,
    'the entry list should be read once and reused')
  assert.match(code, /grep -cE '\^classes\[0-9\]\*\\\.dex\$'/,
    'count the dex files and test the count, rather than short-circuiting mid-pipeline')
})

/* ==================== the crash that killed the app before its first frame */

test('the Android build detaches WorkManager startup but supplies lazy application configuration', () => {
  /* AndroidX Startup used to create WorkManager's Room database before any app
     code ran. Removing that initializer alone is not sufficient: the download
     plugin calls WorkManager.getInstance later and Android then requires either
     a manual initialize call or Configuration.Provider on Application. */
  const wf = read('.github/workflows/native.yml')
  const script = read('scripts/ensure-android-launch-survives.mjs')
  assert.match(wf, /node scripts\/ensure-android-launch-survives\.mjs/,
    'nothing repairs the launch path')
  assert.ok(
    wf.indexOf('ensure-android-launch-survives.mjs') > wf.indexOf('tauri android init'),
    'the repair has to run after the Android project is generated',
  )
  assert.match(script, /Configuration\.Provider/,
    'removing WorkManagerInitializer requires lazy manual configuration for the download plugin')
  assert.match(script, /TheToolTableApplication/)
})

test('the launch repair is applied to the generated manifest, application and ProGuard rules', () => {
  const script = read('scripts/ensure-android-launch-survives.mjs')
  assert.match(script, /androidx\.startup\.InitializationProvider/)
  assert.match(script, /androidx\.work\.WorkManagerInitializer/)
  assert.match(script, /tools:node="remove"/,
    'removing the initializer needs a manifest merge directive, not a comment')
  assert.match(script, /Configuration\.Provider/,
    'the custom Application must satisfy WorkManager after startup initialization is removed')
  assert.match(script, /androidx\.work:work-runtime-ktx:2\.9\.1/,
    'the generated app source needs a direct WorkManager compile dependency')
  assert.match(script, /androidx\.room\.RoomDatabase/,
    'the generated Room implementation class has to be kept')
  assert.match(script, /proguard-rules\.pro/)
})

test('the launch repair is idempotent and safe before the Android project exists', () => {
  /* CI runs steps that precede the Android build; a repair that failed there
     would take the whole pipeline down with it. */
  const script = read('scripts/ensure-android-launch-survives.mjs')
  assert.match(script, /Android project not generated yet/)
  assert.match(script, /process\.exit\(0\)/)
  assert.match(script, /already detached/)
  assert.match(script, /already present|already wired|already/)
})

test('the launch repair actually edits a pristine generated Android project', async () => {
  /* Regression: the first version of this script looked for
   * `androidx.work.WorkManagerInitializer` to decide whether the patch was
   * needed. That string comes from the *library's* merged manifest and is absent
   * from the generated one, so the script declared a pristine project already
   * fixed and changed nothing. The repair has to be executed, not eyeballed. */
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const cp = await import('node:child_process')
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

  const pristine = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:label="TheToolTable" android:icon="@mipmap/ic_launcher">
    <activity android:name=".MainActivity" android:exported="true" />
  </application>
</manifest>
`
  const tmp = path.join(os.tmpdir(), `ttt-launch-${process.pid}`)
  await fs.rm(tmp, { recursive: true, force: true })
  await fs.mkdir(path.join(tmp, 'src-tauri/gen/android/app/src/main'), { recursive: true })
  await fs.mkdir(path.join(tmp, 'scripts'), { recursive: true })
  await fs.copyFile(path.join(repo, 'scripts/ensure-android-launch-survives.mjs'),
    path.join(tmp, 'scripts/ensure-android-launch-survives.mjs'))
  await fs.writeFile(path.join(tmp, 'src-tauri/tauri.conf.json'), JSON.stringify({
    identifier: 'app.thetooltable.mubashir',
  }))
  const app = path.join(tmp, 'src-tauri/gen/android/app')
  await fs.writeFile(path.join(app, 'src/main/AndroidManifest.xml'), pristine)
  await fs.writeFile(path.join(app, 'build.gradle.kts'), `
plugins { id("com.android.application") }
dependencies {
  implementation("androidx.webkit:webkit:1.14.0")
}
`)

  const run = () => cp.execFileSync(process.execPath,
    ['scripts/ensure-android-launch-survives.mjs'],
    { cwd: tmp, encoding: 'utf8' })
  try {
    const first = run()
    const manifest = await fs.readFile(path.join(app, 'src/main/AndroidManifest.xml'), 'utf8')
    const rules = await fs.readFile(path.join(app, 'proguard-rules.pro'), 'utf8')
    const gradle = await fs.readFile(path.join(app, 'build.gradle.kts'), 'utf8')
    const applicationSource = await fs.readFile(
      path.join(app, 'src/main/kotlin/app/thetooltable/mubashir/TheToolTableApplication.kt'),
      'utf8',
    )

    assert.match(first, /detached from AndroidX Startup/,
      'the repair must act on a pristine manifest, not assume it is done')
    assert.match(first, /Configuration\.Provider/,
      'a plugin that calls WorkManager.getInstance needs a lazy configuration path')
    assert.ok(!pristine.includes('InitializationProvider'))
    assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/,
      'tools:node="remove" is silently ignored without the tools namespace')
    assert.match(manifest, /android:name="androidx\.startup\.InitializationProvider"/)
    assert.match(manifest, /android:name="androidx\.work\.WorkManagerInitializer"/)
    assert.match(manifest, /tools:node="remove"/)
    assert.match(manifest, /android:name="app\.thetooltable\.mubashir\.TheToolTableApplication"/)
    assert.match(applicationSource, /class TheToolTableApplication : Application\(\), Configuration\.Provider/)
    assert.match(applicationSource, /Configuration\.Builder\(\)\.build\(\)/)
    assert.match(gradle, /implementation\("androidx\.work:work-runtime-ktx:2\.9\.1"\)/,
      'the app module must compile the generated Configuration.Provider source directly')
    assert.match(rules, /-keep class androidx\.work\.impl\.\*\*/)
    assert.match(rules, /-keep class \* extends androidx\.room\.RoomDatabase/)
    assert.match(rules, /-keep class \*\*\.TheToolTableApplication/)

    assert.match(run(), /already detached/, 'the repair must be idempotent')
    assert.equal(
      await fs.readFile(path.join(app, 'src/main/AndroidManifest.xml'), 'utf8'), manifest,
      'a second run must not duplicate the startup-removal block')
    assert.equal(
      await fs.readFile(path.join(app, 'src/main/kotlin/app/thetooltable/mubashir/TheToolTableApplication.kt'), 'utf8'),
      applicationSource,
      'a second run must not replace or duplicate the Application source')
    assert.equal(
      await fs.readFile(path.join(app, 'build.gradle.kts'), 'utf8'), gradle,
      'a second run must not duplicate the direct WorkManager dependency')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('the launch repair refuses to replace a generated project custom Application', async () => {
  const fs = await import('node:fs/promises')
  const os = await import('node:os')
  const cp = await import('node:child_process')
  const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
  const tmp = path.join(os.tmpdir(), `ttt-custom-application-${process.pid}`)
  const manifestPath = path.join(tmp, 'src-tauri/gen/android/app/src/main/AndroidManifest.xml')
  const customManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:name="com.example.ExistingApplication" android:label="TheToolTable" />
</manifest>
`

  await fs.rm(tmp, { recursive: true, force: true })
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.mkdir(path.join(tmp, 'scripts'), { recursive: true })
  await fs.copyFile(path.join(repo, 'scripts/ensure-android-launch-survives.mjs'),
    path.join(tmp, 'scripts/ensure-android-launch-survives.mjs'))
  await fs.writeFile(path.join(tmp, 'src-tauri/tauri.conf.json'), JSON.stringify({
    identifier: 'app.thetooltable.mubashir',
  }))
  await fs.writeFile(manifestPath, customManifest)

  try {
    const result = cp.spawnSync(process.execPath, ['scripts/ensure-android-launch-survives.mjs'], {
      cwd: tmp,
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0, 'a foreign Application must be an error, not something the patch overwrites')
    assert.match(`${result.stdout}\n${result.stderr}`, /already declares Application com\.example\.ExistingApplication/)
    assert.equal(await fs.readFile(manifestPath, 'utf8'), customManifest,
      'the manifest must remain untouched when a custom Application needs a human merge')
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
})
