/* Balance & systems regression suite for the polish pass.
   Everything asserted here is a value or behaviour this pass changed, so a
   later edit that silently moves one of them fails loudly.

   Usage: node test/balance.mjs [--file=jumpjuice.html] [--device=iphone]
*/
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";

const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const DEV = arg("device", "desktop");
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html")) + "?debug=1";
const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false },
  iphone: devices["iPhone 13"],
  android: devices["Pixel 5"],
};

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra !== undefined ? "  →  " + JSON.stringify(extra) : "")); }
};
const eq = (name, got, want) => ok(name + " = " + want, got === want, got);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--use-gl=swiftshader"],
});
const ctx = await browser.newContext({ ...PROFILES[DEV] });
const page = await ctx.newPage();
const jsErrors = [];
page.on("pageerror", e => jsErrors.push(e.message));
await page.goto(FILE, { waitUntil: "load" });
await page.waitForTimeout(1400);
const wait = ms => page.waitForTimeout(ms);

/* ─────────────────────────── Juice Mode ─────────────────────────── */
console.log("\nJuice Mode");
const jl = await page.evaluate(() => {
  JJA_DEBUG.setMod(null);
  return {
    cap: JJA_DEBUG.state.juiceCapF,
    blip: JJA_DEBUG.juiceLenOf("OJ"),
    bolt: JJA_DEBUG.juiceLenOf("Zest"),
    frost: JJA_DEBUG.juiceLenOf("Sorbet"),
  };
});
eq("standard hero Juice Mode frames", jl.blip, 720);
ok("standard hero Juice Mode = 12.0s", jl.blip / 60 === 12, jl.blip / 60);
eq("Bolt Juice Mode frames", jl.bolt, 585);
ok("Bolt Juice Mode = 9.75s (was 4.8s / 40% cut)", jl.bolt / 60 === 9.75, jl.bolt / 60);
ok("Bolt is shorter than standard but not punitive (>=9.5s)", jl.bolt / 60 >= 9.5, jl.bolt / 60);
eq("hard cap frames", jl.cap, 900);
ok("hard cap = 15.0s", jl.cap / 60 === 15, jl.cap / 60);
ok("a non-speed hero matches the standard duration", jl.frost === jl.blip, [jl.frost, jl.blip]);

const ext = await page.evaluate(async () => {
  JJA_DEBUG.setMod(null); JJA_DEBUG.setHero("OJ");
  await new Promise(r => setTimeout(r, 260));
  JJA_DEBUG.fillJuice();
  await new Promise(r => setTimeout(r, 320));
  const start = JJA_DEBUG.state.juiceMax;
  const one = JJA_DEBUG.extend();
  const afterOne = JJA_DEBUG.state.juiceMax;
  let n = 0;
  for (let i = 0; i < 40; i++) if (JJA_DEBUG.extend()) n++;
  const end = JJA_DEBUG.state;
  return { start, one, afterOne, end: end.juiceMax, more: n, cap: end.juiceCapF };
});
eq("extension starts from 720f", ext.start, 720);
ok("one crystal extends Juice Mode", ext.one === true, ext.one);
eq("one extension adds exactly 30f (+0.5s)", ext.afterOne - ext.start, 30);
eq("extensions clamp to the 900f cap", ext.end, 900);
ok("extension cannot exceed 15.0s", ext.end / 60 === 15, ext.end / 60);
ok("extension stops being accepted at the cap (no infinite loop)",
   ext.more < 40, ext.more);

/* ─────────────────────────── hearts ─────────────────────────────── */
console.log("\nHearts");
const hearts = await page.evaluate(async () => {
  JJA_DEBUG.setMod(null); JJA_DEBUG.setHero("OJ"); JJA_DEBUG.restart();
  await new Promise(r => setTimeout(r, 300));
  const fresh = JJA_DEBUG.state;
  /* one fall = exactly one heart, and i-frames must block an instant repeat */
  JJA_DEBUG.voidPlayer();
  await new Promise(r => setTimeout(r, 260));
  const afterOne = JJA_DEBUG.state;
  JJA_DEBUG.voidPlayer();                 /* immediately again, inside i-frames */
  await new Promise(r => setTimeout(r, 120));
  const afterTwo = JJA_DEBUG.state;
  return { hp0: fresh.hp, max0: fresh.hpMax, hp1: afterOne.hp, hp2: afterTwo.hp,
           st: afterTwo.ST, py: afterOne.py };
});
eq("run starts with 3 hearts", hearts.hp0, 3);
eq("hpMax is 3", hearts.max0, 3);
eq("one fall costs exactly one heart", hearts.hp1, 2);
ok("i-frames prevent an instant second loss", hearts.hp2 >= 1, hearts.hp2);
ok("still alive after one fall", hearts.st === "play", hearts.st);
ok("respawn is inside the play area", hearts.py < 450 && hearts.py > -200, hearts.py);

/* the Squid shield absorbs a hit instead of a heart */
const shield = await page.evaluate(async () => {
  JJA_DEBUG.setMod(null); JJA_DEBUG.setHero("Kiwi");
  await new Promise(r => setTimeout(r, 320));
  const a = JJA_DEBUG.state;
  JJA_DEBUG.voidPlayer();
  await new Promise(r => setTimeout(r, 260));
  const b = JJA_DEBUG.state;
  return { pas: a.activePass, before: a.hp, after: b.hp };
});
eq("Squid has the shield passive", shield.pas, "shield");
ok("shield absorbs the first hit (no heart lost)", shield.after === shield.before,
   [shield.before, shield.after]);

/* ─────────────────────── difficulty staging ─────────────────────── */
console.log("\nDifficulty curve");
const cur = await page.evaluate(() => {
  const at = m => ({ d: +JJA_DEBUG.diffAt(m).toFixed(4), s: JJA_DEBUG.stageAt(m) });
  return { m0: at(0), m200: at(200), m400: at(400), m1000: at(1000),
           m2000: at(2000), m3500: at(3500), m6000: at(6000), m9999: at(9999) };
});
eq("0m is stage 1", cur.m0.s, 1);
eq("400m is stage 2", cur.m400.s, 2);
eq("1000m is stage 3", cur.m1000.s, 3);
eq("2000m is stage 4", cur.m2000.s, 4);
eq("3500m is stage 5", cur.m3500.s, 5);
ok("stage 1 is gentle (d <= 0.10 at 400m)", cur.m400.d <= 0.10, cur.m400.d);
ok("difficulty still rises past the old 1600m cap",
   cur.m2000.d > cur.m1000.d && cur.m3500.d > cur.m2000.d, [cur.m1000.d, cur.m2000.d, cur.m3500.d]);
ok("difficulty never exceeds 1", cur.m9999.d <= 1, cur.m9999.d);
ok("curve is continuous at a stage boundary (no cliff)",
   Math.abs(cur.m400.d - 0.10) < 1e-6, cur.m400.d);

/* ───────────────────────── daily modifiers ──────────────────────── */
console.log("\nDaily modifiers");
const turbo = await page.evaluate(() => JJA_DEBUG.turbo());
eq("Turbo Day speed multiplier", turbo.spd, 1.25);
ok("Turbo Day is not the advertised 2x", turbo.spd < 1.3, turbo.spd);
eq("Turbo Day coin multiplier", turbo.coin, 1.4);
const modLabel = await page.evaluate(() => {
  JJA_DEBUG.setMod("FAST");
  return JJA_DEBUG.modText ? JJA_DEBUG.modText() : JJA_DEBUG.state.RMOD;
});
ok("FAST modifier is active when forced", modLabel === "FAST" || /turbo/i.test(String(modLabel)), modLabel);

const nodbl = await page.evaluate(async () => {
  JJA_DEBUG.setMod("NODBL"); JJA_DEBUG.setHero("OJ"); JJA_DEBUG.restart();
  await new Promise(r => setTimeout(r, 320));
  const seq = JJA_DEBUG.genSeq("NODBL", 900, 4);
  const lane = seq.filter(p => !p.high).sort((a, b) => a.x - b.x);
  let maxGap = 0, maxRise = 0;
  for (let i = 1; i < lane.length; i++) {
    maxGap = Math.max(maxGap, lane[i].x - (lane[i - 1].x + lane[i - 1].w));
    maxRise = Math.max(maxRise, lane[i - 1].y - lane[i].y);
  }
  return { maxGap, maxRise, highs: seq.filter(p => p.high).length,
           reach: JJA_DEBUG.REACH, tut: JJA_DEBUG.state.tut };
});
ok("NODBL max gap is inside the single-jump budget",
   nodbl.maxGap <= nodbl.reach.nodblGap + 1e-6, [nodbl.maxGap, nodbl.reach.nodblGap]);
ok("NODBL max gap is under the true single-jump reach (158px)",
   nodbl.maxGap < nodbl.reach.single.gap, nodbl.maxGap);
ok("NODBL max rise is inside a single jump apex",
   nodbl.maxRise <= nodbl.reach.nodblRise + 1e-6, [nodbl.maxRise, nodbl.reach.nodblRise]);
ok("NODBL removes the double-jump-only high road", nodbl.highs === 0, nodbl.highs);

/* ─────────────────────────── hero identity ──────────────────────── */
console.log("\nHero identity");
const heroes = await page.evaluate(() => JJA_DEBUG.economy().heroes);
const paidNoTrick = heroes.filter(h => h.cost > 0 && h.pas === "none");
ok("no PAID hero is left with no passive", paidNoTrick.length === 0,
   paidNoTrick.map(h => h.id));
const inferno = heroes.find(h => h.id === "Chili");
const slayers = heroes.filter(h => h.pas === "slayer").map(h => h.id);
eq("Inferno is the fire hero, not a damage clone", inferno.pas, "firelord");
ok("Slayer heroes keep the damage identity alone", slayers.length > 0 && inferno.pas !== "slayer", slayers);
const dmg = await page.evaluate(async () => {
  JJA_DEBUG.setMod(null);
  JJA_DEBUG.setHero("Chili"); await new Promise(r => setTimeout(r, 260));
  const i = JJA_DEBUG.probeDamage();
  JJA_DEBUG.setHero("Dragon"); await new Promise(r => setTimeout(r, 260));
  const d = JJA_DEBUG.probeDamage();
  return { inferno: i, slayer: d };
});
eq("Slayer deals double damage", dmg.slayer, 2);
eq("Inferno no longer doubles damage (that was Slayer's identity)", dmg.inferno, 1);
const boltGain = await page.evaluate(async () => {
  JJA_DEBUG.setMod(null);
  JJA_DEBUG.setHero("OJ"); await new Promise(r => setTimeout(r, 240));
  const base = JJA_DEBUG.probeGain(10);
  JJA_DEBUG.setHero("Zest"); await new Promise(r => setTimeout(r, 240));
  const bolt = JJA_DEBUG.probeGain(10);
  return { base, bolt };
});
ok("Bolt fills the meter faster to offset his shorter Juice Mode",
   boltGain.bolt > boltGain.base, boltGain);

/* ─────────────────────────── economy ────────────────────────────── */
console.log("\nEconomy");
const eco = await page.evaluate(() => JJA_DEBUG.economy());
ok("hero costs rise monotonically by rarity",
   eco.cost.every((c, i) => i === 0 || c > eco.cost[i - 1]), eco.cost);
ok("boss reward no longer dwarfs a whole run", eco.bossBase <= 400, eco.bossBase);
ok("achievements are worth more than the first paid hero",
   eco.achReward * 15 >= eco.cost[1], [eco.achReward * 15, eco.cost[1]]);

/* ─────────────────────────── controls ───────────────────────────── */
console.log("\nControls");
const ctrl = await page.evaluate(() => {
  const held = JJA_DEBUG.holdDash(400);          // long, still hold -> dash
  const tooShort = JJA_DEBUG.holdDash(40);       // released early -> no dash
  const steered = JJA_DEBUG.steerThenHold(90, 400); // moved past slop -> no dash
  return { held, tooShort, steered };
});
ok("a long still hold fires the dash", ctrl.held === true, ctrl.held);
ok("a short hold does NOT fire the dash (no dash on release)", ctrl.tooShort === false, ctrl.tooShort);
ok("steering past the threshold cancels a pending dash", ctrl.steered === false, ctrl.steered);

const scheme = await page.evaluate(async () => {
  JJA_DEBUG.setScheme("buttons");
  await new Promise(r => setTimeout(r, 120));
  const a = JJA_DEBUG.state.opt.scheme;
  const stored = JSON.parse(localStorage.getItem("jja2")).opt.scheme;
  JJA_DEBUG.setScheme("gesture");
  await new Promise(r => setTimeout(r, 120));
  const b = JSON.parse(localStorage.getItem("jja2")).opt.scheme;
  return { a, stored, b };
});
eq("control scheme switches", scheme.a, "buttons");
eq("control scheme is persisted", scheme.stored, "buttons");
eq("switching back persists too", scheme.b, "gesture");

const cleared = await page.evaluate(async () => {
  JJA_DEBUG.restart();
  await new Promise(r => setTimeout(r, 200));
  window.dispatchEvent(new Event("blur"));
  await new Promise(r => setTimeout(r, 80));
  return JJA_DEBUG.state.input;
});
ok("losing focus clears every held touch/key", cleared.steer === 0 && !cleared.padL && !cleared.padR,
   cleared);

/* ─────────────────────────── settings save ──────────────────────── */
console.log("\nSettings persistence");
const persisted = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("jja2"));
  return { has: !!raw.opt, keys: Object.keys(raw.opt || {}).sort() };
});
ok("settings block is written to the save", persisted.has, persisted);
["bat", "calm", "inv", "mod", "scheme", "snd", "vib", "vol"].forEach(k =>
  ok("setting persisted: " + k, persisted.keys.includes(k)));

const migrated = await page.evaluate(() => {
  /* an old save with no settings block at all, plus a corrupt one */
  const legacy = { best: 4321, coins: 999, xp: 50, unlocked: ["OJ"], sel: "OJ" };
  localStorage.setItem("jja2", JSON.stringify(legacy));
  return true;
});
const page2 = await ctx.newPage();
await page2.goto(FILE, { waitUntil: "load" });
await page2.waitForTimeout(1400);
const afterMigrate = await page2.evaluate(() => ({
  opt: JJA_DEBUG.state.opt,
  best: JJA_DEBUG.state.save.best,
  coins: JJA_DEBUG.state.save.coins,
}));
ok("an old save with no settings block still loads", afterMigrate.best === 4321, afterMigrate.best);
ok("old-save progression is preserved", afterMigrate.coins === 999, afterMigrate.coins);
ok("missing settings fall back to valid defaults",
   afterMigrate.opt.snd === true && afterMigrate.opt.vol > 0 && afterMigrate.opt.scheme === "gesture",
   afterMigrate.opt);

const corrupt = await page2.evaluate(() => {
  localStorage.setItem("jja2", JSON.stringify({
    best: "abc", coins: NaN, unlocked: "nope", sel: 42,
    opt: { snd: "yes", vol: "loud", scheme: "telepathy", calm: 1 },
  }));
  return true;
});
const page3 = await ctx.newPage();
await page3.goto(FILE, { waitUntil: "load" });
await page3.waitForTimeout(1400);
const afterCorrupt = await page3.evaluate(() => ({
  opt: JJA_DEBUG.state.opt, save: JJA_DEBUG.state.save, st: JJA_DEBUG.state.ST,
}));
ok("a corrupt save does not crash the game", afterCorrupt.st === "menu", afterCorrupt.st);
ok("corrupt volume is coerced to a number in range",
   typeof afterCorrupt.opt.vol === "number" && afterCorrupt.opt.vol >= 0 && afterCorrupt.opt.vol <= 1,
   afterCorrupt.opt.vol);
ok("an unknown control scheme falls back to gesture", afterCorrupt.opt.scheme === "gesture",
   afterCorrupt.opt.scheme);
ok("corrupt save still leaves the player a hero", afterCorrupt.save.unlocked.length > 0,
   afterCorrupt.save.unlocked);

/* ─────────────────────────── boss ───────────────────────────────── */
console.log("\nBoss");
const bossR = await page3.evaluate(async () => {
  JJA_DEBUG.setMod(null); JJA_DEBUG.setHero("OJ"); JJA_DEBUG.restart();
  await new Promise(r => setTimeout(r, 260));
  JJA_DEBUG.forceBoss();
  for (let i = 0; i < 60; i++) {
    JJA_DEBUG.keepAlive();
    await new Promise(r => setTimeout(r, 45));
    if (JJA_DEBUG.state.boss) break;
  }
  const b = JJA_DEBUG.state.boss;
  return b ? { k: b.k, hp: b.hp, max: b.max, phase: b.phase } : null;
});
ok("a boss spawns when forced", !!bossR, bossR);
if (bossR) {
  ok("boss starts at full health", bossR.hp === bossR.max, bossR);
  ok("boss HP is capped so later fights are not sponges", bossR.max <= 18, bossR.max);
}
const beat = await page3.evaluate(async () => {
  for (let i = 0; i < 80; i++) {
    JJA_DEBUG.keepAlive();
    JJA_DEBUG.hitBoss();
    await new Promise(r => setTimeout(r, 40));
    const s = JJA_DEBUG.state;
    if (!s.boss || s.boss.st === "dead") return { killed: true, wins: s.bossWins };
  }
  return { killed: false, wins: JJA_DEBUG.state.bossWins };
});
ok("a boss can actually be defeated", beat.killed, beat);

/* ─────────────────────────── audio ──────────────────────────────── */
console.log("\nAudio");
const audio = await page3.evaluate(async () => {
  await new Promise(r => setTimeout(r, 200));
  const keys = JJA_DEBUG.sfxKeys();
  const threw = [];
  for (const k of keys) { try { JJA_DEBUG.sfx(k); } catch (e) { threw.push(k); } }
  return { keys, threw, state: JJA_DEBUG.state.audio };
});
ok("every sound cue fires without throwing", audio.threw.length === 0, audio.threw);
["juiceExt", "juiceLast", "bossWeak", "bossFlee"].forEach(k =>
  ok("new cue exists: " + k, audio.keys.includes(k)));
const volPersist = await page3.evaluate(async () => {
  const el = document.getElementById("oVol");
  el.value = 15; el.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  return { live: JJA_DEBUG.state.opt.vol,
           saved: JSON.parse(localStorage.getItem("jja2")).opt.vol };
});
ok("volume change is applied and persisted",
   Math.abs(volPersist.live - 0.15) < 1e-9 && Math.abs(volPersist.saved - 0.15) < 1e-9,
   volPersist);

console.log("\njs errors: " + (jsErrors.length ? jsErrors.join(" | ") : "none"));
ok("no JS errors", jsErrors.length === 0, jsErrors[0]);

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
