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
| **Windows (Tauri)** | `nativeEngine(tauriRunner)` | `yt-dlp.exe` + `ffmpeg.exe` + `ffprobe.exe` **inside the installer** | **none** |
| **Android** | `nativeEngine(androidRunner)` | yt-dlp + Python + ffmpeg **inside the APK** | **none** |

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

**Status:** the Tauri 2 shell exists (`src-tauri/`), the steps above are implemented, and
`.github/workflows/native.yml` builds the Windows installers in CI with the sidecars fetched fresh
(so `binaries/` stays out of git). What is *not* yet verified is a real download on a real machine:
sidecar spawn, `--ffmpeg-location`, and the `path.downloadDir()` save all run through the same
`ytdlp-core.js` that the HTTP engine uses, but they have only been exercised against a Node stand-in
runner, not the frozen `yt-dlp.exe` in an installed app.

## Android setup

The Tauri 2 mobile shell builds a signed universal APK in CI. **The download engine is the one
missing piece**: `engine.js` already looks for `window.__TTT_ANDROID_RUNNER__`, but nothing injects
it yet — a small Kotlin plugin wrapping [youtubedl-android](https://github.com/yausername/youtubedl-android)
still has to expose the runner contract (spawn → stream lines, kill, downloads dir, size).
Until then Tool 04 on Android shows its offline card and accepts an engine address (point it at your
PC's `npm run engine`), and every other tool works fully offline.

Two Android-specific details that are handled:

- **Saving files.** A `blob:` + `<a download>` does nothing inside a WebView, so `download()` in
  `src/lib/utils.js` writes through Tauri's fs plugin instead: `Downloads/TheToolTable/<name>` first,
  app-private `exports/` as a fallback, with a toast telling you where the file went.
  On Android the fs plugin goes through scoped storage, so no `WRITE_EXTERNAL_STORAGE` prompt appears.
- **Camera scanning** (QR Studio → Scan) needs `android.permission.CAMERA` in the generated manifest
  and a runtime grant. The manifest ship-step is in the workflow; if the WebView refuses the camera on
  a given device, the Image tab still decodes screenshots and photos without any permission.

## Keeping yt-dlp alive (sites break it often)

- Android: use the library's built-in update (stable channel).
- Windows: `Program Files` is read-only, so on launch check the latest release and cache a newer
  `yt-dlp.exe` under `%LOCALAPPDATA%` and prefer it over the bundled one.
- Always keep the bundled copy as the offline fallback.

## Distribution notes

- Google Play restricts apps that download from YouTube; plan on GitHub releases / F-Droid for the APK.
- Include yt-dlp (Unlicense) and ffmpeg (LGPL) notices in the app's licenses screen.
