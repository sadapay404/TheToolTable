import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { COUNTRIES, BY_CC, CONTINENTS, zoneLabel, partsIn, offsetMin, zonedToUtc, fmtOffset, isDst, zoneAbbr, pad2, dateStr, dayDiff, humanDiff } from '../../lib/units/world'
import { Ico, Flag, FlapBoard, SwapButton, Pass, Picker, StubTrigger, CopyBtn, Chips, usePersist, Stagger, SPRING } from './parts'

const zoneOf = (c, z) => (z && c.zones.some((x) => x.id === z) ? z : c.zone)
const hhmm = (p, h24) => (h24 ? `${pad2(p.h)}:${pad2(p.mi)}` : `${pad2(p.h % 12 || 12)}:${pad2(p.mi)} ${p.h >= 12 ? 'PM' : 'AM'}`)
const niceDate = (p) => new Date(Date.UTC(p.y, p.mo - 1, p.d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const FILTERS = [['All', () => true], ...CONTINENTS.map((c) => [c, (i) => i.continent === c]), ['Multi-zone', (i) => i.multi]]
const DEFAULT_PINS = ['IN', 'PK', 'US', 'GB', 'AE', 'SA', 'CN', 'JP', 'AU', 'DE', 'CA', 'SG']

function useNow(ms) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setT(Date.now()), ms); return () => clearInterval(id) }, [ms])
  return t
}
function useUnwrapped(target) {
  const prev = useRef(target)
  let d = ((target - prev.current) % 360 + 540) % 360 - 180
  const v = prev.current + d
  prev.current = v
  return v
}

/* analogue clock with springy hands */
function Clock({ p, size = 124, night }) {
  const hand = (deg, len, w, col, tail = 8) => <g style={{ transform: `rotate(${deg}deg)`, transformOrigin: '60px 60px', transformBox: 'view-box', transition: 'transform .9s cubic-bezier(.34,1.45,.5,1)' }}><line x1="60" y1={60 + tail} x2="60" y2={60 - len} stroke={col} strokeWidth={w} strokeLinecap="round" /></g>
  const hr = useUnwrapped(((p.h % 12) + p.mi / 60) * 30), mn = useUnwrapped(p.mi * 6 + p.s * 0.1), sc = useUnwrapped(p.s * 6)
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <defs><radialGradient id="cf" cx="35%" cy="30%"><stop offset="0" stopColor={night ? '#2d2a36' : '#fffdf6'} /><stop offset="1" stopColor={night ? '#16141c' : '#efe6d2'} /></radialGradient></defs>
      <circle cx="60" cy="60" r="57" fill="url(#cf)" stroke="var(--border)" strokeWidth="2" />
      <circle cx="60" cy="60" r="57" fill="none" stroke="rgba(0,0,0,.12)" strokeWidth="1" />
      {Array.from({ length: 60 }, (_, i) => <line key={i} x1="60" y1={i % 5 ? 6 : 5} x2="60" y2={i % 5 ? 8 : 11} stroke={night ? '#d8d0c0' : '#2a211c'} strokeOpacity={i % 5 ? 0.35 : 0.9} strokeWidth={i % 5 ? 0.8 : 1.6} transform={`rotate(${i * 6} 60 60)`} />)}
      {hand(hr, 28, 4.2, night ? '#f3ead7' : '#2a211c')}
      {hand(mn, 40, 2.8, night ? '#f3ead7' : '#2a211c')}
      {hand(sc, 44, 1.2, '#c0553b', 12)}
      <circle cx="60" cy="60" r="3.6" fill="#c0553b" /><circle cx="60" cy="60" r="1.2" fill="#fff" />
    </svg>
  )
}
const isNight = (h) => h < 6 || h >= 19

function ClockCard({ c, zone, p, ts, label }) {
  const night = isNight(p.h)
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} style={{ filter: 'drop-shadow(0 10px 14px rgba(0,0,0,.22))' }}><Clock p={p} night={night} /></motion.div>
      <div className="flex items-center gap-1.5 text-[12px] font-bold"><Flag cc={c.cc} size={16} />{label}</div>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
        <motion.span key={night ? 'n' : 'd'} initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={SPRING} style={{ color: night ? '#7f8fd8' : '#d99a1c' }}><Ico n={night ? 'moon' : 'sun'} s={14} /></motion.span>
        {night ? 'Night' : p.h < 12 ? 'Morning' : p.h < 17 ? 'Afternoon' : 'Evening'} · {zoneAbbr(zone, ts) || fmtOffset(offsetMin(zone, ts))}
      </div>
    </div>
  )
}

function Stepper({ value, onUp, onDown, onType, label, w = 'w-[72px]' }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.8 }} onClick={onUp} aria-label={'More ' + label} className="w-9 h-6 grid place-items-center rounded-lg" style={{ color: 'var(--muted)', background: 'var(--surface2)' }}><Ico n="up" s={14} w={2.6} /></motion.button>
      <div className={`${w} relative overflow-hidden rounded-xl border border-line focus-within:border-[var(--copper)] transition-colors`} style={{ background: 'var(--surface)' }}>
        <input value={pad2(value)} onChange={(e) => onType(e.target.value)} onFocus={(e) => e.target.select()} onWheel={(e) => (e.deltaY < 0 ? onUp() : onDown())} inputMode="numeric" aria-label={label} className="display font-semibold bg-transparent outline-none w-full text-center py-1.5" style={{ fontSize: 40, letterSpacing: '-0.02em' }} />
      </div>
      <motion.button type="button" whileHover={{ y: 2 }} whileTap={{ scale: 0.8 }} onClick={onDown} aria-label={'Less ' + label} className="w-9 h-6 grid place-items-center rounded-lg" style={{ color: 'var(--muted)', background: 'var(--surface2)' }}><Ico n="down" s={14} w={2.6} /></motion.button>
    </div>
  )
}

function ZonePick({ c, zone, onChange, ts }) {
  const items = useMemo(() => c.zones.map((z) => ({ key: z.id, title: z.label, sub: z.id, icon: <span className="w-8 h-8 grid place-items-center rounded-full" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n="pin" s={15} /></span>, meta: hhmm(partsIn(ts, z.id), true), group: c.name, hay: (z.label + ' ' + z.id).toLowerCase() })), [c, Math.floor(ts / 60000)])
  if (!c.multi) return null
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2.5 overflow-hidden">
      <Picker items={items} value={zone} onChange={onChange} storeId={'z-' + c.cc} placeholder={`Time zones in ${c.name}…`} width={340}
        trigger={({ open, onClick, selected }) => (
          <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-semibold border" style={{ borderColor: open ? 'var(--copper)' : 'var(--border)', background: 'color-mix(in srgb, var(--copper) 7%, var(--surface))' }}>
            <Ico n="pin" s={14} style={{ color: 'var(--copper)' }} /><span className="truncate">{selected?.title}</span><span className="ml-auto text-[10.5px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--border)', color: 'var(--muted)' }}>{c.zones.length} zones</span><Ico n="chevron" s={14} />
          </motion.button>
        )} />
    </motion.div>
  )
}

const PLAN_SHADE = (h, work) => (work ? 'color-mix(in srgb, #2f9c6b 30%, var(--surface))' : h < 6 || h >= 21 ? 'color-mix(in srgb, #30345a 22%, var(--surface2))' : h < 9 || h >= 17 ? 'color-mix(in srgb, #d99a1c 15%, var(--surface2))' : 'var(--surface2)')
const PlannerRow = React.memo(function PlannerRow({ cells, shade, flag, hourKey, workKey }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0"><Flag cc={flag} size={22} /></span>
      <div className="flex-1 grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(24, minmax(0,1fr))' }}>
        {cells.map((c2, i) => (
          <motion.div key={i} initial={{ scaleY: 0, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ ...SPRING, delay: 0.2 + i * 0.015 }} className="h-9 rounded-[5px] grid place-items-end justify-center pb-0.5 text-[9px] mono font-semibold" style={{ background: shade(c2[hourKey], c2[workKey]), color: 'var(--muted)', transformOrigin: 'bottom' }}>{i % 3 === 0 ? pad2(c2[hourKey]) : ''}</motion.div>
        ))}
      </div>
    </div>
  )
})

/* 24h planner: both days laid on the same instants, working hours glow where they overlap */
function Planner({ fz, tz, fc, tc, fp, instant }) {
  const diff = offsetMin(tz, instant) - offsetMin(fz, instant)
  const cells = useMemo(() => Array.from({ length: 24 }, (_, h) => { const m2 = (((h * 60 + diff) % 1440) + 1440) % 1440; return { h, h2: Math.floor(m2 / 60), w1: h >= 9 && h < 17, w2: m2 >= 540 && m2 < 1020 } }), [diff])
  const both = cells.filter((c) => c.w1 && c.w2).length
  const shade = PLAN_SHADE
  const x = ((fp.h * 60 + fp.mi) / 1440) * 100
  return (
    <div>
      <div className="flex items-end justify-between mb-3 gap-3 flex-wrap">
        <div><div className="eyebrow">Day planner</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{niceDate(fp)} in {fc.name}, lined up with {tc.name}</div></div>
        <motion.div key={both} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: both ? 'color-mix(in srgb, #2f9c6b 18%, var(--surface))' : 'var(--surface2)', color: both ? '#2f9c6b' : 'var(--muted)' }}>
          <Ico n={both ? 'check' : 'x'} s={12} w={2.8} />{both ? `${both} h of shared working hours (9–17)` : 'No shared working hours'}
        </motion.div>
      </div>
      <div className="relative space-y-1.5">
        <PlannerRow cells={cells} shade={shade} flag={fc.cc} hourKey="h" workKey="w1" /><PlannerRow cells={cells} shade={shade} flag={tc.cc} hourKey="h2" workKey="w2" />
        <div className="absolute top-[-6px] bottom-[-6px] left-8 right-0 pointer-events-none">
          <motion.div className="absolute top-0 bottom-0 w-[3px] -ml-[1.5px] rounded-full" animate={{ left: x + '%' }} transition={SPRING} style={{ background: '#c0553b', boxShadow: '0 0 0 3px rgba(192,85,59,.18)' }}>
            <span className="absolute -top-1 left-1/2 -ml-[5px] w-[10px] h-[10px] rounded-full" style={{ background: '#c0553b' }} />
          </motion.div>
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-[10.5px]" style={{ color: 'var(--muted)' }}>
        {[['color-mix(in srgb, #2f9c6b 30%, var(--surface))', 'Working hours'], ['color-mix(in srgb, #d99a1c 15%, var(--surface2))', 'Early / late'], ['color-mix(in srgb, #30345a 22%, var(--surface2))', 'Night']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-[4px] inline-block" style={{ background: c }} />{l}</span>)}
      </div>
    </div>
  )
}

export default function TimeTab() {
  const [st, setSt] = usePersist('time', { from: 'IN', fz: '', to: 'PK', tz: '', mode: 'live', date: '', h: 12, mi: 0, h24: true, extras: ['AE', 'GB', 'US', 'JP'] })
  const upd = (p) => setSt((s) => ({ ...s, ...p }))
  const fc = BY_CC[st.from] || BY_CC.IN, tc = BY_CC[st.to] || BY_CC.PK
  const fz = zoneOf(fc, st.fz), tz = zoneOf(tc, st.tz)
  const man = st.mode === 'manual'
  const now = useNow(man ? 20000 : 1000)
  const p0 = partsIn(now, fz)
  const fh = man ? st.h : p0.h, fmi = man ? st.mi : p0.mi, fdate = man && st.date ? st.date : dateStr(p0)
  const [Y, M, D] = fdate.split('-').map(Number)
  const instant = man ? zonedToUtc(Y, M, D, fh, fmi, fz) : now
  const fp = partsIn(instant, fz), tp = partsIn(instant, tz)
  const diff = offsetMin(tz, instant) - offsetMin(fz, instant)
  const dd = dayDiff(fp, tp)
  const shifted = man && (fp.h !== fh || fp.mi !== fmi)

  const takeover = (p) => upd({ mode: 'manual', date: fdate, h: fh, mi: fmi, ...p })
  const setH = (v) => takeover({ h: ((v % 24) + 24) % 24 })
  const setMi = (v) => takeover({ mi: ((v % 60) + 60) % 60 })
  const typeH = (raw) => { const n = +(raw.replace(/\D/g, '').slice(-2) || 0); if (st.h24) setH(Math.min(23, n)); else { const x = Math.min(12, n) % 12; setH(x + (fh >= 12 ? 12 : 0)) } }
  const typeMi = (raw) => setMi(Math.min(59, +(raw.replace(/\D/g, '').slice(-2) || 0)))
  const shiftDay = (n) => { const d = new Date(Date.UTC(Y, M - 1, D + n)); takeover({ date: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}` }) }
  const swap = () => {
    const nfp = tp
    setSt((s) => ({ ...s, from: s.to, fz: s.tz, to: s.from, tz: s.fz, ...(man ? { date: dateStr(nfp), h: nfp.h, mi: nfp.mi } : {}) }))
  }

  const minute = Math.floor(now / 60000)
  const items = useMemo(() => COUNTRIES.map((c) => {
    const p = partsIn(Date.now(), c.zone)
    return { key: c.cc, title: c.name, sub: `${c.capital} · ${fmtOffset(offsetMin(c.zone, Date.now()))}${c.multi ? ' · ' + c.zones.length + ' zones' : ''}`, meta: hhmm(p, true), group: c.continent, icon: <Flag cc={c.cc} size={34} />, continent: c.continent, multi: c.multi, hay: (c.name + ' ' + c.cc + ' ' + c.capital + ' ' + c.continent + ' ' + c.zones.map((z) => z.id + ' ' + z.label).join(' ')).toLowerCase() }
  }), [minute])
  const trig = (c, z) => ({ open, onClick }) => <StubTrigger open={open} onClick={onClick} icon={<Flag cc={c.cc} size={44} />} title={c.name} sub={`${c.multi ? zoneLabel(c, z) : c.capital} · ${zoneAbbr(z, instant) ? zoneAbbr(z, instant) + ' · ' : ''}${fmtOffset(offsetMin(z, instant))}`} />

  const extras = (st.extras || []).map((k) => BY_CC[k]).filter(Boolean)
  const text = hhmm(tp, st.h24)
  const dayWord = dd === 0 ? 'same day' : dd > 0 ? (dd === 1 ? 'next day' : `+${dd} days`) : dd === -1 ? 'previous day' : `${dd} days`
  const dstF = isDst(fz, instant), dstT = isDst(tz, instant)

  return (
    <div className="space-y-5">
      <Pass
        left={<>
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow">Time in</div>
            <motion.button type="button" onClick={() => upd({ mode: 'live' })} whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold border border-line" style={{ background: man ? 'var(--surface)' : 'color-mix(in srgb, #2f9c6b 14%, var(--surface))', color: man ? 'var(--muted)' : '#2f9c6b' }}>
              <span className={`w-2 h-2 rounded-full ${man ? '' : 'ex-live-dot'}`} style={{ background: man ? 'var(--muted)' : '#2f9c6b' }} />{man ? 'Use current time' : 'Live now'}
            </motion.button>
          </div>
          <Picker items={items} value={st.from} onChange={(k) => upd({ from: k, fz: '' })} storeId="time" filters={FILTERS} defaultPins={DEFAULT_PINS} placeholder="Search 195 countries, capitals…" trigger={trig(fc, fz)} />
          <AnimatePresence initial={false}>{fc.multi && <ZonePick key={fc.cc} c={fc} zone={fz} ts={now} onChange={(z) => upd({ fz: z })} />}</AnimatePresence>

          <div className="mt-5 flex items-center gap-2 sm:gap-3">
            <Stepper label="hour" value={st.h24 ? fh : fh % 12 || 12} onUp={() => setH(fh + 1)} onDown={() => setH(fh - 1)} onType={typeH} />
            <motion.span className="display text-[40px] font-semibold pb-0.5" animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1, repeat: Infinity }}>:</motion.span>
            <Stepper label="minute" value={fmi} onUp={() => setMi(fmi + 1)} onDown={() => setMi(fmi - 1)} onType={typeMi} />
            <div className="ml-1 flex flex-col gap-1.5">
              {!st.h24 && (
                <div className="flex flex-col rounded-xl overflow-hidden border border-line">
                  {['AM', 'PM'].map((x) => { const on = (fh >= 12) === (x === 'PM'); return <motion.button key={x} type="button" whileTap={{ scale: 0.9 }} onClick={() => setH((fh % 12) + (x === 'PM' ? 12 : 0))} className="px-3 py-1.5 text-[12px] font-bold" style={{ background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--muted)' }}>{x}</motion.button> })}
                </div>
              )}
              <Chips small value={st.h24 ? '24' : '12'} onChange={(v) => upd({ h24: v === '24' })} options={[['24', '24 h'], ['12', '12 h']]} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => shiftDay(-1)} aria-label="Previous day" className="w-9 h-9 grid place-items-center rounded-xl border border-line" style={{ background: 'var(--surface)' }}><Ico n="chevron" s={16} style={{ transform: 'rotate(90deg)' }} /></motion.button>
            <label className="flex-1 flex items-center gap-2 rounded-xl border border-line px-3 py-2 focus-within:border-[var(--copper)] transition-colors" style={{ background: 'var(--surface)' }}>
              <Ico n="cal" s={16} style={{ color: 'var(--copper)' }} />
              <input type="date" value={fdate} onChange={(e) => e.target.value && takeover({ date: e.target.value })} className="bg-transparent outline-none text-[13px] font-semibold flex-1 min-w-0" style={{ colorScheme: 'light dark' }} />
              <span className="text-[11px] hidden sm:block" style={{ color: 'var(--muted)' }}>{niceDate(fp).split(',')[0]}</span>
            </label>
            <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => shiftDay(1)} aria-label="Next day" className="w-9 h-9 grid place-items-center rounded-xl border border-line" style={{ background: 'var(--surface)' }}><Ico n="chevron" s={16} style={{ transform: 'rotate(-90deg)' }} /></motion.button>
          </div>
          <AnimatePresence>{shifted && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-[11.5px] mt-2" style={{ color: '#c98a1c' }}>That clock time is skipped by daylight saving — moved to {pad2(fp.h)}:{pad2(fp.mi)}.</motion.p>}</AnimatePresence>
        </>}
        mid={<SwapButton onClick={swap} />}
        right={<>
          <div className="eyebrow mb-3">Is this time in</div>
          <Picker items={items} value={st.to} onChange={(k) => upd({ to: k, tz: '' })} storeId="time" filters={FILTERS} defaultPins={DEFAULT_PINS} placeholder="Search 195 countries, capitals…" trigger={trig(tc, tz)} />
          <AnimatePresence initial={false}>{tc.multi && <ZonePick key={tc.cc} c={tc} zone={tz} ts={now} onChange={(z) => upd({ tz: z })} />}</AnimatePresence>
          <div className="mt-5"><FlapBoard text={text} h={82} minChars={5} /></div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={niceDate(tp)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="display font-semibold text-[18px]">{niceDate(tp)}</motion.span>
            </AnimatePresence>
            <motion.span key={dayWord} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: dd === 0 ? 'var(--border)' : 'color-mix(in srgb, var(--copper) 18%, transparent)', color: dd === 0 ? 'var(--muted)' : 'var(--copper)' }}>{dayWord}</motion.span>
            {dstT && <span className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: 'color-mix(in srgb, #d99a1c 20%, transparent)', color: '#b07a12' }}>DST</span>}
            <span className="ml-auto"><CopyBtn text={`${text} ${niceDate(tp)} (${tc.name})`} label="Copy" /></span>
          </div>
          <p className="text-[12.5px] mt-3 leading-snug" style={{ color: 'var(--muted)' }}>
            <b style={{ color: 'var(--ink)' }}>{tc.name}</b> is {diff === 0 ? 'on ' + humanDiff(0) : <b style={{ color: 'var(--ink)' }}>{humanDiff(diff)}</b>} <b style={{ color: 'var(--ink)' }}>{fc.name}</b>
            <span className="mono ml-1.5 text-[11px]">({fmtOffset(offsetMin(fz, instant))} → {fmtOffset(offsetMin(tz, instant))}{dstF ? ' · DST' : ''})</span>
          </p>
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_1.55fr]">
        <Stagger i={2}>
          <div className="rounded-3xl border border-line p-5 sm:p-6 h-full" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
            <div className="eyebrow mb-4">Clock faces</div>
            <div className="flex items-start justify-around gap-3 flex-wrap">
              <ClockCard c={fc} zone={fz} p={fp} ts={instant} label={fc.name} />
              <ClockCard c={tc} zone={tz} p={tp} ts={instant} label={tc.name} />
            </div>
          </div>
        </Stagger>
        <Stagger i={3}><div className="rounded-3xl border border-line p-5 sm:p-6 h-full" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}><Planner fz={fz} tz={tz} fc={fc} tc={tc} fp={fp} instant={instant} /></div></Stagger>
      </div>

      <Stagger i={4}>
        <div className="rounded-3xl border border-line p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
          <div className="flex items-center justify-between mb-4">
            <div><div className="eyebrow">World clock</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{hhmm(fp, st.h24)} in {fc.name} is…</div></div>
            {extras.length < 12 && (
              <Picker items={items.filter((i) => !(st.extras || []).includes(i.key))} value="" onChange={(k) => upd({ extras: [...(st.extras || []), k] })} storeId="time" filters={FILTERS} defaultPins={DEFAULT_PINS} placeholder="Add a country…" width={360}
                trigger={({ onClick }) => <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-line text-[12px] font-semibold" style={{ background: 'var(--surface2)' }}><Ico n="plus" s={14} w={2.4} />Add country</motion.button>} />
            )}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <AnimatePresence initial={false} mode="popLayout">
              {extras.map((c, i) => {
                const p = partsIn(instant, c.zone), d = dayDiff(fp, p), nt = isNight(p.h)
                return (
                  <motion.div key={c.cc} layout initial={{ opacity: 0, scale: 0.85, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...SPRING, delay: i * 0.04 }} whileHover={{ y: -3 }} className="group relative rounded-2xl p-3.5 border border-line" style={{ background: nt ? 'color-mix(in srgb, #30345a 12%, var(--surface2))' : 'var(--surface2)' }}>
                    <div className="flex items-center gap-2.5"><Flag cc={c.cc} size={28} /><div className="min-w-0 leading-tight"><div className="text-[12.5px] font-bold truncate">{c.name}</div><div className="text-[10.5px] truncate" style={{ color: 'var(--muted)' }}>{c.capital}</div></div>
                      <span className="ml-auto" style={{ color: nt ? '#7f8fd8' : '#d99a1c' }}><Ico n={nt ? 'moon' : 'sun'} s={16} /></span></div>
                    <div className="flex items-baseline gap-2 mt-2.5 overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}><motion.span key={hhmm(p, st.h24)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.16 }} className="display font-semibold text-[26px] tabular-nums">{hhmm(p, st.h24)}</motion.span></AnimatePresence>
                      <span className="text-[10.5px] font-bold" style={{ color: d ? 'var(--copper)' : 'var(--muted)' }}>{d === 0 ? 'same day' : d > 0 ? `+${d} day` : `${d} day`}</span>
                    </div>
                    <div className="text-[10.5px] mono mt-0.5" style={{ color: 'var(--muted)' }}>{fmtOffset(offsetMin(c.zone, instant))}</div>
                    <button type="button" aria-label={'Remove ' + c.name} onClick={() => upd({ extras: st.extras.filter((k) => k !== c.cc) })} className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity" style={{ background: 'var(--border)' }}><Ico n="x" s={10} w={3} /></button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </div>
      </Stagger>
      <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--muted)' }}>Uses your device’s IANA time-zone database, so daylight-saving rules for any date are applied automatically. Each country uses its capital’s zone unless it spans several (pick one from the zone list). Fully offline.</p>
    </div>
  )
}
