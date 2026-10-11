import test from 'node:test'
import assert from 'node:assert/strict'
import { popToolHistory, pushToolHistory, resetToolHistory, resolveBack, installHistorySentinel } from '../src/lib/navigation.js'

test('tool navigation stacks prior screens and ignores duplicate pushes', () => {
  let history = resetToolHistory()
  history = pushToolHistory(history, 'clipper')
  history = pushToolHistory(history, 'metadata')
  history = pushToolHistory(history, 'metadata')
  assert.deepEqual(history, [null, 'clipper', 'metadata'])
})

test('system back unwinds tool history and only reports root when the home route remains', () => {
  const first = popToolHistory([null, 'clipper', 'metadata'])
  assert.deepEqual(first, { history: [null, 'clipper'], toolId: 'clipper', moved: true })
  const home = popToolHistory([null, 'clipper'])
  assert.deepEqual(home, { history: [null], toolId: null, moved: true })
  const root = popToolHistory(home.history)
  assert.deepEqual(root, { history: [null], toolId: null, moved: false })
})

/* ------------------------------------------ Part 2: the Android back contract */

test('back inside a tool returns to the collection instead of leaving the app', () => {
  // Bug 6: the gesture met an empty stack and fell straight through to exit().
  const decision = resolveBack({ history: [null, 'qr'], active: { id: 'qr' }, overlays: [] })
  assert.equal(decision.consumed, true, 'back must never reach exit() from inside a tool')
  assert.notEqual(decision.action, 'exit')
  // Unwinding the one-tool stack lands on the collection root.
  assert.equal(decision.toolId, null)
  assert.deepEqual(decision.history, [null])
})

test('an inconsistent stack still resolves to the collection, never to exit', () => {
  // Active tool but no stack behind it: the defensive branch.
  const decision = resolveBack({ history: [null], active: { id: 'qr' }, overlays: [] })
  assert.equal(decision.action, 'home')
  assert.equal(decision.consumed, true)
})

test('back unwinds one level of the tool stack', () => {
  const decision = resolveBack({ history: [null, 'qr', 'pdf'], active: { id: 'pdf' }, overlays: [] })
  assert.equal(decision.action, 'navigate')
  assert.equal(decision.toolId, 'qr')
  assert.deepEqual(decision.history, [null, 'qr'])
})

test('back never dismisses an overlay and a tool in one gesture', () => {
  const decision = resolveBack({ history: [null, 'qr'], active: { id: 'qr' }, overlays: ['search'] })
  assert.equal(decision.action, 'close-overlay')
  assert.equal(decision.overlay, 'search')
  // The tool stack must be untouched so the next back still lands on the tool.
  assert.deepEqual(decision.history, [null, 'qr'])
})

test('the top-most overlay is the one that closes', () => {
  const decision = resolveBack({ history: [null], active: null, overlays: ['personalize', 'search'] })
  assert.equal(decision.overlay, 'search')
})

test('back is allowed to leave the app only at the root with nothing open', () => {
  const decision = resolveBack({ history: [null], active: null, overlays: [] })
  assert.equal(decision.action, 'exit')
  assert.equal(decision.consumed, false)
})

test('a malformed history stack still resolves instead of throwing', () => {
  for (const history of [undefined, null, [], 'nonsense', 42]) {
    const decision = resolveBack({ history, active: { id: 'qr' }, overlays: undefined })
    assert.ok(['home', 'navigate', 'exit', 'close-overlay'].includes(decision.action))
  }
})

test('a history sentinel turns a WebView popstate into an in-app back press', () => {
  const events = {}
  let depth = 0
  const fakeHistory = {
    pushState() { depth += 1 },
    replaceState() {},
    back() {},
    go() {},
  }
  const fakeWindow = {
    history: fakeHistory,
    addEventListener(type, fn) { events[type] = fn },
    removeEventListener(type) { delete events[type] },
  }
  let backs = 0
  const uninstall = installHistorySentinel(() => { backs += 1 }, { win: fakeWindow, history: fakeHistory })
  assert.equal(depth, 1, 'a sentinel entry must be planted immediately')
  assert.ok(events.popstate, 'the listener must be installed')

  events.popstate()
  assert.equal(backs, 1)
  assert.equal(depth, 2, 'the sentinel is re-armed so the next gesture has somewhere to go')

  events.popstate()
  assert.equal(backs, 2)
  uninstall()
  assert.equal(events.popstate, undefined)
})

test('the sentinel is a no-op when history is unavailable', () => {
  const uninstall = installHistorySentinel(() => { throw new Error('must not run') }, { win: null })
  assert.equal(typeof uninstall, 'function')
  uninstall()
})
