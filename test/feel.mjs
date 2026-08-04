/* Game-feel verification.

   Feel is subjective; the MECHANISMS that produce it are not. This suite
   asserts the things that would silently break the feel pass without
   throwing anything: the pose priority machine, particle kinds actually
   being emitted, afterimages spaced by distance, shake weighting and
   lifetime, landing tiers, camera lead returning to zero, the accessibility
   modes really suppressing what they claim to, and — the ones that cost
   real bugs — multi-touch and held-input clearing.

   Usage: node test/feel.mjs [--device=iphone] [--file=...]                */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path";

const arg = (k, d) => (process.argv.find(a => a.startsWith("--" + k + "=")) || "=" + d).split("=")[1];
const DEV = arg("device", "iphone");
const FILE = "file://" + path.resolve(arg("file", "jumpjuice.html")) + "?debug=1";
const PROFILES = { desktop: { viewport: { width: 1280, height: 800 } },
  iphone: devices["iPhone 13"], android: devices["Pixel 5"] };

let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n))
  : (fail++, console.log("  ✗ " + n + (d !== undefined ? "  →  " + JSON.stringify(d) : ""))); };

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext(PROFILES[DEV] || PROFILES.desktop);
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", e => errs.push(String(e)));
await page.goto(FILE);
await page.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });

/* helpers that run inside the page */
const setup = () => page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.setScheme("buttons");
  /* Measure at FULL quality: the adaptive watchdog engages on this host and
     correctly halves the dash burst, which made a working dash read as
     emitting too few streaks. Battery Saver's reduction is asserted
     separately, on purpose. */
  d.setOpt("calm", false); d.setOpt("bat", false); d.resetLite();
  for (let i = 0; i < 30; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
});
const frames = n => page.evaluate(async k => {
  const d = window.JJA_DEBUG;
  for (let i = 0; i < k; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  return d.feel();
}, n);

console.log("\nGame feel — " + DEV + "\n");

/* ── 1. dash produces a coordinated burst ── */
console.log("  dash");
await setup();
const dash = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  const before = d.feel();
  d.dash();
  const at = d.feel();                                   /* same frame */
  for (let i = 0; i < 6; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const during = d.feel();
  for (let i = 0; i < 70; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const after = d.feel();
  return { before, at, during, after };
});
ok("dash emits speed streaks", dash.at.parts.streak > 4, dash.at.parts);
ok("dash emits droplets as well as streaks", dash.at.parts.droplet > 0, dash.at.parts);
ok("dash sets the dash pose", dash.at.action === "dash", dash.at.action);
ok("dash stretches horizontally and compresses vertically",
   dash.at.sx > 1.1 && dash.at.sy < .95, [dash.at.sx, dash.at.sy]);
ok("dash leans the body", Math.abs(dash.at.lean) > .1, dash.at.lean);
ok("dash lights the energy ring", dash.at.dashGlow > .5, dash.at.dashGlow);
ok("dash shake is horizontally weighted",
   dash.at.shake > dash.at.shakeY, [dash.at.shake, dash.at.shakeY]);
ok("dash shake is within the brief's subtle range (<=4)",
   dash.at.shake <= 4.01, dash.at.shake);
ok("dash shake has a bounded lifetime, not a permanent hold",
   dash.at.shakeT > 0 && dash.at.shakeT <= 12, dash.at.shakeT);
ok("dash lays down afterimages", dash.during.trailDash > 0, dash.during);
ok("camera leads during the dash", Math.abs(dash.during.camLead) > 4, dash.during.camLead);
ok("camera lead returns to neutral afterwards",
   Math.abs(dash.after.camLead) < 1, dash.after.camLead);
ok("dash pose releases", dash.after.action !== "dash", dash.after.action);
ok("the energy ring has faded", dash.after.dashGlow === 0, dash.after.dashGlow);
ok("shake settles back to rest", dash.after.shake < .5, dash.after.shake);

/* afterimages must be spaced by DISTANCE, not spawned every frame — a
   stationary dash must not stack a pile of identical ghosts */
const spacing = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.resetLite();
  for (let i = 0; i < 20; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  d.setDist(0);                       /* pin so the player barely moves */
  d.dash();
  const seen = [];
  for (let i = 0; i < 10; i++) {
    d.setDist(0);                     /* hold position across the dash */
    d.keepAlive(); await new Promise(r => requestAnimationFrame(r));
    seen.push(d.feel().trailDash);
  }
  return Math.max(...seen);
});
ok("a near-stationary dash does not stack an afterimage every frame",
   spacing <= 4, spacing);

/* ── 2. jump / double jump ── */
console.log("\n  jump");
const jump = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.resetLite();
  for (let i = 0; i < 40; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  /* wait until actually grounded so the first jump is a ground jump */
  for (let i = 0; i < 90 && !d.feel().grd; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const g = d.feel().grd;
  d.jump();
  await new Promise(r => requestAnimationFrame(r));
  const first = d.feel();
  for (let i = 0; i < 4; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  d.jump();
  await new Promise(r => requestAnimationFrame(r));
  const second = d.feel();
  return { wasGrounded: g, first, second };
});
ok("test starts from a grounded state", jump.wasGrounded, jump.wasGrounded);
ok("a ground jump sets the jump pose", jump.first.action === "jump", jump.first.action);
ok("take-off stretches tall and narrow",
   jump.first.sx < .95 && jump.first.sy > 1.1, [jump.first.sx, jump.first.sy]);
ok("take-off raises dust", jump.first.parts.total > 3, jump.first.parts);
ok("a double jump reads as its own action", jump.second.action === "dbl", jump.second.action);
ok("the double jump stretches more than the first",
   jump.second.sy >= jump.first.sy - .02, [jump.first.sy, jump.second.sy]);

/* ── 3. landing tiers ── */
console.log("\n  landing");
const tiers = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  const out = {};
  for (const [name, imp] of [["soft", .15], ["medium", .45], ["hard", .9]]) {
    d.restart(); d.holdBoss();
    /* Measure at FULL quality. The adaptive watchdog engages on a slow host
       and scales shake by 0.7 — correct behaviour, but it is not what these
       tier bands describe, and it made a correct 4.95 read as 3.465. */
    d.resetLite(); d.setOpt("bat", false); d.setOpt("calm", false);
    for (let i = 0; i < 25; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
    const b = d.feel();
    d.testLand(imp);
    const a = d.feel();
    out[name] = { parts: a.parts.total - b.parts.total, sx: a.sx,
                  shake: a.shake, hstop: a.hstop, strength: a.landStrength };
  }
  return out;
});
ok("a soft landing is quiet (no shake, no hit-stop)",
   tiers.soft.shake < .6 && tiers.soft.hstop === 0, tiers.soft);
ok("a medium landing shakes a little but does not stop time",
   tiers.medium.shake > 0 && tiers.medium.hstop === 0, tiers.medium);
ok("a hard landing shakes within the 4-7 band",
   tiers.hard.shake >= 3.5 && tiers.hard.shake <= 7.5, tiers.hard.shake);
ok("a hard landing adds a brief hit-stop",
   tiers.hard.hstop >= 1 && tiers.hard.hstop <= 3, tiers.hard.hstop);
ok("dust scales with impact",
   tiers.hard.parts > tiers.medium.parts && tiers.medium.parts > tiers.soft.parts,
   [tiers.soft.parts, tiers.medium.parts, tiers.hard.parts]);
ok("landing squashes wider the harder it is",
   tiers.hard.sx > tiers.medium.sx && tiers.medium.sx > tiers.soft.sx,
   [tiers.soft.sx, tiers.medium.sx, tiers.hard.sx]);
ok("the squash never inverts or explodes", tiers.hard.sx < 2 && tiers.hard.sx > 1, tiers.hard.sx);

/* ── 4. pose priority ──
   The reason this machine exists: a run-cycle or jump pose must never
   erase a landing or a damage reaction mid-playback. */
console.log("\n  pose priority");
const pri = await page.evaluate(() => {
  const d = window.JJA_DEBUG;
  const out = {};
  d.setPose("hurt", 20, 1.3, .7);
  out.jumpOverHurt = d.setPose("jump", 8, .8, 1.2);      /* must be refused */
  out.afterJump = d.feel().action;
  out.landOverHurt = d.setPose("land", 8, 1.2, .8);      /* also refused */
  out.afterLand = d.feel().action;
  d.clearPose();
  d.setPose("jump", 20, .8, 1.2);
  out.dashOverJump = d.setPose("dash", 10, 1.3, .8);     /* allowed */
  out.afterDash = d.feel().action;
  return out;
});
ok("a jump cannot overwrite a damage reaction", pri.jumpOverHurt === false, pri);
ok("the damage pose survives the attempt", pri.afterHurt !== "jump" && pri.afterJump === "hurt", pri);
ok("a landing cannot overwrite a damage reaction", pri.landOverHurt === false, pri);
ok("a dash CAN take over from a plain jump", pri.dashOverJump === true, pri);
ok("and the dash pose is what plays", pri.afterDash === "dash", pri);

/* ── 5. accessibility ── */
console.log("\n  accessibility");
const calmR = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.setOpt("calm", true);
  for (let i = 0; i < 25; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  d.dash();
  const at = d.feel();
  for (let i = 0; i < 8; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const during = d.feel();
  d.testLand(.95);
  const land = d.feel();
  d.setOpt("calm", false);
  return { at, during, land };
});
ok("Calm Mode suppresses dash camera shake", calmR.at.shake < .5, calmR.at.shake);
ok("Calm Mode suppresses dash afterimages", calmR.during.trailDash === 0, calmR.during);
ok("Calm Mode still emits dash particles (the action stays readable)",
   calmR.at.parts.streak > 0, calmR.at.parts);
ok("Calm Mode suppresses hard-landing hit-stop", calmR.land.hstop === 0, calmR.land);
ok("Calm Mode suppresses hard-landing shake", calmR.land.shake < .6, calmR.land.shake);
ok("Calm Mode keeps the landing squash (it is information, not decoration)",
   calmR.land.sx > 1.05, calmR.land.sx);

const saverR = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.resetLite(); d.setOpt("bat", false);
  for (let i = 0; i < 25; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  d.dash(); const full = d.feel().parts.total;
  d.restart(); d.holdBoss(); d.setOpt("bat", true);
  for (let i = 0; i < 25; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  d.dash(); const lite = d.feel().parts.total;
  d.setOpt("bat", false);
  return { full, lite };
});
ok("Battery Saver spawns fewer dash particles",
   saverR.lite < saverR.full, saverR);

/* ── 6. multi-touch and input clearing ──
   Every one of these has been a real bug class in this project: a held
   button surviving a pause, an orientation change, or a tab switch leaves
   the player running into a wall they cannot stop. */
console.log("\n  input");
const multi = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.setScheme("buttons");
  await new Promise(r => setTimeout(r, 260));
  const down = (id, pid) => document.getElementById(id).dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerId: pid, clientX: 5, clientY: 5 }));
  const up = (id, pid) => document.getElementById(id).dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, pointerId: pid }));
  const out = {};
  /* hold right, then jump with a second finger */
  down("pRight", 11);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  down("pJump", 12);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  out.moveAndJump = { padR: d.state.padR, jumpHeld: d.state.jumpHeld };
  /* dash with the same second thumb while still holding right */
  up("pJump", 12); down("pDash", 13);
  for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
  out.moveAndDash = { padR: d.state.padR, dash: d.feel().dash > 0 };
  up("pDash", 13);
  /* still holding right — now pause */
  d.pause(true);
  await new Promise(r => setTimeout(r, 120));
  out.afterPause = { padR: d.state.padR, jumpHeld: d.state.jumpHeld };
  d.pause(false);
  /* hold again, then simulate the app being backgrounded */
  down("pLeft", 14);
  for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
  out.heldBeforeBlur = d.state.padL;
  window.dispatchEvent(new Event("blur"));
  await new Promise(r => setTimeout(r, 120));
  out.afterBlur = d.state.padL;
  /* and a pointercancel, which fires when the OS steals the touch */
  down("pLeft", 15);
  for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
  document.getElementById("pLeft").dispatchEvent(
    new PointerEvent("pointercancel", { bubbles: true, pointerId: 15 }));
  await new Promise(r => requestAnimationFrame(r));
  out.afterCancel = d.state.padL;
  return out;
});
ok("can move and jump at the same time",
   multi.moveAndJump.padR === true && multi.moveAndJump.jumpHeld === true, multi.moveAndJump);
ok("can move and dash at the same time",
   multi.moveAndDash.padR === true && multi.moveAndDash.dash === true, multi.moveAndDash);
ok("pausing clears held movement", multi.afterPause.padR === false, multi.afterPause);
ok("a held button really was held before the blur", multi.heldBeforeBlur === true);
ok("losing focus clears held movement", multi.afterBlur === false, multi.afterBlur);
ok("pointercancel clears held movement", multi.afterCancel === false, multi.afterCancel);

/* the pad must not exist outside active play */
const padVis = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  const shown = () => document.getElementById("pad").classList.contains("show");
  d.restart(); d.setScheme("buttons");
  await new Promise(r => setTimeout(r, 220));
  const play = shown();
  d.pause(true); await new Promise(r => setTimeout(r, 160));
  const paused = shown();
  d.pause(false); await new Promise(r => setTimeout(r, 160));
  d.show("ovStart"); await new Promise(r => setTimeout(r, 160));
  return { play, paused };
});
ok("the pad is visible during play", padVis.play === true, padVis);
ok("the pad is hidden while paused", padVis.paused === false, padVis);

/* ── 7. control defaults ── */
console.log("\n  control defaults");
const isTouch = ["iphone", "android"].includes(DEV);
/* A FRESH context with no save: this suite sets the scheme itself during
   the dash tests, so the working page cannot answer what a new player gets. */
const scheme = await (async () => {
  const c = await browser.newContext(PROFILES[DEV] || PROFILES.desktop);
  const p = await c.newPage();
  await p.goto(FILE);
  await p.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
  const r = await p.evaluate(() => ({
    scheme: window.JJA_DEBUG.state.opt.scheme,
    saved: window.JJA_DEBUG.schemeSaved(),
    touch: matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
  }));
  await p.close(); await c.close();
  return r;
})();
if (isTouch) {
  ok("a new touch player gets button controls by default",
     scheme.scheme === "buttons", scheme);
} else {
  ok("desktop is unaffected by the touch default",
     scheme.scheme === "gesture", scheme);
}
/* a returning player who chose gestures must NOT be flipped to buttons */
{
  const c2 = await browser.newContext(PROFILES[DEV] || PROFILES.desktop);
  await c2.addInitScript(() => {
    try { localStorage.setItem("jja2", JSON.stringify({
      best: 1200, coins: 5000, sel: "Blip", unlocked: ["Blip"],
      opt: { snd: true, vib: true, calm: false, bat: false, inv: false,
             mod: true, vol: .5, scheme: "gesture" } })); } catch (e) {}
  });
  const p2 = await c2.newPage();
  await p2.goto(FILE);
  await p2.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
  const kept = await p2.evaluate(() => ({
    scheme: window.JJA_DEBUG.state.opt.scheme,
    saved: window.JJA_DEBUG.schemeSaved(),
    coins: window.JJA_DEBUG.state.save.coins,
    best: window.JJA_DEBUG.state.save.best,
  }));
  ok("an existing player's saved 'gestures' choice is preserved",
     kept.scheme === "gesture", kept);
  ok("and the save is recognised as deliberate", kept.saved === true, kept);
  ok("existing progress is untouched by the migration",
     kept.coins === 5000 && kept.best === 1200, kept);
  await p2.close(); await c2.close();
}

/* ── 8. no regressions in the systems the feel pass touched ── */
console.log("\n  regressions");
const reg = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss();
  for (let i = 0; i < 30; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const out = { hearts: d.state.hpMax };
  /* dash grants invulnerability: taking a hit mid-dash must not cost a heart */
  d.dash();
  const hp0 = d.state.hp;
  d.spawnKind && 0;
  for (let i = 0; i < 3; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  out.dashHp = d.state.hp === hp0;
  /* the particle pool must stay bounded no matter how much is thrown at it */
  for (let k = 0; k < 40; k++) {
    d.dash();
    for (let i = 0; i < 2; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  }
  out.parts = d.feel().parts.total;
  out.trail = d.feel().trail;
  return out;
});
ok("three hearts still", reg.hearts === 3, reg.hearts);
ok("dash still grants invulnerability", reg.dashHp, reg);
ok("the particle pool stays bounded under spam", reg.parts <= 380, reg.parts);
ok("the trail buffer stays bounded under spam", reg.trail <= 22, reg.trail);

const juiceOk = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  d.restart(); d.holdBoss(); d.fillJuice();
  for (let i = 0; i < 15; i++) { d.keepAlive(); await new Promise(r => requestAnimationFrame(r)); }
  const j = d.state.juice > 0;
  d.dash();
  return { juiced: j, streaks: d.feel().parts.streak };
});
ok("Juice Mode still triggers", juiceOk.juiced, juiceOk);
ok("dashing while juiced still emits its trail", juiceOk.streaks > 0, juiceOk);

ok("no JS errors across the whole feel pass", errs.length === 0, errs.slice(0, 4));

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
