/* Verifies the installable build in dist/pwa/ — served over HTTP, because
   every part of this (service workers, manifests, install) is inert on
   file://, which is exactly why it needs its own suite.

   The offline assertion is the point of the whole thing: it kills the
   server, reloads, and requires the game to still boot and play.

   Usage: node test/pwa.mjs   (run node test/build-pwa.mjs first)          */
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import http from "http";
import fs from "fs";
import path from "path";

const ROOT = path.resolve("dist/pwa");
if (!fs.existsSync(path.join(ROOT, "index.html"))) {
  console.error("dist/pwa is missing — run: node test/build-pwa.mjs");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n))
  : (fail++, console.log("  ✗ " + n + (d !== undefined ? "  →  " + JSON.stringify(d) : ""))); };

/* ── a real static server, so the service worker has a real origin ── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png",
  ".webmanifest": "application/manifest+json", ".json": "application/json" };
let serving = true;
const server = http.createServer((req, res) => {
  if (!serving) { req.socket.destroy(); return; }          /* simulated offline */
  const u = decodeURIComponent(req.url.split("?")[0]);
  let f = path.join(ROOT, u === "/" ? "index.html" : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end("nope"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const ORIGIN = "http://127.0.0.1:" + server.address().port;

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } });
const errs = [];
const page = await ctx.newPage();
page.on("pageerror", e => errs.push(String(e)));

console.log("\nPWA build\n");

/* ── 1. manifest ── */
const mres = await page.request.get(ORIGIN + "/manifest.webmanifest");
ok("manifest is served", mres.ok(), mres.status());
const man = await mres.json();
ok("manifest names the game", man.name === "Jump Juice Adventure", man.name);
ok("short_name fits a home screen (<=12 chars)",
   man.short_name && man.short_name.length <= 12, man.short_name);
ok("launches without browser chrome", man.display === "standalone", man.display);
ok("background_color matches the game's ink",
   man.background_color === "#0B1226", man.background_color);
ok("start_url is relative, so it works from any sub-path",
   !man.start_url.startsWith("/") || man.start_url === "/", man.start_url);
/* Android needs a 192 and a 512 to offer installation at all, and a maskable
   icon or it letterboxes the tile inside a white rounded square. */
const sizes = man.icons.map(i => i.sizes);
ok("has a 192px icon", sizes.includes("192x192"), sizes);
ok("has a 512px icon", sizes.includes("512x512"), sizes);
ok("has a maskable icon", man.icons.some(i => (i.purpose || "").includes("maskable")),
   man.icons.map(i => i.purpose));
/* every icon the manifest promises must actually exist — a 404 here is the
   classic reason an install prompt silently never appears */
const missing = [];
for (const i of man.icons.concat(man.screenshots || [])) {
  const r = await page.request.get(ORIGIN + "/" + i.src.replace(/^\.?\//, ""));
  if (!r.ok()) missing.push(i.src);
}
ok("every icon and screenshot in the manifest exists", missing.length === 0, missing);
/* declared sizes must match the real pixels, or Chrome rejects the icon */
const wrongSize = [];
for (const i of man.icons) {
  const buf = Buffer.from(await (await page.request.get(
    ORIGIN + "/" + i.src.replace(/^\.?\//, ""))).body());
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);   /* PNG IHDR */
  if (i.sizes !== w + "x" + h) wrongSize.push([i.src, i.sizes, w + "x" + h]);
}
ok("declared icon sizes match the real pixels", wrongSize.length === 0, wrongSize);

/* ── 2. boot + service worker ── */
await page.goto(ORIGIN + "/index.html?debug=1");
await page.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
ok("the built PWA boots", true);
const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready.catch(() => null);
  return !!(r && r.active);
});
ok("service worker registers and activates", reg);
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  if (!keys.length) return { keys, n: 0 };
  const c = await caches.open(keys[0]);
  return { keys, n: (await c.keys()).length };
});
ok("a cache is populated", cached.n > 0, cached);
ok("the cache name is versioned", /^jja-/.test(cached.keys[0] || ""), cached.keys);

/* ── 3. the actual point: it plays with the network gone ── */
serving = false;                                   /* server now refuses everything */
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
ok("boots offline from the service-worker cache", true);
const offlinePlay = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart();
  const d0 = d.state.dist;
  for (let i = 0; i < 90; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  return { moved: d.state.dist > d0, st: d.state.ST };
});
ok("plays offline — distance still accrues", offlinePlay.moved, offlinePlay);
ok("offline run is really in play state", offlinePlay.st === "play", offlinePlay);
serving = true;

/* ── 4. install affordance ──
   beforeinstallprompt cannot be fired synthetically, so this checks the two
   things that are ours: the button exists, and it stays hidden until a
   browser actually offers an install (it must not sit there doing nothing). */
await page.goto(ORIGIN + "/index.html");
await page.waitForTimeout(1200);
ok("an install button exists", await page.evaluate(() => !!document.getElementById("bInstall")));
ok("install button is hidden until the browser offers it",
   await page.evaluate(() => getComputedStyle(document.getElementById("bInstall")).display === "none"));
/* dispatching the event must reveal it and must not throw */
const revealed = await page.evaluate(async () => {
  const e = new Event("beforeinstallprompt");
  e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: "dismissed" });
  window.dispatchEvent(e);
  await new Promise(r => setTimeout(r, 80));
  return getComputedStyle(document.getElementById("bInstall")).display !== "none";
});
ok("install button appears once the browser offers an install", revealed);
const clicked = await page.evaluate(async () => {
  document.getElementById("bInstall").click();
  await new Promise(r => setTimeout(r, 120));
  return true;                                    /* a throw fails the pageerror check */
});
ok("clicking install does not throw", clicked);

/* ── 5. the single file must still work from disk ──
   The manifest link and the sw.js registration are the two things most
   likely to break file:// play, so this is asserted, not assumed. */
const filePage = await ctx.newPage();
const fileErrs = [];
filePage.on("pageerror", e => fileErrs.push(String(e)));
await filePage.goto("file://" + path.resolve("jumpjuice.html") + "?debug=1");
await filePage.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
ok("the single file still boots from file:// with the install tags present",
   fileErrs.length === 0, fileErrs.slice(0, 3));
ok("no service worker is registered on file://",
   await filePage.evaluate(async () => {
     if (!("serviceWorker" in navigator)) return true;
     const rs = await navigator.serviceWorker.getRegistrations().catch(() => []);
     return rs.length === 0;
   }));

ok("no JS errors", errs.length === 0, errs.slice(0, 4));

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
