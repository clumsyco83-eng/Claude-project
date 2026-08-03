/* Procedural-generation fairness validator.
   Drives the REAL gen() inside the shipped game (via ?debug=1) with a
   seeded Math.random, so every failure is reproducible from its seed and
   the thing under test is the code that actually runs — not a copy of it.

   What it proves, per generated sequence:
     - every horizontal void is inside the character's real jump budget
     - every upward step is inside the real jump apex
     - landings are wide enough to stand on
     - No-Double-Jump mode obeys its own, much tighter, single-jump budget
     - the difficulty curve is monotonic and never exceeds 1

   Usage:
     node test/genvalidate.mjs                    # 10k normal + 10k NODBL
     node test/genvalidate.mjs --n=2000           # smaller sweep
     node test/genvalidate.mjs --seed=12345       # reproduce one seed
*/
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";

const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const N = +arg("n", 10000);
const ONE = process.argv.some(a => a.startsWith("--seed="));
const SEED0 = +arg("seed", 1);
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html")) + "?debug=1";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

/* Deterministic Math.random, re-seedable from the test side. */
await page.addInitScript(() => {
  let s = 1;
  window.__seed = v => { s = (v >>> 0) || 1; };
  Math.random = () => {
    /* xorshift32 — fast, and identical for a given seed across runs */
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
});

const jsErrors = [];
page.on("pageerror", e => jsErrors.push(e.message));
await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(1200);

const REACH = await page.evaluate(() => JJA_DEBUG.REACH);
console.log("reach budget:", JSON.stringify(REACH));

/* ── the fairness rules, applied to one generated sequence ── */
const EPS = 1e-6;   // gaps accumulate through float addition in gen(); a
                    // gap of 120.000000000000909 is the clamp working, not
                    // an unfair jump. Compare with tolerance, not equality.
function validate(plats, mode) {
  const budget = mode === "NODBL"
    ? { gap: REACH.nodblGap, rise: REACH.nodblRise }
    : { gap: REACH.double.gap, rise: REACH.double.rise };
  /* the main lane only: `high` platforms are an optional bonus route */
  const lane = plats.filter(p => !p.high).sort((a, b) => a.x - b.x);
  const bad = [];
  for (let i = 1; i < lane.length; i++) {
    const prev = lane[i - 1], cur = lane[i];
    const gap = cur.x - (prev.x + prev.w);
    const rise = prev.y - cur.y;              // >0 means climbing
    if (gap > budget.gap + EPS) bad.push({ rule: "gap", gap: Math.round(gap), max: budget.gap, x: Math.round(cur.x) });
    if (rise > budget.rise + EPS) bad.push({ rule: "rise", rise: Math.round(rise), max: budget.rise, x: Math.round(cur.x) });
    if (cur.w < 34) bad.push({ rule: "landing-too-narrow", w: Math.round(cur.w), x: Math.round(cur.x) });
    /* a spiked platform must never be the only thing on the far side of a
       gap the player is forced to cross */
    if (cur.spike && gap > 0 && i + 1 < lane.length) {
      const nxt = lane[i + 1];
      const esc = nxt.x - (cur.x + cur.w);
      if (esc > budget.gap + EPS) bad.push({ rule: "spike-trap", x: Math.round(cur.x) });
    }
  }
  /* under NODBL nothing may require the second jump */
  if (mode === "NODBL" && plats.some(p => p.high))
    bad.push({ rule: "high-road-present-under-nodbl" });
  return bad;
}

async function sweep(mode, count, label) {
  let checked = 0, seqs = 0;
  const failures = [];
  const startSeed = ONE ? SEED0 : 1;
  const total = ONE ? 1 : count;
  /* Batched: one round-trip per BATCH sequences. 20k individual evaluate()
     calls spend nearly all their time in IPC rather than in the generator. */
  const BATCH = 250;
  for (let i = 0; i < total; i += BATCH) {
    const n = Math.min(BATCH, total - i);
    const jobs = [];
    for (let j = 0; j < n; j++)
      jobs.push([startSeed + i + j, ((i + j) * 137) % 6000]);
    const batch = await page.evaluate(([md, js]) => js.map(([sd, sm]) => {
      window.__seed(sd);
      return JJA_DEBUG.genSeq(md, sm, 3);
    }), [mode, jobs]);
    for (let j = 0; j < batch.length; j++) {
      const plats = batch[j], [seed, startM] = jobs[j];
      seqs++; checked += plats.length;
      const bad = validate(plats, mode);
      if (bad.length) failures.push({ seed, startM, first: bad[0], n: bad.length });
    }
  }
  const ok = failures.length === 0;
  console.log(`\n${label}`);
  console.log(`  sequences generated : ${seqs}`);
  console.log(`  platforms validated : ${checked}`);
  console.log(`  invalid sequences   : ${failures.length}`);
  if (!ok) {
    console.log("  first 8 failing seeds (reproduce with --seed=N):");
    failures.slice(0, 8).forEach(f =>
      console.log(`    seed=${f.seed} at ${f.startM}m  ${JSON.stringify(f.first)}  (${f.n} violations)`));
  }
  return ok;
}

/* ── difficulty curve sanity ── */
const curve = await page.evaluate(() => {
  const out = [];
  for (let m = 0; m <= 6000; m += 100) out.push([m, +JJA_DEBUG.diffAt(m).toFixed(4), JJA_DEBUG.stageAt(m)]);
  return out;
});
let curveOk = true;
for (let i = 1; i < curve.length; i++) {
  if (curve[i][1] < curve[i - 1][1]) { curveOk = false; console.log("  ✗ curve dips at", curve[i][0]); }
  if (curve[i][1] > 1.00001) { curveOk = false; console.log("  ✗ curve exceeds 1 at", curve[i][0]); }
}
console.log("\ndifficulty curve");
console.log("  monotonic & capped  : " + (curveOk ? "yes" : "NO"));
[0, 400, 1000, 2000, 3500, 6000].forEach(m => {
  const row = curve.find(c => c[0] === m);
  if (row) console.log(`    ${String(m).padStart(4)}m  d=${row[1].toFixed(3)}  stage ${row[2]}`);
});

const a = await sweep(null, N, `normal generation  (${ONE ? 1 : N} sequences)`);
const b = await sweep("NODBL", N, `no-double-jump generation  (${ONE ? 1 : N} sequences)`);

console.log("\njs errors: " + (jsErrors.length ? jsErrors[0] : "none"));
const pass = a && b && curveOk && jsErrors.length === 0;
console.log("\n" + (pass ? "PASS  all generated sequences are completable" : "FAIL  invalid sequences found"));
await browser.close();
process.exit(pass ? 0 : 1);
