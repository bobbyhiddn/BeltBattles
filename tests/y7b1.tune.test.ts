// Y7b1 TUNE-Y (release Y; REQ-BFG-070, REQ-BFG-046; cap's rulings Y7A-R1..R6, REVIEW-Y7A section 7): the rulings built
// behind the star switch (content.ts STAR_RULES, withStarRules), each read with the switch on against the same scene off.
// With the switch off nothing here moves: every off reading is the base's (base092).
// - Y7A-R1, STOKER: its cap holds with the switch on, at every star (battle.ts stokedPace, deckRating.ts rateDeck), as at
//   0.9.2: no overfeed trap. The stoke stays 0.2 / 0.44 / 0.7; its face says the cap (UP TO), its ⓘ sentence names the gun.
// - Y7A-R3c / R3d, ANVIL BREECH and IRON WALL: their STAR_DIFF rows are deleted, so with the switch on each reads its base
//   def (the same object as off): the sim, the rating, the ⓘ sentences and the timeline as off; each face states both parts
//   on one line.
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS, STAR_ITEMS, withStarRules } from "../src/sim/content";
import { type Build, type TimelineHit } from "../src/sim/deck";
import { rateDeck, stokeKeep } from "../src/sim/deckRating";
import { effectAt } from "../src/sim/stars";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { S, S_PLATING, abilityText, cardText, gist, hitText } from "../src/ui/abilityText";
import { faceAt } from "../src/ui/faces";
import { STARS, levels, lines, next, on, oneLine, rigBench } from "./y3.helpers";
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

// ------------------------------------------------------------- Y7A-R3c / R3d: ANVIL BREECH and IRON WALL read their base defs
describe("Y7b1 Y7A-R3c / R3d: ANVIL BREECH and IRON WALL read their base defs with the switch on", () => {
  it("data: on, each def is the base's own object (no STAR_DIFF row), its numbers 0.9.2's at every star", () => {
    expect(Object.keys(STAR_ITEMS)).not.toContain("anvil");
    expect(Object.keys(STAR_ITEMS)).not.toContain("shieldwall");
    for (const id of ["anvil", "shieldwall"]) expect(on(() => ITEMS[id]), id).toBe(ITEMS[id]);
    for (const s of STARS) {
      expect(on(() => effectAt("anvil", s).core), `anvil ★${s}`).toEqual({ routine: "anvil", anvilFlat: [25, 55, 88][s - 1], perPlate: [1, 2.2, 3.5][s - 1] });
      expect(on(() => effectAt("shieldwall", s).gate), `shieldwall ★${s}`).toEqual({ plate: [10, 22, 35][s - 1], plated: { min: 120, flat: [30, 66, 105][s - 1] } });
    }
  });

  it("every reader agrees on as off: the rating of a deck holding each (BASTION's start; the bench), the kept sentences, gists, cards and the timeline row", () => {
    const anv = withMod(heroStartBuild("bastion", 1), 70, "anvil", 0, 1), wall = rigBench([["shieldwall", 4, 3, 1]]);
    for (const b of [anv, wall]) expect(on(() => rateDeck(b))).toEqual(rateDeck(b));
    for (const def of ["anvil", "shieldwall"]) for (const s of STARS) {
      const o = def === "anvil" ? { k: 1 } : {};
      const read = () => ({ t: abilityText(def, s, o).sentences.map((x) => x.replace(S_PLATING, S.plating)), g: gist(def, s, o), c: cardText(def, o) });
      expect(on(read), `${def} ★${s}`).toEqual(read());
    }
    const row = { def: "shieldwall", stars: 2, plate: 22 } as TimelineHit;
    expect(on(() => hitText(row, "free"))).toBe(hitText(row, "free"));
  });

  it("faces: on, each states both parts on one line inside the band; ANVIL's is 0.9.2's own face; ladders per part", () => {
    expect(lines("anvil")).toEqual([[25, 100], [55, 220], [88, 350]].map(([d, p]) => [`SHOT: +${d} {DMG}, +${p}% OF YOUR {*PLATE}.`]));
    expect(lines("anvil")).toEqual(lines("anvil", false));
    expect(lines("shieldwall")).toEqual([[10, 30], [22, 66], [35, 105]].map(([p, d]) => [`HIT: +${p} {*PLATE}, +${d} {DMG} AT 120+ {*PLATE}.`]));
    oneLine("anvil");
    oneLine("shieldwall");
    expect(levels("anvil", 1)).toEqual(["{DMG} [+25]/+55/+88", "[+100%]/+220%/+350% OF {PLATE}", next(2, "+55 {DMG}, +220% OF {PLATE}")]);
    expect(levels("shieldwall", 3)).toEqual(["{PLATE} +10/+22/[+35]", "{DMG} +30/+66/[+105]"]);
  });
});

// ------------------------------------------------------------------- Y7A-R4 / R5: the new numbers, with the switch on
describe("Y7b1 Y7A-R4 / R5: DRAKE NOZZLE, COUNTERWEIGHT and VENOM DRIP read their new numbers with the switch on", () => {
  it("DRAKE NOZZLE (Y7A-R4): flatPerBurn 38 / 27 / 19 on (Y4's 10 / 7 / 5); its face and ⓘ ladder say them; off, 0.9.2's 20 / 15 / 10", () => {
    expect(on(() => STARS.map((s) => effectAt("drake", s).core!.flatPerBurn))).toEqual([38, 27, 19]);
    expect(STARS.map((s) => effectAt("drake", s).core!.flatPerBurn)).toEqual([20, 15, 10]);
    expect(lines("drake")).toEqual([38, 27, 19].map((d) => [`SHOT: EACH ${d} BONUS DAMAGE IS 1 {*BURN}.`]));
    expect(levels("drake", 2)).toEqual(["EACH 38/[27]/19", next(3, "EACH 19")]);
    expect(on(() => gist("drake", 3, { k: 1 }))).toBe("1 BURN FOR EVERY 19 DAMAGE");
  });
  it("COUNTERWEIGHT (Y7A-R5): perTile.each 2 / 5 / 7 on, no cap (Y5's 5 / 11 / 18); its face and ⓘ ladder say them; off, 0.9.2's 5 / 11 / 18 up to 60 / 130 / 210", () => {
    expect(on(() => STARS.map((s) => effectAt("counterweight", s).gate!.perTile))).toEqual([2, 5, 7].map((each) => ({ each })));
    expect(STARS.map((s) => effectAt("counterweight", s).gate!.perTile)).toEqual([[5, 60], [11, 130], [18, 210]].map(([each, max]) => ({ each, max })));
    expect(lines("counterweight")).toEqual([2, 5, 7].map((d) => [`HIT: +${d} {DMG} FOR EACH TILE RIDDEN.`]));
    expect(levels("counterweight", 2)).toEqual(["+2/[+5]/+7 {DMG} EACH", next(3, "+7 {DMG} EACH")]);
    expect(on(() => gist("counterweight", 1))).toBe("2 DAMAGE FOR EACH TILE");
  });
});
