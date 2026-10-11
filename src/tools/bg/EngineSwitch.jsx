import { useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Icon } from '../studio/controls.jsx'
import { AnimatedNumber } from '../../components/ui.jsx'
import { fmtBytes } from '../../lib/utils.js'
import { usePerf } from '../../lib/perf.js'
import { TIERS, MODEL_BYTES, setEngine, retry, cachedSet, clearModelCache, planFor } from '../../lib/bg/engine.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 25 }
const mb = (b) => (b / 1e6).toFixed(b > 1e8 ? 0 : 1)

/** Human status for the active engine. */
export function engineLine(eng) {
  const online = eng.mode === 'online'
  if (eng.error) return eng.error
  if (eng.ready) return online ? `Ready · ${TIERS[eng.tier].model} · ${eng.backend === 'webgpu' ? 'on your GPU' : 'on your CPU'}` : `Ready · bundled ${fmtBytes(MODEL_BYTES)} · runs offline`
  if (!online) return eng.phase === 'model' ? `Loading bundled model… ${Math.round(eng.value * 100)}%` : eng.phase === 'compile' ? 'Warming up…' : 'Starting engine…'
  if (eng.phase === 'model') return eng.fromCache ? 'Opening the cached model…' : `Downloading ${TIERS[eng.tier].model} · ${mb(eng.got)} of ${mb(eng.total)} MB`
  if (eng.phase === 'compile') return eng.backend === 'wasm' || eng.plan?.ep === 'wasm' ? 'Preparing the model for your CPU…' : 'Compiling GPU shaders… (first run takes a moment)'
  return 'Connecting…'
}

export function useCached(deps) {
  const [c, setC] = useState({})
  const refresh = () => cachedSet().then(setC)
  useEffect(() => { refresh() }, deps) // eslint-disable-line
  return [c, refresh]
}

export function EngineBar({ eng }) {
  const pct = eng.ready ? 1 : eng.phase === 'compile' ? 1 : eng.value || 0
  const busy = !eng.ready && !eng.error
  return (
    <div className="h-[6px] rounded-full overflow-hidden relative" style={{ background: 'color-mix(in srgb, var(--ink) 10%, transparent)' }}>
      <motion.div className="absolute inset-y-0 left-0 rounded-full" initial={false} animate={{ width: `${Math.max(3, pct * 100)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} style={{ background: eng.error ? '#D04841' : eng.ready ? '#4E937A' : 'var(--copper)' }}>
        {busy && <span className="absolute inset-0 stripes" />}
      </motion.div>
    </div>
  )
}

function Dot({ eng }) {
  const perfNow = usePerf()
  const reduceMotion = useReducedMotion() || perfNow.level === 'lite'
  return <motion.span className="w-2.5 h-2.5 rounded-full shrink-0" animate={reduceMotion ? { scale: 1, opacity: 1 } : { scale: eng.ready ? [1, 1.35, 1] : [1, 0.7, 1], opacity: [1, 0.6, 1] }} transition={reduceMotion ? { duration: 0 } : { repeat: Infinity, duration: 1.6 }} style={{ background: eng.error ? '#D04841' : eng.ready ? '#4E937A' : 'var(--accent)' }} />
}

/* ---------------------------------- tier picker ---------------------------------- */
function TierPicker({ eng, cached, compact }) {
  return (
    <div className={`grid ${compact ? 'gap-2' : 'sm:grid-cols-2 gap-3'}`}>
      {Object.values(TIERS).map((t) => {
        const plan = planFor(t.id, eng.gpu)
        const off = !plan
        const on = eng.tier === t.id
        const size = plan ? plan.mb : t.gpuMB
        return (
          <motion.button key={t.id} type="button" disabled={off} whileHover={off ? undefined : { y: -3 }} whileTap={off ? undefined : { scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); setEngine('online', t.id) }}
            className="relative text-left rounded-2xl px-4 py-3 border-2 transition-colors"
            style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 9%, var(--surface))' : 'var(--surface)', opacity: off ? 0.5 : 1, cursor: off ? 'not-allowed' : 'pointer' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="display font-semibold text-[17px] leading-none">{t.name}</span>
              <span className="text-[10.5px] font-bold tabular-nums px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>{cached[t.id] ? 'Cached' : `${size} MB`}</span>
            </div>
            <div className="text-[11.5px] font-semibold mt-1.5">{t.model}</div>
            {!compact && <div className="text-[11.5px] mt-1 leading-snug" style={{ color: 'var(--muted)' }}>{t.blurb}</div>}
            {off && <div className="text-[10.5px] mt-1.5 font-semibold" style={{ color: '#B8493F' }}>Needs WebGPU — not available here</div>}
          </motion.button>
        )
      })}
    </div>
  )
}

/* ---------------------------------- hero (empty state) ---------------------------------- */
function EngineCard({ id, icon, title, sub, bullets, online }) {
    const on = (id === 'online') === online
    return (
      <motion.button type="button" whileHover={{ y: -4 }} whileTap={{ scale: 0.985 }} onClick={(e) => { e.stopPropagation(); if (!on) setEngine(id) }}
        className="relative text-left rounded-2xl p-5 border-2 flex-1 min-w-[230px] overflow-hidden flex flex-col justify-start items-stretch"
        style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 8%, var(--surface))' : 'var(--surface)', boxShadow: on ? '0 14px 26px -16px color-mix(in srgb, var(--copper) 70%, transparent)' : 'var(--shadow)' }}>
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: on ? 'var(--copper)' : 'var(--surface2)', color: on ? '#fff' : 'var(--ink)' }}><Icon n={icon} s={19} /></span>
          <div className="leading-tight">
            <div className="display font-semibold text-[18px]">{title}</div>
            <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{sub}</div>
          </div>
          <span className="ml-auto w-5 h-5 rounded-full border-2 grid place-items-center" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)' }}>
            <motion.span className="block w-2.5 h-2.5 rounded-full" initial={false} animate={{ scale: on ? 1 : 0 }} transition={SPRING} style={{ background: 'var(--copper)' }} />
          </span>
        </div>
        <ul className="mt-3.5 space-y-1.5 text-[12px]" style={{ color: 'var(--muted)' }}>
          {bullets.map((b) => <li key={b} className="flex gap-2"><span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--copper)' }} />{b}</li>)}
        </ul>
      </motion.button>
    )
  }

export function EngineChooser({ eng }) {
  const [cached, refresh] = useCached([eng.ready, eng.mode, eng.tier])
  const online = eng.mode === 'online'
  return (
    <div className="mt-6 text-left" onClick={(e) => e.stopPropagation()}>
      <div className="eyebrow text-center mb-3">Cut-out engine</div>
      <div className="flex flex-wrap gap-4 justify-center max-w-[760px] mx-auto">
        <EngineCard online={online} id="offline" icon="lock" title="Offline" sub="Bundled · instant · default" bullets={[`Ships inside the site (${mb(MODEL_BYTES)} MB), nothing to download`, 'Works with no internet at all', 'Great for products, people and logos']} />
        <EngineCard online={online} id="online" icon="globe" title="Online" sub="BiRefNet · state-of-the-art" bullets={[`Downloads a far stronger model once, then caches it ${isTauri() ? 'on this device' : 'in this browser'}`, 'Hair, fur, glass and fine edges come out cleaner', 'Photos still never leave your device']} />
      </div>
      <AnimatePresence initial={false}>
        {online && (
          <motion.div key="tiers" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={SPRING} className="overflow-hidden max-w-[760px] mx-auto">
            <div className="pt-4"><TierPicker eng={eng} cached={cached} /></div>
          </motion.div>
        )}
      </AnimatePresence>
      <StatusStrip eng={eng} onCleared={refresh} />
    </div>
  )
}

/** The little status row with progress and the cache controls. */
function StatusStrip({ eng, onCleared }) {
  const online = eng.mode === 'online'
  const busy = !eng.ready && !eng.error
  return (
    <motion.div layout className="mt-4 max-w-[760px] mx-auto rounded-2xl px-4 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
      <div className="flex items-center gap-2.5 text-[12.5px] font-semibold">
        <Dot eng={eng} />
        <span className="min-w-0 break-words">{engineLine(eng)}</span>
        {eng.error && <button className="ml-auto underline text-[12px] shrink-0" onClick={() => retry().catch(() => {})}>Retry</button>}
        {eng.error && online && <button className="underline text-[12px] shrink-0" onClick={() => setEngine('offline')}>Use Offline</button>}
        {!eng.error && online && eng.ready && <CacheButton onCleared={onCleared} />}
      </div>
      {online && eng.note && <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>{eng.note}</div>}
      {online && busy && <div className="mt-2.5"><EngineBar eng={eng} /></div>}
      {online && busy && eng.phase === 'model' && !eng.fromCache && <div className="mt-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>One-time download · saved {isTauri() ? 'in app storage on this device' : 'in this browser'} so next time it opens instantly, even offline.</div>}
    </motion.div>
  )
}

function CacheButton({ onCleared }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className="ml-auto text-[11.5px] font-semibold underline shrink-0" style={{ color: 'var(--muted)' }} disabled={busy}
      onClick={async () => { setBusy(true); await clearModelCache(); setBusy(false); onCleared?.() }}>Remove downloaded model</button>
  )
}

/* ---------------------------------- compact pill (workbench) ---------------------------------- */
export function EnginePill({ eng, canRedo, onRedo }) {
  const [open, setOpen] = useState(false)
  const [cached, refresh] = useCached([eng.ready, eng.mode, eng.tier, open])
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', h); return () => document.removeEventListener('pointerdown', h)
  }, [open])
  const online = eng.mode === 'online'
  const busy = !eng.ready && !eng.error
  return (
    <div ref={ref} className="relative pointer-events-auto">
      <div className="flex items-center gap-0.5 p-1 rounded-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        {[['offline', 'Offline'], ['online', 'Online']].map(([k, l]) => {
          const on = (k === 'online') === online
          return (
            <button key={k} onClick={() => { if (!on) setEngine(k) }} className="relative px-3 py-1.5 rounded-full text-[12px] font-bold flex items-center gap-1.5" style={{ color: on ? 'var(--bg)' : 'var(--muted)' }}>
              <motion.span className="absolute inset-0 rounded-full" initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.8 }} transition={SPRING} style={{ background: 'var(--ink)' }} />
              <span className="relative flex items-center gap-1.5"><Icon n={k === 'online' ? 'globe' : 'lock'} s={12} w={2.2} />{l}</span>
            </button>
          )
        })}
        <button onClick={() => setOpen((o) => !o)} aria-label="Engine settings" className="relative w-8 h-8 rounded-full grid place-items-center" style={{ color: 'var(--muted)' }}>
          {busy ? <motion.span className="block w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: 'rgba(0,0,0,.15)', borderTopColor: 'var(--copper)' }} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} /> : <Dot eng={eng} />}
        </button>
      </div>
      {online && busy && eng.phase === 'model' && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 top-full mt-2 w-[250px] rounded-xl px-3 py-2 text-[11.5px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          <div className="font-semibold mb-1.5 tabular-nums">{engineLine(eng)}</div>
          <EngineBar eng={eng} />
        </motion.div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={SPRING}
            className="absolute right-0 top-full mt-2 w-[340px] rounded-2xl p-4 z-40 origin-top-right" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="eyebrow mb-2">Cut-out engine</div>
            <div className="flex items-start gap-2.5 text-[12.5px]">
              <Dot eng={eng} /><span className="font-semibold leading-snug break-words">{engineLine(eng)}</span>
            </div>
            {!eng.ready && !eng.error && online && <div className="mt-2.5"><EngineBar eng={eng} /></div>}
            {online ? (
              <>
                <div className="mt-3"><TierPicker eng={eng} cached={cached} compact /></div>
                <div className="text-[11px] mt-3 leading-snug" style={{ color: 'var(--muted)' }}>BiRefNet is MIT-licensed. The weights download once and are cached {isTauri() ? 'on this device' : 'in this browser'}; your photos are never uploaded.</div>
                {eng.note && <div className="text-[11px] mt-1.5 font-semibold" style={{ color: 'var(--accent)' }}>{eng.note}</div>}
              </>
            ) : (
              <div className="text-[11.5px] mt-3 leading-snug" style={{ color: 'var(--muted)' }}>The bundled IS-Net model ({mb(MODEL_BYTES)} MB) runs entirely inside the site — no internet needed. Switch to Online for hair-level detail.</div>
            )}
            <div className="flex flex-wrap gap-2 mt-3.5">
              {canRedo && <motion.button whileTap={{ scale: 0.95 }} className="btn btn-primary !py-2 !px-3 text-[12px]" disabled={!!eng.error} onClick={() => { setOpen(false); onRedo?.() }}>Redo this photo with {online ? `${TIERS[eng.tier].name}` : 'Offline'}</motion.button>}
              {eng.error && <button className="btn !py-2 !px-3 text-[12px]" onClick={() => retry().catch(() => {})}>Retry</button>}
              {online && (cached.pro || cached.max) && <button className="btn !py-2 !px-3 text-[12px]" onClick={async () => { await clearModelCache(); refresh() }}>Remove downloaded model</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Animated MB counter used in hero stats. */
export function MB({ v }) { return <AnimatedNumber value={v} /> }
