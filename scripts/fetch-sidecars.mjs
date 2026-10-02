#!/usr/bin/env node
/**
 * Downloads the Windows sidecars Tauri bundles INSIDE the installer, so end users install nothing:
 *   src-tauri/binaries/yt-dlp-<triple>.exe      (PyInstaller-frozen yt-dlp — contains its own Python)
 *   src-tauri/binaries/ffmpeg-<triple>.exe      (LGPL build — no GPL obligations)
 *   src-tauri/binaries/ffprobe-<triple>.exe     (yt-dlp needs it for audio extraction / merging)
 *
 * Run on a build machine / CI before `tauri build`:   node scripts/fetch-sidecars.mjs
 * Prints SHA-256 of every file — pin those in CI so a tampered upstream asset fails the build.
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const TRIPLE = process.argv.includes('--triple') ? process.argv[process.argv.indexOf('--triple') + 1] : 'x86_64-pc-windows-msvc'
const OUT = path.resolve('src-tauri', 'binaries')
const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const FFMPEG_ZIP = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip'

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')

async function get(url, dest) {
  process.stdout.write(`↓ ${url}\n`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

fs.mkdirSync(OUT, { recursive: true })
await get(YTDLP, path.join(OUT, `yt-dlp-${TRIPLE}.exe`))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ttt-ffmpeg-'))
const zip = path.join(tmp, 'ffmpeg.zip')
await get(FFMPEG_ZIP, zip)
execFileSync('tar', ['-xf', zip, '-C', tmp]) // bsdtar ships with Windows 10+, macOS and most Linux
const root = fs.readdirSync(tmp).find((d) => fs.existsSync(path.join(tmp, d, 'bin', 'ffmpeg.exe')))
if (!root) throw new Error('ffmpeg.exe not found in archive')
for (const n of ['ffmpeg', 'ffprobe']) fs.copyFileSync(path.join(tmp, root, 'bin', `${n}.exe`), path.join(OUT, `${n}-${TRIPLE}.exe`))
fs.rmSync(tmp, { recursive: true, force: true })

console.log('\nSidecars ready in src-tauri/binaries:')
for (const f of fs.readdirSync(OUT)) console.log(`  ${sha(path.join(OUT, f)).slice(0, 16)}…  ${f}  ${(fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(1)} MB`)
