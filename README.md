# TheToolTable — Universal Multi-Tool Studio

A personal multi-tool studio with 20 browser-first utilities. Most file processing stays in the browser; the Downloader can use a local or separately hosted yt-dlp companion engine, and the Metadata Extractor contacts OpenStreetMap only when you explicitly request a place lookup or map. Files are not uploaded by default. No re-encoding unless a tool explicitly offers it (notably Tool 03 and selected Converter outputs).

## Download v1.1.0

- [Android APK](https://github.com/sadapay404/TheToolTable/releases/download/v1.1.0/TheToolTable.apk)
- [Windows installer (EXE)](https://github.com/sadapay404/TheToolTable/releases/download/v1.1.0/TheToolTable_1.1.0_x64-setup.exe)
- [Windows installer (MSI)](https://github.com/sadapay404/TheToolTable/releases/download/v1.1.0/TheToolTable_1.1.0_x64_en-US.msi)
- [Release details and notes](https://github.com/sadapay404/TheToolTable/releases/tag/v1.1.0)

The repository is private, so downloads require an account with access. On Android, Downloader needs a network-reachable HTTPS companion engine; Windows includes yt-dlp and FFmpeg.

## Branding

- `public/logo.png` — the official logo (1024×1024, Creamy White theme: warm ivory canvas, espresso mark, caramel accent).
- It is used everywhere: browser-tab favicon, apple-touch icon, PWA/Android manifest icon, app header & hero, and it is the source artwork for the future Windows (Tauri) app icon.
- Want a tweak to the mark? Just ask — the mark is regenerated and re-dropped into `public/logo.png`.

## Stack (Phase 1 — Web)

- **Vite + React 18** — instant HMR dev, static production build for Vercel.
- **Tailwind CSS** + CSS-variable **theme engine** (Material You plus six alternate themes, persisted in `localStorage`).
- **Framer Motion** — spring physics (`stiffness 300 / damping 25`), 3D card tilt, press-depth, glow reflections.
- **FFmpeg WASM** (`@ffmpeg/ffmpeg`) — convert / target-size compress / trim using the single-threaded core bundled with the app.
- **onnxruntime-web** (WASM, in a module worker) — runs the bundled IS-Net model for background removal. No GPU or network needed.
- **qrcode**, **gifenc**, **exifr** — QR vector studio, GIF export, metadata parsing.

## The 20 tools

| # | Tool | Engine |
|---|------|--------|
| 01 | Metadata Extractor (EXIF/IPTC/XMP/GPS + map + hex, Scrub & Sanitize) | exifr, lossless segment/chunk stripping |
| 02 | Any-to-Any Converter (image/video/audio/document, batch) | canvas + FFmpeg WASM |
| 03 | Target-Size Compressor (audio/video size budgets, 2-pass H.264 video, AAC audio) | FFmpeg WASM |
| 04 | Media Clipper & Downloader (waveform timeline, stream-copy clips) | WebAudio + FFmpeg WASM |
| 05 | ImagePlayer Studio (image/video grading, saved looks, crop, and exports) | WebGL2 + Canvas + MediaRecorder |
| 06 | AI Background Remover (bundled IS-Net, refine brush, backgrounds, shadow, batch ZIP) | onnxruntime-web WASM worker |
| 07 | Frame Extractor & Clipper (frame step, snapshots, GIF maker) | canvas + gifenc + FFmpeg WASM |
| 08 | Audio Visualizer Video (bars/radial/wave/particles, social ratios) | WebAudio + MediaRecorder |
| 09 | Unit & Currency Converter (daily live rates, offline cache banner) | open.er-api + coingecko |
| 10 | Decision Hub (3D coin, bottle spin 2–12, loaded dice, wheel) | Framer Motion 3D |
| 11 | QR Code Studio (gradients, eye/module shapes, logos, SVG/PNG) | qrcode |
| 12 | Background Canvas Studio (mesh/linear/radial gradients, grain, 4K) | Canvas |
| 13 | PDF Studio (merge, split, reorder, images ⇄ PDF, watermark, page numbers, sign, redact) | pdf-lib, pdf.js |
| 14 | Scan & OCR (auto-crop, perspective fix, clean-up filters, English + Urdu OCR, searchable PDF) | tesseract.js, canvas |
| 15 | Voice & Subtitle Studio (Whisper subtitles, subtitle editor, soft-sub muxing, recorder, audio trimmer, dictation) | transformers.js, FFmpeg WASM, WebAudio |
| 16 | Invoice & Receipt Studio (live preview, real vector PDF, Urdu text, templates, saved library) | pdf-lib, canvas |
| 17 | Beam (peer-to-peer files and chat, code or QR pairing, no server) | WebRTC |
| 18 | App Icon & Asset Forge (favicon, PWA, Android, iOS, Windows, macOS, Tauri packs) | canvas, fflate |
| 19 | Pakistan Money Kit (zakat, salary tax slabs, loan/EMI, savings profit, tola-masha-ratti) | pure maths, editable tables |
| 20 | Text & Writing Lab (counts, case, clean-up, find/replace, diff, Urdu ⇄ Roman Urdu) | pure JS |

## Zero-compression policy

Source files are never modified in place. Re-encoding happens only when the user explicitly requests a format conversion or compression; **Tool 03** is the size-budget compressor. Media trims use stream copy where supported, and metadata scrubbing retains the JPEG/PNG compressed image data without re-encoding (orientation/color profiles may be removed).

## Run

```bash
npm install --ignore-scripts   # skip onnxruntime-node CUDA download (browser-only inference)
npm run dev                    # → http://localhost:5173 (already binds 0.0.0.0)
npm run build                  # production build → dist/
```

## Deploy (Vercel)

`vercel.json` is already configured for SPA rewrites. Connect this repo in Vercel (framework preset: **Vite**, build `npm run build`, output `dist`) — every push to the session branch redeploys the preview without manual rebuilds.

## Phase 2 (roadmap)

- **Windows**: Tauri wrapper — reuse `public/logo.png` as `.ico`/`.png` app icon.
- **Android**: Capacitor/TWA wrapping the same PWA (manifest already ships).

## Tool 04 — yt-dlp download engine

yt-dlp is a native program, so one tiny engine layer (`src/lib/engine.js`) picks the right transport:

| Where the app runs | How yt-dlp is provided | User setup |
|---|---|---|
| Windows Tauri app | yt-dlp + FFmpeg sidecars when built with the sidecar config; installer can also be built without them | none when bundled |
| Android Tauri app | HTTP companion transport (no native yt-dlp bundled yet) | enter a network-reachable HTTPS `/api/ytdlp` engine address |
| Web dev/preview | Vite companion endpoint (`/api/ytdlp`) | install yt-dlp once with the setup script |
| Static hosting (including Vercel) | separately hosted companion engine | enter its `/api/ytdlp` address below; configure CORS for the app origin |

`npm run setup:engine` and `npm run engine` are **developer-only** (run in this project folder on your own PC, for the web build).
Shipped apps never need them. Full native plan: [docs/NATIVE-ENGINE.md](docs/NATIVE-ENGINE.md).

- Web dev: `npm run setup:engine` once (creates `~/.ytvenv` with yt-dlp + ffmpeg), then `npm run dev` — the engine mounts at `/api/ytdlp`.
- Self-host: `npm run engine` → `http://127.0.0.1:8787/api/ytdlp` (env: `PORT`, `HOST`, `YTDLP_PATH`, `FFMPEG_PATH`, `YTDLP_CORS`, `YTDLP_ALLOW_PRIVATE=1`).
- A static Vercel deployment does **not** run this Node engine; configure an independently hosted engine address in the downloader and allow the site origin through CORS.
- Windows installer prep: `node scripts/fetch-sidecars.mjs`; Windows sidecars are optional unless the build uses `src-tauri/tauri.sidecars.conf.json`.
- Input is never passed to a shell; options are whitelisted; web engine only accepts public http(s) URLs.

## Notes on the newer tools

- **Voice & Subtitle Studio** downloads a Whisper model once (39 MB to 800 MB depending on the size you pick), then works offline. WebGPU is used when available.
- **Scan & OCR** bundles English and Urdu; other languages are fetched on first use.
- **Pakistan Money Kit** ships the published tax slabs for the last two tax years and lets you edit every rate. Gold and silver prices are examples — type today's rate. Tax rules change every budget; confirm on fbr.gov.pk.
- **Beam** needs no server. Pick "Same Wi-Fi only" to avoid contacting any outside STUN server.
- Repair status for all 20 tools and the remaining release tasks: [docs/REPAIR-LOG.md](docs/REPAIR-LOG.md).
