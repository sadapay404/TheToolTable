import { VERT, FRAG } from './shader.js'
import { uniformsFor, normalize } from './design.js'
import { assertCanvasSize } from './bounds.js'

const clone = (u) => ({ f: { ...u.f }, i: { ...u.i }, lab: new Float32Array(u.lab) })
function compile(gl, type, src) {
  const s = gl.createShader(type)
  if (!s) throw new Error('Could not allocate a WebGL shader.')
  gl.shaderSource(s, src); gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(message || 'The background shader could not be compiled.') }
  return s
}

export class WallRenderer {
  constructor(canvas) {
    this.canvas = canvas || document.createElement('canvas')
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')
    this.gl = gl
    const pr = gl.createProgram(), shaders = []
    try {
      if (!pr) throw new Error('Could not allocate a WebGL program.')
      shaders.push(compile(gl, gl.VERTEX_SHADER, VERT))
      shaders.push(compile(gl, gl.FRAGMENT_SHADER, FRAG))
      for (const shader of shaders) gl.attachShader(pr, shader)
      gl.linkProgram(pr)
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) || 'The background shader could not be linked.')
      for (const shader of shaders) gl.deleteShader(shader)
      this.pr = pr; gl.useProgram(pr); this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao); this.loc = {}
      this.cur = null; this.tgt = null
    } catch (error) {
      for (const shader of shaders) { try { gl.deleteShader(shader) } catch {} }
      if (pr) { try { gl.deleteProgram(pr) } catch {} }
      try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch {}
      throw error
    }
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
  dispose() {
    if (this.disposed) return
    this.disposed = true
    try { if (this.vao) this.gl.deleteVertexArray(this.vao) } catch {}
    try { if (this.pr) this.gl.deleteProgram(this.pr) } catch {}
    try { this.gl.getExtension('WEBGL_lose_context')?.loseContext() } catch {}
  }
}

/* ---------- shared tiny renderer for thumbnails + luminance probes ---------- */
let tiny = null
const tinyR = () => (tiny ||= new WallRenderer())
export function thumbURL(d, w = 160, h = 100, phase = 0) {
  const width = Math.max(1, Math.min(1024, Math.round(Number.isFinite(+w) ? +w : 160)))
  const height = Math.max(1, Math.min(1024, Math.round(Number.isFinite(+h) ? +h : 100)))
  const r = tinyR(); r.canvas.width = width; r.canvas.height = height; r.setDesign(d, true); r.draw(phase, width, height)
  return r.canvas.toDataURL('image/jpeg', 0.84)
}
/** average relative luminance (0‥1) + spread of the design; used for auto text colour and the legibility meter */
export function probe(d, aspect = 1.6, phase = 0) {
  const ratio = Number.isFinite(+aspect) && +aspect > 0 ? Math.min(4, Math.max(0.25, +aspect)) : 1.6
  const r = tinyR(), w = 36, h = Math.max(12, Math.min(144, Math.round(36 / ratio))); r.canvas.width = w; r.canvas.height = h; r.setDesign(d, true); r.draw(phase, w, h)
  const px = new Uint8Array(w * h * 4); r.gl.readPixels(0, 0, w, h, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px)
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  let s = 0, mn = 1, mx = 0, s2 = 0; const n = w * h
  for (let i = 0; i < px.length; i += 4) { const L = 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]); s += L; s2 += L * L; if (L < mn) mn = L; if (L > mx) mx = L }
  const avg = s / n
  return { avg, min: mn, max: mx, sd: Math.sqrt(Math.max(0, s2 / n - avg * avg)) }
}

/** Render a bounded output on a 2D canvas, drawing the WebGL image in small tiles. */
export async function renderToCanvas(d, W, H, phase = 0, onProgress) {
  const { w, h } = assertCanvasSize(W, H)
  const r = new WallRenderer()
  let out = null, complete = false
  try {
    r.setDesign(d, true)
    out = document.createElement('canvas'); out.width = w; out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Could not create a 2D canvas for the background export.')
    const T = 2048, tw0 = Math.min(T, w), th0 = Math.min(T, h); r.canvas.width = tw0; r.canvas.height = th0
    const nx = Math.ceil(w / T), ny = Math.ceil(h / T); let done = 0
    for (let ty = 0; ty < ny; ty++) for (let tx = 0; tx < nx; tx++) {
      const x0 = tx * T, y0 = ty * T, tw = Math.min(T, w - x0), th = Math.min(T, h - y0)
      r.draw(phase, tw, th, w, h, x0, h - y0 - th)
      ctx.drawImage(r.canvas, 0, th0 - th, tw, th, x0, y0, tw, th)
      onProgress?.(++done / (nx * ny)); if (nx * ny > 1) await new Promise((res) => setTimeout(res, 0))
    }
    complete = true
    return out
  } finally {
    r.dispose()
    if (!complete && out) out.width = out.height = 0
  }
}
