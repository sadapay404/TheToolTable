import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CATEGORIES, CAT, convertUnit, fmtNum } from '../../lib/units/units'
import { Ico, FlapBoard, Chips, SwapButton, Pass, Picker, StubTrigger, CopyBtn, usePersist, Stagger, SPRING } from './parts'

const PREC = [['auto', 'Auto'], ['2', '2'], ['4', '4'], ['6', '6'], ['8', '8'], ['sci', 'Sci']]
const UnitBadge = ({ k, size = 40 }) => (
  <span className="grid place-items-center rounded-xl shrink-0 font-bold mono" style={{ width: size, height: size, fontSize: k.length > 5 ? 9 : k.length > 3 ? 11 : 13, background: 'linear-gradient(145deg, color-mix(in srgb, var(--copper) 22%, var(--surface)), color-mix(in srgb, var(--copper) 8%, var(--surface2)))', border: '1px solid color-mix(in srgb, var(--copper) 30%, var(--border))', color: 'var(--copper)' }}>{k.length > 6 ? k.slice(0, 5) + '…' : k}</span>
)

export default function UnitsTab() {
  const [st, setSt] = usePersist('units', { cat: 'length', pairs: {}, value: '1', prec: 'auto' })
  const upd = (p) => setSt((s) => ({ ...s, ...p }))
  const cat = CAT[st.cat] || CAT.length
  const pair = st.pairs[cat.id] || cat.def
  const has = (k) => cat.units.some((u) => u.k === k)
  const from = has(pair[0]) ? pair[0] : cat.def[0], to = has(pair[1]) ? pair[1] : cat.def[1]
  const setPair = (f, t) => upd({ pairs: { ...st.pairs, [cat.id]: [f, t] } })
  const v = parseFloat(String(st.value).replace(/,/g, ''))
  const res = Number.isFinite(v) ? convertUnit(cat.id, v, from, to) : NaN
  const text = fmtNum(res, st.prec)
  const [filter, setFilter] = useState('')
  useEffect(() => setFilter(''), [cat.id])

  const items = useMemo(() => cat.units.map((u) => ({ key: u.k, title: u.n, sub: u.k + (u.alt ? ' · ' + u.alt : ''), group: cat.name, icon: <UnitBadge k={u.k} size={34} />, hay: (u.n + ' ' + u.k + ' ' + u.alt).toLowerCase() })), [cat])
  const U = (k) => cat.units.find((u) => u.k === k)
  const trig = (k) => ({ open, onClick }) => <StubTrigger open={open} onClick={onClick} icon={<UnitBadge k={k} size={44} />} title={U(k).n} sub={`${U(k).k}${U(k).alt ? ' · ' + U(k).alt : ''}`} />
  const one = convertUnit(cat.id, 1, from, to)
  const swap = () => { setPair(to, from); if (Number.isFinite(res)) upd({ pairs: { ...st.pairs, [cat.id]: [to, from] }, value: String(Number(res.toPrecision(10))) }) }
  const rows = cat.units.filter((u) => !filter || (u.n + u.k + u.alt).toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="grid gap-5 lg:grid-cols-[210px_1fr]">
      {/* category rail */}
      <Stagger i={0} className="lg:sticky lg:top-4 lg:self-start">
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 ex-scrollfade lg:[mask-image:none]">
          {CATEGORIES.map((c, i) => {
            const on = c.id === cat.id
            return (
              <motion.button key={c.id} type="button" onClick={() => upd({ cat: c.id })} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.05 + i * 0.03 }} whileHover={{ x: 4 }} whileTap={{ scale: 0.95 }}
                className="relative shrink-0 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left border" style={{ borderColor: on ? 'var(--ink)' : 'var(--border)', background: 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)' }}>
                <motion.span className="absolute inset-0 rounded-2xl" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.92 }} transition={SPRING} />
                <motion.span className="relative" animate={{ rotate: on ? [0, -14, 10, 0] : 0, scale: on ? 1.12 : 1 }} transition={{ duration: 0.45 }} style={{ color: on ? 'var(--bg)' : 'var(--copper)' }}><Ico n={c.icon} s={18} /></motion.span>
                <span className="relative text-[13px] font-semibold whitespace-nowrap">{c.name}</span>
                <span className="relative ml-auto mono text-[10px] opacity-50 hidden lg:block">{c.units.length}</span>
              </motion.button>
            )
          })}
        </div>
      </Stagger>

      <div className="space-y-5 min-w-0">
        <Pass
          left={<>
            <div className="flex items-center justify-between mb-3"><div className="eyebrow">From</div><AnimatePresence mode="wait" initial={false}><motion.span key={cat.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--copper)' }}>{cat.name}</motion.span></AnimatePresence></div>
            <Picker items={items} value={from} onChange={(k) => setPair(k, to)} storeId={'u-' + cat.id} placeholder={`Search ${cat.name.toLowerCase()} units…`} trigger={trig(from)} />
            <label className="block mt-5">
              <span className="label">Value</span>
              <div className="mt-1.5 border-b-2 pb-1 transition-colors focus-within:border-[var(--copper)] border-line">
                <input value={st.value} onChange={(e) => /^-?[0-9,]*\.?[0-9]*(e-?[0-9]*)?$/i.test(e.target.value) && upd({ value: e.target.value })} inputMode="decimal" aria-label="Value" className="display font-semibold bg-transparent outline-none w-full min-w-0" style={{ fontSize: 'clamp(34px,5vw,50px)', letterSpacing: '-0.03em' }} />
              </div>
            </label>
            <div className="flex flex-wrap gap-1.5 mt-4">
              {['1', '10', '100', '1000', '0.5', '-40'].map((q, i) => (
                <motion.button key={q} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.3 + i * 0.04 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.88 }} onClick={() => upd({ value: q })} className="mono text-[11.5px] font-semibold px-2.5 py-1 rounded-lg border border-line" style={{ background: st.value === q ? 'var(--ink)' : 'var(--surface)', color: st.value === q ? 'var(--bg)' : 'var(--muted)' }}>{q}</motion.button>
              ))}
            </div>
          </>}
          mid={<SwapButton onClick={swap} />}
          right={<>
            <div className="eyebrow mb-3">To</div>
            <Picker items={items} value={to} onChange={(k) => setPair(from, k)} storeId={'u-' + cat.id} placeholder={`Search ${cat.name.toLowerCase()} units…`} trigger={trig(to)} />
            <div className="mt-5"><FlapBoard text={text} h={74} minChars={6} /></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}><b style={{ color: 'var(--ink)' }}>1 {from}</b> = <span className="mono tabular-nums">{fmtNum(one, st.prec)}</span> {to}</div>
              <CopyBtn text={text.replace(/,/g, '')} label="Copy result" />
            </div>
          </>}
        />

        <Stagger i={2}>
          <div className="rounded-3xl border border-line p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
            <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
              <div><div className="eyebrow">Everywhere at once</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{st.value || '0'} {from} in every {cat.name.toLowerCase()} unit · tap one to make it the target</div></div>
              <div className="flex flex-wrap items-center gap-3">
                <div><div className="label mb-1.5">Precision</div><Chips small value={st.prec} onChange={(p) => upd({ prec: p })} options={PREC} /></div>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3 border border-line focus-within:border-[var(--copper)] transition-colors" style={{ background: 'var(--surface2)' }}>
              <Ico n="search" s={15} style={{ color: 'var(--muted)' }} /><input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${cat.units.length} units…`} className="bg-transparent outline-none text-[13px] flex-1 min-w-0" />
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {rows.map((u, i) => {
                  const x = Number.isFinite(v) ? convertUnit(cat.id, v, from, u.k) : NaN
                  const on = u.k === to, src = u.k === from
                  return (
                    <motion.button key={cat.id + u.k} layout type="button" onClick={() => setPair(from, u.k)} initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SPRING, delay: Math.min(i, 14) * 0.022 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left border" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 11%, var(--surface))' : src ? 'var(--surface2)' : 'var(--surface)', boxShadow: on ? '0 0 0 3px var(--glow)' : 'none' }}>
                      <UnitBadge k={u.k} size={32} />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-[11px] truncate" style={{ color: 'var(--muted)' }}>{u.n}</span>
                        <AnimatePresence mode="popLayout" initial={false}><motion.span key={fmtNum(x, st.prec)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.14 }} className="block display font-semibold text-[16.5px] truncate tabular-nums">{fmtNum(x, st.prec)}</motion.span></AnimatePresence>
                      </span>
                    </motion.button>
                  )
                })}
              </AnimatePresence>
            </div>
            {!rows.length && <div className="text-center py-8 text-[13px]" style={{ color: 'var(--muted)' }}>No unit matches “{filter}”.</div>}
          </div>
        </Stagger>
      </div>
    </div>
  )
}
