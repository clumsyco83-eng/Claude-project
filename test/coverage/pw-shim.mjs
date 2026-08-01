/* Stands in for the playwright module so that an *unmodified* suite file
   records V8 coverage. Every page the suite opens gets JS coverage started
   before its first navigation, and the entries are appended to $JJ_COV_OUT
   when the page, its context, or the browser closes. */
import * as real from "/opt/node22/lib/node_modules/playwright/index.mjs";
import fs from "fs";

const OUT = process.env.JJ_COV_OUT;
const live = new Set();

async function collect(page) {
  if (!live.has(page)) return;
  live.delete(page);
  let entries = [];
  try { entries = await page.coverage.stopJSCoverage(); } catch (e) { return; }
  try {
    const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
    fs.writeFileSync(OUT, JSON.stringify(prev.concat(entries)));
  } catch (e) { /* a lost sample must never fail the suite */ }
}

function patchContext(ctx) {
  const newPage = ctx.newPage.bind(ctx);
  ctx.__pages = [];
  ctx.newPage = async (...a) => {
    const page = await newPage(...a);
    try { await page.coverage.startJSCoverage({ resetOnNavigation: false }); live.add(page); } catch (e) {}
    const close = page.close.bind(page);
    page.close = async (...b) => { await collect(page); return close(...b); };
    ctx.__pages.push(page);
    return page;
  };
  const close = ctx.close.bind(ctx);
  ctx.close = async (...a) => { for (const p of ctx.__pages) await collect(p); return close(...a); };
  return ctx;
}

function patchBrowser(b) {
  const newContext = b.newContext.bind(b);
  b.__ctxs = [];
  b.newContext = async (...a) => { const c = patchContext(await newContext(...a)); b.__ctxs.push(c); return c; };
  const close = b.close.bind(b);
  b.close = async (...a) => {
    for (const c of b.__ctxs) for (const p of c.__pages) await collect(p);
    return close(...a);
  };
  return b;
}

export const devices = real.devices;
export const chromium = { ...real.chromium, launch: async (...a) => patchBrowser(await real.chromium.launch(...a)) };
export default { chromium, devices };
