import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Btn, SPRING } from './ui.jsx'
import { parse } from '../../lib/qr/parse.js'
import { checkSafety } from '../../lib/qr/safety.js'
import { download } from '../../lib/utils.js'

const LV = {
  safe: ['#2F9C6B', 'Looks safe', 'shield'], info: ['#4B7BB5', 'Worth a glance', 'eye'], warn: ['#D9962B', 'Be careful', 'warn'], danger: ['#C3423F', 'Dangerous — do not trust', 'warn'],
}
const copyText = async (t) => { try { await navigator.clipboard.writeText(t); return true } catch { return false } }

export function SafetyBanner({ s }) {
  const [c, label, ic] = LV[s.level]
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="rounded-2xl p-3.5" style={{ background: `color-mix(in srgb, ${c} 10%, var(--surface))`, border: `1px solid color-mix(in srgb, ${c} 38%, transparent)` }}>
      <div className="flex items-center gap-2.5"><motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING} className="w-8 h-8 rounded-full grid place-items-center text-white shrink-0" style={{ background: c }}><QIco n={ic} s={16} /></motion.span><div><div className="text-[13.5px] font-bold" style={{ color: c }}>{label}</div><div className="text-[10.5px] tracking-wider font-bold" style={{ color: 'var(--muted)' }}>LOCAL SAFETY CHECK · NOTHING LEAVES YOUR DEVICE</div></div></div>
      <ul className="mt-2.5 space-y-1.5">{s.findings.map((f, i) => <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: 0.05 * i }} className="flex gap-2 text-[12.5px]"><span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.lv === 'ok' ? '#2F9C6B' : f.lv === 'info' ? '#4B7BB5' : f.lv === 'warn' ? '#D9962B' : '#C3423F' }} />{f.t}</motion.li>)}</ul>
    </motion.div>
  )
}

export default function ResultCard({ item, onEdit, fav, onFav, toast, compact }) {
  const p = parse(item.text, item.format)
  const safety = checkSafety(p)
  const [peek, setPeek] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const cp = async (t, m = 'Copied') => toast(await copyText(t) ? m : 'Clipboard blocked by the browser', false)
  const act = []
  const openIt = (u) => window.open(u, '_blank', 'noopener,noreferrer')
  const a = (label, icon, fn, o = {}) => act.push({ label, icon, fn, ...o })
  if (p.type === 'url') a(safety.level === 'danger' && !confirm ? 'Open anyway…' : 'Open link', 'open', () => { if (safety.level === 'danger' && !confirm) { setConfirm(true); return } openIt(p.url) }, { primary: true, danger: safety.level === 'danger' })
  if (p.type === 'whatsapp') a('Open chat', 'chat', () => openIt(p.open), { primary: true })
  if (p.type === 'geo') a('Open in Maps', 'pin', () => openIt(p.open), { primary: true })
  if (p.type === 'phone') a('Call', 'phone', () => { window.location.href = p.open }, { primary: true })
  if (p.type === 'sms' || p.type === 'email') a(p.type === 'sms' ? 'Send SMS' : 'Write email', p.type === 'sms' ? 'chat' : 'mail', () => { window.location.href = p.open }, { primary: true })
  if (p.type === 'contact') a('Save contact', 'download', () => { download(new Blob([p.vcard], { type: 'text/vcard' }), (p.title || 'contact').replace(/\W+/g, '-') + '.vcf'); toast('Contact file saved') }, { primary: true })
  if (p.type === 'event') a('Add to calendar', 'calendar', () => { download(new Blob([p.ics], { type: 'text/calendar' }), (p.title || 'event').replace(/\W+/g, '-') + '.ics'); toast('Calendar file saved') }, { primary: true })
  if (p.type === 'wifi') { a('Copy password', 'key', () => cp(p.wifi.pass, 'Password copied'), { primary: true, disabled: !p.wifi.pass }); a('Copy network', 'wifi', () => cp(p.wifi.ssid, 'Network name copied')) }
  if (p.type === 'payment' && p.open) a('Open payment app', 'card', () => { window.location.href = p.open }, { primary: true })
  if (p.type === 'crypto') a('Copy address', 'copy', () => cp(p.rows[0][1], 'Address copied'), { primary: true })
  if (p.type === 'product' || p.type === 'barcode') a('Search code', 'search', () => openIt('https://www.google.com/search?q=' + encodeURIComponent(item.text)), { primary: true })
  a('Copy text', 'copy', () => cp(item.text), { primary: !act.length })
  if (p.edit && onEdit) a('Remake as QR', 'qr', () => onEdit(p.edit))
  if (onFav) a(fav ? 'Favourited' : 'Favourite', 'star', onFav, { on: fav })
  if (navigator.share) a('Share', 'share', () => navigator.share({ text: item.text }).catch(() => {}))
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="space-y-3.5">
      <div className="flex items-start gap-3">
        <motion.span initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={SPRING} className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: 'color-mix(in srgb, var(--copper) 14%, var(--surface))', color: 'var(--copper)' }}><QIco n={p.icon} s={22} /></motion.span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5"><span className="eyebrow">{p.label}</span><span className="mono text-[10.5px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{item.format || 'QR'}</span></div>
          <div className="display font-semibold text-[21px] leading-snug break-words">{p.title}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-line divide-y" style={{ background: 'var(--surface2)', borderColor: 'var(--border)' }}>
        {p.rows.map(([k, v], i) => <motion.div key={k + i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.04 * i }} className="flex gap-3 px-3.5 py-2 text-[13px]" style={{ borderColor: 'var(--border)' }}><span className="w-[84px] shrink-0 font-semibold" style={{ color: 'var(--muted)' }}>{k}</span><span className="min-w-0 break-words font-medium whitespace-pre-wrap">{v}</span></motion.div>)}
      </div>
      {!compact && <SafetyBanner s={safety} />}
      {p.type === 'wifi' && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Browsers can’t join Wi-Fi for you — copy the password, then pick the network in your device settings.</div>}
      <div className="flex flex-wrap gap-2">
        {act.map((x) => <Btn key={x.label} small solid={x.primary && !x.danger} copper={x.on} tone={x.danger ? '#C3423F' : undefined} icon={x.icon} onClick={x.fn} disabled={x.disabled}>{x.label}</Btn>)}
      </div>
      <button type="button" onClick={() => setPeek((v) => !v)} className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--muted)' }}><motion.span animate={{ rotate: peek ? 90 : 0 }} className="inline-flex"><QIco n="arrow" s={13} /></motion.span>Raw data · {new TextEncoder().encode(item.text).length} bytes</button>
      <AnimatePresence>{peek && <motion.pre initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mono text-[11.5px] rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap break-all" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{item.text}</motion.pre>}</AnimatePresence>
    </motion.div>
  )
}
