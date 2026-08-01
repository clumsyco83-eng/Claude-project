/* Redirects the suites' hard-coded playwright import to the coverage shim.
   The shim's own import of the real module is left alone. */
import { pathToFileURL } from "node:url";
const TARGET = "/opt/node22/lib/node_modules/playwright/index.mjs";
const SHIM = new URL("./pw-shim.mjs", import.meta.url).href;
export async function resolve(spec, ctx, next) {
  const from = ctx && ctx.parentURL;
  if ((spec === TARGET || spec === pathToFileURL(TARGET).href) && from !== SHIM)
    return { url: SHIM, shortCircuit: true };
  return next(spec, ctx);
}
