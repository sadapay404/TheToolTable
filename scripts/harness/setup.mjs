#!/usr/bin/env node
/**
 * One-shot setup for the browser harness (smoke + e2e). Puppeteer is deliberately not a dependency
 * of the app, and this sandbox wipes node_modules and /tmp between sessions — so this script can be
 * re-run at any time to put the rig back:
 *
 *   node scripts/harness/setup.mjs
 *
 * It installs puppeteer-core + @sparticuz/chromium into TTT_HARNESS_MODULES (default
 * /home/user/browsertest) and unpacks the Amazon-Linux shared libraries the headless build needs
 * into <modules>/lib, which lib.mjs then points the browser at automatically.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'
import { join } from 'node:path'

const modules = process.env.TTT_HARNESS_MODULES || '/home/user/browsertest'
const libDir = join(modules, 'lib')
const pkg = join(modules, 'package.json')

mkdirSync(modules, { recursive: true })
if (!existsSync(pkg)) writeFileSync(pkg, JSON.stringify({ name: 'ttt-harness', private: true, type: 'module' }, null, 2))

console.log(`# harness deps → ${modules}`)
execFileSync('npm', ['install', '--no-audit', '--no-fund', 'puppeteer-core', '@sparticuz/chromium'], { cwd: modules, stdio: 'inherit' })

// The chromium build targets Amazon Linux 2023; the pack ships the few shared libraries a bare
// sandbox is missing (libnss3, libnspr4, …). Unpack it once.
const pack = join(modules, 'node_modules/@sparticuz/chromium/bin/al2023.tar.br')
if (existsSync(pack) && !existsSync(join(libDir, 'libnss3.so'))) {
  mkdirSync(libDir, { recursive: true })
  const tarPath = join(modules, 'al2023.tar')
  writeFileSync(tarPath, brotliDecompressSync(readFileSync(pack)))
  execFileSync('tar', ['-xf', tarPath, '-C', modules])
  console.log(`# chromium libraries → ${libDir}`)
} else if (existsSync(join(libDir, 'libnss3.so'))) {
  console.log(`# chromium libraries already in ${libDir}`)
} else {
  console.log('# note: no al2023 pack found — the browser may need system libs instead')
}

const { createRequire } = await import('node:module')
const req = createRequire(join(modules, 'noop.js'))
try {
  const chromium = req('@sparticuz/chromium')
  const exe = await (chromium.default || chromium).executablePath()
  console.log(`# chromium executable → ${exe}`)
} catch (e) {
  console.log(`# could not resolve the chromium binary: ${e.message}`)
}
console.log('# ready — run:  npm run e2e   (or  npm run smoke ) against a running dev server')
