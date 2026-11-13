// ARTB-CODE-3B (REQ-BFG-126), items S and H: the DECK as the game draws it, for the tests that look at one rig's 12x12 cell. Not a test file.
// A deck is drawn by the game's own entry point (render/machinery.ts drawMachinery -> drawRigs) into the software raster (tests/raster.helpers.ts), either as the build screen draws it (no sim: cruiserModel's `w3`) or as a
// battle's view of side 0 (an Arena played for a moment: its sim, the display timers). rigMoment gives the rig its state exactly as drawRigs asks it. Everything here reads the game; no pixel is typed.
import { G, R, fresh, type RasterCanvas } from "./raster.helpers";
import { Arena } from "../src/game/arena";
import { cloneBuild, type Build } from "../src/sim/deck";
import type { GateState } from "../src/sim/battle";
import { cruiserModel, type CruiserView } from "../src/render/cruiser";
import { footX, footY, frameForHull, type DeckFrame } from "../src/render/frame";
import { drawMachinery } from "../src/render/machinery";
import { rigMoment } from "../src/render/wave3Moments";
import type { Wave3RigState } from "../src/render/wave3Art";
import { SEED } from "./wave3.helpers";

type Cv = HTMLCanvasElement;
const DT = 1 / 60;
/** The deck frame the views use here: bow north, the hull's box at (10, 32) (tests/wave3Art.test.ts's FRAME, tests/wave3Moments.test.ts's). */
export const FRAME: DeckFrame = frameForHull(0, 10, 32);

/** A deck as the build screen draws it (no sim, no timers); `t` is the view's clock (the frame index drawRigs asks is floor(t * 8)). */
export const buildView = (b: Build, t = 0): CruiserView => ({ side: 0, build: b, model: cruiserModel(b), frame: FRAME, t, tread: 0 });

/** Play `b` against `foe` through the Arena at 1x, one 60 Hz frame at a time, until `stop(a)` holds (checked after every frame) or `secs` of battle time pass. */
export function play(b: Build, foe: Build, stop: (a: Arena) => boolean, secs = 20): Arena {
  const a = new Arena(cloneBuild(b), cloneBuild(foe), SEED, null);
  a.quiet = true;
  for (let f = 0; f < secs * 60 * 2 && a.b.t < secs && !a.b.over; f++) {
    a.update(DT);
    if (stop(a)) return a;
  }
  throw new Error(`the moment never came in ${secs} s`);
}

/** Side `s`'s battle view as the arena draws it (its sim, the moments' timers), on FRAME at clock `t`. */
export const battleView = (a: Arena, t = 0, s: 0 | 1 = 0): CruiserView => ({ side: s, build: a.b.sides[s].build, model: a.sfx[s].model, frame: FRAME, sim: a.b.sides[s], t, tread: 0, beltPhase: a.sfx[s].beltPhase, w3: a.sfx[s].w3 });
export const gate = (a: Arena, uid: number, s = 0): GateState => a.b.sides[s].gates.find((g) => g.uid === uid)!;
/** drawRigs' hit flash: a rig draws active while its GateState.flash is above 0. */
export const hot = (a: Arena, uid: number): boolean => gate(a, uid).flash > 0;
/** rigMoment as drawRigs calls it for rig `uid` of side 0 in battle view `v`. */
export function momentOf(a: Arena, v: CruiserView, uid: number): Wave3RigState {
  const p = v.build.items.find((q) => q.uid === uid)!;
  return rigMoment(p.def, uid, gate(a, uid), v.sim, v.w3, v.model.rigs.get(uid)?.w3);
}

/** The view drawn by the game's entry point. `opaqueOnly`: paints made at less than full alpha (a hit's white silhouette, the dim over an idle rig) are left out, so the art under them reads. */
export function drawDeck(v: CruiserView, opaqueOnly = true): RasterCanvas {
  const c = fresh(176, 184);
  c.opaqueOnly = opaqueOnly;
  drawMachinery(G(c), v);
  return c;
}

/** Rig `uid`'s 12x12 cell of deck picture `c`, as 144 palette hexes (null = clear). */
export function cellOf(c: RasterCanvas, b: Build, uid: number): (string | null)[] {
  const p = b.items.find((q) => q.uid === uid)!;
  const x = Math.round(footX(FRAME, p.x, p.y)), y = Math.round(footY(FRAME, p.x, p.y));
  const out: (string | null)[] = [];
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) out.push(c.at(x + i, y + j));
  return out;
}

/** What rig `uid`'s 12x12 cell of deck picture `c` shows, against three sprites of the same size: `want` (the picture the cell should show), `bare` (the same rig's plain picture) and `other` (a picture that must
 *  NOT show, or null). Over the pixels where `want` is opaque and differs from `bare` (the state's own pixels): `shown` counts those where the cell has want's pixel, `stale` those where it still has bare's (the plain look
 *  where the state should be), `covered` the rest (a nozzle or another layer lies over them). `leak` counts the pixels where `want` is opaque, `other` is opaque and another colour, and the cell has other's colour: the other
 *  picture showing where want should (where want is clear the deck shows through, which may be any colour, so those pixels say nothing). `ref`, when given, is the same scene drawn without the state: a pixel that has the same
 *  colour there is another layer's (a nozzle drawn over the sprite, the same in both pictures), not the other picture's, and is not counted as a leak. */
export function cellCheck(c: RasterCanvas, b: Build, uid: number, want: Cv, bare: Cv, other: Cv | null = null, ref: RasterCanvas | null = null): { shown: number; stale: number; covered: number; leak: number; total: number } {
  const p = b.items.find((q) => q.uid === uid)!;
  const x = Math.round(footX(FRAME, p.x, p.y)), y = Math.round(footY(FRAME, p.x, p.y));
  const w = R(want), o = R(bare), z = other ? R(other) : null;
  let shown = 0, stale = 0, covered = 0, leak = 0, total = 0;
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const wp = w.at(i, j), op = o.at(i, j), d = c.at(x + i, y + j);
    if (wp !== null && wp !== op) {
      total++;
      if (d === wp) shown++;
      else if (d === op) stale++;
      else covered++;
    }
    const zp = z ? z.at(i, j) : null;
    if (wp !== null && zp !== null && zp !== wp && d === zp && (ref === null || d !== ref.at(x + i, y + j))) leak++;
  }
  return { shown, stale, covered, leak, total };
}
