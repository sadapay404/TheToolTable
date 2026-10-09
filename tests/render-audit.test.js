/**
 * Part 10, seventh batch: the parts that draw every frame.
 *
 * The audio visualiser writes into a typed array sixty times a second and hands
 * it straight to a canvas. A single NaN there does not produce a bad picture —
 * it produces a canvas the browser refuses to paint, and a visualiser stuck on a
 * black rectangle. The same goes for the QR template and logo tables: a
 * malformed entry is a broken code, drawn with confidence.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { bandsFromAnalyser, synth, NB } from '../src/lib/viz/analyzer.js'
import { TEMPLATES, TEMPLATE_CATS } from '../src/lib/qr/templates.js'
import { LOGOS, LOGO_GROUPS, logoById, logoMarkup } from '../src/lib/qr/logos.js'
import { lum, contrast, withDefaults, lightStyle, merge, effectiveEcc } from '../src/lib/qr/render.js'

/* ============================================================== the visualiser */

test('the synthetic signal stays inside the range a canvas can paint', () => {
  const raw = new Float32Array(NB), wave = new Float32Array(256)
  /* Sweep a full beat cycle and well past it, including negative and huge time. */
  for (const t of [0, 0.001, 0.25, 0.5, 0.499, 0.75, 1, 12.5, 1000, -5, NaN, Infinity]) {
    const level = synth(t, raw, wave, 1)
    assert.ok(Number.isFinite(level), `synth(${t}) returned ${level}`)
    for (let k = 0; k < NB; k++) {
      assert.ok(Number.isFinite(raw[k]), `synth(${t}) produced ${raw[k]} at band ${k}`)
      assert.ok(raw[k] >= 0 && raw[k] <= 1, `synth(${t}) produced ${raw[k]} at band ${k}, outside 0..1`)
    }
    for (let i = 0; i < wave.length; i++) {
      assert.ok(Number.isFinite(wave[i]), `synth(${t}) produced ${wave[i]} at sample ${i}`)
    }
  }
})

test('the visualiser responds to intensity without clipping or inverting', () => {
  const rawA = new Float32Array(NB), rawB = new Float32Array(NB)
  const a = new Float32Array(NB), b = new Float32Array(NB)
  synth(0.3, rawA, a, 0.4)
  synth(0.3, rawB, b, 1.0)
  let louderSomewhere = 0
  for (let k = 0; k < NB; k++) {
    assert.ok(rawB[k] >= rawA[k] - 1e-6, 'raising the intensity lowered a band')
    if (rawB[k] > rawA[k] + 1e-6) louderSomewhere++
    assert.ok(rawB[k] <= 1, 'the louder signal clipped above 1')
  }
  assert.ok(louderSomewhere > NB / 4, 'raising the intensity changed almost nothing')
})

test('the visualiser copes with an array of any size, or none', () => {
  for (const [n, w] of [[0, 0], [1, 1], [3, 2], [NB, 1], [NB, 1000]]) {
    const raw = new Float32Array(n), wave = new Float32Array(w)
    const level = synth(1.5, raw, wave, 1)
    assert.ok(Number.isFinite(level), `synth with ${n} bands and ${w} samples returned ${level}`)
  }
  /* A hostile intensity must not produce a canvas full of NaN. */
  for (const intensity of [0, -1, 1e9, NaN, Infinity, undefined, null, 'loud']) {
    const raw = new Float32Array(NB), wave = new Float32Array(64)
    synth(0.7, raw, wave, intensity)
    const bad = [...raw].filter((v) => !Number.isFinite(v)).length
    assert.equal(bad, 0, `an intensity of ${intensity} produced ${bad} non-finite bands`)
  }
})

/** A stand-in for the Web Audio AnalyserNode, returning whatever we hand it. */
function analyser(freqs, wave) {
  return { getByteFrequencyData: (out) => out.set(freqs), getByteTimeDomainData: (out) => out.set(wave) }
}

test('live audio bands are real numbers between 0 and 1', () => {
  const N = 512, freqs = new Uint8Array(N), wave = new Uint8Array(N)
  const raw = new Float32Array(NB), waveOut = new Float32Array(64)
  const sr = 44100

  for (const fill of [0, 255, 128]) {
    freqs.fill(fill); wave.fill(fill)
    const bass = bandsFromAnalyser(analyser(freqs, wave), sr, new Float64Array(NB), raw, waveOut, { f: new Uint8Array(N), w: new Uint8Array(N) })
    assert.ok(Number.isFinite(bass), `a constant ${fill} input reported bass ${bass}`)
    assert.ok(bass >= 0 && bass <= 1, `a constant ${fill} input reported bass ${bass}`)
    for (let k = 0; k < NB; k++) {
      assert.ok(Number.isFinite(raw[k]), `a constant ${fill} input produced ${raw[k]} at band ${k}`)
      assert.ok(raw[k] >= 0 && raw[k] <= 1, `a constant ${fill} input produced ${raw[k]} at band ${k}`)
    }
  }

  /* Silence must be silent; a full-scale signal must be loud. */
  const tmp = { f: new Uint8Array(N), w: new Uint8Array(N) }
  freqs.fill(0); wave.fill(128)
  const silent = bandsFromAnalyser(analyser(freqs, wave), sr, new Float64Array(NB), raw, waveOut, tmp)
  freqs.fill(255); wave.fill(255)
  const loud = bandsFromAnalyser(analyser(freqs, wave), sr, new Float64Array(NB), raw, waveOut, tmp)
  assert.ok(silent < 0.05, `silence reported a bass level of ${silent}`)
  assert.ok(loud > 0.3, `a full-scale signal reported a bass level of ${loud}`)
})

test('a hostile sample rate or empty buffer does not divide by zero', () => {
  const raw = new Float32Array(NB), waveOut = new Float32Array(32)
  const freqs = new Float64Array(NB)
  for (const sr of [0, 1, 8000, 192000, NaN, Infinity, -44100, undefined]) {
    for (const N of [0, 1, 2, 512]) {
      const tmp = { f: new Uint8Array(N), w: new Uint8Array(N) }
      const out = (() => { try { return bandsFromAnalyser(analyser(tmp.f, tmp.w), sr, freqs, raw, waveOut, tmp) } catch (e) { return `threw: ${e.message}` } })()
      assert.notEqual(typeof out, 'string', `bandsFromAnalyser(sr=${sr}, N=${N}) threw: ${out}`)
      for (let k = 0; k < NB; k++) {
        assert.ok(Number.isFinite(raw[k]), `sr=${sr}, N=${N} produced ${raw[k]} at band ${k}`)
      }
      for (let i = 0; i < waveOut.length; i++) assert.ok(Number.isFinite(waveOut[i]), `sr=${sr}, N=${N} produced ${waveOut[i]} at sample ${i}`)
    }
  }
})

/* ============================================================= QR template data */

test('every QR template is complete and renderable', () => {
  assert.ok(TEMPLATES.length > 10, `only ${TEMPLATES.length} templates`)
  const ids = new Set()
  for (const t of TEMPLATES) {
    assert.ok(t && typeof t === 'object', 'a template is not an object')
    assert.ok(t.id && !ids.has(t.id), `template id ${t.id} is missing or duplicated`)
    ids.add(t.id)
    assert.ok(typeof t.name === 'string' && t.name.length, `${t.id} has no name`)
    assert.ok(TEMPLATE_CATS.includes(t.cat), `${t.id} claims the category ${t.cat}, which is not offered`)
    assert.ok(t.style && typeof t.style === 'object', `${t.id} has no style`)
    /* A style that does not survive its own normaliser would draw differently
       from how it is advertised in the picker. */
    const normalised = withDefaults(t.style)
    assert.ok(normalised && typeof normalised === 'object', `${t.id} does not survive style normalisation`)
    assert.doesNotMatch(JSON.stringify(normalised), /undefined|NaN/, `${t.id} normalises to something broken`)
    /* Every colour it declares must be a real colour, or the contrast check
       silently passes on black. */
    for (const value of Object.values(t.style)) {
      if (value && typeof value === 'object' && typeof value.color === 'string') {
        assert.match(value.color, /^#[0-9a-f]{6,8}$/i, `${t.id} declares the colour ${value.color}`)
      }
    }
  }
  /* Every category must have at least one template, or the picker shows a
     heading with nothing under it. */
  for (const cat of TEMPLATE_CATS) {
    assert.ok(TEMPLATES.some((t) => t.cat === cat), `the category "${cat}" has no templates`)
  }
})

test('a QR template is always readable', () => {
  /* The whole point of a QR template is that it still scans. */
  for (const t of TEMPLATES) {
    const s = withDefaults(t.style)
    const fg = s.dots?.color || '#000000'
    const bg = s.bg?.color || s.bg || '#ffffff'
    const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : '#000000')
    const ratio = contrast(hex(fg), hex(bg))
    assert.ok(ratio >= 3, `the template "${t.name}" has a contrast of only ${ratio.toFixed(2)}:1 and will not scan`)
  }
})

test('every QR logo is addressable by id', () => {
  assert.ok(Array.isArray(LOGOS) && LOGOS.length > 20, `only ${LOGOS.length} logos`)
  const ids = new Set()
  for (const logo of LOGOS) {
    assert.ok(logo && typeof logo.id === 'string' && logo.id, 'a logo has no id')
    assert.equal(ids.has(logo.id), false, `the logo id ${logo.id} is used twice`)
    ids.add(logo.id)
    assert.ok(logo.name, `${logo.id} has no name`)
    assert.ok(LOGO_GROUPS.includes(logo.g), `${logo.id} claims the group ${logo.g}, which is not offered`)
    assert.equal(logoById(logo.id), logo, `${logo.id} is not returned by logoById`)
    /* Markup is pasted into an SVG document, so it has to be inert and closed. */
    const markup = logoMarkup(logo)
    assert.equal(typeof markup, 'string', `${logo.id} produced no markup`)
    assert.ok(markup.length > 10, `${logo.id} produced an empty icon`)
    assert.doesNotMatch(markup, /<script|javascript:|on\w+\s*=/i, `${logo.id} emits markup that could execute`)
    assert.match(markup.trim(), /^<[\s\S]*>$/, `${logo.id} is not a single SVG element`)
  }
  assert.equal(logoById('not-a-logo'), undefined)
  assert.equal(logoById(''), undefined)
  assert.equal(logoById(undefined), undefined)
  for (const group of LOGO_GROUPS) {
    assert.ok(LOGOS.some((l) => l.g === group), `the group "${group}" is empty`)
  }
})

/* ================================================================ contrast maths */

test('the contrast check reports what the eye sees', () => {
  assert.ok(Math.abs(contrast('#000000', '#ffffff') - 21) < 0.01, 'black on white is not 21:1')
  assert.ok(contrast('#ffffff', '#ffffff') < 1.01, 'a colour against itself has no contrast')
  assert.equal(lum('#ffffff'), 1)
  assert.ok(Math.abs(lum('#000000')) < 1e-9)
  /* And it is symmetric, because a swapped pair is the same problem. */
  for (const [a, b] of [['#5B4BD6', '#FDFBF7'], ['#111111', '#EEEEEE'], ['#C6BFFF', '#1A1A1A']]) {
    assert.ok(Math.abs(contrast(a, b) - contrast(b, a)) < 1e-9, 'contrast is not symmetric')
  }
})

test('style merging never lets a half-specified style through', () => {
  const base = withDefaults({})
  assert.ok(base && typeof base === 'object', 'the default style is not an object')
  const merged = merge(base, { dots: { color: '#123456' } })
  assert.equal(merged.dots.color, '#123456')
  assert.ok(merged.dots.shape, 'merging replaced the dots instead of merging into them')
  assert.ok(merged.bg, 'merging dropped the background')
  assert.doesNotMatch(JSON.stringify(withDefaults({ dots: { color: 'javascript:alert(1)' } })), /javascript:/,
    'an arbitrary colour string survived normalisation')
  assert.ok(['L', 'M', 'Q', 'H'].includes(effectiveEcc(withDefaults({ ecc: 'nonsense' }))),
    'an unknown error-correction level was not replaced')
  assert.ok(lightStyle({}), 'the light style is not an object')
})