/* Subtitle format toolkit: parse what people actually have lying around (SRT, WebVTT, plain text),
   edit it, and write it back out in any of the three. Pure string/data work — no DOM, no network —
   so the whole module is unit-testable. */

/* ---------------------------------------------------------------- time stamps */

/** "00:01:02,500" / "1:02.5" / "62" → milliseconds */
export function parseStamp(s) {
  const t = String(s).trim().replace(',', '.')
  const m = t.match(/^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/)
  if (!m) return NaN
  const [, a, b, c, frac] = m
  const ms = a === undefined ? +c * 1000 : b === undefined ? (+a * 60 + +c) * 1000 : (+a * 3600 + +b * 60 + +c) * 1000
  const f = +(frac || 0)
  return ms + (frac === undefined ? 0 : f * (frac.length === 1 ? 100 : frac.length === 2 ? 10 : 1))
}

/** milliseconds → "HH:MM:SS,mmm" (or with a dot for WebVTT) */
export function fmtStamp(ms, sep = ',') {
  const t = Math.max(0, Math.round(ms || 0))
  const h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), f = t % 1000
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(f, 3)}`
}

/** short display form — "1:02.5" */
export function shortStamp(ms) {
  const t = Math.max(0, Math.round(ms || 0))
  const m = Math.floor(t / 60000), s = (t % 60000) / 1000
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/* ---------------------------------------------------------------- parsing */

const TIME_LINE = /^\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3}|\d+)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3}|\d+)/m

/** Detect the flavour: 'srt' | 'vtt' | 'ass' | 'txt' */
export function detectFormat(text) {
  const s = String(text).replace(/^\uFEFF/, '')
  if (/^\s*WEBVTT/.test(s)) return 'vtt'
  if (/^\s*\[Script Info\]|^\s*Dialogue:/m.test(s)) return 'ass'
  if (TIME_LINE.test(s)) return 'srt'
  return 'txt'
}

/** SRT: HH:MM:SS,mmm --> HH:MM:SS,mmm  (VTT uses a dot, and may drop the hours) */
export function parseSRT(text, format = 'srt') {
  const cues = []
  const blocks = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex((l) => TIME_LINE.test(l))
    if (at < 0) continue
    const m = lines[at].match(TIME_LINE)
    const start = parseStamp(m[1]), end = parseStamp(m[2])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const body = lines.slice(at + 1).join('\n').replace(/\s+$/, '')
    cues.push({ start, end: Math.max(end, start + 1), text: cleanBody(body) })
  }
  return cues.sort((a, b) => a.start - b.start).map((c, i) => ({ ...c, id: i + 1, format }))
}

/** Advanced SubStation Alpha — Dialogue: 0,0:00:01.00,0:00:03.50,Style,,0,0,0,,Text */
export function parseASS(text) {
  const cues = []
  for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(/^\s*Dialogue:\s*([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),(.*)$/)
    if (!m) continue
    const start = assStamp(m[2]), end = assStamp(m[3])
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    cues.push({ start, end, text: cleanBody(m[10].replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n')), format: 'ass' })
  }
  return cues.sort((a, b) => a.start - b.start).map((c, i) => ({ ...c, id: i + 1 }))
}
const assStamp = (s) => {
  const m = String(s).trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{1,2})$/)
  return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) * 1000 + +m[4].padEnd(2, '0') * 10 : NaN
}

export function parseSubs(text) {
  const format = detectFormat(text)
  if (format === 'ass') return { format, cues: parseASS(text) }
  if (format === 'txt') return { format, cues: plainToCues(text) }
  return { format, cues: parseSRT(text, format) }
}

/** One line = one cue, each shown for a default duration (people paste raw transcripts a lot). */
export function plainToCues(text, { per = 2000, maxChars = 90 } = {}) {
  const out = []
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const parts = maxChars && line.length > maxChars
      ? line.match(new RegExp(`.{1,${maxChars}}(\\s|$)`, 'g')).map((s) => s.trim()).filter(Boolean)
      : [line]
    for (const p of parts) { out.push({ start: out.length * per, end: (out.length + 1) * per, text: p }) }
  }
  return out.map((c, i) => ({ ...c, id: i + 1, format: 'txt' }))
}

/** Strip speaker markup that subtitle tools add, and normalise line endings. */
function cleanBody(s) {
  return String(s)
    .replace(/<\/?[^>]{1,12}>/g, '')            // <i> <b> <font …> (removed on export)
    .replace(/\{\\[^}]*\}/g, '')                 // ASS override codes
    .replace(/\u00a0/g, ' ')
    .split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim()
}

/* tidy up: sorted, non-overlapping, minimum duration, ids renumbered */
export function tidyCues(cues, { min = 400, gap = 0, max = 12000 } = {}) {
  const out = [...cues].filter((c) => c.text.trim()).sort((a, b) => a.start - b.start).map((c) => ({ ...c }))
  for (let i = 0; i < out.length; i++) {
    if (out[i].end - out[i].start < min) out[i].end = out[i].start + min
    if (out[i].end - out[i].start > max) out[i].end = out[i].start + max
    if (i && out[i].start < out[i - 1].end + gap) out[i].start = out[i - 1].end + gap
    if (out[i].end <= out[i].start) out[i].end = out[i].start + min
  }
  return out.map((c, i) => ({ ...c, id: i + 1 }))
}

/* ---------------------------------------------------------------- writing */

export function toSRT(cues) {
  return tidyCues(cues).map((c, i) => `${i + 1}\n${fmtStamp(c.start)} --> ${fmtStamp(c.end)}\n${c.text.trim()}\n`).join('\n')
}

export function toVTT(cues) {
  return `WEBVTT\n\n${tidyCues(cues).map((c) => `${fmtStamp(c.start, '.')} --> ${fmtStamp(c.end, '.')}\n${escapeForVtt(c.text.trim())}\n`).join('\n')}`
}

export function toTXT(cues) {
  return tidyCues(cues).map((c) => c.text.trim()).join('\n')
}

export function toCSV(cues) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`
  return ['index,start,end,text', ...tidyCues(cues).map((c, i) => [i + 1, fmtStamp(c.start), fmtStamp(c.end), esc(c.text)].join(','))].join('\n')
}
const escapeForVtt = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* ---------------------------------------------------------------- editing */

export function shiftCues(cues, ms) {
  return cues.map((c) => ({ ...c, start: c.start + ms, end: c.end + ms }))
}

/** Re-time the whole track so the first cue starts at `to` (fixes badly ripped subtitles). */
export function anchorCues(cues, to = 0) {
  const first = Math.min(...cues.map((c) => c.start))
  return Number.isFinite(first) ? shiftCues(cues, to - first) : cues
}

/** Even out drift: stretch every cue around the first one. */
export function scaleCues(cues, factor) {
  const base = Math.min(...cues.map((c) => c.start))
  return cues.map((c) => ({ ...c, start: Math.round(base + (c.start - base) * factor), end: Math.round(base + (c.end - base) * factor) }))
}

export function splitCue(cue, at) {
  const t = Math.min(Math.max(at, cue.start + 60), cue.end - 60)
  const words = String(cue.text).split(/\s+/)
  const ratio = (t - cue.start) / Math.max(1, cue.end - cue.start)
  const cut = Math.max(1, Math.min(words.length - 1, Math.round(words.length * ratio)))
  return [
    { ...cue, end: t, text: words.slice(0, cut).join(' ') },
    { ...cue, start: t, text: words.slice(cut).join(' ') },
  ]
}

export function mergeCues(a, b) {
  return { ...a, end: Math.max(a.end, b.end), text: `${a.text.trim()} ${String(b.text).trim()}`.trim() }
}

export function findReplace(cues, find, repl, { regex = false, caseSensitive = false } = {}) {
  if (!find) return cues
  const re = regex ? new RegExp(find, caseSensitive ? 'g' : 'gi') : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')
  return cues.map((c) => ({ ...c, text: c.text.replace(re, repl ?? '') }))
}

/** Cue at a playback position (used by the player to highlight the current line). */
export function cueAt(cues, ms) {
  return cues.find((c) => ms >= c.start && ms <= c.end) || null
}

export function stats(cues) {
  const rows = tidyCues(cues)
  const chars = rows.reduce((n, c) => n + c.text.length, 0)
  const end = rows.length ? rows[rows.length - 1].end : 0
  const langs = rows.reduce((n, c) => n + c.text.split(/\s+/).filter(Boolean).length, 0)
  return { cues: rows.length, chars, words: langs, end, cps: end ? +(chars / (end / 1000)).toFixed(1) : 0 }
}
