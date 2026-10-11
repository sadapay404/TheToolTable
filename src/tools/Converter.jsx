import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, Progress, Note } from '../components/ui.jsx'
import { convertFile, GROUPS, KIND_TARGETS, kindOf, KIND_LABEL } from '../lib/engines.js'
import { download, baseName, fmtBytes, recentAction } from '../lib/utils.js'

export default function Converter() {
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState({})
  const [openCat, setOpenCat] = useState(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const running = useRef(new Set())
  const versions = useRef(new Map())
  const batchId = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      batchId.current++
      for (const id of versions.current.keys()) versions.current.set(id, versions.current.get(id) + 1)
    }
  }, [])

  function addFiles(fs) {
    setFiles((prev) => [...prev, ...fs.map((f) => {
      const kind = kindOf(f)
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`
      return { file: f, id, kind, target: KIND_TARGETS[kind]?.[0] || 'txt' }
    })])
  }

  const patch = (id, p) => setStatus((s) => ({ ...s, [id]: { ...s[id], ...p } }))
  const invalidate = (id) => versions.current.set(id, (versions.current.get(id) || 0) + 1)

  async function run(item) {
    if (running.current.has(item.id)) return
    running.current.add(item.id)
    const token = (versions.current.get(item.id) || 0) + 1
    versions.current.set(item.id, token)
    const isCurrent = () => alive.current && versions.current.get(item.id) === token
    if (isCurrent()) patch(item.id, { state: 'working', prog: 4, msg: 'Starting engine…', error: null })
    try {
      const { blob, ext } = await convertFile(item.file, item.kind, item.target, (p) => { if (isCurrent()) patch(item.id, { prog: p }) })
      if (!isCurrent()) return
      patch(item.id, { state: 'done', prog: 100, msg: `Ready to save · ${fmtBytes(blob.size)}`, blob, ext })
      recentAction(`Converted ${item.file.name} → ${ext.toUpperCase()}`)
    } catch (e) {
      if (isCurrent()) patch(item.id, { state: 'error', prog: 0, msg: String(e?.message || e).slice(0, 220) })
    } finally { running.current.delete(item.id) }
  }

  async function runAll() {
    if (batchBusy) return
    const currentBatch = ++batchId.current
    setBatchBusy(true)
    try {
      for (const item of files) {
        if (!alive.current || batchId.current !== currentBatch) return
        if (status[item.id]?.state === 'working' || running.current.has(item.id)) continue
        await run(item)
      }
    } finally {
      if (alive.current && batchId.current === currentBatch) setBatchBusy(false)
    }
  }

  function clearQueue() {
    batchId.current++
    for (const item of files) invalidate(item.id)
    setFiles([]); setStatus({}); setBatchBusy(false)
  }

  function removeFile(id) {
    batchId.current++
    invalidate(id)
    setFiles((current) => current.filter((item) => item.id !== id))
    setStatus((current) => { const next = { ...current }; delete next[id]; return next })
    setBatchBusy(false)
  }

  const catalog = useMemo(() => GROUPS.map(([cat, fmts]) => ({
    cat,
    fmts: fmts.map((f) => ({ f, by: Object.values(KIND_TARGETS).filter((t) => t.includes(f)).length })),
  })), [])

  return (
    <div className="space-y-5">
      <Dropzone onFiles={addFiles} multiple label="Drop any files — batch supported" sub="Images · video · audio · PDF · Word · sheets · slides · e-books · archives" />

      {files.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn btn-primary" disabled={batchBusy} onClick={runAll}>{batchBusy ? 'Converting queue…' : `Convert all (${files.length})`}</button>
            <button className="btn" onClick={clearQueue}>Clear queue</button>
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Lossless-first defaults · everything on-device.</span>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {files.map((item) => {
                const st = status[item.id] || { state: 'idle', prog: 0, msg: 'Queued' }
                const targets = KIND_TARGETS[item.kind] || ['txt', 'zip']
                return (
                  <motion.div key={item.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="card p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="chip pointer-events-none" style={{ cursor: 'default' }}>{KIND_LABEL[item.kind]} · {item.file.name.split('.').pop().toUpperCase()}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--copper)" strokeWidth="2" strokeLinecap="round" className="shrink-0"><path d="M4 12h14m-5-6 6 6-6 6" /></svg>
                      </div>
                      <div className="flex-1 min-w-[140px]">
                        <div className="font-semibold text-[13.5px] truncate">{item.file.name}</div>
                        <div className="text-[11.5px] mt-0.5 break-words" style={{ color: st.state === 'error' ? 'var(--error)' : 'var(--muted)' }}>{fmtBytes(item.file.size)} · {st.msg}</div>
                      </div>
                      <select
                        className="input w-full sm:w-auto min-w-[190px]"
                        aria-label={`Output format for ${item.file.name}`}
                        value={item.target}
                        disabled={st.state === 'working'}
                        onChange={(e) => setFiles((fs) => fs.map((x) => x.id === item.id ? { ...x, target: e.target.value } : x))}
                      >
                        {GROUPS.map(([cat, fmts]) => {
                          const avail = fmts.filter((f) => targets.includes(f))
                          if (!avail.length) return null
                          return (
                            <optgroup key={cat} label={cat}>
                              {avail.map((f) => <option key={f} value={f}>.{f}</option>)}
                            </optgroup>
                          )
                        })}
                        <optgroup label="Archive">
                          {targets.includes('zip') && <option value="zip">.zip (wrap)</option>}
                        </optgroup>
                      </select>
                      {st.state === 'done' && st.blob && (
                        <button className="btn" onClick={() => download(st.blob, `${baseName(item.file.name)}.${st.ext}`)}>Save file</button>
                      )}
                      <button className="btn btn-primary" disabled={st.state === 'working'} onClick={() => run(item)}>
                        {st.state === 'working' ? 'Working…' : st.state === 'done' ? 'Convert again' : 'Convert'}
                      </button>
                      <button className="btn btn-ghost" aria-label={`Remove ${item.file.name}`} onClick={() => removeFile(item.id)}>✕</button>
                    </div>
                    {st.state === 'working' && <div className="mt-3"><Progress value={st.prog} /></div>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Format catalog */}
      <div className="card p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="display font-semibold text-[18px]">Format catalog</h3>
            <p className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>
              {GROUPS.reduce((n, [, f]) => n + f.length, 0)} output formats on-device · server-side long tail arrives with Phase 2.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {catalog.map(({ cat, fmts }) => (
            <button key={cat} className="chip" data-on={openCat === cat} onClick={() => setOpenCat(openCat === cat ? null : cat)}>
              {cat}
              <span className="mono text-[10px]" style={{ opacity: 0.7 }}>{fmts.length}</span>
            </button>
          ))}
        </div>
        <AnimatePresence>
          {openCat && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="flex flex-wrap gap-1.5 pt-4">
                {catalog.find((c) => c.cat === openCat).fmts.map(({ f }) => (
                  <span key={f} className="mono text-[11px] uppercase tracking-wide px-2 py-1 rounded-md border border-line" style={{ background: 'var(--surface2)' }}>{f}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Note>Conversions you request are explicit re-encodes at the highest practical quality (CRF-16 video, 320k audio, lossless PNG/FLAC/WAV/DOCX/XLSX/EPUB writers). Strict byte budgets live in Tool 03.</Note>
    </div>
  )
}
