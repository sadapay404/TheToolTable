# TheToolTable — Universal Multi-Tool Studio

A growing set of desktop-grade tools in one ultra-slick, 3D-animated web studio. **Everything runs 100% client-side** — no uploads, no server, no quality loss unless a tool explicitly exists to compress (Tool 3).

## Branding

- `public/logo.png` — the official logo (1024×1024, Creamy White theme: warm ivory canvas, espresso mark, caramel accent).
- It is used everywhere: browser-tab favicon, apple-touch icon, PWA/Android manifest icon, app header & hero, and it is the source artwork for the future Windows (Tauri) app icon.
- Want a tweak to the mark? Just ask — the mark is regenerated and re-dropped into `public/logo.png`.

## Stack (Phase 1 — Web)

- **Vite + React 18** — instant HMR dev, static production build for Vercel.
- **Tailwind CSS** + CSS-variable **theme engine** (5 themes, persisted in `localStorage`).
- **Framer Motion** — spring physics (`stiffness 300 / damping 25`), 3D card tilt, press-depth, glow reflections.
- **FFmpeg WASM** (`@ffmpeg/ffmpeg`) — convert / target-size compress / trim. The single-threaded core ships **inside the app** (`public/ffmpeg/`, emitted into `dist/ffmpeg/`), so it works offline, in the PWA and in the native builds — the URL you see is the same origin.
- **onnxruntime-web** (WASM, in a module worker) — runs the bundled IS-Net model for background removal. No GPU or network needed.
- **qrcode**, **gifenc**, **exifr** — QR vector studio, GIF export, metadata parsing.

## The 12 tools

| # | Tool | Engine |
|---|------|--------|
| 01 | Metadata Extractor (EXIF/IPTC/XMP/GPS + map + hex, Scrub & Sanitize) | exifr, lossless segment/chunk stripping |
| 02 | Any-to-Any Converter (image/video/audio/document, batch) | canvas + FFmpeg WASM |
| 03 | Target-Size Compressor (real 2-pass x264 for video, single-pass AAC for audio, honest target-vs-actual report) | FFmpeg WASM |
| 04 | Media Clipper & Downloader (waveform timeline, stream-copy clips, codec-aware MP4/MKV/WebM that never re-encodes) | WebAudio + yt-dlp engine |
| 05 | ImagePlayer Studio (24 colour-mixer sliders, 31 looks, crop/rotate/flip, PNG/JPG/WEBP export) | Canvas |
| 06 | AI Background Remover (bundled IS-Net, refine brush, backgrounds, shadow, batch ZIP) | onnxruntime-web WASM worker |
| 07 | Frame Extractor & Clipper (frame step, snapshots, GIF maker) | canvas + gifenc + FFmpeg WASM |
| 08 | Audio Visualizer Video (bars/radial/wave/particles, social ratios) | WebAudio + MediaRecorder |
| 09 | Currency, Unit & Time Converter (166 fiat + 40 coins, 157 units in 16 categories, 250 time zones; live rates with a bundled offline snapshot) | open.er-api + coingecko, snapshot fallback |
| 10 | Decision Hub (3D coin, bottle spin 2–12, loaded dice, wheel) | Framer Motion 3D |
| 11 | QR Code Studio (gradients, eye/module shapes, logos, SVG/PNG) | qrcode |
| 12 | Background Canvas Studio (mesh/linear/radial gradients, grain, 4K) | Canvas |

## Zero-compression policy

No tool may downsample/re-encode originals except **Tool 3** (explicit target-size compression). Lossless by default: PNG/WebP q-max export, `copy` stream trims, CRF-16 targets.

## Run

```bash
npm install --ignore-scripts   # skip onnxruntime-node CUDA download (browser-only inference)
npm run dev                    # → http://localhost:5173 (already binds 0.0.0.0)
npm run build                  # production build → dist/
```

## Deploy (Vercel)

`vercel.json` is already configured for SPA rewrites. Connect this repo in Vercel (framework preset: **Vite**, build `npm run build`, output `dist`) — every push to the session branch redeploys the preview without manual rebuilds.

## Verification

Nothing here is taken on trust — three layers of checks ship with the repo:

```bash
npm test            # node:test unit suite (pure logic: yt-dlp core, sanitizer, units, planner, QR, registry)
npm run build       # production build must be clean
npm run smoke       # real browser: opens all 12 tools, screenshots each, fails on crashes/console errors
npm run e2e         # deep flows: ffmpeg.wasm webm→MP4, frame grab, GIF encode, EXIF/SMS scrub round-trip,
                    # zxing encode→decode→safety, compressor two-pass with a target budget, QR self-verify
```

`smoke`/`e2e` drive a headless Chromium through puppeteer (not a runtime dependency of the app). Point
them at any running server with `TTT_URL=http://localhost:5173`, and to an existing puppeteer install
with `TTT_HARNESS_MODULES=/path/to/node_modules` (default: `/home/user/browsertest/node_modules`).
Against a production build (`TTT_URL=http://localhost:4173`, i.e. `vite preview`) the logic section is
skipped and reported as such — a build has no `/src/**` modules to import — while the UI and real-media
sections still run. `npm test` resolves the test files itself (`scripts/run-tests.mjs`) so it behaves
identically in bash and in cmd.exe — the shell no longer has to expand `tests/*.test.mjs`.

## Native apps (Windows + Android)

The Tauri 2 shell lives in `src-tauri/`. `.github/workflows/native.yml` (**Actions → “Build apps”**) builds,
on demand or on a `v*` tag:

- **Windows** — NSIS `.exe` + `.msi`, with `yt-dlp.exe` / `ffmpeg.exe` / `ffprobe.exe` bundled as sidecars
  (so Tool 04 needs no setup), and `public/logo.png` as the app icon.
- **Android** — a signed universal APK (`--apk --target aarch64 --target armv7`).

Inside those builds the web UI runs unchanged, plus two native behaviours:
files saved by any tool are written by the OS into **Downloads/TheToolTable** (app storage as a fallback
on Android) instead of a browser download that a WebView would swallow, and Tool 04 talks to the bundled
engine instead of a local server. Tool 04 on Android still needs an engine address (the yt-dlp Android
runner is the one piece not wired yet — see `docs/NATIVE-ENGINE.md`).

## Tool 04 — yt-dlp download engine

yt-dlp is a native program, so one tiny engine layer (`src/lib/engine.js`) picks the right transport:

| Where the app runs | How yt-dlp is provided | User setup |
|---|---|---|
| Windows / Android app | bundled **inside** the installer / APK (Tauri sidecar / youtubedl-android) | none |
| Web (dev, Vercel) | companion engine (`server/ytdlp-api.js`, zero npm deps) | run it, or paste its address |

`npm run setup:engine` and `npm run engine` are **developer-only** (run in this project folder on your own PC, for the web build).
Shipped apps never need them. Full native plan: [docs/NATIVE-ENGINE.md](docs/NATIVE-ENGINE.md).

- Web dev: `npm run setup:engine` once (creates `~/.ytvenv` with yt-dlp + ffmpeg), then `npm run dev` — the engine mounts at `/api/ytdlp`.
- Self-host: `npm run engine` → `http://127.0.0.1:8787/api/ytdlp` (env: `PORT`, `HOST`, `YTDLP_PATH`, `FFMPEG_PATH`, `YTDLP_CORS`, `YTDLP_ALLOW_PRIVATE=1`).
- **CORS default is an allowlist** (local dev ports + thetooltable.app) — a bare `127.0.0.1` engine can download files, so it must not answer every website. Add your own origin with `YTDLP_CORS=https://your.app`, or `YTDLP_CORS=*` if the machine is dedicated.
- Windows installer prep: `node scripts/fetch-sidecars.mjs`.
- Input is never passed to a shell; options are whitelisted; web engine only accepts public http(s) URLs.
