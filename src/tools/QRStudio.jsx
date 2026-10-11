import { useCallback, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs } from './qr/ui.jsx'
import { QRCtx, useStore } from './qr/store.js'
import { DEFAULT_STYLE, withDefaults, lightStyle } from './../lib/qr/render.js'
import { buildPayload, defaultsFor, typeById } from './../lib/qr/payloads.js'
import Create from './qr/Create.jsx'
import Scan from './qr/Scan.jsx'
import Barcode from './qr/Barcode.jsx'
import Bulk from './qr/Bulk.jsx'
import Cards from './qr/Cards.jsx'
import Library from './qr/Library.jsx'

const TABS = [['create', 'Create', 'qr'], ['scan', 'Scan', 'camera'], ['barcode', 'Barcodes', 'barcode'], ['bulk', 'Bulk', 'grid'], ['cards', 'Print cards', 'print'], ['library', 'Library', 'history']]
const LABEL = { create: 'Design a code', scan: 'Read any code', barcode: 'Product & shipping barcodes', bulk: 'Many codes at once', cards: 'Ready-to-print designs', library: 'Saved codes & scan history' }

export default function QRStudio() {
  const [tab, setTab] = useStore('tab', 'create')
  const [content, setContentRaw] = useStore('content', { type: 'url', vals: {} })
  const [styleRaw, setStyleRaw] = useStore('style', DEFAULT_STYLE)
  // heavy images are kept in memory only
  const [media, setMedia] = useState({ dots: null, bg: null, logo: null })
  const style = useMemo(() => { const s = withDefaults(styleRaw); return { ...s, dots: { ...s.dots, image: media.dots }, bg: { ...s.bg, image: media.bg }, logo: { ...s.logo, upload: media.logo } } }, [styleRaw, media])
  const setStyle = useCallback((fn) => {
    const candidate = typeof fn === 'function' ? fn(style) : fn
    const next = withDefaults(candidate)
    setMedia({ dots: next.dots.image || null, bg: next.bg.image || null, logo: next.logo.upload || null })
    setStyleRaw(lightStyle(next))
  }, [style, setStyleRaw])
  const setContent = useCallback((fn) => setContentRaw((c) => (typeof fn === 'function' ? fn(c) : fn)), [setContentRaw])
  const type = typeById(content.type).id
  const vals = content.vals[type] || defaultsFor(type)
  const payload = useMemo(() => buildPayload(type, vals), [type, vals])
  const editFrom = useCallback((edit) => { if (!edit) return; setContent((c) => ({ type: edit.type, vals: { ...c.vals, [edit.type]: { ...defaultsFor(edit.type), ...edit.v } } })); setTab('create') }, [setContent, setTab])
  const ctx = useMemo(() => ({ content: { ...content, type }, setContent, payload, style, setStyle, go: setTab, editFrom }), [content, type, setContent, payload, style, setStyle, setTab, editFrom])

  return (
    <QRCtx.Provider value={ctx}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onChange={setTab} tabs={TABS} />
          <AnimatePresence mode="wait" initial={false}><motion.span key={tab} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="eyebrow hidden md:inline">{LABEL[tab]}</motion.span></AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 22, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}>
            {tab === 'create' && <Create />}
            {tab === 'scan' && <Scan />}
            {tab === 'barcode' && <Barcode />}
            {tab === 'bulk' && <Bulk />}
            {tab === 'cards' && <Cards />}
            {tab === 'library' && <Library />}
          </motion.div>
        </AnimatePresence>
      </div>
    </QRCtx.Provider>
  )
}
