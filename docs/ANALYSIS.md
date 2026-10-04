# TheToolTable — Full Repository Analysis

**Analysed:** 4 Oct 2026 · branch `arena/01a10643-thetooltable` @ `3d43ee8`
**Method:** full source read (100% of `src/`, `server/`, `scripts/`, `src-tauri/`, CI, docs), production build executed, dev server + headless-Chrome smoke test of all tools (12 at the time; 20 today), dependency audit, asset/bundle measurement. Nothing was modified.

---

## 0. Resolution status (updated after the fix pass)

Everything below was fixed, and the app was re-verified with the shipped harness (`npm test` 38/38,
`npm run smoke` 20 tools with 0 broken, `npm run e2e` 27/27 — including real ffmpeg.wasm encodes, a real
EXIF scrub round-trip and a real OCR read of a rendered image with the network cut).

| # | Finding | Status |
|---|---|---|
| F1 | Container promise vs VP9/Opus sources | **Fixed** — codec-aware selectors, no `--remux-video`, `containerPlan()` + a job-card note when the real file is MKV |
| F2 | "170+ units" vs reality | **Fixed** — exact counts in the registry (157 units · 16 categories · 166 fiat · 40 coins · 250 zones) |
| F3 | Engine shipped with `Access-Control-Allow-Origin: *` | **Fixed** — origin allowlist by default (local dev + thetooltable.app), `YTDLP_CORS` to widen, `*` only on request |
| F4 | Undisclosed third-party calls (geocode, coin logos) | **Labelled** — the dropzone and the tool copy now name OpenStreetMap; privacy hardening was explicitly waived by the owner (personal software) |
| F5 | `xlsx` advisories, `image-size` DoS | **Fixed** — `xlsx` → `npm:@e965/xlsx@^0.20.3`, `image-size` overridden to ^2.0.4 → `npm audit --omit=dev` clean |
| F6 | Silent GIF frame cap | **Already surfaced** — `src/tools/frames/Panels.jsx:199` shows "GIFs are capped at 300 frames — only the first N s is used"; `encodeGif()` also returns `capped`/`wanted` so any future caller can react |
| F7 | Stale README / NATIVE-ENGINE | **Fixed** — bundled (not CDN) ffmpeg core, real slider/look counts, the native build section, a verification section, honest Android engine status |
| F8 | No automated gate; harness unbound | **Fixed** — `npm test` suite, `npm run smoke` / `npm run e2e`, new `web.yml` CI (build + tests + dist assertions), `native.yml` runs the tests, `sandbox-recover.sh` no longer hardcodes paths |
| F9 | `Dropzone` not keyboard-accessible | **Fixed** — `role="button"`, focus ring, Enter/Space, `aria-label`; icon-only buttons labelled |
| F10 | Absolute asset paths ignore the base | **Fixed** — `assetUrl()` for the logo and flags; ffmpeg/model URLs were already base-aware |
| F11 | Unguarded storage, frozen cache name | **Fixed** — `lsGet/lsSet` guards, `sw.js` cache bumped to `ttt-v2` with `/ffmpeg/` immutable |
| F12 | Bundle composition (informational) | No action — every heavy asset is lazy |

### Bugs found *while* fixing (not in the original audit) — all fixed

| Bug | Impact | Fix |
|---|---|---|
| `AnimatePresence mode="wait"` deadlock after a heavy tool run | After a compression the view faded out and **never came back**: blank, un-navigable app until reload | Replaced with a keyed mount animation; documented in `App.jsx` so it is not reintroduced |
| Exiting view kept as a mounted ghost (default AnimatePresence mode) | Reopening a tool resurrected the **previous file/result** with it (stale state served from an invisible instance) | Same fix — the old subtree is simply unmounted |
| `mediaDuration()` on headerless WebM/MKV | Screen-recorder output showed no duration → the compressor's plan card stayed empty | Force-duration probe (seek past the end) with a timeout |
| `scrubJPEG/scrubPNG` rejected `Uint8Array` views | Callers handing a view instead of the buffer got a broken image | Normalise input with `toAB()` |
| `containerPlan()` planned for a quality that did not exist | Predicted MP4 for a height only available as VP9 | Plan for the stream yt-dlp will actually pick |
| Compressor had no fallback when a core lacks the null muxer | "Encode failed" on such cores | Single-pass fallback with a UI label, local flag (no stale state) |
| Compressor result ignored the promise it made | A run could overshoot the target silently | Result line always prints target vs actual + an amber overshoot note with a concrete suggestion |
| Audio-only compression path | An audio file could not hit a byte budget | Single-pass AAC to `.m4a`, audio-bitrate slider, honest plan card |
| Native shells swallowed blob downloads | Windows/Android users could not save any tool's output | `download()` writes through Tauri fs into `Downloads/TheToolTable` (app storage fallback) + `SaveToast` |

---

## 1. Verdict up front

This is an unusually complete, genuinely local-first product. 13.6k lines of app code, 12 working tools, no dead scaffolding, no placeholder screens, three deployment targets (web / Windows / Android) wired from one codebase, and real engineering depth in the hard places (WebGL colour pipeline, a shared yt-dlp core across three transports, bundled WASM ffmpeg + ONNX, a 12-style generative shader).

**Verified healthy:**

| Check | Result |
|---|---|
| `npm install --ignore-scripts` | ✅ 251 packages, clean |
| `npm run build` | ✅ 13.8 s → `dist/` (no warnings other than chunk sizes) |
| Dev server + all tools opened in headless Chrome | ✅ **zero** React errors, zero page errors, zero failed same-origin requests |
| Offline behaviour without internet | ✅ Tools 1, 2, 5, 6(offline), 7, 10, 11, 12 fully functional; Tool 9 falls back to its bundled snapshot; Tool 4 reports "engine offline" gracefully |
| `npm ci --dry-run` (what CI runs) | ✅ lockfile consistent |
| `npm audit --omit=dev` | ⚠️ 3 high advisories (`xlsx`, `image-size` via `pptxgenjs`) — see F5 |

The main issues found are *accuracy-of-promises* issues (a handful of claims that overstate), *one real security default* in the self-hosted engine, and *stale docs*. Details in §6.

---

## 2. What this repository is

**TheToolTable** — "a growing set of desktop-grade tools in one ultra-slick 3D-animated studio", credited to *Mubashir*. Product thesis: file tools that never upload your files. Three surfaces, one codebase:

```
                   ┌──────────────────────────────────────────────┐
   Browser / Vercel│  Vite + React 18 SPA (static, 100% client)   │
   Windows (Tauri) │  same bundle, wrapped in a Tauri 2 shell     │
   Android (Tauri) │  same bundle + native plugin (Phase 2)       │
                   └──────────────────────────────────────────────┘
                              │
        optional native helper: yt-dlp (Tool 04 only)
        dev/preview: mounted at /api/ytdlp · self-host: server/standalone.js
```

**Numbers (verified, not from the README):**

| Metric | Value |
|---|---|
| Tracked files / repo pack size | 391 files / 31.8 MiB |
| App source | `src/tools` 10,183 · `src/lib` 4,990 · `src/components` 423 · `server` 234 · `scripts` 87 · `src-tauri/src` 15 lines |
| Production `dist/` | 114 MB total (42 MB ONNX model + 30.6 MB ffmpeg wasm + 31 MB ORT wasm + 1.5 MB zxing were all lazy) |
| First-load JS | 293 KB (96 KB gzip) + 46 KB CSS; every tool is its own lazy chunk (14–205 KB) |
| Dependencies | 19 runtime, 6 dev |
| Tools shipped | 12, each lazily code-split through `src/toolsRegistry.jsx` |
| Bundled content | 212 flag SVGs, 33 QR templates, 40 QR logos, 31 photo looks, 15 visualizer styles, 18 viz presets, 35 palettes, 38 gallery looks, 12 wall styles, 157 physical units, 166 fiat + 40 crypto (snapshot), 195 countries |

---

## 3. Architecture

### 3.1 Entry & shell

| File | Role |
|---|---|
| `index.html` | PWA entry: favicon, apple-touch icon, manifest, theme-color, `data-theme="creamy"` |
| `src/main.jsx` | Mounts React, applies saved theme, registers `public/sw.js` **only** in prod web builds (skips Tauri, skips non-http) |
| `src/App.jsx` (342 ln) | Header (logo, ⌘K palette trigger, perf picker, theme picker), hero masthead, 3D tilt tool grid, active-tool frame with `Suspense` + `ErrorBoundary`, `MotionConfig` honouring lite mode |
| `src/toolsRegistry.jsx` | **The single source of truth**: 12 tool descriptors (`id, n, name, icon, color, tag, desc, keywords, comp`) with `React.lazy` + `preload()` on card hover/focus |
| `src/components/CommandPalette.jsx` | Fuzzy search over tool names + keywords + themes + recent actions (`score()` does substring then subsequence) |
| `src/themes.js` | 5 themes as CSS-variable maps (Creamy White, Pure OLED, Cyberpunk Neon, Pastel Minimal, Deep Midnight), persisted in `localStorage['ttt-theme']` |
| `src/styles.css` (237 ln) | Tailwind layers, self-hosted `@font-face` (Inter + Fraunces from `node_modules`), cards, 3D tilt/sheen, buttons, dropzone, ticker/split-flap animation, **perf-profile CSS blocks** |

Adding a tool = one lazy import + one registry object. That is a genuinely good extensibility seam.

### 3.2 Cross-cutting infrastructure (the strongest part of the repo)

- **`src/lib/perf.js`** — one device-tier brain: hardware probe (cores, `deviceMemory`, coarse pointer, `saveData`, reduced-motion), a ~40 ms canvas/JS micro-benchmark run on idle, tier → `lite|balanced|full`, user override persisted. It publishes `dpr()`, `scale()`, `fps()`, `threads()`, `maxMP()`, `parallel()` knobs and sets `html[data-perf]` so CSS can turn off blur/grain/3D. Exports say exports are never lowered — only previews.
- **`src/lib/ffmpeg.js`** — lazy shared single-threaded ffmpeg.wasm; core is **served from the app itself** (`/ffmpeg/ffmpeg-core.{js,wasm}`), emitted at build time by `vite.config.js` and streamed in dev. No CDN → offline PWA and native builds work. Also translates the "no audio track" failure into a human message.
- **`src/lib/engine.js` + `src/lib/ytdlp-core.js`** — the download engine abstraction. `ytdlp-core.js` is pure logic (no `node:*`, no DOM): URL validation/normalisation, info→UI model (`summarise`), argv building (`buildArgs`, whitelist-only, never a shell), and a streaming `JobTracker` that parses `--progress-template` output. Three transports consume it: HTTP (`server/ytdlp-api.js` in dev/preview or self-hosted), Tauri sidecar (`tauriRunner`, global-Tauri API), and a future Android plugin (`window.__TTT_ANDROID_RUNNER__`). This is textbook.
- **`src/lib/sanitize.js`** — truly lossless metadata stripping: JPEG walker drops APPn/COM segments and keeps the entropy stream; PNG keeps only `IHDR/PLTE/IDAT/IEND/tRNS/sBIT/pHYs`. No re-encode. Excellent and rare.
- **`src/lib/utils.js`** — bytes/time formatting, download helper, extension helpers, media duration probe, recent-action log.

### 3.3 Server side

- `server/ytdlp-api.js` (234 ln) — zero-dependency Node handler: binary discovery (`YTDLP_PATH` → `.bin/` → `~/.ytvenv` → PATH; ffmpeg found via `imageio-ffmpeg` too), `/health` `/info` `/jobs` `/jobs/:id` `/jobs/:id/file`, max 3 concurrent jobs, 30-min TTL sweeper, streamed file delivery with RFC-5987 filenames, argv-only security model, private-host blocking.
- `server/standalone.js` — self-host wrapper (`PORT`/`HOST`/`YTDLP_CORS`/`YTDLP_ALLOW_PRIVATE`).
- `vite.config.js` — mounts the engine on dev **and** preview servers (same origin, zero setup) and emits the ffmpeg core into the bundle.

### 3.4 Desktop / mobile

- `src-tauri/` — Tauri 2 shell: 1280×820 window, NSIS+MSI targets, `withGlobalTauri: true` (that's how `engine.js` reaches plugins in the shipped app), capability file scoped to `binaries/yt-dlp` + `binaries/ffmpeg -version` + `fs` mkdir/stat under `$DOWNLOAD/TheToolTable`.
- `src-tauri/tauri.sidecars.conf.json` — bundles `yt-dlp`, `ffmpeg`, `ffprobe` so installers need no user setup.
- `scripts/fetch-sidecars.mjs` — downloads the frozen `yt-dlp.exe` + LGPL ffmpeg build, prints SHA-256s for pinning.
- `.github/workflows/native.yml` — cloud builds: Windows (NSIS+MSI, sidecar-aware fallback) and Android (NDK 27, arm64+armv7, self-signed APK), plus a tag-driven GitHub Release. Genuinely thought through.
- `docs/NATIVE-ENGINE.md` — the native plan, including the honest "not yet run in a real Tauri build" status note.

---

## 4. The tools — engine map & notable internals

| # | Tool | File(s) | Engine / core | Notable internals |
|---|---|---|---|---|
| 01 | Metadata Extractor | `MetadataExtractor.jsx` (350) | `exifr`, jsPDF | Markers/structure walkers for JPEG+PNG, raw XMP packet dump, embedded thumbnail, GPS + OpenStreetMap preview, hex viewer, **lossless scrub**, PDF/JSON report |
| 02 | Any-to-Any Converter | `Converter.jsx` (143) + `lib/engines.js` (317) | canvas, ffmpeg.wasm, fflate, xlsx, pptxgenjs, pdfjs-dist | Kind detection → target matrix (`KIND_TARGETS`), 39 output formats, hand-written **BMP encoder** (BITMAPV4), real OOXML/EPUB writers built with fflate, PDF→text, sheet/zip round-trips, per-file batch queue |
| 03 | Target-Size Compressor | `Compressor.jsx` (338) | ffmpeg.wasm | Circular dial, 2-pass bitrate math with audio/container overhead, live budget-allocation bar, x264+AAC, estimate vs actual |
| 04 | Media Clipper & Downloader | `Downloader.jsx` (503) + `Clipper.jsx` (156) | yt-dlp engine abstraction, WebAudio, ffmpeg.wasm | Playlist browser, quality/container/audio-format pickers, section clipping with optional keyframe-accurate cuts, subtitle embedding, live job cards w/ staged progress, local-file waveform + stream-copy clip |
| 05 | ImagePlayer Studio | `ImageStudio.jsx` (728) + `lib/studio/*` | **WebGL2 fragment shader** (`renderer.js` 302) | 8-channel HSL mixer (24 sliders), 3-way grade, 31 looks (incl. user-saved looks), LUT-ish presets, histogram, crop/straighten/rotate/flip, split-view, picker, zoom/pan, live video grading, PNG/JPEG/WebP export + real-time MediaRecorder video export at chosen fps/bitrate |
| 06 | AI Background Remover | `BgRemover.jsx` (506) + `lib/bg/*` | onnxruntime-web workers | **Offline**: bundled IS-Net quint8 (42 MB) in a WASM worker, no network. **Online**: BiRefNet pro/max from Hugging Face, WebGPU when available (fp16 detection), cached in Cache Storage for offline reuse. Matte refine brush, edge/softness, gradients, shadow, trim, batch ZIP, engine/tier switch UI |
| 07 | Frame Extractor & Clipper | `FrameExtractor.jsx` (432) + `lib/frames.js` | canvas + gifenc + ffmpeg.wasm | fps detection via `requestVideoFrameCallback`, filmstrip, exact stepping, native-res snapshots, frame ZIP series, GIF encoder with 300-frame plan, lossless trims |
| 08 | Audio Visualizer Video | `Visualizer.jsx` (475) + `lib/viz/*` (447 render) | WebAudio + canvas + MediaRecorder | 15 styles, 12 palettes, 18 presets, log-spaced FFT bands + beat detection with attack/release smoothing, resolution-independent renderer (thumbnail = 4K), 5 social ratios, real-time recording with audio track mux + WebM duration fix |
| 09 | Currency, Unit & Time | `UnitCurrency.jsx` + `lib/units/*` | live APIs + bundled fallback | 166 fiat + 40 crypto snapshot (live top-250 crypto with sparklines), 16 unit categories / 157 units, unit-aware parsing, numbers **in words** (International + South-Asian lakh/crore + Roman-Urdu), 195 countries with DST-aware time travel via `Intl` |
| 10 | Decision & Randomizer Hub | `DecisionHub.jsx` + `decision/*` (8 files) | Framer Motion 3D | Coin (multi, metals, 3D flip), dice (loaded bias), wheel, bottle spin, name draw & teams, numbers, oracle — randomness via `crypto.getRandomValues` **with rejection sampling** (unbiased) |
| 11 | QR Code Studio | `QRStudio.jsx` + 12 sub-files + `lib/qr/*` | `qrcode`, `zxing-wasm`, jsPDF | 33 templates, 40 logos, gradients, dot/eye shapes, frames, ECC tuning, **real decoder self-check with a scanability score**, camera scanner, barcode writer, bulk CSV/grid sheets, print cards (PDF), history/library, payload-safety heuristics |
| 12 | Background Canvas Studio | `BackgroundStudio.jsx` + `lib/wall/*` | **WebGL2 uber-shader** (237 ln) | 12 generative styles, symmetry, pixelate, OKLab mixing, finishing stack (grain/vignette/glow/shade), 35 palettes, 38 gallery looks, text layer, 4K PNG/WebM/GIF export, saved looks, full-screen, keyboard shortcuts, undo/redo |

### 4.1 Tools 13–20 (the second batch)

Added after the v1 audit, built to the same shape as the table above: a tool is a single `.jsx`
component in `src/tools/`, heavy logic lives in `src/lib/*`, and every engine is bundled so the
tool still works with the network off.

| # | Tool | File(s) | Engine / core | Notable internals |
|---|---|---|---|---|
| 13 | PDF Studio | `PdfStudio.jsx` + `lib/pdf/ops.js` | pdf-lib + pdf.js | Thumbnail grid (pdf.js render, own loading-task teardown), per-page rotate/delete/reorder, merge several documents, split to ranges, strip metadata, photos→A4 pages, →PDF/JPEG,ZIP output |
| 14 | OCR Studio | `OcrStudio.jsx` + `lib/ocr.js` | Tesseract LSTM **in `public/ocr/`** (14 MB) | Word/line boxes drawn over the image, per-word confidence, languages from the bundled traineddata, PDF page import through pdf.js, output to text/copy/searchable-PDF |
| 15 | Voice & Subtitle Studio | `VoiceStudio.jsx` + `lib/subs.js` | WebAudio + cue engine | SRT/VTT/ASS parse→edit→export round-trip, shift/speed cues, split/merge, per-cue timing stamped against the waveform, silence-based speech detection, transcript text kept in `textarea.value` |
| 16 | Invoice Studio | `InvoiceStudio.jsx` + `lib/invoice.js` | jsPDF | Line items/discount/tax, 4 templates, logo + signature raster, running totals, `INV-0001` numbering with persisted counter, PDF preview, JSON/CSV export |
| 17 | Audio Studio | `AudioStudio.jsx` + `lib/audio.js` | WebAudio + ffmpeg.wasm | Waveform editor, selection scrubbing, trim/cut/fade/normalise/reverse/speed, join with crossfade, WAV export plus `.m4a` through FFmpeg |
| 18 | Archive Studio | `ArchiveStudio.jsx` + `lib/zip.js` | fflate | Open a zip/gz and browse entries, filter, extract selected, build a new archive, repack streams, size/CRC column view |
| 19 | Hash & Verify | `HashVerify.jsx` + `lib/hash.js` | WebCrypto + pure-JS MD5/CRC | SHA-256/384/512 + SHA-1 via WebCrypto, MD5 and CRC-32 implemented in JS (checked against OpenSSL vectors in `tests/tools.test.mjs`), batch hashing by drop, side-by-side compare, pasted-hash verify |
| 20 | Chart & Data Studio | `ChartStudio.jsx` + `lib/chart.js` | own SVG chart engine | CSV/JSON/XLSX import with type sniffing, bar/line/area/pie/donut/scatter, animated entry, legend + axis formatting, SVG/PNG export |

In the same pass `README.md` and this document were refreshed from "12 tools" to 20, and the
harness grew a section that exercises every new app end-to-end in a real browser.

---

## 5. Verification detail (what I actually ran)

```
npm test                          → 38/38 (node:test; includes MD5/CRC vs OpenSSL vectors)
npm run build                     → ✓ built in 13.6 s (dist/ 129 MB — 14 MB of that is the OCR runtime)
npm run dev (0.0.0.0:5173)        → Vite ready in ~200 ms
npm run smoke                     → 20 tools · 19 clean · 1 warning · 0 broken
npm run e2e                       → 27/27 real checks, 0 page errors
                                     · section D drives the eight new apps through their own UI:
                                       remove a page → save → the file on disk has 2 pages (1527 B)
                                       SRT import → +500 ms → the exported file says 00:00:01,500
                                       hashes equal Node's, archive round-trips, invoice PDF, chart SVG
                                       OCR reads a rendered image offline: "HELLO 12345 OFFLINE OCR", 96%
Tool 09 without internet          → "Offline snapshot · approximate" shown correctly
```

The single smoke warning is Tool 09's three rate APIs being unreachable in this sandbox →
graceful offline fallback (by design, and the visible label is honest).

---

## 6. Findings

### 🔴 High — accuracy / correctness of promises

**F1 · "Container is swapped losslessly, never re-encoded" is not guaranteed for every source (Tool 04).**
`src/lib/ytdlp-core.js:126-133` builds `-f 'bv*[height<=H][ext=mp4]+ba[ext=m4a]/bv*[height<=H]+ba/b' --merge-output-format mp4 --remux-video mp4`. When a site's best stream is VP9/AV1/Opus (very common on YouTube), the `[ext=mp4]` branch is unavailable, yt-dlp falls through to `bv*+ba`, and it will **silently merge into MKV instead of MP4** (yt-dlp's documented behaviour) — the UI still says "MP4". Two fixes are possible: (a) enforce `-S` sorting such that codecs are mp4-compatible and show a warning + "MKV" chip when not, or (b) drop `--remux-video` (remux can also force a full re-encode path when the codec pair doesn't fit the container). This is the one place where the zero-compression promise can quietly break.

**F2 · "170+ units" / README claims vs reality.** `src/lib/units/units.js` actually defines **157** physical units across 16 categories; "170+" holds only if you count fiat+crypto (166+40 snapshot, 250 live). Harmless, but the number should be stated precisely.

### 🟠 Medium — security & privacy

**F3 · The self-hosted engine ships with a wide-open CORS default.**
`server/standalone.js:14` → `createYtdlpHandler({ cors: process.env.YTDLP_CORS || true })`, and `server/ytdlp-api.js:186-193` then sends `Access-Control-Allow-Origin: *` **plus `Access-Control-Allow-Private-Network: true`**. Any website the user visits can therefore reach `http://127.0.0.1:8787/api/ytdlp`, start downloads, consume bandwidth/disk, and use the engine as an open proxy. Job files need a 16-hex id (not enumerable), and URLs are restricted to public http(s), so exfiltration is unlikely — but the default should be an explicit origin allowlist (or a token), with `*` kept as an opt-in for local tinkering. `YTDLP_ALLOW_PRIVATE` is correctly off by default, so this is the only real hole in an otherwise well-designed threat model.

**F4 · Two tools make third-party network calls that the "nothing leaves your device" story doesn't mention (Tool 01, Tool 09).**
- `src/tools/MetadataExtractor.jsx:87` — reverse-geocodes the photo's GPS via `nominatim.openstreetmap.org` automatically when EXIF has coordinates. The precise lat/lon leaves the device, in the tool whose headline feature is *Scrub & Sanitize*. Should be an explicit opt-in ("Look up place name — sends coordinates to OpenStreetMap") or removed.
- `src/tools/exchange/parts.jsx:70` — coin logos are loaded straight from the exchange-rate API's `image` URL (CoinGecko CDN), leaking a request per coin row. Minor, but the app's copy says otherwise.

**F5 · Dependency advisories reachable at runtime.**
`npm audit --omit=dev` reports **3 high**:
- `xlsx@0.18.5` — prototype pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9), **no fix on npm** (SheetJS moved to self-hosted builds ≥0.19.3). It parses untrusted user spreadsheets in Tool 02 → genuine exposure. Options: vendor `xlsx@0.20.x` from `cdn.sheetjs.com`, or swap the sheet path to a maintained reader/ writer (`exceljs`, `write-excel-file`) — note the sheet path is currently read+write, so a swap is a chunk of work.
- `image-size` (via `pptxgenjs`) — DoS on crafted JXL/HEIF/ICNS; low reachability here (only writes slides from text), fixable by pinning `pptxgenjs@4.0.0`.

**F6 · Silent truncation in GIF export (Tool 07).** `src/lib/frames.js:98` computes `capped` (max 300 frames) but nothing in `FrameExtractor.jsx` ever reads it — a 60 s @ 30 fps selection silently becomes 10 s. One-line fix: surface a note ("capped at 300 frames — shorten the range or lower fps").

### 🟡 Low — docs, DX, polish

**F7 · Docs are out of date with the code (the code is ahead).**
- `README.md` still says the ffmpeg core is "loaded from CDN at runtime" (it is now bundled — the newest commit fixed exactly this), describes Tool 05 as "12 color sliders" (it is 24 mixer sliders + 31 looks), and files the Tauri/Android work under "Phase 2 (roadmap)" although `src-tauri/` and the full native CI workflow already exist.
- `docs/NATIVE-ENGINE.md` states "no Tauri shell exists in the repo yet" — it does.
- `README.md` tool table row 11 says "33 templates, 40 logos" ✅ (verified) — so the drift is isolated, but it's the first thing a visitor reads.

**F8 · No automated quality gate for the web app.** `.github/workflows/native.yml` only builds installers on `workflow_dispatch` / tags. There is no CI that runs `npm run build` on push (the Vercel deploy is the only build signal), no linter config, no test script, no type checking. `scripts/harness/*.mjs` is a real puppeteer smoke harness but isn't wired to a script and its deps (`puppeteer-core`, `@sparticuz/chromium`) aren't declared anywhere — `scripts/sandbox-recover.sh` also hardcodes `/home/user/browsertest` and a stray `/home/user/TheToolTab` fallback path.

**F9 · Accessibility gaps.**
- `src/components/ui.jsx:26` — `Dropzone` is a `div` with `onClick`: not focusable, no `role`, no Enter/Space handling, so keyboard-only users cannot add files anywhere in the app. Turning it into a `<label htmlFor>` (or `button`) is a small, high-value fix.
- Several icon-only buttons rely on `title`/visual context rather than `aria-label`.

**F10 · Absolute asset paths ignore the Vite base.** `Logo.jsx` (`/logo.png`), `exchange/parts.jsx` (`/flags/*.svg`), `icons/*` in the manifest — fine on Vercel root and in Tauri (`tauri://localhost/`), but any sub-path hosting breaks silently. `import.meta.env.BASE_URL` is already used correctly in `ffmpeg.js` and `bg/engine.js`.

**F11 · Minor robustness inconsistencies.**
- `src/lib/engine.js:14` reads `localStorage.getItem` unguarded (throws in hardened/private contexts), while `themes.js` and `perf.js` guard theirs.
- `sw.js` uses a hard-coded `ttt-v1` cache name; shipping an updated ONNX model or ffmpeg core won't replace the cached copy until that string is bumped (immutable-path strategy is otherwise correct).
- `httpEngine.save()` sets `a.download = ''` — works from the engine's `Content-Disposition`, but the filename is guesswork when the engine is on another origin.

**F12 · Bundle composition worth knowing (not a bug).** 114 MB `dist` = 42 MB IS-Net model + 30.6 MB ffmpeg core + 31 MB ORT wasm (two builds: threaded and jsep) + 1.5 MB zxing. All lazy. If size ever matters: the non-jsep ORT wasm (~10.6 MB) is only used by the offline worker and could be dropped from the web build if the offline engine moved to the jsep build too; media assets dominate any host's bandwidth, not the JS.

---

## 7. Where the code is exceptional (worth protecting in future changes)

1. **`ytdlp-core.js`'s environment-free design** — one tested core, three runtimes, zero duplicated logic, no shell anywhere.
2. **`sanitize.js`** — byte-level lossless scrubbing; most commercial tools re-encode and call it "cleaning".
3. **`perf.js`** — a device-tier system that actually reaches CSS, WebGL resolution, frame caps, worker counts and batch parallelism, with the principled rule "exports are never lowered".
4. **Honest failure UX** — Tool 04's offline card, Tool 09's "showing saved rates", ffmpeg's "this file has no audio track" — the app explains bad states instead of hanging.
5. **Perf-aware lazy splitting** — every tool is a chunk; heavy engines (xlsx, jspdf, pptxgenjs, pdf.js, ORT) only load when the user reaches the feature.

---

## 8. Suggested next moves (pick any)

| # | Change | Effort | Value |
|---|---|---|---|
| A | Fix F1 (always-truthful container/no-re-encode promise + warning when only MKV is possible) | S–M | High |
| B | Close F3 (CORS default → origin allowlist / optional token) | S | High |
| C | Make F4 explicit (reverse-geocode opt-in; document/lazy-load coin imagery) | S | High |
| D | Address F5 (`xlsx` migration or vendored build; bump `pptxgenjs`) | M–L | High |
| E | Refresh `README.md` + `docs/NATIVE-ENGINE.md` to match reality (F7); write a `docs/ARCHITECTURE.md` | S | Medium |
| F | Surface the GIF frame cap (F6) + make `Dropzone` keyboard-accessible (F9) | S | Medium |
| G | Add CI: build + lint + the existing puppeteer smoke harness as `npm run smoke` (F8) | M | Medium |
| H | Generalise asset paths to `BASE_URL` (F10) and guard the last unguarded `localStorage` reads (F11) | S | Low |

*S ≈ under an hour of work, M ≈ half a day, L ≈ a day or more.*

---

## 9. Questions this analysis can't answer

1. Is the **Android/Tauri runner** (`tauriRunner`, `__TTT_ANDROID_RUNNER__`) ever actually exercised? The code looks right, but `docs/NATIVE-ENGINE.md` admits it hasn't been run in a real shell.
2. Is the **`isnet-quint8.onnx` licence** cleared for shipping (the bundled README says "check the licence terms yourself before commercial redistribution")?
3. Should **Vercel-hosted Tool 04** keep advertising itself as zero-setup, given it needs a companion engine in the web build? (The offline card explains it well; the tool card slightly oversells.)
4. Do you want the **live exchange-rate APIs** at all, given the privacy stance — or is snapshot+cache the intended end state?
