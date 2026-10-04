/* ---------- statistics ---------- */
const STOP = new Set('the a an and or of to in is it that for on with as are was be this by at from have has had not but they you we he she his her their our your i me my its will would can could should there what which who when where how if then than so no yes do does did been were am into out up about over also just more most some any each other'.split(' '))
const syl = (w) => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); return Math.max(1, (w.match(/[aeiouy]{1,2}/g) || []).length) }
export function stats(t) {
  const words = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || [], sentences = (t.match(/[^.!?۔؟\n]+[.!?۔؟]+|[^.!?۔؟\n]+$/gm) || []).filter((s) => /[\p{L}\p{N}]/u.test(s))
  const paras = t.split(/\n\s*\n/).filter((p) => p.trim()), lines = t ? t.split('\n').length : 0
  const freq = new Map(); for (const w of words) { const k = w.toLowerCase(); if (k.length > 2 && !STOP.has(k) && !/^\d+$/.test(k)) freq.set(k, (freq.get(k) || 0) + 1) }
  const top = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8)
  const latin = words.filter((w) => /^[A-Za-z'’\-]+$/.test(w)), sy = latin.reduce((s, w) => s + syl(w), 0)
  let flesch = null; if (latin.length >= 30 && sentences.length) flesch = 206.835 - 1.015 * (latin.length / sentences.length) - 84.6 * (sy / latin.length)
  const urdu = (t.match(/[\u0600-\u06FF]/g) || []).length, share = t.replace(/\s/g, '').length ? urdu / t.replace(/\s/g, '').length : 0
  return { words: words.length, chars: t.length, charsNoSpace: t.replace(/\s/g, '').length, sentences: sentences.length, paras: paras.length, lines, read: words.length / 220, speak: words.length / 140, top, flesch, unique: new Set(words.map((w) => w.toLowerCase())).size, rtl: share > 0.4, longest: words.reduce((m, w) => (w.length > m.length ? w : m), '') }
}
export const fleschLabel = (f) => (f == null ? '' : f >= 80 ? 'Very easy' : f >= 60 ? 'Plain English' : f >= 50 ? 'Fairly hard' : f >= 30 ? 'Hard' : 'Very hard')

/* ---------- transforms ---------- */
const wordsOf = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
const SMALL = new Set('a an and as at but by for in nor of on or the to up via'.split(' '))
export const slugify = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '')
export const CASES = [
  ['upper', 'UPPER CASE', (s) => s.toUpperCase()], ['lower', 'lower case', (s) => s.toLowerCase()],
  ['title', 'Title Case', (s) => s.toLowerCase().replace(/(^|[\s(“"'])([\p{L}][\p{L}'’]*)/gu, (m, a, w, i) => a + (i > 0 && SMALL.has(w) ? w : cap(w)))],
  ['sentence', 'Sentence case', (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)([\p{L}])/gu, (m, a, c) => a + c.toUpperCase())],
  ['camel', 'camelCase', (s) => wordsOf(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')], ['pascal', 'PascalCase', (s) => wordsOf(s).map(cap).join('')],
  ['snake', 'snake_case', (s) => wordsOf(s).map((w) => w.toLowerCase()).join('_')], ['kebab', 'kebab-case', (s) => wordsOf(s).map((w) => w.toLowerCase()).join('-')],
  ['const', 'CONSTANT_CASE', (s) => wordsOf(s).map((w) => w.toUpperCase()).join('_')], ['alt', 'aLtErNaTe', (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('')],
  ['swap', 'sWAP cASE', (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')], ['slug', 'url-slug', slugify],
]
const lines = (f) => (s) => f(s.split('\n')).join('\n')
export const CLEAN = [
  ['trim', 'Trim every line', lines((l) => l.map((x) => x.trim()))], ['spaces', 'Collapse extra spaces', (s) => s.replace(/[ \t\u00A0]{2,}/g, ' ')],
  ['blank', 'Remove blank lines', lines((l) => l.filter((x) => x.trim()))], ['dupes', 'Remove duplicate lines', lines((l) => [...new Set(l)])],
  ['join', 'Join lines into one', (s) => s.replace(/\s*\n\s*/g, ' ').trim()], ['para', 'One blank line between paragraphs', (s) => s.replace(/\n{2,}/g, '\n\n').replace(/([^\n])\n(?!\n)/g, '$1 ')],
  ['sortaz', 'Sort A → Z', lines((l) => [...l].sort((a, b) => a.localeCompare(b)))], ['sortza', 'Sort Z → A', lines((l) => [...l].sort((a, b) => b.localeCompare(a)))],
  ['sortlen', 'Sort by length', lines((l) => [...l].sort((a, b) => a.length - b.length))], ['revlines', 'Reverse line order', lines((l) => [...l].reverse())],
  ['number', 'Number the lines', lines((l) => l.map((x, i) => `${i + 1}. ${x}`))], ['bullet', 'Add bullets', lines((l) => l.map((x) => (x.trim() ? '• ' + x : x)))],
  ['html', 'Strip HTML tags', (s) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')],
  ['quotes', 'Straighten curly quotes', (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/[–—]/g, '-')],
  ['emoji', 'Remove emoji', (s) => s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')], ['accents', 'Remove accents', (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')],
  ['ascii', 'Remove non-ASCII', (s) => s.replace(/[^\x00-\x7F]/g, '')], ['reverse', 'Reverse text', (s) => [...s].reverse().join('')],
  ['urdufix', 'Fix Urdu letters (ي ك ه → ی ک ہ)', (s) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ه/g, 'ہ').replace(/ى/g, 'ی')], ['harakat', 'Remove Urdu/Arabic zabar-zer', (s) => s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')],
  ['digits', 'Urdu digits → 0-9', (s) => s.replace(/[٠-٩۰-۹]/g, (d) => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(d) % 10))],
]
export const EXTRACT = [['emails', 'Email addresses', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g], ['urls', 'Links', /https?:\/\/[^\s<>"')]+/g], ['numbers', 'Numbers', /-?\d[\d,]*\.?\d*/g], ['tags', 'Hashtags', /#[\p{L}\d_]+/gu], ['phones', 'Phone numbers', /(?:\+?92|0)?3\d{2}[-\s]?\d{7}|\+?\d[\d\s-]{8,}\d/g]]
export const ENCODE = [
  ['b64', 'Base64 encode', (s) => btoa(unescape(encodeURIComponent(s)))], ['unb64', 'Base64 decode', (s) => decodeURIComponent(escape(atob(s.trim())))],
  ['url', 'URL encode', encodeURIComponent], ['unurl', 'URL decode', decodeURIComponent],
  ['ent', 'HTML entities', (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))], ['hex', 'Text → hex', (s) => [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join(' ')],
]

/* ---------- find & replace ---------- */
export function findRe(q, { regex, cs, whole }) {
  if (!q) return null
  let src = regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); if (whole) src = `(?<![\\p{L}\\p{N}_])(?:${src})(?![\\p{L}\\p{N}_])`
  return new RegExp(src, 'gu' + (cs ? '' : 'i'))
}

/* ---------- diff (word level, LCS) ---------- */
export function diff(a, b, mode = 'words') {
  const tok = (s) => (mode === 'lines' ? s.split('\n').map((x, i, arr) => x + (i < arr.length - 1 ? '\n' : '')) : s.match(/\s+|[^\s]+/g) || [])
  const A = tok(a), B = tok(b), n = A.length, m = B.length
  if (n * m > 9e6) return mode === 'lines' ? null : diff(a, b, 'lines')
  const w = m + 1, dp = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
  const out = []; let i = 0, j = 0
  const push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }) }
  while (i < n && j < m) { if (A[i] === B[j]) { push('=', A[i]); i++; j++ } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) push('-', A[i++]); else push('+', B[j++]) }
  while (i < n) push('-', A[i++]); while (j < m) push('+', B[j++])
  return out
}

/* ---------- Urdu ⇄ Roman Urdu (rule based, approximate) ---------- */
const DICT = `main:میں mein:میں hai:ہے hain:ہیں ho:ہو hun:ہوں hoon:ہوں tha:تھا thi:تھی the:تھے kya:کیا kaise:کیسے kaisa:کیسا kaisi:کیسی kaun:کون kab:کب kahan:کہاں kyun:کیوں kyon:کیوں aap:آپ hum:ہم tum:تم woh:وہ wo:وہ yeh:یہ ye:یہ mera:میرا meri:میری mere:میرے tera:تیرا apna:اپنا apni:اپنی ka:کا ki:کی ke:کے ko:کو se:سے par:پر pe:پر ne:نے aur:اور ya:یا lekin:لیکن magar:مگر agar:اگر to:تو bhi:بھی nahi:نہیں nahin:نہیں haan:ہاں ji:جی acha:اچھا achha:اچھا theek:ٹھیک shukriya:شکریہ meherbani:مہربانی salam:سلام assalam:السلام alaikum:علیکم khuda:خدا hafiz:حافظ allah:اللہ pakistan:پاکستان urdu:اردو zindagi:زندگی dost:دوست pyar:پیار mohabbat:محبت dil:دل ghar:گھر paani:پانی pani:پانی khana:کھانا chai:چائے kaam:کام waqt:وقت din:دن raat:رات subah:صبح shaam:شام aaj:آج kal:کل abhi:ابھی phir:پھر bohat:بہت bahut:بہت thoda:تھوڑا zyada:زیادہ kam:کم naya:نیا purana:پرانا bara:بڑا chota:چھوٹا log:لوگ insan:انسان bhai:بھائی behan:بہن ammi:امی abu:ابو beta:بیٹا beti:بیٹی kitab:کتاب school:اسکول dunya:دنیا mulk:ملک shehar:شہر sab:سب koi:کوئی kuch:کچھ har:ہر jo:جو jab:جب tab:تب yahan:یہاں wahan:وہاں idhar:ادھر udhar:ادھر chalo:چلو aao:آؤ jao:جاؤ dekho:دیکھو suno:سنو bolo:بولو karo:کرو karna:کرنا hona:ہونا jana:جانا aana:آنا khushi:خوشی gham:غم umeed:امید khwab:خواب ishq:عشق sahi:صحیح galat:غلط mubarak:مبارک inshallah:انشاءاللہ mashallah:ماشاءاللہ alhamdulillah:الحمدللہ mubashir:مبشر bannu:بنوں khyber:خیبر pakhtunkhwa:پختونخوا`.split(/\s+/).map((x) => x.split(':'))
const R2U = new Map(DICT), U2R = new Map(); for (const [r, u] of DICT) if (!U2R.has(u)) U2R.set(u, r)
const DI = [['kh', 'خ'], ['gh', 'غ'], ['sh', 'ش'], ['ch', 'چ'], ['th', 'تھ'], ['dh', 'دھ'], ['bh', 'بھ'], ['ph', 'پھ'], ['jh', 'جھ'], ['zh', 'ژ'], ['aa', 'ا'], ['ee', 'ی'], ['oo', 'و'], ['ai', 'ے'], ['au', 'او'], ['ay', 'ے']]
const SG = { b: 'ب', p: 'پ', t: 'ت', j: 'ج', d: 'د', r: 'ر', z: 'ز', s: 'س', f: 'ف', q: 'ق', k: 'ک', g: 'گ', l: 'ل', m: 'م', n: 'ن', v: 'و', w: 'و', h: 'ہ', y: 'ی', x: 'کس', c: 'ک' }
function rWord(w) {
  const lw = w.toLowerCase(); if (R2U.has(lw)) return R2U.get(lw)
  let o = '', i = 0; const V = 'aeiou'
  while (i < lw.length) {
    const two = lw.slice(i, i + 2), d = DI.find((x) => x[0] === two)
    if (d) { o += i === 0 && d[0] === 'aa' ? 'آ' : d[1]; i += 2; continue }
    const c = lw[i], first = i === 0, last = i === lw.length - 1
    if (V.includes(c)) { if (first) o += c === 'a' || c === 'i' || c === 'u' ? 'ا' : c === 'o' ? 'او' : 'ا'; else if (last) o += { a: 'ا', e: 'ے', i: 'ی', o: 'و', u: 'و' }[c]; else if (c === 'o' || c === 'u') o += 'و'; else if (c === 'e') o += 'ی' }
    else o += SG[c] ?? c
    i++
  }
  return o
}
export const romanToUrdu = (s) => s.replace(/[A-Za-z]+/g, rWord).replace(/\?/g, '؟').replace(/,/g, '،').replace(/;/g, '؛')
const UM = { ا: 'a', آ: 'aa', ب: 'b', پ: 'p', ت: 't', ٹ: 't', ث: 's', ج: 'j', چ: 'ch', ح: 'h', خ: 'kh', د: 'd', ڈ: 'd', ذ: 'z', ر: 'r', ڑ: 'r', ز: 'z', ژ: 'zh', س: 's', ش: 'sh', ص: 's', ض: 'z', ط: 't', ظ: 'z', ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ک: 'k', گ: 'g', ل: 'l', م: 'm', ن: 'n', ں: 'n', و: 'o', ہ: 'h', ھ: 'h', ء: '', ی: 'i', ے: 'e', ئ: 'y', ؤ: 'o', ۃ: 'h', ۓ: 'e' }
const CONS = new Set([...'bptsjchkdrzfqgglmnvyx'])
function uWord(w) {
  if (U2R.has(w)) return U2R.get(w)
  let o = ''; const ch = [...w.replace(/[\u064B-\u065F\u0670]/g, '')]
  ch.forEach((c, i) => {
    let r = UM[c] ?? c; const prev = ch[i - 1], next = ch[i + 1]
    if (c === 'ا' && i > 0) r = 'a'; if (c === 'و' && (prev === 'ا' || prev === 'آ')) r = 'w'; if (c === 'ی' && i < ch.length - 1 && next !== 'ے' && i > 0) r = 'i'; if (c === 'ھ') r = 'h'
    const cur = r[0], last = o[o.length - 1]
    if (CONS.has(last) && CONS.has(cur) && c !== 'ھ' && o.length) o += 'a'
    o += r
  }); return o
}
export const urduToRoman = (s) => s.replace(/[\u0621-\u065F\u066E-\u06D3\u06D5]+/g, uWord).replace(/؟/g, '?').replace(/،/g, ',').replace(/؛/g, ';').replace(/۔/g, '.')
