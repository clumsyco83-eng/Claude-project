/* Builds the installable PWA into dist/pwa/.

   jumpjuice.html stays the canonical single file — this only wraps it:
     index.html            the game, unmodified except for the base tag
     manifest.webmanifest  install metadata
     sw.js                 offline cache
     icons/*.png           app icons, drawn from the game's own palette
     splash/*.png          iOS launch images (iOS ignores the manifest)

   Icons are RENDERED, not stored: drawing them here from the same palette
   the game uses means they cannot drift from it, and the repo does not
   carry binaries that nobody can regenerate.

   Usage: node test/build-pwa.mjs                                        */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs";
import path from "path";

const OUT = "dist/pwa";
const INK = "#0B1226", AMBER = "#FFC94A", MINT = "#6FCF7F", ROSE = "#FF5F7A";

fs.mkdirSync(OUT + "/icons", { recursive: true });
fs.mkdirSync(OUT + "/splash", { recursive: true });
fs.mkdirSync(OUT + "/shots", { recursive: true });

/* ── the icon, as a function of size ──────────────────────────────────
   `safe` insets the artwork for maskable icons: Android crops a maskable
   icon to a circle on some launchers, so everything that matters has to
   sit inside the middle 80%. Drawn identically otherwise, so the two
   variants cannot diverge. */
const ICON_JS = `(size, maskable) => {
  const c = document.createElement("canvas");
  c.width = c.height = size; const x = c.getContext("2d");
  const S = size, k = S / 512;                 /* everything below is authored at 512 */
  const inset = maskable ? S * 0.10 : 0;       /* maskable safe zone */
  const scale = (S - inset * 2) / S;

  /* background: the game's night sky, rounded like an app tile */
  x.fillStyle = "${INK}";
  if (maskable) { x.fillRect(0, 0, S, S); }    /* full bleed — the launcher masks it */
  else { x.beginPath(); x.roundRect(0, 0, S, S, S * 0.22); x.fill(); }

  x.save(); x.translate(inset, inset); x.scale(scale, scale);

  /* Juice glow behind the hero. Green only — mixing in amber halfway turned
     the middle of the tile brown against the navy. */
  const g = x.createRadialGradient(268*k, 280*k, 10*k, 268*k, 280*k, 260*k);
  g.addColorStop(0, "rgba(111,207,127,.42)");
  g.addColorStop(1, "rgba(11,18,38,0)");
  x.fillStyle = g; x.fillRect(0, 0, S, S);

  /* Blip mid-jump: the runner exactly as the game draws him — a rounded
     body with a visor, not a generic mascot. Sized to fill the tile: the
     first pass drew him at 150px on a 512 canvas, which left the artwork
     swimming in dead space and illegible by 48px. */
  const bw = 224*k, bh = 280*k, bx = 244*k - bw/2, by = 150*k;
  x.fillStyle = "${AMBER}";
  x.beginPath(); x.roundRect(bx, by, bw, bh, 50*k); x.fill();
  x.strokeStyle = "${INK}"; x.lineWidth = 17*k; x.stroke();
  x.fillStyle = "${INK}";                       /* visor */
  x.beginPath(); x.roundRect(bx + 34*k, by + 62*k, bw - 68*k, 66*k, 30*k); x.fill();
  x.fillStyle = "rgba(255,255,255,.9)";         /* visor glint */
  x.beginPath(); x.roundRect(bx + 54*k, by + 76*k, 44*k, 19*k, 10*k); x.fill();

  /* the juice droplet — the collectible, and the meter it fills */
  const dx = 404*k, dy = 132*k, r = 60*k;
  x.fillStyle = "${MINT}";
  x.beginPath();
  x.moveTo(dx, dy - r * 1.5);
  x.bezierCurveTo(dx + r, dy - r * .3, dx + r, dy + r * .75, dx, dy + r * .95);
  x.bezierCurveTo(dx - r, dy + r * .75, dx - r, dy - r * .3, dx, dy - r * 1.5);
  x.closePath(); x.fill();
  x.strokeStyle = "${INK}"; x.lineWidth = 15*k; x.stroke();
  x.fillStyle = "rgba(255,255,255,.92)";
  x.beginPath(); x.ellipse(dx - 17*k, dy - 8*k, 12*k, 17*k, -.3, 0, 7); x.fill();

  /* Speed lines, so the tile reads as motion. Three heavy strokes replace
     the dotted jump arc of the first pass — a dashed curve downsamples into
     scattered specks and was pure noise by 72px. */
  x.strokeStyle = "${ROSE}"; x.lineWidth = 26*k; x.lineCap = "round";
  [[42,238,88],[28,318,104],[52,398,72]].forEach(([sx, sy, len]) => {
    x.beginPath(); x.moveTo(sx*k, sy*k); x.lineTo((sx+len)*k, sy*k); x.stroke(); });

  x.restore();
  return c.toDataURL("image/png");
}`;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage();
await page.setContent("<body></body>");
await page.evaluate("window.drawIcon = " + ICON_JS);

const save = (file, dataUrl) =>
  fs.writeFileSync(path.join(OUT, file),
    Buffer.from(dataUrl.split(",")[1], "base64"));

/* ── icons ── */
const SIZES = [16, 32, 48, 72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
for (const s of SIZES) {
  save("icons/icon-" + s + ".png", await page.evaluate(n => window.drawIcon(n, false), s));
}
/* maskable variants — Android adaptive icons */
for (const s of [192, 512]) {
  save("icons/maskable-" + s + ".png", await page.evaluate(n => window.drawIcon(n, true), s));
}
/* iOS home-screen icon: no transparency, no rounding of our own (iOS applies
   its own mask, and a pre-rounded icon gets rounded twice) */
save("icons/apple-touch-icon.png", await page.evaluate(() => window.drawIcon(180, true)));

/* ── iOS splash screens ──
   iOS ignores the manifest's background_color and shows a white flash on
   launch unless an apple-touch-startup-image matches the device exactly.
   These cover the common iPhone/iPad sizes in both orientations. */
const SPLASH = [
  [1170, 2532], [2532, 1170],   /* iPhone 12/13/14 */
  [1284, 2778], [2778, 1284],   /* iPhone Pro Max   */
  [1179, 2556], [2556, 1179],   /* iPhone 14/15 Pro */
  [1206, 2622], [2622, 1206],   /* iPhone 16 Pro    */
  [1125, 2436], [2436, 1125],   /* iPhone X/XS/11 Pro */
  [828, 1792],  [1792, 828],    /* iPhone XR/11     */
  [1536, 2048], [2048, 1536],   /* iPad             */
  [1668, 2388], [2388, 1668],   /* iPad Pro 11"     */
  [2048, 2732], [2732, 2048],   /* iPad Pro 12.9"   */
];
/* The background is a FLAT fill, deliberately. A radial gradient across a
   2732x2048 canvas is millions of distinct colours, which PNG cannot pack:
   the gradient version of this set weighed 40 MB against 0.4 MB flat, for a
   glow nobody sees during a launch that lasts one frame. */
const splashIcon = await page.evaluate(n => window.drawIcon(n, false), 512);
for (const [w, h] of SPLASH) {
  const composed = await page.evaluate(async ([ic, w, h, ink, bone]) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const k = await load(ic);
    const c = document.createElement("canvas");
    c.width = w; c.height = h; const x = c.getContext("2d");
    x.fillStyle = ink; x.fillRect(0, 0, w, h);
    const s = Math.min(w, h) * .34;
    x.drawImage(k, (w - s) / 2, (h - s) / 2 - s * .18, s, s);
    x.fillStyle = bone;
    x.textAlign = "center"; x.textBaseline = "middle";
    x.font = "700 " + Math.round(s * .155) + "px system-ui,sans-serif";
    x.fillText("JUMP JUICE", w / 2, h / 2 + s * .62);
    return c.toDataURL("image/png");
  }, [splashIcon, w, h, INK, "#F2EDE4"]);
  save("splash/splash-" + w + "x" + h + ".png", composed);
}

/* ── store / install screenshots ──
   The manifest's `screenshots` drive the richer install dialog on Android
   and the listing preview in some stores. Captured from the real game. */
const shotPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await shotPage.goto("file://" + path.resolve("jumpjuice.html") + "?debug=1");
await shotPage.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
await shotPage.evaluate(() => window.JJA_DEBUG.restart());
await shotPage.waitForTimeout(700);
await shotPage.evaluate(() => window.JJA_DEBUG.fillJuice());
await shotPage.waitForTimeout(600);
await shotPage.screenshot({ path: OUT + "/shots/wide-juice.png" });
const narrow = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await narrow.goto("file://" + path.resolve("jumpjuice.html"));
await narrow.waitForTimeout(1600);
await narrow.screenshot({ path: OUT + "/shots/narrow-menu.png" });

await browser.close();

/* ── manifest ── */
const manifest = {
  name: "Jump Juice Adventure",
  short_name: "Jump Juice",
  description: "Fill the meter, trigger JUICE MODE, go further. An endless runner across seven worlds, each with its own boss and its own music.",
  id: "/",
  start_url: ".",
  scope: ".",
  display: "standalone",
  display_override: ["fullscreen", "standalone", "minimal-ui"],
  orientation: "any",              /* the game supports and auto-pauses on both */
  background_color: INK,
  theme_color: INK,
  categories: ["games", "entertainment"],
  icons: [
    ...[72, 96, 128, 144, 152, 192, 256, 384, 512].map(s => ({
      src: "icons/icon-" + s + ".png", sizes: s + "x" + s,
      type: "image/png", purpose: "any" })),
    ...[192, 512].map(s => ({
      src: "icons/maskable-" + s + ".png", sizes: s + "x" + s,
      type: "image/png", purpose: "maskable" })),
  ],
  screenshots: [
    { src: "shots/wide-juice.png", sizes: "1280x720", type: "image/png",
      form_factor: "wide", label: "Juice Mode at full tilt" },
    { src: "shots/narrow-menu.png", sizes: "720x1280", type: "image/png",
      form_factor: "narrow", label: "Pick a hero and run" },
  ],
};
fs.writeFileSync(OUT + "/manifest.webmanifest", JSON.stringify(manifest, null, 2));

/* ── service worker ──
   Cache-first for the shell (the game is one file and never changes between
   deploys), network-first for nothing — there is no dynamic content. The
   version string busts the cache on every build, and old caches are deleted
   on activate so an update cannot leave two versions half-installed. */
const VERSION = "jja-" + new Date().toISOString().slice(0, 10) + "-" +
  fs.statSync("jumpjuice.html").size;
const PRECACHE = [
  "./", "./index.html", "./manifest.webmanifest",
  ...SIZES.map(s => "./icons/icon-" + s + ".png"),
  "./icons/maskable-192.png", "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
];
fs.writeFileSync(OUT + "/sw.js", `/* Jump Juice Adventure — offline shell.
   Generated by test/build-pwa.mjs. Do not edit by hand. */
const CACHE = ${JSON.stringify(VERSION)};
const PRECACHE = ${JSON.stringify(PRECACHE, null, 2)};

self.addEventListener("install", e => {
  /* Each asset is added individually: cache.addAll() rejects the whole
     install if any single request 404s, which would leave the game with no
     offline support at all because one icon was missing. */
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(PRECACHE.map(u => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   /* fonts etc. stay on the network */
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      /* only cache real successes — caching an opaque or error response
         would pin a broken page until the next version */
      if (res && res.status === 200 && res.type === "basic") {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      /* offline and not precached: navigations still get the game */
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html", { ignoreSearch: true });
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
`);

/* ── index.html ──
   The game itself, plus the iOS launch images (which cannot live in the
   manifest) injected into the head. Everything else is already in the
   canonical file. */
let html = fs.readFileSync("jumpjuice.html", "utf8");
const links = SPLASH.map(([w, h]) => {
  const dpr = w >= 1536 ? 2 : (w % 2 === 0 && w > 1000 ? 3 : 2);
  const cw = Math.round(w / dpr), ch = Math.round(h / dpr);
  const orient = w > h ? "landscape" : "portrait";
  return `<link rel="apple-touch-startup-image" href="splash/splash-${w}x${h}.png" ` +
    `media="(device-width:${cw}px) and (device-height:${ch}px) and ` +
    `(-webkit-device-pixel-ratio:${dpr}) and (orientation:${orient})">`;
}).join("\n");
html = html.replace("</head>", links + "\n</head>");
fs.writeFileSync(OUT + "/index.html", html);

/* ── report ── */
const bytes = p => fs.statSync(p).size;
const total = fs.readdirSync(OUT, { recursive: true })
  .map(f => path.join(OUT, f))
  .filter(f => fs.statSync(f).isFile())
  .reduce((a, f) => a + bytes(f), 0);
console.log("PWA built -> " + OUT);
console.log("  index.html          " + (bytes(OUT + "/index.html") / 1024).toFixed(1) + " KB");
console.log("  sw.js               " + (bytes(OUT + "/sw.js") / 1024).toFixed(1) + " KB  (cache " + VERSION + ")");
console.log("  icons               " + SIZES.length + " + 2 maskable + apple-touch");
console.log("  splash              " + SPLASH.length + " iOS launch images");
console.log("  total               " + (total / 1024 / 1024).toFixed(2) + " MB");
