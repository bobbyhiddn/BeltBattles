// BUMP-1D run 3 (cap's ruling R2.3 Q2, "the footprint check"): migrateInlineGates, the D3 step of every load boundary and of
// the stand-in loader (decodeStarred), took a gate as "on a belt" by its ANCHOR cell, (p.x, p.y), and for a move checked only
// the DESTINATION anchor cell. For a shaped rig the anchor is the top-left corner of the turned footprint's bounding box, which
// for an L or T foot at some rots is a cell the rig does not occupy (ELBOW GUARD, an L3 rig, at rot 3 occupies (x+1,y) (x,y+1)
// (x+1,y+1)). So a rig standing legally beside a belt, its corner on a belt tile, was moved as if it stood on it, to a place
// whose other cells nobody checked: four of the 192 stored stand-in codes (furnace day 5 #5, day 13 #0, day 6 #3 and day 10 #4,
// each with an ELBOW GUARD at rot 3) loaded with the rig displaced, two of them onto an illegal board (it overlapped a TOLLBOOTH).
// Now a gate is inline only when a cell of its turned FOOTPRINT is a belt tile, and a shaped rig moves whole (beltside.ts
// moveShaped). This file pins that: (1) the geometry, (2) a corner on a belt alone moves nothing, (3) a footprint on a belt
// moves whole to a place that fits, or is stranded, (4) the four decks load as they are stored and are legal boards, (5) every
// 1-cell gate is migrated exactly as before (the old step is copied below and compared on every deck the repo holds).
// BUMP-1E: the stand-in pool was regenerated under bb-0.12.0 (R1, 19ae423), and a regenerated pool re-measures (4): the old step now displaces
// TWO of its 192 decks (furnace day 5 #1 and day 15 #2, each with an ELBOW GUARD at rot 3), where the committed pool's had four.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Rng, hashSeed } from "../src/core/rng";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import {
  arrowCell, cellsOf, footOf, footOnDeck, footprintCells, hitsOfRig, isIntakeCell, key as K, kx, ky, opposite, rigHits, rotField, rotOf,
  type Build, type Placed,
} from "../src/sim/deck";
import { neighbourOrder, migrateInlineGates, rotFacing, type Migration } from "../src/sim/beltside";
import { shapesRules, withShapes } from "../src/sim/shapes";
import { shapes2Rules, withShapes2 } from "../src/sim/shapes2";
import { starsOf } from "../src/sim/stars";
import { isConverterItem } from "../src/sim/split"; // BUMP-1F (GATES on by default): a converter on a belt tile is no clash
import { validateBuild, validateUpload } from "../src/net/validate";
import { npcDayRules } from "../src/sim/npcDay"; // the budget line is left to the player mode only while NPC_DAY is on (standInPool.gen.test.ts)
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { decodeStarred, decodeStarredRaw, encodeStarred, standInPool, type StandInEntry } from "../src/sim/standInPool";
import { STAND_IN_DATA as V11 } from "./fixtures/standInPoolData.v1.1";

const here = (f: string) => decodeURIComponent(new URL(f, import.meta.url).pathname); // (no node:url import: the tests' type shims don't declare it, tests/tsc-tests-baseline.json)
const J = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** Run `fn` with both shape switches on (they are on in this release; the explicit call keeps the file independent of that). */
const shaped = <T>(fn: () => T): T => withShapes2(() => withShapes(fn, true), true);

// ---------------------------------------------------------------- the pre-fix step, kept as the 1-cell oracle

/**
 * migrateInlineGates as it was committed at a76afd0, before the footprint check (src/sim/beltside.ts; verbatim but for the
 * types): a gate is inline when its ANCHOR cell is a belt tile, and a move checks the destination anchor cell alone. It is the
 * oracle of the 1-cell gates (which must migrate byte for byte as before) and the witness of the bug (shaped rigs).
 */
function legacyMigrate(b: Build): Migration {
  const out: Migration = { moved: [], stranded: [] };
  const where = new Map<number, [number, number]>(); // belt cell -> [route, tile]
  b.routes.forEach((r, ri) => r.cells.forEach((k, ti) => { if (!where.has(k)) where.set(k, [ri, ti]); }));
  const inline = b.items.filter((p) => ITEMS[p.def]?.kind === "gate" && where.has(K(p.x, p.y)));
  if (!inline.length) return out;
  const moving = new Set(inline.map((p) => p.uid));
  const taken = new Set<number>(); // cells held by machinery that stays (updated as gates move)
  for (const p of b.items) {
    const d = ITEMS[p.def];
    if (!d || moving.has(p.uid)) continue;
    for (const k of cellsOf(p)) taken.add(k);
  }
  const strandedUids = new Set<number>();
  for (const p of inline) {
    const from = K(p.x, p.y);
    const [ri, ti] = where.get(from)!;
    let placed = false;
    for (const d of neighbourOrder(b, ri, ti)) {
      const k = arrowCell(p.x, p.y, d);
      if (k < 0 || where.has(k) || taken.has(k)) continue;
      const rot = rotFacing(p.def, opposite(d));
      p.x = kx(k);
      p.y = ky(k);
      const f = rotField(p.def, rot);
      if (f.rot === undefined) delete p.rot;
      else p.rot = f.rot;
      taken.add(k);
      out.moved.push({ uid: p.uid, def: p.def, from, to: k, rot: f.rot ?? 0 });
      placed = true;
      break;
    }
    if (!placed) {
      strandedUids.add(p.uid);
      out.stranded.push({ ...p });
    }
  }
  if (strandedUids.size) b.items = b.items.filter((p) => !strandedUids.has(p.uid));
  return out;
}

// ---------------------------------------------------------------- decks

const SHORT = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)]; // up column 4 (the FURNACE's connectors are columns 4 and 5)
const ZIG = [K(4, 5), K(4, 4), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)]; // up column 4, a corner at (5,4), up column 5
const WIGGLE = [K(3, 6), K(3, 5), K(2, 5), K(2, 4), K(3, 4), K(3, 3), K(4, 3), K(4, 2), K(4, 1), K(4, 0)]; // a corner of every kind
const BELTS: Record<string, number[]> = { SHORT, ZIG, WIGGLE };
/** The FURNACE's Kiln at (4,6) (cells 64 65 74 75) with one belt and the given rigs. */
function furnace(items: Placed[] = [], cells = SHORT): Build {
  return { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells }], mods: [], beltCap: 30, hullBonus: 0 };
}
const rig = (uid: number, def: string, x: number, y: number, rot = 0): Placed => ({ uid, def, x, y, ...rotField(def, rot) });
/** The cells of rig `p` that are belt tiles of `b`. */
const onBelt = (b: Build, p: Placed): number[] => { const belt = new Set(b.routes.flatMap((r) => r.cells)); return cellsOf(p).filter((k) => belt.has(k)); };
/** The shaped rigs (a foot of more than one cell) and the 1-cell rigs of the catalogue (both switches on). */
const shapedDefs = () => Object.values(ITEMS).filter((d) => d.kind === "gate" && footOf(d) !== "1");
const oneCellDefs = () => Object.values(ITEMS).filter((d) => d.kind === "gate" && footOf(d) === "1");

/** What is wrong with the board's geometry: a piece off the deck, a cell held by two pieces, or a piece on a belt tile. */
function clashes(b: Build): string[] {
  const out: string[] = [];
  const owner = new Map<number, number>();
  const belt = new Set(b.routes.flatMap((r) => r.cells));
  for (const p of b.items) {
    if (!footOnDeck(ITEMS[p.def], p.x, p.y, rotOf(p))) out.push(`uid ${p.uid} ${p.def} is off the deck`);
    for (const k of cellsOf(p)) {
      if (owner.has(k)) out.push(`cell ${k}: uid ${owner.get(k)} and uid ${p.uid} ${p.def}`);
      else owner.set(k, p.uid);
      // BUMP-1F (GATES on by default, RULING-BUMP1F-R5 R5.2): a CONVERTER (FUSER, SCATTER MILL, SMELTER) sits ON a belt tile by design; was any piece (furnace day 11 #0: uid 11 fuser on cell 14)
      if (belt.has(k) && !isConverterItem(p)) out.push(`cell ${k}: uid ${p.uid} ${p.def} on a belt tile`);
    }
  }
  return out;
}
/** The deck held to what tests/standInPool.gen.test.ts holds a pool deck to: validateBuild's lines minus at most its ONE budget
 *  line (and only while NPC_DAY is on: the road's drops are the player mode's to count), and validateUpload in the player mode
 *  with its road log. Returns every line that is left (none: a legal board). */
function legalityLines(b: Build, day: number, road?: StandInEntry["road"]): string[] {
  const strict = validateBuild(b, day).errors;
  const budget = npcDayRules() ? strict.filter((x) => x.startsWith("budget: ")) : [];
  const lines = budget.length > 1 ? strict : strict.filter((x) => !budget.includes(x));
  const up = validateUpload(b, day, RULES_VERSION, npcDayRules() && road ? { road } : {});
  return [...lines, ...up.errors.map((e) => `player mode: ${e}`)];
}
/** The hits rig `uid` makes on belt tile `cell`, as the game's own rule reads them (deck.ts rigHits). */
const hitsTile = (b: Build, uid: number, cell: number): number => hitsOfRig(b, uid, rigHits(b)).filter((h) => h.cell === cell).length;

// ---------------------------------------------------------------- 1. the geometry

describe("BUMP-1D R2.3 Q2, the premise: a shaped rig's anchor is not always a cell the rig occupies", () => {
  it("the switches are on, and the multi-cell rigs span every foot but 3x3 (I2, I3, L3, T4, 2x2)", () => {
    expect([shapesRules(), shapes2Rules()]).toEqual([true, true]);
    expect([...new Set(shapedDefs().map((d) => footOf(d)))].sort()).toEqual(["2x2", "I2", "I3", "L3", "T4"]);
  });

  it("only three rigs have a rot whose bounding box corner is empty: ELBOW GUARD (L3) rot 3, CINDER HOOK (L3, a quarter turn round) rot 2, PICKAXE (T4) rots 1 and 2", () => {
    const cornerEmpty: Record<string, number[]> = {};
    for (const d of shapedDefs()) {
      for (const rot of [0, 1, 2, 3]) {
        if (!cellsOf(rig(2, d.id, 3, 3, rot)).includes(K(3, 3))) (cornerEmpty[d.id] ??= []).push(rot);
      }
    }
    expect(cornerEmpty).toEqual({ elbowguard: [3], cinderhook: [2], pickaxe: [1, 2] });
    expect(cellsOf(rig(2, "elbowguard", 3, 3, 3))).toEqual([K(4, 3), K(3, 4), K(4, 4)]); // the anchor (3,3) is not one of them
    expect(cellsOf(rig(2, "pickaxe", 3, 3, 1))).toEqual([K(4, 3), K(3, 4), K(4, 4), K(4, 5)]);
  });

  it("the three belts used below are legal on the FURNACE", () => {
    for (const [name, cells] of Object.entries(BELTS)) expect(validateBuild(furnace([], cells), 10).errors, name).toEqual([]);
  });
});

// ---------------------------------------------------------------- 2. (a) a corner on a belt, a footprint off it: not moved

describe("BUMP-1D R2.3 Q2 (a): a shaped rig whose bounding box corner is on a belt but whose footprint is not stays where it is", () => {
  // ZIG's tile (5,4) is a corner of the belt (it comes from the west and goes north); the rigs' cells lie east and south of it
  const CASES: [string, number, number[]][] = [
    ["elbowguard", 3, [K(6, 4), K(5, 5), K(6, 5)]],
    ["cinderhook", 2, [K(6, 4), K(5, 5), K(6, 5)]],
    ["pickaxe", 1, [K(6, 4), K(5, 5), K(6, 5), K(6, 6)]],
    ["pickaxe", 2, [K(6, 4), K(5, 5), K(6, 5), K(7, 5)]],
  ];
  for (const [def, rot, cells] of CASES) {
    it(`${def} at rot ${rot}, its anchor (5,4) a belt tile: not moved, not stranded, the deck untouched and a legal board (the old step moved it)`, () => {
      shaped(() => {
        const b = furnace([rig(2, def, 5, 4, rot)], ZIG), before = J(b), p = b.items[1];
        expect(cellsOf(p)).toEqual(cells);
        expect(ZIG).toContain(K(p.x, p.y)); // the corner is a belt tile ...
        expect(onBelt(b, p)).toEqual([]); // ... and no cell of the rig is
        expect(clashes(b)).toEqual([]);
        expect(validateBuild(b, 10).errors).toEqual([]);
        // the bug: the anchor test took it for a rig standing on the belt and moved it
        const old = J(b);
        expect(legacyMigrate(old).moved.map((m) => m.uid)).toEqual([2]);
        expect(old.items[1]).not.toEqual(before.items[1]);
        // the fix
        expect(migrateInlineGates(b)).toEqual({ moved: [], stranded: [] });
        expect(b).toEqual(before);
      });
    });
  }

  it("over every shaped rig, rot and place on three belts: a rig with no cell on a belt is never touched, whether its corner is on one or not (and the sweep does reach the corner cases)", () => {
    shaped(() => {
      let seen = 0;
      const corner: Record<string, number> = {};
      for (const [name, cells] of Object.entries(BELTS)) {
        for (const d of shapedDefs()) {
          for (const rot of [0, 1, 2, 3]) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
            if (!footOnDeck(d, x, y, rot)) continue;
            const b = furnace([rig(2, d.id, x, y, rot)], cells);
            if (clashes(b).some((c) => !c.includes("on a belt tile"))) continue; // a place on the Kiln: not a deck
            if (onBelt(b, b.items[1]).length) continue; // part (b)'s
            const before = J(b);
            expect(migrateInlineGates(b), `${name} ${d.id} rot ${rot} (${x},${y})`).toEqual({ moved: [], stranded: [] });
            expect(b).toEqual(before);
            seen++;
            if (cells.includes(K(x, y))) corner[d.id] = (corner[d.id] ?? 0) + 1;
          }
        }
      }
      expect(seen).toBeGreaterThan(2000);
      for (const def of ["elbowguard", "cinderhook", "pickaxe"]) expect(corner[def], `${def}: corner cases swept`).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------- 3. (b) a footprint on a belt: moved whole, or stranded

describe("BUMP-1D R2.3 Q2 (b): a shaped rig with a cell on a belt moves as a whole to a place that fits, or is stranded", () => {
  it("ELBOW GUARD lying across a straight belt: its anchor is off the belt, so the old step left it on it; now it moves whole, off the belt, facing its old tile", () => {
    shaped(() => {
      const b = furnace([rig(2, "elbowguard", 3, 3, 0)]); // cells (3,3) (3,4) (4,4): (4,4) is belt tile 1
      expect(onBelt(b, b.items[1])).toEqual([K(4, 4)]);
      expect(legacyMigrate(J(b))).toEqual({ moved: [], stranded: [] }); // the anchor test never saw it
      expect(validateBuild(b, 10).errors).toEqual(["placement: uid 2 ELBOW GUARD at 3,3: BELT IN THE WAY"]);
      const m = migrateInlineGates(b), p = b.items[1];
      // left of travel is west: the rig turns to face east (rot 1); the foot's first cell on (3,4) would put (4,4), the belt, in the
      // rig, so the next cell of the foot lands there: (2,4) (3,4) (2,5)
      expect(m.moved).toEqual([{ uid: 2, def: "elbowguard", from: K(4, 4), to: K(2, 4), rot: 1 }]);
      expect(m.stranded).toEqual([]);
      expect([p.x, p.y, p.rot]).toEqual([2, 4, 1]);
      expect(cellsOf(p)).toEqual([K(2, 4), K(3, 4), K(2, 5)]);
      expect(clashes(b)).toEqual([]);
      expect(validateBuild(b, 10).errors).toEqual([]);
      expect(hitsTile(b, 2, K(4, 4))).toBe(1); // its arrow from (3,4) works the tile it left
      expect(migrateInlineGates(b)).toEqual({ moved: [], stranded: [] }); // idempotent
    });
  });

  it("SAW BAR (I3) lying across the belt: it turns to lie along it, left of travel, and hits the three tiles beside it, the old one among them", () => {
    shaped(() => {
      const b = furnace([rig(2, "sawbar", 3, 2, 0)]); // cells (3,2) (4,2) (5,2): the middle one is belt tile 3
      const m = migrateInlineGates(b), p = b.items[1];
      expect(m.moved).toEqual([{ uid: 2, def: "sawbar", from: K(4, 2), to: K(3, 2), rot: 1 }]);
      expect([p.x, p.y, p.rot]).toEqual([3, 2, 1]);
      expect(cellsOf(p)).toEqual([K(3, 2), K(3, 3), K(3, 4)]);
      expect(clashes(b)).toEqual([]);
      expect(validateBuild(b, 10).errors).toEqual([]);
      expect([K(4, 2), K(4, 3), K(4, 4)].map((k) => hitsTile(b, 2, k))).toEqual([1, 1, 1]);
    });
  });

  it("PICKAXE (T4) with two cells on the belt: it leaves by the first of them in footprint order, and keeps its stars", () => {
    shaped(() => {
      const b = furnace([{ ...rig(2, "pickaxe", 3, 1, 0), stars: 2 }]); // cells (3,1) (4,1) (5,1) (4,2): belt tiles (4,1) and (4,2)
      expect(onBelt(b, b.items[1])).toEqual([K(4, 1), K(4, 2)]);
      const m = migrateInlineGates(b), p = b.items[1];
      expect(m.moved).toEqual([{ uid: 2, def: "pickaxe", from: K(4, 1), to: K(2, 1), rot: 1 }]);
      expect([p.x, p.y, p.rot, p.stars]).toEqual([2, 1, 1, 2]);
      expect(cellsOf(p)).toEqual([K(3, 1), K(2, 2), K(3, 2), K(3, 3)]);
      expect(clashes(b)).toEqual([]);
      expect(validateBuild(b, 10).errors).toEqual([]);
      expect([K(4, 1), K(4, 2), K(4, 3)].map((k) => hitsTile(b, 2, k))).toEqual([1, 1, 1]);
    });
  });

  it("a place that overlaps something is never taken: a rig in the way sends the ELBOW GUARD to the other side of the belt, onto cells that are all free", () => {
    shaped(() => {
      const b = furnace([rig(2, "elbowguard", 3, 3, 0), rig(3, "whetstone", 2, 5)]); // (2,5) is the third cell of the first place
      const m = migrateInlineGates(b), p = b.items[1];
      expect(m.moved).toEqual([{ uid: 2, def: "elbowguard", from: K(4, 4), to: K(5, 3), rot: 3 }]);
      expect([p.x, p.y, p.rot]).toEqual([5, 3, 3]); // its anchor (5,3) is the empty corner of the foot, as in the stored decks
      expect(cellsOf(p)).toEqual([K(6, 3), K(5, 4), K(6, 4)]);
      expect(clashes(b)).toEqual([]);
      expect(b.items[2]).toEqual(rig(3, "whetstone", 2, 5)); // the rig that stayed is untouched
      expect(validateBuild(b, 10).errors).toEqual([]);
      expect(hitsTile(b, 2, K(4, 4))).toBe(1);
    });
  });

  it("with no place that fits it is stranded: removed from the deck, returned as it stood, nothing else touched", () => {
    shaped(() => {
      const b = furnace([rig(2, "elbowguard", 3, 3, 0), rig(3, "whetstone", 2, 4), rig(4, "whetstone", 5, 4)]);
      const stood = J(b.items[1]);
      const m = migrateInlineGates(b);
      expect(m.moved).toEqual([]);
      expect(m.stranded).toEqual([stood]);
      expect(b.items.map((p) => p.uid)).toEqual([1, 3, 4]);
      expect(clashes(b)).toEqual([]);
    });
  });

  it("a shaped rig never lands on a turret intake cell (validate.ts: a shaped piece may not cover one), though a 1-cell rig still may", () => {
    shaped(() => {
      // SAW BAR across ZIG's tile (5,1); left of travel is column 4, and with (4,3) held the only place there is (4,0) (4,1) (4,2), and (4,0) is an intake
      const b = furnace([rig(2, "sawbar", 5, 1, 0), rig(3, "whetstone", 4, 3)], ZIG);
      const m = migrateInlineGates(b), p = b.items[1];
      expect(m.moved).toEqual([{ uid: 2, def: "sawbar", from: K(5, 1), to: K(6, 1), rot: 3 }]);
      expect(cellsOf(p)).toEqual([K(6, 1), K(6, 2), K(6, 3)]);
      expect(cellsOf(p).filter((k) => isIntakeCell(b, k))).toEqual([]);
      expect(clashes(b)).toEqual([]);
      expect(validateBuild(b, 10).errors).toEqual([]); // had it taken (4,0) it would read "TURRET INTAKE"
      // a 1-cell rig keeps 0.9.9's rule: WHETSTONE on the belt's last tile (4,0), (3,0) held, goes to (5,0), an intake cell, which is legal for it
      const one = furnace([rig(2, "whetstone", 4, 0), rig(3, "brake", 3, 0)]);
      expect(migrateInlineGates(one).moved).toEqual([{ uid: 2, def: "whetstone", from: K(4, 0), to: K(5, 0), rot: 3 }]);
      expect(isIntakeCell(one, K(5, 0))).toBe(true);
      expect(validateBuild(one, 10).errors).toEqual([]);
    });
  });

  it("the cells a rig moved earlier took are kept out of by the next, shaped or not, in the deck's order", () => {
    shaped(() => {
      // WHETSTONE (4,5) and SAW BAR (3,4)-(5,4) both stand on the belt; each wants the cells left of it, (3,5) for the one and (3,4)..(3,6) for the other
      const first = furnace([rig(2, "whetstone", 4, 5), rig(3, "sawbar", 3, 4, 0)]);
      const m = migrateInlineGates(first);
      expect(m.moved).toEqual([{ uid: 2, def: "whetstone", from: K(4, 5), to: K(3, 5), rot: 1 }, { uid: 3, def: "sawbar", from: K(4, 4), to: K(3, 2), rot: 1 }]);
      expect(cellsOf(first.items[2])).toEqual([K(3, 2), K(3, 3), K(3, 4)]); // the bar slid up, off the WHETSTONE's (3,5)
      expect(clashes(first)).toEqual([]);
      expect(validateBuild(first, 10).errors).toEqual([]);
      // the other way round, the bar takes (3,4)..(3,6) and the WHETSTONE goes to the right of the belt
      const second = furnace([rig(2, "sawbar", 3, 4, 0), rig(3, "whetstone", 4, 5)]);
      const n = migrateInlineGates(second);
      expect(n.moved).toEqual([{ uid: 2, def: "sawbar", from: K(4, 4), to: K(3, 4), rot: 1 }, { uid: 3, def: "whetstone", from: K(4, 5), to: K(5, 5), rot: 3 }]);
      expect(cellsOf(second.items[1])).toEqual([K(3, 4), K(3, 5), K(3, 6)]);
      expect(clashes(second)).toEqual([]);
      expect(validateBuild(second, 10).errors).toEqual([]);
    });
  });

  it("every shaped rig, rot and place on three belts: inline exactly when a cell is on a belt; then moved whole to a legal place that works its old tile, or stranded; deterministic and idempotent", () => {
    shaped(() => {
      let inline = 0, moved = 0, stranded = 0;
      for (const [name, cells] of Object.entries(BELTS)) {
        for (const d of shapedDefs()) {
          for (const rot of [0, 1, 2, 3]) for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
            if (!footOnDeck(d, x, y, rot)) continue;
            const b = furnace([rig(2, d.id, x, y, rot)], cells), tag = `${name} ${d.id} rot ${rot} (${x},${y})`;
            if (clashes(b).some((c) => !c.includes("on a belt tile"))) continue;
            const stood = onBelt(b, b.items[1]);
            if (!stood.length) continue; // part (a)'s
            inline++;
            const twin = J(b), m = migrateInlineGates(b);
            expect(migrateInlineGates(twin), `${tag}: deterministic`).toEqual(m);
            expect(twin, `${tag}: deterministic`).toEqual(b);
            if (m.stranded.length) {
              stranded++;
              expect(m.moved, tag).toEqual([]);
              expect(b.items.map((p) => p.uid), tag).toEqual([1]);
              expect(m.stranded[0], tag).toEqual({ uid: 2, def: d.id, x, y, ...rotField(d.id, rot) });
              continue;
            }
            moved++;
            const p = b.items[1];
            expect(m.moved, tag).toEqual([{ uid: 2, def: d.id, from: stood[0], to: K(p.x, p.y), rot: rotOf(p) }]);
            expect(clashes(b), tag).toEqual([]);
            expect(cellsOf(p).filter((k) => isIntakeCell(b, k)), tag).toEqual([]);
            expect(validateBuild(b, 10).errors, tag).toEqual([]);
            expect(hitsTile(b, 2, stood[0]), `${tag}: works the tile it left`).toBeGreaterThan(0);
            expect(migrateInlineGates(J(b)), `${tag}: idempotent`).toEqual({ moved: [], stranded: [] });
          }
        }
      }
      console.log(`shaped rig sweep: ${inline} rigs with a cell on a belt, ${moved} moved whole, ${stranded} stranded`);
      expect(inline).toBeGreaterThan(1000);
      expect(moved + stranded).toBe(inline);
      expect(moved).toBeGreaterThan(inline * 0.9); // an almost empty deck nearly always has a place
    });
  });

  it("random decks of 2-5 rigs, 1-cell and shaped, with stars and rots, most of them on a belt: a clash-free board comes out, the rigs not on a belt stay, the moved work their old tile", () => {
    shaped(() => {
      const shapedIds = shapedDefs(), oneIds = oneCellDefs();
      let shapedMoved = 0, oneMoved = 0, stranded = 0;
      for (let t = 0; t < 1500; t++) {
        const rng = new Rng(hashSeed("shaped-sweep", t)), belt = BELTS[rng.pick(Object.keys(BELTS))];
        const b = furnace([], belt);
        for (let n = rng.int(4) + 2, tries = 0; n > 0 && tries < 80; tries++) {
          const d = rng.chance(0.5) ? rng.pick(shapedIds) : rng.pick(oneIds), rot = rng.int(4);
          let x = rng.int(10), y = rng.int(10);
          if (rng.chance(0.7)) { // a cell of the rig on a belt tile
            const tile = rng.pick(belt), o = rng.pick(footprintCells(d, 0, 0, rot));
            x = kx(tile) - kx(o);
            y = ky(tile) - ky(o);
          }
          if (!footOnDeck(d, x, y, rot)) continue;
          const p = { ...rig(b.items.length + 1, d.id, x, y, rot), ...(rng.chance(0.3) ? { stars: 2 } : {}) };
          const used = new Set(b.items.flatMap((q) => cellsOf(q)));
          if (cellsOf(p).some((k) => used.has(k))) continue;
          b.items.push(p);
          n--;
        }
        const before = J(b), uids = b.items.slice(1).map((p) => p.uid);
        const inlineUids = before.items.slice(1).filter((p) => onBelt(before, p).length).map((p) => p.uid);
        const twin = J(b), m = migrateInlineGates(b);
        expect(migrateInlineGates(twin), `deck ${t}: deterministic`).toEqual(m);
        const gone = new Set(m.stranded.map((p) => p.uid)), moves = new Map(m.moved.map((x) => [x.uid, x] as const));
        expect([...gone, ...moves.keys()].sort((a, c) => a - c), `deck ${t}: moved and stranded are the rigs on a belt`).toEqual(inlineUids);
        expect(b.items.slice(1).map((p) => p.uid), `deck ${t}: the rest stay, in deck order`).toEqual(uids.filter((u) => !gone.has(u)));
        expect(clashes(b), `deck ${t}`).toEqual([]);
        for (const p of b.items.slice(1)) {
          const was = before.items.find((q) => q.uid === p.uid)!, mv = moves.get(p.uid);
          if (!mv) {
            expect(p, `deck ${t} uid ${p.uid}: not on a belt, not touched`).toEqual(was);
            continue;
          }
          expect(starsOf(p), `deck ${t} uid ${p.uid}: stars ride along`).toBe(starsOf(was));
          if (footOf(ITEMS[p.def]) !== "1") {
            shapedMoved++;
            expect(cellsOf(p).filter((k) => isIntakeCell(b, k)), `deck ${t} uid ${p.uid}`).toEqual([]);
          } else oneMoved++;
          if (!ITEMS[p.def].gate?.stoke) expect(hitsOfRig(b, p.uid, rigHits(b)).some((h) => h.cell === mv.from), `deck ${t} uid ${p.uid} ${p.def}: works the tile it left`).toBe(true);
        }
        stranded += gone.size;
        expect(migrateInlineGates(J(b)), `deck ${t}: idempotent`).toEqual({ moved: [], stranded: [] });
      }
      console.log(`random decks: ${shapedMoved} shaped and ${oneMoved} 1-cell rigs moved, ${stranded} stranded`);
      expect(shapedMoved).toBeGreaterThan(300);
      expect(oneMoved).toBeGreaterThan(300);
      expect(stranded).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------- 4. (c) the four decks

describe("BUMP-1D R2.3 Q2 (c): the stored stand-in decks the anchor test displaced load as they are stored, on a legal board", () => { // BUMP-1E: was "the four stored stand-in decks" (the regenerated pool holds two)
  // BUMP-1E: the stand-in pool was regenerated under bb-0.12.0 (R1, 19ae423, the regenerated pools) and a regenerated pool re-measures these decks: the old step displaces TWO of
  // its 192 (was four of the committed pool, 8fc5e24, bb-0.11.0), both on furnace and both an ELBOW GUARD at rot 3. standInPool("furnace", day)[i]: day 5 #1 holds it (uid 5, anchor
  // (4,3), rot 3, cells 35 44 45) beside a belt whose tile 34 is a corner; the old step moved it to (4,4) rot 0 (cells 44 54 55), whose cell 54 is a TOLLBOOTH's (uid 7): an illegal
  // board. Day 15 #2 holds it (uid 3, anchor (8,1), rot 3, cells 19 28 29) with the corner on tile 18; the old step moved it to (8,2) rot 0 (cells 28 38 39), whose cell 38 is a
  // TEMPER's (uid 6): an illegal board too.
  // BUMP-1D's four, in the committed pool (8fc5e24): day 5 #5 and day 13 #0 (ELBOW GUARD uid 4, anchor (4,3), rot 3, cells 35 44 45; the old step to (4,4) rot 0, whose cell 54 is a
  // TOLLBOOTH's (uid 7): an illegal board) and day 6 #3 and day 10 #4 (uid 3, anchor (7,6), rot 3, cells 68 77 78, the corner on tile 67; the old step to (7,7) rot 0, cells 77 87 88:
  // no overlap, but not the deck that was scored). The sweeps above and the all-192 test below hold for any pool.
  const DISPLACED: { day: number; i: number; uid: number; stored: { x: number; y: number; cells: number[] }; old: { to: number; cells: number[]; clash: boolean } }[] = [
    // BUMP-1F (the pool regenerated at bb-0.13.0 with GATES, ENCHANT and the SOFT_TARGET 150 picks, RULING-BUMP1F-R9 R9.1 / R3'; RULING-BUMP1F-R5 R5.2): the regenerated pool displaces ONE deck, furnace day 11 #0: ELBOW GUARD uid 9, anchor (4,1), rot 3,
    // cells 15 24 25 beside a belt whose tile 14 is a corner; the old step moves it to (4,2) rot 0 (cells 24 34 35), whose cell 34 is a SPARKGAP's (uid 5): an illegal board. Was these two (BUMP-1E's pool): day 5 #1 and day 15 #2:
    // { day: 5, i: 1, uid: 5, stored: { x: 4, y: 3, cells: [35, 44, 45] }, old: { to: 44, cells: [44, 54, 55], clash: true } }, { day: 15, i: 2, uid: 3, stored: { x: 8, y: 1, cells: [19, 28, 29] }, old: { to: 28, cells: [28, 38, 39], clash: true } }
    { day: 11, i: 0, uid: 9, stored: { x: 4, y: 1, cells: [15, 24, 25] }, old: { to: 24, cells: [24, 34, 35], clash: true } },
    // BUMP-1E: were { day: 5, i: 5, uid: 4, stored: { x: 4, y: 3, cells: [35, 44, 45] }, old: { to: 44, cells: [44, 54, 55], clash: true } }, { day: 13, i: 0, (the same) },
    // { day: 6, i: 3, uid: 3, stored: { x: 7, y: 6, cells: [68, 77, 78] }, old: { to: 77, cells: [77, 87, 88], clash: false } } and { day: 10, i: 4, (the same) } (the regenerated pools, R1)
  ];
  for (const c of DISPLACED) {
    it(`furnace day ${c.day} #${c.i}: the ELBOW GUARD stays at (${c.stored.x},${c.stored.y}) rot 3, moved: [], no overlap, a legal board`, () => {
      shaped(() => {
        const hero: HeroId = "furnace", code = STAND_IN_DATA.pools[hero]![c.day - 1][1][c.i][3];
        const raw = decodeStarredRaw(hero, code), guard = raw.items.find((p) => p.uid === c.uid)!;
        expect([guard.def, guard.x, guard.y, rotOf(guard), cellsOf(guard)]).toEqual(["elbowguard", c.stored.x, c.stored.y, 3, c.stored.cells]);
        // the premise: the corner is a belt tile, no cell of the rig is, and the deck as stored has no clash
        expect(raw.routes.flatMap((r) => r.cells)).toContain(K(guard.x, guard.y));
        expect(onBelt(raw, guard)).toEqual([]);
        expect(clashes(raw)).toEqual([]);
        // the loader: nothing moved, nothing dropped, the deck as stored byte for byte
        expect(migrateInlineGates(J(raw))).toEqual({ moved: [], stranded: [] });
        const e = standInPool(hero, c.day)[c.i];
        expect(JSON.stringify(e.build)).toBe(JSON.stringify(raw));
        expect(JSON.stringify(decodeStarred(hero, code))).toBe(JSON.stringify(raw));
        expect(encodeStarred(e.build)).toBe(code);
        expect(cellsOf(e.build.items.find((p) => p.uid === c.uid)!)).toEqual(c.stored.cells);
        expect(clashes(e.build)).toEqual([]);
        expect(legalityLines(e.build, c.day, e.road)).toEqual([]);
        // what the old step did to it, for the record
        const old = J(raw), m = legacyMigrate(old);
        expect(m.moved).toEqual([{ uid: c.uid, def: "elbowguard", from: K(c.stored.x, c.stored.y), to: c.old.to, rot: 0 }]);
        expect(cellsOf(old.items.find((p) => p.uid === c.uid)!)).toEqual(c.old.cells);
        expect(clashes(old).length > 0).toBe(c.old.clash);
        expect(JSON.stringify(old)).not.toBe(JSON.stringify(raw));
      });
    });
  }

  it("all 192 stored codes load as they are written (no rig on a belt by its footprint, nothing moved or dropped) and round-trip byte for byte", () => {
    shaped(() => {
      let n = 0;
      for (const hero of Object.keys(STAND_IN_DATA.pools) as HeroId[]) {
        STAND_IN_DATA.pools[hero]!.forEach((d, di) => d[1].forEach((t, j) => {
          const raw = decodeStarredRaw(hero, t[3]), tag = `${hero} d${di + 1} #${j}`;
          expect(raw.items.filter((p) => ITEMS[p.def].kind === "gate" && onBelt(raw, p).length), tag).toEqual([]);
          expect(migrateInlineGates(J(raw)), tag).toEqual({ moved: [], stranded: [] });
          expect(JSON.stringify(decodeStarred(hero, t[3])), tag).toBe(JSON.stringify(raw));
          expect(encodeStarred(decodeStarred(hero, t[3])), tag).toBe(t[3]);
          n++;
        }));
      }
      expect(n).toBe(192);
    });
  });
});

// ---------------------------------------------------------------- 5. the 1-cell gates are migrated exactly as before

describe("BUMP-1D R2.3 Q2: a 1-cell gate is migrated exactly as before (the old step, copied above, is the oracle)", () => {
  interface Rec { key: string; deck: Build }
  const corpus = (): Rec[] => {
    const out: Rec[] = [];
    const presets = (JSON.parse(readFileSync(here("./fixtures/beltside-062/inline-presets.json"), "utf8")) as { decks: Rec[] }).decks;
    out.push(...presets.map((r) => ({ key: `preset ${r.key}`, deck: r.deck })));
    for (const f of ["rivals", "par", "standins", "starts"]) {
      const g = JSON.parse(readFileSync(here(`./fixtures/golden-060/${f}.json`), "utf8")) as { entries: Rec[] };
      out.push(...g.entries.map((r) => ({ key: `golden-060 ${f} ${r.key}`, deck: r.deck })));
    }
    for (const [hero, days] of Object.entries(V11.pools)) {
      days!.forEach((d, di) => d[1].forEach((t, j) => out.push({ key: `pool v1.1 ${hero} d${di + 1} #${j}`, deck: decodeStarredRaw(hero as HeroId, t[3]) })));
    }
    for (const hero of Object.keys(STAND_IN_DATA.pools) as HeroId[]) {
      STAND_IN_DATA.pools[hero]!.forEach((d, di) => d[1].forEach((t, j) => out.push({ key: `pool ${hero} d${di + 1} #${j}`, deck: decodeStarredRaw(hero, t[3]) })));
    }
    return out;
  };

  it("every pre-BELTSIDE preset, golden-060 and pool v1.1 deck (gates ON belt tiles) and the 192 current pool decks migrate to the same deck and the same Migration; only the two displaced pool decks differ", () => { // BUMP-1E: was "the four displaced pool decks"
    shaped(() => {
      const decks = corpus(), differs: string[] = [];
      let inlineDecks = 0, moved = 0, stranded = 0;
      for (const { key, deck } of decks) {
        const a = J(deck), b = J(deck);
        const was = legacyMigrate(a), now = migrateInlineGates(b);
        if (JSON.stringify([was, a]) !== JSON.stringify([now, b])) {
          differs.push(key);
          continue;
        }
        if (now.moved.length || now.stranded.length) inlineDecks++;
        moved += now.moved.length;
        stranded += now.stranded.length;
      }
      // BUMP-1E: was ["pool furnace d5 #5", "pool furnace d6 #3", "pool furnace d10 #4", "pool furnace d13 #0"]: the stand-in pool was regenerated under bb-0.12.0 (R1, 19ae423, the regenerated pools) and the
      // two decks the old step displaces are now furnace day 5 #1 and day 15 #2 (listed in (c) above)
      // BUMP-1F (the pool regenerated at bb-0.13.0, RULING-BUMP1F-R5 R5.2): was ["pool furnace d5 #1", "pool furnace d15 #2"]; the regenerated pool's one deck the old step displaces is furnace day 11 #0 (listed in (c) above)
      expect(differs).toEqual(["pool furnace d11 #0"]);
      // measured on this corpus (the same on the old step): 874 decks agree (BUMP-1E: was 872, the four became two), 616 of them hold gates to migrate. The fixtures are frozen;
      // the last 192 decks are the regenerated pool's (R1, 19ae423; the committed pool's, 8fc5e24, had four displaced decks), whose two displaced decks are the ones listed above.
      // BUMP-1E: the counts below did not move: a pool deck is a legal board (it migrates nothing, the all-192 test above), so they are the frozen fixtures' alone
      expect([decks.length, inlineDecks, moved, stranded]).toEqual([876, 616, 2523, 147]);
    });
  });
});
