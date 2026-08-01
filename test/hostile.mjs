/* Hostile-environment boot test: does the game ever get stuck on the
   loading screen? Each case cripples one browser API the way a real
   locked-down / older / sandboxed browser would. */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";
const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html"));

const CASES = {
  "baseline": () => {},
  "localStorage throws (Safari private mode)": () => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("blocked", "SecurityError"); }, configurable: true });
  },
  "localStorage.setItem throws (quota full)": () => {
    const ls = window.localStorage;
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => ({
      getItem: k => ls.getItem(k),
      setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
    })});
  },
  "corrupt saved game": () => { try { localStorage.setItem("jja2", "{not json"); } catch (e) {} },
  "save with wrong types": () => {
    try { localStorage.setItem("jja2", JSON.stringify({
      best: "NaN", coins: null, xp: {}, unlocked: "Blip", sel: 42,
      msProg: "x", msDone: null, ach: 7 })); } catch (e) {}
  },
  "no visualViewport": () => { delete window.visualViewport; },
  "no AudioContext at all": () => { delete window.AudioContext; delete window.webkitAudioContext; },
  "no matchMedia.addEventListener (older Safari)": () => {
    const mm = window.matchMedia;
    window.matchMedia = q => { const r = mm(q); return { matches: r.matches, media: r.media,
      addListener() {}, removeListener() {} }; };   // no addEventListener
  },
  "no navigator.vibrate": () => { delete navigator.vibrate; },
  "no requestFullscreen": () => {
    delete Element.prototype.requestFullscreen; delete Element.prototype.webkitRequestFullscreen;
  },
  "getContext null after 3 (canvas cap hit)": () => {
    const g = HTMLCanvasElement.prototype.getContext; let n = 0;
    HTMLCanvasElement.prototype.getContext = function (...a) { return ++n > 3 ? null : g.apply(this, a); };
  },
  "getContext null after 1 (tight cap)": () => {
    const g = HTMLCanvasElement.prototype.getContext; let n = 0;
    HTMLCanvasElement.prototype.getContext = function (...a) { return ++n > 1 ? null : g.apply(this, a); };
  },
  "getContext always null (no canvas at all)": () => {
    HTMLCanvasElement.prototype.getContext = function () { return null; };
  },
  "getContext throws": () => {
    HTMLCanvasElement.prototype.getContext = function () { throw new Error("ctx denied"); };
  },
  "createRadialGradient throws": () => {
    const f = CanvasRenderingContext2D.prototype.createRadialGradient;
    let n = 0;
    CanvasRenderingContext2D.prototype.createRadialGradient = function (...a) {
      if (++n > 2) throw new Error("gradient denied"); return f.apply(this, a); };
  },
  "requestAnimationFrame missing": () => { delete window.requestAnimationFrame; },
  "window.storage present but rejects": () => {
    window.storage = { get: () => Promise.reject(new Error("nope")), set: () => Promise.reject(new Error("nope")) };
  },
  "window.storage present and never settles": () => {
    window.storage = { get: () => new Promise(() => {}), set: () => new Promise(() => {}) };
  },
  "no roundRect (older Safari)": () => { delete CanvasRenderingContext2D.prototype.roundRect; },
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader"],
});
let fails = 0;
for (const [name, patch] of Object.entries(CASES)) {
  const ctx = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e && e.message)));
  await page.addInitScript(patch);
  await page.goto(FILE, { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(3600);            // failsafe is 2.5s; allow margin
  const st = await page.evaluate(() => {
    const b = document.getElementById("boot");
    return { gone: !!b && b.classList.contains("gone"),
             disp: b ? getComputedStyle(b).display : "?",
             txt: (document.getElementById("bootTxt") || {}).textContent };
  }).catch(e => ({ gone: false, disp: "eval-failed:" + e.message }));
  /* Success = the player is not trapped: either the game booted, or it
     explained itself and offered a way through. */
  const escaped = await page.evaluate(() => {
    const e = document.getElementById("bootErr"), k = document.getElementById("bootSkip");
    return !!(e && e.style.display !== "none" && e.textContent) &&
           !!(k && k.style.display !== "none");
  }).catch(() => false);
  const stuck = !st.gone && !escaped;
  if (stuck) fails++;
  console.log((stuck ? "✗ STUCK  " : (st.gone ? "✓ boots  " : "✓ warns  ")) + name +
    (errs.length ? "\n           error: " + errs[0].split("\n")[0] : ""));
  await ctx.close();
}
console.log("\n" + (fails ? fails + " CASE(S) HANG ON THE LOADING SCREEN" : "no hangs"));
await browser.close();
process.exit(fails ? 1 : 0);
