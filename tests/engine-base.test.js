import test from 'node:test'
import assert from 'node:assert/strict'
import { engine, getBase, setBase, selectEngine } from '../src/lib/engine.js'

const values = new Map()
globalThis.localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null },
  setItem(key, value) { values.set(key, String(value)) },
}

test('Android Tauri selects the configurable companion when no Android runner is bundled', () => {
  const android = selectEngine({ tauri: true, android: true })
  assert.equal(android.kind, 'http')
  assert.equal(android.bundled, false)
  const runner = { version: async () => 'test', hasFfmpeg: async () => true, spawn() {}, downloadsDir: async () => '', sizeOf: async () => 0 }
  assert.equal(selectEngine({ tauri: true, android: true, androidRunner: runner }).kind, 'android')
  assert.equal(selectEngine({ tauri: true, android: false, desktopRunner: () => runner }).kind, 'desktop')
})

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
