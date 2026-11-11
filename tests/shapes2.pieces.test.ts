// SHAPES-2 (REQ-BFG-114, REQ-BFG-084; BRIEF-SHAPES2 S1, S2; step 2): the six more shaped plain stat rigs and their switch.
// - the switch: SHAPES2 ships ON since bb-0.11.0 (BUMP-1D; it shipped off before: the off world is run explicitly, withShapes2(fn,
//   false)); off, nothing sees ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER or PICKAXE; on, they join ITEMS after every
//   other def; withShapes2 puts it back; it works with PLAIN_RIGS off and on (1D ships both: the PLAIN_RIGS-off world is explicit too);
// - the defs: rarity, price, foot, merchant, the stat rows of a star (a star raises only the numbers), no ability line;
// - cells and arrows of each rig at every rot (pictures), and the hits on fixtures: ELBOW GUARD at a belt's corner, SAW BAR
//   along a straight run, SPARK COMB along a belt, CINDER HOOK round a bend, JAW CRUSHER between two belts two cells apart,
//   PICKAXE with belt on three sides; the bots' and the preview's would-hit helper (hitsIfPlaced) agrees with rigHits;
// - the pools with the switch on and off (catalogue, merchants, LAST CHANCE's epic parts) and the per-run draw's size;
// - merge and sell; the multiplying-rig guard (SPLITTER, SORTING ARM, OVERCLOCKER, LONG HAUL and PINCER stay 1 cell);
// - the rules gate (SHAPES2_RULES, shapes2GateProblem, shapes2World, inShapes2World) and the validator's verdicts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GRID, ITEMS, RULES_VERSION, buyableModules, itemsSoldBy, rigShape, sellValue, type MerchantId } from "../src/sim/content";
import { canPlaceItem, key as K, rigArrowCells, rigArrows, rigHits, type Build, type Placed } from "../src/sim/deck";
import { footBox, footOf, footOnDeck, footprintCells } from "../src/sim/foot";
import { hitsIfPlaced } from "../src/sim/beltside";
import { SHAPES2, SHAPES2_DEFS, SHAPES2_IDS, SHAPES2_PATCHES, isShapes2Piece, setShapes2, shapes2Rules, withShapes2 } from "../src/sim/shapes2";
import { SHAPES_IDS, shapesRules, withShapes } from "../src/sim/shapes";
import { GATES, GATES_IDS, setGates } from "../src/sim/gates"; // BUMP-1F (the flip, GATES): this file's world is the one before the three converters
import { SCALE_IDS, SCALE_RIGS, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the seven scaling rigs are in the catalogue (SCALE_RIGS ships on); the 0.9.11 one is read under withScaleRigs(fn, false)
import { withPlainRigs, PLAIN_RIG_IDS, PLAIN_RIGS, plainRigsRules } from "../src/sim/plainRigs";
import { effectAt, fusible, valueOf } from "../src/sim/stars";
import { lastChanceParts } from "../src/sim/lastChance";
import { DRAW, drawWares } from "../src/game/wares";
import { SHAPES2_RULES, SHAPES_RULES, rulesAtLeast, shapes2Features, shapes2GateProblem, shapes2World } from "../src/net/rulesGate"; // BUMP-1E: + rulesAtLeast
import { inShapes2World, inShapesWorld, validateBuild, validateUpload } from "../src/net/validate";
import { heroStartBuild } from "../src/sim/heroBuilds";

// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): GATES ships on (bb-0.13.0), and this file's counts and ITEMS tails are the world before the three converters (SHAPES2's six, then the
// seven, last), so every test runs with GATES off, as its pins were measured; gates off first in the beforeEach, back last in the afterEach (its three are the last keys of ITEMS). Was only the afterEach (setShapes2)
beforeEach(() => setGates(false));
afterEach(() => { setShapes2(SHAPES2); setGates(GATES); }); // the shipped value (on since BUMP-1D); a test that needs it off sets it itself (withShapes2(fn, false)); BUMP-1F: + GATES (on), last

const SIX = ["elbowguard", "sawbar", "sparkcomb", "cinderhook", "jawcrusher", "pickaxe"];
const ids = (l: { id: string }[]) => l.map((d) => d.id);
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: the canonical order, BUMP-1F P2 F1, src/sim/itemsKeep.ts ITEM_RANK: ... shapes2 3, scale 4, gates 5): a switch adds its ids at their rank, so the six go in
// BEFORE the seven scaling rigs (SCALE_RIGS ships on) and the three converters, not behind them. `withSix(keys)`: `keys` (a world without the six) with the six put in at their rank; was `[...keys, ...SIX]`
const LATER: readonly string[] = [...SCALE_IDS, ...GATES_IDS];
const withIds = (keys: string[], add: string[]): string[] => [...keys.filter((id) => !LATER.includes(id)), ...add, ...keys.filter((id) => LATER.includes(id))];
const withSix = (keys: string[]): string[] => withIds(keys, SIX);

describe("SHAPES-2 S1: the switch", () => {
  // BUMP-1D: was "ships off: nothing sees the six" (SHAPES2 false). The release turns it on (with PLAIN_RIGS and LONG_RUN, bb-0.11.0),
  // so the shipped world has the six and the old assertions run in the off world, explicitly (withShapes2(fn, false)).
  it("ships on (BUMP-1D): the six are in the game; the ids are the brief's, in order; with the switch off nothing sees them", () => {
    expect(SHAPES2).toBe(true); // BUMP-1D: was false
    expect(shapes2Rules()).toBe(true); // BUMP-1D: was false
    expect(SHAPES2_IDS).toEqual(SIX);
    for (const id of SIX) {
      expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true); // BUMP-1D: was false
      expect(isShapes2Piece(id), id).toBe(true);
    }
    expect(ids(buyableModules())).toContain("pickaxe"); // BUMP-1D: was not.toContain
    // the old world (what this test measured as shipped): the switch off
    withShapes2(() => {
      expect(shapes2Rules()).toBe(false);
      for (const id of SIX) {
        expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(false);
        expect(isShapes2Piece(id), id).toBe(true); // the predicate does not read the switch
      }
      expect(ids(buyableModules())).not.toContain("pickaxe");
    }, false);
    expect(isShapes2Piece("nailstrip")).toBe(false);
    expect(isShapes2Piece("rasp")).toBe(false);
  });

  it("on: the six join ITEMS after every other def; off again: ITEMS as before; withShapes2 puts the switch back even on a throw", () => {
    // BUMP-1D: the six are in ITEMS at load (the switch ships on), so "ITEMS as before" is the switch-off world, measured explicitly
    const keysOn = Object.keys(ITEMS);
    const keys0 = withShapes2(() => Object.keys(ITEMS), false);
    expect(keysOn.length).toBe(keys0.length + 6); // BUMP-1D: the six are the whole difference
    expect(keysOn.filter((id) => !SIX.includes(id))).toEqual(keys0); // every other def, in the order it had
    withShapes2(() => {
      expect(shapes2Rules()).toBe(false);
      expect(Object.keys(ITEMS)).toEqual(keys0);
      withShapes2(() => {
        expect(shapes2Rules()).toBe(true);
        expect(Object.keys(ITEMS)).toEqual(withSix(keys0)); // BUMP-1F: was [...keys0, ...SIX]
        for (const id of SIX) expect(ITEMS[id], id).toBe(SHAPES2_DEFS[id]);
      });
      expect(shapes2Rules()).toBe(false);
      expect(Object.keys(ITEMS)).toEqual(keys0);
      expect(() => withShapes2(() => { throw new Error("x"); })).toThrow("x");
      expect(shapes2Rules()).toBe(false);
      expect(Object.keys(ITEMS)).toEqual(keys0);
      setShapes2(false); // the state it has: nothing happens
      expect(Object.keys(ITEMS)).toEqual(keys0);
      // on inside, off again inside that
      withShapes2(() => withShapes2(() => expect(Object.keys(ITEMS)).toEqual(keys0), false));
    }, false);
    // BUMP-1D: the shipped state (on) comes back after the off world, and after a throw out of it, the six after every other def
    expect(shapes2Rules()).toBe(true);
    expect(Object.keys(ITEMS)).toEqual(withSix(keys0)); // BUMP-1F: was [...keys0, ...SIX]
    expect(() => withShapes2(() => { throw new Error("x"); }, false)).toThrow("x");
    expect(shapes2Rules()).toBe(true);
    expect(Object.keys(ITEMS)).toEqual(withSix(keys0)); // BUMP-1F: was [...keys0, ...SIX]
  });

  it("works with PLAIN_RIGS off and with both on (1D ships both): the 15 pieces are all there, in either order", () => {
    // BUMP-1D: both ship on; each world this test measured is made explicit. bothOff: the world before 1D, to turn them on in an order
    const bothOff = <T>(fn: () => T): T => withShapes2(() => withPlainRigs(fn, false), false);
    expect(PLAIN_RIGS).toBe(true); // BUMP-1D: 1D ships both
    expect(plainRigsRules()).toBe(true);
    for (const id of [...SIX, ...PLAIN_RIG_IDS]) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true); // the shipped world
    // the six on, the plain rigs off
    withPlainRigs(() => {
      withShapes2(() => {
        for (const id of SIX) expect(ITEMS[id].name).toBeTruthy();
        for (const id of PLAIN_RIG_IDS) expect(Object.prototype.hasOwnProperty.call(ITEMS, id)).toBe(false);
        withPlainRigs(() => {
          for (const id of [...SIX, ...PLAIN_RIG_IDS]) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true);
        });
      });
    }, false);
    // both on, in either order: the plain rigs first (the order this test pinned), then the six after them; and the six first
    bothOff(() => withPlainRigs(() => withShapes2(() => {
      for (const id of [...SIX, ...PLAIN_RIG_IDS]) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true);
      // BUMP-1F (canonical order): the tail before the seven is the plain six, SHAPES' three, then the six (ITEM_RANK: plain 1, shapes 2, shapes2 3), whatever the order they are turned on in; was .slice(-12) equal to [...PLAIN_RIG_IDS, ...SIX]
      expect(Object.keys(ITEMS).slice(-(15 + SCALE_IDS.length), -SCALE_IDS.length)).toEqual([...PLAIN_RIG_IDS, ...SHAPES_IDS, ...SIX]);
    })));
    bothOff(() => withShapes2(() => withPlainRigs(() => {
      for (const id of [...SIX, ...PLAIN_RIG_IDS]) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(true);
      // BUMP-1F (canonical order): the same tail with the six turned on first: each switch adds its ids at their rank, so the order is the same either way; was .slice(-12) equal to [...SIX, ...PLAIN_RIG_IDS]
      expect(Object.keys(ITEMS).slice(-(15 + SCALE_IDS.length), -SCALE_IDS.length)).toEqual([...PLAIN_RIG_IDS, ...SHAPES_IDS, ...SIX]);
    })));
    // and the world before 1D has neither
    bothOff(() => {
      for (const id of [...SIX, ...PLAIN_RIG_IDS]) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(false);
    });
  });
});

describe("SHAPES-2 S1: the defs (BRIEF-SHAPES2's table)", () => {
  it("name, rarity, price, foot, merchant: nine shaped rigs across common, rare and epic and all seven merchants", () => {
    expect(SIX.map((id) => {
      const d = SHAPES2_DEFS[id];
      return [d.name, d.rarity, d.price, footOf(d), d.merchant];
    })).toEqual([
      ["ELBOW GUARD", "common", 4, "L3", "ironmonger"],
      ["SAW BAR", "common", 5, "I3", "gunsmith"],
      ["SPARK COMB", "common", 5, "I2", "arcane"],
      ["CINDER HOOK", "rare", 6, "L3", "alchemist"],
      ["JAW CRUSHER", "rare", 6, "2x2", "scrapper"],
      ["PICKAXE", "epic", 8, "T4", "quartermaster"],
    ]);
    // with the three of SHAPES-1: nine shaped rigs, every rarity but legendary, all seven merchants
    const nine = [...SHAPES_IDS.map((id) => ITEMS[id]), ...SIX.map((id) => SHAPES2_DEFS[id])];
    expect(nine.length).toBe(9);
    expect(new Set(nine.map((d) => d.rarity))).toEqual(new Set(["common", "rare", "epic"]));
    expect(new Set(nine.map((d) => d.merchant))).toEqual(new Set<MerchantId>(["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"]));
    // L, T and 2x2 feet as well as lines
    expect(new Set(nine.map((d) => footOf(d)))).toEqual(new Set(["I2", "I3", "L3", "2x2", "T4"]));
  });

  it("plain stat rigs (REQ-BFG-084): a stat row and no ability line; a star raises only the numbers; the arrows follow the rarity", () => {
    withShapes2(() => {
      expect(SIX.map((id) => rigShape(ITEMS[id]))).toEqual(["I", "I", "I", "II", "II", "T"]);
      for (const id of SIX) {
        const d = ITEMS[id];
        expect(d.kind, id).toBe("gate");
        expect(d.desc, `${id}: no ability line`).toEqual([]);
        expect(d.shape, `${id}: the rarity's arrows`).toBeUndefined();
        expect(fusible(id), id).toBe(true);
        for (const s of [2, 3]) {
          const a = effectAt(id, s), b = ITEMS[id];
          expect({ ...a, gate: undefined }, `${id} ★${s}`).toEqual({ ...b, gate: undefined }); // nothing but the numbers
        }
      }
      const row3 = (id: string) => [1, 2, 3].map((s) => effectAt(id, s).gate);
      // step 6 (S6c): SHIELD 8/16/28 (2/4/7 was the brief's starting value); BUMP-1D P3 (T3): a DMG row 6/12/21 beside it (SCALE GUARD's form; was SHIELD alone)
      expect(row3("elbowguard")).toEqual([{ slugPlate: 8, flat: 6 }, { slugPlate: 16, flat: 12 }, { slugPlate: 28, flat: 21 }]);
      expect(row3("sawbar")).toEqual([{ flat: 9 }, { flat: 18 }, { flat: 31 }]); // run 2 (S6c, then S6b's day-3 guard): 8/16/28 was the brief's starting value
      expect(row3("sparkcomb")).toEqual([{ stun: 1 }, { stun: 2 }, { stun: 3 }]);
      // run 2 (S6b): BRANDING IRON's form, the BURN comes with the first merge (the brief's starting BURN 1/2/3 was over the guard)
      expect(row3("cinderhook")).toEqual([{ flat: 10 }, { flat: 20, burn: 1 }, { flat: 35, burn: 2 }]);
      expect(row3("jawcrusher")).toEqual([{ flat: 20 }, { flat: 42 }, { flat: 70 }]); // run 2 (S6c): 12/25/42
      expect(row3("pickaxe")).toEqual([{ flat: 14 }, { flat: 28 }, { flat: 48 }]); // the brief's starting values: run 2's S6c raise (17, then 15) read over the guard
    });
  });
});

describe("SHAPES-2 run 2 (S6b, PLAIN-1F's section 10 call): NAIL STRIP's buff and SPIKE RAIL's cut are behind the switch", () => {
  const row = (id: string) => [1, 2, 3].map((s) => effectAt(id, s).gate);
  const LIVE = [{ flat: 12 }, { flat: 25 }, { flat: 40 }];
  const BUFFED = [{ flat: 16 }, { flat: 33 }, { flat: 53 }];
  const SPIKE_LIVE = [{ flat: 10 }, { flat: 20 }, { flat: 35 }];
  const SPIKE_CUT = [{ flat: 8 }, { flat: 16 }, { flat: 28 }];

  it("off: SHAPES-1's 12/25/40 and 10/20/35 byte for byte (the live pieces); on: NAIL STRIP 16/33/53, SPIKE RAIL 8/16/28; off again: as they were", () => {
    // BUMP-1D: SHAPES2 ships on, so the shipped pieces read the patched numbers; SHAPES-1's own numbers are the off world's, run explicitly
    expect(row("nailstrip")).toEqual(BUFFED); // BUMP-1D: was LIVE (the switch shipped off)
    expect(row("spikerail")).toEqual(SPIKE_CUT); // BUMP-1D: was SPIKE_LIVE
    const patched = [JSON.stringify(ITEMS.nailstrip), JSON.stringify(ITEMS.spikerail)];
    withShapes2(() => {
      const before = [JSON.stringify(ITEMS.nailstrip), JSON.stringify(ITEMS.spikerail)];
      expect(row("nailstrip")).toEqual(LIVE);
      expect(row("spikerail")).toEqual(SPIKE_LIVE);
      withShapes2(() => {
        expect(row("nailstrip")).toEqual(BUFFED);
        expect(row("spikerail")).toEqual(SPIKE_CUT);
        // nothing but the numbers: price, rarity, foot, merchant, tags and the empty ability line are SHAPES-1's
        const d = ITEMS.nailstrip, s = ITEMS.spikerail;
        expect([d.rarity, d.price, footOf(d), d.merchant, d.desc, d.tags]).toEqual(["common", 4, "I2", "alchemist", [], ["FORGE"]]);
        expect([s.rarity, s.price, footOf(s), s.merchant, s.desc, s.tags]).toEqual(["rare", 6, "I3", "tinker", [], ["FORGE", "BURST"]]);
        expect(SHAPES2_PATCHES.nailstrip.gate).toEqual({ flat: 16 });
        expect(SHAPES2_PATCHES.spikerail.gate).toEqual({ flat: 8 });
        expect([JSON.stringify(ITEMS.nailstrip), JSON.stringify(ITEMS.spikerail)]).toEqual(patched);
      });
      expect(row("nailstrip")).toEqual(LIVE);
      expect(row("spikerail")).toEqual(SPIKE_LIVE);
      expect([JSON.stringify(ITEMS.nailstrip), JSON.stringify(ITEMS.spikerail)]).toEqual(before);
    }, false);
    // the shipped state (on) comes back with the patched numbers, byte for byte
    expect(row("nailstrip")).toEqual(BUFFED);
    expect(row("spikerail")).toEqual(SPIKE_CUT);
    expect([JSON.stringify(ITEMS.nailstrip), JSON.stringify(ITEMS.spikerail)]).toEqual(patched);
  });

  it("only those two move: EMBER TROUGH and every older piece keep their numbers with SHAPES2 on", () => {
    // BUMP-1D: SHAPES2 ships on, so the older pieces' numbers are read in the off world (the pieces as they were) and compared with the on world's
    const keys = withShapes2(() => Object.keys(ITEMS).filter((id) => id !== "nailstrip" && id !== "spikerail"), false);
    const was = withShapes2(() => keys.map((id) => JSON.stringify(ITEMS[id])), false);
    withShapes2(() => {
      expect(row("embertrough")).toEqual([{ burn: 1 }, { burn: 2 }, { burn: 3 }]);
      expect(Object.keys(SHAPES2_PATCHES)).toEqual(["nailstrip", "spikerail"]);
      expect(keys.map((id) => JSON.stringify(ITEMS[id]))).toEqual(was);
    });
  });

  it("a SHAPES toggle that leaves SHAPES2 on does not lose the patch (the def object is the one SHAPES-1 adds and removes)", () => {
    withShapes2(() => {
      withShapes(() => expect(Object.prototype.hasOwnProperty.call(ITEMS, "nailstrip")).toBe(false), false);
      expect(shapesRules()).toBe(true);
      expect(row("nailstrip")).toEqual(BUFFED);
    });
    // BUMP-1D: SHAPES2 ships on, so after the toggle the patch stands; the off world (LIVE numbers) is explicit
    expect(row("nailstrip")).toEqual(BUFFED);
    withShapes2(() => expect(row("nailstrip")).toEqual(LIVE), false);
    // and the validator's order (SHAPES2 off before SHAPES goes off, back in the reverse order) keeps both
    inShapesWorld("bb-0.9.7", () => expect(Object.prototype.hasOwnProperty.call(ITEMS, "nailstrip")).toBe(false));
    expect(row("nailstrip")).toEqual(BUFFED); // BUMP-1D: the shipped state (on) comes back with its patch
    withShapes2(() => inShapesWorld("bb-0.9.7", () => {
      expect(Object.prototype.hasOwnProperty.call(ITEMS, "nailstrip")).toBe(false);
    }));
    withShapes2(() => expect(row("nailstrip")).toEqual(BUFFED));
    expect(row("nailstrip")).toEqual(BUFFED);
    // the same round trip from the off world: both come back off, and the patch is not applied
    withShapes2(() => {
      inShapesWorld("bb-0.9.7", () => expect(Object.prototype.hasOwnProperty.call(ITEMS, "nailstrip")).toBe(false));
      expect(row("nailstrip")).toEqual(LIVE);
    }, false);
    expect(row("nailstrip")).toEqual(BUFFED);
  });
});

/** The cells as a picture of their bounding box ('#' a cell, '.' not), rows joined by '/', anchored at (x, y). */
function pic(cells: number[], x: number, y: number): string {
  const xs = cells.map((k) => (k % GRID) - x), ys = cells.map((k) => Math.floor(k / GRID) - y);
  expect(Math.min(...xs)).toBe(0); // the anchor is the bounding box's top-left
  expect(Math.min(...ys)).toBe(0);
  const w = Math.max(...xs) + 1, h = Math.max(...ys) + 1;
  const rows: string[] = [];
  for (let j = 0; j < h; j++) {
    let r = "";
    for (let i = 0; i < w; i++) r += cells.includes(K(x + i, y + j)) ? "#" : ".";
    rows.push(r);
  }
  return rows.join("/");
}

describe("SHAPES-2 S2: cells and arrows at every rot", () => {
  // clockwise quarter turns; a rare's II starts a quarter turn round (foot.ts footBaseTurn: its cells lie across its first arrow)
  const PICS: Record<string, [string, string, string, string]> = {
    elbowguard: ["#./##", "##/#.", "##/.#", ".#/##"],
    sawbar: ["###", "#/#/#", "###", "#/#/#"],
    sparkcomb: ["##", "#/#", "##", "#/#"],
    cinderhook: ["##/#.", "##/.#", ".#/##", "#./##"],
    jawcrusher: ["##/##", "##/##", "##/##", "##/##"],
    pickaxe: ["###/.#.", ".#/##/.#", ".#./###", "#./##/#."],
  };
  // the arrows' count (the same at every rot: the arrows turn with the cells) and the absolute directions at rot 0
  const ARROWS: Record<string, { n: number; dirs0: number[] }> = {
    elbowguard: { n: 2, dirs0: [0, 0] },
    sawbar: { n: 3, dirs0: [0, 0, 0] },
    sparkcomb: { n: 2, dirs0: [0, 0] },
    cinderhook: { n: 4, dirs0: [1, 1, 3, 3] },
    jawcrusher: { n: 4, dirs0: [1, 1, 3, 3] },
    pickaxe: { n: 7, dirs0: [0, 0, 0, 1, 1, 3, 3] },
  };

  for (const id of SIX) {
    it(`${id}: its cells at rot 0-3, the arrows from every outside edge`, () => {
      withShapes2(() => {
        const d = ITEMS[id];
        for (let rot = 0; rot < 4; rot++) {
          const cells = footprintCells(d, 3, 4, rot);
          expect(cells.length).toBe(PICS[id][0].replace(/[./]/g, "").length);
          expect(new Set(cells).size).toBe(cells.length);
          expect(pic(cells, 3, 4), `${id} rot ${rot}`).toBe(PICS[id][rot]);
          expect(footOnDeck(d, 3, 4, rot)).toBe(true);
          const { w, h } = footBox(d, rot);
          expect([w, h]).toEqual([PICS[id][rot].split("/")[0].length, PICS[id][rot].split("/").length]);
          // every arrow shines from a cell of the foot, at an outside edge, pointing the way the rig's arrows point
          const arr = rigArrowCells(id, 3, 4, rot);
          expect(arr.length, `${id} rot ${rot}: arrows`).toBe(ARROWS[id].n);
          const dirs = rigArrows(d, rot);
          for (const a of arr) {
            expect(cells).toContain(a.from);
            expect(dirs).toContain(a.dir);
            const dx = [0, 1, 0, -1][a.dir], dy = [-1, 0, 1, 0][a.dir];
            const to = K((a.from % GRID) + dx, Math.floor(a.from / GRID) + dy);
            expect(a.to).toBe(to);
            expect(cells, `${id} rot ${rot}: an arrow points out of the shape`).not.toContain(a.to);
          }
        }
        expect(rigArrowCells(id, 3, 4, 0).map((a) => a.dir)).toEqual(ARROWS[id].dirs0);
      });
    });
  }
});

/** A bare deck for the hit tests: belts as given (route factory uid 1, never checked by rigHits), items as given. */
function deck(routes: number[][], items: Placed[]): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
const hitsOf = (b: Build, uid: number) => rigHits(b).flat(2).filter((h) => h.uid === uid);
const cellsHit = (b: Build, uid: number) => hitsOf(b, uid).map((h) => h.cell).sort((a, c) => a - c);
/** The would-hit helper's cells at (x, y, rot) on `b` without the rig: the same cells as the placed rig's hits. */
const wouldCells = (b: Build, def: string, x: number, y: number, rot: number) => hitsIfPlaced(b, def, x, y, rot).map((w) => w.cell).sort((a, c) => a - c);

describe("SHAPES-2 S2: the hits on fixtures (rule set B, R2)", () => {
  it("ELBOW GUARD at a belt's corner hits 2 tiles (the L's two forward edges); on a straight belt 1; turned away, none", () => {
    withShapes2(() => {
      // the belt bends at (3,3): along y=3 to x=3, then down x=3; the rig's L fills the inside of the bend
      const bend = [K(1, 3), K(2, 3), K(3, 3), K(3, 4), K(4, 4)];
      const corner = deck([bend], [{ uid: 5, def: "elbowguard", x: 2, y: 4 }]); // rot 0: cells (2,4),(2,5),(3,5); arrows (2,3) and (3,4)
      const h = hitsOf(corner, 5);
      expect(h.map((q) => [q.cell, q.dir, q.from, q.tile])).toEqual([[K(2, 3), 0, K(2, 4), 1], [K(3, 4), 0, K(3, 5), 3]]);
      expect(h.every((q) => q.tier === 1)).toBe(true);
      // the same belt without the bend: a straight run along y=3 gives it 1 hit
      const straight = deck([row(3, 0, 7)], [{ uid: 5, def: "elbowguard", x: 2, y: 4 }]);
      expect(cellsHit(straight, 5)).toEqual([K(2, 3)]);
      // turned to point away (rot 2: arrows back, +y) it idles on that belt
      expect(hitsOf(deck([bend], [{ uid: 5, def: "elbowguard", x: 2, y: 4, rot: 2 }]), 5)).toEqual([]);
      // the helper the bots and the preview use agrees, at every rot
      const empty = deck([bend], []);
      for (let rot = 0; rot < 4; rot++) {
        const placed = deck([bend], [{ uid: 5, def: "elbowguard", x: 2, y: 4, ...(rot ? { rot } : {}) }]);
        expect(wouldCells(empty, "elbowguard", 2, 4, rot), `rot ${rot}`).toEqual(cellsHit(placed, 5));
      }
    });
  });

  it("SAW BAR along a straight run makes 3 hits, across its end 1, and an I3 never turns into more", () => {
    withShapes2(() => {
      const along = deck([row(3, 1, 7)], [{ uid: 6, def: "sawbar", x: 2, y: 4 }]); // rot 0: cells (2..4,4), arrows forward
      expect(cellsHit(along, 6)).toEqual([K(2, 3), K(3, 3), K(4, 3)]);
      expect(hitsOf(along, 6).map((h) => h.from)).toEqual([K(2, 4), K(3, 4), K(4, 4)]);
      // rot 1: the bar stands up the column x=0 (cells (0,3..5)); its arrows point +x at (1,3) only
      const across = deck([row(3, 1, 7)], [{ uid: 6, def: "sawbar", x: 0, y: 3, rot: 1 }]);
      expect(cellsHit(across, 6)).toEqual([K(1, 3)]);
      for (let rot = 0; rot < 4; rot++) {
        const empty = deck([row(3, 1, 7)], []);
        const placed = deck([row(3, 1, 7)], [{ uid: 6, def: "sawbar", x: 2, y: 4, ...(rot ? { rot } : {}) }]);
        expect(wouldCells(empty, "sawbar", 2, 4, rot), `rot ${rot}`).toEqual(cellsHit(placed, 6));
      }
    });
  });

  it("SPARK COMB along a belt makes 2 hits, like NAIL STRIP, and each hit carries the STUN stat", () => {
    withShapes2(() => {
      const b = deck([row(3, 1, 6)], [{ uid: 7, def: "sparkcomb", x: 2, y: 4 }]); // cells (2,4),(3,4)
      const h = hitsOf(b, 7);
      expect(h.map((q) => [q.cell, q.dir, q.from])).toEqual([[K(2, 3), 0, K(2, 4)], [K(3, 3), 0, K(3, 4)]]);
      expect(effectAt("sparkcomb", 1).gate?.stun).toBe(1);
    });
  });

  it("CINDER HOOK round a bend makes up to 4 hits (left and right from the L's outside edges)", () => {
    withShapes2(() => {
      // rot 0: cells (2,3),(3,3),(2,4); left arrows from (2,3),(2,4) -> (1,3),(1,4); right arrows from (3,3),(2,4) -> (4,3),(3,4)
      const left = col(1, 2, 6);
      const right = [K(4, 2), K(4, 3), K(4, 4), K(3, 4), K(3, 5)];
      const b = deck([left, right], [{ uid: 8, def: "cinderhook", x: 2, y: 3 }]);
      const h = hitsOf(b, 8);
      expect(h.length).toBe(4);
      expect(h.filter((q) => q.route === 0).map((q) => q.cell).sort((a, c) => a - c)).toEqual([K(1, 3), K(1, 4)]);
      expect(h.filter((q) => q.route === 1).map((q) => q.cell).sort((a, c) => a - c)).toEqual([K(4, 3), K(3, 4)]);
      expect(new Set(h.map((q) => q.dir))).toEqual(new Set([1, 3]));
      // with only one belt beside it, half
      expect(hitsOf(deck([left], [{ uid: 8, def: "cinderhook", x: 2, y: 3 }]), 8).length).toBe(2);
      // turned a quarter, the arrows point up and down: none on these belts
      expect(hitsOf(deck([left, right], [{ uid: 8, def: "cinderhook", x: 2, y: 3, rot: 1 }]), 8)).toEqual([]);
      for (let rot = 0; rot < 4; rot++) {
        const empty = deck([left, right], []);
        const placed = deck([left, right], [{ uid: 8, def: "cinderhook", x: 2, y: 3, ...(rot ? { rot } : {}) }]);
        expect(wouldCells(empty, "cinderhook", 2, 3, rot), `rot ${rot}`).toEqual(cellsHit(placed, 8));
      }
    });
  });

  it("JAW CRUSHER between two belts two cells apart makes 4 hits (2 on each); turned a quarter, none there", () => {
    withShapes2(() => {
      const b = deck([col(3, 2, 7), col(6, 2, 7)], [{ uid: 9, def: "jawcrusher", x: 4, y: 3 }]); // cells (4..5,3..4)
      const h = hitsOf(b, 9);
      expect(h.length).toBe(4);
      expect(h.filter((q) => q.route === 0).map((q) => q.cell)).toEqual([K(3, 3), K(3, 4)]);
      expect(h.filter((q) => q.route === 1).map((q) => q.cell)).toEqual([K(6, 3), K(6, 4)]);
      expect(new Set(h.map((q) => q.dir))).toEqual(new Set([1, 3]));
      // a 2x2 has the same cells at every rot; its arrows (left and right) turn to up and down at rot 1: none on these belts
      expect(hitsOf(deck([col(3, 2, 7), col(6, 2, 7)], [{ uid: 9, def: "jawcrusher", x: 4, y: 3, rot: 1 }]), 9)).toEqual([]);
      // beside one belt only, 2 hits
      expect(hitsOf(deck([col(3, 2, 7)], [{ uid: 9, def: "jawcrusher", x: 4, y: 3 }]), 9).length).toBe(2);
      for (let rot = 0; rot < 4; rot++) {
        const empty = deck([col(3, 2, 7), col(6, 2, 7)], []);
        const placed = deck([col(3, 2, 7), col(6, 2, 7)], [{ uid: 9, def: "jawcrusher", x: 4, y: 3, ...(rot ? { rot } : {}) }]);
        expect(wouldCells(empty, "jawcrusher", 4, 3, rot), `rot ${rot}`).toEqual(cellsHit(placed, 9));
      }
    });
  });

  it("PICKAXE with belt on three sides makes up to 7 hits (3 forward, 2 left, 2 right); each side alone gives its share", () => {
    withShapes2(() => {
      // rot 0: cells (4,4),(5,4),(6,4),(5,5); forward targets (4..6,3); left (3,4),(4,5); right (7,4),(6,5)
      const top = row(3, 2, 8);
      const leftBelt = [K(3, 4), K(3, 5), K(4, 5), K(4, 6)];
      const rightBelt = [K(7, 4), K(7, 5), K(6, 5), K(6, 6)];
      const all = deck([top, leftBelt, rightBelt], [{ uid: 10, def: "pickaxe", x: 4, y: 4 }]);
      const h = hitsOf(all, 10);
      expect(h.length).toBe(7);
      expect(h.filter((q) => q.dir === 0).length).toBe(3);
      expect(h.filter((q) => q.dir === 3).map((q) => q.cell).sort((a, c) => a - c)).toEqual([K(3, 4), K(4, 5)]);
      expect(h.filter((q) => q.dir === 1).map((q) => q.cell).sort((a, c) => a - c)).toEqual([K(7, 4), K(6, 5)]);
      expect(hitsOf(deck([top], [{ uid: 10, def: "pickaxe", x: 4, y: 4 }]), 10).length).toBe(3);
      expect(hitsOf(deck([leftBelt], [{ uid: 10, def: "pickaxe", x: 4, y: 4 }]), 10).length).toBe(2);
      for (let rot = 0; rot < 4; rot++) {
        const empty = deck([top, leftBelt, rightBelt], []);
        const placed = deck([top, leftBelt, rightBelt], [{ uid: 10, def: "pickaxe", x: 4, y: 4, ...(rot ? { rot } : {}) }]);
        expect(wouldCells(empty, "pickaxe", 4, 4, rot), `rot ${rot}`).toEqual(cellsHit(placed, 10));
      }
    });
  });

  it("an arrow that points at machinery idles (R5), and a rig standing on a belt tile makes no hits: for the six too", () => {
    withShapes2(() => {
      // PICKAXE beside a factory: the forward and left arrows still hit the belt; the right two point at machinery
      const top = row(3, 2, 8);
      const b = deck([top], [{ uid: 10, def: "pickaxe", x: 4, y: 4 }, { uid: 11, def: "press", x: 7, y: 4 }]);
      expect(hitsOf(b, 10).length).toBe(3);
      expect(rigArrowCells("pickaxe", 4, 4, 0).length).toBe(7);
      // a cell of the rig on a belt tile: no hits at all
      expect(hitsOf(deck([row(4, 3, 9)], [{ uid: 12, def: "sawbar", x: 4, y: 5 }, { uid: 10, def: "pickaxe", x: 4, y: 4 }]), 10)).toEqual([]);
    });
  });

  it("placement: OFF THE DECK, OCCUPIED and BELT IN THE WAY by the turned footprint", () => {
    withShapes2(() => {
      const b = deck([row(3, 1, 6)], [{ uid: 5, def: "whetstone", x: 2, y: 6 }]);
      expect(canPlaceItem(b, "pickaxe", 8, 5)).toEqual({ ok: false, reason: "OFF THE DECK" }); // 3 wide from x 8
      expect(canPlaceItem(b, "pickaxe", 8, 5, -1, 1)).toEqual({ ok: true }); // rot 1: 2 wide, 3 deep
      expect(canPlaceItem(b, "jawcrusher", 2, 5)).toEqual({ ok: false, reason: "OCCUPIED" }); // covers the WHETSTONE at (2,6)
      expect(canPlaceItem(b, "elbowguard", 5, 2)).toEqual({ ok: false, reason: "BELT IN THE WAY" }); // (5,3) is belt
      expect(canPlaceItem(b, "sawbar", 7, 3)).toEqual({ ok: true });
      expect(canPlaceItem(b, "sparkcomb", 9, 5)).toEqual({ ok: false, reason: "OFF THE DECK" }); // 2 wide from x 9
    });
  });
});

describe("SHAPES-2 S3: the pools, in both switch states", () => {
  it("off: no pool, merchant or LAST CHANCE card sees the six; on: each is in its rarity's catalogue and its merchant's stock", () => {
    // BUMP-1D: SHAPES2 ships on; the off world (what this test measured as shipped) is run explicitly, the shipped one checked after it
    withShapes2(() => {
      const off = ids(buyableModules());
      const lcOff = ids(lastChanceParts());
      const byMerchant = (m: MerchantId) => ids(itemsSoldBy(m));
      const stockOff = Object.fromEntries((["ironmonger", "tinker", "alchemist", "gunsmith", "scrapper", "quartermaster", "arcane"] as MerchantId[]).map((m) => [m, byMerchant(m)]));
      for (const id of SIX) expect(off, id).not.toContain(id);
      withShapes2(() => {
        const on = buyableModules();
        expect(ids(on)).toEqual(withSix(off)); // BUMP-1F (canonical order): was [...off, ...SIX]
        expect(on.filter((d) => SIX.includes(d.id)).map((d) => [d.id, d.rarity, d.kind])).toEqual([
          ["elbowguard", "common", "gate"], ["sawbar", "common", "gate"], ["sparkcomb", "common", "gate"],
          ["cinderhook", "rare", "gate"], ["jawcrusher", "rare", "gate"], ["pickaxe", "epic", "gate"],
        ]);
        for (const id of SIX) expect(byMerchant(ITEMS[id].merchant!), id).toContain(id);
        // every merchant's stock grows by exactly its own rigs
        for (const [m, list] of Object.entries(stockOff)) {
          const mine = SIX.filter((id) => ITEMS[id].merchant === m);
          expect(byMerchant(m as MerchantId), m).toEqual(withIds(list, mine)); // BUMP-1F (canonical order, the seven come after the six): was [...list, ...mine]
        }
        // PICKAXE is an epic rig: LAST CHANCE draws an epic part evenly from the catalogue, so it joins that list (and nothing else does)
        expect(ids(lastChanceParts())).toEqual(withIds(lcOff, ["pickaxe"])); // BUMP-1F (canonical order, TROPHY CHAIN (an epic rig of the seven) comes after the six): was [...lcOff, "pickaxe"]
      });
      expect(ids(buyableModules())).toEqual(off);
      expect(ids(lastChanceParts())).toEqual(lcOff);
    }, false);
    // BUMP-1D: the shipped world has the six in every pool
    for (const id of SIX) {
      expect(ids(buyableModules()), id).toContain(id);
      expect(ids(itemsSoldBy(ITEMS[id].merchant!)), id).toContain(id);
    }
    expect(ids(lastChanceParts())).toContain("pickaxe");
  });

  it("with SHAPES2 on the catalogue grows by six (and by twelve with PLAIN_RIGS on too); the per-run draw stays DRAW.active (REQ-BFG-022)", () => {
    // BUMP-1D: both ship on, so the catalogue before the twelve (n0) is measured with both off, explicitly. Measured at BUMP-1D (bb-0.11.0):
    // 91 buyable parts before the twelve, 97 with the six shaped rigs, 103 with both (the shipped catalogue)
    // BUMP-1E: SCALE_RIGS ships on and its seven rigs are buyable (they stay in ITEMS while the twelve's two switches are off), so n0 reads 98 (was 91:
    // +7 = SCALE_IDS), 104 with the six, 110 with both (was 103: the shipped catalogue; tests/families pins the same 103 -> 110). The 0.9.11 numbers
    // (91, 97, 103) are read below with the scaling switch off, as the OUTERMOST call of the nest (it goes off first and comes back last: ITEMS' key order)
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the scaling rules ship on
    const n0 = withShapes2(() => withPlainRigs(() => buyableModules().length, false), false);
    expect(n0).toBe(98); // BUMP-1E: was 91
    const [old0, old6, old12] = withScaleRigs(() => [
      withShapes2(() => withPlainRigs(() => buyableModules().length, false), false),
      withPlainRigs(() => withShapes2(() => buyableModules().length), false),
      buyableModules().length,
    ], false);
    expect([old0, old6, old12]).toEqual([91, 97, 103]); // BUMP-1E: the 0.9.11 catalogue, as BUMP-1D measured it
    expect(n0 - old0).toBe(SCALE_IDS.length); // the seven are the whole difference
    const sizes = (runs: number) => {
      let total = 0, min = 99, max = 0;
      for (let s = 1; s <= runs; s++) {
        const k = Object.keys(drawWares(s)).length;
        total += k; min = Math.min(min, k); max = Math.max(max, k);
      }
      return { mean: total / runs, min, max };
    };
    const off = withShapes2(() => withPlainRigs(() => sizes(120), false), false);
    const on = withPlainRigs(() => withShapes2(() => {
      expect(buyableModules().length).toBe(n0 + 6);
      return sizes(120);
    }), false);
    const both = withPlainRigs(() => withShapes2(() => {
      expect(buyableModules().length).toBe(n0 + 12);
      return sizes(120);
    }));
    // BUMP-1D: and the shipped catalogue is n0 + 12 = 103 buyable parts (both ship on)
    expect(buyableModules().length).toBe(n0 + 12);
    expect(buyableModules().length).toBe(110); // BUMP-1E: was 103 (+7: the scaling rigs)
    console.log(`SHAPES-2 POOL draw off ${JSON.stringify(off)} on ${JSON.stringify(on)} both ${JSON.stringify(both)} (catalogue ${n0})`);
    for (const s of [off, on, both]) {
      expect(s.mean).toBeGreaterThanOrEqual(DRAW.active);
      expect(s.mean).toBeLessThanOrEqual(70);
      expect(s.min).toBeGreaterThanOrEqual(55);
    }
    expect(on.mean - off.mean).toBeLessThan(1); // the draw's size doesn't grow with the catalogue
  });
});

describe("SHAPES-2 S1: merge, sell and the multiplying guard", () => {
  it("they merge like any rig and sell at sellValue: price x 2^(stars-1) / 2", () => {
    withShapes2(() => {
      expect([1, 2, 3].map((s) => sellValue("elbowguard", s))).toEqual([2, 4, 8]);
      expect([1, 2, 3].map((s) => sellValue("sawbar", s))).toEqual([2, 5, 10]);
      expect([1, 2, 3].map((s) => sellValue("sparkcomb", s))).toEqual([2, 5, 10]);
      expect([1, 2, 3].map((s) => sellValue("cinderhook", s))).toEqual([3, 6, 12]);
      expect([1, 2, 3].map((s) => sellValue("jawcrusher", s))).toEqual([3, 6, 12]);
      expect([1, 2, 3].map((s) => sellValue("pickaxe", s))).toEqual([4, 8, 16]);
      expect([1, 2, 3].map((s) => valueOf("pickaxe", s))).toEqual([8, 16, 32]);
    });
  });

  for (const on of [false, true]) {
    it(`SHAPES2 ${on ? "on" : "off"}: SPLITTER, SORTING ARM, OVERCLOCKER, LONG HAUL and PINCER are 1 cell; the long rigs are exactly the shaped ones`, () => {
      withShapes2(() => {
        const MULTIPLYING = ["splitter", "sorting", "overclocker", "longhaul", "pincer"];
        expect(MULTIPLYING.map((id) => ITEMS[id].name)).toEqual(["SPLITTER", "SORTING ARM", "OVERCLOCKER", "LONG HAUL", "PINCER"]);
        for (const id of MULTIPLYING) expect(footOf(ITEMS[id]), id).toBe("1");
        for (const id of SIX) if (on) expect(MULTIPLYING).not.toContain(id);
        const rigs = Object.values(ITEMS).filter((d) => d.kind === "gate");
        const long = rigs.filter((d) => footOf(d) !== "1").map((d) => d.id);
        expect(long).toEqual(on ? [...SHAPES_IDS, ...SIX] : [...SHAPES_IDS]);
        for (const d of rigs) if (!SHAPES_IDS.includes(d.id) && !SIX.includes(d.id)) expect(d.foot, d.id).toBeUndefined();
        expect(shapesRules()).toBe(true);
      }, on);
    });
  }
});

describe("SHAPES-2 S1: SHAPES2_RULES and the validator's verdicts", () => {
  const deckWith = (def: string) => ({ items: [{ uid: 1, def, x: 0, y: 1 }] });

  it("SHAPES2_RULES is today's rules written as a literal (BUMP-1D writes 1D's); SHAPES_RULES's form", () => {
    // BUMP-1D: SHAPES2_RULES is 1D's bb-0.11.0 (was bb-0.10.0 = RULES_VERSION = SHAPES_RULES); SHAPES_RULES stays SHAPES-1's literal
    expect(SHAPES2_RULES).toBe("bb-0.11.0");
    // BUMP-1E: was expect(SHAPES2_RULES).toBe(RULES_VERSION) (both bb-0.11.0). SHAPES2_RULES is a literal gate (the rules that brought the six) and stays
    // bb-0.11.0; this build's rules are bb-0.12.0 (content.ts RULES_VERSION), the version after it, so they have the six
    expect(RULES_VERSION).toBe("bb-0.16.0"); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: label bb-0.12.0 -> bb-0.13.0): was bb-0.12.0
    expect(SHAPES2_RULES).not.toBe(RULES_VERSION);
    expect(rulesAtLeast(RULES_VERSION, SHAPES2_RULES)).toBe(true);
    expect(SHAPES_RULES).toBe("bb-0.10.0");
    expect(SHAPES2_RULES).not.toBe(SHAPES_RULES);
  });

  it("the six travel only with SHAPES2 on and under rules that have them (shapes2GateProblem, shapes2World)", () => {
    const d = deckWith("pickaxe");
    const SIX_WORDS = "shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE)";
    expect(shapes2Features(d)).toEqual([SIX_WORDS]);
    expect(shapes2Features(deckWith("nailstrip"))).toEqual([]); // SHAPES-1's three are SHAPES_RULES' business
    expect(shapes2Features({ items: [] })).toEqual([]);
    expect(shapes2Features(null)).toEqual([]);
    // BUMP-1D: SHAPES2 ships on; the switch-off verdicts (what this test measured as shipped) run in the off world, explicitly
    withShapes2(() => {
      expect(shapes2GateProblem(RULES_VERSION, d)).toBe(`${SIX_WORDS}: not in this rules version yet`);
      expect(shapes2GateProblem(RULES_VERSION, { items: [] })).toBeNull();
    }, false);
    // BUMP-1D: the shipped world takes the six under this build's rules and refuses them under the ones before (bb-0.10.0 is the new edge)
    expect(shapes2GateProblem(RULES_VERSION, d)).toBeNull();
    expect(shapes2GateProblem("bb-0.10.0", d)).toBe(`rules bb-0.10.0 predate ${SHAPES2_RULES}: ${SIX_WORDS} need ${SHAPES2_RULES} or later`);
    expect([shapes2World(RULES_VERSION), shapes2World("bb-0.10.0")]).toEqual([true, false]);
    withShapes2(() => {
      expect(shapes2GateProblem(RULES_VERSION, d)).toBeNull();
      expect(shapes2GateProblem("bb-0.9.7", d)).toBe(`rules bb-0.9.7 predate ${SHAPES2_RULES}: shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE) need ${SHAPES2_RULES} or later`);
      expect(shapes2GateProblem("bb-0.10.0", d)).toBe(`rules bb-0.10.0 predate ${SHAPES2_RULES}: ${SIX_WORDS} need ${SHAPES2_RULES} or later`);
      expect(shapes2GateProblem("nonsense", d)).toContain("is not a bb-MAJOR.MINOR.PATCH version");
      expect([shapes2World(RULES_VERSION), shapes2World("bb-0.10.0"), shapes2World("bb-0.9.7"), shapes2World("nonsense")]).toEqual([true, false, false, false]);
      expect(inShapes2World("bb-0.9.7", () => shapes2Rules())).toBe(false);
      expect(inShapes2World("bb-0.10.0", () => shapes2Rules())).toBe(false); // BUMP-1D: a bb-0.10.0 record is judged without the six
      expect(inShapes2World(RULES_VERSION, () => shapes2Rules())).toBe(true);
      expect(shapes2Rules()).toBe(true);
      // inShapesWorld: a record from before SHAPES_RULES is judged in 0.9.9's world, SHAPES and SHAPES2 both off (and back on after)
      expect(inShapesWorld("bb-0.9.7", () => [shapesRules(), shapes2Rules(), Object.prototype.hasOwnProperty.call(ITEMS, "pickaxe")])).toEqual([false, false, false]);
      expect(inShapesWorld(RULES_VERSION, () => [shapesRules(), shapes2Rules()])).toEqual([true, true]);
      expect([shapesRules(), shapes2Rules()]).toEqual([true, true]);
      expect(Object.keys(ITEMS).slice(-(6 + SCALE_IDS.length), -SCALE_IDS.length)).toEqual(SIX); // and ITEMS keeps its order through the swap (BUMP-1F, canonical order: the seven stand behind the six; was .slice(-6))
    });
    expect(withShapes2(() => shapes2World(RULES_VERSION), false)).toBe(false);
  });

  it("validateUpload: the rules gate speaks first (switch off, older rules); with the switch on and this build's rules the footprint is judged", () => {
    const start = withShapes2(() => heroStartBuild("furnace", 1)); // the hero's starting deck: a kiln at 4,6 and its belt
    const mk = (def: string, x: number, y: number, rot = 0): Build => ({ ...start, items: [...start.items, { uid: 900, def, x, y, ...(rot ? { rot } : {}) }] });
    const holding = mk("pickaxe", 0, 1);
    // off: refused first by the rules gate, whatever the rules (BUMP-1D: SHAPES2 ships on, so the off world is explicit)
    withShapes2(() => {
      for (const rules of [RULES_VERSION, "bb-0.10.0", "bb-0.9.7"]) {
        const off = validateUpload(holding, 3, rules);
        expect(off.ok).toBe(false);
        expect(off.errors[0]).toBe("rules: shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE): not in this rules version yet");
      }
    }, false);
    withShapes2(() => {
      // on, under older rules: refused with both versions named
      const old = validateUpload(holding, 3, "bb-0.9.7");
      expect(old.ok).toBe(false);
      expect(old.errors[0]).toBe(`rules: rules bb-0.9.7 predate ${SHAPES2_RULES}: shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE) need ${SHAPES2_RULES} or later`);
      // BUMP-1D: and under the last release's rules (bb-0.10.0), which had no six
      const prev = validateUpload(holding, 3, "bb-0.10.0");
      expect(prev.ok).toBe(false);
      expect(prev.errors[0]).toBe(`rules: rules bb-0.10.0 predate ${SHAPES2_RULES}: shaped rigs (ELBOW GUARD, SAW BAR, SPARK COMB, CINDER HOOK, JAW CRUSHER, PICKAXE) need ${SHAPES2_RULES} or later`);
      // on, under this build's rules: the gate says nothing (the deck stops at the rune check, a later rule: none held on day 3)
      const ok = validateUpload(holding, 3, RULES_VERSION);
      expect(ok.errors.some((e) => e.startsWith("rules:"))).toBe(false);
      // the footprint, judged on its turned cells (strict mode skips the upload-only blocks)
      expect(validateBuild(holding, 3, "strict")).toEqual({ ok: true, errors: [] });
      for (const rot of [0, 1, 2, 3]) expect(validateBuild(mk("elbowguard", 0, 1, rot), 3, "strict").ok, `ELBOW GUARD rot ${rot}`).toBe(true);
      expect(validateBuild(mk("pickaxe", GRID - 2, 3), 3, "strict").errors).toEqual([`placement: uid 900 PICKAXE at ${GRID - 2},3: OFF THE DECK`]);
      expect(validateBuild(mk("pickaxe", GRID - 2, 3, 1), 3, "strict").ok).toBe(true); // turned, it is 2 wide
      expect(validateBuild(mk("jawcrusher", 4, 6), 3, "strict").errors.length).toBe(4); // a 2x2 on the kiln's four cells: one error a cell
      expect(validateBuild(mk("elbowguard", 0, 1, 4), 3, "strict").errors[0]).toContain("rot: expected an integer in 0..3");
    });
  });
});
