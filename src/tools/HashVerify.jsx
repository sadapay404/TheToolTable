// Tool 19 — Hash & Verify. Checksums for anything you drop, and a straight answer about whether a
// download is what it claims to be.
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { recentAction, download, fmtBytes } from '../lib/utils.js'
import { ALGOS, hashFile, normalizeHash, verify, guessAlgo } from '../lib/hash.js'
import { Ico, Btn, Chips, Panel, Label, Seg, Drop, Stat, Toast, useToast, SPRING, CopyBtn } from './kit.jsx'

const DEFAULT = ['sha256']

export default function HashVerify() {
  const [tab, setTab] = useState('files')
  const [items, setItems] = useState([])          // { id, name, size, hashes, status, progress, error }
  const [algos, setAlgos] = useState(DEFAULT)
  const [busy, setBusy] = useState(false)
  const [expected, setExpected] = useState('')
  const [target, setTarget] = useState(null)
  const [pair, setPair] = useState([null, null])
  const [msg, toast] = useToast()
  const pickerRef = useRef(null)

  const add = useCallback(async (files) => {
    const next = [...files].map((f) => ({ id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, size: f.size, file: f, hashes: null, progress: 0, status: 'queued', error: '' }))
    setItems((s) => [...s, ...next])
    setTarget((t) => t ?? next[0]?.id ?? null)
    return next
  }, [])

  const run = async (list = items.filter((i) => i.status !== 'done')) => {
    if (!list.length) return toast('Everything is hashed already')
    setBusy(true)
    for (const item of list) {
      setItems((s) => s.map((i) => (i.id === item.id ? { ...i, status: 'running', progress: 0.1 } : i)))
      try {
        const hashes = await hashFile(item.file, algos, (p) => setItems((s) => s.map((i) => (i.id === item.id ? { ...i, progress: p / 100 } : i))))
        setItems((s) => s.map((i) => (i.id === item.id ? { ...i, status: 'done', progress: 1, hashes } : i)))
      } catch (e) {
        setItems((s) => s.map((i) => (i.id === item.id ? { ...i, status: 'error', error: String(e?.message || e) } : i)))
      }
    }
    setBusy(false)
    recentAction(`Hashed ${list.length} file${list.length > 1 ? 's' : ''}`)
    toast(`${list.length} file${list.length > 1 ? 's' : ''} hashed`)
  }

  const clear = () => { setItems([]); setTarget(null); setPair([null, null]); setExpected('') }
  const current = items.find((i) => i.id === target) || null
  const best = useMemo(() => {
    const c = current?.hashes
    if (!c) return null
    return ALGOS.find(([id]) => c[id] && (expected ? normalizeHash(expected).length === c[id].length : id === 'sha256')) || null
  }, [current, expected])
  const verdict = useMemo(() => {
    if (!current?.hashes || !expected) return null
    const algo = best?.[0] || 'sha256'
    const v = verify(expected, current.hashes[algo])
    return { v, algo, got: current.hashes[algo] }
  }, [current, expected, best])

  const exportTxt = async () => {
    const rows = items.filter((i) => i.hashes).map((i) => `${i.hashes.sha256 || ''}  ${i.name}`)
    if (!rows.length) return toast('Nothing hashed yet', 'err')
    await download(new Blob([rows.join('\n') + '\n'], { type: 'text/plain' }), 'checksums-sha256.txt')
    toast('checksums-sha256.txt saved')
  }
  const exportCsv = async () => {
    const rows = items.filter((i) => i.hashes)
    if (!rows.length) return toast('Nothing hashed yet', 'err')
    const head = ['file', 'bytes', ...ALGOS.map(([id]) => id)]
    const body = rows.map((i) => [i.name, i.size, ...ALGOS.map(([id]) => i.hashes[id] || '')].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    await download(new Blob([[head.join(','), ...body].join('\n')], { type: 'text/csv' }), 'checksums.csv')
    toast('checksums.csv saved')
  }

  const setPairFile = async (slot, files) => {
    const f = files[0]
    if (!f) return
    setPair((p) => { const n = [...p]; n[slot] = { name: f.name, size: f.size, hashing: true }; return n })
    const h = await hashFile(f, ['sha256', 'md5'])
    setPair((p) => { const n = [...p]; n[slot] = { name: f.name, size: f.size, hashes: h, hashing: false }; return n })
  }
  const same = pair[0]?.hashes && pair[1]?.hashes && pair[0].hashes.sha256 === pair[1].hashes.sha256

  return (
    <div className="space-y-6">
      <input ref={pickerRef} type="file" hidden multiple onChange={(e) => { add([...e.target.files]); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={tab} onChange={setTab} options={[['files', 'Files'], ['verify', 'Verify a hash'], ['compare', 'Two files']]} />
        <div className="ml-auto flex items-center gap-2">
          <Chips value={null} onChange={(a) => setAlgos((s) => (s.includes(a) ? (s.length > 1 ? s.filter((x) => x !== a) : s) : [...s, a]))} options={ALGOS.map(([id, , label]) => [id, label])} />
        </div>
      </div>

      {tab === 'files' && (
        !items.length ? (
          <Panel>
            <Drop onFiles={add} multiple label="Drop any files" sub="Nothing is uploaded — hashing happens in this tab, chunk by chunk" />
            <div className="grid sm:grid-cols-3 gap-3 mt-5">
              {[['hash', 'The six you need', 'SHA-256/384/512, SHA-1, MD5 and CRC-32 side by side.'],
                ['shield', 'Verify downloads', 'Paste the published checksum and get a plain yes or no.'],
                ['grid', 'Batch friendly', 'A whole folder at once, then export as .txt or spreadsheet-ready .csv.']].map(([ic, t, d], i) => (
                <motion.div key={t} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 * i }} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface)' }}>
                  <div className="w-9 h-9 rounded-xl grid place-items-center mb-2" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n={ic} s={18} /></div>
                  <div className="font-bold text-[13px]">{t}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{d}</div>
                </motion.div>
              ))}
            </div>
          </Panel>
        ) : (
          <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_340px] items-start">
            <Panel pad={false}>
              <div className="flex items-center gap-2 px-5 py-4 border-b border-line">
                <Btn small primary icon="hash" disabled={busy} busy={busy} onClick={() => run()}>Hash {items.filter((i) => i.status !== 'done').length || ''}</Btn>
                <Btn small icon="plus" onClick={() => pickerRef.current?.click()}>Add</Btn>
                <Btn small icon="trash" onClick={clear} />
                <span className="text-[11.5px] ml-auto" style={{ color: 'var(--muted)' }}>{algos.map((a) => ALGOS.find((x) => x[0] === a)[1]).join(' · ')}</span>
              </div>
              <div className="max-h-[58vh] overflow-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                <AnimatePresence initial={false}>
                  {items.map((i) => (
                    <motion.div key={i.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING}
                      className="px-5 py-3.5" style={{ background: i.id === target ? 'var(--surface2)' : 'transparent' }}>
                      <div className="flex items-center gap-3">
                        <Ico n="file" s={15} />
                        <button className="min-w-0 flex-1 text-left" onClick={() => setTarget(i.id)}>
                          <div className="text-[13px] font-semibold truncate">{i.name}</div>
                          <div className="text-[11.5px]" style={{ color: i.status === 'error' ? '#C3423F' : 'var(--muted)' }}>
                            {fmtBytes(i.size)}{i.status === 'running' ? ` · hashing ${Math.round(i.progress * 100)}%` : i.status === 'error' ? ` · ${i.error}` : ''}
                          </div>
                        </button>
                        <button className="opacity-50 hover:opacity-100" onClick={() => setItems((s) => s.filter((x) => x.id !== i.id))}><Ico n="x" s={13} /></button>
                      </div>
                      {i.status === 'running' && <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div style={{ background: 'var(--copper)', height: '100%' }} animate={{ width: `${i.progress * 100}%` }} /></div>}
                      {i.hashes && (
                        <div className="mt-2 space-y-1">
                          {algos.map((a) => (
                            <div key={a} className="flex items-center gap-2">
                              <span className="eyebrow w-[54px] shrink-0">{ALGOS.find((x) => x[0] === a)[1]}</span>
                              <span className="mono text-[11px] break-all flex-1" style={{ color: 'var(--muted)' }}>{i.hashes[a]}</span>
                              <CopyBtn text={i.hashes[a]} label="" small />
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              <div className="flex items-center gap-2 px-5 py-3.5 border-t border-line">
                <Btn small icon="download" onClick={exportTxt}>checksums.txt</Btn>
                <Btn small icon="grid" onClick={exportCsv}>checksums.csv</Btn>
                <CopyBtn text={items.filter((i) => i.hashes?.sha256).map((i) => `${i.hashes.sha256}  ${i.name}`).join('\n')} label="Copy all" small />
              </div>
            </Panel>

            <Panel delay={0.05}>
              <Label>Check against a published hash</Label>
              <textarea className="input w-full h-20 mono text-[11.5px] break-all" placeholder="Paste the checksum (any length — SHA-256, SHA-1, MD5, CRC-32…)" value={expected} onChange={(e) => setExpected(e.target.value)} />
              <div className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>
                {expected ? (guessAlgo(expected) ? `Looks like ${ALGOS.find((x) => x[0] === guessAlgo(expected))?.[1]} (${normalizeHash(expected).length} hex chars)` : 'That does not look like a hex checksum') : `Checking: ${current?.name || 'pick a file in the list'}`}
              </div>
              <AnimatePresence mode="wait">
                {verdict && (
                  <motion.div key={verdict.v} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING}
                    className="mt-4 rounded-2xl border p-4 flex items-center gap-3" style={{ borderColor: verdict.v === 'match' ? '#4E937A' : '#C3423F', background: `color-mix(in srgb, ${verdict.v === 'match' ? '#4E937A' : '#C3423F'} 10%, var(--surface))` }}>
                    <motion.div animate={verdict.v === 'match' ? { scale: [0.6, 1.15, 1] } : { x: [0, -5, 5, -3, 0] }} transition={{ duration: 0.45 }} className="w-10 h-10 rounded-2xl grid place-items-center shrink-0" style={{ background: verdict.v === 'match' ? '#4E937A' : '#C3423F', color: '#fff' }}>
                      <Ico n={verdict.v === 'match' ? 'check' : 'x'} s={20} w={2.6} />
                    </motion.div>
                    <div className="min-w-0">
                      <div className="display font-semibold text-[15px]">{verdict.v === 'match' ? 'A perfect match' : 'These do not match'}</div>
                      <div className="text-[11.5px] mono break-all" style={{ color: 'var(--muted)' }}>{verdict.algo}: {verdict.got.slice(0, 32)}…</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {current?.hashes && <div className="mt-4">
                <div className="eyebrow mb-2">All hashes for {current.name}</div>
                {ALGOS.map(([id, label]) => (
                  <div key={id} className="flex items-center gap-2 py-1">
                    <span className="text-[11.5px] font-semibold w-[54px]" style={{ color: 'var(--muted)' }}>{label}</span>
                    <span className="mono text-[10.5px] break-all flex-1">{current.hashes[id]}</span>
                    <CopyBtn text={current.hashes[id]} label="" small />
                  </div>
                ))}
              </div>}
            </Panel>
          </div>
        )
      )}

      {tab === 'verify' && (
        <Panel>
          <Label>Quick verify</Label>
          <div className="text-[13px] mb-4" style={{ color: 'var(--muted)' }}>Drop the file you downloaded and paste the checksum the publisher printed. SHA-256 is compared when the pasted value is 64 characters, MD5 at 32, CRC-32 at 8.</div>
          <Drop onFiles={(fs) => add(fs).then((n) => { setTarget(n[0].id); run(n) })} label="Drop the downloaded file" sub="Hashed instantly, then judged against the box below" compact />
          <textarea className="input w-full h-20 mono text-[11.5px] mt-4" placeholder="Published checksum" value={expected} onChange={(e) => setExpected(e.target.value)} />
          {verdict && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-2xl border p-4" style={{ borderColor: verdict.v === 'match' ? '#4E937A' : '#C3423F', background: `color-mix(in srgb, ${verdict.v === 'match' ? '#4E937A' : '#C3423F'} 10%, var(--surface))` }}>
              <div className="display font-semibold text-[15px]">{verdict.v === 'match' ? '✓ Match — the file is exactly what was published' : '✗ Mismatch — do not trust this file'}</div>
              <div className="text-[11.5px] mono mt-1 break-all" style={{ color: 'var(--muted)' }}>{verdict.algo} · {verdict.got}</div>
            </motion.div>
          )}
        </Panel>
      )}

      {tab === 'compare' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1].map((slot) => (
            <Panel key={slot} delay={slot * 0.05}>
              <Label right={pair[slot]?.hashing ? <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>hashing…</span> : null}>File {slot + 1}</Label>
              <Drop onFiles={(fs) => setPairFile(slot, fs)} label={pair[slot]?.name || 'Drop a file'} sub={pair[slot] ? fmtBytes(pair[slot].size) : 'or click to browse'} compact />
              {pair[slot]?.hashes && (
                <div className="mt-3 space-y-1">
                  <div className="mono text-[10.5px] break-all">SHA-256 {pair[slot].hashes.sha256}</div>
                  <div className="mono text-[10.5px] break-all" style={{ color: 'var(--muted)' }}>MD5 {pair[slot].hashes.md5}</div>
                </div>
              )}
            </Panel>
          ))}
          <div className="sm:col-span-2">
            <AnimatePresence mode="wait">
              {same !== null && pair[0]?.hashes && pair[1]?.hashes && (
                <motion.div key={String(same)} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={SPRING}
                  className="rounded-[24px] border p-6 text-center" style={{ borderColor: same ? '#4E937A' : '#C3423F', background: `color-mix(in srgb, ${same ? '#4E937A' : '#C3423F'} 9%, var(--surface))` }}>
                  <div className="display font-semibold text-[20px]">{same ? 'Byte-for-byte identical' : 'Different files'}</div>
                  <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>{same ? 'The SHA-256 digests match exactly.' : 'The SHA-256 digests differ — even a one-byte change makes them differ.'}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
      <Toast msg={msg} />
    </div>
  )
}
