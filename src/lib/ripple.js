/**
 * Material 3 ink ripple.
 *
 * A ripple needs a synchronous burst on pointer-down (any delay reads as lag)
 * and a fade on release. The element is always the positioned, `overflow:hidden`
 * ancestor the caller passes in, so the ripple cannot escape its surface.
 */
import { useCallback, useRef } from 'react'

const RIPPLE_CLASS = 'md3-ripple'

function spawn(host, x, y) {
  if (!host || typeof document === 'undefined') return
  // Respect the OS "reduce transparency / motion" preferences.
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced) return

  const bounds = host.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return

  const size = Math.max(bounds.width, bounds.height)
  const node = document.createElement('span')
  node.className = RIPPLE_CLASS
  node.dataset.state = 'grow'
  node.style.width = node.style.height = `${size}px`
  node.style.left = `${x - bounds.left - size / 2}px`
  node.style.top = `${y - bounds.top - size / 2}px`
  host.appendChild(node)

  const release = () => {
    node.dataset.state = 'fade'
    window.setTimeout(() => node.remove(), 450)
  }
  node.addEventListener('animationend', (event) => {
    if (event.animationName.includes('grow')) release()
  })
  // Fallback for engines that do not fire animationend for the first frame.
  window.setTimeout(() => { if (node.isConnected) release() }, 520)
}

/**
 * @param {{ disabled?: boolean, center?: boolean }} options
 *   `center` launches the ripple from the middle — used on icon buttons where a
 *   precise tap point is meaningless.
 * @returns spread onto the ripple host element
 */
export function useRipple({ disabled = false, center = false } = {}) {
  const ref = useRef(null)

  const onPointerDown = useCallback((event) => {
    if (disabled || event.button > 0) return
    const host = ref.current
    if (!host) return
    if (center || event.detail === 0) {
      const bounds = host.getBoundingClientRect()
      spawn(host, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      return
    }
    spawn(host, event.clientX, event.clientY)
  }, [disabled, center])

  return { ref, onPointerDown, 'data-ripple': disabled ? undefined : '' }
}