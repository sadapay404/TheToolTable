import React from 'react'

/**
 * TheToolTable icon set.
 *
 * These were emoji until Part 3. Emoji are not a reliable icon system: they are
 * drawn by the *system* font, so they render as empty tofu boxes on any Android
 * skin without a colour-emoji font, they cannot inherit `currentColor`, they do
 * not scale crisply, and they cannot be animated.
 *
 * Every glyph below is a 24×24 filled path drawn in `currentColor`, so an icon
 * re-colours with the Material state layers and themes for free.
 */

/* Each entry is a list of <path d> segments in a 24×24 box. */
const GLYPHS = {
  /* 01 — a framed photo with a magnifier: find data inside an image. */
  metadata: [
    'M4 4h12a2 2 0 0 1 2 2v3.1a6.5 6.5 0 0 0-1.5-.1A5.5 5.5 0 0 0 11 14.5c0 1.1.32 2.12.88 3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M5 7.5h3V9H5zm0 3.5h2V13H5z',
    'M16.5 9a5.5 5.5 0 1 0 3.9 9.4l2.3 2.3 1.4-1.4-2.3-2.3A5.5 5.5 0 0 0 16.5 9zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
  ],
  /* 02 — two arrows swapping: any format to any format. */
  converter: [
    'M7.5 3 3 7.5 7.5 12V9H15V7H7.5V3zM16.5 12v3H9v2h7.5v3L21 15.5 16.5 12z',
  ],
  /* 03 — crosshair on a target: hit an exact size budget. */
  compressor: [
    'M12 2a1 1 0 0 1 1 1v2.06A7 7 0 0 1 18.94 11H21a1 1 0 1 1 0 2h-2.06A7 7 0 0 1 13 18.94V21a1 1 0 1 1-2 0v-2.06A7 7 0 0 1 5.06 13H3a1 1 0 1 1 0-2h2.06A7 7 0 0 1 11 5.06V3a1 1 0 0 1 1-1zm0 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  ],
  /* 04 — scissors: cut and download. */
  clipper: [
    'M9.64 7.64c.23-.5.36-1.05.36-1.64a4 4 0 1 0-8 0 4 4 0 0 0 4 4c.59 0 1.14-.13 1.64-.36L10 12l-2.36 2.36A4 4 0 1 0 6 18a4 4 0 0 0 1.64.36L12 14l7 7h3v-1L9.64 7.64zM6 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6-7.5a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zM19 3l-6 6 2 2 7-7V3z',
  ],
  /* 05 — tuning sliders: colour grading studio. */
  imagestudio: [
    'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  ],
  /* 06 — sparkles over a cut-out: AI background removal. */
  bgremover: [
    'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z',
  ],
  /* 07 — film frames: extract and clip frames. */
  frames: [
    'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4h-4zM4 18h16v2H4v-2z',
  ],
  /* 08 — equaliser bars: audio made visual. */
  visualizer: [
    'M7 18h2V6H7v12zm3-4h2v-4h-2v4zm3-8v16h2V6h-2zM2 16h2v-2H2v2zm13 0h2v-2h-2v2zM2 8h2V6H2v2zm13 0h2V6h-2v2z',
  ],
  /* 09 — a balanced scale: units, currency and time. */
  units: [
    'M12 3a3 3 0 0 0-2.82 2H3v2h1.95L2 14c-.47 2 1 3 3.5 3s4.06-1 3.5-3L6.05 7H9.2c.42 1.2 1.55 2 2.8 2s2.38-.8 2.8-2H18v6.05c-1.16.32-2 1.35-2 2.45a2.5 2.5 0 1 0 5 0c0-1.1-.84-2.13-2-2.45V5h4V3h-8.82A3 3 0 0 0 12 3zm0 2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z',
  ],
  /* 10 — a die: fair random choice. */
  decision: [
    'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-8 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8 5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0-5a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  ],
  /* 11 — QR code with one finder highlighted. */
  qr: [
    'M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10-2h2v2h-2v-2zm4 0h2v4h-2v-4zm-6 4h4v2h-4v-2zm0 4h2v2h-2v-2zm4 0h4v2h-4v-2z',
  ],
  /* 12 — layered gradient panel: background canvas. */
  backgrounds: [
    'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4v2h2V8H6zm4 0v2h2V8h-2zm4 0v2h4V8h-4zM6 12v2h2v-2H6zm4 0v2h4v-2h-4zm6 0v2h2v-2h-2zm-10 4v2h6v-2H6zm8 0v2h4v-2h-4z',
  ],
  /* 13 — document with a folded corner and a rule. */
  pdf: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L17.5 8H14V4.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2zm0-8h4v2H8V8z',
  ],
  /* 14 — a page being scanned. */
  ocr: [
    'M7 2h10v2H7V2zM5 4h2v3H3V6a2 2 0 0 1 2-2zm12 0a2 2 0 0 1 2 2v1h-2V4zM5 15H3v3a2 2 0 0 0 2 2h3v-2H5v-3zm14 0v3h-3v2h3a2 2 0 0 0 2-2v-3h-2zM7 7h10v10H7V7zm2 2v6h6V9H9z',
  ],
  /* 15 — microphone: voice and subtitles. */
  voice: [
    'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.3-3a1 1 0 0 0-1 1 4.3 4.3 0 0 1-8.6 0 1 1 0 0 0-2 0 6.3 6.3 0 0 0 5.3 6.22V21h2v-2.78A6.3 6.3 0 0 0 18.3 12a1 1 0 0 0-1-1z',
  ],
  /* 16 — a receipt with a torn edge. */
  invoice: [
    'M5 2h14a1 1 0 0 1 1 1v18.4l-2.5-1.6-2.5 1.6-3-1.6-3 1.6L6.5 19.8 4 21.4V3a1 1 0 0 1 1-1zm2 5h10v2H7V7zm0 4h10v2H7v-2zm0 4h6v2H7v-2z',
  ],
  /* 17 — a beam leaving the device: peer-to-peer transfer. */
  beam: [
    'M3 20l18-17-6.5 18-3.2-7.3L3 20zM12.6 12.6L18 7l-7.6 3.9L12.6 12.6z',
  ],
  /* 18 — a puzzle piece: icon and asset forge. */
  icons: [
    'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V5H6a2 2 0 0 0-2 2v3.8H3.5a1 1 0 0 0 0 2H4V16a2 2 0 0 0 2 2h3.8v-1.5a1.5 1.5 0 0 1 3 0V18H16a2 2 0 0 0 2-2v-3h1.5a1 1 0 1 0 0-2z',
  ],
  /* 19 — a coin with a rupee stem: Pakistan money kit. */
  pkmoney: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.66 8.5H12.9a3.1 3.1 0 0 0-.28 1.5c0 .5.11.96.3 1.4h3.14a1 1 0 1 1 0 2h-3.5a6.2 6.2 0 0 1-2.2 2.66V21h-2v-2.9A6.9 6.9 0 0 1 7 9.5h5.66a1 1 0 1 0 0-2H7v-2h8.66a1 1 0 0 1 0 2z',
  ],
  /* 20 — a pen writing: text and writing lab. */
  textlab: [
    'M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.7 7.04z',
  ],
  /* shared shell + nav glyphs */
  grid: [
    'M4 4h6v6H4V4zm0 10h6v6H4v-6zM14 4h6v6h-6V4zm0 10h6v6h-6v-6z',
  ],
  search: [
    'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z',
  ],
  sliders: [
    'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  ],
  sparkle: [
    'M12 2l1.9 4.6L18.5 8.5l-4.6 1.9L12 15l-1.9-4.6L5.5 8.5l4.6-1.9L12 2zm6.5 9l.95 2.3 2.3.95-2.3.95-.95 2.3-.95-2.3-2.3-.95 2.3-.95.95-2.3z',
  ],
  clock: [
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.5 5H11v6l5.2 3.1.8-1.3-4.5-2.7V7z',
  ],
}

const NAMES = Object.keys(GLYPHS)

/** Ids the registry may use, plus a safe fallback. */
export function hasIcon(name) {
  return Object.hasOwn(GLYPHS, name)
}

/**
 * @param {string} name  icon id, e.g. `qr`
 * @param {number} size  px size (icons are authored on a 24×24 grid)
 */
export function ToolIcon({ name, size = 24, className = '', title, strokeWidth = 0, ...rest }) {
  const paths = hasIcon(name) ? GLYPHS[name] : GLYPHS.sparkle
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((d, i) => <path key={i} d={d} strokeWidth={strokeWidth || undefined} />)}
    </svg>
  )
}

export { GLYPHS, NAMES }