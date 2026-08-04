# Jump Juice Adventure

A single-file HTML5 endless runner. Zero runtime dependencies, no build step
to play. Canvas 2D, hand-rolled WebAudio, `localStorage` saves.

**Core loop:** fill the meter → trigger **JUICE MODE** → go further.

---

## Which files are source, and which are generated

| Path | Role |
|---|---|
| `jumpjuice.html` | **CANONICAL SOURCE.** The whole game. Edit this. |
| `split/*` | **GENERATED** from `jumpjuice.html` by `test/split.mjs` (except `split/README.md`) |
| `dist/jumpjuice-artifact.html` | **GENERATED** body-only build for hosting, by `test/build-artifact.mjs` |
| `dist/pwa/*` | **GENERATED** installable build, by `test/build-pwa.mjs` — this is what you deploy |
| `test/*.mjs` | Test + build scripts |
| `PRIVACY.md`, `STORE.md` | Launch collateral: privacy policy and store copy |

Never edit `split/` or `dist/` by hand — the next build overwrites them, and
until then the builds drift apart.

## How to run locally

```bash
# simplest: open the single file
xdg-open jumpjuice.html          # or just double-click it

# the split build
xdg-open split/index.html

# served (needed for iOS Safari, which cannot open local file:// HTML)
npx http-server . -p 8080        # then visit http://localhost:8080/
```

## How to build

```bash
node test/split.mjs              # jumpjuice.html -> split/
node test/build-artifact.mjs     # jumpjuice.html -> dist/jumpjuice-artifact.html
node test/build-pwa.mjs          # jumpjuice.html -> dist/pwa/  (installable)
```

Always re-run `test/split.mjs` after editing `jumpjuice.html`, or the split
build ships stale code.

## How to test

```bash
node test/smoke.mjs --device=iphone   # 60 assertions x 5 device profiles
node test/features.mjs                # 48 assertions: heroes, bosses, music, Lab, awards
node test/hostile.mjs                 # 19 crippled-browser cases — boot can't hang
node test/balance.mjs                 # 83 assertions: the balance/systems contract
node test/pwa.mjs                     # 25 assertions: manifest, SW, icons, real offline play
node test/genvalidate.mjs             # 10k + 10k procedural fairness sweep
node test/economy.mjs                 # coins/min + time-to-unlock simulation
node test/soak.mjs --min=30           # long-run memory/stability soak
```

Every script accepts `--file=split/index.html` to run against the split build.
`test/pwa.mjs` is the exception: it serves `dist/pwa/` over real HTTP, because
service workers, manifests and installation are all inert on `file://`. Run
`node test/build-pwa.mjs` first.

## How to deploy

```bash
node test/build-pwa.mjs          # -> dist/pwa/
# then upload dist/pwa/ to any static host over HTTPS
```

HTTPS is required — service workers refuse to register over plain HTTP on any
origin except `localhost`, so without it the game loads but never installs and
never works offline. GitHub Pages, Netlify drop and Cloudflare Pages all give
you HTTPS by default and need no configuration.

Once served, the game is installable: Android and desktop Chromium show an
install prompt (and the in-game **Install** button triggers it), and on iOS
**Share ▸ Add to Home Screen** gives the same result. Installed, it launches
fullscreen with no browser chrome and runs with no network at all.

## Debug mode

Append `?debug=1` to the URL. This is **off for normal players** and gives:

* an on-screen overlay: FPS, live object count, distance, **difficulty stage**,
  `d` value, speed multiplier, active modifier, player velocity, dash cooldown,
  Juice timer + extension, meter, hearts, hero + passive, control scheme, and
  full boss state
* **hitbox outlines** for the player, every platform, every enemy, and the boss
  weak point
* `window.JJA_DEBUG` — the state surface the test harnesses drive, including
  `setMod()`, `setScheme()`, `genSeq()`, `density()`, `economy()`, `diffAt()`,
  `stageAt()`, `juiceLenOf()`, `holdDash()` and `extend()`

---

## Orientation support

**Both orientations are supported. Landscape is recommended, not required.**

* Landscape is the reference presentation: the virtual width scales to the
  aspect ratio (620–1400px), giving the most read-ahead.
* Portrait is fully playable: a narrower 540px virtual width with a taller
  band, which renders the action ~12% larger on a phone held upright.
  Forward visibility is smaller than landscape but sufficient.
* The rotate banner is **advisory only**. It is a non-blocking bottom banner,
  shown on the menu only, never over live gameplay, and it never overlaps the
  Start button.
* Rotating **auto-pauses a live run**, clears every held input, and ignores
  taps until the viewport has settled, so a rotation can never cost a heart.
* Safe-area insets (`env(safe-area-inset-*)`) are respected by the HUD, the
  pause button, the overlays and the on-screen control pad.

## Control schemes

Chosen in **Pause → Touch controls**, and saved.

**A — Gestures (default)**
* tap anywhere = jump
* slide left/right = steer
* **hold still = dash** (charges over 170ms, with an on-screen charge ring)
* moving past the steer threshold cancels a pending dash
* releasing before the threshold cancels it — dash never fires on release
* only the first finger steers; a second finger still jumps

**B — On-screen buttons**
* ◀ ▶ steering pad bottom-left, ▲ jump and » dash bottom-right
* jump and dash are separate buttons, so they cannot be confused
* every target is ≥56px, semi-transparent, and clear of safe-area insets

Both schemes drop all held input on blur, tab-hide, pause and rotation.

---

## Balance reference

### Juice Mode

| Value | Frames @60Hz | Seconds |
|---|---|---|
| Standard hero | 720 | **12.00** |
| Bolt | 585 | **9.75** |
| Hard cap (all sources, extensions included) | 900 | **15.00** |
| Extension per crystal collected while juiced | +30 | **+0.50** |

Extensions come from **crystals only**, and only while Juice Mode is already
active — ordinary orbs cannot extend it, so it can never loop forever. The cap
is enforced in both `juiceLen()` and `extendJuice()`.

Bolt's shorter window is compensated: **+30% meter gain** (reaches Juice Mode
sooner) and **+1 on the juiced score multiplier** (×3 rather than ×2).

### Difficulty stages

Replaces the old single `min(dist/1600, 1)` ramp, which punished the opening
and then went flat at 1600m.

| Stage | Range | `d` | Character |
|---|---|---|---|
| 1 | 0–400m | 0.00 → 0.10 | beginner-safe, wide platforms |
| 2 | 400–1000m | 0.10 → 0.34 | normal runner challenge |
| 3 | 1000–2000m | 0.34 → 0.62 | advanced combinations |
| 4 | 2000–3500m | 0.62 → 0.86 | dense, decision-heavy |
| 5 | 3500m+ | 0.86 → 1.00 | prestige; complexity, not reaction time |

The curve is continuous (no cliff at a boundary), monotonic, and capped at 1.

### Worlds, bosses and music

Seven worlds rotate every 280m. Each owns **its own boss** and **its own music
theme**, so arriving somewhere new changes what you fight and what you hear,
not just the palette.

| World | Boss | Projectile | Minion | Key | BPM | Mode |
|---|---|---|---|---|---|---|
| FOREST | JUICE MONSTER | blob | slime | A | 124 | minor pentatonic |
| MOUNTAIN | TERRA REX | rock | spikey | G | 118 | minor pentatonic |
| ICE | FROST TITAN | shard | crystal | B | 112 | major pentatonic |
| STORM | STORM DRAKE | bolt | laser | F | 138 | phrygian |
| VOLCANO | FLAME DJINN | fire | spirit | E | 144 | minor pentatonic |
| SKY | CLOUD KRAKEN | gust | batbot | C | 126 | major pentatonic |
| SPACE | CYCLOPS EYE | beam | eye | D | 108 | whole tone |
| *(any, during a fight)* | — | — | — | C | 152 | chromatic |

The **first boss of a run is always the Juice Monster** — it is what the
tutorial and the game's identity point at. After that you meet the boss that
belongs to the world you are standing in. Bosses previously rotated on a
4-cycle against a 7-world cycle, so the Flame Djinn could turn up in the ice.

All eight music themes are the same four-part texture (bass · kick · mid ·
lead) re-voiced, which keeps a world transition a key change rather than a
different song starting mid-stride. The boss theme overrides the world's
wherever the fight happens, and Juice Mode lifts the tempo ×1.17 on top of
whichever theme is playing.

Adding a boss means adding one row to `BOSSES` (with its `world`, `eyes` and
`glow`) and one painter in `bossBody()`. The renderer reads the roster; it no
longer carries `boss.k === "flame"` special cases.

### Daily modifiers

| Key | Label | Effect |
|---|---|---|
| `FAST` | **Turbo Day** | **×1.25** world speed, **+40% coins** |
| `NODBL` | No double jump | single-jump-safe generation (see below) |
| `ONEHEART` | One heart | `hpMax = 1` |
| `JUICERUSH` | Juice at 60%, burns faster | threshold 60, duration ×0.6 |
| `MADNESS` | Monster madness | spawn rate .26 → .50, elite chance .08 → .16 |
| `DASHONLY` | Instant dash recharge | dash cooldown drains 4× |

`FAST` was labelled "Double speed" while the code ran ×1.34 — the label
promised a modifier that never existed. It is now an honest ×1.25 that pays
for its own risk.

### Reachability budget (derived from the real physics constants)

| | Horizontal | Apex |
|---|---|---|
| Single jump | ~158px | 120px |
| Double jump | ~262px | 213px |
| **NODBL generation cap** | **120px** | **88px** |

With No Double Jump active the generator could previously emit a **211px gap**
and a **150px rise** — both flatly impossible with one jump. It now clamps
gaps and climbs into single-jump range, widens landings to ≥72px, suppresses
the double-jump-only high road, and lowers floating crystals into reach.

Verified by `test/genvalidate.mjs` over 10,000 normal + 10,000 NODBL sequences.

### Hero balance

Costs were set from `test/economy.mjs` against **measured** earning rates.

| Rarity | Cost | Heroes |
|---|---|---|
| COMMON | 0 | 6 |
| UNCOMMON | 18,000 | 6 |
| RARE | 44,000 | 7 |
| EPIC | 100,000 | 7 |
| LEGENDARY | 220,000 | 5 |
| RAINBOW | 400,000 | 2 |
| MYTHIC | 720,000 | 1 |

Headline and changed heroes:

| Hero | Rarity | Passive | Effect | Weakness | For |
|---|---|---|---|---|---|
| Blip | COMMON | `none` | balanced baseline | no edge | first-timers |
| Frog | COMMON | `walljump` | wall jump ×1.12 height, ×1.38 push, refunds the jump | nothing else | vertical play |
| Crab | COMMON | `combo` | combo decays 2.5× slower (325f vs 130f) | no raw power | score chasers |
| Shroom | COMMON | `fruity` | 3× fruit spawn rate (.055 → .165) | no combat help | Juice Lab crafters |
| Cactus | UNCOMMON | `aircontrol` | +35% horizontal authority **in the air only** | no ground benefit | precision jumpers |
| Squid | RARE | `shield` | absorbs the first hit of every run (incl. falls) | once per run | learners |
| Bolt | RARE | `speed` | +25% speed, +30% meter gain, ×3 juiced multiplier | Juice Mode 9.75s | aggressive runners |
| Frost | EPIC | `slow` | enemies 45% slower, ice immune | no damage bonus | control players |
| Nature | EPIC | `harvest` | +60% juice from everything | fragile | Juice Mode focus |
| **Inferno** | LEGENDARY | `firelord` | **fire immune**; every landing bursts into flame (70px) | **no damage bonus** | aggressive crowd control |
| **Dino / Skull** | EPIC / LEGENDARY | `slayer` | ×2 damage, **+1 more into a stunned boss** | no defence | boss killers |

Inferno and Slayer previously shared the identical `power`/`slayer` "×2
damage" passive. Inferno is now the fire hero; damage belongs to Slayer alone.
No **paid** hero is left with `pas:"none"` — asserted by `test/balance.mjs`.

### Economy pacing (from `test/economy.mjs`)

Pickup density is **measured from the real generator** (~12.7 orbs and ~0.68
crystals per 100m). Run length is derived from the real speed (27 m/s) plus 8s
of between-run menu time.

| Player | Distance | Coins/run | Coins/min | Boss share |
|---|---|---|---|---|
| weak | 260m | 71 | 242 | 0% |
| average | 720m | 784 | 1,357 | 27% |
| skilled | 2100m | 3,767 | 2,635 | 46% |

**First paid hero: ~13.3 minutes** for an average player (target band 10–20).
The 15 achievements alone are worth 37,500 coins — 2.1× the first hero — so a
weaker player still gets a meaningful first-session unlock.

Boss rewards went from `600 + 250n` to `300 + 90n`, dropping bosses from
45–69% of all income to 27–46%, so boss-farming is no longer the only
rational strategy.

---

## Save structure & migration

Key: `localStorage["jja2"]`.

Progression: `best, coins, xp, unlocked[], sel, msDate, msProg[4], msDone[4],
ach{}, totalOrbs, juiceRuns, tut, bossKills, fruit{}, brew, brewed{}, streak,
lastDay, maxCombo, fruitTotal, skin`.

Settings (**new — these used to reset on every reload**):

```js
opt: { snd, vib, calm, bat, inv, mod, vol, scheme }
```

`adopt()` sanitises everything on load: numbers are clamped, unknown hero ids
dropped, the player is never left with no hero, an unknown control scheme
falls back to `gesture`, and a save with **no `opt` block at all** lands on
validated defaults. Progression is never touched by settings migration.

> **Note for returning players:** saves are fully preserved — every coin,
> hero, achievement and unlock carries over. What changed is *purchasing
> power*: hero prices were rescaled, so banked coins buy fewer new heroes than
> before. Heroes already unlocked are never taken away.

---

## Known limitations

* **Not verified on real iPhone or Android hardware.** All mobile testing was
  Chromium device emulation (iPhone 13, Pixel 5, iPad gen 7 profiles). Real
  iOS Safari audio-unlock behaviour, real haptics, and 120Hz ProMotion timing
  still need a device pass.
* iOS cannot run this from a `file://` URL at all, and iOS Quick Look never
  executes scripts — on iPhone it must be served from a web address.
* The 30-minute soak runs in headless Chromium with software GL, which is not
  a proxy for thermal behaviour or battery drain on a real phone.
* Portrait has genuinely less forward visibility than landscape. It is
  playable and supported, but landscape remains the better experience.

## Installing (PWA)

`node test/build-pwa.mjs` produces `dist/pwa/`, a complete installable build:

| Piece | What it does |
|---|---|
| `manifest.webmanifest` | name, icons, standalone display, theme colours, install screenshots |
| `sw.js` | cache-first service worker — the game runs with no network |
| `icons/` | 13 sizes + 2 maskable + `apple-touch-icon`, drawn from the game's palette |
| `splash/` | 18 iOS launch images (iOS ignores the manifest and flashes white without them) |

Icons are **rendered at build time**, not stored, so they cannot drift from
the game's own colours and the repo carries no binary nobody can regenerate.

The service worker caches each asset individually rather than via
`cache.addAll()`, which rejects the whole install if any single request 404s —
one missing icon would otherwise cost all offline support.

**The single file is unaffected.** Opened from disk it still runs exactly as
before: the manifest link 404s harmlessly and service-worker registration is
skipped, because `register()` throws a `SecurityError` on `file://` and that
would be a top-level throw during boot. Both are asserted in `test/pwa.mjs`,
not assumed.

## Remaining store-launch tasks

* **real-device QA on iOS and Android** — the one genuinely open item, and the
  only claim in this repo that no test can currently back
* localisation — all strings are currently inline English
* if a native store listing is wanted rather than PWA install: a Capacitor or
  Bubblewrap/TWA shell (the PWA build is the input to both)
