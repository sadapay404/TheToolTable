import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Dock, Swap, Btn, KIco, SPRING, usePref, useToast, save, Panel, Seg } from './kit/ui.jsx'
import { blank, nextNumber, totals, money, TYPES } from '../lib/invoice/calc.js'
import { layout } from '../lib/invoice/layout.js'
import { drawPage, loadImg, toPdf } from '../lib/invoice/render.js'
import { Details, Items, Style, Saved } from './invoice/forms.jsx'

const TABS = [['details', 'Details', 'user'], ['items', 'Items & totals', 'list'], ['style', 'Look', 'palette'], ['saved', 'Saved', 'folder']]
function Page({ ops, size, imgs }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) drawPage(ref.current, ops, size, imgs, 1.7) }, [ops, size, imgs])
  return <canvas ref={ref} className="w-full block rounded-lg" style={{ boxShadow: '0 22px 50px -24px rgba(0,0,0,.45), 0 0 0 1px var(--border)', background: '#fff' }} />
}

export default function InvoiceStudio() {
  const [tab, setTab] = useState('details'), [inv, setInv] = usePref('inv', 'draft', null), [lib, setLib] = usePref('inv', 'lib', []), [clients, setClients] = usePref('inv', 'clients', [])
  const [imgs, setImgs] = useState({}), [toast, toastNode] = useToast(), [busy, setBusy] = useState(false), [pg, setPg] = useState(0)
  const cur = inv || blank()
  useEffect(() => { if (!inv) setInv(blank()) }, [])
  const set = useCallback((p) => setInv((x) => ({ ...(x || blank()), ...p })), [setInv])
  useEffect(() => { let dead = false; Promise.all([loadImg(cur.style.logo), loadImg(cur.style.sign)]).then(([logo, sign]) => !dead && setImgs({ logo, sign })); return () => { dead = true } }, [cur.style.logo, cur.style.sign])
  const [ver, setVer] = useState(0); useEffect(() => { document.fonts?.ready.then(() => setVer((v) => v + 1)) }, [])
  const res = useMemo(() => layout(cur, imgs), [cur, imgs, ver])
  useEffect(() => { if (pg >= res.pages.length) setPg(0) }, [res.pages.length])
  const t = res.totals, T = TYPES[cur.type]
  const name = `${T.label}_${(cur.number || 'draft').replace(/[^\w-]+/g, '_')}`
  const pdf = async () => { setBusy(true); try { save(await toPdf(res, imgs, { title: `${T.label} ${cur.number}` }), name + '.pdf'); toast('PDF saved') } catch (e) { toast('Could not build the PDF: ' + (e.message || e), 'err') } finally { setBusy(false) } }
  const png = () => { const c = document.createElement('canvas'); drawPage(c, res.pages[0], res.size, imgs, 2.5); c.toBlob((b) => save(b, name + '.png')) }
  const doSave = (status) => {
    const d = { ...cur, status: status || cur.status }; setInv(d); setLib((l) => [d, ...l.filter((x) => x.id !== d.id)])
    if (d.to.name) setClients((c) => [d.to, ...c.filter((x) => x.name !== d.to.name)].slice(0, 20)); toast(status === 'paid' ? 'Saved and marked as paid' : 'Saved')
  }
  const fresh = () => { const prev = lib.find((x) => x.id === cur.id) || cur; setInv(blank({ type: cur.type, number: nextNumber(prev.number), cur: cur.cur, decimals: cur.decimals, grouping: cur.grouping, from: cur.from, style: cur.style, payment: cur.payment, terms: cur.terms, notes: cur.notes, taxName: cur.taxName, taxRate: cur.taxRate, taxMode: cur.taxMode })); setTab('details'); toast('New document ready') }
  const dup = (i) => { setInv({ ...i, id: Math.random().toString(36).slice(2, 9), number: nextNumber(i.number), status: 'draft', created: Date.now() }); setTab('details'); toast('Duplicated as a new draft') }
  const exportAll = () => save(new Blob([JSON.stringify({ app: 'TheToolTable-invoices', lib, clients }, null, 1)], { type: 'application/json' }), 'invoices-backup.json')
  const importAll = async (f) => { try { const j = JSON.parse(await f.text()); setLib((l) => [...(j.lib || []), ...l.filter((x) => !(j.lib || []).some((y) => y.id === x.id))]); setClients((c) => [...(j.clients || []), ...c].slice(0, 30)); toast('Backup restored') } catch { toast('That file is not a valid backup', 'err') } }

  return (
    <div className="space-y-6">
      <Dock value={tab} onChange={setTab} items={TABS} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-start">
        <Swap k={tab}>
          {tab === 'details' && <Details inv={cur} set={set} clients={clients} />}
          {tab === 'items' && <Items inv={cur} set={set} />}
          {tab === 'style' && <Style inv={cur} set={set} />}
          {tab === 'saved' && <Saved lib={lib} current={cur.id} load={(i) => { setInv(i); setTab('details') }} dup={dup} del={(id) => setLib((l) => l.filter((x) => x.id !== id))} exportAll={exportAll} importAll={importAll} />}
        </Swap>
        <div className="lg:sticky lg:top-4 space-y-3">
          <Panel pad={false} className="p-4" delay={0.1}>
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div><div className="eyebrow">{T.label} total</div><div className="display font-semibold text-[28px] tabular-nums leading-tight">{money(t.total, cur)}</div></div>
              {res.pages.length > 1 && <Seg small value={pg} onChange={setPg} options={res.pages.map((_, i) => [i, `Page ${i + 1}`])} />}
            </div>
            <motion.div key={pg} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING}><Page ops={res.pages[pg] || res.pages[0]} size={res.size} imgs={imgs} /></motion.div>
            <div className="flex flex-wrap gap-2 mt-4"><Btn primary icon="pdf" busy={busy} onClick={pdf}>Download PDF</Btn><Btn icon="image" onClick={png}>PNG</Btn><Btn icon="save" onClick={() => doSave()}>Save</Btn>{['invoice', 'proforma'].includes(cur.type) && <Btn small icon="check" onClick={() => doSave('paid')}>Save as paid</Btn>}<Btn small icon="plus" onClick={fresh}>New</Btn></div>
          </Panel>
        </div>
      </div>
      {toastNode}
    </div>
  )
}
