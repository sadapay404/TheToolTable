import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Btn, KIco, SPRING, Empty, Bar } from '../kit/ui.jsx'
import { Thumb } from './shared.jsx'
import { buildOrganized, extractPages } from '../../lib/pdf/engine.js'

export default function Organize({ docs, pages, setPages, publish, toast }) {
  const [sel, setSel] = useState(new Set()), [drag, setDrag] = useState(null), [busy, setBusy] = useState(0)
  const byId = new Map(docs.map((d) => [d.id, d]))
  const upd = (fn) => setPages((p) => fn(p))
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const act = (ids, fn) => upd((p) => p.map((x) => (ids.has(x.id) ? fn(x) : x)))
  const ids = sel.size ? sel : new Set(pages.map((p) => p.id))
  const move = (i, d) => upd((p) => { const a = [...p], j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a })
  const drop = (to) => { if (drag == null || drag === to) return; upd((p) => { const a = [...p], [m] = a.splice(drag, 1); a.splice(to, 0, m); return a }); setDrag(null) }
  const uid = () => Math.random().toString(36).slice(2, 9)
  const run = async (fn, name, note) => { setBusy(0.02); try { const bytes = await fn(); publish(bytes, name, note, true) } catch (e) { toast(e.message || 'Failed', 'err') } finally { setBusy(0) } }
  const exportAll = () => run(() => buildOrganized(docs, pages, setBusy), docs.length > 1 ? 'merged.pdf' : (docs[0]?.name || 'document').replace(/\.pdf$/i, '') + '_edited.pdf', `${pages.length} pages`)
  const exportSel = () => run(() => buildOrganized(docs, pages.filter((p) => sel.has(p.id)), setBusy), 'extracted_pages.pdf', `${sel.size} pages extracted`)
  if (!pages.length) return <Panel><Empty icon="layers" title="No pages yet" sub="Add PDFs above. Several files merge into one; drag pages to reorder." /></Panel>
  return (
    <div className="space-y-4">
      <Panel pad={false} className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold mr-1" style={{ color: 'var(--muted)' }}>{sel.size ? `${sel.size} selected` : `${pages.length} pages`}</span>
          <Btn small icon="check" onClick={() => setSel(sel.size === pages.length ? new Set() : new Set(pages.map((p) => p.id)))}>{sel.size === pages.length ? 'None' : 'All'}</Btn>
          <Btn small icon="rotate" onClick={() => act(ids, (x) => ({ ...x, rot: (x.rot + 90) % 360 }))}>Rotate</Btn>
          <Btn small icon="copy" disabled={!sel.size} onClick={() => { upd((p) => p.flatMap((x) => (sel.has(x.id) ? [x, { ...x, id: uid() }] : [x]))); setSel(new Set()) }}>Duplicate</Btn>
          <Btn small icon="plus" onClick={() => upd((p) => { const i = p.findIndex((x) => sel.has(x.id)); const a = [...p]; a.splice(i < 0 ? a.length : i + 1, 0, { id: uid(), blank: true, rot: 0, w: 595.28, h: 841.89 }); return a })}>Blank page</Btn>
          <Btn small icon="arrowDown" onClick={() => upd((p) => [...p].reverse())}>Reverse</Btn>
          <Btn small icon="trash" danger disabled={!sel.size} onClick={() => { upd((p) => p.filter((x) => !sel.has(x.id))); setSel(new Set()) }}>Delete</Btn>
          <span className="flex-1" />
          <Btn small icon="scissors" disabled={!sel.size} onClick={exportSel}>Extract selected</Btn>
          <Btn primary icon="download" busy={busy > 0} onClick={exportAll} disabled={!pages.length}>Build PDF</Btn>
        </div>
        {busy > 0 && <div className="mt-3"><Bar value={busy * 100} label="Assembling pages — originals are copied, never recompressed" /></div>}
      </Panel>
      <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        <AnimatePresence initial={false}>
          {pages.map((p, i) => { const d = byId.get(p.docId), on = sel.has(p.id); return (
            <motion.div key={p.id} layout transition={SPRING} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: drag === i ? 0.4 : 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)} onDragEnd={() => setDrag(null)}
              onClick={() => toggle(p.id)} className="group relative rounded-2xl p-2.5 cursor-grab border" style={{ background: 'var(--surface)', borderColor: on ? 'var(--copper)' : 'var(--border)', boxShadow: on ? '0 0 0 3px color-mix(in srgb, var(--copper) 28%, transparent)' : 'var(--shadow)' }}>
              {p.blank ? <div className="rounded-lg grid place-items-center text-[11px] font-semibold" style={{ aspectRatio: '0.72', background: '#fff', color: '#bbb', boxShadow: '0 1px 6px rgba(0,0,0,.15)', transform: `rotate(${p.rot}deg)` }}>Blank</div> : <Thumb doc={d} idx={p.src} rot={p.rot} />}
              <div className="flex items-center justify-between mt-2 px-0.5">
                <span className="mono text-[11px] font-bold px-1.5 rounded" style={{ background: 'var(--surface2)' }}>{i + 1}</span>
                <span className="text-[10.5px] truncate max-w-[70px]" style={{ color: 'var(--muted)' }}>{p.blank ? 'blank' : `${(d?.name || '').slice(0, 10)} · ${p.src + 1}`}</span>
                <span className="flex gap-0.5 opacity-70 group-hover:opacity-100">
                  <button type="button" aria-label="Move left" onClick={(e) => { e.stopPropagation(); move(i, -1) }} className="w-5 h-5 grid place-items-center"><KIco n="arrowRight" s={12} style={{ transform: 'rotate(180deg)' }} /></button>
                  <button type="button" aria-label="Move right" onClick={(e) => { e.stopPropagation(); move(i, 1) }} className="w-5 h-5 grid place-items-center"><KIco n="arrowRight" s={12} /></button>
                </span>
              </div>
              <motion.div initial={false} animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }} transition={SPRING} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full grid place-items-center text-white" style={{ background: 'var(--copper)' }}><KIco n="check" s={13} w={2.6} /></motion.div>
            </motion.div>) })}
        </AnimatePresence>
      </div>
    </div>
  )
}
