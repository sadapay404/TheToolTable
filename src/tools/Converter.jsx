import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Dropzone, Progress, Note } from '../components/ui.jsx'
import { convertWithFFmpeg } from '../lib/ffmpeg.js'
import { loadImage, download, baseName, extName, fmtBytes, recentAction } from '../lib/utils.js'

const KIND_ICON = {
  image: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="m5 18 5-5 3 3 3.5-3.5L21 17" /></svg>,
  video: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="13" height="14" rx="3" /><path d="m16 10 5-3v10l-5-3" /></svg>,
  audio: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6M9 13h8M9 17h8" /></svg>,
  pdf: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 17v-5h2a1.7 1.7 0 0 1 0 3.4H9m6 1.6v-5h1.4a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H15" /></svg>,
}

const TARGETS = {
  image: [
    { v: 'png', l: 'PNG — lossless' }, { v: 'jpeg', l: 'JPEG' }, { v: 'webp', l: 'WebP' }, { v: 'bmp', l: 'BMP — lossless' },
  ],
  video: [
    { v: 'mp4', l: 'MP4 · H.264 + AAC' }, { v: 'mkv', l: 'MKV · H.264' }, { v: 'webm', l: 'WebM · VP8' },
    { v: 'gif', l: 'GIF · palette' }, { v: 'mp3', l: 'MP3 · audio only' }, { v: 'wav', l: 'WAV · audio only' },
  ],
  audio: [
    { v: 'flac', l: 'FLAC — lossless' }, { v: 'wav', l: 'WAV — lossless' }, { v: 'mp3', l: 'MP3 · 320k' },
    { v: 'ogg', l: 'OGG Vorbis' }, { v: 'opus', l: 'Opus' }, { v: 'm4a', l: 'AAC · M4A' },
  ],
  doc: [{ v: 'txt', l: 'Plain text' }, { v: 'md', l: 'Markdown' }, { v: 'html', l: 'HTML' }, { v: 'json', l: 'JSON' }],
  pdf: [{ v: 'txt', l: 'Text — full extract' }, { v: 'json', l: 'JSON — per page' }],
}
const DEFAULT_TARGET = { image: 'png', video: 'mp4', audio: 'flac', doc: 'txt', pdf: 'txt' }

const FF_ARGS = {
  mp4: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'aac', '-b:a', '320k'],
  mkv: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'libmp3lame', '-b:a', '320k'],
  webm: ['-c:v', 'libvpx', '-crf', '8', '-b:v', '4M', '-c:a', 'libvorbis', '-q:a', '8'],
  gif: ['-vf', 'fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  flac: ['-vn', '-c:a', 'flac'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '9'],
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '192k'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
}

function kindOf(f) {
  if (f.type === 'application/pdf' || extName(f.name) === 'pdf') return 'pdf'
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  const e = extName(f.name)
  if (['mkv', 'avi', 'mov', 'flv', 'wmv', 'webm'].includes(e)) return 'video'
  if (['flac', 'aac', 'm4a', 'ogg', 'opus', 'wav', 'mp3'].includes(e)) return 'audio'
  return 'doc'
}

async function convertImage(file, target, onProg) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const c = document.createElement('canvas')
    c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    onProg(70)
    const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp' }[target]
    let blob = await new Promise((res) => c.toBlob(res, mime, target === 'jpeg' || target === 'webp' ? 0.98 : undefined))
    let ext = target === 'jpeg' ? 'jpg' : target
    if (!blob) { blob = await new Promise((res) => c.toBlob(res, 'image/png')); ext = 'png' } // encoder fallback
    onProg(100)
    return { blob, ext }
  } finally { URL.revokeObjectURL(url) }
}

async function convertDoc(file, target) {
  const text = await file.text()
  const e = extName(file.name)
  if (target === 'json') {
    let payload
    if (e === 'csv' || (e === 'txt' && text.includes(',') && text.split('\n')[0].includes(','))) {
      const lines = text.trim().split(/\r?\n/)
      const head = lines[0].split(',')
      payload = lines.slice(1).map((ln) => Object.fromEntries(head.map((h, i) => [h.trim(), ln.split(',')[i]?.trim() ?? ''])))
    } else {
      payload = { source: file.name, chars: text.length, lines: text.split(/\r?\n/) }
    }
    return { blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), ext: 'json' }
  }
  if (target === 'html') {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    return { blob: new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${baseName(file.name)}</title></head><body><pre style="font-family:ui-monospace,monospace">${esc}</pre></body></html>`], { type: 'text/html' }), ext: 'html' }
  }
  if (target === 'md') return { blob: new Blob(['```\n' + text + '\n```\n'], { type: 'text/markdown' }), ext: 'md' }
  return { blob: new Blob([text], { type: 'text/plain' }), ext: 'txt' }
}

async function convertPDF(file, target, onProg) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    pages.push(tc.items.map((it) => it.str).join(' '))
    onProg((p / doc.numPages) * 100)
  }
  if (target === 'json') return { blob: new Blob([JSON.stringify({ source: file.name, pages: pages.length, content: pages.map((t, i) => ({ page: i + 1, text: t })) }, null, 2)], { type: 'application/json' }), ext: 'json' }
  return { blob: new Blob([pages.join('\n\n')], { type: 'text/plain' }), ext: 'txt' }
}

export default function Converter() {
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState({})

  function addFiles(fs) {
    setFiles((prev) => [...prev, ...fs.map((f, i) => ({
      file: f, id: `${Date.now()}-${i}-${f.name}`, kind: kindOf(f), target: DEFAULT_TARGET[kindOf(f)],
    }))])
  }

  const patch = (id, p) => setStatus((s) => ({ ...s, [id]: { ...s[id], ...p } }))

  async function run(item) {
    const { file, id, target, kind } = item
    patch(id, { state: 'working', prog: 2, msg: kind === 'image' || kind === 'doc' ? 'Converting…' : 'Loading FFmpeg WASM…', error: null })
    try {
      let out
      if (kind === 'image') out = await convertImage(file, target, (p) => patch(id, { prog: p }))
      else if (kind === 'doc') out = await convertDoc(file, target)
      else if (kind === 'pdf') out = await convertPDF(file, target, (p) => patch(id, { prog: p, msg: 'Extracting text…' }))
      else {
        patch(id, { msg: 'FFmpeg encoding…' })
        const blob = await convertWithFFmpeg(file, `out.${target}`, FF_ARGS[target], (p) => patch(id, { prog: p }))
        out = { blob, ext: target }
      }
      download(out.blob, `${baseName(file.name)}.${out.ext}`)
      patch(id, { state: 'done', prog: 100, msg: `Done — ${fmtBytes(out.blob.size)}`, blob: out.blob, ext: out.ext })
      recentAction(`Converted ${file.name} → ${out.ext.toUpperCase()}`)
    } catch (e) {
      patch(id, { state: 'error', prog: 0, msg: String(e?.message || e).slice(0, 220) })
    }
  }

  async function runAll() {
    for (const item of files) {
      if (status[item.id]?.state === 'working') continue
      await run(item)
    }
  }

  return (
    <div className="space-y-5">
      <Dropzone onFiles={addFiles} multiple label="Drop files to convert — batch supported" sub="Images · video · audio · documents · PDF, each with its own target format" />

      {files.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn btn-primary" onClick={runAll}>Convert all ({files.length})</button>
            <button className="btn" onClick={() => { setFiles([]); setStatus({}) }}>Clear queue</button>
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Lossless-first defaults: PNG · FLAC · CRF-16 video.</span>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {files.map((item) => {
                const st = status[item.id] || { state: 'idle', prog: 0, msg: 'Queued' }
                return (
                  <motion.div key={item.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="card p-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span style={{ color: 'var(--muted)' }}>{KIND_ICON[item.kind]}</span>
                      <div className="flex-1 min-w-[160px]">
                        <div className="font-semibold text-[13.5px] truncate">{item.file.name}</div>
                        <div className="text-[11.5px] mt-0.5" style={{ color: st.state === 'error' ? '#D04841' : 'var(--muted)' }}>
                          {fmtBytes(item.file.size)} · {st.msg}
                        </div>
                      </div>
                      <select
                        className="input w-auto min-w-[170px]"
                        value={item.target}
                        disabled={st.state === 'working'}
                        onChange={(e) => setFiles((fs) => fs.map((x) => x.id === item.id ? { ...x, target: e.target.value } : x))}
                      >
                        {TARGETS[item.kind].map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                      </select>
                      {st.state === 'done' && st.blob && (
                        <button className="btn" onClick={() => download(st.blob, `${baseName(item.file.name)}.${st.ext}`)}>Save again</button>
                      )}
                      <button className="btn btn-primary" disabled={st.state === 'working'} onClick={() => run(item)}>
                        {st.state === 'working' ? 'Working…' : 'Convert'}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setFiles((fs) => fs.filter((x) => x.id !== item.id))}>✕</button>
                    </div>
                    {st.state === 'working' && <div className="mt-3"><Progress value={st.prog} /></div>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

          <Note>Conversions are explicit re-encodes into the format you pick — quality is kept at the highest practical setting (CRF 16 video, 320k audio, q0.98 WebP/JPEG). For strict byte budgets use Tool 03.</Note>
        </>
      )}
    </div>
  )
}
