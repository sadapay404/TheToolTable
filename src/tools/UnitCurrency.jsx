import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ico, SPRING } from './exchange/parts.jsx'
import CurrencyTab from './exchange/CurrencyTab.jsx'
import UnitsTab from './exchange/UnitsTab.jsx'
import TimeTab from './exchange/TimeTab.jsx'

const TABS = [
  { id: 'currency', n: '01', name: 'Currency', icon: 'coins', blurb: '160+ fiat · 250 crypto', C: CurrencyTab },
  { id: 'units', n: '02', name: 'Units', icon: 'ruler', blurb: '16 kinds · 170+ units', C: UnitsTab },
  { id: 'time', n: '03', name: 'Time', icon: 'globe', blurb: '195 countries', C: TimeTab },
]

export default function UnitCurrency() {
  const [tab, setTab] = useState(() => { try { const t = localStorage.getItem('ttt.ex.tab'); return TABS.some((x) => x.id === t) ? t : 'currency' } catch { return 'currency' } })
  const prev = useRef(0)
  const idx = TABS.findIndex((t) => t.id === tab)
  const dir = idx >= prev.current ? 1 : -1
  useEffect(() => { prev.current = idx; try { localStorage.setItem('ttt.ex.tab', tab) } catch {} }, [tab, idx])
  const T = TABS[idx]

  return (
    <div className="space-y-6">
      <motion.div className="relative grid grid-cols-3 rounded-3xl border border-line p-1.5" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
        <motion.span className="absolute top-1.5 bottom-1.5 rounded-[18px]" style={{ width: 'calc((100% - 12px) / 3)', background: 'var(--ink)', boxShadow: '0 10px 24px -10px rgba(0,0,0,.55)' }} initial={false} animate={{ left: `calc(6px + ${idx} * (100% - 12px) / 3)` }} transition={SPRING} />
        {TABS.map((t, i) => {
          const on = t.id === tab
          return (
            <motion.button key={t.id} type="button" onClick={() => setTab(t.id)} whileTap={{ scale: 0.97 }} className="relative flex items-center justify-center sm:justify-start gap-3 rounded-[18px] px-3 sm:px-5 py-3.5 text-left" style={{ color: on ? 'var(--bg)' : 'var(--ink)' }} aria-pressed={on}>
              <span className="mono text-[11px] font-bold opacity-50 hidden sm:block">{t.n}</span>
              <motion.span animate={{ rotate: on ? [0, -16, 12, 0] : 0, scale: on ? 1.1 : 1 }} transition={{ duration: 0.5 }}><Ico n={t.icon} s={20} /></motion.span>
              <span className="leading-tight">
                <span className="block display font-semibold text-[16px] sm:text-[20px]">{t.name}</span>
                <span className="hidden md:block text-[11px] opacity-60">{t.blurb}</span>
              </span>
            </motion.button>
          )
        })}
      </motion.div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: 40 * dir, filter: 'blur(6px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -40 * dir, filter: 'blur(6px)' }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <T.C />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
