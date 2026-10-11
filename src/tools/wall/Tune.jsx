import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SIZE_GROUPS } from '../../lib/wall/sizes.js'
import { DEFAULT_FX } from '../../lib/wall/design.js'
import { FONTS } from '../../lib/wall/textlayer.js'
import { Slider, Toggle, Chips, Btn, Seg, ColorDot, SPRING, useWall } from './ui.jsx'

const pct = (v) => Math.round(v * 100) + '%'
export function FinishPanel() {
  const { d, set } = useWall()
  const [g, setG] = useState('tone'), f = d.fx
  const fx = (p) => set({ fx: { ...f, ...p } })
  const reset = (...k) => fx(Object.fromEntries(k.map((x) => [x, DEFAULT_FX[x]])))
  return (
    <div className="space-y-5">
      <Seg small value={g} onChange={setG} options={[['tone', 'Tone'], ['texture', 'Texture'], ['light', 'Light'], ['fx', 'Effects']]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={g} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-4">
          {g === 'tone' && <>
            <Slider label="Hue shift" min={-180} max={180} step={1} value={f.hue} onChange={(v) => fx({ hue: v })} fmt={(v) => v + '°'} onReset={f.hue ? () => reset('hue') : null} />
            <Slider label="Saturation" min={0} max={2} step={0.01} value={f.sat} onChange={(v) => fx({ sat: v })} fmt={pct} onReset={f.sat !== 1 ? () => reset('sat') : null} />
            <Slider label="Brightness" min={-1} max={1} step={0.01} value={f.bri} onChange={(v) => fx({ bri: v })} fmt={(v) => (v > 0 ? '+' : '') + Math.round(v * 100)} onReset={f.bri ? () => reset('bri') : null} />
            <Slider label="Contrast" min={0.5} max={1.8} step={0.01} value={f.con} onChange={(v) => fx({ con: v })} fmt={pct} onReset={f.con !== 1 ? () => reset('con') : null} />
          </>}
          {g === 'texture' && <>
            <Slider label="Film grain" min={0} max={1} step={0.01} value={f.grain} onChange={(v) => fx({ grain: v })} fmt={pct} />
            <Slider label="Grain size" min={0.5} max={5} step={0.1} value={f.gsize} onChange={(v) => fx({ gsize: v })} fmt={(v) => v.toFixed(1) + '×'} />
            <Toggle on={f.mono} onChange={(v) => fx({ mono: v })} label="Monochrome grain" hint="Off gives a colourful, risograph-like speckle" />
            <div className="text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>Grain is resolution-independent — an 8K export looks exactly like the preview. It also removes banding in smooth gradients.</div>
          </>}
          {g === 'light' && <>
            <Slider label="Vignette" min={0} max={1} step={0.01} value={f.vig} onChange={(v) => fx({ vig: v })} fmt={pct} />
            <Slider label="Light leak" min={0} max={1} step={0.01} value={f.glow} onChange={(v) => fx({ glow: v })} fmt={pct} />
            {f.glow > 0 && <Slider label="Leak direction" min={0} max={360} step={1} value={f.gang} onChange={(v) => fx({ gang: v })} fmt={(v) => v + '°'} />}
            <Slider label="Text-safe shade" hint="darkens bottom or top" min={-1} max={1} step={0.01} value={f.shade} onChange={(v) => fx({ shade: v })} fmt={(v) => (v === 0 ? 'Off' : v > 0 ? 'Bottom ' + pct(v) : 'Top ' + pct(-v))} onReset={f.shade ? () => reset('shade') : null} />
          </>}
          {g === 'fx' && <>
            <div className="space-y-2"><div className="text-[13px] font-semibold">Symmetry</div>
              <Seg small value={d.sym.mode} onChange={(m) => set({ sym: { ...d.sym, mode: m } })} options={[[0, 'Off'], [1, 'Mirror'], [2, 'Quad'], [3, 'Kaleido']]} /></div>
            {d.sym.mode === 3 && <Slider label="Segments" min={3} max={16} step={1} value={d.sym.n} onChange={(v) => set({ sym: { ...d.sym, n: v } })} fmt={(v) => v} />}
            <Slider label="Pixelate" min={0} max={90} step={1} value={d.pixel} onChange={(v) => set({ pixel: v })} fmt={(v) => (v === 0 ? 'Off' : v + ' blocks')} />
            <Slider label="Posterize" min={0} max={16} step={1} value={f.post} onChange={(v) => fx({ post: v < 2 ? 0 : v })} fmt={(v) => (v < 2 ? 'Off' : v + ' levels')} />
          </>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ text ------------------------------------------------------------------ */
export function TextPanel() {
  const { d, set } = useWall()
  const t = d.text, up = (p) => set({ text: { ...t, ...p } })
  return (
    <div className="space-y-5">
      <Toggle on={t.on} onChange={(v) => up({ on: v })} label="Add text" hint="Headline and subtitle, baked into every export" />
      <AnimatePresence initial={false}>
        {t.on && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-5 pt-1">
              <div className="space-y-2">
                <textarea aria-label="Headline" className="input w-full" rows={2} value={t.title} placeholder="Headline" onChange={(e) => up({ title: e.target.value })} style={{ resize: 'none' }} />
                <input aria-label="Subtitle" className="input w-full" value={t.sub} placeholder="Subtitle (optional)" onChange={(e) => up({ sub: e.target.value })} />
              </div>
              <div><div className="text-[13px] font-semibold mb-2">Typeface</div>
                <Chips value={t.font} onChange={(v) => up({ font: v })} options={Object.entries(FONTS).map(([k, v]) => [k, v[0]])} /></div>
              <div className="flex items-center gap-3"><div className="flex-1"><div className="text-[13px] font-semibold mb-2">Weight</div><Chips value={t.weight} onChange={(v) => up({ weight: v })} options={[[400, 'Regular'], [600, 'Semibold'], [800, 'Bold']]} /></div>
                <div><div className="text-[13px] font-semibold mb-2">Italic</div><Chips value={t.italic} onChange={(v) => up({ italic: v })} options={[[false, 'Off'], [true, 'On']]} /></div></div>
              <Slider label="Size" min={2} max={30} step={0.5} value={t.size} onChange={(v) => up({ size: v })} fmt={(v) => v} />
              <Slider label="Letter spacing" min={-4} max={30} step={1} value={t.track} onChange={(v) => up({ track: v })} fmt={(v) => v} />
              <div>
                <div className="text-[13px] font-semibold mb-2">Colour</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Chips value={t.color === 'auto' ? 'auto' : t.color === '#ffffff' ? 'w' : t.color === '#14110f' ? 'b' : 'c'} onChange={(v) => up({ color: v === 'auto' ? 'auto' : v === 'w' ? '#ffffff' : v === 'b' ? '#14110f' : '#B4715A' })} options={[['auto', 'Auto contrast'], ['w', 'White'], ['b', 'Ink'], ['c', 'Custom']]} />
                  {!['auto', '#ffffff', '#14110f'].includes(t.color) && <ColorDot value={t.color} onChange={(c) => up({ color: c })} size={30} />}
                </div>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-4 items-start">
                <div><div className="text-[13px] font-semibold mb-2">Position</div>
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    {[0, 1, 2].flatMap((y) => [0, 1, 2].map((x) => { const on = t.ax === x && t.ay === y; return <motion.button key={`${x}${y}`} type="button" whileTap={{ scale: 0.85 }} onClick={() => up({ ax: x, ay: y })} className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: on ? 'var(--ink)' : 'var(--surface)', border: '1px solid var(--border)' }}><motion.i className="block rounded-full" animate={{ width: on ? 10 : 5, height: on ? 10 : 5, background: on ? 'var(--bg)' : 'var(--muted)' }} /></motion.button> }))}
                  </div></div>
                <div className="space-y-3 pt-6"><Slider label="Nudge X" min={-30} max={30} step={0.5} value={t.dx} onChange={(v) => up({ dx: v })} fmt={(v) => v + '%'} /><Slider label="Nudge Y" min={-30} max={30} step={0.5} value={t.dy} onChange={(v) => up({ dy: v })} fmt={(v) => v + '%'} /></div>
              </div>
              <Slider label="Opacity" min={0.1} max={1} step={0.01} value={t.opacity} onChange={(v) => up({ opacity: v })} fmt={pct} />
              <Slider label="Soft shadow" min={0} max={1} step={0.01} value={t.shadow} onChange={(v) => up({ shadow: v })} fmt={pct} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ canvas size ------------------------------------------------------------------ */
export function CanvasPanel() {
  const { d, set } = useWall()
  const [grp, setGrp] = useState(() => SIZE_GROUPS.find((g) => g[1].some((s) => s[0] === d.size.name))?.[0] || 'Desktop')
  const list = SIZE_GROUPS.find((g) => g[0] === grp)[1], sz = d.size
  const mp = (sz.w * sz.h) / 1e6
  const pick = (n, w, h) => set({ size: { name: n, w, h } })
  const setWH = (w, h) => set({ size: { name: 'Custom', w: Math.max(16, Math.min(16384, w || 16)), h: Math.max(16, Math.min(16384, h || 16)) } })
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto no-scrollbar"><Chips value={grp} onChange={setGrp} options={[...SIZE_GROUPS.map((g) => [g[0], g[0]]), ['Custom', 'Custom']]} /></div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={grp} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          {grp !== 'Custom' ? (
            <div className="grid grid-cols-2 gap-2.5">
              {list.map(([n, w, h], i) => {
                const on = sz.name === n && sz.w === w && sz.h === h, a = w / h, bw = a >= 1 ? 34 : 34 * a, bh = a >= 1 ? 34 / a : 34
                return (
                  <motion.button key={n} type="button" onClick={() => pick(n, w, h)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.025 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.96 }}
                    className="rounded-2xl border p-2.5 flex items-center gap-2.5 text-left" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', boxShadow: on ? '0 0 0 2px var(--copper)' : 'var(--shadow)', background: 'var(--surface)' }}>
                    <span className="w-10 h-10 grid place-items-center shrink-0"><motion.i className="block rounded-[4px]" animate={{ width: Math.max(6, bw), height: Math.max(6, bh), background: on ? 'var(--copper)' : 'var(--border)' }} transition={SPRING} /></span>
                    <span className="min-w-0"><span className="block text-[12px] font-bold leading-tight truncate">{n}</span><span className="block mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{w} × {h}</span></span>
                  </motion.button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <label className="block"><span className="text-[12px] font-semibold">Width</span><input type="number" className="input w-full mono" value={sz.w} min={16} max={16384} onChange={(e) => setWH(+e.target.value, sz.h)} /></label>
                <span className="pb-3 text-[13px]" style={{ color: 'var(--muted)' }}>×</span>
                <label className="block"><span className="text-[12px] font-semibold">Height</span><input type="number" className="input w-full mono" value={sz.h} min={16} max={16384} onChange={(e) => setWH(sz.w, +e.target.value)} /></label>
              </div>
              <Btn small icon="screen" onClick={() => { const r = window.devicePixelRatio || 1; pick('This screen', Math.round(screen.width * r), Math.round(screen.height * r)) }}>Match this screen</Btn>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div><div className="mono text-[15px] font-bold">{sz.w} × {sz.h}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{mp.toFixed(1)} megapixels · {(sz.w / sz.h).toFixed(2)}:1{sz.name !== 'Custom' ? ' · ' + sz.name : ''}</div></div>
        <Btn small icon="swap" onClick={() => set({ size: { ...sz, w: sz.h, h: sz.w } })} title="Swap portrait / landscape">Rotate</Btn>
      </div>
    </div>
  )
}
