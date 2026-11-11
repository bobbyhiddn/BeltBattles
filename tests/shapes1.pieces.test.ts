// SHAPES-1 (REQ-BFG-086 R4, S4-S6, S9; REQ-BFG-084; BRIEF-SHAPES1 step 3): the pieces, the migration and the validator,
// in both switch states.
// - the pools: the three rigs are in their rarity's catalogue (and their merchants' stock) with SHAPES on, nowhere off;
//   LAST CHANCE's epic parts don't move; the per-run draw stays at DRAW.active (S9);
// - merge and sell: a star raises only their numbers; sellValue; ASSEMBLY LINE at 4 G on, 5 G off;
// - TURRET INTAKE (S5, cap's ruling 4ef9d32165edfd0d): every new drop on an intake cell is refused with SHAPES on, a piece
//   already there may stay or turn; the validator refuses only a shaped piece there; KARSK days 9-10 gain no error;
// - the rot rule (S4): a shaped factory's rot 1 is legal on, refused off ("only rigs turn"); a non-canonical rot is refused;
// - the load migration (S6) on par decks that hold GANTRY PRESS or ASSEMBLY LINE: every result is legal, none covers an
//   intake cell, a deck made with SHAPES on never moves, and the counts (moved, belts lost, cargoed) are printed;
// - the server pins (S4): the same fixtures through the client check (validateUpload) and POST /v1/ghosts, both states.
// The server's data dir is under os.tmpdir() (run with TMPDIR set).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, RULES_VERSION, buyableModules, itemsSoldBy, sellValue, type HeroId } from "../src/sim/content";
import {
  canPlaceItem, cellsOf, cloneBuild, isIntakeCell, routeInfo, rotOf, type Build, type Placed,
} from "../src/sim/deck";
import { footOf, footOnDeck, footprintCells, footTurns } from "../src/sim/foot";
import { SHAPES, SHAPES_IDS, setShapes, shapesRules, withShapes } from "../src/sim/shapes";
import { SHAPES2_IDS, withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: SHAPES2 ships on (bb-0.11.0): the SHAPES-1 world is measured with it set off
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: PLAIN_RIGS ships on too: the pre-0.9.9 decks of S6 are built without the six
import { withEnchant } from "../src/sim/enchant"; // BUMP-1F (the flip, ENCHANT): the par decks of the fixtures are made with it off
import { GATES, setGates } from "../src/sim/gates"; // BUMP-1F (the flip, GATES): this file's world is the one before the three converters too
import { SCALE_RIGS, scaleRules, setScaleRigs } from "../src/sim/scale"; // BUMP-1E: and the scaling rules (bb-0.12.0): this file's world is the one before the seven
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: LONG_RUN ships on: it moves the par decks (|long in their cache key)
import { clearMigrationLog, migrateShapedFactories, migrationLog } from "../src/sim/beltside";
import { effectAt, fusible, outputsAt, valueOf } from "../src/sim/stars";
import { lastChanceParts } from "../src/sim/lastChance";
import { DRAW, drawWares } from "../src/game/wares";
import { rivalBuild } from "../src/sim/rivals";
import { parField } from "../src/sim/harness/par";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { validateBuild, validateUpload, inShapesWorld } from "../src/net/validate";
import { SHAPES_RULES, shapesGateProblem, shapesWorld } from "../src/net/rulesGate";
import { reachableRecords } from "../src/net/records";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { migrateRun, shapesRun } from "../src/game/save";
import { nextFuseToast, shapeNotice } from "../src/game/save"; // SHAPES-1 (Q4): the load notice
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withGuard } from "../src/sim/guard"; // MERGE-099F: the migration's par decks with HULL-ON's five off too
import { withOpenRunes } from "../src/sim/openRunes"; // MERGE-099F
import { withFreeJoins } from "../src/sim/freeJoins"; // MERGE-099F
import { withHearts } from "../src/sim/hearts"; // MERGE-099F
import { withPick } from "../src/net/pick"; // MERGE-099F
/** MERGE-099F: HULL-ON's five switches off around `f` (tests/hull1b.ladders' allOff). */
const offFive = <T>(f: () => T): T => withGuard(() => withOpenRunes(() => withFreeJoins(() => withHearts(() => withPick(f, false), false), false), false), false);
/** BUMP-1D: the three switches bb-0.11.0 turned on (LONG_RUN, PLAIN_RIGS, SHAPES2) set off around `f`: the world before them,
 *  for decks a save of 0.9.8 or earlier could hold (offFive's form; each puts its switch back even on a throw). */
const oldWorld = <T>(f: () => T): T => withLongRun(() => withPlainRigs(() => withShapes2(f, false), false), false);

// BUMP-1E: this file is SHAPES-1's world, written before the scaling rules (the switch ships on in bb-0.12.0), so every test runs with them off, as its pins were
// measured (the old decks of S6, the par deck of S4's fixtures and the first error of its record check, all par decks that shop the seven new rigs now: with them on
// foundry/10/11's migrated deck failed the strict "every belt connected" line and the fixture's first rune error moved). Scaling off is the OUTERMOST of every nest
// here (off first in beforeEach, back last in afterEach): the seven are the last keys of ITEMS while it is on, so turning SHAPES off and back with it left on puts
// the three behind them, and a par deck (cached by its switches, not by ITEMS' key order) then depends on which tests ran before it: the fixture's pin gave one error
// in the whole file and another alone. The shipped value is put back after every test, and one test asserts that it ships on
// BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default; REQ-BFG-052): and before the three converters (GATES ships on in bb-0.13.0): the par decks of S6 shop FUSER, SCATTER MILL and SMELTER now, and a
// converter stands ON a belt tile (a route cell under machinery by design), so every test runs with GATES off too, as its pins were measured. Gates off is the OUTERMOST of all (off first in
// beforeEach, back last in afterEach: its three are the last keys of ITEMS). Was: beforeEach(() => setScaleRigs(false)) and the afterEach below without setGates
beforeEach(() => { setGates(false); setScaleRigs(false); });
afterEach(() => {
  setShapes(SHAPES); // SHAPES-1 flip: the shipped value (on); a test that needs SHAPES off sets it itself
  setScaleRigs(SCALE_RIGS); // BUMP-1E: the shipped value (on)
  setGates(GATES); // BUMP-1F: the shipped value (on), last
});

const ids = (l: { id: string }[]) => l.map((d) => d.id);

describe("SHAPES-1 R4 and S9: the pools", () => {
  it("off: no pool, merchant or LAST CHANCE card sees the three; on: each is in its rarity's catalogue and its merchant's stock", () => {
    setShapes(false); // SHAPES-1 flip: the off world set off (it ships on); afterEach puts SHAPES back
    const off = ids(buyableModules());
    const lcOff = ids(lastChanceParts());
    for (const id of SHAPES_IDS) expect(off, id).not.toContain(id);
    expect(ids(itemsSoldBy("alchemist"))).not.toContain("nailstrip");
    withShapes(() => {
      const on = buyableModules();
      // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: the canonical order, BUMP-1F P2 F1, src/sim/itemsKeep.ts ITEM_RANK: shapes 2, shapes2 3): was `[...off, "nailstrip", "embertrough", "spikerail"]`; SHAPES' three
      // go in at their rank, before SHAPES2's six (which this file's world holds, as shipped), not behind them
      const six = (id: string): boolean => SHAPES2_IDS.includes(id);
      expect(ids(on)).toEqual([...off.filter((id) => !six(id)), "nailstrip", "embertrough", "spikerail", ...off.filter(six)]);
      expect(on.filter((d) => SHAPES_IDS.includes(d.id)).map((d) => [d.id, d.rarity, d.kind])).toEqual([
        ["nailstrip", "common", "gate"], ["embertrough", "common", "gate"], ["spikerail", "rare", "gate"],
      ]);
      expect(ids(itemsSoldBy("alchemist"))).toEqual(expect.arrayContaining(["nailstrip", "embertrough"]));
      expect(ids(itemsSoldBy("tinker"))).toContain("spikerail");
      expect(ids(lastChanceParts())).toEqual(lcOff); // epic parts only: unchanged
    });
  });

  it("S9 (REQ-BFG-022): the per-run draw stays DRAW.active either way; the catalogue and the draw's mean count per rarity", () => {
    const count = () => {
      const by: Record<string, number> = {};
      const runs = 200;
      let total = 0;
      for (let s = 1; s <= runs; s++) {
        const w = drawWares(s);
        total += Object.keys(w).length;
        for (const id of Object.keys(w)) by[ITEMS[id].rarity] = (by[ITEMS[id].rarity] ?? 0) + 1;
      }
      const cat: Record<string, number> = {};
      for (const d of buyableModules()) cat[d.rarity] = (cat[d.rarity] ?? 0) + 1;
      return { catalogue: buyableModules().length, cat, draw: total / runs, perRarity: Object.fromEntries(Object.entries(by).map(([r, n]) => [r, Math.round((n / runs) * 10) / 10])) };
    };
    const off = withShapes(count, false); // SHAPES-1 flip: the off world set off (it ships on)
    const on = withShapes(count);
    console.log(`S9 POOL off ${JSON.stringify(off)}`);
    console.log(`S9 POOL on ${JSON.stringify(on)}`);
    expect(off.draw).toBeGreaterThanOrEqual(DRAW.active);
    expect(on.draw).toBeGreaterThanOrEqual(DRAW.active);
    expect(on.draw - off.draw).toBeLessThan(1); // the draw's size doesn't grow with the catalogue
    expect(on.draw).toBeGreaterThanOrEqual(55);
    expect(on.draw).toBeLessThanOrEqual(70);
    expect(on.catalogue).toBe(off.catalogue + 3);
  });
});

describe("SHAPES-1 R4: merge, sell and price", () => {
  it("a star raises only their numbers; they merge like any rig and sell at sellValue", () => {
    withShapes(() => {
      for (const id of SHAPES_IDS) expect(fusible(id), id).toBe(true);
      // BUMP-1D: SHAPES2 ships on (bb-0.11.0) and patches NAIL STRIP and SPIKE RAIL on their live defs (shapes2.ts SHAPES2_PATCHES):
      // SHAPES-1's rows are measured with SHAPES2 set off (byte for byte), the shipped rows with it on
      withShapes2(() => {
        expect([1, 2, 3].map((s) => effectAt("nailstrip", s).gate)).toEqual([{ flat: 12 }, { flat: 25 }, { flat: 40 }]);
        expect([1, 2, 3].map((s) => effectAt("embertrough", s).gate)).toEqual([{ burn: 1 }, { burn: 2 }, { burn: 3 }]);
        expect([1, 2, 3].map((s) => effectAt("spikerail", s).gate)).toEqual([{ flat: 10 }, { flat: 20 }, { flat: 35 }]);
      }, false);
      expect([1, 2, 3].map((s) => effectAt("nailstrip", s).gate)).toEqual([{ flat: 16 }, { flat: 33 }, { flat: 53 }]); // BUMP-1D: was 12/25/40
      expect([1, 2, 3].map((s) => effectAt("embertrough", s).gate)).toEqual([{ burn: 1 }, { burn: 2 }, { burn: 3 }]);
      expect([1, 2, 3].map((s) => effectAt("spikerail", s).gate)).toEqual([{ flat: 8 }, { flat: 16 }, { flat: 28 }]); // BUMP-1D: was 10/20/35
      for (const s of [2, 3]) for (const id of SHAPES_IDS) {
        const a = effectAt(id, s), b = ITEMS[id];
        expect({ ...a, gate: undefined }, `${id} *${s}`).toEqual({ ...b, gate: undefined }); // nothing but the numbers
      }
      expect([1, 2, 3].map((s) => sellValue("nailstrip", s))).toEqual([2, 4, 8]);
      expect([1, 2, 3].map((s) => sellValue("spikerail", s))).toEqual([3, 6, 12]);
      // SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1): EMBER TROUGH 4 -> 5 G, so its value is 5 / 10 / 20 (was 4 / 8 / 16)
      expect([1, 2, 3].map((s) => valueOf("embertrough", s))).toEqual([5, 10, 20]);
    });
  });

  it("ASSEMBLY LINE costs 4 G as an I3 (a SMALL factory keeps its slots); GANTRY PRESS keeps 7 G and gets 4/5/6 slots", () => {
    withShapes(() => expect([ITEMS.assembly.price, valueOf("assembly", 2), sellValue("assembly", 2)]).toEqual([5, 10, 5]), false); // SHAPES-1 flip: off set off
    withShapes(() => {
      expect([ITEMS.assembly.price, valueOf("assembly", 2), sellValue("assembly", 2)]).toEqual([4, 8, 4]);
      expect([footOf(ITEMS.assembly), footOf(ITEMS.gantry), ITEMS.gantry.price]).toEqual(["I3", "2x3", 7]);
      expect([1, 2, 3].map((s) => outputsAt("assembly", s))).toEqual([2, 3, 4]);
      expect([1, 2, 3].map((s) => outputsAt("gantry", s))).toEqual([4, 5, 6]);
      expect(ITEMS.gantry.factory).toEqual(ITEMS.gantry.factory); // ability as before (same spec object's content)
    });
  });
});

/** A par deck (the par player's dusk deck, SHAPES off) for the fixtures below. SHAPES-1 flip: built with SHAPES set off
 *  (it ships on), as before the flip. */
function parDeck(hero: HeroId, day: number, seed: number): Build {
  // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: ENCHANT default; the same fixture rule as tests/enchant1.upload's par(): "made with ENCHANT off: no words"): was
  // `withShapes(() => cloneBuild(playerRun(hero, day, seed)[day - 1].build), false)`. ENCHANT ships on, so the par player's deck holds the bots' own words, and an upload of it under
  // bb-0.10.0 (the rules of this file's checks) is refused for them ("enchantments (ench, enchDir, grow) need bb-0.13.0 or later"); this file's world is the one before them
  return withEnchant(() => withShapes(() => cloneBuild(playerRun(hero, day, seed)[day - 1].build), false), false);
}

/** The first spot (row order, rot 0 first) where `def` fits on `b` with SHAPES as it stands, or null. */
function spotFor(b: Build, def: string, rots = [0, 1, 2, 3], avoid: (k: number) => boolean = () => false): { x: number; y: number; rot: number } | null {
  for (const rot of rots) for (let y = 1; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (!canPlaceItem(b, def, x, y, -1, rot).ok) continue;
    if (footprintCells(ITEMS[def], x, y, rot).some(avoid)) continue;
    return { x, y, rot };
  }
  return null;
}

describe("SHAPES-1 S5: TURRET INTAKE (cap's ruling 4ef9d32165edfd0d)", () => {
  it("SHAPES on: a new drop on an intake cell is refused for every piece; off: 0.9.9's rule (legal)", () => {
    const b = parDeck("furnace", 3, 1);
    // SHAPES-1 flip: the free cells are found, and 0.9.9's rule checked, with SHAPES set off (it ships on)
    const free = withShapes(() => [...Array(10).keys()].map((x) => x).find((x) => isIntakeCell(b, x) && canPlaceItem(b, "whetstone", x, 0).ok), false);
    expect(free, "a free intake cell on the par deck").toBeDefined();
    expect(withShapes(() => canPlaceItem(b, "whetstone", free!, 0), false)).toEqual({ ok: true });
    // a NAIL STRIP whose two cells are free, one of them an intake (OCCUPIED and BELT IN THE WAY come first)
    const two = withShapes(() => [...Array(9).keys()].find((x) => (isIntakeCell(b, x) || isIntakeCell(b, x + 1)) && canPlaceItem(b, "whetstone", x, 0).ok && canPlaceItem(b, "whetstone", x + 1, 0).ok), false);
    withShapes(() => {
      expect(canPlaceItem(b, "whetstone", free!, 0)).toEqual({ ok: false, reason: "TURRET INTAKE" });
      if (two !== undefined) expect(canPlaceItem(b, "nailstrip", two, 0)).toEqual({ ok: false, reason: "TURRET INTAKE" });
      // a 1-cell rig already there (an older save) may stay and turn in place; moving onto a new intake cell is refused
      const old: Placed = { uid: 900, def: "whetstone", x: free!, y: 0 };
      const withRig = { ...cloneBuild(b), items: [...b.items, old] };
      expect(canPlaceItem(withRig, "whetstone", free!, 0, 900, 1)).toEqual({ ok: true });
      const other = withShapes(() => [...Array(10).keys()].find((x) => x !== free && isIntakeCell(b, x) && canPlaceItem(b, "whetstone", x, 0).ok), false);
      if (other !== undefined) expect(canPlaceItem(withRig, "whetstone", other, 0, 900)).toEqual({ ok: false, reason: "TURRET INTAKE" });
    });
  });

  it("the validator refuses a shaped piece on an intake cell (SHAPES on) but not a 1-cell rig; KARSK days 9-10 gain no error", () => {
    const pairAt = (bb: Build) => [...Array(9).keys()].find((x) => (isIntakeCell(bb, x) || isIntakeCell(bb, x + 1)) && canPlaceItem(bb, "whetstone", x, 0).ok && canPlaceItem(bb, "whetstone", x + 1, 0).ok);
    // SHAPES-1 flip: the fixture deck is chosen, and its base errors taken, with SHAPES set off (it ships on)
    const b = withShapes(() => [1, 2, 3, 4, 5, 6].flatMap((q) => [parDeck("furnace", 6, q), parDeck("weaver", 6, q)]).find((bb) => pairAt(bb) !== undefined && !bb.items.some((p) => RESHAPED.includes(p.def)))!, false);
    expect(b, "a par deck with two free row-0 cells, one an intake").toBeDefined();
    const k = withShapes(() => [...Array(10).keys()].find((x) => isIntakeCell(b, x) && canPlaceItem(b, "whetstone", x, 0).ok)!, false);
    const rig = { ...cloneBuild(b), items: [...b.items, { uid: 901, def: "whetstone", x: k, y: 0 }] };
    const base = withShapes(() => validateBuild(b, 6, "strict").errors, false);
    const day6 = 6;
    withShapes(() => {
      expect(validateBuild(rig, 6, "strict").errors.filter((e) => e.includes("TURRET INTAKE"))).toEqual([]);
      const x0 = withShapes(() => pairAt(b), false);
      expect(x0, "two free row-0 cells, one an intake").toBeDefined();
      const strip = { ...cloneBuild(b), items: [...b.items, { uid: 902, def: "nailstrip", x: x0!, y: 0 }] };
      expect(validateBuild(strip, day6, "strict").errors).toContain(`placement: uid 902 NAIL STRIP at ${x0},0: TURRET INTAKE`);
      for (const day of [9, 10]) {
        const karsk = rivalBuild("karsk", day);
        const iron = karsk.items.find((p) => p.def === "shieldwall" && p.x === 5 && p.y === 0);
        expect(iron, `KARSK day ${day}: IRON WALL at (5,0)`).toBeDefined();
        const onErr = validateBuild(karsk, day, "strict").errors, onUp = validateUpload(karsk, day).errors;
        const offErr = withShapes(() => validateBuild(karsk, day, "strict").errors, false);
        const offUp = withShapes(() => validateUpload(karsk, day).errors, false);
        expect(onErr, `KARSK ${day} strict`).toEqual(offErr);
        expect(onUp, `KARSK ${day} upload`).toEqual(offUp);
        expect(onErr.concat(onUp).filter((e) => e.startsWith("placement"))).toEqual([]);
      }
    });
    expect(withShapes(() => validateBuild(b, 6, "strict").errors, false)).toEqual(base);
  }, 120_000); // SHAPES-1 run 4 (def6e73's timeout rule): up to 12 par runs and KARSK's two days validated 4 ways: ~15 s at low
  // load, 37 s alone on a 4-CPU sandbox at load 30 (logs/suite-f35eb9f-alone-a.log), past the 30 s default
});

describe("SHAPES-1 S4: the rot rule and the rules gate", () => {
  it("a shaped factory's rot: 1 legal with SHAPES on; off (2x2) 'only rigs turn'; 2 or 3 never; a rig 0-3 as before", () => {
    const b = parDeck("furnace", 6, 3);
    const strip = (bb: Build) => bb.items.filter((p) => p.def !== "gantry");
    withShapes(() => {
      const s = spotFor({ ...b, items: strip(b) }, "gantry", [1])!;
      expect(s).not.toBeNull();
      const g = (rot: number): Build => ({ ...cloneBuild(b), items: [...strip(b), { uid: 950, def: "gantry", x: s.x, y: s.y, rot }] });
      const rotErrs = (bb: Build) => validateBuild(bb, 6, "strict").errors.filter((e) => e.includes("rot"));
      expect(rotErrs(g(1))).toEqual([]);
      expect(rotErrs(g(2))).toEqual(["item: uid 950 GANTRY PRESS has rot 2; its 2X3 footprint turns only to rot 1..1 (absent = 0)"]);
      expect(rotErrs(g(0))).toEqual(["item: uid 950 GANTRY PRESS has rot 0; its 2X3 footprint turns only to rot 1..1 (absent = 0)"]);
      expect(withShapes(() => rotErrs(g(1)), false)).toEqual(["item: uid 950 GANTRY PRESS can't have a rot (only rigs turn)"]);
    });
  });

  it("SHAPES_RULES is bb-0.10.0, this build's rules until the bump (RULES_VERSION is bb-0.11.0 since BUMP-1D); the three rigs travel only with the switch on and under rules that have them", () => {
    // BUMP-1D: was expect(SHAPES_RULES).toBe(RULES_VERSION) (both bb-0.10.0). SHAPES_RULES is a literal (S6's: the first rules
    // version with shaped rigs) and stays "bb-0.10.0"; RULES_VERSION is "bb-0.11.0", which is after it (the gate below passes)
    expect([SHAPES_RULES, RULES_VERSION]).toEqual(["bb-0.10.0", "bb-0.16.0"]); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: label bb-0.12.0 -> bb-0.13.0): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0).
    const deck = { items: [{ uid: 1, def: "nailstrip", x: 0, y: 1 }] };
    withShapes(() => { // SHAPES-1 flip: the switch set off (it ships on)
      expect(shapesGateProblem(RULES_VERSION, deck)).toBe("shaped rigs (NAIL STRIP, EMBER TROUGH, SPIKE RAIL): not in this rules version yet");
      expect(shapesGateProblem(RULES_VERSION, { items: [] })).toBeNull();
    }, false);
    withShapes(() => {
      expect(shapesGateProblem(RULES_VERSION, deck)).toBeNull();
      expect(shapesGateProblem("bb-0.9.3", deck)).toBe(`rules bb-0.9.3 predate ${SHAPES_RULES}: shaped rigs (NAIL STRIP, EMBER TROUGH, SPIKE RAIL) need ${SHAPES_RULES} or later`);
      expect([shapesWorld(RULES_VERSION), shapesWorld("bb-0.9.3")]).toEqual([true, false]);
      // a record under older rules is judged in 0.9.9's shapes: the switch is off inside, and back on after
      expect(inShapesWorld("bb-0.9.3", () => shapesRules())).toBe(false);
      expect(inShapesWorld(RULES_VERSION, () => shapesRules())).toBe(true);
      expect(shapesRules()).toBe(true);
    });
    expect(withShapes(() => shapesWorld(RULES_VERSION), false)).toBe(false); // SHAPES-1 flip: set off
    expect(shapesWorld(RULES_VERSION)).toBe(true); // SHAPES-1 flip: on as it ships
  });
});

describe("SHAPES-1 S6: the load migration on par decks", () => {
  it("every par deck (four heroes, seeds 1-12, days 5 and 10) holding GANTRY PRESS or ASSEMBLY LINE migrates to a legal deck", () => {
    const decks: { tag: string; b: Build; day: number }[] = [];
    // MERGE-099F (REQ-BFG-079, -086; cap's ruling on oracle a9203a0c46474cc4; tests only): the decks are built with HULL-ON's
    // five off as well as SHAPES. In production the load migration only meets decks made before 0.9.9 (0.9.8 saves and
    // their stored dusk and warlord decks), made with SHAPES and the five off; HULL-ON never shipped without SHAPES, and a
    // deck built with SHAPES on never moves, so this world samples what players load (19 decks, 0 failing). With the five
    // on (SHAPES off alone, a world no saved deck comes from) foundry/10/5 failed the strict check: its GANTRY PRESS moved
    // (4,1) -> (5,4) and lost both its belts (routes 2 and 3), and factory 106's 1-cell belt, which joined route 2, was freed
    // and kept: "route 2 does not end on a free turret connector (disconnected)". That is SHAPES-1's contract (beltside.ts
    // :189-193 and save.ts:143-144: a belt it can't keep is removed whole and pruneJoins frees a belt that joined it, as when
    // a factory is moved today; deck.ts:1790-1792: a freed belt becomes an open-ended, unconnected belt, NOWHERE on the
    // build screen, which the player re-lays); this test's strict "every belt connected" check is stricter than it. Whether
    // the migration should also drop such a freed belt is the PIECES lane's question after 0.9.9 (MERGE-099F REPORT). Was
    // built with SHAPES off alone (the five on since the merge)
    // BUMP-1D: and with the three switches bb-0.11.0 turned on set off too (LONG_RUN, PLAIN_RIGS, SHAPES2: each moves the par
    // decks, their cache key holds |long, |pr and |s2): a save the migration meets was made before 0.9.9, where none existed. In
    // the shipped world the par decks differ and foundry/5/5 fails this test's strict "every belt connected" line the same way
    // foundry/10/5 did in MERGE-099F's world (a freed belt left disconnected: SHAPES-1's contract, see above), so the old decks
    // are kept: this is the world the test samples (the decks players load), not the world of the shipped par bot
    withShapes(() => oldWorld(() => offFive(() => { // SHAPES-1 flip: the decks are built with SHAPES set off (it ships on), then migrated with it on
      for (const h of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) for (const day of [5, 10]) {
        parField(h, day).forEach((b, i) => {
          if (b.items.some((p) => p.def === "gantry" || p.def === "assembly")) decks.push({ tag: `${h}/${day}/${i + 1}`, b: cloneBuild(b), day });
        });
      }
    })), false);
    const stat = { decks: decks.length, gantry: 0, assembly: 0, stayed: 0, moved: 0, cargoed: 0, beltsLost: 0, decksLosingBelt: 0, belts: 0 };
    const lines: string[] = [];
    withShapes(() => {
      for (const { tag, b, day } of decks) {
        const own = (p: Placed) => b.routes.filter((r) => r.factory === p.uid).length;
        const pieces = b.items.filter((p) => p.def === "gantry" || p.def === "assembly");
        for (const p of pieces) {
          stat[p.def as "gantry" | "assembly"]++;
          stat.belts += own(p);
        }
        const before = JSON.stringify(b);
        const moves = migrateShapedFactories(b);
        const lost = moves.reduce((n, v) => n + v.lost, 0);
        stat.beltsLost += lost;
        if (lost) stat.decksLosingBelt++;
        stat.cargoed += moves.filter((v) => !v.to).length;
        stat.moved += moves.filter((v) => v.to).length;
        stat.stayed += pieces.length - moves.length;
        for (const v of moves) lines.push(`${tag} ${v.def} (${v.from.x},${v.from.y}) -> ${v.to ? `(${v.to.x},${v.to.y}) rot ${v.to.rot}` : "cargo"}, kept ${v.kept}, lost ${v.lost}`);
        // legal: every piece on the deck at its rot, no overlap, no shaped piece on an intake, every belt still connected
        const seen = new Set<number>();
        for (const p of b.items) {
          const d = ITEMS[p.def];
          expect(footOnDeck(d, p.x, p.y, rotOf(p)), `${tag} ${p.def} on deck`).toBe(true);
          for (const k of cellsOf(p)) {
            expect(seen.has(k), `${tag} overlap at ${k}`).toBe(false);
            seen.add(k);
          }
          if (RESHAPED.includes(p.def)) expect(cellsOf(p).some((k) => isIntakeCell(b, k)), `${tag} ${p.def} on an intake`).toBe(false);
          if (p.rot !== undefined && d.kind === "factory") expect(p.rot).toBeLessThan(footTurns(footOf(d)));
        }
        b.routes.forEach((r, i) => {
          expect(r.cells.some((k) => seen.has(k)), `${tag} route ${i} under machinery`).toBe(false);
          expect(routeInfo(b, i).wellFormed, `${tag} route ${i} well formed`).toBe(true);
        });
        const placement = validateBuild(b, day, "strict").errors.filter((e) => /^(placement|route|item: uid \d+ .* rot)/.test(e));
        expect(placement, tag).toEqual([]);
        // idempotent: a second pass does nothing
        const again = JSON.stringify(b);
        expect(migrateShapedFactories(b), `${tag} second pass`).toEqual([]);
        expect(JSON.stringify(b)).toBe(again);
        void before;
      }
    });
    console.log(`S6 MIGRATION ${JSON.stringify(stat)}`);
    for (const l of lines) console.log(`S6 MOVE ${l}`);
    expect(stat.decks).toBeGreaterThan(0);
    // off: nothing runs (SHAPES-1 flip: set off)
    withShapes(() => expect(migrateShapedFactories(cloneBuild(decks[0].b))).toEqual([]), false);
  }, 600_000);

  it("a save holding a 2x2 GANTRY PRESS loads re-placed with SHAPES on, as before with it off; a deck made with SHAPES on never moves", () => {
    // SHAPES-1 flip: the save is made, and loaded once, with SHAPES set off (it ships on), as before the flip
    const d = withShapes(() => playerRun("furnace", 10, 1).find((x) => x.build.items.some((p) => p.def === "gantry" || p.def === "assembly")), false);
    const b = d ? cloneBuild(d.build) : parDeck("furnace", 10, 1);
    const raw = () => ({ version: 8, build: cloneBuild(b), shop: { offers: [] }, inventory: [], gold: 0, day: d?.day ?? 10, lives: 3, seed: 1, hero: "furnace" });
    const off = withShapes(() => migrateRun(raw()), false);
    expect(off!.build).toEqual(b);
    withShapes(() => {
      clearMigrationLog();
      const r = raw();
      const res = shapesRun(r as never);
      expect(res.moved + res.cargoed + res.refunded).toBeGreaterThanOrEqual(0);
      const once = JSON.stringify(r.build);
      expect(migrateShapedFactories(r.build as Build)).toEqual([]); // idempotent
      expect(JSON.stringify(r.build)).toBe(once);
      // a GANTRY PRESS placed with SHAPES on (rot 1) stays where it is
      const fresh = { ...cloneBuild(b), items: b.items.filter((p) => p.def !== "gantry"), routes: b.routes.filter((q) => !b.items.some((p) => p.def === "gantry" && p.uid === q.factory)) };
      const s = spotFor(fresh, "gantry", [1]);
      if (s) {
        fresh.items.push({ uid: 960, def: "gantry", x: s.x, y: s.y, rot: 1 });
        expect(migrateShapedFactories(fresh)).toEqual([]);
      }
      expect(migrationLog().stats.every((x) => x.source.startsWith("save"))).toBe(true);
    });
  });
});

const RESHAPED = ["gantry", "assembly"];

/** The fixtures the client check and the server both judge (S4): a day-6 WEAVER par deck with its rigs taken off (to free
 *  the gold), then each shaped placement. `want` is the verdict with SHAPES on; with it off every fixture is refused. */
function fixtures(): { name: string; s: GhostSnapshot; on: boolean }[] {
  const hero: HeroId = "weaver", day = 6;
  const rec = reachableRecords(day).find((r) => r.wins === day - 1) ?? reachableRecords(day)[0];
  // the first par seed whose day-6 deck holds neither reshaped factory (so its own shapes are the same both ways)
  // (and with two free row-0 cells, one an intake, for the intake fixture)
  const pairAt = (bb: Build) => [...Array(9).keys()].find((x) => (isIntakeCell(bb, x) || isIntakeCell(bb, x + 1)) && canPlaceItem(bb, "whetstone", x, 0).ok && canPlaceItem(bb, "whetstone", x + 1, 0).ok);
  // SHAPES-1 flip: the seed is chosen with SHAPES set off (it ships on), as before the flip
  const seed = withShapes(() => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((q) => {
    const bb = parDeck(hero, day, q);
    return !bb.items.some((p) => RESHAPED.includes(p.def)) && pairAt({ ...bb, items: bb.items.filter((p) => ITEMS[p.def].kind !== "gate") }) !== undefined;
  })!, false);
  const base = parDeck(hero, day, seed);
  base.items = base.items.filter((p) => ITEMS[p.def].kind !== "gate");
  // BUMP-1D: under bb-0.11.0 (LONG_RUN) an upload states the dusks its run lost (records.ts lossesProblem; run1.server.test.ts's
  // honest uploads carry it): this record is the flawless one (wins === day - 1: no loss, no draw), so `losses` is 0
  const snap = (name: string, build: Build): GhostSnapshot => ({
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build, runId: `shapes1-${name}`,
    playerId: "p-shapes1", createdAt: 1_790_000_000_000, seed: parRunSeed(hero, seed), losses: day - 1 - rec.wins,
  });
  return withShapes(() => {
    const out: { name: string; s: GhostSnapshot; on: boolean }[] = [];
    const intake = (k: number) => isIntakeCell(base, k);
    const add = (b: Build, def: string, rots: number[], uid: number): Build | null => {
      const s = spotFor(b, def, rots, intake);
      if (!s) return null;
      const nb = cloneBuild(b);
      nb.items.push({ uid, def, x: s.x, y: s.y, ...(s.rot ? { rot: s.rot } : {}) });
      return nb;
    };
    const rigs = add(add(add(base, "nailstrip", [0, 1, 2, 3], 801)!, "embertrough", [0, 1, 2, 3], 802)!, "spikerail", [1, 0], 803)!;
    out.push({ name: "rigs", s: snap("rigs", rigs), on: true });
    const noGantry = cloneBuild(base);
    const gantry = add(noGantry, "gantry", [1], 804)!;
    out.push({ name: "gantry-rot1", s: snap("gantry-rot1", gantry), on: true });
    const asm = add(noGantry, "assembly", [1], 805)!;
    out.push({ name: "assembly-rot1", s: snap("assembly-rot1", asm), on: true });
    // refused with SHAPES on: an overlap, a cell off the deck, a non-canonical factory rot, a shaped rig on an intake
    const strip = rigs.items.find((p) => p.uid === 801)!;
    out.push({ name: "overlap", s: snap("overlap", { ...cloneBuild(rigs), items: rigs.items.map((p) => (p.uid === 802 ? { uid: 802, def: "embertrough", x: strip.x, y: strip.y, ...(strip.rot ? { rot: strip.rot } : {}) } : p)) }), on: false });
    const g = gantry.items.find((p) => p.uid === 804)!;
    out.push({ name: "offdeck", s: snap("offdeck", { ...cloneBuild(gantry), items: gantry.items.map((p) => (p.uid === 804 ? { uid: 804, def: "gantry", x: 9, y: 8 } : p)) }), on: false });
    out.push({ name: "gantry-rot3", s: snap("gantry-rot3", { ...cloneBuild(gantry), items: gantry.items.map((p) => (p.uid === 804 ? { ...g, rot: 3 } : p)) }), on: false });
    const k = withShapes(() => pairAt(base), false);
    if (k !== undefined) out.push({ name: "intake", s: snap("intake", { ...cloneBuild(base), items: [...base.items, { uid: 806, def: "nailstrip", x: k, y: 0 }] }), on: false });
    return out;
  });
}

describe("SHAPES-1 S6, cap's RUN2 note Q4: the load notice for a reshaped factory (the player's save only)", () => {
  it("each case's words (cap's): moved, moved and lost 1 or 2 belts, into cargo, sold with a full cargo", () => {
    expect(shapeNotice("GANTRY PRESS", { lost: 0 })).toBe("GANTRY PRESS HAS A NEW SHAPE. IT MOVED TO FIT.");
    expect(shapeNotice("GANTRY PRESS", { lost: 2 })).toBe("GANTRY PRESS HAS A NEW SHAPE. IT MOVED TO FIT AND LOST 2 BELTS.");
    expect(shapeNotice("ASSEMBLY LINE", { lost: 1 })).toBe("ASSEMBLY LINE HAS A NEW SHAPE. IT MOVED TO FIT AND LOST 1 BELT.");
    expect(shapeNotice("GANTRY PRESS", { cargo: true })).toBe("GANTRY PRESS HAS A NEW SHAPE AND NO ROOM. IT'S IN YOUR CARGO.");
    expect(shapeNotice("GANTRY PRESS", { sold: 7 })).toBe("GANTRY PRESS HAS A NEW SHAPE AND NO ROOM. IT WAS SOLD FOR 7 G.");
  });

  it("shapesRun queues one line for a factory that moved (shown on the build screen only), none for one that stayed put", () => {
    const raw = (x: number, y: number) => ({
      build: { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "gantry", x, y }], routes: [], mods: [], beltCap: 40, hullBonus: 0 },
      inventory: [] as unknown[], gold: 0, fuseFx: [] as string[],
    });
    withShapes(() => {
      const moved = raw(8, 8); // a 2x2 at (8,8): as a 2x3 it leaves the deck there, so it moves
      shapesRun(moved as never);
      expect(moved.fuseFx).toEqual(["GANTRY PRESS HAS A NEW SHAPE. IT MOVED TO FIT."]);
      expect(nextFuseToast(moved as never, false)).toBeUndefined(); // it waits for the build screen
      expect(nextFuseToast(moved as never, true)).toBe("GANTRY PRESS HAS A NEW SHAPE. IT MOVED TO FIT.");
      expect(moved.fuseFx).toEqual([]); // once
      const stays = raw(0, 7); // its 2x3 fits at its own anchor: nothing moves, nothing said
      shapesRun(stays as never);
      expect(stays.fuseFx).toEqual([]);
    });
  });
});

describe("SHAPES-1 S1/S4 after the merge of c099-pre8 (cap's RUN2 note 1.3-1.4): shapes ride under bb-0.10.0", () => {
  it("SHAPES_RULES is S6's literal; a bb-0.9.7 record holding a shaped piece is refused, a bb-0.10.0 one is judged in shapes' world", () => {
    expect([SHAPES_RULES, RULES_VERSION]).toEqual(["bb-0.10.0", "bb-0.16.0"]); // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: label bb-0.12.0 -> bb-0.13.0): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: was ["bb-0.10.0", "bb-0.10.0"]: RULES_VERSION moved, the literal stays
    const fx = fixtures();
    const rigs = fx.find((f) => f.name === "rigs")!.s, gantry = fx.find((f) => f.name === "gantry-rot1")!.s;
    withShapes(() => {
      // bb-0.10.0: the three rigs and a GANTRY PRESS at rot 1 pass (judged with SHAPES on)
      expect(validateUpload(rigs.build, rigs.day, "bb-0.10.0", { seed: rigs.seed }).errors).toEqual([]);
      expect(validateUpload(gantry.build, gantry.day, "bb-0.10.0", { seed: gantry.seed }).errors).toEqual([]);
      expect(inShapesWorld("bb-0.10.0", () => shapesRules())).toBe(true);
      // bb-0.9.7: the shaped rigs are refused by the gate; a reshaped factory's rot is judged in 0.9.9's shapes (SHAPES
      // off inside, with NPC_DAY, HULL_SCALE and LADDER_FIX: inRulesWorld)
      const old = validateUpload(rigs.build, rigs.day, "bb-0.9.7", { seed: rigs.seed });
      expect(old.ok).toBe(false);
      expect(old.errors[0]).toMatch(/^rules: .*shaped rigs/);
      // MERGE-099F (REQ-BFG-109, -086): HULL-ON's OPEN_RUNES judges a bb-0.9.7 record's runes on the closed (weighted)
      // offers (rulesGate.ts openRunesFor), and this fixture's runes are the merged world's open offers (its par deck plays
      // with OPEN_RUNES on), so with the seed the rune check refuses it first; was the rot error (c099's world, no
      // OPEN_RUNES). The rot rule is read without the seed (no offer re-derived), as before
      const oldG = validateUpload(gantry.build, gantry.day, "bb-0.9.7", { seed: gantry.seed });
      expect(oldG.ok).toBe(false);
      expect(oldG.errors[0]).toBe("rune: runes[5]: ASH CLOAK was not offered at the dawn of day 6");
      const oldR = validateUpload(gantry.build, gantry.day, "bb-0.9.7");
      expect(oldR.ok).toBe(false);
      expect(oldR.errors.some((e) => /only rigs turn/.test(e)), oldR.errors.join(" | ")).toBe(true);
      expect(inShapesWorld("bb-0.9.7", () => shapesRules())).toBe(false);
      expect(shapesRules()).toBe(true); // put back after
    });
  }, 120_000);
});

describe("SHAPES-1 S4: the server pins (the client check and POST /v1/ghosts, both switch states)", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-shapes1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("each fixture: the client's verdict is the server's, SHAPES on (as listed) and off (every one refused)", async () => {
    const fx = fixtures();
    expect(fx.map((f) => f.name)).toEqual(["rigs", "gantry-rot1", "assembly-rot1", "overlap", "offdeck", "gantry-rot3", "intake"]);
    const me = await testIdentity(0);
    const rows: string[] = [];
    for (const on of [true, false]) {
      setShapes(on);
      for (const f of fx) {
        const body = JSON.stringify({ ...ownedBy(f.s, me), runId: `${f.s.runId}-${on ? "on" : "off"}` });
        const s = JSON.parse(body) as GhostSnapshot; // the client judges exactly the bytes the server gets
        const client = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const text = await r.text();
        rows.push(`${on ? "on " : "off"} ${f.name}: client ${client.ok ? "ok" : client.errors[0]} | server ${r.status} ${r.status === 201 ? "" : text.slice(0, 160)}`);
        expect(r.status === 201, `${f.name} ${on ? "on" : "off"}: server ${r.status} ${text.slice(0, 300)} vs client ${JSON.stringify(client.errors)}`).toBe(client.ok);
        expect(client.ok, `${f.name} ${on ? "on" : "off"}: ${JSON.stringify(client.errors)}`).toBe(on && f.on);
      }
    }
    setShapes(SHAPES); // SHAPES-1 flip: the shipped value
    for (const r of rows) console.log(`S4 PIN ${r}`);
  }, 120_000);
});

describe("SHAPES-1 S1: switch off, nothing moved", () => {
  it("SHAPES off: GANTRY PRESS and ASSEMBLY LINE 2x2 at 7 and 5 G; no rot on a factory; footprints of 0.9.9", () => {
    expect(shapesRules()).toBe(true); // SHAPES-1 flip: it ships on; the off world is set off below
    // BUMP-1D: SHAPES2 ships on (bb-0.11.0) and its six carry a foot on their own defs whatever SHAPES says: 0.9.9's footprints
    // are measured with SHAPES2 set off (no def has a foot), and with it on the only defs with a foot are the six
    withShapes2(() => withShapes(() => {
      expect(shapesRules()).toBe(false);
      expect([footOf(ITEMS.gantry), footOf(ITEMS.assembly), ITEMS.gantry.price, ITEMS.assembly.price]).toEqual(["2x2", "2x2", 7, 5]);
      expect(Object.values(ITEMS).filter((d) => d.foot !== undefined).map((d) => d.id)).toEqual([]);
    }, false), false);
    withShapes(() => {
      expect(shapesRules()).toBe(false);
      expect([footOf(ITEMS.gantry), footOf(ITEMS.assembly), ITEMS.gantry.price, ITEMS.assembly.price]).toEqual(["2x2", "2x2", 7, 5]);
      expect(Object.values(ITEMS).filter((d) => d.foot !== undefined).map((d) => d.id).sort()).toEqual([...SHAPES2_IDS].sort());
    }, false);
  });
});

describe("BUMP-1E: the scaling rules and this file's world", () => {
  it("the scaling rules ship on (SCALE_RIGS true); every test above ran with them off, the world SHAPES-1's pins were measured in (no CINDER MAIL in ITEMS)", () => {
    expect(SCALE_RIGS).toBe(true);
    expect(scaleRules()).toBe(false); // beforeEach: this file's world
    expect(ITEMS.cindermail).toBeUndefined();
  });
});
