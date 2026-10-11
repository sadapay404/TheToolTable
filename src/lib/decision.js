const UINT32_RANGE = 0x1_0000_0000

function randomWord(cryptoApi = globalThis.crypto) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('A secure random-number generator is unavailable in this browser.')
  }
  const word = new Uint32Array(1)
  cryptoApi.getRandomValues(word)
  return word[0]
}

/** Return an unbiased integer in [0, maxExclusive). */
export function randomIndex(maxExclusive, cryptoApi = globalThis.crypto) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('Random range must be an integer from 1 to 2^32.')
  }
  if (maxExclusive === 1) return 0
  const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive
  let value
  do { value = randomWord(cryptoApi) } while (value >= limit)
  return value % maxExclusive
}

export function randomFraction(cryptoApi = globalThis.crypto) {
  return randomWord(cryptoApi) / UINT32_RANGE
}

export function weightedIndex(weights, cryptoApi = globalThis.crypto) {
  if (!Array.isArray(weights) || weights.length === 0 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError('Weights must be a non-empty list of finite, non-negative numbers.')
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('At least one weight must be greater than zero.')
  let pick = randomFraction(cryptoApi) * total
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i]
    if (pick < 0) return i
  }
  // Floating-point rounding can only reach this path at the upper endpoint.
  for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return i
  return 0
}

export function shuffleSecure(items, cryptoApi = globalThis.crypto) {
  if (!Array.isArray(items)) throw new TypeError('Shuffle expects an array.')
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, cryptoApi)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value)
const clampInt = (value, fallback, min, max) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
}
const safeText = (value, fallback, max = 120) => typeof value === 'string' ? value.slice(0, max) : fallback
const oneOf = (value, values, fallback) => values.includes(value) ? value : fallback
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback

const GAME_IDS = ['coin', 'dice', 'wheel', 'bottle', 'draw', 'numbers', 'oracle']
const PALETTES = ['warm', 'ocean', 'candy', 'mono']
const METALS = ['gold', 'silver', 'copper', 'obsidian']
const SPEEDS = ['slow', 'normal', 'fast']
const MODES = {
  draw: ['pick', 'teams', 'order'],
  oracle: ['yn', 'ball'],
}

function safeItems(value, defaults) {
  if (!Array.isArray(value)) return defaults.items
  const ids = new Set()
  return value.slice(0, 40).filter(isRecord).map((item, index) => {
    const text = safeText(item.t, '', 80)
    let id = typeof item.id === 'string' && /^[\w-]{1,40}$/.test(item.id) ? item.id : `wheel-${index + 1}`
    while (ids.has(id)) id = `${id.slice(0, 32)}-${index + 1}`
    ids.add(id)
    return { id, t: text, w: clampInt(item.w, 1, 1, 9) }
  }).filter((item) => item.t.trim())
}

function safeHistory(value, defaults) {
  if (!Array.isArray(value)) return defaults
  return value.slice(0, 24).filter((item) => isRecord(item) && GAME_IDS.includes(item.kind) && typeof item.text === 'string')
    .map((item, index) => ({
      kind: item.kind,
      text: item.text.slice(0, 240),
      k: typeof item.k === 'string' || Number.isFinite(item.k) ? item.k : `history-${index}`,
      t: Number.isFinite(item.t) ? item.t : 0,
    }))
}

/** Keep persisted game settings finite and within the limits exposed by each tool. */
export function normalizeDecisionState(key, value, defaults) {
  /* Reading a field off a missing default is what turns a corrupt save into a
     white screen. With no default, every field below reads as undefined and the
     existing fallbacks take over, which is a blank tool rather than a crash. */
  if (!isRecord(defaults)) defaults = {}
  if (key === 'tab') return oneOf(value, GAME_IDS, defaults.tab)
  if (key === 'sound') return bool(value, defaults.sound)
  if (key === 'hist') return safeHistory(value, defaults.hist)

  const source = isRecord(value) ? value : {}
  const merged = { ...defaults, ...source }
  switch (key) {
    case 'coin':
      return {
        ...merged,
        n: clampInt(merged.n, defaults.n, 1, 6),
        metal: oneOf(merged.metal, METALS, defaults.metal),
        heads: safeText(merged.heads, defaults.heads, 12),
        tails: safeText(merged.tails, defaults.tails, 12),
        speed: oneOf(merged.speed, SPEEDS, defaults.speed),
      }
    case 'dice': {
      const faces = clampInt(merged.faces, defaults.faces, 2, 120)
      return {
        ...merged,
        n: clampInt(merged.n, defaults.n, 1, 6),
        faces,
        mod: clampInt(merged.mod, defaults.mod, -20, 20),
        loaded: bool(merged.loaded, defaults.loaded),
        fav: clampInt(merged.fav, defaults.fav, 1, faces),
        power: clampInt(merged.power, defaults.power, 2, 12),
      }
    }
    case 'wheel':
      return {
        ...merged,
        pal: oneOf(merged.pal, PALETTES, defaults.pal),
        dur: oneOf(merged.dur, [3, 5, 8, 12], defaults.dur),
        elim: bool(merged.elim, defaults.elim),
        items: safeItems(merged.items, defaults),
      }
    case 'bottle': {
      const names = Array.isArray(merged.names)
        ? merged.names.slice(0, 12).map((name) => safeText(name, '', 14))
        : (Array.isArray(defaults.names) ? [...defaults.names] : ['', ''])
      while (names.length < 2) names.push('')
      return {
        ...merged,
        names,
        td: bool(merged.td, defaults.td),
        dur: oneOf(merged.dur, [3, 4, 6, 9], defaults.dur),
      }
    }
    case 'draw':
      return {
        ...merged,
        text: safeText(merged.text, defaults.text, 20_000),
        mode: oneOf(merged.mode, MODES.draw, defaults.mode),
        count: clampInt(merged.count, defaults.count, 1, 500),
        teams: clampInt(merged.teams, defaults.teams, 2, 8),
        remove: bool(merged.remove, defaults.remove),
      }
    case 'numbers': {
      const limit = (v, fallback) => {
        const n = Number(v)
        return Number.isFinite(n) ? Math.min(1_000_000_000, Math.max(-1_000_000_000, Math.round(n))) : fallback
      }
      const dec = clampInt(merged.dec, defaults.dec, 0, 3)
      return {
        ...merged,
        min: limit(merged.min, defaults.min),
        max: limit(merged.max, defaults.max),
        count: clampInt(merged.count, defaults.count, 1, 30),
        dec,
        unique: bool(merged.unique, defaults.unique) && dec === 0,
        sort: bool(merged.sort, defaults.sort),
      }
    }
    case 'oracle':
      return {
        ...merged,
        mode: oneOf(merged.mode, MODES.oracle, defaults.mode),
        q: safeText(merged.q, defaults.q, 90),
        maybe: bool(merged.maybe, defaults.maybe),
      }
    default:
      return value
  }
}

export function sanitizeDecisionHistory(value) {
  return safeHistory(value, [])
}
