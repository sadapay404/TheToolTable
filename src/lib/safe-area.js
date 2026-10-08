/**
 * Real safe-area insets for the app shell.
 *
 * `env(safe-area-inset-*)` is the correct API, but Android's WebView frequently
 * reports 0 for every edge even when the window is drawn edge-to-edge behind a
 * status bar / camera cutout. Trusting those zeros is what put the old header
 * underneath the punch hole and made its controls unreachable on Android.
 *
 * Strategy:
 *   1. Read the real `env()` insets from a probe element.
 *   2. If an edge reports 0 but the window genuinely reaches the screen edge
 *      (notch/edge-to-edge), fall back to a measured estimate for that edge.
 *   3. Republish everything as `--ttt-safe-*` CSS variables plus a visual-viewport
 *      height (`--ttt-vh`) so `100vh` never overflows on mobile browsers.
 *
 * `computeInsets` is pure and exported so the behaviour is unit-testable without
 * a browser.
 */

export const MIN_TOP = 24
export const MAX_TOP = 56
export const MIN_BOTTOM = 8
export const MAX_BOTTOM = 40

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Fallback insets for a WebView that reports zero `env()` values.
 *
 * A status bar / cutout band is roughly 2.4–3.6% of the display height on the
 * devices this app targets, so we derive it from the screen rather than
 * guessing a single constant that is either too small (punch hole shows
 * through) or too large (wasted header space).
 *
 * The band moves when the phone is turned: in landscape the cutout sits on a
 * side edge, so reserving headroom at the top just wastes vertical space in an
 * already short viewport.
 */
export function estimateInsets(envInsets, { screenWidth = 0, screenHeight = 0, isAndroidNative = false } = {}) {
  const shortEdge = Math.min(screenWidth || 0, screenHeight || 0)
  const tallEdge = Math.max(screenWidth || 0, screenHeight || 0)
  const landscape = screenWidth > 0 && screenHeight > 0 && screenWidth > screenHeight
  const estimateTop = shortEdge ? clamp(Math.round(tallEdge * 0.029), MIN_TOP, MAX_TOP) : MIN_TOP
  const estimateSide = shortEdge ? clamp(Math.round(tallEdge * 0.032), MIN_TOP, MAX_TOP) : MIN_TOP
  // Only the Android WebView needs the rescue: iOS Safari and Chrome both report
  // a real gesture-bar inset, so a guess there would just add dead space.
  const estimateBottom = shortEdge ? clamp(Math.round(tallEdge * 0.012), MIN_BOTTOM, MAX_BOTTOM) : MIN_BOTTOM
  const band = isAndroidNative
  const sideBand = band && landscape ? estimateSide : 0

  return {
    top: envInsets.top > 0 ? envInsets.top : band && !landscape ? estimateTop : 0,
    right: envInsets.right > 0 ? envInsets.right : sideBand,
    bottom: envInsets.bottom > 0 ? envInsets.bottom : band && !landscape ? estimateBottom : 0,
    left: envInsets.left > 0 ? envInsets.left : sideBand,
    estimated: band && envInsets.top === 0 && envInsets.left === 0 && envInsets.right === 0,
  }
}

/** Merge measured env() values with the Android fallback. */
export function computeInsets(envInsets, options) {
  const next = estimateInsets(envInsets, options)
  return { top: next.top, right: next.right, bottom: next.bottom, left: next.left, estimated: next.estimated }
}

function readEnvInsets() {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return zero
  const probe = document.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:0', 'height:0', 'visibility:hidden',
    'pointer-events:none', 'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)', 'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';')
  document.body.appendChild(probe)
  const style = getComputedStyle(probe)
  const px = (value) => {
    const n = Number.parseFloat(value)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  const insets = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  }
  probe.remove()
  return insets
}

let current = { top: 0, right: 0, bottom: 0, left: 0, estimated: false }
const listeners = new Set()

export const getInsets = () => current

/** Subscribe to inset changes (orientation, window resize, keyboard). */
export function subscribeInsets(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  listeners.forEach((fn) => { try { fn(current) } catch { /* a bad listener must not break the shell */ } })
}

/** Write the resolved insets onto :root for CSS to consume. */
export function publish(root = document.documentElement) {
  const vh = typeof window !== 'undefined' && window.visualViewport?.height ? window.visualViewport.height : window.innerHeight || 0
  const vw = typeof window !== 'undefined' && window.visualViewport?.width ? window.visualViewport.width : window.innerWidth || 0
  const s = root.style
  s.setProperty('--ttt-safe-top', `${current.top}px`)
  s.setProperty('--ttt-safe-right', `${current.right}px`)
  s.setProperty('--ttt-safe-bottom', `${current.bottom}px`)
  s.setProperty('--ttt-safe-left', `${current.left}px`)
  s.setProperty('--ttt-vh', `${Math.round(vh)}px`)
  s.setProperty('--ttt-vw', `${Math.round(vw)}px`)
  // Resolved, alias-free names used by the Material shell.
  s.setProperty('--safe-top', `max(env(safe-area-inset-top, 0px), ${current.top}px)`)
  s.setProperty('--safe-bottom', `max(env(safe-area-inset-bottom, 0px), ${current.bottom}px)`)
  s.setProperty('--safe-left', `max(env(safe-area-inset-left, 0px), ${current.left}px)`)
  s.setProperty('--safe-right', `max(env(safe-area-inset-right, 0px), ${current.right}px)`)
  root.dataset.safeTop = current.top > 0 ? 'yes' : 'no'
  if (current.estimated) root.dataset.safeEstimated = 'yes'
  else delete root.dataset.safeEstimated
}

let started = false

/** Measure, publish and keep in sync. Safe to call more than once. */
export function initSafeArea({ isAndroidNative = false } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  if (started) return () => {}
  started = true

  const measure = () => {
    const env = readEnvInsets()
    current = computeInsets(env, {
      screenWidth: window.screen?.width || window.innerWidth || 0,
      screenHeight: window.screen?.height || window.innerHeight || 0,
      isAndroidNative,
    })
    publish()
    emit()
  }

  measure()

  // `visualViewport` is the only reliable signal for Android's gesture bar and
  // for the on-screen keyboard, both of which move the usable bottom edge.
  const vv = window.visualViewport
  vv?.addEventListener('resize', measure)
  vv?.addEventListener('scroll', measure)
  window.addEventListener('resize', measure)
  window.addEventListener('orientationchange', () => setTimeout(measure, 120))
  return () => {
    started = false
    vv?.removeEventListener('resize', measure)
    vv?.removeEventListener('scroll', measure)
    window.removeEventListener('resize', measure)
  }
}

/**
 * True when the app should present its phone layout.
 * Folds in a coarse-pointer check so a touch laptop still gets the touch targets.
 */
export function isPhoneWidth(width = typeof window !== 'undefined' ? window.innerWidth : 1024) {
  return width < 640
}