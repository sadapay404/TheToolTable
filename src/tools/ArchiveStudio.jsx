// Tool 18 — Archive Studio. Open a .zip or .gz and take it apart, or build a fresh one from files.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes, baseName } from '../lib/utils.js'
import { readArchive, makeZip, gzipFile, entryBlob, mimeOf, groupByFolder, safeName } from '../lib/zip.js'
import { Ico, Btn, Chips, Slider, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING, CopyBtn } from './kit.jsx'

export default function ArchiveStudio() {
  const [mode, setMode] = useState('open')
  const [archive, setArchive] = useState(null)      // { name, size, kind, entries }
  const [picked, setPicked] = useState(() => new Set())
  const [queue, setQueue] = useState([])            // files to zip
  const [level, setLevel] = useState(6)
  const [zipName, setZipName] = useState('archive.zip')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)

  const openFiles = useCallback(async (files) => {
    const f = files[0]
    setBusy('reading archive')
    try {
      const res = await readArchive(f)
      setArchive({ name: f.name, ...res })
      setPicked(new Set())
      recentAction(`Opened ${f.name} · ${res.entries.length} entries`)
      toast(`${f.name} · ${res.entries.length} file${res.entries.length === 1 ? '' : 's'} · ${fmtBytes(res.size)}`)
    } catch (e) { toast(`Could not read that archive: ${e.message}`, 'err') }
    setBusy('')
  }, [toast])

  const addToQueue = useCallback((files) => {
    setQueue((q) => [...q, ...[...files].map((f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, size: f.size, file: f, level: null }))])
    setZipName((n) => (n === 'archive.zip' && files[0] ? `${baseName(files[0].name)}${files.length > 1 ? `-and-${files.length - 1}-more` : ''}.zip` : n))
  }, [])

  const filtered = useMemo(() => {
    if (!archive) return []
    const q = query.trim().toLowerCase()
    return q ? archive.entries.filter((e) => e.name.toLowerCase().includes(q)) : archive.entries
  }, [archive, query])
  const total = useMemo(() => (archive ? archive.entries.reduce((n, e) => n + e.size, 0) : 0), [archive])
  const queueTotal = queue.reduce((n, f) => n + f.size, 0)

  const extract = async (entries, { zip = false } = {}) => {
    if (!entries.length) return toast('Pick some files first', 'err')
    if (!zip && entries.length === 1) {
      await download(entryBlob(entries[0]), baseName(entries[0].name) || 'file')
      toast(`Extracted ${baseName(entries[0].name)}`)
      return
    }
    setBusy('packing')
    const out = await makeZip(entries.map((e) => ({ name: e.name, data: e.data })), { level: 0, onProgress: setProgress })
    await download(out, `${baseName(archive.name)}-extracted.zip`)
    setBusy(''); setProgress(0)
    recentAction(`Extracted ${entries.length} files`)
    toast(`${entries.length} files in one zip`)
  }

  const buildZip = async () => {
    if (!queue.length) return toast('Add files to the queue first', 'err')
    setBusy('compressing')
    try {
      const entries = []
      for (const q of queue) entries.push({ name: q.name, data: new Uint8Array(await q.file.arrayBuffer()) })
      setProgress(15)
      const blob = await makeZip(entries, { level, onProgress: setProgress })
      await download(blob, safeName(zipName).replace(/\.zip$/i, '') + '.zip')
      recentAction(`Created ${zipName} from ${queue.length} files`)
      toast(`${zipName} · ${fmtBytes(blob.size)} · ${(100 - (blob.size / (queueTotal || 1)) * 100).toFixed(0)}% smaller`)
      setProgress(0)
    } catch (e) { toast(`Zip failed: ${e.message}`, 'err') }
    setBusy('')
  }

  const gzipSingle = async () => {
    if (queue.length !== 1) return toast('Gzip takes exactly one file — use the zip for many', 'err')
    setBusy('compressing')
    const blob = await gzipFile(queue[0].file, { onProgress: setProgress, level })
    await download(blob, `${queue[0].name}.gz`)
    setBusy(''); setProgress(0)
    toast(`${queue[0].name}.gz · ${fmtBytes(blob.size)}`)
  }

  const toggle = (name) => setPicked((s) => { const n = new Set(s); n.has(name) ? n.delete(name) : n.add(name); return n })

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple onChange={(e) => { const fs = [...e.target.files]; if (mode === 'open') openFiles(fs); else addToQueue(fs); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={mode} onChange={(m) => { setMode(m); setQuery('') }} options={[['open', 'Open & extract'], ['create', 'Create']]} />
        <div className="ml-auto flex gap-2">
          <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>{mode === 'open' ? 'Open archive' : 'Add files'}</Btn>
        </div>
      </div>

      {mode === 'open' && (
        !archive ? (
          <Panel>
            <Drop onFiles={openFiles} accept=".zip,.gz,application/zip,application/gzip" label="Drop a .zip or .gz" sub="Listed, filtered and unpacked on this device — no size limit from a server" />
            <div className="grid sm:grid-cols-3 gap-3 mt-5">
              {[['box', 'See inside first', 'Names, sizes and the real compression ratio before you extract anything.'],
                ['search', 'Find one file', 'Filter a 4 000-entry archive by name in an instant.'],
                ['download', 'Take it out', 'Save one file, the selection, or everything as a fresh zip.']].map(([ic, t, d], i) => (
                <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                  <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                  <div className="font-bold text-[13px]">{t}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
                </motion.div>
              ))}
            </div>
          </Panel>
        ) : (
          <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px] items-start">
            <Panel pad={false}>
              <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line">
                <div className="w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={archive.kind === 'gzip' ? 'file' : 'box'} s={17} /></div>
                <div className="min-w-0">
                  <div className="font-bold text-[13.5px] truncate">{archive.name}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{archive.entries.length} files · {fmtBytes(total)} raw · {fmtBytes(archive.size)} packed</div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <input className="input !py-1.5 w-[150px]" placeholder="Filter by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <Btn small icon="check" onClick={() => setPicked(new Set(filtered.map((e) => e.name)))}>{picked.size === filtered.length ? 'Clear' : 'All'}</Btn>
                </div>
              </div>
              <div className="max-h-[56vh] overflow-auto">
                {groupByFolder(filtered).map(([folder, items]) => (
                  <div key={folder}>
                    {folder && <div className="px-5 py-2 text-[11.5px] font-bold sticky top-0 z-[1]" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{folder}/</div>}
                    {items.map((e, i) => {
                      const on = picked.has(e.name)
                      return (
                        <motion.div key={e.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(i * 0.008, 0.25) }}
                          onClick={() => toggle(e.name)} className="px-4 py-2.5 flex items-center gap-3 cursor-pointer border-b" style={{ borderColor: 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 9%, transparent)' : 'transparent' }}>
                          <motion.span initial={false} animate={{ scale: on ? 1 : 0.7, opacity: on ? 1 : 0.35 }} className="w-5 h-5 rounded-md grid place-items-center shrink-0" style={{ background: on ? 'var(--copper)' : 'var(--surface2)', color: on ? '#fff' : 'var(--muted)' }}><Ico n="check" s={11} w={3} /></motion.span>
                          <Ico n={/\.(png|jpe?g|gif|webp|svg)$/i.test(e.name) ? 'image' : /\.(mp4|mkv|mov|webm)$/i.test(e.name) ? 'film' : /\.(mp3|wav|m4a|flac)$/i.test(e.name) ? 'wave' : /\.pdf$/i.test(e.name) ? 'pdf' : 'file'} s={15} />
                          <span className="min-w-0 flex-1 text-[12.5px] truncate">{e.label || e.name}</span>
                          <span className="mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{fmtBytes(e.size)}</span>
                        </motion.div>
                      )
                    })}
                  </div>
                ))}
                {!filtered.length && <div className="p-8 text-center text-[13px]" style={{ color: 'var(--muted)' }}>Nothing matches “{query}”.</div>}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t border-line">
                <Btn small primary icon="download" disabled={!picked.size || !!busy} onClick={() => extract(archive.entries.filter((e) => picked.has(e.name)))}>Extract {picked.size || ''} picked</Btn>
                <Btn small icon="box" disabled={!!busy} onClick={() => extract(archive.entries)}>Extract everything</Btn>
                <span className="text-[11.5px] ml-auto" style={{ color: 'var(--muted)' }}>One file saves as itself · several come back as a zip</span>
              </div>
              {progress > 0 && <div className="h-1.5" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)', height: '100%' }} animate={{ width: `${progress}%` }} /></div>}
            </Panel>

            <div className="space-y-4">
              <Panel delay={0.04}>
                <Label>Summary</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Stat k="Files" v={archive.entries.length} />
                  <Stat k="Raw" v={fmtBytes(total)} />
                  <Stat k="Archive" v={fmtBytes(archive.size)} />
                  <Stat k="Saved" v={total ? `${Math.max(0, (100 - (archive.size / total) * 100)).toFixed(0)}%` : '—'} />
                </div>
                <div className="h-2.5 rounded-full overflow-hidden mt-3" style={{ background: 'var(--border)' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, total ? (archive.size / total) * 100 : 0)}%` }} style={{ background: 'var(--copper)', height: '100%' }} />
                </div>
                <div className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>The bar is how much of the raw data actually made it into the archive.</div>
              </Panel>
              <Panel delay={0.08}>
                <Label>This archive</Label>
                <div className="space-y-2">
                  <Btn small icon="box" className="w-full" onClick={async () => { setBusy('repacking'); const out = await makeZip(archive.entries.map((e) => ({ name: e.name, data: e.data })), { level: 9, onProgress: setProgress }); await download(out, `${baseName(archive.name)}-repacked.zip`); setBusy(''); setProgress(0); toast('Repacked at maximum compression') }}>Repack at level 9</Btn>
                  <Btn small icon="refresh" className="w-full" onClick={() => { setArchive(null); setPicked(new Set()) }}>Close this archive</Btn>
                </div>
              </Panel>
            </div>
          </div>
        )
      )}

      {mode === 'create' && (
        <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_320px] items-start">
          <Panel pad={false} className={queue.length ? '' : 'p-0'}>
            {!queue.length ? <div className="p-5"><Drop onFiles={addToQueue} multiple label="Drop files to archive" sub="Any kind, any size — they are compressed in this tab" /></div> : (
              <>
                <div className="px-5 py-4 border-b border-line flex items-center gap-3">
                  <span className="eyebrow">Queue</span>
                  <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{queue.length} files · {fmtBytes(queueTotal)}</span>
                  <div className="ml-auto flex gap-2">
                    <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Add</Btn>
                    <Btn small icon="trash" onClick={() => setQueue([])} />
                  </div>
                </div>
                <div className="max-h-[52vh] overflow-auto">
                  <AnimatePresence initial={false}>
                    {queue.map((f, i) => (
                      <motion.div key={f.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING}
                        className="px-5 py-2.5 flex items-center gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
                        <Ico n="file" s={15} />
                        <span className="min-w-0 flex-1 text-[12.5px] truncate">{f.name}</span>
                        <span className="mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{fmtBytes(f.size)}</span>
                        <button className="opacity-50 hover:opacity-100" onClick={() => setQueue((q) => q.filter((x) => x.id !== f.id))}><Ico n="x" s={13} /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </>
            )}
          </Panel>
          <div className="space-y-4">
            <Panel delay={0.04}>
              <Label>Zip it</Label>
              <input className="input w-full mb-4" value={zipName} onChange={(e) => setZipName(e.target.value)} />
              <Slider label="Compression" min={0} max={9} step={1} value={level} onChange={setLevel} fmt={(v) => (v === 0 ? 'store only' : v <= 3 ? `${v} · fast` : v <= 6 ? `${v} · balanced` : `${v} · smallest`)} />
              <div className="space-y-2 mt-4">
                <Btn primary icon="box" className="w-full" disabled={!queue.length || !!busy} busy={busy === 'compressing'} onClick={buildZip}>Create zip ({queue.length})</Btn>
                <Btn icon="file" className="w-full" disabled={queue.length !== 1 || !!busy} onClick={gzipSingle}>Create .gz</Btn>
              </div>
              {progress > 0 && <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)', height: '100%' }} animate={{ width: `${progress}%` }} /></div>}
              <div className="text-[11.5px] mt-3" style={{ color: 'var(--muted)' }}>Folders in the dropped paths are kept, and every name is sanitised so an archive can never write outside its own folder.</div>
            </Panel>
          </div>
        </div>
      )}
      <Toast msg={msg} />
    </div>
  )
}
