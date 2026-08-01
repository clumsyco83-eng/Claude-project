/* Measures what the existing suites actually execute.

   Runs smoke / features / hostile unmodified, with a module hook that swaps
   their playwright import for a coverage-recording shim, then prints the
   aggregate report. Takes ~12 minutes — the suites are wall-clock paced.

     node test/coverage/run.mjs                 # all three suites
     node test/coverage/run.mjs features        # a subset

   Coverage is a map of what the tests touch, not a target to chase: the
   hero portraits alone are 34 draw functions that only a screenshot can
   really judge. Read it for the systems that never run at all. */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.env.JJ_COV_OUT || path.join(HERE, "coverage.json");
const SUITES = {
  smoke: ["test/smoke.mjs", "--device=desktop"],
  features: ["test/features.mjs"],
  hostile: ["test/hostile.mjs"],
};

const want = process.argv.slice(2).filter(a => SUITES[a]);
const run = want.length ? want : Object.keys(SUITES);

fs.rmSync(OUT, { force: true });
for (const name of run) {
  process.stdout.write("running " + name + " … ");
  const r = spawnSync("node", ["--import", path.join(HERE, "register.mjs"), ...SUITES[name]],
    { env: { ...process.env, JJ_COV_OUT: OUT }, encoding: "utf8" });
  const tail = (r.stdout || "").trim().split("\n").pop();
  console.log(r.status === 0 ? "ok  (" + tail + ")" : "FAILED (exit " + r.status + ")");
  if (r.status !== 0) console.log((r.stdout || "") + (r.stderr || ""));
}

console.log("");
spawnSync("node", [path.join(HERE, "report.mjs")],
  { env: { ...process.env, JJ_COV_OUT: OUT }, stdio: "inherit" });
