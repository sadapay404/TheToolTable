# Native download engine (Windows + Android) — zero setup for users

**Rule:** end users install the app and nothing else. `npm run setup:engine` / `npm run engine`
are *developer* conveniences for the **web** build only (run in the project root on your own PC).
They never appear in a shipped app.

## One engine, three transports

Tool 04 talks to `src/lib/engine.js`, never to a server directly. All real logic (argument
building, progress parsing, error cleanup, URL checks) lives in `src/lib/ytdlp-core.js` —
pure JS, no Node/DOM — and is shared by every runtime.

| Runtime | Transport | Where yt-dlp lives | User setup |
|---|---|---|---|
| Browser / Vercel | HTTP → companion engine | your machine or a server | run engine (or paste its address) |
| **Windows (Tauri)** | `nativeEngine(tauriRunner)` | yt-dlp + ffmpeg sidecars when the installer is built with the sidecar config | none when bundled |
| **Android** | runner injection is not implemented | no bundled yt-dlp engine yet | downloader unavailable offline |

A native runner implements just: `version()`, `hasFfmpeg()`, `spawn(args, onChunk) → {done, kill}`,
`downloadsDir()`, `sizeOf(path)`, optional `reveal(path)`. Verified: the generic native engine
ran MKV remux, a 3–9 s section, and MP3 extraction through real yt-dlp using a Node stand-in runner.

## "Can we use yt-dlp as a Python library?"

Yes — `yt_dlp` is a pure-Python package (`import yt_dlp`), but a library still needs an interpreter,
so it doesn't remove the packaging problem; it only moves it.

- **Windows:** don't embed Python. The official `yt-dlp.exe` is PyInstaller-frozen and already contains
  its own Python, so Tauri can bundle it as a **sidecar** (`bundle.externalBin`). Simplest, smallest risk.
- **Android:** there is no `yt-dlp.exe`. Two proven routes:
  1. **youtubedl-android** (yausername) — an AAR that bundles yt-dlp + a Python runtime, optional
     ffmpeg + aria2c, with in-app yt-dlp updates. *Recommended.*
  2. **Chaquopy** — embed CPython and `pip install yt-dlp` into the APK; call `yt_dlp.YoutubeDL` directly.
     More control, you own ffmpeg packaging.
  Verify at build time that the library's bundled Python meets yt-dlp's current minimum version;
  yt-dlp periodically drops old Pythons — that's why in-app updating matters.

## Windows setup (Phase 2, once the Tauri shell exists)

1. `node scripts/fetch-sidecars.mjs` → fills `src-tauri/binaries/` with `yt-dlp-`, `ffmpeg-`, `ffprobe-<triple>.exe`.
   (LGPL ffmpeg build; ship its notice in the installer. Pin the printed SHA-256s in CI.)
2. `src-tauri/tauri.conf.json`:
   ```json
   { "bundle": { "externalBin": ["binaries/yt-dlp", "binaries/ffmpeg", "binaries/ffprobe"] } }
   ```
3. `src-tauri/capabilities/default.json` (args are produced only by our own audited `buildArgs`):
   ```json
   { "permissions": [
       "core:default", "fs:default", "opener:default",
       { "identifier": "shell:allow-spawn",   "allow": [{ "name": "binaries/yt-dlp", "sidecar": true, "args": true }] },
       { "identifier": "shell:allow-execute", "allow": [
           { "name": "binaries/yt-dlp", "sidecar": true, "args": true },
           { "name": "binaries/ffmpeg", "sidecar": true, "args": ["-version"] } ] },
       { "identifier": "fs:allow-mkdir", "allow": [{ "path": "$DOWNLOAD/TheToolTable" }] },
       { "identifier": "fs:allow-stat",  "allow": [{ "path": "$DOWNLOAD/TheToolTable/**" }] } ] }
   ```
4. `npm i @tauri-apps/api @tauri-apps/plugin-shell @tauri-apps/plugin-fs @tauri-apps/plugin-opener`
   (+ the matching Rust plugins). `engine.js` auto-selects the sidecar transport when running inside Tauri.
5. yt-dlp finds `ffmpeg`/`ffprobe` next to its own executable, which is where Tauri places sidecars.

**Status:** the shared core + generic native engine have test coverage. The Tauri 2 shell and sidecar permissions now exist, but the Windows sidecar transport still needs an end-to-end packaged-app test before release. The Android runner/plugin described below is not implemented or injected yet; do not advertise bundled Android downloads until that is completed and tested.

## Android setup (Phase 2)

Tauri 2 mobile shell + a small Kotlin plugin wrapping youtubedl-android that exposes the runner
contract (spawn → stream lines, kill, downloads dir, size). The shell injects it as
`window.__TTT_ANDROID_RUNNER__`; `engine.js` already selects it. Save to the public Downloads
via MediaStore (scoped storage), not a raw path.

## Keeping yt-dlp alive (sites break it often)

- Android: use the library's built-in update (stable channel).
- Windows: `Program Files` is read-only, so on launch check the latest release and cache a newer
  `yt-dlp.exe` under `%LOCALAPPDATA%` and prefer it over the bundled one.
- Always keep the bundled copy as the offline fallback.

## Distribution notes

- Google Play restricts apps that download from YouTube; plan on GitHub releases / F-Droid for the APK.
- Include yt-dlp (Unlicense) and ffmpeg (LGPL) notices in the app's licenses screen.
