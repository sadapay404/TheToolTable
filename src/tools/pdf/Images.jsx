import { useEffect, useRef, useState } from 'react'
import { Reorder } from 'framer-motion'
import { Panel, Label, Seg, Btn, Range, Drop, Bar, KIco, SPRING, fmtSize, uid } from '../kit/ui.jsx'
import { imagesToPdf, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from '../../lib/pdf/engine.js'

export default function Images({ publish, toast }) {
  const [items, setItems] = useState([]), [size, setSize] = useState('a4'), [orient, setOrient] = useState('auto'), [margin, setMargin] = useState(8), [busy, setBusy] = useState(0)
  const urls = useRef(new Set()), itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear() }, [])
  const add = (fs) => {
    const imageFiles = fs.filter((f) => /^image\//i.test(f.type) || /\.(?:jpe?g|png|webp|gif|avif|bmp|tiff?)$/i.test(f.name))
    if (!imageFiles.length) { toast('Choose JPG, PNG, WebP or another image file.', 'err'); return }
    let bytes = itemsRef.current.reduce((sum, it) => sum + it.file.size, 0)
    const room = 500 - itemsRef.current.length, accepted = []
    for (const file of imageFiles.slice(0, room)) {
      if (!Number.isFinite(Number(file.size)) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) { toast(`${file.name || 'Image'}: choose a file under 25 MB.`, 'err'); continue }
      if (bytes + file.size > MAX_PDF_BYTES) { toast('Combined image files are limited to 100 MB.', 'err'); continue }
      bytes += file.size; accepted.push(file)
    }
    if (imageFiles.length > room) toast('A PDF can contain up to 500 images.', 'err')
    const added = accepted.map((file) => { const url = URL.createObjectURL(file); urls.current.add(url); return { id: uid(), file, url } })
    if (added.length) setItems((a) => [...a, ...added])
  }
  const remove = (id) => {
    const item = itemsRef.current.find((it) => it.id === id)
    if (item) { URL.revokeObjectURL(item.url); urls.current.delete(item.url) }
    setItems((a) => a.filter((it) => it.id !== id))
  }
  const clear = () => {
    for (const it of itemsRef.current) { URL.revokeObjectURL(it.url); urls.current.delete(it.url) }
    setItems([])
  }
  const run = async () => {
    setBusy(0.03)
    try { const b = await imagesToPdf(items, { size, margin, landscape: orient, onProgress: setBusy }); publish(b, 'images.pdf', `${items.length} images → ${items.length} pages`, true) } catch (e) { toast(e.message || 'Failed', 'err') } finally { setBusy(0) }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <Panel>
        <Label right={items.length > 0 && <button type="button" className="text-[12px] font-semibold" style={{ color: 'var(--muted)' }} onClick={clear}>Clear</button>}>Images · drag to reorder</Label>
        {!items.length ? <Drop onFiles={add} accept="image/*" title="Drop images to turn into a PDF" sub="JPG and PNG are embedded as-is — no recompression" icon="image" /> : (
          <>
            <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-2">
              {items.map((it, i) => (
                <Reorder.Item key={it.id} value={it} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={SPRING} whileDrag={{ scale: 1.02, boxShadow: '0 16px 30px -10px rgba(0,0,0,.4)', zIndex: 5 }} className="flex items-center gap-3 rounded-2xl border border-line p-2 pr-3 cursor-grab" style={{ background: 'var(--surface)' }}>
                  <span style={{ color: 'var(--muted)' }}><KIco n="drag" s={18} /></span>
                  <img src={it.url} alt="" className="w-14 h-14 rounded-xl object-cover" draggable={false} />
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold truncate">{it.file.name}</div><div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Page {i + 1} · {fmtSize(it.file.size)}</div></div>
                  <button type="button" aria-label="Remove" onClick={() => remove(it.id)} className="w-8 h-8 rounded-full grid place-items-center" style={{ background: 'var(--surface2)' }}><KIco n="x" s={14} /></button>
                </Reorder.Item>))}
            </Reorder.Group>
            <div className="mt-4"><Drop compact onFiles={add} accept="image/*" title="Add more images" sub="" icon="plus" /></div>
          </>)}
      </Panel>
      <div className="space-y-5">
        <Panel delay={0.06}>
          <Label>Page</Label>
          <div className="space-y-4">
            <Seg small value={size} onChange={setSize} options={[['fit', 'Fit image'], ['a4', 'A4'], ['letter', 'Letter'], ['a5', 'A5']]} />
            {size !== 'fit' && <Seg small value={orient} onChange={setOrient} options={[['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />}
            <Range label="Margin" min={0} max={30} value={margin} onChange={setMargin} fmt={(v) => v + ' mm'} />
          </div>
        </Panel>
        <Panel delay={0.12}>
          {busy > 0 && <div className="mb-3"><Bar value={busy * 100} label="Building" /></div>}
          <Btn primary className="w-full" icon="pdf" busy={busy > 0} disabled={!items.length || busy > 0} onClick={run}>Create PDF{items.length ? ` · ${items.length} pages` : ''}</Btn>
        </Panel>
      </div>
    </div>
  )
}
