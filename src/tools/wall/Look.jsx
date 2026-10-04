import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { STYLES, styleById } from '../../lib/wall/shader.js'
import { thumbURL } from '../../lib/wall/renderer.js'
import { normalize } from '../../lib/wall/design.js'
import { PALETTES, PALETTE_GROUPS } from '../../lib/wall/presets.js'
import { HARMONIES, harmony, paletteFromImage, hexToLab, labToHex, lumOf } from '../../lib/wall/color.js'
import { Ico, Slider, Chips, Btn, Seg, Label, ColorDot, SPRING, useWall } from './ui.jsx'

const thumbCache = new Map()
export function useStyleThumbs(pal, seed) {
  const [t, setT] = useState({})
  useEffect(() => {
    let dead = false; const out = {}
    ;(async () => {
      for (const s of STYLES) {
        const k = `${s.id}|${pal.join()}|${seed}`
        if (!thumbCache.has(k)) { thumbCache.set(k, thumbURL(normalize({ style: s.id, pal, seed, fx: { grain: 0.1 } }), 168, 104)); await new Promise((r) => setTimeout(r, 0)) }
        if (dead) return; out[s.id] = thumbCache.get(k); setT({ ...out })
      }
    })()
    return () => { dead = true }
  }, [pal.join(), seed])
  return t
}
const LABELS = { scale: ['Zoom', [0.4, 3, 0.01], (v) => v.toFixed(2) + '×'], detail: ['Detail', [0, 1, 0.01], (v) => Math.round(v * 100) + '%'], warp: ['Distortion', [0, 1, 0.01], (v) => Math.round(v * 100) + '%'], soft: ['Softness', [0, 1, 0.01], (v) => Math.round(v * 100) + '%'], amp: ['Motion', [0, 1, 0.01], (v) => (v === 0 ? 'Still' : Math.round(v * 100) + '%')] }

export function LookPanel() {
  const { d, set } = useWall()
  const st = styleById(d.style), thumbs = useStyleThumbs(d.pal, d.seed)
  return (
    <div className="space-y-6">
      <div>
        <Label>Style</Label>
        <div className="grid grid-cols-3 gap-2.5">
          {STYLES.map((s, i) => {
            const on = s.id === d.style
            return (
              <motion.button key={s.id} type="button" onClick={() => set({ style: s.id, sub: 0 })} initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay: i * 0.025 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
                className="relative text-left rounded-2xl overflow-hidden border" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', boxShadow: on ? '0 0 0 2px var(--copper), 0 14px 24px -14px rgba(0,0,0,.5)' : 'var(--shadow)', background: 'var(--surface)' }}>
                <div className="aspect-[1.6] relative" style={{ background: 'var(--surface2)' }}>
                  <AnimatePresence>{thumbs[s.id] && <motion.img key={thumbs[s.id]} src={thumbs[s.id]} alt="" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="absolute inset-0 w-full h-full object-cover" draggable={false} />}</AnimatePresence>
                  {on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full grid place-items-center" style={{ background: 'var(--copper)', color: '#fff' }}><Ico n="check" s={12} w={2.6} /></motion.span>}
                </div>
                <div className="px-2.5 py-1.5"><div className="text-[12px] font-bold leading-tight">{s.name}</div><div className="text-[10.5px] leading-tight truncate" style={{ color: 'var(--muted)' }}>{s.blurb}</div></div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {st.uses.length > 0 && (
        <div className="space-y-4">
          <Label>Shape</Label>
          {st.subs && <Seg small value={d.sub} onChange={(v) => set({ sub: v })} options={st.subs.map((l, i) => [i, l])} />}
          {st.uses.filter((u) => u !== 'amp' && u !== 'sub').map((u) => { const [l, [a, b, s], f] = LABELS[u]; return <Slider key={u} label={l} min={a} max={b} step={s} value={d[u]} onChange={(v) => set({ [u]: v })} fmt={f} /> })}
          <Slider label="Rotation" min={0} max={360} step={1} value={d.angle} onChange={(v) => set({ angle: v })} fmt={(v) => v + '°'} />
          <div className="flex items-end gap-2">
            <div className="flex-1"><Slider label="Seed" hint="a different arrangement" min={1} max={99} step={1} value={d.seed} onChange={(v) => set({ seed: v })} fmt={(v) => '#' + v} /></div>
            <Btn small icon="dice" onClick={() => set({ seed: 1 + Math.floor(Math.random() * 98) })}>New</Btn>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Label>Motion</Label>
        {st.uses.includes('amp') ? <>
          <Slider label="Amount" min={0} max={1} step={0.01} value={d.amp} onChange={(v) => set({ amp: v })} fmt={LABELS.amp[2]} />
          <Slider label="Loop length" hint="seamless" min={4} max={40} step={1} value={d.loop} onChange={(v) => set({ loop: v })} fmt={(v) => v + ' s'} />
        </> : <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>This style is static.</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ colour ------------------------------------------------------------------ */
export function ColourPanel() {
  const { d, set, toast } = useWall()
  const [sel, setSel] = useState(0), [grp, setGrp] = useState('All'), [hk, setHk] = useState('analogous'), [src, setSrc] = useState(null)
  const fileRef = useRef(null)
  const pal = d.pal, i = Math.min(sel, pal.length - 1), cur = pal[i]
  const setPal = (p) => set({ pal: p.slice(0, 8) })
  const upd = (idx, hex) => setPal(pal.map((c, j) => (j === idx ? hex : c)))
  const move = (dir) => { const j = i + dir; if (j < 0 || j >= pal.length) return; const p = [...pal];[p[i], p[j]] = [p[j], p[i]]; setPal(p); setSel(j) }
  const onImg = (f) => { if (!f) return; const url = URL.createObjectURL(f), im = new Image(); im.onload = () => { const p = paletteFromImage(im, 5); if (p) { setPal(p); setSrc(url); toast('Palette picked from your photo') } }; im.src = url }
  return (
    <div className="space-y-6">
      <div>
        <Label right={<span className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{pal.length} / 8 colours</span>}>Your palette</Label>
        <div className="flex gap-1.5 h-[76px]">
          <AnimatePresence initial={false} mode="popLayout">
            {pal.map((c, j) => (
              <motion.button key={j} layout type="button" onClick={() => setSel(j)} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, flexGrow: j === i ? 2.2 : 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={SPRING} whileHover={{ y: -3 }}
                className="relative flex-1 rounded-2xl border border-line" style={{ background: c, boxShadow: j === i ? '0 0 0 2px var(--surface), 0 0 0 4px var(--copper)' : 'var(--shadow)' }}>
                <span className="absolute bottom-1.5 left-0 right-0 text-center mono text-[9.5px] font-bold" style={{ color: lumOf(c) > 0.45 ? '#14110F' : '#fff', opacity: j === i ? 0.9 : 0 }}>{c.toUpperCase()}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-3 flex items-center gap-2">
            <ColorDot value={cur} onChange={(h) => upd(i, h)} size={38} />
            <input className="input mono flex-1 min-w-0" value={cur.toUpperCase()} maxLength={7} onChange={(e) => { const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; if (/^#[0-9a-f]{6}$/i.test(v)) upd(i, v.toLowerCase()) }} />
            <Btn small icon="arrowl" onClick={() => move(-1)} disabled={i === 0} title="Move earlier" />
            <Btn small icon="arrowr" onClick={() => move(1)} disabled={i === pal.length - 1} title="Move later" />
            <Btn small icon="trash" onClick={() => { if (pal.length > 1) { setPal(pal.filter((_, j) => j !== i)); setSel(Math.max(0, i - 1)) } }} disabled={pal.length <= 1} title="Remove" />
          </motion.div>
        </AnimatePresence>
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn small icon="plus" disabled={pal.length >= 8} onClick={() => { const a = hexToLab(pal[pal.length - 1]), b = hexToLab(pal[0]); setPal([...pal, labToHex([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])]); setSel(pal.length) }}>Add</Btn>
          <Btn small icon="rev" onClick={() => setPal([...pal].reverse())}>Reverse</Btn>
          <Btn small icon="sort" onClick={() => setPal([...pal].sort((a, b) => lumOf(a) - lumOf(b)))}>Dark → light</Btn>
          <Btn small icon="dice" onClick={() => setPal([...pal].sort(() => Math.random() - 0.5))}>Shuffle</Btn>
        </div>
      </div>

      <div>
        <Label>Palette library</Label>
        <div className="mb-3 overflow-x-auto no-scrollbar"><Chips value={grp} onChange={setGrp} options={PALETTE_GROUPS.map((g) => [g, g])} /></div>
        <div className="grid grid-cols-2 gap-2.5">
          {PALETTES.filter((p) => grp === 'All' || p[1] === grp).map(([n, , cols], k) => {
            const on = cols.join() === pal.join()
            return (
              <motion.button key={n} type="button" onClick={() => setPal(cols)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(k, 12) * 0.02 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
                className="text-left rounded-2xl p-2 border" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)', boxShadow: on ? '0 0 0 2px var(--copper)' : 'var(--shadow)' }}>
                <span className="flex h-9 rounded-xl overflow-hidden">{cols.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</span>
                <span className="block text-[11.5px] font-semibold mt-1.5 px-0.5 truncate">{n}</span>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Make a palette</Label>
        <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Starts from the colour you selected above.</div>
        <Chips value={hk} onChange={setHk} options={HARMONIES} />
        <Btn small icon="wand" onClick={() => setPal(harmony(cur, hk, 5))}>Generate from {cur.toUpperCase()}</Btn>
        <div className="pt-1">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onImg(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-2xl border border-dashed border-line px-4 py-3 flex items-center gap-3 text-left" style={{ background: 'var(--surface2)' }}>
            {src ? <img src={src} alt="" className="w-12 h-12 rounded-xl object-cover" /> : <span className="w-12 h-12 rounded-xl grid place-items-center" style={{ background: 'var(--surface)', color: 'var(--copper)' }}><Ico n="image" s={22} /></span>}
            <span><span className="block text-[13px] font-bold">Pick colours from a photo</span><span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>Stays on your device — nothing is uploaded.</span></span>
          </button>
        </div>
      </div>
    </div>
  )
}
