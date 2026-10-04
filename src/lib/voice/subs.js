export const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0')
export function fmtTime(sec, comma = true) {
  sec = Math.max(0, sec); const ms = Math.round((sec % 1) * 1000), s = Math.floor(sec) % 60, m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600)
  const [S, M] = ms === 1000 ? [s + 1, ms - 1000] : [s, ms]
  return `${pad(h)}:${pad(m)}:${pad(S)}${comma ? ',' : '.'}${pad(M, 3)}`
}
export function parseTime(t) {
  const m = String(t).trim().replace(',', '.').match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/) || String(t).trim().replace(',', '.').match(/^()(\d+)(?:\.(\d+))?$/)
  if (!m) return null
  if (m[3] !== undefined && String(t).includes(':')) return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3]
  return +String(t).replace(',', '.')
}
export const wrapLines = (text, max) => {
  if (!max || max < 10) return text.trim()
  const out = []; for (const para of text.split('\n')) { let line = ''; for (const w of para.split(/\s+/).filter(Boolean)) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w } else line = (line + ' ' + w).trim() } if (line) out.push(line) }
  return out.join('\n')
}
export const toSrt = (segs, max) => segs.map((s, i) => `${i + 1}\n${fmtTime(s.start)} --> ${fmtTime(s.end)}\n${wrapLines(s.text, max)}\n`).join('\n')
export const toVtt = (segs, max) => 'WEBVTT\n\n' + segs.map((s) => `${fmtTime(s.start, false)} --> ${fmtTime(s.end, false)}\n${wrapLines(s.text, max)}\n`).join('\n')
export const toTxt = (segs) => segs.map((s) => s.text.trim()).join('\n')
export function parseSubs(raw) {
  const txt = raw.replace(/^\uFEFF/, '').replace(/\r/g, ''), blocks = txt.split(/\n{2,}/), out = []
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== ''), i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const [a, c] = lines[i].split('-->').map((x) => x.trim().split(/\s+/)[0]), s = parseTime(a), e = parseTime(c)
    if (s == null || e == null) continue
    out.push({ id: Math.random().toString(36).slice(2, 9), start: s, end: e, text: lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '') })
  }
  return out
}
export const newId = () => Math.random().toString(36).slice(2, 9)
