/**
 * GIF frame budgeting — pure maths, no encoders, so it can be unit-tested and shared by the UI.
 * A browser GIF with more than 300 frames is slow to encode and huge, so the planner caps it and
 * *says so* (`capped`) instead of silently shortening the selection.
 */
export const MAX_GIF_FRAMES = 300

export function gifPlan(start, end, fps) {
  const dur = Math.max(0, end - start)
  const wanted = Math.max(1, Math.floor(dur * fps))
  const frames = Math.min(MAX_GIF_FRAMES, wanted)
  return { frames, wanted, capped: wanted > MAX_GIF_FRAMES, seconds: frames / fps }
}
