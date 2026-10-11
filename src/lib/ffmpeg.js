import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { createSerialQueue } from './serial-queue.js'

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

const enqueueFFmpegJob = createSerialQueue()

/** Serialize every multi-step FFmpeg operation: ffmpeg.wasm owns one shared worker and filesystem. */
export function runFFmpegJob(job) { return enqueueFFmpegJob(job) }

/** Keep conversion exports serial on the same queue as other FFmpeg tools. */
export function convertWithFFmpeg(inputFile, outputName, args, onProgress) {
  return runFFmpegJob(() => runConversion(inputFile, outputName, args, onProgress))
}

async function runConversion(inputFile, outputName, args, onProgress) {
  if (!inputFile) throw new TypeError('Choose a file to convert')
  const ffmpeg = await getFFmpeg()
  const id = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  const inputExt = String(inputFile.name || '').match(/\.([a-z0-9]{1,10})$/i)?.[1]?.toLowerCase() || 'bin'
  const outputExt = String(outputName || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const inputPath = `ttt-${id}-input.${inputExt}`
  const outputPath = `ttt-${id}-output.${outputExt}`
  const progHandler = ({ progress }) => { if (Number.isFinite(progress)) onProgress?.(Math.min(100, Math.max(0, progress * 100))) }
  ffmpeg.on('progress', progHandler)
  try {
    await ffmpeg.writeFile(inputPath, await fetchFile(inputFile))
    await ffmpeg.exec(['-i', inputPath, ...args, outputPath])
    const data = await ffmpeg.readFile(outputPath)
    return new Blob([data], { type: 'application/octet-stream' })
  } catch (e) {
    if (e?.name === 'ErrnoError' || /no such file|does not exist/i.test(String(e?.message || e))) {
      throw new Error(args.includes('-vn') ? 'This file has no audio track to extract.' : 'Nothing could be produced — the file may be empty or unsupported.', { cause: e })
    }
    throw e
  } finally {
    ffmpeg.off('progress', progHandler)
    await Promise.all([inputPath, outputPath].map(async (path) => { try { await ffmpeg.deleteFile(path) } catch { /* cleanup is best-effort */ } }))
  }
}
