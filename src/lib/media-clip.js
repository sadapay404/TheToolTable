import { fetchFile } from '@ffmpeg/util'
import { getFFmpeg, runFFmpegJob } from './ffmpeg.js'
import { buildStreamCopyClipArgs, safeMediaExtension } from './media-core.js'

const MIME_BY_EXTENSION = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', flac: 'audio/flac', wav: 'audio/wav', aac: 'audio/aac',
}
const mimeFallback = (file, ext) => file.type || MIME_BY_EXTENSION[ext] || 'application/octet-stream'

/** Serialize local clip exports on the same queue as every other shared FFmpeg operation. */
export function clipMediaFile(file, start, end, onProgress) {
  return runFFmpegJob(() => runClip(file, start, end, onProgress))
}

/** Run a lossless stream-copy clip with isolated temporary names and guaranteed cleanup. */
async function runClip(file, start, end, onProgress) {
  if (!file) throw new TypeError('Choose a media file first')
  const ffmpeg = await getFFmpeg()
  const id = globalThis.crypto?.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  const ext = safeMediaExtension(file.name, file.type?.startsWith('audio/') ? 'm4a' : 'mp4')
  const inputName = `ttt-${id}-input.${ext}`
  const outputName = `ttt-${id}-clip.${ext}`
  const progressHandler = ({ progress }) => {
    if (Number.isFinite(progress)) onProgress?.(Math.min(1, Math.max(0, progress)))
  }

  ffmpeg.on('progress', progressHandler)
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    await ffmpeg.exec(buildStreamCopyClipArgs(inputName, outputName, start, end))
    const data = await ffmpeg.readFile(outputName)
    return new Blob([data], { type: mimeFallback(file, ext) })
  } finally {
    ffmpeg.off('progress', progressHandler)
    await Promise.all([inputName, outputName].map((name) => ffmpeg.deleteFile(name).catch(() => {})))
  }
}
