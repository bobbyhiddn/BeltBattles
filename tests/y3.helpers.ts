// Y3 (release Y; DESIGN-Y section 3, rows 20-32): helpers the Y3 switch-on tests share (not a test file itself: no .test
// suffix). The bench is tests/arsenal.bench.ts's: FURNACE, the KILN (uid 1) on one straight belt (4,5)-(4,0) into turret 0;
// a rig [def, x, y, stars] stands west of belt tile (x, y) and hits it.
import { expect } from "vitest";
import { Battle, type Payload, type SideState, type TileHit } from "../src/sim/battle";
import { CELL } from "../src/sim/content";
import { key, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { starField } from "../src/sim/stars";
import { faceAt } from "../src/ui/faces";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { levelLines, levelText } from "../src/screens/build/levels";
import { icons, textWidth } from "../src/render/font";
import { barge, bench } from "./arsenal.bench";

export const BAND = 225; // TEXT-STYLE 11.1-11.2: one line of 5x7 on the op view's band (NEXT_LINE_W, GLOSSARY_WRAP_W)
export const STARS = [1, 2, 3] as const;

/** The face's rule lines (markup) at each star. */
export const lines = (def: string): string[][] => STARS.map((s) => faceAt(def, s)!.rules.map((r) => r.text));
export const px = (markup: string): number => textWidth(icons(markup));
/** The ⓘ LEVELS lines at `stars` in text form (levels.ts levelText: the current value [marked]). */
export const levels = (def: string, stars = 1): string[] => levelLines(def, stars)!.map((l) => levelText(l));
/** A NEXT★ line as levelText draws it: its numbers in glyphs (faces.ts faceDiff: icons(v, "alone")). */
export const next = (to: number, markup: string): string => `NEXT ★${to}: ${icons(markup, "alone")}`;

/** The checks every Y3 face passes: one line at each star inside the band; no clause, no caveat; no perk name on the face
 *  blocks (R-1); and every ⓘ LEVELS line inside the band too. */
export function oneLine(def: string): void {
  for (const s of STARS) {
    const f = faceAt(def, s)!;
    expect(f.rules, `${def} ★${s}`).toHaveLength(1);
    expect(px(f.rules[0].text), `${def} ★${s}: ${f.rules[0].text}`).toBeLessThanOrEqual(BAND);
    expect(f.clause, `${def} ★${s} clause`).toBeUndefined();
    expect(f.caveats, `${def} ★${s} caveats`).toBeUndefined();
    expect(faceBlocks(def, s, {})!.some((b) => b.perk), `${def} ★${s} perk on the face`).toBe(false);
    for (const l of levelLines(def, s)!) {
      const t = levelText(l, (v) => v);
      expect(textWidth(icons(t)), `${def} ★${s} ⓘ: ${t}`).toBeLessThanOrEqual(BAND);
    }
  }
}

/** A plain slug of the KILN's side (side 0), as Battle.stamp writes one. */
export const payload = (id = 900): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });

type Probe = { applyHit(s: SideState, a: { p: Payload; s: number; processed: number; blocked: boolean }, h: TileHit): unknown[] };
export const probe = (bt: Battle) => bt as unknown as Probe;

/** A rig standing EAST of belt tile (x, y), its first arrow pointing west at it (arsenal.bench's rigs stand west). */
export function east(b: Build, def: string, x: number, y: number, stars = 1, uid = 50): Build {
  b.items.push({ uid, def, x: x + 1, y, ...rotField(def, rotFacing(def, 3)), ...starField(stars) });
  return b;
}

/**
 * HOOK CHECK: Battle.applyHit of the first gate of side 0 (the bench's first rig, on its first hit) on payload `p` (set up
 * by `setup`), in a battle of `b` against the barge, every gate of side 0 online; returns the payload after the hit.
 * `side`: a further setup of the side (its plating, ...); the hit's TileHit is handed to `setup` too (its `matched`).
 */
export function hitOnce(b: Build, setup: (p: Payload, h: TileHit, s: SideState) => void = () => {}): Payload {
  const bt = new Battle(b, barge(), 8), s = bt.sides[0];
  for (const g of s.gates) { g.online = true; g.commissionAt = 0; }
  const g = s.gates[0], h = g.hits[0], p = payload();
  setup(p, h, s);
  probe(bt).applyHit(s, { p, s: h.tile * CELL + CELL / 2, processed: h.tile, blocked: false }, h);
  return p;
}

/** The bench with rigs (arsenal.bench's form). */
export const rigBench = (gates: [string, number, number, number][]): Build => bench(gates);
export { barge, bench, key };
