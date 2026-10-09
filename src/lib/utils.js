export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1
  do { n /= 1024; i++ } while (n >= 1024 && i < u.length - 1)
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${u[i]}`
}

export function fmtTime(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 8000)
}

export function readFile(file) {
  return file.arrayBuffer()
}

export function baseName(name) {
  const text = typeof name === 'string' ? name : ''
  const i = text.lastIndexOf('.')
  return i > 0 ? text.slice(0, i) : text
}

export function extName(name) {
  const text = typeof name === 'string' ? name : ''
  const i = text.lastIndexOf('.')
  return i > 0 ? text.slice(i + 1).toLowerCase() : ''
}

export function mediaDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video')
    el.preload = 'metadata'
    el.onloadedmetadata = () => { const d = el.duration; URL.revokeObjectURL(url); resolve(d) }
    el.onerror = () => { URL.revokeObjectURL(url); resolve(NaN) }
    el.src = url
  })
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

export function clamp(v, a, b) { return Math.min(b, Math.max(a, v)) }

export function recentAction(label) {
  try {
    const r = JSON.parse(localStorage.getItem('ttt-recent') || '[]')
    r.unshift({ label, t: Date.now() })
    localStorage.setItem('ttt-recent', JSON.stringify(r.slice(0, 8)))
  } catch {}
}

export function getRecent() {
  try { return JSON.parse(localStorage.getItem('ttt-recent') || '[]') } catch { return [] }
}
