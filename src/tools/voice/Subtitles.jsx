import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Btn, Drop, Range, Field, Bar, KIco, SPRING, Empty, save, baseName, usePref } from '../kit/ui.jsx'
import { fmtTime, parseTime, toSrt, toVtt, toTxt, parseSubs, newId, MAX_SUBTITLE_SECONDS, MAX_SUBTITLE_FILE_CHARS } from '../../lib/voice/subs.js'
import { getFFmpeg, runFFmpegJob } from '../../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'

function TimeInput({ value, onCommit }) {
  const [t, setT] = useState(fmtTime(value, false)); useEffect(() => setT(fmtTime(value, false)), [value])
  return <input aria-label="Subtitle start and end time" className="input mono !py-1 !px-2 !text-[12px] w-[104px]" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const v = parseTime(t); if (v == null) setT(fmtTime(value, false)); else onCommit(v) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
}

export default function Subtitles({ media, segs, setSegs, toast }) {
  const [now, setNow] = useState(0), el = useRef(null), [fmt, setFmt] = useState('srt'), [max, setMax] = usePref('voice', 'max', 42), [shift, setShift] = useState(0), [find, setFind] = useState(''), [rep, setRep] = useState(''), [mux, setMux] = useState(0), listRef = useRef(null)
  useEffect(() => { let id; const tick = () => { if (el.current) setNow(el.current.currentTime); id = requestAnimationFrame(tick) }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id) }, [media?.url])
  const activeIdx = segs.findIndex((s) => now >= s.start && now < s.end)
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current || el.current?.paused) return
    listRef.current.children[activeIdx]?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth',
    })
  }, [activeIdx])
  const maxTime = Math.max(0.1, Math.min(MAX_SUBTITLE_SECONDS, Number(media?.duration) || MAX_SUBTITLE_SECONDS))
  const upd = (id, patch) => setSegs((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const commitTime = (segment, field, value) => {
    if (field === 'start') {
      const end = Math.min(maxTime, segment.end), start = Math.max(0, Math.min(value, maxTime - 0.05, end - 0.05))
      upd(segment.id, { start, end: Math.max(start + 0.05, end) })
    } else upd(segment.id, { end: Math.min(maxTime, Math.max(value, segment.start + 0.05)) })
  }
  const seek = (time) => { if (el.current) { el.current.currentTime = Math.max(0, Math.min(Number(time) || 0, Number(media?.duration) || Number(time) || 0)); el.current.play?.().catch?.(() => {}) } }
  const del = (id) => setSegs((rows) => rows.filter((x) => x.id !== id))
  const merge = (i) => setSegs((rows) => { const next = [...rows], first = next[i], second = next[i + 1]; if (!first || !second) return next; const start = Math.max(0, Math.min(first.start, maxTime - 0.05)), end = Math.max(start + 0.05, Math.min(maxTime, second.end)); next.splice(i, 2, { ...first, start, end, text: (first.text + ' ' + second.text).trim() }); return next })
  const split = (i) => setSegs((rows) => { const next = [...rows], segment = next[i], words = String(segment?.text || '').split(/\s+/).filter(Boolean); if (!segment || words.length < 2 || segment.end - segment.start < 0.1) return next; const half = Math.ceil(words.length / 2), middle = segment.start + ((segment.end - segment.start) * half) / words.length; next.splice(i, 1, { ...segment, end: middle, text: words.slice(0, half).join(' ') }, { id: newId(), start: middle, end: segment.end, text: words.slice(half).join(' ') }); return next })
  const add = () => setSegs((rows) => { const start = Math.min(maxTime - 0.05, Math.max(0, now)), end = Math.min(maxTime, start + 2.5); return [...rows, { id: newId(), start, end, text: '' }].sort((a, b) => a.start - b.start) })
  const doShift = () => { setSegs((rows) => rows.map((x) => { const span = Math.min(maxTime, Math.max(0.05, x.end - x.start)), start = Math.min(maxTime - span, Math.max(0, x.start + shift)); return { ...x, start, end: start + span } })); toast(`Shifted by ${shift > 0 ? '+' : ''}${shift}s`) }
  const doRep = () => { if (!find) return; let n = 0; setSegs((s) => s.map((x) => { const t = x.text.split(find).join(rep); if (t !== x.text) n++; return { ...x, text: t } })); toast(`${n} line${n === 1 ? '' : 's'} changed`) }
  const body = useMemo(() => (fmt === 'srt' ? toSrt(segs, max) : fmt === 'vtt' ? toVtt(segs, max) : fmt === 'txt' ? toTxt(segs) : JSON.stringify(segs.map(({ start, end, text }) => ({ start, end, text })), null, 2)), [segs, fmt, max])
  const name = baseName(media?.name || 'subtitles')
  const download = () => save(new Blob(['\uFEFF' + body], { type: 'text/plain;charset=utf-8' }), `${name}.${fmt}`)
  const copy = async () => { try { await navigator.clipboard.writeText(body); toast('Copied to clipboard') } catch { toast('Copy blocked by the browser', 'err') } }
  const doMux = async () => {
    if (!media?.file || !segs.length || mux > 0) return
    const subtitleText = toSrt(segs, max)
    if (!subtitleText.trim()) return toast('Fix the subtitle time ranges before adding them to the video.', 'err')
    setMux(0.02)
    try {
      const result = await runFFmpegJob(async () => {
        const ff = await getFFmpeg(), id = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
        const ext = String(media.name || '').match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase() || 'bin'
        const mp4 = ['mp4', 'm4v', 'mov'].includes(ext), vin = `ttt-${id}-in.${ext}`, sin = `ttt-${id}-subs.srt`, outn = `ttt-${id}-out.${mp4 ? 'mp4' : 'mkv'}`
        const progress = ({ progress }) => { if (Number.isFinite(progress)) setMux(Math.max(0.03, Math.min(0.98, progress))) }
        ff.on('progress', progress)
        try {
          await ff.writeFile(vin, await fetchFile(media.file))
          await ff.writeFile(sin, new TextEncoder().encode(subtitleText))
          await ff.exec(['-nostdin', '-v', 'error', '-i', vin, '-i', sin, '-map', '0:v:0', '-map', '0:a?', '-map', '1:0', '-c', 'copy', '-c:s', mp4 ? 'mov_text' : 'srt', outn])
          const data = await ff.readFile(outn)
          return { data: new Uint8Array(data).slice(), mp4 }
        } finally {
          ff.off('progress', progress)
          await Promise.all([vin, sin, outn].map(async (path) => { try { await ff.deleteFile(path) } catch {} }))
        }
      })
      const mime = result.mp4 ? 'video/mp4' : 'video/x-matroska', ext = result.mp4 ? 'mp4' : 'mkv'
      save(new Blob([result.data], { type: mime }), `${name}_subtitled.${ext}`)
      toast('Video saved — subtitles are a selectable track, video untouched')
    } catch (error) { toast('Could not add the subtitle track: ' + String(error?.message || error).slice(0, 100), 'err') }
    finally { setMux(0) }
  }
  const importFile = async (files) => {
    const file = files?.[0]
    if (!file) return
    if (Number(file.size) > MAX_SUBTITLE_FILE_CHARS) return toast('Subtitle files must be 5 MB or smaller.', 'err')
    try {
      const parsed = parseSubs(await file.text())
      if (!parsed.length) return toast('No valid subtitle lines found in that file', 'err')
      setSegs(parsed); toast(`${parsed.length} lines imported`)
    } catch (error) { toast(error?.message || 'Could not read that subtitle file.', 'err') }
  }
  const cur = activeIdx >= 0 ? segs[activeIdx].text : ''
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
      <div className="space-y-4">
        {media && (
          <Panel pad={false} className="overflow-hidden">
            <div className="relative" style={{ background: '#0f0d0c' }}>
              {media.kind === 'video' ? <video ref={el} src={media.url} controls playsInline className="w-full block max-h-[420px] mx-auto" /> : <div className="p-6"><audio ref={el} src={media.url} controls className="w-full" /></div>}
              {media.kind === 'video' && <AnimatePresence mode="wait"><motion.div key={cur} initial={{ opacity: 0, y: 6 }} animate={{ opacity: cur ? 1 : 0, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 right-0 bottom-14 text-center px-6 pointer-events-none"><span dir="auto" className="inline-block rounded-lg px-3 py-1.5 text-[17px] font-semibold text-white whitespace-pre-line" style={{ background: 'rgba(0,0,0,.72)' }}>{cur}</span></motion.div></AnimatePresence>}
            </div>
            {media.kind === 'audio' && <AnimatePresence mode="wait"><motion.div key={cur} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 pb-5 text-center text-[17px] font-semibold min-h-[44px]" dir="auto">{cur}</motion.div></AnimatePresence>}
          </Panel>)}
        <Panel pad={false} className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 px-1"><span className="text-[12.5px] font-semibold" style={{ color: 'var(--muted)' }}>{segs.length} line{segs.length === 1 ? '' : 's'}</span><Btn small icon="plus" onClick={add}>Add line at {fmtTime(now, false).slice(3, 8)}</Btn></div>
          {!segs.length ? <Empty icon="text" title="No subtitles yet" sub="Create them in the first tab — or import an .srt / .vtt file on the right." /> : (
            <div ref={listRef} className="space-y-2 max-h-[560px] overflow-auto pr-1">
              <AnimatePresence initial={false}>{segs.map((s, i) => { const on = i === activeIdx; return (
                <motion.div key={s.id} layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} transition={SPRING} className="rounded-2xl border p-3 flex flex-wrap items-start gap-3" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', background: on ? 'color-mix(in srgb, var(--copper) 9%, var(--surface))' : 'var(--surface)' }}>
                  <div className="flex items-center gap-2"><button type="button" aria-label="Play from here" onClick={() => seek(s.start)} className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ background: on ? 'var(--copper)' : 'var(--surface2)', color: on ? '#fff' : 'var(--copper)' }}><KIco n="play" s={13} /></button><span className="mono text-[11px] font-bold w-5" style={{ color: 'var(--muted)' }}>{i + 1}</span></div>
                  <div className="flex gap-1.5 shrink-0"><TimeInput value={s.start} onCommit={(v) => commitTime(s, 'start', v)} /><TimeInput value={s.end} onCommit={(v) => commitTime(s, 'end', v)} /></div>
                  <textarea aria-label="Subtitle text" dir="auto" rows={Math.max(1, Math.ceil(s.text.length / 46))} className="input flex-1 basis-full order-last !py-2 resize-none" value={s.text} onChange={(e) => upd(s.id, { text: e.target.value })} placeholder="Subtitle text" />
                  <div className="flex gap-1 shrink-0"><Btn small icon="split" onClick={() => split(i)} title="Split in two" /><Btn small icon="merge" disabled={i >= segs.length - 1} onClick={() => merge(i)} title="Merge with next" /><Btn small icon="trash" danger onClick={() => del(s.id)} title="Delete" /></div>
                </motion.div>) })}</AnimatePresence>
            </div>)}
        </Panel>
      </div>
      <div className="space-y-5 lg:sticky lg:top-4">
        <Panel delay={0.05}>
          <Label>Export</Label>
          <Seg small value={fmt} onChange={setFmt} options={[['srt', 'SRT'], ['vtt', 'VTT'], ['txt', 'Text'], ['json', 'JSON']]} />
          {(fmt === 'srt' || fmt === 'vtt') && <div className="mt-4"><Range label="Characters per line" min={0} max={70} value={max} onChange={setMax} fmt={(v) => (v < 10 ? 'No wrapping' : v)} /></div>}
          <div className="flex gap-2 mt-4"><Btn primary className="flex-1" icon="download" disabled={!segs.length} onClick={download}>Download .{fmt}</Btn><Btn icon="copy" disabled={!segs.length} onClick={copy} /></div>
          {media?.kind === 'video' && <div className="mt-4 pt-4 border-t border-line">{mux > 0 && <div className="mb-3"><Bar value={mux * 100} label="Adding the subtitle track" /></div>}<Btn className="w-full" icon="play" disabled={!segs.length || mux > 0} onClick={doMux}>Save video with subtitles</Btn><div className="text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>Adds a selectable subtitle track. The video is copied, not re-encoded.</div></div>}
        </Panel>
        <Panel delay={0.09}>
          <Label>Fix the whole file</Label>
          <Range label="Shift all times" min={-10} max={10} step={0.1} value={shift} onChange={setShift} fmt={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} s`} />
          <Btn small className="mt-3" icon="clock" disabled={!shift || !segs.length} onClick={doShift}>Apply shift</Btn>
          <div className="grid grid-cols-2 gap-2 mt-5"><Field label="Find"><input className="input" value={find} onChange={(e) => setFind(e.target.value)} /></Field><Field label="Replace with"><input className="input" value={rep} onChange={(e) => setRep(e.target.value)} /></Field></div>
          <Btn small className="mt-3" icon="edit" disabled={!find} onClick={doRep}>Replace all</Btn>
        </Panel>
        <Panel delay={0.13}><Label>Import</Label><Drop compact multiple={false} accept=".srt,.vtt,text/vtt" title="Drop .srt or .vtt" sub="Edit, shift or fix an existing file" icon="file" onFiles={importFile} /></Panel>
      </div>
    </div>
  )
}
