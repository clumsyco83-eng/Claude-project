# Jump Juice — Visual Redesign QA Report

Date: 2026-08-03
Branch: `claude/jump-juice-visual-redesign-vjua89`
Baseline: `57259ed` (the polish & balance build, before any visual change)

---

## 1. Automated suites

All run against the canonical `jumpjuice.html` unless noted. Environment
is Chromium 1194 headless with software GL — see §6 for what that does
and does not prove.

| Suite | Result | Covers |
|---|---|---|
| `smoke.mjs --device=desktop` | **60 / 60** | boot, input, physics, HUD, save, layout |
| `smoke.mjs --device=iphone` | **60 / 60** | iPhone 13 profile |
| `smoke.mjs --device=android` | **60 / 60** | Pixel 5 profile |
| `smoke.mjs --device=tablet` | **60 / 60** | iPad gen 7 profile |
| `smoke.mjs --device=edge` | **60 / 60** | 1536×864 desktop |
| `smoke.mjs --file=split/index.html` | **60 / 60** | the generated split build |
| `features.mjs` | **36 / 36** | heroes, abilities, four bosses, three phases, Lab, awards |
| `balance.mjs` | **82 / 82** | the full balance and systems contract |
| `hostile.mjs` | **19 / 19, no hangs** | crippled browsers, blocked storage, no `roundRect` |
| `genvalidate.mjs` | **10,000 + 10,000 sequences, 121,910 platforms, 0 invalid** | procedural fairness, including no-double-jump |
| `economy.mjs` | **PASS** — first paid hero at 13.1 min (target 10–20) | earning pace |
| `soak.mjs --min=3` | **PASS** — heap ratio 1.00, DOM stable, 0 errors, 4,356 m | memory and stability |

Console errors during every run: **none**. The only network failure is
the Google Fonts request in the offline sandbox, which is non-fatal by
design — the game falls back to a rounded system stack.

---

## 2. Performance

5-second `requestAnimationFrame` samples at 1,400 m (a busy stretch:
enemies, pickups, weather, props and parallax all live), redesign vs the
pre-redesign baseline on the same machine:

| Build / profile | Avg FPS | Worst frame |
|---|---|---|
| Redesign · desktop 1280×800 | 58.9 | 50 ms |
| Redesign · iPhone 13 profile | **60.0** | 33.4 ms |
| Redesign · iPhone 13 + Battery Saver | **60.0** | 16.8 ms |
| Baseline · desktop 1280×800 | 59.5 | 66.7 ms |
| Baseline · iPhone 13 profile | 56.4 | 50.1 ms |

The redesign is **not** slower than what it replaced, and is measurably
smoother on the phone profile. Reasons: no `shadowBlur` was introduced,
props are computed from world position with no allocation, and the sky
gradient, glow sprites and vignette all stay cached.

Battery Saver drops the prop layer, clouds, weather, glows and the Juice
Mode screen treatment, and pins DPR to 1 — worst frame falls by half.

---

## 3. Responsive layout

Measured position of the Start button on first paint:

| Profile | Viewport | Start button | Verdict |
|---|---|---|---|
| iPhone 13 | 390 × 664 | top 236, bottom 284 | visible |
| iPhone 13 landscape | 750 × 342 | top 134, bottom 182 | visible |
| Pixel 5 | 393 × 727 | top 243, bottom 291 | visible |
| iPad gen 7 | 810 × 1080 | top 394, bottom 442 | visible, no scroll |
| 320 × 568 (smallest supported) | 320 × 568 | top 211, bottom 259 | visible |

Every button measures at least 44 × 44 CSS px (asserted by `smoke.mjs`);
the primary buttons are 48 px tall. Safe-area insets are applied on all
four edges of every overlay, the pause button, the on-screen pads and the
rotate hint.

---

## 4. Bugs found and fixed during the redesign

| # | Bug | Fix |
|---|---|---|
| 1 | `makeGlow()` faded to transparent **black**; canvas interpolates un-premultiplied, so every glowing pickup carried a grey halo. Invisible on the old dark background, obvious on bright worlds. | fade to the same colour at alpha 0 |
| 2 | A centred flex overlay clipped its own top when content exceeded the viewport, and the clipped area could not be scrolled to — the logo lost its head on a phone | `justify-content:flex-start` + auto margins on the first/last child |
| 3 | The hero roster grid squeezed its rows instead of scrolling, clipping every portrait in half | `grid-auto-rows:max-content` |
| 4 | Cloud puffs were three ellipses in one path, so the fill bridged them into a spike. Hidden at the old 0.14 alpha, visible at the new one | one sub-path per puff |
| 5 | Start sat below the fold on a 390 × 844 phone | start screen reordered, primary action above the how-to-play card |
| 6 | Award text claimed "Unlock all 30 runners" against a 34-hero roster | text corrected to 34 |
| 7 | Juice Lab brew descriptions inherited progress-track chrome and rendered inside a stray bordered box | dedicated `.desc` row |

---

## 5. Manual test pass

Exercised in Chromium across the five device profiles:

- Boot from a clean state; boot with a corrupted save; boot with
  `localStorage` throwing — all recover, no hang.
- A save written by the pre-redesign build loads. Coins, XP, best
  distance, awards, fruit, brew, streak and all seven settings survive.
  Hero ids that no longer exist are dropped, the six launch heroes are
  granted, and the roster is topped back up to its original **size** with
  the cheapest unowned heroes — so a returning player ends up with at
  least as many heroes as they had, and never fewer than a new player.
  Verified for 6-hero, 14-hero, empty, malformed and current-build saves.
- All 34 hero portraits render in the roster; all 34 render in play.
- All 12 enemies spawn, animate, take a hit flash and die.
- All 4 bosses spawn, telegraph, reach phase 2 and 3, stun, and are
  killable; each drops fruit and can gift a hero.
- All 8 worlds render with sky, three ridges, props, weather and the
  correct ground material.
- Juice Mode: trigger, aura, speed lines, gem extension, warning at 3 s,
  final-second flash, expiry.
- Power-ups: shield absorbs a hit, magnet triples pickup range for its
  duration and shows a draining bar, juice bomb clears the screen.
- Every screen: splash, menu, hero select, Lab, Journey, pause, HUD,
  run-over. Every button reachable and responsive.
- Pause settings persist across a reload (sound, vibrate, calm, saver,
  invert, daily modifier, volume, control scheme).
- Calm Mode removes shake, flashes and speed lines. Battery Saver drops
  the heavy layers. Both persist.
- Rotation during a live run auto-pauses and drops held input.

---

## 6. Known limitations

1. **No real device testing.** Every mobile result above is Chromium
   device emulation. Real iOS Safari audio unlock, real haptics, 120 Hz
   ProMotion timing, thermal throttling and battery drain are still
   unverified. This was true of the baseline and is still true. **Do not
   claim otherwise in a store listing.**
2. The soak ran headless with software GL, which is not a proxy for phone
   thermals.
3. The art is procedural, not painted. It is coherent, original and
   shippable, but it is not the painted illustration in the reference
   sheets. `docs/ASSET-PROMPTS.md` specifies that upgrade path.
4. The three new abilities (triple jump, grape blast, pineapple slam) are
   covered by smoke/feature runs but do not yet have dedicated balance
   assertions in `balance.mjs`.
5. Fonts load from Google Fonts. First launch on a metered or offline
   device uses the system fallback — intentional, but the two builds do
   not look byte-identical.
6. All strings are inline English; there is no localisation layer.

---

## 7. Store visual checklist

| Item | Status |
|---|---|
| App icon, master 1024 × 1024 | source SVG in `<head>`, export per `docs/ASSET-PROMPTS.md` §6 |
| iOS icon set | **to export** from the master |
| Android adaptive icon (fore + back) | **to export**; keep OJ inside the 264 px safe circle |
| Favicon / Apple touch icon | done, inline |
| Splash screen | done, in-engine |
| Play feature graphic 1024 × 500 | **to produce** |
| Phone screenshots 6.7" / 6.5" | **to capture** — `test/shots.mjs` produces the frames |
| Tablet screenshots 12.9" | **to capture** |
| Promo video | **to produce** |
| Privacy policy | **required before submission** — the game stores only local progress and makes no network call except the font request |
| Age rating questionnaire | no ads, no IAP, no accounts, no user content, no data collection |
| `theme-color` / status bar | done |
