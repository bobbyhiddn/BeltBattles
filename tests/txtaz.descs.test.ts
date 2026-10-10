// TXT-AZ item 4 (REQ-BFG-070; REVIEW-TXT096 Q2; text only, rules bb-0.9.7 unchanged): BRACE FRAME's and TWIN TRIGGER's
// catalogue descs, put back by TXT-096's step 6, say what the pieces do now, in the 3-line desc form, and tools/wave3Defs.ts's
// copy says the same (tests/wave3Art.test.ts:199 holds each wave-3 def equal to that copy). What they do is read from the sim:
// BRACE FRAME's cut of an enemy STUN on its tile is its `mul` whatever the hull's plating (battle.ts braceCut; "SOONER STILL
// PLATED" was false since Y2), and TWIN TRIGGER's mod is its pairBonus alone (no load time since Y4). Both stay drawn nowhere
// (their KEPT_FLAVOUR rows; tests/txt096.sweep.test.ts).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Battle, type SideState, type Target } from "../src/sim/battle";
import { ITEMS, type HarassCause } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { KEPT_FLAVOUR } from "../src/screens/build/flavour";
import { P1_WAVE3_ITEMS } from "../tools/wave3Defs";
import { barge, bench } from "./arsenal.bench";

const STARS = [1, 2, 3];
const ROOT = new URL("..", import.meta.url).pathname;
type Probe = { disrupt(s: SideState, t: Target, secs: number, cause: HarassCause): boolean };

/** The STUN a 4 s shock leaves on a BRACE FRAME's (★s) belt tile, its hull holding `plate` plating (side 1, factories held). */
function left(s: number, plate: number): number {
  const bt = new Battle(barge(), bench([["braceframe", 4, 3, s]]), 8), side = bt.sides[1], g = side.gates[0], h = g.hits[0];
  for (const f of side.factories) f.timer = 1000;
  g.online = true;
  side.plate.plate = plate;
  const t = side.targets.find((x) => x.kind === "belt" && x.ref === h.route && x.cell === h.tile)!;
  (bt as unknown as Probe).disrupt(side, t, 4, "shock");
  return side.routes[h.route].cellDisrupt[h.tile];
}

describe("TXT-AZ item 4: BRACE FRAME's and TWIN TRIGGER's descs say what they do (REQ-BFG-070)", () => {
  it("BRACE FRAME: an enemy STUN on its tile ends sooner, by its mul, plated or not; its desc says that and no more", () => {
    for (const s of STARS) {
      const mul = effectAt("braceframe", s).gate!.brace!.mul;
      expect(left(s, 0), `★${s} bare`).toBeCloseTo(4 * mul, 9);
      expect(left(s, 240), `★${s} plated`).toBeCloseTo(4 * mul, 9);
    }
    expect(ITEMS.braceframe.desc).toEqual(["ENEMY STUNS ON THE", "BELT TILES IT HITS", "END SOONER."]);
    expect(ITEMS.braceframe.desc.join(" ")).not.toMatch(/PLATED/);
  });

  it("TWIN TRIGGER: its mod is its pairBonus alone at every star (no load time); its desc says paired loads hit harder", () => {
    for (const s of STARS) expect(Object.keys(effectAt("twintrigger", s).mod!), `★${s}`).toEqual(["pairBonus"]);
    expect(ITEMS.twintrigger.desc).toEqual(["PAIRED LOADS IN", "THIS TURRET HIT", "HARDER."]);
    expect(ITEMS.twintrigger.desc.join(" ")).not.toMatch(/LOAD\s+TIME|SHORTER/);
  });

  it("the 3-line desc form, the tool copy equal, still drawn nowhere, and no comment left that says an edit turns wave3Art red", () => {
    for (const id of ["braceframe", "twintrigger"]) {
      expect(ITEMS[id].desc, id).toHaveLength(3);
      for (const line of ITEMS[id].desc) expect(line.length, `${id}: ${line}`).toBeLessThanOrEqual(20);
      expect(P1_WAVE3_ITEMS[id].desc, `${id}: tools/wave3Defs.ts's copy`).toEqual(ITEMS[id].desc);
      expect(Object.prototype.hasOwnProperty.call(KEPT_FLAVOUR, id), `${id}: a KEPT_FLAVOUR row`).toBe(true);
    }
    const content = readFileSync(join(ROOT, "src/sim/content.ts"), "utf8");
    expect(content).not.toMatch(/turns tests\/wave3Art\.test\.ts:199 red/);
  });
});
