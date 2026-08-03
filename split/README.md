# Jump Juice Adventure — split source

Same game as `jumpjuice.html`, separated into standard files.

| File | Size | What |
|---|---|---|
| `index.html` | 7 KB | Markup: canvas, overlays, menus, on-screen pad, loading screen |
| `jumpjuice.css` | 11 KB | All styling (overlays, buttons, roster, touch pad, boot screen) |
| `boot.js` | 5 KB | Boot watchdog + failure-recovery screen — **must load before `jumpjuice.js`** |
| `jumpjuice.js` | 171 KB | The entire game |

Open `index.html` to play. Works by double-clicking; works on any static host.

## ⚠ These files are GENERATED — do not edit them

`jumpjuice.html` in the repo root is the **canonical source**. Everything in
`split/` is produced from it by `node test/split.mjs`. Editing a file here is
wasted work: the next build overwrites it, and until then the two builds
silently drift apart.

Edit `jumpjuice.html`, then re-run the split. (`split/README.md` — this file —
is the one exception: it is hand-maintained, not generated.)

## Two rules that will break the game if changed

1. **`boot.js` must come before `jumpjuice.js`.** It is the watchdog that
   catches a top-level throw in the game, shows the error on the loading
   screen and offers real recovery actions. Reverse the order and a startup
   crash leaves the spinner running forever with no explanation.

2. **Keep both as classic scripts.** Do *not* add `type="module"` or
   `defer`/`async`. Modules are deferred and are blocked by CORS on
   `file://`, so the game would silently never start when the file is opened
   directly rather than served.

There is no build step for playing and no dependencies. `jumpjuice.js` is one
IIFE; add `?debug=1` to the URL to expose `window.JJA_DEBUG` **and the
on-screen debug overlay** (FPS, difficulty stage, speed multiplier, player
velocity, hitboxes, boss weak point, Juice timer, live object counts).

## Rebuilding

```bash
node test/split.mjs                                     # jumpjuice.html -> split/
node test/smoke.mjs    --device=iphone --file=split/index.html
node test/features.mjs --file=split/index.html
node test/hostile.mjs  --file=split/index.html
node test/balance.mjs  --file=split/index.html
```
