import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Tabs, Choice, TextIn, Switch, Seg, Btn, Range, Color, Drop, SPRING, Label, imageToDataUrl, useToast } from './ui.jsx'
import { useQR, useStore, uid } from './store.js'
import { Path } from '../../lib/qr/paths.js'
import { addDot, addEyeFrame, addEyeBall, DOT_SHAPES, FRAME_SHAPES, BALL_SHAPES } from '../../lib/qr/shapes.js'
import { TEMPLATES, TEMPLATE_CATS } from '../../lib/qr/templates.js'
import { buildQR, DEFAULT_STYLE, merge, lightStyle, effectiveEcc } from '../../lib/qr/render.js'
import { LOGOS, LOGO_GROUPS, logoMarkup } from '../../lib/qr/logos.js'
import { FRAME_STYLES, FONTS, wrapFrame } from '../../lib/qr/frames.js'

/* ---------- tiny glyph previews ---------- */
const PATTERN = [[1, 1, 0], [0, 1, 0], [0, 1, 1]]
function DotGlyph({ shape, on }) {
  const d = useMemo(() => {
    const P = new Path()
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (PATTERN[r][c]) addDot(P, shape, c, r, 1, { t: !!PATTERN[r - 1]?.[c], b: !!PATTERN[r + 1]?.[c], l: !!PATTERN[r]?.[c - 1], r: !!PATTERN[r]?.[c + 1] })
    return P.d()
  }, [shape])
  return <svg viewBox="-0.15 -0.15 3.3 3.3" className="w-8 h-8"><path d={d} fill={on ? 'var(--copper)' : 'var(--ink)'} /></svg>
}
function EyeGlyph({ kind, shape, on }) {
  const d = useMemo(() => { const P = new Path(); if (kind === 'frame') { addEyeFrame(P, shape, 0, 0, 0); addEyeBall(P, 'square', 2, 2, 0) } else addEyeBall(P, shape, 0, 0, 0); return P.d() }, [kind, shape])
  return <svg viewBox={kind === 'frame' ? '-0.3 -0.3 7.6 7.6' : '-0.4 -0.4 3.8 3.8'} className="w-8 h-8"><path d={d} fill={on ? 'var(--copper)' : 'var(--ink)'} fillRule="evenodd" /></svg>
}
function Sec({ title, children, right }) {
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="rounded-2xl border border-line p-4" style={{ background: 'var(--surface2)' }}><div className="flex items-center justify-between mb-3"><span className="eyebrow">{title}</span>{right}</div><div className="space-y-4">{children}</div></motion.div>
}
const sub = (t) => <span className="block text-[12.5px] font-semibold mb-2">{t}</span>

/* ---------- templates ---------- */
const SAMPLE = 'https://thetooltable.app'
const Thumb = React.memo(function Thumb({ style }) {
  const r = useMemo(() => buildQR(SAMPLE, style, 't'), [style])
  const svg = r.svg.replace('__W__', '100%').replace('__H__', '100%')
  return <div className="w-full aspect-square grid place-items-center overflow-hidden rounded-xl" dangerouslySetInnerHTML={{ __html: svg }} />
})
const tplStyle = (t) => merge(DEFAULT_STYLE, t.style)

export function TemplatesPanel() {
  const { style, setStyle } = useQR()
  const [cat, setCat] = useState('Clean')
  const [presets, setPresets] = useStore('presets', [])
  const [name, setName] = useState('')
  const [picked, setPicked] = useState(null)
  const apply = (id, s) => { setPicked(id); setStyle((cur) => { const n = merge(DEFAULT_STYLE, s); const keepLogo = !(s.logo && (s.logo.id || s.logo.upload)); if (keepLogo) n.logo = cur.logo; n.dots.image = n.dots.image || cur.dots.image; n.bg.image = n.bg.image || cur.bg.image; return n }) }
  const list = TEMPLATES.filter((t) => t.cat === cat)
  return (
    <div className="space-y-5">
      <div>
        <Label right={<span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{TEMPLATES.length} designs</span>}>Start from a template</Label>
        <Tabs small value={cat} onChange={setCat} tabs={TEMPLATE_CATS.map((c) => [c, c])} />
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((t, i) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SPRING, delay: i * 0.025 }}>
                <Choice active={picked === t.id} onClick={() => apply(t.id, t.style)} className="w-full p-1.5 text-center">
                  <Thumb style={tplStyle(t)} /><span className="block py-1.5 text-[11.5px] leading-tight">{t.name}</span>
                </Choice>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <Sec title={`My presets · ${presets.length}`} right={<span className="text-[11px]" style={{ color: 'var(--muted)' }}>saved on this device</span>}>
        <div className="flex gap-2">
          <input className="input flex-1 min-w-0" placeholder="Name your current look…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { setPresets((p) => [{ id: uid(), name: name.trim(), style: lightStyle(style) }, ...p]); setName('') } }} />
          <Btn small copper icon="save" disabled={!name.trim()} onClick={() => { setPresets((p) => [{ id: uid(), name: name.trim(), style: lightStyle(style) }, ...p]); setName('') }}>Save</Btn>
        </div>
        {presets.length === 0 ? <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Tweak colours, shapes, logo and frame in the other tabs, then save the look here to reuse it.</div> : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            <AnimatePresence initial={false}>{presets.map((p) => (
              <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING} className="relative">
                <Choice active={picked === p.id} onClick={() => apply(p.id, p.style)} className="w-full p-1.5 text-center"><Thumb style={merge(DEFAULT_STYLE, p.style)} /><span className="block py-1.5 text-[11.5px] leading-tight truncate px-1">{p.name}</span></Choice>
                <button type="button" onClick={() => setPresets((l) => l.filter((x) => x.id !== p.id))} aria-label="Delete preset" className="absolute top-1 left-1 w-5 h-5 rounded-full grid place-items-center text-white" style={{ background: 'rgba(0,0,0,.55)' }}><QIco n="x" s={10} w={3} /></button>
              </motion.div>))}</AnimatePresence>
          </div>
        )}
      </Sec>
    </div>
  )
}

/* ---------- style ---------- */
export function StylePanel() {
  const { style: s, setStyle } = useQR()
  const [toastNode, toast] = useToast()
  const up = (sec, o) => setStyle((c) => ({ ...c, [sec]: { ...c[sec], ...o } }))
  const D = s.dots, E = s.eyes, B = s.bg
  const [part, setPart] = useState('dots')
  const up3 = (i, o) => up('eyes', { p: E.p.map((x, j) => (j === i ? { ...x, ...o } : x)) })
  const photo = async (f, who) => {
    try { const u = await imageToDataUrl(f[0]); if (who === 'dots') up('dots', { image: u, fill: 'image' }); else up('bg', { image: u, type: 'image' }) }
    catch (e) { toast(e.message || 'Could not load that image', true) }
  }
  return (
    <div className="space-y-4">
      <Tabs small value={part} onChange={setPart} tabs={[['dots', 'Dots', 'grid'], ['eyes', 'Eyes', 'eye'], ['bg', 'Background', 'image'], ['code', 'Code', 'sliders']]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={part} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.2 }} className="space-y-4">
          {part === 'dots' && <>
            <Sec title="Dot shape">
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">{DOT_SHAPES.map(([k, l]) => <Choice key={k} active={D.shape === k} onClick={() => up('dots', { shape: k })} className="py-2 flex flex-col items-center gap-0.5"><DotGlyph shape={k} on={D.shape === k} /><span className="text-[10.5px]">{l}</span></Choice>)}</div>
              <Range label="Dot size" min={50} max={100} value={Math.round(D.scale * 100)} onChange={(v) => up('dots', { scale: v / 100 })} fmt={(v) => v + '%'} />
            </Sec>
            <Sec title="Dot colour">
              <Seg small value={D.fill} onChange={(fill) => up('dots', { fill })} options={[['solid', 'Solid'], ['gradient', 'Gradient'], ['duo', 'Duotone'], ['image', 'Photo']]} />
              {D.fill === 'solid' && <Color label="Colour" value={D.color} onChange={(color) => up('dots', { color })} quick />}
              {D.fill === 'gradient' && <>
                <Seg small value={D.grad} onChange={(grad) => up('dots', { grad })} options={[['linear', 'Linear'], ['radial', 'Radial']]} />
                <div className="grid grid-cols-2 gap-3"><Color label="Start" value={D.color} onChange={(color) => up('dots', { color })} /><Color label="End" value={D.c2} onChange={(c2) => up('dots', { c2 })} /></div>
                <Switch on={D.stops === 3} onChange={(v) => up('dots', { stops: v ? 3 : 2 })} label="Add a middle colour" />
                {D.stops === 3 && <Color label="Middle" value={D.c3} onChange={(c3) => up('dots', { c3 })} />}
                {D.grad === 'linear' && <Range label="Angle" min={0} max={360} step={5} value={D.angle} onChange={(angle) => up('dots', { angle })} fmt={(v) => v + '°'} />}
              </>}
              {D.fill === 'duo' && <>
                <div className="grid grid-cols-2 gap-3"><Color label="Colour A" value={D.color} onChange={(color) => up('dots', { color })} /><Color label="Colour B" value={D.c2} onChange={(c2) => up('dots', { c2 })} /></div>
                {sub('Pattern')}<Seg small value={D.duo} onChange={(duo) => up('dots', { duo })} options={[['random', 'Random'], ['checker', 'Checker'], ['rows', 'Rows'], ['diag', 'Diagonal'], ['rings', 'Rings']]} />
                {D.duo === 'random' && <Btn small icon="refresh" onClick={() => up('dots', { seed: Math.floor(Math.random() * 9999) })}>Shuffle pattern</Btn>}
              </>}
              {D.fill === 'image' && <>
                <Drop compact onFiles={(f) => photo(f, 'dots')} label={D.image ? 'Replace photo' : 'Add a photo to paint the dots'} />
                {D.image && <Range label="Photo darkness" min={0} max={80} value={Math.round(D.dark * 100)} onChange={(v) => up('dots', { dark: v / 100 })} fmt={(v) => v + '%'} />}
                <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Tip: pair with a light, faded photo background. Error correction switches to H automatically.</div>
              </>}
            </Sec>
          </>}
          {part === 'eyes' && <>
            <Sec title="Eye frame">
              <div className="grid grid-cols-6 gap-2">{FRAME_SHAPES.map(([k, l]) => <Choice key={k} active={E.frame === k} onClick={() => up('eyes', { frame: k })} className="py-2 flex flex-col items-center gap-0.5"><EyeGlyph kind="frame" shape={k} on={E.frame === k} /><span className="text-[10px]">{l}</span></Choice>)}</div>
            </Sec>
            <Sec title="Eye ball">
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">{BALL_SHAPES.map(([k, l]) => <Choice key={k} active={E.ball === k} onClick={() => up('eyes', { ball: k })} className="py-2 flex flex-col items-center gap-0.5"><EyeGlyph kind="ball" shape={k} on={E.ball === k} /><span className="text-[10px]">{l}</span></Choice>)}</div>
            </Sec>
            <Sec title="Eye colours">
              <Switch on={E.sync} onChange={(sync) => up('eyes', { sync })} label="Match the dots" hint="Use the dot colour / gradient on the eyes" />
              {!E.sync && <>
                <Switch on={E.per} onChange={(per) => up('eyes', { per })} label="Different colour per eye" />
                {!E.per ? <div className="grid grid-cols-2 gap-3"><Color label="Frame" value={E.frameColor} onChange={(frameColor) => up('eyes', { frameColor })} /><Color label="Ball" value={E.ballColor} onChange={(ballColor) => up('eyes', { ballColor })} /></div>
                  : ['Top-left', 'Top-right', 'Bottom-left'].map((n, i) => <div key={n}>{sub(n + ' eye')}<div className="grid grid-cols-2 gap-3"><Color value={E.p[i].f} onChange={(f) => up3(i, { f })} /><Color value={E.p[i].b} onChange={(b) => up3(i, { b })} /></div></div>)}
              </>}
            </Sec>
          </>}
          {part === 'bg' && <Sec title="Background">
            <Seg small value={B.type} onChange={(type) => up('bg', { type })} options={[['none', 'Clear'], ['solid', 'Solid'], ['gradient', 'Gradient'], ['image', 'Photo']]} />
            {B.type === 'none' && <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Transparent — great on top of your own artwork. Make sure the dots contrast with what’s behind.</div>}
            {B.type === 'solid' && <Color label="Colour" value={B.color} onChange={(color) => up('bg', { color })} quick />}
            {B.type === 'gradient' && <><div className="grid grid-cols-2 gap-3"><Color label="From" value={B.color} onChange={(color) => up('bg', { color })} /><Color label="To" value={B.c2} onChange={(c2) => up('bg', { c2 })} /></div><Range label="Angle" min={0} max={360} step={5} value={B.angle} onChange={(angle) => up('bg', { angle })} fmt={(v) => v + '°'} /></>}
            {B.type === 'image' && <><Drop compact onFiles={(f) => photo(f, 'bg')} label={B.image ? 'Replace photo' : 'Add a background photo'} /><Color label="Fade colour" value={B.color} onChange={(color) => up('bg', { color })} /><Range label="Fade strength" min={0} max={95} value={Math.round(B.fade * 100)} onChange={(v) => up('bg', { fade: v / 100 })} fmt={(v) => v + '%'} /></>}
            <Range label="Corner roundness" min={0} max={50} value={Math.round(B.radius * 100)} onChange={(v) => up('bg', { radius: v / 100 })} fmt={(v) => v + '%'} />
          </Sec>}
          {part === 'code' && <Sec title="Code settings">
            <Range label="Quiet zone (border)" min={0} max={8} value={s.margin} onChange={(margin) => setStyle((c) => ({ ...c, margin }))} fmt={(v) => v + ' modules'} />
            <div>{sub('Error correction')}<Seg small value={s.ecc} onChange={(ecc) => setStyle((c) => ({ ...c, ecc }))} options={[['auto', 'Auto'], ['L', 'L 7%'], ['M', 'M 15%'], ['Q', 'Q 25%'], ['H', 'H 30%']]} />
              <div className="text-[12px] mt-2" style={{ color: 'var(--muted)' }}>Currently <b style={{ color: 'var(--ink)' }}>{effectiveEcc(s)}</b>. Higher levels survive damage and logos but make denser codes. Auto picks H when you add a logo or photo.</div></div>
          </Sec>}
        </motion.div>
      </AnimatePresence>
      {toastNode}
    </div>
  )
}

/* ---------- logo ---------- */
function LogoGlyph({ logo, color }) {
  return <svg viewBox="0 0 24 24" className="w-7 h-7" dangerouslySetInnerHTML={{ __html: logoMarkup(logo, 12, 12, 22, color) }} />
}
export function LogoPanel() {
  const { style: s, setStyle } = useQR()
  const [toastNode, toast] = useToast()
  const L = s.logo
  const up = (o) => setStyle((c) => ({ ...c, logo: { ...c.logo, ...o } }))
  const [g, setG] = useState('Essentials')
  const mode = L.upload ? 'upload' : L.id ? 'library' : 'none'
  const [tab, setTab] = useState(mode === 'none' ? 'library' : mode)
  const sel = LOGOS.find((l) => l.id === L.id)
  const pick = (l) => up({ id: l.id, upload: null, ...(l.brand ? { badgeColor: l.brand[0], color: l.brand[1] } : { badgeColor: '#FFFFFF', color: '#1A1411' }) })
  const upload = async (files) => {
    try { up({ upload: await imageToDataUrl(files[0], 600), id: null }) }
    catch (e) { toast(e.message || 'Could not load that logo', true) }
  }
  return (
    <div className="space-y-4">
      <Seg small value={tab} onChange={setTab} options={[['library', 'Library'], ['upload', 'Upload']]} />
      <Sec title={tab === 'library' ? `${LOGOS.length} built-in logos` : 'Your own logo'} right={(L.id || L.upload) ? <button type="button" className="text-[11.5px] font-semibold" style={{ color: 'var(--copper)' }} onClick={() => up({ id: null, upload: null })}>Remove logo</button> : null}>
        {tab === 'library' ? <>
          <Tabs small value={g} onChange={setG} tabs={LOGO_GROUPS.map((x) => [x, x])} />
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            <AnimatePresence mode="popLayout" initial={false}>{LOGOS.filter((l) => l.g === g).map((l, i) => (
              <motion.div key={l.id} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...SPRING, delay: i * 0.02 }}>
                <Choice active={L.id === l.id && !L.upload} onClick={() => pick(l)} className="w-full py-2.5 flex flex-col items-center gap-1"><LogoGlyph logo={l} color={l.brand ? l.brand[0] : 'var(--ink)'} /><span className="text-[10px] leading-none">{l.name}</span></Choice>
              </motion.div>))}</AnimatePresence>
          </div>
        </> : <>
          <Drop compact icon="upload" onFiles={upload} label={L.upload ? 'Replace logo' : 'Upload PNG, SVG or JPG'}>{L.upload && <img src={L.upload} alt="Your logo" className="w-14 h-14 object-contain rounded-xl border border-line mt-1" style={{ background: 'var(--surface)' }} />}</Drop>
          <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Transparent PNGs look best. The logo stays on this device.</div>
        </>}
      </Sec>
      {(L.id || L.upload) && <Sec title="Logo style">
        <Range label="Logo size" min={8} max={32} value={Math.round(L.size * 100)} onChange={(v) => up({ size: v / 100 })} fmt={(v) => v + '%'} />
        <div>{sub('Badge')}<Seg small value={L.badge} onChange={(badge) => up({ badge })} options={[['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square'], ['none', 'None']]} /></div>
        {L.badge !== 'none' && <div className="grid grid-cols-2 gap-3"><Color label="Badge" value={L.badgeColor} onChange={(badgeColor) => up({ badgeColor })} />{!L.upload && <Color label="Icon" value={L.color} onChange={(color) => up({ color })} />}</div>}
        {sel?.brand && <Btn small icon="palette" onClick={() => up({ badgeColor: sel.brand[0], color: sel.brand[1] })}>Use {sel.name} colours</Btn>}
        <Switch on={L.clear} onChange={(clear) => up({ clear })} label="Clear space behind logo" hint="Removes dots under the logo so it stays crisp" />
        {L.badge !== 'none' && <Switch on={L.border} onChange={(border) => up({ border })} label="Thin outline" />}
      </Sec>}
      {toastNode}
    </div>
  )
}

/* ---------- frame ---------- */
const MiniInner = '<rect width="10" height="10" fill="#fff"/><path d="M1 1h3v3H1zM6 1h3v3H6zM1 6h3v3H1zM6 6h1v1H6zM8 7h1v2H7V8h1z" fill="#222"/>'
function FrameGlyph({ style, c, t }) {
  const f = wrapFrame(MiniInner.replace(/^/, '<g>') + '</g>', 10, { style, label: 'SCAN', color: c, text: t, font: 'sans' })
  return <svg viewBox={`0 0 ${f.W} ${f.H}`} className="h-12 w-auto max-w-full" dangerouslySetInnerHTML={{ __html: f.body }} />
}
const LABELS = ['SCAN ME', 'MENU', 'JOIN WI-FI', 'FOLLOW US', 'PAY HERE', 'VISIT US', 'LEARN MORE', 'GET THE APP', 'WATCH NOW']
export function FramePanel() {
  const { style: s, setStyle } = useQR()
  const F = s.frame
  const up = (o) => setStyle((c) => ({ ...c, frame: { ...c.frame, ...o } }))
  return (
    <div className="space-y-4">
      <Sec title="Frame style">
        <div className="grid grid-cols-4 gap-2">{FRAME_STYLES.map(([k, l]) => <Choice key={k} active={F.style === k} onClick={() => up({ style: k })} className="py-2.5 px-1 flex flex-col items-center gap-1.5">{k === 'none' ? <span className="h-12 grid place-items-center" style={{ color: 'var(--muted)' }}><QIco n="x" s={22} /></span> : <FrameGlyph style={k} c={F.color} t={F.text} />}<span className="text-[10.5px] leading-none">{l}</span></Choice>)}</div>
      </Sec>
      {F.style !== 'none' && <Sec title="Call to action">
        {F.style !== 'border' && <><TextIn label="Label" value={F.label} onChange={(label) => up({ label })} ph="SCAN ME" />
          <div className="flex flex-wrap gap-1.5">{LABELS.map((l) => <motion.button key={l} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => up({ label: l })} className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: F.label === l ? 'var(--ink)' : 'var(--border)', background: F.label === l ? 'var(--ink)' : 'var(--surface)', color: F.label === l ? 'var(--bg)' : 'var(--ink)' }}>{l}</motion.button>)}</div>
          <div>{sub('Font')}<Seg small value={F.font} onChange={(font) => up({ font })} options={Object.entries(FONTS).map(([k, v]) => [k, v[0]])} /></div></>}
        <div className="grid grid-cols-2 gap-3"><Color label="Frame colour" value={F.color} onChange={(color) => up({ color })} />{F.style !== 'border' && F.style !== 'corners' && <Color label="Text colour" value={F.text} onChange={(text) => up({ text })} />}</div>
      </Sec>}
    </div>
  )
}
