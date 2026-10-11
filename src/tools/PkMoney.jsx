import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Chips, Seg, Btn, Dock, Swap, SPRING, usePref, save, Range } from './kit/ui.jsx'
import { TOLA, MASHA, RATTI, OZ, NISAB, NISAB_G, PRICES, TAX_TABLES, incomeTax, grossForNet, loan, profit, pk, rs, short, csv } from '../lib/pk/calc.js'
import { Money, Num, Big, Donut, Spark, Note } from './pk/parts.jsx'

const TABS = [['zakat', 'Zakat', 'coins'], ['tax', 'Income tax', 'percent'], ['loan', 'Loan & EMI', 'calc'], ['profit', 'Savings profit', 'zap'], ['gold', 'Gold & units', 'scale']]
const n0 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1e15, Math.max(0, n)) : 0 }

function Zakat() {
  const [p, setP] = usePref('pk', 'prices', PRICES), [z, setZ] = usePref('pk', 'zakat', { basis: 'silver', cash: '', bank: '', goldQ: '', goldU: 'tola', silverQ: '', silverU: 'tola', stock: '', invest: '', owed: '', other: '', debts: '' })
  const s = (k) => (v) => setZ({ ...z, [k]: v })
  const g = (q, u) => n0(q) * (u === 'g' ? 1 / TOLA : 1)
  const goldV = g(z.goldQ, z.goldU) * n0(p.gold), silverV = g(z.silverQ, z.silverU) * n0(p.silver)
  const assets = Math.min(1e18, n0(z.cash) + n0(z.bank) + goldV + silverV + n0(z.stock) + n0(z.invest) + n0(z.owed) + n0(z.other)), net = Math.max(0, assets - n0(z.debts))
  const basis = z.basis === 'gold' ? 'gold' : 'silver'
  const nisab = basis === 'silver' ? NISAB.silverTola * n0(p.silver) : NISAB.goldTola * n0(p.gold), due = net >= nisab && nisab > 0, zakat = due ? net * 0.025 : 0, pct = nisab ? Math.min(150, (net / nisab) * 100) : 0
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start">
      <div className="space-y-4">
        <Panel>
          <Label>Cash & savings</Label>
          <div className="grid gap-3 sm:grid-cols-2"><Money label="Cash in hand" value={z.cash} onChange={s('cash')} /><Money label="Bank & wallet balances" value={z.bank} onChange={s('bank')} /></div>
        </Panel>
        <Panel delay={0.05}>
          <Label>Gold & silver you own</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {[['gold', 'Gold'], ['silver', 'Silver']].map(([k, l]) => <div key={k}><span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>{l} (any purity, 24K equivalent)</span><div className="flex gap-2"><input aria-label={`${l} quantity`} className="input flex-1 tabular-nums" type="number" min="0" step="any" value={z[k + 'Q']} onChange={(e) => s(k + 'Q')(e.target.value === '' ? '' : +e.target.value)} /><select aria-label={`${l} unit`} className="input !w-[88px]" value={z[k + 'U']} onChange={(e) => s(k + 'U')(e.target.value)}><option value="tola">tola</option><option value="g">gram</option></select></div></div>)}
            <Money label="Gold price per tola (24K)" value={p.gold} onChange={(v) => setP({ ...p, gold: v })} hint={`Example as on ${PRICES.asOf} — type today's rate`} />
            <Money label="Silver price per tola" value={p.silver} onChange={(v) => setP({ ...p, silver: v })} hint="Used for the nisab and your silver" />
          </div>
        </Panel>
        <Panel delay={0.1}>
          <Label>Business, investments & money owed to you</Label>
          <div className="grid gap-3 sm:grid-cols-2"><Money label="Business stock / goods for sale" value={z.stock} onChange={s('stock')} /><Money label="Shares, funds, crypto (market value)" value={z.invest} onChange={s('invest')} /><Money label="Loans you gave (expected back)" value={z.owed} onChange={s('owed')} /><Money label="Other zakatable assets" value={z.other} onChange={s('other')} /></div>
          <div className="mt-4"><Money label="Debts and bills due now (subtract)" value={z.debts} onChange={s('debts')} hint="Only what you owe and must pay soon" /></div>
        </Panel>
      </div>
      <div className="lg:sticky lg:top-4 space-y-4">
        <Panel delay={0.08}>
          <Label>Nisab threshold</Label>
          <Seg value={basis} onChange={s('basis')} options={[['silver', 'Silver (52.5 tola)'], ['gold', 'Gold (7.5 tola)']]} small />
          <div className="mt-5">
            <div className="flex justify-between text-[12px] font-semibold mb-2" style={{ color: 'var(--muted)' }}><span>Your net wealth</span><span>Nisab {rs(nisab)}</span></div>
            <div className="relative h-4 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <motion.div className="h-full rounded-full" style={{ background: due ? 'var(--copper)' : 'var(--muted)' }} initial={{ width: 0 }} animate={{ width: Math.min(100, pct * 0.667) + '%' }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
              <div className="absolute inset-y-0 w-0.5" style={{ left: '66.7%', background: 'var(--ink)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5"><Big i={0} label="Net wealth" value={net} fmt={(v) => rs(v)} sub={net} /><Big i={1} tone label={due ? 'Zakat due (2.5%)' : 'Zakat due'} value={zakat} fmt={(v) => rs(v)} sub={due ? zakat : 'Below nisab'} /></div>
          <AnimatePresence mode="wait"><motion.div key={String(due)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[13px] mt-4 font-semibold" style={{ color: due ? 'var(--copper)' : 'var(--muted)' }}>{!nisab ? 'Enter today’s silver or gold price to see the nisab.' : due ? 'Your wealth is above the nisab for a full lunar year, so zakat is due.' : 'Your net wealth is below the nisab, so zakat is not obligatory.'}</motion.div></AnimatePresence>
          <Note>Nisab: silver {NISAB_G.silver.toFixed(2)} g, gold {NISAB_G.gold.toFixed(2)} g (1 tola = {TOLA} g). Many scholars suggest the silver nisab because it is lower and protects the poor. Zakat applies once you have held the wealth for one Hijri year. This is a helper, not a fatwa — ask your scholar for special cases.</Note>
        </Panel>
      </div>
    </div>
  )
}

function Tax() {
  const [t, setT] = usePref('pk', 'tax', { yr: '2026-27', kind: 'salaried', mode: 'gross', amount: 250000, per: 'month', bonus: 0, edits: {} })
  const yr = Object.hasOwn(TAX_TABLES, t.yr) ? t.yr : '2026-27'
  const kind = t.kind === 'business' ? 'business' : 'salaried', mode = t.mode === 'net' ? 'net' : 'gross', per = t.per === 'year' ? 'year' : 'month'
  const tbl = TAX_TABLES[yr], key = yr + kind, edits = t.edits && typeof t.edits === 'object' && !Array.isArray(t.edits) ? t.edits : {}
  const custom = edits[key], cleanCustom = Array.isArray(custom) ? custom.slice(0, 50).filter((row) => Array.isArray(row) && row.length >= 2).map((row) => [n0(row[0]), Math.min(100, n0(row[1]))]) : []
  const slabs = cleanCustom.length ? cleanCustom : tbl[kind], sur = tbl.surcharge[kind]
  const annualIn = n0(t.amount) * (per === 'month' ? 12 : 1)
  const gross = mode === 'gross' ? Math.min(1e15, annualIn + n0(t.bonus)) : grossForNet(annualIn, slabs, sur)
  const r = useMemo(() => incomeTax(gross, slabs, sur), [gross, slabs, sur]), net = gross - r.total
  const edit = (i, f, v) => {
    const clean = f === 0 ? (i === 0 ? 0 : Math.min(1e15, Math.max(0, Number(v) || 0))) : Math.min(100, Math.max(0, Number(v) || 0))
    setT({ ...t, edits: { ...edits, [key]: slabs.map((s, j) => (j === i ? (f === 0 ? [clean, s[1]] : [s[0], clean]) : s)) } })
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
      <div className="space-y-4">
        <Panel>
          <Label>Who and when</Label>
          <Chips small value={yr} onChange={(v) => setT({ ...t, yr: v })} options={Object.entries(TAX_TABLES).map(([k, v]) => [k, v.label.split(' (')[0] + ' · ' + k])} />
          <div className="mt-3"><Seg small value={kind} onChange={(v) => setT({ ...t, kind: v })} options={[['salaried', 'Salaried'], ['business', 'Business / other']]} /></div>
        </Panel>
        <Panel delay={0.05}>
          <Label>Income</Label>
          <Seg small value={mode} onChange={(v) => setT({ ...t, mode: v })} options={[['gross', 'I know my gross'], ['net', 'I want this take-home']]} />
          <div className="grid grid-cols-[1fr_auto] gap-3 mt-4 items-end"><Money label={mode === 'gross' ? 'Gross salary / income' : 'Take-home you want'} value={t.amount} onChange={(v) => setT({ ...t, amount: v })} /><Seg small value={per} onChange={(v) => setT({ ...t, per: v })} options={[['month', 'monthly'], ['year', 'yearly']]} /></div>
          {mode === 'gross' && <div className="mt-3"><Money label="Yearly bonus / extra income (optional)" value={t.bonus} onChange={(v) => setT({ ...t, bonus: v })} /></div>}
        </Panel>
        <Panel delay={0.1}>
          <Label right={Object.hasOwn(edits, key) && <Btn small icon="refresh" onClick={() => { const e = { ...edits }; delete e[key]; setT({ ...t, edits: e }) }}>Reset table</Btn>}>Slab table (editable)</Label>
          <div className="space-y-1.5">
            {slabs.map((s, i) => <div key={i} className="grid grid-cols-[1fr_84px] gap-2 items-center"><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-bold" style={{ color: 'var(--muted)' }}>From Rs</span><input aria-label={`Slab ${i + 1} starts at`} className="input w-full tabular-nums !pl-[62px] !py-1.5 text-[13px]" inputMode="numeric" value={pk(s[0])} onChange={(e) => edit(i, 0, +e.target.value.replace(/\D/g, '') || 0)} /></div><div className="relative"><input aria-label={`Slab ${i + 1} rate percent`} className="input w-full tabular-nums !py-1.5 text-[13px] !pr-7" type="number" min="0" max="100" step="0.5" value={s[1]} onChange={(e) => edit(i, 1, +e.target.value || 0)} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: 'var(--muted)' }}>%</span></div></div>)}
          </div>
          <Note>Defaults follow the Finance Acts as reported for each tax year{sur[1] ? `; a ${sur[1]}% surcharge applies above Rs ${pk(sur[0])}` : '; no surcharge for salaried individuals'}. Tax rules change every budget — confirm the final rates on fbr.gov.pk before filing or deducting.</Note>
        </Panel>
      </div>
      <div className="lg:sticky lg:top-4 space-y-4">
        <Panel delay={0.08}>
          <div className="grid grid-cols-2 gap-3"><Big i={0} label="Tax per month" value={r.total / 12} fmt={(v) => rs(v)} sub={r.total / 12} /><Big i={1} tone label="Take-home per month" value={net / 12} fmt={(v) => rs(v)} sub={net / 12} /></div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-center">{[['Yearly tax', rs(r.total)], ['Effective rate', r.effective.toFixed(2) + '%'], ['Next rupee taxed at', r.marginal + '%']].map(([k, v]) => <div key={k} className="rounded-xl p-2.5 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow !text-[9.5px]">{k}</div><div className="font-bold text-[14px] tabular-nums mt-0.5">{v}</div></div>)}</div>
          {mode === 'net' && <div className="text-[13px] mt-3" style={{ color: 'var(--muted)' }}>You would need a gross of <b style={{ color: 'var(--ink)' }}>{rs(gross / 12)}</b> per month ({rs(gross)} a year).</div>}
          <div className="mt-5"><Label>How it adds up</Label>
            <div className="space-y-1.5">{r.rows.filter((x) => x.inSlab > 0 || x.rate > 0 && gross > x.from).map((x, i) => <motion.div key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.04 }} className="flex items-center gap-3 text-[12.5px]"><span className="w-[88px] shrink-0 tabular-nums" style={{ color: 'var(--muted)' }}>{short(x.from)}{x.to === Infinity ? '+' : '–' + short(x.to)}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div className="h-full" style={{ background: 'var(--copper)', opacity: 0.35 + Math.min(0.65, x.rate / 40) }} initial={{ width: 0 }} animate={{ width: Math.min(100, (x.inSlab / (gross || 1)) * 100) + '%' }} /></div><span className="w-9 text-right font-bold">{x.rate}%</span><span className="w-[84px] text-right tabular-nums font-semibold">{rs(x.tax)}</span></motion.div>)}
              {r.surcharge > 0 && <div className="flex justify-between text-[12.5px] pt-1 font-semibold"><span>Surcharge {sur[1]}%</span><span className="tabular-nums">{rs(r.surcharge)}</span></div>}</div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Loan() {
  const [l, setL] = usePref('pk', 'loan', { principal: 2000000, rate: 18, tv: 5, tu: 'years', method: 'reducing', extra: 0, fee: 0 }), [all, setAll] = useState(false)
  const months = Math.max(1, Math.round(n0(l.tv) * (l.tu === 'years' ? 12 : 1))), r = useMemo(() => loan({ principal: n0(l.principal), rate: n0(l.rate), months, method: l.method, extra: n0(l.extra), feePct: n0(l.fee) }), [l, months])
  const rows = all ? r.rows : r.rows.slice(0, 12)
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-start">
      <Panel>
        <Label>The loan</Label>
        <div className="space-y-4">
          <Money label="Amount borrowed" value={l.principal} onChange={(v) => setL({ ...l, principal: v })} />
          <Range label="Yearly rate" min={0} max={40} step={0.25} value={n0(l.rate)} onChange={(v) => setL({ ...l, rate: v })} fmt={(v) => v + '%'} />
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end"><Num label="Duration" value={l.tv} onChange={(v) => setL({ ...l, tv: v })} step="1" min={1} /><Seg small value={l.tu} onChange={(v) => setL({ ...l, tu: v })} options={[['years', 'years'], ['months', 'months']]} /></div>
          <div><span className="eyebrow block mb-2">Profit method</span><Seg small value={l.method} onChange={(v) => setL({ ...l, method: v })} options={[['reducing', 'Reducing balance'], ['flat', 'Flat rate (Islamic / leasing)']]} /></div>
          <div className="grid grid-cols-2 gap-3"><Money label="Extra payment each month" value={l.extra} onChange={(v) => setL({ ...l, extra: v })} hint="Pay early, save interest" /><Num label="Processing fee" suffix="%" value={l.fee} onChange={(v) => setL({ ...l, fee: v })} /></div>
        </div>
        <Note>Banks may quote slightly different instalments because of day-count rules and insurance. Treat this as a close estimate.</Note>
      </Panel>
      <div className="space-y-4">
        <Panel delay={0.08}>
          <div className="grid sm:grid-cols-[170px_1fr] gap-5 items-center">
            <Donut parts={[{ v: n0(l.principal), c: 'var(--copper)' }, { v: r.totalInt, c: 'var(--ink)' }]} center={<div><div className="eyebrow !text-[9.5px]">Interest share</div><div className="display font-semibold text-[22px]">{((r.totalInt / (r.total || 1)) * 100).toFixed(0)}%</div></div>} />
            <div className="grid grid-cols-2 gap-3"><Big i={0} tone label="Monthly instalment" value={r.emi + n0(l.extra)} fmt={(v) => rs(v)} sub={r.emi} /><Big i={1} label="Total profit paid" value={r.totalInt} fmt={(v) => rs(v)} sub={r.totalInt} /><Big i={2} label="Total repaid" value={r.total + r.fee} fmt={(v) => rs(v)} sub={r.fee ? `incl. fee ${rs(r.fee)}` : r.total} /><Big i={3} label="Finished in" value={r.months} fmt={(v) => Math.round(v) + ' months'} sub={r.saved > 0 ? `${r.saved} months early` : `${(r.months / 12).toFixed(1)} years`} /></div>
          </div>
        </Panel>
        <Panel delay={0.12}>
          <Label right={<Btn small icon="download" onClick={() => save(new Blob([csv(r.rows)], { type: 'text/csv' }), 'repayment-schedule.csv')}>CSV</Btn>}>Repayment schedule</Label>
          <div className="overflow-auto max-h-[360px] rounded-xl border border-line"><table className="w-full text-[12.5px] tabular-nums"><thead className="sticky top-0" style={{ background: 'var(--surface2)' }}><tr className="text-left"><th className="p-2.5">Month</th><th className="p-2.5 text-right">Payment</th><th className="p-2.5 text-right">Principal</th><th className="p-2.5 text-right">Profit</th><th className="p-2.5 text-right">Balance</th></tr></thead><tbody>{rows.map((x) => <tr key={x.m} className="border-t border-line"><td className="p-2.5">{x.m}</td><td className="p-2.5 text-right">{pk(x.pay)}</td><td className="p-2.5 text-right">{pk(x.princ)}</td><td className="p-2.5 text-right">{pk(x.interest)}</td><td className="p-2.5 text-right font-semibold">{pk(x.bal)}</td></tr>)}</tbody></table></div>
          {r.rows.length > 12 && <div className="mt-3"><Btn small onClick={() => setAll(!all)}>{all ? 'Show first year' : `Show all ${r.rows.length} months`}</Btn></div>}
        </Panel>
      </div>
    </div>
  )
}

function Profit() {
  const [f, setF] = usePref('pk', 'profit', { principal: 1000000, monthly: 0, rate: 12, years: 3, comp: 12, wht: 20 })
  const r = useMemo(() => profit({ principal: n0(f.principal), monthly: n0(f.monthly), rate: n0(f.rate), years: n0(f.years), comp: f.comp, wht: n0(f.wht) }), [f])
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
      <Panel>
        <Label>Savings or term deposit</Label>
        <div className="space-y-4">
          <Money label="Amount you deposit now" value={f.principal} onChange={(v) => setF({ ...f, principal: v })} />
          <Money label="Add every month (optional)" value={f.monthly} onChange={(v) => setF({ ...f, monthly: v })} />
          <Range label="Yearly profit rate" min={0} max={30} step={0.25} value={n0(f.rate)} onChange={(v) => setF({ ...f, rate: v })} fmt={(v) => v + '%'} />
          <Range label="For how long" min={0.5} max={30} step={0.5} value={n0(f.years)} onChange={(v) => setF({ ...f, years: v })} fmt={(v) => v + ' yr'} />
          <div><span className="eyebrow block mb-2">Profit is paid</span><Chips small value={f.comp} onChange={(v) => setF({ ...f, comp: v })} options={[[12, 'Monthly, reinvested'], [4, 'Quarterly'], [1, 'Yearly'], [0, 'Simple (not reinvested)']]} /></div>
          <Num label="Tax withheld on profit" suffix="%" value={f.wht} onChange={(v) => setF({ ...f, wht: v })} hint="Default 20% is an estimate for an active tax filer’s bank-deposit profit; the non-filer rate and exemptions differ. Confirm your exact FBR treatment." />
        </div>
      </Panel>
      <Panel delay={0.08}>
        <div className="grid grid-cols-2 gap-3"><Big i={0} tone label="You end up with" value={r.netMaturity} fmt={(v) => rs(v)} sub={r.netMaturity} /><Big i={1} label="Profit after tax" value={r.net} fmt={(v) => rs(v)} sub={r.net} /><Big i={2} label="You put in" value={r.deposited} fmt={(v) => rs(v)} sub={r.deposited} /><Big i={3} label="Tax withheld" value={r.tax} fmt={(v) => rs(v)} sub={r.tax} /></div>
        <div className="mt-5"><Label>Growth (before tax) — dashed is what you put in</Label><Spark pts={r.pts} /></div>
      </Panel>
    </div>
  )
}

function Gold() {
  const [p] = usePref('pk', 'prices', PRICES), [v, setV] = useState({ q: 1, u: 'tola', k: 24 })
  const U = [['tola', 'Tola', TOLA], ['masha', 'Masha', MASHA], ['ratti', 'Ratti', RATTI], ['g', 'Gram', 1], ['kg', 'Kilogram', 1000], ['oz', 'Troy ounce', OZ]]
  const unit = U.find((u) => u[0] === v.u) || U[0], karat = [18, 21, 22, 24].includes(Number(v.k)) ? Number(v.k) : 24
  const grams = n0(v.q) * unit[2], tolas = grams / TOLA, pricePer = (n0(p.gold) * karat) / 24
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <Panel>
        <Label>Convert a weight</Label>
        <div className="grid grid-cols-[1fr_auto] gap-3"><Num label="Amount" value={v.q} onChange={(x) => setV({ ...v, q: x })} /><div><span className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Unit</span><select aria-label="Weight unit" className="input" value={v.u} onChange={(e) => setV({ ...v, u: e.target.value })}>{U.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>
        <div className="mt-5 space-y-2">{U.map(([k, l, g], i) => <motion.div key={k} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SPRING, delay: i * 0.04 }} className="flex items-center justify-between rounded-xl px-4 py-2.5 border" style={{ borderColor: v.u === k ? 'var(--copper)' : 'var(--border)', background: v.u === k ? 'color-mix(in srgb, var(--copper) 8%, var(--surface))' : 'var(--surface)' }}><span className="text-[13px] font-semibold">{l}</span><span className="tabular-nums font-bold">{+(grams / g).toFixed(4)}</span></motion.div>)}</div>
        <Note>1 tola = {TOLA} g · 1 masha = {MASHA.toFixed(4)} g · 1 ratti = {RATTI.toFixed(4)} g · 12 masha = 1 tola · 8 ratti = 1 masha.</Note>
      </Panel>
      <Panel delay={0.08}>
        <Label>What is it worth?</Label>
        <Chips small value={karat} onChange={(k) => setV({ ...v, k })} options={[[24, '24K'], [22, '22K'], [21, '21K'], [18, '18K']]} />
        <div className="grid grid-cols-2 gap-3 mt-4"><Big i={0} tone label={`Gold value (${karat}K)`} value={tolas * pricePer} fmt={(x) => rs(x)} sub={tolas * pricePer} /><Big i={1} label="Same weight in silver" value={tolas * n0(p.silver)} fmt={(x) => rs(x)} sub={tolas * n0(p.silver)} /></div>
        <div className="mt-4 text-[13px] space-y-1.5" style={{ color: 'var(--muted)' }}><div>Gold price used: <b style={{ color: 'var(--ink)' }}>{rs(pricePer)}</b> per tola ({karat}K) · {rs(pricePer / TOLA, 0)} per gram</div><div>Edit the gold and silver prices on the Zakat tab; they are saved and shared here.</div><div>Rates shown by default are an example from {PRICES.asOf}; local sarafa rates move daily.</div></div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">{[['Zakat nisab · silver', NISAB_G.silver.toFixed(2) + ' g', '52.5 tola'], ['Zakat nisab · gold', NISAB_G.gold.toFixed(2) + ' g', '7.5 tola']].map(([k, a, b]) => <div key={k} className="rounded-xl p-3 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow !text-[9.5px]">{k}</div><div className="display font-semibold text-[20px]">{a}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{b}</div></div>)}</div>
      </Panel>
    </div>
  )
}

export default function PkMoney() {
  const [tab, setTab] = usePref('pk', 'tab', 'zakat')
  return (
    <div className="space-y-6">
      <Dock value={tab} onChange={setTab} items={TABS} cols={5} />
      <Swap k={tab}>{tab === 'zakat' ? <Zakat /> : tab === 'tax' ? <Tax /> : tab === 'loan' ? <Loan /> : tab === 'profit' ? <Profit /> : <Gold />}</Swap>
    </div>
  )
}
