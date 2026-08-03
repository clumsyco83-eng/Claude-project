/* Long-run stability soak.
   Plays continuously and samples memory, object counts and frame health, to
   catch the failure modes that only appear after many minutes: arrays that
   never shrink, audio nodes that are never released, listeners re-registered
   per run, and a heap that only ever grows.

   Usage: node test/soak.mjs [--min=10] [--file=jumpjuice.html]
*/
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";

const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const MIN = +arg("min", 10);
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html")) + "?debug=1";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required",
         "--js-flags=--expose-gc"],
});
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const jsErrors = [];
page.on("pageerror", e => jsErrors.push(e.message));
await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(1200);

await page.evaluate(() => { JJA_DEBUG.setMod(null); JJA_DEBUG.restart(); });
/* The player only advances while a direction is held — there is no auto-run.
   Without this the soak sits at 0m and never exercises world generation,
   culling, or the object churn it is supposed to be measuring. */
await page.keyboard.down("KeyD");

const samples = [];
const END = Date.now() + MIN * 60 * 1000;
let ticks = 0;
console.log(`soaking for ${MIN} minute(s)...`);

while (Date.now() < END) {
  /* keep the run alive and keep the world busy: force bosses and juice so
     the heaviest code paths are exercised, not just an idle jog */
  await page.evaluate(() => {
    JJA_DEBUG.keepAlive();
    const s = JJA_DEBUG.state;
    if (s.ST !== "play") JJA_DEBUG.restart();
    if (s.meter < 40) JJA_DEBUG.fillJuice();
    if (!s.boss && Math.random() < 0.25) JJA_DEBUG.forceBoss();
  });
  /* keep it airborne enough to keep travelling past gaps */
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  ticks++;
  if (ticks % 20 === 0) {
    const s = await page.evaluate(() => {
      const st = JJA_DEBUG.state;
      return {
        heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
        plats: st.plats, orbs: st.orbs, foes: st.foes, shots: st.shots,
        dist: st.dist, autoLite: st.autoLite,
        nodes: document.querySelectorAll("*").length,
      };
    });
    s.t = Math.round((Date.now() - (END - MIN * 60000)) / 1000);
    samples.push(s);
    console.log(`  t=${String(s.t).padStart(4)}s  heap=${(s.heap / 1048576).toFixed(1)}MB  ` +
      `plats=${s.plats} orbs=${s.orbs} foes=${s.foes} shots=${s.shots} dom=${s.nodes} dist=${s.dist}`);
  }
}

const first = samples[0], last = samples[samples.length - 1];
const maxOf = k => Math.max(...samples.map(s => s[k]));
console.log("\nresults");
console.log("  samples            : " + samples.length);
console.log("  heap first/last    : " + (first.heap / 1048576).toFixed(1) + "MB -> " +
  (last.heap / 1048576).toFixed(1) + "MB");
console.log("  peak platforms     : " + maxOf("plats"));
console.log("  peak orbs          : " + maxOf("orbs"));
console.log("  peak enemies       : " + maxOf("foes"));
console.log("  peak shots         : " + maxOf("shots"));
console.log("  DOM nodes f/l      : " + first.nodes + " -> " + last.nodes);
console.log("  distance f/l       : " + first.dist + "m -> " + last.dist + "m");

/* object arrays must be bounded, not monotonically growing */
const bounded = maxOf("plats") < 400 && maxOf("orbs") < 900 &&
                maxOf("foes") < 120 && maxOf("shots") < 200;
/* heap may fluctuate with GC, but must not balloon */
const heapGrowth = last.heap && first.heap ? last.heap / first.heap : 1;
const heapOk = !first.heap || heapGrowth < 2.5;
const domOk = last.nodes <= first.nodes + 8;   /* no per-run DOM accumulation */
const stillPlaying = last.dist > 200 && last.dist > first.dist;

console.log("\n  object arrays bounded : " + (bounded ? "yes" : "NO"));
console.log("  heap growth ratio     : " + heapGrowth.toFixed(2) + (heapOk ? "  ok" : "  TOO HIGH"));
console.log("  DOM stable            : " + (domOk ? "yes" : "NO"));
console.log("  still running         : " + (stillPlaying ? "yes" : "NO"));
console.log("  js errors             : " + (jsErrors.length ? jsErrors[0] : "none"));

const pass = bounded && heapOk && domOk && stillPlaying && jsErrors.length === 0;
console.log("\n" + (pass ? "PASS  stable over " + MIN + " minutes" : "FAIL  instability detected"));
await browser.close();
process.exit(pass ? 0 : 1);
