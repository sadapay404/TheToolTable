import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Stage, PrimaryBtn, Burst, Switch, Stepper, ChipRow, DIco, usePersist, useLog, rnd, rndf, sfx, SPRING } from './parts.jsx'

const TRUTHS = ['What is your most embarrassing moment?', 'What is a secret talent you have?', 'Who was your first celebrity crush?', 'What is the last lie you told?', 'What is your biggest fear?', 'Which habit of yours annoys others most?', 'What is the best gift you ever received?', 'What would you do with a million dollars?', 'What is the weirdest food you have eaten?', 'Who here would you swap lives with for a day?']
const DARES = ['Do your best impression of someone here.', 'Sing the chorus of any song.', 'Speak in a funny accent for 3 rounds.', 'Do 10 jumping jacks.', 'Let the group pick a contact and text them “hello”.', 'Tell a joke — you must make someone laugh.', 'Balance a spoon on your nose for 10 seconds.', 'Dance with no music for 20 seconds.', 'Say the alphabet backwards.', 'Walk like a runway model across the room.']
const COLORS = ['#B4715A', '#2F7FA6', '#7C6CD6', '#3EA6A0', '#E0A458', '#C3423F', '#59B6EC', '#B86BD1', '#4DBF9B', '#E86A92', '#8A6D3B', '#5B6CC4']
const polar = (r, deg) => [100 + r * Math.sin((deg * Math.PI) / 180), 100 - r * Math.cos((deg * Math.PI) / 180)]

export default function Bottle() {
  const log = useLog()
  const [o, setO] = usePersist('bottle', { names: ['', '', '', '', ''], td: false, dur: 4 })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const n = o.names.length
  const name = (i) => o.names[i]?.trim() || `Player ${i + 1}`
  const [rot, setRot] = useState(0)
  const [busy, setBusy] = useState(false)
  const [win, setWin] = useState(null)
  const [burst, setBurst] = useState(0)

  const setN = (k) => upd({ names: Array.from({ length: k }, (_, i) => o.names[i] || '') })
  const spin = () => {
    if (busy) return
    setBusy(true); setWin(null); sfx('whoosh')
    const k = rnd(n), slice = 360 / n, center = k * slice + (rndf() - 0.5) * slice * 0.5
    const cur = rot, delta = ((center - cur) % 360 + 360) % 360
    setRot(cur + (6 + rnd(3)) * 360 + delta)
    setTimeout(() => {
      setBusy(false); setBurst(Date.now()); sfx('ding')
      const kind = o.td ? (rnd(2) ? 'Truth' : 'Dare') : null
      const prompt = kind ? (kind === 'Truth' ? TRUTHS : DARES)[rnd(10)] : null
      setWin({ i: k, kind, prompt, k: Date.now() })
      log('bottle', `Bottle → ${name(k)}${kind ? ` (${kind})` : ''}`)
    }, o.dur * 1000 + 100)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Stage h={560} glow="#2F7FA6">
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-6 px-4 gap-4" style={{ minHeight: 560 }}>
          <div className="relative w-full max-w-[420px] aspect-square">
            <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full overflow-visible">
              <defs><radialGradient id="tbl" cx="50%" cy="45%"><stop offset="0" stopColor="color-mix(in srgb, var(--copper) 10%, var(--surface))" /><stop offset="1" stopColor="var(--surface2)" /></radialGradient></defs>
              <circle cx="100" cy="100" r="96" fill="url(#tbl)" stroke="var(--border)" strokeWidth="1.5" />
              <circle cx="100" cy="100" r="62" fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
              {o.names.map((_, i) => {
                const [x, y] = polar(80, (i * 360) / n), on = win && win.i === i && !busy
                const nm = name(i)
                return (
                  <motion.g key={i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: on ? 1.28 : 1 }} transition={{ ...SPRING, delay: i * 0.04 }} style={{ transformOrigin: `${x}px ${y}px` }}>
                    {on && <circle cx={x} cy={y} r="19" fill="none" stroke={COLORS[i % 12]} strokeWidth="2" opacity=".5"><animate attributeName="r" values="15;23;15" dur="1.4s" repeatCount="indefinite" /></circle>}
                    <circle cx={x} cy={y} r="14" fill={COLORS[i % 12]} stroke="var(--surface)" strokeWidth="2.5" />
                    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="800" fill="#fff">{nm.replace(/^Player /, '').slice(0, 2).toUpperCase()}</text>
                  </motion.g>
                )
              })}
            </svg>
            <motion.div className="absolute inset-0" animate={{ rotate: rot }} transition={{ duration: o.dur, ease: [0.12, 0.72, 0.16, 1] }}>
              <svg viewBox="0 0 200 200" className="w-full h-full" style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,.25))' }}>
                <defs><linearGradient id="gl" x1="0" x2="1"><stop offset="0" stopColor="#2f8f6a" /><stop offset=".45" stopColor="#7fd1a8" /><stop offset="1" stopColor="#1f6a4e" /></linearGradient></defs>
                <path d="M96 22h8v22c0 5 9 9 9 22v64a10 10 0 0 1-10 10H97a10 10 0 0 1-10-10V66c0-13 9-17 9-22Z" fill="url(#gl)" stroke="#16513b" strokeWidth="1.2" />
                <rect x="88" y="86" width="24" height="34" rx="2" fill="#fff8e6" opacity=".92" />
                <rect x="94" y="22" width="12" height="5" rx="2" fill="#B4715A" />
                <path d="M92 52c0-4 1-8 2-12" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" fill="none" />
                <circle cx="100" cy="100" r="3" fill="var(--ink)" opacity=".15" />
              </svg>
            </motion.div>
          </div>
          <div className="min-h-[88px] w-full max-w-[460px] grid place-items-center text-center">
            <AnimatePresence mode="wait">
              {win && <motion.div key={win.k} initial={{ opacity: 0, y: 14, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING}>
                <div className="display font-semibold text-[30px]" style={{ color: COLORS[win.i % 12] }}>{name(win.i)}</div>
                {win.kind && <div className="mt-1.5 text-[14px]"><b style={{ color: win.kind === 'Truth' ? '#2F7FA6' : '#C3423F' }}>{win.kind}:</b> {win.prompt}</div>}
              </motion.div>}
            </AnimatePresence>
          </div>
          <PrimaryBtn icon="bottle" onClick={spin} busy={busy} disabled={busy}>{busy ? 'Spinning…' : 'Spin the bottle'}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label>Players</Label>
          <Stepper label="Seats" value={n} min={2} max={12} onChange={setN} />
          <div className="mt-4 grid grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
            {o.names.map((nm, i) => (
              <motion.label key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: 'var(--surface2)' }}>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: COLORS[i % 12] }} />
                <input value={nm} placeholder={`Player ${i + 1}`} maxLength={14} onChange={(e) => upd({ names: o.names.map((x, j) => (j === i ? e.target.value : x)) })} className="min-w-0 flex-1 bg-transparent outline-none text-[13px] font-medium" />
              </motion.label>
            ))}
          </div>
        </Panel>
        <Panel delay={0.14}>
          <Label>Game</Label>
          <div className="space-y-5">
            <Switch on={o.td} onChange={(td) => upd({ td })} label="Truth or dare" hint="Lands on a player and gives a prompt" />
            <div><div className="text-[13.5px] font-semibold mb-2">Spin time</div><Seg small value={String(o.dur)} onChange={(d) => upd({ dur: +d })} options={[['3', '3 s'], ['4', '4 s'], ['6', '6 s'], ['9', '9 s']]} /></div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
