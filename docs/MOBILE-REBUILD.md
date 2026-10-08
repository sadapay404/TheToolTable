# Mobile rebuild — 10 parts

A ground-up mobile pass driven by seven Android defects reported against v1.2.0.

**Decisions taken**

| Question | Answer |
|---|---|
| Material direction | **Material 3 Expressive** (Google's 2025 update) |
| Desktop / web | Mobile-only rewrite; desktop keeps the 3-D studio, inherits theme + bug fixes |
| Release | **Draft** release for private testing before anything is published |

---

## Status

| Part | Scope | Status |
|---|---|---|
| 1 | Material 3 Expressive foundation, safe-area shell, theme engine | **Complete** |
| 2 | Mobile shell rewrite (header, nav bar, search, back navigation) | **Complete** |
| 3 | Home grid redesign | Pending |
| 4 | Motion system | Pending |
| 5 | Tool chrome for all 20 tools | Pending |
| 6 | New animated mobile footer | Pending |
| 7 | Background transfers + notification progress | Pending |
| 8 | Android icon, signing, CI de-risking | Pending |
| 9 | Functional sweep + regression tests | Pending |
| 10 | Native builds + draft GitHub release | Pending |

---

## Part 1 — Material 3 Expressive foundation ✅

### Root causes found

- **Bug 1 (punch-hole header).** The shell trusted `env(safe-area-inset-top)`. Android's
  WebView reports `0` for every edge even when the window draws edge-to-edge, so the header
  row sat *inside* the status bar band. Worse, `.mobile-settings-trigger { display: none }`
  was declared **after** the `max-width: 639.98px` rule that shows it, so on source order the
  appearance control was permanently hidden on phones — the old build hid the controls
  instead of moving them out of the cutout.
- **Material looked like Creamy White.** `materialLight` carried the Material **2** palette
  (`#FFFBFE` / `#F4EFF7`) rather than M3's tonal surface containers, so the "Material" and
  "Creamy White" themes were visually near-identical.

### Changes

- **`src/lib/safe-area.js`** (new). Reads real `env()` insets from a probe element; when
  Android reports zeros it derives a per-device fallback from the screen geometry, moves the
  cutout to a **side** edge in landscape, and republishes `--safe-*` / `--ttt-vh`. Pure
  `computeInsets()` is unit-tested.
- **`src/themes.js`**. Rewritten around a real M3 scheme: `surface-container-lowest … -highest`,
  outline variants, inverse roles, error container, `--surface-tint`. Primary is a saturated
  violet `#5B4BD6`; Material Dark is a proper M3 dark scheme. The registry now exposes
  **resolved** vars so pickers reading `THEMES[id].vars` directly always get a colour.
  Added the `auto` preference (follow OS light/dark) with a live `matchMedia` watcher.
- **`src/styles.css`**. M3 token layer: shape scale, motion tokens (emphasized /
  emphasized-decelerate / emphasized-accelerate easings, 12 durations), state-layer opacities
  (hover 8 / focus 12 / pressed 10 / dragged 16), Expressive elevation, and primitives
  (`.md3-card`, `.md3-list-item`, `.md3-chip`, `.md3-fab`, `.md3-segmented`, `.md3-icon-button`,
  ripple keyframes). The header became a two-layer element: full-bleed surface, content row
  padded below the status bar and inside any landscape cutout.
- **`src/main.jsx`**. Boots safe-area measurement before first paint, adds the `native-shell`
  class, and drives the M3 header divider from scroll position.

### Verification

- `npm test` — **122/122 passing** (was 107; +15 new in `tests/material-foundation.test.js`).
- `npm run build` — passing.
- Headless Chromium at 360 / 390 / 844 / 1280 px with an Android user agent and
  `__TAURI_INTERNALS__` injected: brand renders at `top: 32px` and every header control at
  `27px`, i.e. clear of the measured 24 px status-bar band. Landscape correctly drops the top
  band and reserves the side edge instead. No horizontal overflow at any width, no console errors.
- Desktop still reports `--safe-top: 0px`, so no wasted chrome on a normal browser.

### Known follow-ups

- Tool icons are still **system emoji**; they render as tofu on devices without an emoji font.
  Part 3 replaces them with inline SVG.
- The mobile appearance sheet truncates "Follow system" — Part 2 rebuilds that sheet.
---

## Part 2 — Mobile shell rewrite ✅

### Root causes found

- **Bug 6 (back closed the app).** `navigateBack` was recreated on every render but the
  `onBackButtonPress` effect ran once with `[]` deps, so the native listener called the
  **first render's** closure. Registration was also gated on `/android/i.test(UA)` *and*
  `__TAURI_INTERNALS__`, so any mismatch fell through to Android's default behaviour —
  finishing the Activity. There was no second line of defence at all.
- **Bug 7 (black screen with only the header).** `AnimatePresence mode="sync"` keeps the
  outgoing screen mounted through its exit animation. When that subtree threw during
  cleanup, React tore down `<main>` and left the sticky header on its own.
- **Bonus bug.** `html.android-native :focus-visible` applied a 3px ring at 3px offset to
  **text inputs**, which drew a stray floating box over the UI.
- The old `MobileBottomNav` was three static buttons with no active indicator and no
  way to reflect which screen you were on.

### Changes

- **`src/lib/navigation.js`** — added `resolveBack()` (pure) and `installHistorySentinel()`.
  One back contract, shared by the system button, the gesture bar, Escape, the header
  control and the browser history: **close overlay → unwind one tool → return to the
  collection → only then leave the app**.
- **`src/lib/motion.js`** (new) — Material 3 motion tokens: emphasized /
  emphasized-decelerate / emphasized-accelerate easings, 12 duration steps, spring
  presets, `riseIn` / `scaleIn` / `pressable` / `sharedAxis` variants and a reduced-motion
  aware `useTransition`.
- **`src/components/MobileNavBar.jsx`** (new) — real M3 navigation bar: 64×32dp indicator
  that *slides* between destinations via a shared `layoutId`, phone-only.
- **`src/components/MobileSearch.jsx`** (new) — full-screen M3 search view with a
  collapsing large title, 54dp filled search field and staggered results. Desktop keeps
  the floating command palette.
- **`src/App.jsx`** — single `overlay` state, `navigateBack` behind a ref, two independent
  back listeners (native + `popstate` sentinel), `AnimatePresence mode="wait"` with shared-axis
  transitions, a `ShellBoundary` around the whole app, and a full-screen crash card.
- **`src/styles.css`** — M3 nav bar + search view + crash screen; focus ring rescoped to
  controls; the legacy `.mobile-bottom-nav` rules are gone.

### Verification

- `npm test` — **131/131 passing** (+9 back-navigation tests covering the overlay
  precedence, the "never exit from inside a tool" guarantee, the defensive branch and the
  sentinel re-arming).
- `npm run build` — passing.
- Headless Chromium with an Android UA, driving the real DOM:
  - Back **inside** a tool: `metadata → home`, `main` still mounted, header still visible,
    body text intact — the exact failure from bug 7 no longer occurs.
  - Back **at the root**: `main` and the nav bar survive instead of a blank document.
  - Back through `QR Studio → collection`: correct.
  - Search opens, filters ("pdf" → 13 hits, PDF Studio first), opens a tool and closes.
  - Nav bar sits flush to the viewport bottom (844/844), no horizontal overflow, desktop
    correctly hides it, zero console errors throughout.
