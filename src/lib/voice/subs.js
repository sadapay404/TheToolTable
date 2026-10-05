export const MAX_SUBTITLE_SECONDS = 24 * 60 * 60
export const MAX_SUBTITLE_FILE_CHARS = 5_000_000
export const MAX_SUBTITLE_LINE_CHARS = 10_000

export const pad = (n, l = 2) => String(Math.max(0, Math.floor(Number.isFinite(Number(n)) ? Number(n) : 0))).padStart(l, '0')
export function fmtTime(sec, comma = true) {
  const value = Number(sec), safe = Number.isFinite(value) ? Math.min(MAX_SUBTITLE_SECONDS, Math.max(0, value)) : 0
  const total = Math.round(safe * 1000), h = Math.floor(total / 3_600_000), m = Math.floor(total / 60_000) % 60, s = Math.floor(total / 1_000) % 60, ms = total % 1_000
  return `${pad(h)}:${pad(m)}:${pad(s)}${comma ? ',' : '.'}${pad(ms, 3)}`
}

export function parseTime(value) {
  const raw = String(value ?? '').trim().replace(',', '.')
  if (!raw || raw.length > 32 || !/^\d+(?:\.\d+)?$/.test(raw) && !/^\d+(?::\d+){1,2}(?:\.\d+)?$/.test(raw)) return null
  const parts = raw.split(':')
  const last = Number(parts.pop()), ints = parts.map(Number)
  if (!Number.isFinite(last) || last < 0 || (parts.length && last >= 60)) return null
  if (parts.length === 1 && last >= 60) return null
  if (parts.length === 2 && (ints[1] >= 60 || ints[0] > 999)) return null
  if (ints.some((n) => !Number.isSafeInteger(n) || n < 0)) return null
  const total = parts.length === 2 ? ints[0] * 3600 + ints[1] * 60 + last : parts.length === 1 ? ints[0] * 60 + last : last
  return Number.isFinite(total) && total <= MAX_SUBTITLE_SECONDS ? total : null
}

export const wrapLines = (text, max) => {
  const src = String(text ?? '').trim()
  if (!max || max < 10) return src
  const out = []
  for (const para of src.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word }
      else line = (line + ' ' + word).trim()
    }
    if (line) out.push(line)
  }
  return out.join('\n')
}

function validSegments(segs) {
  if (!Array.isArray(segs)) return []
  return segs.filter((s) => s && Number.isFinite(Number(s.start)) && Number.isFinite(Number(s.end)) && Number(s.start) >= 0 && Number(s.end) > Number(s.start) && Number(s.end) <= MAX_SUBTITLE_SECONDS)
}
export const toSrt = (segs, max) => validSegments(segs).map((s, i) => `${i + 1}\n${fmtTime(s.start)} --> ${fmtTime(s.end)}\n${wrapLines(s.text, max)}\n`).join('\n')
export const toVtt = (segs, max) => 'WEBVTT\n\n' + validSegments(segs).map((s) => `${fmtTime(s.start, false)} --> ${fmtTime(s.end, false)}\n${wrapLines(s.text, max)}\n`).join('\n')
export const toTxt = (segs) => validSegments(segs).map((s) => String(s.text ?? '').trim()).join('\n')

export function parseSubs(raw) {
  if (typeof raw !== 'string') throw new TypeError('Subtitle content must be text.')
  if (raw.length > MAX_SUBTITLE_FILE_CHARS) throw new RangeError('Subtitle files must be 5 MB or smaller.')
  const txt = raw.replace(/^\uFEFF/, '').replace(/\r/g, ''), blocks = txt.split(/\n{2,}/), out = []
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== ''), i = lines.findIndex((line) => line.includes('-->'))
    if (i < 0) continue
    const [a, c] = lines[i].split('-->').map((part) => part.trim().split(/\s+/)[0]), start = parseTime(a), end = parseTime(c)
    if (start == null || end == null || end <= start) continue
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').slice(0, MAX_SUBTITLE_LINE_CHARS)
    out.push({ id: newId(), start, end, text })
  }
  return out
}

export const newId = () => globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 12)
