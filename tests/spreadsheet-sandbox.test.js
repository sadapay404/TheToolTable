import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MAX_SPREADSHEET_BYTES,
  MAX_SPREADSHEET_TEXT_CHARS,
  SPREADSHEET_TIMEOUT_MS,
  assertSpreadsheetInput,
} from '../src/lib/spreadsheet.js'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('spreadsheet inputs are bounded before their bytes reach the parser', () => {
  assert.equal(assertSpreadsheetInput({ size: 1 }), 1)
  assert.equal(assertSpreadsheetInput({ size: MAX_SPREADSHEET_BYTES }), MAX_SPREADSHEET_BYTES)
  assert.throws(() => assertSpreadsheetInput({ size: 0 }), /empty/)
  assert.throws(() => assertSpreadsheetInput({ size: MAX_SPREADSHEET_BYTES + 1 }), /MiB or smaller/)
  assert.throws(() => assertSpreadsheetInput({ size: Number.NaN }), /size is unavailable/)
  assert.ok(MAX_SPREADSHEET_TEXT_CHARS < MAX_SPREADSHEET_BYTES)
  assert.ok(SPREADSHEET_TIMEOUT_MS >= 10_000 && SPREADSHEET_TIMEOUT_MS <= 60_000)
})

test('the main converter never imports SheetJS into the application realm', () => {
  const engine = read('src/lib/engines.js')
  const boundary = read('src/lib/spreadsheet.js')
  const worker = read('src/lib/spreadsheet-worker.js')

  assert.doesNotMatch(engine, /import\(['"]xlsx['"]\)/,
    'parsing a malicious workbook on the UI thread can freeze the entire app')
  assert.match(engine, /convertSpreadsheet\(file, target, onProg\)/)
  assert.match(engine, /writeTextSpreadsheet\(text, target, onProg\)/)
  assert.match(boundary, /new Worker\(new URL\('\.\/spreadsheet-worker\.js', import\.meta\.url\)/)
  assert.match(boundary, /worker\?\.terminate\(\)/,
    'a timed-out parser has to be stopped, not merely ignored')
  assert.match(worker, /import \* as XLSX from 'xlsx'/)
  assert.match(worker, /validateWorkbook\(workbook\)/)
  assert.match(worker, /MAX_SHEET_CELLS/)
  assert.match(worker, /MAX_WORKBOOK_CELLS/)
  assert.match(worker, /self\.onmessage/)
})
