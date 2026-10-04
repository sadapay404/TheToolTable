import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Btn, KIco, SPRING, Label } from '../kit/ui.jsx'
import { makeMatrix } from '../../lib/qr/render.js'
import { decodeSource } from '../../lib/qr/zx.js'

export function QrBox({ text, size = 280 }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current; if (!c || !text) return
    let m; try { m = makeMatrix(text, 'L') } catch { m = null }
    const x = c.getContext('2d'); c.width = c.height = size; x.fillStyle = '#fff'; x.fillRect(0, 0, size, size)
    if (!m) { x.fillStyle = '#999'; x.font = '13px sans-serif'; x.textAlign = 'center'; x.fillText('Too long for a QR code — use copy', size / 2, size / 2); return }
    const q = 3, s = size / (m.n + q * 2); x.fillStyle = '#111'
    for (let r = 0; r < m.n; r++) for (let k = 0; k < m.n; k++) if (m.get(r, k)) x.fillRect(Math.floor((k + q) * s), Math.floor((r + q) * s), Math.ceil(s), Math.ceil(s))
  }, [text, size])
  return <canvas ref={ref} width={size} height={size} className="rounded-2xl border border-line mx-auto block" style={{ width: size, maxWidth: '100%', height: 'auto', background: '#fff' }} />
}

export function Scanner({ onText, onClose }) {
  const v = useRef(null), [err, setErr] = useState('')
  useEffect(() => {
    let dead = false, st, timer; (async () => {
      try {
        st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } }); if (dead) return st.getTracks().forEach((t) => t.stop())
        v.current.srcObject = st; await v.current.play()
        const c = document.createElement('canvas'), loop = async () => {
          if (dead) return; if (v.current.videoWidth) { c.width = v.current.videoWidth; c.height = v.current.videoHeight; c.getContext('2d').drawImage(v.current, 0, 0); try { const r = await decodeSource(c, { formats: ['QRCode'], max: 1, hard: false }); const t = r.items[0]?.text; if (t && /BEAM-/.test(t)) { onText(t); return } } catch {} }
          timer = setTimeout(loop, 220)
        }; loop()
      } catch { setErr('Camera is not available. Paste the code instead.') }
    })()
    return () => { dead = true; clearTimeout(timer); st?.getTracks().forEach((t) => t.stop()) }
  }, [])
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="relative rounded-2xl overflow-hidden" style={{ background: '#111' }}>
      {err ? <div className="p-8 text-center text-white text-[13.5px]">{err}</div> : <video ref={v} playsInline muted className="w-full max-h-[320px] object-cover" />}
      {!err && <motion.div className="absolute left-[12%] right-[12%] h-0.5" style={{ background: 'var(--copper)', boxShadow: '0 0 14px var(--copper)' }} animate={{ top: ['18%', '82%', '18%'] }} transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }} />}
      <div className="absolute top-2 right-2"><Btn small icon="x" onClick={onClose}>Close</Btn></div>
    </motion.div>
  )
}

/** read-only code with copy + QR toggle */
export function CodeOut({ code, label, hint }) {
  const [qr, setQr] = useState(false), [ok, setOk] = useState(false)
  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <textarea readOnly rows={4} value={code} onFocus={(e) => e.target.select()} className="input w-full mono text-[11px] break-all" style={{ lineHeight: 1.45 }} />
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn primary icon={ok ? 'check' : 'copy'} onClick={() => { navigator.clipboard?.writeText(code).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1400) }}>{ok ? 'Copied' : 'Copy code'}</Btn>
        <Btn icon="qr" onClick={() => setQr(!qr)}>{qr ? 'Hide QR' : 'Show QR'}</Btn>
        {navigator.share && <Btn icon="send" onClick={() => navigator.share({ text: code }).catch(() => {})}>Share</Btn>}
      </div>
      <AnimatePresence>{qr && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="pt-4"><QrBox text={code} /></div></motion.div>}</AnimatePresence>
      {hint && <div className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>{hint}</div>}
    </div>
  )
}
export function CodeIn({ value, onChange, label, onSubmit, submitLabel, busy, error }) {
  const [scan, setScan] = useState(false), file = useRef(null)
  const fromImg = async (f) => { const u = URL.createObjectURL(f), im = new Image(); im.src = u; await im.decode().catch(() => {}); try { const r = await decodeSource(im, { formats: ['QRCode'], max: 1 }); if (r.items[0]) onChange(r.items[0].text) } catch {} URL.revokeObjectURL(u) }
  return (
    <div>
      <Label>{label}</Label>
      <textarea rows={4} value={value} onChange={(e) => onChange(e.target.value)} placeholder="BEAM-…" spellCheck={false} className="input w-full mono text-[11px] break-all" />
      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] mt-2 font-semibold" style={{ color: '#C3423F' }}>{error}</motion.div>}</AnimatePresence>
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn primary icon="arrowRight" disabled={!value.trim()} busy={busy} onClick={onSubmit}>{submitLabel}</Btn>
        <Btn icon="file" onClick={() => navigator.clipboard?.readText().then(onChange).catch(() => {})}>Paste</Btn>
        <Btn icon="camera" onClick={() => setScan(!scan)}>{scan ? 'Stop scanning' : 'Scan QR'}</Btn>
        <Btn icon="image" onClick={() => file.current.click()}>QR image</Btn><input ref={file} type="file" accept="image/*" hidden onChange={(e) => { e.target.files[0] && fromImg(e.target.files[0]); e.target.value = '' }} />
      </div>
      <AnimatePresence>{scan && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="pt-4"><Scanner onClose={() => setScan(false)} onText={(t) => { onChange(t); setScan(false) }} /></div></motion.div>}</AnimatePresence>
    </div>
  )
}
export function Step({ n, title, done, active, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: active || done ? 1 : 0.45, y: 0 }} transition={SPRING} className="flex gap-4">
      <div className="flex flex-col items-center"><motion.div animate={{ scale: active ? 1.08 : 1 }} className="w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold shrink-0" style={{ background: done ? 'var(--copper)' : active ? 'var(--ink)' : 'var(--surface2)', color: done || active ? '#fff' : 'var(--muted)' }}>{done ? <KIco n="check" s={16} /> : n}</motion.div><div className="flex-1 w-px mt-2" style={{ background: 'var(--border)' }} /></div>
      <div className="flex-1 pb-8 min-w-0"><div className="display font-semibold text-[18px] mb-2">{title}</div>{(active || done) && children}</div>
    </motion.div>
  )
}
