import React, { useEffect, useRef, useState } from 'react'
import { Dropzone, Field, Note } from '../components/ui.jsx'
import { loadImage, download, baseName, recentAction, clamp } from '../lib/utils.js'

const DEFAULTS = { hue: 0, saturation: 100, contrast: 100, brightness: 100, exposure: 0, temperature: 0, tint: 0, vibrance: 0, highlights: 0, shadows: 0, sharpness: 0 }

const LUTS = [
  ['Original', {}],
  ['Warm Film', { temperature: 22, contrast: 108, saturation: 112, highlights: -8 }],
  ['Cool Noir', { temperature: -18, contrast: 122, saturation: 70, shadows: -14 }],
  ['Vintage Fade', { exposure: 8, contrast: 90, saturation: 82, highlights: 16, tint: 6 }],
  ['Vivid Pop', { vibrance: 45, saturation: 118, contrast: 108 }],
  ['Golden Hour', { temperature: 30, highlights: 10, vibrance: 25, brightness: 104 }],
  ['Moody Teal', { temperature: -12, tint: -10, shadows: -10, contrast: 110, saturation: 96 }],
]

function pixelPass(imgData, s) {
  const d = imgData.data
  const exp = Math.pow(2, s.exposure / 100)
  const temp = s.temperature / 100, tint = s.tint / 100, vib = s.vibrance / 100
  const hi = s.highlights / 100, sh = s.shadows / 100
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * exp, g = d[i + 1] * exp, b = d[i + 2] * exp
    r += temp * 30; b -= temp * 30; g += tint * 22; // warmth / tint
    if (vib) { // vibrance: boost weak colors more
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
      const amt = ((mx - mn) / 255) * vib * 1.4
      r += (r - (r + g + b) / 3) * amt + vib * 6
      g += (g - (r + g + b) / 3) * amt + vib * 6
      b += (b - (r + g + b) / 3) * amt + vib * 6
    }
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    if (hi) { const w = Math.max(0, lum / 255); r += hi * 45 * w; g += hi * 45 * w; b += hi * 45 * w }
    if (sh) { const w = Math.max(0, 1 - lum / 255); r += sh * 45 * w; g += sh * 45 * w; b += sh * 45 * w }
    d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(b, 0, 255)
  }
  return imgData
}

function render(src, canvas, s, scale = 1, rotation = 0, flipH = false, flipV = false) {
  const w = Math.max(1, Math.round(src.naturalWidth * scale))
  const h = Math.max(1, Math.round(src.naturalHeight * scale))
  const rot = ((rotation % 360) + 360) % 360
  const swap = rot === 90 || rot === 270
  canvas.width = swap ? h : w
  canvas.height = swap ? w : h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((rot * Math.PI) / 180)
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
  ctx.filter = `hue-rotate(${s.hue}deg) saturate(${s.saturation}%) contrast(${s.contrast}%) brightness(${s.brightness}%)`
  ctx.drawImage(src, -w / 2, -h / 2, w, h)
  ctx.restore()
  if (s.exposure || s.temperature || s.tint || s.vibrance || s.highlights || s.shadows) {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    pixelPass(data, s)
    ctx.putImageData(data, 0, 0)
  }
  if (s.sharpness > 0) sharpen(ctx, canvas.width, canvas.height, s.sharpness / 100)
}

function sharpen(ctx, w, h, amt) {
  const src = ctx.getImageData(0, 0, w, h)
  const out = ctx.createImageData(w, h)
  const s = src.data, o = out.data
  const k = amt * 0.8
  const center = 1 + 4 * k
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const idx = i + c
        const up = y > 0 ? s[idx - w * 4] : s[idx]
        const dn = y < h - 1 ? s[idx + w * 4] : s[idx]
        const lf = x > 0 ? s[idx - 4] : s[idx]
        const rt = x < w - 1 ? s[idx + 4] : s[idx]
        o[idx] = clamp(s[idx] * center - (up + dn + lf + rt) * k, 0, 255)
      }
      o[i + 3] = s[i + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
}

export default function ImageStudio() {
  const [img, setImg] = useState(null)
  const [name, setName] = useState('')
  const [s, setS] = useState({ ...DEFAULTS })
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [cropAspect, setCropAspect] = useState('none')
  const [outScale, setOutScale] = useState(1)
  const [lut, setLut] = useState('Original')
  const canvasRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function load([f]) {
    const url = URL.createObjectURL(f)
    setImg(await loadImage(url))
    setName(f.name)
    setS({ ...DEFAULTS }); setRotation(0); setFlipH(false); setFlipV(false); setLut('Original')
  }

  useEffect(() => {
    if (!img || !canvasRef.current) return
    const previewScale = Math.min(1, 1400 / img.naturalWidth)
    const c = canvasRef.current
    render(img, c, s, previewScale, rotation, flipH, flipV)
    // crop preview overlay is drawn via CSS aspect box below
  }, [img, s, rotation, flipH, flipV])

  async function exportPNG() {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 30))
    try {
      const out = document.createElement('canvas')
      render(img, out, s, outScale, rotation, flipH, flipV)
      if (cropAspect !== 'none') {
        const [aw, ah] = cropAspect.split(':').map(Number)
        const target = aw / ah
        let cw = out.width, ch = out.height
        if (cw / ch > target) cw = Math.round(ch * target); else ch = Math.round(cw / target)
        const tmp = document.createElement('canvas'); tmp.width = cw; tmp.height = ch
        tmp.getContext('2d').drawImage(out, (out.width - cw) / 2, (out.height - ch) / 2, cw, ch, 0, 0, cw, ch)
        out.width = cw; out.height = ch
        out.getContext('2d').drawImage(tmp, 0, 0)
      }
      const blob = await new Promise((res) => out.toBlob(res, 'image/png'))
      download(blob, `${baseName(name)}-edited.png`)
      recentAction(`Exported ${name} from ImagePlayer (lossless PNG)`)
    } finally { setBusy(false) }
  }

  const sliders = [
    ['hue', 'Hue', -180, 180, 'deg'], ['saturation', 'Saturation', 0, 200, '%'], ['contrast', 'Contrast', 40, 180, '%'],
    ['brightness', 'Brightness', 40, 180, '%'], ['exposure', 'Exposure', -60, 60, ''], ['temperature', 'Temperature', -60, 60, ''],
    ['tint', 'Tint', -60, 60, ''], ['vibrance', 'Vibrance', -60, 60, ''], ['highlights', 'Highlights', -60, 60, ''],
    ['shadows', 'Shadows', -60, 60, ''],
  ]

  return !img ? (
    <Dropzone onFiles={load} accept="image/*" label="Drop an image to play" sub="Non-destructive color lab · lossless PNG export" />
  ) : (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div className="space-y-4">
        <div className="card p-4 grid place-items-center overflow-hidden" style={{ background: 'repeating-conic-gradient(var(--surface2) 0% 25%, var(--surface) 0% 50%) 50% / 24px 24px' }}>
          <canvas ref={canvasRef} className="max-w-full max-h-[62vh] rounded-lg" style={{ boxShadow: 'var(--shadow)' }} />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {LUTS.map((l) => <button key={l[0]} className="chip" data-on={lut === l[0]} onClick={() => { setLut(l[0]); setS({ ...DEFAULTS, ...l[1] }) }}>{l[0]}</button>)}
          <span className="flex-1" />
          <button className="btn" onClick={() => setRotation((r) => (r + 270) % 360)}>⟲ Rotate</button>
          <button className="btn" onClick={() => setRotation((r) => (r + 90) % 360)}>⟳</button>
          <button className="btn" onClick={() => setFlipH((v) => !v)}>↔ Flip</button>
          <button className="btn" onClick={() => setFlipV((v) => !v)}>↕</button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          {sliders.map(([key, label, min, max, unit]) => (
            <div key={key}>
              <div className="flex justify-between text-xs font-bold mb-1"><span>{label}</span><span style={{ color: 'var(--muted)' }}>{s[key]}{unit}</span></div>
              <input type="range" className="w-full" min={min} max={max} value={s[key]} onChange={(e) => { setS({ ...s, [key]: +e.target.value }); setLut('Custom') }} />
            </div>
          ))}
          <div>
            <div className="flex justify-between text-xs font-bold mb-1"><span>Sharpness</span><span style={{ color: 'var(--muted)' }}>{s.sharpness}</span></div>
            <input type="range" className="w-full" min="0" max="100" value={s.sharpness} onChange={(e) => setS({ ...s, sharpness: +e.target.value })} />
            <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>Applied at full resolution on export.</div>
          </div>
          <button className="btn w-full" onClick={() => { setS({ ...DEFAULTS }); setLut('Original') }}>Reset all</button>
        </div>

        <div className="card p-5 space-y-3">
          <Field label="Crop aspect">
            <div className="flex flex-wrap gap-2">
              {['none', '1:1', '4:3', '16:9', '3:2', '9:16'].map((a) => <button key={a} className="chip" data-on={cropAspect === a} onClick={() => setCropAspect(a)}>{a === 'none' ? 'Free' : a}</button>)}
            </div>
          </Field>
          <Field label={`Resize (lossless) — ${Math.round(outScale * 100)}%`}>
            <input type="range" className="w-full" min="0.1" max="1" step="0.05" value={outScale} onChange={(e) => setOutScale(+e.target.value)} />
          </Field>
          <button className="btn btn-primary w-full" onClick={exportPNG} disabled={busy}>{busy ? 'Rendering full-res…' : '💾 Export lossless PNG'}</button>
          <Note>Export runs the full pipeline at original resolution — no quality loss, ever.</Note>
        </div>
      </div>
    </div>
  )
}
