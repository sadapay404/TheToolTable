import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Dock, Swap, useToast } from './kit/ui.jsx'
import { decodeFile } from '../lib/voice/audio.js'
import { stopWhisper } from '../lib/voice/whisper.js'
import Transcribe from './voice/Transcribe.jsx'
import Subtitles from './voice/Subtitles.jsx'
import Record from './voice/Record.jsx'
import Trim from './voice/Trim.jsx'
import Dictate from './voice/Dictate.jsx'

const TABS = [['transcribe', 'Make subtitles', 'mic'], ['subs', 'Edit & export', 'text'], ['record', 'Record', 'waves'], ['trim', 'Trim audio', 'scissors'], ['dictate', 'Live dictation', 'type']]

export default function VoiceStudio() {
  const [tab, setTab] = useState('transcribe'), [media, setMedia] = useState(null), [segs, setSegs] = useState([]), [busy, setBusy] = useState(false)
  const [toast, toastNode] = useToast(), urlRef = useRef(null)
  useEffect(() => () => { stopWhisper(); urlRef.current && URL.revokeObjectURL(urlRef.current) }, [])
  const loadFile = useCallback(async (file) => {
    urlRef.current && URL.revokeObjectURL(urlRef.current); urlRef.current = null
    if (!file) { setMedia(null); return }
    setBusy(true)
    try {
      const buffer = await decodeFile(file, (t) => toast(t)), url = URL.createObjectURL(file); urlRef.current = url
      setMedia({ file, name: file.name, size: file.size, url, buffer, duration: buffer.duration, kind: /^video\//.test(file.type) || /\.(mp4|mkv|mov|webm|avi|m4v)$/i.test(file.name) ? 'video' : 'audio' })
    } catch (e) { toast(e.message || 'Could not read that file', 'err') } finally { setBusy(false) }
  }, [toast])
  const props = { media, loadFile, segs, setSegs, go: setTab, toast, busy }
  return (
    <div className="space-y-6">
      <Dock value={tab} onChange={setTab} items={TABS} cols={5} />
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
