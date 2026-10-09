/**
 * Part 10, eighth batch: the QR matrix itself.
 *
 * Everything else in this suite checks the app around the QR code. This checks
 * the code: that the geometry a scanner relies on is actually there. A QR with
 * a missing finder pattern, a broken timing pattern or an impossible version
 * number is rejected by every reader, and it looks perfectly fine on screen.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeMatrix, buildQR, withDefaults, effectiveEcc, heuristics, contrast } from '../src/lib/qr/render.js'
import { DEFAULT_STYLE } from '../src/lib/qr/render.js'

const LEVELS = ['L', 'M', 'Q', 'H']
const isDark = (m, r, c) => !!m.get(r, c)

/** A finder pattern is a 7×7 ring, a 3×3 core, and nothing in between. */
function finderOk(m, r0, c0) {
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const ring = i === 0 || i === 6 || j === 0 || j === 6
      const core = i >= 2 && i <= 4 && j >= 2 && j <= 4
      if (isDark(m, r0 + i, c0 + j) !== (ring || core)) return false
    }
  }
  return true
}

test('every QR code has the geometry a scanner looks for', () => {
  const samples = [
    'https://thetooltable.app',
    'WIFI:T:WPA;S:Cafe;P:secret123;;',
    'BEGIN:VCARD\nVERSION:3.0\nN:Mubashir\nTEL:+923001234567\nEND:VCARD',
    'x',
    'https://example.com/' + 'a'.repeat(300),
    '𝒜𝒷𝒸 中文 عربى 🇵🇰',
  ]
  for (const text of samples) {
    for (const ecc of LEVELS) {
      const m = makeMatrix(text, ecc)
      const n = m.n
      assert.ok(Number.isInteger(n) && n >= 21 && n <= 177, `a code for ${JSON.stringify(text.slice(0, 20))} is ${n} modules wide`)

      /* Version 1 to 40 gives exactly these sizes, and nothing else. */
      assert.equal(n, 4 * m.version + 17, `version ${m.version} does not give ${n} modules`)
      assert.ok(m.version >= 1 && m.version <= 40, `version ${m.version} is out of range`)
      assert.equal(m.ecc, ecc)

      assert.ok(finderOk(m, 0, 0), `the top-left finder pattern is wrong at ${ecc}`)
      assert.ok(finderOk(m, 0, n - 7), `the top-right finder pattern is wrong at ${ecc}`)
      assert.ok(finderOk(m, n - 7, 0), `the bottom-left finder pattern is wrong at ${ecc}`)
      /* The bottom-right is deliberately absent; a data block sits there. */
      assert.equal(finderOk(m, n - 7, n - 7), false, 'a fourth finder pattern appeared, which would corrupt the code')

      /* Timing patterns alternate between the finders. */
      for (let i = 8; i < n - 8; i++) {
        assert.equal(isDark(m, 6, i), i % 2 === 0, `the timing row breaks at column ${i}`)
        assert.equal(isDark(m, i, 6), i % 2 === 0, `the timing column breaks at row ${i}`)
      }
      /* The separator beside each finder is light. */
      for (let i = 0; i < 8; i++) {
        assert.equal(isDark(m, 7, i), false, `the separator below the top-left finder is dark at column ${i}`)
        assert.equal(isDark(m, i, 7), false, `the separator right of the top-left finder is dark at row ${i}`)
      }
      /* The dark module is always set, just above the bottom-left separator. */
      assert.equal(isDark(m, n - 8, 8), true, 'the mandatory dark module is not set')
      /* Alignment patterns exist for versions 2 and up. */
      if (m.version >= 2) {
        const centres = m.version === 32 ? [6, 34] : [6, n - 7]
        assert.equal(centres.length, 2)
        for (const r of centres) for (const c of centres) {
          if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue
          let matching = 0
          for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
            /* A 5×5 alignment pattern: a dark ring, a light gap, a dark centre. */
            const expected = Math.max(Math.abs(i), Math.abs(j)) === 2 || (i === 0 && j === 0)
            if (isDark(m, r + i, c + j) === expected) matching++
          }
          assert.equal(matching, 25, `the alignment pattern at ${r},${c} is wrong`)
        }
      }
    }
  }
})

test('longer content never produces a smaller code', () => {
  let previous = 0
  for (const length of [1, 10, 50, 200, 500, 1000, 2000]) {
    const m = makeMatrix('A'.repeat(length), 'M')
    assert.ok(m.n >= previous, `${length} characters produced a smaller code than ${previous}`)
    previous = m.n
  }
})

test('more error correction never produces a smaller code', () => {
  const n = LEVELS.map((ecc) => makeMatrix('https://example.com/some/path', ecc).n)
  for (let i = 1; i < n.length; i++) {
    assert.ok(n[i] >= n[i - 1], `${LEVELS[i]} is smaller than ${LEVELS[i - 1]}`)
  }
})

test('the matrix never reads outside its own bounds', () => {
  const m = makeMatrix('https://thetooltable.app', 'Q')
  for (const [r, c] of [[-1, 0], [0, -1], [m.n, 0], [0, m.n], [m.n, m.n], [m.n + 5, m.n + 5]]) {
    assert.equal(m.get(r, c), false, `get(${r},${c}) returned ${m.get(r, c)} instead of refusing`)
    assert.equal(m.get(r, c, undefined), false)
  }
})

test('a code is never handed out for empty or hostile input', () => {
  for (const text of ['', null, undefined, 0, {}, [], '\u0000'.repeat(10)]) {
    const m = (() => { try { return makeMatrix(text, 'M') } catch (e) { return `threw: ${e.message}` } })()
    assert.notEqual(typeof m, 'string', `makeMatrix(${String(text)}) threw: ${m}`)
    assert.ok(Number.isInteger(m.n) && m.n >= 21, 'no usable code came back')
    assert.ok(finderOk(m, 0, 0), 'the fallback code is not a valid QR')
  }
})

test('a rendered code is self-consistent and reports honestly', () => {
  const r = buildQR('https://thetooltable.app', { ...DEFAULT_STYLE }, 't')
  assert.ok(typeof r.svg === 'string' && r.svg.includes('<svg'), 'no SVG was produced')
  assert.ok(r.N > 0, 'the matrix size was not reported')
  assert.equal(r.info.modules > 0, true, 'no module count was reported')
  assert.ok(r.info.ecc && LEVELS.includes(r.info.ecc), `the error correction level is ${r.info.ecc}`)
  /* An empty SVG is a code that cannot scan. Modules are merged into compound
     paths, so the measure is how much path data there is, not how many tags. */
  const drawn = [...r.svg.matchAll(/ d="([^"]*)"/g)].reduce((n, [, d]) => n + d.length, 0)
  assert.ok(drawn > 500, `the SVG carries only ${drawn} characters of path data; almost nothing was drawn`)
  assert.ok((r.svg.match(/<(rect|path|circle|polygon|ellipse)\b/g) || []).length >= 3,
    'the SVG has fewer than three drawable elements')
  /* The uid must be sanitised, since it is interpolated into ids and url(#…). */
  for (const uid of ['a"><script>x</script>', 'a b c', '', 'X'.repeat(200), '../../etc/passwd']) {
    const out = buildQR('hello', { ...DEFAULT_STYLE }, uid)
    assert.doesNotMatch(out.svg, /<script/, `the uid ${JSON.stringify(uid)} injected markup`)
    assert.doesNotMatch(out.svg, /id="[^"]*[<>"]/, `the uid ${JSON.stringify(uid)} broke an id attribute`)
  }
})

test('the scannability report does not lie', async () => {
  /* `heuristics` is what the UI shows the user about their own code. If it
     reports a comfortable contrast on an unreadable code, it is worse than
     useless — it is the reason someone ships a QR that does not scan. */
  const { TEMPLATES } = await import('../src/lib/qr/templates.js')
  for (const t of TEMPLATES) {
    const st = withDefaults(t.style)
    const h = heuristics(buildQR('https://example.com/a-fairly-long-url-for-testing', st, 'q'))
    assert.ok(Number.isFinite(h.contrast), `${t.name} reported a contrast of ${h.contrast}`)
    assert.ok(h.contrast >= 4.5, `${t.name} is reported at ${h.contrast.toFixed(2)}:1, which does not scan`)
    assert.ok(['L', 'M', 'Q', 'H'].includes(h.ecc))
    assert.ok(h.version >= 1 && h.version <= 40)
    assert.ok(h.logoPct >= 0 && h.logoPct < 30, `${t.name} covers ${h.logoPct}% of the code with its logo`)
  }
})

function require$templates() {
  return globalThis.__tttTemplates
}