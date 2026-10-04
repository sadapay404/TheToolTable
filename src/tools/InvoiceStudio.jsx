// Tool 16 — Invoice Studio. Type it in, watch the page fill up, save a real PDF.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, animate } from 'framer-motion'
import { recentAction, download } from '../lib/utils.js'
import { CURRENCIES, TEMPLATES, PAYMENT_TERMS, emptyInvoice, calcTotals, fmtMoney, nextNumber, toJSON, fromJSON, invoicePDF, toCSV } from '../lib/invoice.js'
import { Ico, Btn, Chips, Panel, Label, Seg, Slider, Toast, useToast, SPRING, CopyBtn } from './kit.jsx'

const LS = 'ttt.invoice'
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

function Money({ value, cur, className = '', style }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const c = animate(from.current, value, { duration: 0.5, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => { from.current = v; setShown(v) } })
    return () => c.stop()
  }, [value])
  return <span className={className} style={style}>{fmtMoney(shown, cur)}</span>
}

export default function InvoiceStudio() {
  const [inv, setInv] = useState(() => lsGet(`${LS}.current`, emptyInvoice()))
  const [saved, setSaved] = useState(() => lsGet(`${LS}.list`, []))
  const [tab, setTab] = useState('edit')
  const [busy, setBusy] = useState('')
  const [msg, toast] = useToast()
  const jsonRef = useRef(null)
  const t = useMemo(() => calcTotals(inv), [inv])
  const set = useCallback((patch) => setInv((v) => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch) })), [])

  useEffect(() => { const id = setTimeout(() => lsSet(`${LS}.current`, inv), 350); return () => clearTimeout(id) }, [inv])
  useEffect(() => { lsSet(`${LS}.list`, saved) }, [saved])

  const setLine = (i, patch) => set((v) => ({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }))
  const addLine = () => set((v) => ({ ...v, lines: [...v.lines, { desc: '', qty: 1, rate: 0, taxPct: v.lines[0]?.taxPct || 0 }] }))
  const delLine = (i) => set((v) => ({ ...v, lines: v.lines.length > 1 ? v.lines.filter((_, j) => j !== i) : v.lines }))
  const moveLine = (i, d) => set((v) => { const a = [...v.lines]; const j = i + d; if (j < 0 || j >= a.length) return a; ;[a[i], a[j]] = [a[j], a[i]]; return { ...v, lines: a } })

  const accent = inv.accent || `#${(TEMPLATES.find((x) => x.id === inv.template) || TEMPLATES[0]).accent.map((n) => n.toString(16).padStart(2, '0')).join('')}`

  const savePdf = async () => {
    setBusy('drawing PDF')
    try {
      const doc = await invoicePDF({ ...inv, accent })
      const blob = doc.output('blob')
      await download(blob, `${inv.number || 'invoice'}${inv.to?.name ? `-${inv.to.name.replace(/\W+/g, '-')}` : ''}.pdf`)
      recentAction(`Saved invoice ${inv.number} as PDF`)
      toast(`${inv.number}.pdf · ${fmtMoney(t.total, inv.currency)}`)
    } catch (e) { toast(`PDF failed: ${e.message}`, 'err') }
    setBusy('')
  }
  const saveJson = async () => {
    await download(new Blob([toJSON(inv)], { type: 'application/json' }), `${inv.number || 'invoice'}.json`)
    toast('Invoice JSON saved')
  }
  const saveCsv = async () => { await download(new Blob([toCSV(inv)], { type: 'text/csv' }), `${inv.number || 'invoice'}.csv`); toast('CSV saved') }
  const openJson = async (files) => {
    const f = files[0]
    try {
      const next = fromJSON(await f.text())
      setInv(next); setTab('edit'); toast(`Opened ${next.number || f.name}`)
    } catch (e) { toast(`Could not read that JSON: ${e.message}`, 'err') }
  }
  const keep = () => {
    const row = { id: Date.now().toString(36), number: inv.number, client: inv.to?.name || '—', total: t.total, cur: inv.currency, ts: Date.now(), inv }
    setSaved((s) => [row, ...s.filter((x) => x.number !== inv.number)].slice(0, 60))
    recentAction(`Filed invoice ${inv.number}`)
    toast(`Filed ${inv.number}`)
  }
  const fresh = () => { setInv(emptyInvoice({ number: nextNumber(saved), currency: inv.currency, from: inv.from, template: inv.template, accent: inv.accent })); toast('New invoice') }

  const logo = async (files) => {
    try {
      const f = files[0]
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f) })
      set({ logo: dataUrl }); toast('Logo added')
    } catch (e) { toast(`Logo failed: ${e.message}`, 'err') }
  }

  return (
    <div className="space-y-6">
      <input ref={jsonRef} type="file" hidden accept="application/json,.json" onChange={(e) => { openJson([...e.target.files]); e.target.value = '' }} />
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={tab} onChange={setTab} options={[['edit', 'Edit'], ['design', 'Design'], ['filed', saved.length ? `Filed (${saved.length})` : 'Filed']]} />
        <div className="ml-auto flex items-center gap-2">
          <Btn small icon="plus" onClick={fresh}>New</Btn>
          <Btn small icon="user" onClick={() => jsonRef.current?.click()}>Open JSON</Btn>
        </div>
      </div>

      <div className="grid gap-6 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)] items-start">
        <div className="space-y-4">
          {tab === 'edit' && (
            <>
              <Panel>
                <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{inv.lines.length} items</span>}>Line items</Label>
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {inv.lines.map((l, i) => (
                      <motion.div key={i} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING} className="grid grid-cols-[minmax(0,1fr)_64px_88px_64px_auto] gap-2 items-center">
                        <input className="input" placeholder="What did you do?" value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} />
                        <input className="input mono text-[12px] text-center" type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
                        <input className="input mono text-[12px] text-right" type="number" min="0" step="any" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />
                        <input className="input mono text-[12px] text-center" type="number" min="0" step="any" value={l.taxPct} onChange={(e) => setLine(i, { taxPct: e.target.value })} title="Tax %" />
                        <div className="flex items-center gap-0.5">
                          <button className="opacity-50 hover:opacity-100" onClick={() => moveLine(i, -1)} title="Up"><Ico n="arrowu" s={13} /></button>
                          <button className="opacity-50 hover:opacity-100" onClick={() => moveLine(i, 1)} title="Down"><Ico n="arrowd" s={13} /></button>
                          <button className="opacity-50 hover:opacity-100" onClick={() => delLine(i)} title="Remove"><Ico n="trash" s={13} /></button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Btn small icon="plus" onClick={addLine}>Add item</Btn>
                  <div className="ml-auto text-[12px] mono" style={{ color: 'var(--muted)' }}>subtotal {fmtMoney(t.sub, inv.currency)}</div>
                </div>
              </Panel>

              <div className="grid sm:grid-cols-2 gap-4">
                <Panel delay={0.05}>
                  <Label>From</Label>
                  <input className="input w-full mb-2" placeholder="Your name / studio" value={inv.from.name} onChange={(e) => set((v) => ({ ...v, from: { ...v.from, name: e.target.value } }))} />
                  <textarea className="input w-full h-20 text-[12.5px]" placeholder={'Street\nCity, Country\nemail · phone'} value={inv.from.lines} onChange={(e) => set((v) => ({ ...v, from: { ...v.from, lines: e.target.value } }))} />
                  <div className="flex items-center gap-2 mt-3">
                    <Btn small icon="image" onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/png,image/jpeg'; el.onchange = () => logo([...el.files]); el.click() }}>Logo</Btn>
                    {inv.logo && <><img src={inv.logo} alt="" className="h-9 rounded-lg border border-line" /><button className="text-[11.5px] font-semibold" style={{ color: 'var(--copper)' }} onClick={() => set({ logo: null })}>remove</button></>}
                  </div>
                </Panel>
                <Panel delay={0.08}>
                  <Label>Bill to</Label>
                  <input className="input w-full mb-2" placeholder="Client / company" value={inv.to.name} onChange={(e) => set((v) => ({ ...v, to: { ...v.to, name: e.target.value } }))} />
                  <textarea className="input w-full h-20 text-[12.5px]" placeholder={'Client street\nCity\nVAT / NTN'} value={inv.to.lines} onChange={(e) => set((v) => ({ ...v, to: { ...v.to, lines: e.target.value } }))} />
                </Panel>
              </div>

              <Panel delay={0.1}>
                <Label>Extras</Label>
                <div className="grid sm:grid-cols-3 gap-4">
                  <label className="block"><span className="label mb-1.5 block">Discount</span>
                    <div className="flex gap-2">
                      <input className="input mono text-[12px] text-right" type="number" min="0" step="any" value={inv.discount.value} onChange={(e) => set((v) => ({ ...v, discount: { ...v.discount, value: e.target.value } }))} />
                      <Chips value={inv.discount.mode} onChange={(m) => set((v) => ({ ...v, discount: { ...v.discount, mode: m } }))} options={[['pct', '%'], ['flat', 'flat']]} />
                    </div>
                  </label>
                  <label className="block"><span className="label mb-1.5 block">Shipping</span>
                    <input className="input mono text-[12px] text-right" type="number" min="0" step="any" value={inv.shipping} onChange={(e) => set({ shipping: e.target.value })} /></label>
                  <label className="block"><span className="label mb-1.5 block">Already paid</span>
                    <input className="input mono text-[12px] text-right" type="number" min="0" step="any" value={inv.paid} onChange={(e) => set({ paid: e.target.value })} /></label>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <label className="block"><span className="label mb-1.5 block">Notes on the invoice</span>
                    <textarea className="input w-full h-20 text-[12.5px]" value={inv.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
                  <label className="block"><span className="label mb-1.5 block">Payment terms</span>
                    <textarea className="input w-full h-20 text-[12.5px]" value={inv.termsText} onChange={(e) => set({ termsText: e.target.value })} /></label>
                </div>
              </Panel>
            </>
          )}

          {tab === 'design' && (
            <>
              <Panel>
                <Label>Template</Label>
                <div className="grid sm:grid-cols-2 gap-3">
                  {TEMPLATES.map((T) => {
                    const on = inv.template === T.id
                    return (
                      <motion.button key={T.id} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => set({ template: T.id })}
                        className="rounded-2xl border p-3 text-left" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)', boxShadow: on ? '0 12px 24px -14px var(--copper)' : 'var(--shadow)' }}>
                        <div className="h-16 rounded-lg mb-2 relative overflow-hidden" style={{ background: 'var(--surface2)' }}>
                          <div className="absolute inset-2 rounded" style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}>
                            {T.style === 'band' && <div className="h-4 rounded-t" style={{ background: `rgb(${T.accent.join(',')})` }} />}
                            {T.style === 'sidebar' && <div className="absolute left-0 top-0 bottom-0 w-3 rounded-l" style={{ background: `rgb(${T.accent.join(',')})` }} />}
                            <div className="p-2 space-y-1">
                              <div className="h-1.5 w-8 rounded" style={{ background: `rgb(${T.accent.join(',')})` }} />
                              <div className="h-1 w-14 rounded bg-black/10" />
                              <div className="h-1 w-12 rounded bg-black/10" />
                            </div>
                          </div>
                        </div>
                        <div className="font-bold text-[13px]">{T.name}</div>
                        <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{T.blurb}</div>
                      </motion.button>
                    )
                  })}
                </div>
              </Panel>
              <Panel delay={0.05}>
                <Label>Details</Label>
                <div className="grid sm:grid-cols-3 gap-4">
                  <label className="block"><span className="label mb-1.5 block">Invoice number</span><input className="input w-full mono" value={inv.number} onChange={(e) => set({ number: e.target.value })} /></label>
                  <label className="block"><span className="label mb-1.5 block">Date</span><input className="input w-full" type="date" value={inv.date} onChange={(e) => set({ date: e.target.value })} /></label>
                  <label className="block"><span className="label mb-1.5 block">Due</span><input className="input w-full" type="date" value={inv.due} onChange={(e) => set({ due: e.target.value })} /></label>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 mt-4">
                  <div><span className="label mb-1.5 block">Currency</span>
                    <Chips value={inv.currency} onChange={(c) => set({ currency: c })} options={CURRENCIES.map(([c, s]) => [c, `${s} ${c}`])} /></div>
                  <div><span className="label mb-1.5 block">Terms</span>
                    <Chips value={inv.terms} onChange={(v) => set({ terms: v })} options={PAYMENT_TERMS.map((p) => [p, p])} /></div>
                </div>
                <div className="mt-4">
                  <Slider label="Accent colour" min={0} max={1} step={0.001} value={0.5} onChange={(v) => { const T = TEMPLATES.find((x) => x.id === inv.template) || TEMPLATES[0]; const base = T.accent.map((n, i) => n + (255 - n) * (v - 0.5) * 0.6); const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); set({ accent: `#${base.map(toHex).join('')}` }) }} fmt={() => accent} hint="slides around the template colour" />
                  <Btn small icon="refresh" className="mt-2" onClick={() => set({ accent: null })}>Template default</Btn>
                </div>
              </Panel>
            </>
          )}

          {tab === 'filed' && (
            <Panel>
              <Label right={<Btn small icon="plus" onClick={fresh}>New invoice</Btn>}>Filed invoices</Label>
              {!saved.length && <div className="text-[13px] py-8 text-center" style={{ color: 'var(--muted)' }}>Nothing filed yet. “File it” keeps a copy here (in this browser) so you can reopen or re-send it.</div>}
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {saved.map((r) => (
                    <motion.div key={r.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} transition={SPRING}
                      className="rounded-2xl border border-line px-4 py-3 flex items-center gap-3" style={{ background: 'var(--surface)' }}>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-[13px]">{r.number} · {r.client}</div>
                        <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{new Date(r.ts).toLocaleDateString()} · {fmtMoney(r.total, r.cur)}</div>
                      </div>
                      <Btn small icon="eye" onClick={() => { setInv(r.inv); setTab('edit'); toast(`Opened ${r.number}`) }}>Open</Btn>
                      <button className="opacity-50 hover:opacity-100" onClick={() => setSaved((s) => s.filter((x) => x.id !== r.id))}><Ico n="trash" s={14} /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <Panel pad={false} className="overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
              <span className="eyebrow">Preview</span>
              <span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>A4</span>
              <div className="ml-auto flex gap-1.5">
                <Btn small icon="user" onClick={keep} title="Keep a copy in Filed">File it</Btn>
                <Btn small primary icon="download" disabled={!!busy} busy={busy === 'drawing PDF'} onClick={savePdf}>PDF</Btn>
              </div>
            </div>
            <div className="p-4" style={{ background: 'var(--surface2)' }}>
              <div className="mx-auto shadow-lg" style={{ width: '100%', maxWidth: 460, aspectRatio: '210 / 297', background: '#fff', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, padding: '7% 7%', fontSize: 11, color: '#1e1e1e', display: 'flex', flexDirection: 'column' }}>
                  {inv.template === 'bold' && <div style={{ margin: '-7% -7% 4%', padding: '5% 7%', background: accent, color: '#fff' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>{inv.title}</div>
                    <div style={{ opacity: 0.9, fontSize: 11 }}>#{inv.number}</div>
                  </div>}
                  {inv.template !== 'bold' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        {inv.logo && <img src={inv.logo} alt="" style={{ height: 34, objectFit: 'contain', marginBottom: 4 }} />}
                        <div style={{ fontWeight: 700 }}>{inv.from.name || 'Your name'}</div>
                        <div style={{ whiteSpace: 'pre-line', color: '#666', fontSize: 9.5 }}>{inv.from.lines}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: accent, letterSpacing: -0.4 }}>{inv.title}</div>
                        <div style={{ fontWeight: 700 }}>#{inv.number}</div>
                        <div style={{ color: '#777', fontSize: 9.5 }}>Issued {inv.date}</div>
                        <div style={{ color: '#777', fontSize: 9.5 }}>Due {inv.due} · {inv.terms}</div>
                      </div>
                    </div>
                  )}
                  {inv.template === 'bold' && <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{inv.from.name || 'Your name'}</div>
                      <div style={{ whiteSpace: 'pre-line', color: '#666', fontSize: 9.5 }}>{inv.from.lines}</div>
                    </div>
                    <div style={{ textAlign: 'right', color: '#666', fontSize: 9.5 }}>Issued {inv.date}<br />Due {inv.due}</div>
                  </div>}
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 8.5, letterSpacing: 1, color: '#999', fontWeight: 700 }}>BILL TO</div>
                    <div style={{ fontWeight: 700 }}>{inv.to.name || 'Client'}</div>
                    <div style={{ whiteSpace: 'pre-line', color: '#666', fontSize: 9.5 }}>{inv.to.lines}</div>
                  </div>
                  <div style={{ marginTop: 10, borderTop: `1.5px solid ${accent}`, paddingTop: 6 }}>
                    <div style={{ display: 'flex', fontSize: 8.5, letterSpacing: 0.6, color: '#888', fontWeight: 700, paddingBottom: 3, borderBottom: inv.template === 'minimal' ? '1px solid #eee' : 'none', background: inv.template === 'clean' || inv.template === 'sidebar' ? 'transparent' : 'transparent' }}>
                      <div style={{ flex: 1 }}>DESCRIPTION</div><div style={{ width: 34, textAlign: 'right' }}>QTY</div><div style={{ width: 58, textAlign: 'right' }}>RATE</div><div style={{ width: 40, textAlign: 'right' }}>TAX</div><div style={{ width: 66, textAlign: 'right' }}>AMOUNT</div>
                    </div>
                    <div style={{ maxHeight: '34%', overflow: 'hidden' }}>
                      {t.lines.map((l, i) => (
                        <div key={i} style={{ display: 'flex', padding: '3.5px 0', borderBottom: '1px solid #f1eeea', alignItems: 'baseline' }}>
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.desc || '—'}</div>
                          <div style={{ width: 34, textAlign: 'right', color: '#555' }}>{l.qty}</div>
                          <div style={{ width: 58, textAlign: 'right', color: '#555' }}>{l.rate.toFixed(2)}</div>
                          <div style={{ width: 40, textAlign: 'right', color: '#999' }}>{l.taxPct ? `${l.taxPct}%` : '—'}</div>
                          <div style={{ width: 66, textAlign: 'right' }}>{l.amount.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto' }}>
                    <div style={{ marginLeft: 'auto', width: '58%', fontSize: 10.5 }}>
                      {[['Subtotal', t.sub], t.discountAmount && ['Discount', -t.discountAmount], t.tax && ['Tax', t.tax], t.shipping && ['Shipping', t.shipping]].filter(Boolean).map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}><span>{k}</span><span>{(+v).toFixed(2)}</span></div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, paddingTop: 3, borderTop: `1.5px solid ${accent}`, fontWeight: 700, fontSize: 12.5 }}>
                        <span>TOTAL ({inv.currency})</span><Money value={t.total} cur={inv.currency} />
                      </div>
                      {t.paid > 0 && <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555' }}><span>Paid</span><span>-{t.paid.toFixed(2)}</span></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Balance due</span><Money value={t.balance} cur={inv.currency} /></div>
                      </>}
                    </div>
                    <div style={{ fontSize: 9, color: '#888', marginTop: 8, whiteSpace: 'pre-line' }}>{inv.notes}{'\n'}{inv.termsText}</div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-line px-4 py-3" style={{ background: 'var(--surface)' }}><div className="eyebrow">Subtotal</div><div className="font-bold mt-1 mono text-[13px]">{fmtMoney(t.sub, inv.currency)}</div></div>
            <div className="rounded-2xl border border-line px-4 py-3" style={{ background: 'var(--surface)' }}><div className="eyebrow">Tax</div><div className="font-bold mt-1 mono text-[13px]">{fmtMoney(t.tax, inv.currency)}</div></div>
            <div className="rounded-2xl border border-line px-4 py-3" style={{ background: 'var(--surface)', outline: `2px solid ${accent}`, outlineOffset: -2 }}><div className="eyebrow">Total</div><div className="font-bold mt-1 mono text-[13px]"><Money value={t.total} cur={inv.currency} /></div></div>
          </div>
          <div className="flex gap-2">
            <Btn small icon="download" onClick={savePdf} disabled={!!busy}>Save PDF</Btn>
            <Btn small icon="code" onClick={saveJson}>JSON</Btn>
            <Btn small icon="grid" onClick={saveCsv}>CSV</Btn>
            <CopyBtn text={toJSON(inv)} label="Copy" small />
          </div>
        </div>
      </div>
      <Toast msg={msg} />
    </div>
  )
}
