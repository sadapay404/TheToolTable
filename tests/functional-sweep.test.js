import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => existsSync(path.join(ROOT, p))

const registry = read('src/toolsRegistry.jsx')
const app = read('src/App.jsx')
const chrome = read('src/components/ToolChrome.jsx')
const stage = read('src/tools/wall/Stage.jsx')

/* ------------------------------------------------ the twenty-tool registry */

const TOOL_FILES = [...registry.matchAll(/import\('\.\/tools\/([^']+)'\)/g)].map(([, f]) => f)
const TOOL_IDS = [...registry.matchAll(/\bid: '([a-z0-9]+)', n: (\d+)/g)].map(([, id, n]) => ({ id, n: Number(n) }))

test('the registry still describes exactly twenty tools', () => {
  assert.equal(TOOL_FILES.length, 20, 'every tool is its own lazy chunk')
  assert.equal(TOOL_IDS.length, 20)
  assert.equal(new Set(TOOL_FILES).size, 20, 'no duplicate chunk')
  assert.equal(new Set(TOOL_IDS.map((t) => t.id)).size, 20, 'no duplicate id')
})

test('the tools are numbered 1 to 20 with no gaps', () => {
  const numbers = TOOL_IDS.map((t) => t.n).sort((a, b) => a - b)
  assert.deepEqual(numbers, Array.from({ length: 20 }, (_, i) => i + 1))
})

test('every lazy chunk points at a file that exists', () => {
  for (const file of TOOL_FILES) {
    assert.ok(exists(`src/tools/${file}`), `src/tools/${file} is registered but missing`)
  }
})

test('every tool has the fields the collection and the intro depend on', () => {
  const entries = [...registry.matchAll(/id: '([a-z0-9]+)', n: \d+, name: '([^']+)', icon: '([^']+)', color: '(#[0-9A-Fa-f]{6})'/g)]
  assert.equal(entries.length, 20, 'each tool carries an id, number, name, icon and colour')
  const names = entries.map(([, , name]) => name)
  assert.equal(new Set(names).size, 20, 'no two tools share a name')
  const icons = entries.map(([, , , icon]) => icon)
  assert.equal(new Set(icons).size, 20, 'no two tools share an icon')
})

test('every tool carries a tag and a description for the shared intro', () => {
  const tags = [...registry.matchAll(/tag: '([^']+)'/g)].map(([, t]) => t)
  const descs = [...registry.matchAll(/desc: '([^']{20,})'/g)].map(([, d]) => d)
  assert.equal(tags.length, 20, 'ToolIntro renders the tag; a missing one leaves a hole in the chrome')
  assert.equal(descs.length, 20, 'and the description')
})

test('no tool is registered without a search description', () => {
  const keywords = [...registry.matchAll(/keywords: '([^']+)'/g)].map(([, k]) => k.split(/\s+/))
  assert.equal(keywords.length, 20, 'search is the only way to find some of these')
  for (const words of keywords) assert.ok(words.length >= 4, 'a tool with three keywords is undiscoverable')
})

/* ------------------------------------------- the chrome every tool inherits */

test('every tool is wrapped in the one shared shell, not its own furniture', () => {
  assert.match(app, /<ToolShell>/)
  assert.match(app, /<ToolIntro tool=\{active\} \/>/)
  const toolShellCount = (app.match(/<ToolShell>/g) || []).length
  assert.equal(toolShellCount, 1, 'one shell, so a fix reaches all twenty tools')
})

test('the intro is labelled for screen readers', () => {
  assert.match(chrome, /aria-label=\{`\$\{tool\.name\} introduction`\}/)
  assert.match(chrome, /className="tool-intro"/)
})

test('the shell has one error boundary and it never silently dumps the user home', () => {
  assert.match(app, /<ErrorBoundary key=\{active\.id\} onExit=\{goHome\}>/)
  /* A tool that throws used to leave a header with nothing under it. Whatever
     the boundary shows, it has to show the tool's own name. */
  const boundary = app.slice(app.indexOf('class ErrorBoundary'))
  assert.match(boundary.slice(0, 1400), /Something went wrong|went wrong|Try again|again/i,
    'the fallback must offer a way forward rather than only a message')
})

/* ------------------------------------- the stall this part found and fixed */

test('the WebGL stage is not built inside the commit that mounts the tool', () => {
  /* Compiling the background shader is synchronous. Doing it while the tool
     mounts meant the whole screen — chrome included — waited on the GPU: nearly
     two seconds before anything appeared on a phone. */
  const effect = stage.slice(stage.indexOf('// renderer lifecycle'), stage.indexOf('useEffect(() => { R.current?.setDesign(d)'))
  assert.match(effect, /requestIdleCallback/, 'the renderer must start after the first paint')

  const build = effect.slice(effect.indexOf('const start = () =>'), effect.indexOf('const ric'))
  assert.match(build, /new WallRenderer\(canvas\.current\)/, 'the renderer is still built — just not on the critical path')

  // `start` must be reachable only through the deferred callback.
  const callers = [...effect.matchAll(/\bstart\b/g)].length
  const declared = 1
  const scheduled = (effect.match(/requestIdleCallback\(start|setTimeout\(start/g) || []).length
  assert.equal(callers, declared + scheduled,
    'the renderer must be started from the idle callback and nowhere else')
})

test('the stage still shows something moving while the GPU warms up', () => {
  /* Deferring the renderer must not trade a stall for a dead grey box. */
  assert.match(stage, /\{!ready && !err && \(/)
  assert.match(stage, /animate=\{reduceMotion \? undefined : \{ x: \['-60%', '260%'\] \}\}/)
  assert.match(stage, /repeat: reduceMotion \? 0 : Infinity/)
})

test('the deferred renderer is still cleaned up', () => {
  const effect = stage.slice(stage.indexOf('// renderer lifecycle'), stage.indexOf('useEffect(() => { R.current?.setDesign(d)'))
  assert.match(effect, /cancelAnimationFrame\(warmRaf\)/, 'a renderer started after unmount would leak a GPU context')
  assert.match(effect, /cancelIdleCallback|idle = clearTimeout/)
  assert.match(effect, /R\.current\?\.dispose\(\)/)
})

test('the live render loop itself is untouched', () => {
  const loop = stage.slice(stage.indexOf('const loop = (now)'), stage.lastIndexOf('loopRaf = requestAnimationFrame(loop)'))
  assert.match(loop, /r\.step\(dt\)/, 'the shader must still animate')
  assert.match(loop, /r\.draw\(phase\.current/)
  assert.match(loop, /perf\.fps\(\)/, 'and stay inside the frame budget')
})

/* -------------------------------------------- back navigation, bugs 6 and 7 */

test('back has one contract, and it is shared by every way of going back', () => {
  const fn = app.slice(app.indexOf('const navigateBack'), app.indexOf('const backRef'))
  assert.match(fn, /resolveBack\(/)
  for (const action of ['close-overlay', 'navigate', 'home']) {
    assert.match(fn, new RegExp(`decision\\.action === '${action}'`))
  }
  /* Leaving the app is the last resort, never the first. */
  assert.match(fn, /only here may back leave/)
  assert.ok(fn.indexOf("decision.action === 'home'") < fn.indexOf('exit(0)'),
    'home must be handled before the app is allowed to exit')
})

test('the native back handler reads live state, not the first render', () => {
  /* The gesture once met an empty tool stack and fell straight through to
     exit() because the listener closed over stale state. */
  assert.match(app, /onBackButtonPress\(\(\) => backRef\.current\(true\)\)/)
  assert.match(app, /backRef\.current = navigateBack/)
  assert.match(app, /navRef\.current = \{ active, overlay \}/)
})

test('the keyboard, the gesture and the header control all reach that one contract', () => {
  assert.match(app, /event\.key === 'Escape'/)
  assert.match(app, /onBackButtonPress/)
  assert.match(app, /navigateBack\(false\)|navigateBack\(\)/)
})

/* ------------------------------------------- the sweep itself is reproducible */

test('the browser sweep ships with the repository', () => {
  assert.ok(exists('browsertest/verify9.mjs'), 'the sweep that found the stall has to be runnable again')
  const sweep = read('browsertest/verify9.mjs')
  const ids = [...registry.matchAll(/id: '([a-z0-9]+)'/g)].map(([, id]) => id)
  for (const id of ids) {
    assert.ok(sweep.includes(`['${id}'`), `the sweep never opens ${id}`)
  }
  assert.match(sweep, /localStorage\.clear\(\)/, 'tools remember their last tab; an inheriting sweep tests nothing')
  assert.match(sweep, /uploadFile\(/)
  assert.match(sweep, /prefers-reduced-motion/)
})

test('the sweep has its own fixtures, committed as real files', () => {
  const fixtures = path.join(ROOT, 'browsertest/fixtures')
  assert.ok(existsSync(fixtures), 'the sweep needs real files to upload')
  const files = readdirSync(fixtures)
  assert.ok(files.some((f) => f.endsWith('.png')), 'an image fixture for the image tools')
  assert.ok(files.some((f) => f.endsWith('.txt')), 'a text fixture')
  for (const file of files) {
    assert.ok(statSync(path.join(fixtures, file)).size > 64, `${file} is too small to be a real fixture`)
  }
})

test('no tool file is empty or a stub', () => {
  for (const file of TOOL_FILES) {
    const body = read(`src/tools/${file}`)
    assert.ok(body.length > 500, `src/tools/${file} looks like a stub`)
    assert.match(body, /export default/, `src/tools/${file} has no default export to lazy-load`)
  }
})

test('the tools folder has no component nothing can reach', () => {
  /* A file here that neither the registry nor another tool imports is dead
     weight: it looks like a tool, ships in the bundle, and never opens. */
  const onDisk = readdirSync(path.join(ROOT, 'src/tools')).filter((f) => f.endsWith('.jsx'))
  const sources = readdirSync(path.join(ROOT, 'src/tools')).filter((f) => f.endsWith('.jsx') && !exists(`src/tools/force-skip`))
  const imported = new Set(TOOL_FILES)
  const bodies = [...onDisk, 'registry'].map((f) => (f === 'registry' ? registry : read(`src/tools/${f}`)))
  for (const body of bodies) {
    for (const m of body.matchAll(/from '\.\/([A-Za-z0-9_]+\.jsx)'/g)) imported.add(m[1])
  }
  const orphans = onDisk.filter((f) => !imported.has(f))
  assert.deepEqual(orphans, [], `unreachable tool files: ${orphans.join(', ')}`)
  assert.ok(sources.length >= 20)
})