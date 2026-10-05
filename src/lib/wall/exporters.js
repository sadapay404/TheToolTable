import { Zip, ZipPassThrough } from 'fflate'
import fixWebm from 'fix-webm-duration'
import { FRAG, VERT } from './shader.js'
import { uniformsFor, normalize, encodeDesign, textColorFor } from './design.js'
import { renderToCanvas, probe, WallRenderer } from './renderer.js'
import { drawText, ensureFonts } from './textlayer.js'
import { assertCanvasSize, fitDimensions, MAX_SIDE, MAX_CANVAS_PIXELS } from './bounds.js'

export { MAX_SIDE, MAX_CANVAS_PIXELS }
export const MAX_PACK_FILES = 32
export const MAX_PACK_BYTES = 150 * 1024 * 1024
export const MAX_VIDEO_SIDE = 8_192
export const MAX_VIDEO_PIXELS = 24_000_000
export const outSize = (d, mult = 1) => {
  const size = normalize(d).size
  const scale = Number.isFinite(+mult) ? Math.max(0.1, Math.min(10, +mult)) : 1
  const fit = fitDimensions(size.w * scale, size.h * scale)
  return { w: fit.w, h: fit.h }
}

async function composeStill(d, W, H, phase, onProgress) {
  const c = await renderToCanvas(d, W, H, phase, onProgress)
  try {
    if (d.text.on) { await ensureFonts(d.text); const pr = probe(d, W / H, phase); drawText(c.getContext('2d'), W, H, d.text, textColorFor(pr.avg)) }
    return c
  } catch (error) { c.width = c.height = 0; throw error }
}
const toBlob = (c, mime, q) => new Promise((res, rej) => c.toBlob((b) => {
  if (!b) return rej(new Error('The browser could not encode that size. Try a smaller scale.'))
  if (b.type !== mime) return rej(new Error(`This browser cannot export ${mime.split('/')[1].toUpperCase()} images.`))
  res(b)
}, mime, q))
export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const safeQuality = (q) => Number.isFinite(+q) ? Math.max(0.1, Math.min(1, +q)) : 1
function safeFormat(fmt) { if (!Object.hasOwn(MIME, fmt)) throw new RangeError('Choose PNG, JPG or WebP.'); return fmt }

export async function exportImage(d, { fmt = 'png', W, H, quality = 1, onProgress } = {}) {
  const format = safeFormat(fmt), size = assertCanvasSize(W, H), design = normalize(d)
  let c
  try {
    c = await composeStill(design, size.w, size.h, 0, onProgress)
    return await toBlob(c, MIME[format], safeQuality(quality))
  } finally { if (c) c.width = c.height = 0 }
}

function validatePackSizes(sizes) {
  if (!Array.isArray(sizes) || !sizes.length || sizes.length > MAX_PACK_FILES) throw new RangeError(`Choose between 1 and ${MAX_PACK_FILES} wallpaper sizes for a pack.`)
  const names = new Set(); let pixels = 0
  return sizes.map((entry) => {
    if (!Array.isArray(entry) || entry.length < 3) throw new TypeError('A wallpaper size entry is invalid.')
    const [rawName, rawW, rawH] = entry
    const name = typeof rawName === 'string' ? rawName : ''
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(name) || name === '__proto__') throw new TypeError('Wallpaper pack filenames may contain only letters, numbers, dashes and underscores.')
    if (names.has(name.toLowerCase())) throw new TypeError(`The wallpaper pack contains a duplicate name: ${name}.`)
    names.add(name.toLowerCase())
    const w = Number(rawW), h = Number(rawH), size = assertCanvasSize(w, h)
    pixels += size.w * size.h
    if (pixels > MAX_CANVAS_PIXELS) throw new RangeError(`The selected wallpaper pack exceeds ${MAX_CANVAS_PIXELS / 1_000_000} megapixels in total. Choose fewer sizes.`)
    return [name, size.w, size.h]
  })
}

/** Re-render every selected size, streaming each completed image into the ZIP. */
export async function exportPack(d, sizes, { fmt = 'png', quality = 1, onProgress } = {}) {
  const format = safeFormat(fmt), entries = validatePackSizes(sizes), design = normalize(d), chunks = []
  let archiveBytes = 0, zipError = null
  let finishZip, failZip
  const zipDone = new Promise((resolve, reject) => { finishZip = resolve; failZip = reject })
  const zip = new Zip((error, data, final) => {
    if (error) { zipError = error; if (final) failZip(error); return }
    if (data) {
      archiveBytes += data.byteLength
      if (archiveBytes > MAX_PACK_BYTES) zipError = new RangeError('This wallpaper pack is too large to assemble safely in memory. Choose fewer sizes or use JPG/WebP.')
      else chunks.push(data)
    }
    if (final) zipError ? failZip(zipError) : finishZip()
  })
  for (let i = 0; i < entries.length; i++) {
    const [name, w, h] = entries[i]
    let c
    try {
      c = await composeStill(design, w, h, 0)
      const blob = await toBlob(c, MIME[format], safeQuality(quality))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const file = new ZipPassThrough(`${name}-${w}x${h}.${format}`)
      zip.add(file); file.push(bytes, true)
      if (zipError) throw zipError
      onProgress?.((i + 1) / entries.length)
    } finally { if (c) c.width = c.height = 0 }
  }
  zip.end()
  await zipDone
  return new Blob(chunks, { type: 'application/zip' })
}

export function videoTypes() {
  if (typeof MediaRecorder === 'undefined') return []
  const cands = [['mp4', 'video/mp4;codecs=avc1.640034'], ['mp4', 'video/mp4;codecs=avc1.42E01E'], ['mp4', 'video/mp4'], ['webm', 'video/webm;codecs=vp9'], ['webm', 'video/webm;codecs=vp8'], ['webm', 'video/webm']]
  const out = []; for (const [ext, mime] of cands) if (!out.find((o) => o.ext === ext) && MediaRecorder.isTypeSupported(mime)) out.push({ ext, mime }); return out
}

const abortError = () => new Error('Cancelled')
const stopTracks = (stream) => { try { for (const track of stream?.getTracks?.() || []) track.stop() } catch {} }

/** Real-time capture of a bounded, seamless animation loop. All streams and GPU resources are disposed on every exit path. */
export async function recordLoop(d, { W, H, fps = 30, loops = 1, ext, mime, bps } = {}, onProgress, signal) {
  const design = normalize(d), size = assertCanvasSize(W, H, { maxSide: MAX_VIDEO_SIDE, maxPixels: MAX_VIDEO_PIXELS })
  if (signal?.aborted) throw abortError()
  fps = Number.isFinite(+fps) ? Math.max(1, Math.min(60, Math.round(+fps))) : 30
  loops = Number.isFinite(+loops) ? Math.max(1, Math.min(3, Math.round(+loops))) : 1
  ext = ext === 'mp4' ? 'mp4' : 'webm'
  if (typeof MediaRecorder === 'undefined') throw new Error('Video recording is not supported in this browser.')
  if (!mime || !MediaRecorder.isTypeSupported(mime)) throw new Error('The selected video format is not supported by this browser.')
  if (typeof document.createElement('canvas').captureStream !== 'function') throw new Error('Canvas video capture is not supported in this browser.')

  let renderer = null, stream = null, recorder = null, out = null, overlay = null, raf = 0
  try {
    renderer = new WallRenderer(); renderer.setDesign(design, true); renderer.canvas.width = size.w; renderer.canvas.height = size.h
    out = document.createElement('canvas'); out.width = size.w; out.height = size.h
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('Could not create a canvas for video recording.')
    if (design.text.on) {
      await ensureFonts(design.text)
      if (signal?.aborted) throw abortError()
      overlay = document.createElement('canvas'); overlay.width = size.w; overlay.height = size.h
      const overlayContext = overlay.getContext('2d')
      if (!overlayContext) throw new Error('Could not create the text overlay for video recording.')
      drawText(overlayContext, size.w, size.h, design.text, textColorFor(probe(design, size.w / size.h, 0).avg))
    }
    stream = out.captureStream(fps)
    const bitrate = Number.isFinite(+bps) ? Math.max(250_000, Math.min(60_000_000, Math.round(+bps))) : Math.max(1_000_000, Math.min(60_000_000, Math.round(size.w * size.h * fps * 0.08)))
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate })
    const total = design.loop * loops * 1000
    const blob = await new Promise((resolve, reject) => {
      const chunks = []; let t0 = 0, settled = false, cancelled = !!signal?.aborted
      const finish = (error, result) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        error ? reject(error) : resolve(result)
      }
      const onAbort = () => {
        cancelled = true
        if (recorder?.state === 'recording') { try { recorder.stop() } catch (error) { finish(error) } }
        else finish(abortError())
      }
      const frame = (now) => {
        if (settled) return
        if (signal?.aborted || cancelled) { onAbort(); return }
        try {
          if (!t0) t0 = now
          const elapsed = Math.max(0, now - t0), phase = ((elapsed % (design.loop * 1000)) / (design.loop * 1000)) * Math.PI * 2
          renderer.draw(phase, size.w, size.h); ctx.drawImage(renderer.canvas, 0, 0)
          if (overlay) ctx.drawImage(overlay, 0, 0)
          onProgress?.(Math.min(1, elapsed / total))
          if (elapsed >= total) recorder.stop()
          else raf = requestAnimationFrame(frame)
        } catch (error) { try { if (recorder?.state === 'recording') recorder.stop() } catch {} finish(error) }
      }
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data) }
      recorder.onerror = (event) => finish(event.error || new Error('The video recorder failed.'))
      recorder.onstop = async () => {
        if (settled) return
        if (cancelled || signal?.aborted) { finish(abortError()); return }
        let result = new Blob(chunks, { type: mime.split(';')[0] })
        if (ext === 'webm') {
          result = await new Promise((resolveFix) => {
            const timer = setTimeout(() => resolveFix(result), 10_000)
            try { fixWebm(result, Math.round(total), (fixed) => { clearTimeout(timer); resolveFix(fixed || result) }) }
            catch { clearTimeout(timer); resolveFix(result) }
          })
        }
        finish(null, result)
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
      else { recorder.start(250); raf = requestAnimationFrame(frame) }
    })
    return blob
  } catch (error) {
    if (signal?.aborted && error?.message !== 'Cancelled') throw abortError()
    throw error
  } finally {
    cancelAnimationFrame(raf)
    try { if (recorder?.state === 'recording') recorder.stop() } catch {}
    stopTracks(stream)
    renderer?.dispose()
    if (overlay) overlay.width = overlay.height = 0
    if (out) out.width = out.height = 0
  }
}

function scriptJSON(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') }

/** Self-contained HTML for Lively, Wallpaper Engine or a website hero. */
export function liveHTML(input) {
  const d = normalize(input), u = uniformsFor(d), U = { f: u.f, i: u.i, lab: Array.from(u.lab) }
  const designCode = encodeDesign(d)
  const overlay = d.text.on ? scriptJSON(d.text) : 'null'
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live background — TheToolTable</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}canvas{display:block;position:absolute;inset:0;width:100vw;height:100vh}#t{pointer-events:none}</style></head>
<body><canvas id="c"></canvas><canvas id="t"></canvas>
<script>
/* Generated by TheToolTable · Background Canvas Studio. Seamless ${d.loop}s loop. Design code: ${designCode} */
const VERT=${scriptJSON(VERT)},FRAG=${scriptJSON(FRAG)},U=${scriptJSON(U)},LOOP=${d.loop},TEXT=${overlay};
const c=document.getElementById('c'),t=document.getElementById('t'),gl=c.getContext('webgl2'),tc=t.getContext('2d');
function fail(msg){document.body.innerHTML='<div style="font:16px system-ui;color:white;padding:24px">'+msg+'</div>'}
function sh(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');return s}
if(!gl){fail('WebGL 2 is required to display this live background.')}else try{
const p=gl.createProgram(),vs=sh(gl.VERTEX_SHADER,VERT),fs=sh(gl.FRAGMENT_SHADER,FRAG);gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p)||'Shader link failed');gl.useProgram(p);gl.bindVertexArray(gl.createVertexArray());
const L=n=>gl.getUniformLocation(p,n);let textDrawn=false;
function drawText(auto='#ffffff'){if(!TEXT||!TEXT.on)return;const x=tc,W=t.width,H=t.height,U=Math.sqrt(W*H),fs=TEXT.size/100*U,subfs=fs*TEXT.subScale,fonts={display:'Fraunces, Georgia, serif',sans:'Inter, system-ui, Arial, sans-serif',serif:'Georgia, Times New Roman, serif',mono:'ui-monospace, Consolas, monospace',black:'Arial Black, Impact, Arial, sans-serif'},fam=fonts[TEXT.font]||fonts.display,col=TEXT.color==='auto'?auto:TEXT.color,track=TEXT.track/100;
const title=String(TEXT.title||'').split('\\n').filter((s,i,a)=>s.length||i<a.length-1),subs=String(TEXT.sub||'').split('\\n').filter(Boolean),rows=[];function setFont(px,weight,italic){x.font=(italic?'italic ':'')+weight+' '+px+'px '+fam}function widthOf(s,px){return x.measureText(s).width+(track?track*px*Math.max(0,s.length-1):0)}
setFont(fs,TEXT.weight,TEXT.italic);for(const s of title)rows.push({s,px:fs,w:widthOf(s,fs),gap:fs*1.12});const gap0=rows.length?fs*.55:0;setFont(subfs,Math.min(500,TEXT.weight),false);for(const s of subs)rows.push({s,px:subfs,w:widthOf(s,subfs),gap:subfs*1.45,sub:true,pre:gap0});rows.forEach(r=>{setFont(r.px,r.sub?Math.min(500,TEXT.weight):TEXT.weight,r.sub?false:TEXT.italic);r.w=widthOf(r.s,r.px)});
const bw=Math.max(0,...rows.map(r=>r.w));let bh=0;rows.forEach((r,i)=>bh+=(i===0?r.px*.8:r.gap)+(r.pre&&i>0&&!rows[i-1].sub?r.pre:0));const mx=.07*U,my=.07*U,ox=TEXT.ax===0?mx:TEXT.ax===2?W-mx-bw:(W-bw)/2,oy=TEXT.ay===0?my:TEXT.ay===2?H-my-bh:(H-bh)/2;let x0=ox+TEXT.dx/100*W,y=oy+TEXT.dy/100*H;x.clearRect(0,0,W,H);x.save();x.globalAlpha=TEXT.opacity;x.fillStyle=col;x.textBaseline='alphabetic';if(TEXT.shadow>0){x.shadowColor='rgba(0,0,0,'+(TEXT.shadow*.55)+')';x.shadowBlur=fs*.28;x.shadowOffsetY=fs*.06}rows.forEach((r,i)=>{y+=i===0?r.px*.8:r.gap+(r.pre&&!rows[i-1].sub?r.pre:0);setFont(r.px,r.sub?Math.min(500,TEXT.weight):TEXT.weight,r.sub?false:TEXT.italic);const xx=TEXT.ax===0?x0:TEXT.ax===2?x0+bw-r.w:x0+(bw-r.w)/2;if(!track){x.textAlign='left';x.fillText(r.s,xx,y)}else{let xx2=xx;for(const ch of r.s){x.fillText(ch,xx2,y);xx2+=x.measureText(ch).width+track*r.px}}});x.restore()}
function size(){const r=Math.min(devicePixelRatio||1,2);c.width=t.width=Math.max(1,Math.round(innerWidth*r));c.height=t.height=Math.max(1,Math.round(innerHeight*r));if(TEXT&&TEXT.on&&TEXT.color!=='auto')drawText();else{textDrawn=false;tc.clearRect(0,0,t.width,t.height)}}addEventListener('resize',size);size();
for(const k in U.f)gl.uniform1f(L(k),U.f[k]);for(const k in U.i)gl.uniform1i(L(k),U.i[k]);gl.uniform3fv(L('u_lab'),new Float32Array(U.lab));gl.uniform2f(L('u_origin'),0,0);
const t0=performance.now();(function f(now){gl.viewport(0,0,c.width,c.height);gl.uniform2f(L('u_res'),c.width,c.height);gl.uniform1f(L('u_phase'),(((now-t0)/1000)%LOOP)/LOOP*Math.PI*2);gl.drawArrays(gl.TRIANGLES,0,3);if(TEXT&&TEXT.on&&TEXT.color==='auto'&&!textDrawn){const px=new Uint8Array(4);gl.readPixels(Math.floor(c.width/2),Math.floor(c.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);const lin=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)},lum=.2126*lin(px[0])+.7152*lin(px[1])+.0722*lin(px[2]);drawText(lum>.42?'#14110f':'#ffffff');textDrawn=true}requestAnimationFrame(f)})(t0);
}catch(e){fail('This background could not be rendered: '+String(e.message||e))}
</script></body></html>`
}
