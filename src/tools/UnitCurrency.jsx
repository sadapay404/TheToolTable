import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Ico, SPRING } from './exchange/parts.jsx'
import CurrencyTab from './exchange/CurrencyTab.jsx'
import UnitsTab from './exchange/UnitsTab.jsx'
import TimeTab from './exchange/TimeTab.jsx'

const TABS = [
  { id: 'currency', name: 'Currency', icon: 'coins', C: CurrencyTab },
  { id: 'units', name: 'Units', icon: 'ruler', C: UnitsTab },
  { id: 'time', name: 'Time', icon: 'globe', C: TimeTab },
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
      <motion.div className="border-b border-line" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}><div className="relative grid grid-cols-3 sm:w-[540px]">
        {TABS.map((t) => {
          const on = t.id === tab
          return (
            <motion.button key={t.id} type="button" onClick={() => setTab(t.id)} whileTap={{ scale: 0.96 }} aria-pressed={on} className="relative flex items-center justify-center gap-2.5 py-3.5" style={{ color: on ? 'var(--ink)' : 'var(--muted)', transition: 'color .2s' }}>
              <motion.span animate={{ rotate: on ? [0, -16, 12, 0] : 0, scale: on ? 1.1 : 1, color: on ? '#B4715A' : 'currentColor' }} transition={{ duration: 0.5 }}><Ico n={t.icon} s={19} /></motion.span>
              <span className="display font-semibold text-[18px] sm:text-[20px]">{t.name}</span>
            </motion.button>
          )
        })}
        <motion.span className="absolute -bottom-px h-[3px] rounded-full" style={{ width: '33.333%', background: 'var(--copper)' }} initial={false} animate={{ left: `${idx * 33.333}%` }} transition={SPRING} />
      </div></motion.div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, x: 40 * dir, filter: 'blur(6px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -40 * dir, filter: 'blur(6px)' }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <T.C />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
