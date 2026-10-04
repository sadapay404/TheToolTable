// Exchange-rate data: bundled snapshot (3 Oct 2026) → cached → live.  Fiat: open.er-api.com.  Crypto: CoinGecko (top 250), CoinPaprika as a fallback.
// Everything converts through USD: a fiat rate is "units per USD", a coin price is "USD per coin".

export const SNAPSHOT_DATE = '3 Oct 2026'
export const FIAT_SNAPSHOT = {"USD":1.0,"AED":3.6725,"AFN":64.906705,"ALL":81.333182,"AMD":362.958561,"ANG":1.79,"AOA":927.380553,"ARS":1523.0868,"AUD":1.438733,"AWG":1.79,"AZN":1.699497,"BAM":1.73825,"BBD":2.0,"BDT":122.945747,"BGN":1.73825,"BHD":0.376,"BIF":3002.602977,"BMD":1.0,"BND":1.279492,"BOB":12.034388,"BRL":5.222334,"BSD":1.0,"BTN":96.374911,"BWP":14.155132,"BYN":3.008132,"BZD":2.0,"CAD":1.424002,"CDF":2309.709077,"CHF":0.828716,"CLF":0.024844,"CLP":982.005858,"CNH":6.705816,"CNY":6.714383,"COP":3311.925714,"CRC":456.70663,"CUP":24.0,"CVE":97.998374,"CZK":21.721265,"DJF":177.721,"DKK":6.647039,"DOP":59.592925,"DZD":133.860402,"EGP":52.28469,"ERN":15.0,"ETB":162.838185,"EUR":0.888752,"FJD":2.244184,"FKP":0.756033,"FOK":6.644098,"GBP":0.756313,"GEL":2.602365,"GGP":0.756033,"GHS":11.596233,"GIP":0.756033,"GMD":74.407237,"GNF":8792.486743,"GTQ":7.637735,"GYD":209.20569,"HKD":7.846892,"HNL":26.845764,"HRK":6.696311,"HTG":130.788247,"HUF":327.468115,"IDR":17883.045051,"ILS":3.054198,"IMP":0.756033,"INR":96.372564,"IQD":1310.218099,"IRR":776253.24865,"ISK":121.776475,"JEP":0.756033,"JMD":158.498014,"JOD":0.709,"JPY":157.81511,"KES":129.560263,"KGS":87.477021,"KHR":4053.389755,"KID":1.438211,"KMF":437.237922,"KRW":1347.389067,"KWD":0.308774,"KYD":0.833333,"KZT":444.076115,"LAK":22287.303327,"LBP":89500.0,"LKR":330.410801,"LRD":171.47516,"LSL":16.658514,"LYD":6.394321,"MAD":9.880556,"MDL":17.784162,"MGA":4399.686067,"MKD":54.280014,"MMK":2096.721708,"MNT":3636.873725,"MOP":8.082411,"MRU":39.963167,"MUR":47.841597,"MVR":15.442218,"MWK":1746.943793,"MXN":18.213944,"MYR":4.08426,"MZN":63.834676,"NAD":16.658514,"NGN":1330.635588,"NIO":36.795866,"NOK":9.621335,"NPR":154.199857,"NZD":1.781371,"OMR":0.384497,"PAB":1.0,"PEN":3.442651,"PGK":4.474387,"PHP":62.607736,"PKR":276.817029,"PLN":3.889203,"PYG":5838.227953,"QAR":3.64,"RON":4.740344,"RSD":104.212183,"RUB":83.502601,"RWF":1478.511152,"SAR":3.75,"SBD":7.953138,"SCR":14.753875,"SDG":510.50994,"SEK":10.042202,"SGD":1.279427,"SHP":0.756033,"SLE":24.654462,"SLL":24654.462165,"SOS":571.373691,"SRD":37.746714,"SSP":5657.078371,"STN":21.774454,"SYP":121.808939,"SZL":16.658514,"THB":33.555074,"TJS":9.225378,"TMT":3.50034,"TND":2.96609,"TOP":2.385505,"TRY":49.134891,"TTD":6.742441,"TVD":1.438211,"TWD":31.859608,"TZS":2648.201265,"UAH":44.954615,"UGX":3902.235756,"UYU":40.293339,"UZS":11813.002958,"VES":871.3689,"VND":25953.963716,"VUV":119.911806,"WST":2.740625,"XAF":582.983896,"XCD":2.7,"XCG":1.79,"XDR":0.739382,"XOF":582.983896,"XPF":106.056699,"YER":236.354385,"ZAR":16.659088,"ZMW":19.698197,"ZWG":26.7653,"ZWL":26.7653}
// [id, symbol, name, usd]
export const CRYPTO_SNAPSHOT = [
  ['bitcoin', 'BTC', 'Bitcoin', 84623],
  ['ethereum', 'ETH', 'Ethereum', 2676.65],
  ['tether', 'USDT', 'Tether', 0.999908],
  ['binancecoin', 'BNB', 'BNB', 766.94],
  ['ripple', 'XRP', 'XRP', 1.49],
  ['usd-coin', 'USDC', 'USDC', 0.999946],
  ['solana', 'SOL', 'Solana', 119.57],
  ['tron', 'TRX', 'TRON', 0.334947],
  ['dogecoin', 'DOGE', 'Dogecoin', 0.093047],
  ['cardano', 'ADA', 'Cardano', 0.246609],
  ['hyperliquid', 'HYPE', 'Hyperliquid', 88.63],
  ['bitcoin-cash', 'BCH', 'Bitcoin Cash', 309.75],
  ['chainlink', 'LINK', 'Chainlink', 14.02],
  ['stellar', 'XLM', 'Stellar', 0.215349],
  ['litecoin', 'LTC', 'Litecoin', 69.13],
  ['avalanche-2', 'AVAX', 'Avalanche', 10.92],
  ['shiba-inu', 'SHIB', 'Shiba Inu', 5.71e-06],
  ['sui', 'SUI', 'Sui', 1.16],
  ['hedera-hashgraph', 'HBAR', 'Hedera', 0.101437],
  ['the-open-network', 'TON', 'Toncoin', 1.49],
  ['polkadot', 'DOT', 'Polkadot', 1.15],
  ['monero', 'XMR', 'Monero', 546.3],
  ['uniswap', 'UNI', 'Uniswap', 9.24],
  ['near', 'NEAR', 'NEAR Protocol', 4.72],
  ['aave', 'AAVE', 'Aave', 179.23],
  ['pepe', 'PEPE', 'Pepe', 4.25e-06],
  ['ethereum-classic', 'ETC', 'Ethereum Classic', 8.84],
  ['internet-computer', 'ICP', 'Internet Computer', 3.3],
  ['cosmos', 'ATOM', 'Cosmos', 1.68],
  ['algorand', 'ALGO', 'Algorand', 0.126104],
  ['filecoin', 'FIL', 'Filecoin', 1.054],
  ['arbitrum', 'ARB', 'Arbitrum', 0.197651],
  ['aptos', 'APT', 'Aptos', 0.798521],
  ['vechain', 'VET', 'VeChain', 0.00858695],
  ['dai', 'DAI', 'Dai', 0.999851],
  ['matic-network', 'POL', 'Polygon', 0.126156],
  ['optimism', 'OP', 'Optimism', 0.131587],
  ['render-token', 'RENDER', 'Render', 1.96],
  ['bonk', 'BONK', 'Bonk', 3.64e-06],
  ['kaspa', 'KAS', 'Kaspa', 0.04229835]
]

const FLAG_PAIRS = 'USD us AED ae AFN af ALL al AMD am ANG cw AOA ao ARS ar AUD au AWG aw AZN az BAM ba BBD bb BDT bd BGN bg BHD bh BIF bi BMD bm BND bn BOB bo BRL br BSD bs BTN bt BWP bw BYN by BZD bz CAD ca CDF cd CHF ch CLF cl CLP cl CNH cn CNY cn COP co CRC cr CUP cu CVE cv CZK cz DJF dj DKK dk DOP do DZD dz EGP eg ERN er ETB et EUR eu FJD fj FKP fk FOK fo GBP gb GEL ge GGP gg GHS gh GIP gi GMD gm GNF gn GTQ gt GYD gy HKD hk HNL hn HRK hr HTG ht HUF hu IDR id ILS il IMP im INR in IQD iq IRR ir ISK is JEP je JMD jm JOD jo JPY jp KES ke KGS kg KHR kh KID ki KMF km KRW kr KWD kw KYD ky KZT kz LAK la LBP lb LKR lk LRD lr LSL ls LYD ly MAD ma MDL md MGA mg MKD mk MMK mm MNT mn MOP mo MRU mr MUR mu MVR mv MWK mw MXN mx MYR my MZN mz NAD na NGN ng NIO ni NOK no NPR np NZD nz OMR om PAB pa PEN pe PGK pg PHP ph PKR pk PLN pl PYG py QAR qa RON ro RSD rs RUB ru RWF rw SAR sa SBD sb SCR sc SDG sd SEK se SGD sg SHP sh SLE sl SLL sl SOS so SRD sr SSP ss STN st SYP sy SZL sz THB th TJS tj TMT tm TND tn TOP to TRY tr TTD tt TVD tv TWD tw TZS tz UAH ua UGX ug UYU uy UZS uz VES ve VND vn VUV vu WST ws XCG cw XPF pf YER ye ZAR za ZMW zm ZWG zw ZWL zw'.split(' ')
export const FIAT_FLAG = Object.fromEntries(FLAG_PAIRS.reduce((a, v, i) => (i % 2 ? a : a.concat([[v, FLAG_PAIRS[i + 1]]])), []))
const NAME_FIX = { CNH: 'Chinese Yuan (offshore)', FOK: 'Faroese Króna', KID: 'Kiribati Dollar', TVD: 'Tuvaluan Dollar', GGP: 'Guernsey Pound', IMP: 'Manx Pound', JEP: 'Jersey Pound', XCG: 'Caribbean Guilder', ZWG: 'Zimbabwe Gold', CLF: 'Chilean Unit of Account', XDR: 'IMF Special Drawing Rights', SLL: 'Sierra Leonean Leone (old)', ZWL: 'Zimbabwean Dollar (old)', XOF: 'West African CFA Franc', XAF: 'Central African CFA Franc', XPF: 'CFP Franc', XCD: 'East Caribbean Dollar' }
let dn = null
try { dn = new Intl.DisplayNames(['en'], { type: 'currency' }) } catch {}
export const fiatName = (code) => NAME_FIX[code] || (dn && dn.of(code)) || code

/* ---- which countries use each currency (so "Italy", "Germany", "UAE" all find their money) ---- */
const SHARED = {
  EUR: 'DE FR IT ES NL AT BE HR CY EE FI GR IE LV LT LU MT PT SK SI AD MC SM VA ME XK',
  USD: 'US EC SV PA PR GU VI AS MP TL PW FM MH BQ TC VG',
  XOF: 'BJ BF CI GW ML NE SN TG', XAF: 'CM CF TD CG GQ GA', XCD: 'AG AI DM GD KN LC VC MS', XPF: 'PF NC WF',
  XCG: 'CW SX', ANG: 'CW SX', AUD: 'AU CX CC NF KI NR TV', NZD: 'NZ CK NU TK PN', CHF: 'CH LI', DKK: 'DK GL FO',
  GBP: 'GB GG JE IM GS', ILS: 'IL PS', MAD: 'MA EH', ZAR: 'ZA LS NA SZ', INR: 'IN BT', CNH: 'HK MO', FOK: 'FO',
}
const ALIAS = { US: 'usa america american united states', GB: 'uk u.k. england britain british scotland wales', AE: 'uae emirates dubai abu dhabi',
  SA: 'ksa saudi arabia', KR: 'south korea korean', KP: 'north korea', CZ: 'czechia czech republic', MM: 'burma', CI: 'ivory coast', TR: 'turkey turkiye',
  NL: 'holland dutch', DE: 'deutschland', CH: 'swiss', ES: 'spain', PK: 'pak', IN: 'bharat', RU: 'russian', CN: 'china chinese', EU: 'europe european union eurozone' }
let rn = null
try { rn = new Intl.DisplayNames(['en'], { type: 'region' }) } catch {}
const regionName = (r) => { try { return (rn && rn.of(r)) || r } catch { return r } }
const _cc = {}
export function fiatCountries(code) {
  if (_cc[code]) return _cc[code]
  const set = new Set((SHARED[code] || '').split(' ').filter(Boolean))
  const f = (FIAT_FLAG[code] || '').toUpperCase()
  if (f.length === 2 && f !== 'EU') set.add(f)
  const list = [...set].map((r) => ({ r, name: regionName(r) })).filter((c) => c.name && c.name.length > 2)
  const hay = list.map((c) => c.name + ' ' + (ALIAS[c.r] || '')).join(' ').toLowerCase() + (code === 'EUR' ? ' ' + ALIAS.EU : '')
  return (_cc[code] = { list, hay, label: list.length === 0 ? '' : list.length <= 2 ? list.map((c) => c.name).join(', ') : list.slice(0, 3).map((c) => c.name).join(', ') + ` +${list.length - 3}` })
}
let symFmt = {}
export function fiatSymbol(code) {
  if (symFmt[code] !== undefined) return symFmt[code]
  try { const p = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(1).find((x) => x.type === 'currency'); symFmt[code] = p && p.value !== code ? p.value : '' } catch { symFmt[code] = '' }
  return symFmt[code]
}

export const FAVOURITES = ['f:USD', 'f:PKR', 'f:EUR', 'f:GBP', 'f:INR', 'f:AED', 'f:SAR', 'f:CNY', 'f:JPY', 'f:CAD', 'f:AUD', 'c:bitcoin', 'c:ethereum', 'c:tether', 'c:solana']
export const PAIRS = [['f:USD', 'f:PKR'], ['f:EUR', 'f:USD'], ['f:GBP', 'f:PKR'], ['f:SAR', 'f:PKR'], ['f:AED', 'f:PKR'], ['f:USD', 'f:INR'], ['c:bitcoin', 'f:USD'], ['c:ethereum', 'c:bitcoin'], ['c:bitcoin', 'f:PKR'], ['c:solana', 'c:ethereum'], ['c:tether', 'f:PKR'], ['f:USD', 'c:bitcoin']]

const LS = 'ttt.rates.v2'
const sampleDown = (arr, n) => (arr && arr.length > n ? Array.from({ length: n }, (_, i) => arr[Math.floor((i * (arr.length - 1)) / (n - 1))]) : arr || null)

function snapshot() {
  return { fiat: FIAT_SNAPSHOT, fiatAt: 0, crypto: CRYPTO_SNAPSHOT.map(([id, sym, name, usd], i) => ({ id, sym, name, usd, rank: i + 1 })), cryptoAt: 0, source: 'snapshot' }
}
export function loadRates() {
  try {
    const c = JSON.parse(localStorage.getItem(LS))
    if (c && c.fiat && c.crypto) return { ...c, source: 'cache' }
  } catch {}
  return snapshot()
}
async function getJson(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return await r.json()
  } finally { clearTimeout(t) }
}
export async function fetchFiat() {
  const j = await getJson('https://open.er-api.com/v6/latest/USD')
  if (!j || j.result !== 'success' || !j.rates) throw new Error('bad fiat payload')
  return { rates: j.rates, at: (j.time_last_update_unix || 0) * 1000 || Date.now() }
}
export async function fetchCrypto() {
  try {
    const j = await getJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h')
    if (!Array.isArray(j) || !j.length) throw new Error('empty')
    return j.filter((x) => x.current_price != null).map((x) => ({ id: x.id, sym: String(x.symbol).toUpperCase(), name: x.name, usd: x.current_price, img: x.image, ch24: x.price_change_percentage_24h, spark: sampleDown(x.sparkline_in_7d && x.sparkline_in_7d.price, 28), rank: x.market_cap_rank }))
  } catch {
    const j = await getJson('https://api.coinpaprika.com/v1/tickers?limit=250')
    if (!Array.isArray(j) || !j.length) throw new Error('empty')
    return j.filter((x) => x.quotes && x.quotes.USD && x.quotes.USD.price != null).map((x) => ({ id: x.id, sym: String(x.symbol).toUpperCase(), name: x.name, usd: x.quotes.USD.price, ch24: x.quotes.USD.percent_change_24h, rank: x.rank }))
  }
}
export async function refreshAll(prev) {
  const out = { ...prev }
  let ok = 0
  const [f, c] = await Promise.allSettled([fetchFiat(), fetchCrypto()])
  if (f.status === 'fulfilled') { out.fiat = { USD: 1, ...f.value.rates }; out.fiatAt = f.value.at; ok++ }
  if (c.status === 'fulfilled') { out.crypto = c.value; out.cryptoAt = Date.now(); ok++ }
  out.source = ok ? 'live' : prev.source
  out.error = ok === 2 ? '' : ok === 0 ? 'offline' : f.status === 'rejected' ? 'fiat' : 'crypto'
  if (ok) try { localStorage.setItem(LS, JSON.stringify({ fiat: out.fiat, fiatAt: out.fiatAt, crypto: out.crypto, cryptoAt: out.cryptoAt })) } catch {}
  return out
}

/** Flat list of everything convertible, with USD value of one unit. */
export function buildItems(r) {
  const items = []
  for (const [code, rate] of Object.entries(r.fiat)) if (rate > 0) items.push({ key: 'f:' + code, kind: 'fiat', code, name: fiatName(code), usd: 1 / rate, flag: FIAT_FLAG[code] || '', rate })
  const seen = new Set()
  for (const c of r.crypto) { if (seen.has(c.id)) continue; seen.add(c.id); items.push({ key: 'c:' + c.id, kind: 'crypto', code: c.sym, name: c.name, usd: c.usd, img: c.img, ch24: c.ch24, spark: c.spark, rank: c.rank }) }
  return items
}
export const convertMoney = (amount, a, b) => (a && b && b.usd ? (amount * a.usd) / b.usd : NaN)

export function fmtMoney(x, kind = 'fiat') {
  if (!Number.isFinite(x)) return '—'
  if (x === 0) return '0'
  const a = Math.abs(x)
  if (a >= 1e15) return x.toExponential(4).replace('e+', 'e')
  if (a >= 1000) return x.toLocaleString('en-US', { maximumFractionDigits: kind === 'crypto' ? 4 : 2, minimumFractionDigits: kind === 'crypto' ? 0 : 2 })
  if (a >= 1) return Number(x.toFixed(kind === 'crypto' ? 6 : 4)).toLocaleString('en-US', { maximumFractionDigits: 6 })
  return Number(x.toPrecision(6)).toLocaleString('en-US', { maximumFractionDigits: 14 })
}
export const ago = (ts) => {
  if (!ts) return 'bundled snapshot'
  const s = Math.max(0, (Date.now() - ts) / 1000)
  return s < 90 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'
}
