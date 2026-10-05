import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, animate, useMotionValue } from 'framer-motion'
import { Panel, Label, Seg, Stage, PrimaryBtn, Burst, ChipRow, Switch, DIco, usePersist, useLog, useSafeTimeout, rnd, rndf, weighted, sfx, SPRING } from './parts.jsx'

const PALETTES = {
  warm: ['#B4715A', '#E0A458', '#C3423F', '#8A6D3B', '#D9825B', '#A8563F', '#E8B84B', '#7D4E3A'],
  ocean: ['#2F7FA6', '#3EA6A0', '#5B6CC4', '#2A5A82', '#4BB3C9', '#6F8FD8', '#1F8A8A', '#3B4F9C'],
  candy: ['#E86A92', '#F2A65A', '#7C6CD6', '#4DBF9B', '#F25F5C', '#59B6EC', '#B86BD1', '#F5C542'],
  mono: ['#2a211c', '#5b4f46', '#8a7d70', '#3d332c', '#6f635a', '#a89b8e', '#4a3f37', '#7a6e63'],
}
const PRESETS = {
  'Yes / No': ['Yes', 'No'],
  'What to eat': ['Biryani', 'Karahi', 'Pizza', 'Burger', 'Pasta', 'Sushi', 'Salad', 'Shawarma'],
  'Truth / Dare': ['Truth', 'Dare', 'Truth', 'Dare', 'Skip', 'Double dare'],
  '1 – 10': ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  'Who pays': ['Me', 'You', 'Split it', 'Rock-paper-scissors'],
  'Weekend': ['Movie', 'Hike', 'Stay in', 'Road trip', 'Cook together'],
}
const polar = (r, deg) => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)]
const uid = () => Math.random().toString(36).slice(2, 8)
const mk = (t, w = 1) => ({ id: uid(), t, w })

export default function Wheel() {
  const log = useLog()
  const schedule = useSafeTimeout()
  const animation = useRef(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; animation.current?.stop() }
  }, [])
  const [o, setO] = usePersist('wheel', { pal: 'warm', dur: 5, elim: false, items: PRESETS['What to eat'].map((t) => mk(t)) })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const items = o.items
  const [txt, setTxt] = useState('')
  const [busy, setBusy] = useState(false)
  const [win, setWin] = useState(null)
  const [burst, setBurst] = useState(0)
  const [tick, setTick] = useState(0)
  const rot = useMotionValue(0)
  const lastIdx = useRef(-1)
  const cols = PALETTES[o.pal]
  const total = items.reduce((a, b) => a + b.w, 0)
  const slices = useMemo(() => { let a = 0; return items.map((it, i) => { const span = (it.w / total) * 360, s = { ...it, a0: a, a1: a + span, mid: a + span / 2, span, i }; a += span; return s }) }, [items, total])

  const idxAt = (r) => { const ang = (((-r) % 360) + 360) % 360; return slices.findIndex((s) => ang >= s.a0 && ang < s.a1) }
  useEffect(() => rot.on('change', (r) => { const i = idxAt(r); if (i !== lastIdx.current) { lastIdx.current = i; setTick((t) => t + 1); if (busy && i >= 0) sfx('tick', 0.9 + (i % 5) * 0.05) } }), [rot, slices, busy])

  const spin = () => {
    if (busy || items.length < 2) return
    setBusy(true); setWin(null); sfx('whoosh')
    const k = weighted(items.map((x) => x.w)), s = slices[k]
    const land = s.a0 + s.span * (0.12 + rndf() * 0.76)
    const cur = rot.get()
    const delta = ((((-land - cur) % 360) + 360) % 360)
    const target = cur + (5 + rnd(3)) * 360 + delta
    animation.current?.stop()
    animation.current = animate(rot, target, { duration: o.dur, ease: [0.12, 0.7, 0.14, 1], onComplete: () => {
      if (!mounted.current) return
      setWin(items[k]); setBurst(Date.now()); sfx('ding'); log('wheel', `Wheel → ${items[k].t}`)
      if (o.elim) {
        schedule(() => {
          if (!mounted.current) return
          setO((st) => ({ ...st, items: st.items.filter((x) => x.id !== items[k].id) }))
          setWin(null); setBusy(false)
        }, 1800)
      } else setBusy(false)
    } })
  }
  const add = () => { const t = txt.trim(); if (!busy && t && items.length < 40) { upd({ items: [...items, mk(t)] }); setTxt(''); sfx('click') } }
  const setItem = (id, p) => { if (!busy) upd({ items: items.map((x) => (x.id === id ? { ...x, ...p } : x)) }) }
  const fs = items.length > 14 ? 5 : items.length > 9 ? 6.4 : 8

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Stage h={560} glow={cols[0]}>
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-4 gap-5" style={{ minHeight: 560 }}>
          <div className="relative w-full max-w-[400px] aspect-square">
            <motion.div key={tick} className="absolute left-1/2 -top-2 z-10 -ml-[13px]" style={{ transformOrigin: '50% 30%' }} animate={busy ? { rotate: [0, -16, 0] } : {}} transition={{ duration: 0.12 }}>
              <svg width="26" height="36" viewBox="0 0 26 36"><path d="M13 36 1 12A13 13 0 1 1 25 12Z" fill="var(--ink)" /><circle cx="13" cy="12" r="4.5" fill="var(--bg)" /></svg>
            </motion.div>
            <div className="absolute inset-0 rounded-full" style={{ boxShadow: '0 28px 50px -18px rgba(0,0,0,.45), 0 0 0 10px var(--surface), 0 0 0 12px var(--border)' }} />
            <motion.svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{ rotate: rot }}>
              {items.length === 0 ? <circle cx="100" cy="100" r="98" fill="var(--surface2)" /> : slices.map((s) => {
                const [x0, y0] = polar(98, s.a0), [x1, y1] = polar(98, s.a1), [tx, ty] = polar(62, s.mid)
                const isWin = win && win.id === s.id && !busy
                return (
                  <g key={s.id}>
                    <motion.path d={items.length === 1 ? 'M100 2a98 98 0 1 1 0 196a98 98 0 1 1 0-196' : `M100 100 L${x0} ${y0} A98 98 0 ${s.span > 180 ? 1 : 0} 1 ${x1} ${y1} Z`} fill={cols[s.i % cols.length]} stroke="rgba(255,255,255,.55)" strokeWidth="0.8" animate={{ opacity: isWin || !win || busy ? 1 : 0.45 }} />
                    <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight="800" fill="#fff" style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.25)', strokeWidth: 0.5 }} transform={`rotate(${s.mid - 90 + (s.mid > 180 ? 180 : 0)} ${tx} ${ty})`}>{s.t.length > 13 ? s.t.slice(0, 12) + '…' : s.t}</text>
                  </g>
                )
              })}
              {items.length > 1 && slices.map((s) => { const [x, y] = polar(95, s.a0); return <circle key={'p' + s.id} cx={x} cy={y} r="1.5" fill="#fff" opacity=".9" /> })}
              <circle cx="100" cy="100" r="15" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
              <circle cx="100" cy="100" r="5" fill="var(--copper)" />
            </motion.svg>
          </div>
          <div className="h-14 grid place-items-center">
            <AnimatePresence mode="wait">{win && <motion.div key={win.id + burst} initial={{ opacity: 0, y: 14, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} className="display font-semibold text-[32px] text-center" style={{ color: 'var(--copper)' }}>{win.t}</motion.div>}</AnimatePresence>
          </div>
          <PrimaryBtn icon="wheel" onClick={spin} busy={busy} disabled={busy || items.length < 2}>{busy ? 'Spinning…' : items.length < 2 ? 'Add at least 2 options' : 'Spin the wheel'}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label right={<span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{items.length} options</span>}>Options</Label>
          <div className="flex gap-2 mb-3">
            <input className="input flex-1 min-w-0" placeholder="Add an option…" value={txt} maxLength={80} disabled={busy || items.length >= 40} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <motion.button type="button" whileTap={{ scale: 0.88 }} whileHover={{ y: -2 }} onClick={add} disabled={busy || items.length >= 40} className="w-11 rounded-xl grid place-items-center disabled:opacity-50" style={{ background: 'var(--ink)', color: 'var(--bg)' }} aria-label="Add"><DIco n="plus" s={18} w={2.4} /></motion.button>
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {items.map((it, i) => (
                <motion.div key={it.id} layout initial={{ opacity: 0, x: 18, height: 0 }} animate={{ opacity: 1, x: 0, height: 'auto' }} exit={{ opacity: 0, x: -24, height: 0 }} transition={SPRING} className="flex items-center gap-2 rounded-xl pl-2.5 pr-1.5 py-1.5" style={{ background: 'var(--surface2)' }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cols[i % cols.length] }} />
                  <input value={it.t} maxLength={80} disabled={busy} aria-label={`Option ${i + 1}`} onChange={(e) => setItem(it.id, { t: e.target.value })} className="flex-1 min-w-0 bg-transparent outline-none text-[13.5px] font-medium" />
                  <div className="flex items-center rounded-full" style={{ background: 'var(--surface)' }}>
                    <button type="button" className="w-6 h-6 grid place-items-center disabled:opacity-40" disabled={busy} onClick={() => setItem(it.id, { w: Math.max(1, it.w - 1) })} aria-label="Lower weight"><DIco n="minus" s={11} w={2.6} /></button>
                    <span className="mono text-[11px] font-bold w-6 text-center">×{it.w}</span>
                    <button type="button" className="w-6 h-6 grid place-items-center disabled:opacity-40" disabled={busy} onClick={() => setItem(it.id, { w: Math.min(9, it.w + 1) })} aria-label="Raise weight"><DIco n="plus" s={11} w={2.6} /></button>
                  </div>
                  <button type="button" disabled={busy} onClick={() => upd({ items: items.filter((x) => x.id !== it.id) })} className="w-6 h-6 grid place-items-center rounded-full opacity-60 hover:opacity-100 disabled:opacity-30" aria-label={'Remove ' + it.t}><DIco n="x" s={13} w={2.4} /></button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-4"><div className="text-[11.5px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>Presets</div>
            <ChipRow small value="" onChange={(k) => { if (!busy) upd({ items: PRESETS[k].map((t) => mk(t)) }) }} options={Object.keys(PRESETS).map((k) => [k, k])} /></div>
        </Panel>
        <Panel delay={0.14}>
          <Label>Style</Label>
          <div className="space-y-5">
            <div><div className="text-[13.5px] font-semibold mb-2">Colours</div>
              <div className="flex gap-2.5">{Object.entries(PALETTES).map(([k, c]) => (
                <motion.button key={k} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }} onClick={() => { upd({ pal: k }); sfx('click') }} aria-label={k} className="relative w-11 h-11 rounded-full overflow-hidden" style={{ background: `conic-gradient(${c.slice(0, 4).map((x, i) => `${x} ${i * 25}% ${(i + 1) * 25}%`).join(',')})`, boxShadow: o.pal === k ? '0 0 0 3px var(--surface), 0 0 0 5px var(--copper)' : '0 4px 10px -4px rgba(0,0,0,.4)' }} />
              ))}</div></div>
            <div><div className="text-[13.5px] font-semibold mb-2">Spin time</div><Seg small value={String(o.dur)} onChange={(d) => upd({ dur: +d })} options={[['3', '3 s'], ['5', '5 s'], ['8', '8 s'], ['12', '12 s']]} /></div>
            <Switch on={o.elim} onChange={(elim) => upd({ elim })} label="Remove winner" hint="Knock options out one by one" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
