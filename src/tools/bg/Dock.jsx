import { useRef } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, useMotionTemplate } from 'framer-motion'
import { Slider, Icon, SPRING } from '../studio/controls.jsx'
import { AnimatedNumber } from '../../components/ui.jsx'
import { fmtBytes } from '../../lib/utils.js'

const CHECKER = 'conic-gradient(#d9d3c6 25%, #f3efe6 0 50%, #d9d3c6 0 75%, #f3efe6 0) 0 0 / 14px 14px'

function Chip({ on, onClick, children }) {
  return (
    <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.9 }} onClick={onClick} className="relative px-3.5 py-1.5 rounded-full text-[12px] font-semibold border border-line whitespace-nowrap" style={{ color: on ? 'var(--bg)' : 'var(--muted)', background: 'var(--surface)' }}>
      <motion.span className="absolute inset-0 rounded-full" style={{ background: 'var(--ink)' }} initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.6 }} transition={SPRING} />
      <span className="relative">{children}</span>
    </motion.button>
  )
}

/** The "ticket": a raised, tilting preview card with a perforated stub — the opposite of flat. */
function Ticket({ c }) {
  const mx = useMotionValue(0.5), my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [9, -9]), { stiffness: 300, damping: 25 })
  const ry = useSpring(useTransform(mx, [0, 1], [-11, 11]), { stiffness: 300, damping: 25 })
  const gx = useTransform(mx, (v) => `${v * 100}%`), gy = useTransform(my, (v) => `${v * 100}%`)
  const shine = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,.55), transparent 55%)`
  const ref = useRef(null)
  const move = (e) => { const r = ref.current.getBoundingClientRect(); mx.set((e.clientX - r.left) / r.width); my.set((e.clientY - r.top) / r.height) }
  const leave = () => { mx.set(0.5); my.set(0.5) }
  const stats = c.stats
  return (
    <div style={{ perspective: 900 }}>
      <motion.div ref={ref} onPointerMove={move} onPointerLeave={leave} initial={{ opacity: 0, y: 30, rotateX: 18 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={SPRING}
        style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }} className="relative">
        {/* stacked sheets for depth */}
        <div className="absolute inset-x-3 -bottom-2 h-6 rounded-b-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', transform: 'translateZ(-24px)' }} />
        <div className="absolute inset-x-6 -bottom-4 h-6 rounded-b-2xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', opacity: 0.7, transform: 'translateZ(-40px)' }} />
        <div className="relative rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 0 rgba(255,255,255,.6) inset, 0 28px 50px -22px rgba(26,24,23,.55), 0 12px 24px -12px rgba(26,24,23,.28)' }}>
          <div className="h-1.5" style={{ background: 'linear-gradient(90deg, var(--copper), var(--accent), var(--copper))' }} />
          <div className="relative p-4" style={{ transform: 'translateZ(30px)' }}>
            <div className="relative rounded-xl overflow-hidden grid place-items-center h-[184px]" style={{ background: CHECKER, boxShadow: 'inset 0 2px 10px rgba(0,0,0,.12)' }}>
              {c.previewUrl ? (
                  <motion.img key={c.previewUrl} src={c.previewUrl} alt="Result preview" initial={{ opacity: 0.4, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}
                    className="absolute inset-0 w-full h-full object-contain p-2" style={{ filter: 'drop-shadow(0 8px 14px rgba(0,0,0,.25))' }} draggable={false} />
                ) : <div className="absolute inset-0 shimmer" />}
            </div>
          </div>
          {/* perforation */}
          <div className="relative h-5 flex items-center">
            <span className="absolute -left-2.5 w-5 h-5 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,.12)' }} />
            <span className="absolute -right-2.5 w-5 h-5 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,.12)' }} />
            <div className="mx-5 flex-1 border-t-2 border-dashed" style={{ borderColor: 'var(--border)' }} />
          </div>
          <div className="px-5 pt-2 pb-4 grid grid-cols-3 gap-2 text-center" style={{ transform: 'translateZ(18px)' }}>
            <div><div className="label">Size</div><div className="display font-semibold text-[17px] tabular-nums leading-tight mt-0.5"><AnimatedNumber value={c.outDims.w} />×<AnimatedNumber value={c.outDims.h} /></div></div>
            <div><div className="label">Format</div><div className="display font-semibold text-[17px] leading-tight mt-0.5 uppercase">{c.fmt === 'jpeg' ? 'JPG' : c.fmt}</div></div>
            <div><div className="label">File</div>
              <div className="display font-semibold text-[17px] leading-tight mt-0.5 tabular-nums h-[22px]">
                {c.computing ? <span className="inline-block w-12 h-4 rounded shimmer align-middle" /> : c.sizeBytes != null ? fmtBytes(c.sizeBytes) : '—'}
              </div>
            </div>
          </div>
          {stats && (
            <div className="mx-4 mb-4 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-[11.5px]" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)' }}>{stats.via || 'Cut-out'} · time</span>
              <span className="mono font-semibold tabular-nums">{(stats.ms / 1000).toFixed(1)} s</span>
            </div>
          )}
          <motion.div className="absolute inset-0 pointer-events-none" style={{ background: shine, mixBlendMode: 'soft-light' }} />
        </div>
      </motion.div>
    </div>
  )
}

/** Tactile download button: pressable "key" with a hard under-edge, sheen sweep and a success burst. */
function BigButton({ onClick, busy, saved, children, disabled }) {
  return (
    <div className="relative">
      <motion.button onClick={onClick} disabled={disabled || busy} whileHover={disabled ? {} : { y: -2 }} whileTap={disabled ? {} : { y: 5 }} transition={SPRING}
        className="relative w-full rounded-2xl overflow-hidden text-white font-bold text-[16px] py-4 flex items-center justify-center gap-2.5 btn-sheen"
        style={{ background: saved ? 'linear-gradient(180deg,#5aa88c,#3f8a70)' : 'linear-gradient(180deg, color-mix(in srgb, var(--copper) 88%, #fff), var(--copper))', boxShadow: saved ? '0 6px 0 #2f6b56, 0 18px 28px -10px rgba(47,107,86,.6)' : '0 6px 0 color-mix(in srgb, var(--copper) 62%, #000), 0 18px 28px -10px rgba(120,60,30,.55)', opacity: disabled ? 0.5 : 1 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={saved ? 's' : busy ? 'b' : 'd'} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-2.5">
            {saved ? <><motion.span initial={{ scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={SPRING}><Icon n="check" s={20} w={3} /></motion.span> Saved</> : busy ? <>
              <motion.span className="block w-4 h-4 rounded-full border-2 border-white/40" style={{ borderTopColor: '#fff' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} /> Rendering full resolution…</> : children}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {saved && [0, 1, 2].map((i) => (
          <motion.span key={i} className="absolute left-1/2 top-1/2 w-10 h-10 -ml-5 -mt-5 rounded-full border-2 pointer-events-none" style={{ borderColor: '#5aa88c' }}
            initial={{ scale: 0.4, opacity: 0.8 }} animate={{ scale: 5 + i * 1.6, opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 1.1, delay: i * 0.12, ease: 'easeOut' }} />
        ))}
      </AnimatePresence>
    </div>
  )
}

export function DownloadPanel({ c }) {
  return (
    <div className="space-y-6">
      <Ticket c={c} />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.08 }} className="space-y-4">
        <div>
          <div className="label mb-2">Format</div>
          <div className="flex gap-1.5 flex-wrap">
            <Chip on={c.fmt === 'png'} onClick={() => c.setFmt('png')}>PNG · transparent</Chip>
            <Chip on={c.fmt === 'webp'} onClick={() => c.setFmt('webp')}>WebP · small</Chip>
            <Chip on={c.fmt === 'jpeg'} onClick={() => c.setFmt('jpeg')}>JPG</Chip>
          </div>
          <AnimatePresence initial={false}>
            {c.fmt === 'jpeg' && c.bgType === 'transparent' && (
              <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="text-[11.5px] overflow-hidden" style={{ color: 'var(--copper)' }}>
                <span className="block pt-2">JPG can’t be transparent — it will be flattened on white. Pick a background or use PNG/WebP.</span>
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence initial={false}>
          {c.fmt !== 'png' && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="pt-1"><Slider label="Quality" value={c.quality} min={50} max={100} def={92} onChange={c.setQuality} suffix="%" /></div></motion.div>}
        </AnimatePresence>
        <div>
          <div className="label mb-2">Resolution</div>
          <div className="flex gap-1.5 flex-wrap">{[1, 0.5, 0.25].map((s) => <Chip key={s} on={c.scale === s} onClick={() => c.setScale(s)}>{s === 1 ? 'Original' : `${s * 100}%`}</Chip>)}</div>
          <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>For memory safety, source canvases and exports are capped at 8192 px on the long edge.</p>
        </div>
        <div>
          <div className="label mb-2">Framing</div>
          <div className="flex gap-1.5 flex-wrap">
            <Chip on={!c.fit.on} onClick={() => c.setFit({ on: false })}>Keep canvas</Chip>
            <Chip on={c.fit.on} onClick={() => c.setFit({ on: true })}>Fit to subject</Chip>
          </div>
          <AnimatePresence initial={false}>
            {c.fit.on && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="pt-3"><Slider label="Padding" value={c.fit.pad} min={0} max={40} def={8} onChange={(v) => c.setFit({ pad: v })} suffix="%" /></div></motion.div>}
          </AnimatePresence>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.14 }} className="space-y-3 pt-4 pb-5 sticky -bottom-5 -mx-6 px-6" style={{ background: 'var(--surface)', boxShadow: '0 -14px 16px -8px var(--surface)', zIndex: 5 }}>
        <BigButton onClick={c.onDownload} busy={c.saving} saved={c.justSaved} disabled={!c.ready}>
          <Icon n="download" s={20} w={2.2} /> Download {c.fmt === 'jpeg' ? 'JPG' : c.fmt.toUpperCase()}
        </BigButton>
        <div className="grid grid-cols-2 gap-2.5">
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} className="btn !py-2.5 text-[12.5px]" disabled={!c.ready} onClick={c.onCopy}><Icon n="copy" s={14} /> Copy image</motion.button>
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} className="btn !py-2.5 text-[12.5px]" disabled={c.doneCount < 2 || c.saving} onClick={c.onZip}><Icon n="layers" s={14} /> All as .zip{c.doneCount > 1 ? ` · ${c.doneCount}` : ''}</motion.button>
        </div>
      </motion.div>
    </div>
  )
}
