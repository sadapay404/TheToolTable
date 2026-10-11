import { useEffect, useState } from 'react'
import { Panel, Label, Btn, Field, Empty, Stat2, fmtSize } from '../kit/ui.jsx'
import { DocSelect, Thumb } from './shared.jsx'
import { readInfo, writeInfo, pageSizes } from '../../lib/pdf/engine.js'

const mm = (pt) => Math.round((pt / 72) * 25.4)
const PAPER = [[210, 297, 'A4'], [148, 210, 'A5'], [297, 420, 'A3'], [216, 279, 'Letter'], [216, 356, 'Legal']]
const paper = (w, h) => { const a = Math.min(mm(w), mm(h)), b = Math.max(mm(w), mm(h)); const p = PAPER.find(([x, y]) => Math.abs(x - a) <= 2 && Math.abs(y - b) <= 2); return p ? p[2] : `${a}×${b} mm` }

export default function Info({ docs, active, setActive, publish, toast }) {
  const doc = docs.find((d) => d.id === active) || docs[0]
  const [info, setInfo] = useState(null), [sizes, setSizes] = useState([]), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!doc) return
    let dead = false
    setInfo(null); setSizes([])
    Promise.all([readInfo(doc), pageSizes(doc)]).then(([metadata, pageInfo]) => { if (!dead) { setInfo(metadata); setSizes(pageInfo) } }).catch((e) => { if (!dead) toast(e.message || 'Could not read the PDF properties.', 'err') })
    return () => { dead = true }
  }, [doc?.id, toast])
  if (!doc) return <Panel><Empty icon="info" title="Add a PDF first" sub="See what's inside, edit the title and author, or wipe the metadata." /></Panel>
  const kinds = [...new Set(sizes.map((s) => paper(s.width, s.height) + (s.width > s.height ? ' landscape' : '')))]
  const run = async (strip) => { if (busy || (!strip && !info)) return; setBusy(true); try { const b = await writeInfo(doc, info, strip); publish(b, doc.name.replace(/\.pdf$/i, '') + (strip ? '_clean.pdf' : '_info.pdf'), strip ? 'Document properties wiped' : 'Properties saved', true) } catch (e) { toast(e.message, 'err') } finally { setBusy(false) } }
  const set = (k) => (e) => setInfo((i) => ({ ...i, [k]: e.target.value }))
  return (
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
      <Panel><Label>Cover</Label><Thumb doc={doc} idx={0} w={360} /><div className="text-[12.5px] mt-3 break-all font-semibold">{doc.name}</div></Panel>
      <div className="space-y-5">
        <DocSelect docs={docs} value={doc.id} onChange={setActive} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3"><Stat2 i={0} k="Pages" v={doc.pages} /><Stat2 i={1} k="File size" v={fmtSize(doc.size)} /><Stat2 i={2} k="Paper" v={kinds.length > 1 ? 'Mixed' : kinds[0] || '—'} /><Stat2 i={3} k="Created" v={info?.created ? info.created.toLocaleDateString() : '—'} /></div>
        <Panel delay={0.08}>
          <Label>Document properties</Label>
          {info && <div className="grid sm:grid-cols-2 gap-4">
            {[['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['keywords', 'Keywords'], ['creator', 'Created with'], ['producer', 'PDF producer']].map(([k, l]) => <Field key={k} label={l}><input className="input" maxLength={k === 'keywords' ? 2_000 : 500} value={info[k]} onChange={set(k)} disabled={busy} /></Field>)}
          </div>}
          <div className="flex flex-wrap gap-2 mt-5"><Btn primary icon="save" busy={busy} disabled={busy || !info} onClick={() => run(false)}>Save properties</Btn><Btn icon="shield" disabled={busy} onClick={() => run(true)}>Wipe all properties</Btn></div>
          <div className="text-[11.5px] mt-3" style={{ color: 'var(--muted)' }}>Wiping clears title, author, tool names and dates from the document info. Page contents are untouched.</div>
        </Panel>
      </div>
    </div>
  )
}
