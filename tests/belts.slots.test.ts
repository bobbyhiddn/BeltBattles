// bb-0.8.3 (REQ-BFG-044, REQ-BFG-043; job BELTS D1-D3, D6, D10): a factory's belt slots grow with its level. A bought
// factory has 2 belt slots at ★1, 3 at ★2 and 4 at ★3 (stars.ts BELT_SLOTS, the one rule in outputsAt); GANTRY PRESS one
// more (3 / 4 / 5). A hero's signature factory never merges and has no stars: its hero's FACTORY upgrade takes it from
// level 1 to level 4, with 2 / 3 / 4 / 5 slots (the LOOM 3 / 4 / 5 / 6) and a faster cycle on the house's curve (the
// bought factories' median per-star interval change). validate.ts (the upload check) and routeCheck.ts (FIGHT) read
// outputsAt at the factory's grade (stars.ts gradeOf: the hero factory's level, any other's stars) and agree on both
// sides: a factory takes its slots' worth of belts and refuses one more, at every level; a merged copy, or a factory
// upgrade, keeps the belts and offers the new slot at once (the editor's freeOutputs, routeCheck and validate agree).
import { describe, expect, it } from "vitest";
import { AMMO, ITEMS, type HeroId } from "../src/sim/content";
import { loadEvery, routesOf, type Build } from "../src/sim/deck";
import {
  BELT_SLOTS, effectAt, FUSE_MAX, fusible, gradeOf, isSignatureFactory, outputsAt, perkAt, SIGNATURE_FACTORIES, starsOf,
} from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { routeProblems } from "../src/game/routeCheck";
import { validateBuild } from "../src/net/validate";
import { freeOutputs } from "../src/screens/build/edit";
import { itemPanel } from "../src/screens/build/inspector";
import { gainModule } from "../src/game/fuse";
import { buyUpgrade, newRun, rollShop, storePlaced } from "../src/game/run";
import { barge, SEED } from "./arsenal.bench";
import { K, wideDeck as deck } from "./belts.helpers";

const FACTORIES = Object.values(ITEMS).filter((d) => d.kind === "factory");
const BOUGHT = FACTORIES.filter((d) => !isSignatureFactory(d.id));
/** Each signature factory's slots at level 1 (then one more a level). */
const SIGNATURE: Record<string, number> = { kiln: 2, crucible: 2, wardworks: 2, clockworks: 2, sump: 2, loom: 3 };
/** The four playable heroes' own factories. */
const OWN = [["furnace", "kiln"], ["weaver", "loom"], ["foundry", "crucible"], ["bastion", "wardworks"]] as const;
const LEVELS = [1, 2, 3, 4];

/** The "feeds n routes but has m output(s)" line in a list of problems (validate's errors or routeCheck's whys). */
const feeds = (lines: string[]): string[] => lines.filter((l) => /feeds \d+ routes but has \d+ output/.test(l));

/** Does the deck take its belts: no "feeds" problem in validate.ts or routeCheck.ts (the same verdict from both). */
function verdict(b: Build): { validate: string[]; routeCheck: string[] } {
  return { validate: feeds(validateBuild(b, 10).errors), routeCheck: feeds(routeProblems(b).map((p) => p.why)) };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
/** A factory's cycle at `stars` (a MIMIC FORGE: its intervalMul, the share of the hero factory's) and its slug's base. */
const cycleAt = (id: string, s: number): number => { const f = effectAt(id, s).factory!; return f.interval * (f.intervalMul ?? 1); };
const baseAt = (id: string, s: number): number => { const f = effectAt(id, s).factory!; return f.base ?? AMMO[f.ammo].base; };
/** The house's curve: per star (★1 -> ★2, ★2 -> ★3), the median ratio over the bought factories' levels that change it. */
const curve = (at: (id: string, s: number) => number): number[] =>
  [2, 3].map((s) => median(BOUGHT.map((d) => at(d.id, s) / at(d.id, s - 1)).filter((r) => Math.abs(r - 1) > 1e-9)));

/** 1-tile stubs beside a 2x2 factory at (4,6): belts that need no intake, for a count of slots on any hull. */
const AROUND = [K(4, 5), K(5, 5), K(3, 6), K(6, 6), K(3, 7), K(6, 7), K(4, 8), K(5, 8)];
/** `hero` with its signature `def` (uid 7) at FACTORY level `level` and `k` stub belts. */
const stub = (hero: HeroId, def: string, level: number, k: number): Build => ({
  hero, items: [{ uid: 7, def, x: 4, y: 6 }], mods: [], beltCap: 80, hullBonus: 0,
  routes: AROUND.slice(0, k).map((c) => ({ factory: 7, cells: [c] })), ...(level > 1 ? { upgrades: { factory: level } } : {}),
});

describe("D1-D3, D10: belt slots by level, the one rule (stars.ts outputsAt)", () => {
  it("every bought factory has 2 / 3 / 4 belt slots at ★1 / ★2 / ★3; GANTRY PRESS 3 / 4 / 5 (its lead)", () => {
    expect(BELT_SLOTS.slice(1)).toEqual([2, 3, 4, 5]); // ★1-3, and a hero factory's level 4
    expect(BOUGHT.map((d) => d.id).sort()).toEqual([
      "armorpress", "assembly", "doublestamp", "dragchain", "frostbite", "gantry", "hotswap", "limpet", "mimic", "press", "sabot",
      "scrapper", "shottower", "slagpot", "twinmould",
    ]);
    for (const d of BOUGHT) {
      const lead = d.id === "gantry" ? 1 : 0;
      expect([1, 2, 3].map((s) => outputsAt(d.id, s)), d.id).toEqual([2 + lead, 3 + lead, 4 + lead]);
      expect(fusible(d.id), d.id).toBe(true);
      // its grade is its stars (no build level reaches it), and a 4th "star" doesn't exist: ★3's slots
      expect([gradeOf({ upgrades: { factory: 4 } }, { def: d.id, stars: 2 }), outputsAt(d.id, 4)], d.id).toEqual([2, 4 + lead]);
    }
    // the rule lives in outputsAt alone: no factory states a belt count, at any level
    for (const d of FACTORIES) {
      expect("outputs" in d.factory!, d.id).toBe(false);
      for (const s of [2, 3, 4] as const) expect("outputs" in (d.levels?.[s]?.factory ?? {}), `${d.id} ${s}`).toBe(false);
    }
    expect(FUSE_MAX).toBe(3);
    expect(Math.min(...FACTORIES.flatMap((d) => [1, 2, 3].map((s) => outputsAt(d.id, s))))).toBe(2); // the floor of 2
    expect(Math.max(...FACTORIES.map((d) => outputsAt(d.id, 1)))).toBe(3); // the LOOM and GANTRY PRESS lead
  });

  it("no signature factory merges or has stars; each has FACTORY levels 1-4: 2 / 3 / 4 / 5 slots, the LOOM 3 / 4 / 5 / 6", () => {
    expect([...SIGNATURE_FACTORIES].sort()).toEqual(Object.keys(SIGNATURE).sort());
    for (const [id, n] of Object.entries(SIGNATURE)) {
      expect([fusible(id), isSignatureFactory(id), ITEMS[id].merchant, ITEMS[id].price], id).toEqual([false, true, undefined, 0]);
      expect(LEVELS.map((l) => outputsAt(id, l)), id).toEqual([n, n + 1, n + 2, n + 3]);
      expect(LEVELS.map((l) => gradeOf({ upgrades: { factory: l } }, { def: id })), id).toEqual(LEVELS);
      expect([2, 3].map((s) => perkAt(id, s)), id).toEqual([undefined, undefined]); // no level adds anything new: no perk
    }
    // WEAVER's belt specialist keeps its lead of one slot at every level
    for (const l of LEVELS) expect(outputsAt("loom", l), `L${l}`).toBe(outputsAt("kiln", l) + 1);
  });

  // D10 (the starting shape: the Prime's oracle 6c20deea1363d0bb, D2): a FACTORY level grows the cycle only, on the house
  // curve's interval steps (x 11/14, then x 11/13, and level 4 one more step along it, x 11/13); its base stays level 1's
  it("the FACTORY levels follow the house curve's interval steps, level 4 one more step; base unchanged", () => {
    const [c2, c3] = curve(cycleAt), [b2, b3] = curve(baseAt);
    expect([c2, c3, b2, b3].map((x) => x.toFixed(6))).toEqual([11 / 14, 11 / 13, 5 / 3, 17 / 12].map((x) => x.toFixed(6)));
    const r2 = (x: number): number => Math.round(x * 100) / 100;
    const rows: string[] = [];
    for (const id of Object.keys(SIGNATURE)) {
      const one = effectAt(id, 1).factory!, i1 = one.interval;
      expect(one.base, `${id} level 1 base: its ammo's`).toBeUndefined();
      // the cycle: from the unrounded level before, to 0.01 s
      expect([2, 3, 4].map((l) => effectAt(id, l).factory!.interval), id).toEqual([r2(i1 * c2), r2(i1 * c2 * c3), r2(i1 * c2 * c3 * c3)]);
      // nothing else moves with the level: base, ammo, pour, lead
      for (const l of [2, 3, 4]) {
        const { interval: _i, ...rest } = effectAt(id, l).factory!;
        const { interval: _i1, ...rest1 } = one;
        expect(rest, `${id} L${l}`).toEqual(rest1);
      }
      rows.push(`${id} ${LEVELS.map((l) => `L${l} ${effectAt(id, l).factory!.interval} s`).join(", ")}`);
    }
    console.log(`FACTORY levels (cycle; base unchanged): ${rows.join("; ")}`);
    expect(LEVELS.map((l) => effectAt("crucible", l).factory!.pour)).toEqual([2, 2, 2, 2]); // the fuse's pair, every level
  });
});

describe("validate.ts and routeCheck.ts take a factory's slots' worth of belts and refuse one more, on both sides", () => {
  it("KILN, CRUCIBLE and WARDWORKS take 2 / 3 / 4 / 5 belts at FACTORY levels 1-4 and refuse one more; the LOOM 3 / 4 / 5 / 6", () => {
    for (const [hero, def] of OWN) for (const l of LEVELS) {
      const n = outputsAt(def, l), id = `${def} L${l}`, name = ITEMS[def].name;
      expect(n, id).toBe(SIGNATURE[def] + l - 1);
      // stubs: the slot count alone, on any hull (validate and routeCheck count belts before they connect)
      const line = `${name} uid 7 feeds ${n + 1} routes but has ${n} output(s)`;
      expect(verdict(stub(hero, def, l, n)), `${id}: ${n} belts`).toEqual({ validate: [], routeCheck: [] });
      expect(verdict(stub(hero, def, l, n + 1)), `${id}: ${n + 1} belts`).toEqual({ validate: [`route: ${line}`], routeCheck: [line] });
      expect([freeOutputs(stub(hero, def, l, n), 7), freeOutputs(stub(hero, def, l, n - 1), 7)], id).toEqual([0, 1]);
      // and a whole legal deck wherever the hull has the intakes: every belt connected
      const ok = deck(hero, def, l, n);
      if (routesOf(ok, 7).length === n && routeProblems(ok).length === 0) expect(validateBuild(ok, 10).errors, `${id}: legal`).toEqual([]);
    }
    // the level is the build's: the same deck at level 1 refuses the level-2 count
    const two = stub("furnace", "kiln", 2, 3);
    expect(verdict({ ...two, upgrades: undefined }).routeCheck).toEqual(["KILN uid 7 feeds 3 routes but has 2 output(s)"]);
  });

  it("every bought factory takes 2 belts at ★1, 3 at ★2 and 4 at ★3 (GANTRY PRESS 3 / 4 / 5) and refuses one more", () => {
    for (const d of BOUGHT) for (const s of [1, 2, 3]) {
      const n = outputsAt(d.id, s), ok = deck("weaver", d.id, s, n), over = deck("weaver", d.id, s, n + 1);
      const id = `${d.id} ★${s}`;
      expect(routesOf(ok, 7), id).toHaveLength(n);
      expect(validateBuild(ok, 10).errors, `${id}: ${n} belts`).toEqual([]);
      expect(routeProblems(ok), `${id}: ${n} belts`).toEqual([]);
      const line = `${d.name} uid 7 feeds ${n + 1} routes but has ${n} output(s)`;
      expect(verdict(over), `${id}: ${n + 1} belts`).toEqual({ validate: [`route: ${line}`], routeCheck: [line] });
      // the editor's count agrees: no free slot at n, one at n - 1
      expect([freeOutputs(ok, 7), freeOutputs({ ...ok, routes: ok.routes.slice(0, n - 1) }, 7)], id).toEqual([0, 1]);
    }
  });

  it("CLOCKWORKS and SUMP (heroes not playable yet): 2 / 3 / 4 / 5 slots at levels 1-4, read by routeCheck as every factory's", () => {
    for (const [hero, def] of [["metronome", "clockworks"], ["siphon", "sump"]] as const) for (const l of LEVELS) {
      const n = outputsAt(def, l);
      expect(n, `${def} L${l}`).toBe(1 + l);
      expect(feeds(routeProblems(stub(hero, def, l, n + 1)).map((p) => p.why)), `${def} L${l}`).toEqual([`${ITEMS[def].name} uid 7 feeds ${n + 1} routes but has ${n} output(s)`]);
      expect(feeds(routeProblems(stub(hero, def, l, n)).map((p) => p.why)), `${def} L${l}`).toEqual([]);
    }
  });
});

describe("D1, D6, D10: a merged copy or a factory upgrade keeps the belts and offers the new slot at once", () => {
  it("each bought factory: ★1 with every slot used, a bought copy merges it to ★2, the belts stay, one slot opens (edit, routeCheck, validate)", () => {
    for (const d of BOUGHT) {
      const run = newRun("weaver", 7, `belts-merge-${d.id}`);
      const n = outputsAt(d.id, 1);
      run.build = deck("weaver", d.id, 1, n);
      run.inventory = [];
      const routes = JSON.stringify(run.build.routes);
      expect(freeOutputs(run.build, 7), d.id).toBe(0);
      gainModule(run, d.id);
      const f = run.build.items.find((p) => p.def === d.id)!;
      expect([f.uid, starsOf(f)], d.id).toEqual([7, 2]);
      expect(JSON.stringify(run.build.routes), d.id).toBe(routes); // its belts survive the merge
      expect(freeOutputs(run.build, 7), d.id).toBe(1); // ★2 offers its new slot at once
      expect(routeProblems(run.build), d.id).toEqual([]);
      const grown = deck("weaver", d.id, 2, n + 1), over = deck("weaver", d.id, 2, n + 2);
      expect([verdict(grown), routeProblems(grown)], d.id).toEqual([{ validate: [], routeCheck: [] }, []]);
      expect(verdict(over).validate.length + verdict(over).routeCheck.length, d.id).toBe(2);
    }
  });

  it("the hero's own factory: each FACTORY upgrade keeps its belts and opens one slot at once, up to level 4", () => {
    for (const [hero, def] of OWN) {
      const run = newRun(hero as HeroId, 7, `belts-up-${def}`);
      run.gold = 200;
      const n = outputsAt(def, 1);
      run.build = stub(hero, def, 1, n);
      const routes = JSON.stringify(run.build.routes);
      expect(freeOutputs(run.build, 7), def).toBe(0);
      for (const l of [2, 3, 4]) {
        expect(buyUpgrade(run, "factory").ok, `${def} L${l}`).toBe(true);
        expect(JSON.stringify(run.build.routes), def).toBe(routes); // the belts stay as they were
        expect(freeOutputs(run.build, 7), `${def} L${l}`).toBe(l - 1); // the new slot at once
        expect(verdict(run.build), `${def} L${l}`).toEqual({ validate: [], routeCheck: [] });
        expect(itemPanel(run, 7)!.sub, `${def} L${l}`).toBe(`FACTORY · BELTS ${n}/${n + l - 1}`);
      }
      // the hero's factory is never merged into and never leaves the deck
      expect([run.build.items.filter((p) => p.def === def).length, storePlaced(run, 7)], def).toEqual([1, false]);
    }
  });

  it("MIMIC FORGE keeps reading the signature factory's level-1 cycle: it doesn't grow with the FACTORY upgrade", () => {
    for (const [hero, def] of OWN) for (const level of LEVELS) for (const ms of [1, 2, 3]) {
      const b: Build = {
        hero, mods: [], beltCap: 80, hullBonus: 0,
        items: [{ uid: 1, def, x: 0, y: 8 }, { uid: 7, def: "mimic", x: 4, y: 6, ...(ms > 1 ? { stars: ms } : {}) }],
        routes: [{ factory: 7, cells: [K(4, 5)] }], ...(level > 1 ? { upgrades: { factory: level } } : {}),
      };
      const want = ITEMS[def].factory!.interval * effectAt("mimic", ms).factory!.intervalMul!, id = `${def} L${level}, MIMIC ★${ms}`;
      const bt = new Battle(b, barge(), SEED);
      expect(bt.sides[0].factories.find((f) => f.uid === 7)!.def.factory!.interval, id).toBeCloseTo(want, 9);
      expect(bt.sides[0].factories.find((f) => f.uid === 1)!.def.factory!.interval, id).toBe(effectAt(def, level).factory!.interval);
      // the build screen's estimate reads the same cycle (one belt, nothing joined)
      expect(loadEvery(b, 0), id).toBeCloseTo(want, 9);
    }
  });

  it("the caravan never offers the hero's factory (D9 is void): no hero's caravan, any day, any reroll", () => {
    for (const [hero, def] of OWN) for (let seed = 1; seed <= 40; seed++) for (const day of [3, 5, 7, 9]) {
      const run = newRun(hero as HeroId, seed, `belts-noffer-${seed}`);
      run.day = day;
      for (let r = 0; r < 3; r++) {
        run.shop.rerolls = r;
        rollShop(run);
        expect(run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def)), `${def} ${seed} d${day} r${r}`).not.toContain(def);
      }
    }
  });
});
