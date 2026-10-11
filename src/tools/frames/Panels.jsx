import { motion, AnimatePresence } from 'framer-motion'
import { Icon, Slider, SPRING } from '../studio/controls.jsx'
import { AnimatedNumber } from '../../components/ui.jsx'
import { TimeField, clock } from '../../components/RangeTrack.jsx'
import { fmtBytes } from '../../lib/utils.js'
import { tc, gifPlan, frameSeriesPlan } from '../../lib/frames.js'

export function Chip({ on, onClick, children, disabled }) {
  return (
    <motion.button type="button" disabled={disabled} whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={onClick}
      className="relative min-h-9 px-3.5 py-1.5 rounded-full text-[12px] font-medium border border-line whitespace-nowrap" style={{ color: on ? 'var(--on-primary)' : 'var(--ink)', background: 'var(--surface)', opacity: disabled ? 0.5 : 1 }}>
      <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--primary)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }} transition={SPRING} />
      <span className="relative">{children}</span>
    </motion.button>
  )
}

export function Switch({ on, onChange, label, hint, disabled = false }) {
  return (
    <button type="button" disabled={disabled} className="flex items-center gap-3 w-full text-left disabled:opacity-50" onClick={() => onChange(!on)}>
      <span className="relative w-11 h-6 rounded-full border border-line shrink-0" style={{ background: on ? 'var(--copper)' : 'var(--surface2)' }}>
        <motion.span className="absolute top-[2px] w-[18px] h-[18px] rounded-full" style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.35)' }} initial={false} animate={{ left: on ? 22 : 3 }} transition={SPRING} />
      </span>
      <span><span className="block text-[13px] font-semibold">{label}</span>{hint && <span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{hint}</span>}</span>
    </button>
  )
}

const Block = ({ i = 0, children, className = '' }) => (
  <motion.div className={className} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.04 + i * 0.06 }}>{children}</motion.div>
)
const Label = ({ children }) => <div className="eyebrow mb-2.5">{children}</div>

function Bar({ value, label, sub }) {
  return (
    <div className="rounded-xl px-3.5 py-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex justify-between text-[11.5px] font-semibold mb-2"><span>{label}</span><span className="mono tabular-nums"><AnimatedNumber value={value * 100} />%</span></div>
      <div className="h-[7px] rounded-full overflow-hidden relative" style={{ background: 'color-mix(in srgb, var(--ink) 10%, transparent)' }}>
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: 'var(--copper)' }} initial={false} animate={{ width: `${Math.max(3, value * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }}><span className="absolute inset-0 stripes" /></motion.div>
      </div>
      {sub && <div className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

function Result({ r, onSave, onClear, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={SPRING}
      className="card-raised rounded-2xl p-3.5 flex items-center gap-3">
      {children}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[12.5px] font-bold truncate">{r.name}</div>
        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>{r.note} · {fmtBytes(r.blob.size)}</div>
      </div>
      <motion.button whileTap={{ scale: 0.92 }} whileHover={{ y: -2 }} className="btn btn-primary !py-2 !px-3 text-[12px]" onClick={onSave}><Icon n="download" s={14} w={2.2} /> Save</motion.button>
      <button aria-label="Dismiss" className="w-6 h-6 grid place-items-center rounded-full" style={{ color: 'var(--muted)' }} onClick={onClear}><Icon n="trash" s={13} /></button>
    </motion.div>
  )
}

/* =============================================== SNAPSHOT =============================================== */
export function SnapshotPanel({ c }) {
  const { cfg, set, meta, t, fps, start, end } = c
  const every = cfg.count > 1 ? (end - start) / (cfg.count - 1) : 0
  const seriesPlan = frameSeriesPlan(meta.w, meta.h, cfg.count)
  return (
    <div className="p-5 space-y-6">
      <Block i={0}>
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="flex-1 min-w-0">
            <div className="label">Current frame</div>
            <div className="display font-semibold text-[26px] leading-none mt-1 tabular-nums">{tc(Math.floor(t * fps + 1e-6) / fps)}</div>
            <div className="text-[11.5px] mt-1.5 mono" style={{ color: 'var(--muted)' }}>frame {Math.round(t * fps).toLocaleString()} · {meta.w}×{meta.h} native</div>
          </div>
          <span className="w-12 h-12 rounded-2xl grid place-items-center" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)', color: 'var(--copper)' }}><Icon n="camera" s={22} /></span>
        </div>
      </Block>

      <Block i={1}>
        <Label>Format</Label>
        <div className="flex gap-2 flex-wrap">
          <Chip disabled={c.jobBusy} on={cfg.fmt === 'png'} onClick={() => set({ fmt: 'png' })}>PNG · lossless</Chip>
          <Chip disabled={c.jobBusy} on={cfg.fmt === 'jpg'} onClick={() => set({ fmt: 'jpg' })}>JPG · quality 1.0</Chip>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <motion.button disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="btn btn-primary btn-sheen !py-3 col-span-2 text-[13.5px]" onClick={c.onSnap}><Icon n="camera" s={16} w={2} /> Save this frame <span className="kbd !bg-transparent !border-white/40 !text-white/80 ml-1">S</span></motion.button>
          <motion.button disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="btn text-[12.5px]" onClick={c.onCopy}><Icon n="copy" s={14} w={2} /> Copy image</motion.button>
          <motion.button disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} className="btn text-[12.5px]" onClick={c.onTray}><Icon n="plus" s={14} w={2.2} /> Add to tray</motion.button>
        </div>
      </Block>

      <Block i={2}>
        <Label>Frame series</Label>
        <div className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <Slider disabled={c.jobBusy} label="Frames to extract" value={cfg.count} min={2} max={120} step={1} def={12} onChange={(v) => set({ count: v })} />
          <div className="text-[11.5px] leading-snug" style={{ color: 'var(--muted)' }}>
            <b style={{ color: 'var(--ink)' }}><AnimatedNumber value={cfg.count} /> {cfg.fmt.toUpperCase()}s</b> spread evenly across the selection ({clock(start)} → {clock(end)}), one every <span className="mono">{every.toFixed(2)} s</span>. ZIP frames are {seriesPlan.w}×{seriesPlan.h}{seriesPlan.capped ? ' (scaled to stay within a safe memory budget)' : ''}.
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {c.series.busy ? (
              <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Bar value={c.series.prog} label="Extracting frames" /></motion.div>
            ) : c.series.result ? (
              <Result key="result" r={c.series.result} onSave={c.onSaveSeries} onClear={c.onClearSeries}><span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface)', color: 'var(--primary)' }}><Icon n="zip" s={19} /></span></Result>
            ) : (
              <motion.button key="g" disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="btn w-full text-[12.5px]" onClick={c.onSeries}><Icon n="zip" s={15} /> Export {cfg.count} frames as ZIP</motion.button>
            )}
          </AnimatePresence>
        </div>
      </Block>
    </div>
  )
}

/* =============================================== TRIM =============================================== */
export function TrimPanel({ c }) {
  const { start, end, t, fps, duration, onRange, trim } = c
  const len = end - start
  return (
    <div className="p-5 space-y-6">
      <Block i={0}>
        <div className="rounded-2xl p-4 text-center" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="label">Selection</div>
          <div className="display font-semibold text-[40px] leading-none mt-1 tabular-nums"><AnimatedNumber value={len} format={(n) => n.toFixed(2)} /><span className="text-[18px] ml-1" style={{ color: 'var(--muted)' }}>s</span></div>
          <div className="text-[11.5px] mt-2 mono" style={{ color: 'var(--muted)' }}><AnimatedNumber value={Math.round(len * fps)} /> frames · {Math.round((len / duration) * 100)}% of the video</div>
        </div>
      </Block>

      <Block i={1}>
        <Label>In and out points</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <TimeField label="In" value={start} disabled={c.jobBusy} onCommit={(v) => onRange(Math.min(v, end - Math.min(1 / fps, duration)), end)} />
            <motion.button disabled={c.jobBusy} whileTap={{ scale: 0.94 }} whileHover={{ y: -2 }} className="btn w-full !py-1.5 mt-2 text-[11.5px]" onClick={() => onRange(Math.min(t, end - Math.min(1 / fps, duration)), end)}><Icon n="flagIn" s={13} w={2} /> Set to playhead <span className="kbd ml-1">I</span></motion.button>
          </div>
          <div>
            <TimeField label="Out" value={end} disabled={c.jobBusy} onCommit={(v) => onRange(start, Math.max(v, start + Math.min(1 / fps, duration)))} />
            <motion.button disabled={c.jobBusy} whileTap={{ scale: 0.94 }} whileHover={{ y: -2 }} className="btn w-full !py-1.5 mt-2 text-[11.5px]" onClick={() => onRange(start, Math.max(t, start + Math.min(1 / fps, duration)))}><Icon n="flagIn" s={13} w={2} /> Set to playhead <span className="kbd ml-1">O</span></motion.button>
          </div>
        </div>
        <button disabled={c.jobBusy} className="text-[11.5px] font-semibold underline mt-3 disabled:opacity-50" style={{ color: 'var(--muted)' }} onClick={() => onRange(0, duration)}>Select the whole video</button>
      </Block>

      <Block i={2}>
        <div className="rounded-2xl p-4 text-[12px] leading-relaxed flex gap-3" style={{ background: 'color-mix(in srgb, var(--copper) 8%, var(--surface))', border: '1px solid color-mix(in srgb, var(--copper) 30%, var(--border))' }}>
          <span className="mt-0.5 shrink-0" style={{ color: 'var(--copper)' }}><Icon n="lock" s={16} /></span>
          <span><b>Lossless stream copy.</b> The video and audio are cut, never re-encoded, so quality and file format stay identical. Cuts snap to the nearest keyframe, so the first frame can land a few frames early.</span>
        </div>
      </Block>

      <Block i={3} className="space-y-3">
        <AnimatePresence mode="wait" initial={false}>
          {trim.busy ? (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Bar value={trim.prog} label={trim.phase} sub={trim.phase.startsWith('Loading') ? 'The bundled WASM engine is loading; no separate engine install is needed.' : undefined} /></motion.div>
          ) : (
            <motion.button key="g" disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="btn btn-primary btn-sheen w-full !py-3 text-[13.5px]" onClick={c.onTrim}><Icon n="scissors" s={16} w={2} /> Trim selection</motion.button>
          )}
        </AnimatePresence>
        {trim.error && <div className="text-[12px] font-semibold rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(208,72,65,.1)', color: '#B8493F' }}>{trim.error}</div>}
        <AnimatePresence>
          {trim.result && <Result r={trim.result} onSave={c.onSaveTrim} onClear={c.onClearTrim}><span className="w-10 h-10 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Icon n="film" s={19} /></span></Result>}
        </AnimatePresence>
      </Block>
    </div>
  )
}

/* =============================================== GIF =============================================== */
export function GifPanel({ c }) {
  const { cfg, set, start, end, gif } = c
  const plan = gifPlan(start, end, cfg.gifFps, cfg.gifW, c.meta.w / c.meta.h)
  const previewRef = c.gifCanvasRef
  const h = plan.h
  return (
    <div className="p-5 space-y-6">
      <Block i={0}>
        <div className="relative rounded-2xl overflow-hidden grid place-items-center" style={{ background: 'conic-gradient(#d9d3c6 25%, #f3efe6 0 50%, #d9d3c6 0 75%, #f3efe6 0) 0 0 / 14px 14px', aspectRatio: `${c.meta.w} / ${c.meta.h}`, maxHeight: 190, margin: '0 auto', boxShadow: '0 18px 30px -18px rgba(0,0,0,.55), 0 0 0 1px var(--border)' }}>
          <canvas ref={previewRef} className="absolute inset-0 w-full h-full" style={{ display: gif.busy ? 'block' : 'none' }} />
          {!gif.busy && gif.result && <motion.img key={gif.result.url} src={gif.result.url} alt="GIF preview" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 w-full h-full object-contain" />}
          {!gif.busy && !gif.result && <div className="text-center px-4 relative"><div className="text-[12px] font-semibold">Your GIF appears here</div><div className="text-[11px] mt-0.5 mono" style={{ color: 'var(--muted)' }}>{plan.w}×{h}</div></div>}
        </div>
      </Block>

      <Block i={1} className="space-y-4">
        <Label>Size and speed</Label>
        <div className="flex gap-2 flex-wrap">
          {[320, 480, 720, 1080].map((w) => <Chip key={w} disabled={c.jobBusy} on={cfg.gifW === w} onClick={() => set({ gifW: w })}>{w}px</Chip>)}
        </div>
        <Slider disabled={c.jobBusy} label="Width" value={cfg.gifW} min={160} max={1080} step={40} def={480} onChange={(v) => set({ gifW: v })} suffix="px" />
        <Slider disabled={c.jobBusy} label="Frame rate" value={cfg.gifFps} min={4} max={30} step={1} def={12} onChange={(v) => set({ gifFps: v })} suffix=" fps" />
        <Switch disabled={c.jobBusy} on={cfg.gifLoop} onChange={(v) => set({ gifLoop: v })} label="Loop forever" hint="Off plays through once" />
      </Block>

      <Block i={2}>
        <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div>
            <div className="label">From the selection</div>
            <div className="display font-semibold text-[22px] leading-tight tabular-nums"><AnimatedNumber value={plan.frames} /> frames</div>
          </div>
          <div className="text-right text-[11.5px] mono" style={{ color: 'var(--muted)' }}>{plan.seconds.toFixed(1)} s<br />{clock(start)} → {clock(end)}</div>
        </div>
        {plan.capped && <div className="text-[11.5px] mt-2 font-semibold space-y-1" style={{ color: 'var(--accent)' }}>
          {plan.frames < plan.wanted && <div>The frame and pixel limits keep GIF encoding memory-safe; only the first {plan.seconds.toFixed(1)} s is used. Lower width or frame rate to include more of the selection.</div>}
          {plan.scaled && <div>The GIF canvas is scaled to {plan.w}×{plan.h} to stay within safe browser limits.</div>}
        </div>}
      </Block>

      <Block i={3} className="space-y-3">
        <AnimatePresence mode="wait" initial={false}>
          {gif.busy ? (
            <motion.div key="b" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Bar value={gif.prog} label="Encoding GIF" sub={`Frame ${gif.n} of ${gif.total}`} /></motion.div>
          ) : (
            <motion.button key="g" disabled={c.jobBusy} whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="btn btn-primary btn-sheen w-full !py-3 text-[13.5px]" onClick={c.onGif}><Icon n="gif" s={16} w={2} /> Make GIF</motion.button>
          )}
        </AnimatePresence>
        {gif.error && <div className="text-[12px] font-semibold rounded-xl px-3.5 py-2.5" style={{ background: 'rgba(208,72,65,.1)', color: '#B8493F' }}>{gif.error}</div>}
        <AnimatePresence>
          {gif.result && !gif.busy && <Result r={gif.result} onSave={c.onSaveGif} onClear={c.onClearGif}><img src={gif.result.url} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0" /></Result>}
        </AnimatePresence>
      </Block>
    </div>
  )
}
