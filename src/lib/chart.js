/* Data → chart geometry. Parsing, scales, ticks and shapes are all pure functions returning plain
   numbers, so the React layer only has to animate them (and the tests can assert on them). */

export const PALETTES = {
  copper: ['#C87941', '#3E8ED0', '#4E937A', '#C3423F', '#7B6CB0', '#E8A33D', '#2F9C95', '#B2675E'],
  ocean: ['#1F7A8C', '#3E8ED0', '#5F6CAF', '#2F9C95', '#4E937A', '#7B6CB0', '#48B1BF', '#9D6BCE'],
  sunset: ['#E8A33D', '#D04841', '#C87941', '#C3423F', '#B2675E', '#9D6BCE', '#7B6CB0', '#5F6CAF'],
  forest: ['#4E937A', '#2F9C95', '#6A994E', '#A7C957', '#8FBC5A', '#1F7A8C', '#3E8ED0', '#5F6CAF'],
  ink: ['#22201d', '#4a453f', '#6f675e', '#8d857a', '#a89f93', '#c87941', '#e8a33d', '#3e8ed0'],
}
export const PALETTE_NAMES = Object.keys(PALETTES)

/* ------------------------------------------------------------------ parsing */

export function sniffDelimiter(text) {
  const head = String(text).split(/\r?\n/).slice(0, 5).join('\n')
  const counts = [['\t', (head.match(/\t/g) || []).length], [',', (head.match(/,/g) || []).length], [';', (head.match(/;/g) || []).length], ['|', (head.match(/\|/g) || []).length]]
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] ? counts[0][0] : ','
}

/** RFC-4180-ish reader: quotes, escaped quotes, embedded newlines. */
export function parseDelimited(text, delim = null) {
  const d = delim || sniffDelimiter(text)
  const s = String(text).replace(/^\uFEFF/, '')
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === d) { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((v) => v !== ''))
}

export const isNumber = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(String(v).replace(/[,\s%$€£]/g, '')))
export const num = (v) => Number(String(v).replace(/[,\s%$€£]/g, ''))

/** Rows → named columns, with a guess about which ones are numbers. */
export function toTable(rows, { header = true } = {}) {
  if (!rows.length) return { headers: [], rows: [], numeric: [] }
  const width = Math.max(...rows.map((r) => r.length))
  const body = header ? rows.slice(1) : rows
  const headers = header
    ? rows[0].concat(Array(Math.max(0, width - rows[0].length)).fill('')).map((h, i) => String(h).trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  const numeric = headers.map((_, c) => {
    const vals = body.map((r) => r[c]).filter((v) => v !== undefined && v !== '')
    return vals.length > 0 && vals.filter(isNumber).length / vals.length >= 0.7
  })
  return { headers, rows: body.map((r) => headers.map((_, c) => r[c] ?? '')), numeric }
}

/** An opinionated first guess so a dropped file charts itself immediately. */
export function autoChart(table) {
  const numeric = table.numeric.map((n, i) => (n ? i : -1)).filter((i) => i >= 0)
  const label = table.numeric.findIndex((n) => !n)
  if (numeric.length === 0) return { type: 'bar', x: label >= 0 ? label : 0, series: [] }
  const many = table.rows.length > 12
  return {
    type: numeric.length >= 2 && table.rows.length > 24 ? 'line' : 'bar',
    x: label >= 0 ? label : 0,
    series: numeric.slice(0, many ? 3 : 4),
  }
}

/* ------------------------------------------------------------------ scales */

const NICE = [1, 2, 2.5, 5, 10]
export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], min: 0, max: 1 }
  if (min === max) { min = Math.min(0, min); max = max === 0 ? 1 : max * 1.2 }
  const span = max - min
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = (NICE.find((n) => n * mag >= raw) || 10) * mag
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10))
  return { ticks, min: lo, max: hi }
}

export function fmtNum(v, { compact = true } = {}) {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (compact && a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`
  if (compact && a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`
  if (compact && a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 1 })
  if (Number.isInteger(v)) return String(v)
  return String(+v.toFixed(Math.abs(v) < 1 ? 3 : 2))
}

/* ------------------------------------------------------------------ geometry */

const TYPES = [
  ['bar', 'Bars'], ['line', 'Line'], ['area', 'Area'], ['pie', 'Pie'], ['donut', 'Donut'], ['scatter', 'Scatter'],
]
export const CHART_TYPES = TYPES

/**
 * The heart of the studio: turn a table + choices into shapes.
 * Everything is expressed in viewBox units (default 1000 × 560) so it scales for free.
 */
export function buildSpec({ type = 'bar', table, x = 0, series = [], palette = 'copper', width = 1000, height = 560, stack = false, showLabels = true, showGrid = true, title = '', donutHole = 0.55 }) {
  const colors = PALETTES[palette] || PALETTES.copper
  const pad = { t: 34, r: 28, b: 62, l: 74 }
  const plot = { x: pad.l, y: pad.t, w: width - pad.l - pad.r, h: height - pad.t - pad.b }
  const rows = table?.rows?.length ? table.rows : [['', 0]]
  const cols = (series?.length ? series : table?.numeric?.map((n, i) => (n ? i : -1)).filter((i) => i >= 0) || []).slice(0, 8)
  const labels = rows.map((r) => String(r[x] ?? ''))
  const seriesList = cols.map((c, i) => ({ col: c, name: table?.headers?.[c] || `Series ${i + 1}`, color: colors[i % colors.length] }))

  const value = (r, c) => (isNumber(r[c]) ? num(r[c]) : 0)
  const totalPerRow = rows.map((r) => seriesList.reduce((n, s) => n + value(r, s.col), 0))

  if (type === 'pie' || type === 'donut') {
    // one ring out of the *first* series (or the row totals) — standard single-value pie rules
    const vals = seriesList.length > 1
      ? rows.map((r, i) => ({ label: labels[i], v: totalPerRow[i], color: colors[i % colors.length] }))
      : rows.map((r, i) => ({ label: labels[i], v: value(r, seriesList[0]?.col ?? 0), color: colors[i % colors.length] }))
    const sum = vals.reduce((n, d) => n + Math.max(0, d.v), 0) || 1
    const cx = width / 2, cy = height / 2 + 6, R = Math.min(plot.w, plot.h) / 2 - 10, r0 = type === 'donut' ? R * donutHole : 0
    let a = -Math.PI / 2
    const arcs = vals.map((d) => {
      const frac = Math.max(0, d.v) / sum
      const a0 = a, a1 = a + frac * Math.PI * 2
      a = a1
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
      const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1)
      const d0 = r0 ? p(r0, a0) : null, d1 = r0 ? p(r0, a1) : null
      const path = r0
        ? `M${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}L${d1[0]} ${d1[1]}A${r0} ${r0} 0 ${large} 0 ${d0[0]} ${d0[1]}Z`
        : `M${cx} ${cy}L${x0} ${y0}A${R} ${R} 0 ${large} 1 ${x1} ${y1}Z`
      const mid = (a0 + a1) / 2
      return { ...d, frac, path, labelAt: p((R + r0 * 1.4) / 2, mid), pct: frac * 100, color: r0 ? d.color : d.color }
    })
    return { type, width, height, plot, series: seriesList, legend: arcs.map((a2) => ({ name: a2.label, color: a2.color, value: a2.v })), arcs, title, total: sum }
  }

  // cartesian: bars, lines, areas, scatter
  const all = []
  for (const r of rows) {
    if (stack) all.push(seriesList.reduce((n, s) => n + value(r, s.col), 0))
    else for (const s of seriesList) all.push(value(r, s.col))
  }
  const rawMax = Math.max(0, ...all), rawMin = Math.min(0, ...all)
  const { ticks, min: yMin, max: yMax } = niceTicks(rawMin, rawMax, 5)
  const Y = (v) => plot.y + plot.h - ((v - yMin) / (yMax - yMin || 1)) * plot.h
  const band = plot.w / Math.max(1, rows.length)
  const X = (i) => plot.x + band * i + band / 2
  const sb = band * 0.72 / Math.max(1, seriesList.length)

  const bars = []
  if (type === 'bar') {
    rows.forEach((r, i) => {
      let acc = 0
      seriesList.forEach((s, si) => {
        const v = value(r, s.col)
        if (stack) {
          const y0 = Y(acc), y1 = Y(acc + v)
          bars.push({ i, si, x: X(i) - band * 0.36, y: y1, w: band * 0.72, h: Math.max(0, y0 - y1), v, color: s.color, name: s.name, label: labels[i] })
          acc += v
        } else {
          const y0 = Y(0), y1 = Y(v)
          bars.push({ i, si, x: X(i) - band * 0.36 + si * sb, y: Math.min(y0, y1), w: sb * 0.86, h: Math.abs(y1 - y0), v, color: s.color, name: s.name, label: labels[i] })
        }
      })
    })
  }

  const points = []
  const lines = []
  if (type === 'line' || type === 'area' || type === 'scatter') {
    seriesList.forEach((s, si) => {
      const pts = rows.map((r, i) => [X(i), Y(value(r, s.col)), value(r, s.col), labels[i]])
      if (type === 'scatter') for (const p of pts) points.push({ x: p[0], y: p[1], v: p[2], color: s.color, i: pts.indexOf(p), label: p[3], name: s.name })
      const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
      const area = type === 'area' ? `${path} L${pts[pts.length - 1][0].toFixed(1)} ${Y(Math.max(0, yMin))} L${pts[0][0].toFixed(1)} ${Y(Math.max(0, yMin))} Z` : null
      lines.push({ si, name: s.name, color: s.color, path, area, pts })
    })
  }

  return {
    type, width, height, plot, title, series: seriesList,
    y: { min: yMin, max: yMax, ticks, at: Y },
    x: { band, at: X, labels, showLabels },
    grid: showGrid ? ticks : [],
    bars, lines, points, stack,
  }
}
