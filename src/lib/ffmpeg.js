import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let instance = null
let loading = null


/** Lazy, shared single-threaded ffmpeg.wasm instance (no COOP/COEP needed). */
export async function getFFmpeg(onProgress) {
  if (instance?.loaded) return instance
  if (loading) return loading
  loading = (async () => {
    const ffmpeg = new FFmpeg()
    if (onProgress) ffmpeg.on('progress', onProgress)
    // The ffmpeg core ships inside the app (works offline, in the PWA and in the Windows/Android builds).
    const base = `${import.meta.env.BASE_URL || '/'}ffmpeg/`
    const [coreURL, wasmURL] = await Promise.all([toBlobURL(base + 'ffmpeg-core.js', 'text/javascript'), toBlobURL(base + 'ffmpeg-core.wasm', 'application/wasm')])
    await ffmpeg.load({ coreURL, wasmURL })
    instance = ffmpeg
    loading = null
    return ffmpeg
  })()
  try { return await loading } catch (e) { loading = null; throw e }
}

export async function convertWithFFmpeg(inputFile, outputName, args, onProgress) {
  const ffmpeg = await getFFmpeg()
  const progHandler = ({ progress }) => onProgress?.(progress * 100)
  ffmpeg.on('progress', progHandler)
  try {
    await ffmpeg.writeFile(inputFile.name, await fetchFile(inputFile))
    await ffmpeg.exec(['-i', inputFile.name, ...args, outputName])
    let data
    try { data = await ffmpeg.readFile(outputName) } catch {
      try { await ffmpeg.deleteFile(inputFile.name) } catch {}
      throw new Error(args.includes('-vn') ? 'This file has no audio track to extract.' : 'Nothing could be produced from this file — it may be empty or in an unsupported variant.')
    }
    await ffmpeg.deleteFile(inputFile.name)
    await ffmpeg.deleteFile(outputName)
    return new Blob([data.buffer], { type: 'application/octet-stream' })
  } finally {
    ffmpeg.off('progress', progHandler)
  }
}
