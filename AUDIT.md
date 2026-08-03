# Jump Juice — audit and visual-transformation checklist

Two parts: what the project was before the redesign (§1), and the
transformation carried out against it (§2).

---

## 1. Audit of the pre-redesign build

Audited at commit `57259ed`.

| Question | Finding |
|---|---|
| Engine / framework | None. Hand-written HTML5, Canvas 2D, hand-rolled WebAudio, `localStorage`. Zero runtime dependencies, no build step required to play. |
| Language / module system | One classic `<script>`, no modules — deliberate, so `file://` still runs. |
| Canonical source | `jumpjuice.html` (~199 KB). `split/` and `dist/` are generated. |
| Resolution / orientation | Virtual canvas: landscape `W = clamp(WH·ar, 620, 1400)`; portrait `W = 540`. Fixed play band `WH`, letterboxed. Both orientations supported. |
| Asset pipeline | **None.** Every visual is drawn procedurally. No images, no atlases, no fonts beyond one async web font. |
| Screens | Splash/loading, main menu, hero select, Juice Lab, Juice Journey, pause + settings, gameplay HUD, run-over, rotate hint, toast, boot-failure recovery. |
| Characters | 34 "runners" — abstract shapes (Blip, Robo, Frog, Ninja, Astro, Ghosty…) with no shared theme. |
| Enemies | 10 types (slime, spikey, eye, batbot, cubebot, crystal, ghost, vine, spirit, laser) — sci-fi / generic. |
| Bosses | 4 (Juice Monster, Flame Djinn, Terra Rex, Cyclops Eye), three phases each, one shared painter family. |
| Worlds | 7 (Forest, Mountain, Ice, Storm, Volcano, Sky, Space), all dark, three parallax ridge bands. |
| Platforms / props | One grey slab painter for all worlds. No prop layer at all. |
| Collectibles | Amber dot ("orb"), cyan diamond ("crystal"), four fruit. |
| Power-ups | None as pickups; only hero passives. |
| UI system | Dark navy overlays, hairline borders, all-monospace uppercase micro-type, 9–11 px. |
| Fonts | Space Grotesk (display) + `ui-monospace`. |
| Logo | The words "JUMP JUICE" in the body font. No mark. |
| App icon | None. No favicon, no touch icon. |
| Particles / effects | Sound: ring-buffered particles, trail, popups, rings; pre-rendered glow sprites; no `shadowBlur` in the frame path. |
| Audio-linked visuals | 24 `sfx` keys already wired to events. |
| Animation | Procedural from a frame counter. Squash/stretch, hit flash, i-frame blink. |
| Sprite sheets / formats | None. |
| Unused / duplicate assets | None found (there are no asset files). `fireproof` was defined but assigned to no hero — a dead passive. |
| Broken references | None. |
| Performance | 56–60 fps in emulation, heap flat over 30 min, object arrays bounded. |
| Tests | smoke 60 ×5 profiles, features 36, balance 82, hostile 19, genvalidate 20k sequences, economy, soak. All green at baseline. |

**Verdict.** Mechanically strong and well tested; visually generic
programmer art with no brand, no theme coherence and no icon. The
redesign therefore replaces the presentation layer and leaves the
simulation, save format, resilience and boot watchdog alone.

**Risks identified before starting.** (a) The test suites hard-code hero
ids and the first boss key, so renaming the cast breaks them — they had
to be updated in step. (b) `genvalidate.mjs` asserts the reachability
budget, so no ability may exceed a double jump's reach in the generator's
eyes. (c) Saves reference hero ids, so a rename needs a migration path.
(d) The HUD is anchored to the screen, not the play band — that must not
regress. All four were handled; see §2 and `docs/QA-REPORT.md`.

---

## 2. Transformation checklist

| # | Item | Status |
|---|---|---|
| **Phase 1 — audit and checkpoint** | | |
| 1.1 | Full project inspection | ✅ §1 above |
| 1.2 | Baseline checkpoint commit | ✅ `57259ed` |
| 1.3 | Baseline suites re-run green before any change | ✅ 60 / 36 / 82 / 19 |
| **Phase 2 — art-direction foundation** | | |
| 2.1 | Palette, ink line, shading, naming rules | ✅ `docs/ART-DIRECTION.md` |
| 2.2 | Shared painter library (`ink`, `body`, `eyes`, `leafAt`, `droplet`, `splat`…) | ✅ |
| 2.3 | Typography system (Baloo 2 + Nunito, both SIL OFL) | ✅ |
| **Phase 3 — brand and menus** | | |
| 3.1 | Logo | ✅ CSS, live text, works light and dark |
| 3.2 | App icon + favicon + Apple touch icon | ✅ inline SVG, legible at 32 px |
| 3.3 | Splash / loading screen | ✅ logo + juice-glass loader |
| 3.4 | Main menu and navigation | ✅ reordered so Start is above the fold |
| **Phase 4 — heroes** | | |
| 4.1 | Six launch heroes (OJ, Straw, Kiwi, Grape, Mango, Pine) | ✅ free from first launch |
| 4.2 | Remaining 28 heroes reskinned as fruit | ✅ |
| 4.3 | New abilities: triple jump, grape blast, pineapple slam | ✅ |
| 4.4 | Collisions unchanged | ✅ `P.w`/`P.h` untouched; genvalidate green |
| **Phase 5 — enemies and bosses** | | |
| 5.1 | 12 Spoiled Fruits with distinct silhouettes | ✅ |
| 5.2 | Variants are gameplay changes, not recolours | ✅ speed / HP per rot type |
| 5.3 | Four bosses redesigned | ✅ Watermelon King, Grape Wizard, Pineapple Tank, Soda Monster |
| 5.4 | Mini-bosses | ⚠️ elite variants exist in-engine; the five named mini-bosses are specified in the prompt pack, not modelled |
| **Phase 6 — worlds** | | |
| 6.1 | Eight fruit worlds | ✅ |
| 6.2 | Four parallax layers each | ✅ sky+sun / 3 ridges / props / play |
| 6.3 | Per-world props, ground materials, weather | ✅ |
| 6.4 | Platforms, hazards, obstacles rethemed | ✅ incl. visual ground skirt |
| **Phase 7 — collectibles and Juice Mode** | | |
| 7.1 | Juice Drop, Juice Gem, Lab Fruit | ✅ |
| 7.2 | Power-ups: shield, magnet, juice bomb | ✅ with HUD indicators |
| 7.3 | Revive token | ❌ not implemented — there is no revive flow in the engine; specified in the prompt pack |
| 7.4 | Juice Mode feedback overhaul | ✅ aura, droplets, speed lines, rim glow |
| 7.5 | Three-heart display redesigned | ✅ full / spent / low-health pulse, outline retained when spent |
| **Phase 8 — UI conversion** | | |
| 8.1 | Every screen on one design system | ✅ |
| 8.2 | Every icon replaced | ✅ |
| 8.3 | All interaction states | ✅ rest / hover / pressed / focus / disabled / selected / locked |
| 8.4 | Responsive layouts verified | ✅ five profiles, see QA report §3 |
| **Phase 9 — polish and optimisation** | | |
| 9.1 | Transitions and feedback | ✅ |
| 9.2 | Texture/frame cost | ✅ no regression; faster on the phone profile |
| 9.3 | Battery Saver path | ✅ worst frame halved |
| 9.4 | Unused assets removed | ✅ none existed; dead `fireproof` passive left in place (still referenced by `PASS`/`ABIL` and harmless) |
| **Phase 10 — final QA** | | |
| 10.1 | All suites green | ✅ |
| 10.2 | Console errors | ✅ none |
| 10.3 | Missing assets / broken buttons / clipping | ✅ four layout bugs found and fixed |
| 10.4 | Save/load across the rename | ✅ migration in `adopt()` |
| 10.5 | Real-device pass | ❌ **still outstanding** — emulation only |
