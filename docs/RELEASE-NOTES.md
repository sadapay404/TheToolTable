# TheToolTable — v1.2.0 build candidate

> **Draft.** These notes describe a build candidate. Nothing here has been
> published; the release exists so the artefacts can be installed and tried
> before anyone is told to trust them.

Everything in this app runs on the device it is installed on. No file, photo,
document or scan leaves the phone. There is no account, no telemetry and no
server — the app works in aeroplane mode, which is the point of it.

---

## What changed since v1.1.1

### The mobile experience was rebuilt, not adjusted

The old app was a desktop layout squeezed onto a phone: the header ran under
the punch-hole camera, the theme picker was unreachable, and the footer was a
desktop footer at a smaller size. All of it was replaced.

- **A phone-shaped layout** for the collection and for every one of the twenty
  tools, built to Material 3 Expressive with violet as the primary colour
  (`#5B4BD6` light, `#C6BFFF` dark).
- **A new phone-specific footer.** Always animated, built for a thumb rather
  than shrunk from the desktop one.
- **Every app opens with an intro band**, so twenty tools feel like twenty
  products rather than twenty screens in one.
- **Safe areas are respected on every edge** — the notch, the gesture bar, and
  the iOS home indicator.

### Back now works

The Android back gesture used to close the app from anywhere, and the in-app
back button sometimes left a black screen with nothing but the header. Both were
the same bug: navigation was riding the WebView's own history, which has no
opinion about what a tool screen is.

Navigation is now an explicit stack the app owns. Android back unwinds it — an
overlay first, then one tool, then the collection — and only exits on the root
screen. A spare history entry sits behind the app so a stray gesture has
somewhere harmless to go. This is pure, unit-tested logic rather than
device-only behaviour.

### It keeps working when you switch apps

Downloading a model or a large file used to stop dead the moment you left the
app. Transfers now run in the Android foreground service, survive the app being
backgrounded, and report live progress in a notification. The same is true of
the on-device background removal model.

### The launcher icon is TheToolTable's

Not the default Android robot, and not a placeholder. The app's own mark, at
every density, installed at build time.

---

## Verified before this build was banked

### 407 automated checks, all passing

These are property tests: they assert that a rule holds for *any* input rather
than checking a list of expected values. The distinction matters — "1 km is
1000 m" catches nothing, while "converting A→B and back returns the original"
catches every conversion bug that will ever be written.

| Area | What was checked |
|---|---|
| Navigation | Back unwinds every stack, never exits from inside a tool, never strands the user |
| Unit conversion | Every conversion in every category round-trips exactly |
| Time zones | Over 120,000 conversions across all 250 zones, every month-end of three years, every clock-change hour — not one wrong |
| Money | Loans amortise to zero at every rate and term; tax tables behave; currency rates round-trip |
| Decision tools | Fair to within 3% of even over 20,000 tosses; a shuffle is always a permutation |
| Images | EXIF, GPS and comments stripped from real JPEG and PNG; pixels preserved; 600 random byte strings refused without hanging |
| QR codes | Geometry verified — finder patterns, timing patterns, alignment, mandatory dark module — across four error-correction levels |
| Parsers | CSV quoting, delimiter detection and caps; invoice library; corrupt saves fall back instead of throwing |
| Accessibility | Every control named, every field labelled |
| The artefact | The built `dist/` itself: every tool ships as its own chunk, no development React, no source maps, every manifest icon present at the size it claims |

### Seventeen bugs found and fixed

The ones that would have reached a phone:

- A timecode past ~1.4×10¹⁴ seconds rendered the literal text `-Infinity`.
- A transfer under one byte read as `512.0 undefined`.
- Seven of the thirty-three QR templates **could not scan**. They were
  beautiful and useless: "Ocean" was bright cyan on near-white at 1.90:1, and a
  phone camera needs better than 3:1. Rather than flatten the palettes and lose
  what made them worth picking, the module colours are now walked away from the
  background until they clear 4.5:1, keeping their hue. All thirty-three now
  scan; the worst is exactly 4.50:1.
- An invoice with a 100% discount on a large subtotal showed a negative tax
  line, from a rounding error of two ten-thousandths of a rupee.
- A receipt you had already paid in full reported the full amount outstanding.
- The audio visualiser could be driven to a blank canvas by a NaN clock, and
  nothing but a reload brought it back.
- Forty-six fields across thirty files were named only by their placeholder.
- The transfer cancel button was a 28-pixel target on a phone.

### The artefact is checked, not assumed

A signed APK is not automatically a working one. If the icon path ever stops
resolving, the build still produces a perfectly valid package that installs
with the default Android robot on the home screen. The build now verifies the
archive, the dex, the launcher icons at every density, the permissions the app
actually depends on, and the signature — and refuses to bank anything that
fails.

---

## Known limitations

- **The APK is signed with a fallback key.** The project's own keystore was not
  available to the build, so a new certificate was generated. It is stable from
  now on, but it is *not* the key v1.1.1 was signed with, so an existing
  installation cannot be upgraded in place — uninstall and reinstall. Data
  stored locally by the app does not carry across.
- **Background transfers need notification permission.** Without it Android will
  not run the foreground service, and a download stops when the app is
  backgrounded. The app asks, and explains why.
- **The fallback signing key is for testing only.** A public release must be
  signed with a key you hold.
- **Exchange rates are a snapshot.** The app fetches live rates where it can and
  falls back to the snapshot when it cannot; check the date shown before acting
  on a figure.
- **Some tools depend on WebAssembly** (background removal, OCR, barcode
  scanning). The models are bundled, which is why the APK is large.

---

## Assets

| File | Platform | Notes |
|---|---|---|
| `TheToolTable-fallback-signed.apk` | Android, arm64 | Fallback-signed; uninstall v1.1.1 first |
| `TheToolTable_1.2.0_x64-setup.exe` | Windows | Installer, x64 |
| `TheToolTable_1.2.0_x64_en-US.msi` | Windows | MSI, x64 |

The web build is self-hosted from `dist/` — it is a static bundle and needs no
server of its own.

---

Built by Mubashir. The source is the repository this release was cut from; the
commit is in the release name.