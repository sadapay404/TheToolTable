import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Field, Note } from '../components/ui.jsx'
import { download, recentAction } from '../lib/utils.js'

const PRESETS = {
  'Custom': [1600, 900],
  '4K Desktop': [3840, 2160],
  'Desktop HD': [1920, 1080],
  'Mobile Story': [1080, 1920],
  'Phone Wall': [1170, 2532],
  'Avatar': [1024, 1024],
  'Social Post': [1080, 1080],
}

const STARTERS = [
  ['#FDFBF7', '#C87941', '#1A1817'],
  ['#0B132B', '#5BC0BE', '#6FFFE0'],
  ['#FF0055', '#0A0E17', '#00F0FF'],
  ['#F3F0F8', '#B4A7D6', '#A8D5BA'],
  ['#1C2541', '#3A506B', '#5BC0BE'],
]

function draw(canvas, opts) {
  const { W, H, type, stops, angle, solid, blobs, grain, bgA, bgB } = opts
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (type === 'solid') { ctx.fillStyle = solid; ctx.fillRect(0, 0, W, H) }
  else if (type === 'linear') {
    const rad = ((angle - 90) * Math.PI) / 180
    const cx = W / 2, cy = H / 2
    const len = (Math.abs(W * Math.cos(rad)) + Math.abs(H * Math.sin(rad))) / 2
    const g = ctx.createLinearGradient(cx - Math.cos(rad) * len, cy - Math.sin(rad) * len, cx + Math.cos(rad) * len, cy + Math.sin(rad) * len)
    stops.forEach((s) => g.addColorStop(s.p / 100, s.c))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  } else if (type === 'radial') {
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72)
    stops.forEach((s) => g.addColorStop(s.p / 100, s.c))
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
  } else { // mesh
    ctx.fillStyle = bgA; ctx.fillRect(0, 0, W, H)
    blobs.forEach((b) => {
      const g = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * Math.max(W, H))
      g.addColorStop(0, b.c); g.addColorStop(1, 'transparent')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    })
  }
  if (grain > 0) {
    const n = ctx.getImageData(0, 0, W, H)
    const d = n.data, amt = grain * 46
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() - 0.5) * amt
      d[i] += v; d[i + 1] += v; d[i + 2] += v
    }
    ctx.putImageData(n, 0, 0)
  }
}

export default function BackgroundStudio() {
  const [preset, setPreset] = useState('4K Desktop')
  const [custom, setCustom] = useState([1600, 900])
  const [type, setType] = useState('mesh')
  const [solid, setSolid] = useState('#FDFBF7')
  const [angle, setAngle] = useState(135)
  const [stops, setStops] = useState([
    { c: '#0B132B', p: 0 }, { c: '#5BC0BE', p: 55 }, { c: '#1C2541', p: 100 },
  ])
  const [bgA, setBgA] = useState('#0B132B')
  const [grain, setGrain] = useState(0.12)
  const canvasRef = useRef(null)

  const [W, H] = preset === 'Custom' ? custom : PRESETS[preset]

  const blobs = useMemo(() => {
    const cols = stops.length ? stops.map((s) => s.c) : ['#5BC0BE']
    return Array.from({ length: Math.max(4, cols.length + 2) }, (_, i) => ({
      x: (i * 0.618 + 0.2) % 1,
      y: (i * 0.382 + 0.25) % 1,
      r: 0.5 + ((i * 37) % 20) / 40,
      c: cols[i % cols.length],
    }))
  }, [stops])

  useEffect(() => {
    if (!canvasRef.current) return
    const scale = Math.min(1, 1400 / W)
    draw(canvasRef.current, { W: Math.round(W * scale), H: Math.round(H * scale), type, stops, angle, solid, blobs, grain: grain * scale, bgA })
  }, [W, H, type, stops, angle, solid, blobs, grain])

  function exportAs(fmt) {
    const out = document.createElement('canvas')
    draw(out, { W, H, type, stops, angle, solid, blobs, grain, bgA })
    const mime = fmt === 'webp' ? 'image/webp' : 'image/png'
    out.toBlob((b) => { download(b, `thetooltab-bg-${W}x${H}.${fmt}`); recentAction(`Exported ${fmt.toUpperCase()} background ${W}×${H}`) }, mime, 1.0)
  }

  return (
    <div className="grid lg:grid-cols-[1fr_330px] gap-5">
      <div className="card p-4 grid place-items-center overflow-hidden" style={{ background: 'var(--surface2)' }}>
        <canvas ref={canvasRef} className="max-w-full max-h-[62vh] rounded-xl" style={{ boxShadow: 'var(--shadow-lg)' }} />
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Canvas type">
            <div className="flex flex-wrap gap-2">
              {[['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['mesh', '3D Mesh']].map(([v, l]) => (
                <button key={v} className="chip" data-on={type === v} onClick={() => setType(v)}>{l}</button>
              ))}
            </div>
          </Field>

          {type === 'solid' && <Field label="Color"><input type="color" className="input h-11 p-1" value={solid} onChange={(e) => setSolid(e.target.value)} /></Field>}
          {type === 'linear' && <Field label={`Angle — ${angle}°`}><input type="range" className="w-full" min="0" max="360" value={angle} onChange={(e) => setAngle(+e.target.value)} /></Field>}
          {type === 'mesh' && <Field label="Base color"><input type="color" className="input h-11 p-1" value={bgA} onChange={(e) => setBgA(e.target.value)} /></Field>}

          {type !== 'solid' && (
            <Field label="Color stops">
              <div className="space-y-2">
                {stops.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="color" className="input h-9 p-0.5 w-12 shrink-0" value={s.c} onChange={(e) => setStops(stops.map((x, j) => j === i ? { ...x, c: e.target.value } : x))} />
                    <input type="range" className="flex-1" min="0" max="100" value={s.p} onChange={(e) => setStops(stops.map((x, j) => j === i ? { ...x, p: +e.target.value } : x))} />
                    <span className="text-xs w-8 text-right mono" style={{ color: 'var(--muted)' }}>{s.p}%</span>
                    {stops.length > 2 && <button className="btn btn-ghost px-2 py-1" onClick={() => setStops(stops.filter((_, j) => j !== i))}>✕</button>}
                  </div>
                ))}
                {stops.length < 6 && <button className="chip" onClick={() => setStops([...stops, { c: '#C87941', p: 80 }])}>＋ Add stop</button>}
              </div>
            </Field>
          )}

          <Field label={`Grain / noise — ${Math.round(grain * 100)}%`}>
            <input type="range" className="w-full" min="0" max="1" step="0.02" value={grain} onChange={(e) => setGrain(+e.target.value)} />
          </Field>

          <Field label="Starter palettes">
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((pal, i) => (
                <button key={i} className="flex rounded-lg overflow-hidden border border-line h-8" onClick={() => { setStops(pal.map((c, j) => ({ c, p: Math.round((j / (pal.length - 1)) * 100) }))); setBgA(pal[0]) }}>
                  {pal.map((c) => <span key={c} className="w-6" style={{ background: c }} />)}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="card p-5 space-y-3">
          <Field label="Aspect preset">
            <div className="flex flex-wrap gap-2">
              {Object.keys(PRESETS).map((p) => <button key={p} className="chip" data-on={preset === p} onClick={() => setPreset(p)}>{p}</button>)}
            </div>
          </Field>
          {preset === 'Custom' && (
            <div className="flex gap-2">
              <input type="number" className="input" value={custom[0]} onChange={(e) => setCustom([+e.target.value || 1, custom[1]])} />
              <span className="self-center">×</span>
              <input type="number" className="input" value={custom[1]} onChange={(e) => setCustom([custom[0], +e.target.value || 1])} />
            </div>
          )}
          <div className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Output: {W} × {H}px</div>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={() => exportAs('png')}>💾 PNG (lossless)</button>
            <button className="btn flex-1" onClick={() => exportAs('webp')}>WebP</button>
          </div>
        </div>
      </div>
    </div>
  )
}
