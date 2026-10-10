import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerUrl = pathToFileURL(path.join(ROOT, 'src/lib/spreadsheet-worker.js')).href

/**
 * Run the worker module in a fresh Node process with a tiny WorkerGlobalScope
 * shim. A subprocess avoids cross-test pollution from `self` and verifies the
 * same SheetJS operations that the browser Worker executes.
 */
test('the isolated spreadsheet worker writes and reads a bounded workbook', () => {
  const program = `
    import * as XLSX from 'xlsx'
    globalThis.self = {
      messages: [],
      postMessage(message) { this.messages.push(message) },
    }
    await import(${JSON.stringify(`${workerUrl}?test=roundtrip`)})
    const run = (data) => {
      self.messages = []
      self.onmessage({ data })
      const result = self.messages[0]
      if (!result?.ok) throw new Error(result?.error || 'worker produced no result')
      return result
    }
    const written = run({ operation: 'write-text', target: 'xlsx', text: 'first\\nsecond' })
    if (written.kind !== 'binary' || !(written.data instanceof ArrayBuffer)) throw new Error('writer did not return a binary workbook')
    const book = XLSX.read(written.data, { type: 'array' })
    if (XLSX.utils.sheet_to_csv(book.Sheets.Content).trim() !== 'first\\nsecond') throw new Error('written workbook has the wrong cells')
    const ods = run({ operation: 'write-text', target: 'ods', text: 'hello\\nworld' })
    const odsBook = XLSX.read(ods.data, { type: 'array' })
    if (odsBook.Sheets.Content?.A1?.v !== 'hello') throw new Error('ODS writer has the wrong cells')
    const json = run({ operation: 'convert-sheet', target: 'json', buffer: written.data })
    const rows = JSON.parse(json.data).Content
    // SheetJS's normal JSON mode treats the first row as headers, matching the
    // converter's previous output contract.
    if (rows.length !== 1 || rows[0].first !== 'second') throw new Error('worker JSON conversion has the wrong cells')
    // CSV is not a ZIP merely because its first cell happens to start with PK.
    const csv = run({ operation: 'convert-sheet', target: 'json', buffer: new TextEncoder().encode('PK,number\\nvalue,7').buffer })
    if (!JSON.parse(csv.data).Sheet1?.[0]?.PK) throw new Error('worker misclassified a PK-prefixed CSV as ZIP')
    // Turn one harmless central-directory entry into a declared ZIP bomb. The
    // worker must reject metadata before SheetJS can try to inflate it.
    const bomb = written.data.slice(0)
    const bombBytes = new Uint8Array(bomb)
    const bombView = new DataView(bomb)
    let central = -1
    for (let i = 0; i + 46 <= bombBytes.length; i++) {
      if (bombBytes[i] === 0x50 && bombBytes[i + 1] === 0x4b && bombBytes[i + 2] === 0x01 && bombBytes[i + 3] === 0x02) { central = i; break }
    }
    if (central < 0) throw new Error('test workbook has no ZIP central directory')
    bombView.setUint32(central + 24, 33 * 1024 * 1024, true)
    self.messages = []
    self.onmessage({ data: { operation: 'convert-sheet', target: 'json', buffer: bomb } })
    if (self.messages[0]?.ok || !/ZIP entry exceeds the safety limit/.test(self.messages[0]?.error || '')) {
      throw new Error('worker accepted ZIP-bomb metadata')
    }
    console.log('worker round trip passed')
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`spreadsheet worker smoke failed:\n${result.stdout || ''}${result.stderr || result.error || ''}`)
  }
  assert.match(result.stdout, /worker round trip passed/)
})
