# Jump Juice — Asset Inventory

Every visual in the game and where it is defined.

**Jump Juice ships no image files.** Every character, prop, effect and
icon is drawn procedurally with Canvas 2D, or as inline SVG/CSS. That is
a deliberate decision, not an omission — see §7.

Source of truth: `jumpjuice.html`. `split/` and `dist/` are generated.

---

## 1. Brand

| Asset | Where | Form |
|---|---|---|
| Logo (`JUMP JUICE` + droplet) | `.logo` in `<style>`, markup in `#ovStart` and `#boot` | live text + CSS |
| Tagline lockup | `.tagline` | CSS |
| App icon / favicon / Apple touch icon | `<link rel="icon">`, `<link rel="apple-touch-icon">` | inline SVG data URI, 512×512 viewBox |
| Splash screen | `#boot` | logo + tagline + juice-glass loader |
| Loading indicator | `#boot .ring` | CSS juice glass filling |
| Theme colour | `<meta name="theme-color">` | `#FF9A2E` |

---

## 2. Heroes — 34

Painters live in the `CHARS` array. Signature
`draw(ctx, w, h, face, kit, t)`.

| Tier | Cost | Heroes |
|---|---|---|
| FRESH | free | **OJ, Straw, Kiwi, Grape, Mango, Pine** |
| RIPE | 18,000 | Lemon, Cherry, Melon, Peach, Coco, Fig |
| JUICY | 44,000 | Banana, Lime, Papaya, Blueb, Plum, Guava, Zest |
| EXOTIC | 100,000 | Dragon, Acai, Elder, Mint, Feijoa, Sorbet, Verdi |
| GOLDEN | 220,000 | Durian, Avo, Tangi, Lychee, Chili |
| RAINBOW | 400,000 | Starfruit, Sherbet |
| COSMIC | 720,000 | Cosmo |

### The six launch heroes

| Hero | Role | Ability (`pas`) | What it does |
|---|---|---|---|
| **OJ** | balanced starter | `none` | no modifiers; the reference build |
| **Straw** | speed / agility | `triplejump` | a third mid-air jump |
| **Kiwi** | tank / defence | `shield` | a shield absorbs the first hit of every run |
| **Grape** | ranged magic | `blast` | the dash input fires a bouncing juice orb |
| **Mango** | support / recovery | `heal` | regain a heart every 400 m |
| **Pine** | heavy damage | `slam` | a hard landing sends out a damaging shockwave |

The other 28 use the pre-existing passive pool (`speed`, `slow`,
`firelord`, `harvest`, `magnet`, `perfect`, `juicelong`, `rich`,
`walljump`, `combo`, `fruity`, `aircontrol`, `icegrip`, `startjuice`,
`slayer`, `heart`, `dash`, `random`), unchanged in behaviour.

---

## 3. Enemies — The Spoiled Fruits, 12

Defined in `MON`; painters in the `draw()` foe switch. Nine behaviour
families drive `step()`: `hop`, `roll`, `float`, `flap`, `walk`, `tank`,
`phase`, `ambush`, `leap`, `shoot`.

| Enemy | Family | HP | Stompable | Note |
|---|---|---|---|---|
| Mold Blob | hop | 1 | yes | 4 rot variants change speed/HP |
| Fire Chili | roll | 1 | **no** | burning wheel |
| Rotten Blueberry | float | 1 | yes | seeks the player |
| Garlic Bomber | flap | 1 | yes | lit fuse telegraph |
| Evil Potato | walk | 1 | yes | sprouting eyes |
| Mean Broccoli | tank | 3 | yes | florets + health bar |
| Cry Onion | phase | 1 | **no** | translucent, weeping |
| Lime Sneak | ambush | 1 | yes | 20-frame safe rise |
| Angry Tomato | leap | 1 | yes | jumps at the player |
| Strawberry Archer | shoot | 1 | yes* | telegraphed seed bolt |
| Moldy Lemon | hop | 2 | yes | slow, tough |
| Pineapple Guard | walk | 2 | **no** | spiked helm, shield |

\* not while the bolt is firing.

**Rot variants** (Mold Blob only): mould, frost (+1 HP, ×0.6 speed),
sour (×1.5 speed), shadow (×1.35 speed). Each is a real gameplay change,
not a recolour.

---

## 4. Bosses — 4

`BOSSES` + `bossBody()`. Every boss has three phases, a telegraphed dive,
a stun window with a visible countdown, an entrance and a defeat
animation.

| Boss | Colour | Projectile | Minion | Silhouette |
|---|---|---|---|---|
| **Watermelon King** | `#63C24A` | seed | Angry Tomato | striped rind, golden crown, seeded mouth |
| **Grape Wizard** | `#9B54DC` | orb | Cry Onion | cluster head, pointed hat, floating orb |
| **Pineapple Tank** | `#E8A82B` | spike | Pineapple Guard | squat riveted armour, spiked crown |
| **Soda Monster** | `#6B4326` | bubble | Mold Blob | cracked bottle, boiling foam, syrup drips |

Rotation order is `melon → grape → pine → soda`; the first boss of every
run is always the Watermelon King.

---

## 5. Worlds — 8

`WORLDS`. Four layers each: sky + sun, three parallax ridge bands, a
prop layer at 0.66 parallax, and the gameplay layer, plus weather.

| World | Ground | Prop | Weather | Modifier |
|---|---|---|---|---|
| Orange Orchard | grass | fruit tree | leaves | — |
| Berry Forest | moss | berry pine | sparkles | — |
| Watermelon Beach | sand | parasol | bubbles | wider gaps |
| Kiwi Jungle | grass | vine tree | leaves | moving platforms |
| Grape Castle | stone | tower | sparkles | sideways wind |
| Mango Desert | sand | temple | sand | wider gaps |
| Pineapple Volcano | rock | volcano cone | embers | hazard spikes |
| Soda Factory | metal | pipes + vats | fizz | slick ground |

Zone length 280 m, so a full tour is 2,240 m.

---

## 6. Platforms, collectibles, effects, UI

**Platform types** (one painter, per-world materials): normal, bouncy
(`b`), slick (`i`), moving (`m`), conveyor (`v`), crumbling (`c`), mimic
(`k`), spiked, and the high-road variant.

**Collectibles:** Juice Drop (`droplet()`), Juice Gem (faceted crystal),
Lab Fruit (strawberry / mango / lemon / kiwi).

**Power-ups:** Shield (bubble crest), Coin Magnet (horseshoe), Juice Bomb
(fused bomb). Each in a cream capsule with a distinct outline shape.

**Effects library:** `spark`, `burst`, `ring`, `pop`, `splat`,
`droplet`, `makeGlow` sprites (`GLOW_ORB/CRY/HOT/RED/GRN/GRN2/PUR/WHT`),
screen shake, hit-stop, flash, juice vignette, speed lines. Particles,
trail, popups and rings are all fixed-size ring buffers.

**UI painters:** `chip()`, `outText()`, `heart()`, plus the CSS design
system (`.btn`, `.card`, `.chip`, `.it`, `.guide`, `.xpbar`, `.pbtn`).

**Screens:** splash/loading, main menu, hero select, Juice Lab, Juice
Journey, pause + settings, gameplay HUD, run-over/results, rotate hint,
toast, boot-failure recovery.

---

## 7. Why there are no image files

1. **Zero broken references.** There is no path to get wrong, no 404, no
   missing texture, no placeholder box. The acceptance criterion "no
   broken asset references" is satisfied structurally.
2. **It runs from a double-clicked file.** No CORS, no asset server.
3. **Tiny.** The whole game is ~255 KB with no downloads.
4. **Recolourable at runtime.** Juice Mode retints every hero live,
   which a sprite sheet cannot do without a second full set.
5. **Resolution independent.** Crisp on a 3× phone and a desktop.

The trade is that art changes are code changes. If you later want
painted illustration, `docs/ASSET-PROMPTS.md` specifies every asset at
production quality, and the procedural painters remain a working,
shippable fallback rather than placeholder art.
