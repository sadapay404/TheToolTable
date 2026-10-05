import { DEFAULTS, TRANSFORM_KEYS } from './params.js'
import { clamp } from '../utils.js'

export const LOOK_STORAGE_KEY = 'ttt.looks'
export const MAX_SAVED_LOOKS = 60

export function safeLookName(value, fallback = 'Imported') {
  return (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '') || fallback
}

export function safeLookParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = {}
  for (const key of Object.keys(DEFAULTS)) {
    if (TRANSFORM_KEYS.includes(key) || !Object.prototype.hasOwnProperty.call(raw, key)) continue
    const value = raw[key]
    if (!Number.isFinite(value)) continue
    const range = key === 'exposure' ? [-3, 3]
      : ['gsH', 'gmH', 'ghH', 'duoA', 'duoB'].includes(key) ? [0, 360]
        : key === 'gBlend' || key === 'vigFeather' ? [0, 100]
          : [-100, 100]
    p[key] = clamp(value, range[0], range[1])
  }
  return p
}

function cleanSavedLook(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const p = safeLookParams(raw.p)
  if (!p) return null
  const id = typeof raw.id === 'string' && raw.id.length <= 100 ? raw.id : `mine-saved-${index}`
  return { id, name: safeLookName(raw.name), cat: 'Mine', p }
}

export function loadSavedLooks(storage = globalThis.localStorage) {
  try {
    if (!storage) return []
    const serialized = storage.getItem(LOOK_STORAGE_KEY) || '[]'
    if (serialized.length > 512 * 1024) return []
    const raw = JSON.parse(serialized)
    if (!Array.isArray(raw)) return []
    const ids = new Set()
    return raw.slice(-MAX_SAVED_LOOKS).map(cleanSavedLook).filter((look) => {
      if (!look || ids.has(look.id)) return false
      ids.add(look.id); return true
    })
  } catch { return [] }
}

export function persistLooks(list, storage = globalThis.localStorage) {
  try {
    if (!storage) return false
    storage.setItem(LOOK_STORAGE_KEY, JSON.stringify(list.slice(-MAX_SAVED_LOOKS)))
    return true
  } catch { return false }
}
