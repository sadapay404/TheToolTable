import React, { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { download, recentAction } from '../../lib/utils.js'
import { exportImage, exportPack, recordLoop, videoTypes, liveHTML, outSize, MAX_SIDE, MAX_CANVAS_PIXELS, MAX_VIDEO_SIDE, MAX_VIDEO_PIXELS } from '../../lib/wall/exporters.js'
import { cssFor, encodeDesign, decodeDesign } from '../../lib/wall/design.js'
import { PACK_SETS } from '../../lib/wall/sizes.js'
import { fitDimensions } from '../../lib/wall/bounds.js'
import { Ico, Slider, Chips, Btn, Seg, Label, Bar, SPRING, useWall } from './ui.jsx'

const fmtMB = (n) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.round(n / 1e3) + ' KB')
const base = (d) => `thetooltable-bg-${d.style}`

export function ExportPanel() {
  const { d, apply, toast } = useWall()
  const [tab, setTab] = useState('image')
  const [job, setJob] = useState(null)             // { label, p }
  const [fmt, setFmt] = useState('png'), [mult, setMult] = useState(1), [q, setQ] = useState(1)
  const [vsz, setVsz] = useState(1080), [fps, setFps] = useState(30), [loops, setLoops] = useState(1)
  const [sets, setSets] = useState({ desktop: true, phone: true, social: false, tablet: false, call: false, avatar: false })
  const [code, setCode] = useState('')
  const ctl = useRef(null), running = useRef(false)
  const vt = videoTypes(), [vext, setVext] = useState(vt[0]?.ext)
  const { w, h } = outSize(d, mult), mp = (w * h) / 1e6
  const busy = !!job, capped = w < d.size.w * mult || h < d.size.h * mult
  const run = async (label, fn) => {
    if (running.current) return
    running.current = true; setJob({ label, p: 0 })
    try { await fn((p) => setJob({ label, p })) }
    catch (e) { if (e.message !== 'Cancelled') toast('Export failed — ' + e.message) }
    finally { ctl.current = null; running.current = false; setJob(null) }
  }

  const doImage = () => run('Rendering ' + w + '×' + h, async (pg) => { const b = await exportImage(d, { fmt, W: w, H: h, quality: q, onProgress: pg }); download(b, `${base(d)}-${w}x${h}.${fmt}`); recentAction(`Exported ${fmt.toUpperCase()} background ${w}×${h}`); toast(`Saved ${fmtMB(b.size)} · ${w}×${h}`) })
  const doCopy = () => run('Copying', async () => { const scale = Math.min(1, 4096 / Math.max(d.size.w, d.size.h)), size = outSize(d, scale), b = await exportImage(d, { fmt: 'png', W: size.w, H: size.h }); if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard access is not available in this browser.'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); toast('Copied to clipboard') })
  const doLoop = () => {
    if (running.current) return
    const pick = vt.find((v) => v.ext === vext) || vt[0]
    if (!pick) return toast('Video recording is not available in this browser.')
    const a = d.size.w / d.size.h, rawW = Math.max(16, Math.round((a >= 1 ? vsz * a : vsz) / 2) * 2), rawH = Math.max(16, Math.round((a >= 1 ? vsz : vsz / a) / 2) * 2), { w: W, h: H } = fitDimensions(rawW, rawH, { maxSide: MAX_VIDEO_SIDE, maxPixels: MAX_VIDEO_PIXELS })
    ctl.current = new AbortController()
    run(`Recording ${d.loop * loops}s loop · ${W}×${H}`, async (pg) => { const b = await recordLoop(d, { W, H, fps, loops, ext: pick.ext, mime: pick.mime }, pg, ctl.current.signal); download(b, `${base(d)}-loop-${W}x${H}.${pick.ext}`); recentAction(`Recorded ${d.loop * loops}s background loop`); toast(`Saved loop · ${fmtMB(b.size)}`) })
  }
  const files = PACK_SETS.filter((s) => sets[s[0]]).flatMap((s) => s[2])
  const doPack = () => run(`Rendering ${files.length} sizes`, async (pg) => { const b = await exportPack(d, files, { fmt, quality: q, onProgress: pg }); download(b, `${base(d)}-wallpaper-pack.zip`); recentAction(`Exported wallpaper pack (${files.length} sizes)`); toast(`Pack ready · ${files.length} files`) })
  const css = cssFor(d)

  return (
    <div className="space-y-5">
      <Seg small value={tab} onChange={setTab} options={[['image', 'Image'], ['loop', 'Loop'], ['pack', 'Pack'], ['code', 'Code']]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="space-y-5">
          {tab === 'image' && <>
            <div><div className="text-[13px] font-semibold mb-2">Format</div><Chips value={fmt} onChange={setFmt} options={[['png', 'PNG · lossless'], ['jpg', 'JPG'], ['webp', 'WebP']]} /></div>
            <div><div className="text-[13px] font-semibold mb-2">Scale</div><Chips value={mult} onChange={setMult} options={[[0.5, '½×'], [1, '1×'], [1.5, '1.5×'], [2, '2×'], [3, '3×']]} /></div>
            {fmt !== 'png' && <Slider label="Quality" min={0.6} max={1} step={0.01} value={q} onChange={setQ} fmt={(v) => Math.round(v * 100) + '%'} />}
            <div className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div><div className="mono text-[15px] font-bold">{w} × {h}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{mp.toFixed(1)} MP{mp > 32 ? ' · large export' : ''}{capped ? ` · capped at ${MAX_SIDE.toLocaleString()} px / ${MAX_CANVAS_PIXELS / 1_000_000} MP` : ''}</div></div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--copper)' }}>{d.text.on ? 'text included' : 'no text'}</span>
            </div>
            <div className="flex gap-2"><Btn primary icon="download" disabled={busy} onClick={doImage} className="flex-1">Download {fmt.toUpperCase()}</Btn><Btn icon="copy" disabled={busy} onClick={doCopy} title="Copy to clipboard">Copy</Btn></div>
            <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Large images are rendered in tiles. To avoid browser memory failures, exports are limited to {MAX_SIDE.toLocaleString()} pixels per side and {MAX_CANVAS_PIXELS / 1_000_000} megapixels.</div>
          </>}
          {tab === 'loop' && (vt.length ? <>
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>Records the animation as one seamless <b>{d.loop}s</b> loop — set it to repeat on a website, a TV, or your phone's live wallpaper. Recording runs in real time.</div>
            <div><div className="text-[13px] font-semibold mb-2">Container</div><Chips value={vext || vt[0].ext} onChange={setVext} options={vt.map((v) => [v.ext, v.ext.toUpperCase()])} /></div>
            <div><div className="text-[13px] font-semibold mb-2">Resolution <span className="font-normal" style={{ color: 'var(--muted)' }}>(short side)</span></div><Chips value={vsz} onChange={setVsz} options={[[720, '720p'], [1080, '1080p'], [1440, '1440p'], [2160, '4K']]} /></div>
            <div className="grid grid-cols-2 gap-4"><div><div className="text-[13px] font-semibold mb-2">Frame rate</div><Chips value={fps} onChange={setFps} options={[[30, '30'], [60, '60']]} /></div><div><div className="text-[13px] font-semibold mb-2">Repeat</div><Chips value={loops} onChange={setLoops} options={[[1, '1×'], [2, '2×'], [3, '3×']]} /></div></div>
            {d.amp === 0 && <div className="text-[12px]" style={{ color: 'var(--copper)' }}>Motion is set to “Still” — turn it up in Look → Motion.</div>}
            <Btn primary icon="film" disabled={busy} onClick={doLoop} className="w-full">Record {d.loop * loops}s</Btn>
          </> : <div className="text-[13px]" style={{ color: 'var(--muted)' }}>This browser can’t record video. Try Chrome, Edge or Safari 14.1+.</div>)}
          {tab === 'pack' && <>
            <div className="text-[12.5px] leading-relaxed" style={{ color: 'var(--muted)' }}>One design, every device — each size is re-rendered natively (never cropped or stretched) and bundled in a ZIP.</div>
            <div className="grid grid-cols-2 gap-2.5">
              {PACK_SETS.map(([k, name, items], i) => { const on = !!sets[k]; return (
                <motion.button key={k} type="button" onClick={() => setSets({ ...sets, [k]: !on })} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.03 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.95 }}
                  className="rounded-2xl border p-3 text-left flex items-center gap-2.5" style={{ borderColor: on ? 'var(--copper)' : 'var(--border)', boxShadow: on ? '0 0 0 2px var(--copper)' : 'var(--shadow)', background: 'var(--surface)' }}>
                  <motion.span className="w-5 h-5 rounded-md grid place-items-center shrink-0" animate={{ background: on ? 'var(--copper)' : 'var(--border)' }} style={{ color: '#fff' }}><motion.span animate={{ scale: on ? 1 : 0 }} transition={SPRING}><Ico n="check" s={13} w={3} /></motion.span></motion.span>
                  <span><span className="block text-[12.5px] font-bold">{name}</span><span className="block text-[10.5px]" style={{ color: 'var(--muted)' }}>{items.length} size{items.length > 1 ? 's' : ''}</span></span>
                </motion.button>) })}
            </div>
            <div><div className="text-[13px] font-semibold mb-2">Format</div><Chips value={fmt} onChange={setFmt} options={[['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']]} /></div>
            <Btn primary icon="pack" disabled={busy || !files.length} onClick={doPack} className="w-full">Download ZIP · {files.length} files</Btn>
          </>}
          {tab === 'code' && <>
            <div>
              <Label right={<button type="button" className="text-[11.5px] font-bold" style={{ color: 'var(--copper)' }} onClick={() => { navigator.clipboard.writeText(css); toast('CSS copied') }}>Copy</button>}>CSS for websites</Label>
              <pre className="mono text-[11px] leading-relaxed rounded-2xl p-3.5 overflow-x-auto max-h-44" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>{css}</pre>
              <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>A close CSS match — gradients are exact, generative styles are approximated.</div>
            </div>
            <div><Label>Live wallpaper</Label>
              <Btn icon="code" onClick={() => { download(new Blob([liveHTML(d)], { type: 'text/html' }), `${base(d)}-live.html`); toast('Live HTML saved') }} className="w-full">Download animated HTML</Btn>
              <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>One self-contained file running the exact same shader — works as a website hero, in Lively Wallpaper (Windows) or Wallpaper Engine.</div></div>
            <div><Label>Design code</Label>
              <div className="flex gap-2"><Btn small icon="copy" onClick={() => { navigator.clipboard.writeText(encodeDesign(d)); toast('Design code copied — send it to anyone') }}>Copy my code</Btn></div>
              <textarea aria-label="Design code" className="input w-full mt-2 mono text-[11px]" maxLength={50_000} rows={2} placeholder="Paste a TTBG1:… code to load a design" value={code} onChange={(e) => setCode(e.target.value)} />
              <Btn small icon="download" className="mt-2" disabled={!code.trim()} onClick={() => { const x = decodeDesign(code); if (x) { apply(x); setCode(''); toast('Design loaded') } else toast('That code is not valid') }}>Load</Btn>
            </div>
          </>}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {job && (
          <motion.div initial={{ opacity: 0, y: 12, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="rounded-2xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-2 text-[12.5px] font-semibold"><span>{job.label}</span><span className="mono" style={{ color: 'var(--copper)' }}>{Math.round(job.p * 100)}%</span></div>
              <Bar value={job.p} />
              {job.label.startsWith('Recording') && <button type="button" className="mt-2 text-[11.5px] font-bold" style={{ color: 'var(--copper)' }} onClick={() => ctl.current?.abort()}>Cancel recording</button>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
