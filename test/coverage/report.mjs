/* Turns the raw V8 samples in $JJ_COV_OUT into a readable coverage report
   for the inline scripts of jumpjuice.html:
     · executed bytes / named-function coverage
     · every named function no suite ever entered
     · every contiguous run of >= MIN_GAP never-executed bytes, with the
       source line range so it can be looked at directly.
   Run via `node test/coverage/run.mjs`. */
import fs from "fs";

const OUT = process.env.JJ_COV_OUT;
const MIN_GAP = +(process.env.JJ_COV_MIN_GAP || 200);
const HTML = fs.readFileSync("jumpjuice.html", "utf8");
const entries = JSON.parse(fs.readFileSync(OUT, "utf8"))
  .filter(e => /jumpjuice\.html/.test(e.url) && e.source);

/* one group per inline <script> block, merged across every suite run */
const bySrc = new Map();
for (const e of entries) {
  const k = e.source.length + ":" + e.source.slice(0, 60);
  if (!bySrc.has(k)) bySrc.set(k, { source: e.source, runs: [] });
  bySrc.get(k).runs.push(e);
}

const lineOf = off => HTML.slice(0, off).split("\n").length;

let totalBytes = 0, coveredBytes = 0;
const fnAgg = new Map();

for (const grp of bySrc.values()) {
  const src = grp.source;
  grp.base = HTML.indexOf(src);
  const mask = new Uint8Array(src.length);
  for (const run of grp.runs) {
    /* V8 ranges nest: paint outermost first so an inner count:0 block wins */
    const local = new Uint8Array(src.length);
    const ranges = run.functions.flatMap(f => f.ranges)
      .sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
    for (const r of ranges) {
      const v = r.count > 0 ? 1 : 0;
      for (let i = r.startOffset; i < Math.min(r.endOffset, src.length); i++) local[i] = v;
    }
    for (let i = 0; i < src.length; i++) if (local[i]) mask[i] = 1;
    for (const f of run.functions) {
      if (!f.functionName) continue;
      const root = f.ranges[0], key = f.functionName + "@" + root.startOffset;
      const cur = fnAgg.get(key) || { name: f.functionName, offset: root.startOffset, count: 0, base: grp.base };
      cur.count += root.count;
      fnAgg.set(key, cur);
    }
  }
  grp.mask = mask;
  totalBytes += src.length;
  for (let i = 0; i < src.length; i++) if (mask[i]) coveredBytes++;
}

const fns = [...fnAgg.values()].sort((a, b) => a.offset - b.offset);
const dead = fns.filter(f => f.count === 0);

console.log("=== jumpjuice.html — measured coverage of the inline scripts ===");
console.log("bytes:     " + coveredBytes + " / " + totalBytes +
  "  (" + (coveredBytes / totalBytes * 100).toFixed(1) + "% executed)");
console.log("functions: " + (fns.length - dead.length) + " / " + fns.length +
  "  (" + ((1 - dead.length / fns.length) * 100).toFixed(1) + "% entered)");

console.log("\n--- named functions no suite ever entered ---");
for (const f of dead)
  console.log("  jumpjuice.html:" + (f.base >= 0 ? lineOf(f.base + f.offset) : "?") + "  " + f.name);

console.log("\n--- never-executed regions of >= " + MIN_GAP + " bytes ---");
for (const grp of bySrc.values()) {
  if (grp.base < 0) continue;
  let start = -1;
  for (let i = 0; i <= grp.source.length; i++) {
    const on = i < grp.source.length && grp.mask[i];
    if (!on && start < 0) start = i;
    if ((on || i === grp.source.length) && start >= 0) {
      if (i - start >= MIN_GAP)
        console.log("  L" + lineOf(grp.base + start) + "-" + lineOf(grp.base + i) +
          " (" + (i - start) + "B): " + grp.source.slice(start, start + 90).replace(/\s+/g, " ").trim());
      start = -1;
    }
  }
}
