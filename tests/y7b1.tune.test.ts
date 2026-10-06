// Y7b1 TUNE-Y (release Y; REQ-BFG-070, REQ-BFG-046; cap's rulings Y7A-R1..R6, REVIEW-Y7A section 7): the rulings built
// behind the star switch (content.ts STAR_RULES, withStarRules), each read with the switch on against the same scene off.
// With the switch off nothing here moves: every off reading is the base's (base092).
// - Y7A-R1, STOKER: its cap holds with the switch on, at every star (battle.ts stokedPace, deckRating.ts rateDeck), as at
//   0.9.2: no overfeed trap. The stoke stays 0.2 / 0.44 / 0.7; its face says the cap (UP TO), its ⓘ sentence names the gun.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { withStarRules } from "../src/sim/content";
import { type Build } from "../src/sim/deck";
import { rateDeck, stokeKeep } from "../src/sim/deckRating";
import { effectAt } from "../src/sim/stars";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { abilityText } from "../src/ui/abilityText";
import { faceAt } from "../src/ui/faces";
import { STARS, lines, on, oneLine } from "./y3.helpers";
import { K, item, withItem, withMod } from "./wave3.helpers";

const SEEDS = [1, 2, 3, 4, 5]; // wave3.decks' capRows: both sides +3000 hull, 120 s

// ------------------------------------------------------------------------- Y7A-R1: STOKER's cap holds with the switch on
describe("Y7b1 Y7A-R1: STOKER's cap holds with the switch on, at every star (no overfeed trap)", () => {
  const furnaceStart = () => heroStartBuild("furnace", 1), weaverStart = () => heroStartBuild("weaver", 101);
  /** wave3.decks' lockjaw: a KILN and a TWIN MOULD sharing one gun (tests/wave3.decks.test.ts, line for line). */
  const lockjaw = (): Build => ({
    hero: "furnace", items: [{ uid: 1, def: "kiln", x: 2, y: 6 }, { uid: 2, def: "twinmould", x: 6, y: 6 }],
    routes: [
      { factory: 1, cells: [K(2, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(4, 1), K(4, 0)] },
      { factory: 2, cells: [K(7, 5), K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ], mods: [], beltCap: 30, hullBonus: 0,
  } as Build);
  const sturdy = (b: Build): Build => ({ ...b, hullBonus: b.hullBonus + 3000 });
  /** wave3.decks' capRows: mean damage dealt and jams over the seeds, no stoker, then a STOKER at (x, y) at 1-3 stars. */
  const capRows = (base: () => Build, x: number, y: number, star: boolean) => withStarRules(() => [0, 1, 2, 3].map((s) => {
    let dmg = 0, jams = 0;
    for (const seed of SEEDS) {
      const b = s ? withItem(base(), item(70, "stoker", x, y, 0, s)) : base();
      const bt = new Battle(sturdy(b), sturdy(weaverStart()), seed);
      while (!bt.over && bt.ticks < 60 * 200) { bt.step(); bt.events.length = 0; }
      dmg += bt.sides[0].stats.damage;
      jams += bt.sides[0].stats.jams;
    }
    return { dmg: dmg / SEEDS.length, jams: jams / SEEDS.length };
  }), star);

  it("battle: on FURNACE's start deck none <= ★1 <= ★2 <= ★3 with 0 jams, the off rows 3034 / 3626 / 3700 / 3700 (Y7a, before: ★2/★3 2738 / 2664 with 14-15 jams)", () => {
    const rows = capRows(furnaceStart, 6, 6, true);
    expect(rows).toEqual(capRows(furnaceStart, 6, 6, false));
    for (const s of STARS) expect(rows[s].dmg, `★${s} >= ★${s - 1}`).toBeGreaterThanOrEqual(rows[s - 1].dmg);
    expect(rows.map((r) => r.jams)).toEqual([0, 0, 0, 0]);
    expect(rows.map((r) => Math.round(r.dmg))).toEqual([3034, 3626, 3700, 3700]);
  }, 120_000);

  it("battle: on, both shared-gun rows read as off: a STOKER on the KILN or on the mould deals 3955 at every star, no more jams than none (Y7a, before: under none at every star)", () => {
    for (const [x, y] of [[1, 6], [8, 6]] as const) {
      const rows = capRows(lockjaw, x, y, true);
      expect(rows, `STOKER at (${x},${y})`).toEqual(capRows(lockjaw, x, y, false));
      expect(rows.map((r) => Math.round(r.dmg)), `STOKER at (${x},${y})`).toEqual([3955, 3955, 3955, 3955]);
      for (const s of STARS) expect(rows[s].jams, `(${x},${y}) ★${s}`).toBeLessThanOrEqual(rows[0].jams);
    }
    // the tripwire row (ruling 42da94243f43feef: the gun has room, so the cap never binds) is the same on and off
    const room = () => withMod(lockjaw(), 60, "calibrate", 0, 3);
    expect(capRows(room, 8, 6, true)).toEqual(capRows(room, 8, 6, false));
  }, 240_000);

  it("rating: on, FURNACE's start deck rates none / ★1 / ★2 / ★3 at 46.6 / 50.4 / 51.1 / 51.1, as off (Y7a, before: 45.6 / 40.8 at ★2/★3); stokeKeep as off", () => {
    const stoked = (s: number) => (s ? withItem(furnaceStart(), item(70, "stoker", 6, 6, 0, s)) : furnaceStart());
    const offense = (s: number, star: boolean) => withStarRules(() => rateDeck(stoked(s)).offense, star);
    expect([0, 1, 2, 3].map((s) => offense(s, true).toFixed(1))).toEqual(["46.6", "50.4", "51.1", "51.1"]);
    for (const s of [0, 1, 2, 3]) expect(offense(s, true), `★${s}`).toBeCloseTo(offense(s, false), 9);
    for (const s of STARS) expect(on(() => [...stokeKeep(stoked(s))]), `★${s}`).toEqual([...stokeKeep(stoked(s))]);
  });

  it("data and texts: the stoke stays 0.2 / 0.44 / 0.7; on, the face says the cap in its one line (UP TO) and the ⓘ sentence names the gun, as off", () => {
    expect(on(() => STARS.map((s) => effectAt("stoker", s).gate!.stoke))).toEqual([0.2, 0.44, 0.7]);
    expect(STARS.map((s) => effectAt("stoker", s).gate!.stoke)).toEqual([0.2, 0.44, 0.7]);
    expect(lines("stoker")).toEqual(["20%", "44%", "70%"].map((p) => [`ITS FACTORIES WORK UP TO ${p} FASTER.`]));
    oneLine("stoker");
    expect(on(() => faceAt("stoker", 2)!.caveats)).toBeUndefined();
    for (const s of STARS) expect(on(() => abilityText("stoker", s).sentences), `★${s}`).toEqual(abilityText("stoker", s).sentences);
    expect(on(() => abilityText("stoker", 1).sentences[1])).toBe("IT NEVER MAKES A FACTORY OUTRUN ITS GUN.");
  });
});
