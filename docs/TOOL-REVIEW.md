# Tool-by-tool review log — v1.2

This review is split into ten parts, with two app surfaces checked per part. A part is marked complete only after its focused fixes and the current unit/build checks pass. Native-device checks are recorded separately; a green web build is not evidence of an Android/Windows runtime pass.

| Part | App surfaces | Review / fixes | Verification | Status |
| --- | --- | --- | --- | --- |
| 1 | **Media Clipper** (Tool 04, local-file tab); **Downloader** (Tool 04, link/yt-dlp tab) | Added a bounded FFprobe duration fallback when the WebView cannot inspect a media container (useful for MKV/AVI on phones), while keeping the input-copy fallback capped to 64 MB on phones and 192 MB on wider screens. Downloader now invalidates stale analysis when the URL is edited, prevents duplicate starts, cancels jobs when clearing the list, tolerates missing elapsed-time data, and recognizes playlist query links without converting a single selected video into a playlist request. | `npm test` — 94 passed; `npm run build` — passed; `git diff --check` — passed. No real yt-dlp server, Android device, or Windows installer is available in this workspace. | **Complete (code review + web checks)** |
| 2 | **ImagePlayer Studio** (Tool 05); **Background Remover** (Tool 06) | Kept export dimensions bounded by `MAX_EXPORT_EDGE = 8192` (with a 4 px fit/crop margin), verified that both stroke and reset snapshots honor `MAX_UNDO_STROKES = 8`, and confirmed the item ref stays synchronized across add/patch/remove. Also bounded reduced-motion/performance-lite animation loops, fixed an unhandled WebAudio resume rejection, made the hold-to-view-original toolbar button keyboard-operable, expanded undo shortcut exclusions to all editable controls, and tightened the video transport for narrow phones. | `npm test` — 94 passed; `npm run build` — passed; `git diff --check` and esbuild JSX syntax pass. `tests/bg-core.test.js` covers the 8192-edge sizing behavior. No Android/Windows device check. | **Complete (code review + web checks)** |
| 3 | **Frame Extractor** (Tool 07); **Audio Visualizer Video** (Tool 08) | Frame Extractor now avoids a continuous RAF loop while paused and supports keyboard frame stepping; capture-job concurrency still needs review. Visualizer now sanitizes persisted/imported looks, bounds stored/uploaded data, snapshots export inputs and locks every editing path during rendering, releases audio/renderer resources, and limits preview animation for reduced-motion users. | `npm test` — 96 passed; `npm run build` — passed; `git diff --check` — passed. No real-media/browser or native-device export test. | **In progress** — Frame Extractor concurrency review remains |
| 4 | Pending | — | — | Not started |
| 5 | Pending | — | — | Not started |
| 6 | Pending | — | — | Not started |
| 7 | Pending | — | — | Not started |
| 8 | Pending | — | — | Not started |
| 9 | Pending | — | — | Not started |
| 10 | Pending | — | — | Not started |

## Outstanding platform notes

- The Android APK does not bundle a yt-dlp runner in this repository. The link-downloader requires a network-reachable companion engine on Android; this was made explicit in its offline/setup screen. The Windows release uses bundled yt-dlp/ffmpeg sidecars. Android yt-dlp packaging/runtime verification remains a release blocker if the desired acceptance criterion is a self-contained Downloader on Android.
- The local clipper and downloader review above is code- and web-build-verified only. Browser codec differences, Android background/notification behavior, and Windows sidecar execution still need device/installer testing.
