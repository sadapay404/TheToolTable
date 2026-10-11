import { hslToRgb, HSL_CHANNELS } from './params.js'

/** ---------------------------------------------------------------------------------------
 *  WebGL2 renderer: one fragment shader does geometry (rotate/flip/straighten/crop) and the
 *  full colour pipeline (light → colour → 8-channel HSL mixer → 3-way grade → effects).
 *  Works on still images and on video frames; nothing is ever re-compressed on the way.
 *  --------------------------------------------------------------------------------------- */

const VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5-aPos.y*0.5); gl_Position = vec4(aPos,0.0,1.0); }`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 outColor;
uniform sampler2D uTex;
// geometry
uniform vec4 uCrop; uniform vec2 uCs; uniform float uAspect, uRot; uniform vec2 uFlip;
uniform float uOutAspect; uniform float uSplit;
// light / colour
uniform float uExposure, uBrightness, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform float uTemp, uTint, uSat, uVib, uFade, uHue;
uniform vec3 uHsl[8];
uniform vec4 uGradeS, uGradeM, uGradeH; uniform vec2 uGradeBal;
// fx
uniform float uSharpen, uBlur, uVig, uVigFeather, uGrain, uGlow, uChroma, uPixel, uPoster, uSepia, uMono, uInvert, uDuo;
uniform vec3 uDuoA, uDuoB;
uniform float uSeed;

const vec3 W = vec3(0.2126, 0.7152, 0.0722);

vec2 toSrc(vec2 p, out bool ok){
  vec2 q = uCrop.xy + p*uCrop.zw;
  vec2 d = (q-0.5)*vec2(uAspect,1.0);
  d = vec2(uCs.x*d.x + uCs.y*d.y, -uCs.y*d.x + uCs.x*d.y);
  q = d/vec2(uAspect,1.0) + 0.5;
  ok = q.x>=0.0 && q.x<=1.0 && q.y>=0.0 && q.y<=1.0;
  if(uFlip.x>0.5) q.x = 1.0-q.x;
  if(uFlip.y>0.5) q.y = 1.0-q.y;
  if(uRot<0.5) return q;
  if(uRot<1.5) return vec2(q.y, 1.0-q.x);
  if(uRot<2.5) return vec2(1.0-q.x, 1.0-q.y);
  return vec2(1.0-q.y, q.x);
}
vec3 sampleP(vec2 p){ bool ok; return texture(uTex, toSrc(p, ok)).rgb; }

vec3 rgb2hsl(vec3 c){
  float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)), l=(mx+mn)*0.5, d=mx-mn;
  if(d<1e-5) return vec3(0.0,0.0,l);
  float s = d/(1.0-abs(2.0*l-1.0));
  float h;
  if(mx==c.r) h = mod((c.g-c.b)/d, 6.0);
  else if(mx==c.g) h = (c.b-c.r)/d + 2.0;
  else h = (c.r-c.g)/d + 4.0;
  return vec3(h/6.0, clamp(s,0.0,1.0), l);
}
vec3 hsl2rgb(vec3 c){
  vec3 k = mod(vec3(0.0,8.0,4.0)+c.x*12.0, 12.0);
  float a = c.y*min(c.z,1.0-c.z);
  return c.z - a*clamp(min(k-3.0, 9.0-k), -1.0, 1.0);
}
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }

void main(){
  vec2 p = vUv;
  if(uPixel>0.5){ float cells = mix(420.0, 22.0, uPixel/100.0); vec2 g = vec2(cells, cells/uOutAspect); p = (floor(p*g)+0.5)/g; }
  bool ok; vec2 s = toSrc(p, ok);
  if(!ok){ outColor = vec4(0.0); return; }
  vec2 asp = vec2(1.0, uOutAspect);              // y offsets scaled so taps are circular

  vec4 t0 = texture(uTex, s);
  if(uSplit>=0.0 && vUv.x<uSplit){ outColor = vec4(t0.rgb*t0.a, t0.a); return; }

  vec3 c = t0.rgb;
  // ---------- spatial stage
  if(uChroma>0.01){
    vec2 dir = (p-0.5)*uChroma*0.0016;
    c = vec3(sampleP(p+dir).r, c.g, sampleP(p-dir).b);
  }
  if(uBlur>0.01){
    float R = uBlur/100.0*0.03;
    vec3 acc = c;
    for(int i=0;i<16;i++){ float a=float(i)*2.39996; float r=sqrt((float(i)+0.5)/16.0);
      acc += sampleP(p + vec2(cos(a),sin(a))*r*R*asp); }
    c = acc/17.0;
  }
  if(uSharpen>0.01){
    float k = 0.0014;
    vec3 b = (sampleP(p+vec2(k,0.0)*asp)+sampleP(p-vec2(k,0.0)*asp)+sampleP(p+vec2(0.0,k)*asp)+sampleP(p-vec2(0.0,k)*asp))*0.25;
    c += (c-b)*uSharpen/100.0*2.8;
  }
  vec3 glowAcc = vec3(0.0);
  if(uGlow>0.01){
    for(int i=0;i<12;i++){ float a=float(i)*2.39996; float r=sqrt((float(i)+0.5)/12.0);
      glowAcc += max(sampleP(p + vec2(cos(a),sin(a))*r*0.05*asp) - 0.55, 0.0); }
    glowAcc /= 12.0;
  }

  // ---------- light
  c = pow(max(c,0.0), vec3(2.2)) * exp2(uExposure);
  c = pow(c, vec3(1.0/2.2));
  c += uBrightness/100.0*0.25;
  float k = uContrast/100.0; float cf = k>=0.0 ? 1.0+k*1.1 : 1.0+k*0.85;
  c = (c-0.5)*cf + 0.5;
  float l = dot(c,W);
  c += uShadows/100.0*0.34*(1.0-smoothstep(0.0,0.62,l));
  c += uHighlights/100.0*0.3*smoothstep(0.38,1.0,l);
  c += uBlacks/100.0*0.2*(1.0-smoothstep(0.0,0.3,l));
  c += uWhites/100.0*0.22*smoothstep(0.68,1.0,l);

  // ---------- white balance
  float t = uTemp/100.0, ti = uTint/100.0;
  c.r *= 1.0+0.26*t; c.b *= 1.0-0.26*t;
  c.g *= 1.0-0.16*ti; c.r *= 1.0+0.05*ti; c.b *= 1.0+0.05*ti;

  // ---------- HSL mixer (8 colour channels + global hue)
  c = clamp(c,0.0,1.0);
  vec3 hsl = rgb2hsl(c);
  float dh=0.0, ds=0.0, dl=0.0, sw=0.0;
  float chromaW = smoothstep(0.03,0.22,hsl.y) * (1.0-pow(abs(2.0*hsl.z-1.0),3.0));
  float cent[8]; cent[0]=0.0; cent[1]=28.0/360.0; cent[2]=55.0/360.0; cent[3]=120.0/360.0; cent[4]=180.0/360.0; cent[5]=225.0/360.0; cent[6]=275.0/360.0; cent[7]=320.0/360.0;
  float wt[8];
  for(int i=0;i<8;i++){
    float d = abs(hsl.x-cent[i]); d = min(d, 1.0-d);
    wt[i] = exp(-d*d/(2.0*0.055*0.055)); sw += wt[i];
  }
  float norm = 1.0/max(1.0,sw);
  for(int i=0;i<8;i++){ float w = wt[i]*norm*chromaW;
    dh += w*uHsl[i].x/100.0*0.14; ds += w*uHsl[i].y/100.0; dl += w*uHsl[i].z/100.0*0.28; }
  hsl.x = fract(hsl.x + dh + uHue/360.0 + 1.0);
  hsl.y = clamp(hsl.y*(1.0+ds), 0.0, 1.0);
  hsl.z = clamp(hsl.z + dl, 0.0, 1.0);
  c = hsl2rgb(hsl);

  // ---------- saturation / vibrance / fade
  l = dot(c,W);
  c = mix(vec3(l), c, 1.0+uSat/100.0);
  float cs = max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b));
  c = mix(vec3(dot(c,W)), c, 1.0 + uVib/100.0*(1.0-cs)*1.15);
  c = mix(c, c*0.82+0.12, uFade/100.0);

  // ---------- 3-way colour grade
  l = dot(c,W);
  float bal = uGradeBal.y/100.0*0.25;
  float ms = 1.0-smoothstep(0.0+bal, 0.55+bal, l);
  float mh = smoothstep(0.45+bal, 1.0+bal, l);
  float mm = clamp(1.0-ms-mh, 0.0, 1.0);
  float gb = uGradeBal.x/100.0*0.9+0.1;
  c += (uGradeS.rgb - dot(uGradeS.rgb,W))*uGradeS.a*ms*gb;
  c += (uGradeM.rgb - dot(uGradeM.rgb,W))*uGradeM.a*mm*gb;
  c += (uGradeH.rgb - dot(uGradeH.rgb,W))*uGradeH.a*mh*gb;

  // ---------- stylise
  c += glowAcc*uGlow/100.0*2.2;
  vec3 sep = vec3(dot(c,vec3(0.393,0.769,0.189)), dot(c,vec3(0.349,0.686,0.168)), dot(c,vec3(0.272,0.534,0.131)));
  c = mix(c, sep, uSepia/100.0);
  c = mix(c, vec3(dot(c,W)), uMono/100.0);
  c = mix(c, mix(uDuoA, uDuoB, clamp(dot(c,W),0.0,1.0)), uDuo/100.0);
  if(uPoster>0.5){ float lv = mix(24.0, 2.5, uPoster/100.0); c = floor(c*lv+0.5)/lv; }
  c = mix(c, 1.0-c, uInvert/100.0);

  // ---------- vignette + grain
  float rr = length(vUv-0.5)*1.4142;               // 0 centre → 1 corners (follows the frame's aspect)
  float ff = uVigFeather/100.0;
  float vm = smoothstep(mix(0.8,0.1,ff), mix(1.0,1.2,ff), rr);
  c = uVig>=0.0 ? c*(1.0-vm*uVig/100.0*0.95) : mix(c, vec3(1.0), vm*(-uVig)/100.0*0.9);
  if(uGrain>0.01){
    vec2 gp = floor(vUv*vec2(1400.0, 1400.0/uOutAspect));
    float n = hash(gp+uSeed)-0.5;
    float lm = 1.0-abs(2.0*dot(c,W)-1.0);
    c += n*uGrain/100.0*0.32*(0.35+0.65*lm);
  }
  c = clamp(c, 0.0, 1.0);
  outColor = vec4(c*t0.a, t0.a);
}`

export function fitTextureSize(w, h, max) {
  if (![w, h, max].every(Number.isFinite) || w <= 0 || h <= 0 || max < 1) throw new RangeError('Texture dimensions must be positive finite numbers')
  const k = Math.min(1, max / w, max / h)
  return { w: Math.max(1, Math.floor(w * k)), h: Math.max(1, Math.floor(h * k)), capped: k < 1 }
}

const MAX_SOURCE_TEXTURE = 8192

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true })
  if (!gl) return null

  const shaders = []
  let prog = null, buf = null, tex = null
  const releasePartial = () => {
    shaders.forEach((sh) => { try { gl.deleteShader(sh) } catch {} })
    if (buf) { try { gl.deleteBuffer(buf) } catch {} }
    if (tex) { try { gl.deleteTexture(tex) } catch {} }
    if (prog) { try { gl.deleteProgram(prog) } catch {} }
    try { gl.getExtension('WEBGL_lose_context')?.loseContext() } catch {}
  }
  const compile = (type, src) => {
    const sh = gl.createShader(type)
    if (!sh) throw new Error('WebGL could not allocate a shader')
    gl.shaderSource(sh, src); gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(sh)
      gl.deleteShader(sh)
      throw new Error('Shader: ' + info)
    }
    shaders.push(sh)
    return sh
  }
  try {
    prog = gl.createProgram()
    if (!prog) throw new Error('WebGL could not allocate a program')
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Link: ' + gl.getProgramInfoLog(prog))
    gl.useProgram(prog)

    buf = gl.createBuffer()
    if (!buf) throw new Error('WebGL could not allocate a vertex buffer')
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    tex = gl.createTexture()
    if (!tex) throw new Error('WebGL could not allocate a source texture')
  } catch (e) {
    releasePartial()
    throw e
  }

  const locs = {}
  const U = (n) => (locs[n] ??= gl.getUniformLocation(prog, n))

  const state = { w: 1, h: 1, video: false, mip: true, ready: false, el: null, uploadEl: null, uploadCtx: null }
  const hardwareMaxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 1
  const maxTex = Math.max(1, Math.min(hardwareMaxTex, MAX_SOURCE_TEXTURE))

  function configureTexture() {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, state.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
  }

  /** el: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement */
  function setSource(el, w, h, isVideo = false) {
    if (!el || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error('The media has no usable pixel dimensions')
    const size = fitTextureSize(w, h, maxTex)
    state.w = size.w; state.h = size.h; state.video = isVideo
    state.mip = isVideo ? size.h <= 1440 : Math.max(size.w, size.h) <= 4096
    state.el = el; state.uploadEl = el; state.uploadCtx = null

    if (size.capped) {
      const scaled = document.createElement('canvas')
      scaled.width = size.w; scaled.height = size.h
      const ctx = scaled.getContext('2d')
      if (!ctx) throw new Error('Could not prepare a GPU-safe preview for this large file')
      state.uploadEl = scaled
      state.uploadCtx = ctx
      ctx.drawImage(el, 0, 0, size.w, size.h)
    }

    configureTexture()
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++) {}
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.uploadEl)
      if (state.mip) gl.generateMipmap(gl.TEXTURE_2D)
    } catch (e) {
      state.ready = false
      throw new Error('The GPU could not upload this media. Try a smaller image or video.', { cause: e })
    }
    const glError = gl.getError()
    if (glError !== gl.NO_ERROR) {
      state.ready = false
      throw new Error('The GPU rejected this media texture. It may exceed available memory.')
    }
    state.ready = true
    return { ...size, originalW: w, originalH: h }
  }

  function refreshVideo() {
    if (!state.video || !state.el || state.el.readyState < 2) return
    try {
      if (state.uploadCtx) state.uploadCtx.drawImage(state.el, 0, 0, state.w, state.h)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, state.uploadEl)
      if (state.mip) gl.generateMipmap(gl.TEXTURE_2D)
    } catch {
      // A transient decode frame can be unavailable while a video is seeking.
    }
  }

  /** Output size in px for given geometry params (at 100% scale). */
  function outputDims(p, crop = [p.cx, p.cy, p.cw, p.ch]) {
    const swap = p.rot % 2 === 1
    const ow = swap ? state.h : state.w, oh = swap ? state.w : state.h
    return { ow, oh, w: Math.max(1, Math.round(crop[2] * ow)), h: Math.max(1, Math.round(crop[3] * oh)) }
  }

  const hslBuf = new Float32Array(24)
  const wheel = (h, a) => { const [r, g, b] = hslToRgb(h / 360, 1, 0.5); return [r, g, b, a / 100] }

  /**
   * view = { crop?: [x,y,w,h] override, split?: 0..1 | null, seed?: number }
   */
  function draw(p, view = {}) {
    if (!state.ready) return
    const crop = view.crop || [p.cx, p.cy, p.cw, p.ch]
    const dims = outputDims(p, crop)
    const ang = (p.angle * Math.PI) / 180
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(U('uTex'), 0)
    gl.uniform4f(U('uCrop'), crop[0], crop[1], crop[2], crop[3])
    gl.uniform2f(U('uCs'), Math.cos(ang), Math.sin(ang))
    gl.uniform1f(U('uAspect'), dims.ow / dims.oh)
    gl.uniform1f(U('uRot'), p.rot)
    gl.uniform2f(U('uFlip'), p.flipH, p.flipV)
    gl.uniform1f(U('uOutAspect'), dims.w / dims.h)
    gl.uniform1f(U('uSplit'), view.split == null ? -1 : view.split)
    const f = (n, v) => gl.uniform1f(U(n), v)
    f('uExposure', p.exposure); f('uBrightness', p.brightness); f('uContrast', p.contrast)
    f('uHighlights', p.highlights); f('uShadows', p.shadows); f('uWhites', p.whites); f('uBlacks', p.blacks)
    f('uTemp', p.temp); f('uTint', p.tint); f('uSat', p.sat); f('uVib', p.vib); f('uFade', p.fade); f('uHue', p.hue)
    HSL_CHANNELS.forEach((c, i) => { hslBuf[i * 3] = p[`${c.id}_h`]; hslBuf[i * 3 + 1] = p[`${c.id}_s`]; hslBuf[i * 3 + 2] = p[`${c.id}_l`] })
    gl.uniform3fv(U('uHsl'), hslBuf)
    gl.uniform4fv(U('uGradeS'), wheel(p.gsH, p.gsA)); gl.uniform4fv(U('uGradeM'), wheel(p.gmH, p.gmA)); gl.uniform4fv(U('uGradeH'), wheel(p.ghH, p.ghA))
    gl.uniform2f(U('uGradeBal'), p.gBlend, p.gBal)
    f('uSharpen', p.sharpen); f('uBlur', p.blur); f('uVig', p.vig); f('uVigFeather', p.vigFeather); f('uGrain', p.grain)
    f('uGlow', p.glow); f('uChroma', p.chroma); f('uPixel', p.pixel); f('uPoster', p.poster); f('uSepia', p.sepia)
    f('uMono', p.mono); f('uInvert', p.invert); f('uDuo', p.duo)
    gl.uniform3fv(U('uDuoA'), hslToRgb(p.duoA / 360, 0.75, 0.22)); gl.uniform3fv(U('uDuoB'), hslToRgb(p.duoB / 360, 0.85, 0.72))
    f('uSeed', view.seed || 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  function setSize(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  }

  /** Render `p` into a standalone 2D canvas of the given width (used for preset thumbnails, histogram, auto). */
  function snapshot(p, width, view = {}) {
    const d = outputDims(p, view.crop)
    const w = Math.round(width), h = Math.max(1, Math.round((width * d.h) / d.w))
    const prevW = canvas.width, prevH = canvas.height
    const out = document.createElement('canvas'); out.width = w; out.height = h
    try {
      setSize(w, h); draw(p, view)
      const ctx = out.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('Could not create a thumbnail canvas')
      ctx.drawImage(canvas, 0, 0)
      return out
    } finally { setSize(prevW, prevH) }
  }

  function destroy() {
    state.ready = false; state.el = null; state.uploadEl = null; state.uploadCtx = null
    releasePartial()
  }

  function readPixel(x, y) {
    const px = new Uint8Array(4)
    gl.readPixels(Math.round(x), Math.round(canvas.height - 1 - y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return px
  }

  return { gl, maxTex, state, setSource, refreshVideo, outputDims, draw, setSize, snapshot, readPixel, destroy }
}
