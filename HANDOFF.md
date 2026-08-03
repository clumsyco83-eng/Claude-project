# Jump Juice Adventure — handoff

Paste this into a new chat to pick the project up cold. The playable file is
`jumpjuice.html` — attach it alongside this document.

---

## What it is

A **single-file HTML5 endless runner**. 3064 lines, 153 KB, zero runtime
dependencies, no build step. Open the file and it runs. Canvas 2D, hand-rolled
WebAudio, `localStorage` saves.

It is **not** a level-based platformer — one continuous procedurally generated
run across 7 rotating biomes, scored in metres, ending when hearts run out.
Bosses recur from 350 m, then every +550 m.

**Slogan / core loop:** fill the meter → trigger JUICE MODE → go further.

## Files

| Path | What |
|---|---|
| `jumpjuice.html` | **CANONICAL SOURCE.** The whole game. Edit this and nothing else. |
| `split/*` | **GENERATED** by `test/split.mjs` (except `split/README.md`) |
| `dist/jumpjuice-artifact.html` | **GENERATED** body-only build for hosting |
| `README.md` | How to run/build/test, balance tables, orientation, save format |
| `test/smoke.mjs` | 60 assertions × 5 device profiles |
| `test/features.mjs` | 36 assertions covering the upgrade pass |
| `test/hostile.mjs` | 19 crippled-browser cases — proves boot can't hang |
| `test/balance.mjs` | 76 assertions — the balance/systems contract |
| `test/genvalidate.mjs` | 10k + 10k procedural fairness sweep, seeded |
| `test/economy.mjs` | coins/min + time-to-unlock simulation |
| `test/soak.mjs` | long-run memory/stability soak |
| `test/split.mjs` | jumpjuice.html → split/ |
| `test/build-artifact.mjs` | Produces the hosted build |
| `REPORT.md` | Full bug list + every fix, upgrade log, polish-pass log |
| `AUDIT.md` | System-by-system checklist of all 37 systems |
| `shots/`, `shots2/`, `shots3/` | Screenshots on iPhone / Android / desktop |

**Always re-run `node test/split.mjs` after editing `jumpjuice.html`,** or the
split build ships stale code.

## Commands

```bash
node test/smoke.mjs --device=iphone     # desktop | edge | iphone | android | tablet
node test/features.mjs
node test/hostile.mjs
node test/balance.mjs
node test/genvalidate.mjs               # 10k + 10k sequences (~47s)
node test/economy.mjs
node test/soak.mjs --min=30
node test/split.mjs                     # → split/
node test/build-artifact.mjs            # → dist/jumpjuice-artifact.html
```
All currently pass: **60×5 + 36 + 19 + 76 assertions, 20,000 generated
sequences, zero JS errors** — against both the single file and `split/`.
Every script takes `--file=split/index.html`.

Playwright is at `/opt/node22/lib/node_modules/playwright`, Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

## Testing hook

Append `?debug=1` to expose `window.JJA_DEBUG` — read-mostly state plus
`restart()`, `keepAlive()`, `setHero(id)`, `fillJuice()`, `forceBoss()`,
`spawnKind(k)`, `hitBoss()`, `giveFruit(n)`, `brew(k)`, `voidPlayer()`,
`probeGain(n)`, `probeDamage()`. Gated behind the query param so shipped
builds don't expose it. **The harness drives the real game — no mocks.**

---

## Systems

**Movement** — coyote time 5f, input buffer 8f, variable jump height, double
jump, wall jump, dash (10f, 48f cooldown). Fixed 60 Hz sim with a smooth
`timeScale` for slow-motion.

**Juice Mode** — meter fills from orbs (+3.4), crystals (+26), perfect landings
(+4/+12), enemy hits (+6/+18); all gains funnel through `gainJuice()`.
At 100% (60% under the JUICERUSH daily modifier): **12 s** of invincibility
(Bolt 9.75 s), extendable **+0.5 s per crystal** collected while juiced up to a
hard **15 s** cap (`JUICE_BASE_F` / `JUICE_BOLT_F` / `JUICE_CAP_F` /
`JUICE_EXT_F`),
infinite jumps, ×2 damage, ×2 points, 4.2× magnet, 1.24× size with an orbiting
aura, a **landing shockwave that damages nearby enemies and the boss**, a
48-frame slow-motion entrance, and a **3 s** wind-down warning with a distinct
final-second cue.

**Heroes** — 34 total. Five headliners: Blip (balanced), **Bolt** (+25% speed,
9.75 s juice but +30% meter gain and ×3 juiced multiplier), **Frost** (enemies
45% slower, ice immune), **Inferno** (**fire immune + flame-burst landings** —
no longer a damage clone of Slayer), **Nature** (+60% juice). No *paid* hero is
left without a passive. Active ability is named on the HUD.

**Bosses** — 4 kinds, own silhouette/palette/projectile/minion each, rotating by
zone; the first of a run is always the Juice Monster.
`JUICE MONSTER` · `FLAME DJINN` · `TERRA REX` · `CYCLOPS EYE`
Three phases: **1** projectiles → **2** spawns minions → **3** rage.
Loop: `warn → hover → aim → charge → swoop → stun → hover`. `charge`
telegraphs the dive with a flashing full-width lane; `stun` parks it in jump
range with a glowing green core and a STOMP prompt (the guaranteed damage
window — verified 155/155 frames on-screen and reachable). Health shown as
hearts at the top. Death = 3 staged explosions + fanfare + guaranteed hero
unlock + fruit drop.

**Juice Lab** — 🍓🥭🍋🥝 drop in runs and from bosses. Brew ⚡ Lightning
(+35% speed while juiced), 💪 Mega (wider shockwave, +25% meter) or 🌈 Rainbow
(60% longer, triple orbs). One brew equipped at a time, consumed on use.

**Juice Journey** — 15 awards including a real 7-day login streak; unlock 5
Juice Mode glow skins.

**Other** — 10 monster types + elites, 7 biomes with modifiers, 6 rare events,
daily missions, daily modifier (switchable off in pause), first-run tutorial,
30-runner roster with coin costs.

---

## Things to know before changing anything

1. **The HUD is anchored to the top of the *screen*, not the play band.** It
   clears the notch by probing `env(safe-area-inset-top)` and converting to
   canvas units (`safeTop`). An earlier pass anchored it to the band, which on
   a tall phone parked it in the middle of empty sky. Dash / combo / ability
   are bottom-right because at the top they collided with the pause button.

2. **iOS will not run this from a file.** iOS Quick Look (the preview when you
   tap an HTML attachment) renders HTML+CSS but **never executes scripts**, and
   iOS Safari cannot open local `file://` HTML at all. On iPhone it must be
   served from a URL. The loading screen has a pure-CSS hint after 5 s saying
   exactly this, because with scripts blocked no JS watchdog can fire.

3. **Boot can never hang.** A watchdog in a *separate* script before the game
   catches top-level throws, shows the error on the loading screen, and offers
   "Continue anyway". Every canvas acquisition is null-tolerant — iOS returns
   null from `getContext()` under memory pressure, which used to kill the whole
   IIFE. Keep the failsafe registered **before** any risky startup work.

4. **Performance rules that matter.** No `shadowBlur` in the per-frame path —
   use the pre-rendered glow sprites. The trail blits a once-per-frame raster,
   it does not re-run the vector character draw. Particles/trail/popups/rings
   are fixed-size ring buffers; arrays use in-place `compact()`, never
   `.filter()` per frame. Settings are cached in `OPT` — no DOM reads in the
   loop. An adaptive watchdog sets `autoLite` if FPS drops under 50.

5. **No daily modifier may disable a core verb.** The original `NOJUICE`
   removed Juice Mode ~1 day in 6 and was the reason it "appeared missing".
   Replaced with `JUICERUSH`, which changes it instead. The tutorial also skips
   its double-jump step under `NODBL`, which would otherwise soft-lock.

6. **Saves are sanitised on load** (`adopt()`): numeric clamping, unknown hero
   ids dropped, never leaves the player with no hero. Don't bypass it.

7. The `seeded()` PRNG was investigated and is **fine** (14.3% same-as-yesterday
   vs 16.7% expected for a fair d6). Don't "fix" it.

---

## Hosting

`node test/build-artifact.mjs` emits a body-only build: no external hosts (a
strict CSP would block the font CDN into a silent fallback, so the stack is
explicit), and the viewport meta is injected from script because the host owns
the document head — without it iOS lays out at 980 px and the play area renders
tiny.

Currently hosted privately at
`https://claude.ai/code/artifact/20a33636-5432-4ff7-bda9-a85b7f528d6d`.
Any static host works — GitHub Pages, Netlify drop, etc.

Branch: `claude/jump-juice-polish-balance-eeikjx` in `clumsyco83-eng/claude-project`.
Baseline `ae4c263` is the original file, unmodified, for diffing.

## Open ideas, not built

- Level-based mode (`Tutorial → Level 1 → … → Victory`) — a redesign, not a fix
- Deeper Juice Lab: recipe discovery, permanent upgrade levels per juice
- Two more bosses (one per biome); boss-specific arenas
- Music that changes per biome rather than only per juice state

---

## Polish & balance pass (2026-08-03) — what changed

Read `README.md` first: it now carries the balance tables, the orientation
decision, the control schemes and the save format.

8. **`jumpjuice.html` is the only file to edit.** `split/` and `dist/` are
   generated. Re-run `node test/split.mjs` after every change.

9. **The boot failure screen distinguishes fatal from recoverable.** A fatal
   error (null canvas) offers Reload + Copy error details and deliberately
   offers **no** way into the game — the old "Continue anyway" dropped players
   into a frozen black screen. `window.__jjaFatal` latches so a late
   `bootDone()` cannot wipe the message. Don't reintroduce a blanket skip.

10. **Settings live in `SAVE.opt`** and are written by `syncOpts()` behind the
    `optsReady` gate (so the startup call can't save defaults over a real save).
    `OPT_DEF` is the single source of truth for defaults and migration.

11. **`REACH` is the reachability budget**, derived from the real physics
    constants (single jump ~158px/120px; double ~262px/213px). The NODBL caps
    (120px/88px) sit under it with a timing margin. `test/genvalidate.mjs`
    enforces this over 20,000 sequences and is mutation-tested — if you loosen
    a clamp, it will fail.

12. **Difficulty is staged, not linear.** `STAGES` + `diff()` + `stageOf()`.
    Keep it continuous and capped at 1, or `genvalidate` fails.

13. **The Juice Mode cap is absolute.** Enforced in both `juiceLen()` and
    `extendJuice()`. Only crystals extend, and only while already juiced.

14. **Hero prices came from `test/economy.mjs`, not intuition.** If you change
    coin income, re-run it — the target is a first paid hero in 10–20 minutes
    for an average player.

15. **`stunLen(b)` is the one definition of the boss weak-point window.** The
    HUD bar and the state machine both read it; they had drifted before.
