# Jump Juice Adventure — Full System Audit

Audit target: `jumpjuice.html` (single file, 1569 lines at baseline `ae4c263`).

## Genre note (read this first)

The design brief in the task describes a level-based platformer:
`Tutorial → Level 1 → Mini enemies → Collectibles → Power-ups → Boss → Victory → Replay`.

The code is **not** that game. It is an **endless auto-scrolling runner**:
one continuous run, procedurally generated, distance-scored, ending only when
hearts run out. There are no discrete levels and no terminal "you win" screen.
Mapping the brief onto what exists:

| Brief term | Actual system |
|---|---|
| Tutorial | did not exist — **added** (first-run contextual coaching) |
| Level 1 | zone 1 of 7 rotating biomes, every 280 m |
| Mini enemies | 10 monster types + elite variants |
| Collectibles | orbs (◈, score+currency) and crystals (♦, 10×) |
| Fruit | no fruit exists; orbs/crystals are the collectibles |
| Coins | orbs convert to coins at run end; coins buy runners |
| Power-ups | Juice Mode meter, bounce pads, 13 runner passives |
| Lives | 3 hearts (modified by passives / daily modifier) |
| Boss | recurring "Sky Tyrant" from 350 m, then every +550 m |
| Victory | did not exist — **added** boss-defeat victory sequence |
| Replay | run-over screen → restart |

Everything below is audited against the game that actually exists.

## System checklist

Status key: `OK` verified working · `FIX` was broken, now fixed · `NEW` added

| # | System | Status | Note |
|---|---|---|---|
| 1 | Player movement / steering | FIX | steer worked; blur left steer stuck |
| 2 | Jump | OK | coyote time 5f, input buffer 8f, variable height |
| 3 | Double jump | FIX | silently disabled 1 day in 6 by hidden daily modifier |
| 4 | Wall jump | OK | undocumented feature, now taught |
| 5 | Dash | FIX | `dash` passive was dead code keyed to a nonexistent runner |
| 6 | Juice Mode | FIX | 6 separate defects — see §Juice |
| 7 | Enemy AI (10 types) | FIX | laser hitbox, vine ambush, crystal HP bar |
| 8 | Elite enemies | OK | 8% spawn past 500 m, 16% under MADNESS |
| 9 | Boss AI | FIX | **redesigned** — was effectively unkillable |
| 10 | Boss health | FIX | never despawned, no readable damage feedback |
| 11 | Damage system | OK | i-frames 95f; dash/juice grant immunity |
| 12 | Collision detection | FIX | swept-Y landing OK; laser + spike edge cases wrong |
| 13 | Camera | OK | lerped follow with face-lookahead |
| 14 | Coins | FIX | never persisted in a real browser (no `localStorage`) |
| 15 | Collectibles (orbs/crystals) | OK | magnet radius scales with juice |
| 16 | Score | OK | distance in metres, best tracked |
| 17 | Lives (hearts) | FIX | void respawn could drain every heart in ~2 s |
| 18 | Game Over | OK | stats, record flag, XP/coin payout |
| 19 | Victory | NEW | boss-defeat sequence with death anim + fanfare |
| 20 | Save system | FIX | `window.storage` only — **nothing saved in any browser** |
| 21 | Mobile controls | FIX | menus could not be scrolled on touch |
| 22 | Audio (init) | FIX | **root cause of "no sound on my phone"** — see §Audio |
| 23 | Music | FIX | scheduler runaway after backgrounding the tab |
| 24 | Sound effects | FIX | 4 new cues; boss/explosion/victory had none |
| 25 | Particle effects | FIX | unbounded allocation → pooled |
| 26 | Animations | OK | squash/stretch, rotation, blink timers |
| 27 | Performance | FIX | `shadowBlur` + per-trail vector redraw dominated frame |
| 28 | UI / HUD | FIX | HUD sat hundreds of px from the action in portrait |
| 29 | Pause | FIX | did not auto-pause when the app was backgrounded |
| 30 | Resume | OK | |
| 31 | Missions / awards | FIX | award 6 text said "every runner", checked 6 of 30 |
| 32 | Runner roster (30) | FIX | fresh save had **zero** runners unlocked |
| 33 | Daily modifiers | FIX | `NOJUICE` deleted Juice Mode; replaced with `JUICERUSH` |
| 34 | Rare events (6) | OK | fired immediately after boss kills |
| 35 | Tutorial | NEW | |
| 36 | Loading screen | NEW | |
| 37 | Orientation handling | NEW | dead `#rot` CSS existed but was never wired up |

## Result

`node test/smoke.mjs --device=<desktop|edge|iphone|android|tablet>` — 60 assertions,
**60/60 on all five profiles**, zero JS errors. Screenshots in `shots/`.
Full findings and fixes: [REPORT.md](REPORT.md).
