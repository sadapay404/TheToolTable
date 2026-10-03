/** Procedural sample photo (sunset landscape with balloons) so every tool works without a file. */
export function makeSample(w = 1600, h = 1000) {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const x = c.getContext('2d')
  const sky = x.createLinearGradient(0, 0, 0, h * 0.7)
  sky.addColorStop(0, '#2b3a7a'); sky.addColorStop(0.35, '#8b5fa8'); sky.addColorStop(0.62, '#ee7a5a'); sky.addColorStop(1, '#ffd08a')
  x.fillStyle = sky; x.fillRect(0, 0, w, h)
  // sun glow
  const sun = x.createRadialGradient(w * 0.68, h * 0.58, 0, w * 0.68, h * 0.58, h * 0.4)
  sun.addColorStop(0, 'rgba(255,248,214,1)'); sun.addColorStop(0.18, 'rgba(255,214,128,.9)'); sun.addColorStop(1, 'rgba(255,170,90,0)')
  x.fillStyle = sun; x.fillRect(0, 0, w, h)
  // clouds
  x.globalAlpha = 0.55
  for (let i = 0; i < 9; i++) {
    const cx = (i * 0.13 + 0.05) * w, cy = h * (0.12 + ((i * 37) % 30) / 100)
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 140)
    g.addColorStop(0, 'rgba(255,200,190,.9)'); g.addColorStop(1, 'rgba(255,200,190,0)')
    x.fillStyle = g; x.save(); x.scale(2.2, 0.5); x.beginPath(); x.arc(cx / 2.2, cy / 0.5, 140, 0, 7); x.fill(); x.restore()
  }
  x.globalAlpha = 1
  // hills
  const hill = (base, amp, col, ph) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, h)
    for (let i = 0; i <= w; i += 8) x.lineTo(i, base + Math.sin(i / w * 6 + ph) * amp + Math.sin(i / w * 17 + ph) * amp * 0.25)
    x.lineTo(w, h); x.fill()
  }
  hill(h * 0.68, 38, '#5b3a6e', 1); hill(h * 0.76, 46, '#3d6b52', 2); hill(h * 0.86, 40, '#2a5a3a', 3.4)
  // water-ish foreground stripe
  const wat = x.createLinearGradient(0, h * 0.9, 0, h); wat.addColorStop(0, '#2f7fa8'); wat.addColorStop(1, '#16405e')
  x.fillStyle = wat; x.fillRect(0, h * 0.93, w, h * 0.07)
  // balloons — saturated colours for the HSL mixer
  const balloons = [['#e8352f', .16, .3, 54], ['#f3a21a', .27, .22, 46], ['#f4de2a', .38, .34, 40], ['#3fae49', .12, .5, 44], ['#25b6c9', .3, .5, 50], ['#2f5fd0', .44, .46, 42], ['#8d3fc6', .22, .38, 48], ['#e43d9a', .5, .27, 38]]
  for (const [col, bx, by, r] of balloons) {
    const cx = bx * w, cy = by * h
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy + r); x.lineTo(cx, cy + r * 2.4); x.stroke()
    const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1)
    g.addColorStop(0, '#fff'); g.addColorStop(0.18, col); g.addColorStop(1, col)
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, r * 0.82, r, 0, 0, 7); x.fill()
  }
  return c
}
