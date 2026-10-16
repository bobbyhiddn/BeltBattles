// PLAIN-1F (M4; REQ-BFG-080, REQ-BFG-089, REQ-BFG-086.1; BRIEF-PLAIN1F M4): a placed long rig's panel fits the phone band
// again by its content alone (no layout.ts change; tests/zoom1 and explain1 (e) measure the band at 90% as shipped):
//  - its hits are ONE line, the grouped form ("→ BELT 1 TILES 2 AND 3"), however many arrows land;
//  - its UP TO n HITS line leaves the placed panel, since its arrows line says n: the header's RIG · x/n ARROWS ON BELTS,
//    or, IDLE, its warning IDLE: 0/n ARROWS ON BELTS. (inspector.ts longIdle);
//  - its stat row stays (the piece's own numbers); its offer and cargo panels keep UP TO n HITS (the piece's own fact);
//  - a one-cell rig's placed panel is as before (a line a hit, IDLE_SHORT).
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { key as K, rotField, type Placed } from "../src/sim/deck";
import { shapesRules } from "../src/sim/shapes";
import { IDLE_SHORT, cargoPanel, longIdle, offerPanel, rigPanel } from "../src/screens/build/inspector";
import { SHAPED_PLAIN_RIGS, plainRigStats, shapeLines, shapeMaxHits } from "../src/ui/faces";
import { statRow } from "../src/ui/icons";

/** The Kiln and its belt (tests/explain1.test.ts's furnace(): a 6-tile belt up the x = 4 column). */
const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "plain1f-band");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  return run;
}
const rig = (def: string, x: number, y: number, rot: number, stars: number): Placed => ({ uid: 10, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
const PLACES = [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const;

describe("PLAIN-1F (M4): a placed long rig's panel", () => {
  it("one hits line; no UP TO n HITS (its arrows line says n, working or IDLE); the stat row kept; at every star and place", () => {
    expect(shapesRules()).toBe(true); // as shipped
    const seen: string[] = [];
    let idles = 0, working = 0;
    for (const def of SHAPED_PLAIN_RIGS) for (const s of [1, 2, 3]) for (const [x, y, rot] of PLACES) {
      const rp = rigPanel(furnace([rig(def, x, y, rot, s)]), 10)!, n = shapeMaxHits(def), upTo = shapeLines(def, s)[0].text;
      const tag = `${def} ★${s} @${x},${y}`;
      expect(upTo, tag).toBe(`UP TO ${n} HITS`);
      const texts = [rp.body, ...(rp.variants ?? []).map((v) => v.body)].flat().map((b) => b.text);
      expect(texts.includes(upTo), `${tag}: no UP TO n HITS`).toBe(false);
      expect(rp.body.some((b) => b.text === statRow(plainRigStats(def, s)!)), `${tag}: its stat row`).toBe(true);
      if (rp.idle) {
        idles++;
        expect(rp.sub, tag).toBe("RIG · IDLE");
        expect(rp.body[0].text, tag).toBe(longIdle(n));
      } else {
        working++;
        const hits = rp.body.filter((b) => b.role === "hits");
        expect(hits.length, `${tag}: one hits line`).toBe(1);
        expect(rp.sub, tag).toMatch(new RegExp(`^RIG · \\d/${n} ARROWS ON BELTS$`));
        seen.push(`${tag}: ${rp.sub} | ${hits[0].text}`);
      }
    }
    // measured: each long rig is IDLE at two of the three places and works at one (NAIL STRIP and EMBER TROUGH at 3,3, SPIKE
    // RAIL at 5,3), at each star
    expect([idles, working]).toEqual([18, 9]);
    expect(longIdle(6)).toBe("IDLE: 0/6 ARROWS ON BELTS.");
    console.log(`PLAIN1F (M4) placed long rigs:\n${seen.join("\n")}`);
  });

  it("its offer and cargo panels keep UP TO n HITS; a one-cell rig's placed panel is as before", () => {
    for (const def of SHAPED_PLAIN_RIGS) {
      const upTo = shapeLines(def, 1)[0].text;
      const o = furnace();
      o.shop.wagons = [{ merchant: "alchemist", offers: [{ def, price: 4, sold: false }] }] as Run["shop"]["wagons"];
      expect(offerPanel(o, 0, 0)!.body.some((b) => b.text === upTo), `offer ${def}`).toBe(true);
      const c = furnace();
      c.inventory = [{ uid: 900, def }];
      expect(cargoPanel(c, 900)!.body.some((b) => b.text === upTo), `cargo ${def}`).toBe(true);
    }
    // WHETSTONE: IDLE_SHORT idle; beside the belt, a line a hit ("→ BELT 1, TILE n")
    const idle = rigPanel(furnace([rig("whetstone", 0, 9, 0, 1)]), 10)!;
    expect([idle.idle, idle.body[0].text]).toEqual([true, IDLE_SHORT]);
    const on = rigPanel(furnace([rig("whetstone", 3, 3, 1, 1)]), 10)!;
    expect(on.body.filter((b) => b.role === "hits").map((b) => b.text)).toEqual(["→ BELT 1, TILE 3"]);
  });
});
