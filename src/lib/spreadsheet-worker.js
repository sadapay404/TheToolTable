/*
 * This module deliberately owns the SheetJS import. Do not import `xlsx` from
 * the main application realm: a spreadsheet is user-provided, untrusted input.
 * See spreadsheet.js for the disposable-worker and timeout boundary.
 */
import * as XLSX from 'xlsx'

const MAX_SHEETS = 64
const MAX_SHEET_ROWS = 100_000
const MAX_SHEET_COLUMNS = 512
const MAX_SHEET_CELLS = 1_000_000
const MAX_WORKBOOK_CELLS = 2_000_000
const MAX_OUTPUT_BYTES = 48 * 1024 * 1024
const MAX_TEXT_OUTPUT_CHARS = 16 * 1024 * 1024
const MAX_TEXT_INPUT_CHARS = 4 * 1024 * 1024
// XLSX and ODS are ZIP containers. Check central-directory metadata before
// asking SheetJS to inflate anything: the on-disk 32 MiB limit alone does not
// stop a tiny ZIP from claiming gigabytes of XML.
const MAX_ZIP_ENTRIES = 4_096
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 32 * 1024 * 1024
const MAX_ZIP_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const SAFE_INPUT_TARGETS = new Set(['xlsx', 'ods'])
const SAFE_SHEET_TARGETS = new Set(['xlsx', 'ods', 'csv', 'tsv', 'html', 'json', 'txt'])
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

const textOutput = (data) => {
  const value = String(data ?? '')
  if (value.length > MAX_TEXT_OUTPUT_CHARS) throw new Error('Spreadsheet output is too large to return safely')
  return { ok: true, kind: 'text', data: value }
}

function binaryOutput(value) {
  let buffer
  if (value instanceof ArrayBuffer) buffer = value
  else if (ArrayBuffer.isView(value)) buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  else throw new Error('Spreadsheet writer returned an invalid binary payload')
  if (buffer.byteLength > MAX_OUTPUT_BYTES) throw new Error('Spreadsheet output is too large to return safely')
  return { ok: true, kind: 'binary', data: buffer }
}

function zipSignature(bytes, offset, signature) {
  return bytes[offset] === (signature & 0xff)
    && bytes[offset + 1] === ((signature >>> 8) & 0xff)
    && bytes[offset + 2] === ((signature >>> 16) & 0xff)
    && bytes[offset + 3] === ((signature >>> 24) & 0xff)
}

/**
 * Check the ZIP central directory without inflating a byte. XLSX/ODS use ZIP;
 * legacy BIFF/CSV input does not, so it is left for SheetJS and the disposable
 * worker timeout. ZIP64 and multi-disk archives are deliberately rejected: the
 * converter's limits must be knowable before parsing starts.
 */
function preflightSpreadsheetZip(buffer) {
  const bytes = new Uint8Array(buffer)
  // Only real ZIP signatures need this preflight. A CSV is allowed to begin
  // with the printable letters “PK”; requiring the local/end-of-central-dir
  // record avoids misclassifying it as a damaged OOXML file. Compound XLS, CSV
  // and TSV do not carry a ZIP central directory.
  if (bytes.length < 4 || !(
    zipSignature(bytes, 0, 0x04034b50)
    || zipSignature(bytes, 0, 0x06054b50)
    || zipSignature(bytes, 0, 0x08074b50)
  )) return
  if (bytes.length < 22) throw new Error('Spreadsheet ZIP container is incomplete')

  const view = new DataView(buffer)
  const earliestEocd = Math.max(0, bytes.length - 65_557)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= earliestEocd; offset--) {
    if (!zipSignature(bytes, offset, 0x06054b50)) continue
    const commentLength = view.getUint16(offset + 20, true)
    if (offset + 22 + commentLength === bytes.length) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('Spreadsheet ZIP central directory is invalid')

  const disk = view.getUint16(eocd + 4, true)
  const directoryDisk = view.getUint16(eocd + 6, true)
  const entriesOnDisk = view.getUint16(eocd + 8, true)
  const entries = view.getUint16(eocd + 10, true)
  const directorySize = view.getUint32(eocd + 12, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (disk !== 0 || directoryDisk !== 0 || entriesOnDisk !== entries) {
    throw new Error('Multi-disk spreadsheet ZIP files are not supported')
  }
  // 0xffff / 0xffffffff signal ZIP64 fields we intentionally do not resolve.
  if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error('ZIP64 spreadsheets exceed this converter’s safety limits')
  }
  if (entries === 0 || entries > MAX_ZIP_ENTRIES) {
    throw new Error(`Spreadsheet ZIP has more than ${MAX_ZIP_ENTRIES.toLocaleString()} entries`)
  }
  const directoryEnd = directoryOffset + directorySize
  if (!Number.isSafeInteger(directoryEnd) || directoryOffset > bytes.length || directoryEnd > bytes.length) {
    throw new Error('Spreadsheet ZIP central directory is outside the file')
  }

  let cursor = directoryOffset
  let inflatedBytes = 0
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > directoryEnd || !zipSignature(bytes, cursor, 0x02014b50)) {
      throw new Error('Spreadsheet ZIP entry metadata is invalid')
    }
    const flags = view.getUint16(cursor + 8, true)
    const compressedBytes = view.getUint32(cursor + 20, true)
    const uncompressedBytes = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength
    if (!Number.isSafeInteger(entryEnd) || entryEnd > directoryEnd) {
      throw new Error('Spreadsheet ZIP entry metadata is truncated')
    }
    if ((flags & 0x0001) !== 0) throw new Error('Encrypted spreadsheets are not supported')
    if (compressedBytes > bytes.length || uncompressedBytes > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error('Spreadsheet ZIP entry exceeds the safety limit')
    }
    inflatedBytes += uncompressedBytes
    if (!Number.isSafeInteger(inflatedBytes) || inflatedBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error('Spreadsheet ZIP would expand beyond the 64 MiB safety limit')
    }
    cursor = entryEnd
  }
  if (cursor !== directoryEnd) throw new Error('Spreadsheet ZIP central directory has trailing data')
}

function safeSheetName(name) {
  const value = String(name || '')
  if (!value || value.length > 128) throw new Error('Workbook has an invalid sheet name')
  if (RESERVED_OBJECT_KEYS.has(value)) throw new Error(`Workbook sheet name "${value}" is not safe to export`)
  return value
}

/**
 * SheetJS reads a workbook before it exposes the sheet dimensions. The Worker
 * keeps that parsing out of the app UI; these bounds prevent follow-on exports
 * from expanding a small, malicious archive into an unbounded JSON/CSV result.
 */
function validateWorkbook(workbook) {
  const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : []
  if (!names.length) throw new Error('Workbook has no sheets')
  if (names.length > MAX_SHEETS) throw new Error(`Workbook has more than ${MAX_SHEETS} sheets`)

  let workbookCells = 0
  for (const rawName of names) {
    const name = safeSheetName(rawName)
    const sheet = workbook.Sheets?.[name]
    if (!sheet || typeof sheet !== 'object') throw new Error(`Workbook sheet "${name}" is invalid`)
    const ref = sheet['!ref']
    if (!ref) continue

    let range
    try { range = XLSX.utils.decode_range(ref) } catch { throw new Error(`Workbook sheet "${name}" has an invalid range`) }
    const rows = range.e.r - range.s.r + 1
    const columns = range.e.c - range.s.c + 1
    if (!Number.isSafeInteger(rows) || !Number.isSafeInteger(columns) || rows < 1 || columns < 1) {
      throw new Error(`Workbook sheet "${name}" has an invalid range`)
    }
    if (rows > MAX_SHEET_ROWS || columns > MAX_SHEET_COLUMNS) {
      throw new Error(`Workbook sheet "${name}" exceeds the ${MAX_SHEET_ROWS.toLocaleString()} row / ${MAX_SHEET_COLUMNS} column safety limit`)
    }
    const cells = rows * columns
    if (!Number.isSafeInteger(cells) || cells > MAX_SHEET_CELLS) {
      throw new Error(`Workbook sheet "${name}" has too many cells to convert safely`)
    }
    workbookCells += cells
    if (workbookCells > MAX_WORKBOOK_CELLS) throw new Error('Workbook has too many cells to convert safely')
  }
  return names.map(safeSheetName)
}

function serializeSheets(workbook, names) {
  // A null-prototype container means a sheet called "constructor" cannot alter
  // the object that holds the exported JSON. The name was already rejected, but
  // this keeps the output path defensive if SheetJS changes its representation.
  const output = Object.create(null)
  for (const name of names) {
    output[name] = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null })
  }
  return JSON.stringify(output, null, 2)
}

function writeTextWorkbook(text, target) {
  if (!SAFE_INPUT_TARGETS.has(target)) throw new Error(`Unsupported spreadsheet output: ${target}`)
  const value = String(text ?? '')
  if (value.length > MAX_TEXT_INPUT_CHARS) throw new Error('Text input is too large to create a spreadsheet safely')
  const lines = value.split(/\r?\n/)
  if (lines.length > MAX_SHEET_ROWS) throw new Error(`Text input has more than ${MAX_SHEET_ROWS.toLocaleString()} rows`)

  const sheet = XLSX.utils.aoa_to_sheet(lines.map((line) => [line]))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Content')
  return binaryOutput(XLSX.write(workbook, { bookType: target, type: 'array' }))
}

function convertSheet(buffer, target) {
  if (!SAFE_SHEET_TARGETS.has(target)) throw new Error(`Unsupported spreadsheet output: ${target}`)
  if (!(buffer instanceof ArrayBuffer)) throw new Error('Spreadsheet input was not a binary file')

  preflightSpreadsheetZip(buffer)
  const workbook = XLSX.read(buffer, { type: 'array' })
  const names = validateWorkbook(workbook)
  const first = names[0]

  if (target === 'json') return textOutput(serializeSheets(workbook, names))
  if (target === 'txt') return textOutput(names.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n\n'))
  if (target === 'csv') return textOutput(XLSX.utils.sheet_to_csv(workbook.Sheets[first]))
  if (target === 'tsv') return textOutput(XLSX.utils.sheet_to_csv(workbook.Sheets[first], { FS: '\t' }))
  return binaryOutput(XLSX.write(workbook, { bookType: target, type: 'array' }))
}

self.onmessage = ({ data }) => {
  try {
    let result
    if (data?.operation === 'write-text') result = writeTextWorkbook(data.text, data.target)
    else if (data?.operation === 'convert-sheet') result = convertSheet(data.buffer, data.target)
    else throw new Error('Unknown spreadsheet worker operation')

    if (result.kind === 'binary') self.postMessage(result, [result.data])
    else self.postMessage(result)
  } catch (error) {
    self.postMessage({ ok: false, error: String(error?.message || error).slice(0, 500) })
  }
}
