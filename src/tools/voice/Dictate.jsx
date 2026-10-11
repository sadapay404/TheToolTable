import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Panel, Label, Btn, Chips, KIco, save, Empty, Switch } from '../kit/ui.jsx'

const L = [['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-IN', 'English (India)'], ['ur-PK', 'Urdu · اردو'], ['hi-IN', 'Hindi'], ['ar-SA', 'Arabic'], ['fr-FR', 'French'], ['de-DE', 'German'], ['es-ES', 'Spanish'], ['tr-TR', 'Turkish']]
export default function Dictate({ toast }) {
  const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  const [lang, setLang] = useState('en-US'), [on, setOn] = useState(false), [text, setText] = useState(''), [interim, setInterim] = useState(''), [punct, setPunct] = useState(true), rec = useRef(null), want = useRef(false)
  useEffect(() => () => { want.current = false; rec.current?.abort?.() }, [])
  if (!SR) return <Panel><Empty icon="mic" title="Live dictation isn't available here" sub="This browser has no built-in speech recognition. Use Chrome, Edge or Safari — or make subtitles from a recording instead." /></Panel>
  const start = () => {
    try {
      const r = new SR(); r.lang = lang; r.continuous = true; r.interimResults = true; want.current = true
      r.onresult = (e) => {
        let interimText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const phrase = String(e.results[i][0]?.transcript || '').trim()
          if (e.results[i].isFinal && phrase) setText((current) => (current + (current && !/\s$/.test(current) ? ' ' : '') + phrase + (punct && !/[.!?۔؟]$/.test(phrase) ? '.' : '')).trimStart().slice(0, 1_000_000))
          else interimText += phrase
        }
        setInterim(interimText.slice(0, 2_000))
      }
      r.onerror = (event) => {
        const terminal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported'].includes(event.error)
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') toast('Microphone permission or speech service was blocked', 'err')
        else if (event.error === 'audio-capture') toast('No microphone is available', 'err')
        else if (event.error === 'network') toast('Live dictation needs an internet connection in this browser', 'err')
        else if (terminal && event.error !== 'language-not-supported') toast('The speech recognizer stopped unexpectedly', 'err')
        if (terminal) { want.current = false; setOn(false); setInterim('') }
      }
      r.onend = () => {
        if (want.current) { try { r.start() } catch { want.current = false; setOn(false); setInterim(''); toast('Could not restart live dictation', 'err') } }
        else { setOn(false); setInterim('') }
      }
      rec.current = r; r.start(); setOn(true)
    } catch (error) { want.current = false; setOn(false); toast(error?.message || 'Could not start live dictation. Check microphone access.', 'err') }
  }
  const stop = () => { want.current = false; rec.current?.stop() }
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <Panel>
        <div className="flex items-center gap-4 mb-4">
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={on ? stop : start} aria-label={on ? 'Stop dictation' : 'Start dictation'} className="relative w-16 h-16 rounded-full grid place-items-center text-white shrink-0" style={{ background: on ? '#C3423F' : 'var(--ink)' }}>
            {on && <motion.span className="absolute inset-0 rounded-full" style={{ border: '2px solid #C3423F' }} animate={{ scale: [1, 1.5], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} />}<KIco n={on ? 'stop' : 'mic'} s={26} /></motion.button>
          <div><div className="display font-semibold text-[18px]">{on ? 'Listening…' : 'Press and speak'}</div><div className="text-[12.5px]" style={{ color: 'var(--muted)' }}>Words appear as you talk</div></div>
        </div>
        <textarea aria-label="Dictated text" dir="auto" className="input w-full" rows={13} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your words will appear here…" style={{ lineHeight: 1.75 }} />
        <AnimatePresence>{interim && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} dir="auto" className="mt-2 text-[14px] italic" style={{ color: 'var(--muted)' }}>{interim}</motion.div>}</AnimatePresence>
        <div className="flex flex-wrap gap-2 mt-4"><Btn icon="copy" disabled={!text} onClick={async () => { try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Copy blocked by the browser', 'err') } }}>Copy</Btn><Btn icon="file" disabled={!text} onClick={() => save(new Blob([text], { type: 'text/plain;charset=utf-8' }), 'dictation.txt')}>Save .txt</Btn><Btn icon="trash" danger disabled={!text} onClick={() => setText('')}>Clear</Btn></div>
      </Panel>
      <Panel delay={0.08}>
        <Label>Language</Label>
        <Chips value={lang} onChange={(v) => { setLang(v); if (on) { stop() } }} options={L} small />
        <div className="mt-5"><Switch on={punct} onChange={setPunct} label="Add full stops" hint="Adds a period after each phrase" /></div>
        <div className="text-[11.5px] mt-4" style={{ color: 'var(--muted)' }}>Uses your browser's built-in speech service, which may send audio to the browser vendor. For fully private, offline transcription use “Make subtitles”.</div>
      </Panel>
    </div>
  )
}
