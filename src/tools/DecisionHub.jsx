import React, { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction } from '../lib/utils.js'
import { DIco, LogCtx, Panel, Label, usePersist, setSound, sfx, SPRING } from './decision/parts.jsx'
import Coin from './decision/Coin.jsx'
import Dice from './decision/Dice.jsx'
import Wheel from './decision/Wheel.jsx'
import Bottle from './decision/Bottle.jsx'
import Draw from './decision/Draw.jsx'
import Numbers from './decision/Numbers.jsx'
import Oracle from './decision/Oracle.jsx'

const GAMES = [
  { id: 'coin', name: 'Coin', icon: 'coin', C: Coin },
  { id: 'dice', name: 'Dice', icon: 'dice', C: Dice },
  { id: 'wheel', name: 'Wheel', icon: 'wheel', C: Wheel },
  { id: 'bottle', name: 'Bottle', icon: 'bottle', C: Bottle },
  { id: 'draw', name: 'Draw & Teams', icon: 'users', C: Draw },
  { id: 'numbers', name: 'Numbers', icon: 'hash', C: Numbers },
  { id: 'oracle', name: 'Oracle', icon: 'ball', C: Oracle },
]

export default function DecisionHub() {
  const [tab, setTab] = usePersist('tab', 'coin')
  const [sound, setSnd] = usePersist('sound', true)
  const [hist, setHist] = usePersist('hist', [])
  useEffect(() => setSound(sound), [sound])
  const log = useCallback((kind, text) => { recentAction(text); setHist((h) => [{ kind, text, k: Date.now() + Math.random(), t: Date.now() }, ...h].slice(0, 24)) }, [setHist])
  const idx = Math.max(0, GAMES.findIndex((g) => g.id === tab))
  const G = GAMES[idx]

  return (
    <LogCtx.Provider value={log}>
      <div className="space-y-6">
        <div className="grid grid-cols-4 sm:grid-cols-[repeat(7,minmax(0,1fr))_56px] gap-2">
          <>
            {GAMES.map((g, i) => {
              const on = g.id === tab
              return (
                <motion.button key={g.id} type="button" onClick={() => { setTab(g.id); sfx('click') }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.04 }} whileHover={{ y: -4 }} whileTap={{ scale: 0.93 }} aria-pressed={on}
                  className="relative flex flex-col items-center gap-1.5 rounded-2xl px-1.5 py-3 border" style={{ borderColor: on ? 'var(--ink)' : 'var(--border)', background: 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)', boxShadow: on ? '0 14px 24px -14px rgba(0,0,0,.6)' : 'var(--shadow)' }}>
                  <motion.span className="absolute inset-0 rounded-2xl" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.85 }} transition={SPRING} />
                  <motion.span className="relative" animate={{ rotate: on ? [0, -18, 14, 0] : 0, scale: on ? 1.12 : 1 }} transition={{ duration: 0.5 }} style={{ color: on ? 'var(--bg)' : 'var(--copper)' }}><DIco n={g.icon} s={24} /></motion.span>
                  <span className="relative text-[11.5px] sm:text-[12.5px] font-semibold leading-tight text-center">{g.name}</span>
                </motion.button>
              )
            })}
          </>
          <motion.button type="button" onClick={() => setSnd(!sound)} whileHover={{ y: -3 }} whileTap={{ scale: 0.88 }} aria-label={sound ? 'Mute sounds' : 'Unmute sounds'} title={sound ? 'Sound on' : 'Sound off'} className="rounded-2xl min-h-[64px] border border-line grid place-items-center" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)', color: sound ? 'var(--copper)' : 'var(--muted)' }}>
            <AnimatePresence mode="wait" initial={false}><motion.span key={sound ? 'on' : 'off'} initial={{ scale: 0.4, rotate: -40, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }}><DIco n={sound ? 'sound' : 'mute'} s={22} /></motion.span></AnimatePresence>
          </motion.button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 24, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.99 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            <G.C />
          </motion.div>
        </AnimatePresence>

        <Panel delay={0.2}>
          <Label right={hist.length ? <button type="button" className="text-[11.5px] font-semibold" style={{ color: 'var(--muted)' }} onClick={() => setHist([])}>Clear</button> : null}>Recent results</Label>
          {!hist.length ? <div className="text-[13px]" style={{ color: 'var(--muted)' }}>Everything you flip, roll or spin shows up here.</div> : (
            <div className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {hist.slice(0, 12).map((h) => (
                  <motion.span key={h.k} layout initial={{ opacity: 0, scale: 0.7, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={SPRING} className="inline-flex items-center gap-2 rounded-full pl-2 pr-3.5 py-1.5 text-[12.5px] font-medium border border-line" style={{ background: 'var(--surface2)' }}>
                    <span className="w-6 h-6 rounded-full grid place-items-center" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><DIco n={{ coin: 'coin', dice: 'dice', wheel: 'wheel', bottle: 'bottle', draw: 'users', numbers: 'hash', oracle: 'ball' }[h.kind] || 'dot'} s={13} /></span>{h.text}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          )}
        </Panel>
      </div>
    </LogCtx.Provider>
  )
}
