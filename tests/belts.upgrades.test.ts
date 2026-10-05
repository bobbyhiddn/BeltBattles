// bb-0.8.3 (REQ-BFG-043, REQ-BFG-044; job BELTS D10, D11): every hero's two gold upgrade tracks, TURRET SPEED and FACTORY,
// levels 1-4 at 10 / 20 / 30 gold (the operator's prices), bought in the caravan OUTSIDE the shop roll. The levels live on
// the build (Build.upgrades), travel in the ghost snapshot and the save, count in every sum of value (stars.ts
// upgradeGold, through validate.ts buildCost and rivals.ts deckCost), and nothing refunds them.
import { afterEach, describe, expect, it } from "vitest";
import {
  HEROES, ITEMS, START_GOLD, TURRET_SPEED, UPGRADE_MAX, UPGRADE_PRICE, UPGRADE_TRACKS, type HeroId,
} from "../src/sim/content";
import { installedTurrets, setTurretList, turretSlots, type Build } from "../src/sim/deck";
import { effectAt, gradeOf, levelOf, outputsAt, trackGold, upgradeGold, upgradeLevel } from "../src/sim/stars";
import { Battle } from "../src/sim/battle";
import { rateDeck } from "../src/sim/deckRating";
import { deckCost } from "../src/sim/rivals";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { checkBuildShape, decodeSnapshot, encodeSnapshot, SnapshotError, type GhostSnapshot } from "../src/net/snapshot";
import { RULES_VERSION } from "../src/sim/content";
import { levelSpeed, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED (K = 30), TURRET SPEED's whole steps
import { roundHalfUp } from "../src/sim/pct"; // NUM-2: a turret's speed rounds half up once (battle.ts makeTurret)
import type { TurretState } from "../src/sim/battle";
import {
  buyUpgrade, loadRun, newRun, nextUpgrade, reroll, rollShop, saveRun, sellInventory, upgradeShown, type Run,
} from "../src/game/run";
import { removeTurret } from "../src/sim/deck";
import { playerRun } from "../src/sim/harness/player";
import { decodeStarredRaw, encodeStarred } from "../src/sim/standInPool";
import * as harnessCode from "../src/sim/harness/standinCode";
import { RIVAL_IDS, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { CAPTAIN_LEVELS } from "../src/sim/rivalBuilds";
import { barge, SEED } from "./arsenal.bench";

/** A captain's stand-in deck's cost (the honest deck rivals.ts standInBuild serves): buildCost of it. */
const standInCost = (id: (typeof RIVAL_IDS)[number], day: number): number => buildCost(standInBuild(id, day)).total;
import { K, tally } from "./belts.helpers";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const J = (x: unknown): string => JSON.stringify(x);

/** A run on `day` with `gold`, its caravan rolled. */
function caravan(hero: HeroId, seed: number, day = 5, gold = 200): Run {
  const run = newRun(hero, seed, `up-${hero}-${seed}`);
  run.day = day;
  run.gold = gold;
  rollShop(run);
  return run;
}

describe("D10: the prices and the levels (the operator's: 10, 20, 30 gold; levels 1-4)", () => {
  it("level 2 costs 10 gold, level 3 20, level 4 30: 60 a track, 120 both; a level is 1-4", () => {
    expect(UPGRADE_PRICE.slice(2)).toEqual([10, 20, 30]);
    expect(UPGRADE_MAX).toBe(4);
    expect(UPGRADE_TRACKS).toEqual(["turret", "factory"]);
    expect([1, 2, 3, 4].map(trackGold)).toEqual([0, 10, 30, 60]);
    expect(upgradeGold({ upgrades: { turret: 4, factory: 4 } })).toBe(120);
    expect(upgradeGold({ upgrades: { factory: 3 } })).toBe(30);
    expect(upgradeGold({})).toBe(0);
    expect([undefined, 0, 1, 2, 4, 5, 9].map((n) => levelOf(n))).toEqual([1, 1, 1, 2, 4, 4, 4]);
  });

  it("buying: each level at its price, the gold drops by it, the level rises; MAX at 4; too little gold is refused", () => {
    for (const hero of HEROES4) for (const track of UPGRADE_TRACKS) {
      const run = caravan(hero, 3);
      for (const [lvl, price] of [[2, 10], [3, 20], [4, 30]]) {
        expect(nextUpgrade(run, track), `${hero} ${track}`).toEqual({ level: lvl - 1, next: lvl, price });
        const gold = run.gold, r = buyUpgrade(run, track);
        expect([r.ok, r.level, gold - run.gold, upgradeLevel(run.build, track)], `${hero} ${track} ${lvl}`).toEqual([true, lvl, price, lvl]);
      }
      const gold = run.gold;
      expect(buyUpgrade(run, track)).toEqual({ ok: false, reason: "MAX LEVEL", level: 4 });
      expect(nextUpgrade(run, track)).toEqual({ level: 4 });
      expect(run.gold).toBe(gold);
      // too little gold: refused, nothing changes (the dimmed button's case)
      const poor = caravan(hero, 3, 1, 9);
      expect(buyUpgrade(poor, track)).toEqual({ ok: false, reason: "NEED 1 MORE GOLD", level: 1 });
      expect([poor.gold, poor.build.upgrades]).toEqual([9, undefined]);
    }
    expect(START_GOLD).toBeLessThan(UPGRADE_PRICE[2]); // nothing to buy on day 1 (8 gold)
  });

  it("the levels are written as the snapshot writes them: only bought ones, turret before factory", () => {
    const run = caravan("furnace", 4);
    buyUpgrade(run, "factory");
    expect(J(run.build.upgrades)).toBe('{"factory":2}');
    buyUpgrade(run, "turret");
    expect(J(run.build.upgrades)).toBe('{"turret":2,"factory":2}');
  });

  it("outside the shop roll: buying takes no offer slot, draws on no stream and changes nothing the shop shows", () => {
    for (const hero of HEROES4) for (const seed of [1, 2, 3, 7, 11]) {
      const a = caravan(hero, seed), b = caravan(hero, seed);
      const shop = J(a.shop);
      for (const t of ["factory", "turret", "factory", "factory", "turret"] as const) expect(buyUpgrade(a, t).ok).toBe(true);
      expect(J(a.shop), `${hero} ${seed}`).toBe(shop); // the offers, their prices, sold flags and the reroll count
      // the stream: a reroll after the purchases rolls exactly what the twin run without them rolls
      a.gold = b.gold = 50;
      expect([reroll(a), reroll(b)]).toEqual([true, true]);
      expect(J(a.shop.wagons), `${hero} ${seed} reroll`).toBe(J(b.shop.wagons));
      // and the next day's caravan too
      a.day = b.day = 6;
      rollShop(a);
      rollShop(b);
      expect(J(a.shop.wagons), `${hero} ${seed} day 6`).toBe(J(b.shop.wagons));
    }
  });

  it("no shop, event or draw offers a signature factory: none has a merchant or a price", () => {
    for (const hero of Object.values(HEROES)) expect([ITEMS[hero.factory].merchant, ITEMS[hero.factory].price], hero.id).toEqual([undefined, 0]);
    for (const hero of HEROES4) for (let seed = 1; seed <= 60; seed++) for (const day of [1, 3, 5, 8, 10]) {
      const run = caravan(hero, seed, day);
      for (const w of run.shop.wagons) for (const o of w.offers) expect(Object.values(HEROES).some((h) => h.factory === o.def), `${hero} ${seed} d${day}`).toBe(false);
    }
  });
});

describe("D10: each level's effect, against the sim", () => {
  it("FACTORY: the battle's hero factory cycle is its level's (house curve), its slugs a cycle each; its base never moves", () => {
    for (const hero of HEROES4) {
      const def = HEROES[hero].factory;
      for (const l of [1, 2, 3, 4]) {
        const b: Build = { hero, items: [{ uid: 7, def, x: 4, y: 6 }], routes: [{ factory: 7, cells: [K(4, 5)] }], mods: [], beltCap: 40, hullBonus: 0, ...(l > 1 ? { upgrades: { factory: l } } : {}) };
        const f = new Battle(b, barge(), SEED).sides[0].factories.find((x) => x.uid === 7)!;
        // NUM-2 (REQ-BFG-047): the cycle is the whole speed (was .interval on both sides, undefined === undefined after the rename)
        expect([gradeOf(b, b.items[0]), f.def.factory!.speed], `${def} L${l}`).toEqual([l, effectAt(def, l).factory!.speed]);
        expect(f.def.factory!.speed, `${def} L${l}`).toBeGreaterThan(0); // NUM-2: a real number, never undefined
        expect(f.def.factory!.base, `${def} L${l}`).toBe(ITEMS[def].factory!.base); // the cycle only (oracle 6c20deea1363d0bb, D2)
      }
      // each level is faster than the one before
      const iv = [1, 2, 3, 4].map((l) => secPer(effectAt(def, l).factory!.speed)); // NUM-2: 30 / speed (was .interval)
      for (let i = 1; i < 4; i++) expect(iv[i], `${def}`).toBeLessThan(iv[i - 1]);
    }
    // the slugs stamped: a level-4 KILN on one long belt stamps its cycles' worth in 30 s, as the cycle says
    const kiln = (l: number): Build => ({
      hero: "furnace", items: [{ uid: 7, def: "kiln", x: 6, y: 5 }], mods: [], beltCap: 40, hullBonus: 0,
      routes: [{ factory: 7, cells: [K(5, 6), K(4, 6), K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] }],
      turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true }], ...(l > 1 ? { upgrades: { factory: l } } : {}),
    });
    const n = [1, 4].map((l) => tally(kiln(l), 7, 30));
    // NUM-2 (REQ-BFG-047): the cycle is 30 / speed (was the interval: 1.25 s and 0.7 s); the stamp timer carries its
    // remainder, so the stamps fall at 0.35 s + k cycles: 24 and 42 casts in 30 s (were 24 and 43: level 4's 30 / 42 s cycle
    // is longer than its old 0.7 s)
    const cycles = (l: number): number => Math.floor((30 - 0.35) / secPer(effectAt("kiln", l).factory!.speed)) + 1; // NUM-2 (was .interval)
    expect(n.map((t) => t.casts)).toEqual([cycles(1), cycles(4)]);
    expect([cycles(1), cycles(4)]).toEqual([24, 42]); // NUM-2 (was 24, 43): the measured casts, as the cycle says
  });

  it("TURRET SPEED: a starting turret fires at TURRET_SPEED[level] of its interval (x0.85 a level); a bought one doesn't change", () => {
    // NUM-2 (REQ-BFG-047, N1 2.2), an EQUIVALENT REPLACEMENT of the x0.85-a-level interval shares: TURRET SPEED is a whole
    // step of speed, + roundHalfUp(20% x the level-1 speed) a level (content.ts levelSpeed: SCRAP CANNON 30 / 36 / 42 / 48),
    // and the battle rounds the speed x the turret's other rates (gear, the long belt) half up once: 30 / that is its interval
    expect(TURRET_SPEED).toBe(20); // NUM-2 (was TURRET_SPEED.slice(1) = [1, 0.85, 0.72, 0.61], the interval x at levels 1-4)
    /** NUM-2: a starting turret's interval at TURRET SPEED level `l`, from its level-1 TurretState (its TurretDef's speed s1
     *  and its other rates, speedRaw / s1). */
    const at = (t1: TurretState, l: number): number => secPer(Math.max(1, roundHalfUp(levelSpeed(t1.def.speed, l, TURRET_SPEED) * (t1.speedRaw / t1.def.speed))));
    for (const hero of HEROES4) {
      const run = newRun(hero, 5);
      const ones = new Battle(run.build, barge(), SEED).sides[0].turrets; // NUM-2: level 1's TurretStates (speed and rates)
      const base = ones.map((t) => t.interval);
      for (const l of [2, 3, 4]) {
        const b: Build = { ...run.build, upgrades: { turret: l } };
        const now = new Battle(b, barge(), SEED).sides[0].turrets.map((t) => t.interval);
        const free = installedTurrets(b).map((s) => !!s.turret.free);
        // NUM-2 (was toBeCloseTo(free[i] ? base[i] x TURRET_SPEED[l] : base[i], 9))
        now.forEach((x, i) => expect(x, `${hero} L${l} slot ${i}`).toBeCloseTo(free[i] ? at(ones[i], l) : base[i], 9));
        now.forEach((x, i) => { if (free[i]) expect(x, `${hero} L${l} slot ${i}: faster`).toBeLessThan(base[i]); }); // NUM-2
        // the forecast reads the same turrets (deck.ts turretSlots): faster guns rate higher
        expect(rateDeck(b).offense, `${hero} L${l}`).toBeGreaterThanOrEqual(rateDeck(run.build).offense);
      }
    }
    // a bought turret in the extra slot keeps its interval; a starting turret merged with a bought copy keeps the speed
    const run = newRun("furnace", 5);
    setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 700, stars: 2, free: true }, { slot: 1, def: "bombard", uid: 701 }]);
    const plainT = new Battle(run.build, barge(), SEED).sides[0].turrets; // NUM-2: level 1's TurretStates
    const plain = plainT.map((t) => t.interval);
    const fast = new Battle({ ...run.build, upgrades: { turret: 3 } }, barge(), SEED).sides[0].turrets.map((t) => t.interval);
    expect(fast[0]).toBeCloseTo(at(plainT[0], 3), 9); // NUM-2 (was plain[0] x TURRET_SPEED[3], x0.72)
    // NUM-2: the merged ★2 copy's own speed is the step's base (SCRAP CANNON ★2 33: 33 + 2 x roundHalfUp(6.6) = 47 at level 3)
    expect([plainT[0].def.speed, roundHalfUp(secPer(fast[0]))]).toEqual([ITEMS.scrapcannon.levels![2]!.turret!.speed, levelSpeed(ITEMS.scrapcannon.levels![2]!.turret!.speed, 3, TURRET_SPEED)]);
    expect(fast[1]).toBe(plain[1]);
  });

  it("the hero factory's slots: 2 / 3 / 4 / 5 by level (the LOOM 3 / 4 / 5 / 6), read at the build's level, never its stars", () => {
    for (const hero of Object.keys(HEROES) as HeroId[]) {
      const def = HEROES[hero].factory, lead = def === "loom" ? 1 : 0;
      expect([1, 2, 3, 4].map((l) => outputsAt(def, gradeOf({ upgrades: { factory: l } }, { def }))), def).toEqual([2, 3, 4, 5].map((n) => n + lead));
      // a stars field on it is ignored (and validate refuses one): the level is the build's
      expect(gradeOf({ upgrades: { factory: 2 } }, { def, stars: 3 }), def).toBe(2);
    }
  });
});

describe("D10: value, the upload budget and the strict decoder", () => {
  it("the upgrade gold counts in buildCost (the upload budget) and deckCost (the rivals, the harness): 0 / 10 / 30 / 60 a track", () => {
    for (const hero of HEROES4) {
      const b = newRun(hero, 5).build;
      const c0 = buildCost(b).total, d0 = deckCost(b).total;
      expect(c0).toBe(d0);
      for (const [t, f] of [[1, 1], [2, 1], [1, 2], [3, 2], [4, 4]]) {
        const u: Build = { ...b, upgrades: { ...(t > 1 ? { turret: t } : {}), ...(f > 1 ? { factory: f } : {}) } };
        const paid = trackGold(t) + trackGold(f);
        expect([buildCost(u).total - c0, deckCost(u).total - d0, buildCost(u).upgrades], `${hero} ${t}/${f}`).toEqual([paid, paid, paid]);
      }
      expect("upgrades" in buildCost(b)).toBe(false); // a build without levels breaks down exactly as before
    }
  });

  it("validate.ts: a level the day's gold can't pay for is refused; level 5 and a 2-star signature factory are refused", () => {
    const b = newRun("furnace", 5).build;
    expect(validateBuild(b, 1).ok).toBe(true);
    // day 1: 8 gold; FACTORY level 2 costs 10, level 4 60
    for (const up of [{ factory: 2 }, { factory: 4 }, { turret: 4 }]) {
      const v = validateBuild({ ...b, upgrades: up }, 1);
      expect(v.errors.some((e) => e.startsWith("budget:")), J(up)).toBe(true);
    }
    // day 2: 17 gold pays for one level 2, not two (20)
    expect(validateBuild({ ...b, upgrades: { factory: 2 } }, 2).ok).toBe(true);
    expect(validateBuild({ ...b, upgrades: { factory: 2, turret: 2 } }, 2).errors.some((e) => e.startsWith("budget:"))).toBe(true);
    expect(maxGoldByDay(2)).toBe(17);
    // level 5 and 0: the strict shape check refuses them (and so validateBuild and validateUpload)
    for (const n of [5, 0, 2.5]) {
      expect(() => checkBuildShape({ ...b, upgrades: { factory: n } })).toThrow(SnapshotError);
      expect(validateBuild({ ...b, upgrades: { factory: n } }, 10).ok, String(n)).toBe(false);
      expect(validateUpload({ ...b, upgrades: { turret: n } }, 10).ok, String(n)).toBe(false);
    }
    expect(() => checkBuildShape({ ...b, upgrades: { factory: 2, speed: 2 } })).toThrow(/unknown field/);
    // a 2-star signature factory: it never merges, so it can't have stars (0.8.0's rule, back)
    const two: Build = { ...b, items: b.items.map((p) => (p.def === "kiln" ? { ...p, stars: 2 } : p)) };
    expect(validateBuild(two, 10).errors).toContain("item: uid 1 KILN can't have 2 stars (signatures and supplies never merge)");
    expect(validateUpload(two, 10).ok).toBe(false);
  });

  it("the snapshot carries the levels: canonical, after every other build key; a build without them encodes as before", () => {
    const run = newRun("weaver", 9);
    const snap = (build: Build): GhostSnapshot => ({ v: 2, rules: RULES_VERSION, hero: "weaver", day: 4, wins: 1, lives: 5, build, runId: "r1", playerId: "p1", createdAt: 1 });
    const plain = encodeSnapshot(snap(run.build));
    expect(plain).not.toContain("upgrades");
    const up = { ...run.build, upgrades: { turret: 2, factory: 3 } };
    const text = encodeSnapshot(snap(up));
    expect(text).toContain('"upgrades":{"turret":2,"factory":3}');
    expect(text.indexOf('"upgrades"')).toBeGreaterThan(text.indexOf('"hullBonus"'));
    expect(decodeSnapshot(text).build.upgrades).toEqual({ turret: 2, factory: 3 });
    // key order on the way in doesn't matter; on the way out it is canonical
    expect(encodeSnapshot(snap({ ...run.build, upgrades: { factory: 3, turret: 2 } }))).toBe(text);
    expect(() => checkBuildShape(up, "build", 1)).toThrow(/not allowed in a v1 snapshot/);
  });
});

describe("D7': the bots buy the upgrades; the stand-in code and the captains carry them", () => {
  it("the par player buys level 2 of some track in most runs, through buyUpgrade, and its dusk decks carry the levels", () => {
    for (const hero of HEROES4) {
      let runs = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const days = playerRun(hero, 10, seed);
        const ups = days.flatMap((d) => d.buys.filter((b) => b.def.startsWith("upgrade:")));
        if (ups.length) runs++;
        for (const u of ups) expect([UPGRADE_PRICE[u.stars], u.merged], `${hero} ${seed}`).toEqual([u.price, false]);
        // the levels bought are on the dusk deck of that day and after, and its value counts their gold
        const last = days[days.length - 1].build;
        expect(upgradeLevel(last, "factory") + upgradeLevel(last, "turret") - 2, `${hero} ${seed}`).toBe(ups.length);
        expect(buildCost(last).upgrades ?? 0).toBe(ups.reduce((s, u) => s + u.price, 0));
      }
      expect(runs, hero).toBeGreaterThanOrEqual(4);
    }
  });

  it("an honest run with upgrades passes the upload check on every day (validateUpload, the player mode and its budget)", () => {
    let withLevels = 0;
    for (const hero of HEROES4) for (let seed = 1; seed <= 4; seed++) for (const d of playerRun(hero, 10, seed)) {
      const v = validateUpload(d.build, d.day);
      expect(v.errors, `${hero} seed ${seed} day ${d.day}`).toEqual([]);
      if (d.build.upgrades) withLevels++;
    }
    expect(withLevels).toBeGreaterThan(30); // most late decks carry a level
  });

  it("the stand-in code carries the levels (a head word \"u<turret><factory>\"); a deck without them encodes as before", () => {
    const b = newRun("weaver", 2).build;
    const code = encodeStarred(b);
    expect(code).not.toMatch(/ u\d\d\//);
    const up: Build = { ...b, upgrades: { factory: 3 } };
    const c2 = encodeStarred(up);
    expect(c2.split("/")[0]).toBe(`${b.beltCap} ${b.hullBonus} u13`);
    expect(decodeStarredRaw("weaver", c2).upgrades).toEqual({ factory: 3 });
    expect(harnessCode.decodeStarred("weaver", harnessCode.encodeStarred(up)).upgrades).toEqual({ factory: 3 });
    expect(() => decodeStarredRaw("weaver", c2.replace("u13", "u15"))).toThrow(/bad upgrade word/);
  });

  it("the captains buy their hero's par-player levels on its median days, within the day's gold (the uniform rule)", () => {
    for (const id of RIVAL_IDS) for (let day = 1; day <= 10; day++) {
      const l = rivalLoadout(id, day), hero = l.build.hero;
      const days = CAPTAIN_LEVELS[hero];
      for (const track of UPGRADE_TRACKS) {
        const lv = upgradeLevel(l.build, track), plan = days[track] ?? [];
        expect(lv - 1, `${id} d${day} ${track}`).toBeLessThanOrEqual(plan.filter((d) => d <= day).length);
      }
      if (id !== "matriarch") expect(standInCost(id, day), `${id} d${day}`).toBeLessThanOrEqual(maxGoldByDay(day));
    }
    // most captains of a hero with a FACTORY level day hold that level by day 10
    expect(RIVAL_IDS.filter((id) => upgradeLevel(rivalLoadout(id, 10).build, "factory") >= 2).length).toBeGreaterThan(RIVAL_IDS.length / 2);
  });
});

describe("D10: no refunds, the starting turret, and the save", () => {
  const g = globalThis as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; });
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    };
  };

  it("the save keeps the levels", () => {
    g.localStorage = mem();
    const run = caravan("bastion", 6);
    buyUpgrade(run, "factory");
    buyUpgrade(run, "factory");
    buyUpgrade(run, "turret");
    saveRun(run);
    const back = loadRun()!;
    expect(back.build.upgrades).toEqual({ turret: 2, factory: 3 });
    expect(back.gold).toBe(run.gold);
  });

  it("no refunds: selling or stowing a starting turret returns no upgrade gold; the level stays with the run", () => {
    const run = caravan("furnace", 2);
    buyUpgrade(run, "turret");
    buyUpgrade(run, "turret");
    const level = upgradeLevel(run.build, "turret");
    // live084: a starting turret can go to cargo (TO CARGO, any star); a 1-star free copy can't be sold
    const t = turretSlots(run.build)[0].turret!;
    expect(t.free).toBe(true);
    expect(removeTurret(run.build, 0)).toBeTruthy();
    run.inventory.push({ uid: t.uid, def: t.def, free: true });
    expect(upgradeShown(run, "turret")).toBe(false); // no starting turret aboard: the control doesn't show
    expect(buyUpgrade(run, "turret")).toMatchObject({ ok: false, reason: "NO STARTING TURRET ABOARD" });
    const gold = run.gold;
    expect(sellInventory(run, t.uid)).toBe(0); // a 1-star free copy doesn't sell
    expect([run.gold, upgradeLevel(run.build, "turret")]).toEqual([gold, level]);
    expect(upgradeShown(run, "factory")).toBe(true); // the hero factory never leaves
  });
});
