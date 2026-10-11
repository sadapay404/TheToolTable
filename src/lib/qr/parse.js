/* Detect what a decoded payload is, and extract fields for the smart result card. */
const unesc = (s) => s.replace(/\\([\\;,:"nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))
const safeDecode = (value) => { try { return decodeURIComponent(value) } catch { return value } }

export function parseWifi(s) {
  const body = s.replace(/^WIFI:/i, ''), o = {}
  let cur = '', i = 0
  const parts = []
  for (; i < body.length; i++) { const ch = body[i]; if (ch === '\\') { cur += body[i + 1] ?? ''; i++ } else if (ch === ';') { parts.push(cur); cur = '' } else cur += ch }
  if (cur) parts.push(cur)
  parts.forEach((p) => { const j = p.indexOf(':'); if (j > 0) o[p.slice(0, j).toUpperCase()] = p.slice(j + 1) })
  return { ssid: o.S || '', pass: o.P || '', enc: (o.T || 'WPA').toUpperCase() === 'NOPASS' ? 'nopass' : (o.T || 'WPA').toUpperCase(), hidden: /true/i.test(o.H || '') }
}
function parseVcard(s) {
  const o = {}; const lines = s.replace(/\r/g, '').replace(/\n[ \t]/g, '').split('\n')
  lines.forEach((l) => { const j = l.indexOf(':'); if (j < 0) return; const k = l.slice(0, j).split(';')[0].toUpperCase(), v = l.slice(j + 1); const typ = /TYPE=([A-Z,]+)/i.exec(l.slice(0, j))?.[1] || ''; if (k === 'TEL') { o.tels = [...(o.tels || []), [typ, v]] } else if (k === 'EMAIL') o.email = o.email || v; else if (!(k in o)) o[k] = v })
  const n = (o.N || '').split(';'); const phones = o.tels || []
  return { first: unesc(n[1] || (o.FN || '').split(' ')[0] || ''), last: unesc(n[0] || (o.FN || '').split(' ').slice(1).join(' ') || ''), org: unesc(o.ORG || ''), title: unesc(o.TITLE || ''), phone: phones[0]?.[1] || '', phone2: phones[1]?.[1] || '', email: o.email || '', web: o.URL || '', street: unesc((o.ADR || '').split(';')[2] || ''), city: unesc((o.ADR || '').split(';')[3] || ''), zip: unesc((o.ADR || '').split(';')[5] || ''), country: unesc((o.ADR || '').split(';')[6] || ''), note: unesc(o.NOTE || ''), fn: unesc(o.FN || '') }
}
function parseMecard(s) {
  const o = {}; s.replace(/^MECARD:/i, '').split(/;(?=[A-Z]+:)/).forEach((p) => { const j = p.indexOf(':'); if (j > 0) o[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/;+$/, '') })
  const [last = '', first = ''] = (o.N || '').split(',')
  const adr = (o.ADR || '').split(',')
  return { fmt: 'mecard', first, last, phone: o.TEL || '', email: o.EMAIL || '', web: o.URL || '', org: o.ORG || '', street: adr[2] || '', city: adr[3] || '', zip: adr[5] || '', country: adr[6] || '', note: o.NOTE || '', title: '', phone2: '' }
}
const icsToLocal = (s) => { const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/.exec(s || ''); if (!m) return ''; return m[4] ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}T00:00` }
function parseEvent(s) {
  const g = (k) => { const m = new RegExp('^' + k + '[^:\\n]*:(.*)$', 'mi').exec(s); return m ? unesc(m[1].trim()) : '' }
  const sd = g('DTSTART'), ed = g('DTEND')
  return { title: g('SUMMARY'), allday: sd.length === 8, start: icsToLocal(sd), end: icsToLocal(ed), place: g('LOCATION'), desc: g('DESCRIPTION') }
}
const fmtIcs = (v) => v.replace(/[-:]/g, '').slice(0, 15) + (v.length > 10 ? '00' : '')

export function parse(textIn, format = '') {
  const text = (textIn ?? '').toString(), s = text.trim()
  const out = (o) => ({ raw: text, format, ...o })
  if (/^WIFI:/i.test(s)) { const w = parseWifi(s); return out({ type: 'wifi', label: 'Wi-Fi network', icon: 'wifi', title: w.ssid || 'Wi-Fi', rows: [['Network', w.ssid], ['Security', w.enc === 'nopass' ? 'Open (none)' : w.enc], ['Password', w.pass || '—'], w.hidden && ['Hidden', 'Yes']].filter(Boolean), edit: { type: 'wifi', v: { ssid: w.ssid, pass: w.pass, enc: w.enc, hidden: w.hidden } }, wifi: w }) }
  if (/^BEGIN:VCARD/i.test(s)) { const c = parseVcard(s); return out({ type: 'contact', label: 'Contact card', icon: 'user', title: c.fn || `${c.first} ${c.last}`.trim() || 'Contact', rows: [['Name', c.fn || `${c.first} ${c.last}`], c.org && ['Company', c.org], c.title && ['Title', c.title], c.phone && ['Phone', c.phone], c.phone2 && ['Work', c.phone2], c.email && ['Email', c.email], c.web && ['Website', c.web], (c.street || c.city) && ['Address', [c.street, c.city, c.zip, c.country].filter(Boolean).join(', ')], c.note && ['Note', c.note]].filter(Boolean), edit: { type: 'contact', v: { fmt: 'vcard', ...c } }, vcard: s }) }
  if (/^MECARD:/i.test(s)) { const c = parseMecard(s); return out({ type: 'contact', label: 'Contact card', icon: 'user', title: `${c.first} ${c.last}`.trim() || 'Contact', rows: [['Name', `${c.first} ${c.last}`], c.org && ['Company', c.org], c.phone && ['Phone', c.phone], c.email && ['Email', c.email], c.web && ['Website', c.web]].filter(Boolean), edit: { type: 'contact', v: c }, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${c.last};${c.first};;;\nFN:${c.first} ${c.last}\n${c.org ? 'ORG:' + c.org + '\n' : ''}${c.phone ? 'TEL:' + c.phone + '\n' : ''}${c.email ? 'EMAIL:' + c.email + '\n' : ''}${c.web ? 'URL:' + c.web + '\n' : ''}END:VCARD` }) }
  if (/^BEGIN:VCALENDAR|^BEGIN:VEVENT/i.test(s)) { const e = parseEvent(s); return out({ type: 'event', label: 'Calendar event', icon: 'calendar', title: e.title || 'Event', rows: [['Title', e.title], e.start && ['Starts', e.start.replace('T', ' ')], e.end && ['Ends', e.end.replace('T', ' ')], e.place && ['Where', e.place], e.desc && ['Details', e.desc]].filter(Boolean), edit: { type: 'event', v: e }, ics: `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:${e.title}\n${e.start ? 'DTSTART' + (e.allday ? ';VALUE=DATE' : '') + ':' + (e.allday ? fmtIcs(e.start).slice(0, 8) : fmtIcs(e.start)) + '\n' : ''}${e.end ? 'DTEND' + (e.allday ? ';VALUE=DATE' : '') + ':' + (e.allday ? fmtIcs(e.end).slice(0, 8) : fmtIcs(e.end)) + '\n' : ''}${e.place ? 'LOCATION:' + e.place + '\n' : ''}END:VEVENT\nEND:VCALENDAR` }) }
  let m
  if ((m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(s))) { const q = new URLSearchParams(m[2] || ''); return out({ type: 'email', label: 'Email', icon: 'mail', title: m[1], rows: [['To', m[1]], q.get('subject') && ['Subject', q.get('subject')], q.get('body') && ['Message', q.get('body')]].filter(Boolean), edit: { type: 'email', v: { to: m[1], subject: q.get('subject') || '', body: q.get('body') || '' } }, open: s }) }
  if ((m = /^smsto?:([^:?]*)[:?]?(?:body=)?(.*)$/i.exec(s))) return out({ type: 'sms', label: 'SMS', icon: 'chat', title: m[1], rows: [['To', m[1]], m[2] && ['Message', safeDecode(m[2])]].filter(Boolean), edit: { type: 'sms', v: { num: m[1], msg: m[2] ? safeDecode(m[2]) : '' } }, open: s.replace(/^smsto:/i, 'sms:').replace(/^(sms:[^:]*):(.*)$/i, '$1?body=' + encodeURIComponent(m[2] || '')) })
  if ((m = /^tel:(.+)$/i.exec(s))) return out({ type: 'phone', label: 'Phone number', icon: 'phone', title: m[1], rows: [['Number', m[1]]], edit: { type: 'phone', v: { num: m[1] } }, open: s })
  if ((m = /^geo:(-?[\d.]+),(-?[\d.]+)/i.exec(s))) return out({ type: 'geo', label: 'Map location', icon: 'pin', title: `${m[1]}, ${m[2]}`, rows: [['Latitude', m[1]], ['Longitude', m[2]]], edit: { type: 'geo', v: { lat: m[1], lon: m[2], mode: 'geo', label: '' } }, open: `https://www.google.com/maps?q=${m[1]},${m[2]}` })
  if ((m = /^upi:\/\/pay\?(.*)$/i.exec(s))) { const q = new URLSearchParams(m[1]); return out({ type: 'payment', label: 'UPI payment', icon: 'card', title: q.get('pn') || q.get('pa') || 'UPI', rows: [['Pay to', q.get('pa')], q.get('pn') && ['Name', q.get('pn')], q.get('am') && ['Amount', `${q.get('cu') || ''} ${q.get('am')}`], q.get('tn') && ['Note', q.get('tn')]].filter(Boolean), edit: { type: 'payment', v: { mode: 'upi', vpa: q.get('pa') || '', name: q.get('pn') || '', amount: q.get('am') || '', cur: q.get('cu') || 'INR', note: q.get('tn') || '' } }, open: s, pay: { vpa: q.get('pa'), name: q.get('pn'), amount: q.get('am') } }) }
  if ((m = /^(bitcoin|ethereum|litecoin|dogecoin|bitcoincash|solana|tron|monero):([^?]+)(?:\?(.*))?$/i.exec(s))) { const q = new URLSearchParams(m[3] || ''); return out({ type: 'crypto', label: m[1][0].toUpperCase() + m[1].slice(1) + ' address', icon: 'bolt', title: m[2].slice(0, 12) + '…', rows: [['Address', m[2]], q.get('amount') && ['Amount', q.get('amount')], q.get('label') && ['Label', q.get('label')]].filter(Boolean), edit: { type: 'crypto', v: { coin: m[1].toLowerCase(), addr: m[2], amount: q.get('amount') || '', label: q.get('label') || '' } }, open: null }) }
  if ((m = /^otpauth(?:-migration)?:\/\//i.exec(s))) return out({ type: 'otp', label: '2-factor secret', icon: 'shield', title: 'Authenticator setup code', rows: [['Contains', 'A secret key that unlocks an account']], edit: null })
  if ((m = /^https?:\/\/(?:www\.)?wa\.me\/(\d+)(?:\?text=(.*))?/i.exec(s))) return out({ type: 'whatsapp', label: 'WhatsApp chat', icon: 'chat', title: '+' + m[1], rows: [['Number', '+' + m[1]], m[2] && ['Message', safeDecode(m[2])]].filter(Boolean), edit: { type: 'whatsapp', v: { num: m[1], msg: m[2] ? safeDecode(m[2]) : '' } }, open: s })
  if (/^https?:\/\/\S+$/i.test(s) || /^(www\.)\S+\.\S+$/i.test(s)) {
    const url = /^www\./i.test(s) ? 'https://' + s : s; let host = ''; try { host = new URL(url).hostname } catch {}
    const yt = /(youtube\.com|youtu\.be)/i.test(host), maps = /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(url), app = /(apps\.apple\.com|play\.google\.com)/i.test(host)
    return out({ type: 'url', label: yt ? 'YouTube link' : maps ? 'Map link' : app ? 'App store link' : 'Website', icon: yt ? 'play' : maps ? 'pin' : app ? 'phone' : 'link', title: host || s, rows: [['Address', url]], edit: { type: 'url', v: { url, utm: false, src: '', med: 'qr', cam: '' } }, open: url, url })
  }
  if (/^[\d\s-]{8,18}$/.test(s) && /^(EAN|UPC|Code|ITF|DataBar)/i.test(format)) return out({ type: 'product', label: 'Product / numeric code', icon: 'barcode', title: s, rows: [['Code', s], ['Format', format]], edit: null })
  if (!/^(QRCode|MicroQRCode|RMQRCode)$/i.test(format) && format) return out({ type: 'barcode', label: format.replace(/([a-z])([A-Z0-9])/g, '$1 $2') + ' barcode', icon: 'barcode', title: s.slice(0, 40), rows: [['Value', s], ['Format', format]], edit: null })
  return out({ type: 'text', label: 'Plain text', icon: 'text', title: s.length > 46 ? s.slice(0, 46) + '…' : s || '(empty)', rows: [['Text', s]], edit: { type: 'text', v: { text: s } } })
}
