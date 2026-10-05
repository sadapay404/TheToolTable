const VIDEO_EXTENSIONS = new Set(['3gp', 'avi', 'm2ts', 'm2v', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'mts', 'mxf', 'ogv', 'ts', 'vob', 'webm', 'wmv'])
const AUDIO_EXTENSIONS = new Set(['aac', 'aif', 'aiff', 'amr', 'flac', 'm4a', 'm4b', 'mka', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba', 'wma'])
const MiB = 1024 * 1024
const CONTAINER_RESERVE = 0.03

/** Infer a supported media kind even when the browser leaves File.type empty. */
export function mediaKind(file) {
  const type = String(file?.type || '').toLowerCase()
  if (type.startsWith('audio/')) return 'audio'
  if (type.startsWith('video/')) return 'video'
  const ext = String(file?.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase()
  if (ext && AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext && VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

/** Allocate the requested file-size budget before encoding. */
export function buildCompressionPlan({ kind, duration, targetMB, audioKbps }) {
  if (!['audio', 'video'].includes(kind)) throw new TypeError('Media kind must be audio or video')
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(targetMB) || targetMB <= 0) throw new RangeError('Target size must be positive')
  if (!Number.isFinite(audioKbps) || audioKbps < 0 || (kind === 'audio' && audioKbps === 0)) throw new RangeError('Audio bitrate must be non-negative for video or positive for audio-only input')

  const targetBytes = targetMB * MiB
  const overhead = Math.ceil(targetBytes * CONTAINER_RESERVE)

  if (kind === 'audio') {
    const maxAudioKbps = Math.floor(Math.max(0, targetBytes - overhead) * 8 / duration / 1000)
    const outputAudioKbps = Math.min(Math.round(audioKbps), maxAudioKbps)
    const audioBytes = outputAudioKbps * 1000 * duration / 8
    const estimatedBytes = audioBytes + overhead
    return {
      kind, targetBytes, overhead, audioBytes, videoBytes: 0, videoKbps: null,
      audioKbps: outputAudioKbps, requestedAudioKbps: Math.round(audioKbps),
      estimatedBytes, fits: outputAudioKbps >= 32 && estimatedBytes <= targetBytes,
    }
  }

  // Audio can be disabled for silent sources, giving the full budget to video.
  const selectedAudioKbps = Math.round(audioKbps)
  const audioBytes = selectedAudioKbps * 1000 * duration / 8
  const videoBytes = Math.max(0, targetBytes - overhead - audioBytes)
  const videoKbps = Math.floor(videoBytes * 8 / duration / 1000)
  const allocatedVideoBytes = videoKbps * 1000 * duration / 8
  const estimatedBytes = allocatedVideoBytes + audioBytes + overhead
  return {
    kind, targetBytes, overhead, audioBytes, videoBytes: allocatedVideoBytes,
    videoKbps, audioKbps: selectedAudioKbps, estimatedBytes,
    fits: videoKbps >= 20 && estimatedBytes <= targetBytes,
  }
}

/** Build real two-pass H.264 arguments; audio is optional or deliberately omitted. */
export function buildVideoPassArgs({ inputName, outputName, passLogName, videoKbps, audioKbps, scale = 1 }) {
  if (!inputName || !outputName || !passLogName) throw new TypeError('Input, output and pass-log paths are required')
  if (!Number.isFinite(videoKbps) || videoKbps < 1 || !Number.isFinite(audioKbps) || audioKbps < 0) {
    throw new RangeError('Video bitrate must be positive and audio bitrate cannot be negative')
  }
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) throw new RangeError('Scale must be between 0 and 1')

  const filter = `scale=trunc(iw*${scale}/2)*2:trunc(ih*${scale}/2)*2`
  const videoOptions = ['-vf', filter, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', `${videoKbps}k`, '-preset', 'medium']
  const audioOptions = audioKbps > 0
    ? ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', `${audioKbps}k`]
    : ['-an']
  return {
    firstPass: [
      '-y', '-i', inputName, '-map', '0:v:0', ...videoOptions,
      '-an', '-pass', '1', '-passlogfile', passLogName, '-f', 'null', '-',
    ],
    secondPass: [
      '-y', '-i', inputName, '-map', '0:v:0', ...audioOptions, ...videoOptions,
      '-pass', '2', '-passlogfile', passLogName,
      '-map_metadata', '0', '-movflags', '+faststart', outputName,
    ],
  }
}

/** Build an audio-only AAC/M4A encode. */
export function buildAudioArgs(inputName, outputName, audioKbps) {
  if (!inputName || !outputName) throw new TypeError('Input and output paths are required')
  if (!Number.isFinite(audioKbps) || audioKbps < 1) throw new RangeError('Audio bitrate must be positive')
  return [
    '-y', '-i', inputName, '-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', `${audioKbps}k`,
    '-map_metadata', '0', '-movflags', '+faststart', outputName,
  ]
}

const uniqueId = () => globalThis.crypto?.randomUUID?.().replace(/-/g, '')
  || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`

/** Run all passes as one serialized job because ffmpeg.wasm has a single shared worker. */
export function encodeToTargetSize(file, plan, options = {}) {
  if (!file || !plan) return Promise.reject(new TypeError('Choose a valid media file first'))
  const { scale = 1, onProgress, loadFFmpeg, readFile, runJob } = options
  const job = async () => {
    const ffmpegModule = loadFFmpeg ? null : await import('./ffmpeg.js')
    const utilModule = readFile ? null : await import('@ffmpeg/util')
    const ffmpeg = await (loadFFmpeg || ffmpegModule.getFFmpeg)()
    const fileReader = readFile || utilModule.fetchFile
    const id = uniqueId()
    const ext = String(file.name || '').match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || (plan.kind === 'audio' ? 'm4a' : 'mp4')
    const inputName = `ttt-${id}-input.${ext}`
    const outputExt = plan.kind === 'audio' ? 'm4a' : 'mp4'
    const outputName = `ttt-${id}-compressed.${outputExt}`
    const passLogName = `ttt-${id}-passlog`
    let currentPass = 1
    const progressHandler = ({ progress }) => {
      if (!Number.isFinite(progress)) return
      const normalized = Math.min(1, Math.max(0, progress))
      onProgress?.(plan.kind === 'video' ? (currentPass === 1 ? normalized * 50 : 50 + normalized * 50) : normalized * 100)
    }
    const files = [inputName, outputName, `${passLogName}-0.log`, `${passLogName}-0.log.mbtree`]

    ffmpeg.on('progress', progressHandler)
    try {
      await ffmpeg.writeFile(inputName, await fileReader(file))
      if (plan.kind === 'video') {
        const args = buildVideoPassArgs({
          inputName, outputName, passLogName,
          videoKbps: plan.videoKbps, audioKbps: plan.audioKbps, scale,
        })
        await ffmpeg.exec(args.firstPass)
        currentPass = 2
        onProgress?.(50)
        await ffmpeg.exec(args.secondPass)
      } else {
        await ffmpeg.exec(buildAudioArgs(inputName, outputName, plan.audioKbps))
      }
      const data = await ffmpeg.readFile(outputName)
      onProgress?.(100)
      return {
        blob: new Blob([data], { type: plan.kind === 'audio' ? 'audio/mp4' : 'video/mp4' }),
        ext: outputExt,
      }
    } finally {
      ffmpeg.off('progress', progressHandler)
      await Promise.all(files.map(async (name) => { try { await ffmpeg.deleteFile(name) } catch { /* best-effort temp cleanup */ } }))
    }
  }
  if (runJob) return runJob(job)
  return import('./ffmpeg.js').then(({ runFFmpegJob }) => runFFmpegJob(job))
}
