// bb-0.8.3 (REQ-BFG-042, job BELTS D1-D3, D6): a factory's belt slots grow with its level. Every factory, bought or a
// hero's signature, has 2 belt slots at ★1, 3 at ★2 and 4 at ★3 (stars.ts BELT_SLOTS, the one rule in outputsAt); the
// LOOM and GANTRY PRESS one more (3 / 4 / 5). A signature factory levels up by merging like any factory, its ★2 and ★3 on
// the house's curve (the bought factories' median per-star change). validate.ts (the upload check) and routeCheck.ts
// (FIGHT) read outputsAt at the factory's stars and agree on both sides: a factory takes its slots' worth of belts and
// refuses one more, at every star; a merged copy keeps its belts and offers its new slot at once (the editor's
// freeOutputs, routeCheck and validate agree), the hero's own KILN merged with a bought copy included.
import { describe, expect, it } from "vitest";
import { AMMO, ITEMS, type HeroId } from "../src/sim/content";
import { loadEvery, routesOf, type Build } from "../src/sim/deck";
import {
  BELT_SLOTS, effectAt, FUSE_MAX, fusible, isSignatureFactory, merges, outputsAt, perkAt, SIGNATURE_FACTORIES, starsOf,
} from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { routeProblems } from "../src/game/routeCheck";
import { validateBuild } from "../src/net/validate";
import { freeOutputs } from "../src/screens/build/edit";
import { cargoPanel, itemPanel } from "../src/screens/build/inspector";
import { gainModule, unfusedInRun } from "../src/game/fuse";
import { newRun, sellInventory, storePlaced } from "../src/game/run";
import { barge, SEED } from "./arsenal.bench";
import { K, wideDeck as deck } from "./belts.helpers";

const FACTORIES = Object.values(ITEMS).filter((d) => d.kind === "factory");
const BOUGHT = FACTORIES.filter((d) => !isSignatureFactory(d.id));
/** Each signature factory's slots at ★1 (then one more a star). */
const SIGNATURE: Record<string, number> = { kiln: 2, crucible: 2, wardworks: 2, clockworks: 2, sump: 2, loom: 3 };
/** The four playable heroes' own factories. */
const OWN = [["furnace", "kiln"], ["weaver", "loom"], ["foundry", "crucible"], ["bastion", "wardworks"]] as const;

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

describe("D1-D3: belt slots by level, the one rule (stars.ts outputsAt)", () => {
  it("every bought factory has 2 / 3 / 4 belt slots at ★1 / ★2 / ★3; GANTRY PRESS 3 / 4 / 5 (its lead)", () => {
    expect(BELT_SLOTS.slice(1)).toEqual([2, 3, 4]);
    expect(BOUGHT.map((d) => d.id).sort()).toEqual([
      "armorpress", "assembly", "doublestamp", "dragchain", "frostbite", "gantry", "hotswap", "limpet", "mimic", "press", "sabot",
      "scrapper", "shottower", "slagpot", "twinmould",
    ]);
    for (const d of BOUGHT) {
      const lead = d.id === "gantry" ? 1 : 0;
      expect([1, 2, 3].map((s) => outputsAt(d.id, s)), d.id).toEqual([2 + lead, 3 + lead, 4 + lead]);
      expect([fusible(d.id), merges(d.id)], d.id).toEqual([true, true]);
    }
    // the rule lives in outputsAt alone: no factory states a belt count, at any star
    for (const d of FACTORIES) {
      expect("outputs" in d.factory!, d.id).toBe(false);
      for (const s of [2, 3] as const) expect("outputs" in (d.levels?.[s]?.factory ?? {}), `${d.id} ★${s}`).toBe(false);
    }
    expect(FUSE_MAX).toBe(3);
    expect(Math.min(...FACTORIES.flatMap((d) => [1, 2, 3].map((s) => outputsAt(d.id, s))))).toBe(2); // the floor of 2
    expect(Math.max(...FACTORIES.map((d) => outputsAt(d.id, 1)))).toBe(3); // the LOOM and GANTRY PRESS lead
  });

  it("every signature factory levels up by merging: KILN, CRUCIBLE, WARDWORKS, CLOCKWORKS, SUMP 2 / 3 / 4; the LOOM 3 / 4 / 5", () => {
    expect([...SIGNATURE_FACTORIES].sort()).toEqual(Object.keys(SIGNATURE).sort());
    for (const [id, n] of Object.entries(SIGNATURE)) {
      // it merges (stars.ts merges), yet it is no shared part (fusible: what merchants, road events and the familiar draw)
      expect([merges(id), fusible(id), isSignatureFactory(id), ITEMS[id].merchant], id).toEqual([true, false, true, undefined]);
      expect([1, 2, 3].map((s) => outputsAt(id, s)), id).toEqual([n, n + 1, n + 2]);
      expect([perkAt(id, 2), perkAt(id, 3)], id).toEqual([undefined, undefined]); // no level adds anything new: no perk name
    }
    // WEAVER's belt specialist keeps its lead of one slot at every star
    for (const s of [1, 2, 3]) expect(outputsAt("loom", s)).toBe(Math.max(...FACTORIES.filter((d) => d.id !== "gantry").map((d) => outputsAt(d.id, s))));
  });

  // bb-0.8.3 (D2 as amended by the Prime's oracle 6c20deea1363d0bb): a signature factory's levels grow its cycle only, on
  // the house curve's interval steps; its base stays its ★1 value (its own rules multiply base)
  it("the signature levels follow the house curve's interval steps, base unchanged", () => {
    // the curve, read off content.ts: x 11/14 cycle and x 5/3 base at ★2, x 11/13 and x 17/12 at ★3 (each level that
    // changes the number counts once; a level that leaves it alone, as FROSTBITE's cycle, doesn't); signatures take the cycle's
    const [c2, c3] = curve(cycleAt), [b2, b3] = curve(baseAt);
    expect([c2, c3, b2, b3].map((x) => x.toFixed(6))).toEqual([11 / 14, 11 / 13, 5 / 3, 17 / 12].map((x) => x.toFixed(6)));
    const r2 = (x: number): number => Math.round(x * 100) / 100, half = (x: number): number => Math.round(x * 2) / 2;
    const rows: string[] = [];
    for (const id of Object.keys(SIGNATURE)) {
      const one = effectAt(id, 1).factory!, i1 = one.interval, base1 = one.base ?? AMMO[one.ammo].base;
      expect(one.base, `${id} ★1 base: its ammo's`).toBeUndefined();
      // the cycle: from the unrounded ★2, to 0.01 s
      expect([2, 3].map((s) => effectAt(id, s).factory!.interval), id).toEqual([r2(i1 * c2), r2(i1 * c2 * c3)]);
      // the base: unchanged at every star (the ammo's own)
      expect([2, 3].map((s) => effectAt(id, s).factory!.base), id).toEqual([undefined, undefined]);
      void half;
      // nothing else moves with the level: ammo, pour, lead
      for (const s of [2, 3]) {
        const { interval: _i, base: _b, ...rest } = effectAt(id, s).factory!;
        const { interval: _i1, base: _b1, ...rest1 } = one;
        expect(rest, `${id} ★${s}`).toEqual(rest1);
      }
      rows.push(`${id} ${[1, 2, 3].map((s) => `★${s} ${effectAt(id, s).factory!.interval} s / ${effectAt(id, s).factory!.base ?? base1}`).join(", ")}`);
    }
    console.log(`signature levels (cycle / base): ${rows.join("; ")}`);
    // the pour keeps its kind: the CRUCIBLE pours 2 at every star (the fuse needs a pair)
    expect([1, 2, 3].map((s) => effectAt("crucible", s).factory!.pour)).toEqual([2, 2, 2]);
  });
});

describe("validate.ts and routeCheck.ts take a factory's slots' worth of belts and refuse one more, on both sides", () => {
  it("KILN, CRUCIBLE and WARDWORKS take 2 / 3 / 4 belts at ★1 / ★2 / ★3 and refuse one more; the LOOM 3 / 4 / 5", () => {
    for (const [hero, def] of OWN) for (const s of [1, 2, 3]) {
      const n = outputsAt(def, s), ok = deck(hero, def, s, n), over = deck(hero, def, s, n + 1), id = `${def} ★${s}`;
      expect(n, id).toBe(SIGNATURE[def] + s - 1);
      expect(routesOf(ok, 7), id).toHaveLength(n);
      expect(validateBuild(ok, 10).errors, `${id}: ${n} belts`).toEqual([]); // every belt connected, the deck legal
      expect(routeProblems(ok), `${id}: ${n} belts`).toEqual([]);
      const name = ITEMS[def].name, line = `${name} uid 7 feeds ${n + 1} routes but has ${n} output(s)`;
      expect(verdict(over), `${id}: ${n + 1} belts`).toEqual({ validate: [`route: ${line}`], routeCheck: [line] });
      expect(routeProblems(over).find((p) => p.why === line)!.route, id).toBe(n); // the extra belt is the one it names
      expect([freeOutputs(ok, 7), freeOutputs({ ...ok, routes: ok.routes.slice(0, n - 1) }, 7)], id).toEqual([0, 1]);
    }
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

  it("CLOCKWORKS and SUMP (heroes not playable yet): 2 / 3 / 4 slots at ★1 / ★2 / ★3, read by routeCheck as every factory's", () => {
    const AROUND = [K(4, 5), K(5, 5), K(3, 6), K(6, 6), K(3, 7), K(6, 7), K(4, 8), K(5, 8)]; // 1-tile stubs beside (4,6)
    for (const [hero, def] of [["metronome", "clockworks"], ["siphon", "sump"]] as const) for (const s of [1, 2, 3]) {
      const n = outputsAt(def, s), stub = (k: number): Build => ({
        hero, items: [{ uid: 7, def, x: 4, y: 6, ...(s > 1 ? { stars: s } : {}) }], mods: [], beltCap: 80, hullBonus: 0,
        routes: AROUND.slice(0, k).map((c) => ({ factory: 7, cells: [c] })),
      });
      expect(n, `${def} ★${s}`).toBe(1 + s);
      expect(feeds(routeProblems(stub(n + 1)).map((p) => p.why)), `${def} ★${s}`).toEqual([`${ITEMS[def].name} uid 7 feeds ${n + 1} routes but has ${n} output(s)`]);
      expect(feeds(routeProblems(stub(n)).map((p) => p.why)), `${def} ★${s}`).toEqual([]);
    }
  });
});

describe("D1, D2, D6: a merged copy keeps its belts and offers its new slot at once", () => {
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
      // a third (GANTRY PRESS: fourth) belt into the next free intake is legal at once; one more is refused by both
      const grown = deck("weaver", d.id, 2, n + 1), over = deck("weaver", d.id, 2, n + 2);
      expect([verdict(grown), routeProblems(grown)], d.id).toEqual([{ validate: [], routeCheck: [] }, []]);
      expect(verdict(over).validate.length + verdict(over).routeCheck.length, d.id).toBe(2);
    }
  });

  it("the hero's own factory: a copy merges it to ★2 (belts kept, a slot opens), the next waits beside it, the one after makes ★3 in place", () => {
    for (const [hero, def] of OWN) {
      const run = newRun(hero as HeroId, 7, `belts-sig-${def}`);
      const n = outputsAt(def, 1);
      run.build = deck(hero, def, 1, n);
      run.inventory = [];
      const routes = JSON.stringify(run.build.routes), mine = () => run.build.items.filter((p) => p.def === def);
      expect(freeOutputs(run.build, 7), def).toBe(0);
      // a bought copy enters through gainModule at ★1 and merges with the starting copy: the placed one survives
      const g2 = gainModule(run, def);
      expect([g2.survivor, g2.stars, g2.where, mine().length, run.inventory.length], def).toEqual([7, 2, "deck", 1, 0]);
      expect(JSON.stringify(run.build.routes), def).toBe(routes);
      expect(freeOutputs(run.build, 7), def).toBe(1);
      expect([routeProblems(run.build), validateBuild(run.build, 10).errors], def).toEqual([[], []]);
      const grown = deck(hero, def, 2, n + 1);
      expect([verdict(grown), routeProblems(grown), validateBuild(grown, 10).errors], def).toEqual([{ validate: [], routeCheck: [] }, [], []]);
      // the next copy has no ★1 twin: it waits beside the ★2 (in cargo), with no unfused pair
      const wait = gainModule(run, def);
      expect([wait.steps.length, wait.stars, wait.where], def).toEqual([0, 1, "cargo"]);
      expect(unfusedInRun(run), def).toEqual([]);
      // the next merges with it to ★2, and ★2 + ★2 make ★3 where the hero's copy stands, its belts kept: 2 slots open
      const g3 = gainModule(run, def);
      expect([g3.survivor, g3.stars, g3.where, mine().length, run.inventory.length], def).toEqual([7, 3, "deck", 1, 0]);
      expect(JSON.stringify(run.build.routes), def).toBe(routes);
      expect(freeOutputs(run.build, 7), def).toBe(2);
      expect(routeProblems(run.build), def).toEqual([]);
    }
  });

  it("no copy of a signature factory sells or stows, at any star: the merged one on deck, and one waiting in cargo", () => {
    for (const [hero, def] of OWN) {
      const run = newRun(hero as HeroId, 7, `belts-keep-${def}`);
      const sig = run.build.items.find((p) => p.def === def)!;
      gainModule(run, def); // ★2 on deck
      const wait = gainModule(run, def); // ★1 waiting in cargo
      const gold = run.gold;
      expect([starsOf(run.build.items.find((p) => p.uid === sig.uid)), wait.where], def).toEqual([2, "cargo"]);
      expect(storePlaced(run, sig.uid), def).toBe(false);
      expect(sellInventory(run, wait.uid), def).toBe(0);
      expect([run.gold, run.inventory.map((i) => i.uid)], def).toEqual([gold, [wait.uid]]);
      // the panels offer neither: no TO CARGO or SELL on the deck copy, no SELL on the cargo copy (the note says why)
      expect(itemPanel(run, sig.uid, true)!.labels, def).toEqual([]);
      expect(itemPanel(run, sig.uid, true)!.title, def).toBe(`${ITEMS[def].name} ★★`);
      expect(cargoPanel(run, wait.uid, true)!.labels, def).toEqual([]);
      expect(cargoPanel(run, wait.uid, true)!.body.some((b) => b.text === "THE SIGNATURE FACTORY STAYS ABOARD. IT CAN'T BE SOLD."), def).toBe(true);
    }
  });

  it("MIMIC FORGE keeps reading the signature's ★1 cycle: it doesn't grow when the hero's factory merges", () => {
    for (const [hero, def] of OWN) for (const sigStars of [1, 2, 3]) for (const ms of [1, 2, 3]) {
      const b: Build = {
        hero, mods: [], beltCap: 80, hullBonus: 0,
        items: [{ uid: 1, def, x: 0, y: 8, ...(sigStars > 1 ? { stars: sigStars } : {}) }, { uid: 7, def: "mimic", x: 4, y: 6, ...(ms > 1 ? { stars: ms } : {}) }],
        routes: [{ factory: 7, cells: [K(4, 5)] }],
      };
      const want = ITEMS[def].factory!.interval * effectAt("mimic", ms).factory!.intervalMul!, id = `${def} ★${sigStars}, MIMIC ★${ms}`;
      const bt = new Battle(b, barge(), SEED);
      expect(bt.sides[0].factories.find((f) => f.uid === 7)!.def.factory!.interval, id).toBeCloseTo(want, 9);
      expect(bt.sides[0].factories.find((f) => f.uid === 1)!.def.factory!.interval, id).toBe(effectAt(def, sigStars).factory!.interval);
      // the build screen's estimate reads the same cycle (one belt, nothing joined)
      expect(loadEvery(b, 0), id).toBeCloseTo(want, 9);
    }
  });
});
