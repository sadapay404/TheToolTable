import React, { useEffect, useMemo, useState } from 'react'
import { Field, Note, Select } from '../components/ui.jsx'
import { recentAction } from '../lib/utils.js'

const UNITS = {
  Length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, 'μm': 1e-6, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  Mass: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523, st: 6.35029318 },
  Volume: { L: 1, mL: 0.001, 'm³': 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.24, 'fl oz': 0.0295735295625, tbsp: 0.01478676478125, tsp: 0.00492892159375 },
  Speed: { 'm/s': 1, 'km/h': 1 / 3.6, mph: 0.44704, knot: 0.514444, 'ft/s': 0.3048, Mach: 340.29 },
  Storage: { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5, KiB: 1000, MiB: 1000 ** 2, GiB: 1000 ** 3 },
  Energy: { J: 1, kJ: 1000, cal: 4.184, kcal: 4184, Wh: 3600, kWh: 3.6e6, BTU: 1055.06, eV: 1.602e-19 },
  Time: { s: 1, min: 60, h: 3600, day: 86400, week: 604800, 'year (365d)': 31536000 },
}

const CRYPTO = { BTC: 'Bitcoin', ETH: 'Ethereum', USDT: 'Tether', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano', DOT: 'Polkadot', MATIC: 'Polygon' }

function convertTemp(v, from, to) {
  let c
  if (from === '°C') c = v
  else if (from === '°F') c = (v - 32) * 5 / 9
  else if (from === 'K') c = v - 273.15
  else c = (v - 32) * 5 / 9 + 273.15 // °R handled below not needed
  if (to === '°C') return c
  if (to === '°F') return c * 9 / 5 + 32
  if (to === 'K') return c + 273.15
  return c
}

const TEMP_UNITS = ['°C', '°F', 'K']

export default function UnitCurrency() {
  const [tab, setTab] = useState('currency')
  // unit state
  const [cat, setCat] = useState('Length')
  const [from, setFrom] = useState('m')
  const [to, setTo] = useState('ft')
  const [amount, setAmount] = useState('1')
  // currency state
  const [rates, setRates] = useState(null) // {date, fiat:{}, crypto:{}}
  const [netState, setNetState] = useState(navigator.onLine ? 'online' : 'offline')
  const [cFrom, setCFrom] = useState('USD')
  const [cTo, setCTo] = useState('EUR')
  const [cAmount, setCAmount] = useState('100')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const on = () => setNetState('online'), off = () => setNetState('offline')
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    (async () => {
      let cached = null
      try { cached = JSON.parse(localStorage.getItem('ttt-rates')) } catch {}
      if (cached) setRates(cached)
      const today = new Date().toDateString()
      const fresh = cached && cached.dateStr === today
      if (navigator.onLine && !fresh) {
        try {
          const [fiatRes, cryptoRes] = await Promise.all([
            fetch('https://open.er-api.com/v6/latest/USD').then((r) => r.json()),
            fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,binancecoin,solana,ripple,dogecoin,cardano,polkadot,matic-network&vs_currencies=usd').then((r) => r.json()).catch(() => null),
          ])
          const crypto = {}
          if (cryptoRes) {
            const map = { bitcoin: 'BTC', ethereum: 'ETH', tether: 'USDT', binancecoin: 'BNB', solana: 'SOL', ripple: 'XRP', dogecoin: 'DOGE', cardano: 'ADA', polkadot: 'DOT', 'matic-network': 'MATIC' }
            Object.entries(map).forEach(([k, sym]) => { if (cryptoRes[k]?.usd) crypto[sym] = 1 / cryptoRes[k].usd }) // per USD
          }
          const now = new Date()
          const next = {
            dateStr: now.toDateString(),
            pretty: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
            fiat: fiatRes.rates || {},
            crypto,
          }
          localStorage.setItem('ttt-rates', JSON.stringify(next))
          setRates(next)
        } catch {}
      }
    })()
  }, [netState])

  const currencyList = useMemo(() => {
    if (!rates) return []
    const list = Object.keys(rates.fiat).map((c) => ({ code: c, kind: 'fiat' }))
    Object.keys(rates.crypto || {}).forEach((c) => list.push({ code: c, kind: 'crypto' }))
    const q = search.toUpperCase()
    return list.filter((c) => !q || c.code.includes(q) || (CRYPTO[c.code] || '').toUpperCase().includes(q)).sort((a, b) => a.code.localeCompare(b.code))
  }, [rates, search])

  function rateUSD(code) {
    if (!rates) return null
    if (code === 'USD') return 1
    if (rates.crypto?.[code]) return rates.crypto[code] // USD per 1 crypto unit inverted at use
    return rates.fiat[code] ?? null
  }

  const cResult = useMemo(() => {
    if (!rates) return null
    const v = parseFloat(cAmount)
    if (!Number.isFinite(v)) return null
    let usd
    if (CRYPTO[cFrom]) usd = v / rates.crypto[cFrom]
    else usd = v / (rates.fiat[cFrom] || 1)
    if (CRYPTO[cTo]) return usd * (rates.crypto[cTo] || 0)
    return usd * (rates.fiat[cTo] || 0)
  }, [rates, cAmount, cFrom, cTo])

  const uResult = useMemo(() => {
    const v = parseFloat(amount)
    if (!Number.isFinite(v)) return ''
    if (cat === 'Temperature') return convertTemp(v, from, to)
    const f = UNITS[cat][from], t = UNITS[cat][to]
    if (!f || !t) return ''
    return (v * f) / t
  }, [cat, from, to, amount])

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button className="chip" data-on={tab === 'currency'} onClick={() => setTab('currency')}>💱 Currency</button>
        <button className="chip" data-on={tab === 'units'} onClick={() => setTab('units')}>📏 Units</button>
      </div>

      {tab === 'currency' && (
        <>
          {netState === 'offline' || !rates ? (
            rates ? <Note tone="warn">You're offline — using exchange rates cached on {rates.pretty}.</Note>
              : <Note tone="warn">You're offline and no cached rates exist yet. Connect once to enable currency conversion.</Note>
          ) : (
            <Note tone="ok">Live rates · synced {rates.pretty} · auto-refreshes once daily on first open.</Note>
          )}

          <div className="card p-5 grid md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <Field label="From">
              <Select value={cFrom} onChange={setCFrom} options={currencyList.map((c) => ({ v: c.code, l: `${c.code}${c.kind === 'crypto' ? ' ₿' : ''}` }))} />
            </Field>
            <button className="btn mb-0.5" onClick={() => { setCFrom(cTo); setCTo(cFrom) }}>⇄</button>
            <Field label="To">
              <Select value={cTo} onChange={setCTo} options={currencyList.map((c) => ({ v: c.code, l: `${c.code}${c.kind === 'crypto' ? ' ₿' : ''}` }))} />
            </Field>
          </div>

          <div className="card p-5">
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label={`Amount (${cFrom})`}>
                <input className="input text-2xl font-extrabold mono" value={cAmount} onChange={(e) => setCAmount(e.target.value)} inputMode="decimal" />
              </Field>
              <div>
                <div className="label mb-1.5">Result ({cTo})</div>
                <div className="text-2xl font-extrabold mono truncate" style={{ color: 'var(--accent)' }}>
                  {cResult == null ? '—' : cResult.toLocaleString(undefined, { maximumFractionDigits: CRYPTO[cTo] ? 8 : 4 })}
                </div>
                {cResult != null && parseFloat(cAmount) === 1 && (
                  <button className="text-xs mt-1 font-semibold" style={{ color: 'var(--muted)' }} onClick={() => recentAction(`1 ${cFrom} = ${cResult.toFixed(4)} ${cTo}`)}>
                    1 {cFrom} ≈ {cResult.toLocaleString(undefined, { maximumFractionDigits: 6 })} {cTo}
                  </button>
                )}
              </div>
            </div>
            <Field label={`Search ${currencyList.length}+ currencies & crypto`} className="mt-5">
              <input className="input" placeholder="USD, EUR, BTC, Bitcoin…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      {tab === 'units' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.keys(UNITS).concat(['Temperature']).map((c) => <button key={c} className="chip" data-on={cat === c} onClick={() => { setCat(c); const keys = c === 'Temperature' ? TEMP_UNITS : Object.keys(UNITS[c]); setFrom(keys[0]); setTo(keys[1]) }}>{c}</button>)}
          </div>
          <div className="card p-5 grid md:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            <Field label="From">
              <Select value={from} onChange={setFrom} options={cat === 'Temperature' ? TEMP_UNITS : Object.keys(UNITS[cat])} />
            </Field>
            <button className="btn" onClick={() => { setFrom(to); setTo(from) }}>⇄</button>
            <Field label="To">
              <Select value={to} onChange={setTo} options={cat === 'Temperature' ? TEMP_UNITS : Object.keys(UNITS[cat])} />
            </Field>
          </div>
          <div className="card p-5 grid sm:grid-cols-2 gap-5">
            <Field label={`Amount (${from})`}>
              <input className="input text-2xl font-extrabold mono" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <div>
              <div className="label mb-1.5">Result ({to})</div>
              <div className="text-2xl font-extrabold mono truncate" style={{ color: 'var(--accent)' }}>
                {typeof uResult === 'number' ? uResult.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
