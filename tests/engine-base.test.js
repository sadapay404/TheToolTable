import test from 'node:test'
import assert from 'node:assert/strict'
import { engine, getBase, setBase } from '../src/lib/engine.js'

const values = new Map()
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null },
  setItem(key, value) { values.set(key, String(value)) },
}

test('downloader engine base persists and removes trailing slashes', () => {
  setBase('  https://media.example.test/api/ytdlp///  ')
  assert.equal(getBase(), 'https://media.example.test/api/ytdlp')
})

test('downloader falls back to the same-origin Vite endpoint', () => {
  values.delete('ttt.engine.base')
  assert.equal(getBase(), '/api/ytdlp')
})

test('health checks use the persisted engine address', async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return new Response(JSON.stringify({ ok: true, ytdlp: 'test' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    setBase('https://engine.example.test/api/ytdlp')
    const health = await engine.health()
    assert.equal(health.ok, true)
    assert.equal(requestedUrl, 'https://engine.example.test/api/ytdlp/health')
  } finally {
    globalThis.fetch = originalFetch
  }
})
