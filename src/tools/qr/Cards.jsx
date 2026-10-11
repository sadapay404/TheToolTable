import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { QIco, Btn, Panel, Label, Choice, Switch, TextIn, SPRING, useToast } from './ui.jsx'
import { useQR, useStore } from './store.js'
import { buildQR, withDefaults, canvasBlob } from '../../lib/qr/render.js'
import { buildPayload, defaultsFor } from '../../lib/qr/payloads.js'
import { esc } from '../../lib/qr/frames.js'
import { download, recentAction } from '../../lib/utils.js'

const THEMES = { paper: ['Paper', '#F0EDE4', '#2A211C', '#B4715A'], ink: ['Ink', '#16110E', '#F5EFE6', '#E0A184'], ocean: ['Ocean', '#E6F3FB', '#0B3C5D', '#1D9BF0'], forest: ['Forest', '#E9F4EA', '#123524', '#2F9C6B'], rose: ['Rose', '#FCEBEE', '#5A1F2B', '#C0445D'], sun: ['Sun', '#FFF1CC', '#3D2A00', '#E8A100'] }
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'Inter, Helvetica, Arial, sans-serif', MONO = 'ui-monospace, Menlo, Consolas, monospace'

const T = (t, x, y, { size = 5, weight = 500, fill = '#000', anchor = 'middle', font = SANS, max = 0, ls = 0, op = 1 } = {}) => {
  t = String(t ?? ''); if (!t) return ''
  const fs = max ? Math.min(size, max / Math.max(3, t.length * (weight >= 700 ? 0.68 : 0.58))) : size
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family='${font}' font-weight="${weight}" font-size="${fs.toFixed(2)}" letter-spacing="${ls}" fill="${fill}" opacity="${op}">${esc(t)}</text>`
}
const rr = (x, y, w, h, r, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`
const qrAt = (text, x, y, s, style, id) => { const r = buildQR(text || ' ', style, id); return r.svg.replace('__W__', s).replace('__H__', (s * r.H) / r.W).replace('<svg ', `<svg x="${x}" y="${y}" `) }
const wifiIcon = (cx, cy, s, c) => `<g fill="none" stroke="${c}" stroke-width="${s * 0.09}" stroke-linecap="round"><path d="M${cx - s * 0.5} ${cy - s * 0.12}a${s * 0.72} ${s * 0.72} 0 0 1 ${s} 0"/><path d="M${cx - s * 0.3} ${cy + s * 0.1}a${s * 0.42} ${s * 0.42} 0 0 1 ${s * 0.6} 0"/></g><circle cx="${cx}" cy="${cy + s * 0.32}" r="${s * 0.07}" fill="${c}"/>`

const CARDS = {
  wifi: { name: 'Wi-Fi poster', icon: 'wifiPoster', mm: [148, 210], fields: [['title', 'Headline', 'Join our Wi-Fi'], ['sub', 'Sub-line', 'Scan to connect instantly'], ['ssid', 'Network name', 'Cafe-Guest'], ['pass', 'Password', 'welcome123'], ['foot', 'Footer', 'Point your camera at the code']], toggles: [['showpass', 'Print the password']], def: { title: 'Join our Wi-Fi', sub: 'Scan to connect instantly', ssid: 'Cafe-Guest', pass: 'welcome123', foot: 'Point your camera at the code', showpass: true },
    qr: (v) => buildPayload('wifi', { ssid: v.ssid, pass: v.pass, enc: v.pass ? 'WPA' : 'nopass', hidden: false }),
    draw: (v, t, q) => { const [W, H] = [148, 210]; return `${rr(0, 0, W, H, 0, t.bg)}${rr(10, 10, W - 20, H - 20, 8, 'none', `stroke="${t.accent}" stroke-width="0.6"`)}${wifiIcon(W / 2, 34, 22, t.accent)}${T(v.title, W / 2, 55, { size: 13, weight: 700, font: SERIF, fill: t.fg, max: 116 })}${T(v.sub, W / 2, 64, { size: 4.4, fill: t.fg, op: 0.7, max: 116 })}${rr(W / 2 - 38, 72, 76, 76, 6, '#fff')}${q(W / 2 - 35, 75, 70)}${T('NETWORK', W / 2, 162, { size: 2.8, weight: 700, fill: t.accent, ls: 0.8 })}${T(v.ssid, W / 2, 170, { size: 6.2, weight: 700, fill: t.fg, max: 110 })}${v.showpass && v.pass ? `${T('PASSWORD', W / 2, 180, { size: 2.8, weight: 700, fill: t.accent, ls: 0.8 })}${T(v.pass, W / 2, 187, { size: 5.6, weight: 700, fill: t.fg, font: MONO, max: 110 })}` : ''}${T(v.foot, W / 2, 196, { size: 2.9, fill: t.fg, op: 0.55, max: 110 })}` } },
  contact: { name: 'Business card', icon: 'id', mm: [90, 55], fields: [['first', 'First name', 'Mubashir'], ['last', 'Last name', 'Khan'], ['title', 'Job title', 'Designer'], ['org', 'Company', 'TheToolTable'], ['phone', 'Phone', '+92 300 1234567'], ['email', 'Email', 'hello@example.com'], ['web', 'Website', 'thetooltable.app']], toggles: [], def: { ...defaultsFor('contact'), first: 'Mubashir', last: 'Khan', title: 'Designer', org: 'TheToolTable', phone: '+92 300 1234567', email: 'hello@example.com', web: 'thetooltable.app' },
    qr: (v) => buildPayload('contact', { ...defaultsFor('contact'), ...v }),
    draw: (v, t, q) => { const [W, H] = [90, 55]; return `${rr(0, 0, W, H, 0, t.bg)}${rr(0, 0, 3.2, H, 0, t.accent)}${T((v.first + ' ' + v.last).trim(), 9, 15, { size: 8, weight: 700, font: SERIF, fill: t.fg, anchor: 'start', max: 46 })}${T(v.title, 9, 21, { size: 3.6, fill: t.accent, anchor: 'start', weight: 700, max: 46, ls: 0.3 })}${T(v.org, 9, 26, { size: 3.4, fill: t.fg, anchor: 'start', op: 0.7, max: 46 })}<rect x="9" y="30" width="12" height="0.4" fill="${t.accent}"/>${T(v.phone, 9, 37, { size: 3.3, fill: t.fg, anchor: 'start', max: 46 })}${T(v.email, 9, 42.5, { size: 3.3, fill: t.fg, anchor: 'start', max: 46 })}${T(v.web, 9, 48, { size: 3.3, fill: t.fg, anchor: 'start', max: 46 })}${rr(58, 12, 28, 28, 2.4, '#fff')}${q(59.5, 13.5, 25)}${T('SCAN TO SAVE', 72, 45.5, { size: 2.4, weight: 700, fill: t.fg, op: 0.65, ls: 0.5 })}` } },
  tent: { name: 'Table tent', icon: 'tent', mm: [148, 210], fields: [['venue', 'Venue name', 'Chai & Co.'], ['cta', 'Call to action', 'Scan for the menu'], ['url', 'Menu link', 'https://example.com/menu'], ['foot', 'Small print', 'Table service · Fresh daily']], toggles: [], def: { venue: 'Chai & Co.', cta: 'Scan for the menu', url: 'https://example.com/menu', foot: 'Table service · Fresh daily' },
    qr: (v) => v.url,
    draw: (v, t, q) => { const [W, H] = [148, 210]; const face = (id) => `${T(v.venue, W / 2, 14, { size: 8, weight: 700, font: SERIF, fill: t.fg, max: 118 })}${rr(W / 2 - 20, 18, 40, 0.5, 0, t.accent)}${rr(W / 2 - 29, 23, 58, 58, 5, '#fff')}${q(W / 2 - 26, 26, 52, id)}${T(v.cta.toUpperCase(), W / 2, 92, { size: 4.4, weight: 800, fill: t.accent, ls: 0.9, max: 118 })}`; return `${rr(0, 0, W, H, 0, t.bg)}<g transform="rotate(180 ${W / 2} ${H / 4})">${face('a')}</g><g transform="translate(0 ${H / 2})">${face('b')}</g><line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="${t.fg}" stroke-opacity=".35" stroke-width=".3" stroke-dasharray="2 1.6"/>${T('✂  fold here', W / 2, H / 2 - 1.2, { size: 2.2, fill: t.fg, op: 0.45 })}${T(v.foot, W / 2, H - 4, { size: 2.6, fill: t.fg, op: 0.5, max: 110 })}` } },
  social: { name: 'Follow poster', icon: 'megaphone', mm: [148, 210], fields: [['head', 'Headline', 'Follow us'], ['handle', 'Handle', '@thetooltable'], ['url', 'Profile link', 'https://instagram.com/thetooltable'], ['sub', 'Tagline', 'New tools every week']], toggles: [], def: { head: 'Follow us', handle: '@thetooltable', url: 'https://instagram.com/thetooltable', sub: 'New tools every week' },
    qr: (v) => v.url,
    draw: (v, t, q) => { const [W, H] = [148, 210]; return `${rr(0, 0, W, H, 0, t.bg)}${rr(0, 0, W, 78, 0, t.accent)}${T(v.head, W / 2, 40, { size: 22, weight: 800, font: SERIF, fill: t.bg, max: 120 })}${T(v.sub, W / 2, 56, { size: 5, fill: t.bg, op: 0.85, max: 120, ls: 0.4 })}${rr(W / 2 - 46, 66, 92, 92, 7, '#fff', 'stroke-opacity=".0"')}${q(W / 2 - 42, 70, 84)}${T(v.handle, W / 2, 178, { size: 10, weight: 800, fill: t.fg, max: 120 })}${T('SCAN · FOLLOW · SAY HI', W / 2, 192, { size: 3.4, weight: 700, fill: t.accent, ls: 1.2 })}` } },
  tag: { name: 'Label tag', icon: 'ticket', mm: [90, 55], fields: [['kicker', 'Small heading', 'PROPERTY OF'], ['name', 'Name / item', 'Studio Laptop'], ['id', 'ID / serial', 'TT-0042'], ['url', 'Link / data', 'https://example.com/asset/TT-0042']], toggles: [], def: { kicker: 'PROPERTY OF', name: 'Studio Laptop', id: 'TT-0042', url: 'https://example.com/asset/TT-0042' },
    qr: (v) => v.url,
    draw: (v, t, q) => { const [W, H] = [90, 55]; return `${rr(0, 0, W, H, 0, t.bg)}${rr(3, 3, W - 6, H - 6, 3, 'none', `stroke="${t.fg}" stroke-opacity=".35" stroke-width=".4" stroke-dasharray="1.4 1"`)}${T(v.kicker, 9, 14, { size: 2.9, weight: 800, fill: t.accent, anchor: 'start', ls: 0.9, max: 42 })}${T(v.name, 9, 25, { size: 7, weight: 700, font: SERIF, fill: t.fg, anchor: 'start', max: 44 })}${T(v.id, 9, 33, { size: 4.2, weight: 700, font: MONO, fill: t.fg, anchor: 'start', max: 44, op: 0.8 })}${rr(9, 38, 10, 0.5, 0, t.accent)}${rr(55, 8, 30, 30, 2.4, '#fff')}${q(56.8, 9.8, 26.4)}${T('SCAN FOR DETAILS', 70, 44.5, { size: 2.3, weight: 700, fill: t.fg, op: 0.65, ls: 0.4 })}` } },
}

function Tilt({ children }) {
  const ref = useRef(); const mx = useMotionValue(0), my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 160, damping: 20 }), ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 160, damping: 20 })
  return <div style={{ perspective: 1200 }} onPointerMove={(e) => { const b = ref.current.getBoundingClientRect(); mx.set((e.clientX - b.left) / b.width - 0.5); my.set((e.clientY - b.top) / b.height - 0.5) }} onPointerLeave={() => { mx.set(0); my.set(0) }}><motion.div ref={ref} style={{ rotateX: rx, rotateY: ry, transformStyle: 'preserve-3d' }}>{children}</motion.div></div>
}

export default function Cards() {
  const { style: mine } = useQR()
  const [toastNode, toast] = useToast()
  const [id, setId] = useStore('card', 'wifi')
  const [vals, setVals] = useStore('cardvals', {})
  const [theme, setTheme] = useStore('cardtheme', 'paper')
  const [useMine, setUseMine] = useStore('cardmine', false)
  const [busy, setBusy] = useState(false)
  const C = CARDS[id] || CARDS.wifi
  const v = { ...C.def, ...(vals[id] || {}) }
  const th = THEMES[theme] || THEMES.paper
  const t = { bg: th[1], fg: th[2], accent: th[3] }
  const qrStyle = useMemo(() => useMine ? mine : withDefaults({ margin: 1, dots: { shape: 'liquid', color: t.fg }, eyes: { frame: 'rounded', ball: 'rounded', frameColor: t.fg, ballColor: t.accent }, bg: { type: 'solid', color: '#FFFFFF', radius: 0 } }), [useMine, mine, t.fg, t.accent])
  const text = C.qr(v)
  const card = useMemo(() => {
    const [W, H] = C.mm
    const body = C.draw(v, t, (x, y, s, uid = 'q') => qrAt(text, x, y, s, qrStyle, 'c' + uid))
    return { W, H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="__W__" height="__H__">${body}</svg>` }
  }, [id, vals, theme, useMine, mine, text])
  const html = card.svg.replace('__W__', '100%').replace('__H__', '100%')
  const set = (k, x) => setVals((c) => ({ ...c, [id]: { ...(c[id] || {}), [k]: x } }))
  const sized = (px) => card.svg.replace('__W__', px).replace('__H__', Math.round((px * card.H) / card.W))
  const raster = async (dpi = 300) => {
    const px = Math.min(8192, Math.round((card.W / 25.4) * dpi)); const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized(px))
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const c = document.createElement('canvas'); c.width = px; c.height = Math.round((px * card.H) / card.W); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c
  }
  const run = async (kind) => {
    setBusy(kind)
    try {
      const nm = `${id}-card`
      if (kind === 'svg') download(new Blob([sized(card.W * 10)], { type: 'image/svg+xml' }), nm + '.svg')
      else if (kind === 'png') download(await canvasBlob(await raster(300)), `${nm}-300dpi.png`)
      else { const { jsPDF } = await import('jspdf'); const c = await raster(300); const d = new jsPDF({ unit: 'mm', format: [card.W, card.H], orientation: card.W > card.H ? 'l' : 'p', compress: true }); d.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, card.W, card.H, undefined, 'FAST'); download(d.output('blob'), `${nm}-${card.W}x${card.H}mm.pdf`) }
      toast('Saved ' + kind.toUpperCase()); recentAction('Print card ' + C.name)
    } catch (e) { toast(e.message || 'Export failed', true) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-6 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] items-start">
      <Panel pad={false} className="overflow-hidden lg:sticky lg:top-24 order-2 lg:order-1" delay={0.02}>
        <div className="p-6 sm:p-10 grid place-items-center" style={{ minHeight: 440, background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--copper) 11%, var(--surface)) 0%, var(--surface) 72%)' }}>
          <Tilt><AnimatePresence mode="wait" initial={false}><motion.div key={id} initial={{ opacity: 0, y: 30, rotateX: 12, scale: 0.94 }} animate={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.96 }} transition={SPRING} className="overflow-hidden" style={{ width: `min(100%, ${card.W > card.H ? 520 : 340}px)`, minWidth: card.W > card.H ? 'min(520px, 80vw)' : 'min(340px, 80vw)', aspectRatio: `${card.W} / ${card.H}`, borderRadius: 6, boxShadow: '0 40px 50px -26px rgba(0,0,0,.55), 0 2px 0 rgba(255,255,255,.4) inset' }} dangerouslySetInnerHTML={{ __html: html }} /></AnimatePresence></Tilt>
        </div>
        <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-line">
          <div className="mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{C.name} · {C.mm[0]} × {C.mm[1]} mm</div>
          <div className="flex gap-1.5"><Btn small solid icon="download" busy={busy === 'pdf'} onClick={() => run('pdf')}>PDF</Btn><Btn small icon="download" busy={busy === 'png'} onClick={() => run('png')}>PNG 300 dpi</Btn><Btn small icon="download" busy={busy === 'svg'} onClick={() => run('svg')}>SVG</Btn></div>
        </div>
      </Panel>
      <Panel delay={0.06} className="order-1 lg:order-2 min-w-0">
        <Label>Pick a design</Label>
        <div className="grid grid-cols-3 gap-2.5">{Object.entries(CARDS).map(([k, c]) => <Choice key={k} active={k === id} onClick={() => setId(k)} className="px-2 py-3 flex flex-col items-center gap-1.5"><span style={{ color: 'var(--copper)' }}><QIco n={c.icon} s={22} /></span><span className="text-[11.5px] leading-tight text-center">{c.name}</span></Choice>)}</div>
        <div className="mt-5 space-y-3.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
              <Label>Your text</Label>
              {C.fields.map(([k, l, ph]) => <TextIn key={k} label={l} value={v[k]} onChange={(x) => set(k, x)} ph={ph} />)}
              {C.toggles.map(([k, l]) => <Switch key={k} on={!!v[k]} onChange={(x) => set(k, x)} label={l} />)}
            </motion.div>
          </AnimatePresence>
          <div><span className="block text-[12.5px] font-semibold mb-2">Colour theme</span>
            <div className="flex flex-wrap gap-2">{Object.entries(THEMES).map(([k, x]) => <motion.button key={k} type="button" whileHover={{ y: -3 }} whileTap={{ scale: 0.9 }} onClick={() => setTheme(k)} className="rounded-xl border px-2.5 py-1.5 flex items-center gap-2 text-[12px] font-semibold" style={{ borderColor: theme === k ? 'var(--copper)' : 'var(--border)', background: 'var(--surface)', boxShadow: theme === k ? '0 0 0 2px color-mix(in srgb, var(--copper) 30%, transparent)' : 'var(--shadow)' }}><span className="w-5 h-5 rounded-full border border-line relative overflow-hidden" style={{ background: x[1] }}><span className="absolute right-0 bottom-0 w-3 h-3 rounded-tl-full" style={{ background: x[3] }} /></span>{x[0]}</motion.button>)}</div></div>
          <Switch on={useMine} onChange={setUseMine} label="Use my Create design for the QR" hint="Otherwise the QR matches the card colours" />
          {id === 'wifi' && <div className="text-[12px]" style={{ color: 'var(--muted)' }}>The QR joins the network automatically on most phones.</div>}
        </div>
      </Panel>
      {toastNode}
    </div>
  )
}
