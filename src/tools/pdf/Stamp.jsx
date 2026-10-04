import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Btn, Range, Field, Switch, Empty, Bar, KIco, SPRING, usePref } from '../kit/ui.jsx'
import { DocSelect } from './shared.jsx'
import { applyMarks, extractPages, renderCanvas, parseRanges, rangeToIdx, forget } from '../../lib/pdf/engine.js'

const POS = [['top-left', 'Top left'], ['top-center', 'Top'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom'], ['bottom-right', 'Bottom right']]
const DEF = { wm: { on: true, kind: 'text', text: 'CONFIDENTIAL', size: 64, opacity: 0.22, angle: 35, color: '#B4715A', tile: false, scale: 1 }, num: { on: false, pos: 'bottom-center', fmt: 'Page {n} of {N}', start: 1, size: 10, color: '#444444' }, hf: { header: '', footer: '', size: 10, color: '#444444' }, rangeTxt: '' }

export default function Stamp({ docs, active, setActive, publish, toast }) {
  const doc = docs.find((d) => d.id === active) || docs[0]
  const [o, setO] = usePref('pdf', 'stamp', DEF), [img, setImg] = useState(null), [pg, setPg] = useState(0), [busy, setBusy] = useState(0), [prev, setPrev] = useState(null)
  const w = (k, v) => setO((x) => ({ ...x, wm: { ...x.wm, [k]: v } })), n = (k, v) => setO((x) => ({ ...x, num: { ...x.num, [k]: v } })), h = (k, v) => setO((x) => ({ ...x, hf: { ...x.hf, [k]: v } }))
  const opts = (range) => ({ wm: { ...o.wm, image: o.wm.kind === 'image' ? img : null }, num: o.num, hf: o.hf, range })
  useEffect(() => { setPg(0) }, [doc?.id])
  useEffect(() => {
    if (!doc) return
    let dead = false; const t = setTimeout(async () => {
      try {
        const one = await extractPages(doc, [Math.min(pg, doc.pages - 1)]), out = await applyMarks(one, opts(null), { pageOnly: 0, labelIndex: pg, total: doc.pages })
        const tmp = { id: 'pv' + Math.random(), bytes: out }, c = await renderCanvas(tmp, 0, { width: 520 }); forget(tmp.id)
        if (!dead) setPrev(c.toDataURL('image/jpeg', 0.9))
      } catch (e) { if (!dead) setPrev(null) }
    }, 300)
    return () => { dead = true; clearTimeout(t) }
  }, [doc?.id, pg, o, img])
  if (!doc) return <Panel><Empty icon="stamp" title="Add a PDF first" sub="Watermark it, number the pages, or add a header and footer. Urdu and other scripts work too." /></Panel>
  const run = async () => {
    let range = null
    if (o.rangeTxt.trim()) { const r = parseRanges(o.rangeTxt, doc.pages); if (r.error) return toast(r.error, 'err'); range = new Set(rangeToIdx(r.ranges)) }
    setBusy(0.5)
    try { const b = await applyMarks(doc.bytes, opts(range), {}); publish(b, doc.name.replace(/\.pdf$/i, '') + '_stamped.pdf', 'Marks applied', true) } catch (e) { toast(e.message || 'Failed', 'err') } finally { setBusy(0) }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] items-start">
      <div className="space-y-5">
        <DocSelect docs={docs} value={doc.id} onChange={setActive} />
        <Panel>
          <Switch on={o.wm.on} onChange={(v) => w('on', v)} label="Watermark" hint="Text or your logo across every page" />
          <AnimatePresence initial={false}>{o.wm.on && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="pt-4 space-y-4">
              <Seg small value={o.wm.kind} onChange={(v) => w('kind', v)} options={[['text', 'Text'], ['image', 'Image / logo']]} />
              {o.wm.kind === 'text' ? <><Field label="Text"><input className="input" value={o.wm.text} onChange={(e) => w('text', e.target.value)} /></Field><Range label="Size" min={16} max={180} value={o.wm.size} onChange={(v) => w('size', v)} /></> :
                <><Field label="Logo (PNG or JPG)"><input type="file" accept="image/png,image/jpeg" className="input" onChange={(e) => setImg(e.target.files[0] || null)} /></Field><Range label="Size" min={0.3} max={1.6} step={0.05} value={o.wm.scale} onChange={(v) => w('scale', v)} fmt={(v) => Math.round(v * 100) + '%'} /></>}
              <div className="grid sm:grid-cols-2 gap-4"><Range label="Opacity" min={0.05} max={1} step={0.01} value={o.wm.opacity} onChange={(v) => w('opacity', v)} fmt={(v) => Math.round(v * 100) + '%'} /><Range label="Angle" min={-90} max={90} value={o.wm.angle} onChange={(v) => w('angle', v)} fmt={(v) => v + '°'} /></div>
              <div className="flex items-center gap-4"><Field label="Colour"><input type="color" value={o.wm.color} onChange={(e) => w('color', e.target.value)} className="w-14 h-9 rounded-lg border border-line" /></Field><div className="flex-1"><Switch on={o.wm.tile} onChange={(v) => w('tile', v)} label="Repeat across page" /></div></div>
            </div></motion.div>)}</AnimatePresence>
        </Panel>
        <Panel delay={0.06}>
          <Switch on={o.num.on} onChange={(v) => n('on', v)} label="Page numbers" />
          <AnimatePresence initial={false}>{o.num.on && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="pt-4 space-y-4">
              <Field label="Position"><div className="grid grid-cols-3 gap-1.5">{POS.map(([k, l]) => <button key={k} type="button" onClick={() => n('pos', k)} className="rounded-xl py-2 text-[11.5px] font-semibold border" style={{ background: o.num.pos === k ? 'var(--ink)' : 'var(--surface)', color: o.num.pos === k ? 'var(--bg)' : 'var(--ink)', borderColor: 'var(--border)' }}>{l}</button>)}</div></Field>
              <Field label="Format" hint="{n} = page number, {N} = last page number"><input className="input" value={o.num.fmt} onChange={(e) => n('fmt', e.target.value)} /></Field>
              <div className="flex flex-wrap gap-1.5">{['{n}', 'Page {n}', 'Page {n} of {N}', '- {n} -'].map((f) => <button key={f} type="button" onClick={() => n('fmt', f)} className="chip">{f}</button>)}</div>
              <div className="grid sm:grid-cols-2 gap-4"><Range label="Start at" min={0} max={50} value={o.num.start} onChange={(v) => n('start', v)} /><Range label="Size" min={7} max={24} value={o.num.size} onChange={(v) => n('size', v)} /></div>
            </div></motion.div>)}</AnimatePresence>
        </Panel>
        <Panel delay={0.1}>
          <Label>Header &amp; footer</Label>
          <div className="grid sm:grid-cols-2 gap-4"><Field label="Header text"><input className="input" value={o.hf.header} onChange={(e) => h('header', e.target.value)} placeholder="e.g. Company name" /></Field><Field label="Footer text"><input className="input" value={o.hf.footer} onChange={(e) => h('footer', e.target.value)} placeholder="e.g. Confidential" /></Field></div>
        </Panel>
      </div>
      <div className="lg:sticky lg:top-4 space-y-4">
        <Panel>
          <Label right={<span className="mono text-[11.5px]">{pg + 1} / {doc.pages}</span>}>Live preview</Label>
          <div className="rounded-xl overflow-hidden grid place-items-center" style={{ background: 'var(--surface2)', minHeight: 280 }}>
            <AnimatePresence mode="wait" initial={false}>{prev ? <motion.img key={prev.slice(-30)} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} src={prev} alt="Preview" className="w-full" style={{ boxShadow: '0 4px 18px rgba(0,0,0,.2)' }} /> : <motion.div key="l" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}><KIco n="pdf" s={30} /></motion.div>}</AnimatePresence>
          </div>
          <div className="flex items-center justify-between mt-3"><Btn small icon="arrowRight" onClick={() => setPg((p) => Math.max(0, p - 1))} className="[&_svg]:rotate-180" disabled={pg === 0}>Prev</Btn><Btn small icon="arrowRight" onClick={() => setPg((p) => Math.min(doc.pages - 1, p + 1))} disabled={pg >= doc.pages - 1}>Next</Btn></div>
        </Panel>
        <Panel delay={0.08}>
          <Field label="Apply to pages" hint="Empty = every page"><input className="input" value={o.rangeTxt} onChange={(e) => setO((x) => ({ ...x, rangeTxt: e.target.value }))} placeholder="e.g. 1-3, 5-" /></Field>
          <Btn primary className="w-full mt-4" icon="stamp" busy={busy > 0} onClick={run}>Apply &amp; build PDF</Btn>
        </Panel>
      </div>
    </div>
  )
}
