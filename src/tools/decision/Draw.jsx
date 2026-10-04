import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Stage, PrimaryBtn, Burst, Switch, Stepper, DIco, usePersist, useLog, rnd, shuffle, sfx, SPRING } from './parts.jsx'

const TEAM_COLORS = ['#B4715A', '#2F7FA6', '#7C6CD6', '#3EA6A0', '#E0A458', '#C3423F', '#59B6EC', '#B86BD1']
const SAMPLE = 'Ayesha\nBilal\nCarla\nDaniyal\nEmre\nFatima\nGulzar\nHamza\nIrfan\nJunaid'
const parse = (t) => t.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)

function Card({ name, i, color, num }) {
  return (
    <motion.div initial={{ rotateY: 90, opacity: 0, y: 20 }} animate={{ rotateY: 0, opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.1 }} style={{ transformPerspective: 600 }}
      className="relative flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[150px]" >
      <span className="absolute inset-0 rounded-2xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow)' }} />
      <span className="relative w-8 h-8 rounded-full grid place-items-center text-[12px] font-extrabold text-white shrink-0" style={{ background: color }}>{num ?? name.slice(0, 1).toUpperCase()}</span>
      <span className="relative display font-semibold text-[18px] truncate">{name}</span>
    </motion.div>
  )
}

export default function Draw() {
  const log = useLog()
  const [o, setO] = usePersist('draw', { text: SAMPLE, mode: 'pick', count: 1, teams: 2, remove: false })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const names = useMemo(() => parse(o.text), [o.text])
  const [res, setRes] = useState(null)
  const [burst, setBurst] = useState(0)
  const [busy, setBusy] = useState(false)

  const draw = () => {
    if (busy || names.length < (o.mode === 'teams' ? o.teams : 1)) return
    setBusy(true); sfx('whoosh')
    setTimeout(() => {
      let r
      const sh = shuffle(names)
      if (o.mode === 'pick') { const picked = sh.slice(0, Math.min(o.count, names.length)); r = { mode: 'pick', picked }; log('draw', `Drawn → ${picked.join(', ')}`)
        if (o.remove) upd({ text: names.filter((x) => !picked.includes(x)).join('\n') }) }
      else if (o.mode === 'teams') { const teams = Array.from({ length: o.teams }, () => []); sh.forEach((x, i) => teams[i % o.teams].push(x)); r = { mode: 'teams', teams }; log('draw', `${o.teams} teams made from ${names.length} names`) }
      else { r = { mode: 'order', order: sh }; log('draw', `Order → ${sh.slice(0, 4).join(' › ')}${sh.length > 4 ? '…' : ''}`) }
      r.k = Date.now(); setRes(r); setBusy(false); setBurst(Date.now()); sfx('ding')
    }, 650)
  }
  const label = o.mode === 'pick' ? 'Draw names' : o.mode === 'teams' ? 'Make teams' : 'Shuffle order'

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Stage h={520} glow="#7C6CD6">
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-5 gap-5" style={{ minHeight: 520 }}>
          <div className="flex-1 w-full flex items-center justify-center" style={{ perspective: 900 }}>
            <AnimatePresence mode="wait">
              {busy ? (
                <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                  {[0, 1, 2, 3, 4].map((i) => <motion.span key={i} className="w-12 h-16 rounded-xl" style={{ background: 'var(--ink)' }} animate={{ y: [0, -22, 0], rotate: [0, i % 2 ? 8 : -8, 0] }} transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.08 }} />)}
                </motion.div>
              ) : !res ? (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                  <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity }} className="mx-auto w-16 h-16 rounded-2xl grid place-items-center mb-4" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><DIco n="users" s={30} /></motion.div>
                  <div className="display font-semibold text-[22px]">{names.length} names ready</div>
                  <div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>Choose what to do, then press the button.</div>
                </motion.div>
              ) : res.mode === 'pick' ? (
                <motion.div key={res.k} className="flex flex-wrap gap-3 justify-center">{res.picked.map((x, i) => <Card key={x + i} name={x} i={i} color={TEAM_COLORS[i % 8]} num={i + 1} />)}</motion.div>
              ) : res.mode === 'order' ? (
                <motion.div key={res.k} className="grid sm:grid-cols-2 gap-2.5 w-full max-w-[560px]">{res.order.map((x, i) => <Card key={x + i} name={x} i={i * 0.5} color={TEAM_COLORS[i % 8]} num={i + 1} />)}</motion.div>
              ) : (
                <motion.div key={res.k} className="grid gap-4 w-full" style={{ gridTemplateColumns: `repeat(${Math.min(res.teams.length, 4)}, minmax(0,1fr))` }}>
                  {res.teams.map((tm, ti) => (
                    <motion.div key={ti} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: ti * 0.1 }} className="rounded-2xl overflow-hidden border border-line" style={{ background: 'var(--surface)' }}>
                      <div className="px-3 py-2 text-[12px] font-extrabold tracking-wider uppercase text-white" style={{ background: TEAM_COLORS[ti % 8] }}>Team {ti + 1} · {tm.length}</div>
                      <div className="p-2 space-y-1">{tm.map((x, i) => <motion.div key={x} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + ti * 0.1 + i * 0.07 }} className="text-[13.5px] font-medium px-2 py-1 rounded-lg" style={{ background: 'var(--surface2)' }}>{x}</motion.div>)}</div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <PrimaryBtn icon="shuffle" onClick={draw} busy={busy} disabled={busy || names.length < (o.mode === 'teams' ? o.teams : 1)}>{busy ? 'Shuffling…' : label}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label right={<span className="text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>{names.length} names</span>}>Names</Label>
          <textarea value={o.text} onChange={(e) => upd({ text: e.target.value })} rows={8} placeholder={'One name per line\n(or separate with commas)'} className="input w-full resize-none leading-relaxed" />
          <div className="flex gap-3 mt-3 text-[12px] font-semibold">
            <button type="button" onClick={() => upd({ text: SAMPLE })} style={{ color: 'var(--copper)' }}>Sample</button>
            <button type="button" onClick={() => upd({ text: shuffle(names).join('\n') })} style={{ color: 'var(--copper)' }}>Shuffle list</button>
            <button type="button" onClick={() => upd({ text: [...new Set(names)].join('\n') })} style={{ color: 'var(--copper)' }}>Remove duplicates</button>
            <button type="button" onClick={() => upd({ text: '' })} className="ml-auto" style={{ color: 'var(--muted)' }}>Clear</button>
          </div>
        </Panel>
        <Panel delay={0.14}>
          <Label>What to do</Label>
          <Seg value={o.mode} onChange={(mode) => upd({ mode })} options={[['pick', 'Pick'], ['teams', 'Teams'], ['order', 'Order']]} className="mb-5" />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={o.mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-4">
              {o.mode === 'pick' && <><Stepper label="Winners" value={Math.min(o.count, Math.max(1, names.length))} min={1} max={Math.max(1, names.length)} onChange={(count) => upd({ count })} /><Switch on={o.remove} onChange={(remove) => upd({ remove })} label="Remove winners" hint="So nobody is picked twice" /></>}
              {o.mode === 'teams' && <Stepper label="Teams" value={o.teams} min={2} max={8} onChange={(teams) => upd({ teams })} />}
              {o.mode === 'order' && <p className="text-[13px]" style={{ color: 'var(--muted)' }}>Shuffles everyone into a fair random running order.</p>}
            </motion.div>
          </AnimatePresence>
        </Panel>
      </div>
    </div>
  )
}
