import test from 'node:test'
import assert from 'node:assert/strict'

function eventTarget() {
  const listeners = new Map()
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type) {
      for (const listener of [...(listeners.get(type) || [])]) listener({ type })
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0
    },
  }
}

function saveGlobal(name) {
  return { name, exists: Object.prototype.hasOwnProperty.call(globalThis, name), value: globalThis[name] }
}

function restoreGlobal({ name, exists, value }) {
  if (exists) globalThis[name] = value
  else delete globalThis[name]
}

test('safe-area measurement stays off the visual-viewport scroll path while resize and cleanup remain intact', async () => {
  const saved = ['window', 'document', 'getComputedStyle'].map(saveGlobal)
  const styleWrites = []
  const probes = new Set()
  const root = {
    style: { setProperty: (name, value) => styleWrites.push([name, value]) },
    dataset: {},
  }
  const visualViewport = Object.assign(eventTarget(), { width: 412, height: 915 })
  const windowTarget = Object.assign(eventTarget(), {
    innerWidth: 412,
    innerHeight: 915,
    screen: { width: 412, height: 915 },
    visualViewport,
  })
  const documentTarget = {
    documentElement: root,
    body: { appendChild: (node) => probes.add(node) },
    createElement: () => {
      const node = {
        style: {},
        setAttribute() {},
        remove: () => probes.delete(node),
      }
      return node
    },
  }

  try {
    globalThis.window = windowTarget
    globalThis.document = documentTarget
    globalThis.getComputedStyle = () => ({ paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' })

    // The query string gives this test an isolated module instance, including
    // the module-level `started` guard used by the production shell.
    const url = new URL(`../src/lib/safe-area.js?lifecycle=${Date.now()}-${Math.random()}`, import.meta.url)
    const { initSafeArea } = await import(url.href)
    const dispose = initSafeArea({ isAndroidNative: true })

    assert.equal(visualViewport.listenerCount('scroll'), 0, 'page scrolling must not measure safe areas')
    assert.equal(visualViewport.listenerCount('resize'), 1, 'keyboard/viewport resize handling must remain')
    assert.equal(windowTarget.listenerCount('resize'), 1)
    assert.equal(windowTarget.listenerCount('orientationchange'), 1)
    assert.equal(probes.size, 0, 'the initial measurement removes its probe')
    assert.ok(styleWrites.some(([name]) => name === '--ttt-safe-top'), 'the initial measurement still publishes safe insets')

    styleWrites.length = 0
    visualViewport.dispatch('scroll')
    assert.equal(styleWrites.length, 0, 'a visual-viewport scroll cannot rewrite root styles')
    assert.equal(probes.size, 0, 'a visual-viewport scroll cannot create a measurement probe')

    visualViewport.dispatch('resize')
    assert.equal(styleWrites.length, 0, 'an identical resize must not rewrite root styles')

    visualViewport.height = 700
    visualViewport.dispatch('resize')
    assert.ok(styleWrites.some(([name, value]) => name === '--ttt-vh' && value === '700px'),
      'a real viewport resize must still refresh keyboard-safe height')

    dispose()
    assert.equal(visualViewport.listenerCount('resize'), 0, 'cleanup releases the visual-viewport resize listener')
    assert.equal(windowTarget.listenerCount('resize'), 0, 'cleanup releases the window resize listener')
    assert.equal(windowTarget.listenerCount('orientationchange'), 0, 'cleanup releases the orientation listener')
  } finally {
    saved.forEach(restoreGlobal)
  }
})
