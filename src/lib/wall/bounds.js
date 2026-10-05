export const MAX_SIDE = 16_384
export const MAX_CANVAS_PIXELS = 64_000_000

/** Fit pixel dimensions to the browser-safe export envelope while preserving aspect ratio. */
export function fitDimensions(width, height, { maxSide = MAX_SIDE, maxPixels = MAX_CANVAS_PIXELS, minSide = 16 } = {}) {
  const w0 = Number(width), h0 = Number(height)
  if (!Number.isFinite(w0) || !Number.isFinite(h0) || w0 <= 0 || h0 <= 0) {
    throw new RangeError('Canvas width and height must be positive, finite numbers.')
  }
  let w = Math.max(minSide, Math.min(maxSide, Math.round(w0)))
  let h = Math.max(minSide, Math.min(maxSide, Math.round(h0)))
  const scale = Math.min(1, maxSide / w, maxSide / h, Math.sqrt(maxPixels / (w * h)))
  if (scale < 1) {
    w = Math.max(minSide, Math.floor(w * scale))
    h = Math.max(minSide, Math.floor(h * scale))
    while (w * h > maxPixels) {
      if (w >= h && w > minSide) w--
      else if (h > minSide) h--
      else break
    }
  }
  return { w, h, capped: w !== Math.round(w0) || h !== Math.round(h0) }
}

export function assertCanvasSize(width, height, limits) {
  const fitted = fitDimensions(width, height, limits)
  if (fitted.capped) {
    throw new RangeError(`Canvas output exceeds the safe limit (${limits?.maxSide ?? MAX_SIDE} px per side and ${((limits?.maxPixels ?? MAX_CANVAS_PIXELS) / 1_000_000).toLocaleString()} megapixels). Choose a smaller size.`)
  }
  return fitted
}
