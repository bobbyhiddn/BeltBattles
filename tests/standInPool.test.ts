// 0.6.0d D2: the dusk stand-ins brought full-purse decks from the stand-in pool v1.1
// (src/sim/standInPool.ts + standInPoolData.ts, copied as they are from the balance harness).
// 0.6.2 TUNE-C (REQ-BFG-024, REQ-BFG-026): standInFoe keeps the captain standInGhost(seed, day) and fights with its named
// build, standInBuild(id, day). The pool stays in the code as the average-deck reference field (the balance harness)
// and the async fallback's source (src/net/fallback.ts, tests/net-fallback-standins.test.ts); its own tests stay here.
import { describe, expect, it, vi } from "vitest";
import { STAND_IN_DATA } from "../src/sim/standInPoolData";
import { STAND_IN_GEN_DAYS, STAND_IN_POOL_DAYS, STAND_IN_POOL_HEROES, STAND_IN_POOL_RULES, standInPick, standInPool } from "../src/sim/standInPool";
import { POOL_RULES, RUN_DAYS, type HeroId } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, deckCost, maxGoldByDay, standInBuild, standInGhost } from "../src/sim/rivals";
import { inStandInPool, standInFoe } from "../src/game/ghosts";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { chooseFoe, startDusk } from "../src/game/day";
import { migrateRun, newRun } from "../src/game/run";
import { routeProblems } from "../src/game/routeCheck";
import type { Build } from "../src/sim/deck";
import { poolLoss } from "./beltside.helpers";
import { boughtCost } from "../src/sim/harness/standins"; // FLIP-X2: a deck with runes valued as bought (the runes' HULL and BELT out)
import { runeGrants } from "../src/sim/runes"; // FLIP-X2: the runes' dawn gold and own hull
import { roadAllowance } from "../src/sim/rivalBuilds"; // AZ-BUMP (the flip): the dusk deck's road allowance
import { POOL_LEGACY, POOL_PAR_BAND, POOL_PAR_SHORT } from "./standInPool.helpers";

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);
// BUMP-1D: the stand-in POOL holds days 1-16 now (was 1-10); DAYS (1-10) stays for the 10-day captains' standInFoe tests below
const POOL_DAYS = Array.from({ length: STAND_IN_POOL_DAYS }, (_, i) => i + 1);
const SEEDS = Array.from({ length: 200 }, (_, n) => 7 + n * 104729); // run seeds are 31-bit, >= 0
const PLATE = 25; // ARMOR PLATING's hull (standin.honest.test.ts pins it)
const J = (v: unknown): string => JSON.stringify(v);

describe("the stand-in pool v1.1 (the reference field and the async fallback)", () => {
  it("was generated under this build's pool rules: RULES_VERSION, or since RUNES-1 the rules it carries the pool from (content.ts POOL_RULES; a stale pool fails here)", () => {
    expect(STAND_IN_POOL_RULES).toBe(POOL_RULES);
    expect(STAND_IN_DATA.rules).toBe(POOL_RULES);
    // BUMP-1D: was toBe(RUN_DAYS) (10): the pool is regenerated to days 1-16 (STAND_IN_GEN_DAYS), the long run's generator depth
    expect(STAND_IN_POOL_DAYS).toBe(STAND_IN_GEN_DAYS);
    expect(STAND_IN_POOL_DAYS).toBe(16);
    expect(STAND_IN_DATA.rules).toBe("bb-0.12.0"); // BUMP-1E: the bump (was bb-0.11.0).
    for (const hero of STAND_IN_POOL_HEROES) expect(STAND_IN_DATA.pools[hero]!, hero).toHaveLength(STAND_IN_POOL_DAYS);
  });

  // 0.8.0 N1 (oracle 94b9559fbb7da299 (4a)): a stand-in fights its captain's named build (standInBuild), never a pool deck,
  // and the pool (untouched) serves the async fallback, whose stand-in heroes are STAND_IN_HEROES. So the invariant is: every
  // STAND_IN_HEROES hero and every FURNACE or WEAVER captain's hero is in the pool, and FOUNDRY and BASTION are the only
  // stand-in heroes outside it (their four captains never use it); a fifth such hero turns this red.
  it("covers the hero of every captain that can stand in (every one but the Matriarch): no fallback in 0.6", () => {
    const heroes = new Set<HeroId>(), outside = new Set<HeroId>();
    for (const id of RIVAL_IDS) {
      if (id === "matriarch") continue;
      heroes.add(RIVALS[id].hero);
      if (!inStandInPool(RIVALS[id].hero)) { outside.add(RIVALS[id].hero); continue; }
      expect(STAND_IN_POOL_HEROES).toContain(RIVALS[id].hero);
    }
    for (const h of STAND_IN_HEROES) expect(STAND_IN_POOL_HEROES, h).toContain(h);
    for (const h of ["furnace", "weaver"] as HeroId[]) expect(inStandInPool(h), h).toBe(true);
    expect([...outside].sort()).toEqual(["bastion", "foundry"]);
    expect([...heroes].sort()).toEqual(["bastion", "foundry", "furnace", "weaver"]);
  });

  it("prints the pool's recorded vsPar per hero and day (mean and minimum of standInPool(hero, day); no fights)", () => {
    const pc = (x: number) => `${Math.round(x * 100)}%`;
    const lines = ["stand-in pool v1.1 recorded vsPar (lower win rate vs both par decks), mean / min of 6:"];
    for (const day of POOL_DAYS) { // BUMP-1D: was DAYS (1-10)
      const cols = STAND_IN_POOL_HEROES.map((hero) => {
        const v = standInPool(hero, day).map((e) => e.vsPar);
        const cost = standInPool(hero, day).map((e) => e.cost);
        return `${hero} ${pc(v.reduce((a, b) => a + b, 0) / v.length)} / ${pc(Math.min(...v))} (${Math.min(...cost)}-${Math.max(...cost)}g)`;
      });
      lines.push(`  day ${String(day).padStart(2)} (budget ${maxGoldByDay(day)}g): ${cols.join(" | ")}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join("\n"));
    expect(lines.length).toBe(1 + STAND_IN_POOL_DAYS); // BUMP-1D: was 1 + RUN_DAYS (the pool holds days 1-16 now)
  });

  // Step 5 M5 (decisions D1, D4): pool v2.1 lists no hero/day short. A caravan pool may list a day that took its
  // best-vsPar builds (fallback (d), relaxation "best"; at this base one of the 20 did with --par-band 0.5,0.6), whose
  // entries are exempt from parFloor and the band; a pick under the spend floor may not be listed (it is not honest).
  it("every pool entry's vsPar is at least parFloor (0.5) and inside the header's --par-band, and no hero/day is listed short but a step-5 pool's day that took its best-vsPar builds (its entries exempt)", () => {
    expect(STAND_IN_DATA.parFloor).toBe(0.5);
    if (POOL_LEGACY) expect(STAND_IN_DATA.short).toEqual([]);
    for (const s of STAND_IN_DATA.short) {
      expect(s.vsPar, `${s.hero} d${s.day}: only a day that took its best-vsPar builds is listed`).toBeDefined();
      expect(STAND_IN_DATA.pools[s.hero]![s.day - 1][4], `${s.hero} d${s.day}`).toBe("best");
    }
    for (const hero of STAND_IN_POOL_HEROES) {
      for (const day of POOL_DAYS) { // BUMP-1D: was DAYS (1-10): days 11-16 of the regenerated pool are held to the same lines
        const es = standInPool(hero, day), exempt = POOL_PAR_SHORT.has(`${hero}|${day}`);
        expect(es.length).toBe(STAND_IN_DATA.per);
        for (const [i, e] of es.entries()) {
          if (!exempt) expect(e.vsPar).toBeGreaterThanOrEqual(STAND_IN_DATA.parFloor);
          if (!exempt && POOL_PAR_BAND) expect(e.vsPar >= POOL_PAR_BAND[0] && e.vsPar <= POOL_PAR_BAND[1], `${hero} d${day} #${i}: vsPar ${e.vsPar} outside --par-band ${POOL_PAR_BAND.join(",")}`).toBe(true);
          // 0.6.2 BELTSIDE: the deck as loaded lacks only the rigs D3 dropped (tests/beltside.helpers.ts); 0.6.2 TUNE-C
          // (17df327): deckCost counts installed turrets as buildCost does, so a deck with a merged starting turret is priced right
          // FLIP-X2 (steps 4.1 and 4.5): every pool deck holds its day runes, and the stored cost is the deck as bought
          // (standins.ts boughtCost: deckCost / buildCost with the runes' HULL and BELT taken out, as the generator stores it);
          // deckCost charges a TAR BARREL's belt as crates (was deckCost(e.build).total === e.cost - poolLoss: 12 vs 8)
          expect(boughtCost(e.build), `${hero} d${day} #${i}`).toBe(e.cost - poolLoss(hero, day, i));
        }
      }
    }
  });
});

describe("standInFoe: the day's captain with its named build (200 seeds x days 1-10)", () => {
  it("keeps standInGhost's id, name and hero; its build deep-equals standInBuild(id, day); never the Matriarch", () => {
    for (const seed of SEEDS) {
      const ids = new Set<string>();
      for (const day of DAYS) {
        const f = standInFoe(seed, day);
        const id = standInGhost(seed, day);
        expect(f.id).toBe(id);
        expect(f.id).not.toBe("matriarch");
        expect([f.name, f.hero, f.build.hero]).toEqual([RIVALS[id].name, RIVALS[id].hero, RIVALS[id].hero]);
        expect(f.build).toEqual(standInBuild(id, day));
        ids.add(f.id);
      }
      expect(ids.size).toBe(RUN_DAYS); // still no captain twice in a run
    }
  });

  // 0.6.2 TUNE-C: a named build spends what its plan bought by that day at ordinary luck (the ordinary caps: about the
  // par field's median deck, tests/captains.luck.test.ts), no longer a full purse (>= ceil(0.9 x maxGoldByDay))
  it("every one of those decks is honest: <= maxGoldByDay, whole plating, no belt FIGHT refuses", () => {
    let n = 0;
    const picked = new Map<string, Set<string>>();
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        const b = standInFoe(seed, day).build;
        // FLIP-X2 (REVIEW-BOTSX section 5): the captain's deck holds its CAPTAIN_RUNES prefix (their HULL and BELT on the
        // deck), so it is read as bought, as validate.ts reads a deck with runes: its value is boughtCost (the runes' grants
        // out) against the day's gold plus its runes' dawn gold, and its plating is the hull less the runes' own (was
        // deckCost(b).total <= maxGoldByDay(day): 110 <= 105, and b.hullBonus % PLATE)
        const grant = runeGrants(b.runes, day);
        // AZ-BUMP (the flip, NPC_DAY): + the dusk deck's road allowance (REFIT-AZ's road additions; roadAllowance, 0 off), as
        // captains.luck's R1; refitaz.road checks the on decks
        const cost = boughtCost(b), budget = maxGoldByDay(day) + grant.gold + roadAllowance(day, "dusk");
        expect(cost, `${b.hero} d${day}`).toBeLessThanOrEqual(budget);
        expect(b.hullBonus - grant.hull).toBeGreaterThanOrEqual(0);
        expect((b.hullBonus - grant.hull) % PLATE).toBe(0);
        expect(routeProblems(b)).toEqual([]);
        expect(b.routes.length).toBeGreaterThan(0);
        const k = `${b.hero}@${day}`;
        if (!picked.has(k)) picked.set(k, new Set());
        picked.get(k)!.add(J(b));
        n++;
      }
    }
    expect(n).toBe(2000);
    // both heroes stand in on every day, and the seed spreads the stand-ins over each hero's six captains
    // 0.8.0 N1 (oracle 94b9559fbb7da299 (4b)): all four heroes stand in on every day; FURNACE and WEAVER have seven
    // captains each (at least 3 distinct decks a day), FOUNDRY and BASTION two each (at least 2)
    expect(picked.size).toBe(4 * RUN_DAYS);
    for (const [k, s] of picked) expect(s.size, k).toBeGreaterThanOrEqual(k.startsWith("foundry@") || k.startsWith("bastion@") ? 2 : 3);
  });

  it("is deterministic, and returns copies: mutating a deck never changes the next call", () => {
    for (const seed of SEEDS.slice(0, 20)) {
      for (const day of DAYS) {
        const a = standInFoe(seed, day), b = standInFoe(seed, day);
        expect(b).toEqual(a);
        const before = J(a);
        a.build.items.push({ uid: 999, def: "plating", x: 0, y: 0 });
        a.build.items[0].x = 9;
        a.build.routes[0].cells.push(0);
        a.build.mods.length = 0;
        a.build.hullBonus = 999;
        expect(J(standInFoe(seed, day))).toBe(before);
        // 0.8.0 N1 (oracle 94b9559fbb7da299 (4c)): the pool's own pick, only for a hero the pool holds (a FOUNDRY or
        // BASTION captain never uses it)
        if (!STAND_IN_POOL_HEROES.includes(a.hero)) continue;
        const p = standInPick(a.hero, day, seed);
        const pj = J(p);
        p.routes.length = 0;
        p.beltCap = 0;
        expect(J(standInPick(a.hero, day, seed))).toBe(pj);
      }
    }
  });
});

describe("the dusk fights the stored deck", () => {
  it("chooseFoe with no ghost uses standInFoe; startDusk stores it; a reload fights the same deck", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const day of DAYS) {
        const run = newRun("furnace", seed, "me");
        run.day = day;
        const s = standInFoe(seed, day);
        const f = startDusk(run, []);
        expect([f.kind, f.rival, f.name, f.hero]).toEqual(["standin", s.id, s.name, s.hero]);
        expect(f.build).toEqual(s.build);
        const back = migrateRun(JSON.parse(J(run)))!;
        expect(startDusk(back, []).build).toEqual(s.build);
      }
    }
  });

  // 0.6.2 TUNE-C: the old deck is now the stand-in pool's (0.6.0d until TUNE-C); a run saved mid-dusk keeps it
  it("a saved run whose stored foe has an old stand-in pool deck keeps that deck (no save migration)", () => {
    const run = newRun("weaver", 555, "me");
    run.day = 6;
    const id = standInGhost(555, 6);
    const old: Build = standInPick(RIVALS[id].hero, 6, 555);
    run.dusk = { day: 6, kind: "standin", name: RIVALS[id].name, hero: RIVALS[id].hero, build: old, rival: id };
    run.stage = "battle";
    const back = migrateRun(JSON.parse(J(run)))!;
    expect(back.dusk!.build).toEqual(old);
    const f = startDusk(back, []);
    expect(f.build).toEqual(old);
    expect(f.build).not.toEqual(standInFoe(555, 6).build);
    expect(chooseFoe({ ...back, dusk: null }, []).build).toEqual(standInBuild(id, 6)); // a new pick is the named build
  });
});

// 0.6.2 TUNE-C: every stand-in is a captain with a plan, so standInFoe never reads the pool (before TUNE-C a captain
// whose hero had no pool decks fell back to standInBuild; now every captain fights with it)
describe("standInFoe never reads the stand-in pool", () => {
  it("with the pool emptied (no heroes, standInPick throwing), every stand-in is unchanged: standInBuild(id, day)", async () => {
    vi.resetModules();
    vi.doMock("../src/sim/standInPool", async (importOriginal) => {
      const mod = await importOriginal<typeof import("../src/sim/standInPool")>();
      return { ...mod, STAND_IN_POOL_HEROES: [], standInPick: () => { throw new Error("standInFoe read the pool"); } };
    });
    try {
      const g = await import("../src/game/ghosts");
      let furnace = 0, weaver = 0;
      for (const seed of SEEDS.slice(0, 20)) {
        for (const day of DAYS) {
          const f = g.standInFoe(seed, day);
          const id = standInGhost(seed, day);
          expect([f.id, f.name, f.hero]).toEqual([id, RIVALS[id].name, RIVALS[id].hero]);
          expect(f.build).toEqual(standInBuild(id, day));
          if (f.hero === "furnace") furnace++;
          else weaver++;
        }
      }
      expect(furnace).toBeGreaterThan(0);
      expect(weaver).toBeGreaterThan(0);
    } finally {
      vi.doUnmock("../src/sim/standInPool");
      vi.resetModules();
    }
  });
});
