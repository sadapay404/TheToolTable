import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { KIco, Btn, SPRING, fmtSize, save } from '../kit/ui.jsx'
import { thumb } from '../../lib/pdf/engine.js'

export function Thumb({ doc, idx, rot = 0, w = 220, className = '' }) {
  const [src, setSrc] = useState(null), ref = useRef(null)
  useEffect(() => {
    let dead = false, io
    const go = () => thumb(doc, idx, w).then((s) => !dead && setSrc(s)).catch(() => {})
    if ('IntersectionObserver' in window && ref.current) { io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { go(); io.disconnect() } }, { rootMargin: '300px' }); io.observe(ref.current) } else go()
    return () => { dead = true; io?.disconnect() }
  }, [doc.id, idx, w])
  return (
    <div ref={ref} className={`relative overflow-hidden rounded-lg grid place-items-center ${className}`} style={{ background: 'var(--surface2)', aspectRatio: '0.72' }}>
      {src ? <motion.img initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1, rotate: rot }} transition={SPRING} src={src} alt="" draggable={false} className="max-w-full max-h-full object-contain" style={{ boxShadow: '0 1px 6px rgba(0,0,0,.18)' }} /> : <motion.div animate={{ opacity: [0.3, 0.8, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} style={{ color: 'var(--muted)' }}><KIco n="pdf" s={26} /></motion.div>}
    </div>
  )
}

export function DocSelect({ docs, value, onChange }) {
  if (docs.length < 2) return null
  return (
    <div className="flex flex-wrap gap-2">
      {docs.map((d) => { const on = d.id === value; return (
        <motion.button key={d.id} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => onChange(d.id)} className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold border flex items-center gap-1.5" style={{ background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)', borderColor: on ? 'var(--ink)' : 'var(--border)' }}>
          <KIco n="pdf" s={13} /><span className="max-w-[160px] truncate">{d.name}</span><span style={{ opacity: 0.65 }}>{d.pages}p</span>
        </motion.button>) })}
    </div>
  )
}

export function ResultBar({ result, onClose, onKeep }) {
  return (
    <AnimatePresence>
      {result && (
        <motion.div key={result.k} initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }} transition={SPRING} className="rounded-[24px] border p-4 sm:p-5 flex flex-wrap items-center gap-4" style={{ background: 'color-mix(in srgb, #2F9C6B 10%, var(--surface))', borderColor: 'color-mix(in srgb, #2F9C6B 40%, var(--border))', boxShadow: 'var(--shadow)' }}>
          <motion.div initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 0.1 }} className="w-11 h-11 rounded-full grid place-items-center text-white" style={{ background: '#2F9C6B' }}><KIco n="check" s={22} w={2.4} /></motion.div>
          <div className="min-w-0 flex-1">
            <div className="display font-semibold text-[16px] truncate">{result.name}</div>
            <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{result.note || 'Ready'} · {fmtSize(result.blob.size)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onKeep && result.keep && <Btn icon="layers" onClick={onKeep}>Keep editing</Btn>}
            <Btn primary icon="download" onClick={() => save(result.blob, result.name)}>Download</Btn>
            <Btn small icon="x" onClick={onClose} title="Dismiss" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
