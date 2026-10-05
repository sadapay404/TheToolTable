import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'

export const MAX_BEAM_CODE_CHARS = 32 * 1024
export const MAX_BEAM_SIGNAL_BYTES = 64 * 1024
export const MAX_BEAM_FILE_SIZE = 1024 * 1024 * 1024
export const MAX_BEAM_CHAT_CHARS = 4_000
export const MAX_BEAM_FILENAME_CHARS = 255
export const MAX_BEAM_PENDING_FILES = 100
const MAX_CONTROL_CHARS = MAX_BEAM_CHAT_CHARS + MAX_BEAM_FILENAME_CHARS + 512
const HIGH_WATER = 1024 * 1024
const LOW_WATER = 256 * 1024
const CHUNK = 16 * 1024
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/

const b64 = (u8) => {
  let s = ''
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64 = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}
const descriptionKind = (kind) => kind === 'O' ? 'offer' : kind === 'A' ? 'answer' : null

export const encodeCode = (kind, d) => {
  const type = descriptionKind(kind)
  if (!type || d?.type !== type || typeof d?.sdp !== 'string' || !d.sdp.trim() || d.sdp.length > MAX_BEAM_SIGNAL_BYTES) {
    throw new TypeError('Could not create a valid Beam invitation.')
  }
  const code = `BEAM-${kind}-` + b64(deflateSync(strToU8(JSON.stringify({ t: d.type, sdp: d.sdp })), { level: 9 }))
  if (code.length > MAX_BEAM_CODE_CHARS) throw new RangeError('The connection code is too large to share.')
  return code
}

export function decodeCode(text) {
  const raw = String(text || '')
  if (raw.length > MAX_BEAM_CODE_CHARS) throw new RangeError('That Beam code is too large.')
  const compact = raw.replace(/\s+/g, '')
  const m = /^BEAM-([OA])-([A-Za-z0-9_-]+)$/.exec(compact)
  if (!m) throw new Error('That does not look like a Beam code')
  try {
    const packed = unb64(m[2])
    if (packed.length > MAX_BEAM_SIGNAL_BYTES) throw new Error('too large')
    const out = inflateSync(packed, { out: new Uint8Array(MAX_BEAM_SIGNAL_BYTES + 1) })
    if (out.length > MAX_BEAM_SIGNAL_BYTES) throw new Error('too large')
    const j = JSON.parse(strFromU8(out))
    const type = descriptionKind(m[1])
    if (!j || j.t !== type || typeof j.sdp !== 'string' || !j.sdp.trim() || j.sdp.length > MAX_BEAM_SIGNAL_BYTES) throw new Error('invalid description')
    const canonical = b64(deflateSync(strToU8(JSON.stringify({ t: j.t, sdp: j.sdp })), { level: 9 }))
    if (canonical !== m[2]) throw new Error('trailing or noncanonical data')
    return { kind: m[1], desc: { type: j.t, sdp: j.sdp } }
  } catch {
    throw new Error('The code is damaged or too large — copy it again in full')
  }
}

const waitIce = (pc, ms = 3500) => new Promise((res) => {
  if (pc.iceGatheringState === 'complete') return res()
  const done = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res() }
  const ch = () => pc.iceGatheringState === 'complete' && done()
  const t = setTimeout(done, ms)
  pc.addEventListener('icegatheringstatechange', ch)
})

const safeName = (name) => String(name || 'file').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, MAX_BEAM_FILENAME_CHARS) || 'file'
const safeType = (type) => typeof type === 'string' && type.length <= 127 && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(type) ? type : 'application/octet-stream'
const safeId = (id) => typeof id === 'string' && ID_RE.test(id)
const percent = (got, size) => size > 0 ? Math.min(100, Math.max(0, (got / size) * 100)) : 100

function waitForBufferLow(dc) {
  return new Promise((resolve, reject) => {
    if (dc.readyState !== 'open') return reject(new Error('Connection closed'))
    let done = false
    const cleanup = () => {
      dc.removeEventListener?.('bufferedamountlow', onLow)
      dc.removeEventListener?.('close', onClose)
      dc.removeEventListener?.('error', onClose)
    }
    const finish = (fn, value) => { if (done) return; done = true; cleanup(); fn(value) }
    const onLow = () => finish(resolve)
    const onClose = () => finish(reject, new Error('Connection closed'))
    dc.addEventListener?.('bufferedamountlow', onLow, { once: true })
    dc.addEventListener?.('close', onClose, { once: true })
    dc.addEventListener?.('error', onClose, { once: true })
    // Recheck after installing listeners so a drain between the first test and
    // listener registration cannot leave a transfer waiting forever.
    if (dc.readyState !== 'open') onClose()
    else if (dc.bufferedAmount <= LOW_WATER) onLow()
  })
}

export class Peer {
  constructor(mode = 'auto') {
    if (!['auto', 'lan'].includes(mode)) throw new TypeError('Choose a supported connection mode.')
    this.mode = mode
    this.h = {}
    this.state = 'new'
    this.rx = null
    this.q = Promise.resolve()
    this.pendingFiles = 0
    this.pc = new RTCPeerConnection({ iceServers: mode === 'lan' ? [] : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] })
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState
      if (s === 'failed' || s === 'closed' || s === 'disconnected') this.set(s === 'disconnected' ? 'lost' : s)
      else if (s === 'connected') this.set('connected')
    }
  }
  on(e, f) { this.h[e] = f; return this }
  off(e) { delete this.h[e]; return this }
  emit(e, ...a) { this.h[e]?.(...a) }
  set(s) { if (this.state !== s) { this.state = s; this.emit('state', s) } }
  wire(dc) {
    this.dc = dc
    dc.binaryType = 'arraybuffer'
    dc.onopen = () => this.set('connected')
    dc.onclose = () => this.set('closed')
    dc.onmessage = (e) => {
      try { this.onData(e.data) } catch { this.emit('error', 'The other device sent an invalid message.') }
    }
  }
  async host() {
    this.wire(this.pc.createDataChannel('beam'))
    await this.pc.setLocalDescription(await this.pc.createOffer())
    await waitIce(this.pc)
    return encodeCode('O', this.pc.localDescription)
  }
  async accept(code) {
    const { kind, desc } = decodeCode(code)
    if (kind !== 'A') throw new Error('That is an invitation code. Paste the reply code from your friend instead.')
    await this.pc.setRemoteDescription(desc)
    this.set('connecting')
  }
  async join(code) {
    const { kind, desc } = decodeCode(code)
    if (kind !== 'O') throw new Error('That is a reply code. Paste the invitation code from the other device.')
    this.pc.ondatachannel = (e) => this.wire(e.channel)
    await this.pc.setRemoteDescription(desc)
    await this.pc.setLocalDescription(await this.pc.createAnswer())
    await waitIce(this.pc)
    this.set('connecting')
    return encodeCode('A', this.pc.localDescription)
  }
  sendText(text) {
    if (!this.dc || this.dc.readyState !== 'open') throw new Error('Not connected')
    if (typeof text !== 'string' || text.length > MAX_BEAM_CHAT_CHARS) throw new RangeError('Messages must be 4,000 characters or shorter.')
    this.dc.send(JSON.stringify({ t: 'chat', text }))
  }
  sendFile(file, id) {
    const fail = (message) => { queueMicrotask(() => this.emit('fail', id, message)); return Promise.resolve(false) }
    if (!safeId(id)) return fail('Could not send a file with an invalid transfer id.')
    if (!file || typeof file.slice !== 'function' || !Number.isSafeInteger(file.size) || file.size < 0) return fail('That file could not be read.')
    if (file.size > MAX_BEAM_FILE_SIZE) return fail('Files must be 1 GB or smaller.')
    if (this.pendingFiles >= MAX_BEAM_PENDING_FILES) return fail('The transfer queue is full. Wait for current files to finish.')
    this.pendingFiles++
    const job = async () => {
      const dc = this.dc
      if (!dc || dc.readyState !== 'open') throw new Error('Not connected')
      dc.bufferedAmountLowThreshold = LOW_WATER
      dc.send(JSON.stringify({ t: 'file', id, name: safeName(file.name), size: file.size, type: safeType(file.type) }))
      let off = 0, last = 0
      while (off < file.size) {
        if (dc.readyState !== 'open') throw new Error('Connection closed')
        if (dc.bufferedAmount > HIGH_WATER) await waitForBufferLow(dc)
        const buf = await file.slice(off, off + CHUNK).arrayBuffer()
        if (!buf.byteLength || buf.byteLength > CHUNK) throw new Error('Could not read the next file chunk.')
        if (dc.readyState !== 'open') throw new Error('Connection closed')
        dc.send(buf)
        off += buf.byteLength
        const now = performance.now()
        if (now - last > 80 || off >= file.size) { last = now; this.emit('sent', id, off, file.size) }
      }
      if (dc.readyState !== 'open') throw new Error('Connection closed')
      dc.send(JSON.stringify({ t: 'end', id }))
      this.emit('sent', id, file.size, file.size, true)
    }
    this.q = this.q.then(job).catch((e) => { this.emit('fail', id, e?.message || 'File transfer failed.') }).finally(() => { this.pendingFiles = Math.max(0, this.pendingFiles - 1) })
    return this.q
  }
  rejectTransfer(id, message) {
    this.rx = null
    this.emit('transferError', id, message)
  }
  onData(data) {
    if (typeof data !== 'string') {
      const r = this.rx
      if (!r) return
      const size = ArrayBuffer.isView(data) ? data.byteLength : data instanceof ArrayBuffer ? data.byteLength : -1
      if (!Number.isSafeInteger(size) || size <= 0 || size > CHUNK) return this.rejectTransfer(r.id, 'The other device sent an invalid file chunk.')
      if (r.got + size > r.size) return this.rejectTransfer(r.id, 'The received file was larger than declared.')
      r.parts.push(data)
      r.got += size
      const now = performance.now()
      if (now - r.last > 80 || r.got === r.size) { r.last = now; this.emit('recv', r.id, r.got, r.size) }
      return
    }
    if (data.length > MAX_CONTROL_CHARS) return this.emit('error', 'The other device sent an oversized message.')
    let m
    try { m = JSON.parse(data) } catch { return this.emit('error', 'The other device sent an invalid message.') }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return this.emit('error', 'The other device sent an invalid message.')
    if (m.t === 'chat') {
      if (typeof m.text !== 'string' || m.text.length > MAX_BEAM_CHAT_CHARS) return this.emit('error', 'A received message was too long to show.')
      this.emit('chat', m.text)
    } else if (m.t === 'file') {
      if (!safeId(m.id) || typeof m.name !== 'string' || !Number.isSafeInteger(m.size) || m.size < 0 || m.size > MAX_BEAM_FILE_SIZE || (m.type != null && (typeof m.type !== 'string' || m.type.length > 127))) {
        return this.emit('transferError', safeId(m.id) ? m.id : '', 'The other device sent invalid file details.')
      }
      if (this.rx) return this.emit('transferError', m.id, 'A previous file is still being received.')
      const incoming = { id: m.id, name: safeName(m.name), size: m.size, type: safeType(m.type) }
      this.rx = { ...incoming, parts: [], got: 0, last: 0 }
      this.emit('incoming', incoming)
      if (incoming.size === 0) this.emit('recv', incoming.id, 0, 0)
    } else if (m.t === 'end') {
      const r = this.rx
      if (!r) return this.emit('error', 'The other device ended a file that was not being received.')
      if (m.id !== r.id) return this.rejectTransfer(r.id, 'The other device ended the wrong file transfer.')
      if (r.got !== r.size) return this.rejectTransfer(r.id, 'The received file was incomplete; ask the sender to try again.')
      this.rx = null
      try {
        const blob = new Blob(r.parts, { type: r.type || 'application/octet-stream' })
        this.emit('recv', r.id, r.size, r.size)
        this.emit('received', r.id, blob, r.name)
      } catch {
        this.emit('transferError', r.id, 'The received file could not be assembled.')
      }
    } else this.emit('error', 'The other device sent an unknown message.')
  }
  close() {
    this.rx = null
    try { this.dc?.close() } catch {}
    try { this.pc.close() } catch {}
    this.set('closed')
  }
}
