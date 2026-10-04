import React, { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Panel, Label, Seg, Btn, Range, Field, Bar, Empty, CountText } from '../kit/ui.jsx'
import { DocSelect } from './shared.jsx'
import { parseRanges, rangeToIdx, extractPages, zipFiles } from '../../lib/pdf/engine.js'

export default function Split({ docs, active, setActive, publish, toast }) {
  const doc = docs.find((d) => d.id === active) || docs[0]
  const [mode, setMode] = useState('ranges'), [txt, setTxt] = useState('1-3, 4-'), [n, setN] = useState(2), [busy, setBusy] = useState(0), [merge, setMerge] = useState(false)
  const plan = useMemo(() => {
    if (!doc) return { parts: [] }
    if (mode === 'each') return { parts: Array.from({ length: doc.pages }, (_, i) => [[i, i]]) }
    if (mode === 'every') { const p = []; for (let i = 0; i < doc.pages; i += n) p.push([[i, Math.min(doc.pages - 1, i + n - 1)]]); return { parts: p } }
    const r = parseRanges(txt, doc.pages); if (r.error) return { error: r.error, parts: [] }
    return { parts: merge ? [r.ranges] : r.ranges.map((x) => [x]) }
  }, [doc, mode, txt, n, merge])
  if (!doc) return <Panel><Empty icon="split" title="Add a PDF first" sub="Drop one above to split it by ranges, by count or page-by-page." /></Panel>
  const base = doc.name.replace(/\.pdf$/i, '')
  const label = (rs) => rs.map(([a, b]) => (a === b ? a + 1 : `${a + 1}-${b + 1}`)).join('_')
  const run = async () => {
    setBusy(0.03)
    try {
      const files = []
      for (let i = 0; i < plan.parts.length; i++) { files.push([`${base}_pages_${label(plan.parts[i])}.pdf`, await extractPages(doc, rangeToIdx(plan.parts[i]))]); setBusy((i + 1) / plan.parts.length) }
      if (files.length === 1) publish(files[0][1], files[0][0], '1 file')
      else publish(zipFiles(files), `${base}_split.zip`, `${files.length} PDFs`, false)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(0) }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <Panel>
        <Label>How to split</Label>
        <Seg value={mode} onChange={setMode} options={[['ranges', 'Page ranges'], ['every', 'Every N pages'], ['each', 'Each page']]} />
        <div className="mt-5 space-y-4">
          <DocSelect docs={docs} value={doc.id} onChange={setActive} />
          {mode === 'ranges' && <>
            <Field label={`Pages in “${doc.name}” — ${doc.pages} total`} hint="Each range becomes its own PDF. Examples: 1-3, 5, 8-  ·  all"><input className="input" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="1-3, 5, 8-" /></Field>
            <label className="flex items-center gap-2 text-[13px] font-semibold cursor-pointer"><input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} /> Combine all ranges into one PDF (extract pages)</label>
          </>}
          {mode === 'every' && <Range label="Pages per file" min={1} max={Math.max(2, Math.min(50, doc.pages))} value={n} onChange={setN} />}
          {mode === 'each' && <div className="text-[13px]" style={{ color: 'var(--muted)' }}>Every page becomes a separate PDF.</div>}
          {plan.error && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] font-semibold" style={{ color: '#C3423F' }}>{plan.error}</motion.div>}
        </div>
      </Panel>
      <Panel delay={0.08}>
        <Label>Result</Label>
        <div className="text-center py-3"><div className="display font-semibold text-[56px] leading-none"><CountText value={plan.parts.length} format={(v) => Math.round(v)} /></div><div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>{plan.parts.length === 1 ? 'PDF file' : 'PDF files'}{plan.parts.length > 1 ? ' · delivered as a ZIP' : ''}</div></div>
        <div className="flex flex-wrap gap-1.5 justify-center max-h-24 overflow-auto my-3">{plan.parts.slice(0, 40).map((p, i) => <motion.span key={i} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }} className="mono text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)' }}>{label(p).replace(/_/g, '+')}</motion.span>)}</div>
        {busy > 0 && <Bar value={busy * 100} label="Splitting" />}
        <div className="mt-4 flex justify-center"><Btn primary icon="split" busy={busy > 0} disabled={!plan.parts.length} onClick={run}>Split PDF</Btn></div>
      </Panel>
    </div>
  )
}
