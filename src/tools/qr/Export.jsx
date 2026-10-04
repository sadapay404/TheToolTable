import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Choice, Seg, Btn, Range, Switch, TextIn, SPRING, Label, CountText } from './ui.jsx'
import { useQR } from './store.js'
import { svgFile, toEPS } from '../../lib/qr/render.js'
import { PRINT_PRESETS, SIZE_PRESETS, mmToPx, pngBlob, pdfBlob, copyPng, slug } from '../../lib/qr/exportKit.js'
import { download } from '../../lib/utils.js'
import { recentAction } from '../../lib/utils.js'

const FORMATS = [['png', 'PNG', 'Lossless raster, up to 8K', 'image'], ['svg', 'SVG', 'Infinite-resolution vector', 'sparkle'], ['pdf', 'PDF', 'Print-ready, exact mm size', 'file'], ['eps', 'EPS', 'Flat vector for print shops', 'layers']]

export default function Export({ result, name, toast }) {
  const [fmt, setFmt] = useState('png')
  const [px, setPx] = useState(2048)
  const [mm, setMm] = useState(60)
  const [dpi, setDpi] = useState(300)
  const [transparent, setTransparent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fname, setFname] = useState('')
  const base = fname.trim() ? slug(fname) : name
  const ratio = result.H / result.W
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const transparentOk = result.style.bg.type !== 'none'

  const run = async (kind) => {
    setBusy(kind)
    try {
      let blob
      if (kind === 'copy' || kind === 'share' || fmt === 'png') blob = await pngBlob(result, kind === 'copy' || kind === 'share' ? Math.min(px, 2048) : px, { transparent })
      if (kind === 'copy') { await copyPng(blob); toast('Copied image to clipboard'); return }
      if (kind === 'share') { const f = new File([blob], base + '.png', { type: 'image/png' }); await navigator.share({ files: [f], title: 'QR code' }); return }
      if (fmt === 'png') { download(blob, `${base}-${px}px.png`); toast(`Saved ${px} × ${Math.round(px * ratio)} PNG`); recentAction(`QR PNG ${px}px`) }
      else if (fmt === 'svg') { download(new Blob([svgFile(result, 1024)], { type: 'image/svg+xml' }), `${base}.svg`); toast('Saved SVG vector'); recentAction('QR SVG') }
      else if (fmt === 'pdf') { const b = await pdfBlob(result, { mm, dpi, transparent }); download(b, `${base}-${mm}mm.pdf`); toast(`Saved ${mm} mm PDF`); recentAction('QR PDF') }
      else { download(new Blob([toEPS(result, (mm / 25.4) * 72, transparent)], { type: 'application/postscript' }), `${base}-${mm}mm.eps`); toast('Saved EPS vector'); recentAction('QR EPS') }
    } catch (e) { if (e?.name !== 'AbortError') toast(e.message || 'Export failed', true) } finally { setBusy(false) }
  }
  const cm = (mm / 10).toFixed(1)
  return (
    <div className="space-y-5">
      <div>
        <Label>Format</Label>
        <div className="grid grid-cols-2 gap-2.5">{FORMATS.map(([k, l, d, ic]) => <Choice key={k} active={fmt === k} onClick={() => setFmt(k)} className="px-3.5 py-3 flex items-center gap-3 text-left"><span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><QIco n={ic} s={18} /></span><span><span className="block text-[14px]">{l}</span><span className="block text-[11px] font-medium leading-tight" style={{ color: 'var(--muted)' }}>{d}</span></span></Choice>)}</div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={fmt === 'png' ? 'px' : fmt === 'svg' ? 'svg' : 'mm'} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
          {fmt === 'png' && <>
            <div><span className="block text-[12.5px] font-semibold mb-2">Pixel size</span>
              <div className="flex flex-wrap gap-1.5">{SIZE_PRESETS.map(([v, l]) => <motion.button key={v} type="button" whileHover={{ y: -2 }} whileTap={{ scale: 0.92 }} onClick={() => setPx(v)} className="rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold" style={{ borderColor: px === v ? 'var(--ink)' : 'var(--border)', background: px === v ? 'var(--ink)' : 'var(--surface)', color: px === v ? 'var(--bg)' : 'var(--ink)' }}>{l}</motion.button>)}</div></div>
            <Range label="Custom width" min={256} max={8192} step={64} value={px} onChange={setPx} fmt={(v) => v + ' px'} />
            <div className="text-[12px]" style={{ color: 'var(--muted)' }}>Output <b className="mono" style={{ color: 'var(--ink)' }}><CountText value={px} format={(v) => Math.round(v)} /> × <CountText value={px * ratio} format={(v) => Math.round(v)} /> px</b> — about {((px / 300) * 2.54).toFixed(1)} cm at 300 dpi.{px >= 6000 && ' Very large — may fail on phones.'}</div>
          </>}
          {fmt === 'svg' && <div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Pure vector — scales to billboard size with no loss. Gradients, logos and photos stay embedded.</div>}
          {(fmt === 'pdf' || fmt === 'eps') && <>
            <div><span className="block text-[12.5px] font-semibold mb-2">Print size</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{PRINT_PRESETS.map(([k, l, v, t]) => <Choice key={k} active={mm === v} onClick={() => setMm(v)} className="px-3 py-2 text-left"><span className="block text-[12.5px]">{l}</span><span className="block mono text-[10.5px] font-medium" style={{ color: 'var(--muted)' }}>{t}</span></Choice>)}</div></div>
            <Range label="Custom width" min={10} max={500} value={mm} onChange={setMm} fmt={(v) => `${v} mm · ${(v / 10).toFixed(1)} cm`} />
            {fmt === 'pdf' && <div><span className="block text-[12.5px] font-semibold mb-2">Print quality</span><Seg small value={String(dpi)} onChange={(v) => setDpi(+v)} options={[['150', '150 dpi'], ['300', '300 dpi'], ['600', '600 dpi']]} /><div className="text-[11.5px] mt-1.5" style={{ color: 'var(--muted)' }}>Embedded at {mmToPx(mm, dpi)} px, stored uncompressed. Page is exactly {cm} cm + margins.</div></div>}
            {fmt === 'eps' && <div className="text-[12px] rounded-xl p-3" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>EPS is flat vector: gradients use their first colour, and frame text and logos are left out (the space stays clear). Use SVG or PDF for the full design.</div>}
          </>}
          {fmt !== 'svg' && <Switch on={transparent && transparentOk} onChange={setTransparent} label="Transparent background" hint={transparentOk ? 'Keeps the area behind the code empty' : 'Set the background to “Clear” in Style first'} />}
        </motion.div>
      </AnimatePresence>
      <TextIn label="File name" value={fname} onChange={setFname} ph={name} />
      <div className="flex flex-wrap gap-2.5 pt-1">
        <Btn solid icon="download" busy={busy === true} disabled={!!busy} onClick={() => run('file')} className="!px-7 !py-3">Download {fmt.toUpperCase()}</Btn>
        <Btn icon="copy" onClick={() => run('copy')} disabled={!!busy}>Copy image</Btn>
        {canShare && <Btn icon="share" onClick={() => run('share')} disabled={!!busy}>Share</Btn>}
      </div>
    </div>
  )
}
