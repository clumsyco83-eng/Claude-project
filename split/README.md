# Jump Juice Adventure — split source

Same game as `jumpjuice.html`, separated into standard files.

| File | Size | What |
|---|---|---|
| `index.html` | 5 KB | Markup: canvas, overlays, menus, loading screen |
| `jumpjuice.css` | 9 KB | All styling (overlays, buttons, roster, boot screen) |
| `boot.js` | 2 KB | Boot watchdog — **must load before `jumpjuice.js`** |
| `jumpjuice.js` | 141 KB | The entire game |

Open `index.html` to play. Works by double-clicking; works on any static host.

## Two rules that will break the game if changed

1. **`boot.js` must come before `jumpjuice.js`.** It is the watchdog that
   catches a top-level throw in the game, shows the error on the loading
   screen and offers a way through. Reverse the order and a startup crash
   leaves the spinner running forever with no explanation.

2. **Keep both as classic scripts.** Do *not* add `type="module"` or
   `defer`/`async`. Modules are deferred and are blocked by CORS on
   `file://`, so the game would silently never start when the file is opened
   directly rather than served.

There is no build step and no dependencies. `jumpjuice.js` is one IIFE; add
`?debug=1` to the URL to expose `window.JJA_DEBUG` for testing.

## Rebuilding

`split/` is generated from the single file:

```bash
node test/split.mjs                                   # jumpjuice.html -> split/
node test/smoke.mjs --device=iphone --file=split/index.html
node test/features.mjs --file=split/index.html
node test/hostile.mjs  --file=split/index.html
```

`jumpjuice.html` remains the canonical source — edit that, then re-split, or
work in `split/` and keep the two in sync yourself.
