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
- **FFmpeg WASM** (`@ffmpeg/ffmpeg`) — convert / target-size compress / trim, single-threaded core loaded from CDN at runtime.
- **Transformers.js** (`@huggingface/transformers`) — RMBG-1.4 background removal on WebGPU/WASM.
- **qrcode**, **gifenc**, **exifr** — QR vector studio, GIF export, metadata parsing.

## The 12 tools

| # | Tool | Engine |
|---|------|--------|
| 01 | Metadata Extractor (EXIF/IPTC/XMP/GPS + map + hex, Scrub & Sanitize) | exifr, lossless segment/chunk stripping |
| 02 | Any-to-Any Converter (image/video/audio/document, batch) | canvas + FFmpeg WASM |
| 03 | Target-Size Compressor (2-pass bitrate math, live size preview) | FFmpeg WASM |
| 04 | Media Clipper & Downloader (waveform timeline, stream-copy clips) | WebAudio + FFmpeg WASM |
| 05 | ImagePlayer Studio (12 color sliders, LUTs, crop/rotate/flip) | Canvas, lossless PNG |
| 06 | AI Background Remover (RMBG-1.4, refine brush, bg swap) | Transformers.js WebGPU/WASM |
| 07 | Frame Extractor & Clipper (frame step, snapshots, GIF maker) | canvas + gifenc + FFmpeg WASM |
| 08 | Audio Visualizer Video (bars/radial/wave/particles, social ratios) | WebAudio + MediaRecorder |
| 09 | Unit & Currency Converter (daily live rates, offline cache banner) | open.er-api + coingecko |
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

## Phase 2 (roadmap)

- **Windows**: Tauri wrapper — reuse `public/logo.png` as `.ico`/`.png` app icon.
- **Android**: Capacitor/TWA wrapping the same PWA (manifest already ships).
