/* Builds the store submission assets into dist/store/.

   Every screenshot is REAL GAMEPLAY captured at the exact pixel dimensions
   each store accepts — not a mockup, and not one image stretched to five
   sizes. The game is driven to a specific moment for each shot through the
   debug hook, so the same scene can be recaptured identically after a code
   change.

   Store requirements encoded here (checked against both consoles' current
   asset specs):

   Google Play
     icon             512x512 PNG, 32-bit, NO alpha channel
     feature graphic  1024x500 PNG or JPEG, no alpha, no transparency
     phone shots      2-8, 16:9 or 9:16, min 320px, max 3840px
     7"  tablet       up to 8
     10" tablet       up to 8
   Apple App Store
     marketing icon   1024x1024 PNG, NO alpha, no rounded corners
     6.7" iPhone      1290x2796  (required)
     6.5" iPhone      1242x2688
     5.5" iPhone      1242x2208
     12.9" iPad       2048x2732

   Alpha is stripped explicitly: both stores reject icons with an alpha
   channel, and a canvas PNG always has one.

   Usage: node test/build-store.mjs                                        */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs";
import path from "path";
import zlib from "zlib";

const OUT = "dist/store";
const GAME = "file://" + path.resolve("jumpjuice.html") + "?debug=1";
for (const d of ["play/screenshots", "play/tablet7", "play/tablet10",
                 "ios/6.7", "ios/6.5", "ios/5.5", "ios/ipad12.9"])
  fs.mkdirSync(path.join(OUT, d), { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* ── PNG alpha stripping ──────────────────────────────────────────────
   Re-encodes an RGBA PNG as RGB (colour type 2) over a solid background.
   Written out by hand because both stores reject an alpha channel on
   icons and there is no image library in this environment. */
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
/* raw RGBA pixels -> opaque RGB PNG */
const rgbaToOpaquePng = (rgba, w, h, bg) => {
  const raw = Buffer.alloc(h * (1 + w * 3));
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;                                    /* filter: none */
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = rgba[i + 3] / 255;
      raw[o++] = Math.round(rgba[i]     * a + bg[0] * (1 - a));
      raw[o++] = Math.round(rgba[i + 1] * a + bg[1] * (1 - a));
      raw[o++] = Math.round(rgba[i + 2] * a + bg[2] * (1 - a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

/* ── gameplay capture ─────────────────────────────────────────────────
   One page per device size, driven to a named moment. keepAlive() stops
   the idle-guard from ending the run while we pose the shot. */
const MOMENTS = {
  juice: { label: "Juice Mode",
    setup: `d.restart(); d.holdBoss(); d.setDist(640); d.fillJuice();`, settle: 700 },
  boss: { label: "Boss fight",
    setup: `d.restart(); d.setWins(1); d.setDist(d.worldStart("ICE")); d.forceBoss();`, settle: 2600 },
  late: { label: "Late game",
    setup: `d.restart(); d.holdBoss(); d.setDist(2400);`, settle: 900 },
  volcano: { label: "Volcano world",
    setup: `d.restart(); d.holdBoss(); d.setDist(d.worldStart("VOLCANO"));`, settle: 900,
    pin: `d.setDist(d.worldStart("VOLCANO"));` },
  space: { label: "Space world",
    setup: `d.restart(); d.holdBoss(); d.setDist(d.worldStart("SPACE"));`, settle: 900,
    pin: `d.setDist(d.worldStart("SPACE"));` },
};
const SCREENS = [
  { dir: "play/screenshots", w: 1080, h: 1920, mobile: true,  shots: ["juice","boss","late","volcano","space"] },
  { dir: "play/tablet7",     w: 1200, h: 1920, mobile: true,  shots: ["juice","boss","late"] },
  { dir: "play/tablet10",    w: 1600, h: 2560, mobile: true,  shots: ["juice","boss","late"] },
  { dir: "ios/6.7",          w: 1290, h: 2796, mobile: true,  shots: ["juice","boss","late","volcano","space"] },
  { dir: "ios/6.5",          w: 1242, h: 2688, mobile: true,  shots: ["juice","boss","late","volcano","space"] },
  { dir: "ios/5.5",          w: 1242, h: 2208, mobile: true,  shots: ["juice","boss","late","volcano","space"] },
  { dir: "ios/ipad12.9",     w: 2048, h: 2732, mobile: false, shots: ["juice","boss","late"] },
];

let shotCount = 0;
for (const s of SCREENS) {
  /* Capture at CSS size = target size with dpr 1, so the PNG comes out at
     exactly the pixel dimensions the store demands. Scaling afterwards
     would soften the text, and both stores reject off-spec dimensions. */
  const ctx = await browser.newContext({
    viewport: { width: s.w, height: s.h },
    deviceScaleFactor: 1, isMobile: s.mobile, hasTouch: s.mobile,
  });
  const page = await ctx.newPage();
  await page.goto(GAME);
  await page.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
  /* The debug readout is drawn ON THE CANVAS, so CSS cannot hide it — it
     has to be switched off through the hook, or it is baked into every
     store screenshot. */
  await page.evaluate(() => window.JJA_DEBUG.capture());
  await page.waitForTimeout(1400);
  for (const key of s.shots) {
    const m = MOMENTS[key];
    await page.evaluate(async src => {
      const d = window.JJA_DEBUG;
      // eslint-disable-next-line no-new-func
      new Function("d", src)(d);
      d.capture();                       /* restart() can re-show transients */
      for (let i = 0; i < 20; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
    }, m.setup);
    /* keep the run alive across the settle window */
    const t0 = Date.now();
    while (Date.now() - t0 < m.settle) {
      await page.evaluate(() => window.JJA_DEBUG.keepAlive());
      await page.waitForTimeout(120);
    }
    /* Re-pin the scene immediately before the shutter. The settle window
       lets particles and the juice aura build, but the run keeps moving at
       ~27m/s the whole time — the first pass drifted a shot labelled
       FOREST two worlds along into MOUNTAIN. */
    if (m.pin) {
      await page.evaluate(async src => {
        const d = window.JJA_DEBUG;
        // eslint-disable-next-line no-new-func
        new Function("d", src)(d); d.capture();
        for (let i = 0; i < 3; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
      }, m.pin);
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => window.JJA_DEBUG.capture());   /* clear any late toast */
    const file = path.join(OUT, s.dir, key + "-" + s.w + "x" + s.h + ".png");
    await page.screenshot({ path: file });
    shotCount++;
  }
  await page.close(); await ctx.close();
}

/* ── icons at store spec, alpha stripped ── */
const iconPage = await browser.newPage();
await iconPage.setContent("<body></body>");
/* reuse the PWA icon painter so store art and app art cannot diverge */
const pwaBuild = fs.readFileSync("test/build-pwa.mjs", "utf8");
const ICON_JS = pwaBuild.slice(pwaBuild.indexOf("const ICON_JS = `") + "const ICON_JS = `".length,
                              pwaBuild.indexOf("`;\n\nconst browser"));
await iconPage.evaluate("window.drawIcon = " + ICON_JS
  .replace(/\$\{INK\}/g, "#0B1226").replace(/\$\{AMBER\}/g, "#FFC94A")
  .replace(/\$\{MINT\}/g, "#6FCF7F").replace(/\$\{ROSE\}/g, "#FF5F7A"));

const grabRGBA = async (size, maskable) => iconPage.evaluate(([n, m]) => {
  const url = window.drawIcon(n, m);
  const c = document.createElement("canvas"); c.width = c.height = n;
  const x = c.getContext("2d");
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { x.drawImage(img, 0, 0, n, n);
      res(Array.from(x.getImageData(0, 0, n, n).data)); };
    img.src = url;
  });
}, [size, maskable]);

const BG = [11, 18, 38];                               /* the game's ink */
/* Play store icon: 512x512, 32-bit, no alpha */
fs.writeFileSync(path.join(OUT, "play/icon-512.png"),
  rgbaToOpaquePng(Uint8Array.from(await grabRGBA(512, false)), 512, 512, BG));
/* App Store marketing icon: 1024x1024, no alpha, NO rounded corners of our
   own — Apple applies its own mask and a pre-rounded icon gets rounded twice */
fs.writeFileSync(path.join(OUT, "ios/icon-1024.png"),
  rgbaToOpaquePng(Uint8Array.from(await grabRGBA(1024, true)), 1024, 1024, BG));

/* ── Play feature graphic: 1024x500, no alpha ──
   Landscape gameplay as the backdrop with the wordmark over it, rather
   than a flat logo card — the feature graphic is the first thing a
   browsing player sees and it should show the game. */
const fgCtx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
const fgPage = await fgCtx.newPage();
await fgPage.goto(GAME);
await fgPage.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
await fgPage.evaluate(() => window.JJA_DEBUG.capture());
await fgPage.waitForTimeout(1400);
/* A run already BEGINS in FOREST (world 0 spans 0-280m), so the backdrop is
   captured by letting it play naturally rather than teleporting. setDist()
   moves the player instantly, which can drop them through a gap the terrain
   has not generated yet — the previous pass produced a feature graphic with
   a "2 HEARTS LEFT" damage flash across it. */
await fgPage.evaluate(() => {
  const d = window.JJA_DEBUG;
  d.capture(); d.restart(); d.holdBoss(); d.fillJuice();
});
{ const t0 = Date.now();
  while (Date.now() - t0 < 3600) {
    await fgPage.evaluate(() => { const d = window.JJA_DEBUG;
      d.keepAlive(); if (d.state.juice < 200) d.fillJuice(); });
    await fgPage.waitForTimeout(110); } }
await fgPage.evaluate(() => window.JJA_DEBUG.capture());
const gameplayShot = await fgPage.screenshot();
await fgPage.close(); await fgCtx.close();

const fgComposePage = await browser.newPage();
await fgComposePage.setViewportSize({ width: 1024, height: 500 });
await fgComposePage.setContent(`<body style="margin:0">
<canvas id="c" width="1024" height="500"></canvas></body>`);
const fgRGBA = await fgComposePage.evaluate(async bg => {
  const c = document.getElementById("c"), x = c.getContext("2d");
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = "data:image/png;base64," + bg; });
  x.drawImage(img, 0, 0, 1024, 500);
  /* darken toward the left so the wordmark has contrast to sit on */
  const g = x.createLinearGradient(0, 0, 1024, 0);
  g.addColorStop(0, "rgba(11,18,38,.94)"); g.addColorStop(.52, "rgba(11,18,38,.55)");
  g.addColorStop(1, "rgba(11,18,38,.10)");
  x.fillStyle = g; x.fillRect(0, 0, 1024, 500);
  x.textBaseline = "alphabetic";
  x.fillStyle = "#F2EDE4";
  x.font = "700 92px system-ui,sans-serif";
  x.fillText("JUMP JUICE", 56, 232);
  x.fillStyle = "#FFC94A";
  x.font = "700 46px system-ui,sans-serif";
  x.fillText("ADVENTURE", 60, 288);
  x.fillStyle = "rgba(242,237,228,.92)";
  x.font = "500 25px ui-monospace,monospace";
  x.fillText("Fill the meter · Trigger Juice Mode · Go further", 60, 348);
  x.fillStyle = "#6FCF7F";
  x.font = "600 21px ui-monospace,monospace";
  x.fillText("7 WORLDS · 7 BOSSES · NO ADS · PLAYS OFFLINE", 60, 396);
  return Array.from(x.getImageData(0, 0, 1024, 500).data);
}, gameplayShot.toString("base64"));
fs.writeFileSync(path.join(OUT, "play/feature-graphic-1024x500.png"),
  rgbaToOpaquePng(Uint8Array.from(fgRGBA), 1024, 500, BG));
await fgComposePage.close();
await iconPage.close();
await browser.close();

/* ── report ── */
const png = f => { const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bits: b[24], type: b[25],
           kb: (b.length / 1024).toFixed(0) }; };
const TYPE = { 0: "grey", 2: "RGB", 3: "indexed", 4: "grey+alpha", 6: "RGBA" };
console.log("Store assets -> " + OUT + "\n");
for (const f of ["play/icon-512.png", "play/feature-graphic-1024x500.png", "ios/icon-1024.png"]) {
  const i = png(path.join(OUT, f));
  console.log("  " + f.padEnd(38) + i.w + "x" + i.h + "  " + TYPE[i.type] +
    " " + i.bits + "-bit  " + i.kb + "KB" + (i.type === 2 ? "  (no alpha ✓)" : "  ALPHA!"));
}
console.log("\n  screenshots: " + shotCount + " captured from real gameplay");
for (const s of SCREENS) {
  const files = fs.readdirSync(path.join(OUT, s.dir));
  console.log("    " + s.dir.padEnd(20) + s.w + "x" + s.h + "  " + files.length + " shots");
}
