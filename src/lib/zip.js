/* Archive work, on top of fflate: read a .zip or .gz, list what is inside, and build new ones.
   Everything happens in the page — no upload, no server. */

/** Never let an archive entry escape its folder when it is written out. */
export function safeName(name) {
  return String(name)
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..')
    .join('/')
    .replace(/^\/+/, '')
    .slice(0, 240) || 'file'
}

const isDirName = (n) => n.endsWith('/')

/**
 * Read an archive. Returns the entries with their *real* bytes so the caller can preview,
 * extract or re-pack them.
 */
export async function readArchive(file) {
  const { unzipSync, gunzipSync } = await import('fflate')
  const buf = new Uint8Array(await file.arrayBuffer())
  const name = (file.name || '').toLowerCase()
  const gz = buf[0] === 0x1f && buf[1] === 0x8b

  if (gz || name.endsWith('.gz')) {
    const out = gunzipSync(buf)
    const inner = name.replace(/\.gz$/, '') || 'uncompressed'
    return {
      kind: 'gzip',
      entries: [{ name: inner, dir: false, data: out, size: out.length, packed: buf.length, ratio: out.length ? 1 - buf.length / out.length : 0 }],
      size: buf.length,
    }
  }

  const files = unzipSync(buf, { filter: (f) => !isDirName(f.name) && f.size < 512 * 1024 * 1024 })
  const entries = []
  let packedTotal = 0
  for (const [n, data] of Object.entries(files)) {
    const dir = isDirName(n)
    // fflate reports the compressed size on the internal file record; approximate ratio from the zip itself
    entries.push({ name: n, dir, data, size: data.length, packed: 0, ratio: 0 })
  }
  for (const e of entries) { e.packed = e.packed || e.size; packedTotal += e.packed }
  // The archive's own compressed size gives the honest overall ratio (per-entry sizes are not exposed).
  const ratioOverall = packedTotal ? 1 - buf.length / packedTotal : 0
  for (const e of entries) e.ratio = ratioOverall
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return { kind: 'zip', entries, size: buf.length }
}

/** Build a .zip from `{ name, data }` entries. `level` 0 = stored, 9 = smallest. */
export async function makeZip(entries, { level = 6, onProgress } = {}) {
  const { zip } = await import('fflate')
  const input = {}
  const seen = new Set()
  for (const e of entries) {
    let n = safeName(e.name)
    while (seen.has(n)) n = n.replace(/(\.[^.]*)?$/, (m) => `-2${m || ''}`)
    seen.add(n)
    input[n] = e.data instanceof Uint8Array ? e.data : new Uint8Array(await e.data.arrayBuffer())
  }
  const total = Object.keys(input).length
  let i = 0
  const out = await new Promise((resolve, reject) => {
    zip(input, { level }, (err, data) => (err ? reject(err) : resolve(data)))
    // fflate is synchronous per file; report progress as the loop runs
    onProgress?.(Math.min(95, (++i / Math.max(1, total)) * 95))
  })
  onProgress?.(100)
  return new Blob([out], { type: 'application/zip' })
}

export async function gzipFile(file, { onProgress, level = 6 } = {}) {
  const { gzip } = await import('fflate')
  const buf = new Uint8Array(await file.arrayBuffer())
  const out = await new Promise((res, rej) => gzip(buf, { level }, (e, d) => (e ? rej(e) : res(d))))
  onProgress?.(100)
  return new Blob([out], { type: 'application/gzip' })
}

export const entryBlob = (e) => new Blob([e.data], { type: mimeOf(e.name) })

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  pdf: 'application/pdf', json: 'application/json', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown',
  html: 'text/html', xml: 'application/xml', zip: 'application/zip', srt: 'application/x-subrip', vtt: 'text/vtt',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
export function mimeOf(name) {
  const ext = String(name).split('.').pop().toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

/** Human folder tree, used to group the listing by folder. */
export function groupByFolder(entries) {
  const out = new Map()
  for (const e of entries) {
    const parts = e.name.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    if (!out.has(folder)) out.set(folder, [])
    out.get(folder).push({ ...e, label: parts[parts.length - 1] })
  }
  return [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
