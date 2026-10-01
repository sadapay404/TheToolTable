import React, { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Field, Note } from '../components/ui.jsx'
import { recentAction } from '../lib/utils.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }

function clickSound(freq = 1800) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)()
    const o = ac.createOscillator(), g = ac.createGain()
    o.frequency.value = freq; o.type = 'triangle'
    g.gain.setValueAtTime(0.16, ac.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.16)
    o.connect(g); g.connect(ac.destination)
    o.start(); o.stop(ac.currentTime + 0.18)
  } catch {}
}

/* ---------- 3D COIN ---------- */
function CoinFlip() {
  const [rot, setRot] = useState(0)
  const [result, setResult] = useState(null)
  const [flipping, setFlipping] = useState(false)

  function flip() {
    if (flipping) return
    setFlipping(true); setResult(null)
    const face = Math.random() < 0.5 ? 0 : 180 // heads=0
    const spins = 5 + Math.floor(Math.random() * 4)
    setRot((r) => r + spins * 360 + ((face - (r % 360) + 360) % 360))
    clickSound(900)
    setTimeout(() => { setResult(face === 0 ? 'HEADS' : 'TAILS'); setFlipping(false); recentAction(`Coin flip → ${face === 0 ? 'Heads' : 'Tails'}`); clickSound(1400) }, 2200)
  }

  return (
    <div className="flex flex-col items-center gap-8 py-8" style={{ perspective: 1200 }}>
      <motion.div
        className="relative w-44 h-44"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: rot }}
        transition={{ duration: 2.2, ease: [0.2, 0.8, 0.3, 1] }}
      >
        {['HEADS', 'TAILS'].map((side, i) => (
          <div
            key={side}
            className="absolute inset-0 rounded-full grid place-items-center text-2xl font-extrabold tracking-widest"
            style={{
              background: i === 0 ? 'radial-gradient(circle at 35% 30%, #FFE9B8, #E8B84B 60%, #B8860B)' : 'radial-gradient(circle at 35% 30%, #E8E8F2, #A8B2C8 60%, #6B7690)',
              color: '#3A2E10', border: '6px solid rgba(0,0,0,0.15)',
              transform: `rotateX(${i * 180}deg) translateZ(6px)`, backfaceVisibility: 'hidden',
              boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4)',
            }}
          >{side === 'HEADS' ? '👑' : '🦅'}<span className="absolute bottom-6 text-[10px]">{side}</span></div>
        ))}
      </motion.div>
      <AnimatePresence mode="wait">
        {result && (
          <motion.div key={result} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING}
            className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--accent)' }}>{result}</motion.div>
        )}
      </AnimatePresence>
      <motion.button className="btn btn-primary text-lg px-8 py-3" whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }} onClick={flip} disabled={flipping}>
        {flipping ? 'Flipping…' : '🪙 Flip coin'}
      </motion.button>
    </div>
  )
}

/* ---------- BOTTLE SPIN ---------- */
function BottleSpin() {
  const [n, setN] = useState(4)
  const [names, setNames] = useState(Array(4).fill(''))
  const [rot, setRot] = useState(0)
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)
  const slice = 360 / n

  function setPlayers(v) {
    const k = Math.max(2, Math.min(12, v))
    setN(k)
    setNames((old) => Array.from({ length: k }, (_, i) => old[i] || ''))
    setWinner(null)
  }

  function spin() {
    if (spinning) return
    setSpinning(true); setWinner(null)
    const target = Math.floor(Math.random() * n)
    // bottle pointer ends at angle pointing to slice center
    const targetAngle = target * slice + slice / 2
    const spins = 6 + Math.floor(Math.random() * 3)
    setRot((r) => r + spins * 360 + ((360 - targetAngle - (r % 360) + 720) % 360))
    clickSound(700)
    setTimeout(() => {
      setWinner(names[target]?.trim() || `Player ${target + 1}`)
      setSpinning(false)
      recentAction(`Bottle spin → ${names[target] || `Player ${target + 1}`}`)
    }, 3600)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-center">
      <div className="relative mx-auto w-full max-w-md aspect-square">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {Array.from({ length: n }).map((_, i) => {
            const a0 = ((i * slice - 90) * Math.PI) / 180, a1 = (((i + 1) * slice - 90) * Math.PI) / 180
            const large = slice > 180 ? 1 : 0
            return <path key={i} d={`M100,100 L${100 + 95 * Math.cos(a0)},${100 + 95 * Math.sin(a0)} A95,95 0 ${large},1 ${100 + 95 * Math.cos(a1)},${100 + 95 * Math.sin(a1)} Z`}
              fill={i % 2 ? 'var(--surface2)' : 'var(--surface)'} stroke="var(--border)" strokeWidth="1.5" />
          })}
          {Array.from({ length: n }).map((_, i) => {
            const a = ((i * slice + slice / 2 - 90) * Math.PI) / 180
            return <text key={i} x={100 + 68 * Math.cos(a)} y={100 + 68 * Math.sin(a)} textAnchor="middle" dominantBaseline="middle"
              fontSize="9" fontWeight="800" fill="var(--ink)">{(names[i]?.trim() || `P${i + 1}`).slice(0, 8)}</text>
          })}
        </svg>
        <motion.div className="absolute inset-[18%] grid place-items-center" animate={{ rotate: rot }} transition={{ duration: 3.6, ease: [0.12, 0.8, 0.16, 1] }}>
          <div style={{ width: 22, height: '92%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent', borderBottom: '26px solid var(--accent)' }} />
            <div style={{ position: 'absolute', top: 24, bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 10, borderRadius: 6, background: 'var(--accent2)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 22, height: 22, borderRadius: 9, background: 'var(--accent)' }} />
          </div>
        </motion.div>
      </div>
      <div className="space-y-4">
        <Field label={`Players — ${n} (2–12)`}>
          <input type="range" className="w-full" min="2" max="12" value={n} onChange={(e) => setPlayers(+e.target.value)} />
        </Field>
        <div className="max-h-44 overflow-auto space-y-2 pr-1">
          {names.map((nm, i) => (
            <input key={i} className="input" placeholder={`Player ${i + 1}`} value={nm} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
        </div>
        {winner && <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>🍾 {winner}!</motion.div>}
        <motion.button className="btn btn-primary w-full" whileTap={{ scale: 0.9 }} onClick={spin} disabled={spinning}>{spinning ? 'Spinning…' : 'Spin the bottle'}</motion.button>
      </div>
    </div>
  )
}

/* ---------- DICE ---------- */
function Dice() {
  const [faces, setFaces] = useState(6)
  const [loaded, setLoaded] = useState(false)
  const [weightFace, setWeightFace] = useState(6)
  const [value, setValue] = useState(6)
  const [rolling, setRolling] = useState(false)
  const [tumble, setTumble] = useState({ x: 0, y: 0 })

  function roll() {
    if (rolling) return
    setRolling(true)
    let r
    if (loaded) {
      const weights = Array.from({ length: faces }, (_, i) => (i + 1 === weightFace ? 3 : 1))
      const total = weights.reduce((a, b) => a + b, 0)
      let x = Math.random() * total
      r = weights.findIndex((w) => (x -= w) < 0) + 1
    } else r = 1 + Math.floor(Math.random() * faces)
    setTumble((t) => ({ x: t.x + 720 + Math.random() * 360, y: t.y + 720 + Math.random() * 360 }))
    clickSound(500)
    setTimeout(() => { setValue(r); setRolling(false); recentAction(`D${faces} rolled ${r}`) }, 1400)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-6 items-center">
      <div className="flex flex-col items-center gap-6 py-6" style={{ perspective: 900 }}>
        <motion.div
          className="grid place-items-center rounded-3xl font-extrabold"
          style={{ width: 130, height: 130, background: 'linear-gradient(145deg, var(--surface), var(--surface2))', border: '2px solid var(--border)', boxShadow: 'var(--shadow-lg)', fontSize: faces <= 20 ? 52 : 34, color: 'var(--ink)' }}
          animate={{ rotateX: tumble.x, rotateY: tumble.y }}
          transition={{ duration: 1.4, ease: [0.2, 0.9, 0.3, 1] }}
        >{value}</motion.div>
        <motion.button className="btn btn-primary px-8" whileTap={{ scale: 0.88 }} onClick={roll} disabled={rolling}>{rolling ? 'Rolling…' : `🎲 Roll D${faces}`}</motion.button>
      </div>
      <div className="space-y-4">
        <Field label="Dice type">
          <div className="flex flex-wrap gap-2">{[4, 6, 8, 10, 12, 20, 100].map((f) => <button key={f} className="chip" data-on={faces === f} onClick={() => { setFaces(f); setValue(f) }}>D{f}</button>)}</div>
        </Field>
        <Field label="Custom faces">
          <input type="number" className="input" min="2" max="999" value={faces} onChange={(e) => { const f = Math.max(2, Math.min(999, +e.target.value || 2)); setFaces(f) }} />
        </Field>
        <label className="flex items-center gap-2 font-semibold text-sm"><input type="checkbox" checked={loaded} onChange={(e) => setLoaded(e.target.checked)} /> Loaded dice</label>
        {loaded && (
          <Field label={`Favoured face — ${weightFace}`}>
            <input type="range" className="w-full" min="1" max={faces} value={Math.min(weightFace, faces)} onChange={(e) => setWeightFace(+e.target.value)} />
            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>This face rolls 3× more often.</div>
          </Field>
        )}
      </div>
    </div>
  )
}

/* ---------- WHEEL ---------- */
const WHEEL_COLORS = ['#C87941', '#3E8ED0', '#D04841', '#7B6CB0', '#2F9C95', '#E8A33D', '#5F6CAF', '#4E937A', '#9D6BCE', '#C3423F']

function Wheel() {
  const [slices, setSlices] = useState(['Pizza 🍕', 'Sushi 🍣', 'Tacos 🌮', 'Burgers 🍔', 'Pasta 🍝', 'Salad 🥗'])
  const [text, setText] = useState('')
  const [rot, setRot] = useState(0)
  const [winner, setWinner] = useState(null)
  const [spinning, setSpinning] = useState(false)

  function add() {
    if (text.trim()) { setSlices([...slices, text.trim()]); setText('') }
  }

  function spin() {
    if (spinning || slices.length < 2) return
    setSpinning(true); setWinner(null)
    const per = 360 / slices.length
    const target = Math.floor(Math.random() * slices.length)
    const targetAngle = target * per + per / 2
    setRot((r) => r + (7 + Math.floor(Math.random() * 3)) * 360 + ((270 - targetAngle - (r % 360) + 720) % 360))
    clickSound(600)
    setTimeout(() => { setWinner(slices[target]); setSpinning(false); recentAction(`Wheel → ${slices[target]}`) }, 4200)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-center">
      <div className="relative mx-auto w-full max-w-sm aspect-square">
        <div className="absolute left-1/2 -top-1 z-10 -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '22px solid var(--accent)', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.3))' }} />
        <motion.svg viewBox="0 0 200 200" className="w-full h-full" animate={{ rotate: rot }} transition={{ duration: 4.2, ease: [0.1, 0.75, 0.12, 1] }}>
          {slices.map((s, i) => {
            const per = 360 / slices.length
            const a0 = ((i * per - 90) * Math.PI) / 180, a1 = (((i + 1) * per - 90) * Math.PI) / 180
            const mid = ((i * per + per / 2 - 90) * Math.PI) / 180
            return (
              <g key={i}>
                <path d={`M100,100 L${100 + 96 * Math.cos(a0)},${100 + 96 * Math.sin(a0)} A96,96 0 0,1 ${100 + 96 * Math.cos(a1)},${100 + 96 * Math.sin(a1)} Z`}
                  fill={WHEEL_COLORS[i % WHEEL_COLORS.length]} stroke="rgba(0,0,0,0.18)" strokeWidth="1" />
                <text x={100 + 60 * Math.cos(mid)} y={100 + 60 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle"
                  fontSize="8" fontWeight="800" fill="#fff" transform={`rotate(${i * per + per / 2}, ${100 + 60 * Math.cos(mid)}, ${100 + 60 * Math.sin(mid)})`}>
                  {s.slice(0, 10)}
                </text>
              </g>
            )
          })}
          <circle cx="100" cy="100" r="14" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
        </motion.svg>
      </div>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="input" placeholder="Add slice…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn" onClick={add}>＋</button>
        </div>
        <div className="flex flex-wrap gap-2 max-h-40 overflow-auto">
          {slices.map((s, i) => (
            <span key={i} className="chip" onClick={() => setSlices(slices.filter((_, j) => j !== i))} title="Click to remove">
              <span className="w-2 h-2 rounded-full" style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] }} />{s} ✕
            </span>
          ))}
        </div>
        {winner && <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="text-xl font-extrabold" style={{ color: 'var(--accent)' }}>🎉 {winner}</motion.div>}
        <motion.button className="btn btn-primary w-full" whileTap={{ scale: 0.9 }} onClick={spin} disabled={spinning || slices.length < 2}>{spinning ? 'Spinning…' : '🎡 Spin the wheel'}</motion.button>
      </div>
    </div>
  )
}

export default function DecisionHub() {
  const [tab, setTab] = useState('coin')
  const tabs = [['coin', '🪙 Coin Flip'], ['bottle', '🍾 Bottle Spin'], ['dice', '🎲 Dice'], ['wheel', '🎡 Wheel']]
  const Comps = { coin: CoinFlip, bottle: BottleSpin, dice: Dice, wheel: Wheel }
  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {tabs.map(([id, l]) => <button key={id} className="chip" data-on={tab === id} onClick={() => { setTab(id); clickSound(1200) }}>{l}</button>)}
      </div>
      <div className="card p-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} transition={SPRING}>
            {React.createElement(Comps[tab])}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
