import { useCallback, useEffect, useRef, useState } from 'react'
import { Dock, Swap, useToast } from './kit/ui.jsx'
import { decodeFile, voiceMediaKind } from '../lib/voice/audio.js'
import { stopWhisper } from '../lib/voice/whisper.js'
import Transcribe from './voice/Transcribe.jsx'
import Subtitles from './voice/Subtitles.jsx'
import Record from './voice/Record.jsx'
import Trim from './voice/Trim.jsx'
import Dictate from './voice/Dictate.jsx'

const TABS = [['transcribe', 'Make subtitles', 'mic'], ['subs', 'Edit & export', 'text'], ['record', 'Record', 'waves'], ['trim', 'Trim audio', 'scissors'], ['dictate', 'Live dictation', 'type']]

export default function VoiceStudio() {
  const [tab, setTab] = useState('transcribe'), [media, setMedia] = useState(null), [segs, setSegs] = useState([]), [busy, setBusy] = useState(false)
  const [toast, toastNode] = useToast(), urlRef = useRef(null), loadId = useRef(0)
  const [loadStatus, setLoadStatus] = useState('')

  useEffect(() => () => {
    loadId.current++
    stopWhisper()
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
  }, [])

  const loadFile = useCallback(async (file) => {
    const id = ++loadId.current
    if (!file) {
      setBusy(false); setLoadStatus(''); setMedia(null); setSegs([])
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
      return
    }
    const kind = voiceMediaKind(file)
    if (!kind) { setBusy(false); setLoadStatus(''); toast('Choose a supported audio or video file', 'err'); return }
    setBusy(true); setLoadStatus('Reading audio…')
    try {
      const buffer = await decodeFile(file, (status) => { if (loadId.current === id) setLoadStatus(status) })
      if (loadId.current !== id) return
      const url = URL.createObjectURL(file), oldUrl = urlRef.current
      urlRef.current = url
      setMedia({ file, name: file.name, size: file.size, url, buffer, duration: buffer.duration, kind })
      setSegs([])
      if (oldUrl) URL.revokeObjectURL(oldUrl)
    } catch (error) {
      if (loadId.current === id) toast(error.message || 'Could not read that file', 'err')
    } finally {
      if (loadId.current === id) { setBusy(false); setLoadStatus('') }
    }
  }, [toast])

  const props = { media, loadFile, segs, setSegs, go: setTab, toast, busy, loadStatus }
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto -mx-1 px-1"><div className="min-w-[34rem] sm:min-w-0"><Dock value={tab} onChange={setTab} items={TABS} cols={5} /></div></div>
      {busy && <div role="status" className="text-[12.5px] font-medium rounded-xl px-4 py-3" style={{ color: 'var(--muted)', background: 'var(--surface)' }}>{loadStatus || 'Loading media…'}</div>}
      <Swap k={tab}>
        {tab === 'transcribe' && <Transcribe {...props} />}
        {tab === 'subs' && <Subtitles {...props} />}
        {tab === 'record' && <Record {...props} />}
        {tab === 'trim' && <Trim {...props} />}
        {tab === 'dictate' && <Dictate {...props} />}
      </Swap>
      {toastNode}
    </div>
  )
}
