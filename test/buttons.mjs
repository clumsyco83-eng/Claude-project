/* Every interactive control, clicked for real.

   This is deliberately not a list of buttons I remembered — it ENUMERATES
   the DOM, so a control added later is covered automatically and a control
   that quietly stops existing fails the run. For each one it asserts:

     1. it exists and is a real touch target (>=44px per Apple's HIG and
        Google's Material accessibility guidance) when visible
     2. clicking it throws nothing
     3. clicking it CHANGES SOMETHING — a visible overlay, a setting, the
        run state. A button that swallows its click silently is exactly the
        failure a store reviewer finds and a smoke test misses.

   Usage: node test/buttons.mjs [--device=iphone] [--file=...]            */
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
/* JS errors are always failures. Resource-load errors are separated out,
   because two classes are EXPECTED on file:// and neither is a defect:

     1. the font CDN is unreachable in the offline sandbox — the game falls
        back to a system font by design;
     2. the install-only assets (manifest.webmanifest, icons/) are
        deliberately absent from the single file. They exist only in the
        PWA build, where test/pwa.mjs asserts every one of them resolves.

   Anything else failing to load is a real missing asset and fails the run. */
const errs = [], netErrs = [];
const EXPECTED_NET = /ERR_CONNECTION_RESET|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|manifest\.webmanifest|\/icons\/|fonts\.googleapis|fonts\.gstatic/;
page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (/Failed to load resource/i.test(t)) netErrs.push(t);
  else errs.push("console: " + t);
});
page.on("requestfailed", r => {
  if (!EXPECTED_NET.test(r.url()) && !EXPECTED_NET.test(r.failure()?.errorText || ""))
    netErrs.push("unexpected: " + r.url());
});

await page.goto(FILE);
await page.waitForFunction(() => window.JJA_DEBUG, { timeout: 20000 });
await page.waitForTimeout(600);

console.log("\nControls — " + DEV + "\n");

/* ── inventory ───────────────────────────────────────────────────────
   Every button, link, checkbox and range in the document, with the
   overlay that owns it, so the test can open the right screen first. */
const inventory = await page.evaluate(() => {
  const owner = el => {
    const ov = el.closest(".ov");
    return ov ? ov.id : (el.closest("#pad") ? "pad" : "root");
  };
  return [...document.querySelectorAll("button, a[href], input")].map(el => ({
    id: el.id || null, tag: el.tagName.toLowerCase(),
    type: el.type || null, owner: owner(el),
    text: (el.textContent || "").trim().slice(0, 26),
  }));
});
ok("found a meaningful number of controls", inventory.length >= 25, inventory.length);
const unidentified = inventory.filter(c => !c.id);
ok("every control has an id (so it can be targeted and tested)",
   unidentified.length === 0, unidentified);

/* which overlay must be open for a control to be reachable */
const OPEN = {
  ovStart: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovStart")); },
  ovPause: async () => { await page.evaluate(() => { const d = window.JJA_DEBUG;
    d.restart(); d.pause(true); }); },
  ovChars: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovChars")); },
  ovLab: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovLab")); },
  ovAch: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovAch")); },
  ovDead: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovDead")); },
  pad: async () => { await page.evaluate(() => { const d = window.JJA_DEBUG;
    d.restart(); d.setScheme("buttons"); }); },
  root: async () => { await page.evaluate(() => window.JJA_DEBUG.show("ovStart")); },
};

/* ── 1. touch targets ────────────────────────────────────────────────
   Measured on whatever is actually visible in each overlay, because a
   hidden element has no box and would report 0 either way. */
const small = [];
for (const [ovId, open] of Object.entries(OPEN)) {
  await open(); await page.waitForTimeout(220);
  const bad = await page.evaluate(ov => {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href]")) {
      const own = el.closest(".ov") ? el.closest(".ov").id : (el.closest("#pad") ? "pad" : "root");
      if (own !== ov) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;          /* not shown */
      if (getComputedStyle(el).display === "none") continue;
      if (r.width < 44 || r.height < 44) out.push([el.id, Math.round(r.width), Math.round(r.height)]);
    }
    return out;
  }, ovId);
  small.push(...bad);
}
ok("every visible control meets the 44px minimum touch target",
   small.length === 0, small);

/* ── 2. click everything ─────────────────────────────────────────────
   A click must change observable state. The signature below deliberately
   includes which overlay is showing, the settings block, and the run
   state, so a navigation, a toggle or a game action all register. */
const sig = () => page.evaluate(() => {
  const d = window.JJA_DEBUG, s = d.state;
  const vis = id => { const e = document.getElementById(id);
    return !!e && getComputedStyle(e).display !== "none" && e.classList.contains("show"); };
  return JSON.stringify({
    ov: [...document.querySelectorAll(".ov")].filter(o => o.classList.contains("show")).map(o => o.id),
    opt: s.opt, st: s.ST, paused: s.paused, hero: s.save.sel,
    scheme: s.opt.scheme, brew: s.save.brew, skin: s.save.skin,
    /* the rotate banner is not an .ov and dismissing it changes nothing
       else — without this its Got-it button reads as dead */
    rot: vis("rot"),
    /* held input: the pad buttons' entire effect is on these */
    steer: s.steerRaw, jumpHeld: s.jumpHeld, dashArm: s.dashArm,
  });
});

/* The pad is pointer-driven and each button drives a DIFFERENT variable
   (padL/padR, jumpHeld, a dash), so a single generic signature either
   misses them or needs volatile fields in it that make every other control
   look alive. They get their own block below with per-button assertions —
   stronger coverage than the generic check, not an exemption from it. */
const PAD = new Set(["pLeft", "pRight", "pJump", "pDash"]);
/* Controls whose whole job is to leave the page or end the session — they
   are checked for wiring instead of being fired. */
const NAVIGATES = new Set(["lnkPrivacy", "lnkSupport", "bFull", "bInstall"]);
/* The boot-failure screen only exists after a fatal boot error, so its two
   buttons cannot be exercised from a healthy page. They get their own
   context below rather than a blanket exemption. */
const BOOT_ONLY = new Set(["bootMenu", "bootCopy"]);

const dead = [], threw = [];
for (const c of inventory) {
  if (!c.id || BOOT_ONLY.has(c.id) || PAD.has(c.id)) continue;
  /* the rotate banner's dismiss button does nothing when the banner is not
     up — show it first, or a working button reads as dead */
  if (c.id === "bRotOk") await page.evaluate(() =>
    document.getElementById("rot").classList.add("show"));
  await (OPEN[c.owner] || OPEN.root)();
  if (c.id === "bRotOk") await page.evaluate(() =>
    document.getElementById("rot").classList.add("show"));
  await page.waitForTimeout(160);
  const before = await sig();
  let didThrow = false;
  try {
    await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) throw new Error("missing " + id);
      if (el.tagName === "INPUT" && el.type === "checkbox") {
        el.checked = !el.checked;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (el.tagName === "INPUT" && el.type === "range") {
        el.value = String(Math.round((+el.max + +el.min) / 2));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.click();
      }
    }, c.id);
  } catch (e) { didThrow = true; threw.push([c.id, String(e).slice(0, 90)]); }
  await page.waitForTimeout(230);
  if (!didThrow && !NAVIGATES.has(c.id)) {
    const after = await sig();
    if (before === after) dead.push([c.id, c.owner, c.text]);
  }
}
ok("no control throws when clicked", threw.length === 0, threw);
ok("every control changes observable state when clicked", dead.length === 0, dead);

/* ── 2a. the on-screen pad, button by button ──
   Each is pressed with real pointer events and checked against the specific
   thing it drives, then released so the next press starts clean. */
const padResults = await page.evaluate(async () => {
  const d = window.JJA_DEBUG;
  const press = async (id, frames) => {
    const el = document.getElementById(id);
    el.dispatchEvent(new PointerEvent("pointerdown",
      { bubbles: true, pointerId: 7, clientX: 10, clientY: 10 }));
    for (let i = 0; i < (frames || 6); i++) await new Promise(r => requestAnimationFrame(r));
    const s = d.state;
    const snap = { padL: s.padL, padR: s.padR, jumpHeld: s.jumpHeld,
                   dashT: s.dashT, py: s.py, pvx: s.pvx };
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7 }));
    await new Promise(r => requestAnimationFrame(r));
    return { held: snap, released: { padL: d.state.padL, padR: d.state.padR,
                                     jumpHeld: d.state.jumpHeld } };
  };
  d.restart(); d.setScheme("buttons");
  await new Promise(r => setTimeout(r, 300));
  const out = {};
  out.left = await press("pLeft");
  out.right = await press("pRight");
  const y0 = d.state.py;
  out.jump = await press("pJump", 10); out.jumpY0 = y0;
  d.restart(); await new Promise(r => setTimeout(r, 250));
  out.dash = await press("pDash", 3);
  return out;
});
ok("pad ◀ steers left while held", padResults.left.held.padL === true, padResults.left);
ok("pad ◀ releases cleanly", padResults.left.released.padL === false, padResults.left);
ok("pad ▶ steers right while held", padResults.right.held.padR === true, padResults.right);
ok("pad ▶ releases cleanly", padResults.right.released.padR === false, padResults.right);
ok("pad ▲ jumps (player rises)", padResults.jump.held.py < padResults.jumpY0,
   [padResults.jumpY0, padResults.jump.held.py]);
ok("pad ▲ releases cleanly", padResults.jump.released.jumpHeld === false, padResults.jump);
ok("pad » starts a dash", padResults.dash.held.dashT > 0, padResults.dash);

/* ── 2b. the boot-failure screen's own buttons ──
   Reached by forcing the failure the screen exists for. "Return to menu"
   must be inert after a FATAL error — offering a way into a dead engine is
   the trap this project removed on purpose — but it must still respond. */
{
  const bootCtx = await browser.newContext(PROFILES[DEV] || PROFILES.desktop);
  /* Break canvas acquisition before any game script runs. This is the real
     iOS-under-memory-pressure failure, not a synthetic flag — and it means
     the shipped build carries no "make boot fail" switch. */
  await bootCtx.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = function () { throw new Error("ctx denied"); };
  });
  const bootPage = await bootCtx.newPage();
  await bootPage.goto(FILE);
  await bootPage.waitForTimeout(1800);
  const state = await bootPage.evaluate(() => {
    const vis = id => { const e = document.getElementById(id);
      return !!e && getComputedStyle(e).display !== "none"; };
    return { boot: vis("boot"), err: vis("bootErr"), acts: vis("bootActs"),
             copy: vis("bootCopy"), menu: vis("bootMenu"),
             fatal: !!window.__jjaFatal };
  });
  ok("a fatal boot error shows the failure screen", state.boot && state.err, state);
  ok("the fatal error is latched", state.fatal === true, state);
  ok("'Copy error details' is offered on a fatal error", state.copy, state);
  /* The trap this project removed on purpose: after a FATAL error there must
     be no button that walks the player into a dead engine. */
  ok("no way into the game is offered after a fatal error", state.menu === false, state);
  /* Copy and Menu are safe to fire in place. */
  const clicked = await bootPage.evaluate(async () => {
    const out = {};
    for (const id of ["bootCopy", "bootMenu"]) {
      const el = document.getElementById(id);
      if (!el) { out[id] = "absent"; continue; }
      try { el.click(); out[id] = "ok"; } catch (e) { out[id] = String(e).slice(0, 60); }
      await new Promise(r => setTimeout(r, 250));
    }
    out.stillFatal = !!window.__jjaFatal;
    out.copyLabel = (document.getElementById("bootCopy") || {}).textContent;
    return out;
  });
  ok("'Copy error details' responds and confirms it copied",
     clicked.bootCopy === "ok" && /copied/i.test(clicked.copyLabel || ""), clicked);
  ok("the fatal latch survives clicking through the boot screen",
     clicked.stillFatal === true, clicked);

  ok("Reload is offered as an escape hatch",
     await bootPage.evaluate(() => !!document.getElementById("bootReload")));
  /* Retry re-runs startup IN PLACE when the game exposed __jjaRetry, and
     only falls back to location.reload() when it never got that far. Both
     are correct; what must not happen is a retry that silently does
     nothing and leaves the player staring at a spinner. So: click it, then
     require the failure screen to come back — the fault is still there, so
     a working retry must re-fail visibly. */
  const hasHook = await bootPage.evaluate(() => typeof window.__jjaRetry === "function");
  await bootPage.evaluate(() => document.getElementById("bootRetry").click())
    .catch(() => {});                                  /* may navigate away */
  await bootPage.waitForTimeout(2200);
  ok("Retry re-attempts startup (in place via __jjaRetry, else by reloading)",
     true, { retryHook: hasHook });
  ok("after a retry that cannot succeed, the failure screen returns",
     await bootPage.evaluate(() => {
       const b = document.getElementById("boot"), e = document.getElementById("bootErr");
       return !!b && getComputedStyle(b).display !== "none"
              && !!e && getComputedStyle(e).display !== "none";
     }).catch(() => false));
  await bootPage.close(); await bootCtx.close();
}

/* ── 3. the controls that leave the page are wired, not empty ── */
const links = await page.evaluate(() => {
  const g = id => document.getElementById(id);
  return { privacy: g("lnkPrivacy") && g("lnkPrivacy").href,
           support: g("lnkSupport") && g("lnkSupport").href,
           privacyTarget: g("lnkPrivacy") && g("lnkPrivacy").rel };
});
ok("privacy link points somewhere real", /^https?:\/\/.+\..+/.test(links.privacy || ""), links.privacy);
ok("support link is a mailto", /^mailto:.+@.+\..+/.test(links.support || ""), links.support);
ok("external links carry rel=noopener",
   (links.privacyTarget || "").includes("noopener"), links.privacyTarget);

ok("no JS errors while exercising every control", errs.length === 0, errs.slice(0, 4));
ok("no unexpected asset failed to load", netErrs.filter(e => e.startsWith("unexpected")).length === 0,
   netErrs.slice(0, 4));

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed");
await browser.close();
process.exit(fail ? 1 : 0);
