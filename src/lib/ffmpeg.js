import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

let instance = null
let loading = null

const CDN = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

/** Lazy, shared single-threaded ffmpeg.wasm instance (no COOP/COEP needed). */
export async function getFFmpeg(onProgress) {
  if (instance?.loaded) return instance
  if (loading) return loading
  loading = (async () => {
    const ffmpeg = new FFmpeg()
    if (onProgress) ffmpeg.on('progress', onProgress)
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${CDN}/ffmpeg-core.wasm`, 'application/wasm'),
    ])
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
    const data = await ffmpeg.readFile(outputName)
    await ffmpeg.deleteFile(inputFile.name)
    await ffmpeg.deleteFile(outputName)
    return new Blob([data.buffer], { type: 'application/octet-stream' })
  } finally {
    ffmpeg.off('progress', progHandler)
  }
}
