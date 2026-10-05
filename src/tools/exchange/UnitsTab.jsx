import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CATEGORIES, CAT, convertUnit, fmtNum, parseUnitValue, isUnitNumberDraft } from '../../lib/units/units'
import { Ico, SwapButton, Picker, SelectChip, CopyBtn, Panel, Label, Seg, CountText, WordsPanel, usePersist, SPRING } from './parts'

const PREC = [['auto', 'Auto'], ['2', '2'], ['4', '4'], ['6', '6'], ['8', '8'], ['sci', 'Sci']]
const GROUPS = [
  ['Everyday', ['length', 'mass', 'temperature', 'area', 'volume', 'speed', 'time']],
  ['Science & engineering', ['pressure', 'energy', 'power', 'force', 'angle', 'frequency']],
  ['Digital', ['storage', 'rate']],
  ['Travel', ['fuel']],
]
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([g, ids]) => ids.map((i) => [i, g])))
const UnitBadge = ({ k, size = 40 }) => (
  <span className="grid place-items-center rounded-xl shrink-0 font-bold mono" style={{ width: size, height: size, fontSize: k.length > 5 ? 9 : k.length > 3 ? 11 : 13, background: 'color-mix(in srgb, var(--copper) 12%, var(--surface))', border: '1px solid color-mix(in srgb, var(--copper) 28%, var(--border))', color: 'var(--copper)' }}>{k.length > 6 ? k.slice(0, 5) + '…' : k}</span>
)
const CatBadge = ({ icon, size = 36 }) => <span className="grid place-items-center rounded-xl shrink-0" style={{ width: size, height: size, background: 'color-mix(in srgb, var(--copper) 14%, var(--surface))', color: 'var(--copper)' }}><Ico n={icon} s={size * 0.52} /></span>

export default function UnitsTab() {
  const [st, setSt] = usePersist('units', { cat: 'length', pairs: {}, value: '1', prec: 'auto' })
  const upd = (p) => setSt((s) => ({ ...s, ...p }))
  const cat = CAT[st.cat] || CAT.length
  const pairs = st.pairs && typeof st.pairs === 'object' && !Array.isArray(st.pairs) ? st.pairs : {}
  const pair = Array.isArray(pairs[cat.id]) ? pairs[cat.id] : cat.def
  const value = typeof st.value === 'string' || (typeof st.value === 'number' && Number.isFinite(st.value)) ? String(st.value) : '1'
  const prec = PREC.some(([k]) => k === st.prec) ? st.prec : 'auto'
  const has = (k) => cat.units.some((u) => u.k === k)
  const from = has(pair[0]) ? pair[0] : cat.def[0], to = has(pair[1]) ? pair[1] : cat.def[1]
  const setPair = (f, t) => setSt((s) => ({ ...s, pairs: { ...(s.pairs && typeof s.pairs === 'object' && !Array.isArray(s.pairs) ? s.pairs : {}), [cat.id]: [f, t] } }))
  const v = parseUnitValue(value)
  const res = Number.isFinite(v) ? convertUnit(cat.id, v, from, to) : NaN
  const text = fmtNum(res, prec)
  const [filter, setFilter] = useState('')
  useEffect(() => setFilter(''), [cat.id])

  const catItems = useMemo(() => CATEGORIES.map((c) => ({ key: c.id, title: c.name, sub: `${c.units.length} units`, group: GROUP_OF[c.id], icon: <CatBadge icon={c.icon} size={34} />, hay: (c.name + ' ' + GROUP_OF[c.id] + ' ' + c.units.map((u) => u.n + ' ' + u.k + ' ' + u.alt).join(' ')).toLowerCase() })), [])
  const catFilters = useMemo(() => [['All', () => true], ...GROUPS.map(([g]) => [g, (i) => i.group === g])], [])
  const items = useMemo(() => cat.units.map((u) => ({ key: u.k, title: u.n, sub: u.k + (u.alt ? ' · ' + u.alt : ''), group: cat.name, icon: <UnitBadge k={u.k} size={34} />, hay: (u.n + ' ' + u.k + ' ' + u.alt).toLowerCase() })), [cat])
  const U = (k) => cat.units.find((u) => u.k === k)
  const trig = (k) => ({ open, onClick }) => <SelectChip open={open} onClick={onClick} icon={<UnitBadge k={k} size={36} />} title={U(k).n} sub={U(k).k} />
  const one = convertUnit(cat.id, 1, from, to)
  const swap = () => setSt((s) => ({ ...s, pairs: { ...(s.pairs && typeof s.pairs === 'object' && !Array.isArray(s.pairs) ? s.pairs : {}), [cat.id]: [to, from] }, value: Number.isFinite(res) ? String(Number(res.toPrecision(10))) : value }))
  const rows = cat.units.filter((u) => !filter || (u.n + u.k + u.alt).toLowerCase().includes(filter.toLowerCase()))
  const size = text.length > 17 ? 26 : text.length > 13 ? 32 : text.length > 10 ? 38 : 46

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel>
          <Label>Category</Label>
          <Picker items={catItems} value={cat.id} onChange={(k) => upd({ cat: k })} storeId="ucat" filters={catFilters} placeholder="Search length, mass, tola, bytes…" width={400}
            trigger={({ open, onClick }) => <SelectChip wide open={open} onClick={onClick} icon={<CatBadge icon={cat.icon} size={38} />} title={cat.name} sub={`${GROUP_OF[cat.id]} · ${cat.units.length} units`} />} />

          <div className="mt-7"><Label>From</Label></div>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 border-b-2 pb-1 transition-colors focus-within:border-[var(--copper)] border-line">
              <input value={value} onChange={(e) => isUnitNumberDraft(e.target.value) && upd({ value: e.target.value })} inputMode="decimal" aria-label="Value" className="display font-semibold bg-transparent outline-none w-full min-w-0" style={{ fontSize: 'clamp(30px,4.6vw,46px)', letterSpacing: '-0.03em' }} />
            </div>
            <Picker items={items} value={from} onChange={(k) => setPair(k, to)} storeId={'u-' + cat.id} placeholder={`Search ${cat.name.toLowerCase()} units…`} trigger={trig(from)} />
          </div>

          <div className="flex items-center gap-3 my-6"><span className="flex-1 h-px" style={{ background: 'var(--border)' }} /><SwapButton onClick={swap} /><span className="flex-1 h-px" style={{ background: 'var(--border)' }} /></div>

          <Label>To</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 overflow-hidden">
              <CountText value={res} format={(x) => fmtNum(x, prec)} className="display font-semibold block leading-tight tabular-nums" style={{ fontSize: `max(18px, min(${size}px, ${(100 / Math.max(text.length, 4)).toFixed(2)}vw))`, letterSpacing: '-0.03em', color: 'var(--copper)', whiteSpace: 'nowrap' }} />
            </div>
            <Picker items={items} value={to} onChange={(k) => setPair(from, k)} storeId={'u-' + cat.id} placeholder={`Search ${cat.name.toLowerCase()} units…`} trigger={trig(to)} />
          </div>

          <div className="mt-6 pt-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line">
            <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>1 {from}</b> = <span className="mono tabular-nums">{fmtNum(one, prec)}</span> {to}</div>
            <Seg small value={prec} onChange={(p) => upd({ prec: p })} options={PREC} className="ml-auto" />
            <CopyBtn text={text.replace(/,/g, '')} label="Copy" />
          </div>
        </Panel>
        <WordsPanel value={text} unit={to} />
      </div>

      <Panel delay={0.15}>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div><div className="eyebrow">Every {cat.name.toLowerCase()} unit</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{value || '0'} {from} · tap a unit to make it the target</div></div>
          <div className="flex items-center gap-2 rounded-full px-3.5 py-2 border border-line focus-within:border-[var(--copper)] transition-colors w-full sm:w-60" style={{ background: 'var(--surface2)' }}>
            <Ico n="search" s={14} style={{ color: 'var(--muted)' }} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${cat.units.length} units…`} className="bg-transparent outline-none text-[13px] flex-1 min-w-0" />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((u, i) => {
              const x = Number.isFinite(v) ? convertUnit(cat.id, v, from, u.k) : NaN
              const on = u.k === to, src = u.k === from
              return (
                <motion.button key={cat.id + u.k} layout type="button" onClick={() => setPair(from, u.k)} initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SPRING, delay: Math.min(i, 14) * 0.02 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left border" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 10%, var(--surface))' : src ? 'var(--surface2)' : 'var(--surface)', boxShadow: on ? '0 0 0 3px var(--glow)' : 'none' }}>
                  <UnitBadge k={u.k} size={32} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[11px] truncate" style={{ color: 'var(--muted)' }}>{u.n}</span>
                    <CountText value={x} format={(n) => fmtNum(n, prec)} className="block display font-semibold text-[16.5px] truncate tabular-nums" />
                  </span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
        {!rows.length && <div className="text-center py-6 text-[13px]" style={{ color: 'var(--muted)' }}>No unit matches “{filter}”.</div>}
      </Panel>
    </div>
  )
}
