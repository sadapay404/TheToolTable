/* Tiny vector path builder → SVG `d` or PostScript. */
const K = 0.5522847498
const f = (n) => (Math.round(n * 1000) / 1000).toString()
export class Path {
  constructor() { this.c = [] }
  m(x, y) { this.c.push(['M', x, y]); return this }
  l(x, y) { this.c.push(['L', x, y]); return this }
  cu(a, b, c, d, x, y) { this.c.push(['C', a, b, c, d, x, y]); return this }
  z() { this.c.push(['Z']); return this }
  poly(pts) { pts.forEach((p, i) => (i ? this.l(p[0], p[1]) : this.m(p[0], p[1]))); return this.z() }
  /** rounded rect with per-corner radii (tl,tr,br,bl) */
  rr(x, y, w, h, tl = 0, tr = tl, br = tl, bl = tl) {
    const m = Math.min(w, h) / 2
    tl = Math.min(tl, m); tr = Math.min(tr, m); br = Math.min(br, m); bl = Math.min(bl, m)
    this.m(x + tl, y).l(x + w - tr, y)
    if (tr) this.cu(x + w - tr + tr * K, y, x + w, y + tr - tr * K, x + w, y + tr)
    this.l(x + w, y + h - br)
    if (br) this.cu(x + w, y + h - br + br * K, x + w - br + br * K, y + h, x + w - br, y + h)
    this.l(x + bl, y + h)
    if (bl) this.cu(x + bl - bl * K, y + h, x, y + h - bl + bl * K, x, y + h - bl)
    this.l(x, y + tl)
    if (tl) this.cu(x, y + tl - tl * K, x + tl - tl * K, y, x + tl, y)
    return this.z()
  }
  circle(cx, cy, r) {
    return this.m(cx + r, cy).cu(cx + r, cy + r * K, cx + r * K, cy + r, cx, cy + r).cu(cx - r * K, cy + r, cx - r, cy + r * K, cx - r, cy)
      .cu(cx - r, cy - r * K, cx - r * K, cy - r, cx, cy - r).cu(cx + r * K, cy - r, cx + r, cy - r * K, cx + r, cy).z()
  }
  append(o) { this.c.push(...o.c); return this }
  get empty() { return !this.c.length }
  d() { return this.c.map((s) => s[0] + s.slice(1).map(f).join(' ')).join('') }
  /** PostScript using transform t(x,y)->[X,Y] */
  ps(t) {
    return this.c.map((s) => {
      if (s[0] === 'M') { const [X, Y] = t(s[1], s[2]); return `${f(X)} ${f(Y)} moveto` }
      if (s[0] === 'L') { const [X, Y] = t(s[1], s[2]); return `${f(X)} ${f(Y)} lineto` }
      if (s[0] === 'C') { const a = t(s[1], s[2]), b = t(s[3], s[4]), c = t(s[5], s[6]); return `${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])} curveto` }
      return 'closepath'
    }).join('\n')
  }
}
export const fmtNum = f
