/* Rebuilds the native wrappers in dist/android/ and dist/ios/ from the
   current PWA build, stamping VERSION and VERSION_CODE from jumpjuice.html
   so the three places a version can appear cannot drift apart.

   WHAT THIS SCRIPT CAN AND CANNOT DO

   Android: it can produce a complete, buildable TWA project and — given an
   Android SDK — a signed AAB. It CANNOT make that AAB pass Digital Asset
   Links, because that requires a domain you control (see below).

   iOS: it can produce a complete Xcode project. It CANNOT build or sign it.
   Compiling an iOS app requires Xcode, which is macOS-only. That is a hard
   platform limit, not a missing step.

   Usage:
     node test/build-pwa.mjs && node test/build-native.mjs
     node test/build-native.mjs --android-aab     (needs ANDROID_HOME)      */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SRC = fs.readFileSync("jumpjuice.html", "utf8");
const pick = re => (SRC.match(re) || [])[1];
const VERSION = pick(/const VERSION="([^"]+)"/);
const VERSION_CODE = pick(/const VERSION_CODE=(\d+)/);
const SUPPORT = pick(/const SUPPORT_EMAIL="([^"]+)"/);
const PRIVACY = pick(/const PRIVACY_URL="([^"]+)"/);
if (!VERSION || !VERSION_CODE) { console.error("could not read VERSION from jumpjuice.html"); process.exit(1); }

const APP_ID = "com.jumpjuice.adventure";
console.log("Jump Juice native packaging");
console.log("  version      " + VERSION + " (code " + VERSION_CODE + ")");
console.log("  application  " + APP_ID);

/* ── Android: stamp the TWA manifest ── */
const twaManifestPath = "dist/android/twa-manifest.json";
const twaManifest = {
  packageId: APP_ID,
  /* HOST IS A PLACEHOLDER. A Trusted Web Activity is a browser pointed at a
     URL you control; there is no way to embed the game as local files. Until
     this is a real domain serving dist/pwa/ over HTTPS, the app opens with a
     visible browser address bar instead of fullscreen. */
  host: "example.com",
  name: "Jump Juice Adventure",
  launcherName: "Jump Juice",
  display: "standalone",
  themeColor: "#0B1226", themeColorDark: "#0B1226",
  navigationColor: "#0B1226", navigationColorDark: "#0B1226",
  navigationDividerColor: "#0B1226", navigationDividerColorDark: "#0B1226",
  backgroundColor: "#0B1226",
  enableNotifications: false,
  startUrl: "/",
  iconUrl: "https://example.com/icons/icon-512.png",
  maskableIconUrl: "https://example.com/icons/maskable-512.png",
  splashScreenFadeOutDuration: 300,
  signingKey: { path: "./jumpjuice.keystore", alias: "jumpjuice" },
  appVersionName: VERSION,
  appVersionCode: Number(VERSION_CODE),
  shortcuts: [],
  generatorApp: "bubblewrap-cli",
  webManifestUrl: "https://example.com/manifest.webmanifest",
  fallbackType: "customtabs",
  features: {},
  alphaDependencies: { enabled: false },
  enableSiteSettingsShortcut: true,
  isChromeOSOnly: false, isMetaQuest: false,
  fullScopeUrl: "https://example.com/",
  minSdkVersion: 21,
  orientation: "default",
};
fs.mkdirSync("dist/android", { recursive: true });
fs.writeFileSync(twaManifestPath, JSON.stringify(twaManifest, null, 2));

/* Stamp the generated Gradle project too, so a rebuild from the committed
   project (without re-running Bubblewrap) still carries the right version. */
const gradlePath = "dist/android/twa-project/app/build.gradle";
if (fs.existsSync(gradlePath)) {
  let g = fs.readFileSync(gradlePath, "utf8");
  g = g.replace(/versionCode\s+\d+/, "versionCode " + VERSION_CODE)
       .replace(/versionName\s+"[^"]*"/, 'versionName "' + VERSION + '"');
  fs.writeFileSync(gradlePath, g);
  console.log("  stamped      " + gradlePath);
}

/* ── Digital Asset Links ──
   The single thing that turns a TWA from "a browser with a URL bar" into a
   fullscreen app. It must be served from the domain in `host`, at exactly
   /.well-known/assetlinks.json, over HTTPS, with the SHA-256 fingerprint of
   the key the AAB is SIGNED with.

   Critical and easy to get wrong: if you use Play App Signing (the default),
   Google RE-SIGNS your upload with THEIR key, so the fingerprint that must
   go in this file is the one Play shows under
   Release > Setup > App integrity > App signing key certificate — NOT the
   fingerprint of your upload keystore. */
let fingerprint = "REPLACE_WITH_YOUR_APP_SIGNING_KEY_SHA256_FINGERPRINT";
try {
  const ks = process.env.JJA_KEYSTORE || "dist/android/jumpjuice.keystore";
  if (fs.existsSync(ks)) {
    const out = execSync(`keytool -list -v -keystore "${ks}" -alias jumpjuice -storepass ` +
      (process.env.JJA_KEYSTORE_PASS || "jumpjuice"), { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
    const m = out.match(/SHA256:\s*([A-F0-9:]+)/i);
    if (m) fingerprint = m[1];
  }
} catch (e) { /* keystore absent — template keeps the placeholder */ }
fs.writeFileSync("dist/android/assetlinks.json", JSON.stringify([{
  relation: ["delegate_permission/common.handle_all_urls"],
  target: { namespace: "android_app", package_name: APP_ID,
            sha256_cert_fingerprints: [fingerprint] },
}], null, 2));
console.log("  assetlinks   dist/android/assetlinks.json" +
  (fingerprint.startsWith("REPLACE") ? "  (fingerprint NOT set)" : "  (from local keystore)"));

/* ── iOS: stamp version into the Xcode project ── */
const pbx = "dist/ios/xcode-project/App/App.xcodeproj/project.pbxproj";
if (fs.existsSync(pbx)) {
  let s = fs.readFileSync(pbx, "utf8");
  s = s.replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = " + VERSION + ";")
       .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + VERSION_CODE + ";")
       .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, "PRODUCT_BUNDLE_IDENTIFIER = " + APP_ID + ";");
  fs.writeFileSync(pbx, s);
  console.log("  stamped      " + pbx);
}

/* ── copy the current PWA into the iOS bundle ──
   Unlike Android's TWA, the iOS wrapper ships the game as LOCAL FILES inside
   the app, so it needs no domain and works offline out of the box. */
const iosWeb = "dist/ios/xcode-project/App/App/public";
if (fs.existsSync("dist/pwa")) {
  fs.rmSync(iosWeb, { recursive: true, force: true });
  fs.cpSync("dist/pwa", iosWeb, { recursive: true });
  /* the store screenshots are build output, not app content */
  fs.rmSync(path.join(iosWeb, "shots"), { recursive: true, force: true });
  const n = fs.readdirSync(iosWeb, { recursive: true }).length;
  console.log("  ios web      " + iosWeb + "  (" + n + " files)");
} else {
  console.log("  ios web      SKIPPED — run node test/build-pwa.mjs first");
}

/* ── optional: build the AAB ── */
if (process.argv.includes("--android-aab")) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) { console.error("\n  ANDROID_HOME is not set — cannot build the AAB"); process.exit(1); }
  const proj = "dist/android/twa-project";
  fs.writeFileSync(path.join(proj, "local.properties"), "sdk.dir=" + sdk + "\n");
  const ks = process.env.JJA_KEYSTORE;
  if (!ks) {
    console.error("\n  JJA_KEYSTORE is not set. Generate an upload key first:\n" +
      "    keytool -genkeypair -v -keystore jumpjuice.keystore -alias jumpjuice \\\n" +
      "      -keyalg RSA -keysize 2048 -validity 10000\n" +
      "  then: JJA_KEYSTORE=$PWD/jumpjuice.keystore JJA_KEYSTORE_PASS=... node test/build-native.mjs --android-aab");
    process.exit(1);
  }
  const pass = process.env.JJA_KEYSTORE_PASS || "";
  console.log("\n  building AAB ...");
  execSync("./gradlew bundleRelease --no-daemon -q " +
    `-Pandroid.injected.signing.store.file="${path.resolve(ks)}" ` +
    `-Pandroid.injected.signing.store.password="${pass}" ` +
    `-Pandroid.injected.signing.key.alias=jumpjuice ` +
    `-Pandroid.injected.signing.key.password="${pass}"`,
    { cwd: proj, stdio: "inherit" });
  const out = path.join(proj, "app/build/outputs/bundle/release/app-release.aab");
  const dest = "dist/android/jumpjuice-" + VERSION + ".aab";
  fs.copyFileSync(out, dest);
  console.log("  AAB          " + dest + "  " + (fs.statSync(dest).size / 1024 / 1024).toFixed(1) + "MB");
}

console.log("\n  Placeholders that MUST be replaced before submission:");
console.log("    support email   " + SUPPORT);
console.log("    privacy policy  " + PRIVACY);
console.log("    TWA host        " + twaManifest.host + "  (Android only)");
console.log("  test/release-check.mjs fails while these are still set.");
