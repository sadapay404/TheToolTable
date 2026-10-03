import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadRates, refreshAll, buildItems, convertMoney, fmtMoney, fiatSymbol, ago, FAVOURITES, PAIRS, SNAPSHOT_DATE } from '../../lib/units/money'
import { Ico, ItemIcon, FlapBoard, Spark, Chips, SwapButton, Pass, Picker, StubTrigger, CopyBtn, usePersist, Stagger, SPRING } from './parts'

const FILTERS = [['All', () => true], ['Fiat', (i) => i.kind === 'fiat'], ['Crypto', (i) => i.kind === 'crypto'], ['Top 25', (i) => i.kind === 'crypto' && i.rank && i.rank <= 25], ['Stablecoins', (i) => ['USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'PYUSD', 'USDS', 'TUSD'].includes(i.code)]]
const TAPE = ['f:USD', 'f:EUR', 'f:GBP', 'f:SAR', 'f:AED', 'f:INR', 'f:JPY', 'c:bitcoin', 'c:ethereum', 'c:solana', 'c:ripple', 'c:dogecoin', 'c:tether']

export function useRates() {
  const [r, setR] = useState(() => loadRates())
  const [busy, setBusy] = useState(false)
  const ref = useRef(r); ref.current = r
  const run = useCallback(async () => {
    setBusy(true)
    try { setR(await refreshAll(ref.current)) } catch { setR((x) => ({ ...x, error: 'offline' })) }
    setBusy(false)
  }, [])
  useEffect(() => {
    const stale = () => !ref.current.cryptoAt || Date.now() - ref.current.cryptoAt > 10 * 60e3 || !ref.current.fiatAt || Date.now() - ref.current.fiatAt > 6 * 3600e3
    if (stale()) run()
    const id = setInterval(() => { if (!document.hidden && Date.now() - (ref.current.cryptoAt || 0) > 5 * 60e3) run() }, 60e3)
    return () => clearInterval(id)
  }, [run])
  return { r, busy, run }
}

export function pairSpark(a, b) {
  const sa = a.spark, sb = b.spark
  if (!sa && !sb) return null
  const n = Math.min(sa ? sa.length : 1e9, sb ? sb.length : 1e9)
  return Array.from({ length: n }, (_, i) => (sa ? sa[sa.length - n + i] : a.usd) / (sb ? sb[sb.length - n + i] : b.usd))
}
const pairChange = (a, b) => (a.ch24 == null && b.ch24 == null ? null : ((1 + (a.ch24 || 0) / 100) / (1 + (b.ch24 || 0) / 100) - 1) * 100)

function Change({ v, big }) {
  if (v == null || !Number.isFinite(v)) return null
  const up = v >= 0
  return <span className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${big ? 'text-[13px]' : 'text-[11px]'}`} style={{ color: up ? '#2f9c6b' : '#c3423f' }}><Ico n={up ? 'up' : 'down'} s={big ? 14 : 11} w={3} />{Math.abs(v).toFixed(2)}%</span>
}

function StatusPill({ r, busy, run }) {
  const live = r.source === 'live'
  const snap = r.source === 'snapshot'
  const label = busy ? 'Updating rates…' : live ? 'Live rates' : snap ? 'Offline snapshot' : 'Saved rates'
  const col = busy ? 'var(--copper)' : live ? '#2f9c6b' : '#c98a1c'
  const sub = snap ? `${SNAPSHOT_DATE} · approximate` : `crypto ${ago(r.cryptoAt)} · fiat ${r.fiatAt ? new Date(r.fiatAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}`
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <motion.div layout className="inline-flex items-center gap-2 rounded-full pl-3 pr-3.5 py-1.5 border border-line text-[12px] font-semibold" style={{ background: 'var(--surface)' }}>
        <span className="relative w-2.5 h-2.5"><span className={`absolute inset-0 rounded-full ${busy ? '' : 'ex-live-dot'}`} style={{ background: col }} /></span>
        <span style={{ color: col }}>{label}</span><span className="font-normal hidden sm:inline" style={{ color: 'var(--muted)' }}>{sub}</span>
      </motion.div>
      <motion.button type="button" onClick={run} disabled={busy} whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-line text-[12px] font-semibold" style={{ background: 'var(--surface)' }}>
        <Ico n="refresh" s={14} className={busy ? 'ex-spin' : ''} />Refresh
      </motion.button>
      <AnimatePresence>
        {!busy && r.error && <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-[11.5px]" style={{ color: '#c98a1c' }}>
          {r.error === 'offline' ? 'Couldn’t reach the rate servers — showing saved rates.' : r.error === 'fiat' ? 'Fiat feed unreachable; crypto is live.' : 'Crypto feed unreachable; fiat is live.'}
        </motion.span>}
      </AnimatePresence>
    </div>
  )
}

function Tape({ items, onPick, toKey }) {
  const by = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const to = by.get(toKey) || by.get('f:PKR')
  const rows = TAPE.map((k) => by.get(k)).filter(Boolean).map((it) => {
    const crypto = it.kind === 'crypto'
    const val = crypto ? it.usd : convertMoney(1, it, to)
    return { it, txt: crypto ? '$' + fmtMoney(val, 'crypto') : fmtMoney(val), unit: crypto ? 'USD' : to.code }
  })
  const strip = (suffix) => rows.map(({ it, txt, unit }) => (
    <button key={suffix + it.key} type="button" onClick={() => onPick(it.key)} className="inline-flex items-center gap-2 px-5 shrink-0 hover:opacity-100 opacity-90 transition-opacity">
      <span className="font-bold text-[12px] tracking-wide" style={{ color: '#f4ead6' }}>{it.code}</span>
      <span className="mono text-[12px] tabular-nums" style={{ color: '#d6c8ae' }}>{txt} <span className="opacity-60 text-[10px]">{unit}</span></span>
      {it.ch24 != null && <Change v={it.ch24} />}
      <span className="ml-3 opacity-25" style={{ color: '#f4ead6' }}>◆</span>
    </button>
  ))
  return (
    <motion.div className="ex-ticker-wrap relative overflow-hidden rounded-2xl ex-scrollfade" initial={{ opacity: 0, scaleY: 0.4 }} animate={{ opacity: 1, scaleY: 1 }} transition={SPRING}
      style={{ background: 'linear-gradient(180deg,#1b1612,#110d0a)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06), 0 10px 24px -14px rgba(0,0,0,.6)' }}>
      <div className="ex-ticker flex w-max py-2.5">{strip('a')}{strip('b')}</div>
    </motion.div>
  )
}

const AMT = { fiat: ['1', '10', '100', '1000', '10000', '100000'], crypto: ['0.01', '0.1', '1', '10', '100'] }
const fmtAmt = (s) => (/^\d+$/.test(s) ? Number(s).toLocaleString('en-US') : s)

export default function CurrencyTab() {
  const { r, busy, run } = useRates()
  const items = useMemo(() => buildItems(r), [r])
  const by = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const [st, setSt] = usePersist('cur', { from: 'f:USD', to: 'f:PKR', amount: '1', extras: ['f:EUR', 'f:GBP', 'c:bitcoin'] })
  const upd = (p) => setSt((s) => ({ ...s, ...p }))
  const a = by.get(st.from) || by.get('f:USD'), b = by.get(st.to) || by.get('f:PKR')
  const amt = parseFloat(String(st.amount).replace(/,/g, ''))
  const val = Number.isFinite(amt) ? convertMoney(amt, a, b) : NaN
  const unit = convertMoney(1, a, b), inv = convertMoney(1, b, a)
  const sid = useId().replace(/:/g, '')

  const pickItems = useMemo(() => items.map((i) => ({
    key: i.key, title: i.code, sub: i.name, group: i.kind === 'fiat' ? 'Fiat currencies' : 'Crypto', icon: <ItemIcon item={i} size={34} />,
    meta: i.kind === 'crypto' ? '$' + fmtMoney(i.usd, 'crypto') : '', kind: i.kind, code: i.code, rank: i.rank,
    hay: (i.code + ' ' + i.name + ' ' + (i.kind === 'crypto' ? 'crypto coin token' : 'fiat currency money') + ' ' + i.key).toLowerCase(),
  })), [items])
  const filters = useMemo(() => FILTERS.map(([l, f]) => [l, (p) => f(p)]), [])

  const sparkData = useMemo(() => pairSpark(a, b), [a, b])
  const change = pairChange(a, b)
  const text = fmtMoney(val, b.kind)
  const sym = fiatSymbol(a.code)
  const swap = () => upd({ from: st.to, to: st.from, amount: Number.isFinite(val) ? String(Number(val.toPrecision(10))) : st.amount })
  const setAmt = (v) => { if (/^[0-9,]*\.?[0-9]*$/.test(v)) upd({ amount: v }) }

  const trig = (it, label) => ({ open, selected, onClick }) => <StubTrigger open={open} onClick={onClick} icon={<ItemIcon item={by.get(it)} size={44} />} title={selected?.title} sub={selected?.sub} tag={by.get(it)?.kind === 'crypto' ? 'Crypto' : null} />
  const extras = (st.extras || []).map((k) => by.get(k)).filter(Boolean)

  return (
    <div className="space-y-5">
      <Tape items={items} toKey={st.to} onPick={(k) => upd({ from: k })} />
      <Stagger i={0}><StatusPill r={r} busy={busy} run={run} /></Stagger>

      <Pass
        left={<>
          <div className="eyebrow mb-3">From</div>
          <Picker items={pickItems} value={st.from} onChange={(k) => upd({ from: k })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Search 400+ currencies & coins…" trigger={trig(st.from)} />
          <label className="block mt-5">
            <span className="label">Amount</span>
            <div className="mt-1.5 flex items-baseline gap-2 border-b-2 pb-1 transition-colors focus-within:border-[var(--copper)] border-line">
              <span className="display text-[30px] opacity-40 min-w-[1ch]">{sym}</span>
              <input value={fmtAmt(st.amount)} onChange={(e) => setAmt(e.target.value.replace(/,/g, ''))} inputMode="decimal" className="display font-semibold bg-transparent outline-none w-full min-w-0" style={{ fontSize: 'clamp(34px,5vw,50px)', letterSpacing: '-0.03em' }} aria-label="Amount" />
            </div>
          </label>
          <div className="flex flex-wrap gap-1.5 mt-4">
            {AMT[a.kind].map((q, i) => (
              <motion.button key={q} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.3 + i * 0.04 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.88 }} onClick={() => upd({ amount: q })}
                className="mono text-[11.5px] font-semibold px-2.5 py-1 rounded-lg border border-line" style={{ background: st.amount === q ? 'var(--ink)' : 'var(--surface)', color: st.amount === q ? 'var(--bg)' : 'var(--muted)' }}>{fmtAmt(q)}</motion.button>
            ))}
          </div>
        </>}
        mid={<SwapButton onClick={swap} />}
        right={<>
          <div className="eyebrow mb-3">To</div>
          <Picker items={pickItems} value={st.to} onChange={(k) => upd({ to: k })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Search 400+ currencies & coins…" trigger={trig(st.to)} />
          <div className="mt-5">
            <FlapBoard text={text} h={74} minChars={6} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
              <div><b style={{ color: 'var(--ink)' }}>1 {a.code}</b> = <span className="mono tabular-nums">{fmtMoney(unit, b.kind)}</span> {b.code}</div>
              <div className="mt-0.5"><b style={{ color: 'var(--ink)' }}>1 {b.code}</b> = <span className="mono tabular-nums">{fmtMoney(inv, a.kind)}</span> {a.code}</div>
            </div>
            <CopyBtn text={text.replace(/,/g, '')} label="Copy result" />
          </div>
        </>}
      />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] items-start">
        <Stagger i={2}>
          <div className="rounded-3xl border border-line p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center justify-between mb-4">
              <div><div className="eyebrow">Also convert to</div><div className="text-[12px] mt-1" style={{ color: 'var(--muted)' }}>{amt >= 0 ? fmtAmt(st.amount) : '—'} {a.code} in your other currencies</div></div>
              {extras.length < 8 && (
                <Picker items={pickItems.filter((p) => !(st.extras || []).includes(p.key))} value="" onChange={(k) => upd({ extras: [...(st.extras || []), k] })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Add a currency or coin…" width={360}
                  trigger={({ onClick }) => <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 border border-line text-[12px] font-semibold" style={{ background: 'var(--surface2)' }}><Ico n="plus" s={14} w={2.4} />Add</motion.button>} />
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {extras.map((e, i) => {
                  const v = Number.isFinite(amt) ? convertMoney(amt, a, e) : NaN
                  return (
                    <motion.div key={e.key} layout initial={{ opacity: 0, scale: 0.85, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...SPRING, delay: i * 0.04 }} whileHover={{ y: -3 }}
                      className="group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 border border-line" style={{ background: 'var(--surface2)' }}>
                      <ItemIcon item={e} size={34} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="text-[11.5px] font-bold" style={{ color: 'var(--muted)' }}>{e.code}</div>
                        <AnimatePresence mode="popLayout" initial={false}><motion.div key={fmtMoney(v, e.kind)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.16 }} className="display font-semibold text-[19px] truncate tabular-nums">{fmtMoney(v, e.kind)}</motion.div></AnimatePresence>
                      </div>
                      <button type="button" aria-label={'Remove ' + e.code} onClick={() => upd({ extras: st.extras.filter((k) => k !== e.key) })} className="absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity" style={{ background: 'var(--border)' }}><Ico n="x" s={10} w={3} /></button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
            {!extras.length && <div className="text-center py-8 text-[13px]" style={{ color: 'var(--muted)' }}>Add currencies to see them side by side.</div>}
          </div>
        </Stagger>

        <div className="space-y-5">
          <Stagger i={3}>
            <div className="rounded-3xl border border-line p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              <div className="flex items-center justify-between">
                <div className="eyebrow">{a.code} → {b.code}</div>
                {change != null && <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--muted)' }}>24h <Change v={change} big /></div>}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 min-h-[60px]">
                <div>
                  <div className="display text-[28px] font-semibold tabular-nums leading-none">{fmtMoney(unit, b.kind)}</div>
                  <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>per 1 {a.code}</div>
                </div>
                <AnimatePresence mode="wait">
                  {sparkData ? <motion.div key={a.key + b.key + (r.cryptoAt || 0)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Spark data={sparkData} up={sparkData[sparkData.length - 1] >= sparkData[0]} w={150} h={52} id={'sp' + sid} /><div className="text-[10px] text-right mt-1" style={{ color: 'var(--muted)' }}>7 days</div></motion.div>
                    : <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[11px] max-w-[130px] text-right leading-snug" style={{ color: 'var(--muted)' }}>{a.kind === 'fiat' && b.kind === 'fiat' ? 'Fiat rates update daily.' : r.source === 'live' ? '' : 'Chart appears when live.'}</motion.div>}
                </AnimatePresence>
              </div>
            </div>
          </Stagger>
          <Stagger i={4}>
            <div className="rounded-3xl border border-line p-5 sm:p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              <div className="eyebrow mb-3">Popular routes</div>
              <div className="flex flex-wrap gap-2">
                {PAIRS.map(([x, y], i) => by.get(x) && by.get(y) && (
                  <motion.button key={x + y} type="button" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 0.4 + i * 0.03 }} whileHover={{ y: -3, scale: 1.04 }} whileTap={{ scale: 0.92 }} onClick={() => upd({ from: x, to: y })}
                    className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 border border-line text-[12px] font-bold" style={{ background: st.from === x && st.to === y ? 'color-mix(in srgb, var(--copper) 16%, var(--surface))' : 'var(--surface2)' }}>
                    <span className="flex -space-x-2"><ItemIcon item={by.get(x)} size={22} /><ItemIcon item={by.get(y)} size={22} /></span>{by.get(x).code}<span style={{ color: 'var(--muted)' }}>→</span>{by.get(y).code}
                  </motion.button>
                ))}
              </div>
            </div>
          </Stagger>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--muted)' }}>Mid-market reference rates, not a trading quote — banks, exchanges and card networks add their own spread. Fiat: open.er-api.com (daily). Crypto: CoinGecko, falling back to CoinPaprika. Offline, the bundled {SNAPSHOT_DATE} snapshot is used and clearly marked.</p>
    </div>
  )
}
