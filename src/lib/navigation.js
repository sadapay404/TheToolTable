/**
 * Small, explicit history for the app's tool screens. Android system back must
 * unwind app navigation before it exits the Activity; it must not depend on the
 * WebView's unrelated network/history stack.
 */

export function pushToolHistory(history, toolId) {
  const stack = Array.isArray(history) && history.length ? history : [null]
  const nextId = toolId == null ? null : String(toolId)
  if (stack[stack.length - 1] === nextId) return stack
  return [...stack, nextId]
}

export function popToolHistory(history) {
  const stack = Array.isArray(history) && history.length ? history : [null]
  if (stack.length <= 1) return { history: [null], toolId: null, moved: false }
  const next = stack.slice(0, -1)
  return { history: next, toolId: next[next.length - 1] ?? null, moved: true }
}

export function resetToolHistory() {
  return [null]
}

/**
 * Decide what a single back gesture should do. Pure, so every branch of the
 * Android back contract is unit-testable instead of only reachable on a device.
 *
 * Precedence, and why:
 *   1. Close the top-most overlay (search, appearance sheet). A back press must
 *      never dismiss two things at once.
 *   2. Unwind one tool. This is what makes back *work* inside a tool instead of
 *      closing the app.
 *   3. Return to the collection from the current tool.
 *   4. Only on the root screen does back fall through to `exit`.
 *
 * `overlays` is ordered oldest → newest; the last entry is the visible one.
 */
export function resolveBack({ history, active = null, overlays = [] } = {}) {
  const stack = Array.isArray(history) && history.length ? history : [null]
  const open = Array.isArray(overlays) ? overlays.filter(Boolean) : []

  if (open.length) {
    return { action: 'close-overlay', overlay: open[open.length - 1], history: stack, consumed: true }
  }

  const previous = popToolHistory(stack)
  if (previous.moved) {
    return { action: 'navigate', toolId: previous.toolId, history: previous.history, consumed: true }
  }

  if (active) {
    return { action: 'home', history: [null], consumed: true }
  }

  return { action: 'exit', history: [null], consumed: false }
}

/**
 * Keep one spare history entry behind the app.
 *
 * Android delivers a back gesture to the WebView whenever the native handler is
 * unavailable or fails to register. With an empty history that navigates the
 * document away and the user lands on a blank screen (reported as "black screen
 * with only the header"). A sentinel entry gives `history.back()` somewhere
 * harmless to go, which `popstate` then converts into an in-app back press.
 *
 * Returns an uninstall function.
 */
export function installHistorySentinel(onBack, { win = typeof window !== 'undefined' ? window : null, history = win?.history } = {}) {
  if (!win || !history || typeof win.addEventListener !== 'function') return () => {}
  const KEY = '__tttSentinel'
  let depth = 0

  const plant = () => {
    depth = 0
    try { history.replaceState({ [KEY]: depth }, '') } catch { /* opaque origin */ }
  }
  const arm = () => {
    try { history.pushState({ [KEY]: ++depth }, '') } catch { /* history is unavailable */ }
  }

  const onPop = () => {
    // Re-arm first: the sentinel was just consumed, and the next gesture needs a
    // fresh one before we start handling it.
    arm()
    onBack?.()
  }

  arm()
  win.addEventListener('popstate', onPop)
  return () => {
    win.removeEventListener('popstate', onPop)
    // Leave the document history the way we found it.
    try { while (depth > 0 && history.back) { history.go(-1); depth -= 1 } } catch { /* ignore */ }
    plant()
  }
}