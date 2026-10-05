import test from 'node:test'
import assert from 'node:assert/strict'
import { createObjectUrlResource, releaseMediaElement, waitForMediaElement } from '../src/lib/studio/media-source.js'

test('owned object URL resources revoke once even when cleanup paths run more than once', () => {
  const revoked = []
  const api = { createObjectURL: () => 'blob:test-source', revokeObjectURL: (url) => revoked.push(url) }
  const resource = createObjectUrlResource({ name: 'photo.png' }, api)
  assert.equal(resource.url, 'blob:test-source')
  assert.equal(resource.released, false)
  assert.equal(resource.release(), true)
  assert.equal(resource.release(), false)
  assert.equal(resource.released, true)
  assert.deepEqual(revoked, ['blob:test-source'])
})

test('media load resolves on its ready event and can be cancelled without a stale completion', async () => {
  const element = new EventTarget()
  let assigned
  Object.defineProperty(element, 'src', { set(value) { assigned = value } })
  const load = waitForMediaElement(element, 'load', 'blob:image')
  assert.equal(assigned, 'blob:image')
  element.dispatchEvent(new Event('load'))
  assert.deepEqual(await load.promise, { ok: true })

  const pending = waitForMediaElement(element, 'loadeddata', 'blob:video')
  pending.cancel()
  assert.deepEqual(await pending.promise, { cancelled: true })
  element.dispatchEvent(new Event('loadeddata'))
  assert.deepEqual(await pending.promise, { cancelled: true })
})

test('media element release pauses and unloads video sources safely', () => {
  const calls = []
  const video = {
    pause: () => calls.push('pause'),
    removeAttribute: (name) => calls.push(`remove:${name}`),
    load: () => calls.push('load'),
  }
  releaseMediaElement(video)
  releaseMediaElement(null)
  assert.deepEqual(calls, ['pause', 'remove:src', 'load'])
})
