import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { QIco, Btn, Panel, Label, Seg, Switch, Range, TextIn, Select, Drop, SPRING, useToast, CountText } from './ui.jsx'
import { useQR, useStore } from './store.js'
import { buildQR } from '../../lib/qr/render.js'
import { bulkZip, bulkPdf } from '../../lib/qr/exportKit.js'
import { parseCSV } from '../../lib/qr/csv.js'
import { download, recentAction } from '../../lib/utils.js'

const MAX = 1000
function scanPasteLines(value) {
  const entries = []; let count = 0, start = 0
  for (let i = 0; i <= value.length; i++) {
    if (i < value.length && value[i] !== '\n' && value[i] !== '\r') continue
    const line = value.slice(start, i).trim()
    if (line) { count++; if (entries.length < MAX + 1) entries.push(line) }
    if (value[i] === '\r' && value[i + 1] === '\n') i++
    start = i + 1
  }
  return { entries, count }
}
const wrap = (kind, value) => {
  const v = value.trim()
  if (!v) return ''
  if (kind === 'tel') { const digits = v.replace(/\D/g, ''); return digits ? 'tel:' + (v.startsWith('+') ? '+' : '') + digits : '' }
  if (kind === 'mail') return 'mailto:' + v.replace(/[\r\n]/g, '')
  if (kind === 'wa') { const digits = v.replace(/\D/g, ''); return digits ? 'https://wa.me/' + digits : '' }
  if (kind === 'url') return /^https?:\/\//i.test(v) ? v : /^[a-z][a-z0-9+.-]*:/i.test(v) ? '' : 'https://' + v
  return v
}
export default function Bulk() {
  const { style, go } = useQR()
  const [toastNode, toast] = useToast()
  const [src, setSrc] = useStore('bsrc', 'paste')
  const [paste, setPaste] = useStore('bpaste', 'https://example.com/a\nhttps://example.com/b\nhttps://example.com/c')
  const [hasLabel, setHasLabel] = useStore('blabel', false)
  const [kind, setKind] = useStore('bkind', 'raw')
  const [csv, setCsv] = useState(null) // {name, rows}
  const [col, setCol] = useState(0), [lcol, setLcol] = useState(-1), [header, setHeader] = useState(true)
  const [seq, setSeq] = useStore('bseq', { tpl: 'https://example.com/t/{n}', start: 1, count: 24, pad: 4 })
  const [out, setOut] = useStore('bout', { kind: 'zip', fmt: 'png', px: 1024, labels: true, page: 'a4', cols: 3, rows: 4, guides: true, numbered: false })
  const [prog, setProg] = useState(null)
  const abortRef = useRef(null), progressTimer = useRef(0), mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      abortRef.current?.abort()
      clearTimeout(progressTimer.current)
    }
  }, [])
  const up = (p) => setOut((c) => ({ ...c, ...p }))
  const pasteStats = useMemo(() => scanPasteLines(paste), [paste])

  const items = useMemo(() => {
    let list = []
    if (src === 'paste') list = pasteStats.entries.map((l) => { if (hasLabel) { const m = /^([^,\t;]+)[,\t;](.*)$/.exec(l); if (m) return { label: m[1].trim(), text: m[2].trim() } } return { text: l } })
    else if (src === 'csv' && csv) { const rs = header ? csv.rows.slice(1) : csv.rows; list = rs.map((r) => ({ text: (r[col] || '').trim(), label: lcol >= 0 ? (r[lcol] || '').trim() : undefined })) }
    else if (src === 'seq') { const n = Math.max(0, Math.min(MAX, +seq.count || 0)); list = Array.from({ length: n }, (_, i) => { const num = String((+seq.start || 0) + i).padStart(+seq.pad || 0, '0'); return { text: seq.tpl.includes('{n}') ? seq.tpl.replaceAll('{n}', num) : seq.tpl + num, label: num } }) }
    list = list.map((x) => ({ ...x, text: wrap(kind, x.text) })).filter((x) => x.text)
    return list.slice(0, MAX).map((x, i) => ({ ...x, label: out.numbered ? `#${String(i + 1).padStart(String(list.length).length, '0')}${x.label ? ' · ' + x.label : ''}` : x.label, name: (x.label || '') + '-' + String(i + 1).padStart(3, '0') }))
  }, [src, pasteStats, hasLabel, csv, col, lcol, header, seq, kind, out.numbered])
  const sourceCount = src === 'paste' ? pasteStats.count : src === 'csv' && csv ? Math.max(0, csv.rows.length - (header ? 1 : 0)) : src === 'seq' ? +seq.count : 0
  const over = sourceCount > MAX
  const previews = useMemo(() => items.slice(0, 12).map((it) => { try { return buildQR(it.text, style, 'p').svg.replace('__W__', '100%').replace('__H__', '100%') } catch { return '' } }), [items, style])

  const load = async (files) => {
    const file = files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { toast('Choose a CSV file smaller than 8 MB.', true); return }
    try {
      const rows = parseCSV(await file.text())
      if (!rows.length) { toast('That file looks empty', true); return }
      if (mounted.current) { setCsv({ name: file.name, rows }); setCol(0); setLcol(-1) }
    } catch (e) { if (mounted.current) toast(e.message || 'Could not read that CSV', true) }
  }
  const cancelExport = () => {
    const controller = abortRef.current
    if (!controller) return
    controller.abort()
    abortRef.current = null
    clearTimeout(progressTimer.current)
    setProg(null)
  }
  const go2 = async () => {
    if (!items.length || abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    setProg({ i: 0, n: items.length })
    try {
      const onP = (i, n) => { if (mounted.current && !controller.signal.aborted) setProg({ i, n }) }
      if (out.kind === 'zip') {
        const blob = await bulkZip(items, style, { format: out.fmt, px: out.px, labels: out.labels }, onP, controller.signal)
        if (!controller.signal.aborted) download(blob, `qr-codes-${items.length}.zip`)
      } else {
        const blob = await bulkPdf(items, style, { page: out.page, cols: out.cols, rows: out.rows, labels: out.labels, guides: out.guides }, onP, controller.signal)
        if (!controller.signal.aborted) download(blob, `qr-sheet-${items.length}.pdf`)
      }
      if (!controller.signal.aborted && mounted.current) {
        recentAction(`Bulk ${items.length} QR codes`); toast(`Done — ${items.length} codes`); setProg({ i: items.length, n: items.length, done: true })
        clearTimeout(progressTimer.current); progressTimer.current = setTimeout(() => { if (mounted.current) setProg(null) }, 2400)
      }
    } catch (e) {
      if (!controller.signal.aborted && mounted.current) { toast(e.message || 'Bulk export failed', true); setProg(null) }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }
  const perPage = out.cols * out.rows
  const csvCols = csv ? Math.max(...csv.rows.slice(0, 50).map((r) => r.length)) : 0
  const colName = (i) => (csv && header && csv.rows[0][i] ? csv.rows[0][i] : `Column ${i + 1}`)
  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] items-start">
      <div className="space-y-6 min-w-0">
        <Panel delay={0.02}>
          <Label right={<motion.span key={items.length} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="mono text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--copper)' }}><CountText value={items.length} format={(v) => Math.round(v)} /> codes</motion.span>}>1 · Your list</Label>
          <Seg value={src} onChange={setSrc} options={[['paste', 'Paste list'], ['csv', 'CSV file'], ['seq', 'Number series']]} />
          <div className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={src} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
                {src === 'paste' && <>
                  <TextIn area rows={7} mono maxLength={100000} value={paste} onChange={setPaste} ph={'One entry per line…\nhttps://…'} />
                  <Switch on={hasLabel} onChange={setHasLabel} label="First column is a label" hint="Lines like  Table 4, https://…  print “Table 4” under each code" />
                </>}
                {src === 'csv' && <>
                  {!csv ? <Drop accept=".csv,.txt,.tsv,text/*" icon="file" onFiles={load} label="Drop a CSV / TXT file or click" /> : <>
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-line px-3.5 py-2.5" style={{ background: 'var(--surface2)' }}><span className="text-[13px] font-semibold truncate"><QIco n="file" s={15} className="inline mr-2" />{csv.name} · {csv.rows.length} rows</span><button type="button" className="text-[12px] font-semibold" style={{ color: 'var(--copper)' }} onClick={() => setCsv(null)}>Change</button></div>
                    <Switch on={header} onChange={setHeader} label="First row is a header" />
                    <div className="grid grid-cols-2 gap-3"><Select label="Code content" value={String(col)} onChange={(v) => setCol(+v)} options={Array.from({ length: csvCols }, (_, i) => [String(i), colName(i)])} /><Select label="Label (optional)" value={String(lcol)} onChange={(v) => setLcol(+v)} options={[['-1', 'No label'], ...Array.from({ length: csvCols }, (_, i) => [String(i), colName(i)])]} /></div>
                  </>}
                </>}
                {src === 'seq' && <>
                  <TextIn label="Template — {n} becomes the number" value={seq.tpl} onChange={(tpl) => setSeq({ ...seq, tpl })} mono />
                  <div className="grid grid-cols-3 gap-3"><TextIn label="Start" type="number" value={seq.start} onChange={(v) => setSeq({ ...seq, start: v })} /><TextIn label="How many" type="number" value={seq.count} onChange={(v) => setSeq({ ...seq, count: v })} /><TextIn label="Zero-pad" type="number" value={seq.pad} onChange={(v) => setSeq({ ...seq, pad: v })} /></div>
                </>}
                <Select label="Treat each entry as" value={kind} onChange={setKind} options={[['raw', 'Text / link as written'], ['url', 'Website (adds https://)'], ['tel', 'Phone number'], ['mail', 'Email address'], ['wa', 'WhatsApp number']]} />
                {over && <div className="text-[12px] font-semibold" style={{ color: '#C3423F' }}>Only the first {MAX} entries are used.</div>}
              </motion.div>
            </AnimatePresence>
          </div>
        </Panel>
        <Panel delay={0.08}>
          <Label right={<button type="button" className="text-[12px] font-semibold" style={{ color: 'var(--copper)' }} onClick={() => go('create')}>Change design →</button>}>Preview · uses your Create design</Label>
          {items.length === 0 ? <div className="text-[13px] py-6 text-center" style={{ color: 'var(--muted)' }}>Add some entries to see them here.</div> : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {previews.map((h, i) => <motion.div key={i + items[i].text} initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ ...SPRING, delay: i * 0.03 }} whileHover={{ y: -4 }} className="rounded-xl border border-line p-1.5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow)' }}><div className="aspect-square" dangerouslySetInnerHTML={{ __html: h }} /><div className="text-[10.5px] text-center mt-1 truncate font-semibold" style={{ color: 'var(--muted)' }}>{items[i].label || items[i].text.replace(/^https?:\/\//, '')}</div></motion.div>)}
              {items.length > 12 && <div className="rounded-xl grid place-items-center text-[12px] font-bold" style={{ background: 'var(--surface2)', color: 'var(--muted)' }}>+{items.length - 12} more</div>}
            </div>
          )}
        </Panel>
      </div>
      <Panel delay={0.06} className="lg:sticky lg:top-24">
        <Label>2 · Output</Label>
        <Seg value={out.kind} onChange={(kind2) => up({ kind: kind2 })} options={[['zip', 'ZIP of images'], ['pdf', 'Printable PDF']]} />
        <div className="mt-4 space-y-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={out.kind} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-4">
              {out.kind === 'zip' ? <>
                <div><span className="block text-[12.5px] font-semibold mb-1.5">Image format</span><Seg small value={out.fmt} onChange={(fmt) => up({ fmt })} options={[['png', 'PNG'], ['svg', 'SVG vector']]} /></div>
                {out.fmt === 'png' && <Range label="Size" min={256} max={4096} step={128} value={out.px} onChange={(px) => up({ px })} fmt={(v) => v + ' px'} />}
                {out.fmt === 'png' && <Switch on={out.labels} onChange={(labels) => up({ labels })} label="Print label under each code" hint="Uses your labels, or the number if you turn numbering on" />}
              </> : <>
                <div><span className="block text-[12.5px] font-semibold mb-1.5">Page</span><Seg small value={out.page} onChange={(page) => up({ page })} options={[['a4', 'A4'], ['letter', 'US Letter']]} /></div>
                <div className="grid grid-cols-2 gap-3"><Range label="Columns" min={1} max={6} value={out.cols} onChange={(cols) => up({ cols })} /><Range label="Rows" min={1} max={10} value={out.rows} onChange={(rows) => up({ rows })} /></div>
                <Switch on={out.labels} onChange={(labels) => up({ labels })} label="Label under each code" />
                <Switch on={out.guides} onChange={(guides) => up({ guides })} label="Cut guides" hint="Dashed boxes to trim along" />
                <div className="text-[12px]" style={{ color: 'var(--muted)' }}>{perPage} per page → <b style={{ color: 'var(--ink)' }}>{Math.max(1, Math.ceil(items.length / perPage))} page{Math.ceil(items.length / perPage) > 1 ? 's' : ''}</b></div>
              </>}
              <Switch on={out.numbered} onChange={(numbered) => up({ numbered })} label="Add numbering" hint="#001, #002… in the label and file names" />
            </motion.div>
          </AnimatePresence>
          <div className="pt-1">
            <Btn solid full icon={out.kind === 'zip' ? 'zip' : 'print'} onClick={go2} disabled={!items.length || !!prog} busy={!!prog && !prog.done} className="!py-3.5">{prog ? (prog.done ? 'Saved!' : `Making ${prog.i} / ${prog.n}…`) : `Generate ${items.length} ${out.kind === 'zip' ? 'files (ZIP)' : 'codes (PDF)'}`}</Btn>
            <AnimatePresence>{prog && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden"><div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div className="h-full rounded-full" style={{ background: prog.done ? '#2F9C6B' : 'var(--copper)' }} animate={{ width: (prog.i / prog.n) * 100 + '%' }} transition={{ duration: 0.2 }} /></div></motion.div>}</AnimatePresence>
            {prog && !prog.done && <Btn full small onClick={cancelExport} className="mt-2">Cancel export</Btn>}
          </div>
        </div>
      </Panel>
      {toastNode}
    </div>
  )
}
