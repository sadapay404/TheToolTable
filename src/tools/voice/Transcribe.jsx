import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Btn, Drop, Bar, KIco, SPRING, Switch, fmtSize, usePref } from '../kit/ui.jsx'
import { MODELS, WLANGS, transcribe } from '../../lib/voice/whisper.js'
import { resample } from '../../lib/voice/audio.js'
import { fmtTime } from '../../lib/voice/subs.js'
import { recentAction } from '../../lib/utils.js'

export default function Transcribe({ media, loadFile, setSegs, go, toast, busy: loading = false, loadStatus = '' }) {
  const [o, setO] = usePref('voice', 'opts', { model: MODELS[0][0], language: 'auto', task: 'transcribe', gpu: false })
  const [st, setSt] = useState(null), [live, setLive] = useState([]), ctl = useRef(null)
  useEffect(() => () => ctl.current?.abort(), [])
  const run = async () => {
    ctl.current = new AbortController(); setLive([]); setSt({ stage: 'prep', pct: 3, note: 'Preparing the audio' })
    try {
      const samples = await resample(media.buffer, 16000)
      const segs = await transcribe(samples, { model: o.model, language: o.language, task: o.task, device: o.gpu && navigator.gpu ? 'webgpu' : 'wasm', signal: ctl.current.signal, onUpdate: (u) => { setSt((s) => ({ ...s, ...u, pct: u.pct ?? s.pct })); if (u.partial) setLive(u.partial.slice(-4)) } })
      if (!segs.length) { toast('No speech was found in this file', 'err'); setSt(null); return }
      setSegs(segs); recentAction(`Transcribed ${segs.length} lines`); toast(`${segs.length} subtitle lines ready`); setSt(null); go('subs')
    } catch (e) { setSt(null); if (e.message !== 'Cancelled') toast(e.message.slice(0, 120), 'err') }
    finally { ctl.current = null }
  }
  const busy = !!st || loading
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] items-start">
      <div className="space-y-5">
        <AnimatePresence mode="wait" initial={false}>
          {!media ? (
            <motion.div key="d" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Drop multiple={false} onFiles={(f) => loadFile(f[0])} accept="audio/*,video/*,.mkv,.m4a,.opus,.amr" title="Drop a video or audio file" sub="Lectures, voice notes, interviews, meetings — it never leaves your device" icon="mic" />
            </motion.div>
          ) : (
            <motion.div key="m" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Panel>
                <div className="flex items-center gap-4">
                  <motion.div animate={busy ? { scale: [1, 1.1, 1] } : {}} transition={{ repeat: Infinity, duration: 1.2 }} className="w-14 h-14 rounded-2xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><KIco n={media.kind === 'video' ? 'play' : 'waves'} s={26} /></motion.div>
                  <div className="min-w-0 flex-1"><div className="display font-semibold text-[18px] truncate">{media.name}</div><div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>{media.kind === 'video' ? 'Video' : 'Audio'} · {fmtTime(media.duration, false).slice(0, 8)} · {fmtSize(media.size)}</div></div>
                  <Btn small icon="x" disabled={busy} onClick={() => loadFile(null)}>Change</Btn>
                </div>
                {media.duration > 3600 && <div className="mt-4 text-[12.5px] font-semibold" style={{ color: '#B8791F' }}>Long file — this can take a while on a phone or an older laptop. Try the Tiny model.</div>}
              </Panel>
            </motion.div>)}
        </AnimatePresence>
        <AnimatePresence>
          {loading && !st && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Panel><Bar value={0} label={loadStatus || 'Reading audio…'} /></Panel></motion.div>}
          {st && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
              <Panel>
                <Bar value={st.pct || 0} label={st.note || 'Working'} />
                <div className="mt-4 space-y-2 min-h-[96px]">
                  <AnimatePresence initial={false}>{live.map((s) => <motion.div key={s.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="flex gap-3 rounded-xl px-3 py-2 text-[13.5px]" style={{ background: 'var(--surface2)' }}><span className="mono text-[11px] pt-0.5 shrink-0" style={{ color: 'var(--copper)' }}>{fmtTime(s.start, false).slice(3, 8)}</span><span dir="auto">{s.text}</span></motion.div>)}</AnimatePresence>
                </div>
                <div className="mt-3"><Btn small icon="x" onClick={() => ctl.current?.abort()}>Cancel</Btn></div>
              </Panel>
            </motion.div>)}
        </AnimatePresence>
      </div>
      <div className="space-y-5">
        <Panel delay={0.06}>
          <Label>Accuracy</Label>
          <div className="space-y-2">{MODELS.map(([id, name, sub]) => { const on = o.model === id; return (
            <motion.button key={id} type="button" whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }} onClick={() => setO({ ...o, model: id })} className="w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 9%, var(--surface))' : 'var(--surface)' }}>
              <span className="w-4 h-4 rounded-full border-2 grid place-items-center" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)' }}><motion.span initial={false} animate={{ scale: on ? 1 : 0 }} className="w-2 h-2 rounded-full" style={{ background: 'var(--copper)' }} /></span>
              <span><span className="block text-[14px] font-bold">{name}</span><span className="block text-[11.5px]" style={{ color: 'var(--muted)' }}>{sub}</span></span>
            </motion.button>) })}</div>
        </Panel>
        <Panel delay={0.1}>
          <Label>Language</Label>
          <select className="input w-full" value={o.language} onChange={(e) => setO({ ...o, language: e.target.value })}>{WLANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <div className="mt-4"><Seg small value={o.task} onChange={(v) => setO({ ...o, task: v })} options={[['transcribe', 'Write what is said'], ['translate', 'Translate to English']]} /></div>
          {typeof navigator !== 'undefined' && navigator.gpu && <div className="mt-4"><Switch on={o.gpu} onChange={(v) => setO({ ...o, gpu: v })} label="Use the graphics card" hint="Much faster on a strong GPU" /></div>}
        </Panel>
        <Panel delay={0.14}>
          <Btn primary className="w-full" icon="mic" busy={busy} disabled={!media || busy} onClick={run}>Create subtitles</Btn>
          <div className="text-[11.5px] mt-3 text-center" style={{ color: 'var(--muted)' }}>The speech model downloads once, then works offline.</div>
        </Panel>
      </div>
    </div>
  )
}
