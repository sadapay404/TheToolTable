import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Stage, PrimaryBtn, Burst, Switch, Stepper, ChipRow, CountText, usePersist, useLog, useSafeTimeout, rnd, rndf, shuffle, sfx, SPRING } from './parts.jsx'

const PRESETS = { '1 – 6': { min: 1, max: 6, count: 1, unique: false }, '1 – 10': { min: 1, max: 10, count: 1, unique: false }, '1 – 100': { min: 1, max: 100, count: 1, unique: false }, 'Lottery 6/49': { min: 1, max: 49, count: 6, unique: true, sort: true }, 'PIN (4 digits)': { min: 0, max: 9, count: 4, unique: false, sort: false }, '0 or 1': { min: 0, max: 1, count: 8, unique: false } }

export default function Numbers() {
  const log = useLog()
  const schedule = useSafeTimeout()
  const [o, setO] = usePersist('numbers', { min: 1, max: 100, count: 5, dec: 0, unique: true, sort: false })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const [res, setRes] = useState(null)
  const [burst, setBurst] = useState(0)
  const [busy, setBusy] = useState(false)
  const lo = Math.min(o.min, o.max), hi = Math.max(o.min, o.max)
  const span = hi - lo + 1
  const bad = o.dec === 0 && o.unique && o.count > span

  const gen = () => {
    if (busy || bad) return
    setBusy(true); sfx('whoosh')
    schedule(() => {
      let list = []
      if (o.dec > 0) { const f = 10 ** o.dec; for (let i = 0; i < o.count; i++) list.push(Math.round((lo + rndf() * (hi - lo)) * f) / f) }
      else if (o.unique) { if (span <= 200000) list = shuffle(Array.from({ length: span }, (_, i) => lo + i)).slice(0, o.count); else { const s = new Set(); while (s.size < o.count) s.add(lo + rnd(span)); list = [...s] } }
      else for (let i = 0; i < o.count; i++) list.push(lo + rnd(span))
      if (o.sort) list.sort((a, b) => a - b)
      const sum = list.reduce((a, b) => a + b, 0)
      setRes({ list, sum, avg: sum / list.length, min: Math.min(...list), max: Math.max(...list), k: Date.now() })
      setBusy(false); setBurst(Date.now()); sfx('ding'); log('numbers', `Numbers → ${list.slice(0, 8).join(', ')}${list.length > 8 ? '…' : ''}`)
    }, 450)
  }
  const num = (k, label) => (
    <label className="block"><span className="text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }}>{label}</span>
      <input type="number" value={o[k]} onChange={(e) => upd({ [k]: Math.round(+e.target.value || 0) })} className="input mt-1 w-full" /></label>
  )
  const big = res && res.list.length <= 3

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Stage h={540} glow="#2F9C95">
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-5 gap-5" style={{ minHeight: 540 }}>
          <div className="flex-1 w-full flex items-center justify-center">
            <AnimatePresence mode="wait">
              {busy ? <motion.div key="b" className="flex gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{Array.from({ length: Math.min(o.count, 6) }, (_, i) => <motion.span key={i} className="w-3.5 h-3.5 rounded-full" style={{ background: 'var(--copper)' }} animate={{ y: [0, -18, 0], scale: [1, 1.3, 1] }} transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.07 }} />)}</motion.div>
                : !res ? <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center"><div className="display font-semibold text-[56px] leading-none" style={{ color: 'var(--border)' }}>{lo}–{hi}</div><div className="text-[13px] mt-3" style={{ color: 'var(--muted)' }}>{o.count} {o.unique ? 'unique ' : ''}number{o.count > 1 ? 's' : ''}</div></motion.div>
                  : <motion.div key={res.k} className="w-full">
                    <div className="flex flex-wrap gap-3 justify-center">
                      {res.list.map((v, i) => <motion.div key={i} initial={{ opacity: 0, y: 24, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay: i * 0.06 }} className="display font-semibold tabular-nums rounded-2xl grid place-items-center" style={{ minWidth: big ? 130 : 72, height: big ? 110 : 64, padding: '0 14px', fontSize: big ? 52 : 28, background: 'var(--surface)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow)', color: i % 2 ? 'var(--copper)' : 'var(--ink)' }}>{v}</motion.div>)}
                    </div>
                    {res.list.length > 1 && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex justify-center gap-5 mt-7 text-center">
                      {[['Sum', res.sum], ['Average', res.avg], ['Lowest', res.min], ['Highest', res.max]].map(([l, v]) => <div key={l}><div className="display font-semibold text-[20px] tabular-nums"><CountText value={v} format={(x) => Number(x.toFixed(2)).toLocaleString('en-US')} /></div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{l}</div></div>)}
                    </motion.div>}
                  </motion.div>}
            </AnimatePresence>
          </div>
          <div className="text-[12px] h-4" style={{ color: '#C3423F' }}>{bad ? `Only ${span} different numbers exist in that range — lower the count or turn off “unique”.` : ''}</div>
          <PrimaryBtn icon="hash" onClick={gen} busy={busy} disabled={busy || bad}>{busy ? 'Generating…' : 'Generate'}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label>Range</Label>
          <div className="grid grid-cols-2 gap-3 mb-4">{num('min', 'From')}{num('max', 'To')}</div>
          <ChipRow small value="" onChange={(k) => upd(PRESETS[k])} options={Object.keys(PRESETS).map((k) => [k, k])} />
        </Panel>
        <Panel delay={0.14}>
          <Label>Options</Label>
          <div className="space-y-4">
            <Stepper label="How many" value={o.count} min={1} max={30} onChange={(count) => upd({ count })} />
            <div><div className="text-[13.5px] font-semibold mb-2">Decimals</div><Seg small value={String(o.dec)} onChange={(d) => upd({ dec: +d })} options={[['0', 'None'], ['1', '1'], ['2', '2'], ['3', '3']]} /></div>
            <Switch on={o.unique} onChange={(unique) => upd({ unique })} disabled={o.dec > 0} label="No repeats" hint={o.dec > 0 ? 'Available for whole numbers only' : 'Whole numbers only'} />
            <Switch on={o.sort} onChange={(sort) => upd({ sort })} label="Sort ascending" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
