import { VERT, FRAG } from './shader.js'
import { uniformsFor, normalize } from './design.js'

const clone = (u) => ({ f: { ...u.f }, i: { ...u.i }, lab: new Float32Array(u.lab) })
function compile(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s }

export class WallRenderer {
  constructor(canvas) {
    this.canvas = canvas || document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    this.gl = gl
    const pr = gl.createProgram(); gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr))
    this.pr = pr; gl.useProgram(pr); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); this.loc = {}
    this.cur = null; this.tgt = null
  }
  L(n) { return this.loc[n] ?? (this.loc[n] = this.gl.getUniformLocation(this.pr, n)) }
  setDesign(d, snap = false) { this.tgt = uniformsFor(normalize(d)); if (snap || !this.cur) this.cur = clone(this.tgt) }
  /** ease numbers toward the target; returns true while still moving */
  step(dt) {
    if (!this.cur || !this.tgt) return false
    const k = 1 - Math.exp(-dt * 9); let moving = false
    for (const n in this.tgt.f) { const a = this.cur.f[n], b = this.tgt.f[n]; if (Math.abs(b - a) > 1e-4) { this.cur.f[n] = a + (b - a) * k; moving = true } else this.cur.f[n] = b }
    if (this.cur.i.u_n !== this.tgt.i.u_n) { for (let j = Math.min(this.cur.i.u_n, this.tgt.i.u_n); j < 8; j++) { this.cur.lab.set(this.tgt.lab.subarray(j * 3, j * 3 + 3), j * 3) } }
    for (let j = 0; j < 24; j++) { const a = this.cur.lab[j], b = this.tgt.lab[j]; if (Math.abs(b - a) > 1e-4) { this.cur.lab[j] = a + (b - a) * k; moving = true } else this.cur.lab[j] = b }
    this.cur.i = { ...this.tgt.i }
    return moving
  }
  /** draw a viewport of vw×vh of a virtual image resW×resH, whose lower-left pixel is (ox, oy) */
  draw(phase, vw, vh, resW = vw, resH = vh, ox = 0, oy = 0) {
    const { gl } = this, u = this.cur; if (!u) return
    gl.viewport(0, 0, vw, vh)
    for (const n in u.f) gl.uniform1f(this.L(n), u.f[n])
    for (const n in u.i) gl.uniform1i(this.L(n), u.i[n])
    gl.uniform3fv(this.L('u_lab'), u.lab)
    gl.uniform2f(this.L('u_res'), resW, resH); gl.uniform2f(this.L('u_origin'), ox, oy); gl.uniform1f(this.L('u_phase'), phase)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  dispose() { try { this.gl.getExtension('WEBGL_lose_context')?.loseContext() } catch {} }
}

/* ---------- shared tiny renderer for thumbnails + luminance probes ---------- */
let tiny = null
const tinyR = () => (tiny ||= new WallRenderer())
export function thumbURL(d, w = 160, h = 100, phase = 0) {
  const r = tinyR(); r.canvas.width = w; r.canvas.height = h; r.setDesign(d, true); r.draw(phase, w, h)
  return r.canvas.toDataURL('image/jpeg', 0.84)
}
/** average relative luminance (0‥1) + spread of the design; used for auto text colour and the legibility meter */
export function probe(d, aspect = 1.6, phase = 0) {
  const r = tinyR(), w = 36, h = Math.max(12, Math.round(36 / aspect)); r.canvas.width = w; r.canvas.height = h; r.setDesign(d, true); r.draw(phase, w, h)
  const px = new Uint8Array(w * h * 4); r.gl.readPixels(0, 0, w, h, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px)
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  let s = 0, mn = 1, mx = 0, s2 = 0; const n = w * h
  for (let i = 0; i < px.length; i += 4) { const L = 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]); s += L; s2 += L * L; if (L < mn) mn = L; if (L > mx) mx = L }
  const avg = s / n
  return { avg, min: mn, max: mx, sd: Math.sqrt(Math.max(0, s2 / n - avg * avg)) }
}

/** render the whole design at W×H in tiles (memory-safe up to 16k) onto a 2D canvas */
export async function renderToCanvas(d, W, H, phase = 0, onProgress) {
  const r = new WallRenderer(); r.setDesign(d, true)
  const out = document.createElement('canvas'); out.width = W; out.height = H; const ctx = out.getContext('2d')
  const T = 2048, tw0 = Math.min(T, W), th0 = Math.min(T, H); r.canvas.width = tw0; r.canvas.height = th0
  const nx = Math.ceil(W / T), ny = Math.ceil(H / T); let done = 0
  for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
    const x0 = tx * T, y0 = ty * T, tw = Math.min(T, W - x0), th = Math.min(T, H - y0)
    r.draw(phase, tw, th, W, H, x0, H - y0 - th)
    ctx.drawImage(r.canvas, 0, th0 - th, tw, th, x0, y0, tw, th)
    onProgress?.(++done / (nx * ny)); if (nx * ny > 1) await new Promise((res) => setTimeout(res, 0))
  }
  r.dispose(); return out
}
