/* Verifies the upgrade pass: hero abilities, 3-phase bosses with distinct
   kinds, the Juice Lab, awards/streak, cosmetics and the top HUD. */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";
const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html")) + "?debug=1";
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✓ " + n); }
  else { fail++; console.log("  ✗ " + n + (x !== undefined ? "  →  " + JSON.stringify(x) : "")); } };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--no-sandbox", "--use-gl=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ ...devices["iPhone 13"] });
const page = await ctx.newPage();
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(FILE, { waitUntil: "load" }); await page.waitForTimeout(900);
const S = () => page.evaluate(() => window.JJA_DEBUG.state);
const D = (f, a) => page.evaluate(f, a);
const alive = () => D(() => { const d = window.JJA_DEBUG; if (d.state.ST !== "play") d.restart(); d.keepAlive(); });

console.log("\n── UPGRADES ──");

/* 1. HUD at the top of the screen */
await page.click("#bPlay"); await page.waitForTimeout(400);
const g = await S();
ok("HUD anchors above the play band (top of screen)", g.safeTop + 4 < g.WY, { safeTop: g.safeTop, WY: g.WY });

/* 2. hero abilities */
const HEROES = { Bolt: "+25% SPEED", Frost: "ENEMIES SLOWED", Inferno: "FIRE LORD", Nature: "+60% JUICE" };
for (const [id, label] of Object.entries(HEROES)) {
  await D(h => window.JJA_DEBUG.setHero(h), id);
  await page.waitForTimeout(150);
  const st = await S();
  ok("hero " + id + " equips its ability (" + label + ")", st.abil === label, { got: st.abil });
}
/* Bolt is measurably faster than Classic */
async function topSpeed(hero) {
  await D(h => window.JJA_DEBUG.setHero(h), hero);
  await page.waitForTimeout(150);
  await page.keyboard.down("KeyD");
  let mx = 0;
  for (let i = 0; i < 26; i++) { await alive(); const v = (await S()).pvx; if (v > mx) mx = v; await page.waitForTimeout(40); }
  await page.keyboard.up("KeyD");
  return mx;
}
const vClassic = await topSpeed("Blip"), vBolt = await topSpeed("Bolt");
ok("Bolt is actually faster than Classic", vBolt > vClassic * 1.1, { classic: +vClassic.toFixed(2), bolt: +vBolt.toFixed(2) });
/* Nature fills the meter measurably faster for the same pickups */
async function gainFor(hero) {
  await D(h => window.JJA_DEBUG.setHero(h), hero);
  await page.waitForTimeout(150);
  return D(() => window.JJA_DEBUG.probeGain(10));
}
const gClassic = await gainFor("Blip"), gNature = await gainFor("Nature");
ok("Nature gains more juice per pickup", gNature > gClassic * 1.5, { classic: gClassic, nature: gNature });
/* Damage identity belongs to Slayer alone. Inferno used to share the exact
   same "x2 damage" passive, which left two headline heroes feeling identical;
   it is now the fire hero (immunity + flame-burst landings) instead. */
const dClassic = await D(() => { window.JJA_DEBUG.setHero("Blip"); return window.JJA_DEBUG.probeDamage(); });
const dSlayer = await D(() => { window.JJA_DEBUG.setHero("Dino"); return window.JJA_DEBUG.probeDamage(); });
const dInferno = await D(() => { window.JJA_DEBUG.setHero("Inferno"); return window.JJA_DEBUG.probeDamage(); });
ok("Slayer deals double damage", dSlayer === dClassic * 2, { classic: dClassic, slayer: dSlayer });
ok("Inferno no longer duplicates Slayer's damage bonus", dInferno === dClassic,
   { classic: dClassic, inferno: dInferno });
const infernoPas = await D(() => {
  window.JJA_DEBUG.setHero("Inferno");
  return window.JJA_DEBUG.economy().heroes.find(h => h.id === "Inferno").pas;
});
ok("Inferno's passive is fire, not damage", infernoPas === "firelord", infernoPas);

/* 3. bosses: one per world, first is the Juice Monster, three phases */
const st0 = await S();
ok("seven boss kinds defined — one per world", st0.bosses.length === 7, st0.bosses);
/* every world must own exactly one boss, or a run reaches a world whose
   boss slot is empty and the rotation fallback silently takes over */
const worldMap = await D(() => window.JJA_DEBUG.state.bossWorlds);
ok("every world has its own boss", Object.keys(worldMap).length === 7, worldMap);
ok("no two worlds share a boss",
   new Set(Object.values(worldMap)).size === 7, worldMap);
await D(() => window.JJA_DEBUG.restart());
await alive();
await D(() => { const d = window.JJA_DEBUG; d.setDist(360); d.forceBoss(); });
for (let i = 0; i < 40 && !(await S()).boss; i++) { await alive(); await page.waitForTimeout(50); }
ok("first boss of a run is the Juice Monster", (await S()).boss.k === "juice", (await S()).boss);
ok("boss starts at phase 1", (await S()).boss.phase === 1);
/* walk it down through the phases */
const seenPhase = new Set(); let seenMinion = false;
for (let i = 0; i < 220; i++) {
  await alive();
  const b = (await S()).boss; if (!b) break;
  seenPhase.add(b.phase);
  if (b.spawned > 0) seenMinion = true;
  /* pace the hits so phases get real time on screen, the way a player
     would experience them */
  if (b.st !== "warn" && b.st !== "dead" && i % 6 === 0) await D(() => window.JJA_DEBUG.hitBoss());
  await page.waitForTimeout(45);
  if (b.st === "dead") break;
}
ok("boss reaches phase 2", seenPhase.has(2), [...seenPhase]);
ok("boss reaches phase 3 (rage)", seenPhase.has(3), [...seenPhase]);
ok("phase 2+ spawns minions", seenMinion);
ok("kill drops fruit for the Lab", await D(() => {
  const f = window.JJA_DEBUG.state.save.fruit; return Object.values(f).some(v => v > 0); }),
  await D(() => window.JJA_DEBUG.state.save.fruit));
/* the boss you meet belongs to the world you are standing in. Checked past
   the first fight, which is always the Juice Monster by design. */
const pairing = [];
for (const w of Object.keys(worldMap)) {
  const got = await D(async wn => {
    const d = window.JJA_DEBUG;
    d.restart(); d.setWins(1);                /* past the scripted first boss */
    d.setDist(d.worldStart(wn)); d.forceBoss();
    for (let i = 0; i < 60 && !d.state.boss; i++) await new Promise(r => requestAnimationFrame(r));
    return d.state.boss && d.state.boss.k;
  }, w);
  pairing.push([w, got, worldMap[w]]);
}
ok("each world spawns its own boss",
   pairing.every(([, got, want]) => got === want), pairing);

/* each kind renders without error */
for (const k of st0.bosses) {
  await alive();
  await D(kk => { const d = window.JJA_DEBUG; d.spawnKind(kk); }, k);
  await page.waitForTimeout(260);
  const b = (await S()).boss;
  ok("boss kind '" + k + "' spawns and renders", !!b, b && b.k);
}

/* 4. Juice Lab */
await D(() => window.JJA_DEBUG.restart());
await page.waitForTimeout(150);
const brews = (await S()).brews;
ok("three brews defined", brews.length === 3, brews);
ok("four fruits defined", (await S()).fruits.length === 4);
await D(() => window.JJA_DEBUG.giveFruit(9));
await D(() => window.JJA_DEBUG.brew("lightning"));
await page.waitForTimeout(150);
ok("brewing equips the juice", (await S()).save.brew === "lightning", (await S()).save.brew);
ok("brewing spends fruit", (await S()).save.fruit.lemon < 9, (await S()).save.fruit);
await D(() => window.JJA_DEBUG.restart());
await page.waitForTimeout(200);
ok("brew is consumed into the run", (await S()).BREW === "lightning" && (await S()).save.brew === "",
  { BREW: (await S()).BREW, saved: (await S()).save.brew });
await page.evaluate(() => document.getElementById("bLab").click());
await page.waitForTimeout(300);
ok("Juice Lab screen opens", await D(() => document.getElementById("ovLab").classList.contains("show")));
ok("Lab lists all three brews", await D(() => document.getElementById("labList").children.length === 3));
ok("Lab shows fruit counts", /\d/.test(await D(() => document.getElementById("labFruit").textContent)));
ok("Lab offers glow skins", await D(() => document.getElementById("labSkins").children.length >= 5));

/* 5. awards + streak */
const nAch = await D(() => document.getElementById("achList").children.length);
ok("Juice Journey has 15 awards", nAch === 15, nAch);
ok("streak tracked on load", (await S()).save.streak >= 1, (await S()).save.streak);

/* 6. per-world music — the score has to follow the world, and a boss has to
   override it wherever the fight happens */
const mus0 = (await S()).music;
ok("every world has its own music theme", mus0.worlds.length === 7, mus0.worlds);
/* distinct keys, not just distinct labels — two worlds sharing a root and a
   tempo would be the same cue with a different name */
ok("each world's theme is musically distinct",
   new Set(mus0.table.map(t => t[1] + "@" + t[2])).size === 7, mus0.table);
/* and the live wiring actually switches on arrival. The first boss is due at
   350m, which is inside the second world, so it is held off here — otherwise
   this measures the boss theme in six worlds out of seven. */
const themes = [];
for (const w of mus0.worlds) {
  themes.push(await D(async wn => {
    const d = window.JJA_DEBUG;
    d.restart(); d.holdBoss(); d.setDist(d.worldStart(wn));
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
    return [wn, d.state.music.root, d.state.music.bpm, d.state.music.boss];
  }, w));
}
ok("arriving in a world switches to its theme",
   themes.every(([w, root, bpm]) => {
     const want = mus0.table.find(t => t[0] === w);
     return root === want[1] && bpm === want[2];
   }), themes);
ok("no world is left playing the boss theme",
   themes.every(t => t[3] === false), themes);
const bossMus = await D(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.setWins(1); d.setDist(d.worldStart("ICE")); d.forceBoss();
  for (let i = 0; i < 90 && !d.state.boss; i++) await new Promise(r => requestAnimationFrame(r));
  return d.state.music;
});
ok("a boss overrides the world theme", bossMus.boss === true, bossMus);
ok("the boss theme is faster than the world it interrupts",
   bossMus.bpm > mus0.table.find(t => t[0] === "ICE")[2], bossMus.bpm);

/* 7. menu personality */
ok("menu says Juice Heroes", (await D(() => document.getElementById("bChars").textContent)).includes("Juice Heroes"));
ok("menu says Juice Journey", (await D(() => document.getElementById("bAch").textContent)).includes("Juice Journey"));
ok("menu has a Juice Lab", (await D(() => document.getElementById("bLab").textContent)).includes("Juice Lab"));

ok("no JS errors", errs.length === 0, errs.slice(0, 4));
console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
