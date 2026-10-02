import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'

export function Dropzone({ onFiles, multiple = false, accept, label = 'Drop files here', sub = 'or click to browse', children }) {
  const [hot, setHot] = useState(false)
  const ref = useRef(null)
  return (
    <div
      className="dropzone p-10 text-center cursor-pointer"
      data-hot={hot}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setHot(true) }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => { e.preventDefault(); setHot(false); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1)) }}
    >
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept} onChange={(e) => { const fs = [...e.target.files]; if (fs.length) onFiles(fs); e.target.value = '' }} />
      {children || (
        <>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--copper)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4">
            <path d="M12 16V4m0 0 4 4m-4-4-4 4" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <div className="display font-semibold text-[17px]">{label}</div>
          <div className="text-[13px] mt-1.5" style={{ color: 'var(--muted)' }}>{sub}</div>
        </>
      )}
    </div>
  )
}

export function Progress({ value, label }) {
  return (
    <div>
      {label && <div className="flex justify-between text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}><span>{label}</span><span>{Math.round(value)}%</span></div>}
      <div className="progress-shell"><div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
    </div>
  )
}

export function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <div className="label mb-1.5">{label}</div>
      {children}
    </div>
  )
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

export function Stat({ k, v }) {
  return (
    <div className="card p-4">
      <div className="label">{k}</div>
      <div className="font-bold mt-1 truncate">{v}</div>
    </div>
  )
}

export function Note({ children, tone = 'info' }) {
  const colors = { info: 'var(--accent2)', warn: '#E8A33D', ok: '#4E937A' }
  return (
    <div className="rounded-xl px-4 py-3 text-[13px] flex items-start gap-2.5 border" style={{ background: `color-mix(in srgb, ${colors[tone]} 10%, var(--surface))`, borderColor: `color-mix(in srgb, ${colors[tone]} 35%, transparent)` }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors[tone]} strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0">
        {tone === 'warn' ? <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          : tone === 'ok' ? <path d="M20 6 9 17l-5-5" />
          : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>}
      </svg>
      <span>{children}</span>
    </div>
  )
}
