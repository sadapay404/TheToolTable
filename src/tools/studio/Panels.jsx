import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Slider, HueWheel, Histogram, Icon, SPRING } from './controls.jsx'
import { AnimatedNumber } from '../../components/ui.jsx'
import { fitAspect } from './CropOverlay.jsx'
import { DEFAULTS, HSL_CHANNELS, PRESETS, PRESET_CATS, ASPECTS, SECTION_KEYS } from '../../lib/studio/params.js'
import { fmtBytes } from '../../lib/utils.js'

const RAINBOW = 'linear-gradient(90deg,hsl(0 80% 55%),hsl(60 80% 52%),hsl(120 65% 46%),hsl(180 75% 46%),hsl(240 75% 60%),hsl(300 70% 56%),hsl(360 80% 55%))'
const hsl = (h, s = 85, l = 55) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`

const Group = ({ title, children, delay = 0 }) => (
  <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay }} className="space-y-4">
    {title && <div className="eyebrow">{title}</div>}
    {children}
  </motion.div>
)

function Chip({ on, onClick, children, id }) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={onClick} className="relative px-3 py-1.5 rounded-full text-[11.5px] font-semibold border border-line whitespace-nowrap"
      style={{ color: on ? 'var(--bg)' : 'var(--muted)', background: 'var(--surface)' }}>
      <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }} transition={SPRING} />
      <span className="relative z-10">{children}</span>
    </motion.button>
  )
}

/* ============================================ LOOKS ============================================ */
const LookCard = React.forwardRef(function LookCard({ c, p, i, custom }, ref) {
  const on = c.activeLook?.id === p.id
  return (
    <motion.button
      ref={ref} layout initial={{ opacity: 0, scale: 0.8, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8 }}
      transition={{ ...SPRING, delay: Math.min(i, 14) * 0.022 }} whileHover={{ y: -4, scale: 1.045 }} whileTap={{ scale: 0.9, rotate: -1.5 }}
      onMouseEnter={() => c.setHover(p)} onMouseLeave={() => c.setHover(null)} onFocus={() => c.setHover(p)} onBlur={() => c.setHover(null)}
      onClick={() => c.applyPreset(p)} className="relative text-left group"
    >
      <div className="relative rounded-xl overflow-hidden aspect-[4/3]" style={{ background: 'var(--surface2)', boxShadow: on ? '0 0 0 2.5px var(--copper), 0 8px 20px -8px rgba(0,0,0,.5)' : '0 4px 12px -6px rgba(0,0,0,.4)' }}>
        {c.thumbs[p.id] ? (
          <motion.img src={c.thumbs[p.id]} alt="" className="w-full h-full object-cover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileHover={{ scale: 1.12 }} transition={{ duration: 0.35 }} draggable={false} />
        ) : <div className="w-full h-full shimmer" />}
        <AnimatePresence>
          {on && (
            <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={SPRING}
              className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}>
              <Icon n="check" s={12} w={3} />
            </motion.span>
          )}
        </AnimatePresence>
        {custom && (
          <span role="button" aria-label="Delete look" onClick={(e) => { e.stopPropagation(); c.deleteLook(p.id) }}
            className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,.65)', color: '#fff' }}>
            <Icon n="trash" s={11} />
          </span>
        )}
      </div>
      <div className="text-[11px] font-semibold mt-1.5 truncate" style={{ color: on ? 'var(--ink)' : 'var(--muted)' }}>{p.name}</div>
    </motion.button>
  )
})

export function LooksPanel({ c }) {
  const [cat, setCat] = useState('All')
  const [name, setName] = useState('')
  const list = PRESETS.filter((p) => cat === 'All' || p.cat === cat)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">{PRESET_CATS.map((k) => <Chip key={k} id="cat-pill" on={cat === k} onClick={() => setCat(k)}>{k}</Chip>)}</div>

      <AnimatePresence initial={false}>
        {c.activeLook && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="pt-1 pb-2"><Slider label={`${c.activeLook.name} strength`} value={c.strength} min={0} max={100} def={100} onChange={c.setStrength} suffix="%" /></div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div layout className="grid grid-cols-3 gap-x-2.5 gap-y-3">
        <AnimatePresence mode="popLayout" initial>
          {[{ id: 'original', name: 'Original', cat: 'Clean', p: {}, original: true }, ...list].filter((p) => !p.original || cat === 'All' || cat === 'Clean').map((p, i) => <LookCard key={p.id} c={c} p={p} i={i} />)}
        </AnimatePresence>
      </motion.div>

      <Group title={`My looks · ${c.myLooks.length}`}>
        {c.myLooks.length > 0 && (
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-3">
            <AnimatePresence>{c.myLooks.map((p, i) => <LookCard key={p.id} c={c} p={p} i={i} custom />)}</AnimatePresence>
          </div>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { c.saveLook(name.trim()); setName('') } }}>
          <input className="input !py-2 text-[12.5px]" placeholder="Name this look…" value={name} onChange={(e) => setName(e.target.value)} />
          <motion.button whileTap={{ scale: 0.9 }} className="btn btn-primary !px-3.5" type="submit" disabled={!name.trim()}><Icon n="plus" s={16} w={2.2} /></motion.button>
        </form>
      </Group>
    </div>
  )
}

/* ============================================ LIGHT / COLOR ============================================ */
export function LightPanel({ c }) {
  const { sl } = c
  return (
    <div className="space-y-5">
      <Group title="Histogram"><Histogram data={c.hist} /></Group>
      <Group title="Exposure" delay={0.04}>
        {sl('exposure', 'Exposure', { min: -3, max: 3, step: 0.01, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV` })}
        {sl('brightness', 'Brightness')}
        {sl('contrast', 'Contrast')}
      </Group>
      <Group title="Tone" delay={0.08}>
        {sl('highlights', 'Highlights')}{sl('shadows', 'Shadows')}{sl('whites', 'Whites')}{sl('blacks', 'Blacks')}
      </Group>
    </div>
  )
}

export function ColorPanel({ c }) {
  const { sl } = c
  return (
    <div className="space-y-6">
      <Group title="White balance">
        {sl('temp', 'Temperature', { track: 'linear-gradient(90deg,#3b82f6,#dbe4ee 50%,#f59e0b)' })}
        {sl('tint', 'Tint', { track: 'linear-gradient(90deg,#22c55e,#e5e7eb 50%,#d946ef)' })}
      </Group>
      <Group title="Colour" delay={0.05}>
        {sl('sat', 'Saturation', { track: 'linear-gradient(90deg,#9ca3af,#e4c9b8 50%,#ef4444)' })}
        {sl('vib', 'Vibrance', { track: 'linear-gradient(90deg,#9ca3af,#e4c9b8 50%,#f97316)' })}
        {sl('hue', 'Hue shift (all colours)', { min: -180, max: 180, track: RAINBOW, suffix: '°' })}
        {sl('fade', 'Fade', { min: 0, max: 100 })}
      </Group>
    </div>
  )
}

/* ============================================ MIXER (per-colour HSL) ============================================ */
export function MixerPanel({ c }) {
  const ch = HSL_CHANNELS[c.channel]
  const h = ch.hue
  const dirty = (id) => ['h', 's', 'l'].some((k) => c.params[`${id}_${k}`] !== 0)
  const k = (x) => `${ch.id}_${x}`
  return (
    <div className="space-y-6">
      <Group title="Pick a colour">
        <div className="flex items-center justify-between gap-1">
          {HSL_CHANNELS.map((x, i) => (
            <motion.button key={x.id} onClick={() => c.setChannel(i)} whileHover={{ y: -3, scale: 1.1 }} whileTap={{ scale: 0.82 }} aria-label={x.label} title={x.label}
              className="relative w-[34px] h-[34px] rounded-full grid place-items-center">
              <motion.span className="absolute -inset-[4px] rounded-full pointer-events-none" style={{ border: '2.5px solid var(--ink)' }} initial={false} animate={{ opacity: c.channel === i ? 1 : 0, scale: c.channel === i ? 1 : 0.7 }} transition={SPRING} />
              <span className="block w-full h-full rounded-full" style={{ background: `radial-gradient(circle at 32% 28%, ${hsl(x.hue, 90, 72)}, ${hsl(x.hue, 85, 50)})`, boxShadow: '0 3px 8px -2px rgba(0,0,0,.45), inset 0 -3px 5px rgba(0,0,0,.18)' }} />
              <AnimatePresence>{dirty(x.id) && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -bottom-1.5 left-1/2 -ml-[3px] w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink)' }} />}</AnimatePresence>
            </motion.button>
          ))}
        </div>
        <div className="flex items-center justify-between pt-1">
          <motion.div key={ch.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="display font-semibold text-[18px]" style={{ color: hsl(h, 70, 42) }}>{ch.label}</motion.div>
          <div className="flex gap-1.5">
            <motion.button whileTap={{ scale: 0.9 }} className="btn !py-1.5 !px-3 text-[11.5px]" data-on={c.pick} onClick={() => c.setPick(!c.pick)}
              style={c.pick ? { background: 'var(--ink)', color: 'var(--bg)' } : {}}><Icon n="drop" s={13} /> {c.pick ? 'Click the image…' : 'Pick from image'}</motion.button>
            <motion.button whileTap={{ scale: 0.9 }} className="btn btn-ghost !py-1.5 !px-2.5 text-[11.5px]" onClick={() => c.upd({ [k('h')]: 0, [k('s')]: 0, [k('l')]: 0 })}>Reset</motion.button>
          </div>
        </div>
      </Group>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={ch.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} transition={{ duration: 0.16 }} className="space-y-4">
          {c.sl(k('h'), 'Hue', { track: `linear-gradient(90deg,${hsl(h - 45)},${hsl(h)},${hsl(h + 45)})` })}
          {c.sl(k('s'), 'Saturation', { track: `linear-gradient(90deg,#8b8b8b,${hsl(h)})` })}
          {c.sl(k('l'), 'Luminance', { track: `linear-gradient(90deg,#050505,${hsl(h, 85, 50)},#fff)` })}
        </motion.div>
      </AnimatePresence>

      <Group title="Overview" delay={0.06}>
        <div className="grid grid-cols-8 gap-1.5">
          {HSL_CHANNELS.map((x, i) => (
            <button key={x.id} onClick={() => c.setChannel(i)} className="flex flex-col items-center gap-1">
              <div className="relative w-full h-14 rounded-md overflow-hidden" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <span className="absolute left-0 right-0 top-1/2 h-px" style={{ background: 'var(--muted)', opacity: 0.35 }} />
                {['h', 's', 'l'].map((m, j) => {
                  const v = c.params[`${x.id}_${m}`]
                  return <motion.span key={m} className="absolute w-[22%] rounded-sm" style={{ left: `${10 + j * 29}%`, background: hsl(x.hue, 80, 50) }}
                    initial={false} animate={{ height: `${Math.abs(v) / 2}%`, bottom: v >= 0 ? '50%' : `${50 - Math.abs(v) / 2}%` }} transition={SPRING} />
                })}
              </div>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: hsl(x.hue, 85, 52), outline: c.channel === i ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }} />
            </button>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Bars show Hue · Sat · Lum for every colour. Works on video too.</p>
      </Group>
    </div>
  )
}

/* ============================================ GRADE ============================================ */
export function GradePanel({ c }) {
  const p = c.params
  const w = (a, b, label) => <HueWheel label={label} hue={p[a + 'H']} amt={p[a + 'A']} size={92} onChange={(h, m) => c.upd({ [a + 'H']: h, [a + 'A']: m })} />
  return (
    <div className="space-y-6">
      <Group title="Three-way colour grading">
        <div className="flex justify-between gap-1">{w('gs', 0, 'Shadows')}{w('gm', 0, 'Midtones')}{w('gh', 0, 'Highlights')}</div>
        <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Drag the dot — angle picks the colour, distance sets strength. Double-click a wheel to clear it.</p>
      </Group>
      <Group title="Blend" delay={0.05}>
        {c.sl('gBlend', 'Overall strength', { min: 0, max: 100, def: 50 })}
        {c.sl('gBal', 'Balance (shadows ↔ highlights)')}
      </Group>
    </div>
  )
}

/* ============================================ EFFECTS ============================================ */
export function FxPanel({ c }) {
  const { sl } = c
  return (
    <div className="space-y-6">
      <Group title="Detail">{sl('sharpen', 'Sharpen', { min: 0 })}{sl('blur', 'Blur', { min: 0 })}</Group>
      <Group title="Lens" delay={0.04}>
        {sl('vig', 'Vignette', { track: 'linear-gradient(90deg,#f5f5f5,#9ca3af 50%,#111)' })}
        {sl('vigFeather', 'Vignette feather', { min: 0, max: 100, def: 50 })}
        {sl('chroma', 'Chromatic aberration', { min: 0 })}
        {sl('glow', 'Glow / bloom', { min: 0 })}
      </Group>
      <Group title="Texture" delay={0.08}>{sl('grain', 'Film grain', { min: 0 })}{sl('pixel', 'Pixelate', { min: 0 })}</Group>
      <Group title="Stylise" delay={0.12}>
        {sl('mono', 'Black & white', { min: 0 })}{sl('sepia', 'Sepia', { min: 0 })}{sl('poster', 'Posterise', { min: 0 })}{sl('invert', 'Invert', { min: 0 })}
      </Group>
      <Group title="Duotone" delay={0.16}>
        {sl('duo', 'Amount', { min: 0 })}
        {sl('duoA', 'Shadow colour', { min: 0, max: 360, def: 250, track: RAINBOW, suffix: '°' })}
        {sl('duoB', 'Highlight colour', { min: 0, max: 360, def: 40, track: RAINBOW, suffix: '°' })}
      </Group>
    </div>
  )
}

/* ============================================ CROP ============================================ */
export function CropPanel({ c }) {
  const p = c.params
  const { ow, oh } = c.dims
  const crop = { x: p.cx, y: p.cy, w: p.cw, h: p.ch }
  const px = { w: Math.round(p.cw * ow), h: Math.round(p.ch * oh) }
  return (
    <div className="space-y-6">
      <Group title="Aspect ratio">
        <div className="flex flex-wrap gap-1.5">
          {ASPECTS.map(([label, v]) => (
            <Chip key={label} id="asp-pill" on={c.aspect === label} onClick={() => c.setAspect(label, v)}>{label}</Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.92 }} className="btn flex-1 !py-2 text-[12px]" onClick={c.swapAspect}><Icon n="rotate" s={14} /> Swap</motion.button>
          <motion.button whileTap={{ scale: 0.92 }} className="btn flex-1 !py-2 text-[12px]" onClick={() => c.upd({ cx: 0, cy: 0, cw: 1, ch: 1 }, true)}>Reset crop</motion.button>
        </div>
        <div className="rounded-xl border border-line p-3 flex items-center justify-between" style={{ background: 'var(--surface2)' }}>
          <span className="label">Output</span>
          <span className="mono font-semibold text-[13px] tabular-nums"><AnimatedNumber value={px.w} />×<AnimatedNumber value={px.h} /> px</span>
        </div>
      </Group>

      <Group title="Rotate & flip" delay={0.05}>
        <div className="grid grid-cols-3 gap-2">
          {[['rotate', 'Rotate', () => c.rotate90()], ['flipH', 'Flip H', () => c.upd({ flipH: p.flipH ? 0 : 1 }, true)], ['flipV', 'Flip V', () => c.upd({ flipV: p.flipV ? 0 : 1 }, true)]].map(([ic, label, fn]) => (
            <motion.button key={label} whileHover={{ y: -3 }} whileTap={{ scale: 0.88 }} onClick={fn} className="btn flex-col !py-3 gap-1 text-[11px]"
              style={(label === 'Flip H' && p.flipH) || (label === 'Flip V' && p.flipV) ? { background: 'var(--ink)', color: 'var(--bg)' } : {}}>
              <motion.span animate={{ rotate: label === 'Rotate' ? p.rot * 90 : 0 }} transition={SPRING}><Icon n={ic} s={20} /></motion.span>{label}
            </motion.button>
          ))}
        </div>
        {c.sl('angle', 'Straighten', { min: -45, max: 45, step: 0.1, fmt: (v) => `${v.toFixed(1)}°` })}
        <motion.button whileTap={{ scale: 0.95 }} className="btn w-full !py-2 text-[12px]" disabled={!p.angle} onClick={c.fillAngle}>Auto-crop to remove empty corners</motion.button>
      </Group>
      <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Drag the frame on the image. Corners keep the chosen ratio; edges resize one side.</p>
    </div>
  )
}

/* ============================================ EXPORT ============================================ */
export function ExportPanel({ c }) {
  const e = c.exp
  const isVideo = c.src.kind === 'video'
  const dims = c.outDims
  const sw = Math.round(dims.w * e.scale), shh = Math.round(dims.h * e.scale)
  return (
    <div className="space-y-6">
      <Group title="Output">
        <div className="rounded-2xl border border-line p-4 text-center" style={{ background: 'var(--surface2)' }}>
          <div className="label">Final size</div>
          <div className="display font-semibold text-[28px] tabular-nums mt-1"><AnimatedNumber value={sw} />×<AnimatedNumber value={shh} /></div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--muted)' }}>{((sw * shh) / 1e6).toFixed(1)} megapixels</div>
        </div>
        <div>
          <div className="label mb-2">Scale</div>
          <div className="flex gap-1.5 flex-wrap">{[1, 0.75, 0.5, 0.25].map((s) => <Chip key={s} id="scale-pill" on={e.scale === s} onClick={() => c.setExp({ scale: s })}>{s * 100}%</Chip>)}</div>
        </div>
      </Group>

      {!isVideo ? (
        <Group title="Image" delay={0.05}>
          <div>
            <div className="label mb-2">Format</div>
            <div className="flex gap-1.5">
              {[['png', 'PNG', 'lossless'], ['jpeg', 'JPEG'], ['webp', 'WebP']].map(([k, l]) => <Chip key={k} id="fmt-pill" on={e.fmt === k} onClick={() => c.setExp({ fmt: k })}>{l}</Chip>)}
            </div>
          </div>
          <AnimatePresence initial={false}>
            {e.fmt !== 'png' && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pt-1">
              <Slider label="Quality" value={e.quality} min={50} max={100} def={95} onChange={(v) => c.setExp({ quality: v })} suffix="%" />
            </motion.div>}
          </AnimatePresence>
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.96, y: 1 }} className="btn btn-primary btn-sheen w-full py-3.5 text-[15px]" disabled={c.busy} onClick={c.exportImage}>
            {c.busy ? 'Rendering…' : `Export ${e.fmt.toUpperCase()}`}
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} className="btn w-full !py-2.5 text-[12.5px]" disabled={c.busy} onClick={c.copyImage}><Icon n="copy" s={14} /> Copy image to clipboard</motion.button>
        </Group>
      ) : (
        <Group title="Video" delay={0.05}>
          <div>
            <div className="label mb-2">Container</div>
            <div className="flex gap-1.5">{c.videoTypes.map((t) => <Chip key={t.ext} id="vfmt-pill" on={e.vext === t.ext} onClick={() => c.setExp({ vext: t.ext })}>{t.ext.toUpperCase()}</Chip>)}</div>
          </div>
          <div>
            <div className="label mb-2">Quality</div>
            <div className="flex gap-1.5">{[[50, 'Max'], [25, 'High'], [12, 'Std']].map(([m, l]) => <Chip key={m} id="vq-pill" on={e.mbps === m} onClick={() => c.setExp({ mbps: m })}>{l} · {m}M</Chip>)}</div>
          </div>
          <div>
            <div className="label mb-2">Frame rate</div>
            <div className="flex gap-1.5">{[24, 30, 60].map((f) => <Chip key={f} id="fps-pill" on={e.fps === f} onClick={() => c.setExp({ fps: f })}>{f} fps</Chip>)}</div>
          </div>
          <button className="flex items-center gap-3 text-left w-full" onClick={() => c.setExp({ audio: !e.audio })}>
            <span className="relative w-10 h-6 rounded-full border border-line shrink-0" style={{ background: e.audio ? 'var(--copper)' : 'var(--surface2)' }}>
              <motion.span className="absolute top-0.5 w-5 h-5 rounded-full" style={{ background: 'var(--surface)', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }} animate={{ left: e.audio ? 18 : 2 }} transition={SPRING} />
            </span>
            <span className="text-[13px] font-semibold">Include audio</span>
          </button>
          <motion.button whileHover={{ y: -1, scale: 1.02 }} whileTap={{ scale: 0.96, y: 1 }} className="btn btn-primary btn-sheen w-full py-3.5 text-[15px]" disabled={c.busy} onClick={c.renderVideo}>
            {c.busy ? `Rendering ${Math.round(c.progress * 100)}%` : 'Render video'}
          </motion.button>
          <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Video renders in real time through the GPU (a 30 s clip takes ~30 s). Keep this tab visible while it runs. Because edited pixels must be re-encoded, pick Max for near-transparent quality.</p>
        </Group>
      )}

      <Group title="Looks as files" delay={0.1}>
        <div className="grid grid-cols-2 gap-2">
          <motion.button whileTap={{ scale: 0.94 }} className="btn !py-2.5 text-[12px]" onClick={c.exportLook}><Icon n="save" s={14} /> Save look</motion.button>
          <motion.button whileTap={{ scale: 0.94 }} className="btn !py-2.5 text-[12px]" onClick={c.importLook}><Icon n="export" s={14} /> Load look</motion.button>
        </div>
      </Group>

      <AnimatePresence>
        {c.result && (
          <motion.div initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING}
            className="rounded-xl border px-4 py-3 text-[12.5px]" style={{ background: 'color-mix(in srgb, #4E937A 12%, var(--surface))', borderColor: 'color-mix(in srgb, #4E937A 40%, transparent)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...SPRING, delay: 0.1 }} style={{ color: '#4E937A' }}><Icon n="check" s={18} w={3} /></motion.span>
              <span className="min-w-0 break-words"><b>{c.result.name}</b> · {c.result.w}×{c.result.h} · {fmtBytes(c.result.size)}</span>
            </div>
            <button className="btn btn-primary w-full mt-3" disabled={!c.result.blob} onClick={c.saveResult}>Save {isVideo ? 'video' : 'image'}</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const TITLES = {
  looks: ['Looks', `${PRESETS.length}+ one-click styles`], light: ['Light', 'Exposure, contrast & tone'], color: ['Colour', 'White balance & saturation'],
  mixer: ['Colour mixer', 'Hue, saturation, luminance'], grade: ['Grading', 'Shadows, midtones, highlights'],
  fx: ['Effects', 'Texture, lens & stylise'], crop: ['Crop & rotate', 'Frame, straighten, flip'], export: ['Export', 'Save your edit'],
}
export { SECTION_KEYS, DEFAULTS }
