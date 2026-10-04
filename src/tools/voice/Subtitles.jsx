import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Seg, Btn, Drop, Range, Field, Bar, KIco, SPRING, Empty, save, baseName, usePref } from '../kit/ui.jsx'
import { fmtTime, parseTime, toSrt, toVtt, toTxt, parseSubs, newId } from '../../lib/voice/subs.js'
import { getFFmpeg } from '../../lib/ffmpeg.js'
import { fetchFile } from '@ffmpeg/util'

function TimeInput({ value, onCommit }) {
  const [t, setT] = useState(fmtTime(value, false)); useEffect(() => setT(fmtTime(value, false)), [value])
  return <input className="input mono !py-1 !px-2 !text-[12px] w-[104px]" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => { const v = parseTime(t); if (v == null) setT(fmtTime(value, false)); else onCommit(v) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
}

export default function Subtitles({ media, segs, setSegs, toast }) {
  const [now, setNow] = useState(0), el = useRef(null), [fmt, setFmt] = useState('srt'), [max, setMax] = usePref('voice', 'max', 42), [shift, setShift] = useState(0), [find, setFind] = useState(''), [rep, setRep] = useState(''), [mux, setMux] = useState(0), listRef = useRef(null)
  useEffect(() => { let id; const tick = () => { if (el.current) setNow(el.current.currentTime); id = requestAnimationFrame(tick) }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id) }, [media?.url])
  const activeIdx = segs.findIndex((s) => now >= s.start && now < s.end)
  useEffect(() => { if (activeIdx >= 0 && listRef.current && !el.current?.paused) listRef.current.children[activeIdx]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [activeIdx])
  const upd = (id, p) => setSegs((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const seek = (t) => { if (el.current) { el.current.currentTime = t; el.current.play?.() } }
  const del = (id) => setSegs((s) => s.filter((x) => x.id !== id))
  const merge = (i) => setSegs((s) => { const a = [...s]; if (!a[i + 1]) return a; a.splice(i, 2, { ...a[i], end: a[i + 1].end, text: (a[i].text + ' ' + a[i + 1].text).trim() }); return a })
  const split = (i) => setSegs((s) => { const a = [...s], x = a[i], words = x.text.split(/\s+/), h = Math.ceil(words.length / 2), mid = x.start + ((x.end - x.start) * h) / words.length; if (words.length < 2) return a; a.splice(i, 1, { ...x, end: mid, text: words.slice(0, h).join(' ') }, { id: newId(), start: mid, end: x.end, text: words.slice(h).join(' ') }); return a })
  const add = () => setSegs((s) => [...s, { id: newId(), start: now, end: now + 2.5, text: '' }].sort((a, b) => a.start - b.start))
  const doShift = () => { setSegs((s) => s.map((x) => ({ ...x, start: Math.max(0, x.start + shift), end: Math.max(0.2, x.end + shift) }))); toast(`Shifted by ${shift > 0 ? '+' : ''}${shift}s`) }
  const doRep = () => { if (!find) return; let n = 0; setSegs((s) => s.map((x) => { const t = x.text.split(find).join(rep); if (t !== x.text) n++; return { ...x, text: t } })); toast(`${n} line${n === 1 ? '' : 's'} changed`) }
  const body = useMemo(() => (fmt === 'srt' ? toSrt(segs, max) : fmt === 'vtt' ? toVtt(segs, max) : fmt === 'txt' ? toTxt(segs) : JSON.stringify(segs.map(({ start, end, text }) => ({ start, end, text })), null, 2)), [segs, fmt, max])
  const name = baseName(media?.name || 'subtitles')
  const download = () => save(new Blob(['\uFEFF' + body], { type: 'text/plain;charset=utf-8' }), `${name}.${fmt}`)
  const doMux = async () => {
    setMux(0.02)
    try {
      const ff = await getFFmpeg(), ext = (media.name.split('.').pop() || 'mp4').toLowerCase(), mp4 = ['mp4', 'm4v', 'mov'].includes(ext), vin = 'in.' + ext, outn = mp4 ? 'out.mp4' : 'out.mkv', h = ({ progress }) => setMux(Math.max(0.03, progress))
      ff.on('progress', h); await ff.writeFile(vin, await fetchFile(media.file)); await ff.writeFile('subs.srt', new TextEncoder().encode(toSrt(segs, max)))
      await ff.exec(['-i', vin, '-i', 'subs.srt', '-map', '0:v', '-map', '0:a?', '-map', '1', '-c', 'copy', '-c:s', mp4 ? 'mov_text' : 'srt', outn]); ff.off('progress', h)
      const d = await ff.readFile(outn); await ff.deleteFile(vin); await ff.deleteFile('subs.srt'); await ff.deleteFile(outn)
      save(new Blob([d.buffer], { type: mp4 ? 'video/mp4' : 'video/x-matroska' }), `${name}_subtitled.${mp4 ? 'mp4' : 'mkv'}`); toast('Video saved — subtitles are a selectable track, video untouched')
    } catch (e) { toast('Could not add the subtitle track: ' + String(e.message || e).slice(0, 80), 'err') } finally { setMux(0) }
  }
  const importFile = async (f) => { const t = await f[0].text(), p = parseSubs(t); if (!p.length) return toast('No subtitle lines found in that file', 'err'); setSegs(p); toast(`${p.length} lines imported`) }
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
                  <div className="flex gap-1.5 shrink-0"><TimeInput value={s.start} onCommit={(v) => upd(s.id, { start: v })} /><TimeInput value={s.end} onCommit={(v) => upd(s.id, { end: v })} /></div>
                  <textarea dir="auto" rows={Math.max(1, Math.ceil(s.text.length / 46))} className="input flex-1 basis-full order-last !py-2 resize-none" value={s.text} onChange={(e) => upd(s.id, { text: e.target.value })} placeholder="Subtitle text" />
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
          <div className="flex gap-2 mt-4"><Btn primary className="flex-1" icon="download" disabled={!segs.length} onClick={download}>Download .{fmt}</Btn><Btn icon="copy" disabled={!segs.length} onClick={() => navigator.clipboard.writeText(body).then(() => toast('Copied'))} /></div>
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
