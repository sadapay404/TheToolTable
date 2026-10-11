import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Btn, Panel, Label, Tabs, TextIn, Drop, SPRING, useToast, CountText } from './ui.jsx'
import { useQR, useStore } from './store.js'
import { DEFAULT_STYLE, merge } from '../../lib/qr/render.js'
import { typeById } from '../../lib/qr/payloads.js'
import { download } from '../../lib/utils.js'
import ResultCard from './Result.jsx'
import { useDecorativeMotion } from '../../lib/motion.js'

const when = (t) => { const d = new Date(t), n = Date.now() - t; if (n < 60e3) return 'just now'; if (n < 3600e3) return Math.floor(n / 60e3) + ' min ago'; if (n < 86400e3) return Math.floor(n / 3600e3) + ' h ago'; return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) }
function Empty({ icon, title, sub, action }) {
  const decorativeMotion = useDecorativeMotion()
  return <div className="py-14 text-center"><motion.div animate={decorativeMotion ? { y: [0, -6, 0] } : { y: 0 }} transition={decorativeMotion ? { repeat: Infinity, duration: 3.2 } : { duration: 0 }} className="inline-block" style={{ color: 'var(--copper)' }}><QIco n={icon} s={36} /></motion.div><div className="font-semibold mt-3 text-[14.5px]">{title}</div><div className="text-[12.5px] mt-1 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>{sub}</div>{action && <div className="mt-4">{action}</div>}</div>
}

function Designs() {
  const { editFrom, setStyle, go } = useQR()
  const [designs, setDesigns] = useStore('designs', [])
  const [q, setQ] = useState('')
  const list = designs.filter((d) => !q || (d.payload + ' ' + typeById(d.type).label).toLowerCase().includes(q.toLowerCase()))
  const open = (d) => { setStyle(merge(DEFAULT_STYLE, d.style)); editFrom({ type: d.type, v: d.vals }) }
  return (
    <div>
      <div className="flex items-center gap-3 mb-4"><div className="flex-1"><TextIn value={q} onChange={setQ} ph="Search saved codes…" /></div><span className="mono text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}>{designs.length} saved</span></div>
      {designs.length === 0 ? <Empty icon="heart" title="Nothing saved yet" sub="Press the heart in Create to keep a design here, ready to edit again." action={<Btn small solid onClick={() => go('create')}>Go to Create</Btn>} /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((d, i) => (
              <motion.div key={d.id} layout initial={{ opacity: 0, y: 20, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ ...SPRING, delay: Math.min(i, 12) * 0.03 }} whileHover={{ y: -5 }} className="rounded-2xl border border-line overflow-hidden group" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
                <button type="button" onClick={() => open(d)} className="block w-full p-3 text-left" title="Edit this design"><div className="aspect-square rounded-xl grid place-items-center overflow-hidden" style={{ background: '#fff' }}><img src={d.thumb} alt="" className="w-full h-full object-contain" /></div></button>
                <div className="px-3 pb-3"><div className="text-[12.5px] font-bold truncate">{typeById(d.type).label}</div><div className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>{d.payload.replace(/^https?:\/\//, '').slice(0, 40)}</div>
                  <div className="flex items-center justify-between mt-2"><span className="text-[10.5px]" style={{ color: 'var(--muted)' }}>{when(d.t)}</span><span className="flex gap-1"><Btn small icon="edit" onClick={() => open(d)} title="Edit" /><Btn small icon="trash" onClick={() => setDesigns((l) => l.filter((x) => x.id !== d.id))} title="Delete" /></span></div></div>
              </motion.div>))}
          </AnimatePresence>
        </div>)}
      {designs.length > 0 && list.length === 0 && <div className="text-center text-[13px] py-8" style={{ color: 'var(--muted)' }}>No matches.</div>}
    </div>
  )
}

function History() {
  const { editFrom } = useQR()
  const [toastNode, toast] = useToast()
  const [scans, setScans] = useStore('scans', [])
  const [q, setQ] = useState(''), [f, setF] = useState('all'), [openId, setOpenId] = useState(null), [sure, setSure] = useState(false)
  const types = useMemo(() => [...new Set(scans.map((s) => s.label).filter(Boolean))], [scans])
  const list = scans.filter((s) => (f === 'all' || (f === 'fav' ? s.fav : s.label === f)) && (!q || (s.text + ' ' + (s.title || '') + ' ' + (s.label || '')).toLowerCase().includes(q.toLowerCase())))
  const csv = () => { const e = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`; download(new Blob([['time,type,format,title,text', ...scans.map((s) => [new Date(s.t).toISOString(), s.label, s.format, s.title, s.text].map(e).join(','))].join('\n')], { type: 'text/csv' }), 'scan-history.csv') }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3"><div className="flex-1 min-w-[200px]"><TextIn value={q} onChange={setQ} ph="Search scans…" /></div><Btn small icon="download" disabled={!scans.length} onClick={csv}>CSV</Btn>
        <Btn small icon="trash" disabled={!scans.length} onClick={() => { if (sure) { setScans([]); setSure(false); toast('History cleared') } else { setSure(true); setTimeout(() => setSure(false), 3000) } }} tone={sure ? '#C3423F' : undefined}>{sure ? 'Tap again to clear' : 'Clear'}</Btn></div>
      <div className="flex flex-wrap gap-2 mb-4">{[['all', 'All'], ['fav', 'Favourites'], ...types.map((t) => [t, t])].map(([k, l]) => <motion.button key={k} type="button" whileTap={{ scale: 0.92 }} onClick={() => setF(k)} className="chip" style={{ background: f === k ? 'var(--ink)' : 'var(--surface)', color: f === k ? 'var(--bg)' : 'var(--ink)', fontWeight: 700 }}>{l}</motion.button>)}</div>
      {scans.length === 0 ? <Empty icon="scan" title="No scans yet" sub="Everything you scan is remembered here — only on this device." /> : list.length === 0 ? <div className="text-center text-[13px] py-8" style={{ color: 'var(--muted)' }}>Nothing matches.</div> : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {list.map((s, i) => (
              <motion.div key={s.id} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ ...SPRING, delay: Math.min(i, 10) * 0.025 }} className="rounded-2xl border border-line overflow-hidden" style={{ background: 'var(--surface)' }}>
                <div className="flex items-center gap-3 px-3.5 py-3 cursor-pointer" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                  <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><QIco n={s.format && !/QR/i.test(s.format) ? 'barcode' : 'qr'} s={17} /></span>
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-bold truncate">{s.title || s.text}</div><div className="text-[11.5px] truncate" style={{ color: 'var(--muted)' }}>{s.label} · {s.format} · {when(s.t)}</div></div>
                  <button type="button" aria-label="Favourite" onClick={(e) => { e.stopPropagation(); setScans((l) => l.map((x) => (x.id === s.id ? { ...x, fav: !x.fav } : x))) }} style={{ color: s.fav ? '#E8A100' : 'var(--muted)' }}><motion.span whileTap={{ scale: 1.5, rotate: 20 }} className="block"><QIco n="star" s={18} style={{ fill: s.fav ? '#E8A100' : 'none' }} /></motion.span></button>
                  <button type="button" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setScans((l) => l.filter((x) => x.id !== s.id)) }} style={{ color: 'var(--muted)' }}><QIco n="trash" s={16} /></button>
                </div>
                <AnimatePresence initial={false}>{openId === s.id && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="px-3.5 pb-3.5"><ResultCard item={{ text: s.text, format: s.format }} onEdit={editFrom} toast={toast} compact /></div></motion.div>}</AnimatePresence>
              </motion.div>))}
          </AnimatePresence>
        </div>)}
      {toastNode}
    </div>
  )
}

function Backup() {
  const [toastNode, toast] = useToast()
  const [designs, setDesigns] = useStore('designs', []), [presets, setPresets] = useStore('presets', []), [scans, setScans] = useStore('scans', [])
  const [sure, setSure] = useState(false)
  const exp = () => { download(new Blob([JSON.stringify({ app: 'TheToolTable QR', v: 1, designs, presets, scans })], { type: 'application/json' }), 'qr-library-backup.json'); toast('Backup saved') }
  const imp = async (files) => {
    try {
      const file = files?.[0]
      if (!file) return
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a backup file smaller than 20 MB.')
      const j = JSON.parse(await file.text())
      if (j.app !== 'TheToolTable QR') throw new Error('Not a QR library backup')
      if (!Array.isArray(j.designs) || !Array.isArray(j.presets) || !Array.isArray(j.scans)) throw new Error('This backup is missing a valid library section.')
      const mix = (cur, inc, limit, sort = false) => {
        const ids = new Set(), merged = []
        for (const item of [...inc, ...cur]) {
          if (!item || typeof item.id !== 'string' || ids.has(item.id)) continue
          ids.add(item.id); merged.push(item)
        }
        if (sort) merged.sort((a, b) => (Number(b.t) || 0) - (Number(a.t) || 0))
        return merged.slice(0, limit)
      }
      setDesigns((current) => mix(current, j.designs, 60, true))
      setPresets((current) => mix(current, j.presets, 100))
      setScans((current) => mix(current, j.scans, 300, true))
      toast('Backup merged into your library')
    } catch (e) { toast(e.message || 'Could not read that file', true) }
  }
  const stat = [['Saved designs', designs.length, 'heart'], ['My style presets', presets.length, 'palette'], ['Scans remembered', scans.length, 'history']]
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <Label>On this device</Label>
        {stat.map(([l, n, ic], i) => <motion.div key={l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...SPRING }} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5" style={{ background: 'var(--surface2)' }}><span style={{ color: 'var(--copper)' }}><QIco n={ic} s={20} /></span><span className="flex-1 text-[13.5px] font-semibold">{l}</span><span className="display text-2xl"><CountText value={n} format={(v) => Math.round(v)} /></span></motion.div>)}
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--muted)' }}>Nothing is uploaded. Everything lives in this browser — a backup file lets you move it to another device.</div>
      </div>
      <div className="space-y-3">
        <Label>Backup &amp; restore</Label>
        <Btn solid full icon="download" onClick={exp}>Download backup (.json)</Btn>
        <Drop accept=".json,application/json" icon="upload" compact onFiles={imp} label="Restore from a backup file" />
        <Btn full icon="trash" tone={sure ? '#C3423F' : undefined} onClick={() => { if (sure) { setDesigns([]); setPresets([]); setScans([]); setSure(false); toast('Library emptied') } else { setSure(true); setTimeout(() => setSure(false), 3000) } }}>{sure ? 'Tap again — this removes everything' : 'Erase my library'}</Btn>
      </div>
      {toastNode}
    </div>
  )
}

export default function Library() {
  const [sub, setSub] = useStore('libsub', 'designs')
  return (
    <Panel delay={0.02}>
      <div className="mb-5"><Tabs small value={sub} onChange={setSub} tabs={[['designs', 'Saved codes', 'heart'], ['history', 'Scan history', 'history'], ['backup', 'Backup', 'save']]} /></div>
      <AnimatePresence mode="wait" initial={false}><motion.div key={sub} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        {sub === 'designs' && <Designs />}{sub === 'history' && <History />}{sub === 'backup' && <Backup />}
      </motion.div></AnimatePresence>
    </Panel>
  )
}
