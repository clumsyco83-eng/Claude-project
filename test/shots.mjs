/* Visual capture: proves the HUD hugs the play band and the boss states
   render, at real device sizes. Writes PNGs to shots/. */
import { chromium, devices } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import path from "path"; import fs from "fs";

const FILE = "file://" + path.resolve("jumpjuice.html") + "?debug=1";
fs.mkdirSync("shots", { recursive: true });

const CASES = [
  ["iphone-portrait", devices["iPhone 13"]],
  ["iphone-landscape", { ...devices["iPhone 13"], viewport: { width: 844, height: 390 } }],
  ["android-portrait", devices["Pixel 5"]],
  ["desktop", { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false }],
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--autoplay-policy=no-user-gesture-required", "--no-sandbox", "--use-gl=swiftshader"],
});

for (const [name, prof] of CASES) {
  const ctx = await browser.newContext({ ...prof });
  const page = await ctx.newPage();
  await page.goto(FILE, { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `shots/${name}-1-menu.png` });

  await page.click("#bPlay");
  await page.waitForTimeout(400);
  /* mid-run with juice active so the HUD is fully populated */
  await page.evaluate(() => { const d = window.JJA_DEBUG; d.keepAlive(); d.setDist(430); d.fillJuice(); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${name}-2-play-juice.png` });

  /* boss: capture the stun window, which is the whole point of the redesign */
  await page.evaluate(() => { const d = window.JJA_DEBUG; d.keepAlive(); d.forceBoss(); });
  let shot = false;
  for (let i = 0; i < 200; i++) {
    await page.evaluate(() => window.JJA_DEBUG.keepAlive());
    const b = await page.evaluate(() => { const s = window.JJA_DEBUG.state; return s.boss && s.boss.st; });
    if (b === "charge" && !fs.existsSync(`shots/${name}-3-boss-charge.png`)) {
      await page.screenshot({ path: `shots/${name}-3-boss-charge.png` });
    }
    if (b === "stun") { await page.screenshot({ path: `shots/${name}-4-boss-stun.png` }); shot = true; break; }
    await page.waitForTimeout(60);
  }
  /* victory sequence */
  if (shot) {
    for (let i = 0; i < 30; i++) { await page.evaluate(() => window.JJA_DEBUG.hitBoss()); await page.waitForTimeout(50);
      const st = await page.evaluate(() => { const s = window.JJA_DEBUG.state; return s.boss && s.boss.st; });
      if (st === "dead") break; }
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `shots/${name}-5-victory.png` });
  }
  console.log(name + " captured" + (shot ? "" : " (no stun window seen)"));
  await ctx.close();
}
await browser.close();
