import { zx } from './zx.js'

export const BARCODES = [
  { id: 'Code128', name: 'Code 128', group: 'Linear', sample: 'TOOLTABLE-0042', hint: 'Letters, numbers and symbols. The all-round choice for labels and shipping.', kind: 'text' },
  { id: 'EAN13', name: 'EAN-13', group: 'Retail', sample: '5901234123457', hint: '12 or 13 digits. The check digit is added for you.', kind: 'digits', len: [12, 13] },
  { id: 'EAN8', name: 'EAN-8', group: 'Retail', sample: '96385074', hint: '7 or 8 digits for small packs.', kind: 'digits', len: [7, 8] },
  { id: 'UPCA', name: 'UPC-A', group: 'Retail', sample: '036000291452', hint: '11 or 12 digits (US & Canada retail).', kind: 'digits', len: [11, 12] },
  { id: 'UPCE', name: 'UPC-E', group: 'Retail', sample: '04252614', hint: '6–8 digits, compressed UPC.', kind: 'digits', len: [6, 8] },
  { id: 'Code39', name: 'Code 39', group: 'Linear', sample: 'TOOLTABLE 42', hint: 'Capital letters, digits and - . $ / + % space.', kind: 'text' },
  { id: 'Code93', name: 'Code 93', group: 'Linear', sample: 'TOOLTABLE42', hint: 'Compact Code 39 successor.', kind: 'text' },
  { id: 'ITF', name: 'ITF (2 of 5)', group: 'Linear', sample: '12345670', hint: 'Digits only, in pairs — cartons and logistics.', kind: 'digits', even: true },
  { id: 'Codabar', name: 'Codabar', group: 'Linear', sample: '40156', hint: 'Digits and - $ : / . + — libraries and blood banks. A…D start/stop is added for you.', kind: 'text' },
  { id: 'DataMatrix', name: 'Data Matrix', group: '2D', sample: 'TOOLTABLE-0042', hint: 'Tiny square 2D code for electronics and pharma.', kind: 'text' },
  { id: 'PDF417', name: 'PDF417', group: '2D', sample: 'Boarding pass · TT 0042 · BNP → ISB', hint: 'Stacked 2D code for tickets and IDs. Holds a lot of text.', kind: 'text' },
  { id: 'Aztec', name: 'Aztec', group: '2D', sample: 'TOOLTABLE-0042', hint: 'Square 2D code used on rail and airline tickets.', kind: 'text' },
]

export function validateBarcode(def, v) {
  v = v ?? ''
  if (!v.length) return 'Type something to encode.'
  if (def.kind === 'digits') {
    if (!/^\d+$/.test(v)) return 'Digits only (0–9).'
    if (def.len && (v.length < def.len[0] || v.length > def.len[1])) return `Needs ${def.len[0] === def.len[1] ? def.len[0] : def.len.join(' or ')} digits (you have ${v.length}).`
    if (def.even && v.length % 2) return 'ITF needs an even number of digits.'
  }
  if (def.id === 'Code39' && !/^[A-Z0-9 .$/+%-]+$/.test(v.toUpperCase())) return 'Code 39 allows A–Z, 0–9 and - . $ / + % space.'
  if (def.id === 'Codabar' && !/^[A-Da-d]?[0-9\-$:/.+]+[A-Da-d]?$/.test(v)) return 'Codabar allows digits and - $ : / . + only.'
  return null
}

export async function makeBarcode(def, text, { hrt = true, scale = 4, fg = '#000000', bg = '#FFFFFF', quiet = true, ec = 'M' } = {}) {
  const { writeBarcode } = await zx()
  let v = text
  if (def.id === 'Code39') v = v.toUpperCase()
  if (def.id === 'Codabar' && !/^[A-Da-d]/.test(v)) v = 'A' + v + 'A'
  const o = { format: def.id, scale, addQuietZones: quiet, addHRT: hrt && ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'Code93', 'ITF', 'Codabar'].includes(def.id) }
  if (def.id === 'Aztec' || def.id === 'PDF417') o.options = `ecLevel=${ec}`
  const w = await writeBarcode(v, o)
  if (w.error) throw new Error(String(w.error).replace(/^Error \d+: /, '').replace(/ \(retval.*$/, ''))
  const svg = w.svg.replace(/<\?xml[^>]*\?>\s*/, '').replace(/<!DOCTYPE[^>]*>\s*/, '').replace(/fill="#000000"/g, `fill="${fg}"`).replace(/fill="#FFFFFF"/gi, `fill="${bg}"`).replace(/ stroke="#000000"/g, ` stroke="${fg}"`)
  const m = /width="(\d+)" height="(\d+)"/.exec(svg)
  return { svg, w: +m[1], h: +m[2], text: v, image: w.image }
}
