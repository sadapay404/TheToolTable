/**
 * Part 10, ninth batch: the icons the launcher shows and the PWA manifest.
 *
 * The Icon Forge draws on a canvas; these checks cannot run a canvas, so they
 * cover what sits around it — the tables it draws from and the normalisation
 * that stands between a saved option and the drawing code. `drawIcon` receives
 * only what `normalizeIconOptions` produced, so anything that can slip past it
 * is something the canvas would have to defend against alone.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeIconOptions, SHAPES, FONTS, PRESETS, DEFAULTS, makeIco } from '../src/lib/icons/forge.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

test('a three-letter monogram is what the forge actually draws', () => {
  /* The app builds an icon from symbols and letters, not from an uploaded
     image, so the letter count is a real constraint on the drawing code. */
  for (const input of ['ab', 'abcd', 'the tool table', '', '  ', '🎨🎨🎨🎨🎨', 'A\nB\nC\nD']) {
    const out = normalizeIconOptions({ text: input })
    /* Counted in code points, because the cut is a code-point cut: three emoji
       are three glyphs even though they are six UTF-16 units. */
    assert.ok([...out.text].length <= 3, `"${input}" produced ${[...out.text].length} characters`)
    assert.equal(out.text, [...input].slice(0, 3).join(''), 'the text was cut incorrectly')
  }
  /* Code points, not UTF-16 units: an emoji is one character, not two. */
  assert.equal(normalizeIconOptions({ text: '😀😀😀😀' }).text, '😀😀😀')
  assert.equal(normalizeIconOptions({ text: '🎉' }).text, '🎉')
  assert.equal(normalizeIconOptions({}).text, DEFAULTS.text)
})

test('nothing the forge returns can break a canvas call', () => {
  /* A NaN radius, an infinite angle or a colour with an alpha channel the
     parser cannot read all reach ctx.roundRect, ctx.arc or a gradient stop. */
  const hostile = {
    text: 'x'.repeat(1000), name: 'n'.repeat(1000), weight: 'abc', angle: 'north', radius: 'big',
    pad: -Infinity, offY: NaN, font: null, shape: {}, mode: 1, bgType: [], symColor: '#12345',
    tint: 'yes', tintColor: 'red', bg1: 'rgb(1,2,3)', bg2: null, theme: '#GGGGGG',
  }
  const out = normalizeIconOptions(hostile)
  for (const [key, value] of Object.entries(out)) {
    assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value),
      `${key} is a ${typeof value}, which the drawing code does not expect`)
    assert.doesNotMatch(String(value), /NaN|Infinity|undefined/, `${key} came out as ${value}`)
  }
  assert.ok(out.text.length <= 3 && out.name.length <= 80)
  assert.ok(Number.isInteger(out.weight) && out.weight >= 300 && out.weight <= 900)
  assert.ok(out.angle >= 0 && out.angle <= 360 && Number.isInteger(out.angle))
  assert.ok(Number.isInteger(out.radius) && out.radius >= 0 && out.radius <= 50)
  assert.ok(Number.isInteger(out.pad) && out.pad >= 0 && out.pad <= 40)
  assert.ok(out.offY >= -15 && out.offY <= 15)
  for (const key of ['symColor', 'tintColor', 'bg1', 'bg2', 'theme']) {
    assert.match(out[key], /^#[0-9A-F]{6}$/, `${key} came out as ${out[key]}`)
  }
  /* A name reaches a caption, so control characters have to go. */
  assert.doesNotMatch(out.name, /[\x00-\x1f\x7f]/, 'a control character survived into the caption')
})

test('normalising twice changes nothing', () => {
  for (const input of [{}, { text: 'ab' }, { shape: 'circle', angle: 45 }, { font: 'Georgia', weight: 400 }]) {
    const once = normalizeIconOptions(input)
    assert.deepEqual(normalizeIconOptions(once), once, 'normalising is not idempotent')
  }
})

test('every option the forge offers is one it can render', () => {
  /* A picker entry the normaliser silently replaces is a control that lies:
     the user picks it, the icon comes out as something else. */
  for (const [id] of SHAPES) assert.equal(normalizeIconOptions({ shape: id }).shape, id)
  for (const [id] of FONTS) assert.equal(normalizeIconOptions({ font: id }).font, id)
  for (const value of ['gradient', 'solid', 'none']) {
    assert.equal(normalizeIconOptions({ bgType: value }).bgType, value)
  }
  for (const value of ['mono', 'image']) assert.equal(normalizeIconOptions({ mode: value }).mode, value)
  for (const [from, to] of PRESETS) {
    assert.equal(normalizeIconOptions({ bg1: from }).bg1, from.toUpperCase())
    assert.equal(normalizeIconOptions({ bg2: to }).bg2, to.toUpperCase())
  }
  assert.ok(PRESETS.length >= 8, `only ${PRESETS.length} presets to choose from`)
})

test('an .ico points at real image data at every declared size', () => {
  const bitmap = (size) => {
    const bytes = new Uint8Array(size * size * 4 + 40)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, 40, true)
    view.setInt32(4, size, true)
    view.setInt32(8, size * 2, true)
    view.setUint16(12, 1, true)
    view.setUint16(14, 32, true)
    return bytes
  }
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const entries = sizes.map((size) => ({ size, bytes: bitmap(size) }))
  const ico = makeIco(entries)
  const u16 = (o) => ico[o] | (ico[o + 1] << 8)
  const u32 = (o) => (ico[o] | (ico[o + 1] << 8) | (ico[o + 2] << 16) | (ico[o + 3] << 24)) >>> 0

  assert.equal(u16(2), 1, 'the file type is not an icon')
  assert.equal(u16(4), entries.length, 'the entry count does not match')
  for (const [i, { size, bytes }] of entries.entries()) {
    const p = 6 + i * 16
    assert.equal(ico[p], size >= 256 ? 0 : size, `the ${size}px entry has the wrong width byte`)
    assert.equal(ico[p + 1], size >= 256 ? 0 : size, `the ${size}px entry has the wrong height byte`)
    assert.equal(u16(p + 4), 1, `the ${size}px entry is not a single plane`)
    assert.equal(u16(p + 6), 32, `the ${size}px entry is not 32-bit`)
    assert.equal(u32(p + 8), bytes.length, `the ${size}px entry has the wrong length`)
    assert.ok(u32(p + 12) + u32(p + 8) <= ico.length, `the ${size}px entry points outside the file`)
  }
  /* And the total is the header plus exactly the images. */
  assert.equal(ico.length, 6 + 16 * entries.length + entries.reduce((n, e) => n + e.bytes.length, 0))
  assert.throws(() => makeIco([]), /invalid/)
  assert.throws(() => makeIco(null), /invalid/)
  assert.throws(() => makeIco([{ size: 16 }]), /invalid/)
  assert.throws(() => makeIco([{ size: 999, bytes: new Uint8Array(8) }]), /invalid/)
})

test('the PWA icons the manifest promises are real images at the right size', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'))
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'the manifest declares no icons')
  for (const icon of manifest.icons) {
    const file = path.join(ROOT, 'public', icon.src.replace(/^\//, ''))
    assert.ok(existsSync(file), `the manifest points at ${icon.src}, which is not in public/`)
    const buf = readFileSync(file)
    assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${icon.src} is not a PNG`)
    const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20)
    const claimed = /^(\d+)x(\d+)$/.exec(icon.sizes)
    if (claimed) {
      assert.equal(width, Number(claimed[1]), `${icon.src} is ${width}px wide but claims ${claimed[1]}px`)
      assert.equal(height, Number(claimed[2]), `${icon.src} is ${height}px tall but claims ${claimed[2]}px`)
    }
    assert.equal(width, height, `${icon.src} is not square`)
    assert.ok(width >= 192, `${icon.src} is too small to be a launcher icon`)
  }
  /* Android will not use a non-maskable icon on the home screen, and the web
     manifest needs at least one large icon to be installable. */
  assert.ok(manifest.icons.some((i) => /maskable/.test(i.purpose || '')), 'no maskable icon is declared')
  assert.ok(manifest.icons.some((i) => Number((/(\d+)x/.exec(i.sizes) || [])[1]) >= 512),
    'no icon is large enough for Android')
  for (const key of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color']) {
    assert.ok(manifest[key], `the manifest has no ${key}`)
  }
})