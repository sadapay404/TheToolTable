/* Content types → QR payload strings. */
const t = (s) => (s ?? '').toString().trim()
const digits = (s) => t(s).replace(/[^\d+]/g, '')
const urlish = (s) => { s = t(s); if (!s) return ''; return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s }
const wifiEsc = (s) => t(s).replace(/([\\;,:"])/g, '\\$1')
const vEsc = (s) => t(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
const pad2 = (n) => String(n).padStart(2, '0')
const icsDate = (v, allDay) => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; return allDay ? `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` : `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00` }
const qs = (o) => Object.entries(o).filter(([, v]) => t(v) !== '').map(([k, v]) => `${k}=${encodeURIComponent(t(v))}`).join('&')

export const SOCIALS = {
  instagram: ['Instagram', 'https://instagram.com/'], facebook: ['Facebook', 'https://facebook.com/'], x: ['X (Twitter)', 'https://x.com/'], linkedin: ['LinkedIn', 'https://linkedin.com/in/'],
  tiktok: ['TikTok', 'https://tiktok.com/@'], snapchat: ['Snapchat', 'https://snapchat.com/add/'], threads: ['Threads', 'https://threads.net/@'], telegram: ['Telegram', 'https://t.me/'],
  github: ['GitHub', 'https://github.com/'], youtube: ['YouTube channel', 'https://youtube.com/@'], pinterest: ['Pinterest', 'https://pinterest.com/'], twitch: ['Twitch', 'https://twitch.tv/'],
  reddit: ['Reddit', 'https://reddit.com/user/'], discord: ['Discord invite', 'https://discord.gg/'], behance: ['Behance', 'https://behance.net/'], dribbble: ['Dribbble', 'https://dribbble.com/'],
}
export const COINS = { bitcoin: ['Bitcoin', 'bitcoin', 'BTC'], ethereum: ['Ethereum', 'ethereum', 'ETH'], litecoin: ['Litecoin', 'litecoin', 'LTC'], dogecoin: ['Dogecoin', 'dogecoin', 'DOGE'], bitcoincash: ['Bitcoin Cash', 'bitcoincash', 'BCH'], solana: ['Solana', 'solana', 'SOL'], tron: ['TRON', 'tron', 'TRX'], monero: ['Monero', 'monero', 'XMR'], usdt: ['USDT (ERC-20)', 'ethereum', 'USDT'] }
export const STORES = { apple: ['App Store', 'App ID e.g. 389801252'], google: ['Google Play', 'Package e.g. com.whatsapp'], microsoft: ['Microsoft Store', 'Product ID e.g. 9NBLGGH4NNS1'], fdroid: ['F-Droid', 'Package e.g. org.fdroid.fdroid'] }

export const GROUPS = [['web', 'Web'], ['contact', 'People'], ['place', 'Place & time'], ['money', 'Money'], ['text', 'Text']]

export const TYPES = [
  { id: 'url', g: 'web', label: 'Website', icon: 'link', hint: 'Any web address.', fields: [{ k: 'url', label: 'Web address', ph: 'example.com/menu', req: 1 }, { k: 'utm', label: 'Add campaign tracking (UTM)', type: 'check' }, { k: 'src', label: 'Source', ph: 'poster', show: (v) => v.utm }, { k: 'med', label: 'Medium', ph: 'qr', show: (v) => v.utm }, { k: 'cam', label: 'Campaign', ph: 'spring-sale', show: (v) => v.utm }], def: { url: 'https://thetooltable.app', utm: false, src: '', med: 'qr', cam: '' },
    build: (v) => { let u = urlish(v.url); if (u && v.utm) { const q = qs({ utm_source: v.src || 'qr', utm_medium: v.med || 'qr', utm_campaign: v.cam }); u += (u.includes('?') ? '&' : '?') + q } return u } },
  { id: 'youtube', g: 'web', label: 'YouTube', icon: 'play', fields: [{ k: 'kind', label: 'Type', type: 'seg', opts: [['video', 'Video'], ['channel', 'Channel'], ['playlist', 'Playlist']] }, { k: 'id', label: 'Video ID / handle / link', ph: 'dQw4w9WgXcQ', req: 1 }, { k: 'start', label: 'Start at (seconds)', ph: '0', show: (v) => v.kind === 'video' }], def: { kind: 'video', id: 'dQw4w9WgXcQ', start: '' },
    build: (v) => { const s = t(v.id); if (/^https?:/i.test(s)) return s; if (v.kind === 'channel') return 'https://youtube.com/@' + s.replace(/^@/, ''); if (v.kind === 'playlist') return 'https://youtube.com/playlist?list=' + s; return 'https://www.youtube.com/watch?v=' + s + (t(v.start) ? '&t=' + t(v.start) + 's' : '') } },
  { id: 'social', g: 'web', label: 'Social profile', icon: 'user', fields: [{ k: 'net', label: 'Network', type: 'select', opts: Object.entries(SOCIALS).map(([k, x]) => [k, x[0]]) }, { k: 'user', label: 'Username', ph: 'yourname', req: 1 }], def: { net: 'instagram', user: 'mubashir' },
    build: (v) => { const u = t(v.user); if (/^https?:/i.test(u)) return u; return (SOCIALS[v.net] || SOCIALS.instagram)[1] + u.replace(/^@/, '') } },
  { id: 'app', g: 'web', label: 'App download', icon: 'phone', hint: 'One store per code. For a single iOS + Android code use your own smart link in “Website”.', fields: [{ k: 'store', label: 'Store', type: 'select', opts: Object.entries(STORES).map(([k, x]) => [k, x[0]]) }, { k: 'id', label: 'App ID / package', ph: 'com.whatsapp', req: 1 }], def: { store: 'google', id: 'com.whatsapp' },
    build: (v) => { const i = t(v.id); if (/^https?:/i.test(i)) return i; return v.store === 'apple' ? `https://apps.apple.com/app/id${i.replace(/^id/i, '')}` : v.store === 'google' ? `https://play.google.com/store/apps/details?id=${i}` : v.store === 'microsoft' ? `https://apps.microsoft.com/detail/${i}` : `https://f-droid.org/packages/${i}` } },
  { id: 'file', g: 'web', label: 'PDF / file link', icon: 'file', hint: 'A QR can’t hold the file itself. Upload it to Drive, Dropbox or your site and paste the share link.', fields: [{ k: 'url', label: 'File link', ph: 'https://drive.google.com/file/d/…', req: 1 }], def: { url: '' }, build: (v) => urlish(v.url) },

  { id: 'contact', g: 'contact', label: 'Contact card', icon: 'user', fields: [
    { k: 'fmt', label: 'Format', type: 'seg', opts: [['vcard', 'vCard'], ['mecard', 'MeCard']] },
    { k: 'first', label: 'First name', ph: 'Mubashir', half: 1 }, { k: 'last', label: 'Last name', ph: 'Khan', half: 1 }, { k: 'org', label: 'Company', ph: 'TheToolTable', half: 1 }, { k: 'title', label: 'Job title', ph: 'Designer', half: 1 },
    { k: 'phone', label: 'Mobile', ph: '+92 300 1234567', half: 1 }, { k: 'phone2', label: 'Work phone', ph: '', half: 1 }, { k: 'email', label: 'Email', ph: 'hello@example.com', half: 1 }, { k: 'web', label: 'Website', ph: 'example.com', half: 1 },
    { k: 'street', label: 'Street', ph: '', half: 1 }, { k: 'city', label: 'City', ph: 'Bannu', half: 1 }, { k: 'zip', label: 'Postcode', ph: '', half: 1 }, { k: 'country', label: 'Country', ph: 'Pakistan', half: 1 }, { k: 'note', label: 'Note', ph: '', type: 'area' }],
    def: { fmt: 'vcard', first: 'Mubashir', last: '', org: 'TheToolTable', title: '', phone: '', phone2: '', email: '', web: '', street: '', city: '', zip: '', country: '', note: '' },
    build: (v) => {
      if (v.fmt === 'mecard') return `MECARD:N:${t(v.last)},${t(v.first)};${t(v.phone) ? `TEL:${digits(v.phone)};` : ''}${t(v.email) ? `EMAIL:${t(v.email)};` : ''}${t(v.web) ? `URL:${urlish(v.web)};` : ''}${t(v.org) ? `ORG:${t(v.org)};` : ''}${t(v.street + v.city) ? `ADR:,,${t(v.street)},${t(v.city)},,${t(v.zip)},${t(v.country)};` : ''}${t(v.note) ? `NOTE:${t(v.note)};` : ''};`
      const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(v.last)};${vEsc(v.first)};;;`, `FN:${vEsc((t(v.first) + ' ' + t(v.last)).trim())}`]
      if (t(v.org)) L.push('ORG:' + vEsc(v.org)); if (t(v.title)) L.push('TITLE:' + vEsc(v.title))
      if (t(v.phone)) L.push('TEL;TYPE=CELL:' + digits(v.phone)); if (t(v.phone2)) L.push('TEL;TYPE=WORK:' + digits(v.phone2))
      if (t(v.email)) L.push('EMAIL:' + t(v.email)); if (t(v.web)) L.push('URL:' + urlish(v.web))
      if (t(v.street + v.city + v.zip + v.country)) L.push(`ADR;TYPE=WORK:;;${vEsc(v.street)};${vEsc(v.city)};;${vEsc(v.zip)};${vEsc(v.country)}`)
      if (t(v.note)) L.push('NOTE:' + vEsc(v.note))
      return [...L, 'END:VCARD'].join('\n')
    } },
  { id: 'phone', g: 'contact', label: 'Phone call', icon: 'phone', fields: [{ k: 'num', label: 'Phone number', ph: '+92 300 1234567', req: 1 }], def: { num: '' }, build: (v) => (digits(v.num) ? 'tel:' + digits(v.num) : '') },
  { id: 'sms', g: 'contact', label: 'SMS', icon: 'chat', fields: [{ k: 'num', label: 'Phone number', ph: '+92 300 1234567', req: 1 }, { k: 'msg', label: 'Message', type: 'area', ph: 'Hi! I’d like to…' }], def: { num: '', msg: '' }, build: (v) => (digits(v.num) ? `SMSTO:${digits(v.num)}:${t(v.msg)}` : '') },
  { id: 'email', g: 'contact', label: 'Email', icon: 'mail', fields: [{ k: 'to', label: 'To', ph: 'hello@example.com', req: 1 }, { k: 'subject', label: 'Subject', ph: '' }, { k: 'body', label: 'Message', type: 'area' }], def: { to: '', subject: '', body: '' },
    build: (v) => { if (!t(v.to)) return ''; const q = qs({ subject: v.subject, body: v.body }); return 'mailto:' + t(v.to) + (q ? '?' + q : '') } },
  { id: 'whatsapp', g: 'contact', label: 'WhatsApp chat', icon: 'chat', fields: [{ k: 'num', label: 'Number with country code', ph: '923001234567', req: 1 }, { k: 'msg', label: 'Pre-filled message', type: 'area', ph: 'Hello!' }], def: { num: '', msg: '' },
    build: (v) => { const n = digits(v.num).replace(/^\+/, ''); if (!n) return ''; return `https://wa.me/${n}${t(v.msg) ? '?text=' + encodeURIComponent(t(v.msg)) : ''}` } },

  { id: 'wifi', g: 'place', label: 'Wi-Fi', icon: 'wifi', fields: [{ k: 'ssid', label: 'Network name (SSID)', ph: 'Home-WiFi', req: 1 }, { k: 'enc', label: 'Security', type: 'seg', opts: [['WPA', 'WPA / WPA2 / WPA3'], ['WEP', 'WEP'], ['nopass', 'Open']] }, { k: 'pass', label: 'Password', ph: '', type: 'password', show: (v) => v.enc !== 'nopass' }, { k: 'hidden', label: 'Hidden network', type: 'check' }], def: { ssid: '', enc: 'WPA', pass: '', hidden: false },
    build: (v) => (t(v.ssid) ? `WIFI:T:${v.enc};S:${wifiEsc(v.ssid)};${v.enc !== 'nopass' ? `P:${wifiEsc(v.pass)};` : ''}${v.hidden ? 'H:true;' : ''};` : '') },
  { id: 'event', g: 'place', label: 'Calendar event', icon: 'calendar', fields: [{ k: 'title', label: 'Event title', ph: 'Launch party', req: 1 }, { k: 'allday', label: 'All-day', type: 'check' }, { k: 'start', label: 'Starts', type: 'datetime', half: 1 }, { k: 'end', label: 'Ends', type: 'datetime', half: 1 }, { k: 'place', label: 'Location', ph: '' }, { k: 'desc', label: 'Description', type: 'area' }], def: { title: '', allday: false, start: '', end: '', place: '', desc: '' },
    build: (v) => { if (!t(v.title)) return ''; const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'SUMMARY:' + vEsc(v.title)]; const s = icsDate(v.start, v.allday), e = icsDate(v.end || v.start, v.allday); if (s) L.push(v.allday ? 'DTSTART;VALUE=DATE:' + s : 'DTSTART:' + s); if (e) L.push(v.allday ? 'DTEND;VALUE=DATE:' + e : 'DTEND:' + e); if (t(v.place)) L.push('LOCATION:' + vEsc(v.place)); if (t(v.desc)) L.push('DESCRIPTION:' + vEsc(v.desc)); return [...L, 'END:VEVENT', 'END:VCALENDAR'].join('\n') } },
  { id: 'geo', g: 'place', label: 'Map location', icon: 'pin', fields: [{ k: 'lat', label: 'Latitude', ph: '32.9889', half: 1, req: 1 }, { k: 'lon', label: 'Longitude', ph: '70.6056', half: 1, req: 1 }, { k: 'mode', label: 'Opens as', type: 'seg', opts: [['geo', 'Map app'], ['gmaps', 'Google Maps link']] }, { k: 'label', label: 'Label (optional)', ph: 'Meet here' }], def: { lat: '32.9889', lon: '70.6056', mode: 'geo', label: '' },
    build: (v) => { if (!t(v.lat) || !t(v.lon)) return ''; return v.mode === 'gmaps' ? `https://www.google.com/maps?q=${t(v.lat)},${t(v.lon)}` : `geo:${t(v.lat)},${t(v.lon)}${t(v.label) ? '?q=' + t(v.lat) + ',' + t(v.lon) + '(' + encodeURIComponent(t(v.label)) + ')' : ''}` } },

  { id: 'payment', g: 'money', label: 'Payment', icon: 'card', hint: 'Text-based payment details. For official Raast / bank QR use your banking app.', fields: [
    { k: 'mode', label: 'Method', type: 'select', opts: [['raast', 'Raast / mobile wallet (PK)'], ['bank', 'Bank transfer (IBAN)'], ['upi', 'UPI (India)'], ['paypal', 'PayPal.me']] },
    { k: 'name', label: 'Account title / payee', ph: 'Mubashir Khan', req: 1 },
    { k: 'id', label: 'Raast ID / wallet number', ph: '0300 1234567', show: (v) => v.mode === 'raast' }, { k: 'wallet', label: 'Wallet', type: 'select', opts: [['JazzCash', 'JazzCash'], ['Easypaisa', 'Easypaisa'], ['SadaPay', 'SadaPay'], ['NayaPay', 'NayaPay'], ['Bank account', 'Bank account']], show: (v) => v.mode === 'raast' },
    { k: 'bank', label: 'Bank', ph: 'Meezan Bank', show: (v) => v.mode === 'bank' }, { k: 'iban', label: 'IBAN / account number', ph: 'PK36SCBL0000001123456702', show: (v) => v.mode === 'bank' },
    { k: 'vpa', label: 'UPI ID', ph: 'name@bank', show: (v) => v.mode === 'upi' }, { k: 'pp', label: 'PayPal.me username', ph: 'yourname', show: (v) => v.mode === 'paypal' },
    { k: 'amount', label: 'Amount (optional)', ph: '1500', half: 1 }, { k: 'cur', label: 'Currency', ph: 'PKR', half: 1 }, { k: 'note', label: 'Reference / note', ph: 'Invoice 104' }], def: { mode: 'raast', name: '', id: '', wallet: 'JazzCash', bank: '', iban: '', vpa: '', pp: '', amount: '', cur: 'PKR', note: '' },
    build: (v) => {
      if (v.mode === 'upi') return t(v.vpa) ? 'upi://pay?' + qs({ pa: v.vpa, pn: v.name, am: v.amount, cu: v.cur || 'INR', tn: v.note }) : ''
      if (v.mode === 'paypal') return t(v.pp) ? `https://paypal.me/${t(v.pp)}${t(v.amount) ? '/' + t(v.amount) + (t(v.cur) || '') : ''}` : ''
      const L = v.mode === 'bank' ? ['Bank transfer', t(v.bank) && 'Bank: ' + t(v.bank), 'Account title: ' + t(v.name), t(v.iban) && 'IBAN/Account: ' + t(v.iban)] : [`Pay via ${v.wallet} (Raast)`, 'Name: ' + t(v.name), t(v.id) && 'Raast ID / number: ' + digits(v.id)]
      if (!t(v.name)) return ''
      return [...L, t(v.amount) && `Amount: ${t(v.cur)} ${t(v.amount)}`, t(v.note) && 'Ref: ' + t(v.note)].filter(Boolean).join('\n')
    } },
  { id: 'crypto', g: 'money', label: 'Crypto address', icon: 'bolt', fields: [{ k: 'coin', label: 'Coin', type: 'select', opts: Object.entries(COINS).map(([k, x]) => [k, `${x[0]} (${x[2]})`]) }, { k: 'addr', label: 'Wallet address', ph: 'bc1q…', req: 1 }, { k: 'amount', label: 'Amount (optional)', ph: '0.01', half: 1 }, { k: 'label', label: 'Label (optional)', ph: '', half: 1 }], def: { coin: 'bitcoin', addr: '', amount: '', label: '' },
    build: (v) => { if (!t(v.addr)) return ''; const c = COINS[v.coin] || COINS.bitcoin; const q = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoincash', 'monero'].includes(v.coin) ? qs({ amount: v.amount, label: v.label }) : ''; return `${c[1]}:${t(v.addr)}${q ? '?' + q : ''}` } },

  { id: 'text', g: 'text', label: 'Plain text', icon: 'text', fields: [{ k: 'text', label: 'Your text', type: 'area', ph: 'Anything you like…', req: 1 }], def: { text: 'Hello from TheToolTable' }, build: (v) => v.text ?? '' },
]
export const typeById = (id) => TYPES.find((x) => x.id === id) || TYPES[0]
export const defaultsFor = (id) => ({ ...typeById(id).def })
export const buildPayload = (type, v) => { try { return typeById(type).build(v) || '' } catch { return '' } }
export const SAMPLE = { url: 'https://thetooltable.app', wifi: 'WIFI:T:WPA;S:Cafe-Guest;P:welcome123;;', text: 'Hello from TheToolTable' }
