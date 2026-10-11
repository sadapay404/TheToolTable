import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Chips, Seg, Btn, Dock, Swap, SPRING, usePref, useToast, save, Switch, Field, Empty, CountText } from './kit/ui.jsx'
import { stats, fleschLabel, CASES, CLEAN, EXTRACT, ENCODE, findRe, diff, romanToUrdu, urduToRoman } from '../lib/text/ops.js'

const TABS = [['write', 'Write & count', 'text'], ['tools', 'Transform', 'wand'], ['find', 'Find & replace', 'search'], ['diff', 'Compare', 'layers'], ['urdu', 'Urdu · Roman', 'lang']]
const SAMPLE = 'Writing is thinking made visible. Paste or type anything here and the table will count it, tidy it, and turn it into whatever shape you need.\n\nاردو بھی بالکل ٹھیک چلتی ہے — دائیں سے بائیں۔'

const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024
async function copyText(value, toast, label = 'Copied') {
  try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(value); toast(label) }
  catch { toast('Clipboard access is unavailable. Select the text and copy it manually.', 'err') }
}
async function pasteText(setText, toast) {
  try { if (!navigator.clipboard?.readText) throw new Error(); setText(await navigator.clipboard.readText()) }
  catch { toast('Paste with Ctrl+V or allow clipboard access.', 'err') }
}

function Editor({ text, setText, undo, canUndo, rtl, toast }) {
  const ref = useRef(null)
  return (
    <Panel className="!p-4 sm:!p-5">
      <textarea ref={ref} aria-label="Text to analyse" dir="auto" value={text} onChange={(e) => setText(e.target.value, true)} placeholder="Type, paste, or drop a .txt file here…" spellCheck rows={16} className="input w-full" style={{ lineHeight: 1.75, fontSize: 15.5, minHeight: 320, textAlign: rtl ? 'right' : undefined, fontFamily: rtl ? '"Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,sans-serif' : undefined }}
        onDrop={async (e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (!f) return
          if (f.size > MAX_TEXT_FILE_BYTES) return toast('Choose a text file smaller than 5 MB.', 'err')
          try { setText(await f.text()) } catch { toast('Could not read that text file.', 'err') }
        }} onDragOver={(e) => e.preventDefault()} />
      <div className="flex flex-wrap gap-2 mt-3">
        <Btn small icon="undo" disabled={!canUndo} onClick={undo}>Undo</Btn>
        <Btn small icon="copy" disabled={!text} onClick={() => copyText(text, toast)}>Copy</Btn>
        <Btn small icon="file" onClick={() => pasteText(setText, toast)}>Paste</Btn>
        <Btn small icon="download" disabled={!text} onClick={() => save(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'text.txt')}>Save .txt</Btn>
        <Btn small icon="trash" danger disabled={!text} onClick={() => setText('')}>Clear</Btn>
        {!text && <Btn small icon="wand" onClick={() => setText(SAMPLE)}>Try sample</Btn>}
      </div>
    </Panel>
  )
}
function Stat({ k, v, i }) {
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * 0.03 }} className="rounded-2xl p-3 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow !text-[9.5px]">{k}</div><CountText value={typeof v === 'number' ? v : 0} format={(x) => (typeof v === 'number' ? Math.round(x).toLocaleString() : v)} className="display font-semibold text-[24px] tabular-nums block" />{typeof v !== 'number' && <span className="display font-semibold text-[24px]">{v}</span>}</motion.div>
}
const mins = (m) => (m < 1 ? (m * 60 < 1 ? '0 s' : Math.round(m * 60) + ' s') : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h')

function StatsPanel({ text }) {
  const s = useMemo(() => stats(text), [text])
  return (
    <div className="space-y-4">
      <Panel delay={0.05}>
        <Label>Counts</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">{[['Words', s.words], ['Characters', s.chars], ['No spaces', s.charsNoSpace], ['Sentences', s.sentences], ['Paragraphs', s.paras], ['Lines', s.lines]].map(([k, v], i) => <Stat key={k} k={k} v={v} i={i} />)}</div>
        <div className="grid grid-cols-2 gap-2.5 mt-2.5"><div className="rounded-2xl p-3 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow !text-[9.5px]">Reading time</div><div className="display font-semibold text-[22px]">{mins(s.read)}</div></div><div className="rounded-2xl p-3 border border-line" style={{ background: 'var(--surface2)' }}><div className="eyebrow !text-[9.5px]">Speaking time</div><div className="display font-semibold text-[22px]">{mins(s.speak)}</div></div></div>
      </Panel>
      <Panel delay={0.1}>
        <Label>Insight</Label>
        {s.words < 3 ? <Empty icon="text" title="Waiting for words" sub="Start typing to see readability and your most used words." /> : (
          <div className="space-y-4">
            {s.flesch != null && <div><div className="flex justify-between text-[12.5px] font-semibold mb-1.5"><span>Readability</span><span style={{ color: 'var(--copper)' }}>{fleschLabel(s.flesch)} · {Math.round(s.flesch)}</span></div><div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div className="h-full rounded-full" style={{ background: 'var(--copper)' }} animate={{ width: Math.max(4, Math.min(100, s.flesch)) + '%' }} /></div></div>}
            <div className="text-[13px]" style={{ color: 'var(--muted)' }}>{s.unique.toLocaleString()} different words · longest word “<b style={{ color: 'var(--ink)' }}>{s.longest}</b>”</div>
            {s.top.length > 0 && <div><div className="eyebrow mb-2">Most used</div><div className="space-y-1.5">{s.top.map(([w, c], i) => <div key={w} className="flex items-center gap-2 text-[12.5px]"><span className="w-24 truncate font-semibold">{w}</span><div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><motion.div className="h-full" style={{ background: 'var(--copper)', opacity: 0.8 }} initial={{ width: 0 }} animate={{ width: (c / s.top[0][1]) * 100 + '%' }} transition={{ delay: i * 0.04 }} /></div><span className="w-6 text-right tabular-nums">{c}</span></div>)}</div></div>}
          </div>)}
      </Panel>
    </div>
  )
}

function Tools({ text, setText, toast }) {
  const [ext, setExt] = useState(null)
  const run = (fn, label) => { try { const o = fn(text); if (o === text) toast('Nothing to change'); else { setText(o); toast(label) } } catch { toast('That text can not be converted', 'err') } }
  const group = (title, items, i) => <Panel key={title} delay={i * 0.05}><Label>{title}</Label><div className="flex flex-wrap gap-2">{items.map(([k, l, fn]) => <Btn key={k} small onClick={() => run(fn, l)}>{l}</Btn>)}</div></Panel>
  const found = ext ? [...new Set(text.match(ext[2]) || [])] : []
  return (
    <div className="space-y-4">
      {group('Change case', CASES, 0)}{group('Tidy up', CLEAN, 1)}{group('Encode & convert', ENCODE, 2)}
      <Panel delay={0.15}>
        <Label>Pull out</Label>
        <Chips small value={ext?.[0]} onChange={(k) => setExt(EXTRACT.find((x) => x[0] === k))} options={EXTRACT.map(([k, l]) => [k, l])} />
        <AnimatePresence>{ext && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="pt-4"><div className="text-[12.5px] font-semibold mb-2">{found.length} found</div>{found.length > 0 && <><div className="max-h-40 overflow-auto rounded-xl border border-line p-3 text-[13px] mono" style={{ background: 'var(--surface2)' }}>{found.map((f) => <div key={f}>{f}</div>)}</div><div className="flex gap-2 mt-3"><Btn small icon="copy" onClick={() => copyText(found.join('\n'), toast, 'Copied list')}>Copy list</Btn><Btn small icon="text" onClick={() => setText(found.join('\n'))}>Replace text with list</Btn></div></>}</div></motion.div>}</AnimatePresence>
      </Panel>
    </div>
  )
}

function Find({ text, setText, toast }) {
  const [q, setQ] = useState(''), [r, setR] = useState(''), [o, setO] = useState({ regex: false, cs: false, whole: false })
  const { re, err } = useMemo(() => { try { return { re: findRe(q, o) } } catch { return { err: 'That pattern is not valid' } } }, [q, o])
  const count = re ? (text.match(re) || []).length : 0
  const parts = useMemo(() => { if (!re || !count) return null; const out = []; let last = 0; for (const m of text.matchAll(re)) { if (!m[0]) continue; out.push([text.slice(last, m.index), false], [m[0], true]); last = m.index + m[0].length; if (out.length > 400) break } out.push([text.slice(last), false]); return out }, [text, re, count])
  return (
    <div className="space-y-4">
      <Panel>
        <Label>Find</Label>
        <div className="space-y-3"><Field label="Search for"><input className="input" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={o.regex ? 'e.g. \\d{4}-\\d{2}' : 'word or phrase'} /></Field><Field label="Replace with"><input className="input" dir="auto" value={r} onChange={(e) => setR(e.target.value)} /></Field></div>
        <div className="grid gap-3 mt-4"><Switch on={o.cs} onChange={(v) => setO({ ...o, cs: v })} label="Match case" /><Switch on={o.whole} onChange={(v) => setO({ ...o, whole: v })} label="Whole words only" /><Switch on={o.regex} onChange={(v) => setO({ ...o, regex: v })} label="Regular expression" hint="Use $1, $2 in the replacement for groups" /></div>
        <div className="flex items-center gap-3 mt-5 flex-wrap"><Btn primary icon="refresh" disabled={!count} onClick={() => { setText(text.replace(re, r)); toast(`Replaced ${count}`) }}>Replace all</Btn><span className="text-[13px] font-semibold" style={{ color: err ? '#C3423F' : 'var(--muted)' }}>{err || (q ? `${count} match${count === 1 ? '' : 'es'}` : '')}</span></div>
      </Panel>
      <Panel delay={0.08}>
        <Label>Where it appears</Label>
        {parts ? <div dir="auto" className="rounded-xl border border-line p-4 text-[14px] leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-auto" style={{ background: 'var(--surface2)' }}>{parts.map(([s, hit], i) => (hit ? <mark key={i} className="rounded px-0.5" style={{ background: 'color-mix(in srgb, var(--copper) 35%, transparent)', color: 'inherit' }}>{s}</mark> : <span key={i}>{s}</span>))}</div> : <Empty icon="search" title={q ? 'No matches' : 'Type something to find'} sub="Matches are highlighted here." />}
      </Panel>
    </div>
  )
}

function Diff() {
  const [a, setA] = usePref('txt', 'diffA', ''), [b, setB] = usePref('txt', 'diffB', ''), [mode, setMode] = useState('words')
  const d = useMemo(() => (a || b ? diff(a, b, mode) : null), [a, b, mode])
  const add = d?.filter((x) => x.t === '+').reduce((s, x) => s + (x.s.match(/\S+/g) || []).length, 0) || 0, del = d?.filter((x) => x.t === '-').reduce((s, x) => s + (x.s.match(/\S+/g) || []).length, 0) || 0
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {[['Original', a, setA], ['Changed', b, setB]].map(([l, v, set], i) => <Panel key={l} delay={i * 0.05} className="!p-4"><Label>{l}</Label><textarea aria-label={`${l} text`} dir="auto" className="input w-full" rows={10} value={v} onChange={(e) => set(e.target.value)} placeholder={`Paste the ${l.toLowerCase()} text`} style={{ lineHeight: 1.6 }} /></Panel>)}
      </div>
      <Panel delay={0.1}>
        <Label right={<div className="flex gap-2"><Btn small icon="refresh" onClick={() => { setA(b); setB(a) }}>Swap</Btn><Seg small value={mode} onChange={setMode} options={[['words', 'Words'], ['lines', 'Lines']]} /></div>}>Differences</Label>
        {d ? (
          <>
            <div className="flex gap-4 mb-3 text-[13px] font-semibold"><span style={{ color: '#2F9E6B' }}>+{add} added</span><span style={{ color: '#C3423F' }}>−{del} removed</span>{!add && !del && <span style={{ color: 'var(--muted)' }}>Identical</span>}</div>
            <div dir="auto" className="rounded-xl border border-line p-4 text-[14px] leading-[1.9] whitespace-pre-wrap max-h-[420px] overflow-auto" style={{ background: 'var(--surface2)' }}>{d.map((x, i) => x.t === '=' ? <span key={i}>{x.s}</span> : x.t === '+' ? <ins key={i} className="rounded px-0.5 no-underline" style={{ background: 'rgba(47,158,107,.22)' }}>{x.s}</ins> : <del key={i} className="rounded px-0.5" style={{ background: 'rgba(195,66,63,.2)', color: '#9b2f2d' }}>{x.s}</del>)}</div>
          </>
        ) : <Empty icon="layers" title={a || b ? 'Text is too large to compare' : 'Paste two versions'} sub={a || b ? 'Reduce the input to 250,000 characters and fewer than 12,000 lines for a bounded diff.' : 'Added words are green, removed words are red.'} />}
      </Panel>
    </div>
  )
}

function Urdu({ toast }) {
  const [dir, setDir] = useState('r2u'), [t, setT] = usePref('txt', 'urdu', 'aap kaise hain? main theek hun, shukriya.')
  const out = useMemo(() => (dir === 'r2u' ? romanToUrdu(t) : urduToRoman(t)), [t, dir])
  return (
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      <Panel>
        <Label right={<Seg small value={dir} onChange={(d) => { setDir(d); setT(out) }} options={[['r2u', 'Roman → اردو'], ['u2r', 'اردو → Roman']]} />}>{dir === 'r2u' ? 'Roman Urdu' : 'Urdu script'}</Label>
        <textarea aria-label="Urdu translation" dir="auto" className="input w-full" rows={10} value={t} onChange={(e) => setT(e.target.value)} style={{ lineHeight: 1.8 }} />
        <div className="text-[12px] mt-3" style={{ color: 'var(--muted)' }}>Roman Urdu has no fixed spelling, so this is a smart guess: about 150 common words are exact, the rest follow sound rules. Always proofread.</div>
      </Panel>
      <Panel delay={0.08}>
        <Label right={<div className="flex gap-2"><Btn small icon="copy" disabled={!out} onClick={() => copyText(out, toast)}>Copy</Btn><Btn small icon="arrowUp" disabled={!out} onClick={() => { setT(out); setDir(dir === 'r2u' ? 'u2r' : 'r2u') }}>Use as input</Btn></div>}>{dir === 'r2u' ? 'Urdu script' : 'Roman Urdu'}</Label>
        <div dir="auto" className="rounded-xl border border-line p-4 min-h-[240px] whitespace-pre-wrap text-[18px]" style={{ background: 'var(--surface2)', lineHeight: 2.1, fontFamily: dir === 'r2u' ? '"Noto Nastaliq Urdu","Noto Naskh Arabic",Inter,sans-serif' : undefined }}>{out || <span style={{ color: 'var(--muted)' }}>Your conversion appears here</span>}</div>
      </Panel>
    </div>
  )
}

export default function TextLab() {
  const [tab, setTab] = usePref('txt', 'tab', 'write'), [text, setTextRaw] = usePref('txt', 'doc', ''), [hist, setHist] = useState([]), [toast, toastNode] = useToast(), last = useRef(0)
  const setText = (v, typing) => { const now = Date.now(); if (!typing || now - last.current > 1200) setHist((h) => [...h.slice(-29), text]); last.current = now; setTextRaw(v) }
  const undo = () => setHist((h) => { if (!h.length) return h; setTextRaw(h[h.length - 1]); return h.slice(0, -1) })
  const rtl = useMemo(() => stats(text).rtl, [text])
  const shared = tab === 'write' || tab === 'tools' || tab === 'find'
  return (
    <div className="space-y-6">
      <Dock value={tab} onChange={setTab} items={TABS} cols={5} />
      <Swap k={shared ? 'shared' : tab}>
        {shared ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-start">
            <div className="lg:sticky lg:top-4"><Editor text={text} setText={setText} undo={undo} canUndo={hist.length > 0} rtl={rtl} toast={toast} /></div>
            <div>{tab === 'write' ? <StatsPanel text={text} /> : tab === 'tools' ? <Tools text={text} setText={setText} toast={toast} /> : <Find text={text} setText={setText} toast={toast} />}</div>
          </div>
        ) : tab === 'diff' ? <Diff toast={toast} /> : <Urdu toast={toast} />}
      </Swap>
      {toastNode}
    </div>
  )
}
