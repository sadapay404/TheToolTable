import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GALLERY, MOODS } from '../../lib/wall/presets.js'
import { fromGallery } from '../../lib/wall/design.js'
import { thumbURL } from '../../lib/wall/renderer.js'
import { styleById } from '../../lib/wall/shader.js'
import { Ico, Chips, Btn, Panel, SPRING, useWall } from './ui.jsx'

const cache = new Map()
export function useGalleryThumbs() {
  const [t, setT] = useState(() => Object.fromEntries(cache))
  useEffect(() => {
    let dead = false
    ;(async () => {
      for (const g of GALLERY) {
        if (cache.has(g.name)) continue
        cache.set(g.name, thumbURL(fromGallery(g), 320, 200, 0.7)); await new Promise((r) => setTimeout(r, 0))
        if (dead) return; setT(Object.fromEntries(cache))
      }
    })()
    return () => { dead = true }
  }, [])
  return t
}

export function Gallery() {
  const { d, apply, setView, toast } = useWall()
  const [mood, setMood] = useState('All'), thumbs = useGalleryThumbs()
  const list = GALLERY.filter((g) => mood === 'All' || g.mood === mood)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="display text-[26px] font-semibold leading-tight">Starting points</div><div className="text-[13px]" style={{ color: 'var(--muted)' }}>{GALLERY.length} hand-tuned looks. Pick one, then make it yours — your size and text stay as they are.</div></div>
        <Chips value={mood} onChange={setMood} options={MOODS.map((m) => [m, m])} small={false} />
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {list.map((g, i) => (
            <motion.button key={g.name} layout type="button" initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SPRING, delay: Math.min(i, 14) * 0.03 }} whileHover={{ y: -6 }} whileTap={{ scale: 0.97 }}
              onClick={() => { apply(fromGallery(g, d)); setView('studio'); toast(`Loaded “${g.name}”`) }} className="group text-left rounded-[22px] overflow-hidden border border-line" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              <div className="aspect-[1.6] relative" style={{ background: `linear-gradient(135deg, ${g.pal[0]}, ${g.pal[g.pal.length - 1]})` }}>
                <AnimatePresence>{thumbs[g.name] && <motion.img key="i" src={thumbs[g.name]} alt="" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" draggable={false} />}</AnimatePresence>
                <span className="absolute left-2.5 bottom-2.5 text-[10.5px] font-bold px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,.55)', color: '#fff', backdropFilter: 'blur(6px)' }}>Use this look</span>
              </div>
              <div className="px-3.5 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-[13.5px] font-bold truncate">{g.name}</div><div className="text-[11px]" style={{ color: 'var(--muted)' }}>{styleById(g.style).name} · {g.mood}</div></div>
                <span className="flex shrink-0 -space-x-1">{g.pal.slice(0, 4).map((c) => <i key={c} className="block w-3.5 h-3.5 rounded-full border border-white" style={{ background: c }} />)}</span>
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function Saved() {
  const { saved, openSaved, delSaved, renameSaved, dupSaved, setView } = useWall()
  const [edit, setEdit] = useState(null)
  if (!saved.length) return (
    <Panel className="text-center py-16">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="mx-auto w-20 h-20 rounded-3xl grid place-items-center mb-4" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><Ico n="heart" s={34} /></motion.div>
      <div className="display text-[24px] font-semibold">Nothing saved yet</div>
      <div className="text-[13.5px] mt-1.5 mb-5" style={{ color: 'var(--muted)' }}>Press “Save look” under the preview and it will live here — on this device only.</div>
      <Btn primary icon="wand" onClick={() => setView('studio')}>Back to the studio</Btn>
    </Panel>
  )
  return (
    <div className="space-y-5">
      <div><div className="display text-[26px] font-semibold leading-tight">Saved looks</div><div className="text-[13px]" style={{ color: 'var(--muted)' }}>{saved.length} on this device — nothing is uploaded.</div></div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {saved.map((s, i) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, y: 24, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ ...SPRING, delay: Math.min(i, 10) * 0.03 }} className="rounded-[22px] overflow-hidden border border-line" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
              <button type="button" onClick={() => openSaved(s)} className="block w-full aspect-[1.6] relative group" style={{ background: `linear-gradient(135deg, ${s.d.pal[0]}, ${s.d.pal[s.d.pal.length - 1]})` }}>{s.thumb && <img src={s.thumb} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />}</button>
              <div className="px-3 py-2.5">
                {edit === s.id ? <input aria-label="Saved design name" autoFocus maxLength={80} className="input w-full text-[13px]" defaultValue={s.name} onBlur={(e) => { renameSaved(s.id, e.target.value.trim() || s.name); setEdit(null) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
                  : <button type="button" onClick={() => setEdit(s.id)} className="text-[13.5px] font-bold truncate w-full text-left" title="Rename">{s.name}</button>}
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[11px]" style={{ color: 'var(--muted)' }}>{styleById(s.d.style).name} · {s.d.size.w}×{s.d.size.h}</span>
                  <span className="flex gap-1"><button type="button" onClick={() => dupSaved(s.id)} className="p-1.5 rounded-full hover:bg-black/5" title="Duplicate"><Ico n="copy" s={14} /></button><button type="button" onClick={() => delSaved(s.id)} className="p-1.5 rounded-full hover:bg-black/5" title="Delete"><Ico n="trash" s={14} /></button></span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
