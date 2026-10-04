/* Tiny media-query hook — the shell and the shared kits use it to switch between the pointer layout
   and the touch layout without duplicating whole components. */
import { useEffect, useState } from 'react'

export function useMedia(query) {
  const [on, setOn] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(query)
    const h = (e) => setOn(e.matches)
    setOn(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return on
}

/** Phone / small-tablet layout: 720px is where the desktop header stops fitting, and a rotated
    phone is caught by its short height on a touch screen. Mirrors the media query in styles.css. */
export const MOBILE_QUERY = '(max-width: 720px), (pointer: coarse) and (max-height: 500px)'
export const useMobile = () => useMedia(MOBILE_QUERY)

/** True on real pointer devices — tilt and hover effects are pointless (and janky) on touch. */
export const useCanHover = () => useMedia('(hover: hover) and (pointer: fine)')
