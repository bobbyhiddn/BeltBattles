// SHOCK-1 (REQ-BFG-033; SHOCK-1D section 5.3 items 1-4; BRIEF-SHOCK1 B4): the EFFECT FLOOR in the per-run ware draw (src/game/wares.ts holdEffects),
// behind EFFECT_FLOOR (src/sim/effectFloor.ts). The switch ships OFF in this job. The rules bump after bb-0.13.0 turns it on; it re-pins what is marked
// FREEZE below (the digests, the two counts, the catalogue size and the switch's own pin: the bump's content changes the draw anyway) and absorbs the redraw
// (about 5% of seeds, one ware each) in its one regeneration. Everything else here holds for any catalogue.
//
//  1. OFF = THE FREEZE. With the switch off, drawWares on the 2,000 table seeds (tests/b1.smuggler.test.ts: hashSeed("i1-smuggler", i + 1)) and on SHOCK-1D's
//     10,000 sweep seeds (hashSeed("shock1d-big", i + 1)) matches two digests taken at d848af4cc0f7 (the bb-0.13.0 freeze) BEFORE a line of the floor was
//     written: this file's digestOf, run as a throwaway test in a `git archive` export of that commit (SHOCK-1 job, W/output-shock1/scripts/zz.digest.test.ts,
//     result W/output-shock1/digest-base.txt): sha256 over "<seed>:<JSON of drawWares(seed)>\n" for the seeds in order (the JSON keeps the catalogue's key order).
//  2. ON, THE GUARANTEE. No run draws none of the SMUGGLER's SHOCK pool or none of its BURN pool: on the table seeds, on the sweep, and on the table seeds again
//     with +10 and +20 synthetic buyable gates in the catalogue (three mixes; the helper is SHOCK-1D's zz.opts.test.ts withGrowth). The SMUGGLER's card never
//     reads NONE ON OFFER.
//  3. FOOTPRINT AND INVARIANTS on the 10,000 sweep seeds (SHOCK-1D's zz.floorcheck.test.ts, against the off draw in the same process): only runs that lacked a
//     kind change; one ware in and one out per missing kind; the incoming piece is in its pool; the victim is no pool piece, shaped rig, gate or held ware; the
//     size, the merchant shares, the rarity shares, the restock count and days, and every kept ware's day are unchanged; the day-1 pool moves by at most 1 a kind;
//     deterministic; hero-blind (newRun's wares are the same for the six heroes, switch on).
//  4. THE POOL TRIPWIRE. Each pool holds at least 3 pieces, so a rework that empties one (QUENCH TANK left BURN's at bb-0.12.0) fails loudly, not silently.
// The harness trap (SHOCK-1D section 7): a test that imports only wares.ts and rng.ts loads a SMALLER catalogue (the switches' modules never run). This file
// imports eventDefs.ts and run.ts, and asserts the size.
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hashSeed } from "../src/core/rng";
import { ITEMS, buyableModules, type HeroId, type ItemDef, type MerchantId, type Rarity } from "../src/sim/content";
import { DRAW, drawWares, heldPast, unlockDay, type Wares } from "../src/game/wares";
import { newRun } from "../src/game/run";
import { smugglerParts, smugglerPool, type SmugglerKind } from "../src/game/eventDefs";
import { isShapedRig } from "../src/sim/shapes2";
import { isGatesPiece } from "../src/sim/gates";
import { clearStarCache } from "../src/sim/stars";
import { EFFECT_FLOOR, EFFECT_FLOOR_ODDS, effectFloorRules, withEffectFloor } from "../src/sim/effectFloor";

const TABLE_SEEDS = Array.from({ length: 2000 }, (_, i) => hashSeed("i1-smuggler", i + 1));
const SWEEP_SEEDS = Array.from({ length: 10000 }, (_, i) => hashSeed("shock1d-big", i + 1));
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"];
const KINDS: SmugglerKind[] = ["SHOCK", "BURN"];

// FREEZE: d848af4cc0f7's draws (the bb-0.13.0 catalogue: 113 buyable modules, GATES, ENCHANT, SCALE_RIGS, SHAPES2, PLAIN_RIGS, LONG_RUN all on)
const FREEZE_MODULES = 113;
const FREEZE_TABLE_DIGEST = "27881a8f9bd482aed4de2a5b4ef922292a756fbd568d75677dcd660df815f7c4";
const FREEZE_SWEEP_DIGEST = "f2ed41d3755a0cf0663648e865673d01c0379bcdccc399984b24cfa9e5edc764";
const FREEZE_NO_SHOCK = 77; // of the 2,000 table runs (3.85%; SHOCK-1D opts-base.txt): the SMUGGLER's SHOCK card reads NONE ON OFFER
const FREEZE_NO_BURN = 18; // of the 2,000 table runs (0.90%)

const has = (w: Wares, id: string): boolean => Object.prototype.hasOwnProperty.call(w, id);
const memo = <T>(make: () => T): (() => T) => { let v: T | undefined; return () => (v ??= make()); };
const drawAll = (seeds: readonly number[], on: boolean): Wares[] => withEffectFloor(() => seeds.map((s) => drawWares(s)), on);
const tableOff = memo(() => drawAll(TABLE_SEEDS, false)), tableOn = memo(() => drawAll(TABLE_SEEDS, true));
const sweepOff = memo(() => drawAll(SWEEP_SEEDS, false)), sweepOn = memo(() => drawAll(SWEEP_SEEDS, true));

/** sha256 of "<seed>:<JSON of the wares>\n" for each seed in order (the same text as the throwaway that took the FREEZE digests). */
const digestOf = (seeds: readonly number[], draws: readonly Wares[]): string => {
  const h = createHash("sha256");
  seeds.forEach((s, i) => h.update(`${s}:${JSON.stringify(draws[i])}\n`));
  return h.digest("hex");
};

type Pools = Record<SmugglerKind, string[]>;
const poolsNow = (): Pools => ({ SHOCK: smugglerPool("SHOCK"), BURN: smugglerPool("BURN") });
/** The kinds whose pool the run's wares hold none of (in SHOCK, BURN order). */
const lacks = (w: Wares, p: Pools): SmugglerKind[] => KINDS.filter((k) => !p[k].some((id) => has(w, id)));
const countLacking = (draws: readonly Wares[], p: Pools): Record<SmugglerKind, number> => ({
  SHOCK: draws.filter((w) => lacks(w, p).includes("SHOCK")).length,
  BURN: draws.filter((w) => lacks(w, p).includes("BURN")).length,
});

/** A tally of what was found wrong, by name, with the first seed that showed it. */
function ledger() {
  const n: Record<string, number> = {}, first: Record<string, number> = {};
  return {
    hit(what: string, seed: number): void { n[what] = (n[what] ?? 0) + 1; first[what] ??= seed; },
    report: (): Record<string, string> => Object.fromEntries(Object.entries(n).map(([k, c]) => [k, `${c} runs, first seed ${first[k]}`])),
  };
}

// --- SHOCK-1D's withGrowth (tests/zz.opts.test.ts there): synthetic buyable 1-star gates added to the catalogue, in three mixes ---
interface Cell { merchant: MerchantId; rarity: Rarity }
/** `k` cells in proportion to today's (merchant, rarity) cells (largest remainders). */
function neutralPlan(k: number): Cell[] {
  const mods = buyableModules();
  const cells = new Map<string, number>();
  for (const d of mods) cells.set(`${d.merchant}|${d.rarity}`, (cells.get(`${d.merchant}|${d.rarity}`) ?? 0) + 1);
  const rows = [...cells.entries()].map(([key, n]) => ({ key, exact: (n * k) / mods.length }));
  const base = rows.map((r) => Math.floor(r.exact));
  let left = k - base.reduce((a, b) => a + b, 0);
  const order = rows.map((r, i) => ({ i, f: r.exact - Math.floor(r.exact) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (const o of order) { if (left <= 0) break; base[o.i]++; left--; }
  return rows.flatMap((r, i) => Array.from({ length: base[i] }, (): Cell => { const [merchant, rarity] = r.key.split("|"); return { merchant: merchant as MerchantId, rarity: rarity as Rarity }; }));
}
/** The last five releases' habit: per 10 pieces 3 to the ALCHEMIST (2 rare), 2 to the ARCANE DEALER (1 rare), 5 spread over the other merchants. */
const ALCH_CYCLE: Cell[] = [
  { merchant: "alchemist", rarity: "rare" }, { merchant: "alchemist", rarity: "rare" }, { merchant: "alchemist", rarity: "common" },
  { merchant: "arcane", rarity: "common" }, { merchant: "arcane", rarity: "rare" }, { merchant: "gunsmith", rarity: "common" },
  { merchant: "tinker", rarity: "rare" }, { merchant: "scrapper", rarity: "common" }, { merchant: "ironmonger", rarity: "rare" },
  { merchant: "quartermaster", rarity: "common" },
];
/** The worst case: per 10 pieces 5 ALCHEMIST rare, 3 ARCANE rare, 2 ARCANE common (all in the SHOCK pool's tiers). */
const ADVERSE_CYCLE: Cell[] = [
  { merchant: "alchemist", rarity: "rare" }, { merchant: "alchemist", rarity: "rare" }, { merchant: "alchemist", rarity: "rare" },
  { merchant: "alchemist", rarity: "rare" }, { merchant: "alchemist", rarity: "rare" }, { merchant: "arcane", rarity: "rare" },
  { merchant: "arcane", rarity: "rare" }, { merchant: "arcane", rarity: "rare" }, { merchant: "arcane", rarity: "common" },
  { merchant: "arcane", rarity: "common" },
];
const cyclePlan = (c: Cell[]) => (k: number): Cell[] => Array.from({ length: k }, (_, i) => c[i % c.length]);
const MIXES: { name: string; plan: (k: number) => Cell[] }[] = [
  { name: "neutral", plan: neutralPlan }, { name: "alchemist-heavy", plan: cyclePlan(ALCH_CYCLE) }, { name: "adverse", plan: cyclePlan(ADVERSE_CYCLE) },
];

/** Run `fn` with `plan`'s synthetic gates in the catalogue, then take them out (the ITEMS key order is as it was: tests/setup/itemsGuard.ts). */
function withGrowth<T>(plan: Cell[], fn: () => T): T {
  const items = ITEMS as Record<string, ItemDef>;
  const added: string[] = [];
  try {
    plan.forEach((c, i) => {
      const id = `syn${i}`;
      items[id] = { id, name: id.toUpperCase(), kind: "gate", rarity: c.rarity, price: 5, size: 1, merchant: c.merchant, desc: [], tags: ["FORGE"], gate: { flat: 5 } } as unknown as ItemDef;
      added.push(id);
    });
    clearStarCache();
    return fn();
  } finally {
    for (const id of added) delete items[id];
    clearStarCache();
  }
}

describe("the harness: the shipped catalogue is loaded (SHOCK-1D section 7's trap)", () => {
  it("this file sees at least bb-0.13.0's 113 buyable modules, and the SMUGGLER's pools", () => {
    expect(buyableModules().length).toBeGreaterThanOrEqual(FREEZE_MODULES);
    expect(smugglerPool("SHOCK").length).toBeGreaterThan(0);
    expect(smugglerPool("BURN").length).toBeGreaterThan(0);
  });
});

describe("EFFECT_FLOOR off: the draw is the freeze's (SHOCK-1D 5.3 item 1)", () => {
  it("drawWares on the 2,000 table seeds and the 10,000 sweep seeds matches the digests taken at d848af4cc0f7 before the floor was written", () => {
    expect(buyableModules().length).toBe(FREEZE_MODULES); // FREEZE: the digests are of this catalogue
    expect(digestOf(TABLE_SEEDS, tableOff())).toBe(FREEZE_TABLE_DIGEST);
    expect(digestOf(SWEEP_SEEDS, sweepOff())).toBe(FREEZE_SWEEP_DIGEST);
  }, 120000);

  it("the freeze's reading of the table: 77 runs draw no SHOCK ware and 18 no BURN ware (the SMUGGLER's NONE ON OFFER; SHOCK-1D opts-base.txt)", () => {
    const n = countLacking(tableOff(), poolsNow());
    expect([n.SHOCK, n.BURN]).toEqual([FREEZE_NO_SHOCK, FREEZE_NO_BURN]); // FREEZE
  }, 60000);

  it("the switch ships off (the rules bump flips this pin), and the game's own newRun draws the off draw", () => {
    expect(EFFECT_FLOOR).toBe(false); // FREEZE: the bump turns the switch on and this pin with it
    expect(effectFloorRules()).toBe(EFFECT_FLOOR);
    const off = tableOff();
    for (const i of [0, 7, 99, 1234]) expect(newRun("furnace", TABLE_SEEDS[i], "effectfloor").wares, `table seed ${i}`).toEqual(off[i]);
  }, 60000);
});

describe("EFFECT_FLOOR on: no run draws none of SHOCK or none of BURN (SHOCK-1D 5.3 item 2)", () => {
  it("the 2,000 table seeds", () => {
    const n = countLacking(tableOn(), poolsNow());
    expect([n.SHOCK, n.BURN]).toEqual([0, 0]);
  }, 60000);

  it("a 10,000-seed sweep", () => {
    const n = countLacking(sweepOn(), poolsNow());
    expect([n.SHOCK, n.BURN]).toEqual([0, 0]);
    const off = countLacking(sweepOff(), poolsNow());
    expect(off.SHOCK + off.BURN, "the sweep has runs the floor must fix (else this test could not fail)").toBeGreaterThan(0);
  }, 120000);

  it("the table seeds again with +10 and +20 synthetic buyable gates in the catalogue (neutral, alchemist-heavy and adverse mixes): the floor holds as the catalogue grows", () => {
    const size = buyableModules().length;
    for (const mix of MIXES) {
      for (const k of [10, 20]) {
        withGrowth(mix.plan(k), () => {
          expect(buyableModules().length, `${mix.name} +${k}: the gates are in the catalogue`).toBe(size + k);
          const n = countLacking(drawAll(TABLE_SEEDS, true), poolsNow());
          expect([n.SHOCK, n.BURN], `${mix.name} +${k}`).toEqual([0, 0]);
          if (mix.name === "adverse" && k === 20) {
            const off = countLacking(drawAll(TABLE_SEEDS, false), poolsNow());
            expect(off.SHOCK, "without the floor the adverse +20 world loses SHOCK in some runs (the floor is what holds it)").toBeGreaterThan(0);
          }
        });
      }
    }
    expect(buyableModules().length).toBe(size); // the gates are out again
  }, 240000);

  it("the SMUGGLER's card reads NONE ON OFFER in no table run, on day 1 or day 10; without the floor it does in some", () => {
    const blocked = (draws: readonly Wares[]): number => draws.filter((w) => [1, 10].some((day) => smugglerParts(0.5, { wares: w, day }).some((p) => p === undefined))).length;
    expect(blocked(tableOn())).toBe(0);
    expect(blocked(tableOff())).toBeGreaterThan(0);
  }, 60000);
});

describe("EFFECT_FLOOR on: the footprint and the invariants (SHOCK-1D 5.3 item 3; 10,000 seeds)", () => {
  const tally = (w: Wares, f: (id: string) => string): string => {
    const o: Record<string, number> = {};
    for (const id of Object.keys(w)) o[f(id)] = (o[f(id)] ?? 0) + 1;
    return JSON.stringify(Object.entries(o).sort());
  };
  const onDay = (w: Wares, day: number): number => Object.values(w).filter((d) => d === day).length;
  const day1 = (w: Wares): number => Object.values(w).filter((d) => d <= 1).length;

  it("only runs that lacked a kind change, by one ware in and one out per missing kind; the incoming piece is in its pool, the victim is none of the guarded kinds; size, shares, restocks and every kept ware's day hold; the day-1 pool moves by at most 1 a kind", () => {
    const p = poolsNow();
    const guarded = new Set([...p.SHOCK, ...p.BURN]);
    const offs = sweepOff(), ons = sweepOn(), L = ledger();
    let changed = 0, both = 0;
    SWEEP_SEEDS.forEach((seed, i) => {
      const was = offs[i], now = ons[i];
      const missing = lacks(was, p);
      if (!missing.length) { if (JSON.stringify(now) !== JSON.stringify(was)) L.hit("a run that lacked nothing changed", seed); return; }
      changed++;
      if (missing.length === 2) both++;
      const added = Object.keys(now).filter((id) => !has(was, id)), dropped = Object.keys(was).filter((id) => !has(now, id));
      if (added.length !== missing.length || dropped.length !== missing.length) L.hit("not one ware in and one out per missing kind", seed);
      for (const k of missing) if (added.filter((id) => p[k].includes(id)).length !== 1) L.hit("a missing kind did not get exactly one piece of its pool", seed);
      for (const id of added) {
        if (!missing.some((k) => p[k].includes(id))) L.hit("a piece came in from outside the missing kinds' pools", seed);
        // it opens on its seat's day, or takes the day of the restock its victim waited for; the ARCANE DEALER's and legendary pieces never wait
        const never = ITEMS[id].merchant === "arcane" || ITEMS[id].rarity === "legendary";
        if (now[id] !== unlockDay(id, undefined) && (never || !DRAW.lateDays.includes(now[id]))) L.hit("the incoming piece opens on a day it may not", seed);
      }
      for (const id of dropped) {
        if (guarded.has(id)) L.hit("the victim was a piece of a pool", seed);
        if (isShapedRig(ITEMS[id])) L.hit("the victim was a shaped rig", seed);
        if (isGatesPiece(id)) L.hit("the victim was a gate", seed);
        if (heldPast(id)) L.hit("the victim was held past its seat's day", seed);
      }
      if (Object.keys(now).length !== Object.keys(was).length) L.hit("the run's size moved", seed);
      if (tally(now, (id) => ITEMS[id].merchant ?? "") !== tally(was, (id) => ITEMS[id].merchant ?? "")) L.hit("a merchant's share moved", seed);
      if (tally(now, (id) => ITEMS[id].rarity) !== tally(was, (id) => ITEMS[id].rarity)) L.hit("a rarity's share moved", seed);
      for (const day of DRAW.lateDays) if (onDay(now, day) !== onDay(was, day)) L.hit(`the day-${day} restock count moved`, seed);
      for (const id of Object.keys(now)) if (has(was, id) && now[id] !== was[id]) L.hit("a kept ware's day moved", seed);
      if (Math.abs(day1(now) - day1(was)) > missing.length) L.hit("the day-1 pool moved by more than 1 a kind", seed);
    });
    expect(L.report()).toEqual({});
    expect(changed, "the floor redraws some runs (else this test could not fail)").toBeGreaterThan(0);
    expect(changed / SWEEP_SEEDS.length, "about 5% of runs at bb-0.13.0 (SHOCK-1D: 4.55% of these seeds)").toBeLessThan(0.1);
    expect(both).toBeLessThanOrEqual(changed);
  }, 120000);

  it("a piece that never waits for a restock (the ARCANE DEALER's, a legendary) never takes a restock day, also in a small draw where the floor finds no victim of its own tier", () => {
    // the shipped draw always has an ARCANE DEALER piece or two to swap, so the rule's restock-allowed steps are never reached; a draw of 10 wares (every
    // eligible piece a restock ware, usually no arcane piece at all) reaches them: the incoming LODESTONE then has no victim that is not a restock ware
    const small = { ...DRAW, active: 10, late: 10 };
    const p = poolsNow(), L = ledger();
    withEffectFloor(() => {
      for (const seed of TABLE_SEEDS) {
        const w = drawWares(seed, small);
        if (lacks(w, p).length) L.hit("a run lacks a kind", seed);
        for (const id of Object.keys(w)) if ((ITEMS[id].merchant === "arcane" || ITEMS[id].rarity === "legendary") && DRAW.lateDays.includes(w[id])) L.hit("a piece that never waits is a restock ware", seed);
      }
    }, true);
    expect(L.report()).toEqual({});
  }, 60000);

  it("deterministic: the same seed draws the same wares", () => {
    const on = tableOn();
    for (let i = 0; i < 500; i++) expect(JSON.stringify(withEffectFloor(() => drawWares(TABLE_SEEDS[i]), true)), `table seed ${i}`).toBe(JSON.stringify(on[i]));
  }, 60000);

  it("hero-blind: newRun's wares are the same for the six heroes on 300 seeds (150 the floor redraws, 150 it leaves alone), and are the draw's", () => {
    const offs = sweepOff(), ons = sweepOn();
    const redrawn = SWEEP_SEEDS.map((_, i) => i).filter((i) => JSON.stringify(ons[i]) !== JSON.stringify(offs[i])).slice(0, 150);
    const quiet = SWEEP_SEEDS.map((_, i) => i).filter((i) => JSON.stringify(ons[i]) === JSON.stringify(offs[i])).slice(0, 150);
    expect(redrawn.length).toBe(150);
    const L = ledger();
    withEffectFloor(() => {
      for (const i of [...redrawn, ...quiet]) {
        const want = JSON.stringify(ons[i]);
        for (const hero of HEROES) if (JSON.stringify(newRun(hero, SWEEP_SEEDS[i], "effectfloor").wares) !== want) L.hit(`${hero}'s wares differ from the draw`, SWEEP_SEEDS[i]);
      }
    }, true);
    expect(L.report()).toEqual({});
  }, 120000);
});

describe("the pool tripwire (SHOCK-1D 5.3 item 4)", () => {
  it("each of the SMUGGLER's pools holds at least 3 pieces, so a rework that empties one fails here, not silently in the floor", () => {
    expect(smugglerPool("SHOCK").length).toBeGreaterThanOrEqual(3);
    expect(smugglerPool("BURN").length).toBeGreaterThanOrEqual(3);
  });
});

describe("the switch (src/sim/effectFloor.ts)", () => {
  it("withEffectFloor turns the floor on or off for one call and puts the switch back, also on a throw", () => {
    const was = effectFloorRules();
    expect(withEffectFloor(() => effectFloorRules(), true)).toBe(true);
    expect(withEffectFloor(() => effectFloorRules(), false)).toBe(false);
    expect(() => withEffectFloor(() => { throw new Error("boom"); }, !was)).toThrow("boom");
    expect(effectFloorRules()).toBe(was);
    expect(withEffectFloor(() => withEffectFloor(() => effectFloorRules(), false), true)).toBe(false);
    expect(effectFloorRules()).toBe(was);
  });

  it("the floor is built for one piece of each kind (minStock 1): a larger depth is not built, so the knob stays where the build is", () => {
    expect(EFFECT_FLOOR_ODDS.minStock).toBe(1);
  });
});
