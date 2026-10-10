import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
export { SPRING, Panel, Label, Seg, CountText, Chips, CopyBtn } from '../exchange/parts.jsx'
export { Switch, Range, Stepper, PrimaryBtn, Burst } from '../decision/parts.jsx'
import { SPRING } from '../exchange/parts.jsx'
import { useDecorativeMotion } from '../../lib/motion.js'

/* ---------- icons (24px line set) ---------- */
const P = {
  upload: 'M12 16V4m0 0 4 4m-4-4-4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 19h16',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  pdf: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M8.5 17v-4h1.6a1.2 1.2 0 0 1 0 2.4H8.5',
  merge: 'M6 4v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4v3M18 4v5a4 4 0 0 1-4 4M14 20l4 0',
  split: 'M12 3v8m0 0-5 5v5m5-10 5 5v5M7 16H4m16 0h-3',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', x: 'M6 6l12 12M18 6 6 18', check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  stop: 'M7 7h10v10H7z', play: 'M8 5v14l11-7z', pause: 'M8 5v14M16 5v14',
  text: 'M5 6V4h14v2M12 4v16M9 20h6', type: 'M5 6V4h14v2M12 4v16M9 20h6',
  lang: 'M4 5h8M8 3v2m-3 0c.5 3.5 3 6 6 7M11 5c-.5 3.5-3 6.5-7 8M13 21l4-10 4 10M14.4 18h5.2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  send: 'M21 3 3 10.5l7 3 3 7zM10 13.5 21 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  sliders: 'M4 7h9m4 0h3M4 17h3m4 0h9M13 5v4M7 15v4',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  zap: 'M13 3 5 13h6l-1 8 8-10h-6z', user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a7 7 0 0 1 4 6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4', calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  coins: 'M12 4c4.4 0 8 1.1 8 2.5S16.4 9 12 9 4 7.9 4 6.5 7.6 4 12 4zM4 6.5v5C4 12.9 7.6 14 12 14s8-1.1 8-2.5v-5M4 11.5v5C4 17.9 7.6 19 12 19s8-1.1 8-2.5v-5',
  percent: 'M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2', scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8 8l12 11M8 16 20 5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  wand: 'M5 19 17 7M14 4v2M19 9h2M18 4l1 1M9 4v.01M4 9v.01', refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v6h-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2 1-2 3-2-.5-1.5 1 .2 2.2h-3.4l.2-2.2-1.5-1L7 16l-2-3 2-1a7 7 0 0 1 0-2l-2-1 2-3 2 .5 1.5-1-.2-2.2h3.4l-.2 2.2 1.5 1L17 5l2 3-2 1a7 7 0 0 1 0 3',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', save: 'M5 3h11l3 3v15H5zM8 3v5h7M8 21v-7h8v7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M21 21l-5-5', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5', crop: 'M6 2v16h16M2 6h16v16',
  stamp: 'M9 13a4 4 0 1 1 6 0l1 3H8zM6 20h12M7 16h10', sign: 'M3 17c3-6 5-9 6-9s-1 8 1 8 3-4 4-4 1 3 3 3 2-2 4-2M4 21h16',
  hash: 'M5 9h14M5 15h14M10 3 8 21M16 3l-2 18', globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  phone: 'M7 3h10v18H7zM11 18h2', monitor: 'M3 5h18v11H3zM8 21h8M12 16v5',
  arrowUp: 'M12 19V5m0 0-6 6m6-6 6 6', arrowDown: 'M12 5v14m0 0 6-6m-6 6-6-6', arrowRight: 'M5 12h14m0 0-6-6m6 6-6 6',
  drag: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01', undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  waves: 'M3 12h2m3-5v10m4-13v16m4-12v8m4-5v2', bolt: 'M13 3 5 13h6l-1 8 8-10h-6z', palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a4 4 0 0 0 4-4c0-5-4.5-10-9-10M7.5 11h.01M10 7.5h.01M15 8h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5M12 8h.01', alert: 'M12 4 2.5 20h19zM12 10v5M12 17.5h.01',
  box: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9', cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6M8 8l12 11M8 16 20 5',
  scale: 'M12 4v16M7 20h10M4 7h16M4 7l-2.5 6a3 3 0 0 0 5 0zM20 7l-2.5 6a3 3 0 0 0 5 0z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2M14 18h2v2m4-2v2', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
}
export function KIco({ n, s = 18, w = 1.8, className = '', style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}><path d={P[n] || P.file} /></svg>
}

/* ---------- helpers ---------- */
export const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB')
export function save(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) }
export const baseName = (n) => n.replace(/\.[^.]+$/, '')
export const uid = () => Math.random().toString(36).slice(2, 9)
export function usePref(ns, key, init) {
  const k = `ttt.${ns}.${key}`
  const [v, setV] = useState(() => { try { const s = JSON.parse(localStorage.getItem(k)); return s == null ? init : (typeof s === 'object' && !Array.isArray(s) && init && typeof init === 'object' ? { ...init, ...s } : s) } catch { return init } })
  useEffect(() => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }, [k, v])
  return [v, setV]
}
export function useToast() {
  const [m, setM] = useState(null), t = useRef(0)
  useEffect(() => () => clearTimeout(t.current), [])
  const toast = useCallback((text, tone = 'ok') => { setM({ text, tone, k: Date.now() }); clearTimeout(t.current); t.current = setTimeout(() => setM(null), 2800) }, [])
  const node = (
    <AnimatePresence>{m && (
      <motion.div key={m.k} initial={{ y: 40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={SPRING} className="app-toast fixed left-1/2 bottom-6 z-[80] -translate-x-1/2 rounded-full px-5 py-3 text-[13.5px] font-semibold flex items-center gap-2" style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: '0 18px 40px -12px rgba(0,0,0,.55)' }}>
        <KIco n={m.tone === 'err' ? 'alert' : 'check'} s={16} />{m.text}
      </motion.div>)}</AnimatePresence>
  )
  return [toast, node]
}

/* ---------- controls ---------- */
export function Btn({ children, icon, onClick, primary, small, disabled, busy, className = '', title, danger, type = 'button' }) {
  return (
    <motion.button type={type} title={title} disabled={disabled || busy} onClick={onClick} whileHover={disabled ? {} : { y: -2 }} whileTap={disabled ? {} : { scale: 0.93 }} transition={SPRING}
      className={`tool-btn relative inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap ${small ? 'px-3.5 py-1.5 text-[12px]' : 'px-5 py-2.5 text-[13.5px]'} ${className}`}
      style={primary ? { background: 'var(--ink)', color: 'var(--bg)', boxShadow: '0 12px 22px -12px rgba(0,0,0,.6)', opacity: disabled ? 0.5 : 1 } : { background: 'var(--surface)', color: danger ? '#C3423F' : 'var(--ink)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', opacity: disabled ? 0.5 : 1 }}>
      {icon && <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : SPRING} className="inline-flex"><KIco n={busy ? 'refresh' : icon} s={small ? 14 : 16} /></motion.span>}{children}
    </motion.button>
  )
}
export function Drop({ onFiles, accept, multiple = true, title = 'Drop files here', sub = 'or click to browse', icon = 'upload', compact, children }) {
  const [hot, setHot] = useState(false), ref = useRef(null)
  const decorativeMotion = useDecorativeMotion()
  const openPicker = () => ref.current?.click()
  const onKeyDown = (e) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault(); openPicker()
  }
  return (
    <motion.div role="button" tabIndex={0} aria-label={title} whileHover={{ y: -3 }} transition={SPRING}
      onClick={(e) => { if (e.target === ref.current || e.target.closest?.('button,a,input,select,textarea')) return; openPicker() }}
      onKeyDown={onKeyDown} onDragOver={(e) => { e.preventDefault(); setHot(true) }} onDragLeave={() => setHot(false)} onDrop={(e) => { e.preventDefault(); setHot(false); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}
      className={`tool-drop cursor-pointer rounded-[24px] text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${compact ? 'p-5' : 'p-10'}`} style={{ border: `2px dashed ${hot ? 'var(--copper)' : 'var(--border)'}`, background: hot ? 'color-mix(in srgb, var(--copper) 9%, var(--surface))' : 'var(--surface)', transition: 'background .2s, border-color .2s' }}>
      <input ref={ref} data-drop type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { const fs = [...e.target.files]; if (fs.length) onFiles(fs); e.target.value = '' }} />
      {children || <>
        <motion.div animate={hot ? { y: -6, scale: 1.15 } : decorativeMotion ? { y: [0, -4, 0] } : { y: 0, scale: 1 }} transition={hot ? SPRING : decorativeMotion ? { repeat: Infinity, duration: 2.6 } : { duration: 0 }} className="mx-auto mb-3 w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'color-mix(in srgb, var(--copper) 14%, var(--surface2))', color: 'var(--copper)' }}><KIco n={icon} s={22} /></motion.div>
        <div className="display font-semibold text-[17px]">{title}</div><div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</div>
      </>}
    </motion.div>
  )
}

/** icon+label tile dock: scrolls on mobile, active tile fills with ink */
export function Dock({ value, onChange, items, cols }) {
  const count = cols || items.length, scroll = count >= 5
  return (
    <div className={`tool-dock-scroll ${scroll ? 'overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1' : ''}`}>
      <div className={`tool-dock-grid grid gap-2 ${scroll ? 'min-w-[560px] sm:min-w-0' : ''}`} style={{ gridTemplateColumns: `repeat(${count}, minmax(0,1fr))` }}>
        {items.map(([k, l, ic], i) => { const on = k === value; return (
          <motion.button key={k} type="button" onClick={() => onChange(k)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.035 }} whileHover={{ y: -4 }} whileTap={{ scale: 0.94 }} aria-pressed={on}
            className="relative flex flex-col items-center gap-1.5 rounded-2xl px-1.5 py-3 border" style={{ borderColor: on ? 'var(--ink)' : 'var(--border)', background: 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)', boxShadow: on ? '0 14px 24px -14px rgba(0,0,0,.6)' : 'var(--shadow)' }}>
            <motion.span className="absolute inset-0 rounded-2xl" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.85 }} transition={SPRING} />
            <motion.span className="relative" animate={{ rotate: on ? [0, -16, 12, 0] : 0, scale: on ? 1.1 : 1 }} transition={{ duration: 0.45 }} style={{ color: on ? 'var(--bg)' : 'var(--copper)' }}><KIco n={ic} s={22} /></motion.span>
            <span className="relative text-[11.5px] sm:text-[12.5px] font-semibold leading-tight text-center">{l}</span>
          </motion.button>) })}
      </div>
    </div>
  )
}
export function Swap({ k, children }) {
  return <AnimatePresence mode="wait" initial={false}><motion.div key={k} initial={{ opacity: 0, y: 22, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div></AnimatePresence>
}
export function Bar({ value, label, sub }) {
  return (
    <div className="tool-progress">
      <div className="flex justify-between text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}><span>{label}</span><span className="tabular-nums">{sub ?? Math.round(value) + '%'}</span></div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div className="h-full rounded-full stripes" style={{ background: 'var(--copper)' }} initial={{ width: 0 }} animate={{ width: Math.min(100, Math.max(0, value)) + '%' }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
    </div>
  )
}
export function Field({ label, children, hint }) {
  return <label className="tool-field block"><span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>{label}</span>{children}{hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{hint}</span>}</label>
}
export function Empty({ icon = 'file', title, sub }) {
  const decorativeMotion = useDecorativeMotion()
  return <div className="tool-empty text-center py-12"><motion.div animate={decorativeMotion ? { y: [0, -5, 0] } : { y: 0 }} transition={decorativeMotion ? { repeat: Infinity, duration: 3 } : { duration: 0 }} className="mx-auto mb-3 w-14 h-14 rounded-2xl grid place-items-center" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><KIco n={icon} s={24} /></motion.div><div className="display font-semibold text-[17px]">{title}</div>{sub && <div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>{sub}</div>}</div>
}
export function Stat2({ k, v, i = 0 }) {
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="tool-stat rounded-2xl p-3.5 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow">{k}</div><div className="display font-semibold text-[22px] mt-0.5 tabular-nums">{v}</div></motion.div>
}
