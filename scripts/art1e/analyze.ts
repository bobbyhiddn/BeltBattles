// ART-1E (REQ-BFG-098; BRIEF-ART1E steps 2-4) picture tool, not shipped: the numbers behind the tests' thresholds and the
// REPORT's silhouette table. For each of the seven new rigs (SCALE_RIGS on): its opaque pixels, how many sit in the middle 6x6
// and 8x8, its distinct idle frames, whether every active frame keeps its idle frame's silhouette and is brighter, and the
// rig icons (every gate in ITEMS) whose silhouettes are nearest to its icon's by IoU (opaque cells in both / in either).
// Build: npx vite build --ssr scripts/art1e/analyze.ts --outDir <W>/tmp/art1e-analyze --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/art1e-analyze/analyze.js
import { ITEMS } from "../../src/sim/content";
import { SCALE_IDS, withScaleRigs } from "../../src/sim/scale";
import { gateSprite, itemIcon } from "../../src/render/sprites";
import { R, installDocument, maskOf, sigOf, type RasterCanvas } from "./raster";

installDocument();

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const opaque = (c: RasterCanvas): number => c.px.filter((p) => p !== null).length;
const area = (c: RasterCanvas, x0: number, x1: number): number => {
  let n = 0;
  for (let y = x0; y <= x1; y++) for (let x = x0; x <= x1; x++) if (c.at(x, y) !== null) n++;
  return n;
};
const light = (c: RasterCanvas): number => c.px.reduce((s, p) => s + (p === null ? 0 : lum(p)), 0);
const iou = (a: RasterCanvas, b: RasterCanvas): number => {
  let i = 0, u = 0;
  for (let k = 0; k < a.px.length; k++) {
    const x = a.px[k] !== null, y = b.px[k] !== null;
    if (x && y) i++;
    if (x || y) u++;
  }
  return u ? i / u : 0;
};

withScaleRigs(() => {
  const gates = Object.values(ITEMS).filter((d) => d.kind === "gate").map((d) => d.id);
  console.log(`gates in ITEMS (switch on): ${gates.length}; the seven: ${SCALE_IDS.join(", ")}`);
  for (const id of SCALE_IDS) {
    const icon = R(itemIcon(id));
    const idle = Array.from({ length: 8 }, (_, f) => R(gateSprite(id, f, false)));
    const act = Array.from({ length: 8 }, (_, f) => R(gateSprite(id, f, true)));
    const distinct = new Set(idle.map(sigOf)).size;
    const sameMask = act.every((a, f) => maskOf(a) === maskOf(idle[f]));
    const brighter = act.map((a, f) => (light(a) / light(idle[f])).toFixed(2)).join(" ");
    const near = gates.filter((g) => g !== id).map((g) => [g, iou(icon, R(itemIcon(g)))] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const same = gates.filter((g) => g !== id && maskOf(R(itemIcon(g))) === maskOf(icon));
    console.log(
      `${id}: opaque ${opaque(icon)}, middle 6x6 ${area(icon, 3, 8)}/36, middle 8x8 ${area(icon, 2, 9)}/64, idle frames distinct ${distinct}/8, ` +
      `active mask == idle mask ${sameMask}, light active/idle ${brighter}; same silhouette as: ${same.join(",") || "none"}; ` +
      `nearest by IoU: ${near.map(([g, v]) => `${g} ${v.toFixed(2)}`).join(", ")}`,
    );
  }
});
