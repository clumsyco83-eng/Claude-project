# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this repo is

**Jump Juice Adventure** — a single-file HTML5 endless runner. The entire game
lives in `jumpjuice.html`: ~3060 lines, ~157 KB, Canvas 2D, hand-rolled WebAudio,
`localStorage` saves. **Zero runtime dependencies and no build step for the game
itself** — open the file in a browser and it runs.

It is *not* a level-based platformer. One continuous procedurally generated run
across 7 rotating biomes, scored in metres, ending when hearts run out. Bosses
recur from 350 m, then every +550 m. Core loop: **fill the meter → trigger JUICE
MODE → go further.** `AUDIT.md` §"Genre note" maps the original level-based brief
onto the systems that actually exist — read it before acting on any request
phrased in terms of "Level 1", "fruit", or "victory screen".

Node + Playwright are used only for the test harness and the hosted build.

## Layout

| Path | What |
|---|---|
| `jumpjuice.html` | **The game.** The only file that matters to ship. Everything below is support. |
| `test/smoke.mjs` | 60 assertions × 5 device profiles — the main regression suite |
| `test/features.mjs` | 34 assertions covering the upgrade pass (heroes, bosses, Lab, HUD) |
| `test/hostile.mjs` | 19 crippled-browser cases — proves boot can never hang |
| `test/shots.mjs` | Screenshot capture at real device sizes → `shots/` |
| `test/build-artifact.mjs` | Produces `dist/jumpjuice-artifact.html` |
| `dist/jumpjuice-artifact.html` | Generated body-only build for hosting. **Never hand-edit** — regenerate. |
| `dist/hosted-sim.html` | Stale one-off local wrapper from commit `4769ca6`, pre-upgrade. Not produced by any script; do not treat it as current. |
| `REPORT.md` | Every bug found (43) + every fix, and the upgrade log |
| `AUDIT.md` | System-by-system checklist of all 37 systems |
| `shots/`, `shots2/` | Screenshots on iPhone / Android / desktop |

There is no `package.json`, no lockfile, no linter config. Don't add one unless
asked — the "no build step" property is a deliberate feature of this project.

## Commands

```bash
node test/smoke.mjs --device=desktop    # desktop | edge | iphone | android | tablet
node test/features.mjs
node test/hostile.mjs                   # slow: 19 browser contexts × ~4 s
node test/shots.mjs                     # → shots/
node test/build-artifact.mjs            # → dist/jumpjuice-artifact.html
```

All currently pass: **60×5 + 34 + 19 cases, zero JS errors, no boot hangs.**

Playwright lives at `/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Both paths are hard-coded
in the test files; if a test fails to launch, check those paths first.

**Before committing a change to `jumpjuice.html`, run at minimum
`node test/smoke.mjs --device=iphone` and `node test/features.mjs`.** Boot-path or
capability-detection changes also require `node test/hostile.mjs`. If the change
affects what ships, regenerate `dist/jumpjuice-artifact.html` and commit it — the
committed artifact is expected to be byte-identical to a fresh build.

The harness needs no network. A font request to `fonts.googleapis.com` fails in
the offline sandbox; smoke.mjs reports it separately as non-fatal (the font is
loaded async with a system fallback).

## Testing hook

Append `?debug=1` to the URL to expose `window.JJA_DEBUG` — a read-mostly `state`
getter plus `restart()`, `keepAlive()`, `setHero(id)`, `fillJuice()`,
`forceBoss()`, `spawnKind(k)`, `hitBoss()`, `bossTo(hp)`, `giveFruit(n)`,
`brew(k)`, `setDist(m)`, `voidPlayer()`, `probeGain(n)`, `probeDamage()`,
`reachableBoss()`. Defined at the bottom of the file, gated behind the query
param so shipped builds never expose it.

**The harness drives the real game — there are no mocks.** When you add a system,
surface whatever the tests need through `JJA_DEBUG.state` rather than
restructuring game code for testability. `keepAlive()` heals only; it must never
restart the run, or tests will silently pass against a fresh run.

## Architecture of `jumpjuice.html`

Read top to bottom; each section is delimited by a `/* ══════ NAME ══════ */`
banner comment. Order:

1. **`<head>`** — meta, async webfont link, all CSS. Overlays use
   `visibility`/`opacity` (not `display`) so they cross-fade, with
   `pointer-events:none` while hidden so canvas taps pass through.
2. **Body markup** — `#wrap` > `#game` canvas, one `.ov` overlay per screen
   (`#ovStart`, `#ovDead`, `#ovChars`, `#ovLab`, `#ovAch`, `#ovPause`), plus
   `#rot` (portrait hint), `#boot` (loading screen), `#snack` (toast).
3. **Boot watchdog** — a **separate `<script>` before the game**, so it is armed
   even if the game's own script throws at the top level.
4. **The game** — one IIFE. In order: helpers/device probes → `OPT` →
   viewport/`resize()` → save (`SAVE`/`adopt()`/`load()`/`save()`) → audio →
   Juice Lab → missions/awards → `CHARS` (34 hero sprites) → `ABIL`/`PASS` →
   `WORLDS` → physics constants → run state + pools → sprite caches → input →
   world gen → daily modifier → tutorial → run lifecycle → `step()` → rings →
   bosses → rare events → `draw()` → boss render → HUD → frame loop → UI paint →
   boot → test hook.

**Simulation/render split.** `frameLoop(now)` accumulates real time, runs
`step()` at a fixed 60 Hz (max 5 catch-up steps), then `draw()` once. Slow motion
is a smooth `timeScale` applied to the accumulator — never by skipping `step()`
calls. In saver mode `draw()` runs every other frame; `step()` never skips.

**State lives in module-level `let`s** — `ST` (`"menu"|"play"|"dead"`), `frame`,
`dist`, `juice`, `meter`, `hp`, `boss`, the `P` player object, and the entity
arrays. There is no state container and no framework; keep it that way.

## Conventions and invariants

These are load-bearing. Each one exists because it was a shipped bug (see
`REPORT.md`).

1. **Boot can never hang.** The failsafe is registered *before* any risky startup
   work; a 2.5 s timer force-dismisses the loading screen. Every canvas
   acquisition is null-tolerant — iOS returns `null` from `getContext()` under
   memory pressure, which used to kill the whole IIFE. Keep new startup work
   inside the existing `try`/`catch`, and after touching the boot path run
   `test/hostile.mjs`.

2. **No `shadowBlur` in the per-frame path.** Use the pre-rendered glow sprites
   (`GLOW_ORB`, `GLOW_CRY`, `GLOW_JUICE`, …) via `glow()`. `makeGlow()` returns
   `null` rather than throwing when a browser refuses another context.

3. **Zero per-frame allocation.** Particles, trail, popups and rings are
   fixed-size ring buffers (`spark()`, `pop()`, `ring()`). Entity arrays use
   in-place `compact(arr, keep)` — never `.filter()` in the loop. Cache anything
   derived from a colour or size behind a key check (see `skyGrad`, `RSPR`).

4. **No DOM reads in the loop.** Settings are mirrored into `OPT` by
   `syncOpts()`; read `OPT`, `calm()`, `saver()`.

5. **All juice gain funnels through `gainJuice()`** — orbs, crystals, perfect
   landings, enemy hits. Passives and brews multiply there and nowhere else.
   Same idea for colour: `juiceHueBase()` / `juiceCol()` are the single source of
   truth for the Juice Mode tint across body, aura, rings, vignette and HUD.

6. **The HUD is anchored to the top of the *screen*, not the play band.** It
   clears the notch via `safeTop`, converted from `env(safe-area-inset-top)` in
   `readSafeTop()`. Dash / combo / ability sit bottom-right because at the top
   they collided with the pause button. `test/features.mjs` asserts
   `safeTop + 4 < WY`.

7. **No daily modifier may disable a core verb.** The original `NOJUICE` removed
   Juice Mode ~1 day in 6 and was the reason it "appeared missing"; it is now
   `JUICERUSH`, which *changes* it (threshold 60 instead of 100). The tutorial
   skips its double-jump step under `NODBL`, which would otherwise soft-lock.

8. **Saves are sanitised on load by `adopt()`** — numeric clamping, unknown hero
   ids dropped, never leaves the player with no hero. Don't bypass it. Storage
   key is `jja2`; all `localStorage` access is wrapped (Safari private mode
   throws on access, not just on write).

9. **Audio only initialises on a real gesture.** Every plausible first-gesture
   surface calls `resumeAudio()`. Music is a bounded scheduler driven from the
   render loop (`musicTick()`), not `setInterval` — an unbounded scheduler ran
   away when the tab was backgrounded. Add sound cues as new `case` labels in
   `sfx(k, x)`; do not create oscillators elsewhere.

10. **`seeded()` was investigated and is fine** (14.3 % same-as-yesterday vs
    16.7 % expected for a fair d6). Don't "fix" it.

11. **The boss must stay killable.** Its loop is
    `warn → hover → aim → charge → swoop → stun → hover`; `stun` is the
    guaranteed damage window and parks it inside jump range. If you touch boss
    movement, verify with `JJA_DEBUG.reachableBoss()` — the previous design was
    effectively unkillable.

12. **iOS will not run this from a file.** iOS Quick Look renders HTML+CSS but
    never executes scripts, and iOS Safari cannot open local `file://` HTML at
    all. The loading screen carries a *pure-CSS* hint that appears after 5 s,
    because with scripts blocked no JS watchdog can fire. Keep that hint
    JS-free.

## Code style

Match what is there: terse, dense, no semicolon-free experiments, single-letter
locals in hot loops, `const`/`let` (never `var`) outside the boot watchdog.
Comments are used sparingly but substantively — they explain *why* a thing is
shaped the way it is, usually naming the bug that forced it. Prefer that style to
restating what the line does. No TypeScript, no modules, no bundler in the game
file; the test files are ESM `.mjs`.

## Hosted build

`node test/build-artifact.mjs` emits a body-only build for hosts that own the
document head. It (a) strips wrapper tags, (b) removes the font CDN link and
makes the system stack explicit — a strict CSP would block the CDN into a silent
fallback, and (c) injects the viewport meta from script, without which iOS Safari
lays out at 980 px and the play area renders tiny. The script self-checks for
external refs and wrapper tags; both must report `none`.

## Git workflow

- Develop on `claude/claude-md-documentation-wwdyk4`; push with
  `git push -u origin claude/claude-md-documentation-wwdyk4`.
- The prior audit/upgrade work is on `claude/jump-juice-full-audit-u4r4lj`.
- Baseline `ae4c263` is the original unmodified game, kept for diffing.
- Commit messages are short imperative summaries of player-visible effect
  ("Fix hang on the loading screen; make boot unhangeable and self-diagnosing").
- Don't open a PR unless asked.

## Documentation upkeep

When you change the game, update the docs that make claims about it:
`REPORT.md` (bug/fix log and system explanations), `AUDIT.md` (the 37-system
table), `HANDOFF.md` (the cold-start summary), and this file. Assertion counts
quoted in prose must match what the suites actually print.

## Open ideas, not built

- Level-based mode (`Tutorial → Level 1 → … → Victory`) — a redesign, not a fix
- Deeper Juice Lab: recipe discovery, permanent upgrade levels per juice
- Two more bosses (one per biome); boss-specific arenas
- Music that changes per biome rather than only per juice state
