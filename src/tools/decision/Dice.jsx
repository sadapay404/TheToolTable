import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Stage, Stepper, PrimaryBtn, Burst, ChipRow, Switch, Range, usePersist, useLog, useSafeTimeout, rnd, weighted, sfx, SPRING, CountText } from './parts.jsx'

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
// rotation that brings face v to the front: [rx, ry]
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] }
const CUBE_FACES = [[1, 'rotateY(0deg)'], [6, 'rotateY(180deg)'], [2, 'rotateY(90deg)'], [5, 'rotateY(-90deg)'], [3, 'rotateX(90deg)'], [4, 'rotateX(-90deg)']]

function Cube({ rot, size, rolling, delay }) {
  const half = size / 2
  return (
    <motion.div className="relative" style={{ width: size, height: size, transformStyle: 'preserve-3d' }} animate={{ rotateX: rot.x, rotateY: rot.y, y: rolling ? [0, -size * 0.7, 0] : 0 }} transition={{ rotateX: { duration: 1.5, ease: [0.2, 0.85, 0.3, 1], delay }, rotateY: { duration: 1.5, ease: [0.2, 0.85, 0.3, 1], delay }, y: { duration: 1.4, times: [0, 0.4, 1], ease: ['easeOut', 'easeIn'], delay } }}>
      {CUBE_FACES.map(([v, tf]) => (
        <div key={v} className="absolute inset-0 rounded-[18%] p-[14%] grid grid-cols-3 grid-rows-3 gap-[6%]" style={{ transform: `${tf} translateZ(${half}px)`, background: 'linear-gradient(145deg, #fffdf6, #e9e1cf)', boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.08), inset 0 -6px 12px rgba(0,0,0,.06)', backfaceVisibility: 'hidden' }}>
          {Array.from({ length: 9 }, (_, i) => <span key={i} className="rounded-full place-self-center" style={{ width: '78%', height: '78%', background: PIPS[v].includes(i) ? (v === 1 ? '#C3423F' : '#2a211c') : 'transparent', boxShadow: PIPS[v].includes(i) ? 'inset 0 2px 3px rgba(0,0,0,.45)' : 'none' }} />)}
        </div>
      ))}
    </motion.div>
  )
}

function Token({ value, faces, rolling, size, delay }) {
  const [flick, setFlick] = useState(value)
  useEffect(() => {
    if (!rolling) { setFlick(value); return }
    const id = setInterval(() => setFlick(1 + rnd(faces)), 70)
    return () => clearInterval(id)
  }, [rolling, faces, value])
  return (
    <motion.div className="grid place-items-center rounded-[22%] font-extrabold display relative" style={{ width: size, height: size, background: 'linear-gradient(145deg, var(--surface), var(--surface2))', border: '2px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: size * (faces >= 100 ? 0.34 : 0.46), color: 'var(--ink)' }}
      animate={rolling ? { rotate: [0, 18, -14, 10, 0], y: [0, -30, 0, -12, 0], scale: [1, 1.1, 1] } : { rotate: 0, y: 0 }} transition={{ duration: 1.4, delay }}>
      <span className="absolute top-2 left-3 text-[10px] font-bold tracking-wider" style={{ color: 'var(--muted)' }}>D{faces}</span>{flick}
    </motion.div>
  )
}

export default function Dice() {
  const log = useLog()
  const schedule = useSafeTimeout()
  const [o, setO] = usePersist('dice', { n: 2, faces: 6, mod: 0, loaded: false, fav: 6, power: 3 })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const [dice, setDice] = useState([{ v: 5, rot: { x: 0, y: 90 } }, { v: 3, rot: { x: -90, y: 0 } }])
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)
  const [hist, setHist] = useState([])
  const six = o.faces === 6
  const shown = Array.from({ length: o.n }, (_, i) => dice[i] || { v: 1, rot: { x: 0, y: 0 } })
  const size = o.n <= 2 ? 118 : o.n <= 4 ? 96 : 80
  const total = shown.reduce((a, d) => a + d.v, 0) + o.mod

  const roll = () => {
    if (busy) return
    setBusy(true); sfx('whoosh')
    const w = Array.from({ length: o.faces }, (_, i) => (o.loaded && i + 1 === Math.min(o.fav, o.faces) ? o.power : 1))
    const next = shown.map((d) => {
      const v = o.loaded ? weighted(w) + 1 : 1 + rnd(o.faces)
      const [bx, by] = six ? FACE_ROT[v] : [0, 0]
      return { v, rot: { x: Math.ceil(d.rot.x / 360) * 360 + 720 + rnd(2) * 360 + bx, y: Math.ceil(d.rot.y / 360) * 360 + 720 + rnd(2) * 360 + by }, rolling: true }
    })
    setDice(next)
    schedule(() => {
      sfx('thud'); setBusy(false); setDice((ds) => ds.map((d) => ({ ...d, rolling: false })))
      const sum = next.reduce((a, d) => a + d.v, 0) + o.mod
      setBurst(Date.now()); sfx('ding')
      setHist((h) => [{ sum, parts: next.map((d) => d.v), k: Date.now() }, ...h].slice(0, 8))
      log('dice', `${o.n}×D${o.faces}${o.mod ? (o.mod > 0 ? '+' : '') + o.mod : ''} → ${sum} (${next.map((d) => d.v).join(' + ')})`)
    }, 1600 + o.n * 70)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Stage h={540} glow="#C3423F">
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-4" style={{ minHeight: 540 }}>
          <div className="flex-1 flex items-center justify-center gap-7 flex-wrap" style={{ perspective: 900 }}>
            {shown.map((d, i) => (
              <div key={i} className="flex flex-col items-center">
                {six ? <Cube rot={d.rot} size={size} rolling={d.rolling} delay={i * 0.07} /> : <Token value={d.v} faces={o.faces} rolling={d.rolling} size={size + 10} delay={i * 0.07} />}
                <motion.div className="rounded-[50%] mt-8" style={{ width: size * 0.9, height: size * 0.12, background: 'radial-gradient(ellipse, rgba(0,0,0,.32), transparent 70%)' }} animate={d.rolling ? { scaleX: [1, 0.5, 1], opacity: [1, 0.3, 1] } : {}} transition={{ duration: 1.4, times: [0, 0.4, 1], delay: i * 0.07 }} />
              </div>
            ))}
          </div>
          <div className="h-16 mb-3 flex flex-col items-center justify-center">
            <div className="display font-semibold text-[40px] leading-none" style={{ color: 'var(--copper)' }}><CountText value={total} format={(v) => Math.round(v)} /></div>
            <div className="text-[12px] mt-1.5" style={{ color: 'var(--muted)' }}>{o.n > 1 || o.mod ? shown.map((d) => d.v).join(' + ') + (o.mod ? ` ${o.mod > 0 ? '+' : '−'} ${Math.abs(o.mod)}` : '') : 'total'}</div>
          </div>
          <PrimaryBtn icon="dice" onClick={roll} busy={busy} disabled={busy}>{busy ? 'Rolling…' : `Roll ${o.n} × D${o.faces}`}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label>Dice</Label>
          <div className="space-y-5">
            <Stepper label="How many" value={o.n} min={1} max={6} onChange={(n) => upd({ n })} />
            <div><div className="text-[13.5px] font-semibold mb-2">Type</div>
              <ChipRow value={[4, 6, 8, 10, 12, 20, 100].includes(o.faces) ? o.faces : 0} onChange={(f) => f && upd({ faces: f })} options={[4, 6, 8, 10, 12, 20, 100].map((f) => [f, 'D' + f])} small /></div>
            <Range label="Custom faces" min={2} max={120} value={o.faces} onChange={(faces) => upd({ faces, fav: Math.min(o.fav, faces) })} fmt={(v) => 'D' + v} />
            <Stepper label="Modifier" value={o.mod} min={-20} max={20} onChange={(mod) => upd({ mod })} />
          </div>
        </Panel>
        <Panel delay={0.14}>
          <Label>Loaded dice</Label>
          <Switch on={o.loaded} onChange={(loaded) => upd({ loaded })} label="Favour one face" hint="For board-game house rules and pranks" />
          <AnimatePresence initial={false}>{o.loaded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="space-y-4 pt-4">
              <Range label="Favoured face" min={1} max={o.faces} value={Math.min(o.fav, o.faces)} onChange={(fav) => upd({ fav })} />
              <Range label="Strength" min={2} max={12} value={o.power} onChange={(power) => upd({ power })} fmt={(v) => v + '×'} />
            </div></motion.div>)}</AnimatePresence>
        </Panel>
        <Panel delay={0.2}>
          <Label>Last rolls</Label>
          {!hist.length && <div className="text-[13px]" style={{ color: 'var(--muted)' }}>Rolls appear here.</div>}
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>{hist.slice(0, 5).map((h) => (
              <motion.div key={h.k} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'var(--surface2)' }}>
                <span className="mono text-[12px]" style={{ color: 'var(--muted)' }}>{h.parts.join(' + ')}</span><b className="display text-[18px]">{h.sum}</b>
              </motion.div>))}</AnimatePresence>
          </div>
        </Panel>
      </div>
    </div>
  )
}
