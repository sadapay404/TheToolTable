import { motion } from 'framer-motion'
import { CountText, SPRING } from '../kit/ui.jsx'
import { pk, short, parseNum } from '../../lib/pk/calc.js'

export function Money({ value, onChange, label, hint, prefix = 'Rs', suffix, d = 0 }) {
  const shown = value === '' || value == null ? '' : pk(parseNum(value), 0).replace(/^0$/, value === 0 || value === '0' ? '0' : '')
  return (
    <label className="block">
      <span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="relative block">
        {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12.5px] font-bold" style={{ color: 'var(--muted)' }}>{prefix}</span>}
        <input className="input w-full tabular-nums" style={{ paddingLeft: prefix ? 38 : undefined, paddingRight: suffix ? 52 : undefined }} inputMode="decimal" value={shown} onChange={(e) => { const raw = e.target.value.replace(/[^\d.]/g, ''); onChange(raw === '' ? '' : raw.endsWith('.') ? raw : parseNum(raw)) }} />
        {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>{suffix}</span>}
      </span>
      {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{hint}</span>}
    </label>
  )
}
export const Num = ({ value, onChange, label, suffix, step = 'any', hint, min = 0 }) => (
  <label className="block"><span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>{label}</span>
    <span className="relative block"><input className="input w-full tabular-nums" type="number" min={min} step={step} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : parseFloat(e.target.value))} style={{ paddingRight: suffix ? 56 : undefined }} />{suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] font-bold" style={{ color: 'var(--muted)' }}>{suffix}</span>}</span>
    {hint && <span className="block text-[11px] mt-1" style={{ color: 'var(--muted)' }}>{hint}</span>}</label>
)
export function Big({ label, value, fmt, sub, tone, i = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.06 }} className="rounded-2xl p-4 border border-line" style={{ background: tone ? 'var(--ink)' : 'var(--surface2)', color: tone ? 'var(--bg)' : 'var(--ink)' }}>
      <div className="eyebrow" style={tone ? { color: 'rgba(255,255,255,.6)' } : undefined}>{label}</div>
      <CountText value={value} format={fmt} className="display font-semibold text-[26px] sm:text-[30px] tabular-nums block leading-tight mt-0.5" />
      {sub != null && <div className="text-[12px] mt-0.5" style={{ opacity: 0.7 }}>{typeof sub === 'number' ? '≈ ' + short(sub) : sub}</div>}
    </motion.div>
  )
}
export function Donut({ parts, size = 150, center }) {
  const total = parts.reduce((s, p) => s + p.v, 0) || 1, R = size / 2 - 10, C = 2 * Math.PI * R; let off = 0
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--border)" strokeWidth={16} />
        {parts.map((p, i) => { const len = (p.v / total) * C, el = <motion.circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={p.c} strokeWidth={16} strokeLinecap="butt" strokeDasharray={`${len} ${C - len}`} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: -off }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />; off += len; return el })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{center}</div>
    </div>
  )
}
export function Spark({ pts, h = 140 }) {
  if (!pts.length) return null
  const W = 600, mx = Math.max(...pts.map((p) => p.v)) || 1, X = (i) => (i / Math.max(1, pts.length - 1)) * W, Y = (v) => h - 8 - (v / mx) * (h - 20)
  const line = (k) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full" style={{ height: h }}>
      <motion.path d={`${line('v')} L${W} ${h} L0 ${h}Z`} fill="var(--copper)" fillOpacity="0.16" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.path d={line('v')} fill="none" stroke="var(--copper)" strokeWidth="3" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
      <motion.path d={line('dep')} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
    </svg>
  )
}
export const Note = ({ children }) => <div className="text-[12px] leading-relaxed mt-4 rounded-xl px-3.5 py-2.5" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{children}</div>
