import React, { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
export { SPRING, Panel, Label, Seg, CountText } from '../exchange/parts.jsx'
import { SPRING } from '../exchange/parts.jsx'

const I = {
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  play: <path d="M8 5.5v13L19 12Z" />, user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-4 3.7-6 7.5-6s6.7 2 7.5 6" /></>,
  phone: <path d="M5 3.5h3.5l1.8 4.5-2.2 1.5a11 11 0 0 0 5.400 5.400l1.500-2.200 4.500 1.800V18a2.500 2.500 0 0 1-2.500 2.500A15.500 15.500 0 0 1 2.500 6 2.500 2.500 0 0 1 5 3.500Z" />,
  file: <><path d="M6 3h8l4.500 4.500V21H6Z" /><path d="M14 3v4.500h4.500M9 13h6M9 16.500h6" /></>, chat: <><path d="M4 5.500h16v10.500H10l-4.500 4v-4H4Z" /><path d="M8 10h8M8 13h5" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.500" /><path d="m3.500 7.500 8.500 6 8.500-6" /></>, wifi: <><path d="M2.500 9a14 14 0 0 1 19 0M5.500 12.500a9.500 9.500 0 0 1 13 0M8.500 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.500" r=".7" fill="currentColor" /></>,
  calendar: <><rect x="3.500" y="5" width="17" height="15.500" rx="2.500" /><path d="M3.500 10h17M8 3v4M16 3v4" /></>, pin: <><path d="M12 21.500s7-6.200 7-12A7 7 0 0 0 5 9.500c0 5.800 7 12 7 12Z" /><circle cx="12" cy="9.500" r="2.500" /></>,
  card: <><rect x="3" y="5.500" width="18" height="13" rx="2.500" /><path d="M3 10h18M6.500 15h4" /></>, bolt: <path d="M13.500 2 5 13.500h5.500L9.500 22 19 10h-5.800Z" />,
  text: <path d="M5 6.500V5h14v1.500M12 5v14M9 19h6" />, scan: <><path d="M4 8V5.500A1.500 1.500 0 0 1 5.500 4H8M16 4h2.500A1.500 1.500 0 0 1 20 5.500V8M20 16v2.500a1.500 1.500 0 0 1-1.500 1.500H16M8 20H5.500A1.500 1.500 0 0 1 4 18.500V16" /><path d="M7.500 12h9" /></>,
  barcode: <path d="M4 5v14M7 5v14M10 5v14M13.500 5v14M16 5v14M20 5v14M18 5v14" />, camera: <><path d="M4 8h3l1.500-2.500h7L17 8h3a1 1 0 0 1 1 1v9.500a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.500" r="3.500" /></>,
  upload: <path d="M12 16V4m0 0L7.500 8.500M12 4l4.500 4.500M4 15v4.500h16V15" />, download: <path d="M12 4v12m0 0 4.500-4.500M12 16l-4.500-4.500M4 18v2h16v-2" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>, check: <path d="m5 12.500 4.500 4.500L19 7.500" />, x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />, minus: <path d="M5 12h14" />, trash: <path d="M4 7h16M9 7V4.500h6V7M6.500 7l1 13h9l1-13" />,
  star: <path d="m12 3 2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100-4.400-4.300 6.100-.9Z" />, search: <><circle cx="11" cy="11" r="6.500" /><path d="m16 16 4.500 4.500" /></>,
  history: <><path d="M3.500 12a8.500 8.500 0 1 0 2.600-6.100" /><path d="M3 4v4.500h4.500M12 7.500V12l3 2" /></>, share: <><circle cx="6" cy="12" r="2.500" /><circle cx="18" cy="6" r="2.500" /><circle cx="18" cy="18" r="2.500" /><path d="m8.200 10.800 7.600-3.600M8.200 13.200l7.600 3.600" /></>,
  print: <><path d="M7 9V4h10v5M7 17H4.500V9h15v8H17" /><rect x="7" y="14" width="10" height="6" rx="1" /></>, image: <><rect x="3.500" y="4.500" width="17" height="15" rx="2.500" /><circle cx="9" cy="10" r="1.800" /><path d="m4 17 5-4.500 4 3.500 3-2.500 4 3.500" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.400 0 2-1 1.500-2.200-.5-1.200.2-2.300 1.500-2.300H17a4 4 0 0 0 4-4C21 6.800 17 3 12 3Z" /><circle cx="7.500" cy="11" r="1.100" fill="currentColor" /><circle cx="10.500" cy="7.500" r="1.100" fill="currentColor" /><circle cx="15.500" cy="8" r="1.100" fill="currentColor" /></>,
  shield: <><path d="M12 3 4.500 6v5.500c0 4.500 3.100 8 7.500 9.500 4.400-1.500 7.500-5 7.500-9.500V6Z" /><path d="m8.500 12 2.500 2.500 4.500-5" /></>, warn: <><path d="M12 3.500 2.500 20h19Z" /><path d="M12 10v4.500M12 17.300v.2" /></>,
  open: <path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" />, save: <><path d="M5 4h11l3 3v13H5Z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>, edit: <path d="M4 20h4L19 9l-4-4L4 16Zm9.500-13.500 4 4" />,
  grid: <><rect x="4" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="4" width="6.500" height="6.500" rx="1.500" /><rect x="4" y="13.500" width="6.500" height="6.500" rx="1.500" /><rect x="13.500" y="13.500" width="6.500" height="6.500" rx="1.500" /></>,
  layers: <><path d="m12 3.500 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>, sparkle: <path d="m12 3 1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800ZM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8Z" />,
  zip: <><path d="M5 3h14v18H5Z" /><path d="M12 3v3M10 6h2M12 9h2M10 12h2M12 15v3.500h-2V15Z" /></>, refresh: <><path d="M20 12a8 8 0 1 1-2.500-5.800" /><path d="M20 4v5h-5" /></>,
  flip: <><path d="M4 8h13l-3-3M20 16H7l3 3" /></>, torch: <path d="M8 3h8l-1.500 6h-5ZM10 9v3l-2 3v6h8v-6l-2-3V9" />, screen: <><rect x="3" y="4.500" width="18" height="12" rx="2" /><path d="M8 20h8M12 16.500V20" /></>,
  eye: <><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>, qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2.500v2.500H14zM18.500 14H20v2M14 19v1M17 18.500h3V20" /></>,
  sliders: <path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 5v4M7 15v4" />, heart: <path d="M12 20s-8-5-8-10.500A4.500 4.500 0 0 1 12 7a4.500 4.500 0 0 1 8 2.500C20 15 12 20 12 20Z" />,
  key: <><circle cx="8" cy="15" r="3.500" /><path d="m10.500 12.500 8-8M15.500 7.500l2 2M13 10l2 2" /></>, clipboard: <><rect x="5.500" y="4.500" width="13" height="16" rx="2" /><path d="M9 4.500h6V7H9z" /></>,
  logo: <><circle cx="12" cy="12" r="8.500" /><path d="m9 13.500 2-2.500 1.500 1.800 1.200-1.300L15.500 14" /></>, frame: <><path d="M4 8V5.500A1.500 1.500 0 0 1 5.500 4H8M16 4h2.500A1.500 1.500 0 0 1 20 5.500V8M20 16v2.500a1.500 1.500 0 0 1-1.500 1.500H16M8 20H5.500A1.500 1.500 0 0 1 4 18.500V16" /></>,
  templates: <><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="14" width="7" height="6" rx="2" /><rect x="14" y="14" width="6" height="6" rx="2" /></>, id: <><rect x="3" y="5" width="18" height="14" rx="2.500" /><circle cx="9" cy="11" r="2" /><path d="M6 16c.5-1.600 1.700-2.300 3-2.300s2.500.7 3 2.300M15 10h3.500M15 13h3.500" /></>,
  wifiPoster: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.500 9a5 5 0 0 1 7 0M10 11.500a3 3 0 0 1 4 0" /><circle cx="12" cy="14.500" r=".7" fill="currentColor" /><path d="M9 18h6" /></>,
  tent: <path d="M3 19 12 5l9 14ZM12 5v14" />, megaphone: <path d="M4 10v4h3l8 4V6L7 10Zm14 0v4M7 14l1 5" />, inbox: <path d="M4 13 6.500 5h11L20 13M4 13v6h16v-6h-5a3 3 0 0 1-6 0Z" />,
  pause: <path d="M8 5v14M16 5v14" />, bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900V16h7v-2.100A6 6 0 0 0 12 3Z" />, list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />, wand: <path d="m5 19 9-9m0 0 2 2m-2-2 1-3 1.500-.5L18 4l1 3 3 1-2.500 1.500L19 11l-3 1ZM6 5l.7 1.700L8.500 7.500l-1.800.8L6 10l-.7-1.700L3.500 7.500l1.800-.8Z" />,
}
export function QIco({ n, s = 18, w = 1.8, className = '', style }) {
  const g = I[n] || I.sparkle
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">{g}</svg>
}

export function Btn({ children, onClick, icon, solid, copper, small, disabled, busy, className = '', title, full, tone }) {
  if (tone) { solid = false; copper = true }
  const bg = tone || (solid ? 'var(--ink)' : copper ? 'var(--copper)' : 'var(--surface)')
  const fg = solid || copper ? (copper ? '#fff' : 'var(--bg)') : 'var(--ink)'
  return (
    <motion.button type="button" onClick={onClick} disabled={disabled || busy} title={title} whileHover={disabled ? {} : { y: -2 }} whileTap={disabled ? {} : { scale: 0.94 }}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold border ${small ? 'px-3.5 py-1.5 text-[12.5px]' : 'px-5 py-2.5 text-[13.5px]'} ${full ? 'w-full' : ''} ${className}`}
      style={{ background: bg, color: fg, borderColor: solid || copper ? 'transparent' : 'var(--border)', opacity: disabled ? 0.5 : 1, boxShadow: solid || copper ? '0 10px 20px -12px rgba(0,0,0,.55)' : 'var(--shadow)' }}>
      {icon && <motion.span animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : SPRING} className="inline-flex"><QIco n={busy ? 'refresh' : icon} s={small ? 14 : 16} /></motion.span>}{children}
    </motion.button>
  )
}

export function TextIn({ label, value, onChange, ph, type = 'text', area, hint, mono, className = '', rows = 3 }) {
  const Tag = area ? 'textarea' : 'input'
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[12.5px] font-semibold mb-1.5">{label}</span>}
      <Tag className={`input ${mono ? 'mono' : ''}`} style={{ width: '100%', ...(area ? { resize: 'vertical', minHeight: rows * 26 } : {}) }} rows={area ? rows : undefined} type={area ? undefined : type} value={value ?? ''} placeholder={ph} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="block text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>{hint}</span>}
    </label>
  )
}

export function Select({ label, value, onChange, options, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[12.5px] font-semibold mb-1.5">{label}</span>}
      <select className="input" style={{ width: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </label>
  )
}

export function Switch({ on, onChange, label, hint }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 text-left py-1">
      <span><span className="block text-[13.5px] font-semibold">{label}</span>{hint && <span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
      <span className="relative shrink-0 w-11 h-6 rounded-full transition-colors" style={{ background: on ? 'var(--copper)' : 'var(--border)' }}>
        <motion.span className="absolute top-0.5 w-5 h-5 rounded-full bg-white" style={{ boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} initial={false} animate={{ left: on ? 22 : 2 }} transition={SPRING} />
      </span>
    </button>
  )
}

export function Range({ value, onChange, min, max, step = 1, label, fmt = (v) => v }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5"><span className="text-[12.5px] font-semibold">{label}</span><span className="mono text-[11.5px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>{fmt(value)}</span></span>
      <span className="relative block h-6">
        <span className="absolute left-0 right-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--border)' }} />
        <span className="absolute left-0 top-1/2 -mt-[3px] h-[6px] rounded-full" style={{ background: 'var(--copper)', width: pct + '%' }} />
        <span className="absolute top-1/2 -mt-[10px] w-5 h-5 rounded-full bg-white pointer-events-none" style={{ left: `calc(${pct}% - ${pct / 5}px)`, border: '2px solid var(--copper)', boxShadow: '0 3px 8px rgba(0,0,0,.25)' }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
      </span>
    </label>
  )
}

const QUICK = ['#111111', '#1A1411', '#B4715A', '#C3423F', '#2F9C6B', '#3E8ED0', '#7C4DFF', '#F59E0B', '#FFFFFF', '#F0EDE4']
export function Color({ label, value, onChange, quick = false }) {
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])
  return (
    <div>
      {label && <span className="block text-[12.5px] font-semibold mb-1.5">{label}</span>}
      <div className="flex items-center gap-2">
        <label className="relative w-10 h-10 rounded-xl border border-line overflow-hidden shrink-0 cursor-pointer" style={{ background: value, boxShadow: 'inset 0 0 0 3px var(--surface)' }}>
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" aria-label={label || 'Colour'} />
        </label>
        <input className="input mono" style={{ width: '100%', minWidth: 0 }} value={txt} onChange={(e) => { setTxt(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toUpperCase()) }} maxLength={7} spellCheck={false} />
      </div>
      {quick && <div className="flex flex-wrap gap-1.5 mt-2">{QUICK.map((c) => <motion.button key={c} type="button" whileHover={{ y: -2, scale: 1.12 }} whileTap={{ scale: 0.85 }} onClick={() => onChange(c)} aria-label={c} className="w-5 h-5 rounded-full border border-line" style={{ background: c, outline: value.toUpperCase() === c ? '2px solid var(--copper)' : 'none', outlineOffset: 1 }} />)}</div>}
    </div>
  )
}

/** pill tabs with per-item animated background; scrolls on small screens */
export function Tabs({ value, onChange, tabs, small, wrap, className = '' }) {
  return (
    <div className={`flex gap-1.5 ${wrap ? 'flex-wrap' : 'overflow-x-auto no-scrollbar -mx-1 px-1 py-1'} ${className}`} role="tablist" style={{ scrollbarWidth: 'none' }}>
      {tabs.map(([k, l, ic, badge]) => {
        const on = k === value
        return (
          <motion.button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)} whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} className={`relative shrink-0 inline-flex items-center gap-2 rounded-full border font-semibold ${small ? 'px-3.5 py-2 text-[12.5px]' : 'px-4 py-2.5 text-[13.5px]'}`} style={{ borderColor: on ? 'var(--ink)' : 'var(--border)', color: on ? 'var(--bg)' : 'var(--ink)', background: 'var(--surface)', boxShadow: on ? '0 10px 18px -10px rgba(0,0,0,.55)' : 'var(--shadow)' }}>
            <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.8 }} transition={SPRING} />
            {ic && <span className="relative" style={{ color: on ? 'var(--bg)' : 'var(--copper)' }}><QIco n={ic} s={small ? 15 : 17} /></span>}
            <span className="relative whitespace-nowrap">{l}</span>
            {badge ? <span className="relative mono text-[10.5px] px-1.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,.2)' : 'var(--surface2)' }}>{badge}</span> : null}
          </motion.button>
        )
      })}
    </div>
  )
}

export function Choice({ active, onClick, children, className = '', style, title }) {
  return (
    <motion.button type="button" onClick={onClick} title={title} whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }} className={`relative rounded-2xl border text-[12px] font-semibold ${className}`} style={{ borderColor: active ? 'var(--copper)' : 'var(--border)', background: active ? 'color-mix(in srgb, var(--copper) 11%, var(--surface))' : 'var(--surface)', boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--copper) 30%, transparent)' : 'var(--shadow)', ...style }}>
      {children}
      <AnimatePresence>{active && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={SPRING} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full grid place-items-center text-white" style={{ background: 'var(--copper)' }}><QIco n="check" s={10} w={3} /></motion.span>}</AnimatePresence>
    </motion.button>
  )
}

export function Drop({ onFiles, accept = 'image/*', label = 'Drop an image or click', icon = 'image', multiple = false, compact, children }) {
  const [over, setOver] = useState(false)
  const ref = useRef()
  return (
    <motion.div whileHover={{ y: -2 }} onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) onFiles(multiple ? f : [f[0]]) }}
      className={`cursor-pointer rounded-2xl border-2 border-dashed grid place-items-center text-center ${compact ? 'py-4 px-3' : 'py-8 px-4'}`} style={{ borderColor: over ? 'var(--copper)' : 'var(--border)', background: over ? 'color-mix(in srgb, var(--copper) 9%, var(--surface))' : 'var(--surface2)' }}>
      <input ref={ref} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => { const f = [...e.target.files]; if (f.length) onFiles(f); e.target.value = '' }} />
      <div className="flex flex-col items-center gap-2"><motion.span animate={over ? { y: -5, scale: 1.2 } : { y: 0, scale: 1 }} transition={SPRING} style={{ color: 'var(--copper)' }}><QIco n={icon} s={compact ? 20 : 26} /></motion.span><span className="text-[13px] font-semibold">{label}</span>{children}</div>
    </motion.div>
  )
}

export function useToast() {
  const [t, setT] = useState(null)
  const show = useCallback((msg, bad) => { setT({ msg, bad, k: Date.now() }); }, [])
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 2400); return () => clearTimeout(id) }, [t])
  const node = (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-[80] pointer-events-none">
      <AnimatePresence>{t && <motion.div key={t.k} initial={{ y: 30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0 }} transition={SPRING} className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-semibold" style={{ background: t.bad ? '#B3322E' : 'var(--ink)', color: '#fff', boxShadow: '0 16px 30px -12px rgba(0,0,0,.6)' }}><QIco n={t.bad ? 'warn' : 'check'} s={16} />{t.msg}</motion.div>}</AnimatePresence>
    </div>
  )
  return [node, show]
}

export const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
/** downscale huge images so the SVG stays light */
export async function imageToDataUrl(file, max = 1400) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h)
    return c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.92)
  } finally { URL.revokeObjectURL(url) }
}
