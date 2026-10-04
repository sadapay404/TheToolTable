/* Regenerates the theme colour blocks in src/styles.css from src/themes.js so the first paint is
   already in the remembered theme (no flash of the default before React runs).
   Run: npm run themes:css  — or just keep the two in sync; tests/unit.test.mjs fails if they drift. */
import { readFileSync, writeFileSync } from 'node:fs'
import { THEMES } from '../src/themes.js'

const START = '/* --- themes: generated from src/themes.js by `npm run themes:css` --- */'
const END = '/* --- end themes --- */'

const blocks = Object.entries(THEMES).map(([id, t]) => {
  const vars = Object.entries(t.vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')
  return `html[data-theme="${id}"] {\n${vars}\n}`
}).join('\n\n')

const css = readFileSync('src/styles.css', 'utf8')
const a = css.indexOf(START)
const b = css.indexOf(END)
if (a < 0 || b < 0) throw new Error('theme markers missing from src/styles.css')
const next = css.slice(0, a + START.length) + '\n' + blocks + '\n' + css.slice(b)

if (process.argv.includes('--check')) {
  if (next !== css) { console.error('styles.css theme blocks are out of date — run `npm run themes:css`'); process.exit(1) }
  console.log('theme blocks in sync')
} else {
  writeFileSync('src/styles.css', next)
  console.log(`wrote ${Object.keys(THEMES).length} theme blocks`)
}
