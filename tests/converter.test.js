import test from 'node:test'
import assert from 'node:assert/strict'
import { convertFile, kindOf } from '../src/lib/engines.js'

function file(name, content, type = 'text/plain') {
  return new File([content], name, { type })
}

test('converter recognizes common media and office extensions when browser MIME is empty', () => {
  assert.equal(kindOf(file('clip.mp4', 'x', '')), 'video')
  assert.equal(kindOf(file('clip.mkv', 'x', '')), 'video')
  assert.equal(kindOf(file('photo.jpg', 'x', '')), 'image')
  assert.equal(kindOf(file('voice.mp3', 'x', '')), 'audio')
  assert.equal(kindOf(file('voice.opus', 'x', '')), 'audio')
  assert.equal(kindOf(file('scan.pdf', 'x', '')), 'pdf')
  assert.equal(kindOf(file('sheet.xlsx', 'x', '')), 'sheet')
  assert.equal(kindOf(file('legacy.ppt', 'x', 'application/vnd.ms-powerpoint')), 'other')
  assert.equal(kindOf(file('unknown.bin', 'x', 'application/octet-stream')), 'other')
})

test('text-to-HTML conversion escapes source text and filenames', async () => {
  const source = file('a<&.txt', '<script>alert("x")</script>')
  const result = await convertFile(source, 'text', 'html')
  assert.equal(result.ext, 'html')
  const output = await result.blob.text()
  assert.equal(output.includes('<script>'), false)
  assert.equal(output.includes('&lt;script&gt;'), true)
  assert.equal(output.includes('a&lt;&amp;.txt'), true)
})

test('text-to-JSON conversion is parseable and reports source content', async () => {
  const result = await convertFile(file('notes.txt', 'first\nsecond'), 'text', 'json')
  const json = JSON.parse(await result.blob.text())
  assert.equal(result.ext, 'json')
  assert.equal(json.title, 'notes.txt')
  assert.deepEqual(json.content, ['first', 'second'])
})

test('text-to-PPTX returns a downloadable ZIP Blob instead of a writer filename', async () => {
  const result = await convertFile(file('notes.txt', 'first\nsecond'), 'text', 'pptx')
  assert.equal(result.ext, 'pptx')
  assert.ok(result.blob instanceof Blob)
  assert.ok(result.blob.size > 1_000)
  const bytes = new Uint8Array(await result.blob.arrayBuffer())
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
})

test('archive conversion lists files through the bounded ZIP reader', async () => {
  const { zipSync, strToU8 } = await import('fflate')
  const archive = zipSync({ 'notes/readme.txt': strToU8('hello'), 'image.bin': new Uint8Array([1, 2, 3]) })
  const result = await convertFile(file('bundle.zip', archive, 'application/zip'), 'zip', 'json')
  const json = JSON.parse(await result.blob.text())
  assert.deepEqual(json.files.map(({ name, bytes }) => [name, bytes]), [['notes/readme.txt', 5], ['image.bin', 3]])
})
