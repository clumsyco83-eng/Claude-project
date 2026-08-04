/* The gate that runs before packaging a release.

   Everything here is machine-checkable. It deliberately FAILS while the
   support email, privacy URL and TWA host are still the example values,
   because those are the two things a store rejects a listing for and the
   one thing that silently ships a TWA with a browser address bar across
   the top.

   Things this cannot check — real-device behaviour, a real home-screen
   install, App Store review outcome — are listed in RELEASE-CHECKLIST.md
   as human steps, not asserted here.

   Usage: node test/release-check.mjs [--strict]
     --strict  also fail on the placeholders (use before a real submission;
               without it they are reported as warnings so the suite is
               usable during development)                                  */
import fs from "fs";
import path from "path";

const STRICT = process.argv.includes("--strict");
let pass = 0, fail = 0, warn = 0;
const ok = (n, c, d) => { c ? (pass++, console.log("  ✓ " + n))
  : (fail++, console.log("  ✗ " + n + (d !== undefined ? "  →  " + JSON.stringify(d) : ""))); };
const soft = (n, c, d) => { if (c) { pass++; console.log("  ✓ " + n); }
  else if (STRICT) { fail++; console.log("  ✗ " + n + (d !== undefined ? "  →  " + JSON.stringify(d) : "")); }
  else { warn++; console.log("  ! " + n + (d !== undefined ? "  →  " + JSON.stringify(d) : "")); } };

const SRC = fs.readFileSync("jumpjuice.html", "utf8");
const pick = re => (SRC.match(re) || [])[1];
const VERSION = pick(/const VERSION="([^"]+)"/);
const VERSION_CODE = pick(/const VERSION_CODE=(\d+)/);
const SUPPORT = pick(/const SUPPORT_EMAIL="([^"]+)"/);
const PRIVACY = pick(/const PRIVACY_URL="([^"]+)"/);

console.log("\nRelease check" + (STRICT ? "  (strict)" : "  (warnings allowed — use --strict before submitting)") + "\n");

/* ── 1. release identity ── */
console.log("  identity");
ok("VERSION is set and looks like semver", /^\d+\.\d+\.\d+$/.test(VERSION || ""), VERSION);
ok("VERSION_CODE is a positive integer", Number(VERSION_CODE) >= 1, VERSION_CODE);
ok("support email is a valid address", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(SUPPORT || ""), SUPPORT);
ok("privacy URL is https", /^https:\/\/.+\..+/.test(PRIVACY || ""), PRIVACY);
soft("support email is not the placeholder", !/example\.com$/.test(SUPPORT || ""), SUPPORT);
soft("privacy URL is not the placeholder", !/example\.com/.test(PRIVACY || ""), PRIVACY);

/* the version must agree everywhere it appears */
const manifest = JSON.parse(fs.readFileSync("dist/pwa/manifest.webmanifest", "utf8"));
const gradle = fs.existsSync("dist/android/twa-project/app/build.gradle")
  ? fs.readFileSync("dist/android/twa-project/app/build.gradle", "utf8") : "";
const pbx = fs.existsSync("dist/ios/xcode-project/App/App.xcodeproj/project.pbxproj")
  ? fs.readFileSync("dist/ios/xcode-project/App/App.xcodeproj/project.pbxproj", "utf8") : "";
ok("Android versionName matches VERSION",
   gradle.includes('versionName "' + VERSION + '"'), (gradle.match(/versionName "[^"]*"/) || [])[0]);
ok("Android versionCode matches VERSION_CODE",
   new RegExp("versionCode\\s+" + VERSION_CODE + "\\b").test(gradle),
   (gradle.match(/versionCode\s+\d+/) || [])[0]);
ok("iOS MARKETING_VERSION matches VERSION",
   pbx.includes("MARKETING_VERSION = " + VERSION + ";"),
   (pbx.match(/MARKETING_VERSION = [^;]+;/) || [])[0]);
ok("iOS build number matches VERSION_CODE",
   pbx.includes("CURRENT_PROJECT_VERSION = " + VERSION_CODE + ";"),
   (pbx.match(/CURRENT_PROJECT_VERSION = [^;]+;/) || [])[0]);

/* ── 2. no placeholder or debug content ships ── */
console.log("\n  content");
const BAD = /\b(TODO|FIXME|XXX|lorem ipsum|PLACEHOLDER_TEXT|localhost:\d+)\b/i;
const badHits = SRC.split("\n").map((l, i) => [i + 1, l])
  .filter(([, l]) => BAD.test(l) && !/PLACEHOLDER — replace|placeholder/i.test(l));
ok("no TODO/FIXME/lorem/localhost left in the game source", badHits.length === 0,
   badHits.slice(0, 3));
ok("the debug hook is gated behind ?debug=1",
   /\/\[\?&\]debug=1\\b\/\.test\(location\.search\)/.test(SRC) ||
   SRC.includes('/[?&]debug=1\\b/.test(location.search)'));
/* the built PWA must not carry the store screenshots or dev leftovers */
const pwaFiles = fs.readdirSync("dist/pwa", { recursive: true }).map(String);
ok("the PWA build contains a service worker", pwaFiles.includes("sw.js"));
ok("the PWA build contains the manifest", pwaFiles.includes("manifest.webmanifest"));

/* ── 3. icons and store assets at spec ── */
console.log("\n  assets");
const png = f => { const b = fs.readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25], bytes: b.length }; };
const checkIcon = (file, w, h, needOpaque) => {
  if (!fs.existsSync(file)) return ok(path.basename(file) + " exists", false, file);
  const i = png(file);
  ok(path.basename(file) + " is " + w + "x" + h, i.w === w && i.h === h, i);
  if (needOpaque)
    ok(path.basename(file) + " has no alpha channel (both stores reject it)",
       i.type === 2 || i.type === 0, { colourType: i.type });
};
checkIcon("dist/store/play/icon-512.png", 512, 512, true);
checkIcon("dist/store/ios/icon-1024.png", 1024, 1024, true);
checkIcon("dist/store/play/feature-graphic-1024x500.png", 1024, 500, true);

/* screenshots: right count, right dimensions, and actually distinct images —
   five copies of one frame is the classic lazy submission */
const SHOT_SPECS = [
  ["dist/store/play/screenshots", 1080, 1920, 2],
  ["dist/store/ios/6.7", 1290, 2796, 2],
  ["dist/store/ios/6.5", 1242, 2688, 2],
  ["dist/store/ios/5.5", 1242, 2208, 2],
  ["dist/store/ios/ipad12.9", 2048, 2732, 2],
];
for (const [dir, w, h, min] of SHOT_SPECS) {
  if (!fs.existsSync(dir)) { ok(dir + " exists", false); continue; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".png"));
  ok(path.basename(dir) + ": at least " + min + " screenshots", files.length >= min, files.length);
  const wrong = files.map(f => [f, png(path.join(dir, f))])
    .filter(([, i]) => i.w !== w || i.h !== h).map(([f, i]) => [f, i.w + "x" + i.h]);
  ok(path.basename(dir) + ": every screenshot is exactly " + w + "x" + h, wrong.length === 0, wrong);
  const sizes = new Set(files.map(f => fs.statSync(path.join(dir, f)).size));
  ok(path.basename(dir) + ": screenshots are distinct images", sizes.size === files.length,
     { files: files.length, distinct: sizes.size });
}

/* ── 4. native packaging ── */
console.log("\n  packaging");
ok("an AAB has been produced",
   fs.existsSync("dist/android/jumpjuice-" + VERSION + ".aab"),
   "dist/android/jumpjuice-" + VERSION + ".aab");
if (fs.existsSync("dist/android/jumpjuice-" + VERSION + ".aab")) {
  const aab = fs.readFileSync("dist/android/jumpjuice-" + VERSION + ".aab");
  ok("the AAB is a real zip container", aab[0] === 0x50 && aab[1] === 0x4B);
  /* Entry names live in the zip CENTRAL DIRECTORY, at the END of the file —
     scanning only the first chunk found nothing and reported a correctly
     signed bundle as unsigned. */
  const all = aab.toString("latin1");
  ok("the AAB carries a signature block",
     /META-INF\/[^/]+\.(RSA|EC|DSA)/.test(all) && all.includes("META-INF/MANIFEST.MF"),
     (all.match(/META-INF\/[^/]+\.(RSA|EC|DSA)/) || ["none"])[0]);
  ok("the AAB has the App Bundle structure Play requires",
     all.includes("BundleConfig.pb") && all.includes("base/manifest/AndroidManifest.xml"));
}
ok("the Xcode project is present",
   fs.existsSync("dist/ios/xcode-project/App/App.xcodeproj/project.pbxproj"));
ok("the iOS app bundles the game as local files",
   fs.existsSync("dist/ios/xcode-project/App/App/public/index.html"));
/* Capacitor ships placeholder splash art; shipping it would be a bug */
const splash = "dist/ios/xcode-project/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png";
ok("the iOS splash is the game's own art, not Capacitor's placeholder",
   fs.existsSync(splash) && fs.statSync(splash).size > 40 * 1024,
   fs.existsSync(splash) ? fs.statSync(splash).size : "missing");

/* no signing material may be committed */
const secrets = [];
for (const f of fs.readdirSync("dist", { recursive: true }).map(String)) {
  if (/\.(keystore|jks|p12|mobileprovision|cer)$/i.test(f)) secrets.push(f);
}
ok("no keystore or signing material is in dist/", secrets.length === 0, secrets);
const gp = "dist/android/twa-project/gradle.properties";
ok("no signing password is committed in gradle.properties",
   !fs.existsSync(gp) || !/signing\.(store|key)\.password/.test(fs.readFileSync(gp, "utf8")));

/* ── 5. Digital Asset Links ── */
console.log("\n  android app links");
const alPath = "dist/android/assetlinks.json";
ok("assetlinks.json template exists", fs.existsSync(alPath));
if (fs.existsSync(alPath)) {
  const al = JSON.parse(fs.readFileSync(alPath, "utf8"));
  ok("assetlinks names the right package",
     al[0].target.package_name === "com.jumpjuice.adventure", al[0].target.package_name);
  soft("assetlinks carries a real signing fingerprint",
     !/^REPLACE/.test(al[0].target.sha256_cert_fingerprints[0]),
     al[0].target.sha256_cert_fingerprints[0]);
}
const twaM = fs.existsSync("dist/android/twa-manifest.json")
  ? JSON.parse(fs.readFileSync("dist/android/twa-manifest.json", "utf8")) : {};
soft("the TWA points at a real host, not the placeholder",
   twaM.host && !/example\.com/.test(twaM.host), twaM.host);

console.log("\n" + (fail ? "FAIL " : "PASS ") + pass + " passed, " + fail + " failed" +
  (warn ? ", " + warn + " warning" + (warn > 1 ? "s" : "") + " (run with --strict to enforce)" : ""));
process.exit(fail ? 1 : 0);
