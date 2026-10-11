import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  TRANSFER_STATUS, beginTransfer, updateTransfer, finishTransfer, failTransfer,
  cancelTransfer, clearFinishedTransfers, getTransfers, subscribeToTransfers,
  activeTransferCount, activeTransfers, resetTransfers, syncTransfersFromNative,
  formatBytes,
} from '../src/lib/transfers.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
const bg = read('src/lib/backgroundTransfers.js')
const engine = read('src/lib/bg/engine.js')
const centre = read('src/components/TransferCentre.jsx')
const app = read('src/App.jsx')
const css = read('src/styles.css')
const ui = centre
const transfers = read('src/lib/transfers.js')

test.beforeEach(() => resetTransfers())
test.after(() => resetTransfers())

/* ----------------------------------------------------------- the registry -- */

test('a transfer is tracked from queued to its terminal state', () => {
  const id = beginTransfer({ kind: 'download', title: 'Model', total: 1000 })
  assert.equal(getTransfers().length, 1)
  assert.equal(getTransfers()[0].status, TRANSFER_STATUS.queued)

  updateTransfer(id, { received: 250, total: 1000 }, { notify: false })
  const running = getTransfers()[0]
  assert.equal(running.status, TRANSFER_STATUS.running, 'any progress means it is running')
  assert.equal(running.progress, 0.25)

  finishTransfer(id, { status: TRANSFER_STATUS.completed })
  assert.equal(getTransfers()[0].status, TRANSFER_STATUS.completed)
  assert.equal(getTransfers()[0].progress, 1)
})

test('progress is clamped and percentages are accepted', () => {
  const id = beginTransfer({ title: 'x' })
  updateTransfer(id, { progress: 250 }, { notify: false })
  assert.equal(getTransfers()[0].progress, 1)
  updateTransfer(id, { progress: -4 }, { notify: false })
  assert.equal(getTransfers()[0].progress, 0)
  updateTransfer(id, { progress: 42 }, { notify: false })
  assert.equal(getTransfers()[0].progress, 0.42, '42 means 42%')
})

test('notifications are throttled, not posted per progress event', () => {
  const id = beginTransfer({ title: 'Model', total: 1000 })
  let allowed = 0
  // 40 events in the same instant must produce at most one notification.
  for (let i = 0; i < 40; i += 1) {
    if (updateTransfer(id, { received: i * 10 }, { now: 1_000_000 })?.shouldNotify) allowed += 1
  }
  assert.equal(allowed, 1, 'a fast download must not flood the notification shade')
})

test('terminal transfers retire themselves but stay readable for a moment', async () => {
  const id = beginTransfer({ title: 'Model' })
  finishTransfer(id, { status: TRANSFER_STATUS.completed })
  assert.equal(getTransfers().length, 1, 'a finished transfer is still visible at first')
  assert.equal(activeTransferCount(), 0, 'and no longer counts as running')
  assert.equal(clearFinishedTransfers(), 1)
  assert.equal(getTransfers().length, 0)
})

test('a failure keeps its message and stops counting as running', () => {
  const id = beginTransfer({ title: 'Model' })
  const failed = failTransfer(id, new Error('network died'))
  assert.equal(failed.message, 'network died')
  assert.equal(getTransfers()[0].detail, 'network died')
  assert.equal(activeTransferCount(), 0)
})

test('several transfers are tracked independently and ordered by start', () => {
  const a = beginTransfer({ title: 'first' })
  const b = beginTransfer({ title: 'second' })
  assert.deepEqual(getTransfers().map((t) => t.title), ['first', 'second'])
  finishTransfer(a)
  assert.equal(activeTransfers().length, 1)
  assert.equal(activeTransfers()[0].id, b)
  cancelTransfer(b)
  assert.equal(getTransfers().length, 1)
})

test('subscribers are notified and released', () => {
  let calls = 0
  const off = subscribeToTransfers(() => { calls += 1 })
  beginTransfer({ title: 'x' })
  assert.ok(calls > 0)
  off()
  const before = calls
  beginTransfer({ title: 'y' })
  assert.equal(calls, before)
})

test('bytes format the way a person expects', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB')
})

/* ------------------------------------------------------- resync from native -- */

test('a download that finished in the background is adopted on resume', async () => {
  const invoke = async (cmd) => {
    assert.equal(cmd, 'plugin:download|list')
    return [
      { path: '/cache/TheToolTable/models/u2net.onnx', status: 'inProgress', receivedBytes: 400, totalBytes: 1000, progress: 0.4 },
      { path: '/cache/TheToolTable/models/done.onnx', status: 'completed', receivedBytes: 900, totalBytes: 900, progress: 1 },
    ]
  }
  const before = getTransfers().length
  const result = await syncTransfersFromNative({ invoke })
  assert.equal(result.adopted, 2)
  assert.equal(getTransfers().length, before + 2)

  const titles = getTransfers().map((t) => t.title)
  assert.ok(titles.includes('u2net.onnx'))
  assert.ok(titles.includes('done.onnx'))
  const running = getTransfers().find((t) => t.title === 'u2net.onnx')
  assert.equal(running.status, TRANSFER_STATUS.running)
  assert.equal(running.progress, 0.4)
})

test('adopting the same download twice updates it instead of duplicating it', async () => {
  const invoke = async () => ([{ path: '/cache/m.onnx', status: 'inProgress', receivedBytes: 100, totalBytes: 500, progress: 0.2 }])
  await syncTransfersFromNative({ invoke })
  await syncTransfersFromNative({ invoke })
  assert.equal(getTransfers().length, 1)
})

test('a transfer the native store no longer knows about is failed, not left spinning', async () => {
  const id = beginTransfer({ title: 'ghost' })
  // Mark it as a native download so the resync is willing to retire it.
  const invoke = async () => []
  getTransfers() // snapshot is stable; the row is not native, so it survives
  await syncTransfersFromNative({ invoke })
  assert.equal(getTransfers().length, 1)
  assert.equal(getTransfers()[0].id, id)
  assert.equal(getTransfers()[0].status, TRANSFER_STATUS.queued, 'a non-native row is left alone')
})

test('an unavailable native store is not an error', async () => {
  const invoke = async () => { throw new Error('no plugin') }
  assert.deepEqual(await syncTransfersFromNative({ invoke }), { adopted: 0, active: 0 })
  assert.deepEqual(await syncTransfersFromNative({}), { adopted: 0, active: 0 })
})

/* --------------------------------------------- the actual bug: downloads --- */

test('a download holds the foreground service, which is the whole bug', () => {
  const start = bg.indexOf('export async function downloadToAppCache')
  const end = bg.indexOf('async function runNativeDownload')
  const block = bg.slice(start, end)
  assert.match(block, /beginBackgroundTransfer\(label\)/, 'a download must take the foreground service')
  assert.match(block, /await releaseService\(\)/, 'and give it back when it ends')
  assert.match(block, /finally \{/, 'in a finally block, so a failure still releases it')
})

test('a download posts live progress, start and terminal notifications', () => {
  const start = bg.indexOf('export async function downloadToAppCache')
  const end = bg.indexOf('async function runNativeDownload')
  assert.match(bg.slice(start, end), /postProgressNotification\(notificationId, label, 'Starting download/, 'progress must start visibly')
  const body = bg.slice(end, bg.indexOf('export async function clearNativeModelCache'))
  assert.match(body, /updateTransfer\(transferId/, 'progress must reach the registry')
  assert.match(body, /postProgressNotification\(notificationId, label, progressBody\(result\.transfer\), true/, 'and the shade')
  assert.match(body, /Download complete/, 'and a terminal notification')
  assert.match(body, /failTransfer\(transferId/, 'failures must be surfaced too')
})

test('progress notifications are throttled in one place', () => {
  assert.ok(!/let lastNotice/.test(bg.slice(bg.indexOf('async function runNativeDownload'), bg.indexOf('export async function clearNativeModelCache'))),
    'the download path must not carry its own throttle')
  assert.match(read('src/lib/transfers.js'), /NOTIFY_THROTTLE_MS = \d+/, 'the registry owns the throttle')
})

test('the model download names itself so the notification is meaningful', () => {
  assert.match(engine, /title: `\$\{TIERS\[plan\.tier\][^`]*model`/, 'the notification must say which model')
  assert.match(engine, /detail: 'Keeps running if you leave the app'/)
})

test('uploads and the legacy notifier share the one registry', () => {
  assert.match(bg, /beginTransfer\(\{ kind: 'upload'/, 'uploads register too')
  assert.match(bg, /updateTransfer\(transferId, \{/, 'and report progress')
  assert.match(bg, /failTransfer\(transferId, error\)/)
  assert.match(bg, /beginTransfer\(\{ kind, title, notificationId: id \}\)/, 'the legacy notifier registers as well')
})

test('there is exactly one byte formatter', () => {
  assert.equal((bg.match(/function formatBytes/g) || []).length, 0, 'backgroundTransfers must import it, not redefine it')
  assert.match(bg, /formatBytes,?\s*\n?\s*\} from '\.\/transfers\.js'|formatBytes,[\s\S]{0,40}\} from '\.\/transfers\.js'/)
})

test('a completed record without a file settles the registry instead of spinning', () => {
  const body = bg.slice(bg.indexOf('async function runNativeDownload'), bg.indexOf('export async function clearNativeModelCache'))
  // A joined download, two cache-hit short circuits and one real completion:
  // every path out of the download has to settle the registry row, or the bar
  // spins forever.
  const settlements = [...body.matchAll(/finishTransfer\(transferId, \{ status: TRANSFER_STATUS\.completed, detail: '([^']+)'/g)].map(([, d]) => d)
  assert.deepEqual(settlements, [
    'Shared an in-flight download',
    'Already downloaded',
    'Already on this device',
    'Saved for offline use',
  ])
})

test('the foreground service is released once, not per transfer', () => {
  const start = bg.indexOf('export async function beginBackgroundTransfer')
  const end = bg.indexOf('async function postProgressNotification')
  const block = bg.slice(start, end)
  assert.match(block, /backgroundTaskCount \+= 1/)
  assert.match(block, /if \(backgroundTaskCount === 0\)/, 'the service stops only when the last transfer ends')
  assert.match(block, /released/, 'and each caller gets an idempotent release')
})

test('running transfer count and notification restore are exported', () => {
  assert.match(bg, /export function runningTransferCount\(\)/)
  assert.match(bg, /export async function restoreProgressNotifications\(\)/)
  assert.match(bg, /export async function refreshBackgroundTransfers\(\)/)
})

/* ---------------------------------------------------------------- the UI --- */

test('the transfer centre is mounted once by the shell, for every tool', () => {
  assert.match(app, /<TransferCentre/)
  assert.equal((app.match(/<TransferCentre/g) || []).length, 1, 'one instance only')
  assert.match(app, /import TransferCentre from '\.\/components\/TransferCentre\.jsx'/)
})

test('the app resyncs with the native store when it comes back', () => {
  assert.match(app, /window\.addEventListener\('focus', resync\)/)
  assert.match(app, /visibilitychange/)
  assert.match(app, /refreshBackgroundTransfers/)
  assert.match(app, /restoreProgressNotifications/)
})

test('the sheet is a labelled dialog and its rows are real progressbars', () => {
  assert.match(centre, /role="dialog"/)
  assert.match(centre, /aria-label="Transfers"/)
  assert.match(centre, /role="progressbar"/)
  assert.match(centre, /aria-valuenow=/)
  assert.match(centre, /aria-label=\{transfer\.title\}/)
})

test('the centre keeps a bar for finished work rather than vanishing', () => {
  assert.match(centre, /if \(transfers\.length === 0\) return null/, 'it hides only when there is nothing at all')
  assert.match(centre, /Clear finished/)
})

test('every class the transfer centre renders has a rule', () => {
  const classes = [...centre.matchAll(/className="([^"$]+)"/g)]
    .flatMap(([, v]) => v.split(/\s+/))
    .filter((c) => c.startsWith('transfer-') && !c.includes('$'))
  const missing = [...new Set(classes)].filter((c) => !css.includes(`.${c}`))
  assert.deepEqual(missing, [], `classes with no style: ${missing.join(', ')}`)
})

test('the transfer chrome respects reduced motion', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.transfer-shimmer[\s\S]*\.transfer-fab-ring/)
  assert.match(centre, /useReducedMotion\(\)/)
})

test('nothing from parts 1-6 was removed', () => {
  for (const [needle, label] of [
    ['mfoot-ticker-track', 'part 6 footer ticker'],
    ['tool-dropzone', 'part 5 drop zone'],
    ['ambient-field', 'part 4 ambient layer'],
    ['card-shine', 'part 4 card shine'],
    ['background-service', 'the background service plugin config'],
  ]) {
    assert.ok((css + app + bg).includes(needle), `${label} disappeared`)
  }
})

/* ------------------------------------------- regressions found in review --- */

test('a second caller joining the same download settles its own row too', () => {
  const start = bg.indexOf('const owner = activeDownloads.get(initialPath)')
  const end = bg.indexOf('const task = (async () =>', start)
  const block = bg.slice(start, end)
  assert.match(block, /await owner\.task/, 'the joined row waits for the download it shares')
  assert.match(block, /finishTransfer\(transferId, \{ status: TRANSFER_STATUS\.completed, detail: 'Shared an in-flight download'/)
  assert.match(block, /catch \(error\)[\s\S]*failTransfer\(transferId, error/, 'and fails if the one it shared fails')
  assert.doesNotMatch(block, /return owner\b/, 'it must not leave the caller on a row that never finishes')
})

test('restoring notifications reuses the id a transfer already owns', () => {
  const start = bg.indexOf('export async function restoreProgressNotifications')
  const block = bg.slice(start)
  assert.match(block, /const id = transfer\.notificationId \|\| nextNotificationId\(\)/,
    'a fresh id would orphan the old notification in the shade on every resume')
  assert.doesNotMatch(block, /postProgressNotification\(\s*nextNotificationId\(\)/)
})

test('cancelling uses the exact native path, not a rebuilt filename', () => {
  assert.match(bg, /export async function cancelNativeTransfer\(transfer\)/)
  const start = bg.indexOf('export async function cancelNativeTransfer')
  const block = bg.slice(start, bg.indexOf('export async function refreshBackgroundTransfers'))
  assert.match(block, /const path = transfer\.nativePath/, 'the worker path is the recorded one')
  assert.match(block, /invoke\('plugin:download\|cancel', \{ path \}\)/)
  assert.doesNotMatch(app, /appCacheFilePath\(transfer\./, 'the shell must not guess a filename from the title')
  assert.match(app, /cancelNativeTransfer\(transfer\)/)
})

test('a transfer records the native path it is really writing to', () => {
  assert.match(transfers, /nativePath: nativePath == null \? null : String\(nativePath\)/)
  const start = bg.indexOf('async function runNativeDownload')
  const end = bg.indexOf('export async function clearNativeModelCache')
  assert.match(bg.slice(start, end), /updateTransfer\(transferId, \{ nativePath: initialPath, canCancel: true \}/)
  assert.match(bg.slice(start, end), /updateTransfer\(transferId, \{ detail: 'Sharing an in-flight download', nativePath: initialPath, canCancel: true \}/)
})

test('dismissing one finished row leaves the others alone', () => {
  const start = ui.indexOf('export default function TransferCentre')
  const block = ui.slice(start)
  assert.match(block, /onDismiss=\{\(t\) => cancelTransfer\(t\.id\)\}/)
  assert.doesNotMatch(block, /onDismiss=\{\(t\) => clearFinishedTransfers/, 'dismiss must not clear every finished transfer')
})

test('the sheet opens however many transfers start at once', () => {
  const start = ui.indexOf('export default function TransferCentre')
  const block = ui.slice(start)
  assert.match(block, /if \(running > 0 && previousRunning\.current === 0\) setOpen\(true\)/,
    'opening only on a single transfer leaves two simultaneous ones invisible')
})

test('every notification field we send is one the installed plugin accepts', () => {
  /* An unknown key in the notification payload is not a cosmetic problem: the
     Rust side deserializes it, so a field that plugin version does not know can
     take down the whole notification — which would silently remove the live
     progress the user asked for. Check the payload against the actual installed
     typings rather than trusting memory. */
  const typings = readFileSync(
    path.join(ROOT, 'node_modules/@tauri-apps/plugin-notification/dist-js/index.d.ts'),
    'utf8',
  )
  const start = typings.indexOf('interface Options {')
  const end = typings.indexOf('\n}', start)
  const options = typings.slice(start, end)
  const startCall = bg.indexOf('await sendNotification({')
  const payload = bg.slice(startCall, bg.indexOf('})', startCall))
  const keys = [...payload.matchAll(/^\s{6}([a-zA-Z]+),$/gm)].map(([, k]) => k)
  assert.ok(keys.length >= 4, `found the payload keys (${keys.join(', ')})`)
  for (const key of keys) {
    assert.match(options, new RegExp(`\\b${key}\\??:`), `${key} must exist in plugin-notification 2.5 Options`)
  }
  assert.doesNotMatch(bg, /payload\.progress/, '2.5 has no determinate-progress field')
})
