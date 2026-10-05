import { lightStyle } from './render.js'
import { TYPES, typeById } from './payloads.js'

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value, fallback = '', max = 5000) => typeof value === 'string' ? value.slice(0, max) : fallback
const bool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback
const choice = (value, list, fallback) => list.includes(value) ? value : fallback
const number = (value, fallback, min, max) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const mergeDefaults = (value, defaults) => ({ ...(isRecord(defaults) ? defaults : {}), ...(isRecord(value) ? value : {}) })
const safeId = (value, fallback) => typeof value === 'string' && /^[\w-]{1,80}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value) ? value : fallback
const uniqueId = (value, fallback, seen) => {
  const base = safeId(value, fallback)
  let id = base, suffix = 2
  while (seen.has(id)) id = `${base.slice(0, 72)}-${suffix++}`
  seen.add(id)
  return id
}
const HEX = /^#[0-9a-f]{6}$/i
const color = (value, fallback) => typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : fallback
const BARCODE_FORMATS = ['Code128', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code39', 'Code93', 'ITF', 'Codabar', 'DataMatrix', 'PDF417', 'Aztec']
const CONTENT_TYPES = TYPES.map((item) => item.id)
const CARD_FIELDS = {
  wifi: { title: 120, sub: 160, ssid: 160, pass: 160, foot: 160, showpass: 'boolean' },
  contact: { first: 120, last: 120, title: 120, org: 160, phone: 80, email: 160, web: 400 },
  tent: { venue: 120, cta: 120, url: 500, foot: 160 },
  social: { head: 120, handle: 120, url: 500, sub: 160 },
  tag: { kicker: 80, name: 120, id: 100, url: 500 },
}

function normalizeContent(value, defaults) {
  const source = isRecord(value) ? value : {}
  const type = typeById(typeof source.type === 'string' ? source.type : defaults.type).id
  const stored = isRecord(source.vals) ? source.vals : {}
  const vals = {}
  for (const definition of TYPES) {
    const supplied = isRecord(stored[definition.id]) ? stored[definition.id] : {}
    vals[definition.id] = Object.fromEntries(Object.entries(definition.def).map(([key, fallback]) => {
      const candidate = supplied[key]
      if (typeof fallback === 'boolean') return [key, bool(candidate, fallback)]
      return [key, text(candidate, fallback, 5000)]
    }))
  }
  return { type, vals }
}

function normalizeDesigns(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.slice(0, 60).filter((item) => isRecord(item) && CONTENT_TYPES.includes(item.type) && typeof item.payload === 'string')
    .map((item, index) => {
      const id = uniqueId(item.id, `design-${index + 1}`, seen)
      const content = normalizeContent({ type: item.type, vals: { [item.type]: item.vals } }, { type: 'url' })
      const thumb = typeof item.thumb === 'string' && item.thumb.length <= 1_500_000 && /^data:image\/png;base64,[a-z0-9+/=]+$/i.test(item.thumb) ? item.thumb : ''
      return { id, t: Number.isFinite(item.t) ? item.t : 0, type: item.type, vals: content.vals[item.type], style: lightStyle(item.style), payload: item.payload.slice(0, 10_000), thumb }
    })
}

function normalizePresets(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.slice(0, 100).filter(isRecord).map((item, index) => ({
    id: uniqueId(item.id, `preset-${index + 1}`, seen),
    name: text(item.name, 'Imported style', 60),
    style: lightStyle(item.style),
  }))
}

function normalizeScans(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.slice(0, 300).filter((item) => isRecord(item) && typeof item.text === 'string')
    .map((item, index) => ({
      id: uniqueId(item.id, `scan-${index + 1}`, seen),
      t: Number.isFinite(item.t) ? item.t : 0,
      text: item.text.slice(0, 20_000),
      format: text(item.format, '', 40),
      type: text(item.type, '', 40),
      label: text(item.label, '', 80),
      title: text(item.title, '', 240),
      fav: bool(item.fav),
      src: text(item.src, '', 20),
    }))
}

/** Validate data read from localStorage, restored from backups, and written by the QR tools. */
export function normalizeQrState(key, value, init) {
  const fallback = init ?? null
  switch (key) {
    case 'tab': return choice(value, ['create', 'scan', 'barcode', 'bulk', 'cards', 'library'], fallback)
    case 'sub': return choice(value, ['content', 'templates', 'style', 'logo', 'frame', 'export'], fallback)
    case 'libsub': return choice(value, ['designs', 'history', 'backup'], fallback)
    case 'content': return normalizeContent(value, isRecord(fallback) ? fallback : { type: 'url' })
    case 'style': return lightStyle(value)
    case 'designs': return normalizeDesigns(value)
    case 'presets': return normalizePresets(value)
    case 'scans': return normalizeScans(value)
    case 'bc': {
      const state = mergeDefaults(value, fallback)
      return {
        ...state,
        fmt: choice(state.fmt, BARCODE_FORMATS, fallback.fmt),
        text: text(state.text, fallback.text, 10_000),
        hrt: bool(state.hrt, fallback.hrt),
        quiet: bool(state.quiet, fallback.quiet),
        fg: color(state.fg, fallback.fg),
        bg: color(state.bg, fallback.bg),
        ec: choice(state.ec, ['L', 'M', 'Q', 'H'], fallback.ec),
        px: number(state.px, fallback.px, 300, 8192),
      }
    }
    case 'bsrc': return choice(value, ['paste', 'csv', 'seq'], fallback)
    case 'bpaste': return text(value, fallback, 100_000)
    case 'blabel': return bool(value, fallback)
    case 'bkind': return choice(value, ['raw', 'url', 'tel', 'mail', 'wa'], fallback)
    case 'bseq': {
      const state = mergeDefaults(value, fallback)
      return {
        tpl: text(state.tpl, fallback.tpl, 500),
        start: number(state.start, fallback.start, -1_000_000_000_000, 1_000_000_000_000),
        count: number(state.count, fallback.count, 0, 1000),
        pad: number(state.pad, fallback.pad, 0, 12),
      }
    }
    case 'bout': {
      const state = mergeDefaults(value, fallback)
      return {
        kind: choice(state.kind, ['zip', 'pdf'], fallback.kind),
        fmt: choice(state.fmt, ['png', 'svg'], fallback.fmt),
        px: number(state.px, fallback.px, 256, 4096),
        labels: bool(state.labels, fallback.labels),
        page: choice(state.page, ['a4', 'letter'], fallback.page),
        cols: number(state.cols, fallback.cols, 1, 6),
        rows: number(state.rows, fallback.rows, 1, 10),
        guides: bool(state.guides, fallback.guides),
        numbered: bool(state.numbered, fallback.numbered),
      }
    }
    case 'card': return choice(value, Object.keys(CARD_FIELDS), fallback)
    case 'cardtheme': return choice(value, ['paper', 'ink', 'ocean', 'forest', 'rose', 'sun'], fallback)
    case 'cardmine': return bool(value, fallback)
    case 'cardvals': {
      if (!isRecord(value)) return {}
      const cards = {}
      for (const [id, fields] of Object.entries(CARD_FIELDS)) {
        const supplied = isRecord(value[id]) ? value[id] : {}
        const safe = {}
        for (const [key, max] of Object.entries(fields)) {
          if (max === 'boolean') safe[key] = bool(supplied[key])
          else if (typeof supplied[key] === 'string') safe[key] = supplied[key].slice(0, max)
        }
        cards[id] = safe
      }
      return cards
    }
    default:
      return isRecord(fallback) ? mergeDefaults(value, fallback) : (value ?? fallback)
  }
}

export { normalizeContent as normalizeQrContent }
