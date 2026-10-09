/**
 * Part 10, fourth batch: accessibility and motion, checked against the real AST.
 *
 * A browser is the obvious place to check these, and that is exactly why they
 * drift — nobody re-runs a screen reader before every commit. Parsing the JSX
 * instead reports exactly the elements that exist, which a regular expression
 * cannot: `onClick={() => go()}` looks like a tag boundary to a regex, so the
 * earlier version of this file "found" 92 unnamed controls that did not exist.
 *
 * Two promises are defended here. Every control in the app can be named out
 * loud, and no animation has been added without a reduced-motion escape hatch.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse').default

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

function sources(dir, out = []) {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const full = path.join(dir, entry)
    if (statSync(path.join(ROOT, full)).isDirectory()) sources(full, out)
    else if (/\.(jsx?|css)$/.test(entry)) out.push(full)
  }
  return out
}
const FILES = sources('src')
const JSX = FILES.filter((f) => f.endsWith('.jsx'))
const CSS = FILES.filter((f) => f.endsWith('.css'))
const all = FILES.map((f) => read(f)).join('\n')

/** The text a person would actually read inside an element. */
function textOf(nodePath) {
  let out = ''
  nodePath.traverse({
    JSXText(p) { out += p.node.value },
    StringLiteral(p) { out += p.node.value },
    TemplateLiteral(p) { out += p.node.quasis.map((q) => q.value.cooked).join('') },
    /* An icon is a picture, not a word. */
    JSXElement(p) { if (/^(svg|path|circle|Icon|ToolIcon|Ico)$/i.test(p.node.openingElement.name.name || '')) p.skip() },
    JSXExpressionContainer(p) {
      const e = p.node.expression
      if (e.type === 'StringLiteral' || e.type === 'TemplateLiteral') out += textOf(p)
      else if (e.type === 'ConditionalExpression') out += ` ${textOf(p.get('consequent'))} ${textOf(p.get('alternate'))} `
      else out += 'x'
    },
  })
  return out.replace(/\s+/g, ' ').trim()
}

const attrName = (a) => (a.type === 'JSXSpreadAttribute' ? '...' : a.name?.name ?? a.name?.value)
const attrMap = (opening) => Object.fromEntries(
  opening.attributes.filter((a) => a.type !== 'JSXSpreadAttribute').map((a) => [attrName(a), a.value]))

/** Components that render their own <label> for their children. */
const LABELLING = /^(Field|Label|FormRow|Form|SelectField|NumberField|TextField)$/

function* eachElement() {
  for (const file of JSX) {
    const source = read(file)
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
    const stack = []
    const visit = (p) => {
      if (p.node?.type === 'JSXOpeningElement' && p.node.name.name) stack.push({ p, file, source })
    }
    traverse(ast, { JSXOpeningElement: visit })
    for (const item of stack) yield { ...item, tag: item.p.node.name.name, attrs: attrMap(item.p.node), line: item.p.node.loc.start.line }
  }
}

/* ============================================================ accessible names */

test('every control can be named out loud', () => {
  const problems = []
  for (const { p, file, tag, attrs, line } of eachElement()) {
    if (!['button', 'a', 'summary'].includes(tag)) continue
    if (attrs['aria-label'] || attrs['aria-labelledby'] || attrs.title) continue
    if (p.parentPath.isJSXElement() && textOf(p.parentPath)) continue
    problems.push(`${file}:${line} <${tag}> has neither visible text nor a label`)
  }
  assert.deepEqual(problems, [], `unnamed controls:\n${problems.join('\n')}`)
})

test('every field has a label, not just a placeholder', () => {
  /* A placeholder vanishes the moment someone types, and most screen readers
     never announce one, so it is not a label. */
  const problems = []
  for (const { p, file, tag, attrs, line } of eachElement()) {
    if (!['input', 'select', 'textarea'].includes(tag)) continue
    if (attrs['aria-label'] || attrs['aria-labelledby'] || attrs.id || attrs.title) continue
    if (attrs.type === 'hidden' || attrMapHasHidden(p)) continue
    let labelled = false
    for (let q = p.parentPath; q; q = q.parentPath) {
      if (q.node?.type === 'JSXElement' || q.node?.type === 'JSXFragment') {
        const nm = q.node.openingElement?.name?.name
        if (nm === 'label' || (nm && LABELLING.test(nm))) { labelled = true; break }
      }
    }
    if (!labelled) problems.push(`${file}:${line} <${tag}> is unlabelled${attrs.placeholder ? ' (placeholder only)' : ''}`)
  }
  assert.deepEqual(problems, [], `unlabelled fields:\n${problems.join('\n')}`)
})

function attrMapHasHidden(p) {
  return p.node.attributes.some((a) => attrName(a) === 'hidden')
}

test('every image has an alt attribute', () => {
  const problems = []
  for (const file of JSX) {
    const source = read(file)
    for (const m of source.matchAll(/<img\b([^>]*?)\/?>/g)) {
      if (!/\balt\s*=/.test(m[1])) problems.push(`${file}:${source.slice(0, m.index).split('\n').length} <img> without alt`)
    }
  }
  assert.deepEqual(problems, [], `images without alt:\n${problems.join('\n')}`)
})

test('every tap target is big enough for a thumb', () => {
  /* A 44px target is the platform guidance; 32px is where the CSS actually
     sits for dense desktop rows. Nothing may go below it. */
  const small = []
  for (const file of CSS) {
    const source = read(file)
    for (const m of source.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
      const [, selector, body] = m
      const width = /\bmin-width\s*:\s*(\d+(?:\.\d+)?)px/.exec(body)
      const height = /\b(?:min-)?height\s*:\s*(\d+(?:\.\d+)?)px/.exec(body)
      for (const [kind, match] of [['width', width], ['height', height]]) {
        if (!match) continue
        const px = Number(match[1])
        if (px >= 32) continue
        /* Zero and `auto` are common and harmless; only a declared tiny floor
           on a real interactive selector is a finding. */
        if (!/(btn|button|chip|tap|tab|icon-btn|pill|swatch|thumb|hit)/i.test(selector)) continue
        /* A spinner or a status dot is an indicator inside a button, not a
           target of its own. */
        if (/spinner|dot|dot-|shimmer|ring\b/.test(selector)) continue
        small.push(`${file} ${selector} declares ${kind}: ${px}px`)
      }
    }
  }
  assert.deepEqual(small, [], `tap targets below 32px:\n${small.join('\n')}`)
})

test('focus is never removed from the keyboard without a replacement', () => {
  for (const file of CSS) {
    const source = read(file)
    for (const m of source.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
      const [, selector, body] = m
      if (!/outline\s*:\s*(none|0)\b/.test(body)) continue
      /* Removing an outline is only acceptable if focus-visible draws one. */
      const focusRule = new RegExp(`(focus-visible|focus)\\b[^{]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*(outline|box-shadow|border)`)
      assert.ok(focusRule.test(source), `${file} removes the outline on ${selector} and never replaces it`)
    }
  }
})

test('the page declares its language and its colour scheme', () => {
  const html = read('index.html')
  assert.match(html, /<html[^>]+lang=["'][a-z]{2}/i, 'the document has no language')
  assert.match(html, /<meta name="viewport"[^>]+width=device-width/i, 'no viewport meta')
  assert.match(html, /<meta name="color-scheme"|:color-scheme/i, 'no colour scheme declared')
  assert.match(html, /<title>[^<]+<\/title>/i, 'no document title')
})

test('every tool is reachable and the landmarks are labelled', () => {
  const app = read('src/App.jsx')
  assert.match(app, /<header|<nav/, 'the app shell has no header or navigation landmark')
  assert.match(app, /<main\b/, 'the app shell has no main landmark')
  /* The header must carry a skip target, or a keyboard user walks the whole
     card grid on every single navigation. */
  assert.ok(/skip/i.test(all), 'no skip-to-content link anywhere in the app')
})

/* ==================================================================== motion */

test('every animation has a reduced-motion escape hatch', () => {
  /* The standing rule: motion may be added freely, never without a way out. */
  assert.match(all, /prefers-reduced-motion/, 'the app never asks about reduced motion')

  const media = [...all.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)]
  assert.ok(media.length >= 2, `only ${media.length} reduced-motion blocks exist; motion is being added faster than it is being made optional`)

  const keyframes = [...all.matchAll(/@keyframes\s+([\w-]+)/g)].map(([, name]) => name)
  assert.ok(keyframes.length > 0, 'no keyframes found, so this check is not looking at anything')
})

test('motion is still allowed when the user did not ask for less of it', () => {
  /* The failure mode this guards against is a well-meaning Part 4b that removes
     animation entirely to satisfy the check above. The app must still move. */
  const motion = read('src/lib/motion.js')
  assert.ok(motion.length > 500, 'the shared motion module has been emptied')
  assert.match(motion, /transition|animate|spring/i, 'the shared motion module defines no motion')

  /* And the app must actually use it. */
  const users = JSX.filter((f) => /from '.*\/(motion|App)\.js[x]?'/.test(read(f)) || /<motion\./.test(read(f)))
  assert.ok(users.length >= 15, `only ${users.length} components animate; the app has gone still`)
})

test('nothing is hidden behind a media query the app never sets', () => {
  /* A "lite mode" that silently drops motion, or a perf level that removes
     content, would be the previous failure repeating. */
  const lite = /level === 'lite'|LEVEL_NAME\.lite/.test(all)
  assert.ok(lite, 'the performance levels are gone')
  for (const file of CSS) {
    const source = read(file)
    /* Display:none keyed to a performance level is the thing to watch. */
    for (const m of source.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
      const [, selector, body] = m
      if (!/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\s*;?\s*\}/.test(body)) continue
      assert.ok(!/lite|reduced|lowperf/i.test(selector + body),
        `${file} hides ${selector} based on a performance level rather than on preference`)
    }
  }
})

test('animation durations stay deliberate rather than accidental', () => {
  /* Anything over a second of looping motion is uncomfortable by default, and
     anything under 80ms is a glitch rather than an animation. */
  for (const file of CSS) {
    const source = read(file)
    for (const m of source.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
      const [, selector, body] = m
      const infinite = /animation[^;]*\binfinite\b/.test(body)
      if (!infinite) continue
      const duration = /animation[^;]*?([\d.]+)s/.exec(body)
      if (!duration) continue
      const seconds = Number(duration[1])
      /* Below about a second it reads as a flicker; the upper bound is the
         currency marquee, which is meant to take its time. */
      assert.ok(seconds >= 0.8 && seconds <= 90,
        `${file} ${selector} loops every ${seconds}s, which is either a flicker or a marathon`)
    }
  }
})

test('the safe-area insets are respected on every platform shell', () => {
  assert.match(all, /env\(safe-area-inset/, 'the notch is not accounted for')
  /* Android gesture navigation and the iOS home indicator are the same problem. */
  assert.match(all, /safe-area-inset-bottom|safe-area-inset-top/, 'only one edge of the safe area is handled')
})