#!/usr/bin/env node
/**
 * Ask the Vite dev server to transform every source file the app actually loads.
 *
 * A production build proves the files it can reach compile. The dev server is
 * the other half of the truth: it transforms on request, so requesting every
 * entry point, component and lazy chunk is a compile check that needs no
 * browser. A syntax error, a bad import or a missing export surfaces here
 * instead of as a blank screen.
 *
 * Usage: node tests/devserver-audit.mjs [origin]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGIN = process.argv[2] || 'http://127.0.0.1:5173'
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')

const registry = read('src/toolsRegistry.jsx')
/**
 * Every module the app contains, not just the ones an import graph walk finds.
 * The graph misses anything reached by a dynamic path, and it misses a file
 * that has been left behind unreferenced — which is exactly the file most likely
 * to be broken and least likely to be noticed.
 */
function everyModule(dir, out = []) {
  for (const entry of readdirSync(path.join(ROOT, dir))) {
    const full = `${dir}/${entry}`
    if (statSync(path.join(ROOT, full)).isDirectory()) everyModule(full, out)
    else if (/\.(jsx|js|css)$/.test(entry)) out.push('/' + full)
  }
  return out
}

const registryTools = [...registry.matchAll(/import\('\.\/tools\/([^']+)'\)/g)].map(([, f]) => `/src/tools/${f}`)
const targets = [...new Set([...everyModule('src'), ...registryTools, '/src/main.jsx'])]
let failed = 0
const slow = []

console.log(`Asking ${ORIGIN} to transform ${targets.length} modules…\n`)
for (const target of targets) {
  const started = Date.now()
  try {
    const response = await fetch(ORIGIN + target, { headers: { accept: 'text/javascript, text/css, */*' } })
    const body = await response.text()
    const took = Date.now() - started
    if (!response.ok) {
      failed++
      console.log(`  ✗ ${target} — HTTP ${response.status}`)
      console.log(`      ${body.split('\n').find((l) => /error|Error/.test(l))?.slice(0, 160) || body.slice(0, 160)}`)
      continue
    }
    if (/Internal server error|Failed to resolve import|SyntaxError|Transform failed/.test(body)) {
      failed++
      console.log(`  ✗ ${target} — transformed with an error inside`)
      console.log(`      ${body.split('\n').find((l) => /error|Error/.test(l))?.slice(0, 160)}`)
      continue
    }
    if (took > 1500) slow.push([target, took])
    console.log(`  ✓ ${target} — ${body.length} bytes in ${took}ms`)
  } catch (error) {
    failed++
    console.log(`  ✗ ${target} — ${error.message}`)
  }
}

if (slow.length) {
  console.log('\nSlow to transform (a cold dev server is expected to be slower than a warm one):')
  for (const [t, ms] of slow) console.log(`  ${t} — ${ms}ms`)
}
console.log(`\n${targets.length - failed}/${targets.length} modules transformed cleanly`)
process.exit(failed ? 1 : 0)