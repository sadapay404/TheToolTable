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
