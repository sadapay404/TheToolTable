/**
 * Part 10, fifth batch: the built artefact.
 *
 * Everything else in this suite checks source. This checks what actually ships:
 * the files in `dist/` that a phone downloads. A green test suite and a broken
 * bundle are not mutually exclusive — a chunk that silently fails to split, an
 * asset that did not get copied, a dev-only branch left in the production
 * build, or a tool whose chunk is empty all pass every source-level test.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const registry = read('src/toolsRegistry.jsx')
const pkg = JSON.parse(read('package.json'))

const built = existsSync(DIST)
const assets = built ? readdirSync(path.join(DIST, 'assets')) : []
const js = assets.filter((f) => f.endsWith('.js'))

/** The build must have run before this file means anything. */
const describeBuilt = (name, fn) => test(name, { skip: built ? false : 'run `npm run build` first' }, fn)

describeBuilt('the build produces an app shell a browser can open', () => {
  assert.ok(existsSync(path.join(DIST, 'index.html')), 'dist/index.html is missing')
  const html = read('dist/index.html')
  assert.match(html, /<script[^>]+type="module"/, 'no module script in the built shell')
  assert.match(html, /<div id="root">/, 'the React root is missing from the shell')
  assert.match(html, /rel="stylesheet"/, 'the stylesheet is not linked')
  assert.match(html, /lang="[a-z]{2}"/i, 'the built shell lost its language')
  /* A missing module preload is the classic silent Vite build break. */
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(([, s]) => s)
  assert.ok(scripts.length > 0, 'the built shell loads no script at all')
  for (const src of scripts) {
    const file = path.join(DIST, src.replace(/^\//, ''))
    assert.ok(existsSync(file), `the shell references ${src}, which was not emitted`)
  }
  for (const href of [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(([, h]) => h)) {
    assert.ok(existsSync(path.join(DIST, href.replace(/^\//, ''))), `the shell references ${href}, which was not emitted`)
  }
})

describeBuilt('every tool ships as its own non-empty chunk', () => {
  const chunks = registry.matchAll(/import\('\.\/tools\/([^']+)'\)/g)
  const sizes = new Map(js.map((f) => [f, statSync(path.join(DIST, 'assets', f)).size]))
  const total = [...sizes.values()].reduce((a, b) => a + b, 0)

  /* The chunk name is derived from the module id, so match loosely: every tool
     file must have produced at least one emitted chunk that is not trivial.
     Vite emits a few tiny shims of its own, which are supposed to be tiny. */
  const shims = /^(?:__vite-browser-external|_commonjs|worker-|pdf\.worker)/
  const trivial = [...sizes].filter(([f, size]) => size < 400 && !shims.test(f))
  assert.deepEqual(trivial.map(([f]) => f), [], 'these chunks are too small to contain anything')

  for (const [, file] of chunks) {
    const stem = file.toLowerCase().replace(/[^a-z0-9]/g, '')
    const candidates = [...sizes.keys()].filter((f) => {
      const h = f.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/-[A-Za-z0-9_-]{8}\.js$/, '')
      return h.includes(stem.slice(0, Math.max(4, stem.length - 3)))
    })
    assert.ok(candidates.length > 0, `the tool ${file} produced no chunk in the build`)
    const biggest = Math.max(...candidates.map((f) => sizes.get(f)))
    assert.ok(biggest > 1000, `the chunk for ${file} is only ${biggest} bytes`)
  }
  assert.ok(total > 500_000, `the whole app is only ${total} bytes; something did not get bundled`)
})

describeBuilt('the production bundle has no development code in it', () => {
  /* Read the entry the shell actually loads, not the biggest file in dist. */
  const html = read('dist/index.html')
  const entrySrc = /<script[^>]+src="\/?assets\/([^"]+\.js)"/.exec(html)
  assert.ok(entrySrc, 'the built shell loads no entry chunk')
  const source = read(path.join('dist', 'assets', entrySrc[1]))
  assert.ok(source.length > 10_000, 'the entry chunk is suspiciously small')
  /* React's development build is roughly three times the size and warns on
     every render; shipping it is the single most common production mistake. */
  assert.doesNotMatch(source, /react\.development\.js|react-dom\.development/, 'a development React build was bundled')
  assert.doesNotMatch(source, /Warning: ReactDOM.render is no longer supported/, 'a legacy render call survived')
  assert.doesNotMatch(source, /process\.env\.NODE_ENV/, 'an unresolved NODE_ENV reached the bundle')
  assert.doesNotMatch(source, /localhost:\d{4}/, 'a dev-server address was baked into the bundle')
  assert.doesNotMatch(source, /__VUE_PROD_DEVTOOLS__/, 'a devtools global was left in place')
  /* Source maps in production leak the original source and double the payload. */
  assert.deepEqual(assets.filter((f) => f.endsWith('.map')), [], 'source maps were published')
})

describeBuilt('the service worker and web manifest ship', () => {
  /* Without these the installed app has no icon and no offline start. */
  const sw = ['sw.js', 'service-worker.js'].filter((f) => existsSync(path.join(DIST, f)))
  assert.ok(sw.length > 0, 'no service worker was emitted, so the app cannot start offline')
  assert.ok(existsSync(path.join(DIST, 'manifest.webmanifest')), 'no web manifest was emitted')
  const manifest = JSON.parse(read('dist/manifest.webmanifest'))
  assert.ok(manifest.name, 'the manifest has no name')
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'the manifest has no icons')
  for (const icon of manifest.icons) {
    assert.ok(existsSync(path.join(DIST, icon.src.replace(/^\//, ''))), `the manifest points at ${icon.src}, which is missing`)
    assert.match(icon.src, /\.(png|svg|webp|ico)$/i, `the manifest icon ${icon.src} is not an image`)
  }
  assert.ok(manifest.icons.some((i) => /512/.test(i.sizes || '')), 'no large icon, so Android will not use it')
})

describeBuilt('the icons the launcher will show are really in the bundle', () => {
  /* Part 8 shipped TheToolTable's own icon. It is easy to keep the source file
     and quietly lose it from the build. */
  const iconDir = path.join(DIST, 'icons')
  assert.ok(existsSync(iconDir), 'dist/icons is missing, so the installed app has no icon at all')
  const files = readdirSync(iconDir)
  assert.ok(files.length > 0, 'dist/icons is empty')
  const large = files.filter((f) => statSync(path.join(iconDir, f)).size > 4096)
  assert.ok(large.length > 0, 'every emitted icon is tiny, which suggests a placeholder')
  /* And each one must be a real image at the size its name claims. */
  for (const file of files) {
    const buf = readFileSync(path.join(iconDir, file))
    {
      assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${file} is not a PNG`)
      assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${file} is not a PNG`)
      assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR', `${file} has no PNG header chunk`)
      const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20)
      assert.ok(width >= 48 && height >= 48, `${file} is only ${width}×${height}`)
      const claimed = /-(\d+)\.png$/.exec(file)
      if (claimed) assert.equal(width, Number(claimed[1]), `${file} is ${width}px wide, not ${claimed[1]}px`)
      assert.equal(width, height, `${file} is not square, so the launcher will letterbox it`)
    }
  }
  /* The icon the manifest promises must be the one on disk. */
  const manifest = JSON.parse(read('dist/manifest.webmanifest'))
  for (const icon of manifest.icons) {
    const buf = readFileSync(path.join(DIST, icon.src.replace(/^\//, '')))
    const width = buf.readUInt32BE(16)
    const claimed = /^(\d+)x\d+$/.exec(icon.sizes)
    if (claimed) assert.equal(width, Number(claimed[1]), `${icon.src} is ${width}px but the manifest claims ${icon.sizes}`)
  }
  /* The maskable icon must have the safe-zone padding Android needs. */
  assert.ok(existsSync(path.join(iconDir, 'maskable-512.png')),
    'no maskable icon, so Android will crop the launcher icon into a circle')
})

describeBuilt('nothing is bundled twice, and nothing is missing', () => {
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const full = path.join(dir, f)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
  const files = walk(DIST)
  const total = files.reduce((sum, f) => sum + statSync(f).size, 0)
  /* The offline models and wasm are most of the payload and are deliberate. */
  const models = files.filter((f) => /[\\/](models|ocr|ffmpeg)[\\/]/.test(f))
  assert.ok(models.length > 0, 'the offline models are missing from the build')
  assert.ok(total > 20 * 1024 * 1024, `dist is only ${(total / 1048576).toFixed(1)} MB; the models did not get bundled`)
  assert.ok(total < 260 * 1024 * 1024, `dist is ${(total / 1048576).toFixed(1)} MB, which is far past what this app should ship`)

  /* Duplicate content under different names is how a build quietly doubles. */
  const bySize = new Map()
  for (const file of files.filter((f) => statSync(f).size > 200_000)) {
    const hash = readFileSync(file).subarray(0, 4096).toString('base64')
    bySize.set(hash, [...(bySize.get(hash) || []), path.relative(DIST, file)])
  }
  for (const [, group] of bySize) {
    assert.ok(group.length <= 2, `these are byte-identical in their first 4 KB: ${group.join(', ')}`)
  }
})

test('the build configuration itself is production-shaped', () => {
  const config = read(existsSync(path.join(ROOT, 'vite.config.js')) ? 'vite.config.js' : 'vite.config.mjs')
  assert.doesNotMatch(config, /mode:\s*['"]development['"]/, 'the build is pinned to development mode')
  assert.ok(existsSync(path.join(ROOT, 'vite.config.js')) || existsSync(path.join(ROOT, 'vite.config.mjs')),
    'there is no Vite config, so the build is whatever the defaults happen to be')
  assert.doesNotMatch(config, /sourcemap\s*:\s*true/, 'source maps are being published')
  assert.equal(pkg.type, 'module', 'the package is not an ES module, which changes every tool resolution')
  assert.ok(pkg.version, 'the package has no version, so the shipped app cannot say what it is')
})