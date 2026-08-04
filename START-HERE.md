# START HERE — Jump Juice Adventure

**Paste this file into a new chat first.** It is the complete cold-start
context: what the project is, which files matter, what state it is in, what
was just changed, and what is left.

---

## 0. The one-paragraph version

Jump Juice Adventure is a **single-file HTML5 endless runner** — Canvas 2D,
hand-rolled WebAudio, `localStorage` saves, zero runtime dependencies, no
build step required to play. The core loop is **fill the meter → trigger
JUICE MODE → go further**. `jumpjuice.html` is the whole game and the only
file you edit; everything in `split/` and `dist/` is generated from it. It is
**feature-complete and ship-ready**: seven worlds each with their own boss and
their own music, and an installable, offline-capable PWA build. All eight test
suites pass — 275 assertions. **Nothing has been tested on real phone
hardware**, which is the one genuinely open item.

---

## 1. Repository and branch

```
repo   : clumsyco83-eng/Claude-project
branch : claude/project-completion-ul0dcd
```

Earlier work lives on `claude/jump-juice-full-audit-u4r4lj` and
`claude/jump-juice-polish-balance-eeikjx`. This branch supersedes both.

---

## 2. File map — what is source, what is generated

| Path | Role |
|---|---|
| `jumpjuice.html` | **CANONICAL SOURCE — the entire game. Edit ONLY this.** |
| `split/index.html`, `split/jumpjuice.css`, `split/boot.js`, `split/jumpjuice.js` | **GENERATED** by `node test/split.mjs` |
| `split/README.md` | Hand-maintained (the one exception in `split/`) |
| `dist/jumpjuice-artifact.html` | **GENERATED** body-only build for hosting |
| `dist/pwa/` | **GENERATED** installable build — *this is what you deploy* |
| `dist/hosted-sim.html` | Hosting simulation harness |
| `test/*.mjs` | Test and build scripts (Playwright-driven) |
| `README.md` | Run/build/deploy/test, balance tables, world+boss+music table |
| `REPORT.md` | Full bug log across all four passes (48 bugs) |
| `AUDIT.md` | System-by-system checklist — 40 systems |
| `HANDOFF.md` | Systems overview + gotchas |
| `PRIVACY.md`, `STORE.md` | Launch collateral |
| `shots/`, `shots2/`, `shots3/` | Screenshots from earlier passes |
| `shots4/` | Current: all seven bosses, one per world |

> **The #1 way to break this project:** editing a file in `split/` or `dist/`.
> They are overwritten by the next build, and until then the builds silently
> disagree. Edit `jumpjuice.html`, then re-run the builds.

---

## 3. Rules that will break the game if changed

1. **`boot.js` must load before `jumpjuice.js`.** It is the watchdog that
   catches a top-level throw in the game and shows a recovery screen. Reverse
   the order and a startup crash leaves the spinner running forever.
2. **Both must stay classic scripts.** No `type="module"`, no `defer`/`async`.
   Modules are deferred and blocked by CORS on `file://`, so the game would
   silently never start when the file is opened by double-clicking.
3. **Service-worker registration must stay guarded to `http(s)`.**
   `register()` throws a `SecurityError` on `file://` — a top-level throw
   during boot, which is exactly what rule 1 exists to catch.

---

## 4. How to run, build, deploy and test

```bash
# run
xdg-open jumpjuice.html            # single file (double-clicking works)
xdg-open split/index.html          # split build
npx http-server . -p 8080          # served — REQUIRED for iOS Safari

# build (re-run split after every edit to jumpjuice.html)
node test/split.mjs                # -> split/
node test/build-artifact.mjs       # -> dist/jumpjuice-artifact.html
node test/build-pwa.mjs            # -> dist/pwa/   (installable)

# deploy: upload dist/pwa/ to any static host over HTTPS.
# HTTPS is required — service workers refuse to register without it
# (except on localhost), so the game would load but never install.

# test
node test/smoke.mjs --device=iphone   # 60 assertions x 5 profiles
node test/features.mjs                # 48 — heroes, bosses, music, Lab, awards
node test/hostile.mjs                 # 19 crippled-browser cases
node test/balance.mjs                 # 83 — the balance/systems contract
node test/pwa.mjs                     # 25 — manifest, SW, icons, real offline play
node test/genvalidate.mjs             # 10k + 10k procedural fairness sweep (~50s)
node test/economy.mjs                 # coins/min + time-to-unlock simulation
node test/soak.mjs --min=30           # long-run memory/stability
```

Every script accepts `--file=split/index.html` to run against the split build.
**`test/pwa.mjs` is the exception** — it serves `dist/pwa/` over real HTTP,
because service workers, manifests and installation are all inert on
`file://`. Run `node test/build-pwa.mjs` first.

**Environment the tests need:** Playwright at
`/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. If those paths differ in
a new environment, update the `executablePath` and the import at the top of
each `test/*.mjs`.

---

## 5. Debug mode

Append `?debug=1`. Off for normal players. Gives an on-screen overlay (FPS,
objects, distance, difficulty stage, speed multiplier, modifier, velocity,
dash cooldown, juice timer, meter, hearts, hero, control scheme, boss state),
hitbox outlines, and `window.JJA_DEBUG` — the surface every test harness
drives:

```
state  restart()  keepAlive()  setHero()  setMod()  setScheme()
fillJuice()  extend()  juiceLenOf()  forceBoss()  holdBoss()  hitBoss()
setWins()  worldStart()  spawnKind()  voidPlayer()  setDist()  genSeq()
density()  economy()  diffAt()  stageAt()  turbo()  holdDash()
steerThenHold()  probeGain()  probeDamage()  sfx()  sfxKeys()  musicProbe()
```

`state` is a **read-only snapshot** — assigning to it does nothing. That is
why `setWins()` and `setDist()` exist.

---

## 6. Current state — what the last pass changed

### Every world has its own boss (7, was 4)

| World | Boss | Projectile | Minion |
|---|---|---|---|
| FOREST | JUICE MONSTER | blob | slime |
| MOUNTAIN | TERRA REX | rock | spikey |
| ICE | **FROST TITAN** | shard | crystal |
| STORM | **STORM DRAKE** | bolt | laser |
| VOLCANO | FLAME DJINN | fire | spirit |
| SKY | **CLOUD KRAKEN** | gust | batbot |
| SPACE | CYCLOPS EYE | beam | eye |

Four bosses used to rotate on a 4-cycle against a 7-world cycle — coprime, so
the pairing drifted through every combination and the Flame Djinn, tagged
`BORN IN THE VOLCANO`, regularly turned up in the ice. The first boss of a run
is still always the Juice Monster; after that you fight the one that belongs
to where you are.

### Every world has its own music (8 themes)

Seven world themes plus a boss theme that overrides the world's wherever the
fight happens. Each names its own key, mode, tempo, oscillators, bass rhythm
and lead level — all as the same four-part texture, so a world transition is a
key change, not a different song. Juice Mode lifts the tempo ×1.17 on top.

### It installs and plays offline

`node test/build-pwa.mjs` → `dist/pwa/`. Manifest, cache-first service worker,
16 icons, 18 iOS launch images, install screenshots. In-game Install button;
iOS gets Share-sheet instructions since it never fires
`beforeinstallprompt`. This is the real fix for the iOS problem the project
carried from the start.

### 5 bugs fixed (44–48 in REPORT.md)

1. **Fire immunity applied to ice and lightning.** `fireSafe` keyed off the
   physics class, and every straight-flying boss shot shares `k === "fire"`.
2. **Every boss threw the same orange fireball** regardless of who threw it.
3. **Death text said "BURNED" for a snowball.**
4. **Boss contact said "THE SKY TYRANT GOT YOU"** — a placeholder naming none
   of the seven bosses.
5. **Restarting during a boss fight kept the boss theme** over the opening
   forest.

---

## 7. Verification status

| Suite | Result |
|---|---|
| `smoke.mjs` × 5 device profiles | 60/60 each = 300 |
| `features.mjs` | 48/48 |
| `balance.mjs` | 83/83 |
| `hostile.mjs` | 19/19, no hangs |
| `pwa.mjs` | 25/25 (includes killing the server and replaying offline) |
| `genvalidate.mjs` | 122,555 platforms, 0 invalid |
| `economy.mjs` | first paid hero 13.2 min — inside the 10–20 target |
| `soak.mjs` | heap flat, 0 errors |

All suites pass against **both** `jumpjuice.html` and the regenerated
`split/` build.

---

## 8. Things to know before changing anything

1. **`jumpjuice.html` only.** Re-run `node test/split.mjs` after every edit,
   and `node test/build-pwa.mjs` before running `test/pwa.mjs`.
2. **The HUD is anchored to the top of the *screen*, not the play band.** It
   clears the notch via `safeTop`. An earlier pass anchored it to the band,
   which parked it in empty sky on tall phones.
3. **Boot can never hang, and a fatal error must never offer a way in.**
   `window.__jjaFatal` latches so a late `bootDone()` cannot wipe the message.
   Do not reintroduce a blanket "Continue anyway".
4. **Performance.** No `shadowBlur` in the per-frame path (use the pre-rendered
   glow sprites). Particles/trail/popups/rings are fixed-size ring buffers;
   arrays use in-place `compact()`, never `.filter()` per frame. Settings are
   cached in `OPT`, and the music theme in `curMus` — **no lookups inside
   `musicTick()`**, it runs every rendered frame.
5. **No daily modifier may disable a core verb.** `NOJUICE` used to remove
   Juice Mode outright; it is now `JUICERUSH`, which changes it instead.
6. **Saves are sanitised on load** (`adopt()`). Don't bypass it.
7. **`REACH` is the reachability budget**, derived from the real physics
   constants. Loosen a clamp and `genvalidate.mjs` will fail.
8. **The Juice Mode cap is absolute** — enforced in both `juiceLen()` and
   `extendJuice()`. Only crystals extend, and only while already juiced.
9. **`stunLen(b)` is the single definition of the boss weak-point window.**
   The HUD bar and the state machine both read it; they had drifted before.
10. **Boss behaviour is roster data, not `boss.k ===` checks.** A boss's
    world, eye count and aura live in `BOSSES`. Adding one means a roster row
    plus a painter in `bossBody()` — nothing else.
11. **A projectile's `k` is its physics, `bk` is its identity.** `k` is
    `"meteor"` (arcs) or `"fire"` (flies straight). Anything asking *what a
    shot is* must read `bk`, or it will treat lightning as fire — bug 44.
12. **Hero prices came from `test/economy.mjs`, not intuition.** If you change
    coin income, re-run it.
13. **The `seeded()` PRNG was investigated and is fine.** Don't "fix" it.
14. **The first boss is due at 350m, which is inside the second world.** Any
    test that jumps into a world will spawn one unless it calls `holdBoss()`.
    This cost a debugging cycle; the failing output looked like a music bug.

---

## 9. Known limitations / open risks

* **No real iPhone or Android hardware was ever used.** Every mobile result is
  Chromium device emulation (iPhone 13, Pixel 5, iPad gen 7). Real iOS Safari
  audio-unlock, real haptics, 120Hz ProMotion timing, thermal and battery
  behaviour all still need a device pass. **Do not claim otherwise.**
* **The install flow has not been through a real home-screen install.**
  `beforeinstallprompt` cannot be fired synthetically. What is proven: the
  manifest is valid and complete, the worker registers and caches, the game
  genuinely replays with the server dead, and our button logic does not throw.
  Tapping Install on a real phone is untested.
* The soak runs headless with software GL — not a proxy for phone thermals.
* The economy model rests on *measured* pickup density but *assumed*
  collection rates per skill level, stated in `test/economy.mjs`.
* Portrait is supported and playable but has genuinely less forward
  visibility than landscape.
* All strings are inline English.

---

## 10. Suggested next steps

1. **Real-device QA on iOS and Android** — the single biggest gap, and the
   only claim in this repo no test can back.
2. Localisation (all strings are inline English).
3. If a native store listing is wanted rather than PWA install: Bubblewrap/TWA
   for Play, Capacitor for the App Store. `dist/pwa/` is the input to both,
   and `STORE.md` has the listing copy ready.
4. Ideas explored and deliberately not built: a level-based mode, deeper Juice
   Lab (recipe discovery, permanent upgrades), boss-specific arenas.
5. Explicitly **out of scope** throughout and still absent: ads, IAP, online
   accounts, leaderboards, cloud saves, lucky spins, mystery chests,
   multiplayer.

---

## 11. Suggested opening prompt for a new chat

> I'm continuing work on Jump Juice Adventure, a single-file HTML5 endless
> runner. Read `START-HERE.md` first — it is the complete handoff.
> `jumpjuice.html` is the canonical source; `split/` and `dist/` are
> generated. Do not edit generated files, do not rebuild the game from
> scratch, and do not remove working features. All test suites currently
> pass. Nothing has been verified on real phone hardware.
>
> [then state what you want done]
