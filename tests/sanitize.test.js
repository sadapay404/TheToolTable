import test from 'node:test'
import assert from 'node:assert/strict'
import { detectType, scrub, scrubJPEG, scrubPNG } from '../src/lib/sanitize.js'

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}

const ascii = (s) => new TextEncoder().encode(s)

function pngChunk(type, data = new Uint8Array()) {
  const chunk = new Uint8Array(12 + data.length)
  new DataView(chunk.buffer).setUint32(0, data.length, false)
  chunk.set(ascii(type), 4)
  chunk.set(data, 8)
  // CRC bytes are opaque to the scrubber and are deliberately preserved.
  return chunk
}

function pngChunkNames(bytes) {
  const names = []
  let i = 8
  while (i + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(i, false)
    const name = new TextDecoder().decode(bytes.subarray(i + 4, i + 8))
    names.push(name)
    i += 12 + length
    if (name === 'IEND') break
  }
  return names
}

test('metadata scrub detects full JPEG and PNG signatures', () => {
  assert.equal(detectType(new Uint8Array([0xff, 0xd8])), 'jpeg')
  assert.equal(detectType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), null)
  assert.equal(detectType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
})

test('JPEG scrub removes APP metadata but preserves coding and scan bytes', async () => {
  const source = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x05, 0x45, 0x58, 0x49, // APP1 metadata segment
    0xff, 0xdb, 0x00, 0x04, 0x11, 0x22,       // DQT coding segment
    0xff, 0xda, 0x00, 0x02,                   // SOS
    0x31, 0xff, 0x00, 0x41, 0xff, 0xd9,       // scan data with stuffed FF
  ])
  const result = scrub(source.buffer)
  assert.equal(result.type, 'jpeg')
  const output = new Uint8Array(await result.blob.arrayBuffer())
  assert.equal(output.includes(0xe1), false)
  assert.equal(output.includes(0xdb), true)
  assert.deepEqual([...output.slice(-7)], [...source.slice(-7)])
})

test('PNG scrub removes ancillary metadata while preserving critical image chunks', async () => {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const source = concat(signature,
    pngChunk('IHDR', new Uint8Array(13)),
    pngChunk('tEXt', ascii('Comment\0private GPS data')),
    pngChunk('IDAT', new Uint8Array([1, 2, 3, 4])),
    pngChunk('IEND'))
  const result = scrub(source.buffer)
  assert.equal(result.type, 'png')
  const output = new Uint8Array(await result.blob.arrayBuffer())
  assert.deepEqual(pngChunkNames(output), ['IHDR', 'IDAT', 'IEND'])
  assert.equal(new TextDecoder().decode(output).includes('private GPS data'), false)
})

test('scrub rejects malformed JPEG and truncated PNG chunks', () => {
  assert.throws(() => scrubJPEG(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10])), /Truncated JPEG segment/)
  const truncated = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 20, 0x49, 0x44, 0x41, 0x54, 1, 2, 3, 4])
  assert.throws(() => scrubPNG(truncated), /Truncated PNG chunk/)
  assert.equal(scrub(new Uint8Array([1, 2, 3]).buffer), null)
})
