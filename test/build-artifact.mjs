/* Produce an Artifact-hostable build of the game.
   The game's own visual identity is left completely untouched — this only
   adapts it to the Artifact sandbox:
     1. Body-only content (the host supplies doctype/html/head/body).
     2. No external hosts: the Artifact CSP blocks font CDNs, and a blocked
        stylesheet is a silent fallback, so the webfont link is removed and
        the stack made explicit rather than accidental.
     3. The viewport meta lives in the host's <head>, which we don't control,
        so it is injected from script before any layout maths runs. Without
        it iOS Safari lays out at 980px and the play area renders tiny. */
import fs from "fs";

const src = fs.readFileSync("jumpjuice.html", "utf8");

const head = src.slice(0, src.indexOf("</head>"));
const styleOpen = head.indexOf("<style>");
let style = head.slice(styleOpen, head.indexOf("</style>") + 8);

const body = src.slice(src.indexOf("<body>") + 6, src.lastIndexOf("</body>"));

/* deliberate system stack: the game's UI chrome is monospaced labels and one
   heavy display line, both of which the platform grotesques render well */
const STACK = `-apple-system,BlinkMacSystemFont,"Segoe UI Variable Display","Segoe UI",Roboto,system-ui,sans-serif`;
style = style.replaceAll(`"Space Grotesk",system-ui,-apple-system,sans-serif`, STACK);

const viewportShim = `<script>
/* The Artifact host owns the document head, so the viewport meta is set
   here instead. It must
   run before the game measures anything. Setting it after load still causes
   iOS Safari to re-lay-out correctly. */
(function(){
  try{
    var m=document.querySelector('meta[name=viewport]');
    if(!m){m=document.createElement("meta");m.name="viewport";document.head.appendChild(m);}
    m.setAttribute("content",
      "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover");
    document.documentElement.style.height="100%";
    document.body.style.height="100%";
    document.body.style.margin="0";
    document.body.style.overflow="hidden";
    document.body.style.background="#000";
  }catch(e){}
})();
<\/script>
`;

const out = `<title>Jump Juice Adventure</title>
${style}
${viewportShim}${body}`;

fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/jumpjuice-artifact.html", out);

const bad = [...out.matchAll(/https?:\/\/[^"')\s]+/g)].map(m => m[0]);
/* strip comments before the structural check so prose can't trip it */
const codeOnly = out.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
console.log("bytes:", out.length);
console.log("external refs (must be none):", bad.length ? bad : "none");
console.log("wrapper tags present (must be none):",
  /<!DOCTYPE|<html[\s>]|<\/html>|<head[\s>]|<body[\s>]|<\/body>/i.test(codeOnly) ? "FOUND" : "none");
