import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Btn, Drop, Chips, Range, Switch, Field, KIco, SPRING, Dock, Swap, Seg, useToast, usePref, save, fmtSize, Stat2 } from './kit/ui.jsx'
import { DEFAULTS, SHAPES, FONTS, PRESETS, PACKS, normalizeIconOptions, drawIcon, buildPack, zipOf } from '../lib/icons/forge.js'

function Ic({ size, o, img, variant, css, px, className = '', style }) {
  const ref = useRef(null), key = JSON.stringify(o) + (img?.src || '') + variant
  useEffect(() => { const c = ref.current; if (!c) return; const S = px || Math.round(size * (window.devicePixelRatio || 1) * 1.5); c.width = c.height = S; drawIcon(c.getContext('2d'), S, o, img, variant) }, [key, size, px])
  return <canvas ref={ref} className={className} style={{ width: size, height: size, imageRendering: px && px < 40 ? 'pixelated' : 'auto', ...css, ...style }} />
}
const MAX_ICON_FILE_BYTES = 20 * 1024 * 1024
const MAX_ICON_IMAGE_PIXELS = 20_000_000
const MAX_ICON_EDGE = 2_048
const PACK_IDS = PACKS.map((p) => p.id)
const loadImg = (file) => new Promise((res, rej) => {
  if (!file || !Number.isFinite(file.size) || file.size > MAX_ICON_FILE_BYTES) return rej(new RangeError('Choose an image smaller than 20 MB.'))
  const source = URL.createObjectURL(file), original = new Image()
  const release = (url) => URL.revokeObjectURL(url)
  original.onload = () => {
    release(source)
    const w = original.naturalWidth, h = original.naturalHeight
    if (!w || !h || w * h > MAX_ICON_IMAGE_PIXELS) return rej(new RangeError('That image is too large to use as an icon.'))
    const scale = Math.min(1, MAX_ICON_EDGE / w, MAX_ICON_EDGE / h)
    if (scale === 1) return res(original)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale))
      canvas.getContext('2d').drawImage(original, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (!blob) return rej(new Error('Could not resize that image.'))
        const url = URL.createObjectURL(blob), image = new Image()
        image.onload = () => { release(url); res(image) }
        image.onerror = () => { release(url); rej(new Error('Could not resize that image.')) }
        image.src = url
      }, 'image/png')
    } catch { rej(new Error('Could not process that image. Try a PNG or JPEG.')) }
  }
  original.onerror = () => { release(source); rej(new Error('Could not read that image.')) }
  original.src = source
})

function Preview({ o, img }) {
  const [view, setView] = useState('home')
  const tile = (label, el) => <div key={label} className="text-center"><div className="mx-auto w-fit">{el}</div><div className="text-[10.5px] mt-1.5 font-semibold truncate max-w-[70px] mx-auto" style={{ color: 'rgba(255,255,255,.85)' }}>{label}</div></div>
  const dummy = ['Mail', 'Maps', 'Notes', 'Camera', 'Clock', 'Music', 'Files']
  const grey = (i) => <div className="w-[52px] h-[52px] rounded-[13px]" style={{ background: `hsl(${i * 47 + 20} 25% ${60 + (i % 3) * 6}%)`, opacity: 0.85 }} />
  return (
    <Panel pad={false} className="p-4 sm:p-5" delay={0.1}>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap"><Label>Preview</Label><Seg small value={view} onChange={setView} options={[['home', 'On devices'], ['sizes', 'Sizes']]} /></div>
      <Swap k={view}>
        {view === 'home' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[26px] p-4" style={{ background: 'linear-gradient(160deg,#3b4a6b,#1b2236)' }}>
              <div className="text-[10px] font-bold tracking-widest text-white/60 mb-3">IPHONE</div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-3 justify-items-center">
                {tile(o.name.slice(0, 9) || 'App', <motion.div whileHover={{ scale: 1.12, rotate: -3 }} transition={SPRING}><Ic size={52} o={o} img={img} variant="opaque" css={{ borderRadius: 12 }} /></motion.div>)}
                {dummy.slice(0, 7).map((d, i) => tile(d, grey(i)))}
              </div>
            </div>
            <div className="rounded-[26px] p-4" style={{ background: 'linear-gradient(160deg,#1f6f5c,#0f3d33)' }}>
              <div className="text-[10px] font-bold tracking-widest text-white/60 mb-3">ANDROID</div>
              <div className="grid grid-cols-4 gap-x-2 gap-y-3 justify-items-center">
                {tile(o.name.slice(0, 9) || 'App', <motion.div whileHover={{ scale: 1.12 }} transition={SPRING}><Ic size={52} o={o} img={img} variant="circle" /></motion.div>)}
                {dummy.slice(0, 7).map((d, i) => tile(d, <div className="w-[52px] h-[52px] rounded-full" style={{ background: `hsl(${i * 53 + 90} 25% ${60 + (i % 3) * 6}%)`, opacity: 0.85 }} />))}
              </div>
            </div>
            <div className="rounded-[20px] p-3 sm:col-span-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-end gap-1 text-[11px]"><div className="flex items-center gap-2 rounded-t-xl px-3 py-2 bg-white shadow-sm" style={{ border: '1px solid var(--border)', borderBottom: 0 }}><Ic size={16} o={o} img={img} variant="full" px={32} /><span className="font-semibold">{o.name || 'App'}</span><KIco n="x" s={11} /></div><div className="px-3 py-2 text-[11px]" style={{ color: 'var(--muted)' }}>New tab</div></div>
              <div className="rounded-b-xl rounded-tr-xl bg-white h-9 flex items-center px-3 text-[11px]" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>yourwebsite.com</div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-5 justify-center py-2">
            {[256, 180, 128, 96, 64, 48, 32, 16].map((s) => <div key={s} className="text-center"><Ic size={Math.min(s, 160)} o={o} img={img} variant="full" px={s <= 64 ? s : undefined} /><div className="mono text-[10.5px] mt-1.5" style={{ color: 'var(--muted)' }}>{s}</div></div>)}
            <div className="text-center"><Ic size={96} o={o} img={img} variant="maskable" css={{ borderRadius: '50%' }} /><div className="mono text-[10.5px] mt-1.5" style={{ color: 'var(--muted)' }}>maskable</div></div>
          </div>)}
      </Swap>
    </Panel>
  )
}

export default function IconForge() {
  const [savedOptions, setSavedOptions] = usePref('icon', 'o', DEFAULTS), [img, setImg] = useState(null), [tab, setTab] = useState('design')
  const [savedPacks, setSavedPacks] = usePref('icon', 'packs', PACKS.map((p) => p.id)), [busy, setBusy] = useState(null), [toast, toastNode] = useToast(), [ver, setVer] = useState(0)
  const pickSeq = useRef(0), busyLock = useRef(false)
  const o = useMemo(() => normalizeIconOptions(savedOptions), [savedOptions])
  const sel = useMemo(() => Array.isArray(savedPacks) ? [...new Set(savedPacks.filter((id) => PACK_IDS.includes(id)))] : PACK_IDS, [savedPacks])
  const setSel = (action) => setSavedPacks((old) => {
    const current = Array.isArray(old) ? old.filter((id) => PACK_IDS.includes(id)) : []
    const next = typeof action === 'function' ? action(current) : action
    return Array.isArray(next) ? [...new Set(next.filter((id) => PACK_IDS.includes(id)))] : []
  })
  const set = (p) => {
    if (p && Object.hasOwn(p, 'mode') && p.mode !== 'image') pickSeq.current++
    setSavedOptions((x) => normalizeIconOptions({ ...normalizeIconOptions(x), ...p }))
  }
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => document.fonts?.load?.('700 40px Fraunces')).catch(() => {}).finally(() => { if (active) setVer((v) => v + 1) })
    return () => { active = false; pickSeq.current++ }
  }, [])
  const oo = useMemo(() => ({ ...o, _v: ver }), [o, ver])
  const pick = async (f) => {
    const request = ++pickSeq.current
    try {
      const i = await loadImg(f)
      if (request !== pickSeq.current) return
      setImg(i); set({ mode: 'image' })
    } catch (e) { if (request === pickSeq.current) toast(e.message || 'Could not load that image.', 'err') }
  }
  const run = async (ids, single) => {
    if (busyLock.current) return
    const safeIds = Array.isArray(ids) ? [...new Set(ids.filter((id) => PACK_IDS.includes(id)))] : []
    if (!safeIds.length) return
    busyLock.current = true; setBusy(single || 'all')
    try {
      const all = {}; for (const id of safeIds) { const f = await buildPack(id, o, img); for (const [k, v] of Object.entries(f)) all[(safeIds.length > 1 ? id + '/' : '') + k] = v }
      const blob = zipOf(all), nm = (o.name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
      save(blob, `${nm}-icons${safeIds.length === 1 ? '-' + safeIds[0] : ''}.zip`); toast(`${Object.keys(all).length} files · ${fmtSize(blob.size)}`)
    } catch (e) { toast('Could not build the pack: ' + (e.message || e), 'err') } finally { busyLock.current = false; setBusy(null) }
  }
  const counts = { web: 8, pwa: 11, android: 18, ios: 19, desktop: 28 }
  const noImg = o.mode === 'image' && !img
  return (
    <div className="space-y-6">
      <Dock value={tab} onChange={setTab} items={[['design', 'Design', 'palette'], ['export', 'Icon packs', 'box']]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
        <Swap k={tab}>
          {tab === 'design' ? (
            <div className="space-y-4">
              <Panel>
                <Label>Symbol</Label>
                <Seg value={o.mode} onChange={(v) => set({ mode: v })} options={[['mono', 'Letters'], ['image', 'Your logo']]} />
                <AnimatePresence mode="wait" initial={false}>
                  {o.mode === 'mono' ? (
                    <motion.div key="m" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3"><Field label="Letters (up to 3)"><input className="input" maxLength={3} value={o.text} onChange={(e) => set({ text: e.target.value })} dir="auto" /></Field><Field label="Colour"><input type="color" className="w-full h-[42px] rounded-xl border border-line bg-transparent cursor-pointer" value={o.symColor} onChange={(e) => set({ symColor: e.target.value })} /></Field></div>
                      <div><span className="eyebrow block mb-2">Typeface</span><Chips small value={o.font} onChange={(v) => set({ font: v })} options={FONTS} /></div>
                      <Range label="Weight" min={300} max={900} step={100} value={o.weight} onChange={(v) => set({ weight: v })} fmt={(v) => v} />
                    </motion.div>
                  ) : (
                    <motion.div key="i" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 space-y-4">
                      <Drop compact multiple={false} accept="image/*,.svg" onFiles={(f) => pick(f[0])} title={img ? 'Replace logo' : 'Drop your logo'} sub="PNG, SVG, JPG or WebP — a square 1024 px image is ideal" icon="image" />
                      <Switch on={o.tint} onChange={(v) => set({ tint: v })} label="Recolour the logo" hint="Turns a single-colour logo into any colour you pick" />
                      {o.tint && <Field label="Logo colour"><input type="color" className="w-full h-[42px] rounded-xl border border-line bg-transparent cursor-pointer" value={o.tintColor} onChange={(e) => set({ tintColor: e.target.value })} /></Field>}
                    </motion.div>)}
                </AnimatePresence>
                <div className="mt-5 grid gap-4"><Range label="Padding" min={0} max={40} step={1} value={o.pad} onChange={(v) => set({ pad: v })} fmt={(v) => v + '%'} /><Range label="Nudge up / down" min={-15} max={15} step={1} value={o.offY} onChange={(v) => set({ offY: v })} fmt={(v) => (v ? v + '%' : 'Centre')} /></div>
              </Panel>
              <Panel delay={0.05}>
                <Label>Background</Label>
                <Chips value={o.bgType} onChange={(v) => set({ bgType: v })} options={[['gradient', 'Gradient'], ['solid', 'Solid'], ['none', 'Transparent']]} small />
                {o.bgType !== 'none' && <>
                  <div className="flex flex-wrap gap-2 mt-4">{PRESETS.map(([a, b]) => <motion.button key={a + b} type="button" aria-label={a} whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.85 }} onClick={() => set({ bg1: a, bg2: b })} className="w-9 h-9 rounded-full border border-line" style={{ background: o.bgType === 'solid' ? a : `linear-gradient(135deg,${a},${b})`, boxShadow: o.bg1 === a && o.bg2 === b ? '0 0 0 3px var(--surface), 0 0 0 5px var(--copper)' : 'none' }} />)}</div>
                  <div className="grid grid-cols-2 gap-3 mt-4"><Field label={o.bgType === 'solid' ? 'Colour' : 'From'}><input type="color" className="w-full h-[42px] rounded-xl border border-line bg-transparent cursor-pointer" value={o.bg1} onChange={(e) => set({ bg1: e.target.value })} /></Field>{o.bgType === 'gradient' && <Field label="To"><input type="color" className="w-full h-[42px] rounded-xl border border-line bg-transparent cursor-pointer" value={o.bg2} onChange={(e) => set({ bg2: e.target.value })} /></Field>}</div>
                  {o.bgType === 'gradient' && <div className="mt-4"><Range label="Angle" min={0} max={360} step={5} value={o.angle} onChange={(v) => set({ angle: v })} fmt={(v) => v + '°'} /></div>}
                </>}
              </Panel>
              <Panel delay={0.1}>
                <Label>Shape</Label>
                <div className="grid grid-cols-4 gap-2">{SHAPES.map(([k, l]) => <motion.button key={k} type="button" aria-pressed={o.shape === k} whileHover={{ y: -3 }} whileTap={{ scale: 0.93 }} onClick={() => set({ shape: k })} className="rounded-2xl border p-2 text-center" style={{ borderColor: o.shape === k ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)' }}><Ic size={44} o={{ ...oo, shape: k }} img={img} variant="full" px={96} css={{ margin: '0 auto' }} /><span className="text-[11.5px] font-semibold block mt-1">{l}</span></motion.button>)}</div>
                {o.shape === 'rounded' && <div className="mt-4"><Range label="Corner radius" min={0} max={50} step={1} value={o.radius} onChange={(v) => set({ radius: v })} fmt={(v) => v + '%'} /></div>}
                <div className="grid grid-cols-2 gap-3 mt-5"><Field label="App name (for manifests)"><input className="input" value={o.name} onChange={(e) => set({ name: e.target.value })} /></Field><Field label="Theme colour"><input type="color" className="w-full h-[42px] rounded-xl border border-line bg-transparent cursor-pointer" value={o.theme} onChange={(e) => set({ theme: e.target.value })} /></Field></div>
              </Panel>
            </div>
          ) : (
            <div className="space-y-4">
              <Panel>
                <Label right={<Btn small disabled={Boolean(busy)} onClick={() => setSel(sel.length === PACKS.length ? [] : PACK_IDS)}>{sel.length === PACKS.length ? 'Clear' : 'Select all'}</Btn>}>Choose what you need</Label>
                <div className="space-y-2.5">
                  {PACKS.map((p, i) => { const on = sel.includes(p.id); return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.05 }} className="rounded-2xl border p-3.5 flex items-center gap-3" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 8%, var(--surface))' : 'var(--surface)' }}>
                      <button type="button" aria-label={p.name} aria-pressed={on} disabled={Boolean(busy)} onClick={() => setSel(on ? sel.filter((x) => x !== p.id) : [...sel, p.id])} className="w-6 h-6 rounded-lg grid place-items-center shrink-0 border disabled:cursor-not-allowed disabled:opacity-50" style={{ background: on ? 'var(--copper)' : 'transparent', borderColor: on ? 'var(--copper)' : 'var(--border)', color: '#fff' }}>{on && <KIco n="check" s={14} />}</button>
                      <div className="min-w-0 flex-1"><div className="font-semibold text-[14px]">{p.name}</div><div className="text-[12px]" style={{ color: 'var(--muted)' }}>{p.note}</div></div>
                      <Btn small icon="download" busy={busy === p.id} onClick={() => run([p.id], p.id)} disabled={Boolean(busy) || noImg}>{counts[p.id]}+ files</Btn>
                    </motion.div>) })}
                </div>
                <Btn primary className="w-full mt-5" icon="download" busy={busy === 'all'} disabled={Boolean(busy) || !sel.length || noImg} onClick={() => run(PACK_IDS.filter((x) => sel.includes(x)))}>Download {sel.length} pack{sel.length === 1 ? '' : 's'} as ZIP</Btn>
                {busy && <div role="status" aria-live="polite" className="text-[12.5px] mt-3 font-semibold" style={{ color: 'var(--copper)' }}>Rendering icon files… Please wait; a second export is temporarily disabled.</div>}
                {noImg && <div className="text-[12.5px] mt-3 font-semibold" style={{ color: '#C3423F' }}>Add your logo first, or switch the symbol to Letters.</div>}
              </Panel>
              <div className="text-[12px] px-2" style={{ color: 'var(--muted)' }}>Every size is drawn fresh from your design, not shrunk from one image, so small icons stay crisp. Nothing is compressed beyond the PNG format itself.</div>
            </div>)}
        </Swap>
        <div className="lg:sticky lg:top-4 space-y-4">
          <Panel pad={false} className="p-6" delay={0.05}><div className="grid place-items-center py-2"><motion.div key={o.shape} initial={{ scale: 0.88, rotate: -4 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING} whileHover={{ scale: 1.04, rotate: 2 }}><Ic size={208} o={oo} img={img} variant="full" css={{ filter: 'drop-shadow(0 24px 30px rgba(0,0,0,.28))' }} /></motion.div></div></Panel>
          <Preview o={oo} img={img} />
        </div>
      </div>
      {toastNode}
    </div>
  )
}
