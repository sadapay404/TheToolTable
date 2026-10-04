import React, { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { QIco, Tabs, Btn, Panel, SPRING, useToast } from './ui.jsx'
import { useQR, useStore, uid } from './store.js'
import { buildQR, lightStyle } from '../../lib/qr/render.js'
import { typeById, SAMPLE } from '../../lib/qr/payloads.js'
import { toCanvas } from '../../lib/qr/render.js'
import { copyPng, pngBlob, slug } from '../../lib/qr/exportKit.js'
import { download } from '../../lib/utils.js'
import Meter from './Meter.jsx'
import Content from './Content.jsx'
import Export from './Export.jsx'
import { TemplatesPanel, StylePanel, LogoPanel, FramePanel } from './Design.jsx'

const SUB = [['content', 'Content', 'edit'], ['templates', 'Templates', 'templates'], ['style', 'Style', 'palette'], ['logo', 'Logo', 'logo'], ['frame', 'Frame', 'frame'], ['export', 'Export', 'download']]

function Tilt({ children }) {
  const ref = useRef()
  const mx = useMotionValue(0), my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [9, -9]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-11, 11]), { stiffness: 200, damping: 20 })
  return (
    <div style={{ perspective: 1000 }} onPointerMove={(e) => { const b = ref.current.getBoundingClientRect(); mx.set((e.clientX - b.left) / b.width - 0.5); my.set((e.clientY - b.top) / b.height - 0.5) }} onPointerLeave={() => { mx.set(0); my.set(0) }}>
      <motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}>{children}</motion.div>
    </div>
  )
}

export default function Create() {
  const { payload, content, style, setStyle, go } = useQR()
  const [sub, setSub] = useStore('sub', 'content')
  const [toastNode, toast] = useToast()
  const T = typeById(content.type)
  const empty = !payload
  const text = payload || SAMPLE.url
  const built = useMemo(() => { try { return { r: buildQR(text, style, 'm') } } catch (e) { return { err: e } } }, [text, style])
  const [saved, setSaved] = useState(0)
  const [designs, setDesigns] = useStore('designs', [])
  const name = `qr-${slug(T.id)}`

  const saveDesign = async () => {
    try {
      const c = await toCanvas(built.r, 220, { bg: '#FFFFFF' })
      setDesigns((d) => [{ id: uid(), t: Date.now(), type: content.type, vals: content.vals[content.type], style: lightStyle(style), payload, thumb: c.toDataURL('image/png') }, ...d].slice(0, 60))
      setSaved((n) => n + 1); toast('Saved to Library')
    } catch { toast('Could not save', true) }
  }
  const svgHtml = built.r ? built.r.svg.replace('__W__', '100%').replace('__H__', '100%') : ''
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      {/* preview column */}
      <div className="lg:sticky lg:top-24 space-y-4">
        <Panel pad={false} className="overflow-hidden" delay={0.02}>
          <div className="relative p-6 sm:p-8" style={{ background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--copper) 12%, var(--surface)) 0%, var(--surface) 70%)' }}>
            <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(circle, color-mix(in srgb, var(--ink) 11%, transparent) 1px, transparent 1.3px)', backgroundSize: '20px 20px', maskImage: 'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 74%)', WebkitMaskImage: 'radial-gradient(ellipse at 50% 45%, #000 0%, transparent 74%)' }} />
            <Tilt>
              <motion.div key={built.r ? built.r.svg.length : 0} initial={{ scale: 0.93, opacity: 0.4 }} animate={{ scale: 1, opacity: empty ? 0.3 : 1 }} transition={SPRING} className="relative mx-auto" style={{ width: 'min(100%, 340px)', filter: 'drop-shadow(0 24px 28px rgba(0,0,0,.22))', transform: 'translateZ(30px)' }}>
                {built.r ? <div style={{ aspectRatio: `${built.r.W} / ${built.r.H}` }} dangerouslySetInnerHTML={{ __html: svgHtml }} /> : <div className="aspect-square grid place-items-center text-[13px] font-semibold text-center p-6" style={{ color: 'var(--muted)' }}>This text is too long for a QR code. Shorten it a little.</div>}
              </motion.div>
            </Tilt>
            <AnimatePresence>{empty && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center pointer-events-none"><span className="rounded-full px-4 py-2 text-[13px] font-bold" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>Fill in the form to begin</span></motion.div>}</AnimatePresence>
          </div>
          <div className="px-5 py-3.5 flex items-center justify-between gap-3 border-t border-line">
            <div className="min-w-0 flex items-center gap-2.5"><span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><QIco n={T.icon} s={16} /></span>
              <div className="min-w-0"><div className="text-[13px] font-semibold leading-tight">{T.label}</div><div className="mono text-[11px] truncate" style={{ color: 'var(--muted)' }}>{built.r ? `v${built.r.info.version} · ${built.r.info.n}×${built.r.info.n} · ECC ${built.r.info.ecc}` : '—'}</div></div></div>
            <div className="flex gap-1.5 shrink-0">
              <Btn small icon="download" solid disabled={empty || !built.r} onClick={async () => { try { download(await pngBlob(built.r, 2048), `${name}.png`); toast('Saved PNG') } catch (e) { toast(e.message, true) } }}>PNG</Btn>
              <Btn small icon="copy" disabled={empty || !built.r} onClick={async () => { try { await copyPng(await pngBlob(built.r, 1024)); toast('Copied to clipboard') } catch { toast('Clipboard blocked by browser', true) } }} title="Copy image" />
              <motion.span key={saved} animate={{ scale: [1, 1.25, 1] }} className="inline-flex"><Btn small icon="heart" disabled={empty || !built.r} onClick={saveDesign} title="Save to library" /></motion.span>
            </div>
          </div>
        </Panel>
        {built.r && <Panel delay={0.1} className="!p-4"><Meter r={built.r} /></Panel>}
      </div>
      {/* controls column */}
      <Panel delay={0.06} className="min-w-0">
        <Tabs value={sub} onChange={setSub} tabs={SUB} small wrap className="mb-5" />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={sub} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            {sub === 'content' && <Content />}
            {sub === 'templates' && <TemplatesPanel />}
            {sub === 'style' && <StylePanel />}
            {sub === 'logo' && <LogoPanel />}
            {sub === 'frame' && <FramePanel />}
            {sub === 'export' && (built.r ? <Export result={built.r} name={name} toast={toast} /> : null)}
          </motion.div>
        </AnimatePresence>
      </Panel>
      {toastNode}
    </div>
  )
}
