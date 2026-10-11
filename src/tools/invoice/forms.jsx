import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Chips, Btn, Field, KIco, SPRING, Switch, Empty } from '../kit/ui.jsx'
import { TYPES, CURRENCIES, num, totals, money } from '../../lib/invoice/calc.js'
import { MAX_INVOICE_ITEMS } from '../../lib/invoice/normalize.js'

const I = ({ v, on, ph, type = 'text', cls = '', a, ...r }) => <input aria-label={a || ph} className={`input ${cls}`} type={type} value={v ?? ''} placeholder={ph} onChange={(e) => on(e.target.value)} {...r} />
const T = ({ v, on, ph, rows = 3, a }) => <textarea aria-label={a || ph} dir="auto" className="input w-full" rows={rows} value={v ?? ''} placeholder={ph} onChange={(e) => on(e.target.value)} />
const party = (inv, set, k, title, who) => (
  <Panel delay={0.05}>
    <Label>{title}</Label>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label={who === 'from' ? 'Business name' : 'Client name'}><I v={inv[k].name} on={(v) => set({ [k]: { ...inv[k], name: v } })} ph={who === 'from' ? 'Mubashir Studio' : 'Client or company'} /></Field></div>
      <div className="sm:col-span-2"><Field label="Address"><T rows={2} v={inv[k].address} on={(v) => set({ [k]: { ...inv[k], address: v } })} /></Field></div>
      <Field label="Email"><I v={inv[k].email} on={(v) => set({ [k]: { ...inv[k], email: v } })} /></Field>
      <Field label="Phone"><I v={inv[k].phone} on={(v) => set({ [k]: { ...inv[k], phone: v } })} /></Field>
      <div className="sm:col-span-2"><Field label="Tax / NTN / VAT number"><I v={inv[k].taxId} on={(v) => set({ [k]: { ...inv[k], taxId: v } })} /></Field></div>
    </div>
  </Panel>
)
export function Details({ inv, set, clients }) {
  const T0 = TYPES[inv.type]
  return (
    <div className="space-y-4">
      <Panel>
        <Label>Document</Label>
        <Chips value={inv.type} onChange={(v) => set({ type: v })} options={Object.entries(TYPES).map(([k, t]) => [k, t.label])} />
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <Field label={T0.no}><I v={inv.number} on={(v) => set({ number: v })} /></Field>
          <Field label="Reference / PO"><I v={inv.ref} on={(v) => set({ ref: v })} /></Field>
          <Field label="Date"><I type="date" v={inv.issue} on={(v) => set({ issue: v })} /></Field>
          {T0.due && <Field label={T0.dueLabel || 'Due date'}><I type="date" v={inv.due} on={(v) => set({ due: v })} /></Field>}
          <Field label="Currency"><select className="input" value={inv.cur} onChange={(e) => set({ cur: e.target.value })}>{CURRENCIES.map(([c, , n]) => <option key={c} value={c}>{c} — {n}</option>)}</select></Field>
          <Field label="Number style"><select className="input" value={inv.grouping} onChange={(e) => set({ grouping: e.target.value })}><option value="intl">1,234,567</option><option value="sa">12,34,567 (lakh)</option></select></Field>
        </div>
      </Panel>
      {party(inv, set, 'from', 'From — your business', 'from')}
      {party(inv, set, 'to', 'Bill to — your client', 'to')}
      {clients.length > 0 && <Panel delay={0.1}><Label>Saved clients</Label><div className="flex flex-wrap gap-2">{clients.map((c) => <Btn key={c.name} small icon="user" onClick={() => set({ to: c })}>{c.name}</Btn>)}</div></Panel>}
    </div>
  )
}
export function Items({ inv, set }) {
  const upd = (id, p) => set({ items: inv.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const t = totals(inv)
  return (
    <div className="space-y-4">
      <Panel>
        <Label right={<span className="text-[12px] font-semibold tabular-nums">{inv.items.length} line{inv.items.length === 1 ? '' : 's'}</span>}>Line items</Label>
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {inv.items.map((it, i) => (
              <motion.div key={it.id} layout="position" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} transition={SPRING} className="rounded-2xl border border-line p-3" style={{ background: 'var(--surface2)' }}>
                <div className="flex gap-2 items-start"><span className="mono text-[11px] font-bold mt-3 w-4" style={{ color: 'var(--muted)' }}>{i + 1}</span><div className="flex-1"><T rows={2} v={it.desc} on={(v) => upd(it.id, { desc: v })} ph="Description of work or product" /></div>
                  <Btn small icon="trash" danger title="Remove line" disabled={inv.items.length < 2} onClick={() => set({ items: inv.items.filter((x) => x.id !== it.id) })} /></div>
                <div className="grid grid-cols-3 gap-2 mt-2 pl-6">
                  <Field label="Qty"><I type="number" min="0" v={it.qty} on={(v) => upd(it.id, { qty: v })} inputMode="decimal" /></Field>
                  <Field label="Rate"><I type="number" min="0" v={it.price} on={(v) => upd(it.id, { price: v })} inputMode="decimal" /></Field>
                  <div><span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Amount</span><div className="display font-semibold text-[18px] pt-1.5 tabular-nums">{money(num(it.qty) * num(it.price), inv, false)}</div></div>
                </div>
              </motion.div>))}
          </AnimatePresence>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap"><Btn icon="plus" disabled={inv.items.length >= MAX_INVOICE_ITEMS} onClick={() => set({ items: [...inv.items, { id: Math.random().toString(36).slice(2, 8), desc: '', qty: 1, price: 0 }] })}>Add line</Btn><Btn small icon="copy" disabled={inv.items.length >= MAX_INVOICE_ITEMS} onClick={() => { const l = inv.items.at(-1); set({ items: [...inv.items, { ...l, id: Math.random().toString(36).slice(2, 8) }] }) }}>Duplicate last</Btn>{inv.items.length >= MAX_INVOICE_ITEMS && <span className="self-center text-[11px]" style={{ color: 'var(--muted)' }}>Maximum {MAX_INVOICE_ITEMS} lines</span>}</div>
      </Panel>
      <Panel delay={0.05}>
        <Label>Adjustments</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={inv.discType === 'pct' ? 'Discount %' : 'Discount amount'}><div className="flex gap-2"><I type="number" min="0" v={inv.disc} on={(v) => set({ disc: v })} inputMode="decimal" /><select className="input !w-[84px]" value={inv.discType} onChange={(e) => set({ discType: e.target.value })}><option value="pct">%</option><option value="flat">flat</option></select></div></Field>
          <Field label="Shipping / extra"><I type="number" min="0" v={inv.shipping} on={(v) => set({ shipping: v })} inputMode="decimal" /></Field>
          <Field label="Tax name"><I v={inv.taxName} on={(v) => set({ taxName: v })} ph="GST, VAT, WHT…" /></Field>
          <Field label="Tax rate %"><I type="number" min="0" v={inv.taxRate} on={(v) => set({ taxRate: v })} inputMode="decimal" /></Field>
          <div className="sm:col-span-2"><Chips value={inv.taxMode} onChange={(v) => set({ taxMode: v })} options={[['add', 'Tax added on top'], ['included', 'Prices include tax']]} small /></div>
          {['invoice', 'proforma', 'receipt'].includes(inv.type) && <Field label={inv.type === 'receipt' ? 'Amount received (blank = full)' : 'Amount already paid'}><I type="number" min="0" v={inv.paid} on={(v) => set({ paid: v })} inputMode="decimal" /></Field>}
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3"><span className="eyebrow">Total</span><span className="display font-semibold text-[26px] tabular-nums">{money(t.total, inv)}</span></div>
      </Panel>
      <Panel delay={0.1}>
        <Label>Notes, terms & payment</Label>
        <div className="space-y-3"><Field label="Notes"><T rows={2} v={inv.notes} on={(v) => set({ notes: v })} /></Field><Field label="Terms"><T rows={2} v={inv.terms} on={(v) => set({ terms: v })} ph="Payment due within 14 days…" /></Field><Field label="Payment details"><T rows={3} v={inv.payment} on={(v) => set({ payment: v })} ph={'Bank: …\nIBAN: PK…\nAccount title: …'} /></Field>
          <Switch on={inv.words} onChange={(v) => set({ words: v })} label="Show amount in words" hint="Printed under the totals, e.g. “Twelve thousand five hundred rupees only”" />
          <Field label="Signer name (optional)"><I v={inv.signName} on={(v) => set({ signName: v })} /></Field></div>
      </Panel>
    </div>
  )
}
function SignPad({ onDone }) {
  const cv = useRef(null), down = useRef(false)
  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * cv.current.width, ((e.clientY - r.top) / r.height) * cv.current.height] }
  return (
    <div>
      <canvas ref={cv} width={600} height={180} className="w-full rounded-2xl border border-line" style={{ background: '#fff', touchAction: 'none' }}
        onPointerDown={(e) => { down.current = true; const c = cv.current.getContext('2d'); c.lineWidth = 4; c.lineCap = 'round'; c.strokeStyle = '#14213d'; c.beginPath(); c.moveTo(...pos(e)); cv.current.setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (!down.current) return; const c = cv.current.getContext('2d'); c.lineTo(...pos(e)); c.stroke() }} onPointerUp={() => { down.current = false }} />
      <div className="flex gap-2 mt-2"><Btn small primary icon="check" onClick={() => { const c = cv.current, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break } if (any) onDone(c.toDataURL('image/png')) }}>Use signature</Btn><Btn small onClick={() => cv.current.getContext('2d').clearRect(0, 0, 600, 180)}>Clear</Btn></div>
    </div>
  )
}
const MAX_INVOICE_IMAGE_FILE_BYTES = 20 * 1024 * 1024
const MAX_INVOICE_IMAGE_PIXELS = 40_000_000
const small = (file, max, type) => new Promise((res, rej) => {
  if (!file || file.size > MAX_INVOICE_IMAGE_FILE_BYTES) return rej(new RangeError('Choose an image smaller than 20 MB.'))
  const u = URL.createObjectURL(file), i = new Image()
  const release = () => URL.revokeObjectURL(u)
  i.onload = () => {
    release()
    const w = i.naturalWidth, h = i.naturalHeight
    if (!w || !h || w * h > MAX_INVOICE_IMAGE_PIXELS) return rej(new RangeError('That image is too large to use in a document.'))
    try {
      const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s))
      c.getContext('2d').drawImage(i, 0, 0, c.width, c.height)
      res(c.toDataURL(type))
    } catch { rej(new Error('Could not process that image. Try a PNG or JPEG.')) }
  }
  i.onerror = () => { release(); rej(new Error('Could not read that image.')) }
  i.src = u
})
const SW = ['#B4715A', '#1F4E79', '#0F766E', '#6D28D9', '#B91C1C', '#1D1A17', '#CA8A04', '#BE185D']
export function Style({ inv, set }) {
  const st = inv.style, ss = (p) => set({ style: { ...st, ...p } }), [pad, setPad] = useState(false), [uploadErr, setUploadErr] = useState('')
  const up = (k, max, type) => (e) => {
    const f = e.target.files[0]
    if (f) small(f, max, type).then((d) => { setUploadErr(''); ss({ [k]: d }) }).catch((err) => setUploadErr(err.message || 'Could not use that image.'))
    e.target.value = ''
  }
  return (
    <div className="space-y-4">
      <Panel>
        <Label>Template</Label>
        <div className="grid grid-cols-3 gap-3">
          {[['classic', 'Classic'], ['modern', 'Modern'], ['minimal', 'Minimal']].map(([k, l]) => (
            <motion.button key={k} type="button" whileHover={{ y: -4 }} whileTap={{ scale: 0.95 }} onClick={() => ss({ tpl: k })} className="rounded-2xl border-2 p-2 text-center" style={{ borderColor: st.tpl === k ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}>
              <div className="rounded-lg overflow-hidden mb-2 aspect-[3/4] relative" style={{ background: '#fff', border: '1px solid var(--border)' }}>
                {k === 'modern' ? <div className="absolute inset-x-0 top-0 h-[26%]" style={{ background: st.accent }} /> : k === 'classic' ? <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: st.accent }} /> : <div className="absolute inset-x-2 top-[22%] h-px" style={{ background: '#222' }} />}
                <div className="absolute left-2 right-2 top-[34%] space-y-1.5">{[70, 100, 100, 85].map((w, i) => <div key={i} className="h-1 rounded" style={{ width: w + '%', background: i === 0 && k === 'modern' ? '#222' : '#ddd' }} />)}</div>
                <div className="absolute right-2 bottom-3 w-1/2 h-3 rounded" style={{ background: st.accent, opacity: 0.85 }} />
              </div>
              <span className="text-[12.5px] font-semibold">{l}</span>
            </motion.button>))}
        </div>
      </Panel>
      <Panel delay={0.05}>
        <Label>Colour & page</Label>
        <div className="flex flex-wrap items-center gap-2">{SW.map((c) => <motion.button key={c} type="button" aria-label={c} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.85 }} onClick={() => ss({ accent: c })} className="w-8 h-8 rounded-full" style={{ background: c, boxShadow: st.accent === c ? `0 0 0 3px var(--surface), 0 0 0 5px ${c}` : 'none' }} />)}<input type="color" value={st.accent} onChange={(e) => ss({ accent: e.target.value })} className="w-9 h-9 rounded-full border-0 bg-transparent cursor-pointer" aria-label="Custom colour" /></div>
        <div className="grid gap-4 sm:grid-cols-2 mt-5">
          <div><span className="eyebrow block mb-2">Paper</span><Chips value={st.size} onChange={(v) => ss({ size: v })} options={[['a4', 'A4'], ['letter', 'US Letter']]} small /></div>
          <div><span className="eyebrow block mb-2">Typeface</span><Chips value={st.serif ? 'serif' : 'sans'} onChange={(v) => ss({ serif: v === 'serif' })} options={[['sans', 'Sans'], ['serif', 'Serif']]} small /></div>
        </div>
        <div className="mt-5 space-y-3"><Switch on={st.showQty} onChange={(v) => ss({ showQty: v })} label="Show quantity and rate columns" hint="Turn off for a simple description + amount layout" /><Field label="Footer line"><I v={st.footer} on={(v) => ss({ footer: v })} /></Field></div>
      </Panel>
      <Panel delay={0.1}>
        <Label>Logo & signature</Label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><span className="eyebrow block mb-2">Logo</span>{st.logo ? <div className="flex items-center gap-3"><img src={st.logo} alt="" className="h-14 max-w-[130px] object-contain rounded-lg border border-line p-1 bg-white" /><Btn small danger icon="trash" onClick={() => ss({ logo: '' })}>Remove</Btn></div> : <label className="inline-flex"><input type="file" accept="image/*" hidden onChange={up('logo', 500, 'image/png')} /><span className="btn-like inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-[13px] font-bold cursor-pointer" style={{ background: 'var(--surface)' }}><KIco n="image" s={15} />Upload logo</span></label>}</div>
          <div><span className="eyebrow block mb-2">Signature</span>{st.sign ? <div className="flex items-center gap-3"><img src={st.sign} alt="" className="h-12 max-w-[130px] object-contain rounded-lg border border-line p-1 bg-white" /><Btn small danger icon="trash" onClick={() => ss({ sign: '' })}>Remove</Btn></div> : <div className="flex gap-2"><Btn small icon="sign" onClick={() => setPad(!pad)}>Draw</Btn><label className="inline-flex"><input type="file" accept="image/*" hidden onChange={up('sign', 500, 'image/png')} /><span className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-[12px] font-bold cursor-pointer" style={{ background: 'var(--surface)' }}><KIco n="upload" s={14} />Upload</span></label></div>}</div>
        </div>
        {uploadErr && <div role="alert" className="text-[12px] font-semibold mt-3" style={{ color: '#C3423F' }}>{uploadErr}</div>}
        <AnimatePresence>{pad && !st.sign && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-4"><SignPad onDone={(d) => { ss({ sign: d }); setPad(false) }} /></motion.div>}</AnimatePresence>
      </Panel>
    </div>
  )
}
export function Saved({ lib, load, dup, del, current, exportAll, importAll }) {
  const rows = lib.map((i) => ({ i, t: totals(i) })), sum = (f) => rows.filter(f).reduce((s, r) => s + r.t.total, 0)
  const ref = useRef(null)
  return (
    <div className="space-y-4">
      <Panel>
        <Label right={<div className="flex gap-2"><Btn small icon="download" disabled={!lib.length} onClick={exportAll}>Back up</Btn><Btn small icon="upload" onClick={() => ref.current.click()}>Restore</Btn><input ref={ref} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && importAll(e.target.files[0]); e.target.value = '' }} /></div>}>Saved documents</Label>
        {!lib.length ? <Empty icon="receipt" title="Nothing saved yet" sub="Press Save beside the preview to keep a document here." /> : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4">{[['Documents', lib.length], ['Billed', rows.filter((r) => r.i.type === 'invoice').length], ['Paid', rows.filter((r) => r.i.status === 'paid').length]].map(([k, v], x) => <motion.div key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: x * 0.05 }} className="rounded-2xl p-3 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow">{k}</div><div className="display font-semibold text-[24px]">{v}</div></motion.div>)}</div>
            <div className="space-y-2.5">
              <AnimatePresence initial={false}>{rows.map(({ i, t }) => (
                <motion.div key={i.id} layout="position" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="rounded-2xl border p-3.5 flex items-center gap-3 flex-wrap" style={{ borderColor: current === i.id ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}>
                  <div className="min-w-0 flex-1"><div className="font-semibold text-[14px] truncate">{TYPES[i.type].label} {i.number} · {i.to.name || 'No client'}</div><div className="text-[12px]" style={{ color: 'var(--muted)' }}>{i.issue} · {money(t.total, i)}</div></div>
                  <Btn small icon="edit" onClick={() => load(i)}>Open</Btn><Btn small icon="copy" onClick={() => dup(i)} title="Duplicate as new" /><Btn small icon="trash" danger onClick={() => del(i.id)} title="Delete" />
                </motion.div>))}</AnimatePresence>
            </div>
          </>)}
      </Panel>
      <div className="text-[12px] px-2" style={{ color: 'var(--muted)' }}>Documents live in this browser only. Use Back up to move them to another device.</div>
    </div>
  )
}
