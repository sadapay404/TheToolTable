/* Local-only safety heuristics for decoded QR payloads. Nothing leaves the device. */
const SHORT = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'bl.ink', 'lnkd.in', 'qrco.de', 'qr.page', 'l.ead.me', 'urlz.fr', 'v.gd', 'shorte.st', 'adf.ly', 'bit.do', 't.ly', 'surl.li']
const RISKY_TLD = ['zip', 'mov', 'top', 'xyz', 'click', 'tk', 'gq', 'ml', 'cf', 'ga', 'work', 'country', 'rest', 'support', 'icu', 'cyou', 'cfd', 'sbs', 'monster', 'buzz', 'link', 'loan', 'men', 'bid']
const BRANDS = { paypal: 'paypal.com', google: 'google.com', apple: 'apple.com', microsoft: 'microsoft.com', amazon: 'amazon.com', facebook: 'facebook.com', instagram: 'instagram.com', whatsapp: 'whatsapp.com', netflix: 'netflix.com', binance: 'binance.com', coinbase: 'coinbase.com', jazzcash: 'jazzcash.com.pk', easypaisa: 'easypaisa.com.pk', sadapay: 'sadapay.pk', nayapay: 'nayapay.com', meezan: 'meezanbank.com', hbl: 'hbl.com', ubl: 'ubldigital.com', alfalah: 'bankalfalah.com', paytm: 'paytm.com', phonepe: 'phonepe.com', gpay: 'pay.google.com', dhl: 'dhl.com', fedex: 'fedex.com', ups: 'ups.com', tcs: 'tcsexpress.com', daraz: 'daraz.pk', telenor: 'telenor.com.pk', jazz: 'jazz.com.pk', zong: 'zong.com.pk', nadra: 'nadra.gov.pk', fbr: 'fbr.gov.pk', irs: 'irs.gov' }
const EXEC = /\.(apk|exe|scr|bat|cmd|msi|dmg|jar|vbs|ps1|pkg|deb|rpm|sh|appimage|iso|lnk)(\?|#|$)/i
const mixedScript = (h) => /[^\x00-\x7f]/.test(h)

export function checkSafety(p) {
  const f = []
  const add = (lv, t) => f.push({ lv, t })
  const raw = p.raw || ''
  if (p.type === 'url' || /^(javascript|data|file|vbscript|intent):/i.test(raw)) {
    if (/^(javascript|data|vbscript|file):/i.test(raw)) add('danger', 'This is not a web address — it contains a script or local-file URI that can run code.')
    if (/^intent:/i.test(raw)) add('warn', 'Android “intent” links can launch apps directly.')
    let u = null; try { u = new URL(p.url || raw) } catch {}
    if (u) {
      const host = u.hostname.toLowerCase(), h2 = host.replace(/^www\./, '')
      if (u.protocol === 'http:') add('warn', 'Not encrypted (http://) — anything you type could be read in transit.')
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(host) || /^\d{8,10}$/.test(host)) add('danger', 'The link points to a raw IP address instead of a name — common in phishing and malware.')
      if (host.split('.').some((x) => x.startsWith('xn--'))) add('danger', 'Punycode domain — it may be a look-alike of a real site using foreign characters.')
      else if (mixedScript(host)) add('warn', 'The domain contains non-English characters, which can be used to imitate real sites.')
      if (SHORT.includes(h2)) add('warn', 'Shortened link — the real destination is hidden until you open it.')
      const tld = host.split('.').pop()
      if (RISKY_TLD.includes(tld)) add('warn', `“.${tld}” domains are used disproportionately for spam and scams.`)
      if (u.username || u.password || /@/.test((p.url || raw).split('?')[0].split('//')[1]?.split('/')[0] || '')) add('danger', 'The address contains “@” credentials — the real host is whatever comes after it, not what comes first.')
      if (host.split('.').length > 4) add('warn', 'Unusually many sub-domains — a typical way to hide the real site name.')
      const lab = host.split('.')
      Object.entries(BRANDS).forEach(([b, real]) => { if (h2.includes(b) && !(h2 === real || h2.endsWith('.' + real))) { if (!f.some((x) => x.t.startsWith('Mentions'))) add('danger', `Mentions “${b}” but is not on ${real} — looks like an imitation.`) } })
      if (EXEC.test(u.pathname)) add('danger', 'Direct download of an app / installer file — only install software from stores you trust.')
      if ((p.url || raw).length > 220) add('info', 'Very long address with lots of tracking or redirect data.')
      if (/[?&](redirect|url|next|continue|return|goto|dest)=https?/i.test(u.search)) add('warn', 'Contains a redirect to another site.')
      if (u.port && !['80', '443'].includes(u.port)) add('info', `Uses a non-standard port (:${u.port}).`)
      if (!f.length) add('ok', 'No red flags found in the address (this is a local check, not a guarantee).')
    }
  } else if (p.type === 'wifi') {
    if (p.wifi.enc === 'nopass') add('warn', 'Open network — traffic is not encrypted. Avoid sensitive logins.')
    else if (p.wifi.enc === 'WEP') add('warn', 'WEP security is broken and easy to crack.')
    else add('ok', 'Uses password-protected Wi-Fi.')
    if (p.wifi.hidden) add('info', 'Hidden network — your device will broadcast its attempts to join.')
  } else if (p.type === 'payment') {
    add('warn', 'Payment code: check the payee name and account carefully before sending money.')
    if (p.pay?.amount) add('info', `Pre-filled amount: ${p.pay.amount}`)
  } else if (p.type === 'crypto') add('warn', 'Crypto transfers cannot be reversed. Verify the full address character by character.')
  else if (p.type === 'otp') add('danger', 'Contains a 2-factor secret. Never scan one that someone else gave you.')
  else if (p.type === 'phone' || p.type === 'sms') {
    const n = (p.rows[0]?.[1] || '').trim()
    if (/^[*#]/.test(n) || /[*#]\d/.test(n)) add('danger', 'USSD-style code — can forward calls or change settings on your phone.')
    else if (/^\d{3,6}$/.test(n)) add('warn', 'Short code — may be a premium-rate number that charges you.')
    else add('ok', 'Looks like a normal phone number.')
  } else if (p.type === 'text' && /(https?:\/\/|www\.)\S+/i.test(raw)) add('info', 'The text contains a link — treat it like any link from a stranger.')
  else add('ok', 'Nothing risky detected.')
  const rank = { ok: 0, info: 1, warn: 2, danger: 3 }
  const level = f.reduce((m, x) => (rank[x.lv] > rank[m] ? x.lv : m), 'ok')
  return { level: level === 'ok' ? 'safe' : level, findings: f }
}
