// 0.6.1c M5 (brief-0.6.1c "Road-item pools" and "One shared pool"; ARSENAL.md §5.2, last paragraph):
// SALVAGE, SMUGGLER and the trader's SWAP draw from pools read off the catalogue, and no roll that
// offers a part reads the hero or race. The badge checks call run.ts:shopBadge, the function the event
// screen draws each item choice's badge with (screens/event/event.ts).

import { describe, expect, it } from "vitest";
import {
  EVENTS, SALVAGE_OWNED, SWAP_TIER, UPGRADE, salvagePart, salvagePool, smugglerPool, type Choice, type EventId,
} from "../src/game/eventDefs";
import { choicesFor, makeEvent, pickChoice } from "../src/game/events";
import { migrateRun, newRun, rollShop, shopBadge, type Run } from "../src/game/run";

/**
 * 0.8.0 I1 M3 (oracle 47ddf8622ecd67d9): an old save, a run with no wares, whose road grants read the whole catalogue
 * (today's rule; eventDefs.ts inWares): the game's newRun without its wares, the day-1 caravan rolled exactly as newRun
 * rolled it before the per-run draw. Only the tests marked "(old save)" use it; every other test plays the live draw.
 */
function oldSaveRun(hero: Parameters<typeof newRun>[0], seed: number, runId?: string): Run {
  const run = newRun(hero, seed, runId);
  delete run.wares;
  run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
  rollShop(run);
  return run;
}
import { ITEMS, RARITIES, buyableModules, type HeroId, type ItemDef } from "../src/sim/content";
import { DORMANT_ITEMS } from "../src/sim/races/data";
import { fusible } from "../src/sim/stars";
import { hitsOfRig, key, startingTurrets, type ModPlacement, type Placed } from "../src/sim/deck";
import { routeProblems } from "../src/game/routeCheck"; // 0.6.2 BELTSIDE merge (0.6.1c)
import { ownSignatureCard, sharedDef, sharedWagons } from "./belts.shared"; // bb-0.8.3 (REQ-BFG-042 D9): REQ-BFG-021 narrowed

const SEEDS = Array.from({ length: 300 }, (_, i) => 1 + i * 7919);
const DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HEROES2: HeroId[] = ["furnace", "weaver"];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Held = readonly (string | readonly [string, number])[];

/** Every merchant-sold module, including future race modules, excluding dormant prototypes. */
const buyable = (): ItemDef[] =>
  Object.values(ITEMS).filter((d) => !!d.merchant && d.price > 0 && ["gate", "factory", "mod", "core"].includes(d.kind) && !DORMANT_ITEMS.has(d.id));
const ids = (ds: ItemDef[]) => ds.map((d) => d.id);

/** A Furnace run on the road on `day` with event `id`, 20 gold and the parts `held` in cargo. 0.8.0 I1 M3 (oracle
 *  47ddf8622ecd67d9): `old`, an old save's run (oldSaveRun: today's rule), for the "(old save)" tests. */
function atEvent(id: EventId, seed: number, day: number, held: Held = [], old = false): Run {
  const run = (old ? oldSaveRun : newRun)("furnace", seed);
  run.day = day;
  run.gold = 20;
  for (const h of held) {
    const [def, stars] = typeof h === "string" ? [h, 1] : h;
    run.inventory.push({ uid: run.nextUid++, def, ...(stars > 1 ? { stars } : {}) });
  }
  run.event = makeEvent(seed, day, id);
  run.stage = "event";
  return run;
}
const gainOf = (c: Choice | undefined): string | undefined => {
  const d = c?.gain.find((q) => q.k === "item");
  return d && d.k === "item" ? d.def : undefined;
};
const starsHeld = (run: Run, def: string) =>
  [...run.inventory, ...run.build.items, ...run.build.mods].filter((c) => c.def === def).map((c) => c.stars ?? 1);
const salvageOf = (run: Run) => gainOf(choicesFor(run)[0])!;

describe("road-item pools read off the catalogue (ARSENAL.md §5.2)", () => {
  it("SALVAGE's pool is every buyable common gate: 0.6.1's TEMPER, WHETSTONE, GREASE WORKS and BRAKE SHOE", () => {
    expect(salvagePool()).toEqual(ids(buyable().filter((d) => d.kind === "gate" && d.rarity === "common")));
    expect(salvagePool()).toContain("sifter");
    expect(salvagePool()).toContain("tollbooth");
  });

  // 0.8.0 P1 (family map v2, DESIGN-wave3.md 2.5; the brief's SMUGGLER keying exception): the pools are keyed on what a
  // gate's effect does, not on the BURN and SHOCK tags v2 retired. The picks stay the same six rigs.
  const BURNS = (d: ItemDef) => !!(d.gate?.burn || d.gate?.burnPerRide || d.gate?.quench);
  const SHOCKS = (d: ItemDef) => !!(d.gate?.shock || d.gate?.staticTime || d.gate?.perStalled);
  it("SMUGGLER's BURN and SHOCK pools are the gates whose effect burns or shocks (0.6.1: TEMPER, GALVANIC COIL); prices stay 2 and 3 (old save)", () => {
    for (const [kind, test] of [["BURN", BURNS], ["SHOCK", SHOCKS]] as const) {
      expect(smugglerPool(kind)).toEqual(ids(buyable().filter((d) => d.kind === "gate" && test(d))));
    }
    expect(smugglerPool("BURN")).toEqual(["temper", "bellows", "quench"]);
    expect(smugglerPool("SHOCK")).toEqual(["coil", "staticbrush", "lodestone"]);
    for (const seed of SEEDS.slice(0, 50)) for (const day of DAYS) {
      const [burn, shock] = choicesFor(atEvent("smuggler", seed, day, [], true)); // 0.8.0 I1 M3: old save
      expect([burn.label, burn.cost]).toEqual(["BURN", [{ k: "gold", n: 2 }]]);
      expect([shock.label, shock.cost]).toEqual(["SHOCK", [{ k: "gold", n: 3 }]]);
      expect(smugglerPool("BURN")).toContain(gainOf(burn));
      expect(smugglerPool("SHOCK")).toContain(gainOf(shock));
    }
  });

  it("a gate given a burn or shock effect later joins SMUGGLER's pools with no code change, every BURN/SHOCK pairing shows, never one gate twice (old save)", () => {
    const whet = ITEMS.whetstone.gate, grease = ITEMS.grease.gate;
    try {
      ITEMS.whetstone.gate = { ...whet, burn: 1 };
      ITEMS.grease.gate = { ...grease, shock: true };
      expect(smugglerPool("BURN")).toContain("whetstone");
      expect(smugglerPool("SHOCK")).toContain("grease");
      const pairs = new Set<string>();
      for (const seed of SEEDS.slice(0, 200)) {
        const [burn, shock] = choicesFor(atEvent("smuggler", seed, 5, [], true)).map(gainOf); // 0.8.0 I1 M3: old save
        expect(burn).not.toBe(shock);
        pairs.add(`${burn}+${shock}`);
      }
      const wanted = smugglerPool("BURN").flatMap((b) => smugglerPool("SHOCK").filter((s) => s !== b).map((s) => `${b}+${s}`));
      expect([...pairs].sort()).toEqual(wanted.sort());
    } finally {
      ITEMS.whetstone.gate = whet;
      ITEMS.grease.gate = grease;
    }
  });

  it("UPGRADE[r] holds every buyable fusible part of rarity r: gates, factories, mods and cores", () => {
    for (const r of RARITIES) expect(UPGRADE[r], r).toEqual(ids(buyable().filter((d) => d.rarity === r)));
    for (const r of RARITIES) for (const id of UPGRADE[r]) expect(fusible(id), id).toBe(true);
    const all = RARITIES.flatMap((r) => UPGRADE[r]);
    for (const kind of ["gate", "factory", "mod", "core"]) expect(all.some((id) => ITEMS[id].kind === kind), kind).toBe(true);
  });

  it("no supply, signature or dormant item is in any pool; sold timing gear joins", () => {
    const pools = () => [salvagePool(), smugglerPool("BURN"), smugglerPool("SHOCK"), ...RARITIES.map((r) => UPGRADE[r])].flat();
    const bad = (id: string) => ITEMS[id].kind === "supply" || ITEMS[id].price <= 0 || DORMANT_ITEMS.has(id) || !ITEMS[id].merchant;
    expect(pools().filter(bad)).toEqual([]);
    for (const id of ["kiln", "loom", "beltcrate", "plating", ...DORMANT_ITEMS]) expect(pools(), id).not.toContain(id);
    for (const id of ["escapement", "longcase"]) expect(pools()).toContain(id);
    const hopper = ITEMS.hopper, sold = hopper.merchant;
    try {
      delete hopper.merchant; // read when used: a part leaves with its merchant and joins again with it
      expect(UPGRADE.common).not.toContain("hopper");
      hopper.merchant = sold;
      expect(UPGRADE.common).toContain("hopper");
      const crucible = ITEMS.crucible;
      const price = crucible.price;
      try {
        crucible.price = 5;
        crucible.merchant = "ironmonger";
        expect(UPGRADE.epic).toContain("crucible"); // no race-identity filter
        expect(buyableModules().map((d) => d.id)).toContain("crucible");
      } finally {
        crucible.price = price;
        delete crucible.merchant;
      }
    } finally {
      hopper.merchant = sold;
    }
  });
});

describe("SALVAGE: fresh first, 35% a held gate that merges (MERGE badge)", () => {
  it("holding no common gate a copy merges with, SALVAGE draws one the player holds none of, with no badge", () => {
    expect(SALVAGE_OWNED).toBe(0.35);
    for (const held of [[], [["temper", 2], ["whetstone", 3]]] as Held[]) {
      const seen = new Set<string>();
      for (const seed of SEEDS.slice(0, 100)) for (const day of DAYS) {
        const run = atEvent("wreck", seed, day, held);
        const def = salvageOf(run);
        expect(starsHeld(run, def)).toEqual([]);
        expect(shopBadge(run, def)).toBeNull();
        seen.add(def);
      }
      expect(seen.size).toBe(salvagePool().length - held.length); // every fresh common gate shows
    }
  });

  it("with fresh gates and ones that merge, SALVAGE draws a held one 35% of the time (3000 draws, band 0.30-0.40), marked MERGE", () => {
    let owned = 0, n = 0;
    const seen = new Set<string>();
    for (const seed of SEEDS) for (const day of DAYS) {
      const run = atEvent("wreck", seed, day, ["temper", "whetstone"]);
      const def = salvageOf(run);
      seen.add(def);
      n++;
      if (def === "temper" || def === "whetstone") {
        owned++;
        expect(shopBadge(run, def)).toEqual({ kind: "merge", toStars: 2 });
      } else expect(shopBadge(run, def)).toBeNull();
    }
    expect(n).toBe(3000);
    // eslint-disable-next-line no-console
    console.log(`SALVAGE drew a held gate that merges in ${owned} of ${n} draws (${((100 * owned) / n).toFixed(1)}%)`);
    expect(owned / n).toBeGreaterThanOrEqual(0.3);
    expect(owned / n).toBeLessThanOrEqual(0.4);
    expect([...seen].sort()).toEqual([...salvagePool()].sort());
  });

  it("no fresh gate left: always one that merges (MERGE ★2, a chain MERGE ★3); none fresh and none merging: any common gate", () => {
    const all = salvagePool();
    let chains = 0;
    for (const seed of SEEDS.slice(0, 100)) {
      const a = atEvent("wreck", seed, 5, all);
      expect(shopBadge(a, salvageOf(a))).toEqual({ kind: "merge", toStars: 2 });
      const b = atEvent("wreck", seed, 5, all.map((id) => [id, 2] as const));
      expect(all).toContain(salvageOf(b));
      const c = atEvent("wreck", seed, 5, ["temper", ["temper", 2]]);
      if (salvageOf(c) === "temper") {
        chains++;
        expect(shopBadge(c, "temper")).toEqual({ kind: "merge", toStars: 3 });
      }
    }
    expect(chains).toBeGreaterThan(0);
  });
});

describe("TRADER SWAP draws from UPGRADE", () => {
  it("one tier up (a common good: a rare part; rare, epic, legendary: an epic one), never the good itself, every part of that tier reachable", () => {
    for (const good of ["temper", "hopper", "coil", "splitter", "overdrive"]) {
      const tier = SWAP_TIER[ITEMS[good].rarity];
      expect(tier).toBe(ITEMS[good].rarity === "common" ? "rare" : "epic");
      const seen = new Set<string>();
      for (const seed of SEEDS) for (const day of [3, 7]) {
        const run = atEvent("trader", seed, day, [good]);
        const swap = choicesFor(run)[1];
        expect([swap.label, swap.cost]).toEqual(["SWAP", [{ k: "item", def: good, uid: run.inventory[0].uid, from: "cargo" }]]);
        seen.add(gainOf(swap)!);
      }
      expect([...seen].sort(), good).toEqual(UPGRADE[tier].filter((id) => id !== good).sort());
    }
  });
});

describe("what the card shows is what the choice grants, across a save and reload", () => {
  it("SALVAGE, SWAP and SMUGGLER: same part after a reload, granted on the pick, and the resolved card still names it (old save)", () => {
    const salvaged = new Set<string>();
    let redraws = 0;
    for (const seed of SEEDS.slice(0, 80)) {
      for (const [id, i, held] of [["wreck", 0, ["temper"]], ["trader", 1, ["whetstone"]], ["smuggler", 0, []]] as const) {
        const run = atEvent(id, seed, 4, held, true); // 0.8.0 I1 M3: old save
        const shown = gainOf(choicesFor(run)[i])!;
        const loaded = migrateRun(clone(run))!;
        expect(gainOf(choicesFor(loaded)[i])).toBe(shown);
        const res = pickChoice(loaded, i);
        expect([res.ok, res.deckItem]).toEqual([true, shown]);
        const after = migrateRun(clone(loaded))!;
        expect(gainOf(choicesFor(after)[i])).toBe(shown); // ev.item: the pick changed the parts held
        if (id !== "wreck") continue;
        salvaged.add(shown === "temper" ? "merged" : "fresh");
        expect(starsHeld(after, shown)).toEqual([shown === "temper" ? 2 : 1]);
        if (salvagePart(after, after.event!.pick) !== shown) redraws++; // a live redraw would name another
      }
    }
    expect([...salvaged].sort()).toEqual(["fresh", "merged"]);
    expect(redraws).toBeGreaterThan(0);
  });
});

// ---- One shared pool (the operator, 2026-09-24): only the hero differs ----
interface Parts { cargo: { uid: number; def: string; stars?: number }[]; deck: Placed[]; mods: ModPlacement[] }
// 0.6.2 BELTSIDE merge (0.6.1c): both heroes' starting belts run up column 4, so the deck parts are rigs beside it at
// (3,3) and (3,2), facing east, each with its one arrow on the tile its gate stood on ((4,3), (4,2)); the LONG HAUL's
// (II) other arrow points at empty deck. The draws read only which parts are held, so no expectation changes.
const HELD: Record<string, Parts> = {
  none: { cargo: [], deck: [], mods: [] },
  some: {
    cargo: [{ uid: 900, def: "temper" }, { uid: 901, def: "hopper" }],
    deck: [{ uid: 902, def: "whetstone", x: 3, y: 3, rot: 1 }],
    mods: [{ uid: 903, def: "calibrate", turret: 0 }],
  },
  many: {
    cargo: [{ uid: 910, def: "temper", stars: 2 }, { uid: 911, def: "grease" }, { uid: 912, def: "brake", stars: 3 },
      { uid: 913, def: "coil" }, { uid: 914, def: "scatter" }, { uid: 915, def: "splitter" }],
    deck: [{ uid: 916, def: "whetstone", x: 3, y: 3, rot: 1 }, { uid: 917, def: "longhaul", x: 3, y: 2 }],
    mods: [{ uid: 918, def: "chamber", turret: 0, stars: 2 }],
  },
};

/** `hero`'s run on `day` holding exactly `held`. Its signature factory stays (price 0: never sold or
 *  offered); every other part is the same for both heroes, the same uids and cells included. */
function heldRun(hero: HeroId, seed: number, day: number, held: Parts): Run {
  const run = newRun(hero, seed);
  run.day = day;
  run.gold = 20;
  run.build.items = [...run.build.items.filter((p) => !fusible(p.def)), ...clone(held.deck)];
  run.build.mods = clone(held.mods);
  run.inventory = clone(held.cargo);
  run.nextUid = 1000;
  run.lastMerchants = day > 1 ? ["tinker", "gunsmith"] : undefined;
  return run;
}
const badges = (run: Run, defs: (string | undefined)[]) => defs.map((d) => (d ? shopBadge(run, d) : null));

describe("one shared pool: FURNACE and WEAVER get the very same offers and choices", () => {
  it("0.6.2 BELTSIDE merge (0.6.1c): the held rigs stand beside both heroes' belts, one arrow each on its gate's old tile", () => {
    const OLD: Record<number, number> = { 902: key(4, 3), 916: key(4, 3), 917: key(4, 2) };
    for (const hero of HEROES2) for (const held of Object.values(HELD)) {
      const run = heldRun(hero, 7, 3, held);
      expect(routeProblems(run.build), hero).toEqual([]);
      for (const p of held.deck) expect(hitsOfRig(run.build, p.uid).map((h) => h.cell), `${hero} ${p.def}`).toEqual([OLD[p.uid]]);
    }
  });

  it("rollShop: same seed, day, rerolls, merchants and parts held, same caravan and badges (100 seeds x days 1-10 x rerolls 0-1 x 3 sets)", () => {
    let cells = 0;
    for (const seed of SEEDS.slice(0, 100)) for (const day of DAYS) for (const rerolls of [0, 1]) for (const [k, held] of Object.entries(HELD)) {
      const [a, b] = HEROES2.map((hero) => {
        const run = heldRun(hero, seed, day, held);
        run.shop.rerolls = rerolls;
        rollShop(run);
        return { hero: run.build.hero, wagons: run.shop.wagons, badges: badges(run, run.shop.wagons.flatMap((w) => w.offers.map((o) => o.def))) };
      });
      expect([a.hero, b.hero]).toEqual(HEROES2);
      // bb-0.8.3 (REQ-BFG-042 D9, REQ-BFG-021 narrowed): every shared offer the same; the hero's own signature card, the
      // one card that differs by hero, is SIGNATURE_CARD on both sides (it stands in the same slot for both)
      expect(sharedWagons(b.wagons), `s${seed} d${day} r${rerolls} ${k}`).toEqual(sharedWagons(a.wagons));
      // 0.6.2s step 5 (REQ-BFG-031): the caravan offers turrets, and a hull's free starting turrets are the one part
      // the two runs don't hold alike: an offer of one merges into it (MERGE ★2) for the hero whose hull has it. The
      // offers are the same; every other badge is too.
      a.wagons.flatMap((w) => w.offers.map((o) => o.def)).forEach((def, i) => {
        const starts = HEROES2.map((h) => startingTurrets(h).some((t) => t.def === def));
        if (starts.some(Boolean)) [a, b].forEach((x, j) => expect(x.badges[i], `${x.hero} ${def}`).toEqual(starts[j] ? { kind: "merge", toStars: 2 } : null));
        else expect(b.badges[i], `s${seed} d${day} r${rerolls} ${k} ${def}`).toEqual(a.badges[i]);
      });
      cells++;
    }
    expect(cells).toBe(6000);
  });

  for (const [id, name] of [["wreck", "SALVAGE"], ["smuggler", "SMUGGLER"], ["trader", "TRADER SWAP"]] as [EventId, string][]) {
    it(`${name}: same seed, day and parts held, same choices and badges (100 seeds x days 1-10 x 3 sets)`, () => {
      let parts = 0;
      for (const seed of SEEDS.slice(0, 100)) for (const day of DAYS) for (const [k, held] of Object.entries(HELD)) {
        const [a, b] = HEROES2.map((hero) => {
          const run = heldRun(hero, seed, day, held);
          run.event = makeEvent(seed, day, id);
          run.stage = "event";
          const cs = choicesFor(run);
          return { cs, badges: badges(run, cs.map(gainOf)) };
        });
        expect(b, `${EVENTS[id].kind} s${seed} d${day} ${k}`).toEqual(a);
        parts += a.cs.filter((c) => gainOf(c)).length;
      }
      expect(parts).toBeGreaterThan(1000); // the part draws ran (the trader has no good with nothing held)
    });
  }
});
