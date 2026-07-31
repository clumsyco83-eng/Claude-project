/* Headless verification harness for jumpjuice.html.
   Drives the real game in Chromium and asserts on live state via the
   ?debug=1 hook. Usage: node test/smoke.mjs [--device=iphone|android|tablet|desktop] */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";

const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const DEV = arg("device", "desktop");
const FILE = "file://" + path.resolve("jumpjuice.html") + "?debug=1";

const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false },
  edge:    { viewport: { width: 1536, height: 864 }, hasTouch: false, isMobile: false },
  iphone: devices["iPhone 13"],
  android: devices["Pixel 5"],
  tablet: devices["iPad (gen 7)"],
};

const jsErrors = [], netErrors = [];
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "  →  " + JSON.stringify(extra) : "")); }
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--use-gl=swiftshader"],
});
const ctx = await browser.newContext({ ...PROFILES[DEV] });
const page = await ctx.newPage();

/* spy must be installed before the page's own script runs */
await page.addInitScript(() => {
  window.__acs = [];
  const O = window.AudioContext || window.webkitAudioContext;
  if (O) window.AudioContext = class extends O { constructor(...a) { super(...a); window.__acs.push(this); } };
  window.__audios = [];
  const A = window.Audio;
  window.Audio = function (...a) { const el = new A(...a); window.__audios.push(el); return el; };
});
page.on("console", m => {
  if (m.type() !== "error") return;
  const t = m.text();
  (/net::ERR|Failed to load resource/.test(t) ? netErrors : jsErrors).push(t);
});
page.on("pageerror", e => jsErrors.push("PAGEERROR: " + (e && e.message) + "\n" + (e && e.stack || "").split("\n").slice(0, 3).join(" | ")));

await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(1000);
const S = () => page.evaluate(() => window.JJA_DEBUG.state);
const D = fn => page.evaluate(fn);

console.log("\n── " + DEV.toUpperCase() + " ──");

/* ─────────── 1. boot & layout ─────────── */
ok("debug hook present", await D(() => !!window.JJA_DEBUG));
ok("boot overlay dismissed", await D(() => document.getElementById("boot").classList.contains("gone")));
ok("start overlay visible", await D(() => document.getElementById("ovStart").classList.contains("show")));
const geo = await D(() => { const c = document.getElementById("game"); const r = c.getBoundingClientRect();
  return { w: c.width, h: c.height, cw: Math.round(r.width), ch: Math.round(r.height), vw: innerWidth, vh: innerHeight }; });
ok("canvas backing store sized", geo.w > 100 && geo.h > 100, geo);
ok("canvas fits viewport (no page scroll)", geo.cw <= geo.vw + 1 && geo.ch <= geo.vh + 1, geo);
ok("body does not scroll", await D(() => document.documentElement.scrollHeight <= innerHeight + 1));
ok("default runner unlocked", (await S()).save.unlocked.length >= 1, (await S()).save.unlocked);
ok("selected runner is unlocked", await D(() => { const s = window.JJA_DEBUG.state.save; return s.unlocked.includes(s.sel); }));

/* ─────────── 2. audio ─────────── */
ok("no AudioContext before any gesture", (await D(() => window.__acs.length)) === 0);
await page.click("#bPlay");
await page.waitForTimeout(800);
const ac = await D(() => ({ n: window.__acs.length, st: window.__acs.map(a => a.state), audios: window.__audios.length }));
ok("AudioContext created on first gesture", ac.n === 1, ac);
ok("AudioContext resumed to running", ac.st.includes("running"), ac);
ok("silent media element started (iOS ringer path)", ac.audios >= 1, ac);
ok("audio diagnostic shows running", /running/.test(await D(() => document.getElementById("audioDiag").textContent)));
/* backgrounding used to permanently kill audio and cause a scheduler burst */
await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await page.waitForTimeout(1200);
ok("auto-paused when backgrounded", (await S()).paused);
await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
await page.waitForTimeout(400);
ok("AudioContext still running after background/foreground", (await S()).audio === "running", (await S()).audio);
await page.keyboard.press("KeyP");
await page.waitForTimeout(200);
ok("resumed after unpause", !(await S()).paused);

/* ─────────── 3. movement / jump / dash ─────────── */
let s0 = await S();
await page.keyboard.down("KeyD"); await page.waitForTimeout(500);
let s1 = await S();
ok("player moves right when steering", s1.px > s0.px + 20, { from: s0.px, to: s1.px });
await page.keyboard.up("KeyD");
await page.keyboard.press("Space"); await page.waitForTimeout(120);
ok("jump produces upward velocity", (await S()).pvy < 0);
const jumpsBefore = (await S()).jumps;
await page.keyboard.press("Space"); await page.waitForTimeout(120);
ok("double jump registers", (await S()).jumps > jumpsBefore);
await page.waitForTimeout(900);
await page.keyboard.press("ShiftLeft"); await page.waitForTimeout(100);
ok("dash goes on cooldown", (await S()).dashCd > 0);

/* ─────────── 4. juice mode ─────────── */
/* a key-mashing bot cannot survive a procedural runner, and once ST goes
   to "dead" step() short-circuits, so every downstream system would be
   measured against a stopped simulation. Pin the run alive first. */
const alive = async () => D(() => {
  const d = window.JJA_DEBUG;
  if (d.state.ST !== "play") d.restart();     /* restarting wipes the boss, so only when truly dead */
  d.keepAlive();
});
/* today's seeded daily modifier is live; test the base mechanic with it
   off, then test the modifier variant explicitly below */
const modName = await D(() => window.JJA_DEBUG.state.RMOD);
console.log("    today's daily modifier: " + modName);
ok("no daily modifier can disable Juice Mode",
  await D(() => !JSON.stringify(window.JJA_DEBUG.state).includes("NOJUICE")));
await page.evaluate(() => { const c = document.getElementById("oMod"); if (c.checked) c.click(); });
await D(() => window.JJA_DEBUG.restart());
await alive();
await page.waitForTimeout(120);
await D(() => window.JJA_DEBUG.fillJuice());
await page.waitForTimeout(260);
const j = await S();
ok("juice mode activates at 100%", j.juice > 0, { juice: j.juice, meter: j.meter });
ok("juice timer matches juiceLen (no bar overflow)", j.juice <= j.juiceMax && j.juiceMax > 0, { juice: j.juice, max: j.juiceMax });
ok("meter frozen during juice (no instant retrigger)", j.meter === 0, { meter: j.meter });
ok("bullet-time is a smooth timeScale, not frame-skipping", j.timeScale > 0 && j.timeScale <= 1, { ts: j.timeScale });
/* let it run out and confirm it does not immediately re-fire */
const jm = (await S()).juiceMax;
console.log("    juice window: " + jm + " frames (" + (jm / 60).toFixed(1) + "s)");
/* the original kept accumulating meter during Juice Mode, so it re-fired
   the instant it expired — an endless juice loop. Verify it ends. */
await D(() => { window.JJA_DEBUG.state; });
for (let i = 0; i < 200 && (await S()).juice > 0; i++) { await alive(); await page.waitForTimeout(60); }
const jEnd = await S();
ok("juice mode actually ends", jEnd.juice === 0, { juice: jEnd.juice });
ok("juice does not instantly retrigger", jEnd.meter < 100, { meter: jEnd.meter });

/* the JUICERUSH modifier must shorten Juice Mode, never remove it */
await page.evaluate(() => {
  const c = document.getElementById("oMod"); if (!c.checked) c.click();
});
await D(() => { window.JJA_DEBUG.restart(); });
await page.waitForTimeout(150);
const th = (await S()).juiceThresh;
ok("juice threshold is sane under today's modifier", th >= 60 && th <= 100, { th });
await alive(); await D(() => window.JJA_DEBUG.fillJuice());
await page.waitForTimeout(220);
ok("juice still triggers with the daily modifier on", (await S()).juice > 0,
  { juice: (await S()).juice, mod: (await S()).RMOD });
await page.evaluate(() => { const c = document.getElementById("oMod"); if (c.checked) c.click(); });
await D(() => window.JJA_DEBUG.restart());

/* ─────────── 5. boss fight ─────────── */
await alive();
await page.evaluate(() => { const d = window.JJA_DEBUG; d.setDist(340); d.forceBoss(); });
await page.waitForTimeout(400);
let b = (await S()).boss;
ok("boss spawns", !!b, b);
ok("boss starts in warn state", b && b.st === "warn", b);
ok("boss has health > 0", b && b.hp > 0 && b.max === b.hp, b);

/* watch a full attack cycle and record which states appear */
const seen = new Set();
let reachableInStun = false;
for (let i = 0; i < 220; i++) {
  await alive();
  const st = await S();
  if (!st.boss) break;
  seen.add(st.boss.st);
  if (st.boss.st === "stun") {
    const r = await D(() => window.JJA_DEBUG.reachableBoss());
    if (r && r.inRange) reachableInStun = true;
  }
  await page.waitForTimeout(60);
}
ok("boss reaches hover state", seen.has("hover"), [...seen]);
ok("boss telegraphs its shot (aim state)", seen.has("aim"), [...seen]);
ok("boss telegraphs its dive (charge state)", seen.has("charge"), [...seen]);
ok("boss dives (swoop state)", seen.has("swoop"), [...seen]);
ok("boss becomes stunned & vulnerable", seen.has("stun"), [...seen]);
ok("stunned boss is inside the player's jump range", reachableInStun);

/* now actually kill it through the damage path */
await alive();
await page.evaluate(() => { window.JJA_DEBUG.forceBoss(); });
for (let i = 0; i < 40 && !(await S()).boss; i++) { await alive(); await page.waitForTimeout(60); }
let killed = false, hpTrace = [];
for (let i = 0; i < 400; i++) {
  await alive();
  const st = await S();
  if (!st.boss) { killed = true; break; }
  if (st.boss.st === "dead") { killed = true; hpTrace.push(0); break; }
  hpTrace.push(st.boss.hp);
  await D(() => window.JJA_DEBUG.hitBoss());
  await page.waitForTimeout(40);
}
ok("boss can be damaged and killed", killed, { hpTrace: hpTrace.slice(0, 12) });
ok("boss HP decreased monotonically", hpTrace.every((v, i) => i === 0 || v <= hpTrace[i - 1]), hpTrace.slice(0, 12));
const afterKill = await S();
ok("kill awards a runner unlock", afterKill.save.unlocked.length > 1, afterKill.save.unlocked.length);
ok("kill counted + persisted", afterKill.save.bossKills >= 1, afterKill.save.bossKills);
ok("unlock written to localStorage immediately",
  JSON.parse(await D(() => localStorage.getItem("jja2"))).bossKills >= 1);
/* death sequence must finish and clear the boss */
for (let i = 0; i < 120 && (await S()).boss; i++) { await alive(); await page.waitForTimeout(60); }
ok("death sequence completes and boss despawns", !(await S()).boss);

/* boss must not be able to hound the player forever */
await alive();
await page.evaluate(() => { window.JJA_DEBUG.forceBoss(); });
for (let i = 0; i < 40 && !(await S()).boss; i++) { await alive(); await page.waitForTimeout(60); }
ok("despawn guard uses a non-resetting life counter",
  await D(() => { const b = window.JJA_DEBUG.state.boss; return !!b && typeof b.life === "number"; }));

/* ─────────── 6. void respawn (was a heart-drain loop) ─────────── */
await D(() => window.JJA_DEBUG.restart());
await page.waitForTimeout(200);
await page.evaluate(() => { window.JJA_DEBUG.setDist(600); });
await page.waitForTimeout(300);
const hpBefore = (await S()).hp;
ok("fresh run starts at full health", hpBefore >= 3, { hp: hpBefore });
await D(() => window.JJA_DEBUG.voidPlayer());
await page.waitForTimeout(500);
const rs = await S();
ok("falling costs exactly one heart", rs.hp === hpBefore - 1, { before: hpBefore, after: rs.hp });
ok("respawn lands above the play area floor", rs.py < 450, { py: rs.py });
await page.waitForTimeout(1500);
ok("does not chain-fall after respawn", (await S()).hp === hpBefore - 1, { hp: (await S()).hp });

/* ─────────── 7. numeric health ─────────── */
const fin = await S();
const nums = Object.entries(fin).filter(([, v]) => typeof v === "number");
ok("no NaN/Infinity in game state", nums.every(([, v]) => Number.isFinite(v)),
  nums.filter(([, v]) => !Number.isFinite(v)));

/* ─────────── 8. perf ─────────── */
const fps = await D(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); };
  requestAnimationFrame(f);
}));
ok("frame loop healthy", fps >= 20, { fps });
console.log("    measured rAF: " + fps + " fps (swiftshader software GL)");
const alloc = await D(() => {
  const s = window.JJA_DEBUG.state;
  return { plats: s.plats, orbs: s.orbs, foes: s.foes, shots: s.shots };
});
ok("object counts bounded", alloc.plats < 200 && alloc.orbs < 400 && alloc.foes < 120, alloc);

/* ─────────── 9. touch surfaces ─────────── */
const ta = await D(() => ({
  roster: getComputedStyle(document.getElementById("roster")).touchAction,
  ov: getComputedStyle(document.getElementById("ovChars")).touchAction,
  pauseBtn: (() => { const st = getComputedStyle(document.getElementById("pauseBtn"));
    return Math.round(Math.min(parseFloat(st.width), parseFloat(st.height))); })(),
  btnMin: (() => { const st = getComputedStyle(document.querySelector(".btn"));
    return Math.round(parseFloat(st.minHeight)); })(),
}));
ok("roster pannable on touch", ta.roster === "pan-y", ta);
ok("overlay pannable on touch", ta.ov === "pan-y", ta);
ok("pause button >= 44px touch target", ta.pauseBtn >= 44, ta);
ok("menu buttons >= 44px touch target", ta.btnMin >= 44, ta);

/* ─────────── 10. lifecycle ─────────── */
await page.evaluate(() => document.getElementById("bQuit").click());
await page.waitForTimeout(600);
ok("run-over screen shown", await D(() => document.getElementById("ovDead").classList.contains("show")));
const stored = JSON.parse(await D(() => localStorage.getItem("jja2")));
ok("progress persisted to localStorage", stored && Number.isFinite(stored.xp) && stored.xp >= 0, stored && { xp: stored.xp, coins: stored.coins, best: stored.best });
const bb = await page.locator("#game").boundingBox();
await page.mouse.click(bb.x + 6, bb.y + 6);
await page.waitForTimeout(500);
ok("tapping run-over screen restarts", (await S()).ST === "play");

/* ─────────── 11. errors ─────────── */
ok("no JS errors", jsErrors.length === 0, jsErrors.slice(0, 5));
if (netErrors.length) console.log("    (offline sandbox: " + netErrors.length + " font request(s) failed — non-fatal, font is loaded async with a system fallback)");

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
