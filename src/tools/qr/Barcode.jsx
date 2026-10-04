import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Btn, Panel, Label, Choice, Seg, Switch, Range, Color, TextIn, Tabs, SPRING, useToast, CountText } from './ui.jsx'
import { useStore } from './store.js'
import { BARCODES, validateBarcode, makeBarcode } from '../../lib/qr/barcode.js'
import { decodeSource } from '../../lib/qr/zx.js'
import { canvasBlob } from '../../lib/qr/render.js'
import { copyPng, slug } from '../../lib/qr/exportKit.js'
import { download, recentAction } from '../../lib/utils.js'

const fit = (svg) => svg.replace(/width="\d+" height="\d+"/, (m) => { const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(m); return `viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"` })
const sizedSvg = (svg, w, h) => svg.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)
const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })

async function rasterize(res, px) {
  const vb = res.svg.includes('viewBox') ? res.svg : res.svg.replace(/width="(\d+)" height="(\d+)"/, 'viewBox="0 0 $1 $2" width="$1" height="$2"')
  const h = Math.round((px * res.h) / res.w)
  const img = await load('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(vb.replace(/width="\d+" height="\d+"/, `width="${px}" height="${h}"`)))
  const c = document.createElement('canvas'); c.width = px; c.height = h
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, px, h)
  return c
}

export default function Barcode() {
  const [toastNode, toast] = useToast()
  const [o, setO] = useStore('bc', { fmt: 'EAN13', text: '5901234123457', hrt: true, quiet: true, fg: '#111111', bg: '#FFFFFF', ec: 'M', px: 1200 })
  const def = BARCODES.find((d) => d.id === o.fmt) || BARCODES[0]
  const upd = (p) => setO((c) => ({ ...c, ...p }))
  const [grp, setGrp] = useState(def.group)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [check, setCheck] = useState(null)
  const seq = useRef(0)
  const problem = validateBarcode(def, o.text)
  useEffect(() => {
    const my = ++seq.current
    if (problem) { setErr(problem); setRes(null); setCheck(null); return }
    const id = setTimeout(async () => {
      try {
        const r = await makeBarcode(def, o.text, { hrt: o.hrt, quiet: o.quiet, fg: o.fg, bg: o.bg, ec: o.ec, scale: 4 })
        if (my !== seq.current) return
        setRes(r); setErr(''); setCheck('pending')
        const c = await rasterize(r, Math.min(1400, Math.max(500, r.w * 6)))
        const w = document.createElement('canvas'); w.width = c.width + 120; w.height = c.height + 120; const x = w.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(c, 60, 60)
        const d = await decodeSource(w, { formats: [def.id === 'ITF' ? 'ITF' : def.id], max: 1, maxDim: 1600 }).catch(() => ({ items: [] }))
        if (my !== seq.current) return
        const t = d.items[0]?.text
        setCheck(t ? { ok: true, text: t } : { ok: false })
      } catch (e) { if (my === seq.current) { setErr(e.message || 'Could not encode'); setRes(null); setCheck(null) } }
    }, 250)
    return () => clearTimeout(id)
  }, [o.fmt, o.text, o.hrt, o.quiet, o.fg, o.bg, o.ec])
  const pick = (d) => { setGrp(d.group); upd({ fmt: d.id, text: d.sample }) }
  const name = `barcode-${slug(def.name)}-${slug(o.text)}`
  const dl = async (kind) => {
    if (!res) return
    try {
      if (kind === 'svg') { download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n` + (res.svg.includes('viewBox') ? res.svg : res.svg.replace(/width="(\d+)" height="(\d+)"/, 'viewBox="0 0 $1 $2" width="$1" height="$2"'))], { type: 'image/svg+xml' }), name + '.svg'); toast('Saved SVG') }
      else { const b = await canvasBlob(await rasterize(res, o.px)); if (kind === 'copy') { await copyPng(b); toast('Copied image') } else { download(b, `${name}.png`); toast(`Saved ${o.px}px PNG`) } }
      recentAction('Barcode ' + def.name)
    } catch (e) { toast(e.message || 'Export failed', true) }
  }
  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] items-start">
      <div className="space-y-4 lg:sticky lg:top-24 order-2 lg:order-1">
        <Panel pad={false} className="overflow-hidden" delay={0.02}>
          <div className="relative p-6 sm:p-10 grid place-items-center" style={{ minHeight: 380, background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--copper) 11%, var(--surface)) 0%, var(--surface) 70%)' }}>
            <AnimatePresence mode="wait" initial={false}>
              {res ? (
                <motion.div key={res.svg.length + o.fg + o.bg} initial={{ opacity: 0, scale: 0.9, rotateX: -20 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} exit={{ opacity: 0 }} transition={SPRING} className="rounded-xl overflow-hidden" style={{ width: `min(100%, ${def.group === '2D' ? 300 : 460}px)`, aspectRatio: `${res.w} / ${res.h}`, padding: 10, boxSizing: "content-box", boxShadow: '0 24px 34px -18px rgba(0,0,0,.4)', background: o.bg }} dangerouslySetInnerHTML={{ __html: fit(res.svg) }} />
              ) : (
                <motion.div key="err" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center max-w-xs"><span style={{ color: 'var(--copper)' }}><QIco n="barcode" s={40} /></span><div className="text-[13.5px] font-semibold mt-3">{err || 'Preparing…'}</div></motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line">
            <div className="flex items-center gap-2 text-[12.5px]">
              {check === 'pending' && <><motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ color: 'var(--muted)' }}><QIco n="refresh" s={15} /></motion.span><span style={{ color: 'var(--muted)' }}>Verifying with the decoder…</span></>}
              {check?.ok && <motion.span initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING} className="inline-flex items-center gap-1.5 font-bold" style={{ color: '#2F9C6B' }}><QIco n="check" s={15} w={3} />Verified · reads back as <span className="mono">{check.text.length > 24 ? check.text.slice(0, 24) + '…' : check.text}</span></motion.span>}
              {check?.ok === false && <span className="inline-flex items-center gap-1.5 font-bold" style={{ color: '#C3423F' }}><QIco n="warn" s={15} />Decoder could not read this — try more contrast</span>}
            </div>
            <div className="flex gap-1.5"><Btn small solid icon="download" disabled={!res} onClick={() => dl('png')}>PNG</Btn><Btn small icon="download" disabled={!res} onClick={() => dl('svg')}>SVG</Btn><Btn small icon="copy" disabled={!res} onClick={() => dl('copy')} title="Copy image" /></div>
          </div>
        </Panel>
      </div>
      <Panel delay={0.06} className="order-1 lg:order-2 min-w-0">
        <Label right={<span className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{BARCODES.length} formats</span>}>Barcode type</Label>
        <Tabs small wrap value={grp} onChange={(g) => setGrp(g)} tabs={[['Retail', 'Retail'], ['Linear', 'Linear'], ['2D', '2D matrix']]} />
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {BARCODES.filter((d) => d.group === grp).map((d, i) => (
              <motion.div key={d.id} layout initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SPRING, delay: i * 0.03 }}>
                <Choice active={d.id === o.fmt} onClick={() => pick(d)} className="w-full px-3 py-2.5 text-left flex items-center gap-2.5"><span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><QIco n={d.group === '2D' ? 'qr' : 'barcode'} s={16} /></span><span className="text-[13px]">{d.name}</span></Choice>
              </motion.div>))}
          </AnimatePresence>
        </div>
        <div className="mt-5 space-y-4">
          <div>
            <TextIn label="Value to encode" value={o.text} onChange={(text) => upd({ text })} ph={def.sample} mono area={def.id === 'PDF417'} />
            <AnimatePresence mode="wait" initial={false}><motion.div key={problem || def.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12px] mt-1.5 flex items-start gap-1.5 font-medium" style={{ color: problem ? '#C3423F' : 'var(--muted)' }}><span className="mt-0.5 shrink-0"><QIco n={problem ? 'warn' : 'bulb'} s={13} /></span>{problem || def.hint}</motion.div></AnimatePresence>
            <button type="button" className="text-[12px] font-semibold mt-1.5" style={{ color: 'var(--copper)' }} onClick={() => upd({ text: def.sample })}>Use sample value</button>
          </div>
          <div className="grid grid-cols-2 gap-3"><Color label="Bars" value={o.fg} onChange={(fg) => upd({ fg })} /><Color label="Background" value={o.bg} onChange={(bg) => upd({ bg })} /></div>
          {['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39', 'Code93', 'ITF', 'Codabar'].includes(def.id) && <Switch on={o.hrt} onChange={(hrt) => upd({ hrt })} label="Show the number underneath" />}
          <Switch on={o.quiet} onChange={(quiet) => upd({ quiet })} label="Quiet zone (white border)" hint="Scanners need it — leave on for printing" />
          {(def.id === 'Aztec' || def.id === 'PDF417') && <div><span className="block text-[12.5px] font-semibold mb-1.5">Error correction</span><Seg small value={o.ec} onChange={(ec) => upd({ ec })} options={[['L', 'Low'], ['M', 'Medium'], ['Q', 'High'], ['H', 'Max']]} /></div>}
          <Range label="PNG width" min={300} max={8192} step={100} value={o.px} onChange={(px) => upd({ px })} fmt={(v) => v + ' px'} />
        </div>
      </Panel>
      {toastNode}
    </div>
  )
}
