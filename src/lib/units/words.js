// Numbers in words: International English, South-Asian digits ("10 lakh 20 hazar 2 sau 90") and Roman-Urdu spelling.

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion', 'decillion']

const UR = ('sifar aik do teen chaar paanch chhe saat aath nau das gyarah barah terah chaudah pandrah solah satrah atharah unnis bees ikkis baais teis chaubis pachis chabbis sattais atthais unattis tees ikattis battis taintis chauntis paintis chhattis saintis artis unchaalis chaalis iktalis bayalis taintalis chawalis paintalis chiyalis saintalis artalis unchaas pachaas ikyawan bawan tirpan chauwan pachpan chhappan sattawan atthawan unsath saath iksath baasath tirsath chaunsath painsath chhiyasath arsath atthsath unhattar sattar ikhattar bahattar tihattar chauhattar pachattar chhihattar satattar athattar unasi assi ikyasi bayasi tirasi chaurasi pachasi chhiyasi sattasi atthasi nawasi nabbe ikyanwe bayanwe tiranwe chauranwe pachanwe chhiyanwe sattanwe atthanwe ninnanwe').split(' ')
// groups above sau: hazar (10^3), lakh (10^5), crore (10^7), arab (10^9), kharab (10^11), neel (10^13), padam (10^15)
const SA = ['', 'hazar', 'lakh', 'crore', 'arab', 'kharab', 'neel', 'padam']

const below1000 = (n) => {
  const h = Math.floor(n / 100), r = n % 100, out = []
  if (h) out.push(ONES[h] + ' hundred')
  if (r) out.push((h ? 'and ' : '') + (r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '')))
  return out.join(' ')
}
function englishInt(n) {
  if (n === 0n) return 'zero'
  const groups = []
  let i = 0
  while (n > 0n) { groups.push(Number(n % 1000n)); n /= 1000n; i++ }
  if (groups.length > SCALES.length) return null
  const parts = []
  for (let g = groups.length - 1; g >= 0; g--) {
    if (!groups[g]) continue
    let w = below1000(groups[g])
    if (g === 0 && parts.length && groups[0] < 100) w = 'and ' + w
    parts.push(w + (SCALES[g] ? ' ' + SCALES[g] : ''))
  }
  return parts.join(', ').replace(', and ', ' and ')
}

/** South-Asian grouping of a BigInt into [{ n, unit }] biggest first. */
function saGroups(n) {
  const out = []
  const rest = n % 1000n
  n /= 1000n
  const sau = Number(rest / 100n), tail = Number(rest % 100n)
  const levels = []
  let k = 1
  while (n > 0n) { levels.push([k, Number(n % 100n)]); n /= 100n; k++ }
  for (let i = levels.length - 1; i >= 0; i--) if (levels[i][1]) out.push({ n: levels[i][1], unit: SA[levels[i][0]] || '×10^' + (levels[i][0] * 2 + 1) })
  if (sau) out.push({ n: sau, unit: 'sau' })
  if (tail || !out.length) out.push({ n: tail, unit: '' })
  return out
}

/** `text` is a plain number string such as "1,022,000.5" or "-0.0036". */
export function numberWords(text) {
  const t = String(text).replace(/[,\s]/g, '')
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) return null
  const neg = m[1] === '-', int = BigInt(m[2]), frac = m[3] || ''
  const en = englishInt(int)
  if (en == null) return null
  const fracEn = frac ? ' point ' + [...frac].map((d) => ONES[+d]).join(' ') : ''
  const g = saGroups(int)
  const digits = g.map((x) => x.n + (x.unit ? ' ' + x.unit : '')).join(' ') + (frac ? ' point ' + frac.split('').join(' ') : '')
  const urdu = g.map((x) => UR[x.n] + (x.unit ? ' ' + x.unit : '')).join(' ') + (frac ? ' point ' + [...frac].map((d) => UR[+d]).join(' ') : '')
  // grouping as written in Pakistan/India: 10,22,000
  const s = m[2], head = s.slice(0, -3), tail3 = s.slice(-3)
  const grouped = s.length <= 3 ? s : head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + tail3
  const tag = neg ? 1 : 0
  return { en: (neg ? 'minus ' : '') + en + fracEn, ur: (neg ? 'minus ' : '') + digits, urWords: (neg ? 'minus ' : '') + urdu, saGrouped: (neg ? '-' : '') + grouped + (frac ? '.' + frac : ''), tag }
}
