import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const packageId = 'app.thetooltable.mubashir'
const apkPath = path.resolve(process.argv[2] || '')

/**
 * Read the labels this test looks for out of the app source.
 *
 * They used to be hardcoded. The mobile rebuild renamed the tool back control
 * from "Back to the table" to "Go back", and every Android build since then was
 * compiled, signed, and then thrown away by this test waiting two minutes for a
 * button that no longer existed — while the run reported itself as a build
 * failure. A label that moves with the UI cannot do that: if it cannot be found
 * in the source, that is a hard error in a second, not a timeout in two minutes.
 */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
function sourceLabels() {
  const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
  const app = read('src/App.jsx')
  const registry = read('src/toolsRegistry.jsx')
  const back = app.match(/tool-back-button[^>]*aria-label="([^"]+)"/)?.[1]
  if (!back) throw new Error('Could not find the tool back control\'s aria-label in src/App.jsx. The app must label it for screen readers and for this test.')
  const toolNames = [...registry.matchAll(/\bid: '[a-z0-9]+', n: \d+, name: '([^']+)'/g)].map(([, name]) => name)
  if (toolNames.length < 20) throw new Error(`Only found ${toolNames.length} tool names in the registry.`)
  // ToolCard renders aria-label={`Open ${tool.name}`}.
  return { back, cards: toolNames.map((name) => `Open ${name}`), byName: new Map(toolNames.map((n) => [`Open ${n}`, n])) }
}
const LABELS = sourceLabels()
console.log(`Driving the real controls: back = "${LABELS.back}", ${LABELS.cards.length} tool cards.`)

/** The home collection heading, read from the app so a copy change cannot stall the run. */
function homeHeading() {
  const app = readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8')
  return app.match(/Browse the collection/)?.[0] || 'Browse the collection'
}
const HOME_HEADING = homeHeading()
const POLL_MS = 900
const UI_TIMEOUT_MS = 120_000
const NAVIGATION_SETTLE_MS = 1_500
// A visible WebView is not proof Tauri's native download plugin has completed
// its WorkManager setup. Keep the launch under observation long enough for that
// background setup and its native abort path to surface in logcat.
const PLUGIN_INITIALIZATION_SETTLE_MS = 5_000
let lastTree = ''
let systemAnrRecoveries = 0

function adb(...args) {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 25_000 }).trim()
  } catch (error) {
    const output = [error.stdout, error.stderr]
      .map((value) => value?.toString().trim())
      .filter(Boolean)
      .join('\n')
    throw new Error(`${error.message}${output ? `\n${output}` : ''}`, { cause: error })
  }
}

function safeAdb(...args) {
  try { return adb(...args) } catch { return '' }
}

function decodeXml(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

function nodesOf(xml) {
  return [...String(xml || '').matchAll(/<node\b[^>]*>/g)].map(([node]) => {
    const read = (name) => decodeXml(node.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] || '')
    const bounds = node.match(/\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)
    return {
      raw: node,
      text: read('text'),
      description: read('content-desc'),
      className: read('class'),
      bounds: bounds ? bounds.slice(1).map(Number) : null,
    }
  })
}

function dumpUi() {
  try {
    adb('shell', 'uiautomator', 'dump', '/sdcard/thetooltable-window.xml')
    lastTree = adb('shell', 'cat', '/sdcard/thetooltable-window.xml')
  } catch {
    lastTree = ''
  }
  return lastTree
}

function nodeWithLabel(xml, label) {
  return nodesOf(xml).find((node) => node.text === label || node.description === label)
}

function screenSize() {
  const result = safeAdb('shell', 'wm', 'size')
  const match = result.match(/(\d+)x(\d+)/)
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1080, height: 2400 }
}

function foreground() {
  const activities = safeAdb('shell', 'dumpsys', 'activity', 'activities')
  const windows = safeAdb('shell', 'dumpsys', 'window', 'windows')
  const resumed = new RegExp(`(?:mResumedActivity|topResumedActivity)[^\\n]*${packageId}`).test(activities)
  const focused = new RegExp(`mCurrentFocus[^\\n]*${packageId}`).test(windows)
  return resumed || focused
}

async function waitUntil(description, predicate, timeout = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const tree = dumpUi()
    const anrTitle = nodesOf(tree).find((node) => /isn't responding/i.test(node.text))
    const waitButton = nodeWithLabel(tree, 'Wait')
    if (anrTitle && waitButton?.bounds) {
      if (systemAnrRecoveries >= 1) {
        throw new Error(`Android showed another system ANR dialog while waiting for ${description}: ${anrTitle.text}`)
      }
      systemAnrRecoveries += 1
      const [left, top, right, bottom] = waitButton.bounds
      adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)))
      console.warn(`Android showed "${anrTitle.text}" during cold startup; chose Wait once and kept checking for the app UI.`)
      await delay(5_000)
      continue
    }
    const found = predicate(tree)
    if (found) return { tree, found }
    await delay(POLL_MS)
  }
  throw new Error(`Timed out waiting for ${description}. Last visible nodes:\n${nodesOf(lastTree).slice(0, 100).map((node) => `${node.className}: ${node.text || node.description}`).join('\n')}`)
}

function atHome(tree) {
  const nodes = nodesOf(tree)
  return nodes.some((node) => node.text === HOME_HEADING)
    && nodes.some((node) => LABELS.cards.includes(node.description))
}

async function waitForHome() {
  const result = await waitUntil('the home collection after back navigation', atHome)
  await assertStableForeground('returning to its home screen')
  return result
}

async function openTool(label, title) {
  const { width, height } = screenSize()
  let target = null
  for (let attempt = 0; attempt < 8; attempt++) {
    const tree = dumpUi()
    target = nodeWithLabel(tree, label)
    if (target?.bounds) break
    // The menu is a vertically scrolling catalogue; reveal the requested card
    // before trying its accessible label again.
    adb('shell', 'input', 'swipe', String(Math.round(width * 0.52)), String(Math.round(height * 0.82)), String(Math.round(width * 0.52)), String(Math.round(height * 0.42)), '360')
    await delay(450)
  }
  if (!target?.bounds) throw new Error(`Could not find the accessible tool card "${label}". The Android WebView must expose its button label to UIAutomator.`)
  const [left, top, right, bottom] = target.bounds
  adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)))
  await waitUntil(`the ${title} screen`, (tree) => {
    const nodes = nodesOf(tree)
    return nodes.some((node) => node.text.includes(title))
      && nodes.some((node) => node.description === LABELS.back)
  })
  if (!foreground()) throw new Error(`The app is not foregrounded on ${title}.`)
}

async function tapLabel(label) {
  const tree = dumpUi()
  const target = nodeWithLabel(tree, label)
  if (!target?.bounds) throw new Error(`Could not find accessible button "${label}".`)
  const [left, top, right, bottom] = target.bounds
  adb('shell', 'input', 'tap', String(Math.round((left + right) / 2)), String(Math.round((top + bottom) / 2)))
}

function assertNoAppCrash() {
  const log = safeAdb('logcat', '-d', '-t', '1200')
  const fatalBlocks = log.match(/FATAL EXCEPTION[\s\S]{0,2500}/g) || []
  const ownCrash = fatalBlocks.find((block) => block.includes(`Process: ${packageId}`))
  const nativeCrash = log.split('\n').find((line) => line.includes('Fatal signal') && line.includes(packageId))

  // `panic = "abort"` does not necessarily emit Java's "FATAL EXCEPTION" or
  // a same-line "Fatal signal". The broken v1.2.1 APK logged this exact native
  // tombstone shape after the download plugin rejected missing WorkManager
  // configuration, and the old smoke test could miss it.
  const cmdlineAt = log.lastIndexOf(`Cmdline: ${packageId}`)
  const nativeAbort = cmdlineAt >= 0
    ? log.slice(cmdlineAt, cmdlineAt + 6_000).match(/Abort message:[\s\S]{0,2_500}/)?.[0]
    : null
  const pluginInitialization = log.split('\n').find((line) =>
    line.includes('PluginInitialization("download"')
    || line.includes('WorkManager is not initialized properly'),
  )
  if (ownCrash || nativeCrash || nativeAbort || pluginInitialization) {
    throw new Error(`Android reported an app crash:\n${ownCrash || nativeCrash || nativeAbort || pluginInitialization}`)
  }
}

async function assertStableForeground(where, settleMs = NAVIGATION_SETTLE_MS) {
  // A splash frame can be reported before Rust plugin initialization aborts the
  // native process. Give launch a settling window before calling it a pass.
  await delay(settleMs)
  assertNoAppCrash()
  if (!foreground()) throw new Error(`The app left the foreground after ${where}.`)
}

async function main() {
  if (!process.argv[2]) throw new Error('Pass the signed APK path as the first argument.')
  console.log('Allowing Android first-boot services to settle before installing the app.')
  await delay(15_000)
  adb('install', '-r', apkPath)
  safeAdb('logcat', '-c')
  adb('shell', 'am', 'force-stop', packageId)
  const launchResult = adb('shell', 'am', 'start', '-W', '-n', `${packageId}/.MainActivity`)
  if (!/Status:\s*ok/.test(launchResult)) throw new Error(`Android did not start the app's MainActivity:\n${launchResult}`)
  console.log(launchResult)
  await waitUntil('the Android home collection on launch', atHome)
  await assertStableForeground('the initial home collection', PLUGIN_INITIALIZATION_SETTLE_MS)
  console.log('PASS: fresh install launches into the accessible tool collection and remains alive after plugin initialization.')

  // Tool 04: exercise actual system-back navigation instead of just checking the
  // APK build. The home collection must remain rendered (not a header-only page).
  await openTool('Open Media Clipper & Downloader', 'Media Clipper & Downloader')
  adb('shell', 'input', 'keyevent', '4')
  await waitForHome()
  console.log('PASS: Android system back returns from Tool 04 to the live home collection.')

  // Tool 06: verify its own back control also restores the collection.
  await openTool('Open AI Background Remover', 'AI Background Remover')
  await tapLabel(LABELS.back)
  await waitForHome()
  console.log(`PASS: Tool 06 the app's own "${LABELS.back}" control returns to the live home collection (no header-only black screen).`)

  assertNoAppCrash()
  console.log('PASS: no app-process fatal exception detected in logcat.')
}

main().catch((error) => {
  const tail = safeAdb('logcat', '-d', '-t', '300').split('\n').slice(-160).join('\n')
  console.error(`ANDROID RUNTIME SMOKE FAILED: ${error.stack || error}`)
  if (lastTree) console.error(`\nLast UIAutomator hierarchy:\n${lastTree.slice(0, 30_000)}`)
  if (tail) console.error(`\nRecent Android logcat:\n${tail}`)
  process.exitCode = 1
})
