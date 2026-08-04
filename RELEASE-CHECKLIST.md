# Release checklist — Jump Juice Adventure

Run before packaging a submission. Items marked **BLOCKER** will get the
build rejected or shipped broken.

```bash
node test/release-check.mjs --strict     # must be green before you submit
```

That gate enforces everything machine-checkable below. The rest needs a
human, a Mac, or a developer account.

---

## 0. The four blockers, up front

Nothing else matters until these are done. `release-check.mjs --strict`
fails while any of them is still a placeholder.

| # | Blocker | Where | Why |
|---|---|---|---|
| 1 | **Support email** is `support@example.com` | `jumpjuice.html` → `SUPPORT_EMAIL` | Both stores reject a listing whose support contact does not resolve |
| 2 | **Privacy URL** is `https://example.com/privacy` | `jumpjuice.html` → `PRIVACY_URL` | Same, and the policy must be publicly reachable *before* review |
| 3 | **TWA host** is `example.com` | `dist/android/twa-manifest.json` → `host` | Android only. See §3 — this is the difference between a fullscreen app and a browser with an address bar |
| 4 | **Signing keys do not exist yet** | — | See §3 and §4. The AAB in `dist/` is signed with a throwaway key generated here; it is proof the build works, **not** a shippable artifact |

---

## 1. Automated — verified in this repo

All of this is asserted by the suites and re-runnable.

```bash
node test/smoke.mjs --device=iphone    # x5 profiles
node test/features.mjs                 # 48
node test/balance.mjs                  # 83
node test/hostile.mjs                  # 19 crippled-browser boot cases
node test/pwa.mjs                       # 26, incl. real offline play
node test/buttons.mjs --device=iphone   # 26, x3 profiles
node test/perf.mjs                      # 11, mobile frame cost
node test/genvalidate.mjs               # 10k + 10k fairness sweep
node test/economy.mjs
node test/soak.mjs --min=30
node test/release-check.mjs --strict    # 44 packaging assertions
```

- [x] **Every control works.** `buttons.mjs` enumerates the DOM rather than a
      remembered list, clicks everything, and requires each to change
      observable state — a button that swallows its click fails.
- [x] **Every control is a 44px touch target.** Both stores audit this.
- [x] **No crashes.** `hostile.mjs` boots the game in 19 crippled browsers
      (no localStorage, no canvas, no roundRect, quota-full, …) and requires
      it to either run or explain itself — never hang, never enter a dead
      engine.
- [x] **No console errors.** Asserted in `smoke`, `buttons` and `pwa`. Two
      resource 404s on `file://` are expected and classified: the font CDN
      (offline sandbox, falls back to a system font) and the install-only
      assets, which exist only in the PWA build.
- [x] **Memory is stable.** 30-minute soak, heap flat, no audio-node leak.
- [x] **Mobile frame cost is inside budget.** 4.91ms worst case against an
      8ms budget. See §6 for what that does and does not prove.
- [x] **Orientation.** Portrait and landscape both supported; rotation
      auto-pauses a live run and clears held input, so a rotation can never
      cost a heart. Declared in the manifest (`"orientation": "any"`), in
      `Info.plist` (portrait + both landscapes) and in the TWA manifest.
- [x] **Save system.** `localStorage["jja2"]`, sanitised on load by
      `adopt()`: numeric clamping, unknown hero ids dropped, never leaves
      the player with no hero, unknown control scheme falls back. Settings
      persist in `SAVE.opt`.
- [x] **Version number.** `VERSION` / `VERSION_CODE` in `jumpjuice.html` are
      the single source of truth; `build-native.mjs` stamps them into the
      Gradle project and the Xcode project, and `release-check.mjs` fails if
      the three disagree.
- [x] **Placeholder assets removed.** Capacitor's default splash art was
      replaced with the game's own; `release-check.mjs` fails if the
      placeholder returns.
- [x] **No signing material committed.** Asserted.

---

## 2. Assets — built, at spec

`node test/build-store.mjs` → `dist/store/`

- [x] Play icon 512×512, **no alpha** (both stores reject an alpha channel)
- [x] App Store marketing icon 1024×1024, no alpha, no pre-rounded corners
- [x] Play feature graphic 1024×500, no alpha
- [x] Screenshots at all seven required sizes, from real gameplay, verified
      distinct — 1080×1920, 1200×1920, 1600×2560, 1290×2796, 1242×2688,
      1242×2208, 2048×2732
- [x] PWA icons: 13 sizes + 2 maskable + apple-touch
- [x] iOS launch images: 18 device sizes
- [x] Loading screen: in-game, with a CSS-only hint after 5s for the case
      where scripts never run at all

**Still to do by hand:** pick and order the 2–8 screenshots you actually
want per store, and write localised listing text if shipping outside
English. Copy is drafted in `STORE.md`.

---

## 3. Android — Google Play

The build is a **Trusted Web Activity**: a Chrome instance, in your app's
shell, pointed at a URL. That has one consequence that catches people out.

- [ ] **BLOCKER — host `dist/pwa/` on a domain you control, over HTTPS.**
      A TWA cannot bundle the game as local files. Until `host` is a real
      domain serving the PWA, the app opens with a **browser address bar
      across the top** and Play review will likely reject it as a webview
      wrapper.
- [ ] **BLOCKER — generate your own upload key.** The keystore used here is
      a throwaway with a published password. Losing or leaking a real upload
      key is unrecoverable.
      ```bash
      keytool -genkeypair -v -keystore jumpjuice.keystore -alias jumpjuice \
        -keyalg RSA -keysize 2048 -validity 10000
      ```
      Back it up somewhere you will still have in five years.
- [ ] **BLOCKER — publish `/.well-known/assetlinks.json`** on that domain,
      over HTTPS, exact path, `Content-Type: application/json`.
      Template: `dist/android/assetlinks.json`.
      **The fingerprint is the trap.** With Play App Signing on (the
      default) Google *re-signs* your upload with their key, so the SHA-256
      that belongs in this file is the one under
      *Release → Setup → App integrity → App signing key certificate* — **not**
      your upload keystore's fingerprint. Getting this wrong is the single
      most common cause of "my TWA still shows a URL bar".
- [ ] Rebuild and sign:
      ```bash
      node test/build-pwa.mjs
      node test/build-native.mjs
      JJA_KEYSTORE=$PWD/jumpjuice.keystore JJA_KEYSTORE_PASS=... \
        ANDROID_HOME=$HOME/Android/Sdk \
        node test/build-native.mjs --android-aab
      ```
- [ ] Verify on a **real Android device** before uploading: install the AAB
      via `bundletool`, confirm it launches fullscreen with **no address
      bar**, and that it works with the network off.
- [ ] Play Console: content rating questionnaire, data-safety form (declare
      **no data collected** — see `PRIVACY.md`), target audience, ads
      declaration (**no ads**), and the privacy policy URL.
- [ ] `targetSdkVersion` meets Play's current minimum for new uploads.
      Google raises this yearly; check the console warning before building.

---

## 4. iOS — App Store

- [ ] **BLOCKER — you need a Mac.** `dist/ios/xcode-project/` is complete and
      opens in Xcode, but compiling, signing and uploading an iOS app
      requires Xcode, which is macOS-only. Nothing in this repo can do it.
- [ ] Apple Developer Program membership (paid, annual).
- [ ] Open `dist/ios/xcode-project/App/App.xcworkspace`, then:
      ```bash
      cd dist/ios/xcode-project/App && pod install
      ```
      CocoaPods was not run here (it is not installed on Linux).
- [ ] Set your Team and a bundle identifier you own — `com.jumpjuice.adventure`
      is a placeholder and will not be registrable by you.
- [ ] Verify in Xcode: version `1.0.0`, build `1`, deployment target, arm64,
      `UIRequiresFullScreen`, dark status bar, both orientations.
- [ ] Run on a **real iPhone**. Specifically check what emulation cannot:
      audio unlock after the first tap, the silent switch, haptics, 120Hz
      ProMotion timing, safe-area insets on a notched device, and thermals
      over a long session.
- [ ] App Store Connect: privacy nutrition label (**no data collected**),
      age rating, support URL, marketing URL, review notes.
- [ ] Export compliance: `ITSAppUsesNonExemptEncryption` is already set to
      `false` in `Info.plist` — correct, the game uses no encryption.

**Apple review risk to know about:** guideline 4.2 (Minimum Functionality)
is applied to thin web wrappers. The iOS build bundles the game as **local
files** and works fully offline, which is the right side of that line, but
it is worth naming in the review notes.

---

## 5. Before you press submit

- [ ] Bump `VERSION` / `VERSION_CODE` in `jumpjuice.html`.
      **`VERSION_CODE` must increase on every single upload** and can never
      repeat — Play rejects a duplicate, including a re-upload of an
      identical build.
- [ ] `node test/build-pwa.mjs && node test/build-store.mjs && node test/build-native.mjs`
- [ ] `node test/release-check.mjs --strict` — green.
- [ ] Full suite green (§1).
- [ ] Tag the release and push.

---

## 6. What this repo has NOT verified

Stated plainly, because a checklist that implies otherwise is worse than no
checklist.

- **No real iPhone or Android hardware has ever run this build.** Every
  mobile result is Chromium device emulation (iPhone 13, Pixel 5, iPad
  gen 7). Real audio unlock, haptics, ProMotion timing, thermal and battery
  behaviour are all unverified.
- **The frame-cost budget is a necessary condition, not a sufficient one.**
  This host has no GPU — it renders through SwiftShader, where an *empty*
  rAF loop already costs ~20ms/frame. So the suite measures JS main-thread
  work, which transfers; it cannot measure GPU raster or composite, which
  does not. 60fps on a phone is not proven here.
- **The battery-saver toggle's independent effect is unmeasured.** This
  environment is slow enough that the adaptive watchdog engages on its own
  within a few frames, so the two cannot be separated without faster hardware.
- **No home-screen install has been performed on a real device.**
  `beforeinstallprompt` cannot be fired synthetically. What is proven: the
  manifest is valid and complete, the service worker registers and caches,
  the game genuinely replays with the server killed mid-session, and the
  install button's own logic does not throw.
- **The AAB has never been installed on a device**, only structurally
  verified (valid App Bundle, signed, correct package).
- **The Xcode project has never been compiled.** It is generated and
  configured, not built.
- **No store review has been attempted.** Both guideline risks above are
  judgement calls made by a human reviewer.
