export const FONTS = {
  display: ['Fraunces', 'Fraunces, Georgia, serif', 'Fraunces'], sans: ['Inter', 'Inter, system-ui, Arial, sans-serif', 'Inter'],
  serif: ['Georgia', 'Georgia, "Times New Roman", serif', 'Georgia'], mono: ['Mono', 'ui-monospace, "SF Mono", Consolas, monospace', 'Mono'], black: ['Black', '"Arial Black", Impact, Arial, sans-serif', 'Black'],
}
export async function ensureFonts(t) { try { await document.fonts.load(`${t.italic ? 'italic ' : ''}${t.weight} 40px ${FONTS[t.font]?.[1] || FONTS.display[1]}`) } catch {} }

/** draw the headline / subtitle block. `auto` = colour to use when t.color === 'auto' */
export function drawText(ctx, W, H, t, auto = '#fff') {
  if (!t.on || !(t.title || t.sub)) return
  const U = Math.sqrt(W * H), fs = (t.size / 100) * U, fam = FONTS[t.font]?.[1] || FONTS.display[1]
  const col = t.color === 'auto' ? auto : t.color
  const lines = String(t.title || '').split('\n').filter((l, i, a) => l.length || i < a.length - 1)
  const subs = String(t.sub || '').split('\n').filter(Boolean)
  const subFs = fs * t.subScale
  ctx.save(); ctx.globalAlpha = t.opacity; ctx.fillStyle = col; ctx.textBaseline = 'alphabetic'
  const track = (t.track / 100)
  const setFont = (px, w, it) => { ctx.font = `${it ? 'italic ' : ''}${w} ${px}px ${fam}` }
  const widthOf = (s, px) => { let w = ctx.measureText(s).width; if (track) w += track * px * Math.max(0, s.length - 1); return w }
  const rows = []
  setFont(fs, t.weight, t.italic); for (const l of lines) rows.push({ s: l, px: fs, w: widthOf(l, fs), gap: fs * 1.12 })
  const gap0 = rows.length ? fs * 0.55 : 0
  setFont(subFs, Math.min(500, t.weight), false); for (const l of subs) rows.push({ s: l, px: subFs, w: widthOf(l, subFs), gap: subFs * 1.45, sub: true, pre: gap0 })
  // re-measure properly per row font
  rows.forEach((r) => { setFont(r.px, r.sub ? Math.min(500, t.weight) : t.weight, r.sub ? false : t.italic); r.w = widthOf(r.s, r.px) })
  const bw = Math.max(0, ...rows.map((r) => r.w))
  let bh = 0; rows.forEach((r, i) => { bh += (i === 0 ? r.px * 0.8 : r.gap) + (r.pre && i > 0 && !rows[i - 1].sub ? r.pre : 0) })
  const mx = 0.07 * U, my = 0.07 * U
  const ox = t.ax === 0 ? mx : t.ax === 2 ? W - mx - bw : (W - bw) / 2
  const oy = t.ay === 0 ? my : t.ay === 2 ? H - my - bh : (H - bh) / 2
  let x0 = ox + (t.dx / 100) * W, y = oy + (t.dy / 100) * H
  if (t.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${t.shadow * 0.55})`; ctx.shadowBlur = fs * 0.28; ctx.shadowOffsetY = fs * 0.06 }
  rows.forEach((r, i) => {
    y += i === 0 ? r.px * 0.8 : r.gap + (r.pre && !rows[i - 1].sub ? r.pre : 0)
    setFont(r.px, r.sub ? Math.min(500, t.weight) : t.weight, r.sub ? false : t.italic)
    const x = t.ax === 0 ? x0 : t.ax === 2 ? x0 + bw - r.w : x0 + (bw - r.w) / 2
    if (!track) { ctx.textAlign = 'left'; ctx.fillText(r.s, x, y) }
    else { let cx = x; for (const ch of r.s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + track * r.px } }
  })
  ctx.restore()
}
