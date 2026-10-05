import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icon, Slider, SPRING } from '../studio/controls.jsx'
import { Chip, Switch } from '../frames/Panels.jsx'
import { AnimatedNumber } from '../../components/ui.jsx'
import { ThumbCard, ColorField, LiveMeter, BeatDot, clock } from './parts.jsx'
import { fmtBytes } from '../../lib/utils.js'
import { PALETTES, STYLES, STYLE_CONTROLS, BARS_LABEL, FONTS, LOOKS, RATIOS, RES, DEFAULTS, applyLook, applyPalette, matchBackdrop } from '../../lib/viz/params.js'

const Block = ({ i = 0, children, className = '' }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.03 + i * 0.055 }}>{children}</motion.div>
)
const Label = ({ children, right }) => <div className="flex items-center justify-between mb-2.5"><div className="eyebrow">{children}</div>{right}</div>
const Seg = ({ value, onChange, options }) => <div className="flex flex-wrap gap-1.5">{options.map(([k, l]) => <Chip key={k} on={value === k} onClick={() => onChange(k)}>{l}</Chip>)}</div>
const Pill = ({ children, onClick, icon, primary, disabled }) => (
  <motion.button type="button" disabled={disabled} whileHover={{ y: -2 }} whileTap={{ scale: 0.93 }} onClick={onClick} className={`btn ${primary ? 'btn-primary' : ''} !py-2 !px-3.5 text-[12.5px]`} style={{ opacity: disabled ? 0.5 : 1 }}>
    {icon && <Icon n={icon} s={15} />} {children}
  </motion.button>
)
const Divider = () => <div className="h-px" style={{ background: 'var(--border)' }} />

/* ============================================ LOOKS ============================================ */
export function LooksPanel({ c }) {
  const [name, setName] = useState('')
  return (
    <div className="space-y-6">
      <Block i={0}>
        <div className="rounded-2xl p-3.5 flex items-center gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <motion.span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--ink)', color: 'var(--bg)' }} animate={{ rotate: c.diceTick * 360 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}><Icon n="dice" s={20} /></motion.span>
          <div className="min-w-0 flex-1 leading-tight"><div className="text-[13px] font-bold">Surprise me</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Random style, colours and motion — your text stays.</div></div>
          <Pill primary onClick={c.surprise}>Roll</Pill>
        </div>
      </Block>

      <Block i={1}>
        <Label right={<span className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{c.myLooks.length} saved</span>}>My looks</Label>
        <div className="flex gap-2 mb-3">
          <input className="input flex-1 !py-2 text-[12.5px]" placeholder="Name this look…" value={name} maxLength={28} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { c.saveLook(name); setName('') } }} />
          <Pill icon="save" onClick={() => { c.saveLook(name); setName('') }}>Save</Pill>
        </div>
        <motion.div layout className="grid grid-cols-2 gap-x-2.5 gap-y-3">
          <AnimatePresence mode="popLayout">
            {c.myLooks.map((l, i) => <ThumbCard key={l.id} i={i} P={applyLook(c.P, l)} assets={c.assets} on={c.activeLook === l.id} label={l.name} badge="Mine" onClick={() => c.applyCustom(l)} onDelete={() => c.deleteLook(l.id)} />)}
          </AnimatePresence>
        </motion.div>
        {!c.myLooks.length && <div className="text-[12px] rounded-xl px-3 py-3 text-center" style={{ color: 'var(--muted)', border: '1.5px dashed var(--border)' }}>Tune a look, name it, and it will live here.</div>}
        <div className="flex gap-2 mt-3"><Pill icon="download" onClick={c.exportLooks} disabled={!c.myLooks.length}>Export JSON</Pill><Pill icon="plus" onClick={c.importLooks}>Import</Pill></div>
      </Block>

      <Block i={2}>
        <Label right={<span className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{LOOKS.length} looks</span>}>Whole looks</Label>
        <div className="grid grid-cols-2 gap-x-2.5 gap-y-3">
          {LOOKS.map((l, i) => <ThumbCard key={l.id} i={i} P={applyLook(c.P, l)} assets={c.assets} on={c.activeLook === l.id} label={l.name} onClick={() => c.applyBuiltIn(l)} />)}
        </div>
      </Block>
    </div>
  )
}

/* ============================================ STYLE ============================================ */
export function StylePanel({ c }) {
  const { P, sl, upd } = c
  const ctl = STYLE_CONTROLS[P.style] || []
  const has = (k) => ctl.includes(k)
  return (
    <div className="space-y-6">
      <Block i={0}>
        <Label right={<span className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{STYLES.length} styles</span>}>Visual style</Label>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
          {STYLES.map(([k, n], i) => <ThumbCard key={k} i={i} P={{ ...P, style: k }} assets={c.assets} on={P.style === k} label={n} onClick={() => upd({ style: k }, true)} />)}
        </div>
      </Block>
      <Divider />
      <Block i={1} className="space-y-4">
        <Label>Shape · {STYLES.find((s) => s[0] === P.style)?.[1]}</Label>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div key={P.style} className="space-y-4" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING}>
            {has('bars') && sl('bars', BARS_LABEL[P.style] || 'Count', { min: P.style === 'particles' || P.style === 'starfield' ? 40 : P.style === 'orbits' ? 30 : 16, max: P.style === 'particles' || P.style === 'starfield' ? 400 : P.style === 'orbits' ? 140 : 160 })}
            {has('thick') && sl('thick', P.style === 'tunnel' ? 'Line weight' : P.style === 'matrix' ? 'Dot size' : 'Thickness', { min: 0.15, max: 1, step: 0.01 })}
            {has('lineW') && sl('lineW', 'Line width', { min: 1, max: 12 })}
            {has('sides') && sl('sides', 'Polygon sides', { min: 3, max: 12 })}
            {has('round') && <Switch on={!!P.round} onChange={(v) => upd({ round: v ? 1 : 0 }, true)} label="Rounded" hint={P.style === 'matrix' ? 'Dots instead of squares' : 'Soft pill ends'} />}
            {has('peaks') && <Switch on={!!P.peaks} onChange={(v) => upd({ peaks: v ? 1 : 0 }, true)} label="Peak caps" hint="Falling markers above each bar" />}
            {has('mirror') && <Switch on={!!P.mirror} onChange={(v) => upd({ mirror: v ? 1 : 0 }, true)} label="Mirror" hint="Symmetric about the centre" />}
            {has('reflect') && <Switch on={!!P.reflect} onChange={(v) => upd({ reflect: v ? 1 : 0 }, true)} label="Reflection" hint="Faint mirrored floor" />}
            {!ctl.length && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>This style has no extra shape controls — use layout below.</div>}
          </motion.div>
        </AnimatePresence>
      </Block>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label>Layout</Label>
        {sl('size', 'Scale', { min: 0.4, max: 1.8, step: 0.01 })}
        {sl('vx', 'Horizontal offset', { min: -50, max: 50, suffix: '%' })}
        {sl('vy', 'Vertical offset', { min: -50, max: 50, suffix: '%' })}
        {sl('rotation', 'Rotation', { min: -180, max: 180, suffix: '°' })}
        {sl('spin', 'Auto-spin', { min: -60, max: 60, suffix: '°/s' })}
      </Block>
    </div>
  )
}

/* ============================================ COLOUR ============================================ */
const CMODES = [['solid', 'Solid'], ['gradient', 'Gradient'], ['amp', 'Loudness'], ['rainbow', 'Rainbow']]
export function ColourPanel({ c }) {
  const { P, sl, upd } = c
  const setC = (k, v) => upd({ [k]: v, palette: 'custom' })
  return (
    <div className="space-y-6">
      <Block i={0}>
        <Label right={<span className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{PALETTES.length} palettes</span>}>Palette</Label>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
          {PALETTES.map((p, i) => <ThumbCard key={p.id} i={i} P={c.matchBg ? matchBackdrop(applyPalette(P, p.id)) : applyPalette(P, p.id)} assets={c.assets} on={P.palette === p.id} label={p.name} onClick={() => upd({ ...applyPalette(P, p.id), ...(c.matchBg ? matchBackdrop(applyPalette(P, p.id)) : {}) }, true)} />)}
        </div>
        <div className="mt-3"><Switch on={c.matchBg} onChange={c.setMatchBg} label="Match backdrop" hint="Palettes also recolour the background" /></div>
      </Block>
      <Divider />
      <Block i={1} className="space-y-4">
        <Label>Colour mode</Label>
        <Seg value={P.cmode} onChange={(v) => upd({ cmode: v }, true)} options={CMODES} />
        <div className="grid grid-cols-3 gap-2">
          <ColorField label="Peak" value={P.c1} onChange={(v) => setC('c1', v)} />
          <ColorField label="Mid" value={P.c2} onChange={(v) => setC('c2', v)} />
          <ColorField label="Base" value={P.c3} onChange={(v) => setC('c3', v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Switch on={!!P.reverse} onChange={(v) => upd({ reverse: v ? 1 : 0 }, true)} label="Reverse order" />
          <Pill onClick={() => upd({ c1: P.c3, c3: P.c1, palette: 'custom' }, true)} icon="loop">Swap</Pill>
        </div>
      </Block>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label>Light</Label>
        {sl('glow', 'Bloom glow', { min: 0, max: 1.5, step: 0.01 })}
        {sl('opacity', 'Visual opacity', { min: 0.1, max: 1, step: 0.01 })}
        {sl('cycle', 'Colour drift', { min: 0, max: 2, step: 0.01 })}
      </Block>
    </div>
  )
}

/* ============================================ BACKDROP ============================================ */
const BGS = [['gradient', 'Gradient'], ['solid', 'Solid'], ['aurora', 'Aurora'], ['stars', 'Stars'], ['retro', 'Retro grid']]
export function BackdropPanel({ c }) {
  const { P, sl, upd } = c
  return (
    <div className="space-y-6">
      <Block i={0}>
        <Label>Background</Label>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2.5">
          {BGS.map(([k, n], i) => <ThumbCard key={k} i={i} P={{ ...P, bgType: k }} assets={c.assets} on={P.bgType === k} label={n} onClick={() => upd({ bgType: k }, true)} />)}
          <motion.button type="button" layout whileHover={{ y: -4, scale: 1.04 }} whileTap={{ scale: 0.92 }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...SPRING, delay: 0.14 }}
            onClick={() => (c.assets?.bg ? upd({ bgType: 'image' }, true) : c.pickBg())} className="text-left">
            <div className="relative rounded-xl overflow-hidden aspect-video grid place-items-center" style={{ background: 'var(--surface2)', boxShadow: P.bgType === 'image' ? '0 0 0 2.5px var(--copper)' : '0 4px 12px -6px rgba(0,0,0,.5)', border: '1px dashed var(--border)' }}>
              {c.bgUrl ? <img src={c.bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Icon n="image" s={22} />}
              {P.bgType === 'image' && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}><Icon n="check" s={12} w={3} /></span>}
            </div>
            <div className="text-[11px] font-semibold mt-1.5" style={{ color: P.bgType === 'image' ? 'var(--ink)' : 'var(--muted)' }}>Your image</div>
          </motion.button>
        </div>
      </Block>
      <Divider />
      <Block i={1} className="space-y-4">
        <Label>Colours</Label>
        <div className="grid grid-cols-2 gap-2">
          <ColorField label="Top" value={P.bg1} onChange={(v) => upd({ bg1: v })} />
          <ColorField label="Glow" value={P.bg2} onChange={(v) => upd({ bg2: v })} />
        </div>
        <Pill icon="palette" onClick={() => upd(matchBackdrop(P), true)}>Match palette</Pill>
      </Block>
      <AnimatePresence initial={false}>
        {P.bgType === 'image' && (
          <motion.div key="img" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="space-y-4 pb-1">
              <Label>Image</Label>
              {sl('bgDim', 'Dim', { min: 0, max: 0.9, step: 0.01 })}
              {sl('bgBlur', 'Blur', { min: 0, max: 40 })}
              {sl('bgPulse', 'Bass zoom pulse', { min: 0, max: 1, step: 0.01 })}
              <div className="flex gap-2"><Pill icon="image" onClick={c.pickBg}>Replace</Pill><Pill icon="trash" onClick={c.clearBg}>Remove</Pill></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label>Finish</Label>
        {sl('vignette', 'Vignette', { min: 0, max: 1, step: 0.01 })}
        {sl('grain', 'Film grain', { min: 0, max: 1, step: 0.01 })}
      </Block>
    </div>
  )
}

/* ============================================ TEXT ============================================ */
export function TextPanel({ c }) {
  const { P, sl, upd } = c
  return (
    <div className="space-y-6">
      <Block i={0} className="space-y-3">
        <Label>Title</Label>
        <input className="input !py-2.5 text-[13px] w-full" placeholder="Track title" value={P.title} onChange={(e) => upd({ title: e.target.value })} />
        <input className="input !py-2.5 text-[13px] w-full" placeholder="Subtitle / artist" value={P.subtitle} onChange={(e) => upd({ subtitle: e.target.value })} />
        <div className="flex flex-wrap gap-1.5">
          {FONTS.map(([k, n, fam, wt]) => (
            <motion.button key={k} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => upd({ font: k }, true)} className="relative px-3.5 py-2 rounded-xl text-[14px] border border-line"
              style={{ fontFamily: fam, fontWeight: wt, color: P.font === k ? 'var(--bg)' : 'var(--ink)', background: 'var(--surface)' }}>
              <motion.span className="absolute inset-0 rounded-xl" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: P.font === k ? 1 : 0, scale: P.font === k ? 1 : 0.7 }} transition={SPRING} />
              <span className="relative">{n}</span>
            </motion.button>
          ))}
        </div>
      </Block>
      <Block i={1} className="space-y-4">
        {sl('titleSize', 'Title size', { min: 0.4, max: 2.2, step: 0.01 })}
        <div><div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>Position</div><Seg value={P.tpos} onChange={(v) => upd({ tpos: v }, true)} options={[['top', 'Top'], ['center', 'Centre'], ['bottom', 'Bottom']]} /></div>
        <div><div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>Alignment</div><Seg value={P.talign} onChange={(v) => upd({ talign: v }, true)} options={[['left', 'Left'], ['center', 'Centre'], ['right', 'Right']]} /></div>
        <div><div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>Animation</div><Seg value={P.tanim} onChange={(v) => upd({ tanim: v }, true)} options={[['none', 'None'], ['pulse', 'Beat pulse'], ['float', 'Float'], ['type', 'Typewriter']]} /></div>
      </Block>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label>Progress &amp; time</Label>
        <Seg value={P.progress} onChange={(v) => upd({ progress: v }, true)} options={[['line', 'Line'], ['pill', 'Pill'], ['dots', 'Dots'], ['none', 'Hidden']]} />
        <Switch on={!!P.showTime} onChange={(v) => upd({ showTime: v ? 1 : 0 }, true)} label="Show timestamps" />
        <input className="input !py-2.5 text-[13px] w-full" placeholder="Watermark (e.g. @yourname)" value={P.watermark} onChange={(e) => upd({ watermark: e.target.value })} />
      </Block>
      <Divider />
      <Block i={3} className="space-y-4">
        <Label>Cover art</Label>
        <div className="flex items-center gap-3">
          <motion.button type="button" whileHover={{ y: -2, rotate: -2 }} whileTap={{ scale: 0.92 }} onClick={c.pickCover} className="w-16 h-16 rounded-xl overflow-hidden grid place-items-center shrink-0" style={{ background: 'var(--surface2)', border: '1.5px dashed var(--border)' }}>
            {c.coverUrl ? <img src={c.coverUrl} alt="" className="w-full h-full object-cover" /> : <Icon n="image" s={22} />}
          </motion.button>
          <div className="min-w-0 flex-1"><Seg value={P.cover} onChange={(v) => (c.assets?.cover || v === 'off' ? upd({ cover: v }, true) : (upd({ cover: v }), c.pickCover()))} options={[['off', 'Off'], ['circle', 'Vinyl'], ['square', 'Square']]} /></div>
          {c.coverUrl && <button aria-label="Remove cover" className="w-7 h-7 grid place-items-center rounded-full" style={{ color: 'var(--muted)' }} onClick={c.clearCover}><Icon n="trash" s={14} /></button>}
        </div>
        <AnimatePresence initial={false}>
          {P.cover !== 'off' && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
              <div className="space-y-4 pb-1">
                <div><div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--muted)' }}>Placement</div><Seg value={P.coverPos} onChange={(v) => upd({ coverPos: v }, true)} options={[['center', 'In the centre'], ['corner', 'Bottom-left']]} /></div>
                {sl('coverSize', 'Size', { min: 0, max: 1, step: 0.01 })}
                {P.cover === 'circle' && <Switch on={!!P.coverSpin} onChange={(v) => upd({ coverSpin: v ? 1 : 0 }, true)} label="Spin like a record" />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Block>
    </div>
  )
}

/* ============================================ MOTION ============================================ */
export function MotionPanel({ c }) {
  const { P, sl } = c
  return (
    <div className="space-y-6">
      <Block i={0}>
        <div className="rounded-2xl p-4 space-y-3.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between"><div className="eyebrow">Live signal</div><span className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>Beat <BeatDot an={c.an} /></span></div>
          <LiveMeter an={c.an} field="bass" label="Bass" hue="linear-gradient(90deg,var(--copper),#e0643c)" />
          <LiveMeter an={c.an} field="mid" label="Mids" hue="linear-gradient(90deg,#7a8fd6,var(--copper))" />
          <LiveMeter an={c.an} field="treble" label="Treble" hue="linear-gradient(90deg,#5fd4b0,#7a8fd6)" />
          {!c.live && <div className="text-[11px]" style={{ color: 'var(--muted)' }}>Showing the preview signal — press play to read your track.</div>}
        </div>
      </Block>
      <Block i={1} className="space-y-4">
        <Label>Response</Label>
        {sl('gain', 'Sensitivity', { min: 0.3, max: 3, step: 0.01 })}
        {sl('smooth', 'Smoothing', { min: 0, max: 0.95, step: 0.01 })}
        {sl('beatSens', 'Beat detection', { min: 0.3, max: 2, step: 0.01 })}
      </Block>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label>Frequency range</Label>
        {sl('fmin', 'Lowest', { min: 20, max: 400, suffix: ' Hz' })}
        {sl('fmax', 'Highest', { min: 2000, max: 20000, step: 100, fmt: (v) => `${(v / 1000).toFixed(1)} kHz` })}
      </Block>
      <Divider />
      <Block i={3} className="space-y-4">
        <Label>Camera reactions</Label>
        {sl('shake', 'Beat shake', { min: 0, max: 1, step: 0.01 })}
        {sl('zoom', 'Beat zoom', { min: 0, max: 1, step: 0.01 })}
        {sl('flash', 'Beat flash', { min: 0, max: 1, step: 0.01 })}
      </Block>
    </div>
  )
}

/* ============================================ EXPORT ============================================ */
function RatioIcon({ r }) {
  const [w, h] = RATIOS[r], k = 26 / Math.max(w, h)
  return <span className="grid place-items-center w-9 h-9"><motion.span className="block rounded-[3px]" initial={false} animate={{ width: w * k, height: h * k }} style={{ border: '2px solid currentColor' }} transition={SPRING} /></span>
}
export function ExportPanel({ c }) {
  const { exp, setExp, busy, prog, result } = c
  const pct = Math.round(prog * 100), R = 38, C = 2 * Math.PI * R
  const Wd = c.outDims[0], Hd = c.outDims[1]
  const resRef = useRef(null)
  useEffect(() => { if (result) setTimeout(() => resRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250) }, [result])
  return (
    <div className="space-y-6">
      <Block i={0}>
        <Label>Aspect ratio</Label>
        <div className="grid grid-cols-5 gap-1.5">
          {Object.keys(RATIOS).map((r) => (
            <motion.button key={r} type="button" disabled={busy} whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }} onClick={() => setExp({ ratio: r })} className="relative rounded-xl py-2 flex flex-col items-center gap-0.5 border border-line"
              style={{ color: exp.ratio === r ? 'var(--bg)' : 'var(--ink)', background: 'var(--surface)' }}>
              <motion.span className="absolute inset-0 rounded-xl" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: exp.ratio === r ? 1 : 0, scale: exp.ratio === r ? 1 : 0.7 }} transition={SPRING} />
              <span className="relative"><RatioIcon r={r} /></span><span className="relative text-[10.5px] font-bold">{r}</span>
            </motion.button>
          ))}
        </div>
        <div className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>{{ '16:9': 'YouTube, desktop', '9:16': 'Reels, Shorts, TikTok', '1:1': 'Instagram, Telegram', '4:5': 'Instagram portrait', '21:9': 'Cinematic banner' }[exp.ratio]}</div>
      </Block>
      <Block i={1} className="space-y-4">
        <div><Label>Resolution</Label><Seg value={exp.res} onChange={(v) => setExp({ res: v })} options={Object.keys(RES).map((k) => [k, k])} /></div>
        <div><Label>Frame rate</Label><Seg value={String(exp.fps)} onChange={(v) => setExp({ fps: +v })} options={[['24', '24 fps'], ['30', '30 fps'], ['60', '60 fps']]} /></div>
        <div><Label>Quality</Label><Seg value={exp.q} onChange={(v) => setExp({ q: v })} options={[['draft', 'Draft'], ['good', 'Balanced'], ['max', 'Maximum']]} /></div>
        <div><Label>Container</Label><Seg value={exp.fmt} onChange={(v) => setExp({ fmt: v })} options={[...(c.canMp4 ? [['mp4', 'MP4']] : []), ['webm', 'WebM']]} /></div>
        <Switch on={exp.audio} onChange={(v) => setExp({ audio: v })} label="Include audio" hint="Turn off to export a silent loop" />
      </Block>
      <Divider />
      <Block i={2} className="space-y-4">
        <Label right={<button className="text-[11px] font-semibold underline underline-offset-2" style={{ color: 'var(--muted)' }} onClick={() => c.setRange(null)}>Whole track</button>}>Range</Label>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Start', clock(c.range[0])], ['Length', clock(c.range[1] - c.range[0])], ['End', clock(c.range[1])]].map(([k, v]) => (
            <div key={k} className="rounded-xl py-2.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="eyebrow !text-[9.5px]">{k}</div><div className="mono font-semibold text-[15px] mt-0.5 tabular-nums">{v}</div></div>
          ))}
        </div>
        <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Drag the copper handles on the waveform under the stage.</div>
      </Block>
      <Block i={3}>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="eyebrow !text-[9.5px]">Output</div><div className="mono font-semibold text-[13px] mt-1 tabular-nums">{Wd}×{Hd}</div></div>
          <div className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="eyebrow !text-[9.5px]">Bitrate</div><div className="mono font-semibold text-[13px] mt-1 tabular-nums"><AnimatedNumber value={c.mbps} format={(n) => n.toFixed(1)} /> Mb/s</div></div>
          <div className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="eyebrow !text-[9.5px]">≈ Size</div><div className="mono font-semibold text-[13px] mt-1 tabular-nums"><AnimatedNumber value={c.estBytes} format={(n) => fmtBytes(n)} /></div></div>
        </div>
        {!c.canRender && (
          <p role="status" className="text-[11.5px] leading-relaxed mt-3" style={{ color: c.estBytes > c.maxExportBytes ? '#b4432f' : 'var(--muted)' }}>
            {c.estBytes > c.maxExportBytes
              ? `Estimated size exceeds the ${fmtBytes(c.maxExportBytes)} in-memory limit. Shorten the range or lower the resolution/quality.`
              : 'Wait for a valid media duration before rendering.'}
          </p>
        )}
      </Block>

      <Block i={4} className="space-y-3">
        <motion.button type="button" disabled={!busy && !c.canRender} whileHover={{ y: busy || !c.canRender ? 0 : -3 }} whileTap={{ scale: 0.97 }} onClick={busy ? c.cancelExport : c.renderVideo} className="btn btn-primary btn-sheen w-full !py-3.5 relative overflow-hidden text-[14px] disabled:opacity-45 disabled:cursor-not-allowed">
          <AnimatePresence mode="wait" initial={false}>
            {busy ? (
              <motion.span key="b" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center justify-center gap-3">
                <svg width="26" height="26" viewBox="0 0 90 90" className="-rotate-90"><circle cx="45" cy="45" r={R} fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="9" /><motion.circle cx="45" cy="45" r={R} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - prog) }} transition={{ duration: 0.2 }} /></svg>
                Recording {pct}% — tap to cancel
              </motion.span>
            ) : (
              <motion.span key="i" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-center justify-center gap-2"><Icon n="play" s={15} /> Render video</motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <AnimatePresence initial={false}>
          {busy && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
              <div className="rounded-xl h-[8px] overflow-hidden relative" style={{ background: 'color-mix(in srgb, var(--ink) 10%, transparent)' }}><motion.div className="absolute inset-y-0 left-0 rounded-full stripes" style={{ background: 'var(--copper)' }} animate={{ width: `${Math.max(2, pct)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="text-[11.5px] leading-relaxed rounded-xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--copper) 9%, transparent)', color: 'var(--muted)' }}>
          Rendering happens in real time on this device — a 3-minute track takes 3 minutes. Keep this tab visible while it records; the speakers are muted meanwhile.
        </div>
        <div className="flex gap-2"><Pill icon="camera" onClick={c.exportPng} disabled={busy}>Save still (PNG)</Pill></div>
        <AnimatePresence>
          {c.err && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] rounded-xl px-3 py-2.5" style={{ background: 'rgba(180,67,47,.1)', color: '#b4432f' }}>{c.err}</motion.div>}
        </AnimatePresence>
        <AnimatePresence>
          {result && (
            <motion.div ref={resRef} key={result.url} initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={SPRING} className="card-raised rounded-2xl p-3 space-y-3">
              <video src={result.url} controls playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: `${Wd}/${Hd}`, maxHeight: 260 }} />
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 leading-tight"><div className="text-[12.5px] font-bold truncate">{result.name}</div><div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{result.note} · {fmtBytes(result.blob.size)}</div></div>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} className="btn btn-primary !py-2 !px-3 text-[12px]" onClick={c.saveResult}><Icon n="download" s={14} w={2.2} /> Save</motion.button>
                <button aria-label="Dismiss" className="w-6 h-6 grid place-items-center rounded-full" style={{ color: 'var(--muted)' }} onClick={c.clearResult}><Icon n="trash" s={13} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Block>
    </div>
  )
}

export { DEFAULTS }
