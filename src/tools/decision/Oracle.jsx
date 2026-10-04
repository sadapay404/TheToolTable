import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Stage, PrimaryBtn, Burst, Switch, usePersist, useLog, rnd, sfx, SPRING } from './parts.jsx'

const BALL = [
  ['It is certain.', 'y'], ['Without a doubt.', 'y'], ['Yes — definitely.', 'y'], ['You may rely on it.', 'y'], ['Most likely.', 'y'], ['Outlook good.', 'y'], ['Signs point to yes.', 'y'], ['Yes.', 'y'],
  ['Reply hazy, try again.', 'm'], ['Ask again later.', 'm'], ['Better not tell you now.', 'm'], ['Cannot predict now.', 'm'], ['Concentrate and ask again.', 'm'],
  ['Don’t count on it.', 'n'], ['My reply is no.', 'n'], ['My sources say no.', 'n'], ['Outlook not so good.', 'n'], ['Very doubtful.', 'n'],
]
const TONE = { y: '#2F9C6B', m: '#C98A1C', n: '#C3423F' }

export default function Oracle() {
  const log = useLog()
  const [o, setO] = usePersist('oracle', { mode: 'yn', q: '', maybe: false })
  const upd = (p) => setO((s) => ({ ...s, ...p }))
  const [yn, setYn] = useState({ rot: 0, ans: null })
  const [ball, setBall] = useState(null)
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  const [burst, setBurst] = useState(0)

  const askYN = () => {
    if (busy) return
    setBusy(true); sfx('whoosh')
    const a = o.maybe ? rnd(3) : rnd(2) // 0 yes,1 no,2 maybe
    const cur = yn.rot, base = Math.ceil(cur / 360) * 360
    setYn({ rot: base + 1080 + [0, 180, 90][a], ans: null })
    setTimeout(() => { setYn((s) => ({ ...s, ans: ['Yes', 'No', 'Maybe'][a] })); setBusy(false); setBurst(Date.now()); sfx('ding'); log('oracle', `${o.q.trim() ? o.q.trim() + ' → ' : 'Oracle → '}${['Yes', 'No', 'Maybe'][a]}`) }, 1800)
  }
  const askBall = () => {
    if (busy) return
    setBusy(true); setBall(null); setShake((s) => s + 1); sfx('thud')
    const a = BALL[rnd(BALL.length)]
    setTimeout(() => { setBall({ t: a[0], c: TONE[a[1]], k: Date.now() }); setBusy(false); sfx('ding'); log('oracle', `${o.q.trim() ? o.q.trim() + ' → ' : '8-ball → '}${a[0]}`) }, 1500)
  }
  const faceBg = (c1, c2) => `radial-gradient(circle at 34% 28%, ${c1}, ${c2})`

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Stage h={500} glow={o.mode === 'yn' ? '#2F9C6B' : '#5B6CC4'}>
        <Burst k={burst} />
        <div className="flex flex-col items-center justify-between h-full py-8 px-5 gap-4" style={{ minHeight: 500 }}>
          <div className="text-center min-h-[28px] max-w-[420px]"><span className="display text-[20px] font-medium" style={{ color: o.q.trim() ? 'var(--ink)' : 'var(--muted)' }}>{o.q.trim() || 'Think of a question…'}</span></div>
          <div className="flex-1 flex items-center justify-center" style={{ perspective: 900 }}>
            <AnimatePresence mode="wait">
              {o.mode === 'yn' ? (
                <motion.div key="yn" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="relative" style={{ width: 210, height: 210 }}>
                  <motion.div className="relative w-full h-full" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: yn.rot, y: busy ? [0, -60, 0] : 0 }} transition={{ rotateY: { duration: 1.7, ease: [0.2, 0.8, 0.3, 1] }, y: { duration: 1.6, times: [0, 0.45, 1] } }}>
                    {[['YES', faceBg('#7fe0b0', '#1f8a5e'), 0], ['NO', faceBg('#f59a95', '#b52f2b'), 180], ['MAYBE', faceBg('#f2d28a', '#b5801c'), -90]].map(([t, bg, r]) => (
                      <div key={t} className="absolute inset-0 rounded-full grid place-items-center font-extrabold text-white" style={{ background: bg, transform: `rotateY(${r}deg) translateZ(14px)`, backfaceVisibility: 'hidden', fontSize: t === 'MAYBE' ? 38 : 58, letterSpacing: '0.04em', boxShadow: 'inset 0 0 0 8px rgba(255,255,255,.18), 0 24px 40px -16px rgba(0,0,0,.45)', textShadow: '0 3px 8px rgba(0,0,0,.3)' }}>{t}</div>
                    ))}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div key="ball" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                  <motion.div key={shake} animate={busy ? { x: [0, -22, 20, -16, 14, -8, 0], y: [0, -14, 10, -10, 8, -4, 0], rotate: [0, -10, 9, -7, 6, -3, 0] } : {}} transition={{ duration: 1.3 }} className="relative" style={{ width: 230, height: 230 }}>
                    <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle at 32% 26%, #4a4a58, #14141b 60%, #050508)', boxShadow: '0 30px 40px -18px rgba(0,0,0,.55)' }} />
                    <div className="absolute rounded-full" style={{ left: '17%', top: '9%', width: '28%', height: '17%', background: 'radial-gradient(ellipse, rgba(255,255,255,.55), transparent 70%)', transform: 'rotate(-28deg)' }} />
                    <div className="absolute left-1/2 top-1/2 -ml-[58px] -mt-[58px] w-[116px] h-[116px] rounded-full grid place-items-center overflow-hidden" style={{ background: 'radial-gradient(circle at 40% 35%, #1d2a6e, #0a0f33)', boxShadow: 'inset 0 0 0 4px #0b0b10, inset 0 6px 14px rgba(0,0,0,.7)' }}>
                      <AnimatePresence mode="wait">
                        {ball ? <motion.div key={ball.k} initial={{ opacity: 0, scale: 0.4, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={SPRING} className="text-center font-bold leading-tight px-3" style={{ color: '#eaf0ff', fontSize: ball.t.length > 18 ? 11 : 13, textShadow: `0 0 12px ${ball.c}` }}>{ball.t}</motion.div>
                          : <motion.div key="8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="display font-semibold text-[54px]" style={{ color: '#eaf0ff' }}>8</motion.div>}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="h-12 grid place-items-center">
            <AnimatePresence mode="wait">
              {o.mode === 'yn' && yn.ans && !busy && <motion.div key={yn.ans + yn.rot} initial={{ opacity: 0, y: 12, scale: 0.7 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING} className="display font-semibold text-[34px]" style={{ color: { Yes: '#2F9C6B', No: '#C3423F', Maybe: '#C98A1C' }[yn.ans] }}>{yn.ans}</motion.div>}
              {o.mode === 'ball' && ball && <motion.div key={ball.k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] font-bold uppercase tracking-widest" style={{ color: ball.c }}>{ball.c === TONE.y ? 'Positive' : ball.c === TONE.n ? 'Negative' : 'Uncertain'}</motion.div>}
            </AnimatePresence>
          </div>
          <PrimaryBtn icon="ball" onClick={o.mode === 'yn' ? askYN : askBall} busy={busy} disabled={busy}>{busy ? 'Consulting…' : o.mode === 'yn' ? 'Ask the oracle' : 'Shake the ball'}</PrimaryBtn>
        </div>
      </Stage>

      <div className="space-y-5">
        <Panel delay={0.08}>
          <Label>Question</Label>
          <input value={o.q} onChange={(e) => upd({ q: e.target.value })} placeholder="Should I…?" maxLength={90} className="input w-full" />
          <div className="mt-4"><Seg value={o.mode} onChange={(mode) => upd({ mode })} options={[['yn', 'Yes / No'], ['ball', 'Magic 8-ball']]} /></div>
        </Panel>
        <AnimatePresence initial={false}>{o.mode === 'yn' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><Panel delay={0}>
            <Label>Options</Label><Switch on={o.maybe} onChange={(maybe) => upd({ maybe })} label="Allow “Maybe”" hint="Three-way answer instead of two" />
          </Panel></motion.div>)}</AnimatePresence>
        <Panel delay={0.14}><div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Answers use your device’s cryptographic random generator — the oracle has no memory and no favourites. The 8-ball uses the classic 18 replies (8 yes, 5 maybe, 5 no).</div></Panel>
      </div>
    </div>
  )
}
