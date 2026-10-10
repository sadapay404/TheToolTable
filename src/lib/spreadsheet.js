/**
 * Spreadsheet conversion boundary.
 *
 * SheetJS is a useful format implementation, but spreadsheets are hostile input:
 * they can be deeply nested archives, carry enormous declared ranges, or trigger
 * parser bugs. Keep it in a disposable Worker so a malformed file cannot modify
 * the app page's prototypes or block its UI thread. The worker is terminated on
 * every outcome, including a timeout.
 */

export const MAX_SPREADSHEET_BYTES = 32 * 1024 * 1024
export const MAX_SPREADSHEET_TEXT_CHARS = 4 * 1024 * 1024
export const SPREADSHEET_TIMEOUT_MS = 25_000

const OUTPUT_MIME = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  html: 'text/html',
  json: 'application/json',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
}

const INPUT_TARGETS = new Set(['xlsx', 'ods'])
const SHEET_TARGETS = new Set(Object.keys(OUTPUT_MIME))

function safetyError(message) {
  return new Error(`Spreadsheet safety check: ${message}`)
}

/** Refuse files before copying their bytes into a Worker. */
export function assertSpreadsheetInput(file) {
  const size = Number(file?.size)
  if (!Number.isFinite(size) || size < 0) throw safetyError('the file size is unavailable')
  if (size === 0) throw safetyError('the file is empty')
  if (size > MAX_SPREADSHEET_BYTES) {
    throw safetyError(`files must be ${Math.round(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB or smaller`)
  }
  return size
}

function outputMime(target) {
  return OUTPUT_MIME[target] || 'application/octet-stream'
}

function workerError(message) {
  return new Error(`Spreadsheet conversion could not start: ${message}`)
}

/**
 * Run exactly one job in a fresh worker. Terminating it is intentional: it
 * drops any parser-created state and makes the timeout a real cancellation,
 * rather than merely rejecting a Promise while hostile code keeps running.
 */
function runSpreadsheetWorker(payload, transfers = []) {
  if (typeof Worker !== 'function') {
    throw workerError('this browser does not support isolated Web Workers. Update Android System WebView and try again.')
  }

  return new Promise((resolve, reject) => {
    let worker
    let timer
    let settled = false

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { worker?.terminate() } catch { /* the worker is already gone */ }
      callback(value)
    }

    try {
      worker = new Worker(new URL('./spreadsheet-worker.js', import.meta.url), { type: 'module' })
      timer = setTimeout(() => {
        finish(reject, safetyError(`conversion exceeded the ${Math.round(SPREADSHEET_TIMEOUT_MS / 1000)} second limit and was stopped`))
      }, SPREADSHEET_TIMEOUT_MS)
      worker.onmessage = ({ data }) => {
        if (data?.ok) finish(resolve, data)
        else finish(reject, new Error(String(data?.error || 'Spreadsheet worker failed')))
      }
      worker.onerror = (event) => {
        finish(reject, new Error(`Spreadsheet worker failed: ${event?.message || 'unknown error'}`))
      }
      worker.postMessage(payload, transfers)
    } catch (error) {
      finish(reject, workerError(String(error?.message || error)))
    }
  })
}

function blobFromWorker(result, target) {
  if (result?.kind === 'text') {
    if (typeof result.data !== 'string') throw new Error('Spreadsheet worker returned invalid text output')
    return new Blob([result.data], { type: outputMime(target) })
  }
  if (result?.kind === 'binary' && result.data instanceof ArrayBuffer) {
    return new Blob([result.data], { type: outputMime(target) })
  }
  throw new Error('Spreadsheet worker returned an invalid output payload')
}

/** Write text into an XLSX or ODS workbook without loading its parser into the app page. */
export async function writeTextSpreadsheet(text, target, onProgress) {
  if (!INPUT_TARGETS.has(target)) throw new Error(`Unsupported spreadsheet output: ${target}`)
  const value = String(text ?? '')
  if (value.length > MAX_SPREADSHEET_TEXT_CHARS) {
    throw safetyError(`text input must be ${Math.round(MAX_SPREADSHEET_TEXT_CHARS / 1024 / 1024)} MiB or smaller`)
  }
  const lines = value.split(/\r?\n/)
  if (lines.length > 100_000) throw safetyError('text input has more than 100,000 rows')

  onProgress?.(70)
  const result = await runSpreadsheetWorker({ operation: 'write-text', target, text: value })
  onProgress?.(100)
  return { blob: blobFromWorker(result, target), ext: target }
}

/** Read/rewrite a workbook in an isolated realm with a hard input and time bound. */
export async function convertSpreadsheet(file, target, onProgress) {
  if (!SHEET_TARGETS.has(target)) throw new Error(`Unsupported spreadsheet output: ${target}`)
  assertSpreadsheetInput(file)
  const buffer = await file.arrayBuffer()
  if (buffer.byteLength > MAX_SPREADSHEET_BYTES) {
    throw safetyError(`files must be ${Math.round(MAX_SPREADSHEET_BYTES / 1024 / 1024)} MiB or smaller`)
  }

  onProgress?.(18)
  const result = await runSpreadsheetWorker(
    { operation: 'convert-sheet', target, buffer },
    [buffer],
  )
  onProgress?.(100)
  return { blob: blobFromWorker(result, target), ext: target }
}
