/* Target-size bitrate maths for the Compressor. Pure + dependency-free so it can be unit-tested in Node
   and asserted against the real ffmpeg output in the browser harness. */

export const OVERHEAD_SHARE = 0.02   // container / muxing allowance
export const HEADROOM_SHARE = 0.98   // keep 2% headroom so we land *under* the cap
export const MIN_VIDEO_KBPS = 20     // below this the encode is pointless
export const MAX_AUDIO_KBPS = 320    // AAC practical ceiling
export const MIN_AUDIO_KBPS = 32

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Plan a size-targeted encode.
 * @param {{targetMB:number, duration:number, audioKbps?:number, audioOnly?:boolean}} o
 * @returns {null|{targetBytes:number,overhead:number,audioBytes:number,vKbps:number,aKbps:number,est:number,fits:boolean,audioOnly:boolean}}
 */
export function planCompression({ targetMB, duration, audioKbps = 128, audioOnly = false }) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(targetMB) || targetMB <= 0) return null
  const targetBytes = targetMB * 1024 * 1024
  const overhead = targetBytes * OVERHEAD_SHARE
  const videoBudget = targetBytes * HEADROOM_SHARE - overhead
  if (audioOnly) {
    // Audio file: the whole budget goes to one audio stream (AAC tops out around 320 kbps).
    const kbps = clamp(Math.floor(((videoBudget * 8) / duration) / 1000), MIN_AUDIO_KBPS, MAX_AUDIO_KBPS)
    const audioBytes = (kbps * 1000 * duration) / 8
    const est = audioBytes + overhead
    return { targetBytes, overhead, audioBytes, aKbps: kbps, vKbps: 0, est, fits: est <= targetBytes, audioOnly: true }
  }
  const aBytes = (audioKbps * 1000 * duration) / 8
  const videoBits = Math.max(0, (videoBudget - aBytes) * 8)
  const vKbps = Math.round(videoBits / duration / 1000)
  const est = (vKbps * 1000 * duration) / 8 + aBytes + overhead
  return { targetBytes, overhead, audioBytes: aBytes, vKbps, aKbps: 0, est, fits: vKbps >= MIN_VIDEO_KBPS && est <= targetBytes, audioOnly: false }
}

/**
 * If the requested budget cannot be reached, say exactly what would make it work instead of
 * leaving the user with a dead end. Nulls mean "no change needed / nothing can help".
 * @returns {{audioKbps:number|null, targetMB:number|null}}
 */
export function planSuggestion(plan, { duration, targetMB, audioKbps = 128, audioOnly = false }) {
  const out = { audioKbps: null, targetMB: null }
  if (!plan || plan.fits) return out
  const targetBytes = targetMB * 1024 * 1024
  const minVideoBytes = (MIN_VIDEO_KBPS * 1000 * duration) / 8
  // 1) Shrink the audio track (only a lever for video files) — largest AAC rate that still fits.
  //    Never suggest a rate we have not verified with the real planner.
  if (!audioOnly) {
    const budgetForAudio = targetBytes * (HEADROOM_SHARE - OVERHEAD_SHARE) - minVideoBytes
    const kbps = clamp(Math.floor(((budgetForAudio * 8) / duration) / 1000), MIN_AUDIO_KBPS, MAX_AUDIO_KBPS)
    if (kbps < audioKbps && planCompression({ targetMB, duration, audioKbps: kbps }).fits) out.audioKbps = kbps
  }
  // 2) Raise the target — the size the current settings really need, rounded up to a clean 1 MB.
  const needed = audioOnly ? (Math.min(plan.aKbps, MAX_AUDIO_KBPS) * 1000 * duration) / 8 : (audioKbps * 1000 * duration) / 8 + minVideoBytes
  const minTarget = Math.ceil((needed / (HEADROOM_SHARE - OVERHEAD_SHARE) / (1024 * 1024)) * 10) / 10
  if (Number.isFinite(minTarget) && minTarget > targetMB) {
    // Round up to a clean half-megabyte, then verify with the real planner before promising it.
    const guess = Math.ceil(minTarget * 2) / 2
    if (planCompression({ targetMB: guess, duration, audioKbps, audioOnly }).fits) out.targetMB = guess
  }
  return out
}

/** Final size vs the budget, in bytes (positive = overshoot). */
export const overshootBytes = (plan, actualBytes) => (plan ? Math.round(actualBytes - plan.targetBytes) : 0)
