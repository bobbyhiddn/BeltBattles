// ART-1E (REQ-BFG-098; BRIEF-ART1E step 5) picture tool, not shipped: the off-identity lists. For every id in ITEMS it hashes
// (sha256, the first 16 hex) the pixels of its itemIcon and of its 16 gateSprite frames (f 0-7, idle and active), drawn into the
// software raster. Two worlds, two files: <prefix>-off.txt (SCALE_RIGS off, as shipped) and <prefix>-on.txt (withScaleRigs).
// Run at the base (4a87691f0ce1, a temp worktree) and at the tip, then diff: with the switch off the diff is empty; with it on
// only the seven ids' rows differ. Rows are sorted by id. Imports nothing ART-1E adds, so it builds at the base too.
// Build: npx vite build --ssr scripts/art1e/sigs.ts --outDir <W>/tmp/art1e-sigs-<tag> --emptyOutDir --logLevel warn
// Run:   node <W>/tmp/art1e-sigs-<tag>/sigs.js <out prefix>
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { ITEMS } from "../../src/sim/content";
import { withScaleRigs } from "../../src/sim/scale";
import { gateSprite, itemIcon } from "../../src/render/sprites";
import { R, installDocument, sigOf } from "./raster";

installDocument();

const PREFIX = process.argv[2] ?? "sigs";
const h = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 16);
/** The hash of the picture `make` draws; an id whose art throws in the raster gets its error's text (equal at base and tip). */
const hashOf = (make: () => unknown): string => {
  try {
    return h(sigOf(R(make())));
  } catch (e) {
    return `ERR:${String((e as Error).message).slice(0, 40).replace(/\s+/g, "_")}`;
  }
};

function list(): string[] {
  return Object.keys(ITEMS).sort().map((id) => {
    const cols = [`icon=${hashOf(() => itemIcon(id))}`];
    for (let f = 0; f < 8; f++) for (const a of [false, true]) cols.push(`g${f}${a ? "a" : "i"}=${hashOf(() => gateSprite(id, f, a))}`);
    return `${id} ${cols.join(" ")}`;
  });
}

const off = list();
const on = withScaleRigs(() => list());
writeFileSync(`${PREFIX}-off.txt`, off.join("\n") + "\n");
writeFileSync(`${PREFIX}-on.txt`, on.join("\n") + "\n");
console.log(`${PREFIX}: off ${off.length} rows, on ${on.length} rows (17 hashes a row: itemIcon, gateSprite f 0-7 idle and active)`);
