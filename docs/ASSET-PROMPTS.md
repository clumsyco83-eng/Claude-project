# Jump Juice — Image-Generation Prompt Pack

Production specs for every asset that would be commissioned or generated
as painted artwork rather than drawn procedurally.

**Read this first:** the game is complete and shippable as it stands.
Nothing here is a placeholder standing in for a missing file — the
in-engine painters are the shipping art. This pack exists so the look can
be upgraded to painted illustration later, or so store and marketing art
can be produced off-engine, without re-deriving the art direction.

Every prompt assumes `docs/ART-DIRECTION.md` and repeats the parts a
generator needs inline.

---

## 0. Shared style block

Paste at the top of every prompt:

> Original cartoon mascot illustration for a family mobile game. Polished
> 2D cartoon style: bold clean outlines in warm dark brown (#41230F, never
> black), rounded silhouette, large expressive eyes with a white shine
> dot, soft dimensional shading with a darker rim and a gloss highlight,
> bright controlled colour, subtle juice-droplet details. Front
> three-quarter view, full body, character centred, even soft lighting
> from the upper left. Readable at 64px.

## 0b. Shared negative block

Paste at the end of every prompt:

> Negative: no copyrighted characters, no existing game logos or
> branding, no photorealism, no 3D render, no watermark, no signature, no
> text unless explicitly requested, no extra limbs, no mismatched or
> asymmetric eyes, no cropped feet or cropped head, no background for
> transparent sprites, no mismatched perspective, no drop shadow baked
> into a transparent sprite, no gradient mesh, no lens flare, no gore, no
> realistic human faces.

---

## 1. Heroes

**Common technical spec (all heroes)**

- Format: PNG, straight (non-premultiplied) alpha, transparent background
- Canvas: 512 × 640 px per frame, character occupying ~78% of height
- Pivot: horizontal centre, bottom of the feet at y = 620
- Delivery: one PNG per frame + a packed atlas (max 2048², 2 px padding)
- Consistency: generate `idle_01` first, then use it as the reference
  image for every other frame of that hero
- Colour: sRGB

**Animation set (all heroes)** — frame counts are the mobile budget:

| State | Frames | Note |
|---|---|---|
| idle | 4 | breathing loop |
| idle alt | 4 | fires after ~8 s idle; personality beat |
| run | 8 | ground contact on frames 1 and 5 |
| run fast | 8 | Juice Mode / speed passive |
| jump | 3 | anticipation, launch, rise |
| double / special jump | 3 | spin or flourish |
| fall | 2 | |
| land | 3 | heavy squash on frame 1 |
| attack | 4 | |
| special ability | 6 | the hero's named ability |
| hit | 2 | white-flash compatible |
| invincible | 2 | reuse idle, tinted at runtime |
| juice-mode start | 5 | burst out of a splash |
| juice-mode loop | 6 | glowing, trailing droplets |
| victory | 6 | |
| defeat | 5 | ends face-down in a puddle |
| revive | 4 | |
| select pose | 1 | 3/4 hero-select portrait, 512 × 640 |
| upgrade celebration | 6 | |

**Per-hero subject lines**

- **OJ — the Orange.** A cheerful orange-juice cup character. Rounded
  cup body in bright orange (#FF9A2E) with a darker orange lid ring, a
  bendy pink drinking straw rising from the lid, a cream orange-slice
  badge on the belly, cream mitt hands and dark boots. Confident open
  smile, brave and optimistic. Ability frames: *Juice Dash* — a forward
  burst leaving an orange juice streak.
- **Straw — the Strawberry.** A bright red strawberry (#FF4D6D) with a
  tapered body, pale yellow seed flecks, a crown of three green leaves
  as hair. Light, quick, excitable, competitive. Ability: *Triple Jump* —
  three ascending hops with pink motion trails.
- **Kiwi — the Kiwi.** A fuzzy brown kiwi fruit (#B08B5A) with visible
  fuzz around the rim, a bright green sliced-core face plate with a cream
  centre and a ring of black seeds, and a round wooden seed-pattern
  shield on one arm. Wide, low, calm and protective. Ability: *Kiwi
  Shield* — a green hexagonal barrier.
- **Grape — the Grape.** A cluster of seven purple grapes (#9B54DC)
  forming the body, a small green leaf cape, and a wooden staff topped
  with a glowing purple juice orb. Clever, curious, slightly dramatic.
  Ability: *Grape Blast* — firing bouncing purple energy orbs.
- **Mango — the Mango.** A golden-yellow mango (#FFB733), asymmetric and
  wider at the base, with a warm red-orange ripeness blush, a single soft
  green leaf on a short stem, and warm kind eyes. Ability: *Mango
  Restore* — heart-shaped golden juice particles rising from cupped
  hands.
- **Pine — the Pineapple.** A strong yellow pineapple (#FFD23B) with a
  clear diamond rind lattice, a five-blade spiked green leaf crown, and
  oversized cream fists. Funny and overconfident. Ability: *Pineapple
  Slam* — both fists into the ground, yellow-orange shockwave ring.

---

## 2. Enemies — The Spoiled Fruits

**Technical spec:** 384 × 384 px, transparent, pivot bottom-centre.
Frames: idle 4, move 6, attack 4, hit 2, defeat 5, spawn 4, plus any
special state below.

**Faction style line** (append to the shared block):

> A spoiled, mouldy, comically angry version of the fruit or vegetable.
> Funny rather than frightening — grumpy eyebrows, a shouting mouth, a
> sulky pout. Suitable for young children. Keep the silhouette simple and
> instantly recognisable at 48px.

| Enemy | Subject | Special state |
|---|---|---|
| Mold Blob | a dripping blob of green-grey mould with one wobbling body, three drips underneath | split into two lobes, 4 frames |
| Fire Chili | a red chili curled into a spinning wheel wreathed in flame | spin loop, 6 frames |
| Rotten Blueberry | a bruised dark-blue berry with a drooping five-point crown | — |
| Garlic Bomber | a papery white garlic bulb with insect wings and a lit fuse | explode, 5 frames |
| Evil Potato | a lumpy brown tuber with green sprouts and stubby legs | — |
| Mean Broccoli | a broad-shouldered broccoli head with five florets and a thick stalk | armour break, 3 frames |
| Cry Onion | a translucent pale-purple onion, weeping, with a papery top | tear-gas cloud, 4 frames |
| Lime Sneak | a bright green lime on a stalk, springing out of the ground | rise, 5 frames |
| Angry Tomato | a furious red tomato with a green calyx and a split skin | leap, 4 frames |
| Strawberry Archer | a dark-red strawberry with a small bow of twigs | draw-and-fire, 5 frames |
| Moldy Lemon | a dull yellow lemon furred with grey-green mould patches | — |
| Pineapple Guard | an armoured pineapple with a spiked leaf helm and a round wooden shield | block, 3 frames |

**Mini-bosses** (1.6× scale, richer palette, one extra accessory each):
Broccoli Brute, Flaming Chili Chief, Giant Garlic Bomber, Weeping Onion
Queen, Mega Mold Blob.

---

## 3. Bosses

**Technical spec:** 1024 × 1024 px, transparent, pivot centre of mass.
Frames: idle 6, telegraph 4, attack A 6, attack B 6, phase transition 6,
stunned 4, hit 2, entrance 8, defeat 10.

- **Watermelon King.** A huge round watermelon monarch. Dark green rind
  with black stripes, cracked rind armour on the shoulders, a jagged
  crown of golden rind, and a wide pink-flesh mouth full of white teeth
  and black seeds. Heavy, regal, furious. Arena: Watermelon Beach —
  turquoise sea, rind platforms, watermelon parasols.
- **Grape Wizard.** A cluster-headed grape sorcerer in deep purple robes
  and a pointed hat with a gold star, holding a floating purple juice
  orb. Comedic but genuinely threatening. Arena: Grape Castle — purple
  masonry, juice fountains, moonlight.
- **Pineapple Tank.** A squat, massively armoured pineapple. Riveted
  golden rind plating in a diamond lattice, a spiked green leaf crown,
  heavy stomping legs. Arena: Pineapple Volcano — black rock, glowing
  juice magma, ash.
- **Soda Monster.** The final boss and the only non-fruit. A giant living
  fizzy drink: dark brown soda churning inside a cracked glass bottle,
  cream foam boiling over the neck, sticky syrup running down the sides,
  one large glowing eye. Unstable, its liquid body reshaping constantly.
  Arena: Soda Factory — pipes, bottling machines, conveyor belts, steam.

---

## 4. Environments

**Technical spec per world:** four horizontally tileable PNG layers,
seamless left/right.

| Layer | Size | Parallax |
|---|---|---|
| far (sky + sun + distant forms) | 2048 × 1024 | 0.10 |
| mid | 2048 × 768 | 0.28 |
| near | 2048 × 640 | 0.52 |
| props | 2048 × 512, transparent | 0.66 |

Plus a ground tile set per world: 256 × 128, left cap / centre / right
cap / single, with the surface at y = 0 and 16 px of visual skirt below.

Subjects: Orange Orchard (sunny citrus trees, rolling green hills,
wooden crates, warm golden light) · Berry Forest (purple and blue
forest, glowing berries, twisted roots, soft magical motes) ·
Watermelon Beach (tropical shore, watermelon parasols, rind platforms,
bright summer light) · Kiwi Jungle (dense green vegetation, kiwi vines,
ancient fruit ruins, mist) · Grape Castle (purple fantasy castle, grape
banners, juice fountains, moonlit towers) · Mango Desert (warm orange
sand, mango-shaped rock formations, a juice oasis, ancient fruit
temples, heat haze) · Pineapple Volcano (black rock, glowing juice
magma, golden highlights, ash) · Soda Factory (pipes, bottling machines,
fizzy vats, conveyor belts, steam).

Optional future: Ice Cream Mountain, Candy Forest, Smoothie Falls,
Frozen Juice Caverns.

---

## 5. UI, icons and effects

- **Icon set** — 128 × 128, transparent, 6 px ink outline, flat with one
  gloss: heart full / cracked / spent, juice drop, juice gem, coin,
  shield, magnet, juice bomb, revive seed, star, lock, gear, play,
  pause, cart, home, back, sound on/off, vibrate.
- **Button plates** — 9-slice, 96 × 96 with a 32 px inset, in five
  variants: primary orange, neutral cream, grape, kiwi, disabled grey.
- **Splash art** — 2048 × 2048: OJ mid-leap through a golden juice
  splash, the six heroes small behind, logo space clear in the upper
  third.
- **Effect sheets** — 8-frame strips, 256 × 256 per frame, transparent:
  juice splash in orange / red / green / purple / gold / yellow, dust
  puff, landing ring, speed streak, shield pop, magnet pulse, coin
  sparkle, hit flash, defeat burst, boss entrance shockwave, confetti.

---

## 6. Store art

| Asset | Size | Notes |
|---|---|---|
| iOS app icon | 1024 × 1024 | no alpha, no rounding — the OS masks it |
| Android adaptive icon | 432 × 432 foreground + background | keep OJ inside the 264 px safe circle |
| Play feature graphic | 1024 × 500 | logo left, heroes right, no small text |
| iPhone 6.7" screenshots | 1290 × 2796 | 5–8 frames |
| iPhone 6.5" screenshots | 1242 × 2688 | |
| iPad 12.9" screenshots | 2048 × 2732 | |
| Android phone screenshots | 1080 × 1920 | |
| Play promo video poster | 1920 × 1080 | |
| Social card | 1200 × 630 | |

---

## 7. Replacing the procedural art with generated art

The engine draws characters through one call:

```js
me().draw(ctx, w, h, face, kit, frame);
```

To swap in painted sprites for a hero, replace that hero's `draw` with a
`drawImage` from a loaded atlas, keeping the same signature, the same
bottom-centre pivot and the same `w`/`h` box. Nothing else in the engine
changes — collision uses `P.w`/`P.h`, never the sprite.

Do the same for `MON` painters (the `draw()` foe switch) and `bossBody()`.

Two things to preserve if you do:

1. **Juice Mode retinting.** `kit.b` and `kit.s` are live colours. With a
   fixed sprite you need a second tinted atlas or a runtime tint pass.
2. **Offline first launch.** Today the game needs no network. An atlas
   must be inlined as a data URI or the file-open path breaks.
