import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Stage, Stepper, PrimaryBtn, Burst, ChipRow, DIco, usePersist, useLog, useSafeTimeout, rnd, sfx, SPRING, CountText } from './parts.jsx'

const METALS = {
  gold: { name: 'Gold', a: '#FFE9B8', b: '#E8B84B', c: '#B8860B', rim: '#9a7010', ink: '#5a4208' },
  silver: { name: 'Silver', a: '#F4F5FA', b: '#B9C0D2', c: '#7A859E', rim: '#68728a', ink: '#3b4358' },
  copper: { name: 'Copper', a: '#FFD7BE', b: '#D2855A', c: '#8F4B2A', rim: '#7a3d20', ink: '#4a2412' },
  obsidian: { name: 'Obsidian', a: '#5b5b66', b: '#2b2b33', c: '#14141a', rim: '#0b0b0f', ink: '#d9c48a' },
}

function CoinBody({ rot, toss, metal, labels, size, dur, idx }) {
  const m = METALS[metal]
  const face = (txt, back) => (
    <div className="absolute inset-0 rounded-full grid place-items-center" style={{ background: `radial-gradient(circle at 34% 28%, ${m.a}, ${m.b} 58%, ${m.c})`, transform: `${back ? 'rotateX(180deg) ' : ''}translateZ(${size * 0.045}px)`, backfaceVisibility: 'hidden', boxShadow: `inset 0 0 0 ${size * 0.035}px ${m.rim}55, inset 0 0 0 ${size * 0.06}px ${m.a}66` }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full"><circle cx="50" cy="50" r="38" fill="none" stroke={m.ink} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="1.2 3.2" /></svg>
      <span className="relative text-center font-extrabold tracking-[0.18em] uppercase px-3 leading-tight" style={{ color: m.ink, fontSize: Math.max(10, size * (txt.length > 6 ? 0.1 : 0.13)), textShadow: `0 1px 0 ${m.a}` }}>{txt}</span>
    </div>
  )
  return (
    <motion.div className="relative" style={{ width: size, height: size, transformStyle: 'preserve-3d' }} animate={{ rotateX: rot, y: toss ? [0, -size * 0.85, 0] : 0, scale: toss ? [1, 1.28, 1] : 1 }}
      transition={{ rotateX: { duration: dur, ease: [0.18, 0.8, 0.3, 1], delay: idx * 0.06 }, y: { duration: dur * 0.9, ease: ['easeOut', 'easeIn'], times: [0, 0.5, 1], delay: idx * 0.06 }, scale: { duration: dur * 0.9, times: [0, 0.5, 1], delay: idx * 0.06 } }}>
      {Array.from({ length: 9 }, (_, i) => <div key={i} className="absolute inset-0 rounded-full" style={{ background: m.rim, transform: `translateZ(${(i - 4) * size * 0.01}px)` }} />)}
      {face(labels[0], false)}{face(labels[1], true)}
    </motion.div>
  )
}

export default function Coin() {
  const log = useLog()
  const schedule = useSafeTimeout()
  const [o, setO] = usePersist('coin', { n: 1, metal: 'gold', heads: 'Heads', tails: 'Tails', speed: 'normal' })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const [coins, setCoins] = useState([{ rot: 0, face: 0 }])
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)
  const [stats, setStats] = useState({ h: 0, t: 0, streak: 0, last: null })
  const [out, setOut] = useState(null)
  const dur = { slow: 3, normal: 2.2, fast: 1.3 }[o.speed]
  const labels = [o.heads || 'Heads', o.tails || 'Tails']
  const shown = Array.from({ length: o.n }, (_, i) => coins[i] || { rot: 0, face: 0 })
  const size = o.n <= 1 ? 190 : o.n <= 3 ? 130 : 100

  const flip = () => {
    if (busy) return
    setBusy(true); setOut(null); sfx('whoosh')
    const next = shown.map((c) => { const face = rnd(2); const spins = 4 + rnd(4); const cur = c.rot; const base = Math.ceil(cur / 360) * 360; return { rot: base + spins * 360 + face * 180, face, toss: true } })
    setCoins(next)
    schedule(() => {
      sfx('thud'); setBusy(false)
      setCoins((cs) => cs.map((c) => ({ ...c, toss: false })))
      const h = next.filter((c) => c.face === 0).length, t = next.length - h
      const txt = next.length === 1 ? labels[next[0].face] : `${h} × ${labels[0]}, ${t} × ${labels[1]}`
      setOut({ txt, k: Date.now() }); setBurst(Date.now()); sfx('ding')
      setStats((s) => ({ h: s.h + h, t: s.t + t, last: next.length === 1 ? next[0].face : null, streak: next.length === 1 ? (s.last === next[0].face ? s.streak + 1 : 1) : s.streak }))
      log('coin', `Coin → ${txt}`)
    }, dur * 1000 + o.n * 60 + 80)
  }
  const total = stats.h + stats.t, pct = total ? (stats.h / total) * 100 : 50

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Stage h={540} glow={METALS[o.metal].b}>
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-4" style={{ minHeight: 540 }}>
          <div className="flex-1 flex items-center justify-center gap-5 flex-wrap" style={{ perspective: 1100 }}>
            {shown.map((c, i) => (
              <div key={i} className="relative flex flex-col items-center">
                <CoinBody rot={c.rot} toss={c.toss} metal={o.metal} labels={labels} size={size} dur={dur} idx={i} />
                <motion.div className="rounded-[50%] mt-6" style={{ width: size * 0.8, height: size * 0.1, background: 'radial-gradient(ellipse, rgba(0,0,0,.35), transparent 70%)' }} animate={c.toss ? { scaleX: [1, 0.55, 1], opacity: [1, 0.4, 1] } : {}} transition={{ duration: dur * 0.9, times: [0, 0.5, 1], delay: i * 0.06 }} />
              </div>
            ))}
          </div>
          <div className="h-14 grid place-items-center mb-3">
            <AnimatePresence mode="wait">{out && <motion.div key={out.k} initial={{ opacity: 0, y: 14, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} className="display font-semibold text-[34px]" style={{ color: 'var(--copper)' }}>{out.txt}</motion.div>}</AnimatePresence>
          </div>
          <PrimaryBtn icon="coin" onClick={flip} busy={busy} disabled={busy}>{busy ? 'Flipping…' : o.n > 1 ? `Flip ${o.n} coins` : 'Flip the coin'}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label>Coins</Label>
          <div className="space-y-5">
            <Stepper label="How many" value={o.n} min={1} max={6} onChange={(n) => upd({ n })} />
            <div><div className="text-[13.5px] font-semibold mb-2">Metal</div>
              <div className="flex gap-2.5">{Object.entries(METALS).map(([k, m]) => (
                <motion.button key={k} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.88 }} onClick={() => { upd({ metal: k }); sfx('click') }} aria-label={m.name} title={m.name} className="relative w-11 h-11 rounded-full" style={{ background: `radial-gradient(circle at 34% 28%, ${m.a}, ${m.b} 58%, ${m.c})`, boxShadow: o.metal === k ? '0 0 0 3px var(--surface), 0 0 0 5px var(--copper)' : '0 4px 10px -4px rgba(0,0,0,.4)' }} />
              ))}</div></div>
            <div><div className="text-[13.5px] font-semibold mb-2">Speed</div><Seg small value={o.speed} onChange={(speed) => upd({ speed })} options={[['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']]} /></div>
          </div>
        </Panel>
        <Panel delay={0.14}>
          <Label>Sides</Label>
          <div className="grid grid-cols-2 gap-3">
            {[['heads', 'Side A'], ['tails', 'Side B']].map(([k, l]) => (
              <label key={k} className="block"><span className="text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }}>{l}</span>
                <input value={o[k]} maxLength={12} onChange={(e) => upd({ [k]: e.target.value })} className="input mt-1 w-full" /></label>
            ))}
          </div>
          <ChipRow small value="" onChange={(v) => upd({ heads: v.split('/')[0], tails: v.split('/')[1] })} options={[['Heads/Tails', 'Heads / Tails'], ['Yes/No', 'Yes / No'], ['Me/You', 'Me / You'], ['Go/Stay', 'Go / Stay']]} />
        </Panel>
        <Panel delay={0.2}>
          <Label right={total ? <button className="text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }} onClick={() => setStats({ h: 0, t: 0, streak: 0, last: null })}>Reset</button> : null}>Session</Label>
          <div className="flex items-end justify-between mb-2">
            <div><div className="display font-semibold text-[28px] leading-none"><CountText value={stats.h} format={(v) => Math.round(v)} /></div><div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>{labels[0]}</div></div>
            <div className="text-right"><div className="display font-semibold text-[28px] leading-none"><CountText value={stats.t} format={(v) => Math.round(v)} /></div><div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>{labels[1]}</div></div>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}><motion.div className="h-full" style={{ background: 'var(--copper)' }} animate={{ width: pct + '%' }} transition={SPRING} /></div>
          <div className="text-[11.5px] mt-2.5" style={{ color: 'var(--muted)' }}>{stats.streak > 1 ? `Streak: ${stats.streak} × ${labels[stats.last]}` : total ? `${total} flips so far` : 'No flips yet'}</div>
        </Panel>
      </div>
    </div>
  )
}
