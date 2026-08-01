/* Split the single-file game into separate CSS / JS / HTML.
   Output: split/jumpjuice.css, split/boot.js, split/jumpjuice.js, split/index.html

   Two ordering rules must survive the split or the game breaks:
     1. boot.js MUST load before jumpjuice.js — it is the watchdog that
        catches a top-level throw in the game and stops the loading screen
        hanging forever. Classic (non-module, non-async) scripts execute in
        document order, so plain <script src> tags preserve this.
     2. Keep them CLASSIC scripts. type="module" would defer execution AND
        be blocked by CORS on file://, so the game would never start when
        opened by double-clicking. */
import fs from "fs";

const src = fs.readFileSync("jumpjuice.html", "utf8");
fs.mkdirSync("split", { recursive: true });

/* ── CSS ── */
const cssStart = src.indexOf("<style>") + 7;
const cssEnd = src.indexOf("</style>");
const css = src.slice(cssStart, cssEnd).trim();
fs.writeFileSync("split/jumpjuice.css",
  "/* Jump Juice Adventure — styles */\n" + css + "\n");

/* ── scripts, in document order ── */
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (scripts.length !== 2)
  throw new Error("expected 2 inline scripts (boot watchdog + game), found " + scripts.length);

fs.writeFileSync("split/boot.js",
  "/* Jump Juice Adventure — boot watchdog.\n" +
  "   MUST be loaded before jumpjuice.js. Catches a top-level throw in the\n" +
  "   game, shows it on the loading screen and offers a way through, so the\n" +
  "   spinner can never hang with no explanation. */\n" + scripts[0].trim() + "\n");

fs.writeFileSync("split/jumpjuice.js",
  "/* Jump Juice Adventure — game.\n" +
  "   Expects boot.js to have run first, and the markup from index.html.\n" +
  "   Add ?debug=1 to the URL to expose window.JJA_DEBUG. */\n" + scripts[1].trim() + "\n");

/* ── HTML shell: head metadata + body markup, with external references ── */
const head = src.slice(src.indexOf("<head>") + 6, src.indexOf("</head>"));
/* keep the meta/title lines, drop the inline <style> and the font <link>s
   (the CDN was only ever a nicety; the stack falls back to system fonts) */
const headKeep = head
  .replace(/<style>[\s\S]*?<\/style>/g, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<link[^>]*>\s*/g, "")
  .split("\n").map(l => l.trim()).filter(Boolean).join("\n  ");

let body = src.slice(src.indexOf("<body>") + 6, src.lastIndexOf("</body>"));
body = body.replace(/<script>[\s\S]*?<\/script>/g, "").replace(/\n{3,}/g, "\n\n").trim();

fs.writeFileSync("split/index.html",
`<!DOCTYPE html>
<html lang="en">
<head>
  ${headKeep}
  <link rel="stylesheet" href="jumpjuice.css">
</head>
<body>
${body}

<!-- boot.js must come first: it is the watchdog for jumpjuice.js.
     Both are classic scripts on purpose, so double-clicking this file works. -->
<script src="boot.js"></script>
<script src="jumpjuice.js"></script>
</body>
</html>
`);

const sz = f => Math.round(fs.statSync(f).size / 1024) + " KB";
console.log("split/jumpjuice.css   " + sz("split/jumpjuice.css"));
console.log("split/boot.js         " + sz("split/boot.js"));
console.log("split/jumpjuice.js    " + sz("split/jumpjuice.js"));
console.log("split/index.html      " + sz("split/index.html"));

/* sanity: no stray markup left inside the extracted assets */
const bad = [];
if (/<script|<style|<\/body/i.test(fs.readFileSync("split/jumpjuice.js", "utf8"))) bad.push("jumpjuice.js has markup");
if (/<\/style|<script/i.test(fs.readFileSync("split/jumpjuice.css", "utf8"))) bad.push("jumpjuice.css has markup");
if (!/id="game"/.test(fs.readFileSync("split/index.html", "utf8"))) bad.push("index.html lost the canvas");
console.log(bad.length ? "PROBLEMS: " + bad.join("; ") : "structure OK");
