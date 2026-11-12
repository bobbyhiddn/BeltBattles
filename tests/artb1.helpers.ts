// ARTB-CODE-1 (REQ-BFG-126): shared by tests/artb1.board.test.ts and the digest job that read the BASE's drawing (kit/digests-base.sh runs allDigests() on artb1-base's source:
// this file imports nothing of art B, so it runs there unchanged). Not a test file itself. A digest is a sha256 (16 hex) of a canvas's size and every pixel's palette hex.
import { createHash } from "node:crypto";
import { CELL, ITEMS, type ItemDef } from "../src/sim/content";
import { footBox, footOffsets, isShaped } from "../src/sim/foot";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { shapedFactorySil, shapedFactorySprite, shapedRigBody, shapedRigSil } from "../src/render/shapeArt";
import { R } from "./raster.helpers";

type Cv = HTMLCanvasElement;
/** A canvas's size and pixels as one string (equal strings: equal pictures). */
export const sigOf = (c: Cv | null | undefined): string => { const r = R(c); return `${r.width}x${r.height}:${r.px.map((p) => p ?? "-").join(",")}`; };
/** One digest of several canvases (their signatures, in order). */
export const dg = (...cs: Cv[]): string => createHash("sha256").update(cs.map(sigOf).join("|")).digest("hex").slice(0, 16);

/** A shaped piece's screen mask at `rot` as shapeArt.ts reads it ("" for a full box; rows of "1"/"0" joined by "/"), for a deck frame that does not turn. */
export function maskOf(def: ItemDef, rot: number): string {
  const o = footOffsets(def, rot), b = footBox(def, rot);
  if (o.length >= b.w * b.h) return "";
  const m = Array.from({ length: b.h }, () => Array.from({ length: b.w }, () => "0"));
  for (const [dx, dy] of o) m[dy][dx] = "1";
  return m.map((row) => row.join("")).join("/");
}

export type Digests = Record<string, Record<string, string>>;
export const FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];

/** The drawing of every id in ITEMS by the sprite functions this job hooks: gateSprite (8 frames x idle/working), gateSil, itemIcon, factorySprite (8 frames x
 *  flash x stars 1..3), factoryFlashSil (stars 1..3), and for every shaped piece at each of its 4 turns: shapedRigBody (8 frames x idle/working) and shapedRigSil,
 *  or shapedFactorySprite and shapedFactorySil. One digest per id and function (per id@turn for a body). */
export function allDigests(ids: string[] = Object.keys(ITEMS)): Digests {
  const out: Digests = { icon: {}, gate: {}, gateSil: {}, factory: {}, factorySil: {}, body: {}, bodySil: {}, sfactory: {}, sfactorySil: {} };
  for (const id of [...ids].sort()) {
    const def = ITEMS[id];
    out.icon[id] = dg(itemIcon(id));
    const gates: Cv[] = [];
    for (const f of FRAMES) for (const a of [false, true]) gates.push(gateSprite(id, f, a));
    out.gate[id] = dg(...gates);
    out.gateSil[id] = dg(gateSil(id));
    const facs: Cv[] = [];
    for (const f of FRAMES) for (const fl of [false, true]) for (const s of [1, 2, 3]) facs.push(factorySprite(id, f, fl, s));
    out.factory[id] = dg(...facs);
    out.factorySil[id] = dg(...[1, 2, 3].map((s) => factoryFlashSil(id, s)));
    if (!def || !isShaped(def)) continue;
    for (let rot = 0; rot < 4; rot++) {
      const b = footBox(def, rot), w = b.w * CELL, h = b.h * CELL, mask = maskOf(def, rot);
      if (def.kind === "gate") {
        const bodies: Cv[] = [];
        for (const f of FRAMES) for (const a of [false, true]) bodies.push(shapedRigBody(id, w, h, f, a, mask));
        out.body[`${id}@${rot}`] = dg(...bodies);
        out.bodySil[`${id}@${rot}`] = dg(shapedRigSil(id, w, h, mask));
      } else if (def.kind === "factory") {
        const bodies: Cv[] = [];
        for (const f of FRAMES) for (const fl of [false, true]) for (const s of [1, 2, 3]) bodies.push(shapedFactorySprite(id, f, fl, s, w, h));
        out.sfactory[`${id}@${rot}`] = dg(...bodies);
        out.sfactorySil[`${id}@${rot}`] = dg(...[1, 2, 3].map((s) => shapedFactorySil(id, s, w, h)));
      }
    }
  }
  return out;
}
