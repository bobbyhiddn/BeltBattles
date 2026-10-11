// SHAPES-1 (REQ-BFG-086 R1-R3, S1; BRIEF-SHAPES1 step 2): the footprint engine and the SHAPES switch.
// - footprintCells for all nine FootIds at every rot (pictures), the bounding-box anchor and the rig's base turn;
// - the canonical rot (a factory's lowest form; a rig's 0-3) and rotField;
// - the per-cell hits (rule set B): an I2 along a belt makes 2, across it 1; SPIKE RAIL between two belts makes 6; an
//   arrow at machinery idles; a 1-cell rig is exactly 0.9.9's hit (no `from`);
// - the belt-slot rule (every 2 cells beyond 4: a 2x3 +1, a 3x3 +2) and the start cells beside a footprint;
// - the multiplying-rig guard: SPLITTER, SORTING ARM, OVERCLOCKER, LONG HAUL and PINCER never get a multi-cell foot, and
//   every existing rig stays 1 cell;
// - the switch: off by default, nothing sees the three rigs, GANTRY PRESS and ASSEMBLY LINE keep 2x2 and their price; on,
//   the pieces of R4; withShapes puts it back.
import { describe, expect, it } from "vitest";
import { GRID, ITEMS, type ItemDef } from "../src/sim/content";
import {
  adjacentToFactory, canPlaceItem, footprint, key as K, rigArrowCells, rigHits, rotField, type Build, type Placed,
} from "../src/sim/deck";
import {
  FOOT_CELLS, FOOT_IDS, canonicalRot, footBox, footOf, footOnDeck, footprintCells, footSlots, footTurns, type FootId,
} from "../src/sim/foot";
import { RESHAPED_IDS, SHAPES, SHAPES_IDS, SHAPES_ITEMS, setShapes, shapesRules, withShapes } from "../src/sim/shapes";
import { hitsIfPlaced } from "../src/sim/beltside";
import { outputsAt } from "../src/sim/stars";

/** A def with `foot`, as a factory (no base turn) or as a common rig (one arrow forward, no base turn). */
const factoryWith = (foot: FootId): ItemDef => ({ ...ITEMS.press, foot });
const rigWith = (foot: FootId): ItemDef => ({ ...ITEMS.whetstone, foot });

/** The cells as a picture of their bounding box ('#' a cell, '.' not), rows joined by '/', anchored at (x, y). */
function pic(cells: number[], x: number, y: number): string {
  const xs = cells.map((k) => k % GRID - x), ys = cells.map((k) => Math.floor(k / GRID) - y);
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

describe("SHAPES-1 R1: footprintCells for the nine FootIds", () => {
  // clockwise quarter turns (direction 0 forward = -y turns to 1 = +x), bounding box at the anchor
  const PICS: Record<FootId, [string, string, string, string]> = {
    "1": ["#", "#", "#", "#"],
    I2: ["##", "#/#", "##", "#/#"],
    I3: ["###", "#/#/#", "###", "#/#/#"],
    L3: ["#./##", "##/#.", "##/.#", ".#/##"],
    T4: ["###/.#.", ".#/##/.#", ".#./###", "#./##/#."],
    L4: ["#./#./##", "###/#..", "##/.#/.#", "..#/###"],
    "2x2": ["##/##", "##/##", "##/##", "##/##"],
    "2x3": ["###/###", "##/##/##", "###/###", "##/##/##"],
    "3x3": ["###/###/###", "###/###/###", "###/###/###", "###/###/###"],
  };

  it("covers all nine, each with its cell count, at every rot (a factory: no base turn)", () => {
    expect(FOOT_IDS).toEqual(["1", "I2", "I3", "L3", "T4", "L4", "2x2", "2x3", "3x3"]);
    for (const f of FOOT_IDS) {
      for (let rot = 0; rot < 4; rot++) {
        const cells = footprintCells(factoryWith(f), 3, 4, rot);
        expect(cells.length, `${f} rot ${rot}`).toBe(FOOT_CELLS[f].length);
        expect(new Set(cells).size).toBe(cells.length);
        expect(pic(cells, 3, 4), `${f} rot ${rot}`).toBe(PICS[f][rot]);
        expect([...cells].sort((a, b) => a - b), `${f} rot ${rot}: row by row`).toEqual(cells);
        const { w, h } = footBox(factoryWith(f), rot);
        expect(pic(cells, 3, 4).split("/").length).toBe(h);
        expect(pic(cells, 3, 4).split("/")[0].length).toBe(w);
      }
      // a quarter turn more than 3 wraps; negative and fractional turns floor
      expect(footprintCells(factoryWith(f), 3, 4, 5)).toEqual(footprintCells(factoryWith(f), 3, 4, 1));
      expect(footprintCells(factoryWith(f), 3, 4, -1)).toEqual(footprintCells(factoryWith(f), 3, 4, 3));
    }
  });

  it("the turns that differ: 1 (1, 2x2, 3x3), 2 (I2, I3, 2x3), 4 (L3, T4, L4)", () => {
    expect(Object.fromEntries(FOOT_IDS.map((f) => [f, footTurns(f)]))).toEqual({
      "1": 1, I2: 2, I3: 2, L3: 4, T4: 4, L4: 4, "2x2": 1, "2x3": 2, "3x3": 1,
    });
  });

  it("a 1-cell piece and a 2x2 give 0.9.9's cells in 0.9.9's order (footprint() = footprintCells)", () => {
    for (let rot = 0; rot < 4; rot++) {
      expect(footprintCells(ITEMS.whetstone, 4, 6, rot)).toEqual([K(4, 6)]);
      expect(footprintCells(ITEMS.kiln, 2, 3, rot)).toEqual([K(2, 3), K(3, 3), K(2, 4), K(3, 4)]);
      expect(footprint(ITEMS.kiln, 2, 3, rot)).toEqual(footprintCells(ITEMS.kiln, 2, 3, rot));
    }
    expect(footOf(ITEMS.whetstone)).toBe("1");
    expect(footOf(ITEMS.kiln)).toBe("2x2");
  });

  it("a rig's foot lies across its first arrow at rot 0: I (forward) along x, II (left and right) along y", () => {
    expect(pic(footprintCells(rigWith("I2"), 2, 2, 0), 2, 2)).toBe("##");
    expect(pic(footprintCells(rigWith("I2"), 2, 2, 1), 2, 2)).toBe("#/#");
    const rare = { ...ITEMS.whetstone, rarity: "rare", foot: "I3" } as ItemDef; // the rare's II: left and right
    expect(pic(footprintCells(rare, 2, 2, 0), 2, 2)).toBe("#/#/#");
    expect(pic(footprintCells(rare, 2, 2, 1), 2, 2)).toBe("###");
  });

  it("footOnDeck: every cell on the deck", () => {
    const g = factoryWith("2x3");
    expect(footOnDeck(g, 7, 8, 0)).toBe(true); // 3 wide, 2 deep: x 7-9, y 8-9
    expect(footOnDeck(g, 8, 8, 0)).toBe(false);
    expect(footOnDeck(g, 8, 7, 1)).toBe(true); // 2 wide, 3 deep
    expect(footOnDeck(g, 8, 8, 1)).toBe(false);
    expect(footOnDeck(g, -1, 0, 0)).toBe(false);
  });
});

describe("SHAPES-1 R1: the rot rule", () => {
  it("a factory's rot is its lowest form: 2x3 and I3 0 or 1, a 2x2 0, an L3 0-3", () => {
    const rots = (f: FootId) => [0, 1, 2, 3].map((r) => canonicalRot(factoryWith(f), r));
    expect(rots("2x2")).toEqual([0, 0, 0, 0]);
    expect(rots("2x3")).toEqual([0, 1, 0, 1]);
    expect(rots("I3")).toEqual([0, 1, 0, 1]);
    expect(rots("L3")).toEqual([0, 1, 2, 3]);
    expect(rots("3x3")).toEqual([0, 0, 0, 0]);
  });

  it("a rig keeps 0-3 (its arrows turn), an X rig of one cell 0; rotField writes no 0", () => {
    for (let r = 0; r < 4; r++) expect(canonicalRot(rigWith("I2"), r)).toBe(r);
    expect([0, 1, 2, 3].map((r) => canonicalRot(ITEMS.whetstone, r))).toEqual([0, 1, 2, 3]);
    expect(rotField("whetstone", 0)).toEqual({});
    expect(rotField("whetstone", 3)).toEqual({ rot: 3 });
    expect(rotField("kiln", 1)).toEqual({}); // a 2x2: no rot
    withShapes(() => {
      expect(rotField("gantry", 1)).toEqual({ rot: 1 });
      expect(rotField("gantry", 2)).toEqual({});
      expect(rotField("gantry", 3)).toEqual({ rot: 1 });
      expect(rotField("assembly", 1)).toEqual({ rot: 1 });
      expect(rotField("spikerail", 2)).toEqual({ rot: 2 });
    });
    expect(rotField("gantry", 1)).toEqual({}); // switch off: 2x2
  });
});

/** A bare deck for the hit tests: belts as given (route factory uid 1, never checked by rigHits), items as given. */
function deck(routes: number[][], items: Placed[]): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 8, y: 8 }, ...items], routes: routes.map((cells) => ({ factory: 1, cells })), mods: [], beltCap: 99, hullBonus: 0 };
}
const row = (y: number, x0: number, x1: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => K(x0 + i, y));
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => K(x, y0 + i));
const hitsOf = (b: Build, uid: number) => rigHits(b).flat(2).filter((h) => h.uid === uid);

describe("SHAPES-1 R2: the per-cell hits (rule set B)", () => {
  it("NAIL STRIP along a belt makes 2 hits, across its end 1; each hit names the cell it shines from", () => {
    withShapes(() => {
      const along = deck([row(3, 1, 6)], [{ uid: 5, def: "nailstrip", x: 2, y: 4 }]); // rot 0: cells (2,4),(3,4), arrow forward
      const a = hitsOf(along, 5);
      expect(a.map((h) => [h.cell, h.dir, h.from, h.tile])).toEqual([[K(2, 3), 0, K(2, 4), 1], [K(3, 3), 0, K(3, 4), 2]]);
      const across = deck([row(3, 1, 6)], [{ uid: 5, def: "nailstrip", x: 0, y: 3, rot: 1 }]); // cells (0,3),(0,4), arrows +x
      expect(hitsOf(across, 5).map((h) => [h.cell, h.dir, h.from])).toEqual([[K(1, 3), 1, K(0, 3)]]);
      // turned to point away (rot 2: arrows back) it idles
      expect(hitsOf(deck([row(3, 1, 6)], [{ uid: 5, def: "nailstrip", x: 2, y: 4, rot: 2 }]), 5)).toEqual([]);
    });
  });

  it("SPIKE RAIL between two straight belts one cell apart makes 6 hits (3 on each); turned a quarter, none there", () => {
    withShapes(() => {
      const b = deck([col(3, 2, 7), col(5, 2, 7)], [{ uid: 7, def: "spikerail", x: 4, y: 3 }]); // rot 0: (4,3)-(4,5)
      const h = hitsOf(b, 7);
      expect(h.length).toBe(6);
      expect(h.filter((q) => q.route === 0).map((q) => q.cell)).toEqual([K(3, 3), K(3, 4), K(3, 5)]);
      expect(h.filter((q) => q.route === 1).map((q) => q.cell)).toEqual([K(5, 3), K(5, 4), K(5, 5)]);
      expect(new Set(h.map((q) => q.dir))).toEqual(new Set([1, 3]));
      // rot 1: lying along x at (2..4, 0)? it would stand on a belt; at (6,3)-(8,3) its arrows point up and down: 0 hits
      expect(hitsOf(deck([col(3, 2, 7), col(5, 2, 7)], [{ uid: 7, def: "spikerail", x: 6, y: 3, rot: 1 }]), 7)).toEqual([]);
      // the would-hit helper (the bots' and the preview's) agrees, cell by cell
      const would = hitsIfPlaced(deck([col(3, 2, 7), col(5, 2, 7)], []), "spikerail", 4, 3, 0);
      expect(would.map((w) => w.cell).sort((x, y) => x - y)).toEqual(h.map((q) => q.cell).sort((x, y) => x - y));
    });
  });

  it("an arrow that points at machinery idles (R5): SPIKE RAIL beside a factory hits only the belt side", () => {
    withShapes(() => {
      const b = deck([col(3, 2, 7)], [{ uid: 9, def: "press", x: 5, y: 3 }, { uid: 7, def: "spikerail", x: 4, y: 3 }]);
      expect(hitsOf(b, 7).map((q) => q.cell)).toEqual([K(3, 3), K(3, 4), K(3, 5)]);
      expect(rigArrowCells("spikerail", 4, 3, 0).length).toBe(6); // 6 arrows, 3 of them idle
    });
  });

  it("a rig standing on a belt tile makes no hits, whichever cell stands there", () => {
    withShapes(() => {
      expect(hitsOf(deck([row(3, 1, 6)], [{ uid: 5, def: "nailstrip", x: 0, y: 3 }]), 5)).toEqual([]); // (1,3) is belt
    });
  });

  it("a 1-cell rig is exactly 0.9.9's rule: one arrow per direction from its cell, no `from` on its hits", () => {
    const b = deck([row(3, 1, 6), row(5, 1, 6)], [{ uid: 4, def: "longhaul", x: 3, y: 4 }]); // a rare: II
    const h = hitsOf(b, 4);
    expect(h.every((q) => !("from" in q))).toBe(true);
    expect(rigArrowCells("whetstone", 3, 4, 1)).toEqual([{ from: K(3, 4), dir: 1, to: K(4, 4) }]);
    const w = deck([row(3, 1, 6)], [{ uid: 6, def: "whetstone", x: 2, y: 4 }]);
    expect(hitsOf(w, 6)).toEqual([{ uid: 6, def: "whetstone", dir: 0, route: 0, tile: 1, cell: K(2, 3), tier: 1 }]);
  });
});

describe("SHAPES-1 R3: the belt-slot rule and the start cells", () => {
  it("every 2 cells beyond 4 add a slot: 2x3 +1, 3x3 +2, the rest +0", () => {
    expect(Object.fromEntries(FOOT_IDS.map((f) => [f, footSlots(factoryWith(f))]))).toEqual({
      "1": 0, I2: 0, I3: 0, L3: 0, T4: 0, L4: 0, "2x2": 0, "2x3": 1, "3x3": 2,
    });
  });

  it("GANTRY PRESS 3/4/5 slots off, 4/5/6 on (2x3); ASSEMBLY LINE 2/3/4 both ways (a SMALL factory keeps its slots)", () => {
    expect([1, 2, 3].map((s) => outputsAt("gantry", s))).toEqual([3, 4, 5]);
    expect([1, 2, 3].map((s) => outputsAt("assembly", s))).toEqual([2, 3, 4]);
    withShapes(() => {
      expect([1, 2, 3].map((s) => outputsAt("gantry", s))).toEqual([4, 5, 6]);
      expect([1, 2, 3].map((s) => outputsAt("assembly", s))).toEqual([2, 3, 4]);
    });
  });

  it("belts start from any free cell beside the footprint: a 2x2 has 8, a 2x3 10, an I3 8", () => {
    const starts = (def: string, rot = 0) => {
      const b: Build = { hero: "furnace", items: [{ uid: 3, def, x: 3, y: 4, ...rotField(def, rot) }], routes: [], mods: [], beltCap: 20, hullBonus: 0 };
      let n = 0;
      for (let k = 0; k < GRID * GRID; k++) if (adjacentToFactory(b, 3, k) >= 0) n++;
      return n;
    };
    expect(starts("press")).toBe(8);
    withShapes(() => {
      expect(starts("gantry")).toBe(10);
      expect(starts("gantry", 1)).toBe(10);
      expect(starts("assembly")).toBe(8);
      expect(starts("assembly", 1)).toBe(8);
    });
  });
});

describe("SHAPES-1 R2 guard: no long multiplying rig; every existing rig stays 1 cell", () => {
  const MULTIPLYING = ["splitter", "sorting", "overclocker", "longhaul", "pincer"];
  for (const on of [false, true]) {
    it(`SHAPES ${on ? "on" : "off"}: SPLITTER, SORTING ARM, OVERCLOCKER, LONG HAUL and PINCER are 1 cell; so is every rig but the three`, () => {
      withShapes(() => {
        expect(MULTIPLYING.map((id) => ITEMS[id].name)).toEqual(["SPLITTER", "SORTING ARM", "OVERCLOCKER", "LONG HAUL", "PINCER"]);
        for (const id of MULTIPLYING) expect(footOf(ITEMS[id]), id).toBe("1");
        const rigs = Object.values(ITEMS).filter((d) => d.kind === "gate");
        const long = rigs.filter((d) => footOf(d) !== "1").map((d) => d.id);
        expect(long).toEqual(on ? ["nailstrip", "embertrough", "spikerail"] : []);
        for (const d of rigs) if (!SHAPES_IDS.includes(d.id)) expect(d.foot, d.id).toBeUndefined();
      }, on);
    });
  }
});

describe("SHAPES-1 S1: the switch", () => {
  it("SHAPES is off by default and nothing sees the pieces", () => {
    expect(SHAPES).toBe(false);
    expect(shapesRules()).toBe(false);
    for (const id of SHAPES_IDS) expect(Object.prototype.hasOwnProperty.call(ITEMS, id), id).toBe(false);
    expect(ITEMS.gantry.foot).toBeUndefined();
    expect(ITEMS.assembly.foot).toBeUndefined();
    expect([ITEMS.gantry.price, ITEMS.assembly.price]).toEqual([7, 5]);
    expect(RESHAPED_IDS).toEqual(["gantry", "assembly"]);
  });

  it("on: the three rigs join ITEMS after every other def, GANTRY PRESS is 2x3, ASSEMBLY LINE I3 at 1 G less; off again: as before", () => {
    const keys0 = Object.keys(ITEMS), gantry0 = ITEMS.gantry, assembly0 = ITEMS.assembly;
    withShapes(() => {
      expect(shapesRules()).toBe(true);
      expect(Object.keys(ITEMS)).toEqual([...keys0, "nailstrip", "embertrough", "spikerail"]);
      expect(ITEMS.nailstrip).toBe(SHAPES_ITEMS.nailstrip);
      expect(ITEMS.gantry).toEqual({ ...gantry0, foot: "2x3" });
      expect(ITEMS.assembly).toEqual({ ...assembly0, foot: "I3", price: 4 });
      expect(footprintCells(ITEMS.gantry, 0, 1).length).toBe(6);
    });
    expect(shapesRules()).toBe(false);
    expect(Object.keys(ITEMS)).toEqual(keys0);
    expect(ITEMS.gantry).toBe(gantry0);
    expect(ITEMS.assembly).toBe(assembly0);
  });

  it("withShapes puts the switch back even on a throw; setShapes to the state it has does nothing", () => {
    expect(() => withShapes(() => { throw new Error("x"); })).toThrow("x");
    expect(shapesRules()).toBe(false);
    setShapes(false);
    expect(shapesRules()).toBe(false);
  });

  it("R4's numbers: the three rigs' rarity, price, foot, arrows and star rows", () => {
    const row3 = (id: string) => [SHAPES_ITEMS[id].gate, SHAPES_ITEMS[id].levels?.[2]?.gate, SHAPES_ITEMS[id].levels?.[3]?.gate];
    expect(["nailstrip", "embertrough", "spikerail"].map((id) => [SHAPES_ITEMS[id].name, SHAPES_ITEMS[id].rarity, SHAPES_ITEMS[id].price, SHAPES_ITEMS[id].foot])).toEqual([
      ["NAIL STRIP", "common", 4, "I2"], ["EMBER TROUGH", "common", 4, "I2"], ["SPIKE RAIL", "rare", 6, "I3"],
    ]);
    expect(row3("nailstrip")).toEqual([{ flat: 12 }, { flat: 25 }, { flat: 40 }]);
    expect(row3("embertrough")).toEqual([{ burn: 1 }, { burn: 2 }, { burn: 3 }]);
    expect(row3("spikerail")).toEqual([{ flat: 10 }, { flat: 20 }, { flat: 35 }]);
    withShapes(() => {
      expect(rigArrowCells("nailstrip", 0, 5, 0).map((a) => a.dir)).toEqual([0, 0]); // one arrow, forward, from each cell
      expect(rigArrowCells("spikerail", 0, 5, 0).map((a) => a.dir)).toEqual([1, 1, 1, 3, 3, 3]); // left and right
      expect(SHAPES_IDS.every((id) => ITEMS[id].desc.length === 0)).toBe(true); // plain: no ability line
    });
  });
});

describe("SHAPES-1 R1: placement checks on the turned footprint", () => {
  it("canPlaceItem: OFF THE DECK, OCCUPIED and BELT IN THE WAY by footprintCells at its rot", () => {
    withShapes(() => {
      const b = deck([row(3, 1, 6)], [{ uid: 5, def: "whetstone", x: 2, y: 6 }]);
      expect(canPlaceItem(b, "gantry", 8, 5)).toEqual({ ok: false, reason: "OFF THE DECK" }); // 3 wide from x 8
      expect(canPlaceItem(b, "gantry", 8, 5, -1, 1)).toEqual({ ok: true }); // 2 wide, 3 deep
      expect(canPlaceItem(b, "gantry", 1, 5)).toEqual({ ok: false, reason: "OCCUPIED" }); // covers the WHETSTONE at (2,6)
      expect(canPlaceItem(b, "nailstrip", 6, 3)).toEqual({ ok: false, reason: "BELT IN THE WAY" }); // (6,3) is belt
      expect(canPlaceItem(b, "nailstrip", 7, 3)).toEqual({ ok: true });
      expect(canPlaceItem(b, "spikerail", 0, 8, -1, 0)).toEqual({ ok: false, reason: "OFF THE DECK" }); // 3 deep from y 8
    });
  });
});
