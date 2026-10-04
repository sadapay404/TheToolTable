import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { loadRates, refreshAll, buildItems, convertMoney, fmtMoney, fiatSymbol, fiatCountries, ago, FAVOURITES, PAIRS, SNAPSHOT_DATE } from '../../lib/units/money'
import { Ico, ItemIcon, Spark, SwapButton, Picker, SelectChip, CopyBtn, Panel, Label, Seg, CountText, WordsPanel, usePersist, SPRING } from './parts'

const FILTERS = [['All', () => true], ['Fiat', (i) => i.kind === 'fiat'], ['Crypto', (i) => i.kind === 'crypto'], ['Top 25', (i) => i.kind === 'crypto' && i.rank && i.rank <= 25], ['Stablecoins', (i) => ['USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'PYUSD', 'USDS', 'TUSD'].includes(i.code)]]

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

function Status({ r, busy, run }) {
  const live = r.source === 'live', snap = r.source === 'snapshot'
  const col = busy ? 'var(--copper)' : live ? '#2f9c6b' : '#c98a1c'
  const label = busy ? 'Updating…' : live ? 'Live rates' : snap ? 'Offline snapshot' : 'Saved rates'
  const sub = snap ? `${SNAPSHOT_DATE} · approximate` : `crypto ${ago(r.cryptoAt)}`
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      <span className="inline-flex items-center gap-2 font-semibold"><span className={`w-2 h-2 rounded-full ${busy ? '' : 'ex-live-dot'}`} style={{ background: col }} /><span style={{ color: col }}>{label}</span></span>
      <span style={{ color: 'var(--muted)' }}>{sub}</span>
      <motion.button type="button" onClick={run} disabled={busy} whileHover={{ y: -1 }} whileTap={{ scale: 0.9 }} className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--ink)' }}><Ico n="refresh" s={13} className={busy ? 'ex-spin' : ''} />Refresh</motion.button>
      <AnimatePresence>{!busy && r.error && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: '#c98a1c' }}>{r.error === 'offline' ? 'Couldn’t reach the rate servers — showing saved rates.' : r.error === 'fiat' ? 'Fiat feed unreachable.' : 'Crypto feed unreachable.'}</motion.span>}</AnimatePresence>
    </motion.div>
  )
}

const fmtAmt = (s) => { const [i, d] = String(s).split('.'); return (/^\d+$/.test(i) ? Number(i).toLocaleString('en-US') : i) + (d !== undefined ? '.' + d : '') }

export default function CurrencyTab() {
  const { r, busy, run } = useRates()
  const items = useMemo(() => buildItems(r), [r])
  const by = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const [st, setSt] = usePersist('cur', { from: 'f:USD', to: 'f:PKR', amount: '1', extras: ['f:EUR', 'f:GBP', 'c:bitcoin'] })
  const [more, setMore] = useState('compare')
  const upd = (p) => setSt((s) => ({ ...s, ...p }))
  const a = by.get(st.from) || by.get('f:USD'), b = by.get(st.to) || by.get('f:PKR')
  const amt = parseFloat(String(st.amount).replace(/,/g, ''))
  const val = Number.isFinite(amt) ? convertMoney(amt, a, b) : NaN
  const unit = convertMoney(1, a, b), inv = convertMoney(1, b, a)
  const sid = useId().replace(/:/g, '')

  const pickItems = useMemo(() => items.map((i) => ({
    key: i.key, title: i.code, sub: i.name + (i.kind === 'fiat' && fiatCountries(i.code).label ? ' · ' + fiatCountries(i.code).label : ''), group: i.kind === 'fiat' ? 'Fiat currencies' : 'Crypto', icon: <ItemIcon item={i} size={34} />,
    meta: i.kind === 'crypto' ? '$' + fmtMoney(i.usd, 'crypto') : '', kind: i.kind, code: i.code, rank: i.rank,
    hay: (i.code + ' ' + i.name + ' ' + (i.kind === 'crypto' ? 'crypto coin token' : 'fiat currency money ' + fiatCountries(i.code).hay) + ' ' + i.key).toLowerCase(),
  })), [items])
  const filters = useMemo(() => FILTERS.map(([l, f]) => [l, (p) => f(p)]), [])
  const sparkData = useMemo(() => pairSpark(a, b), [a, b])
  const change = pairChange(a, b)
  const text = fmtMoney(val, b.kind)
  const sym = fiatSymbol(a.code)
  const swap = () => upd({ from: st.to, to: st.from, amount: Number.isFinite(val) ? String(Number(val.toPrecision(10))) : st.amount })
  const setAmt = (v) => { if (/^[0-9,]*\.?[0-9]*$/.test(v)) upd({ amount: v }) }
  const trig = (it) => ({ open, selected, onClick }) => <SelectChip open={open} onClick={onClick} icon={<ItemIcon item={by.get(it)} size={36} />} title={selected?.title} sub={selected?.sub} />
  const extras = (st.extras || []).map((k) => by.get(k)).filter(Boolean)
  const size = text.length > 17 ? 26 : text.length > 13 ? 32 : text.length > 10 ? 38 : 46

  return (
    <div className="space-y-6">
      <Status r={r} busy={busy} run={run} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <Panel>
          <Label>You have</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex items-baseline gap-2 border-b-2 pb-1 transition-colors focus-within:border-[var(--copper)] border-line">
              {sym && <span className="display text-[28px] opacity-40">{sym}</span>}
              <input value={fmtAmt(st.amount)} onChange={(e) => setAmt(e.target.value.replace(/,/g, ''))} inputMode="decimal" aria-label="Amount" className="display font-semibold bg-transparent outline-none w-full min-w-0" style={{ fontSize: 'clamp(30px,4.6vw,46px)', letterSpacing: '-0.03em' }} />
            </div>
            <Picker items={pickItems} value={st.from} onChange={(k) => upd({ from: k })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Search currencies & coins…" trigger={trig(st.from)} />
          </div>

          <div className="flex items-center gap-3 my-6"><span className="flex-1 h-px" style={{ background: 'var(--border)' }} /><SwapButton onClick={swap} /><span className="flex-1 h-px" style={{ background: 'var(--border)' }} /></div>

          <Label>You get</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 overflow-hidden">
              <CountText value={val} format={(v) => fmtMoney(v, b.kind)} className="display font-semibold block leading-tight tabular-nums" style={{ fontSize: `max(18px, min(${size}px, ${(100 / Math.max(text.length, 4)).toFixed(2)}vw))`, letterSpacing: '-0.03em', color: 'var(--copper)', whiteSpace: 'nowrap' }} />
            </div>
            <Picker items={pickItems} value={st.to} onChange={(k) => upd({ to: k })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Search currencies & coins…" trigger={trig(st.to)} />
          </div>

          <div className="mt-6 pt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line">
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>
              <div><b style={{ color: 'var(--ink)' }}>1 {a.code}</b> = <span className="mono tabular-nums">{fmtMoney(unit, b.kind)}</span> {b.code}</div>
              <div><b style={{ color: 'var(--ink)' }}>1 {b.code}</b> = <span className="mono tabular-nums">{fmtMoney(inv, a.kind)}</span> {a.code}</div>
            </div>
            <AnimatePresence>
              {sparkData && <motion.div key={a.key + b.key} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                <Spark data={sparkData} up={sparkData[sparkData.length - 1] >= sparkData[0]} w={96} h={34} id={'sp' + sid} />
                <div className="leading-tight"><Change v={change} big /><div className="text-[10.5px]" style={{ color: 'var(--muted)' }}>24h · 7-day line</div></div>
              </motion.div>}
            </AnimatePresence>
            <span className="ml-auto"><CopyBtn text={text.replace(/,/g, '')} label="Copy result" /></span>
          </div>
        </Panel>
        <WordsPanel value={text.replace(/\.0+$/, '')} unit={b.code} />
      </div>

      <Panel delay={0.15}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <Seg value={more} onChange={setMore} options={[['compare', 'Compare'], ['popular', 'Popular routes']]} />
          {more === 'compare' && extras.length < 8 && (
            <Picker items={pickItems.filter((p) => !(st.extras || []).includes(p.key))} value="" onChange={(k) => upd({ extras: [...(st.extras || []), k] })} storeId="cur" filters={filters} defaultPins={FAVOURITES} placeholder="Add a currency or coin…" width={360}
              trigger={({ onClick }) => <motion.button type="button" onClick={onClick} whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 border border-line text-[12.5px] font-semibold" style={{ background: 'var(--surface2)' }}><Ico n="plus" s={14} w={2.4} />Add</motion.button>} />
          )}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {more === 'compare' ? (
            <motion.div key="cmp" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
              <p className="text-[12.5px] mb-3" style={{ color: 'var(--muted)' }}>{Number.isFinite(amt) ? fmtAmt(st.amount) : '—'} {a.code} is worth…</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <AnimatePresence initial={false} mode="popLayout">
                  {extras.map((e, i) => {
                    const v = Number.isFinite(amt) ? convertMoney(amt, a, e) : NaN
                    return (
                      <motion.div key={e.key} layout initial={{ opacity: 0, scale: 0.85, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...SPRING, delay: i * 0.04 }} whileHover={{ y: -3 }} className="group relative rounded-2xl p-3.5 border border-line" style={{ background: 'var(--surface2)' }}>
                        <div className="flex items-center gap-2"><ItemIcon item={e} size={26} /><span className="text-[12px] font-bold">{e.code}</span></div>
                        <CountText value={v} format={(x) => fmtMoney(x, e.kind)} className="display block font-semibold text-[20px] mt-2 truncate tabular-nums" />
                        <button type="button" aria-label={'Remove ' + e.code} onClick={() => upd({ extras: st.extras.filter((k) => k !== e.key) })} className="absolute top-2 right-2 w-5 h-5 grid place-items-center rounded-full opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity" style={{ background: 'var(--border)' }}><Ico n="x" s={10} w={3} /></button>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
              {!extras.length && <div className="text-center py-6 text-[13px]" style={{ color: 'var(--muted)' }}>Add currencies to compare side by side.</div>}
            </motion.div>
          ) : (
            <motion.div key="pop" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex flex-wrap gap-2">
              {PAIRS.map(([x, y], i) => by.get(x) && by.get(y) && (
                <motion.button key={x + y} type="button" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: i * 0.03 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }} onClick={() => upd({ from: x, to: y })}
                  className="inline-flex items-center gap-2 rounded-full pl-1.5 pr-3.5 py-1.5 border border-line text-[12.5px] font-bold" style={{ background: st.from === x && st.to === y ? 'color-mix(in srgb, var(--copper) 16%, var(--surface))' : 'var(--surface2)' }}>
                  <span className="flex -space-x-2"><ItemIcon item={by.get(x)} size={24} /><ItemIcon item={by.get(y)} size={24} /></span>{by.get(x).code}<span style={{ color: 'var(--muted)' }}>→</span>{by.get(y).code}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>
      <p className="text-[11px] leading-relaxed px-1" style={{ color: 'var(--muted)' }}>Mid-market reference rates, not a trading quote — banks and exchanges add their own spread. Fiat: open.er-api.com (daily). Crypto: CoinGecko, falling back to CoinPaprika. Offline, the bundled {SNAPSHOT_DATE} snapshot is used and clearly marked.</p>
    </div>
  )
}
