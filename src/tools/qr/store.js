import { createContext, useContext, useSyncExternalStore, useCallback, useRef } from 'react'
import { normalizeQrState } from '../../lib/qr/state.js'
const NS = 'ttt.qr.'
const mem = Object.create(null), subs = Object.create(null)
const read = (k, d) => { try { const s = localStorage.getItem(NS + k); return s ? JSON.parse(s) : d } catch { return d } }
export function useStore(key, init) {
  const initRef = useRef(init)
  if (!(key in mem)) mem[key] = normalizeQrState(key, read(key, initRef.current), initRef.current)
  const sub = useCallback((f) => { (subs[key] = subs[key] || new Set()).add(f); return () => subs[key].delete(f) }, [key])
  const v = useSyncExternalStore(sub, () => mem[key], () => mem[key])
  const set = useCallback((n) => {
    const next = typeof n === 'function' ? n(mem[key]) : n
    const nv = normalizeQrState(key, next, initRef.current)
    mem[key] = nv
    try { localStorage.setItem(NS + key, JSON.stringify(nv)) } catch {}
    subs[key]?.forEach((f) => f())
  }, [key])
  return [v, set]
}
export const QRCtx = createContext(null)
export const useQR = () => useContext(QRCtx)
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
