import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { QIco, SPRING, CountText } from './ui.jsx'
import { toCanvas, heuristics } from '../../lib/qr/render.js'
import { decodeSource } from '../../lib/qr/zx.js'

const ECC_CAP = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 }

export function scoreOf(h, decoded) {
  const rows = []
  const dec = decoded === true ? 55 : decoded === 'pending' ? 30 : 0
  rows.push({ k: 'dec', label: 'Real decoder test', v: dec, max: 55, note: decoded === true ? 'Decoded back to your exact content' : decoded === 'pending' ? 'Testing…' : 'Could not be read — see tips', ok: decoded === true, pending: decoded === 'pending' })
  const c = h.contrast, cs = c >= 7 ? 20 : c >= 4.5 ? 16 : c >= 3 ? 9 : 3
  rows.push({ k: 'con', label: 'Contrast', v: cs, max: 20, note: h.imageBg ? 'Photo mode — keep it bold' : `${c.toFixed(1)} : 1 ${h.inverted ? '· light on dark' : ''}`, ok: cs >= 16 })
  const cap = ECC_CAP[h.ecc] || 0.15, lp = h.logoPct
  const ls = !lp ? 10 : lp <= cap * 0.35 ? 10 : lp <= cap * 0.6 ? 7 : lp <= cap * 0.9 ? 4 : 1
  rows.push({ k: 'logo', label: 'Logo & repair', v: ls, max: 10, note: lp ? `Logo covers ${(lp * 100).toFixed(1)}% · level ${h.ecc} repairs ~${Math.round(cap * 100)}%` : `No logo · level ${h.ecc}`, ok: ls >= 7 })
  const ms = h.margin >= 4 ? 8 : h.margin >= 2 ? 6 : h.margin === 1 ? 3 : 0
  rows.push({ k: 'mar', label: 'Quiet zone', v: ms, max: 8, note: `${h.margin} module${h.margin === 1 ? '' : 's'} of border`, ok: ms >= 6 })
  const ds = h.dotScale >= 0.85 ? 7 : h.dotScale >= 0.7 ? 5 : 2
  rows.push({ k: 'dot', label: 'Dot size', v: ds, max: 7, note: `Version ${h.version} · dots ${Math.round(h.dotScale * 100)}%`, ok: ds >= 5 })
  let total = rows.reduce((a, r) => a + r.v, 0)
  if (decoded === false) total = Math.min(total, 38)
  return { rows, total }
}

export function useDecodeCheck(r, enabled = true) {
  const [state, setState] = useState('pending')
  const seq = useRef(0)
  useEffect(() => {
    if (!r || !enabled) return
    setState('pending')
    const my = ++seq.current
    const id = setTimeout(async () => {
      try {
        const c = await toCanvas(r, 560, { bg: '#FFFFFF' })
        const d = await decodeSource(c, { formats: ['QRCode'], max: 1, maxDim: 600 })
        if (my !== seq.current) return
        setState(d.items.length > 0 && d.items[0].text === r.text ? true : false)
      } catch { if (my === seq.current) setState(false) }
    }, 350)
    return () => clearTimeout(id)
  }, [r, enabled])
  return state
}

const tone = (s) => (s >= 85 ? ['#2F9C6B', 'Excellent'] : s >= 65 ? ['#6FA23C', 'Good'] : s >= 45 ? ['#D9962B', 'Risky'] : ['#C3423F', 'Poor'])

export default function Meter({ r }) {
  const decoded = useDecodeCheck(r)
  const h = useMemo(() => heuristics(r), [r])
  const { rows, total } = scoreOf(h, decoded)
  const [col, word] = tone(total)
  const C = 2 * Math.PI * 34
  const tips = []
  if (decoded === false) tips.push('Increase contrast, shrink the logo, or raise the error-correction level.')
  if (h.contrast < 4.5 && !h.imageBg) tips.push('Make dots much darker than the background (or the reverse).')
  if (h.logoPct && rows[2].v < 7) tips.push('Logo is large for this repair level — reduce size or choose level H.')
  if (h.margin < 2) tips.push('Add a quiet zone of at least 2 modules.')
  return (
    <div className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface2)' }}>
      <div className="flex items-center gap-4">
        <div className="relative w-[84px] h-[84px] shrink-0">
          <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90">
            <circle cx="42" cy="42" r="34" fill="none" stroke="var(--border)" strokeWidth="7" />
            <motion.circle cx="42" cy="42" r="34" fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - total / 100), stroke: col }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
          </svg>
          <div className="absolute inset-0 grid place-items-center"><div className="text-center leading-none"><div className="display font-semibold text-[24px]"><CountText value={total} format={(v) => Math.round(v)} /></div><div className="text-[9px] font-bold tracking-widest mt-0.5" style={{ color: 'var(--muted)' }}>/ 100</div></div></div>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><motion.span key={word + decoded} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="display font-semibold text-[20px]" style={{ color: col }}>{word}</motion.span>
            {decoded === true && <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING} className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, #2F9C6B 16%, transparent)', color: '#2F9C6B' }}><QIco n="check" s={11} w={3} />VERIFIED</motion.span>}
            {decoded === false && <span className="inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'color-mix(in srgb, #C3423F 16%, transparent)', color: '#C3423F' }}><QIco n="warn" s={11} w={2.6} />NOT READABLE</span>}
          </div>
          <div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>Scan-ability · checked by decoding your code with the real reader, on this device.</div>
        </div>
      </div>
      <div className="mt-3.5 grid gap-2">
        {rows.map((x, i) => (
          <motion.div key={x.k} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="flex items-center gap-2.5">
            <span className="w-4 h-4 rounded-full grid place-items-center shrink-0 text-white" style={{ background: x.pending ? 'var(--muted)' : x.ok ? '#2F9C6B' : x.v / x.max > 0.45 ? '#D9962B' : '#C3423F' }}>{x.pending ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} className="inline-flex"><QIco n="refresh" s={9} w={3} /></motion.span> : <QIco n={x.ok ? 'check' : 'x'} s={9} w={3.2} />}</span>
            <span className="text-[12.5px] font-semibold w-[112px] shrink-0">{x.label}</span>
            <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.span className="block h-full rounded-full" style={{ background: 'var(--copper)' }} initial={{ width: 0 }} animate={{ width: (x.v / x.max) * 100 + '%' }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} /></span>
          </motion.div>
        ))}
      </div>
      {tips.length > 0 && <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 text-[12px] space-y-1 overflow-hidden" style={{ color: 'var(--muted)' }}>{tips.slice(0, 3).map((t) => <li key={t} className="flex gap-2"><span style={{ color: 'var(--copper)' }}><QIco n="bulb" s={13} /></span>{t}</li>)}</motion.ul>}
    </div>
  )
}
