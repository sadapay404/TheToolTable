import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Slider, Icon, SPRING } from '../studio/controls.jsx'
import { GRADIENTS, SWATCHES, fitSize } from '../../lib/bg/compose.js'
import { isImageFile } from '../../lib/bg/media.js'

const CHECKER = 'conic-gradient(#d9d3c6 25%, #f3efe6 0 50%, #d9d3c6 0 75%, #f3efe6 0) 0 0 / 14px 14px'
const MAX_BG_EDGE = 4096, MAX_BG_PIXELS = 40_000_000, MAX_BG_BYTES = 80 * 1024 * 1024

/* ------------------------------ procedural background scenes ------------------------------ */
const SCENES = [
  ['Studio', (x, w, h) => { const g = x.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75); g.addColorStop(0, '#fbfaf7'); g.addColorStop(1, '#bdb6a8'); x.fillStyle = g; x.fillRect(0, 0, w, h) }],
  ['Sunset', (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3b3a7a'); g.addColorStop(0.5, '#e8765a'); g.addColorStop(1, '#ffd08a'); x.fillStyle = g; x.fillRect(0, 0, w, h) }],
  ['Mint', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#d8f5e6'); g.addColorStop(1, '#7fd1b9'); x.fillStyle = g; x.fillRect(0, 0, w, h) }],
  ['Dusk', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a2150'); g.addColorStop(1, '#c4579a'); x.fillStyle = g; x.fillRect(0, 0, w, h) }],
  ['Paper', (x, w, h) => { x.fillStyle = '#f1ebdc'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(90,70,40,${Math.random() * 0.06})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2) } }],
  ['Bokeh', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1d2a3f'); g.addColorStop(1, '#3e2a4a'); x.fillStyle = g; x.fillRect(0, 0, w, h); for (let i = 0; i < 38; i++) { const r = 20 + Math.random() * 90; const rg = x.createRadialGradient(0, 0, 0, 0, 0, r); const hue = 20 + Math.random() * 60; rg.addColorStop(0, `hsla(${hue},90%,70%,.35)`); rg.addColorStop(1, `hsla(${hue},90%,60%,0)`); x.save(); x.translate(Math.random() * w, Math.random() * h); x.fillStyle = rg; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.restore() } }],
]
const sceneCache = {}
function scene(name) {
  if (!sceneCache[name]) { const c = document.createElement('canvas'); c.width = 1400; c.height = 1000; SCENES.find((s) => s[0] === name)[1](c.getContext('2d'), c.width, c.height); sceneCache[name] = c }
  return sceneCache[name]
}

const Block = ({ title, children, delay = 0 }) => (
  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay }} className="space-y-3.5">
    {title && <div className="eyebrow">{title}</div>}
    {children}
  </motion.div>
)

function Tile({ on, onClick, label, children, i }) {
  return (
    <motion.button onClick={onClick} initial={{ opacity: 0, scale: 0.85, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.04 }}
      whileHover={{ y: -4, scale: 1.04 }} whileTap={{ scale: 0.92 }} className="relative text-left">
      <div className="relative h-[58px] rounded-xl overflow-hidden" style={{ boxShadow: on ? '0 0 0 2.5px var(--copper), 0 10px 22px -10px rgba(0,0,0,.5)' : '0 0 0 1px var(--border), 0 5px 12px -7px rgba(0,0,0,.35)' }}>
        {children}
        <motion.span initial={false} animate={{ scale: on ? 1 : 0, rotate: on ? 0 : -90 }} transition={SPRING} className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}>
          <Icon n="check" s={11} w={3.2} />
        </motion.span>
      </div>
      <div className="text-[11px] font-semibold mt-1.5" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{label}</div>
    </motion.button>
  )
}

function Reveal({ show, children }) {
  return (
    <AnimatePresence initial={false}>
      {show && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden"><div className="pt-1 pb-1 space-y-4">{children}</div></motion.div>}
    </AnimatePresence>
  )
}

function Switch({ on, onChange, label }) {
  return (
    <button className="flex items-center gap-3 w-full text-left" onClick={() => onChange(!on)}>
      <span className="relative w-11 h-6 rounded-full border border-line shrink-0" style={{ background: on ? 'var(--copper)' : 'var(--surface2)' }}>
        <motion.span className="absolute top-[2px] w-[18px] h-[18px] rounded-full" style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }} animate={{ left: on ? 22 : 3 }} transition={SPRING} />
      </span>
      <span className="text-[13px] font-semibold">{label}</span>
    </button>
  )
}

/* ============================================ BACKGROUND ============================================ */
export function BackgroundPanel({ c }) {
  const { bg, setBg, shadow, setShadow } = c
  const file = useRef(null), loadId = useRef(0)
  useEffect(() => () => { loadId.current++ }, [])
  const updateBg = (patch) => { loadId.current++; setBg(patch) }
  const loadImg = async (f) => {
    if (!f) return
    const id = ++loadId.current
    let url = '', img = null, source = null, previewCanvas = null
    try {
      if (!isImageFile(f)) throw new Error('Choose a supported image file for the background.')
      if (f.size > MAX_BG_BYTES) throw new Error(`Background images must be smaller than ${Math.round(MAX_BG_BYTES / 1024 / 1024)} MB.`)
      url = URL.createObjectURL(f)
      img = new Image(); img.decoding = 'async'; img.src = url; await img.decode()
      if (id !== loadId.current) return
      const w = Number(img.naturalWidth), h = Number(img.naturalHeight)
      if (!w || !h || w * h > MAX_BG_PIXELS) throw new Error('This background is too large to process safely.')
      const size = fitSize(w, h, MAX_BG_EDGE)
      source = document.createElement('canvas'); source.width = size.w; source.height = size.h
      const sx = source.getContext('2d')
      if (!sx) throw new Error('Could not prepare that background image.')
      sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high'; sx.drawImage(img, 0, 0, size.w, size.h)
      const thumb = fitSize(size.w, size.h, 256)
      previewCanvas = document.createElement('canvas'); previewCanvas.width = thumb.w; previewCanvas.height = thumb.h
      const px = previewCanvas.getContext('2d')
      if (!px) throw new Error('Could not prepare a preview of that background.')
      px.drawImage(source, 0, 0, thumb.w, thumb.h)
      const preview = previewCanvas.toDataURL('image/jpeg', 0.78)
      if (id !== loadId.current) return
      setBg({ type: 'image', image: source, imageName: f.name, preview })
      source = null
    } catch (e) {
      if (id === loadId.current) c.say?.(e.message || 'Could not read that background image.')
    } finally {
      if (url) URL.revokeObjectURL(url)
      try { img?.removeAttribute('src') } catch {}
      if (source) { source.width = 0; source.height = 0 }
      if (previewCanvas) { previewCanvas.width = 0; previewCanvas.height = 0 }
    }
  }
  return (
    <div className="space-y-6">
      <Block title="Background">
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
          <Tile i={0} on={bg.type === 'transparent'} onClick={() => updateBg({ type: 'transparent' })} label="Transparent"><div className="absolute inset-0" style={{ background: CHECKER }} /></Tile>
          <Tile i={1} on={bg.type === 'color'} onClick={() => updateBg({ type: 'color' })} label="Colour"><div className="absolute inset-0" style={{ background: bg.color }} /></Tile>
          <Tile i={2} on={bg.type === 'gradient'} onClick={() => updateBg({ type: 'gradient' })} label="Gradient"><div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${bg.color}, ${bg.color2})` }} /></Tile>
          <Tile i={3} on={bg.type === 'blur'} onClick={() => updateBg({ type: 'blur' })} label="Blur">
            {c.thumb ? <img src={c.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'blur(6px)', transform: 'scale(1.25)' }} /> : <div className="absolute inset-0 shimmer" />}
          </Tile>
          <Tile i={4} on={bg.type === 'image'} onClick={() => (bg.image ? updateBg({ type: 'image' }) : file.current?.click())} label="Image">
            {bg.image ? <img src={bg.preview} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 grid place-items-center" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}><Icon n="image" s={22} /></div>}
          </Tile>
          <Tile i={5} on={false} onClick={() => file.current?.click()} label="Upload…"><div className="absolute inset-0 grid place-items-center" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Icon n="plus" s={22} w={2} /></div></Tile>
        </div>
        <input ref={file} type="file" accept="image/*,.avif,.heic,.heif,.tif,.tiff" hidden onChange={(e) => { loadImg(e.target.files?.[0]); e.target.value = '' }} />

        <Reveal show={bg.type === 'color' || bg.type === 'gradient'}>
          <div className="grid grid-cols-6 gap-2">
            {SWATCHES.map((s) => (
              <motion.button key={s} aria-label={s} whileHover={{ scale: 1.18, y: -2 }} whileTap={{ scale: 0.82 }} onClick={() => updateBg({ color: s })} className="aspect-square rounded-full relative"
                style={{ background: s, boxShadow: bg.color === s ? '0 0 0 2.5px var(--surface), 0 0 0 4.5px var(--ink)' : '0 0 0 1px var(--border), 0 3px 8px -3px rgba(0,0,0,.4)' }} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="label">{bg.type === 'gradient' ? 'From' : 'Custom'}</label>
            <input type="color" value={bg.color} onChange={(e) => updateBg({ color: e.target.value })} className="w-10 h-8 rounded-lg border border-line bg-transparent cursor-pointer" />
            {bg.type === 'gradient' && <><label className="label ml-2">To</label><input type="color" value={bg.color2} onChange={(e) => updateBg({ color2: e.target.value })} className="w-10 h-8 rounded-lg border border-line bg-transparent cursor-pointer" /></>}
          </div>
        </Reveal>

        <Reveal show={bg.type === 'gradient'}>
          <div className="grid grid-cols-4 gap-2">
            {GRADIENTS.map(([a, b]) => (
              <motion.button key={a + b} whileHover={{ y: -3, scale: 1.06 }} whileTap={{ scale: 0.9 }} onClick={() => updateBg({ color: a, color2: b })} className="h-9 rounded-lg"
                style={{ background: `linear-gradient(135deg, ${a}, ${b})`, boxShadow: bg.color === a && bg.color2 === b ? '0 0 0 2.5px var(--ink)' : '0 0 0 1px var(--border)' }} />
            ))}
          </div>
          <Slider label="Angle" value={bg.angle} min={0} max={360} def={135} onChange={(v) => updateBg({ angle: v })} suffix="°" />
        </Reveal>

        <Reveal show={bg.type === 'blur'}>
          <Slider label="Blur amount" value={bg.blur} min={0} max={100} def={40} onChange={(v) => updateBg({ blur: v })} />
        </Reveal>

        <Reveal show={bg.type === 'image'}>
          <div className="eyebrow">Scenes</div>
          <div className="grid grid-cols-3 gap-2">
            {SCENES.map(([name]) => (
              <motion.button key={name} whileHover={{ y: -3, scale: 1.05 }} whileTap={{ scale: 0.9 }} onClick={() => updateBg({ type: 'image', image: scene(name), imageName: name, preview: scene(name).toDataURL('image/jpeg', 0.4) })} className="relative h-12 rounded-lg overflow-hidden"
                style={{ boxShadow: bg.imageName === name ? '0 0 0 2.5px var(--ink)' : '0 0 0 1px var(--border)' }}>
                <img src={scene(name).toDataURL('image/jpeg', 0.4)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-0.5 left-1.5 text-[10px] font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{name}</span>
              </motion.button>
            ))}
          </div>
        </Reveal>
      </Block>

      <Block title="Shadow" delay={0.08}>
        <Switch on={shadow.on} onChange={(v) => setShadow({ on: v })} label="Drop shadow" />
        <Reveal show={shadow.on}>
          <Slider label="Opacity" value={shadow.opacity} min={0} max={100} def={35} onChange={(v) => setShadow({ opacity: v })} suffix="%" />
          <Slider label="Softness" value={shadow.blur} min={0} max={120} def={30} onChange={(v) => setShadow({ blur: v })} />
          <Slider label="Distance (vertical)" value={shadow.y} min={-80} max={120} def={20} onChange={(v) => setShadow({ y: v })} />
          <Slider label="Distance (horizontal)" value={shadow.x} min={-80} max={80} def={0} onChange={(v) => setShadow({ x: v })} />
        </Reveal>
      </Block>
    </div>
  )
}

/* ============================================ REFINE ============================================ */
export function RefinePanel({ c }) {
  const { edge, setEdge, tool, setTool, brush, setBrush } = c
  return (
    <div className="space-y-6">
      <Block title="Edge">
        <Slider label="Shrink ↔ grow" value={edge.edge} min={-100} max={100} def={0} onChange={(v) => setEdge({ edge: v })} />
        <Slider label="Softness" value={edge.soft} min={0} max={100} def={30} onChange={(v) => setEdge({ soft: v })} />
        <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Shrink removes halos of old background; grow rescues fine hair. Softness feathers the cut line.</p>
      </Block>

      <Block title="Touch-up brush" delay={0.06}>
        <div className="grid grid-cols-2 gap-2.5">
          {[['restore', 'brush', 'Restore', 'Bring back what the AI cut'], ['erase', 'eraser', 'Erase', 'Cut away what it kept']].map(([k, ic, label, sub]) => {
            const on = tool === k
            return (
              <motion.button key={k} whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }} onClick={() => setTool(on ? 'none' : k)} className="relative text-left rounded-2xl border p-3.5 overflow-hidden"
                style={{ borderColor: on ? 'var(--ink)' : 'var(--border)', background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--bg)' : 'var(--ink)', boxShadow: on ? '0 14px 26px -12px rgba(0,0,0,.55)' : 'var(--shadow)' }}>
                <motion.span animate={{ rotate: on ? [0, -14, 10, 0] : 0 }} transition={{ duration: 0.5 }} className="block mb-2"><Icon n={ic} s={22} /></motion.span>
                <div className="text-[13px] font-bold">{label}</div>
                <div className="text-[10.5px] opacity-70 leading-snug mt-0.5">{sub}</div>
              </motion.button>
            )
          })}
        </div>
        <Reveal show={tool !== 'none'}>
          <Slider label="Brush size" value={brush.size} min={4} max={160} def={36} onChange={(v) => setBrush({ size: v })} />
          <Slider label="Hardness" value={brush.hard} min={0} max={100} def={60} onChange={(v) => setBrush({ hard: v })} suffix="%" />
        </Reveal>
        <div className="grid grid-cols-2 gap-2">
          <motion.button whileTap={{ scale: 0.94 }} className="btn !py-2 text-[12px]" disabled={!c.canUndo} onClick={c.undoStroke}><Icon n="undo" s={14} /> Undo stroke</motion.button>
          <motion.button whileTap={{ scale: 0.94 }} className="btn !py-2 text-[12px]" disabled={!c.dirty} onClick={c.resetMask}><Icon n="reset" s={14} /> Back to AI cut</motion.button>
        </div>
      </Block>
    </div>
  )
}
