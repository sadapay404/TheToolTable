import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate'

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
const unb64 = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) }
export const encodeCode = (kind, d) => `BEAM-${kind}-` + b64(deflateSync(strToU8(JSON.stringify({ t: d.type, s: d.sdp })), { level: 9 }))
export function decodeCode(text) {
  const m = /BEAM-([OA])-([A-Za-z0-9_-]+)/.exec(String(text || '').replace(/\s+/g, ''))
  if (!m) throw new Error('That does not look like a Beam code')
  try { const j = JSON.parse(strFromU8(inflateSync(unb64(m[2])))); return { kind: m[1], desc: { type: j.t, sdp: j.s } } } catch { throw new Error('The code is damaged — copy it again in full') }
}
const waitIce = (pc, ms = 3500) => new Promise((res) => {
  if (pc.iceGatheringState === 'complete') return res()
  const done = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', ch); res() }, ch = () => pc.iceGatheringState === 'complete' && done(), t = setTimeout(done, ms)
  pc.addEventListener('icegatheringstatechange', ch)
})
const CH = 16 * 1024

export class Peer {
  constructor(mode = 'auto') {
    this.mode = mode; this.h = {}; this.state = 'new'; this.rx = null; this.q = Promise.resolve()
    this.pc = new RTCPeerConnection({ iceServers: mode === 'lan' ? [] : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] })
    this.pc.onconnectionstatechange = () => { const s = this.pc.connectionState; if (s === 'failed' || s === 'closed' || s === 'disconnected') this.set(s === 'disconnected' ? 'lost' : s); else if (s === 'connected') this.set('connected') }
  }
  on(e, f) { this.h[e] = f; return this }
  emit(e, ...a) { this.h[e]?.(...a) }
  set(s) { if (this.state !== s) { this.state = s; this.emit('state', s) } }
  wire(dc) {
    this.dc = dc; dc.binaryType = 'arraybuffer'
    dc.onopen = () => this.set('connected'); dc.onclose = () => this.set('closed')
    dc.onmessage = (e) => this.onData(e.data)
  }
  async host() { this.wire(this.pc.createDataChannel('beam')); await this.pc.setLocalDescription(await this.pc.createOffer()); await waitIce(this.pc); return encodeCode('O', this.pc.localDescription) }
  async accept(code) { const { kind, desc } = decodeCode(code); if (kind !== 'A') throw new Error('That is an invitation code. Paste the reply code from your friend instead.'); await this.pc.setRemoteDescription(desc); this.set('connecting') }
  async join(code) {
    const { kind, desc } = decodeCode(code); if (kind !== 'O') throw new Error('That is a reply code. Paste the invitation code from the other device.')
    this.pc.ondatachannel = (e) => this.wire(e.channel); await this.pc.setRemoteDescription(desc); await this.pc.setLocalDescription(await this.pc.createAnswer()); await waitIce(this.pc); this.set('connecting'); return encodeCode('A', this.pc.localDescription)
  }
  sendText(text) { this.dc.send(JSON.stringify({ t: 'chat', text })) }
  sendFile(file, id) {
    const job = async () => {
      const dc = this.dc; if (!dc || dc.readyState !== 'open') throw new Error('Not connected')
      dc.send(JSON.stringify({ t: 'file', id, name: file.name, size: file.size, type: file.type }))
      dc.bufferedAmountLowThreshold = 256 * 1024; let off = 0, last = 0
      while (off < file.size) {
        if (dc.readyState !== 'open') throw new Error('Connection closed')
        if (dc.bufferedAmount > 1024 * 1024) await new Promise((r) => { dc.onbufferedamountlow = () => { dc.onbufferedamountlow = null; r() } })
        const buf = await file.slice(off, off + CH).arrayBuffer(); dc.send(buf); off += buf.byteLength
        const now = performance.now(); if (now - last > 80 || off >= file.size) { last = now; this.emit('sent', id, off, file.size) }
      }
      dc.send(JSON.stringify({ t: 'end', id })); this.emit('sent', id, file.size, file.size, true)
    }
    this.q = this.q.then(job).catch((e) => { this.emit('fail', id, e.message) })
    return this.q
  }
  onData(d) {
    if (typeof d !== 'string') { const r = this.rx; if (!r) return; r.parts.push(d); r.got += d.byteLength; const now = performance.now(); if (now - r.last > 80) { r.last = now; this.emit('recv', r.id, r.got, r.size) } return }
    const m = JSON.parse(d)
    if (m.t === 'chat') this.emit('chat', m.text)
    else if (m.t === 'file') { this.rx = { ...m, parts: [], got: 0, last: 0 }; this.emit('incoming', m) }
    else if (m.t === 'end' && this.rx) { const r = this.rx; this.rx = null; const blob = new Blob(r.parts, { type: r.type || 'application/octet-stream' }); this.emit('recv', r.id, r.size, r.size); this.emit('received', r.id, blob, r.name) }
  }
  close() { try { this.dc?.close() } catch {} try { this.pc.close() } catch {} this.set('closed') }
}
