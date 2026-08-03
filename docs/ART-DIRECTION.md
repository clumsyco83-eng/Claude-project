# Jump Juice — Art Direction

The rulebook every visual in the game obeys. If a new sprite, screen or
effect does not follow this page, it is wrong, not the page.

Everything here is **original**. No character, logo, interface, animation
or palette is derived from another game.

---

## 1. The one-line brief

> Cute juice heroes fighting funny spoiled-fruit monsters while collecting
> juice energy and triggering Juice Mode.

The game must be identifiable from a single screenshot: bright fruit
world, chunky ink-outlined characters, a golden juice meter.

**Brand line:** FILL THE METER. TRIGGER JUICE MODE. GO FURTHER.
**Support line:** BE FUN. BE JUICY. BE A HERO.

---

## 2. The ink line

There is exactly **one outline colour** in the whole game:

```
INK = #41230F      /* warm dark brown */
```

Never `#000`, never a cold navy. The previous build outlined everything in
`#0B1226`, which is why it read as a dark sci-fi runner instead of a fruit
stand. Ink weight: `2.2px` for a body, `1.5–1.8px` for a detail, `2.6px`
for a boss.

Implemented as `ink(ctx, lw)` in `jumpjuice.html`. The legacy `OUT()`
helper is aliased onto the same colour so nothing can drift back.

---

## 3. Palette

| Role | Base | Shade | Notes |
|---|---|---|---|
| Orange (OJ) | `#FF9A2E` | `#D9600A` | the brand colour, used for the primary button |
| Gold | `#FFC93C` | `#D99508` | juice drops, meter, logo word 2 |
| Berry | `#FF4D6D` | `#C41B41` | Straw, hearts, danger |
| Grape | `#9B54DC` | `#61269B` | Grape, magic, EXOTIC tier |
| Kiwi | `#9BD94F` | `#4C8C22` | safe states, "go" |
| Leaf | `#54B84E` | `#2C7430` | every leaf in the game |
| Cream | `#FFF6E4` | — | panels, mitts, sclera |
| Soda | `#6B4326` | `#3A2210` | the final boss, and nothing else |

Held in `PAL` in the source. Worlds carry their own sky/ridge/ground
colours; those are the **only** colours allowed outside `PAL`.

**Contrast rule:** characters always hold the darkest line on screen.
A world's ground cap must be lighter than its earth, and its sky must
lighten toward the horizon, so a silhouette never disappears into it.

---

## 4. Form language

- Rounded silhouettes. No sharp corner unless it means *danger*
  (chili spikes, boss crowns, hazard thorns).
- Large expressive eyes with a white shine dot, drawn by `eyes()`.
  One big eye (`eye1()`) is reserved for the Soda Monster and floaters.
- Soft dimensional shading, never a gradient mesh: fill the shade
  colour, then the base colour inset up-left, then the ink line.
  That is `body()` / `boxBody()` — three fills and one stroke.
- Materials must differ. Smooth skin (orange, plum), fuzz (kiwi),
  jelly (mould), rind (pineapple), liquid (soda), leaf, seed, husk.
- Every hero shares one chibi rig — `boots()` and `mitts()` — so the
  cast reads as one family, but no two share a silhouette.

**Silhouette test:** fill a sprite with flat black at 22×30 px. If you
cannot name the character, redraw it.

---

## 5. Animation

Squash and stretch on every landing (`P.sx/P.sy`), secondary movement on
leaves, straws and capes, anticipation before every boss attack, and a
strong impact frame with particles and a shockwave ring.

Frame budget is mobile-first: animation is procedural (driven by `t`),
so there are no sprite sheets to load and no texture memory to blow.

---

## 6. Effects

| Event | Effect |
|---|---|
| Landing | dust sparks + squash + optional shockwave ring |
| Perfect landing | gold sparks + `PERFECT` popup + flash |
| Juice drop pickup | gold sparks + combo popup |
| Juice gem pickup | cyan burst + `+n` popup |
| Power-up pickup | coloured ring + named popup |
| Enemy defeat | burst in the enemy's colour + hit flash |
| Juice Mode start | 46-particle splash, two rings, slow-motion, hit-stop |
| Juice Mode active | aura rings, orbiting droplets, speed lines, rim glow |
| Boss hit | white flash, ring, screen shake, `-n` popup |
| Boss defeat | juice splat, full flash, slow-motion |

**Never** use `shadowBlur` in the per-frame path. Glow comes from
pre-rendered sprites built by `makeGlow()`.

**Flashing safety:** nothing strobes faster than about 7 Hz, and every
strobe is disabled by Calm Mode and by `prefers-reduced-motion`.

---

## 7. Typography

| Use | Face | Licence |
|---|---|---|
| Logo, titles, canvas HUD, buttons | **Baloo 2** (600/700/800) | SIL Open Font License 1.1 |
| Body copy, labels, numbers | **Nunito** (600/700/800) | SIL Open Font License 1.1 |

Both are free for commercial use including embedding in an app. Loaded
async from Google Fonts with a rounded system fallback stack
(`Chalkboard`, `Comic Sans MS`, `system-ui`), so a first launch with no
network still looks intentional.

Canvas text uses `F_FACE` and is **always** drawn with an ink halo
(`outText()`) or on an ink-outlined chip (`chip()`), never bare — the
HUD sits over eight different backgrounds and bare text fails on at
least three of them.

---

## 8. Interface

- Rounded panels, `13–15px` radius, `2.5–3px` ink border.
- Buttons carry a solid `5px` drop edge and translate down `4px` when
  pressed. Minimum target `48px`; segmented controls `44px`.
- Full state set on every control: rest, hover, pressed, focus-visible,
  disabled, selected, locked.
- Safe-area insets on every edge (`env(safe-area-inset-*)`).
- Overlays are `justify-content:flex-start` with auto margins on the
  first and last child, **not** `center` — a centred flex column clips
  its own top when the content is taller than the viewport.
- Communicate with icons and shape first, text second.

---

## 9. Accessibility

- Danger is never colour-only: hazards carry a warning band, mimic
  platforms carry a crack, the slick surface carries a sheen *and*
  drips, unstompable enemies carry spikes or a helm.
- Calm Mode removes shake, flashes and speed lines.
- Battery Saver drops props, clouds, weather, glows and the juice
  screen treatment, and pins DPR to 1.
- `prefers-reduced-motion` stops the logo droplet, the loader and the
  rotate hint animating.
- Hearts keep their outline when spent, so the total stays countable.
