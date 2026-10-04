#!/usr/bin/env node
/**
 * Cross-platform test runner.
 *
 * `node --test tests/*.test.mjs` depends on the *shell* expanding the glob: bash and zsh do,
 * cmd.exe and PowerShell do not. On the Windows CI runner the pattern arrived verbatim, Node 20
 * has no built-in glob support for the test runner, and the whole Windows build job died before
 * it ever reached Tauri. So: resolve the files here, in Node, and hand the runner explicit paths.
 */
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const dir = fileURLToPath(new URL('../tests/', import.meta.url))
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join(dir, f))

if (!files.length) {
  console.error(`run-tests: no *.test.mjs files in ${dir}`)
  process.exit(1)
}

const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(r.status ?? 1)
