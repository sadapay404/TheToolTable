import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Field, Note } from '../components/ui.jsx'
import { download, recentAction } from '../lib/utils.js'

const EYE_SHAPES = [['square', 'Square'], ['rounded', 'Rounded'], ['dot', 'Dot']]
const MODULE_SHAPES = [['square', 'Square'], ['rounded', 'Rounded'], ['dot', 'Dots']]

function isEye(r, c, n) {
  const inFinder = (rr, cc) => rr >= 0 && rr < 7 && cc >= 0 && cc < 7
  return (inFinder(r, c) || inFinder(r, c - (n - 7)) || inFinder(r - (n - 7), c))
}

export default function QRStudio() {
  const [mode, setMode] = useState('url')
  const [url, setUrl] = useState('https://thetooltab.app')
  const [text, setText] = useState('Hello from TheToolTab')
  const [wifi, setWifi] = useState({ ssid: '', pass: '', enc: 'WPA' })
  const [vcard, setVcard] = useState({ name: 'Ada Lovelace', phone: '+1234567890', email: 'ada@example.com', org: 'TheToolTab' })
  const [fg, setFg] = useState('#1A1817')
  const [gradOn, setGradOn] = useState(false)
  const [fg2, setFg2] = useState('#C87941')
  const [gradType, setGradType] = useState('linear')
  const [bg, setBg] = useState('#FDFBF7')
  const [eyeShape, setEyeShape] = useState('rounded')
  const [modShape, setModShape] = useState('rounded')
  const [margin, setMargin] = useState(2)
  const [logo, setLogo] = useState(null)
  const [size, setSize] = useState(1024)
  const svgRef = useRef(null)

  const payload = useMemo(() => {
    if (mode === 'url') return url || ' '
    if (mode === 'text') return text || ' '
    if (mode === 'wifi') return `WIFI:T:${wifi.enc};S:${wifi.ssid};P:${wifi.pass};;`
    return `BEGIN:VCARD\nVERSION:3.0\nFN:${vcard.name}\nTEL:${vcard.phone}\nEMAIL:${vcard.email}\nORG:${vcard.org}\nEND:VCARD`
  }, [mode, url, text, wifi, vcard])

  const qr = useMemo(() => {
    try { return QRCode.create(payload, { errorCorrectionLevel: logo ? 'H' : 'M' }) } catch { return null }
  }, [payload, logo])

  const svgBody = useMemo(() => {
    if (!qr) return ''
    const n = qr.modules.size
    const data = qr.modules.data
    const cell = 10
    const pad = margin * cell
    const parts = []
    const fill = gradOn ? 'url(#grad)' : fg

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!data[r * n + c]) continue
        const x = pad + c * cell, y = pad + r * cell
        const eye = isEye(r, c, n)
        const shape = eye ? eyeShape : modShape
        if (eye) continue // draw eyes separately below
        if (shape === 'dot') parts.push(`<circle cx="${x + cell / 2}" cy="${y + cell / 2}" r="${cell * 0.42}" fill="${fill}"/>`)
        else if (shape === 'rounded') parts.push(`<rect x="${x + 0.6}" y="${y + 0.6}" width="${cell - 1.2}" height="${cell - 1.2}" rx="${cell * 0.32}" fill="${fill}"/>`)
        else parts.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${fill}"/>`)
      }
    }
    // finder eyes
    const eyePos = [[0, 0], [n - 7, 0], [0, n - 7]]
    for (const [er, ec] of eyePos) {
      const x = pad + ec * cell, y = pad + er * cell, s = cell * 7
      if (eyeShape === 'dot') {
        parts.push(`<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${fill}"/>`)
        parts.push(`<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2 - cell}" fill="${bg}"/>`)
        parts.push(`<circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 6}" fill="${fill}"/>`)
      } else {
        const rx = eyeShape === 'rounded' ? cell * 1.6 : 0
        parts.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${rx}" fill="${fill}"/>`)
        parts.push(`<rect x="${x + cell}" y="${y + cell}" width="${s - 2 * cell}" height="${s - 2 * cell}" rx="${rx * 0.6}" fill="${bg}"/>`)
        parts.push(`<rect x="${x + 2 * cell}" y="${y + 2 * cell}" width="${s - 4 * cell}" height="${s - 4 * cell}" rx="${rx * 0.4}" fill="${fill}"/>`)
      }
    }
    return parts.join('')
  }, [qr, fg, bg, gradOn, eyeShape, modShape, margin])

  const totalSize = qr ? qr.modules.size * 10 + margin * 20 : 0

  function svgString(withLogoHref = false) {
    if (!qr) return ''
    const gradDef = gradOn
      ? gradType === 'radial'
        ? `<radialGradient id="grad" cx="50%" cy="50%" r="75%"><stop offset="0%" stop-color="${fg}"/><stop offset="100%" stop-color="${fg2}"/></radialGradient>`
        : `<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${fg}"/><stop offset="100%" stop-color="${fg2}"/></linearGradient>`
      : ''
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${totalSize} ${totalSize}"><defs>${gradDef}</defs><rect width="${totalSize}" height="${totalSize}" fill="${bg}"/>${svgBody}${logo ? `<image href="${withLogoHref ? logo.src : logo.src}" x="${totalSize / 2 - totalSize * 0.11}" y="${totalSize / 2 - totalSize * 0.11}" width="${totalSize * 0.22}" height="${totalSize * 0.22}"/>` : ''}</svg>`
  }

  async function exportPNG() {
    const svg = svgString(true)
    const img = new Image()
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
    await new Promise((r) => { img.onload = r })
    const c = document.createElement('canvas')
    c.width = c.height = size
    c.getContext('2d').drawImage(img, 0, 0, size, size)
    c.toBlob((b) => { download(b, 'thetooltab-qr.png'); recentAction(`Exported QR PNG (${size}px)`) }, 'image/png')
  }

  function exportSVG() {
    download(new Blob([svgString(true)], { type: 'image/svg+xml' }), 'thetooltab-qr.svg')
    recentAction('Exported QR SVG')
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-5">
      <div className="card p-8 grid place-items-center" style={{ background: 'var(--surface2)' }}>
        {qr ? (
          <div className="max-w-[380px] w-full" style={{ boxShadow: 'var(--shadow-lg)', borderRadius: 16, overflow: 'hidden' }}>
            <svg ref={svgRef} viewBox={`0 0 ${totalSize} ${totalSize}`} className="w-full h-auto block">
              {gradOn && (
                <defs>
                  {gradType === 'radial'
                    ? <radialGradient id="grad" cx="50%" cy="50%" r="75%"><stop offset="0%" stopColor={fg} /><stop offset="100%" stopColor={fg2} /></radialGradient>
                    : <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor={fg} /><stop offset="100%" stopColor={fg2} /></linearGradient>}
                </defs>
              )}
              <rect width={totalSize} height={totalSize} fill={bg} />
              <g dangerouslySetInnerHTML={{ __html: svgBody }} />
              {logo && <image href={logo.src} x={totalSize / 2 - totalSize * 0.11} y={totalSize / 2 - totalSize * 0.11} width={totalSize * 0.22} height={totalSize * 0.22} />}
            </svg>
          </div>
        ) : <Note tone="warn">QR generation failed — check your input.</Note>}
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          <Field label="Content type">
            <div className="flex flex-wrap gap-2">
              {[['url', '🔗 Link'], ['text', '📝 Text'], ['wifi', '📶 Wi-Fi'], ['vcard', '👤 vCard']].map(([v, l]) => (
                <button key={v} className="chip" data-on={mode === v} onClick={() => setMode(v)}>{l}</button>
              ))}
            </div>
          </Field>
          {mode === 'url' && <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}
          {mode === 'text' && <textarea className="input" rows="3" value={text} onChange={(e) => setText(e.target.value)} />}
          {mode === 'wifi' && (
            <div className="space-y-2">
              <input className="input" placeholder="Network name (SSID)" value={wifi.ssid} onChange={(e) => setWifi({ ...wifi, ssid: e.target.value })} />
              <input className="input" placeholder="Password" value={wifi.pass} onChange={(e) => setWifi({ ...wifi, pass: e.target.value })} />
              <select className="input" value={wifi.enc} onChange={(e) => setWifi({ ...wifi, enc: e.target.value })}><option>WPA</option><option>WEP</option><option>nopass</option></select>
            </div>
          )}
          {mode === 'vcard' && (
            <div className="space-y-2">
              {Object.entries({ name: 'Full name', phone: 'Phone', email: 'Email', org: 'Company' }).map(([k, ph]) => (
                <input key={k} className="input" placeholder={ph} value={vcard[k]} onChange={(e) => setVcard({ ...vcard, [k]: e.target.value })} />
              ))}
            </div>
          )}
        </div>

        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Foreground"><input type="color" className="input h-11 p-1" value={fg} onChange={(e) => setFg(e.target.value)} /></Field>
            <Field label="Background"><input type="color" className="input h-11 p-1" value={bg} onChange={(e) => setBg(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={gradOn} onChange={(e) => setGradOn(e.target.checked)} /> Gradient fill</label>
          {gradOn && (
            <div className="flex items-center gap-3">
              <input type="color" className="input h-10 p-1 w-16" value={fg2} onChange={(e) => setFg2(e.target.value)} />
              <button className="chip" data-on={gradType === 'linear'} onClick={() => setGradType('linear')}>Linear</button>
              <button className="chip" data-on={gradType === 'radial'} onClick={() => setGradType('radial')}>Radial</button>
            </div>
          )}
          <Field label="Eye shape"><div className="flex gap-2">{EYE_SHAPES.map(([v, l]) => <button key={v} className="chip" data-on={eyeShape === v} onClick={() => setEyeShape(v)}>{l}</button>)}</div></Field>
          <Field label="Module shape"><div className="flex gap-2">{MODULE_SHAPES.map(([v, l]) => <button key={v} className="chip" data-on={modShape === v} onClick={() => setModShape(v)}>{l}</button>)}</div></Field>
          <Field label={`Quiet zone margin — ${margin}`}>
            <input type="range" className="w-full" min="0" max="8" value={margin} onChange={(e) => setMargin(+e.target.value)} />
          </Field>
          <Field label="Center logo (uses max error correction)">
            <input type="file" accept="image/*" className="text-xs" onChange={(e) => {
              const f = e.target.files?.[0]
              if (!f) return setLogo(null)
              const rd = new FileReader()
              rd.onload = () => setLogo({ src: rd.result })
              rd.readAsDataURL(f)
            }} />
          </Field>
        </div>

        <div className="card p-5 space-y-3">
          <Field label={`Export size — ${size}px (high-DPI)`}>
            <input type="range" className="w-full" min="256" max="4096" step="256" value={size} onChange={(e) => setSize(+e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" onClick={exportPNG}>PNG</button>
            <button className="btn flex-1" onClick={exportSVG}>SVG (vector)</button>
          </div>
        </div>
      </div>
    </div>
  )
}
