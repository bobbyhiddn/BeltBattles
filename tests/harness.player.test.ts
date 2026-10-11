// FB-C (REQ-BFG-026): the par player. playerBuild(hero, day, seed) plays a real run through the game's caravan
// (rollShop, reroll, buyOffer), so par is what a typical player can actually assemble under shop luck.
import { describe, expect, it } from "vitest";
import { ITEMS, REROLL_COST } from "../src/sim/content"; // AZ-BUMP S7: RULES_VERSION is gone with the buy-count tripwire's key
import { buildCost, maxGoldByDay, unfusedPairs, validateBuild } from "../src/net/validate";
import { PLAYER_DAYS, knobsOf, playerBuild, playerRun } from "../src/sim/harness/player";
import { PAR_K, medianIndex, parDeck, parField, parReference, parRefs, parSeeds, parSourceFor } from "../src/sim/harness/par";
import { heroRefBuild } from "../src/sim/harness/heroes";
import { balanceMarkdown } from "../src/sim/harness/report";
import { STANDIN_DEFAULTS, boughtCost, dataModuleText, genStandIns, standInCommand, standInRefs } from "../src/sim/harness/standins"; // FLIP-X2: boughtCost
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold in the day's budget
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
import { npcDayRules, withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): the switches, through their setters
import { withHullScale } from "../src/sim/hullScale";
import { withLadderFix } from "../src/sim/ladderFix";

const HEROES = ["furnace", "weaver"] as const;
// AZ-BUMP S7: Y7B2_BOUGHT (the Y7b2 tripwire's six buy counts, 12 15 13 / 14 10 16 under bb-0.9.7) is gone with the tripwire

/** AZ-BUMP (the flip): `fn` in bb-0.9.7's world, every switch off (NPC_DAY, HULL_SCALE and LADDER_FIX ship on), each put
 *  back after it, even on a throw. */
const offWorld = <T>(fn: () => T): T => withNpcDay(() => withHullScale(() => withLadderFix(fn, false), false), false);
// AZ-BUMP (the flip, NPC_DAY): the par player fights the Medium warlord every day (player.ts parNpcDay), so its deck is
// road-fed. The day's budget is maxGoldByDay + the runes' dawn gold + the road's gold and drops by that dusk (playerRun's
// budget + roadGold + roadDrops), and the gold adds up with the value left in cargo (d.cargo); all three are absent with
// NPC_DAY off, so off both read as before. validateBuild's strict budget line (the shop's gold alone) is left to that rule,
// as standins.ts writtenProblems leaves it; every other strict line stands.
const roadBudget = (d: PlayerDay): number => maxGoldByDay(d.day) + runeGrants(d.build.runes, d.day).gold + (d.roadGold ?? 0) + (d.roadDrops ?? 0);
const goldIn = (d: PlayerDay): number => boughtCost(d.build) + d.rerollGold + d.gold + d.soldLoss + (d.cargo ?? 0);
const strictBut = (b: Build, day: number): string[] => validateBuild(b, day).errors.filter((e) => !(npcDayRules() && e.startsWith("budget: ")));

describe("par player (playerBuild): a real run through the caravan", () => {
  // AZ-BUMP S7 (backlog #370; cap's ruling: the buy floor is a sample floor, not a game rule; cap's answer to AZ-BUMP run 5's
  // Q1): the Y7b2 tripwire is gone (cap's ruling 38ca8abc09dd2c46, re-ruled at Z-BUMP: the six runs' buys pinned under
  // bb-0.9.7, 12 15 13 / 14 10 16, counted with every switch off, WEAVER s2's 10 under the floor), with its rules key and its
  // all-off world (offWorld, which the flip's re-pin gave it until S7). The six runs are the shipped par player's (every
  // switch on), and the floor is "at least 10 buys" for all six, with no rules key
  it("buys only what the caravan offers, unsold, at the offered price, and rerolls at the real cost", () => {
    const boughtAll: string[] = [];
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
        // a sample floor, not a game rule: it stops the four integrity checks above from passing on a near-empty run.
        // AZ-BUMP S7: at least 10 buys, all six runs, no rules key (was more than 10, but for WEAVER s2's 10 under the Y7b2
        // tripwire's bb-0.9.7 key)
        boughtAll.push(`${hero} s${seed} ${bought}`);
        expect(bought, `${hero} s${seed}`).toBeGreaterThanOrEqual(10);
        // a player rerolls a few times a run, not every dawn: the policy keeps the run's reroll gold within its
        // share of the day's gold (rerollShare; the stuck rerolls within 1 - floor), 15 g of day 10's 119
        const pol = knobsOf();
        const cap = Math.max(pol.rerollShare, 1 - pol.floor) * maxGoldByDay(PLAYER_DAYS);
        expect(rerolls * REROLL_COST, `${hero} s${seed}: ${rerolls} rerolls`).toBeLessThanOrEqual(cap);
        expect(playerRun(hero, PLAYER_DAYS, seed)[PLAYER_DAYS - 1].rerollGold).toBe(rerolls * REROLL_COST);
      }
    }
    console.log(`AZBUMP-S7 the par player's caravan buys, every switch on: ${boughtAll.join(", ")}`);
  });

  it("every day's deck is legal (validateBuild, no unfused pair) and the gold adds up to maxGoldByDay", () => {
    for (const hero of HEROES) {
      for (const seed of parSeeds()) {
        for (const d of playerRun(hero, PLAYER_DAYS, seed)) {
          // AZ-BUMP (the flip, NPC_DAY): legal by every strict line but the budget's, which is the road's rule below (strictBut)
          const errs = strictBut(d.build, d.day);
          expect(errs, `${hero} s${seed} d${d.day}: ${errs.join("; ")}`).toEqual([]);
          expect(unfusedPairs(d.build)).toEqual([]);
          expect(d.value).toBe(buildCost(d.build).total);
          // deck value + reroll gold + unspent gold + what selling replaced parts lost = every gold the run received
          // FLIP-X2 (REQ-BFG-058, BOT_RUNES on): the par player takes a rune each dawn. d.value (buildCost) charges a HULL or
          // BELT rune's grant as plating / crates, and its dawn-gold runes add to the day's gold, so the gold adds up as the
          // bought deck (boughtCost, as validate.ts costs it) + rerolls + purse + sold loss = d.budget, the day's maxGoldByDay
          // + its runes' dawn gold (runeGrants); without runes both are as before (was d.value + d.rerollGold + d.gold +
          // d.soldLoss = maxGoldByDay(d.day): 96 = 91 on furnace s1 d8)
          // AZ-BUMP (the flip, NPC_DAY): the budget's own rule with the road (roadBudget: + the road's gold and drops by this
          // dusk) and the gold with the cargo's value (goldIn); was maxGoldByDay + the runes' gold (12 vs 8 on furnace s1 d1:
          // day 1's Medium win, +4)
          expect(d.budget, `${hero} s${seed} d${d.day}`).toBe(roadBudget(d));
          expect(goldIn(d), `${hero} s${seed} d${d.day}`).toBe(d.budget);
        }
      }
    }
  }, 120_000); // AZ-BUMP (the flip): the field's 24 par runs, each with an NPC fight a day (the first test's runs are bb-0.9.7's
  // now, cached apart), longer with the NPC day; a host timeout under the 1.5-CPU quota, not the rule

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
  }, 600_000); // AZ-BUMP (the flip): 600 s, 300 s hit in run 5's group check under the 1.5-CPU quota (the GATE RULE; the
  // field's par runs fight a warlord every day), not the rule. 0.6.2 CAND-A: 72 s alone, over 120 s in the full suite at --maxWorkers=4 beside the harness budget files

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
      // AZ-BUMP (the flip, NPC_DAY): the deck is road-fed ("build costs 131 gold ... but day 8 allows at most 92" on furnace s3
      // d8: the shop's gold alone), so its budget is the road's rule (roadBudget; d.budget, checked in the gold test above)
      expect(strictBut(b, d.day), `${hero} s${seed} d${d.day}`).toEqual([]);
      expect(boughtCost(b), `${hero} s${seed} d${d.day}: within the day's gold and the road's`).toBeLessThanOrEqual(d.budget);
      if (turretSlots(b)[e].turret && fed(b).has(e)) fedSeen++;
    }
    expect(fedSeen, "a gun in the extra slot fires: a belt feeds it by dusk").toBeGreaterThan(0);
  }, 300_000);

  // 0.8.0 B1 (oracle 2e5a00525c876f07): since B1's M2 part numbers (209622b) no FURNACE or WEAVER run of seeds 1-12
  // replaces a turret, so this test alone samples seeds 1-48 (at 0.8.0 FURNACE replaced in 5 of them; of the 96 par runs,
  // seeds 1-48 x FURNACE and WEAVER, 2 replace one at 0.8.5, 0 with the packs, 6 with the packs forbidden: PACKS Q5,
  // measured in run 1); the checks are unchanged.
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
      // AZ-BUMP (the flip, NPC_DAY): the road-fed deck's budget line is the road's rule below (strictBut; "build costs 163
      // gold ... but day 10 allows at most 133" with the shop's gold alone)
      expect(strictBut(d.build, d.day)).toEqual([]);
      // FLIP-X2 (BOT_RUNES on): the bought deck (boughtCost: the runes' HULL and BELT out) and the day's gold plus its
      // runes' dawn gold (d.budget), as in the test above (was d.value + ... = maxGoldByDay(d.day): 131 = 119)
      // AZ-BUMP (the flip, NPC_DAY): with the road's gold and drops (roadBudget) and the cargo's value (goldIn), as above
      expect(d.budget, `${hero} s${seed} d${d.day}`).toBe(roadBudget(d));
      expect(goldIn(d), `${hero} s${seed} d${d.day}`).toBe(d.budget);
    }
  }, 300_000); // 0.8.0 B1: 96 par runs, about 15 s alone

  it("gear goes into every gear slot a turret has: some par deck carries two or more gear pieces on one turret", () => {
    const hit = allDays().find((x) => installedTurrets(x.d.build).some((v) => gearOn(x.d.build, v.slot).length >= 2));
    expect(hit, "a turret with 2+ gear").toBeDefined();
    const b = hit!.d.build;
    for (const v of installedTurrets(b)) expect(gearOn(b, v.slot).length).toBeLessThanOrEqual(v.gearSlots);
    // AZ-BUMP (the flip, NPC_DAY): the road-fed deck's budget is the road's rule (roadBudget; d.budget, checked in the gold
    // test above), not the shop's gold alone ("build costs 174 gold ... but day 10 allows at most 125")
    expect(strictBut(b, hit!.d.day)).toEqual([]);
    expect(boughtCost(b)).toBeLessThanOrEqual(hit!.d.budget);
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
    // a saturated FURNACE deck (F0, no long belt): a 2-star SCRAP CANNON fires 33 shots a 30 s (every 30 / 33 = 0.91 s;
    // NUM-2, was every 0.9 s), so the deck rates higher
    const f0 = JOIN_LAYOUTS.F0(5), two = cloneBuild(f0);
    setTurretList(two, [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true }]); // the starting copy merged once
    // NUM-2 (REQ-BFG-047; was td.fireInterval close to 0.9): the TurretDef carries the ★2 speed from the data, 33 =
    // roundHalfUp(30 / 0.9) (the ★2 base interval, tests/fixtures/num2-base-intervals.json), not ★1's 30
    expect(installedTurrets(two)[0].td.speed).toBe(ITEMS.scrapcannon.levels?.[2]?.turret?.speed);
    expect(installedTurrets(two)[0].td.speed).toBe(Math.floor(30 / 0.9 + 0.5)); // NUM-2: 33 (was 0.9 s)
    expect(rateDeck(two).value).toBeGreaterThan(rateDeck(f0).value);
    // the PRESS's belt into a gun in the extra slot instead of the saturated SCRAP CANNON: two guns rate higher
    const extra = cloneBuild(f0);
    expect(installTurret(extra, { uid: 500, def: "carronade" }, 1).ok).toBe(true);
    extra.routes[1] = { factory: 2, cells: [K(8, 6), K(8, 5), K(8, 4), K(8, 3), K(8, 2), K(8, 1), K(8, 0)] };
    expect(validateBuild(extra, 10).errors).toEqual([]);
    expect(fed(extra)).toEqual(new Set([0, 1]));
    expect(rateDeck(extra).value).toBeGreaterThan(rateDeck(f0).value);
    // E1: F1's joined journey (2 + 6 = 8 tiles) is a long belt, so its breech fires every 0.71 s like F0L's 8-tile belt
    // (NUM-2: +39% rate, 30 x 1.39 = 41.7 -> 42 shots a 30 s; was x0.72 = 0.72 s)
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
// AZ-BUMP (the flip, HULL_SCALE): with HULL_SCALE on, fightTime reads PAR-AZ's FIGHT_BY_DAY_HS (22.6 ... 18.2 s, longer late
// and not falling: tests/parAZ.tables.test.ts checks it and the rating on it), so the tests below that mean CAND-A's 0.9.7
// table (FIGHT_BY_DAY: day 1 as FIGHT_T, 9.5 s on day 10) run with HULL_SCALE off
describe("CAND-A: the rating weighs damage over the day's fight, each belt from its own first payload", () => {
  // AZ-BUMP (the flip, HULL_SCALE): FIGHT_BY_DAY's shape (fightTime(1) 22.6 with HULL_SCALE on: 2.4 s from FIGHT_T); and the
  // par deck the rating check reads is bb-0.9.7's, as that check was written for it (a road-fed deck may hold a sustain
  // piece, which rateOn's day term values and a rateDeck without the day does not), so every switch off (offWorld)
  it("fightTime: the par field's fight length per day, day 1 as FIGHT_T, shorter as decks grow, clamped to days 1..10", () => offWorld(() => {
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
  }));

  // AZ-BUMP (the flip, HULL_SCALE): day 10's fight is 9.5 s only on the 0.9.7 table (18.2 s with HULL_SCALE on, past the
  // keg's 12 s fuse: 95975 vs 87668), so this runs with HULL_SCALE off
  it("a POWDER KEG counts only when it blows before the fight is over, and then only for the payloads on its belt", () => withHullScale(() => {
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
    // Y7b2 (the flip): deleted, switch-off only: "a one-off blast: over a longer fight it is a smaller share of what the
    // belt fires", expect(v(keg, 60) / v(base, 60)).toBeLessThan(v(keg, FIGHT_T) / v(base, FIGHT_T)). POWDER KEG's one blast
    // is gone: it blasts at every multiple of its fuse (deckRating.ts kegGain; battle.ts kegTick), so a longer fight holds
    // more blasts (x1.098 at 60 s, x1.082 at FIGHT_T 25 s). The checks above read kegGain's first blast, a live rule
  }, false));

  // AZ-BUMP (the flip, HULL_SCALE): the later line loses on day 10's 9.5 s fight of the 0.9.7 table; at HULL_SCALE's 18.2 s it
  // draws level (303854 vs 303530), so this runs with HULL_SCALE off
  it("a joined belt counts from its own first payload, not from the turret's earliest belt's", () => withHullScale(() => {
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
  }, false));

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
            // AZ-BUMP (the flip, NPC_DAY): the road-fed deck's budget line is the road's rule below (strictBut)
            expect(strictBut(d.build, d.day), `${JSON.stringify(opts)} ${hero} s${seed} d${d.day}`).toEqual([]);
            // FLIP-X2 (BOT_RUNES on): the bought deck and the day's gold plus its runes' dawn gold, as above (was d.value +
            // ... = maxGoldByDay(d.day): 96 = 91)
            // AZ-BUMP (the flip, NPC_DAY): with the road's gold and drops (roadBudget) and the cargo's value (goldIn), as above
            // (was maxGoldByDay + the runes' gold: 12 vs 8 on furnace s1 d1)
            expect(d.budget, `${JSON.stringify(opts)} ${hero} s${seed} d${d.day}`).toBe(roadBudget(d));
            expect(goldIn(d), `${JSON.stringify(opts)} ${hero} s${seed} d${d.day}`).toBe(d.budget);
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
