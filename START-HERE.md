# START HERE — Jump Juice Adventure handoff

**Paste this file into a new chat first.** It is the complete cold-start
context: what the project is, which files matter, what state it is in, what
was just changed, and what is left to do.

Everything referenced here is in this zip.

---

## 0. The one-paragraph version

Jump Juice Adventure is a **single-file HTML5 endless runner** — Canvas 2D,
hand-rolled WebAudio, `localStorage` saves, zero runtime dependencies, no
build step required to play. The core loop is **fill the meter → trigger
JUICE MODE → go further**. `jumpjuice.html` is the whole game and the only
file you edit; everything in `split/` and `dist/` is generated from it. The
last work done was a polish and balance pass (2026-08-03) that fixed 13
confirmed bugs and retuned Juice Mode, difficulty, the daily modifiers, the
heroes and the economy. All test suites pass. **Nothing has been tested on
real phone hardware.**

---

## 1. Repository and branch

```
repo   : clumsyco83-eng/Claude-project
branch : claude/jump-juice-polish-balance-eeikjx
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
| `AUDIT.md` | System-by-system checklist of all 37 systems |
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

### 13 confirmed bugs fixed

1. **Fatal boot screen let you into a dead engine.** "Continue anyway"
   dismissed the overlay even after a fatal failure (null canvas), replacing
   the explanation with a frozen black screen.
2. **A startup throw erased its own error** — `catch` called `reveal()` then
   `bootDone()`, hiding the message ~0ms later.
3. **No player setting was ever persisted** — all 7 reset on every reload.
4. **No Double Jump generated impossible terrain** — 211px gaps against a
   158px single-jump reach; 150px rises against a 120px apex.
5. **Boss stun-window bar lied in phase 3** — HUD assumed 155 frames, the
   state machine closed the window at 95.
6. **Falling bypassed `hurt()`** — skipped the shield, i-frames and the
   hearts-remaining readout.
7. **`bossSeen` leaked across runs.**
8. **`FAST` was labelled "Double speed" but ran ×1.34.**
9. **Inferno and Slayer shared one "×2 damage" passive.**
10. **Two paid heroes had no passive at all** (Cactus, Squid).
11. **Crystals were wasted during Juice Mode** — the meter is frozen while
    juiced, so `gainJuice(26)` did nothing.
12. **`fireproof` was defined but assigned to no hero.**
13. Duplicated comment block in the boss renderer.

### Balance now in force

| | Before | After |
|---|---|---|
| Juice Mode (standard) | 480f / 8.0s | **720f / 12.0s** |
| Juice Mode (Bolt) | 288f / 4.8s | **585f / 9.75s** |
| Juice hard cap | none | **900f / 15.0s** |
| Juice extension | none | **+0.5s per crystal, while juiced only** |
| Difficulty | `min(dist/1600,1)` linear | **5 interpolated stages to 6000m** |
| Turbo Day (`FAST`) | ×1.34, mislabelled ×2 | **×1.25 + 40% coins** |
| UNCOMMON hero | 900 | **18,000** |
| MYTHIC hero | 36,000 | **720,000** |
| Boss reward | `600 + 250n` | **`300 + 90n`** |
| Boss HP | `6 + 2n` uncapped | `6 + 2n`, **capped 18** |
| Mission / achievement | 200 / 300 | **2,600 / 2,500** |

Bolt's shorter window is compensated: **+30% meter gain**, **×3** juiced score
multiplier. Inferno is now `firelord` (fire immunity + flame-burst landings);
damage belongs to Slayer alone, which gains +1 into a stunned boss. New
passives: `aircontrol`, `shield`, `walljump`, `combo`, `fruity`.

Difficulty stages: 1 (0–400m, d 0→0.10) · 2 (400–1000m, →0.34) ·
3 (1000–2000m, →0.62) · 4 (2000–3500m, →0.86) · 5 (3500m+, →1.00).

### Controls

Dash was a downward **flick** that shared input space with steering. It is now
a deliberate **170ms hold**, resolved on the frame clock (a still finger emits
no `pointermove`, so a move-driven test could never have fired). Steering past
the threshold permanently cancels a pending dash; releasing early cancels it,
so dash never fires on release. A charge ring shows it arming.

A second **on-screen button scheme** was added (steering pad left, separate
jump and dash right, ≥56px, safe-area aware) and is saved with the other
settings. Both schemes clear all held input on blur, tab-hide, pause and
rotation. Rotating auto-pauses a live run.

### Saves

Settings now live in `SAVE.opt` (`snd, vib, calm, bat, inv, mod, vol, scheme`)
behind an `optsReady` gate so startup cannot overwrite a real save. `adopt()`
coerces every field; a save with **no `opt` block** lands on validated
defaults; an unknown scheme falls back to `gesture`.

> **Consequence to remember:** saves are fully preserved — coins, heroes, XP,
> achievements and unlocks all carry over, nothing is taken away — but because
> prices were rescaled, a returning player's banked coins buy fewer *new*
> heroes than before.

---

## 7. Verification status

| Suite | Result |
|---|---|
| `smoke.mjs` × 5 device profiles | 60/60 each = 300 |
| `features.mjs` | 36/36 |
| `hostile.mjs` | 19/19 (stricter contract) |
| `balance.mjs` | 82/82 |
| `genvalidate.mjs` | 10,000 + 10,000 sequences, **304,356 platforms, 0 invalid** |
| `economy.mjs` | first paid hero 13.3 min — inside the 10–20 min target |
| `soak.mjs --min=30` | 30 min, 46 km, heap 9.5MB→9.5MB (ratio 1.00), 0 errors |

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
9. **The Juice Mode cap is absolute** — enforced in both `juiceLen()` and
   `extendJuice()`. Only crystals extend, and only while already juiced.
10. **`stunLen(b)` is the single definition of the boss weak-point window.**
    The HUD bar and the state machine both read it; they had drifted before.
11. **Hero prices came from `test/economy.mjs`, not intuition.** If you change
    coin income, re-run it — the target is a first paid hero in 10–20 minutes
    for an average player.
12. **The `seeded()` PRNG was investigated and is fine.** Don't "fix" it.

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

1. **Real-device QA on iOS and Android** — the single biggest gap.
2. Store-launch prep: app icons, splash screens, screenshots, store copy,
   a privacy policy, and a wrapper decision (PWA install vs Capacitor shell).
3. Localisation — all strings are currently inline English.
4. Ideas explored but deliberately not built: a level-based mode, deeper Juice
   Lab (recipe discovery, permanent upgrades), two more bosses with their own
   arenas, per-biome music.
5. Explicitly **out of scope** for the last pass and still not present: ads,
   IAP, online accounts, leaderboards, cloud saves, lucky spins, mystery
   chests, multiplayer.

---

## 11. Suggested opening prompt for the new chat

> I'm continuing work on Jump Juice Adventure, a single-file HTML5 endless
> runner. I've attached the full project. Read `START-HERE.md` first — it is
> the complete handoff. `jumpjuice.html` is the canonical source; `split/` and
> `dist/` are generated by `node test/split.mjs` and
> `node test/build-artifact.mjs`. Do not edit generated files, do not rebuild
> the game from scratch, and do not remove working features. All test suites
> currently pass. Nothing has been verified on real phone hardware.
>
> [then state what you want done]
