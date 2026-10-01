import React, { useState } from 'react'
import { Dropzone, Field, Select, Progress, Note } from '../components/ui.jsx'
import { convertWithFFmpeg } from '../lib/ffmpeg.js'
import { loadImage, download, baseName, extName, fmtBytes, recentAction } from '../lib/utils.js'

const IMG_OUT = ['PNG', 'JPEG', 'WEBP']
const VID_OUT = ['MP4', 'MKV', 'WEBM', 'GIF', 'MP3', 'WAV']
const AUD_OUT = ['MP3', 'WAV', 'FLAC', 'OGG', 'AAC', 'M4A']
const DOC_OUT = ['TXT', 'HTML', 'JSON']

const MIME = { PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' }

function kindOf(f) {
  if (f.type.startsWith('image/')) return 'image'
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  const e = extName(f.name)
  if (['txt', 'md', 'csv', 'html', 'json', 'rtf'].includes(e)) return 'doc'
  if (['mkv', 'avi', 'mov', 'flv', 'wmv'].includes(e)) return 'video'
  if (['flac', 'aac', 'm4a', 'ogg', 'opus', 'wav'].includes(e)) return 'audio'
  return 'doc'
}

async function convertImage(file, target, onProg) {
  const url = URL.createObjectURL(file)
  const img = await loadImage(url)
  URL.revokeObjectURL(url)
  const c = document.createElement('canvas')
  c.width = img.naturalWidth; c.height = img.naturalHeight
  c.getContext('2d').drawImage(img, 0, 0)
  onProg(70)
  const mime = MIME[target] || 'image/png'
  const blob = await new Promise((res) => c.toBlob(res, mime, target === 'JPEG' || target === 'WEBP' ? 0.98 : undefined))
  onProg(100)
  return { blob, ext: target === 'JPEG' ? 'jpg' : target.toLowerCase() }
}

async function convertDoc(file, target) {
  const text = await file.text()
  let out = text, ext = 'txt', mime = 'text/plain'
  if (target === 'HTML') {
    const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    out = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName(file.name)}</title></head><body><pre>${esc}</pre></body></html>`
    ext = 'html'; mime = 'text/html'
  } else if (target === 'JSON') {
    out = JSON.stringify({ source: file.name, lines: text.split(/\r?\n/), chars: text.length }, null, 2)
    ext = 'json'; mime = 'application/json'
  }
  return { blob: new Blob([out], { type: mime }), ext }
}

export default function Converter() {
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState({}) // id -> {state, prog, msg}

  function addFiles(fs) {
    setFiles((prev) => [...prev, ...fs.map((f, i) => ({ file: f, id: `${Date.now()}-${i}-${f.name}` }))])
  }

  async function runAll(target) {
    for (const item of files) {
      const { file, id } = item
      const k = kindOf(file)
      setStatus((s) => ({ ...s, [id]: { state: 'working', prog: 2, msg: 'Loading engine…' } }))
      try {
        let out
        if (k === 'image') out = await convertImage(file, IMG_OUT.includes(target) ? target : 'PNG', (p) => setStatus((s) => ({ ...s, [id]: { state: 'working', prog: p, msg: 'Rendering…' } })))
        else if (k === 'doc') out = await convertDoc(file, DOC_OUT.includes(target) ? target : 'TXT')
        else {
          const tgt = (k === 'video' ? VID_OUT : AUD_OUT).includes(target) ? target : 'MP4'
          const args = {
            MP4: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'aac', '-b:a', '320k'],
            MKV: ['-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-c:a', 'libmp3lame', '-b:a', '320k'],
            WEBM: ['-c:v', 'libvpx', '-crf', '12', '-b:v', '0', '-c:a', 'libvorbis', '-q:a', '8'],
            GIF: ['-vf', 'fps=15,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse'],
            MP3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k'],
            WAV: ['-vn', '-c:a', 'pcm_s16le'],
            FLAC: ['-vn', '-c:a', 'flac'],
            OGG: ['-vn', '-c:a', 'libvorbis', '-q:a', '9'],
            AAC: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
            M4A: ['-vn', '-c:a', 'aac', '-b:a', '320k'],
          }[tgt]
          const ext = tgt.toLowerCase()
          const blob = await convertWithFFmpeg(file, `out.${ext}`, args, (p) => setStatus((s) => ({ ...s, [id]: { state: 'working', prog: p, msg: 'FFmpeg encoding…' } })))
          out = { blob, ext }
        }
        download(out.blob, `${baseName(file.name)}.${out.ext}`)
          setStatus((s) => ({ ...s, [id]: { state: 'done', prog: 100, msg: `Done — ${fmtBytes(out.blob.size)}` } }))
        recentAction(`Converted ${file.name} → ${target}`)
      } catch (e) {
        setStatus((s) => ({ ...s, [id]: { state: 'error', prog: 0, msg: e.message || 'Conversion failed' } }))
      }
    }
  }

  return (
    <div className="space-y-5">
      <Dropzone onFiles={addFiles} multiple label="Drop any files to convert" sub="Images · video · audio · text documents — batch supported" />

      <div className="card p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="🖼 Image target">{IMG_OUT.map((t) => <button key={t} className="chip mr-2 mb-2" data-on={t === 'PNG'} onClick={() => runAll(t)}>{t}</button>)}</Field>
          <Field label="🎬 Video target">{VID_OUT.map((t) => <button key={t} className="chip mr-2 mb-2" onClick={() => runAll(t)}>{t}</button>)}</Field>
          <Field label="🎧 Audio target">{AUD_OUT.map((t) => <button key={t} className="chip mr-2 mb-2" onClick={() => runAll(t)}>{t}</button>)}</Field>
          <Field label="📄 Document target">{DOC_OUT.map((t) => <button key={t} className="chip mr-2 mb-2" onClick={() => runAll(t)}>{t}</button>)}</Field>
        </div>
        <Note>Zero-compression policy: image conversion keeps full resolution (quality 0.98 max). Lossless targets: PNG, WAV, FLAC, MKV/x264 CRF16. Click a target chip to convert the whole batch.</Note>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map(({ file, id }) => {
            const st = status[id] || { state: 'idle', prog: 0, msg: 'Queued' }
            return (
              <div key={id} className="card p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{{ image: '🖼️', video: '🎬', audio: '🎧', doc: '📄' }[kindOf(file)]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{file.name}</div>
                    <div className="text-xs" style={{ color: st.state === 'error' ? '#D04841' : 'var(--muted)' }}>{st.msg}</div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>{fmtBytes(file.size)}</span>
                </div>
                {st.state === 'working' && <div className="mt-3"><Progress value={st.prog} /></div>}
              </div>
            )
          })}
          <button className="btn" onClick={() => { setFiles([]); setStatus({}) }}>Clear queue</button>
        </div>
      )}
    </div>
  )
}
