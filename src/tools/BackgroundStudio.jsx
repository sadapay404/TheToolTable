import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { normalize, randomDesign } from '../lib/wall/design.js'
import { thumbURL } from '../lib/wall/renderer.js'
import { recentAction } from '../lib/utils.js'
import { WallCtx, Ico, Btn, Chips, Toast, Panel, SPRING } from './wall/ui.jsx'
import Stage from './wall/Stage.jsx'
import { LookPanel, ColourPanel } from './wall/Look.jsx'
import { FinishPanel, TextPanel, CanvasPanel } from './wall/Tune.jsx'
import { ExportPanel } from './wall/Export.jsx'
import { Gallery, Saved } from './wall/Gallery.jsx'

const ls = (k, d) => { try { return JSON.parse(localStorage.getItem('ttt.wall.' + k)) ?? d } catch { return d } }
const lsSet = (k, v) => { try { localStorage.setItem('ttt.wall.' + k, JSON.stringify(v)) } catch {} }
const TABS = [['look', 'Look', 'look', LookPanel], ['colour', 'Colour', 'palette', ColourPanel], ['finish', 'Finish', 'finish', FinishPanel], ['text', 'Text', 'type', TextPanel], ['canvas', 'Size', 'frame', CanvasPanel], ['export', 'Export', 'download', ExportPanel]]
const VIEWS = [['studio', 'Studio'], ['gallery', 'Gallery'], ['saved', 'Saved']]

export default function BackgroundStudio() {
  const [d, setD] = useState(() => normalize(ls('design', null)))
  const dRef = useRef(d), hist = useRef({ past: [], future: [], t: 0 })
  const [view, setView] = useState('studio'), [tab, setTab] = useState(() => ls('tab', 'look')), [mode, setMode] = useState('flat'), [playing, setPlaying] = useState(true)
  const [keep, setKeep] = useState({ pal: false, style: false }), [spin, setSpin] = useState(0)
  const [saved, setSaved] = useState(() => ls('saved', [])), [msg, setMsg] = useState(null), [fs, setFs] = useState(false)
  const stageRef = useRef(null), mt = useRef(0)

  const toast = useCallback((t) => { setMsg({ t, k: Date.now() }); clearTimeout(mt.current); mt.current = setTimeout(() => setMsg(null), 2400) }, [])
  const put = useCallback((next, force) => {
    const h = hist.current, now = Date.now()
    if (force || now - h.t > 700) { h.past.push(dRef.current); if (h.past.length > 80) h.past.shift() }
    h.t = now; h.future = []; dRef.current = next; setD(next)
  }, [])
  const set = useCallback((p) => { const cur = dRef.current; put(normalize(typeof p === 'function' ? p(cur) : { ...cur, ...p })) }, [put])
  const apply = useCallback((nd) => put(normalize(nd), true), [put])
  const undo = useCallback(() => { const h = hist.current; const p = h.past.pop(); if (!p) return; h.future.push(dRef.current); dRef.current = p; h.t = 0; setD(p) }, [])
  const redo = useCallback(() => { const h = hist.current; const n = h.future.pop(); if (!n) return; h.past.push(dRef.current); dRef.current = n; h.t = 0; setD(n) }, [])
  const surprise = useCallback(() => { apply(randomDesign(dRef.current, keep)); setSpin((s) => s + 1) }, [apply, keep])
  useEffect(() => { const t = setTimeout(() => lsSet('design', d), 400); return () => clearTimeout(t) }, [d])
  useEffect(() => lsSet('tab', tab), [tab])
  useEffect(() => lsSet('saved', saved), [saved])

  const saveLook = useCallback(() => {
    const thumb = thumbURL(dRef.current, 320, 200, 0.7), name = `Look ${saved.length + 1}`
    setSaved((s) => [{ id: Date.now().toString(36), name, d: dRef.current, thumb, ts: Date.now() }, ...s]); recentAction('Saved a background look'); toast(`Saved “${name}” — find it under Saved`)
  }, [saved.length, toast])
  const openSaved = useCallback((s) => { apply(s.d); setView('studio'); toast(`Opened “${s.name}”`) }, [apply, toast])
  const delSaved = useCallback((id) => setSaved((s) => s.filter((x) => x.id !== id)), [])
  const renameSaved = useCallback((id, name) => setSaved((s) => s.map((x) => (x.id === id ? { ...x, name } : x))), [])
  const dupSaved = useCallback((id) => setSaved((s) => { const x = s.find((y) => y.id === id); return x ? [{ ...x, id: Date.now().toString(36), name: x.name + ' copy' }, ...s] : s }), [])

  const toggleFs = useCallback(() => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.().catch(() => toast('Full screen was blocked by the browser')) }, [toast])
  useEffect(() => { const f = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  useEffect(() => {
    const k = (e) => {
      const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      else if (e.ctrlKey || e.metaKey || e.altKey) return
      else if (view !== 'studio') return
      else if (e.key === 'r' || e.key === 'R') surprise()
      else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p) }
      else if (e.key === 'f' || e.key === 'F') toggleFs()
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [undo, redo, surprise, toggleFs, view])

  const ctx = useMemo(() => ({ d, set, apply, toast, setView, saved, openSaved, delSaved, renameSaved, dupSaved }), [d, set, apply, toast, saved, openSaved, delSaved, renameSaved, dupSaved])
  const Active = TABS.find((t) => t[0] === tab)[3]
  const h = hist.current

  return (
    <WallCtx.Provider value={ctx}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative inline-grid grid-cols-3 rounded-full p-1 border border-line" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)', width: 'min(100%, 360px)' }}>
            <motion.span className="absolute top-1 bottom-1 rounded-full" style={{ background: 'var(--ink)', width: 'calc((100% - 8px) / 3)' }} initial={false} animate={{ left: `calc(4px + ${VIEWS.findIndex((v) => v[0] === view)} * (100% - 8px) / 3)` }} transition={SPRING} />
            {VIEWS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setView(k)} className="relative z-[1] rounded-full px-4 py-2 text-[13px] font-bold flex items-center justify-center gap-1.5" style={{ color: view === k ? 'var(--bg)' : 'var(--ink)' }}>
                {l}{k === 'saved' && saved.length > 0 && <motion.span key={saved.length} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="text-[10.5px] px-1.5 rounded-full" style={{ background: view === k ? 'var(--copper)' : 'var(--surface2)', color: view === k ? '#fff' : 'var(--copper)' }}>{saved.length}</motion.span>}
              </button>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-4 text-[11.5px]" style={{ color: 'var(--muted)' }}>
            {[['R', 'Surprise'], ['Space', 'Play / pause'], ['F', 'Full screen'], ['Ctrl Z', 'Undo']].map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><kbd className="mono text-[10.5px] px-1.5 py-0.5 rounded-md border border-line" style={{ background: 'var(--surface)' }}>{k}</kbd>{l}</span>)}
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={view} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            {view === 'studio' && (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_410px] items-start">
                <div className="lg:sticky lg:top-4 space-y-4">
                  <Stage ref={stageRef} d={d} mode={mode} setMode={setMode} playing={playing} setPlaying={setPlaying} fs={fs} onFullscreen={toggleFs} />
                  <div className="flex flex-wrap items-center gap-2.5 rounded-[22px] border border-line p-3" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
                    <Btn primary icon="dice" onClick={surprise} spin={spin} className="!px-6">Surprise me</Btn>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-semibold mr-1" style={{ color: 'var(--muted)' }}>Keep</span>
                      <Chips value={keep.pal ? 'p' : ''} onChange={() => setKeep({ ...keep, pal: !keep.pal })} options={[['p', 'Palette']]} />
                      <Chips value={keep.style ? 's' : ''} onChange={() => setKeep({ ...keep, style: !keep.style })} options={[['s', 'Style']]} />
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <Btn small icon="undo" onClick={undo} disabled={!h.past.length} title="Undo (Ctrl Z)" />
                      <Btn small icon="redo" onClick={redo} disabled={!h.future.length} title="Redo" />
                      <Btn small icon="heart" onClick={saveLook}>Save look</Btn>
                    </div>
                  </div>
                </div>
                <Panel pad={false} className="overflow-hidden">
                  <div className="grid grid-cols-6 border-b border-line" style={{ background: 'var(--surface2)' }}>
                    {TABS.map(([k, l, ic]) => { const on = tab === k; return (
                      <button key={k} type="button" onClick={() => setTab(k)} className="relative py-3 flex flex-col items-center gap-1" style={{ color: on ? 'var(--copper)' : 'var(--muted)' }}>
                        <motion.span animate={{ y: on ? -1 : 0, scale: on ? 1.12 : 1 }} transition={SPRING}><Ico n={ic} s={18} /></motion.span>
                        <span className="text-[10.5px] font-bold">{l}</span>
                        <motion.span className="absolute bottom-0 h-[3px] rounded-t-full" style={{ background: 'var(--copper)', left: '20%', right: '20%' }} initial={false} animate={{ opacity: on ? 1 : 0, scaleX: on ? 1 : 0.2 }} transition={SPRING} />
                      </button>) })}
                  </div>
                  <div className="p-5 sm:p-6">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={tab} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.22 }}><Active /></motion.div>
                    </AnimatePresence>
                  </div>
                </Panel>
              </div>
            )}
            {view === 'gallery' && <Gallery />}
            {view === 'saved' && <Saved />}
          </motion.div>
        </AnimatePresence>
        <Toast msg={msg} />
      </div>
    </WallCtx.Provider>
  )
}
