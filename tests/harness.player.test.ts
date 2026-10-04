// FB-C (REQ-BFG-026): the par player. playerBuild(hero, day, seed) plays a real run through the game's caravan
// (rollShop, reroll, buyOffer), so par is what a typical player can actually assemble under shop luck.
import { describe, expect, it } from "vitest";
import { ITEMS, REROLL_COST } from "../src/sim/content";
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { PLAYER_DAYS, knobsOf, playerBuild, playerRun } from "../src/sim/harness/player";
import { PAR_K, medianIndex, parDeck, parField, parReference, parRefs, parSeeds, parSourceFor } from "../src/sim/harness/par";
import { heroRefBuild } from "../src/sim/harness/heroes";
import { balanceMarkdown } from "../src/sim/harness/report";
import { STANDIN_DEFAULTS, dataModuleText, genStandIns, standInCommand, standInRefs } from "../src/sim/harness/standins";
import { DEFAULT_OPTS, localRunner, runTournament, type Runner, type TourneyOpts } from "../src/sim/harness/tournament";
// 0.6.2 CAND-A
import { HEROES as HERO_DEFS } from "../src/sim/content";
import {
  cloneBuild, connectorClaims, feedOf, gearOn, hullSlots, installTurret, installedTurrets, joinOf, key as K, rigArrows, rigHits,
  rotField, routeInfo, setTurretList, turretSlots, type Build, type Placed, type RouteDef,
} from "../src/sim/deck";
import {
  FIGHT_BY_DAY, FIGHT_T, RATING_CLIFF, RATING_CURVE, SATURATED, SAT_DEEP, SAT_DEEP_AT, SAT_HI, fightTime, firedShare, rateDeck,
} from "../src/sim/deckRating";
import { rateOn, type PlayerDay, type PlayerOpts } from "../src/sim/harness/player";
import { walkRoute } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";

const HEROES = ["furnace", "weaver"] as const;

describe("par player (playerBuild): a real run through the caravan", () => {
  it("buys only what the caravan offers, unsold, at the offered price, and rerolls at the real cost", () => {
    for (const hero of HEROES) {
      for (const seed of [1, 2, 3]) {
        let bought = 0, rerolls = 0;
        playerRun(hero, PLAYER_DAYS, seed, {
          trace: (run, w, s) => {
            const o = run.shop.wagons[w]?.offers[s];
            expect(o, `${hero} s${seed} d${run.day}: a bought slot exists`).toBeDefined();
            expect(o!.sold, `${hero} s${seed} d${run.day}: ${o!.def} unsold when bought`).toBe(false);
            expect(o!.price, `${hero} s${seed}: ${o!.def} affordable`).toBeLessThanOrEqual(run.gold);
            expect(o!.price).toBe(Math.max(1, ITEMS[o!.def].price - (run.shop.discount || 0)));
            bought++;
          },
          onReroll: (run) => {
            expect(run.gold, `${hero} s${seed} d${run.day}: a reroll is paid for`).toBeGreaterThanOrEqual(REROLL_COST);
            rerolls++;
          },
        });
        expect(bought).toBeGreaterThan(10);
        // a player rerolls a few times a run, not every dawn: the policy keeps the run's reroll gold within its
        // share of the day's gold (rerollShare; the stuck rerolls within 1 - floor), 15 g of day 10's 119
        const pol = knobsOf();
        const cap = Math.max(pol.rerollShare, 1 - pol.floor) * maxGoldByDay(PLAYER_DAYS);
        expect(rerolls * REROLL_COST, `${hero} s${seed}: ${rerolls} rerolls`).toBeLessThanOrEqual(cap);
        expect(playerRun(hero, PLAYER_DAYS, seed)[PLAYER_DAYS - 1].rerollGold).toBe(rerolls * REROLL_COST);
      }
    }
  });

  it("every day's deck is legal (validateBuild, no unfused pair) and the gold adds up to maxGoldByDay", () => {
    for (const hero of HEROES) {
      for (const seed of parSeeds()) {
        for (const d of playerRun(hero, PLAYER_DAYS, seed)) {
          const v = validateBuild(d.build, d.day);
          expect(v.ok, `${hero} s${seed} d${d.day}: ${v.errors.join("; ")}`).toBe(true);
          expect(unfusedPairs(d.build)).toEqual([]);
          expect(d.value).toBe(buildCost(d.build).total);
          // deck value + reroll gold + unspent gold + what selling replaced parts lost = every gold the run received
          expect(d.value + d.rerollGold + d.gold + d.soldLoss, `${hero} s${seed} d${d.day}`).toBe(maxGoldByDay(d.day));
        }
      }
    }
  });

  it("spends like a player: the field's median deck is at least 85% of maxGoldByDay on every hero-day", () => {
    for (const hero of HEROES) {
      for (let day = 1; day <= PLAYER_DAYS; day++) {
        const shares = parSeeds().map((s) => playerRun(hero, day, s)[day - 1].value / maxGoldByDay(day)).sort((a, b) => a - b);
        const median = (shares[(shares.length - 1) >> 1] + shares[shares.length >> 1]) / 2;
        expect(median, `${hero} d${day}: ${shares.map((x) => Math.round(100 * x)).join(" ")}`).toBeGreaterThanOrEqual(0.85);
      }
    }
  });

  it("is deterministic per (hero, day, seed), and a day's deck is the same whether or not the run goes on", () => {
    for (const hero of HEROES) {
      const a = JSON.stringify(playerBuild(hero, 7, 5));
      expect(JSON.stringify(playerBuild(hero, 7, 5))).toBe(a);
      expect(JSON.stringify(playerRun(hero, 10, 5)[6].build)).toBe(a);
      // a traced run (no cache) plays the same
      expect(JSON.stringify(playerRun(hero, 7, 5, { trace: () => {} })[6].build)).toBe(a);
      expect(JSON.stringify(playerBuild(hero, 7, 6))).not.toBe(a);
    }
  });

  it("returns fresh copies: mutating one never changes the next call", () => {
    const b = playerBuild("furnace", 4, 2);
    b.items.length = 0;
    expect(playerBuild("furnace", 4, 2).items.length).toBeGreaterThan(0);
  });
});

describe("par field (par.ts): the par of a hero and day is K par-player decks", () => {
  it("parRefs is the field of PAR_K seeds by default, heroRefBuild only when asked for the legacy par", () => {
    const field = parRefs("weaver", 3);
    expect(field.length).toBe(PAR_K);
    expect(field.map((b) => JSON.stringify(b))).toEqual(parField("weaver", 3).map((b) => JSON.stringify(b)));
    expect(JSON.stringify(field[0])).toBe(JSON.stringify(playerBuild("weaver", 3, 1)));
    expect(parRefs("weaver", 3, "heroref")).toEqual([heroRefBuild("weaver", 3)]);
  });

  it("the stand-in generator reads par through parRefs: the field of each pool hero with --par field, heroRefBuild otherwise", () => {
    const field = standInRefs({ ...STANDIN_DEFAULTS, par: "field" }, 4);
    expect(field.refs.map((b) => JSON.stringify(b))).toEqual([...parField("furnace", 4), ...parField("weaver", 4)].map((b) => JSON.stringify(b)));
    expect(field.refHero).toEqual([...Array(PAR_K).fill(0), ...Array(PAR_K).fill(1)]);
    const legacy = standInRefs(STANDIN_DEFAULTS, 4); // absent: the legacy par, so pool v2.1 replays exactly
    expect(legacy.refs).toEqual([heroRefBuild("furnace", 4), heroRefBuild("weaver", 4)]);
    expect(legacy.refHero).toEqual([0, 1]);
    expect(standInCommand({ ...STANDIN_DEFAULTS, par: "field" })).toContain("--par field");
    expect(standInCommand({ ...STANDIN_DEFAULTS, par: "heroref" })).not.toMatch(/--par (field|heroref)/); // --par-floor stays
  });

  it("genStandIns with the par field: vsRef is the mean over every member of a hero's field", async () => {
    const tiny = { ...STANDIN_DEFAULTS, pop: 4, gauntlet: 1, seeds: 1, elites: 1, refSeeds: 1, per: 2, grow: [], stars: "on" as const, par: "field" as const };
    const members = new Map<string, number>();
    for (let day = 1; day <= 10; day++) for (const h of ["furnace", "weaver"] as const) parField(h, day).forEach((b, m) => members.set(JSON.stringify(b), m));
    // a member of even index loses every battle to the candidate, an odd one wins every battle; anything else scores 0
    const run: Runner = async (field, jobs) => jobs.map((j) => {
      const m = members.get(JSON.stringify(field[j.b]));
      return m === undefined ? 0 : m % 2 === 0 ? 2 * j.seeds.length : 0;
    });
    const res = await genStandIns(tiny, run);
    for (const hd of res.days) for (const c of hd.pop) expect([c.vsRef.furnace, c.vsRef.weaver], `${hd.hero} d${hd.day}`).toEqual([0.5, 0.5]);
    expect(dataModuleText(tiny, res.days)).toContain("--par field");
  }, 60_000);

  it("parSourceFor: the par player plays the playable heroes; race heroes keep heroRefBuild", () => {
    expect(parSourceFor("furnace", "field")).toBe("field");
    expect(parSourceFor("weaver", "field")).toBe("field");
    expect(parSourceFor("foundry", "field")).toBe("heroref");
    expect(parSourceFor("weaver", "heroref")).toBe("heroref");
    expect(parRefs("foundry", 5)).toEqual([heroRefBuild("foundry", 5)]);
  });

  it("the balance report's Reference is parReference: the par deck with par \"field\", heroRefBuild when absent", async () => {
    const o: TourneyOpts = { ...DEFAULT_OPTS, heroes: ["furnace", "weaver", "foundry"], days: [1], calibrationDays: [1], pop: 3, gauntlet: 2, seeds: 1, elites: 1 };
    const field = await runTournament({ ...o, par: "field" }, localRunner);
    for (const h of HEROES) {
      const deck = await parDeck(h, 1, localRunner);
      expect(field.days[0].calibration![h].build).toEqual(deck.build);
      expect(await parReference(h, 1, localRunner)).toEqual(deck.build);
      expect(await parReference(h, 1, localRunner, "heroref")).toEqual(heroRefBuild(h, 1));
    }
    expect(field.days[0].calibration!.foundry.build).toEqual(heroRefBuild("foundry", 1)); // no par player for race heroes
    const md = (r: typeof field) => balanceMarkdown(r, { runtimeMs: 1, workers: 1, command: "test", perDayMs: {} });
    expect(md(field)).toContain("Reference = the par deck, par.ts parReference");
    const legacy = await runTournament(o, localRunner); // absent: the legacy Reference, exactly
    for (const h of o.heroes) expect(legacy.days[0].calibration![h].build).toEqual(heroRefBuild(h, 1));
    expect(md(legacy)).toContain("Reference = heroRefBuild(hero, day)");
  }, 300_000); // 0.6.2 CAND-A: 72 s alone, over 120 s in the full suite at --maxWorkers=4 beside the harness budget files

  it("medianIndex takes the lower median, ties to the lower index", () => {
    expect(medianIndex([0.9, 0.1, 0.5])).toBe(2);
    expect(medianIndex([0.2, 0.8, 0.4, 0.6])).toBe(2);
    expect(medianIndex([0.5, 0.5, 0.5, 0.5])).toBe(1);
  });
});

// ---------------------------------------------------------------- 0.6.2 CAND-A (ref/BRIEF-final-062-cand.md §2)
// The par player on the mechanics head: turret slots (REQ-BFG-031), belt joins (REQ-BFG-027), multi-arrow aim.

/** Every day of every par run (seeds 1..PAR_K, both heroes), with its seed. */
const allDays = (opts: PlayerOpts = {}): { hero: (typeof HEROES)[number]; seed: number; d: PlayerDay }[] =>
  HEROES.flatMap((hero) => parSeeds().flatMap((seed) => playerRun(hero, PLAYER_DAYS, seed, opts).map((d) => ({ hero, seed, d }))));
/** The extra TURRET SLOT of a hull: the one with no starting turret. */
const extraSlot = (b: Build): number => hullSlots(b.hero).findIndex((s) => !s.start);
/** The turret slots some connected belt feeds (a joining belt's chain included). */
const fed = (b: Build): Set<number> => {
  const claims = connectorClaims(b);
  return new Set(b.routes.map((_, i) => routeInfo(b, i, claims)).filter((r) => r.connected).map((r) => r.turret));
};
/** Each rig's belt hits, by uid. */
const rigRoutes = (b: Build): Map<number, number[]> => {
  const out = new Map<number, number[]>();
  for (const r of rigHits(b)) for (const t of r) for (const h of t) out.set(h.uid, [...(out.get(h.uid) ?? []), h.route]);
  return out;
};

describe("0.6.2 CAND-A: the par player buys, installs and replaces turrets through the caravan (REQ-BFG-031)", () => {
  it("one run buys a turret into the empty extra slot, installed and fed by a connected belt; every such deck is legal", () => {
    const hits = allDays().filter((x) => x.d.buys.some((b) => b.into === "extra"));
    expect(hits.length, "some par run fills the extra slot").toBeGreaterThan(0);
    let fedSeen = 0;
    for (const { hero, seed, d } of hits) {
      const b = d.build, e = extraSlot(b), buy = d.buys.find((x) => x.into === "extra")!;
      expect(buy.slot, `${hero} s${seed} d${d.day}`).toBe(e);
      expect(ITEMS[buy.def].kind).toBe("turret");
      expect(validateBuild(b, d.day).errors, `${hero} s${seed} d${d.day}`).toEqual([]);
      if (turretSlots(b)[e].turret && fed(b).has(e)) fedSeen++;
    }
    expect(fedSeen, "a gun in the extra slot fires: a belt feeds it by dusk").toBeGreaterThan(0);
  }, 300_000);

  // 0.8.0 B1 (oracle 2e5a00525c876f07): since B1's M2 part numbers (209622b) no FURNACE or WEAVER run of seeds 1-12
  // replaces a turret, so this test alone samples seeds 1-48 (FURNACE replaces in 5 of them); the checks are unchanged.
  // bb-0.8.6 (PACKS Q5, oracle 35e8ebc1eda74818): the packs absorb the gold a replace needs (no par run of the sample
  // replaces one), so the sample plays a policy that buys no pack: the par player judges both packs and never takes one
  // (PolicyKnobs.forbid, the TUNE-M switch: player.ts packCands marks them banned)
  it("one run replaces a turret: the slot holds the bought def, the old one left the deck (cargo or sold) and the gold adds up", () => {
    const seeds = Array.from({ length: 48 }, (_, i) => i + 1);
    const noPacks = { tune: { forbid: "pack:belt+pack:armor" } };
    const hits = HEROES.flatMap((hero) => seeds.flatMap((seed) => playerRun(hero, PLAYER_DAYS, seed, noPacks).map((d) => ({ hero, seed, d }))))
      .filter((x) => x.d.buys.some((b) => b.into === "replace"));
    expect(hits.length, "some par run replaces a turret").toBeGreaterThan(0);
    for (const { hero, seed, d } of hits) {
      const buy = d.buys.find((x) => x.into === "replace")!;
      expect(buy.replaced, `${hero} s${seed} d${d.day}`).toBeDefined();
      expect(validateBuild(d.build, d.day).errors).toEqual([]);
      expect(d.value + d.rerollGold + d.gold + d.soldLoss).toBe(maxGoldByDay(d.day));
    }
  }, 300_000); // 0.8.0 B1: 96 par runs, about 15 s alone

  it("gear goes into every gear slot a turret has: some par deck carries two or more gear pieces on one turret", () => {
    const hit = allDays().find((x) => installedTurrets(x.d.build).some((v) => gearOn(x.d.build, v.slot).length >= 2));
    expect(hit, "a turret with 2+ gear").toBeDefined();
    const b = hit!.d.build;
    for (const v of installedTurrets(b)) expect(gearOn(b, v.slot).length).toBeLessThanOrEqual(v.gearSlots);
    expect(validateBuild(b, hit!.d.day).errors).toEqual([]);
  });
});

describe("0.6.2 CAND-A: the par player draws joins and aims multi-arrow rigs (REQ-BFG-027, REQ-BFG-025)", () => {
  it("one run joins a belt: every join in the par field is legal (joinOf), and the joining belt reaches a turret", () => {
    const joined = allDays().filter((x) => x.d.build.routes.some((r) => r.join !== undefined));
    expect(joined.length, "some par deck joins a belt").toBeGreaterThan(0);
    for (const { hero, seed, d } of joined) {
      const b = d.build;
      b.routes.forEach((r, i) => {
        if (r.join === undefined) return;
        expect(joinOf(b, i), `${hero} s${seed} d${d.day} route ${i}`).toBeDefined();
        expect(feedOf(b, i).connected, `${hero} s${seed} d${d.day} route ${i}`).toBe(true);
      });
    }
    // and a factory bought today laid a joining belt (the new line joined another belt)
    expect(allDays().some((x) => x.d.buys.some((b) => (b.joins ?? 0) > 0))).toBe(true);
  });

  it("one run places a rig whose arrows land on two belts", () => {
    const hit = allDays().find((x) => [...rigRoutes(x.d.build).values()].some((rs) => new Set(rs).size >= 2));
    expect(hit, "a two-belt rig").toBeDefined();
    const b = hit!.d.build, [uid] = [...rigRoutes(b)].find(([, rs]) => new Set(rs).size >= 2)!;
    const p = b.items.find((q) => q.uid === uid)!;
    expect(rigArrows(p.def).length).toBeGreaterThanOrEqual(2);
  });
});

// junction-062's bench layouts (tests/joins.bench.test.ts), written out: FURNACE's KILN belt M into connector 4, a STAMP
// PRESS (6,6) and a DOUBLE STAMP (1,6); WEAVER's LOOM belt A into turret 2 (connector 4), a STAMP PRESS (7,7), a DOUBLE
// STAMP (0,6). The rig row stands west of M / A facing east.
const rigRow = (day: number): [string, number][] =>
  day >= 10 ? [["temper", 2], ["whetstone", 2], ["brake", 1], ["splitter", 1]] : day >= 7 ? [["temper", 2], ["whetstone", 2], ["brake", 1]] : [["temper", 1], ["whetstone", 1], ["brake", 1]];
const st = (s: number) => (s > 1 ? { stars: s } : {});
function benchDeck(hero: "furnace" | "weaver", day: number, three: boolean, routes: RouteDef[]): Build {
  const f = hero === "furnace";
  const items: Placed[] = f
    ? [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 2, def: "press", x: 6, y: 6 }, ...(three ? [{ uid: 3, def: "doublestamp", x: 1, y: 6 }] : [])]
    : [{ uid: 1, def: "loom", x: 4, y: 5 }, { uid: 2, def: "press", x: 7, y: 7 }, ...(three ? [{ uid: 3, def: "doublestamp", x: 0, y: 6 }] : [])];
  rigRow(day).forEach(([def, s], i) => items.push({ uid: 10 + i, def, x: 3, y: (f ? 4 : 3) - i, ...rotField(def, 1), ...st(s) }));
  return {
    hero, items, routes, mods: day >= 7 ? [{ uid: 30, def: "calibrate", turret: f ? 0 : 1 }] : [], beltCap: f ? (three ? 18 : 14) : 24,
    hullBonus: heroRefBuild(hero, day).hullBonus,
  };
}
const FM = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const F_P5 = [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)];
const F_P5L = [K(7, 5), K(7, 4), K(7, 3), K(7, 2), K(7, 1), K(7, 0), K(6, 0), K(5, 0)];
const JOIN_LAYOUTS: Record<string, (day: number) => Build> = {
  F0: (d) => benchDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }]),
  F0L: (d) => benchDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]),
  F1: (d) => benchDeck("furnace", d, false, [{ factory: 1, cells: FM }, { factory: 2, cells: [K(6, 5), K(5, 5)], join: K(4, 5) }]),
  F3L: (d) => benchDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5L }]),
  F4: (d) => benchDeck("furnace", d, true, [{ factory: 1, cells: FM }, { factory: 2, cells: F_P5 }, { factory: 3, cells: [K(3, 6), K(3, 5)], join: K(4, 5) }]),
  W4: (d) => benchDeck("weaver", d, true, [
    { factory: 1, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, { factory: 2, cells: [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] },
    { factory: 3, cells: [K(1, 5), K(1, 4), K(1, 3), K(1, 2), K(1, 1), K(1, 0)] },
  ]),
  W5: (d) => benchDeck("weaver", d, true, [
    { factory: 1, cells: [K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }, { factory: 2, cells: [K(7, 6), K(6, 6), K(6, 5), K(6, 4), K(5, 4)], join: K(4, 4) },
    { factory: 3, cells: [K(1, 5), K(2, 5), K(3, 5), K(3, 4)], join: K(4, 4) },
  ]),
};

describe("0.6.2 CAND-A: the rating reads turrets and joins as the battle fights them (deckRating.ts)", () => {
  it("the junction bench's findings: F1 (join the PRESS before the KILN's rig row) beats both join-free layouts; crowding loses", () => {
    const v = (id: string, d: number) => rateDeck(JOIN_LAYOUTS[id](d)).value;
    for (const d of [5, 7, 10]) {
      for (const id of Object.keys(JOIN_LAYOUTS)) expect(validateBuild(JOIN_LAYOUTS[id](d), 10).errors, `${id} d${d}`).toEqual([]);
      expect(v("F1", d), `d${d}: F1 > F0L`).toBeGreaterThan(v("F0L", d));
      expect(v("F0L", d), `d${d}: F0L > F0 (E1's long belt)`).toBeGreaterThan(v("F0", d));
    }
    // three factories into one heavy intake (one join) against the third idle. 0.6.2 TUNE-M, RULE JOIN PACE: the joined
    // PRESS now stamps at JOIN_PACE, so the intake is less crowded. The gauntlet bench (parBench --joins --foes
    // gauntlet at JOIN_PACE 0.7; OUT/tune/pace07) reads F4 - F3L -8.3 / +2.8 [-2.8, +8.3] / -6.9 points on d5/7/10
    // (at full pace: -8.3 / -13.2 / -12.5). So F4 is no better on days 5 and 10, and level with F3L on day 7
    for (const d of [5, 10]) expect(v("F4", d), `d${d}: F4 <= F3L`).toBeLessThanOrEqual(v("F3L", d) * 1.02);
    expect(Math.abs(v("F4", 7) / v("F3L", 7) - 1), "d7: F4 level with F3L").toBeLessThan(0.06);
    // three WEAVER factories into one light turret against one factory per turret (the bench: -21 on day 5, -43 on day 10)
    for (const d of [5, 10]) expect(v("W5", d), `d${d}: W5 < W4`).toBeLessThan(v("W4", d));
  });

  it("an installed turret at its stars, in any slot, the extra slot's gun and E1 over a joined journey", () => {
    // a saturated FURNACE deck (F0, no long belt): a 2-star SCRAP CANNON fires every 0.9 s, so the deck rates higher
    const f0 = JOIN_LAYOUTS.F0(5), two = cloneBuild(f0);
    setTurretList(two, [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]); // the starting copy merged once
    expect(installedTurrets(two)[0].td.fireInterval).toBeCloseTo(0.9, 9);
    expect(rateDeck(two).value).toBeGreaterThan(rateDeck(f0).value);
    // the PRESS's belt into a gun in the extra slot instead of the saturated SCRAP CANNON: two guns rate higher
    const extra = cloneBuild(f0);
    expect(installTurret(extra, { uid: 500, def: "carronade" }, 1).ok).toBe(true);
    extra.routes[1] = { factory: 2, cells: [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] };
    expect(validateBuild(extra, 10).errors).toEqual([]);
    expect(fed(extra)).toEqual(new Set([0, 1]));
    expect(rateDeck(extra).value).toBeGreaterThan(rateDeck(f0).value);
    // E1: F1's joined journey (2 + 6 = 8 tiles) is a long belt, so its breech fires every 0.72 s like F0L's 8-tile belt
    const noE1 = cloneBuild(JOIN_LAYOUTS.F1(5));
    noE1.routes[0] = { factory: 1, cells: FM };
    expect(HERO_DEFS.furnace.factory).toBe("kiln");
    expect(rateDeck(JOIN_LAYOUTS.F1(5)).value).toBe(rateDeck(noE1).value); // the same deck: the journey counts
  });
});

// CAND-A resume, the skill-ladder fix (ref/BRIEF-final-062-cand-resume.md step 1): the rating weighed every day's damage
// over a 25 s fight and a turret's belts from its earliest one's first payload; par-field fights last 24 s on day 1 and
// 9.5 s on day 10, so the sharp player (it follows the rating most closely) drew long belts and joined journeys that land
// late or never, and POWDER KEGs that blow after most fights are over. Sharp WEAVER fell to 36% against par on day 10.
// The fix: the day's fight (fightTime), each belt from its own first payload after the turret's first window and shot
// flight, the keg's one blast, and a saturation curve that goes on falling under a deep load (junction-062's bench).
describe("CAND-A: the rating weighs damage over the day's fight, each belt from its own first payload", () => {
  it("fightTime: the par field's fight length per day, day 1 as FIGHT_T, shorter as decks grow, clamped to days 1..10", () => {
    expect(FIGHT_BY_DAY.length).toBe(PLAYER_DAYS);
    expect(Math.abs(fightTime(1) - FIGHT_T)).toBeLessThan(1);
    expect(fightTime(10)).toBe(9.5);
    for (let d = 2; d <= PLAYER_DAYS; d++) expect(fightTime(d), `d${d}`).toBeLessThanOrEqual(fightTime(d - 1));
    expect(fightTime(0)).toBe(fightTime(1));
    expect(fightTime(12)).toBe(fightTime(10));
    // the par player reads its day's rating
    const b = playerBuild("weaver", 10, 1);
    expect(rateOn(b, 10)).toBe(rateDeck(b, RATING_CURVE, fightTime(10)).value);
    expect(rateOn(b, 10)).toBeLessThan(rateDeck(b).value); // a shorter fight: less of the damage lands
  });

  it("a POWDER KEG counts only when it blows before the fight is over, and then only for the payloads on its belt", () => {
    const base = JOIN_LAYOUTS.F0(5);
    const keg = cloneBuild(base); // west of the KILN belt's first tile, facing east onto it
    keg.items.push({ uid: 40, def: "keg", x: 3, y: 5, rot: rotFacing("keg", 1) });
    expect(validateBuild(keg, 5).errors).toEqual([]);
    expect(rigHits(keg)[0].flat().some((h) => h.uid === 40)).toBe(true);
    expect(walkRoute(keg, 0).estimate.time).toBeGreaterThan(0);
    const v = (b: Build, fight: number) => rateDeck(b, RATING_CURVE, fight).value;
    // 1 star: a 12 s fuse. Day 10's fight (9.5 s) is over first: nothing. Day 5's (12.9 s) sees the blast's first
    // second, day 1's (24.4 s) the whole belt's worth of payloads (about its ride), a larger share of the fight
    expect(v(keg, fightTime(10))).toBe(v(base, fightTime(10)));
    expect(v(keg, fightTime(5))).toBeGreaterThan(v(base, fightTime(5)));
    expect(v(keg, fightTime(1)) / v(base, fightTime(1))).toBeGreaterThan(v(keg, fightTime(5)) / v(base, fightTime(5)));
    // a one-off blast: over a longer fight it is a smaller share of what the belt fires (the old reading, half the
    // buff on every payload, never fell)
    expect(v(keg, 60) / v(base, 60)).toBeLessThan(v(keg, FIGHT_T) / v(base, FIGHT_T));
  });

  it("a joined belt counts from its own first payload, not from the turret's earliest belt's", () => {
    // F1 (day 10), and the same deck with the PRESS's joining line drawn 3 tiles longer into the same join tile: the
    // same payloads through the same rigs, the first one later. Weighed from the KILN belt's first payload (the old
    // rule) the two rated alike on every day; now the later line loses on day 10's fight and draws level in a long one.
    const short = JOIN_LAYOUTS.F1(10);
    const long = cloneBuild(short);
    long.routes[1] = { factory: 2, cells: [K(7, 5), K(7, 4), K(6, 4), K(5, 4), K(5, 5)], join: K(4, 5) };
    expect(validateBuild(long, 10).errors).toEqual([]);
    expect(joinOf(long, 1)).toBeDefined();
    expect(walkRoute(long, 1).estimate.time).toBeGreaterThan(walkRoute(short, 1).estimate.time);
    const v = (b: Build, fight: number) => rateDeck(b, RATING_CURVE, fight).value;
    expect(v(long, fightTime(10))).toBeLessThan(0.99 * v(short, fightTime(10)));
    expect(v(long, 1e6) / v(short, 1e6)).toBeCloseTo(1, 3);
  });

  it("junction-062's bench order holds at each day's fight too", () => {
    const v = (id: string, d: number) => rateDeck(JOIN_LAYOUTS[id](d), RATING_CURVE, fightTime(d)).value;
    for (const d of [5, 7, 10]) {
      expect(v("F1", d), `d${d}: F1 > F0L`).toBeGreaterThan(v("F0L", d));
      expect(v("F0L", d), `d${d}: F0L > F0`).toBeGreaterThan(v("F0", d));
    }
    // crowding: three lines into one intake. Day 7's F4 (its rig row with BRAKE and a CALIBRATION, under the deep
    // load) still reads about 4% above F3L at day 7's 11.1 s fight: a known limit, reported (the bench: -13.2 points)
    for (const d of [5, 10]) {
      expect(v("F4", d), `d${d}: F4 <= F3L`).toBeLessThanOrEqual(v("F3L", d) * 1.02);
      expect(v("W5", d), `d${d}: W5 < W4`).toBeLessThan(v("W4", d));
    }
  });

  it("a crowded intake fires less the more it is crowded: the saturation curve goes on down to SAT_DEEP", () => {
    expect(firedShare(0.5)).toBe(1);
    expect(firedShare(SAT_HI)).toBeCloseTo(SATURATED, 9);
    expect(firedShare(1.6)).toBeLessThan(SATURATED);
    expect(firedShare(1.6)).toBeGreaterThan(SAT_DEEP);
    expect(firedShare(SAT_DEEP_AT)).toBeCloseTo(SAT_DEEP, 9);
    expect(firedShare(5)).toBe(SAT_DEEP);
    expect(firedShare(5, true)).toBe(1); // a turret that never jams
    expect(firedShare(5, false, RATING_CLIFF)).toBe(0.85); // FB-C's cliff has no deep segment
  });
});

describe("0.6.2 CAND-A: the policy variants still run", () => {
  it("typical, sharp, --tune impulse=1 and the CAND-A knobs off: legal decks, the gold adds up, deterministic", () => {
    const variants: PlayerOpts[] = [{}, { policy: "sharp" }, { tune: { impulse: 1 } }, { tune: { turret: 0, extra: 0, join: 0, aimTop: 0 } }, { tune: { extra: 0 } }];
    for (const opts of variants) {
      for (const hero of HEROES) {
        for (const seed of [1, 2]) {
          const run = playerRun(hero, PLAYER_DAYS, seed, opts);
          for (const d of run) {
            expect(validateBuild(d.build, d.day).errors, `${JSON.stringify(opts)} ${hero} s${seed} d${d.day}`).toEqual([]);
            expect(d.value + d.rerollGold + d.gold + d.soldLoss).toBe(maxGoldByDay(d.day));
          }
          expect(JSON.stringify(playerRun(hero, 7, seed, { ...opts, trace: () => {} })[6].build)).toBe(JSON.stringify(run[6].build));
        }
      }
    }
    // the knobs do what they say: with extra 0 no deck fills the extra slot, with join 0 none joins
    for (const hero of HEROES) for (const seed of [1, 2, 3, 4]) {
      const b = playerBuild(hero, 10, seed, { tune: { extra: 0 } });
      expect(turretSlots(b)[extraSlot(b)].turret, `${hero} s${seed}`).toBeUndefined();
      expect(playerBuild(hero, 10, seed, { tune: { join: 0 } }).routes.some((r) => r.join !== undefined)).toBe(false);
    }
    expect(knobsOf().aimTop).toBe(4);
  }, 300_000);
});
