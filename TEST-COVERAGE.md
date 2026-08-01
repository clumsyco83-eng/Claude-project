# Jump Juice Adventure — test coverage analysis

What the suite actually exercises, measured rather than estimated, and where
the next tests are worth writing.

Measured with `node test/coverage/run.mjs`, which runs `smoke` (desktop),
`features` and `hostile` **unmodified** and records V8 coverage of the two
inline `<script>` blocks in `jumpjuice.html`.

---

## 1. What exists today

| Suite | Drives | Size | Runs on |
|---|---|---|---|
| `test/smoke.mjs` | boot, audio, movement, Juice Mode, boss loop, void respawn, perf, touch-target CSS, lifecycle | 60 assertions | one device per invocation — `desktop` unless told otherwise |
| `test/features.mjs` | hero abilities, boss phases, Juice Lab, awards, menu copy | 34 assertions | iPhone 13 only |
| `test/hostile.mjs` | 19 crippled-browser boots | 19 cases, one assertion each ("did the loading screen clear") | iPhone 13 only |
| `test/shots.mjs` | screenshots at 4 sizes | **no assertions** | — |
| `test/build-artifact.mjs` | emits `dist/jumpjuice-artifact.html` | prints 3 checks, **always exits 0** | — |

That is a genuinely good harness for what it aims at: it drives the real game
in a real browser with no mocks, and the systems it covers — audio unlock,
backgrounding, the boss state machine, the void-respawn heart drain — are the
ones that were actually broken. Nothing below argues with the assertions that
exist. All 113 currently pass.

## 2. Measured coverage

```
bytes:     102328 / 142350   (71.9% executed)     one full run
functions: 167 / 229         (72.9% entered)
```

Two full runs measured 71.9% and 72.7%; their union is 73.7%. **That spread is
itself the first finding** — see §3.3. Everything below is the union of both
runs, so nothing here is "untested" merely because one run got unlucky.

The headline number flatters the suite. 34 of the 62 never-entered functions
are the per-hero portrait `draw()` callbacks, which only run when the Heroes
screen is opened — and a coverage bit would not tell you they drew anything
sensible anyway. The useful output is the list of contiguous regions that
**never executed in either run**:

| Lines | System that never runs |
|---|---|
| 1312–1332 | **`pointerdown` / `pointermove` — the entire touch control scheme.** Tap-to-jump, slide-to-steer, swipe-to-dash |
| 1659–1662 | wall jump |
| 1743–1748 | picking a fruit up off the ground |
| 1806–1813 | `spirit` monster AI |
| 2125–2136 | **the rare-event spawner — all six events** |
| 2240–2254 | conveyor, mimic and spike platform rendering |
| 2282–2339 | `batbot`, `crystal`, `ghost`, `vine` and `spirit` rendering |
| 2545 / 2622 | the `flame` and `rex` boss bodies |
| 2853–2877 | `paintRoster` — the roster screen, all 34 portraits, and the buy-a-hero click |
| 2893 / 2911 | brew click, glow-skin click |
| 2946–2982 | most menu button handlers, the volume slider, the fullscreen button |
| 290–300 | the `roundRect` polyfill for older Safari |

Read as systems rather than lines: **the primary control scheme on the target
platform, the enemy roster, the hazard roster, the events, the store and most
of the menu are untested** — and the damage model, below, is worse than
untested.

## 3. Why the gaps are structural, not incidental

These are not five tests someone forgot. Five properties of the harness make
whole systems untestable as it stands.

**3.1 `keepAlive()` makes damage unobservable.** Every long-running loop in
`smoke` and `features` calls `d.keepAlive()` (`hp=hpMax; iFr=max(iFr,4)`) every
40–60 ms, because a key-mashing bot cannot survive a procedural runner. That is
the right call for testing the boss loop — but it means the damage model is
never *observed*, only occasionally *touched*: `hurt()`'s body executed in one
of the two measured runs and not the other, purely by chance, and no assertion
looks at it either way. The only deliberate damage path in the suite is
`voidPlayer()`, which bypasses `hurt()` entirely.

**3.2 The debug hook is the only lever, and it is missing most of the verbs.**
`JJA_DEBUG` can force a boss, fill the meter and grant fruit. It cannot force a
daily modifier, an event, a monster type, a platform type, a save state or the
date. Anything not reachable through those eleven methods is reachable only by
waiting for `Math.random()` to cooperate — which is why the enemy and hazard
rows above are blank.

**3.3 Nothing is pinned — not the clock, not the RNG.** `rollMod()`,
`rollMissions()` and `rollStreak()` are seeded from `today()`: on the day this
was measured the modifier was `JUICERUSH`, and `FAST`, `ONEHEART` and `MADNESS`
never executed. Five of the six daily modifiers are untested on any given day,
a different five tomorrow, and `smoke.mjs` prints which one it happened to get.
The 7-day streak award cannot be tested at all without control of the clock.
World generation and spawn rolls run on a raw `Math.random()`, which is why two
identical runs of the same suite differ by ~0.8% of the file: `vine` and
`laser` AI, `cubebot` rendering and `hurt()` each ran in exactly one of the two
runs. Any assertion about them today would be a flaky test; that is the reason
none exists.

**3.4 Assertions check state, not pixels.** `features.mjs` asserts *"boss kind
'flame' spawns and renders"* — and it passes while `bossBody`'s flame branch
never executes, because the assertion only checks that `state.boss` is
non-null 260 ms after spawning, while the boss is still off-screen in `warn`.
`shots.mjs` produces the images that would settle it, but compares them to
nothing.

**3.5 There is no runner.** No `package.json`, no CI, no script that runs
everything. `smoke.mjs` supports five device profiles; nothing invokes the
other four, so "60 × 5, all passing" is a claim maintained by hand. Both
Playwright and Chromium are absolute paths into `/opt`, so the suite runs on
this container and nowhere else.

## 4. Four defects the missing tests would already have caught

Found while reading for this analysis, all in the untested regions:

1. **`jumpjuice.html:749`** — award `a9` reads *"Unlock all 30 runners"*; the
   roster is 34 (`chk` uses `CHARS.length`, so the check is right and the text
   is wrong). `AUDIT.md` fixed exactly this class of bug in `a6` one commit
   earlier, and it came straight back when the roster grew.
2. **`dist/hosted-sim.html` is a release behind.** It was last built at
   `5a4426e`, before the upgrade pass: no Juice Lab, no FLAME DJINN. No script
   regenerates it and no test loads it. (`dist/jumpjuice-artifact.html` *is*
   in sync — verified by rebuilding and diffing.)
3. **`test/build-artifact.mjs` cannot fail.** It prints `external refs (must be
   none)` and `wrapper tags present (must be none)` and then exits 0 regardless.
   A re-introduced font CDN link would print a warning into a log nobody reads.
4. **The `fireproof` passive is on no hero.** It is declared in `PASS` and
   `ABIL` and honoured at `jumpjuice.html:1852`, but no entry in `CHARS` selects
   it — it is reachable only through the three `random` heroes, at 1-in-15. This
   is how the `dash` passive died (`AUDIT.md` #5); nothing would notice if
   `fireproof` went the same way.

## 5. Proposals, in the order worth doing them

### P0 — the target platform's controls, and the damage model

**5.1 `test/touch.mjs` — drive the game the way a phone does.**
The project's whole narrative is "it must work on a phone", the mobile profiles
exist, and every one of them types on a keyboard. Playwright's
`page.touchscreen` / `page.mouse` with `hasTouch` profiles can exercise the real
handlers:

- tap the canvas → `jumps` increments, `usedTouch` flips, guide text switches to the touch strings
- press-and-drag right → `steer > 0`, player accelerates; release → `steer === 0`
- drag beyond `RANGE` → steer clamps at 1 and the anchor re-bases (the `prime.ax` logic)
- swipe down >`FLICK`px within 420 ms → `dashCd > 0`; slower drag → no dash
- `pointercancel` mid-drag → `steer` returns to 0 and `jumpHeld` clears (the stuck-steer bug in `AUDIT.md` #1)
- `oInv` on → steering inverts

No new hooks needed. ~15 assertions, and it covers the single largest
never-executed region in the file.

**5.2 `test/damage.mjs` — let the player get hit.**
Needs two hooks: `hurtNow(reason)` (call `hurt()` directly) and `spawnFoe(kind,
dx, dy)`. Then assert what the audit's fixes actually claim:

- a hit costs exactly one heart, sets 95 i-frames, and zeroes the combo
- a second hit inside the i-frame window costs nothing
- `juice > 0` and `P.dash > 0` each grant immunity
- the last heart routes to `die()`, which shows `ovDead`, banks coins/XP, and persists
- **the laser beam hitbox matches the drawn 8px sliver** (`REPORT.md` B-list) — currently asserted nowhere
- **the vine's 20-frame rise is harmless and frame 21 is not** — likewise
- spikes hurt and bounce; `fireproof` blocks a `fire` shot and not a `meteor`
- `ONEHEART` starts at 1 and dies to one hit

This is the highest-value block in the list: it is the game's failure model, it
has ~8 documented past bugs in it, and not one assertion looks at it.

**5.3 Force the daily modifier.** One hook — `setMod(k)` calling `rollMod`'s
assignment and `start()` — turns a system that is 1/6 testable per day into one
that is fully testable every day. Assert each of the six changes exactly what it
says and nothing else: `NODBL` caps `maxJ` at 1 *and* skips tutorial step 2,
`ONEHEART` sets `hpMax` 1, `FAST` raises top speed, `DASHONLY` drains `dashCd`
4× faster, `MADNESS` raises the elite and spawn rates, `JUICERUSH` moves the
threshold to 60 and shortens `juiceLen`. Plus the invariant `smoke.mjs` already
has the right instinct about: no modifier removes a core verb.

### P1 — the systems that hold the player's data

**5.4 `test/save.mjs` — `adopt()` as a unit.** `hostile.mjs` proves a corrupt
save doesn't *hang the boot*; nothing checks what it *becomes*. With a
`loadFrom(obj)` hook, assert the sanitiser's actual contract: `best:"NaN"` → 0,
negative coins clamped, `unlocked:"Blip"` (string, not array) → `[DEF_SEL]`,
unknown hero ids dropped, `sel` not in `unlocked` → falls back, duplicate
unlocks deduped, unknown brew → `""`, `msProg` short array → four zeroes, a
future-shaped save round-trips unchanged. ~20 assertions, no timing, fast.

**5.5 `test/economy.mjs` — coins, XP, purchases.** The payout code runs on
every `die()` and is asserted nowhere; the purchase path never runs at all.
`die()`'s payout (`orbs_ + crys*10`, ×1.5 with `rich`, +150 past 500 m), the
`level()` curve including the `n++<400` guard, mission completion paying 200/120
once and not twice, award completion paying 300 once, and the purchase path in
`paintRoster` — buy with enough coins (deducts, unlocks, selects, persists), buy
with too few (no deduction, snack shown). Needs the Heroes screen opened, which
also drags all 34 portraits into coverage.

**5.6 `test/invariants.mjs` — content assertions, no browser.** The cheapest
test in the list: parse `jumpjuice.html` (or read the arrays through
`JJA_DEBUG`) and assert what the content must satisfy. Every hero's `pas` is a
key of `PASS`; every passive is on at least one hero; every award's text agrees
with its `chk` (the `a9` bug, catchable by asserting any number in the text
matches the constant it compares against); `BOSS_ORDER` entries all exist in
`BOSSES`; `WORLDBAG` entries all exist in `MON`; every `BREWS` cost key is a
`FRUIT`; `SKINS.need` values are inside `ACH.length`. Runs in a second, no
Playwright, and would have caught two of the four defects in §4.

### P2 — breadth

**5.7 Enemy and hazard matrix.** With `spawnFoe(kind)` and `spawnPlat(type)`
hooks, walk all 10 monsters and all 7 platform types through one shared shape:
it spawns, it steps for 120 frames without a JS error or a NaN, it can be
damaged (or is `nostomp`), it is culled behind the camera, and it renders (see
5.9). Five monster types and three platform types never rendered in either
measured run, and `spirit` never stepped at all.

**5.8 Events.** `forceEvent(kind)` × 6. Assert the rainbow event builds its arc
of platforms and orbs, meteor/crystal/ufo push into the right array with bounded
counts, tornado applies its drift, and every event clears itself and re-arms
`nextEvt`. Currently the whole spawner is dead code as far as the suite knows.

**5.9 Turn `shots.mjs` into a regression test.** It already captures the right
moments; it just throws them away. Commit baselines and compare with a pixel
ratio tolerance, masking the animated regions (particles, weather, the boss's
sine bob) — or, cheaper and less brittle, assert *coverage of the renderer*:
spawn each boss kind and each monster, then check via a canvas draw-call spy
that the intended branch ran. That is what would have caught the "renders"
assertion in §3.4 being hollow.

**5.10 Brew and passive matrix.** `features.mjs` tests 4 of 17 passives and 1 of
3 brews. `probeGain`/`probeDamage` already show the pattern; extend it to
`magnet` (radius), `heal` (a heart at 400 m ×6), `startjuice` (meter 50 at
`start()`), `heart`/`rich` (hpMax ±1), `juicelong` and `rainbow` (`juiceLen`),
`mega` (shockwave radius 128 and +25% gain), `icegrip` (no ice slide).

### P3 — harness health

**5.11 Make the deliverables testable.**
- `build-artifact.mjs` should `process.exit(1)` when its own checks fail.
- Add a build test that loads `dist/jumpjuice-artifact.html` in Chromium and
  runs a trimmed smoke pass against it — the shipped file has never been booted
  by a test.
- Either regenerate `dist/hosted-sim.html` from a script and assert it is in
  sync with `jumpjuice.html`, or delete it. A stale build in `dist/` is worse
  than none.

**5.12 Give the suite a runner.** A `package.json` with
`test:smoke` (looping all five profiles), `test:features`, `test:hostile`,
`test:build`, `test` (all of them), plus a `SessionStart` hook so web sessions
can run it. Resolve Playwright from `node_modules` with the `/opt` path as a
fallback, so the suite is not container-specific.

**5.13 Make it deterministic.** Two hooks retire most of the flakiness surface:
`setToday(str)` (drives `rollMod`/`rollMissions`/`rollStreak`, and makes the
7-day streak award testable) and `setSeed(n)` (a swappable `Math.random` for
generation and spawn rolls, so "walk 2000 m and assert nothing NaNs" becomes a
reproducible test rather than a coin flip). Both are debug-gated, so neither
ships.

## 6. Suggested `JJA_DEBUG` additions

Everything above needs eight small, read-mostly hooks, all inside the existing
`?debug=1` gate:

| Hook | Unlocks |
|---|---|
| `setMod(k)` | §5.3 — 6 daily modifiers |
| `hurtNow(reason)` | §5.2 — damage, i-frames, death |
| `spawnFoe(kind, dx, dy)` | §5.2, §5.7 — 10 monsters |
| `spawnPlat(type)` | §5.7 — ice, conveyor, mimic, crumble, bounce, spike, moving |
| `forceEvent(kind)` | §5.8 — 6 rare events |
| `loadFrom(obj)` | §5.4 — save migration as a unit |
| `setToday(str)` | §5.13 — dailies, missions, streak |
| `setSeed(n)` | §5.13 — reproducible generation |

## 7. Suggested order

1. `invariants.mjs` (§5.6) — an afternoon, no browser, catches real bugs now
2. `build-artifact.mjs` exit code + the stale `hosted-sim.html` (§5.11)
3. `touch.mjs` (§5.1) — biggest untested region, no new hooks
4. `hurtNow`/`spawnFoe` hooks + `damage.mjs` (§5.2) — the game's failure model
5. `setMod` + modifier suite (§5.3), `save.mjs` (§5.4)
6. `package.json` + runner + CI (§5.12), then the P2 breadth suites

Re-run `node test/coverage/run.mjs` after each to see what actually moved. The
byte percentage is not the goal — the never-executed region list is.
