# START HERE — Jump Juice handoff

**Paste this file into a new chat first.** It is the complete cold-start
context: what the project is, which files matter, what state it is in, what
was just changed, and what is left to do.

Everything referenced here is in this zip.

---

## 0. The one-paragraph version

Jump Juice is a **single-file HTML5 endless runner** — Canvas 2D,
hand-rolled WebAudio, `localStorage` saves, zero runtime dependencies, no
build step required to play. The core loop is **fill the meter → trigger
JUICE MODE → go further**. `jumpjuice.html` is the whole game and the only
file you edit; everything in `split/` and `dist/` is generated from it.

The last work done was a **complete visual redesign** (2026-08-03) that
replaced the entire art direction with an original fruit-monster
universe: six named launch heroes, twelve Spoiled Fruits enemies, four
named bosses, eight fruit worlds, a new interface design system, a logo
and an app icon. Simulation, physics, save format, resilience and the
boot watchdog are unchanged. All test suites pass.
**Nothing has been tested on real phone hardware.**

Read `docs/ART-DIRECTION.md` before touching anything visual.

---

## 1. Repository and branch

```
repo   : clumsyco83-eng/Claude-project
branch : claude/jump-juice-visual-redesign-vjua89
HEAD   : 44895e7  Add audio-cue coverage, 44px scheme buttons, and the 30-minute soak result
         96e1aaf  Polish & balance pass: Juice Mode 12s, staged difficulty, fair generation
         5b08479  Add split CSS/JS/HTML build   <- state before this pass
```

Both commits are pushed. No pull request has been opened.

---

## 2. File map — what is source, what is generated

| Path | Role |
|---|---|
| `jumpjuice.html` | **CANONICAL SOURCE — the entire game (~199 KB). Edit ONLY this.** |
| `split/index.html`, `split/jumpjuice.css`, `split/boot.js`, `split/jumpjuice.js` | **GENERATED** by `node test/split.mjs` |
| `split/README.md` | Hand-maintained (the one exception in `split/`) |
| `dist/jumpjuice-artifact.html` | **GENERATED** body-only build for hosting, by `node test/build-artifact.mjs` |
| `dist/hosted-sim.html` | Hosting simulation harness |
| `test/*.mjs` | Test and build scripts (Playwright-driven) |
| `README.md` | Run/build/test, balance tables, orientation, save format |
| `REPORT.md` | Full bug log — original audit, upgrade pass, and the 2026-08-03 polish pass |
| `HANDOFF.md` | Systems overview + "things to know before changing anything" |
| `AUDIT.md` | Audit of the pre-redesign build + the transformation checklist |
| `docs/ART-DIRECTION.md` | **The art bible. Read before any visual change.** |
| `docs/ASSET-INVENTORY.md` | Every hero, enemy, boss, world, prop and icon, and where it is defined |
| `docs/ASSET-PROMPTS.md` | Image-generation prompt pack for a painted-art upgrade |
| `docs/QA-REPORT.md` | Redesign QA: suites, performance, layout, bugs fixed, limitations |
| `shots3/` | Screenshots proving the current UI state |

> **The #1 way to break this project:** editing a file in `split/` or `dist/`.
> They are overwritten by the next build, and until then the two builds
> silently disagree. Edit `jumpjuice.html`, then re-run `node test/split.mjs`.

---

## 3. Two rules that will break the game if changed

1. **`boot.js` must load before `jumpjuice.js`.** It is the watchdog that
   catches a top-level throw in the game and shows a recovery screen. Reverse
   the order and a startup crash leaves the spinner running forever.
2. **Both must stay classic scripts.** No `type="module"`, no `defer`/`async`.
   Modules are deferred and blocked by CORS on `file://`, so the game would
   silently never start when the file is opened by double-clicking.

---

## 4. How to run, build and test

```bash
# run
xdg-open jumpjuice.html            # single file (double-clicking works)
xdg-open split/index.html          # split build
npx http-server . -p 8080          # served — REQUIRED for iOS Safari

# build (always re-run split after editing jumpjuice.html)
node test/split.mjs                # jumpjuice.html -> split/
node test/build-artifact.mjs       # jumpjuice.html -> dist/jumpjuice-artifact.html

# test
node test/smoke.mjs --device=iphone   # 60 assertions x 5 profiles
node test/features.mjs                # 36 — heroes, bosses, Lab, awards
node test/hostile.mjs                 # 19 crippled-browser cases
node test/balance.mjs                 # 82 — the balance/systems contract
node test/genvalidate.mjs             # 10k + 10k procedural fairness sweep (~47s)
node test/economy.mjs                 # coins/min + time-to-unlock simulation
node test/soak.mjs --min=30           # long-run memory/stability
```

Every script accepts `--file=split/index.html` to run against the split build.

**Environment the tests need:** Playwright at
`/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. If those paths differ in
a new environment, update the `executablePath` and the import at the top of
each `test/*.mjs`.

---

## 5. Debug mode

Append `?debug=1` to the URL. Off for normal players. Gives:

* an on-screen overlay — FPS, object count, distance, **difficulty stage**,
  `d`, speed multiplier, active modifier, velocity, dash cooldown, Juice timer
  + extension, meter, hearts, hero + passive, control scheme, full boss state
* **hitbox outlines** — player, platforms, enemies, boss weak point
* `window.JJA_DEBUG` — the surface every test harness drives:
  `state`, `restart()`, `keepAlive()`, `setHero()`, `setMod()`, `setScheme()`,
  `fillJuice()`, `extend()`, `juiceLenOf()`, `forceBoss()`, `hitBoss()`,
  `spawnKind()`, `voidPlayer()`, `setDist()`, `genSeq()`, `density()`,
  `economy()`, `diffAt()`, `stageAt()`, `turbo()`, `holdDash()`,
  `steerThenHold()`, `probeGain()`, `probeDamage()`, `sfx()`, `sfxKeys()`

---

## 6. Current state — what the last pass changed

A complete visual transformation. **No gameplay system was removed.**

### Replaced

| Layer | Before | After |
|---|---|---|
| Ink line | `#0B1226` cold navy | `#41230F` warm brown, one colour everywhere |
| Heroes | 34 abstract shapes (Blip, Robo, Ninja…) | 34 fruit heroes; **OJ, Straw, Kiwi, Grape, Mango, Pine** free from launch |
| Enemies | 10 generic (slime, cubebot, laser…) | 12 **Spoiled Fruits**, nine behaviour families |
| Bosses | Juice Monster / Flame Djinn / Terra Rex / Cyclops Eye | **Watermelon King → Grape Wizard → Pineapple Tank → Soda Monster** |
| Worlds | 7 dark (Forest, Ice, Storm, Space…) | 8 bright fruit worlds with a prop layer and ground materials |
| Collectibles | amber dot, cyan diamond | Juice Drop, Juice Gem, + shield / magnet / juice-bomb power-ups |
| UI | dark navy, hairline borders, 9 px monospace | cream panels, ink outlines, chunky buttons with a drop edge |
| Type | Space Grotesk + monospace | Baloo 2 + Nunito (both SIL OFL) |
| Brand | none | logo, tagline lockup, splash, app icon, favicon |

### Added gameplay

Three new hero abilities, each isolated and small:

* **Straw — Triple Jump.** `maxJ` becomes 3. NODBL still clamps to 1, so
  the daily modifier is never overridden and the generator's reachability
  budget stays honest.
* **Grape — Grape Blast.** The dash input fires a bouncing juice orb.
  Reuses the existing `shots` array with a `friendly` flag, so there is
  one projectile list and one compaction pass, not two.
* **Pine — Pineapple Slam.** A hard landing (impact > 0.45) emits a
  damaging shockwave. Radius sits between Inferno's flame burst and the
  Juice Mode shockwave, and does not reach the boss.

Plus three power-up pickups (shield, coin magnet, juice bomb) with HUD
indicators.

### Save migration

The roster was renamed, so a save from an earlier build lists hero ids
that no longer exist. `adopt()` drops them, grants the six launch heroes,
and then tops the roster back up to its **original size** with the
cheapest heroes the player does not already own. A returning player
therefore ends up with at least as many heroes as they had, and never
fewer than a brand-new player. Coins, XP, best distance, awards, fruit,
brew, streak and all seven settings are preserved untouched.

### Bugs fixed on the way

`makeGlow()` faded to transparent **black** — canvas interpolates
un-premultiplied, so every glowing pickup carried a grey halo (invisible
on the old dark backdrop, obvious on bright worlds). A centred flex
overlay clipped its own top on short screens with no way to scroll back.
The roster grid squeezed its rows instead of scrolling, halving every
portrait. Cloud puffs shared one path and grew a spike. Start sat below
the fold on a 390×844 phone. Full list in `docs/QA-REPORT.md` §4.

## 7. Verification status

| Suite | Result |
|---|---|
| `smoke.mjs` × 5 device profiles | 60/60 each = 300 |
| `features.mjs` | 36/36 |
| `hostile.mjs` | 19/19 (stricter contract) |
| `balance.mjs` | 82/82 |
| `genvalidate.mjs` | 10,000 + 10,000 sequences, **121,910 platforms, 0 invalid** |
| `economy.mjs` | first paid hero 13.1 min — inside the 10–20 min target |
| `soak.mjs --min=3` | 3 min, 4.4 km, heap ratio 1.00, DOM stable, 0 errors |

Frame cost was measured against the pre-redesign build on the same
machine: the redesign runs at 60 fps on the iPhone 13 profile where the
baseline ran at 56.4, with a lower worst frame. Full numbers in
`docs/QA-REPORT.md` §2.

All suites pass against **both** `jumpjuice.html` and the regenerated
`split/` build. `genvalidate.mjs` was mutation-tested: removing the NODBL gap
clamp made it fail 120/120, so it provably detects the bug class it guards.

---

## 8. Things to know before changing anything

1. **`jumpjuice.html` only.** Re-run `node test/split.mjs` after every edit.
2. **The HUD is anchored to the top of the *screen*, not the play band.** It
   clears the notch via `safeTop`. An earlier pass anchored it to the band,
   which parked it in empty sky on tall phones.
3. **iOS will not run this from a file.** Quick Look never executes scripts,
   and iOS Safari cannot open local `file://` HTML. It must be served.
4. **Boot can never hang, and a fatal error must never offer a way in.**
   `window.__jjaFatal` latches so a late `bootDone()` cannot wipe the message.
   Do not reintroduce a blanket "Continue anyway".
5. **Performance rules.** No `shadowBlur` in the per-frame path (use the
   pre-rendered glow sprites). Particles/trail/popups/rings are fixed-size
   ring buffers; arrays use in-place `compact()`, never `.filter()` per frame.
   Settings are cached in `OPT` — no DOM reads in the loop.
6. **No daily modifier may disable a core verb.** `NOJUICE` used to remove
   Juice Mode outright; it is now `JUICERUSH`, which changes it instead.
7. **Saves are sanitised on load** (`adopt()`). Don't bypass it.
8. **`REACH` is the reachability budget**, derived from the real physics
   constants (single jump ~158px/120px, double ~262px/213px). The NODBL caps
   (120px/88px) sit under it with a timing margin. Loosen a clamp and
   `genvalidate.mjs` will fail.
9. **Read `docs/ART-DIRECTION.md` before any visual change.** One ink
   colour (`#41230F`), one shading recipe (`body()`), one eye rig
   (`eyes()`), no `shadowBlur` in the frame path. Canvas text is always
   drawn through `outText()` or on a `chip()` — bare text fails on at
   least three of the eight worlds.
10. **`makeGlow()` must fade to its own colour at alpha 0**, never to
    transparent black. Canvas gradients interpolate un-premultiplied.
11. **The Juice Mode cap is absolute** — enforced in both `juiceLen()` and
   `extendJuice()`. Only crystals extend, and only while already juiced.
12. **`stunLen(b)` is the single definition of the boss weak-point window.**
    The HUD bar and the state machine both read it; they had drifted before.
13. **Hero prices came from `test/economy.mjs`, not intuition.** If you change
    coin income, re-run it — the target is a first paid hero in 10–20 minutes
    for an average player.
14. **The `seeded()` PRNG was investigated and is fine.** Don't "fix" it.

---

## 9. Known limitations / open risks

* **No real iPhone or Android hardware was ever used.** Every mobile result is
  Chromium device emulation (iPhone 13, Pixel 5, iPad gen 7). Real iOS Safari
  audio-unlock, real haptics, 120Hz ProMotion timing, thermal and battery
  behaviour all still need a device pass. **Do not claim otherwise.**
* The 30-minute soak ran headless with software GL — not a proxy for phone
  thermals or battery.
* The economy model rests on *measured* pickup density (12.7 orbs / 0.68
  crystals per 100m, from the real generator) but *assumed* collection rates
  per skill level. Those assumptions are stated in `test/economy.mjs` and
  should be checked against real telemetry.
* Portrait is supported and playable but has genuinely less forward
  visibility than landscape.

---

## 10. Suggested next steps

Not started, roughly in priority order:

1. **Real-device QA on iOS and Android** — still the single biggest gap,
   and now it also covers the redesigned render path: check the font
   fallback on a cold offline launch, thermals over 20 minutes, and that
   the ink line does not look muddy on an OLED at low brightness.
2. Export the store icon set from the master SVG in `<head>` and produce
   the Play feature graphic (`docs/ASSET-PROMPTS.md` §6).
3. Capture store screenshots — `test/shots.mjs` already drives the frames.
4. Add balance assertions for the three new abilities (triple jump,
   grape blast, pineapple slam) to `test/balance.mjs`.
5. Privacy policy and the age-rating questionnaire.
6. Localisation — all strings are still inline English.
7. Optional: paint the art. `docs/ASSET-PROMPTS.md` specifies every asset
   and §7 explains the one-function swap per character.
8. Explicitly **out of scope** and still not present: ads, IAP, online
   accounts, leaderboards, cloud saves, revive flow, multiplayer.

---

## 11. Suggested opening prompt for the new chat

> I'm continuing work on Jump Juice, a single-file HTML5 endless runner.
> I've attached the full project. Read `START-HERE.md` first — it is the
> complete handoff, and `docs/ART-DIRECTION.md` before any visual change. `jumpjuice.html` is the canonical source; `split/` and
> `dist/` are generated by `node test/split.mjs` and
> `node test/build-artifact.mjs`. Do not edit generated files, do not rebuild
> the game from scratch, and do not remove working features. All test suites
> currently pass. Nothing has been verified on real phone hardware.
>
> [then state what you want done]
