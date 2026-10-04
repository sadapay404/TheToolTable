import { Path } from './paths.js'

export const DOT_SHAPES = [
  ['square', 'Square'], ['liquid', 'Liquid'], ['soft', 'Soft'], ['dots', 'Dots'], ['diamond', 'Diamond'], ['star', 'Sparkle'],
  ['plus', 'Plus'], ['hexagon', 'Hex'], ['heart', 'Heart'], ['classy', 'Classy'], ['barsv', 'Bars ↕'], ['barsh', 'Bars ↔'],
]
export const FRAME_SHAPES = [['square', 'Square'], ['rounded', 'Rounded'], ['soft', 'Soft'], ['circle', 'Circle'], ['leaf', 'Leaf'], ['cut', 'Cut']]
export const BALL_SHAPES = [['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle'], ['leaf', 'Leaf'], ['diamond', 'Diamond'], ['star', 'Sparkle'], ['cut', 'Cut'], ['squircle', 'Squircle']]

const HEART = [[0.5, 0.92], [0.1, 0.62, 0.05, 0.38, 0.13, 0.24], [0.22, 0.08, 0.42, 0.1, 0.5, 0.28], [0.58, 0.1, 0.78, 0.08, 0.87, 0.24], [0.95, 0.38, 0.9, 0.62, 0.5, 0.92]]

/** add one module-sized dot to path P. (x,y)=cell top-left, s=scale 0..1, nb=neighbour flags */
export function addDot(P, shape, x, y, s, nb) {
  const i = (1 - s) / 2, X = x + i, Y = y + i, S = s, cx = x + 0.5, cy = y + 0.5
  switch (shape) {
    case 'liquid': { const R = S / 2; return P.rr(X, Y, S, S, !nb.t && !nb.l ? R : 0, !nb.t && !nb.r ? R : 0, !nb.b && !nb.r ? R : 0, !nb.b && !nb.l ? R : 0) }
    case 'soft': return P.rr(X, Y, S, S, S * 0.32)
    case 'dots': return P.circle(cx, cy, S / 2)
    case 'diamond': { const h = S * 0.64; return P.poly([[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]]) }
    case 'star': { const R = S * 0.68, r = S * 0.24, pts = []; for (let k = 0; k < 8; k++) { const a = (-90 + k * 45) * Math.PI / 180, q = k % 2 ? r : R; pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]) } return P.poly(pts) }
    case 'plus': { const a = S * 0.2, b = S * 0.5; return P.poly([[cx - a, cy - b], [cx + a, cy - b], [cx + a, cy - a], [cx + b, cy - a], [cx + b, cy + a], [cx + a, cy + a], [cx + a, cy + b], [cx - a, cy + b], [cx - a, cy + a], [cx - b, cy + a], [cx - b, cy - a], [cx - a, cy - a]]) }
    case 'hexagon': { const R = S * 0.58, pts = []; for (let k = 0; k < 6; k++) { const a = (-90 + k * 60) * Math.PI / 180; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]) } return P.poly(pts) }
    case 'heart': {
      const t = (p) => [X + p[0] * S, Y + p[1] * S]
      const a = t(HEART[0]); P.m(a[0], a[1])
      for (let k = 1; k < HEART.length; k++) { const q = HEART[k], u = t(q.slice(0, 2)), v = t(q.slice(2, 4)), w = t(q.slice(4, 6)); P.cu(u[0], u[1], v[0], v[1], w[0], w[1]) }
      return P.z()
    }
    case 'classy': return P.rr(X, Y, S, S, S * 0.5, 0, S * 0.5, 0)
    case 'barsv': { const w = S * 0.72, bx = cx - w / 2, R = w / 2, top = nb.t ? y : Y, bot = nb.b ? y + 1 : Y + S; return P.rr(bx, top, w, bot - top, nb.t ? 0 : R, nb.t ? 0 : R, nb.b ? 0 : R, nb.b ? 0 : R) }
    case 'barsh': { const h = S * 0.72, by = cy - h / 2, R = h / 2, lft = nb.l ? x : X, rgt = nb.r ? x + 1 : X + S; return P.rr(lft, by, rgt - lft, h, nb.l ? 0 : R, nb.r ? 0 : R, nb.r ? 0 : R, nb.l ? 0 : R) }
    default: return P.rr(X, Y, S, S, 0)
  }
}

/** finder ring (7×7 with 5×5 hole) at (x,y) — drawn with evenodd */
export function addEyeFrame(P, shape, x, y, idx) {
  const o = 7, n = 5, a = x + 1, b = y + 1
  const two = idx === 0 ? [1, 0, 1, 0] : [0, 1, 0, 1]
  switch (shape) {
    case 'rounded': P.rr(x, y, o, o, 1.7); P.rr(a, b, n, n, 0.9); break
    case 'soft': P.rr(x, y, o, o, 2.5); P.rr(a, b, n, n, 1.5); break
    case 'circle': P.circle(x + 3.5, y + 3.5, 3.5); P.circle(x + 3.5, y + 3.5, 2.5); break
    case 'leaf': P.rr(x, y, o, o, 3.2 * two[0], 3.2 * two[1], 3.2 * two[2], 3.2 * two[3]); P.rr(a, b, n, n, 2.2 * two[0], 2.2 * two[1], 2.2 * two[2], 2.2 * two[3]); break
    case 'cut': {
      const cut = (X, Y, S, c) => P.poly([[X + c, Y], [X + S - c, Y], [X + S, Y + c], [X + S, Y + S - c], [X + S - c, Y + S], [X + c, Y + S], [X, Y + S - c], [X, Y + c]])
      cut(x, y, o, 1.8); cut(a, b, n, 1.1); break
    }
    default: P.rr(x, y, o, o, 0); P.rr(a, b, n, n, 0)
  }
}

/** 3×3 ball at (x,y) = top-left of the ball box */
export function addEyeBall(P, shape, x, y, idx) {
  const S = 3, cx = x + 1.5, cy = y + 1.5
  const two = idx === 0 ? [1, 0, 1, 0] : [0, 1, 0, 1]
  switch (shape) {
    case 'rounded': return P.rr(x, y, S, S, 0.8)
    case 'circle': return P.circle(cx, cy, 1.5)
    case 'squircle': return P.rr(x, y, S, S, 1.15)
    case 'leaf': return P.rr(x, y, S, S, 1.5 * two[0], 1.5 * two[1], 1.5 * two[2], 1.5 * two[3])
    case 'diamond': { const h = 1.95; return P.poly([[cx, cy - h], [cx + h, cy], [cx, cy + h], [cx - h, cy]]) }
    case 'star': { const R = 2.05, r = 0.78, pts = []; for (let k = 0; k < 8; k++) { const a = (-90 + k * 45) * Math.PI / 180, q = k % 2 ? r : R; pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]) } return P.poly(pts) }
    case 'cut': { const c = 0.8; return P.poly([[x + c, y], [x + S - c, y], [x + S, y + c], [x + S, y + S - c], [x + S - c, y + S], [x + c, y + S], [x, y + S - c], [x, y + c]]) }
    default: return P.rr(x, y, S, S, 0)
  }
}
