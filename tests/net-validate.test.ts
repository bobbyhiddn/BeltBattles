import { describe, expect, it } from "vitest";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import { buildCost, maxGoldByDay, validateBuild } from "../src/net/validate";
import { furnaceDeck, K, STRAIGHT } from "./netHelpers";

const HEROES: HeroId[] = ["furnace", "weaver"];
const errorsOf = (b: Parameters<typeof validateBuild>[0], day = 10) => validateBuild(b, day).errors.join("\n");

describe("deck validation: budget formula", () => {
  it("max gold by day = START_GOLD + incomeFor(d, true) for each earlier day", () => {
    const table = Array.from({ length: 10 }, (_, i) => maxGoldByDay(i + 1));
    expect(table).toEqual([8, 17, 27, 38, 50, 63, 77, 91, 105, 119]);
    let g = START_GOLD;
    for (let d = 1; d <= 10; d++) {
      expect(maxGoldByDay(d)).toBe(g);
      g += incomeFor(d, true);
    }
  });

  it("costs items, mods, belt crates above the hero's base and plating", () => {
    const b = furnaceDeck({
      items: [...furnaceDeck().items, { uid: 2, def: "temper", x: 4, y: 3 }],
      mods: [{ uid: 3, def: "calibrate", turret: 0 }], beltCap: 22, hullBonus: 500, // NUM-1: two plates of 250 (was 50)
    });
    expect(buildCost(b)).toEqual({ items: 3, mods: 5, crates: 2, plates: 2, total: 3 + 5 + 2 * 2 + 2 * 5 });
  });
});

describe("deck validation: legal decks", () => {
  it("accepts both heroes' starting builds on every day", () => {
    for (const h of HEROES) for (let d = 1; d <= 10; d++) expect(validateBuild(startingBuild(h, 1), d)).toEqual({ ok: true, errors: [] });
  });

  it("reports warlord decks for rounds 1-10 that fail, and why (findings, not validator bugs)", () => {
    const findings: string[] = [];
    for (const h of HEROES) {
      for (let r = 1; r <= 10; r++) {
        const v = validateBuild(warlordBuild(h, r), r);
        const c = buildCost(warlordBuild(h, r));
        if (!v.ok) findings.push(`${h} r${r} (cost ${c.total}/${maxGoldByDay(r)}): ${v.errors.join(" | ")}`);
        // deck geometry must be legal; only supply or budget findings are allowed here, plus (since the
        // 0.6.1 flip) unmerged pairs: the captains hold them until job E merges them
        for (const e of v.errors) expect(e).toMatch(/^(supply|budget):|^item: UNFUSED PAIR:/);
      }
    }
    console.log(`warlord validation findings (${findings.length} of 20 decks fail):\n` + findings.join("\n"));
  });
});

describe("deck validation: rejections", () => {
  it("rejects overlapping items", () => {
    const onKiln = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "temper", x: 5, y: 7 }] });
    expect(errorsOf(onKiln)).toMatch(/placement: uid 2 TEMPER overlaps uid 1/);
    const twoGates = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "temper", x: 4, y: 3 }, { uid: 3, def: "coil", x: 4, y: 3 }] });
    expect(errorsOf(twoGates)).toMatch(/overlaps/);
    const press = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "press", x: 5, y: 6 }] });
    expect(errorsOf(press)).toMatch(/overlaps/);
  });

  it("rejects broken routes", () => {
    const gap = furnaceDeck({ routes: [{ factory: 1, cells: [K(4, 5), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] });
    expect(errorsOf(gap)).toMatch(/route: route 0 is broken between cells 54 and 34/);
    const loop = furnaceDeck({ routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 5), K(4, 4)] }] });
    expect(errorsOf(loop)).toMatch(/revisits/);
    const throughPress = furnaceDeck({
      items: [...furnaceDeck().items, { uid: 2, def: "press", x: 4, y: 2 }],
      routes: [{ factory: 1, cells: STRAIGHT }],
    });
    expect(errorsOf(throughPress)).toMatch(/placement: uid 2 STAMP PRESS at 4,2: BELT IN THE WAY/);
    const noFactory = furnaceDeck({ routes: [{ factory: 77, cells: STRAIGHT }] });
    expect(errorsOf(noFactory)).toMatch(/not a factory/);
    const empty = furnaceDeck({ routes: [{ factory: 1, cells: [] }] });
    expect(errorsOf(empty)).toMatch(/no belt tiles/);
  });

  it("rejects disconnected routes", () => {
    const detached = furnaceDeck({ routes: [{ factory: 1, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }] });
    expect(errorsOf(detached)).toMatch(/does not start beside its factory/);
    const deadEnd = furnaceDeck({ routes: [{ factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3)] }] });
    expect(errorsOf(deadEnd)).toMatch(/route: route 0 does not end on a free turret connector/);
    const notAConnector = furnaceDeck({ routes: [{ factory: 1, cells: [K(4, 5), K(3, 5), K(3, 4), K(3, 3), K(3, 2), K(3, 1), K(3, 0)] }] });
    expect(errorsOf(notAConnector)).toMatch(/disconnected/);
    // a second route onto an already-claimed connector must share its cell: crossing + unclaimed
    const w = startingBuild("weaver", 1);
    w.routes[0] = { factory: 1, cells: [K(4, 4), K(3, 4), K(2, 4), K(2, 3), K(2, 2), K(2, 1), K(1, 1), K(1, 0)] };
    const e = errorsOf(w);
    expect(e).toMatch(/routes 0 and 1 cross at cell 11/);
    expect(e).toMatch(/route: route 1 does not end on a free turret connector/);
  });

  it("rejects crossing belts, belts over capacity and too many routes per factory", () => {
    const w = startingBuild("weaver", 1);
    w.routes[1] = { factory: 1, cells: [K(3, 5), K(3, 4), K(4, 4)] };
    expect(errorsOf(w)).toMatch(/routes 0 and 1 cross at cell 44/);
    const long = furnaceDeck({ routes: [{ factory: 1, cells: [K(3, 7), K(2, 7), K(1, 7), K(1, 6), K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(2, 2), K(3, 2), K(3, 1), K(4, 1), K(4, 0), ] }], beltCap: 10 });
    expect(errorsOf(long)).toMatch(/route: 13 belt tiles exceed beltCap 10/);
    // bb-0.8.3 (REQ-BFG-042 D1-D2): a ★1 KILN has 2 belt slots (was 1), so the 3rd belt is the one too many (a BOMBARD in
    // the extra slot gives the belts more intakes)
    const threeFromKiln = furnaceDeck({
      routes: [
        { factory: 1, cells: STRAIGHT }, { factory: 1, cells: [K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
        { factory: 1, cells: [K(6, 6), K(7, 6), K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
      ],
      turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }, { slot: 1, def: "bombard", uid: 91 }], beltCap: 40,
    });
    expect(errorsOf(threeFromKiln)).toMatch(/KILN uid 1 feeds 3 routes but has 2 output/);
  });

  it("rejects over-budget decks", () => {
    const three = furnaceDeck({
      // 0.6.2 BELTSIDE: rigs west of the belt, facing it
      items: [...furnaceDeck().items, { uid: 2, def: "temper", x: 3, y: 4, rot: 1 }, { uid: 3, def: "whetstone", x: 3, y: 3, rot: 1 }, { uid: 4, def: "grease", x: 3, y: 2, rot: 1 }],
    });
    expect(errorsOf(three, 1)).toMatch(/budget: build costs 9 gold .* day 1 allows at most 8/);
    expect(validateBuild(three, 2).ok).toBe(true);
    expect(errorsOf(furnaceDeck({ hullBonus: 500 }), 1)).toMatch(/budget/); // NUM-1: two plates of 250 (was 50)
    expect(validateBuild(furnaceDeck({ hullBonus: 250 }), 1).ok).toBe(true); // NUM-1: one plate (was 25)
    expect(errorsOf(furnaceDeck({ beltCap: 14 + 4 * 5 }), 1)).toMatch(/budget: build costs 10/);
  });

  it("rejects a foreign signature factory and a second signature factory", () => {
    const loom = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "loom", x: 0, y: 8 }] });
    expect(errorsOf(loom)).toMatch(/item: uid 2 LOOM is another hero's signature factory/);
    const twoKilns = furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "kiln", x: 0, y: 8 }] });
    expect(errorsOf(twoKilns)).toMatch(/exactly one KILN \(found 2\)/);
    expect(errorsOf(furnaceDeck({ items: [], routes: [] }))).toMatch(/exactly one KILN \(found 0\)/);
  });

  it("rejects unknown items and duplicate uids", () => {
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "deathray", x: 0, y: 0 }] }))).toMatch(/unknown item "deathray"/);
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "constructor", x: 0, y: 0 }] }))).toMatch(/unknown item "constructor"/);
    expect(errorsOf(furnaceDeck({ mods: [{ uid: 2, def: "nuke", turret: 0 }] }))).toMatch(/unknown item "nuke"/);
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 1, def: "temper", x: 4, y: 3 }] }))).toMatch(/uid 1 is used twice/);
  });

  it("rejects bad hardpoints, deck-placed supplies and impossible supply totals", () => {
    expect(errorsOf(furnaceDeck({ mods: [{ uid: 2, def: "calibrate", turret: 1 }] }))).toMatch(/hardpoint: uid 2 targets turret 1; FURNACE has 1/);
    expect(errorsOf(furnaceDeck({ mods: [{ uid: 2, def: "calibrate", turret: 0 }, { uid: 3, def: "chamber", turret: 0 }] }))).toMatch(/turret 0 carries more than one module/);
    expect(errorsOf(furnaceDeck({ mods: [{ uid: 2, def: "temper", turret: 0 }] }))).toMatch(/is not turret equipment/);
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "plating", x: 0, y: 0 }] }))).toMatch(/NOT DECK EQUIPMENT/);
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "calibrate", x: 0, y: 0 }] }))).toMatch(/NOT DECK EQUIPMENT/);
    expect(errorsOf(furnaceDeck({ beltCap: 15 }))).toMatch(/supply: beltCap 15/);
    expect(errorsOf(furnaceDeck({ beltCap: 10 }))).toMatch(/supply: beltCap 10/);
    // NUM-1: x10 (were 10 and -25): a hull off the 250 grid, and minus one plate
    expect(errorsOf(furnaceDeck({ hullBonus: 100 }))).toMatch(/supply: hullBonus 100 is not a whole number of \+250 plating/);
    expect(errorsOf(furnaceDeck({ hullBonus: -250 }))).toMatch(/supply: hullBonus -250 is not a whole number of \+250 plating/);
    expect(errorsOf(furnaceDeck({ items: [...furnaceDeck().items, { uid: 2, def: "press", x: 9, y: 9 }] }))).toMatch(/OFF THE DECK/);
  });

  it("rejects malformed input and bad days instead of throwing", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = { ...furnaceDeck(), extra: 1 } as any;
    expect(validateBuild(bad, 1).errors[0]).toMatch(/^shape: build.extra: unknown field/);
    expect(validateBuild(furnaceDeck(), 0).errors[0]).toMatch(/^shape: day 0/);
    expect(validateBuild(furnaceDeck(), 11).ok).toBe(false);
  });
});
