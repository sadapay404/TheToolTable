import React, { useEffect, useRef, useState } from 'react'
import { Dropzone, Field, Note, Progress } from '../components/ui.jsx'
import { loadImage, download, baseName, recentAction } from '../lib/utils.js'

let pipelinePromise = null
function loadModel(onStatus) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      onStatus('Downloading Transformers.js runtime…')
      const { env, pipeline } = await import('@huggingface/transformers')
      env.allowLocalModels = false
      onStatus('Downloading RMBG-1.4 model (~44 MB, cached afterwards)…')
      const device = navigator.gpu ? 'webgpu' : 'wasm'
      const p = await pipeline('image-segmentation', 'briaai/RMBG-1.4', {
        device,
        progress_callback: (x) => x.status === 'progress' && onStatus(`Downloading model… ${Math.round(x.progress || 0)}%`),
      }).catch(async () => {
        onStatus('WebGPU unavailable — retrying on WASM…')
        return pipeline('image-segmentation', 'briaai/RMBG-1.4', { device: 'wasm' })
      })
      return p
    })()
    pipelinePromise.catch(() => { pipelinePromise = null })
  }
  return pipelinePromise
}

export default function BgRemover() {
  const [img, setImg] = useState(null)
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [maskCanvas, setMaskCanvas] = useState(null)
  const [mode, setMode] = useState('view') // view | add | remove
  const [brush, setBrush] = useState(36)
  const [bg, setBg] = useState('transparent')
  const [bgColor, setBgColor] = useState('#C87941')
  const canvasRef = useRef(null)
  const painting = useRef(false)

  async function load([f]) {
    setError(''); setMaskCanvas(null); setBusy(true); setStatus('Preparing image…')
    try {
      const url = URL.createObjectURL(f)
      const image = await loadImage(url)
      setImg(image); setName(f.name)
      const pipe = await loadModel(setStatus)
      setStatus('Running ultra-precise segmentation…')
      const { data, width, height } = await pipe(image, { device: navigator.gpu ? 'webgpu' : 'wasm' })
      const mc = document.createElement('canvas')
      mc.width = width; mc.height = height
      const mctx = mc.getContext('2d')
      const id = mctx.createImageData(width, height)
      for (let i = 0; i < width * height; i++) {
        const v = Math.round((data[i] ?? data) * 255)
        id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
        id.data[i * 4 + 3] = 255
      }
      mctx.putImageData(id, 0, 0)
      setMaskCanvas(mc)
      setStatus('')
      recentAction(`Removed background from ${f.name}`)
    } catch (e) {
      setError('Background removal failed: ' + e.message + '. (Model downloads ~44 MB on first run; needs network access to huggingface.co.)')
      setStatus('')
    } finally { setBusy(false) }
  }

  function compose(target, scale = 1) {
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    target.width = w; target.height = h
    const ctx = target.getContext('2d')
    if (bg === 'solid') { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, w, h) }
    if (bg === 'gradient') {
      const g = ctx.createLinearGradient(0, 0, w, h)
      g.addColorStop(0, bgColor); g.addColorStop(1, '#1A1817')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    }
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h
    const tctx = tmp.getContext('2d')
    tctx.drawImage(img, 0, 0, w, h)
    const m = document.createElement('canvas'); m.width = w; m.height = h
    m.getContext('2d').drawImage(maskCanvas, 0, 0, w, h)
    tctx.globalCompositeOperation = 'destination-in'
    tctx.drawImage(m, 0, 0)
    ctx.drawImage(tmp, 0, 0)
  }

  useEffect(() => {
    if (!img || !maskCanvas || !canvasRef.current) return
    const scale = Math.min(1, 1200 / img.naturalWidth)
    compose(canvasRef.current, scale)
  }, [img, maskCanvas, bg, bgColor])

  function paintAt(e) {
    if (!painting.current || mode === 'view') return
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const sx = c.width / r.width, sy = c.height / r.height
    const x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sy
    // paint on full-res mask via scaled coords
    const mctx = maskCanvas.getContext('2d')
    const mx = x / c.width * maskCanvas.width, my = y / c.height * maskCanvas.height
    mctx.globalCompositeOperation = mode === 'add' ? 'lighter' : 'destination-out'
    mctx.fillStyle = '#fff'
    mctx.beginPath()
    mctx.arc(mx, my, brush * (maskCanvas.width / c.width), 0, Math.PI * 2)
    mctx.fill()
    mctx.globalCompositeOperation = 'source-over'
    compose(c, c.width / img.naturalWidth)
  }

  return !img ? (
    <div className="space-y-4">
      <Dropzone onFiles={load} accept="image/*" label="Drop a photo to cut out" sub="RMBG-1.4 neural net · razor-sharp hair & fur edges · runs 100% on-device" />
      <Note>First run downloads the model (~44 MB) and caches it. WebGPU is used when available for near-instant inference.</Note>
    </div>
  ) : (
    <div className="grid lg:grid-cols-[1fr_300px] gap-5">
      <div className="space-y-3">
        {status && <Note>{status}</Note>}
        {busy && <Progress value={100} label={status || 'Working'} />}
        {error && <Note tone="warn">{error}</Note>}
        <div className="card p-4 grid place-items-center" style={{ background: 'repeating-conic-gradient(var(--surface2) 0% 25%, var(--surface) 0% 50%) 50% / 24px 24px' }}>
          {maskCanvas && (
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-[58vh] rounded-lg"
              style={{ cursor: mode === 'view' ? 'default' : 'crosshair', boxShadow: 'var(--shadow)' }}
              onPointerDown={(e) => { painting.current = true; e.target.setPointerCapture(e.pointerId); paintAt(e) }}
              onPointerMove={paintAt}
              onPointerUp={() => { painting.current = false }}
            />
          )}
        </div>
        {maskCanvas && (
          <div className="flex flex-wrap gap-2">
            <button className="chip" data-on={mode === 'view'} onClick={() => setMode('view')}>👁 View</button>
            <button className="chip" data-on={mode === 'add'} onClick={() => setMode('add')}>➕ Restore brush</button>
            <button className="chip" data-on={mode === 'remove'} onClick={() => setMode('remove')}>➖ Erase brush</button>
            <span className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              Size <input type="range" min="6" max="120" value={brush} onChange={(e) => setBrush(+e.target.value)} />
            </span>
          </div>
        )}
      </div>

      {maskCanvas && (
        <div className="card p-5 space-y-4 h-fit">
          <Field label="Background">
            <div className="flex flex-wrap gap-2">
              {[['transparent', 'Transparent'], ['solid', 'Solid'], ['gradient', 'Gradient']].map(([v, l]) => (
                <button key={v} className="chip" data-on={bg === v} onClick={() => setBg(v)}>{l}</button>
              ))}
            </div>
          </Field>
          {bg !== 'transparent' && (
            <Field label="Color">
              <input type="color" className="input h-11 p-1" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
            </Field>
          )}
          <button
            className="btn btn-primary w-full"
            onClick={() => {
              const out = document.createElement('canvas')
              compose(out, 1)
              out.toBlob((b) => download(b, `${baseName(name)}-cutout.png`), 'image/png')
              recentAction(`Exported full-res cutout of ${name}`)
            }}
          >💾 Export full-res PNG</button>
          <Note>Export is at original resolution — zero edge pixelation, zero compression.</Note>
        </div>
      )}
    </div>
  )
}
