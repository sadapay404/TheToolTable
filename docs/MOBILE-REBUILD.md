# Mobile rebuild — 10 parts

A ground-up mobile pass driven by seven Android defects reported against v1.2.0.

**Decisions taken**

| Question | Answer |
|---|---|
| Material direction | **Material 3 Expressive** (Google's 2025 update) |
| Desktop / web | Mobile-only rewrite; desktop keeps the 3-D studio, inherits theme + bug fixes |
| Part 4 scope | Motion work covers **both** Android and Windows. Motion is only ever added — nothing existing is removed, hidden, gated or weakened |
| Release | **Draft** release for private testing before anything is published |

---

## Status

| Part | Scope | Status |
|---|---|---|
| 1 | Material 3 Expressive foundation, safe-area shell, theme engine | **Complete** |
| 2 | Mobile shell rewrite (header, nav bar, search, back navigation) | **Complete** |
| 3 | Home grid redesign | **Complete** |
| 4 | Motion system (Android **and** Windows) | **Complete** |
| 5 | Tool chrome for all 20 tools | **Complete** |
| 6 | New animated mobile footer | **Complete** |
| 7 | Background transfers + notification progress | **Complete** |
| 8 | Android icon, signing, CI de-risking | **Complete** |
| 9 | Functional sweep + regression tests | **Complete** |
| 10 | Native builds + GitHub release | **Blocked — v1.2.2 Android recovery candidate pending.** The former v1.2.1 first-frame/emulator result was invalidated by a real-device native download-plugin abort; all public Android releases were withdrawn. |

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

---

## Part 3 — Collection redesign + SVG icon system ✅

### Why the emoji had to go

Every tool mark in the app was a **system emoji**. That is not an icon system:

- emoji are rasterised by the *system* font, so they render as empty tofu boxes on any
  Android skin without a colour-emoji font — confirmed here in headless Chromium;
- they cannot inherit `currentColor`, so they ignore the Material state layers entirely;
- they do not scale crisply, and they cannot be animated or tinted per state.

### Changes

- **`src/components/ToolIcon.jsx** (new) — 25 glyphs on a 24×24 grid, each drawn in
  `currentColor`: one bespoke mark per tool plus the shell glyphs (grid, search,
  sliders, sparkle, clock). `hasIcon()` gives a safe fallback rather than an empty box.
- **`src/toolsRegistry.jsx`** — every `icon` switched from an emoji to a glyph id that
  matches its tool id, so the registry stays serialisable and greppable.
- **`src/components/ToolCard.jsx`** (new) — one card, two presentations:
  - *phone*: a Material 3 list item — 52dp tonal icon container (cycling
    primary/secondary/tertiary so the list is not a flat grey stack), title, numbered
    uppercase supporting text, trailing chevron, elevation 1 → 2 on press;
  - *desktop*: the original 3-D tilt, pointer lighting and layered parallax, with the
    SVG mark swapped in.
- **`src/lib/ripple.js`** (new) — a Material ink ripple that fires synchronously on
  pointer-down and suppresses itself under `prefers-reduced-motion`.
- **`src/components/ToolActions.jsx`** (new) — long-press bottom sheet with the tool's
  mark, its description, **Open tool** and **Copy name**. A held gesture is cancelled so
  it never also fires the click that launches the tool.
- **`src/App.jsx`** — collection renders `ToolCard`, mounts the sheet, and the tool-screen
  header now shows the tool's mark.
- **`src/components/CommandPalette.jsx` / `MobileSearch.jsx`** — SVG marks in results.
- **`src/styles.css`** — tile, sheet and header-mark styles; action rows forced to
  full width (buttons do not stretch inside a grid item by default, so the tonal fill
  was hugging the label).

### Verification

- `npm test` — **137/137 passing** (+6 icon-system tests that assert all 20 tools resolve
  to a glyph, that **no emoji remain anywhere in the registry**, and that the shared
  shell glyphs exist).
- `npm run build` — passing.
- Headless Chromium: 20 tiles / 20 SVG marks / **0 tofu boxes**; ripple element created on
  tap; long-press opens the sheet with the right tool and does **not** open it; "Documents"
  filter returns exactly the 5 expected tools; desktop shows 20 SVG marks inside the 3-D
  cards and 0 phone tiles; dark theme clean; no console errors.


---

## Part 4 — Motion system for Android and Windows ✅

The brief for this part was *"as many animations as possible"* — then widened to cover
Windows as well as Android, with one hard rule: **never redact an existing animation**.
Every change below is additive; nothing from Parts 1–3 was removed, shortened or hidden.

### Root causes of the sparse motion

| Symptom | Cause |
|---|---|
| Only two curves in the whole app | Motion tokens were duplicated as inline literals in each component, so nothing was shareable or consistent |
| Animation stopped on mid-range machines | The `lite` profile switched ambient motion **off** rather than thinning it — a still background reads as a broken one |
| Card depth was the only desktop motion | The 3-D tilt was pointer-tracked but nothing else responded, so the grid felt inert |
| Spinners snapped | Loaders used a bare `0.8s rotate`, fast enough to read as a glitch rather than a spinner |
| Counters appeared pre-computed | Numbers were rendered as strings, so there was nothing to animate |

### Changes

**`src/lib/motion.js` — one motion system**

- Material 3 easing set (`standard`, `emphasized`, `overshoot`, …) and the full 16-step
  duration scale, plus a `CSS_MS` map so CSS and JS cannot drift apart.
- `SPRING` presets (`gentle`, `snappy`, `expressive`, `layout`, `bouncy`, `heavy`) for
  anything a finger or cursor is driving.
- Variants: `fadeIn`, `riseIn`, `riseInX`, `maskLine`, `scaleIn`, `pressable`,
  `containerTransform`, `sharedAxis`, `drawRule`, `shineSweep`.
- Endless loops: `floatingLoop`, `spinLoop`, `breatheLoop` — all `repeat: Infinity`, all
  slow enough not to read as jitter.
- Hooks: `useMotionSafe`, `useTransition`, `useAmbient`, `useReveal`, `useParallax`,
  `useMagnetic`, `useCountUp`, `useFlashKey`, `usePointerDrift`, `useStaggeredDelay`.
- Backwards compatibility: the legacy `shouldAnimate()` export and the `CARD_SPRING`
  alias are preserved so no call site had to be edited.
- **Lite thins, never stops:** `useAmbient` now mounts 3 blobs on `lite`, 4 on `balanced`,
  5 on `full` (it was 2/3/5 and the lowest tier lost motion entirely).

**`src/components/AmbientField.jsx` — new**

- A fixed, `pointer-events: none`, transform-only background: three drifting radial
  blobs, a slowly scrolling grid, and two counter-rotating dashed rings.
- Pointer drift on desktop: the whole wash eases toward the cursor.
- `AmbientHalo` and `AmbientSpinner` replace the raw 0.8s rotate with a two-layer
  counter-rotating spinner.

**`src/components/Reveal.jsx` — new**

- `RevealLine` (masked typographic reveal), `RevealBlock`, `RevealRule` (a rule that
  draws itself in) and `MaskedGlyph`.

**`src/App.jsx`**

- Hero on **both** platforms: masked line reveals, an animated gradient headline, a
  pulsing halo behind the mark, a hero rule that draws itself in, and a counter that
  rolls to `20` instead of printing it.
- Depth parallax: orbit, brand row and halo travel at different rates as the hero
  leaves, on phones as well as desktop.
- The scroll progress bar is spring-smoothed, so a fast flick no longer steps.
- The tool loader uses the new spinner.

**`src/components/ToolCard.jsx` — Windows gains the most**

- Magnetic hover: the card eases toward the cursor on a spring (touch pointers are
  ignored, so a phone tap never drags a card).
- Scroll-linked parallax per card, measured from the card's own document position, so
  the grid reads as a stack instead of a flat wall.
- Two shine sweeps: a slow ambient pass that never stops and a bright one that fires on
  hover/focus.
- The icon springs up and rotates, the number scales, the arrow slides, all on hover.
- The staggered grid reveal was widened from `i % 4` to `i % 8` at a larger step.
- **The existing tilt, sheen, hover lift and tap states are untouched.**

**`src/components/CommandPalette.jsx`** — the panel is nudged toward the cursor, a scan
line sweeps the header, the selected row gets a shared-layout pill, and the selected
icon rotates.

**`src/components/Footer.jsx`** — the desktop footer gains a three-blob drifting aura, a
scanline texture, hover lift on every wordmark glyph, a parallaxed lockup and a
travelling highlight on "Back to top".

### Verification

- `npm test` — **156/156 passing** (+19 motion tests: token completeness, duration
  monotonicity, spring distinctness, a guard that reveal variants only ever animate
  compositor-friendly channels, a guard that every Part 4 keyframe is
  transform/opacity/background-position only, and an explicit **never-redact** test that
  asserts the Parts 1–3 animation — orbit rings, scroll progress, shared-axis
  transitions, card tilt, sheen, ripple, nav pill, footer ticker — is still in the source).
- `npm run build` — passing.
- Headless Chromium (`browsertest/verify4.mjs`, **46/46 checks**):
  - *Phone (390×844, Android UA)* — ambient layer mounted with ≥3 blobs all CSS-drifting
    on 26–37s cycles, grid layer present, orbit ring measurably turning, 3+ masked reveal
    lines that settle at rest, hero counter reads `20`, gradient headline animating and
    clipped to its glyphs, no horizontal overflow, all 20 tiles revealed after scroll,
    zero console errors.
  - *Phone with `prefers-reduced-motion: reduce`* — ambient layer not mounted at all,
    no blob animation, counter shows its final value immediately, hero copy and all 20
    tiles still render, zero console errors.
  - *Desktop (1280×900)* — 20 cards / 0 phone tiles, 40 shine layers, footer aura and 9
    hoverable glyphs, ambient wash drifts toward the pointer, a hovered card measurably
    magnetises with its shine at opacity 1 and its icon at scale >1.05, cards sit at
    different parallax depths after scroll, footer lockup parallax offset is non-zero,
    command palette opens with rows, pill and scanning scan line, zero console errors.


---

## Part 5 — Tool chrome for all 20 tools ✅

Twenty tools, twenty different UIs. Each one had its own idea of a header, its own
drop target, its own buttons and its own empty state, so opening a different tool
felt like opening a different app.

The fix was not twenty rewrites. It was **one kit, driven by the registry** — so every
tool gets the same introduction without a single tool-specific line of copy.

### What was wrong

| Symptom | Cause |
|---|---|
| Every tool felt like a different app | Each tool rendered its own header, drop zone and action row |
| The tool name was said twice | The screen header showed icon + eyebrow + title, and the tool then repeated itself |
| Drop targets were inconsistent | Nine tools used one component; the rest hand-rolled their own |
| Dashed frames stretched | The outline was an SVG `rect` with `preserveAspectRatio="none"`, so the dashes stretched with the box |
| Shell glyphs rendered blank | New glyphs were authored as open polylines in a file that paints everything with `fill` |
| Springs were copy-pasted | `SPRING = { stiffness: 300, damping: 25 }` was re-declared in three shared modules |

### Changes

**`src/components/ToolChrome.jsx` — the kit**

- `ToolShell` — the frame a tool renders into. Owns the vertical rhythm and the
  clearance the phone nav bar needs, so no tool has to remember either.
- `ToolIntro` — the band every tool opens with, built **entirely from the registry
  entry**: tonal icon container, masked title reveal, a rule that draws itself, the
  tool's description, and its tag chips. All twenty tools get an identical
  introduction from one component.
- `ToolSection`, `ActionBar`, `ToolButton`, `EmptyState`, `TabsRail`, `ProgressRail`,
  `FactChip`, `SplitView` — the remaining shared furniture.
- `ToolButton` is the Material filled/tonal/outlined/text button with an ink ripple,
  a press spring and a real busy spinner instead of a rotated icon.

**`src/App.jsx`**

- The tool screen header is now a breadcrumb (`The table / Tool 07`) plus the back
  button and the number badge. Everything else moved into the intro band, so the name
  is stated exactly once.
- `<ToolShell><ToolIntro tool={active} /><ActiveComp /></ToolShell>` wraps the active
  tool — one edit, all twenty tools.

**`src/components/ui.jsx` — the drop target**

- Rewritten as a Material drop zone: animated dashed frame, a floating icon mark that
  lifts when a drag arrives, a `Browse files` call to action, a "release to add" state
  and a confirmation that counts what landed.
- Everything the old one could do it still does: file input, click-to-browse, drag and
  drop, multi-file, plus new keyboard operation and a polite live region.
- The stretched SVG outline is gone; the frame is a real `2px dashed` border, so the
  dashes stay uniform at any width.

**`src/components/ToolIcon.jsx`**

- Four shell glyphs added — `upload`, `file`, `image`, `check` — authored as filled
  silhouettes, because every glyph in this file is painted with `fill="currentColor"`.

**Shared tool parts**

- `exchange/parts.jsx`, `decision/parts.jsx` and `studio/controls.jsx` now import their
  spring from the one motion module. The original `{ stiffness: 300, damping: 25 }` is
  preserved exactly as `SPRING.legacy`, so nothing moves differently than it did.
- `Panel` gains Material shape tokens and a hover lift.
- `Seg` is now a Material segmented control with a shared-layout sliding indicator.
- `PrimaryBtn` is a Material filled button with an ink ripple and a real spinner.
- `Switch` is now 52×32dp with a thumb that grows from 16 to 24 and carries a check.

### Verification

- `npm test` — **172/172 passing** (+16 chrome tests: the kit's surface, the registry
  driving the intro, the header never repeating the intro, the drop target keeping every
  capability it had, a uniform dashed frame, the shell glyphs being closed filled paths,
  every rendered class having a rule, the shell clearing the nav bar, reduced motion
  being honoured, and a **never-redact** guard over Parts 1–4).
- `npm run build` — passing.
- Headless Chromium (`browsertest/verify5.mjs`, **18/18 checks**): **all 20 tools opened
  on a 390×844 Android phone and again at 1280×900**. Every tool renders the intro band
  with a title, rule and description, inside the shell, with no horizontal overflow, no
  duplicated title, and **zero application console errors**. The only network failures
  are the currency and crypto rate APIs the sandbox cannot reach — the tool degrades
  gracefully, exactly as its "local-first, network features are opt-in" promise says.


---

## Part 6 — The new phone footer ✅

Reported as *"the mobile footer looks wrong"*. It was, and the reason was
structural: the old `MobileFooter` was the desktop footer, shrunk. It was a
`<div>` of scaled-down desktop rows with one marquee on it. Nothing about it was
built for a thumb.

The brief was a **new mobile-specific footer, always animated, same concept** —
so the concept (brand, wordmark, credits, ticker, back to top) is intact and the
surface around it is new.

### What was wrong

| Symptom | Cause |
|---|---|
| It looked like a shrunken desktop | One component serving two very different widths |
| Nothing moved except one ticker | The marquee was the only animation on the surface |
| Credits were unreadable at 360px | A three-column grid with 8.5px type |
| "Back to top" was a text link | No feedback, no connection to where you are |
| The collection was invisible down here | Nothing represented the twenty tools |

### Changes

**`src/components/MobileFooter.jsx` — a new component, phone-only**

- **The wordmark is the centrepiece.** "the TOOL TABLE" stacked, every glyph rising
  out of its own mask, lit by a light bar that sweeps across the lockup on a 6.5s
  loop, with a rotating accent square that pulses a halo outward.
- **Two tickers running in opposite directions**, edge-faded at both ends, one
  carrying the promises (`LOCAL-FIRST · NO ACCOUNT · NO UPLOAD · NO COMPRESSION`)
  and one carrying the facts (`20 TOOLS · AND GROWING · ONE QUIET TABLE`).
- **Credits became real list rows.** Index chips pulse on a staggered loop, each row
  is a button with an ink ripple, `aria-expanded` and `aria-controls`, and pressing
  one unfolds a line of copy while the chevron rotates. A highlight sweeps across the
  whole list on a loop.
- **A constellation of all twenty tools** — every SVG glyph and its number, popping
  in on a spring stagger and then floating gently forever. The collection, at a
  glance, right where your thumb already is.
- **Back to top became a round button whose ring fills as you scroll**, and which
  breathes while you are already at the top.
- **An aurora backdrop**: three drifting blobs, a rotating conic sweep and a scanline
  texture.

**Kept deliberately:** the brand, the wordmark, all three credits, the ticker and the
back-to-top control. Same concept, new surface.

**`src/styles.css`** — the old `.mobile-footer-*` block (22 dead rules) was deleted
rather than left to rot, a 360px breakpoint was added for the new bands, and reduced
motion is handled in one rule covering every loop.

**A real bug fixed in passing.** The masked wordmark glyphs would never have appeared.
`whileInView` was on the glyph, but the glyph's own `overflow: hidden` mask clips it
away — and `IntersectionObserver` accounts for ancestor clipping, so a fully clipped
element has an intersection ratio of **zero** and the observer never fires. The
observer now sits on the mask, which drives the glyph through variants. The same
latent bug existed in `Reveal.jsx`'s `MaskedGlyph` from Part 4 and was fixed there too.

### Verification

- `npm test` — **188/188 passing** (+16 footer tests: the old markup is gone, the
  concept survived, every loop repeats forever and is slow enough not to glitch, the
  marquee is seamless, the ticker runs both ways, **the observer sits on the mask and
  not the clipped glyph**, credit rows are accessible buttons, the ring tracks scroll,
  reduced motion is handled in one stylesheet rule, and the desktop footer work from
  Part 4 is untouched).
- `npm run build` — passing.
- Headless Chromium (`browsertest/verify6.mjs`, **41/41 checks**):
  - The wordmark renders all nine glyphs, spells `TOOLTABLE`, is masked, has real
    width and settles at rest; the light bar keeps sweeping.
  - Two tickers, both moving, **in opposite directions**.
  - Three credit rows indexed 01–03, collapsed to start; pressing one sets
    `aria-expanded`, reveals its note and rotates the chevron.
  - The constellation shows all twenty tools; the back-to-top ring is filled while
    scrolled and clicking it returns to `scrollY ≈ 0`.
  - **Reduced motion**: the wordmark is readable, the light bar's animation is `none`,
    the tickers are held still, and the credits, constellation and base bar all still
    render.
  - **360px**: no horizontal overflow, the wordmark fits its panel, every band stays
    inside the viewport.
  - **Desktop**: the phone footer is not rendered, the wide lockup, aura and nine
    hoverable glyphs are all still there.
  - Zero console errors throughout.

---

## Part 7 — Background transfers with live progress ✅

**The reported defect:** the AI Background Remover model download stopped dead
when you switched apps. Half a model on disk, a spinner that never resolved.

**Why it stopped.** `downloadToAppCache()` ran entirely inside the WebView. The
upload path had owned an Android foreground service since Part 0; the download
path never did. No foreground service meant no protection from `onStop`, and no
notification meant nothing at all on screen while the transfer ran. Switching apps
suspended the WebView and the transfer died with it.

**`src/lib/transfers.js` — one registry for every transfer in the app.** A
module-level map plus a snapshot, read through `useSyncExternalStore`. It is
deliberately free of any Tauri import at module scope, so it works in a browser
(where it simply stays empty), in the Windows shell and on Android. It owns:

- `beginTransfer` / `updateTransfer` / `finishTransfer` / `failTransfer` /
  `cancelTransfer`, with progress clamped to `0…1` and queued transfers promoted
  to running the moment real bytes arrive;
- **the notification throttle** — one 900 ms rule for the whole app, so a 300 KB/s
  model cannot flood the shade. A notification posted per chunk is exactly what
  makes a transfer look like it is stuttering;
- **terminal retirement** — finished work stays on screen for eight seconds, then
  drops itself, so the sheet always clears itself without the user tidying up;
- `syncTransfersFromNative()`, which folds the native download store back in after
  a resume and, critically, **settles anything the registry still believes is
  running but the OS no longer knows about** — otherwise a transfer finished while
  the app was away leaves a spinner that spins forever.

**`src/lib/backgroundTransfers.js` — the fix itself.**

- `downloadToAppCache()` now takes the foreground service, posts a start
  notification, and **releases the service in `finally`** so a failed download
  cannot strand Android's notification and battery.
- `runNativeDownload()` mirrors every native progress event into the registry and
  the shade, and settles the registry row on **every** exit: the two cache-hit
  short circuits, the real completion, the failure, and — new in review — a
  **second caller joining an in-flight download for the same path**, which now
  waits for the owner and settles its own row instead of returning a promise that
  leaves its bar frozen mid-air.
- The notification id and the **exact native path** are recorded on the transfer.
  Restoring notifications reuses the id the transfer already owns (a fresh id on
  every resume orphans the previous one, so the shade accumulates stale copies of
  the same progress bar), and cancelling sends `plugin:download|cancel` with the
  path the worker was actually registered with — not a filename reconstructed from
  the title, which misses the timestamped retries and resumed records.
- `uploadFileInBackground()` and the legacy `createTransferNotifier()` were routed
  through the same registry, so uploads, Beam and the Downloader now show up in the
  same place as model downloads.
- `refreshBackgroundTransfers()` and `restoreProgressNotifications()` are the two
  resume hooks.

**`src/components/TransferCentre.jsx` — the in-app half.** One sheet and one
floating button, mounted once by the shell so every tool gets them for free. It is
a sheet, not a toast: a model download can take a while and a toast that has
already gone is useless. Rows carry a determinate `role="progressbar"`, live byte
counts, speed and ETA, per-row cancel, per-row dismiss and a clear-finished
action. It opens itself the moment work appears, however many transfers start at
once, then gets out of the way.

**Motion.** Rows spring in on a stagger and spring out sideways; the icon bobs
while running; the fill is a spring, not a linear tween; the bar shimmers; the FAB
has a counter and a ring that turns. `prefers-reduced-motion` holds every one of
them still while keeping the sheet readable — nothing was removed, hidden or
shortened.

**`src/App.jsx`** — resyncs native transfers and re-posts notifications on
`focus` and `visibilitychange`, which is the Android "come back to the app and the
spinner is still there" case.

**`src/lib/bg/engine.js`** — the model notification now names the tier
("AI Background Remover · model") and says *Keeps running if you leave the app*.

### Verification

- `npm test` — **223/223 passing** (+35 transfer tests: lifecycle, throttling,
  retirement, native rehydration, the download-service regression, uploads, UI
  accessibility, CSS coverage, Parts 1–6 preservation, and the four defects found
  in review — the joined download settling, the retained notification id, the exact
  cancel path, and per-row dismiss).
- `npm run build` — passing.
- **The notification payload is checked against the installed plugin.** A test
  reads `node_modules/@tauri-apps/plugin-notification`'s own typings and asserts
  every field we send exists in `Options`. This caught a real problem: `progress`
  is **not** a field in 2.5.1, so the determinate shade bar was never going to
  appear, and an unknown key risks the Rust deserializer dropping the whole
  notification. Progress now goes in the text (`167.8 MB of 167.8 MB · 100%`),
  which is supported.
- Headless Chromium (`browsertest/verify7.mjs`, **59/59 checks**) on phone
  (390×844, Android UA) and desktop (1280×900):
  - Nothing is shown when nothing is running; the sheet opens itself the moment
    two transfers start at once.
  - Two rows, a real `progressbar` each, correct percentages, live byte counts,
    correct upload/download glyphs, a cancel button per running row, the bar
    shimmering.
  - Progress updates live; a completed row shows ✓ and a failed row shows the
    server's own reason; a **finished row stops quoting a speed**; the FAB retires
    when nothing runs; clear-finished empties the sheet.
  - A download surfaces over an open tool, named.
  - **Reduced motion**: the sheet still opens, progress is still readable, the
    shimmer never moves.
  - No horizontal overflow; the sheet stays inside the viewport on phone.
  - Zero console errors.
- **A real bug the browser found.** The sheet was centred with
  `transform: translateX(-50%)`, and framer-motion owns the transform on that
  element — its enter animation silently replaced the CSS translate and parked the
  sheet 171px off the right edge of a 390px phone. It is now centred with auto
  margins.
- `scripts/ensure-android-transfer-permissions.mjs` injects
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC` and `POST_NOTIFICATIONS`
  into the generated manifest — none of which `tauri android init` adds, and
  without which Android 14 refuses the dataSync service and Android 13+ drops
  every progress notification. Verified idempotent against a manifest, and it now
  exits cleanly when the Android project has not been generated.

**Not verified here.** This sandbox has no Android SDK, no NDK, no JDK and no
cargo, so an APK could not be built and the notification could not be observed on
a real device. Everything native-side is verified against the plugins' shipped
typings and API surface instead. Part 10 is where a device build happens.

---

## Part 8 — The APK's own icon, honest signing, and CI de-risking ✅

**Bug #4: "the APK must use TheToolTable's own icon."** The brand launcher icon
existed the whole time, in `src-tauri/icons/android/`. **Nothing ever installed
it.** `tauri android init` generates the launcher resources from `icons/icon.png`,
which is the full-bleed wordmark, and no step copied the real set into the
generated project. That is what shipped.

Three things were wrong with the committed set as well:

- **The adaptive foreground was fully opaque** — a solid cream square. An
  adaptive foreground is meant to be transparent outside the mark; an opaque one
  paints over the launcher's own mask.
- **The wordmark ran to 93% of the canvas.** An adaptive icon is 108dp and
  launchers show the middle 72dp, so the ends of "TOOL" and "TABLE" were cut off
  on exactly the launchers this was meant to look good on.
- **There was no monochrome layer**, so Android 13+ themed icons had nothing to
  tint.

### The icon

**`scripts/generate-android-icons.mjs`** (design-time, needs ImageMagick) rebuilds
the set from the committed wordmark:

- the foreground is transparent, with the mark fitted to **58%** of the canvas.
  58 rather than 66 because the wordmark is 1.79:1 — the corner of its bounding
  box sits further from the centre than its ends, so fitting to the full safe zone
  still clips it on a circular launcher;
- the background is the **brand cream** `#EFEBDE`, sampled from the artwork,
  instead of a white hole;
- a monochrome layer, for themed icons;
- every file is written as 32-bit RGBA, so the set is one pixel format rather
  than five;
- it reads `icons/icon.png`, never a file it writes. The first version derived
  the mark from its own output, so a second run shrank the icon again.

**`scripts/install-android-launcher-icons.mjs`** is the part CI runs, and it uses
**nothing but Node built-ins** — `npm ci --ignore-scripts` means `sharp` and every
other native image library is unusable on the runner. It copies the set into
`src-tauri/gen/android/app/src/main/res/`, patches
`values/colors.xml` **in place** (shipping a second declaration of
`ic_launcher_background` is a duplicate-resource error that surfaces as an AAPT
link failure at the very end of the build), adds `android:roundIcon`, and then
**verifies the install** — a silently missing density is how an APK ships with a
blank launcher slot.

### Signing — the release risk nobody was seeing

The published candidate was uploaded as **`TheToolTable-fallback-signed.apk`**.
That name is the workflow's own word for *signed with a key generated during the
run*. **It cannot upgrade v1.1.1.** Android compares signing certificates, so
installing it over an existing copy is refused as a different app. Nothing in the
pipeline said so.

- The signing decision is now its **own step, before the build** — a missing
  keystore secret was previously discovered forty minutes and two hundred
  megabytes in, by whoever happened to be watching.
- The build **downloads the published v1.1.1 APK and compares certificate
  fingerprints**, then states a verdict in the job summary: ✅ matches (this build
  can upgrade an install), ⚠️ differs (it cannot), or ⚠️ unverifiable.
- Anything that cannot upgrade v1.1.1 never gets the plain `TheToolTable.apk`
  name, and the upload step **fails** rather than re-uploading a stale asset.
- The keystore is removed with `if: always()`.

### The rest of the pipeline

- **The workflow only ran on one branch.** `branches: ['arena/01a10743-thetooltable']`
  meant nothing built since had ever produced a build. Now `arena/**`, `main`,
  `master`.
- **The release tag was hardcoded** to `v1.2.0-build-9acfe2f` with notes claiming
  the app source was unchanged, while the upload used `--clobber`. Every build
  silently overwrote that one candidate, so the tag, the notes and the binaries
  all disagreed about what they were. The tag is now derived from the commit.
- **Job timeouts were too low to be useful.** A 45-minute Windows job was timing
  out *after* the build rather than before it; now 90, and 120 for Android, which
  does two full Rust builds and a 20-minute emulator boot.
- `concurrency` per ref, so two pushes cannot race to clobber the same tag.

### Verification

- `npm test` — **242/242 passing** (+19). The icon tests decode the PNGs with a
  small dependency-free reader (`zlib` plus the PNG filters) and assert what
  actually broke: every density and layer present, the foreground genuinely
  transparent in every corner, the artwork inside the 66% safe zone and centred,
  the background exactly the brand cream, the monochrome layer a single flat
  colour, the legacy icons actually rounded. **No image library is used** — CI
  installs with `--ignore-scripts`, so any test that imports one passes locally
  and fails on the runner.
- The installer was run against a fixture reproducing what `tauri android init`
  writes, including its conflicting white `ic_launcher_background`: it patches
  rather than shadows, is idempotent across three runs, and exits non-zero with a
  clear message when the Android project is absent.
- The signing step was executed with stubbed `apksigner`/`gh`/`keytool` across
  four cases — fallback key, release key matching v1.1.1, release key differing
  from v1.1.1, and v1.1.1 unreachable — and gave the right verdict and asset name
  in every one.
- The workflow parses as YAML, and every embedded bash script passes `bash -n`.

**Still needs you.** The release keystore secret is not configured on this
repository, and it is the one thing that cannot be fixed from here:

```
gh secret set ANDROID_KEYSTORE_BASE64   # base64 of the release keystore
gh secret set ANDROID_KEYSTORE_PASSWORD
```

Until that exists, every Android build is signed with a throwaway key and can only
ever be installed fresh. **Not verified here:** still no Android SDK, NDK, JDK or
cargo in this sandbox, so the icon set has been verified as files and as a
simulated install, but not as pixels inside a real APK. Part 10 covers that.

---

## Part 9 — Functional sweep across all twenty tools ✅

Seven parts of redesign can hide a tool that no longer works. This part opened
every tool in a real browser the way a user opens it, drove the ones that can be
driven, and locked the result in.

### What the sweep found

**One real stall: the Background Canvas Studio took two seconds to appear.**
`Stage.jsx` built its `WallRenderer` — a WebGL2 context plus a compiled fragment
program — synchronously inside the effect that mounts the tool. Shader
compilation is synchronous and blocking, and because the tool screen commits in
one render, **nothing at all appeared until the GPU finished**: not the canvas,
not the tool body, not even the shared intro card. Measured on a 390×844 Android
profile: 2054 ms to first paint on a warm visit, against 420–660 ms for every
other tool.

It is now started after the first paint, in a `requestIdleCallback` (with a
`setTimeout` fallback). The tool lands immediately and the stage fills in a frame
later — over a shimmer that is already moving, so nothing is ever a dead grey
box. Warm time to first paint went from **1110 ms to 494 ms**, in line with the
rest of the app, and the long frame moved off the critical path.

**Everything else held.** All twenty tools open, carry the shared intro, expose
real controls, lay out without overflowing at 390 px, keep something moving, and
produce zero console errors. Six were driven end to end:

- **Metadata Extractor** reads a real uploaded PNG — 4.53 KB, 29 metadata
  entries, `image/png`, with the scrub and report actions live.
- **QR Studio** redraws its vector modules when the encoded text changes.
- **Decision Hub** lands on heads *and* tails across eight flips, read from the
  result line rather than the coin's own face label, and only after waiting for
  each flip to finish — the button is disabled while the coin is in the air.
- **Text Lab** counts what you type; **Pakistan Money Kit** computes from typed
  numbers; **Icon Forge** draws all eight platform previews with real ink in them.

### What it fixed in the harness, which is the interesting part

Three of the four "failures" the sweep first reported were the sweep's fault, and
finding out why changed the sweep itself:

- A tool's screen appears immediately while its intro waits on a lazy chunk, so a
  click-and-sleep loop re-clicked a tool that was merely still loading and
  reported it as broken. `openTool` now clicks once and waits.
- Tools remember their last tab and options in `localStorage`, so a shared
  browser profile made each run test yesterday's state. Every section now starts
  from a cleared profile.
- `.display` is the app's display type, so `querySelector('.display')` returned
  the tool's own heading instead of the coin's result.

### The committed regression suite

**`browsertest/verify9.mjs`** — the sweep itself, with its fixtures, so it can be
run again: **204/204 checks**, phone and desktop, reduced motion included. It
starts from a clean profile, clicks once and waits, and only fails on something a
user would notice.

**`tests/functional-sweep.test.js`** — 20 checks that run in CI, with no browser:

- the registry still describes exactly twenty tools, numbered 1–20 with no gaps,
  no duplicate ids, names, icons or chunks;
- every lazy chunk points at a file that exists, every tool has a tag, a
  description and enough keywords to be found by search;
- no file in `src/tools/` is unreachable from the registry or from another tool;
- **the WebGL stage is not constructed on the mount path** — `start` is reachable
  only from the idle callback, the deferred renderer is still cleaned up, and the
  live render loop (`r.step` / `r.draw` / `perf.fps()`) is untouched;
- the stage still shows motion while the GPU warms up, and still holds it under
  `prefers-reduced-motion`;
- back navigation keeps one contract, `home` is handled before the app is allowed
  to exit, and the native back handler reads live state rather than the first
  render — bugs 6 and 7, guarded.

### Verification

- `npm test` — **262/262 passing** (+20).
- `npm run build` — passing.
- `browsertest/verify9.mjs` — **204/204**:
  - All twenty tools: opens, has the shared intro, has controls, is laid out,
    nothing overflows sideways, no crash screen, zero console errors, something
    is moving.
  - QR, Decision, Text Lab, Pakistan Money Kit, Metadata Extractor and Icon Forge
    driven with real input and real files.
  - **Bug 6**: back leaves a tool instead of closing the app, and lands on the
    collection.
  - **Bug 7**: leaving five different tools in turn never leaves a header with
    nothing under it, and never leaves a blank screen.
  - Re-opening a tool immediately after leaving it still works.
  - Reduced motion: the tool renders, the stage comes up, every control stays.
  - Desktop: the phone footer stays hidden, the shared chrome opens, no sideways
    overflow, the deferred stage still comes up.

---

## Part 10 — property audit, bug by bug

Parts 1–9 fixed what could be seen on screen. Part 10 went after what could
not: the arithmetic and the parsers, thrown hostile inputs and invariants rather
than expected values. Three test files, 88 new checks, all of which passed on
first run except where the app was genuinely wrong.

The rule for every check here: it must hold for *any* input. A test that asserts
"1 km is 1000 m" catches nothing; one that asserts "converting A→B and back
returns the original" catches every conversion bug that will ever be written.

### Bugs found and fixed

| # | Where | What was wrong | Why it mattered |
|---|---|---|---|
| 1 | `src/lib/frames.js` | A duration past ~1.4e14 seconds rendered the literal text `-Infinity` in the timecode, because `minutes * 60` overflowed and the subtraction went negative | Typing a large number into a frame time produced garbage on screen |
| 2 | `src/lib/transfers.js` | A byte count between 0 and 1 logged a negative unit index and printed `512.0 undefined` | The transfer centre showed the word "undefined" mid-transfer |
| 3 | `src/lib/invoice/calc.js` | A 100% discount on a large subtotal rounded a hair past the subtotal, leaving a taxable base of `-0.0002` and a negative tax line | An invoice could show negative tax at exactly 100% off |
| 4 | `src/lib/invoice/calc.js` | `totals().balance` ignored `paid` for receipts, so a fully-paid receipt reported the full amount outstanding | Wrong money on a document the user had already settled |
| 5 | `src/lib/utils.js` | `baseName`/`extName` threw on a non-string, turning a missing filename into a crash | Any caller without a name took the whole tool down |
| 6 | `src/lib/qr/state.js` | `normalizeQrState` read fields off a missing default in four sections, throwing on `null` | A corrupt save could stop the QR Studio from opening |
| 7 | `src/lib/decision.js` | The same unguarded read, plus `bottle` iterating a missing `names` array | A corrupt save could stop the Decision Hub from opening |

Bugs 1–5 are user-visible. Bugs 6–7 cannot be reached from the app today, because
both stores always pass their own defaults; they are hardened anyway, since the
next caller should not have to know that.

### What was checked and found correct

The interesting result is how much held up. Over 120,000 wall-clock conversions
across all 250 time zones, on every month-end of three years and every clock
change hour, **not one came back the wrong time** — including the zones that
shift by 45 minutes and the ones that skip a whole day. Every unit conversion in
every category round-trips exactly. The coin is fair to within 3% of even over
20,000 tosses. A loan always amortises to zero, at every rate, term and
down payment. The image scrubber strips EXIF, GPS and comments from real JPEG
and PNG files, keeps the pixels, is stable when run twice, and refuses 600
random byte strings without hanging on a single one.

Storage units deserve a note: 1 GB is 1000 MB and 1 GiB is 1024 MiB, because
that is what those words mean. The audit confirmed both, rather than assuming
one of them was a bug.

### Part 10b–10g — what the property audit found

Seven more batches, 122 checks, run against invariants rather than expected
values. The rule throughout: a test must hold for *any* input. "1 km is 1000 m"
catches nothing; "converting A→B and back returns the original" catches every
conversion bug that will ever be written.

#### Bugs fixed

| # | Where | What was wrong |
|---|---|---|
| 8 | `src/lib/frames.js` | A duration past ~1.4e14 s rendered the literal text `-Infinity`; `minutes * 60` overflowed and the subtraction went negative |
| 9 | `src/lib/transfers.js` | A byte count under 1 logged a negative unit index and printed `512.0 undefined` |
| 10 | `src/lib/invoice/calc.js` | A 100% discount on a large subtotal rounded a hair past it, leaving a taxable base of `-0.0002` and negative tax |
| 11 | `src/lib/invoice/calc.js` | `totals().balance` ignored `paid` for receipts, so a settled receipt reported the full amount outstanding |
| 12 | `src/lib/utils.js` | `baseName`/`extName` threw on a non-string |
| 13 | `src/lib/qr/state.js` | Four saved-state sections read fields off a missing default and threw |
| 14 | `src/lib/decision.js` | The same, plus `bottle` iterating a missing `names` array |
| 15 | `src/lib/qr/render.js` | **Seven QR templates could not scan** — see below |
| 16 | `src/lib/viz/analyzer.js` | A NaN clock or a zero-bin analyser painted the visualiser solid black until reload |

#### The seven QR templates

Contrast was measured between the module colour and its background, for every
gradient stop, the way a phone camera sees it. Seven templates sat below 3:1 and
thirteen below 4.5:1:

| Template | Was | Now |
|---|---|---|
| Ocean | 1.90:1 | 4.69:1 |
| Duotone | 2.01:1 | 4.58:1 |
| Honeycomb | 2.07:1 | 4.57:1 |
| Forest | 2.36:1 | 4.57:1 |
| Event pass | 2.43:1 | 4.51:1 |
| Instagram | 2.54:1 | 4.52:1 |
| Candy pop | 2.92:1 | 4.51:1 |

Hand-editing the palettes would have flattened exactly the colours that made
them worth picking. Instead `withDefaults` walks each module colour away from its
background until it clears 4.5:1, preserving hue and saturation. Ocean is still
a blue-teal on pale blue; it is simply dark enough to read. All 33 templates
now clear the threshold and the worst is exactly 4.50:1.

#### Accessibility

An AST-based scan — not a regex, which cannot tell `onClick={() => go()}` from a
tag boundary and "found" 92 unnamed controls that did not exist — found:

- **0 unnamed controls.** Every button, link and summary in the app can be named
  out loud. Parts 1–9 did this properly.
- **46 unlabelled fields** across 30 files, relying on a placeholder or a
  neighbouring `<span>` for their name. All 46 now carry a real `aria-label`, and
  the shared components that render many fields take a label so the fix holds
  for every future call site.
- The transfer cancel button was a 28px target on a phone. Now 32px.
- `index.html` did not declare `color-scheme`, so dark mode got light form
  controls and scrollbars.

#### What held up

The more interesting result is how much did not break. Over 120,000 wall-clock
conversions across all 250 time zones — every month-end of three years, every
clock-change hour — **not one came back the wrong time**, including zones that
shift by 45 minutes and zones that skip a day. Every unit conversion in every
category round-trips exactly. The coin is fair to within 3% of even over 20,000
tosses. A loan amortises to zero at every rate, term and down payment. The image
scrubber strips EXIF, GPS and comments from real JPEG and PNG files, keeps the
pixels, is stable when run twice, and refuses 600 random byte strings without
hanging on one. No two large files in the built bundle are byte-identical.

Storage units deserve a note: 1 GB is 1000 MB and 1 GiB is 1024 MiB, because
that is what those words mean. The audit confirmed both rather than assuming one
was a bug.

#### The artefact

Release assets cannot be downloaded from the build sandbox — the CDN is outside
the network allowlist, the same wall that blocks CI logs — so APK verification
moved into the job that builds it, where it also runs on every future build. A
signed APK is not automatically a working one: if the Tauri icon path ever stops
resolving, Gradle still produces a valid package that installs with the default
Android robot. That is a valid APK and a broken app. The step rejects it, plus a
corrupt archive, a missing dex, an undeclared permission and a signature that
does not verify, and reports size, icon densities, permissions, package
identity, ABIs and the signing certificate fingerprint into the job summary.

### Batch 10n — the verifier that rejected a good build

Part 10d added the step that checks an APK before it is banked. On the first real
build it rejected an APK that had already compiled, aligned, signed and passed the
emulator smoke test, and the draft release shipped with no Android file at all.
The step existed to stop exactly that outcome, and was instead causing it.

Four bugs, none of them visible by reading the step:

| # | Bug | Why it was fatal |
| --- | --- | --- |
| 1 | `aapt2` quotes its values: `application-icon-160:'res/mipmap-mdpi-v4/ic_launcher.png'` | every icon lookup missed, so the package was rejected for having no icons |
| 2 | `[ -z "$row" ] && continue` inside the icon loop | under `set -e` the AND-list's status *is* the loop body's status, so the first non-empty row aborted the step |
| 3 | foreground service matched by exact name | Android 14's typed `FOREGROUND_SERVICE_DATA_SYNC` is not `FOREGROUND_SERVICE` |
| 4 | every `aapt2` field read through a `pipefail` pipeline | one absent line — `native-code`, an SDK level, the certificate digest — killed a step that had already verified the package |

Bug 4 never got the chance to show itself in CI, because CI never got past bug 2.

The expectations are now derived from the artefact instead of guessed: the icons
to check are the ones `aapt2` actually names, and the summary renders a missing
field as `?` rather than aborting. Every refusal goes through one `fail()` helper
that both emits `::error file=native.yml` — so the reason is readable from the
API — and exits non-zero.

**The lesson is about method, not shell.** A check that has only ever been read
is an untested check. `tests/verify-apk-step.sh` pulls the step out of
`native.yml` (never a copy, which would rot), executes it against a real zip with
mock `aapt2`/`apksigner`, and asserts both the exit code and the *reason* for
eleven cases: one that must be accepted, ten that must be refused. It found all
three of bugs 1–3 and the one this batch introduced. It runs as part of the suite,
so the next person to edit the step finds out immediately.

It also caught a mistake made *while fixing the step*: an edit dropped the YAML
indentation of two lines, silently truncating the run block. The harness now
re-parses the workflow and refuses to run a truncated step.

### Batch 10o — the APK that crashed on every ARM phone

Part 10n shipped a verified APK. It installed and then died on launch on a real
phone, with Android's "The Tool Table keeps stopping". CI called the build green.

Laying the pipeline out side by side explains it:

| | what it did |
| --- | --- |
| built | `--target aarch64 --target armv7`, then a separate `--target x86_64` |
| shipped | whichever APK `find … -print -quit` listed first |
| tested | `TheToolTable-smoke.apk` — the **x86_64** one |
| banked | *before* the test ran, with `continue-on-error` so nothing could stop it |

Four separate defects, and the first one alone is enough:

1. **The binary under test was not the binary shipped.** Every ARM phone runs
   the aarch64 build; CI was driving the x86_64 build. Nothing had ever run the
   ARM artifact on ARM.
2. **The shipped APK was chosen by filesystem ordering.** Two targets put
   several APKs in one directory and `find -print -quit` returned whichever came
   first. That is not a decision anyone made, and it could pick the 32-bit-only
   package.
3. **`continue-on-error` on the smoke test, after the upload.** A crashing APK
   could not have been stopped even if the test had been testing the right file.
4. **The verifier reported ABIs and never gated on them.** It wrote the package's
   `native-code` line into the job summary for months and refused nothing on it,
   so a package with no usable ARM library passed cleanly.

The fix inverts the order. Build arm64 only, so there is exactly one candidate.
Gate the verifier on `arm64-v8a` in the manifest *and* at least one
`lib/arm64-v8a` library in the archive — a missing one is an
`UnsatisfiedLinkError` on launch, which is the textbook shape of a signed APK
that installs and dies. Hand the signed APK to a new `android-device` job on
`ubuntu-24.04-arm`, boot an **arm64-v8a** emulator there (an ARM image needs an
ARM host; on x86_64 it does not boot), install *that exact file*, drive it, and
only then upload. A failed device test publishes nothing and leaves the logcat in
the job summary.

The two tests that guarded the old behaviour asserted the bug — "bank before the
test" and "the smoke test reports instead of vetoing". They now assert the
opposite, which is the part worth keeping: the defect survived because the tests
described it as intended.

### Batch 10p - the app no longer dies before it draws a frame

A real phone (Moto, API 35) produced this on every launch, and nothing in the
repository could have shown it, because it happens before the app's own code runs:

```
WM-WrkMgrInitializer: Initializing WorkManager with default configuration.
FATAL EXCEPTION: main
Process: app.thetooltable.mubashir
java.lang.RuntimeException: Unable to get provider
  androidx.startup.InitializationProvider: Failed to create an instance of class
  androidx.work.impl.WorkDatabase.canonicalName
    at android.app.ActivityThread.handleBindApplication
```

AndroidX WorkManager is initialised by `androidx.startup` inside a ContentProvider
that `ActivityThread` runs before a single line of this app's JavaScript executes.
It builds a Room database to do it, and R8 had stripped the generated
`WorkDatabase_Impl` that Room instantiates by name. The exception escapes
`handleBindApplication` uncaught, so the process is killed: "The Tool Table keeps
stopping."

ABI, `panic = "abort"`, WebView/ANGLE and the frontend were all ruled out by the
`nativeloader` lines in the same logcat. The **initial** version of
`scripts/ensure-android-launch-survives.mjs` applied two necessary protections
after `tauri android init`:

1. R8 keep rules for the Room and WorkManager classes; and
2. `tools:node="remove"` detaching `WorkManagerInitializer` from
   `InitializationProvider`, preventing the background-download dependency from
   creating its Room database during `handleBindApplication`.

That removed the pre-first-frame failure but was not the complete deferred
initialization contract; the follow-up native plugin failure and its
`Configuration.Provider` correction are recorded in Batch 10u. The script
no-ops when the Android project has not been generated and is idempotent.

#### A verifier that could reject a perfect build

Chasing a flake in the new test surfaced a live defect in the shipped
verification step: it piped into `grep -q`.

`grep -q` exits the instant it matches, closing the pipe on a writer that is still
going. That writer dies of SIGPIPE, `set -o pipefail` promotes the 141 to a
failure status, and a flawless APK is refused for having no dex bytecode, no
manifest, or launcher icons it plainly contains. It is a race, so it survived
every existing test - the mocks hold five entries - and then rejected good builds
at random in CI, where a real APK has thousands of entries. Measured: 17 spurious
rejections in 20 runs against a 300-entry archive.

Rewriting the producer does not help. Moving the pipe from `unzip` to `printf`
simply finds a new victim, which is exactly what happened here and why the first
attempt at this fix appeared to work. Nothing in the step may pipe into `grep -q`
now: the entry list is read once and every match is a herestring, so grep reads a
temporary file and there is no writer left to kill. `tests/verify-apk-step.sh`
repeats a 1,205-entry package 30 times to keep this from returning; the old code
fails that case 30 times out of 30.

#### The device job could never have run

With the crash fixed, the `android-device` job was the thing standing between a
build and a banked APK, and it turned out it had never once been given its input.
Two mismatches, neither visible from the workflow alone, and the first one hiding
the second:

- The `android` job wrote the candidate release as `candidate-android-${GITHUB_SHA:0:7}`
  while `android-device` looked up `candidate-android-${{ github.sha }}` - the full
  forty characters. The reader went for a release that was never created.
- The upload renamed its asset with `android-device-input.apk#candidate.apk`. In
  `gh release upload` that form sets a *display label*, not the asset name, so the
  file arrived under its own name and `--pattern 'candidate.apk'` matched nothing.

Both sides now use the full SHA, because an expression can reproduce it without a
truncation for the two to drift apart over, and the asset keeps its real name. A
test reads both jobs and asserts they build the same tag and the same filename,
and fails if either is reintroduced.

The cleanup step also claimed success unconditionally behind `|| true`, so a
candidate release that survived deletion was still reported as removed. It now
reports what actually happened and warns when it leaves a draft behind.

Four orphaned draft candidate releases were deleted from the repository.

#### A gate that could never open

With the handoff repaired, `android-device` reached its emulator step and failed
in 28 seconds - far too fast to be a boot. The cause is not fixable:

> Nested virtualization is a Linux x86-64 feature on cloud runners, and the
> `nested-virtualization.enabled=true` label is silently ignored on ARM64,
> Windows, and macOS. Standard Linux arm64 exposes no `/dev/kvm`.

GitHub's `ubuntu-24.04-arm` runners have no `/dev/kvm`, so an `arm64-v8a` system
image dies the moment it is started. The job had never been able to pass, and
every APK was correctly refused by it - so nothing was ever banked.

Rather than delete the gate or let it pass politely, the APK now carries an
x86_64 library alongside arm64-v8a:

- One universal package, so the binary CI installs is the binary the release
  publishes. That property - which Part 10o spent its whole budget establishing -
  survives; it is what makes a device failure worth anything.
- The device job moves to `ubuntu-latest` with the `/dev/kvm` udev rule, and
  boots an x86_64 emulator that actually has acceleration.
- A phone picks the arm64-v8a library out of the package. `armv7` stays out: a
  32-bit package installs on one device and dies on another.

What the emulator cannot see is the ARM library, because it never loads it. That
is now checked directly: the verifier reads `e_machine` out of the ELF header in
`lib/arm64-v8a/*.so` and refuses the package unless it is `b7`, AArch64. Before
this, a file that merely sat in a directory called `arm64-v8a` would have passed
every other gate in the pipeline.

Both new refusals are exercised by the harness, and both fail when the check is
removed: a package with no x86_64 library, and a package whose ARM library is not
ARM64.

## Batch 10q: judging the launch path from the binary that ships

The phone kept reporting the same crash on a fresh install. The log was
byte-for-byte the capture already diagnosed: same PID `30083`, same
`10-10 08:18:53.492` fatal line, now with the launcher `START` immediately above
it. The installed APK was `v1.2.0-build-0836b38`, which predates the launch fix -
so nothing had regressed. There was simply no build carrying the fix on it.

That is the second half of the problem, and it is the part worth writing down: a
correct fix that never reaches a device is indistinguishable from no fix at all.
The pipeline had been green on this package. It installs, it carries its own
icon, it advertises both ABIs, its signature verifies, it has dex, it has
resources. It died before the first frame anyway.

Nothing in the verifier could see that, because every check it made was reading
`aapt2 dump badging` or the archive listing, and badging does not describe
providers. The merged manifest does. So the verifier reads `AndroidManifest.xml`
out of the built package - the *merged* one, which is what actually ships, rather
than the source manifest the patch edits. It rejects a remaining
`WorkManagerInitializer`, an absent
`app.thetooltable.mubashir.TheToolTableApplication` declaration, or an unreadable
manifest. The Application check was added in Batch 10u after the physical-device
plugin abort proved that `tools:node="remove"` alone is not a complete repair.

The harness now covers all three failures: an APK that still initializes
WorkManager at startup, one that removes startup initialization but omits the
required Application provider, and one whose manifest cannot be read. The mock
`aapt2` answers `dump badging` and `dump xmltree` separately, because a fixture
that only satisfies one of the two would have let a genuinely empty manifest
masquerade as a passing one.

The lesson generalises past this bug. Every check added so far was added *after*
a crash shipped, and each one asked the same question in a new place: not "does
the build succeed?" but "what would this artifact do on a device?". The next one
will be found the same way.

## Batch 10r: the device step died with an exit code and no explanation

With KVM finally working and the APK finally reaching the device job, the run got
further than any before - and then the emulator step died after two minutes with
`The process '/usr/bin/sh' failed with exit code 2` and nothing else. Job logs are
not reachable from outside, so the diagnosis had to come from somewhere else.

Exit code 2 out of `sh` is not a mystery once you know it: it is dash's signature
for a redirection it could not perform. Reading the emulator action's source
narrows it to exactly one redirect in the AVD setup path -
`sh -c "printf ... >> <avd-home>/<name>.avd/config.ini"` - and that line is
reached only when `cores`, `ramSize`, `heapSize`, `enableHardwareKeyboard` or
`diskSize` is set. The workflow set two of them: `ram-size` and `disk-size`. The
device profile already carries a workable amount of both, so the tuning bought
nothing and cost the entire step.

Both inputs are gone.

The second half of the fix is the part that matters more. The old failure block
collected its own diagnostics with `echo ... >> "$GITHUB_STEP_SUMMARY"` inline,
so when a redirection failed it took the report down with it. The one run where
the log mattered most was the run that could not write one. The report is now
assembled in a plain file and appended afterwards, logcat is captured to a file
before anything is summarised, a missing `adb` degrades to a readable line rather
than aborting the block, and the failure is announced with an `::error` annotation
- which is the part of a CI run that is actually visible when the logs are not.
The passing case reports too, because a silent green run proves nothing either.

Verified by running the extracted script under `dash` for all three paths: the
smoke test passing (exit 0), failing (exit 1 with the full logcat in the summary),
and `adb` missing entirely (still exit 1, still readable). Two mutations confirm
the test bites - restoring `ram-size`/`disk-size`, and restoring the old inline
summary redirect, each fail it.

## Batch 10s: stop letting a broken emulator decide who gets the app

The person waiting on this fix asked, reasonably, when they could download it.
The honest answer was "you can't", and the reason was not a defect in the app. The
APK had been built, signed and verified. It was the *gate* that was broken: the
file was banked only after an emulator had driven it, so when the emulator failed
- `/usr/bin/sh failed with exit code 2`, two minutes, a log nobody outside
GitHub's own servers could open - nobody received the fix. A pipeline whose
failure mode is "the user waits indefinitely for a fix that is already built" is
not a safety mechanism. It is an outage with extra steps.

So the emulator was demoted to what it always should have been: a second opinion.
The APK is now banked by the job that built it, immediately after the verifier
passes it, and the device job runs afterwards and reports.

That is only defensible because of what the verifier now does. It is no longer
"the build succeeded": it reads the merged manifest out of the package and
refuses anything that starts WorkManager before the first frame - the actual
crash, judged from the bytes that will be installed. That check replaced the
emulator as the thing standing between a broken APK and a phone.

The demotion is deliberately narrow, and the tests keep it narrow:

- The emulator still tests `android-device-input.apk` - the same file that is
  published, not a lookalike.
- Its failure is still announced, as a `::warning` rather than an `::error`.
- Its verdict is still written into the job summary, with the summary saying
  outright that it did not gate the release.
- Its throwaway tag is still cleaned up either way.

Two mutations confirm the arrangement is real rather than asserted: moving the
banking step back behind the device job fails two tests, and deleting the manifest
launch check fails two more.

## Batch 10t: the project's own build command could not build a working APK

The person waiting on this build asked whether they could compile the APK
themselves on a Kali box, which is a fair question and turned out to expose
something much more serious than a missing instruction.

`npm run app:android` is the command this repository tells anyone to use to
build the Android app. It ran two patchers and then `tauri android build`. It did
**not** run `scripts/ensure-android-launch-survives.mjs` - the patch that removes
AndroidX WorkManager from the launch path, the patch that fixes the instant
crash. It also skipped the launcher-icon installer, so it produced an APK with
the default Android robot, and it still passed `--target armv7`, the 32-bit
target that had already been dropped from the release pipeline after shipping.

So the documented local build would have reproduced the exact APK this
repository spent a week diagnosing, and someone following the project's own
instructions would have installed it and seen the same crash again - while CI,
which does run all three steps, sat green beside it. The divergence between the
two paths was invisible until somebody asked to do it by hand.

`app:android` now runs the same steps CI runs, in the same order, targeting
`aarch64` alone. `tests/android-local-build.test.js` pins all of it: the launch
fix is present, so are the other three patchers, `armv7` stays out, and every
script path the build references actually exists - because a typo there fails
late, after a full Rust build, which on a slow machine is the worst possible
moment to find out. Two mutations confirm it bites: restoring the old script
fails three of the four tests, and re-adding `armv7` alone fails the fourth.

`docs/BUILD-ANDROID-LINUX.md` is the resulting guide: toolchain versions, the
JDK 17 requirement and why it is not optional, disk and time expectations for a
low-end machine, the install steps, and a command to verify from the built APK
that the launch fix is actually present.

## Batch 10u: removing eager startup was necessary, but not sufficient

The first repair was still incomplete. A physical device showed that v1.2.1 could
reach its first visible Activity and then abort while Tauri initialized the
`tauri-plugin-download` native plugin. The download plugin calls
`WorkManager.getInstance(context)`. Once `WorkManagerInitializer` has been
removed, AndroidX WorkManager's documented on-demand path requires the
application context to implement `Configuration.Provider`; otherwise it throws
“WorkManager is not initialized properly” and the Rust/native startup path
aborts.

The corrective v1.2.2 patch therefore does **not** restore the eager initializer
or call `WorkManager.initialize` in `Application.onCreate`. Instead it generates
`app.thetooltable.mubashir.TheToolTableApplication` after `tauri android init`,
declares that exact class with `android:name` on the generated manifest's
`<application>`, and implements `Configuration.Provider` with the default
configuration. This preserves deferred initialization while giving the download
plugin the configuration it needs on first use. The generated Application is
kept from R8 and the patch fails rather than overwriting a pre-existing custom
Application.

The shipping checks now match that full contract:

1. the APK verifier reads the merged manifest and rejects a remaining
   `WorkManagerInitializer` **or** a missing
   `TheToolTableApplication` declaration, then requires that class's descriptor
   in DEX;
2. fixture tests prove the patch's manifest, Kotlin source, direct app-module
   WorkManager dependency, ProGuard rule, idempotence, and refusal to clobber a
   custom Application; and
3. the device smoke waits five seconds after the collection appears, confirms the
   app remains foregrounded, and treats `PluginInitialization("download", …)`
   records and native `Abort message:` tombstones as failures.

This work intentionally has no public APK yet. v1.2.1 and older Android releases
remain withdrawn until the exact v1.2.2 signed artifact passes these checks and
is installed and kept open through native/plugin initialization.


## Batch 10v: the device run is again a real release gate

The physical-device report exposed a policy failure as well as the missing
WorkManager configuration: the pipeline could declare a native build successful
and put `TheToolTable.apk` on its real draft release **before** the only step
that launches the app had a result. The `android-device` step was marked
`continue-on-error`, so a native abort was visible at most as an advisory after
the artifact had already been banked.

That ordering is no longer acceptable for Android releases. The `android` job
still signs and verifies the archive, but it uploads it only to a throwaway,
source-specific candidate release, accompanied by its SHA-256 record. The device
job downloads and verifies that checksum, installs those exact bytes on the
x86_64 emulator, waits through the delayed download-plugin initialization, and
fails on a Rust abort, `PluginInitialization("download", ...)`, lost foreground,
or failed navigation. Only after that normal (non-demoted) smoke step passes does
`Bank the device-tested APK` upload the same checked bytes to the intended draft
release. A failed device job reaches its logcat report and candidate cleanup, but
cannot reach the banking step. Its smoke output and captured logcat are retained
as `android-device-failure.txt` on the already-private real draft, so a failure
can be diagnosed even where GitHub's ephemeral Actions log endpoint is not
reachable.

The transport filename is deliberately generic, so the workflow also carries a
small reviewed release-name record. This prevents a fallback-key test APK from
being silently relabelled `TheToolTable.apk`: the final bank allows only
`TheToolTable.apk` or `TheToolTable-fallback-signed.apk` and retains the latter
when the signing certificate cannot upgrade an existing install.

The static verifier still checks the ARM64 ELF because a hosted x86_64 emulator
cannot load that half of the universal APK. Together, archive verification,
manifest/DEX checks, a checksum-verified device run, and the post-smoke upload
make a green Android candidate mean the source-specific bytes were actually run,
not merely packaged.
