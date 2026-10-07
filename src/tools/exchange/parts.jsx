import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, animate } from 'framer-motion'
import { numberWords } from '../../lib/units/words'

export const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

/* ------------------------------------------------ icons ------------------------------------------------ */
const P = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  swap: <><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  coins: <><circle cx="9" cy="9" r="6" /><path d="M15.5 6.3A6 6 0 1 1 9 20.8M9 6.5v5M7 8.5h3.5a1.2 1.2 0 0 1 0 2.5H7.5" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trend: <path d="m3 17 6-6 4 4 7-8M15 7h5v5" />,
  wifi: <><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r=".8" /></>,
  wifioff: <><path d="m3 3 18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3-2M19 12.5a10 10 0 0 0-5-2.6M2 9a15 15 0 0 1 4-2.8M22 9a15 15 0 0 0-8-3.8" /></>,
  ruler: <><rect x="2" y="8" width="20" height="8" rx="1.5" /><path d="M6 8v3M10 8v4M14 8v3M18 8v4" /></>,
  scale: <><path d="M12 4v16M5 20h14M5 7h14M5 7 2.5 13a3 3 0 0 0 5 0Zm14 0-2.5 6a3 3 0 0 0 5 0Z" /></>,
  area: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 12h16M12 4v16" /></>,
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  thermo: <><path d="M10 14.5V5a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0Z" /><path d="M12 9v7" /></>,
  gauge: <><path d="M4 16a8 8 0 1 1 16 0" /><path d="m12 16 4-5" /></>,
  hourglass: <><path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" /></>,
  dial: <><circle cx="12" cy="12" r="9" /><path d="m12 12 3.5-4M12 5v1.5M5 12h1.5M17.5 12H19" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />,
  plug: <><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4" /></>,
  arrow: <path d="M4 12h16m-5-5 5 5-5 5" />,
  angle: <><path d="M4 20h16M4 20 16 6" /><path d="M12 20a8 8 0 0 0-2-5" /></>,
  disk: <><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
  wave: <path d="M2 12c2-7 4-7 6 0s4 7 6 0 4-7 6 0" />,
  pulse: <path d="M2 12h4l2-6 4 12 3-9 2 3h5" />,
  fuel: <><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3" /><path d="M8 7h4" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
}
export function Ico({ n, s = 18, w = 1.8, fill = false, className = '', style }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>{P[n]}</svg>
}

/* ------------------------------------------------ flags & coins ------------------------------------------------ */
const hueOf = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h }
export function Mono({ text, size = 32 }) {
  const h = hueOf(text)
  return <span className="grid place-items-center rounded-full shrink-0 font-bold" style={{ width: size, height: size, fontSize: Math.max(8, size * (text.length > 3 ? 0.27 : 0.34)), background: `linear-gradient(135deg, hsl(${h} 55% 52%), hsl(${(h + 40) % 360} 60% 38%))`, color: '#fff', letterSpacing: '-0.02em' }}>{text.slice(0, 4)}</span>
}
export const Flag = memo(function Flag({ cc, size = 32, label = '' }) {
  const [bad, setBad] = useState(false)
  if (!cc || bad) return <Mono text={(label || cc || '?').toUpperCase()} size={size} />
  return <span className="relative inline-block rounded-full overflow-hidden shrink-0" style={{ width: size, height: size, boxShadow: '0 0 0 1px rgba(0,0,0,.12), 0 2px 6px -2px rgba(0,0,0,.35)' }}>
    <img src={`/flags/${cc.toLowerCase()}.svg`} alt="" loading="lazy" draggable={false} onError={() => setBad(true)} className="absolute top-0 h-full max-w-none" style={{ left: '50%', width: size * 1.34, transform: 'translateX(-50%)' }} />
  </span>
})
export const Coin = memo(function Coin({ item, size = 32 }) {
  const [ok, setOk] = useState(false)
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <Mono text={item.code} size={size} />
      {item.img && <img src={item.img} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onLoad={() => setOk(true)} onError={() => {}} className="absolute inset-0 w-full h-full rounded-full object-cover bg-white" style={{ opacity: ok ? 1 : 0, transition: 'opacity .3s', boxShadow: '0 0 0 1px rgba(0,0,0,.1)' }} />}
    </span>
  )
})
export function ItemIcon({ item, size = 32 }) {
  if (item.kind === 'crypto') return <Coin item={item} size={size} />
  return <Flag cc={item.flag} size={size} label={item.code} />
}

/* ------------------------------------------------ sparkline ------------------------------------------------ */
export function Spark({ data, up = true, w = 120, h = 36, id = 'sp' }) {
  if (!data || data.length < 2) return null
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - mn) / r) * (h - 6)])
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const col = up ? '#2f9c6b' : '#c3423f'
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".28" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <motion.path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }} />
      <motion.path d={d} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <motion.circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={col} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, ...SPRING }} />
    </svg>
  )
}

/* ------------------------------------------------ chips / tabs ------------------------------------------------ */
export function Chips({ value, onChange, options, small }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => (
        <motion.button key={k} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => onChange(k)} className={`relative rounded-full border border-line font-semibold whitespace-nowrap ${small ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-[12px]'}`} style={{ color: value === k ? 'var(--bg)' : 'var(--ink)', background: 'var(--surface)' }}>
          <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: value === k ? 1 : 0, scale: value === k ? 1 : 0.6 }} transition={SPRING} />
          <span className="relative">{l}</span>
        </motion.button>
      ))}
    </div>
  )
}

/* ------------------------------------------------ the searchable dropdown ------------------------------------------------ */
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

const Row = memo(function Row({ it, active, selected, pinned, onPick, onPin, onHover, idx, animate }) {
  return (
    <motion.div role="option" aria-selected={selected} data-idx={idx} onMouseMove={() => onHover(idx)} onClick={() => onPick(it)} initial={animate ? { opacity: 0, x: -10 } : false} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: animate ? Math.min(idx, 12) * 0.018 : 0 }}
      className="group flex items-center gap-3 px-3 py-2 mx-1.5 rounded-xl cursor-pointer" style={{ background: active ? 'color-mix(in srgb, var(--copper) 13%, var(--surface))' : 'transparent', transition: 'background .12s' }}>
      <span className="shrink-0">{it.icon}</span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-2"><span className="text-[13.5px] font-bold truncate">{it.title}</span>{selected && <Ico n="check" s={13} w={2.6} style={{ color: 'var(--copper)' }} />}</span>
        <span className="block text-[11.5px] truncate" style={{ color: 'var(--muted)' }}>{it.sub}</span>
      </span>
      {it.meta && <span className="mono text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--muted)' }}>{it.meta}</span>}
      <button type="button" aria-label={pinned ? 'Unpin' : 'Pin'} onClick={(e) => { e.stopPropagation(); onPin(it) }} className="shrink-0 w-6 h-6 grid place-items-center rounded-full transition-opacity" style={{ opacity: pinned ? 1 : active ? 0.55 : 0, color: pinned ? '#d99a1c' : 'var(--muted)' }}>
        <Ico n="star" s={14} fill={pinned} w={1.8} />
      </button>
    </motion.div>
  )
})

/**
 * items: [{ key, title, sub, meta?, group, icon, hay }]   value: key   onChange(key)
 * filters: [[label, (item)=>bool]]   storeId: persists pins + recents per picker family
 */
export function Picker({ items, value, onChange, storeId, filters, defaultPins = [], placeholder = 'Search…', trigger, groupOrder, emptyText = 'Nothing matches', width = 380 }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [filt, setFilt] = useState(0)
  const [act, setAct] = useState(0)
  const [pins, setPins] = useState(() => lsGet('ttt.pins.' + storeId, defaultPins))
  const [recent, setRecent] = useState(() => lsGet('ttt.recent.' + storeId, []))
  const [pos, setPos] = useState(null)
  const btn = useRef(null), list = useRef(null), input = useRef(null), pop = useRef(null)
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const selected = byKey.get(value)

  const view = useMemo(() => {
    const f = filters && filters[filt] ? filters[filt][1] : () => true
    const pool = items.filter(f)
    const needle = q.trim().toLowerCase()
    if (needle) {
      const toks = needle.split(/\s+/)
      const scored = []
      for (const it of pool) {
        if (!toks.every((t) => it.hay.includes(t))) continue
        const t = it.title.toLowerCase()
        scored.push([t === needle ? 0 : t.startsWith(needle) ? 1 : it.hay.startsWith(needle) ? 2 : t.includes(needle) ? 3 : 4, it])
      }
      scored.sort((a, b) => a[0] - b[0])
      return { flat: scored.map((s) => s[1]).slice(0, 300), sections: null }
    }
    const sections = []
    const pinSet = new Set(pins)
    const pinned = pins.map((k) => byKey.get(k)).filter((i) => i && pool.includes(i))
    if (pinned.length) sections.push(['Pinned', pinned])
    const rec = recent.map((k) => byKey.get(k)).filter((i) => i && !pinSet.has(i.key) && pool.includes(i)).slice(0, 4)
    if (rec.length) sections.push(['Recent', rec])
    const groups = new Map()
    for (const it of pool) { if (pinSet.has(it.key)) continue; if (!groups.has(it.group)) groups.set(it.group, []); groups.get(it.group).push(it) }
    const order = groupOrder || [...groups.keys()]
    for (const g of order) if (groups.get(g)) sections.push([g, groups.get(g)])
    return { flat: sections.flatMap((s) => s[1]), sections }
  }, [items, q, filt, pins, recent, filters, byKey, groupOrder])

  const place = useCallback(() => {
    const r = btn.current.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight
    if (vw < 640) { setPos({ sheet: true }); return }
    const w = Math.max(width, r.width), left = Math.min(Math.max(12, r.left), vw - w - 12)
    const below = vh - r.bottom, up = below < 420 && r.top > below
    setPos({ left, width: w, top: up ? undefined : r.bottom + 8, bottom: up ? vh - r.top + 8 : undefined, maxH: Math.min(520, (up ? r.top : below) - 24), origin: `${Math.max(0, r.left - left + 40)}px ${up ? '100%' : '0%'}` })
  }, [width])
  const openIt = () => { place(); setQ(''); setAct(0); setOpen(true) }
  const close = () => { setOpen(false); btn.current?.focus() }
  useEffect(() => { if (open) { const id = setTimeout(() => input.current?.focus(), 40); return () => clearTimeout(id) } }, [open])
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (!pop.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    const r = () => place()
    document.addEventListener('pointerdown', h); window.addEventListener('resize', r)
    return () => { document.removeEventListener('pointerdown', h); window.removeEventListener('resize', r) }
  }, [open, place])
  useEffect(() => { setAct(0) }, [q, filt])
  useEffect(() => { list.current?.querySelector(`[data-idx="${act}"]`)?.scrollIntoView({ block: 'nearest' }) }, [act])

  const pick = (it) => {
    const nr = [it.key, ...recent.filter((k) => k !== it.key)].slice(0, 8); setRecent(nr); lsSet('ttt.recent.' + storeId, nr)
    onChange(it.key); setOpen(false); btn.current?.focus()
  }
  const pin = (it) => { const np = pins.includes(it.key) ? pins.filter((k) => k !== it.key) : [it.key, ...pins]; setPins(np); lsSet('ttt.pins.' + storeId, np) }
  const onKey = (e) => {
    const n = view.flat.length
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(n - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (view.flat[act]) pick(view.flat[act]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.(); close() }
  }
  const pinSet = new Set(pins)
  let idx = -1

  const panel = (
    <AnimatePresence>
      {open && pos && (
        <>
          {pos.sheet && <motion.div className="fixed inset-0 z-[90]" style={{ background: 'rgba(10,8,6,.5)', backdropFilter: 'blur(3px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}
          <motion.div ref={pop} role="listbox" className="fixed z-[100] flex flex-col rounded-3xl overflow-hidden"
            style={pos.sheet ? { left: 8, right: 8, bottom: 8, maxHeight: '78vh', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', transformOrigin: '50% 100%' } : { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 30px 70px -20px rgba(0,0,0,.45), 0 0 0 1px rgba(0,0,0,.02)', transformOrigin: pos.origin }}
            initial={pos.sheet ? { y: 80, opacity: 0 } : { opacity: 0, scale: 0.92, y: pos.bottom ? 8 : -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={pos.sheet ? { y: 80, opacity: 0 } : { opacity: 0, scale: 0.94 }} transition={SPRING}>
            <div className="shrink-0 p-3 pb-2">
              <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 border-[1.5px] border-line focus-within:!border-[var(--copper)] transition-colors" style={{ background: 'var(--surface2)' }}>
                <Ico n="search" s={17} style={{ color: 'var(--muted)' }} />
                <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} className="flex-1 bg-transparent outline-none text-[14px] font-medium min-w-0" spellCheck={false} autoComplete="off" />
                <AnimatePresence>{q && <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => { setQ(''); input.current?.focus() }} aria-label="Clear" className="w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--border)', color: 'var(--ink)' }}><Ico n="x" s={11} w={2.6} /></motion.button>}</AnimatePresence>
                <span className="mono text-[10.5px] px-1.5 py-0.5 rounded-md hidden sm:block" style={{ background: 'var(--border)', color: 'var(--muted)' }}>{view.flat.length}</span>
              </div>
              {filters && (
                <div className="flex gap-1.5 mt-2.5 overflow-x-auto pb-1 ex-scrollfade -mx-1 px-1">
                  {filters.map(([l], i) => (
                    <motion.button key={l} type="button" onClick={() => setFilt(i)} whileTap={{ scale: 0.9 }} className="relative shrink-0 px-3 py-1 rounded-full text-[11.5px] font-semibold border border-line" style={{ color: filt === i ? 'var(--bg)' : 'var(--muted)', background: 'var(--surface)' }}>
                      <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: filt === i ? 1 : 0, scale: filt === i ? 1 : 0.6 }} transition={SPRING} /><span className="relative">{l}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
            <div ref={list} className="flex-1 min-h-0 overflow-y-auto pb-2" style={{ minHeight: 120 }}>
              {view.flat.length === 0 && <div className="text-center text-[13px] py-10" style={{ color: 'var(--muted)' }}>{emptyText} “{q}”</div>}
              {view.sections ? view.sections.map(([name, arr]) => (
                <div key={name}>
                  <div className="sticky top-0 z-[1] px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] flex items-center gap-2" style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', backdropFilter: 'blur(6px)', color: 'var(--muted)' }}>{name}<span className="font-normal opacity-70">{arr.length}</span><span className="flex-1 h-px" style={{ background: 'var(--border)' }} /></div>
                  {arr.map((it) => { idx++; return <Row key={name + it.key} it={it} idx={idx} active={act === idx} selected={it.key === value} pinned={pinSet.has(it.key)} onPick={pick} onPin={pin} onHover={setAct} animate={idx < 13} /> })}
                </div>
              )) : view.flat.map((it) => { idx++; return <Row key={it.key} it={it} idx={idx} active={act === idx} selected={it.key === value} pinned={pinSet.has(it.key)} onPick={pick} onPin={pin} onHover={setAct} animate={idx < 13} /> })}
            </div>
            <div className="shrink-0 px-4 py-2 flex items-center gap-3 text-[10.5px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)', background: 'var(--surface2)' }}>
              <span><kbd className="mono">↑↓</kbd> move</span><span><kbd className="mono">↵</kbd> choose</span><span><kbd className="mono">esc</kbd> close</span><span className="ml-auto flex items-center gap-1"><Ico n="star" s={11} /> pin favourites</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
  return (
    <>
      <span ref={btn} className="block">{trigger({ open, selected, onClick: () => (open ? setOpen(false) : openIt()) })}</span>
      {createPortal(panel, document.body)}
    </>
  )
}

export function CopyBtn({ text, label = 'Copy', small }) {
  const [ok, setOk] = useState(false)
  return (
    <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1300) }}
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-full border border-line ${small ? 'px-2 py-1' : 'px-2.5 py-1.5'}`} style={{ background: 'var(--surface)', color: ok ? '#2f9c6b' : 'var(--muted)' }}>
      <AnimatePresence mode="wait" initial={false}><motion.span key={ok ? 'y' : 'n'} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.12 }}><Ico n={ok ? 'check' : 'copy'} s={13} w={2.2} /></motion.span></AnimatePresence>{label ? (ok ? 'Copied' : label) : null}
    </motion.button>
  )
}

export function usePersist(key, init) {
  const [v, setV] = useState(() => { const s = lsGet('ttt.ex.' + key, null); return s && typeof s === 'object' && !Array.isArray(s) ? { ...init, ...s } : s ?? init })
  useEffect(() => lsSet('ttt.ex.' + key, v), [key, v])
  return [v, setV]
}
export function Stagger({ i = 0, children, className = '', style }) {
  return <motion.div className={className} style={style} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.06 + i * 0.07 }}>{children}</motion.div>
}

/* ------------------------------------------------ clean building blocks ------------------------------------------------ */
export function Panel({ children, className = '', style, pad = true, delay = 0 }) {
  return <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay }} className={`tool-panel rounded-[26px] border border-line ${pad ? 'p-5 sm:p-7' : ''} ${className}`} style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)', ...style }}>{children}</motion.section>
}
export function Label({ children, right }) {
  return <div className="flex items-center justify-between mb-2.5"><span className="eyebrow">{children}</span>{right}</div>
}

/** equal-width segmented control with a springy thumb */
export function Seg({ value, onChange, options, small, className = '' }) {
  const i = Math.max(0, options.findIndex(([k]) => k === value)), n = options.length
  return (
    <div className={`relative grid rounded-full p-1 ${className}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <motion.span className="absolute top-1 bottom-1 rounded-full" style={{ width: `calc((100% - 8px) / ${n})`, background: 'var(--ink)', boxShadow: '0 6px 14px -6px rgba(0,0,0,.5)' }} initial={false} animate={{ left: `calc(4px + ${i} * (100% - 8px) / ${n})` }} transition={SPRING} />
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={`relative z-[1] rounded-full font-semibold whitespace-nowrap transition-colors ${small ? 'px-3 py-1 text-[11.5px]' : 'px-4 py-2 text-[13px]'}`} style={{ color: k === value ? 'var(--bg)' : 'var(--muted)' }}>{l}</button>
      ))}
    </div>
  )
}

/** compact picker button: icon · CODE · name ▾ */
export function SelectChip({ open, onClick, icon, title, sub, wide }) {
  return (
    <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} aria-haspopup="listbox" aria-expanded={open}
      className={`flex items-center gap-2.5 rounded-2xl pl-2.5 pr-3 py-2 text-left ${wide ? 'w-full' : 'shrink-0'}`} style={{ background: 'var(--surface)', border: `1.5px solid ${open ? 'var(--copper)' : 'var(--border)'}`, boxShadow: open ? '0 0 0 4px var(--glow)' : 'var(--shadow)', transition: 'border-color .15s, box-shadow .15s' }}>
      <AnimatePresence mode="wait" initial={false}><motion.span key={title} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.14 }} className="shrink-0">{icon}</motion.span></AnimatePresence>
      <span className="min-w-0 leading-tight flex-1">
        <span className="block font-bold text-[15px] truncate">{title}</span>
        {sub && <span className="block text-[11px] truncate max-w-[150px]" style={{ color: 'var(--muted)' }}>{sub}</span>}
      </span>
      <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} style={{ color: 'var(--muted)' }}><Ico n="chevron" s={16} /></motion.span>
    </motion.button>
  )
}

export function SwapButton({ onClick }) {
  const [n, setN] = useState(0)
  return (
    <motion.button type="button" aria-label="Swap" onClick={() => { setN((x) => x + 1); onClick() }} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.85 }} animate={{ rotate: n * 180 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className="relative z-10 w-11 h-11 rounded-full grid place-items-center" style={{ background: 'var(--ink)', color: 'var(--bg)', boxShadow: '0 8px 18px -8px rgba(0,0,0,.55), 0 0 0 4px var(--surface)' }}>
      <Ico n="swap" s={18} style={{ transform: 'rotate(90deg)' }} />
    </motion.button>
  )
}

/** number that counts smoothly to its new value */
export function CountText({ value, format, className = '', style }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (!Number.isFinite(value) || !Number.isFinite(from.current)) { from.current = value; setShown(value); return }
    const c = animate(from.current, value, { duration: 0.55, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { from.current = v; setShown(v) } })
    return () => c.stop()
  }, [value])
  return <span className={className} style={style}>{format(shown)}</span>
}

/** a short piece of text that slides in when it changes */
export function SlideText({ text, className = '', style }) {
  return <span className="relative inline-block overflow-hidden align-bottom"><AnimatePresence mode="popLayout" initial={false}><motion.span key={text} initial={{ y: '70%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '-70%', opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className={`inline-block ${className}`} style={style}>{text}</motion.span></AnimatePresence></span>
}

function WordLine({ label, text, mono }) {
  const words = useMemo(() => String(text).split(' '), [text])
  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--copper)' }}>{label}</span>
        <CopyBtn text={text} label="" small />
      </div>
      <p key={text} className={`leading-snug ${mono ? 'mono text-[15px]' : 'display text-[19px] font-medium'}`}>
        {words.slice(0, 40).map((w, i) => <motion.span key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i, 16) * 0.018 }} className="inline-block mr-[0.28em]">{w}</motion.span>).reduce((a, x, i) => (i ? [...a, ' ', x] : [x]), [])}
        {words.length > 40 && '…'}
      </p>
    </div>
  )
}

/** the “say it out loud” panel: English words + lakh/hazar style (digits or Roman-Urdu words) */
export function WordsPanel({ value, unit, delay = 0.1 }) {
  const w = useMemo(() => numberWords(value), [value])
  const [style, setStyle] = usePersist('wordstyle', 'digits')
  return (
    <Panel delay={delay} className="lg:sticky lg:top-4">
      <Label right={unit ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{unit}</span> : null}>In words</Label>
      <AnimatePresence mode="wait" initial={false}>
        {w ? (
          <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
            <WordLine label="International" text={w.en} />
            <div className="h-px" style={{ background: 'var(--border)' }} />
            <div>
              <div className="flex justify-end mb-2"><Seg small value={style} onChange={setStyle} options={[['digits', '10 lakh 20'], ['words', 'das lakh bees']]} /></div>
              <WordLine label="Lakh · Hazar" text={style === 'digits' ? w.ur : w.urWords} />
              <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: 'var(--muted)' }}>
                <span className="mono px-2 py-1 rounded-md tabular-nums" style={{ background: 'var(--surface2)' }}>{w.saGrouped}</span><span>South-Asian grouping</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.p key="no" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[13px]" style={{ color: 'var(--muted)' }}>This value is too large, too small or not a plain number to spell out.</motion.p>
        )}
      </AnimatePresence>
    </Panel>
  )
}
