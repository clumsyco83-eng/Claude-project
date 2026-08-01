# Jump Juice Adventure — audit report

Deliverable: `jumpjuice.html` (single file, 2533 lines, 129 KB, no runtime dependencies).
Baseline for comparison: commit `ae4c263`.
Verification: `node test/smoke.mjs --device=<desktop|edge|iphone|android|tablet>` — 60 assertions,
**60/60 on all five profiles**. Screenshots in `shots/`.

---

## 1. Every bug found

### Critical — broke a whole system

| # | Bug | Effect |
|---|---|---|
| B1 | `save()`/`load()` only spoke to `window.storage`, a sandbox-host API that does not exist in Safari or Chrome | **Nothing was ever saved in a real browser.** Best distance, coins, XP, unlocks, missions, awards all lost on every reload |
| B2 | `new (AudioContext\|\|webkitAudioContext)()` — a bare identifier under `"use strict"`. If `AudioContext` is undefined this throws `ReferenceError` *before* `webkitAudioContext` is consulted; the wrapping `try/catch` then set `AC=null` permanently | Silent failure, no diagnostic, no retry |
| B3 | `AC.resume()` was never called anywhere | iOS Safari and Android Chrome hand back a **suspended** context. Nothing ever started it |
| B4 | Bare WebAudio on iOS plays on the *ringer* channel | The hardware Silent switch mutes the whole game |
| B5 | No recovery after the context was suspended/interrupted (app switch, incoming call) | One app-switch silenced the rest of the session permanently |
| B6 | Music scheduler was an unbounded `setInterval` catch-up loop. After a background/suspend, `AC.currentTime` jumps seconds ahead while `mnext` stays behind | The `while` loop scheduled **thousands** of oscillators in one tick — audio-thread stall |
| B7 | Daily modifier `NOJUICE` disabled Juice Mode outright, ~1 day in 6, signalled only by 9px text at canvas y=102 — which in portrait lands in the letterbox, hundreds of px from the action | **This is why Juice Mode "appeared to be missing."** 2026-07-31 is a NOJUICE day |
| B8 | Boss `hover` held a fixed screen offset (`camX + 0.74·W` ≈ 380px ahead of the player), permanently out of reach. Only `swoop` was damageable, and nothing communicated that | **This is why the boss seemed unkillable** |
| B9 | `boss.t` was reset on every state transition, so the despawn test `boss.t > 1900` could never fire | The boss **never** left. It shadowed the player forever, lobbing fireballs |
| B10 | `SAVE.unlocked` / `SAVE.sel` defaulted to `"VISOR"`, which is not one of the 30 runner ids | A fresh save had **zero** runners unlocked; the roster showed Blip greyed out at cost ◈0 |
| B11 | Void respawn used `P.lastSafe`, which could already have been culled behind the camera, and dropped the player at `lastSafe.y - 60` over open air | A single fall could **drain every heart in ~2 seconds** |

### Major

| # | Bug | Effect |
|---|---|---|
| B12 | Juice meter kept accumulating *during* Juice Mode | The instant it expired it was already ≥100 and re-fired — Juice Mode never actually ended while orbs kept coming |
| B13 | Juice HUD bar hard-coded `juice/480`, but `juiceLen()` returns 720 with the `juicelong` passive | Bar drew at 150% width and overflowed its track |
| B14 | Bullet-time was faked by skipping every third `step()` while airborne in Juice Mode. Juice Mode also grants infinite jumps, so players are airborne nearly the whole time | The game visibly **stuttered exactly when it was meant to feel best** |
| B15 | HUD drawn in raw canvas coordinates. In portrait the canvas is up to 1300px tall for a 450px band | Hearts, score, dash meter and boss health bar were **marooned in the letterbox**, hundreds of px from the action |
| B16 | `touch-action:none` on `html,body` intersects down through descendants | **The runner roster and menus could not be scrolled on any phone** — 30 runners in a `46vh` scroll box, unreachable |
| B17 | Boss draw skipped `st === "dead"` | Boss blinked out of existence — no death animation, no explosion, no victory |
| B18 | `dash` passive ("dash lasts 60% longer") was keyed to `SAVE.sel === "BOLT"`, a nonexistent runner id | Dead code. Bird, Ninja and Fox had **no passive at all** |
| B19 | Laser beam hitbox was the full 22px body height; the drawn beam is an 8px sliver | Players took hits from visibly empty space |
| B20 | Laser telegraph line drew 90px; the beam spans the entire screen width | Danger zone under-drawn by an order of magnitude |
| B21 | Boss unlock pushed to `SAVE.unlocked` with no `save()` | Unlock lost if the tab closed before dying |
| B22 | `boss.hurt = 42` (0.7s invuln) on top of a ~2.3s attack cycle | Even a player who understood the trick needed a very long time for 3 hits |
| B23 | Crystal monster health bar drew `f.w * (f.hp/4)` but max HP is 3 | A full-health crystal read as 75% damaged |
| B24 | Vine became lethal the frame the player came within 74px, with no wind-up | Unavoidable ambush |
| B25 | Mimic platforms ("k") were pixel-identical to safe ground | Pure gotcha, unlearnable |
| B26 | Award `a6` said "Unlock every runner" but tested `unlocked.length >= 6` of 30 | Text and test disagreed |
| B27 | Two separate `keydown` listeners registered | Every key press ran the handler chain twice |
| B28 | `#rot` orientation overlay: 8 lines of CSS + a `@keyframes` shipped, never referenced by any markup | Dead code; no orientation handling existed |
| B29 | Tutorial did not exist; no victory state existed | — |
| B30 | `Object.assign(SAVE, JSON.parse(...))` with no validation | A corrupt save could inject `NaN`/wrong types/unknown ids straight into the loop |
| B31 | Fullscreen button called `el.webkitRequestFullscreen()` unguarded; iPhone Safari has no Fullscreen API | Threw, was swallowed, button silently did nothing |
| B32 | No auto-pause on backgrounding; `steer`/`prime` not cleared on blur | Returned to a run already in progress, sometimes with steering stuck on |
| B33 | Google Fonts stylesheet was render-blocking | First paint waited on the network |
| B34 | Rare events fired immediately after a boss kill (`nextEvt` never advanced) | Event banner over the victory beat |

### Performance

| # | Bug |
|---|---|
| B35 | `ctx.shadowBlur` set per orb (up to ~30 on screen), per glowing monster, on the boss, and on the player — the single most expensive 2D-canvas property on mobile GPUs |
| B36 | Trail re-ran the **full vector character draw** for each of up to 18 ghosts, every frame |
| B37 | Seven arrays rebuilt with `.filter()` every frame (`plats`, `orbs`, `foes`, `shots`, `parts`, `wx`, `trail`) — continuous GC churn |
| B38 | `parts` array unbounded |
| B39 | `saver()` and `calm()` did `getElementById` on every call — ~20 DOM lookups per rendered frame |
| B40 | Sky gradient object recreated every frame; juice vignette radial gradient recreated every frame |
| B41 | Three hex colour strings re-parsed every frame in the background lerp |
| B42 | Ice and conveyor checks each scanned the entire platform list per frame; monster contact tests ran for off-screen monsters |
| B43 | `roster` (30 vector portraits) repainted on every death |

### Non-bug, examined and left alone

The `seeded()` PRNG. I initially suspected bias because it rolled `NOJUICE` on 4 of the
next 7 days — but over 730 days the distribution is even (~122 each of 6) and
same-as-yesterday is 14.3% against 16.7% expected for a fair d6. That window was
simply unlucky. No change made.

---

## 2. Every fix made

**Audio (B2–B6):** window-qualified constructor; `resume()` on every gesture, on
`visibilitychange`, and on `focus`; a silent looping `HTMLAudioElement` (WAV generated
in-page, no external asset) started on first gesture to promote iOS to the
media/playback session; unlock wired to `pointerdown`/`touchend`/`mousedown`/`keydown`/`click`
at capture depth; the music scheduler is now driven from the render loop, bounded to 16
notes per tick, and re-anchors if it falls behind; a live `AudioContext` state readout
in the pause menu; a one-shot "Sound on" toast; an iPhone-specific note about the
Silent switch.

**Save (B1, B30):** `localStorage` is now the primary store, `window.storage` a
secondary write. Load path sanitises every field — numeric clamping, unknown runner ids
dropped, `unlocked` de-duplicated, never leaves the player with no runner.

**Juice Mode (B7, B12, B13, B14):** meter frozen while active; bar uses the live
`juiceMax`; `NOJUICE` replaced with `JUICERUSH` (triggers at 60%, burns 40% faster) so
no modifier can delete a core verb; bullet-time re-implemented as a smooth `timeScale`
on the accumulator instead of frame-skipping; ×2 damage while juiced; 1.5s wind-down
warning with its own sound; activation shockwave ring; HUD states what Juice Mode does.

**Boss (B8, B9, B17, B21, B22):** full redesign, see §6.

**Mobile (B15, B16, B31, B32, B33):** HUD anchored to the play band; `touch-action:pan-y`
on overlays and roster; `visualViewport`-based sizing with debounce; portrait virtual
width 600→540 so the band renders ~12% larger; auto-pause and input reset on
background/blur; feature-detected fullscreen with an iOS "Add to Home Screen" hint;
async font load with a system fallback; `gesturestart`/`contextmenu`/`dblclick`
suppressed; 44px minimum touch targets.

**Correctness (B10, B11, B18–B20, B23–B28, B34):** all fixed as described above.

**Performance (B35–B43):** pre-rendered radial-gradient glow sprites replace every
`shadowBlur` in the hot path; the character body is rasterised once per frame and the
trail blits it; fixed-size ring buffers for particles, trail, popups and rings (zero
runtime allocation); in-place array compaction; cached settings flags; cached sky
gradient and juice vignette; pre-parsed world colours; the platform the player is
standing on is recorded at landing instead of re-scanned; off-screen culling on
monster, platform and orb loops; lazy roster repaint; adaptive quality watchdog that
drops expensive layers if the device can't hold ~50fps.

---

## 3. Gameplay improvements

- First-run tutorial: 5 contextual prompts (jump → double jump → steer → dash → juice),
  device-appropriate wording, skips any step the daily modifier has made impossible
  (the double-jump step under `NODBL` was otherwise an unsatisfiable soft-lock).
- Boss fight is now learnable — see §6.
- Daily modifier surfaced on the start screen and in the HUD, and switchable off.
- Floating text feedback: damage numbers, `PERFECT`, `+N` pickups, heart loss, zone
  names, `ENRAGED`, `JUICE MODE`.
- Conveyor platforms show their direction; mimic platforms show a hairline crack;
  vines have a 20-frame visible wind-up; laser telegraphs match their real reach.
- Volume slider; monsters flash white when hit; crystal HP bar reads correctly.
- Two new awards for the boss, plus a real "unlock all 30" award.
- "Tap to run again" is now literally true — the original wired restart only to the
  canvas, which the overlay covers, so it never fired on touch.

## 4. Mobile-specific fixes

Menus scroll on touch · HUD hugs the action instead of the letterbox · bigger play band
in portrait · `visualViewport` sizing survives the iOS toolbar · safe-area insets on
every layer · auto-pause on app switch · audio survives app switch · silent-switch
mitigation · no pinch-zoom, long-press menu or double-tap zoom · 44px targets ·
non-blocking rotate hint · fullscreen feature-detected with an iOS fallback ·
async font · saver mode caps DPR at 1 · adaptive quality.

## 5. Performance improvements

Zero `shadowBlur` in the per-frame path · trail cost cut from ~18 full vector character
draws to 18 `drawImage` blits · zero per-frame array allocation (was 7 arrays/frame) ·
zero per-frame DOM reads (was ~20) · cached gradients and parsed colours · bounded
particle/trail/popup/ring pools · off-screen culling on all entity loops · single-pass
ground-contact lookup · lazy roster repaint · adaptive quality watchdog · DPR capped at
2 (1 in saver). Measured 60fps sustained in headless Chromium on a **software**
rasteriser (swiftshader), which is a floor, not a ceiling, for real GPU hardware.

---

## 6. How the boss fight works

**The Sky Tyrant.** Appears at 350m, then every +550m. HP = 5 + 2 per prior kill this run.

```
warn ─▶ hover ─▶ aim ─▶ (fire) ─▶ hover ─▶ aim ─▶ charge
                                                    │
         stun ◀───────────── swoop ◀────────────────┘
          │
          └─▶ hover …
```

- **warn** (1.7s) — screen pulses red, siren, an arrow marks the approach edge. First-time
  players also get *"DODGE THE DIVE — THEN STOMP THE GREEN CORE"*.
- **hover / aim** — out of reach, firing telegraphed fireballs. Each shot is preceded by a
  dashed red line drawn from the Tyrant to the player, so it can be sidestepped.
- **charge** (~0.9s) — it retreats to the right edge and a **flashing lane is drawn across
  the whole screen at the player's height**, labelled `DODGE`. This is the read.
- **swoop** — it dives along that lane. Contact hurts, *unless* you stomp it, dash through
  it, or are in Juice Mode.
- **stun** (2.6s, 1.8s when enraged) — **the guaranteed damage window.** It crashes to a
  reachable height right beside the player, snapped on-screen (verified: 155/155 frames
  on-screen and inside jump range). Its core glows green, a bouncing arrow and the word
  `STOMP!` sit over it, its eyes go dazed, and a countdown bar shows how long you have.
  Any contact damages it. The 26-frame hit gate means a confident player can land **up to
  five hits in one window** — so the whole fight can end in a single stun if you commit.

**Feedback:** white hit flash, screen shake, 3-frame hitstop, a floating damage number,
a shockwave ring, and a segmented health bar (one tick per hit) with a white "ghost"
chunk trailing the drain, anchored inside the play band. Stomping a *stunned* Tyrant
deals double.

**Phase 2** at ≤50% HP: `ENRAGED` — faster dives, three-way fireball spread, shorter stun.

**Death:** three staged explosions over ~2.8s with slow-motion and hitstop, then a
fanfare, `SKY TYRANT DEFEATED`, the orb reward, and a **guaranteed runner unlock**
(saved immediately). If you never engage, `boss.life` — which no state transition
resets — retires it after 65s with `TYRANT RETREATS`, so it can no longer hound you.

## 7. How Juice Mode works

**Filling it.** The meter fills from orbs (+3.4), crystals (+26), perfect landings (+4,
or +12 with the `perfect` passive) and enemy hits (+6, +18 for elites). The HUD bar
turns white above 88%.

**While active** (8s, 12s with `juicelong`, 4.8s under the `JUICERUSH` daily modifier):
rainbow-cycling body, glow, a longer rainbow trail, a hue-cycling screen vignette,
a shockwave ring and 30-particle burst on activation, plus a brief smooth slow-motion
beat. Mechanically: **invincible**, **infinite jumps**, **×2 damage**, **4.2× magnet
radius**, **+2 orb multiplier**, and the music adds its top layer. The HUD spells all of
this out and counts the remaining seconds.

**Ending.** At 1.5s remaining the bar flashes white, a descending arpeggio plays and
`JUICE ENDING` floats up. The meter is frozen at 0 for the whole duration, so it ends
cleanly instead of instantly re-firing.

## 8. Start-to-finish completion

Verified by `test/smoke.mjs` on **desktop 1280×800, Edge 1536×864, iPhone 13, Pixel 5,
iPad gen 7** — 60/60 assertions on each, zero JS errors, zero unhandled rejections.

The full loop is exercised end to end: boot → menu → start → audio unlock → tutorial →
movement/jump/double-jump/dash → orb collection → Juice Mode activate/expire → boss
spawn → all six boss states → damage → kill → reward → unlock → persistence → void
respawn → run-over → restart. Also asserted: no `NaN`/`Infinity` anywhere in game state,
bounded object counts, HUD inside the play band, no soft-lock in the tutorial, boss
always reachable during its stun window, and progress surviving a reload.

Because this is an endless runner, "completion" means: the run loop never soft-locks,
never crashes, and the boss — the only win condition in the game — is reliably
defeatable. Both confirmed on desktop and mobile.

**One honest caveat.** The iOS Silent switch mutes WebAudio at the OS level. The silent
media-element trick promotes the page to the media session and works on iOS 15+, but it
is a mitigation, not a guarantee — no web page can override that hardware switch on
every iOS build. The pause menu therefore shows the live `AudioContext` state and, on
iPhone, a note to check the switch. If the readout says `running` and you still hear
nothing, it is the switch or the volume, not the game.

---

# Upgrade pass (2026-08-01)

Requested: hero abilities, Juice Mode as the game's identity, a clearer and
more varied boss fight, an expanded awards menu, a Juice Lab, more menu
personality, and the HUD moved to the top of the screen.

## HUD
Moved to the **top of the screen** (previously the top of the play band,
which on a tall phone parked the cluster in the middle of empty sky). It
clears the notch via a `env(safe-area-inset-top)` probe converted into
canvas units. Left column stacks from a running cursor so an absent row
never leaves a gap. Boss health is now **hearts**, recoloured per boss,
with the boss name and `PHASE n/3`. Dash, combo and the active hero
ability sit bottom-right — they were briefly at the top, where they
collided with the pause button.

## Heroes (5 headliners + 30 upgraded)
| Hero | Ability |
|---|---|
| Blip (Classic) | balanced |
| Bolt | +25% speed, Juice Mode 40% shorter |
| Frost | enemies move 45% slower, immune to ice |
| Inferno | ×2 damage, but floatier and harder to control |
| Nature | +60% juice from everything collected |

Every existing passive was rewritten to be felt rather than subtle
(magnet tripled, etc.), and the active ability is named on the HUD.
Verified: Bolt is measurably faster than Classic, Nature's meter gain is
>1.5× Classic's, Inferno's damage is exactly double.

## Juice Mode
Transformation (1.24× scale + orbiting aura), a **landing shockwave that
damages every nearby enemy and the boss**, a 48-frame slow-motion
entrance with hitstop, double points called out on screen, a colour that
brews and cosmetics retint, and a 1.5s wind-down warning.

## Bosses — 4 kinds, 3 phases each
`JUICE MONSTER` (tentacled maw) · `FLAME DJINN` (fire elemental) ·
`TERRA REX` (horned brute) · `CYCLOPS EYE` (lashed orb). Own silhouette,
palette, projectile and minion type each; they rotate by zone, and the
first boss of a run is always the Juice Monster.

Phases: **1** projectiles → **2** spawns minions (one arrives with the
phase announcement, so the mechanic is always seen) → **3** rage: faster
dives, 4-way spread, shorter stun. The dodge→punish loop is unchanged:
telegraphed dive lane, then a stunned window with a glowing green core.

## Juice Lab
🍓 🥭 🍋 🥝 drop in runs and from bosses. Brew ⚡ Lightning (+35% speed
while juiced), 💪 Mega (wider shockwave, +25% meter) or 🌈 Rainbow (60%
longer, triple orbs). One brew is equipped at a time and consumed on use.

## Juice Journey
15 awards including 1000m, 2000 drops, ×25 combo, first boss, 10 bosses,
all 30 heroes, brew-them-all, harvest 50 fruit, and **play 7 days in a
row** (real streak tracking). Awards unlock 5 Juice Mode glow skins.

## Menu personality
`Runners` → **Juice Heroes** · `Awards` → **Juice Journey** · new
**Juice Lab**.

## Verification
`test/features.mjs` — 34 new assertions, all passing.
`test/smoke.mjs` — 60 assertions × 5 device profiles, all passing.
`test/hostile.mjs` — 19 crippled-environment cases, no hangs.
