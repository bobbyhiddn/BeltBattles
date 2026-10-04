// bb-0.8.6 (REQ-BFG-051, job PACKS P1-P3, P6): every caravan visit has two FIXED offers outside the roll, BELT PACK (2 gold,
// +4 belt capacity) and ARMOR PACK (5 gold, +25 max hull), bought again and again while the gold lasts, with no cap and no
// discount. The crate and the plating left the rolled pool (their ITEMS entries and ids stay). Validation stays bounded by
// gold, strict and in the player mode; the client's snapshot check takes beltCap and hullBonus exactly as the strict
// decoder does. The bots buy packs on value (harness/belts.ts PACK_POLICY).
import { afterEach, describe, expect, it } from "vitest";
import { HEROES, ITEMS, MERCHANTS, PACK_IDS, PACK_ITEM, itemsSoldBy, type HeroId, type MerchantId, type PackId } from "../src/sim/content";
import { buildCost, maxGoldByDay, validateBuild, validateUpload } from "../src/net/validate";
import { playerFits } from "../src/net/roadCap";
import { decodeSnapshot, encodeSnapshot, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { buyPack, loadRun, newRun, packPrice, packShort, reroll, rollShop, saveRun, type Run } from "../src/game/run";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { playerRun, type PlayerDay } from "../src/sim/harness/player";
import { PACK_POLICY, type PackPolicy } from "../src/sim/harness/belts";
import { RULES_VERSION } from "../src/sim/content";

const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const J = (x: unknown): string => JSON.stringify(x);

/** A run on `day` with `gold`, its caravan rolled. */
function caravan(hero: HeroId, seed: number, day = 5, gold = 200): Run {
  const run = newRun(hero, seed, `packs-${hero}-${seed}`);
  run.day = day;
  run.gold = gold;
  rollShop(run);
  return run;
}

/** Run `fn` with hero `h`'s pack policy set to `p` (the table is read at run time), then put "value" back. */
function withPacks<T>(h: HeroId, p: PackPolicy, fn: () => T): T {
  const table = PACK_POLICY as Record<HeroId, PackPolicy>, saved = table[h];
  table[h] = p;
  try { return fn(); } finally { table[h] = saved; }
}

const packBuys = (days: PlayerDay[]) => days.flatMap((d) => d.buys.filter((b) => b.def === "beltcrate" || b.def === "plating"));

describe("P1-P2: the two fixed packs", () => {
  it("BELT PACK: 2 gold for +4 belt capacity; ARMOR PACK: 5 gold for +25 max hull; the ids beltcrate and plating stay", () => {
    expect(PACK_IDS).toEqual(["belt", "armor"]);
    expect(PACK_ITEM).toEqual({ belt: "beltcrate", armor: "plating" });
    expect([ITEMS.beltcrate.name, ITEMS.beltcrate.price, ITEMS.beltcrate.supply]).toEqual(["BELT PACK", 2, { belt: 4 }]);
    expect([ITEMS.plating.name, ITEMS.plating.price, ITEMS.plating.supply]).toEqual(["ARMOR PACK", 5, { hull: 25 }]);
    expect([packPrice("belt"), packPrice("armor")]).toEqual([2, 5]);
    expect([ITEMS.beltcrate.kind, ITEMS.plating.kind, ITEMS.beltcrate.merchant, ITEMS.plating.merchant]).toEqual(["supply", "supply", "ironmonger", "ironmonger"]);
  });

  it("each buy applies at once (+4 beltCap or +25 hullBonus) for its price, again and again, with no cap", () => {
    for (const hero of HEROES4) {
      const run = caravan(hero, 2, 7, 120);
      const belt0 = run.build.beltCap, hull0 = run.build.hullBonus;
      for (let i = 1; i <= 12; i++) {
        expect(buyPack(run, "belt"), `${hero} belt ${i}`).toEqual({ ok: true, price: 2 });
        expect([run.build.beltCap, run.gold]).toEqual([belt0 + 4 * i, 120 - 2 * i]);
      }
      for (let i = 1; i <= 19; i++) expect(buyPack(run, "armor").ok, `${hero} armor ${i}`).toBe(true);
      expect([run.build.hullBonus, run.gold]).toEqual([hull0 + 25 * 19, 120 - 24 - 95]);
      // 1 gold left: both refused, nothing changes, and the reason is the slot's tap text
      expect(buyPack(run, "belt")).toEqual({ ok: false, reason: "A BELT PACK COSTS 2G", price: 2 });
      expect(buyPack(run, "armor")).toEqual({ ok: false, reason: "AN ARMOR PACK COSTS 5G", price: 5 });
      expect([run.gold, run.build.beltCap, run.build.hullBonus]).toEqual([1, belt0 + 48, hull0 + 475]);
    }
  });

  it("exact gold buys: 2 gold buys a BELT PACK, 5 an ARMOR PACK; one less is refused (packShort)", () => {
    const run = caravan("furnace", 1, 1, 2);
    expect(packShort(run, "belt")).toBeUndefined();
    expect(packShort(run, "armor")).toBe("AN ARMOR PACK COSTS 5G");
    expect(buyPack(run, "belt").ok).toBe(true);
    expect(run.gold).toBe(0);
    run.gold = 4;
    expect(buyPack(run, "armor").ok).toBe(false);
    run.gold = 5;
    expect(buyPack(run, "armor").ok).toBe(true);
    expect(run.gold).toBe(0);
  });

  it("no discount and no free reroll ever applies to a pack (a scout's deal leaves the packs at 2 and 5)", () => {
    const run = caravan("weaver", 4, 3, 30);
    run.shop.discount = 3;
    run.shop.free = 2;
    expect(buyPack(run, "belt")).toEqual({ ok: true, price: 2 });
    expect(buyPack(run, "armor")).toEqual({ ok: true, price: 5 });
    expect([run.gold, run.shop.discount, run.shop.free]).toEqual([23, 3, 2]);
  });

  it("outside the roll: a pack buy takes no offer slot, draws on no stream and changes nothing the shop shows", () => {
    for (const hero of HEROES4) for (const seed of [1, 2, 3, 7, 11, 19]) {
      const a = caravan(hero, seed), b = caravan(hero, seed);
      const shop = J(a.shop);
      for (const p of ["belt", "armor", "belt", "belt", "armor", "armor"] as PackId[]) expect(buyPack(a, p).ok).toBe(true);
      expect(J(a.shop), `${hero} ${seed}`).toBe(shop); // the offers, their prices, sold flags, the reroll count, the scout
      // the stream: a reroll after the buys rolls exactly what the twin run without them rolls
      a.gold = b.gold = 50;
      expect([reroll(a), reroll(b)]).toEqual([true, true]);
      expect(J(a.shop.wagons), `${hero} ${seed} reroll`).toBe(J(b.shop.wagons));
      // and the next days' caravans too
      for (const day of [6, 9]) {
        a.day = b.day = day;
        rollShop(a);
        rollShop(b);
        expect(J(a.shop.wagons), `${hero} ${seed} day ${day}`).toBe(J(b.shop.wagons));
      }
    }
  });
});

describe("P1: the crate and the plating left the rolled pool", () => {
  it("no merchant's rolled stock holds a supply; every other ware is still sold", () => {
    for (const m of Object.keys(MERCHANTS) as MerchantId[]) expect(itemsSoldBy(m).filter((d) => d.kind === "supply"), m).toEqual([]);
    const ironmonger = itemsSoldBy("ironmonger").map((d) => d.id);
    expect(ironmonger.length).toBeGreaterThan(3);
    expect(ironmonger).not.toContain("beltcrate");
    expect(ironmonger).not.toContain("plating");
  });

  it("never rolled: 4 heroes x 60 seeds x days 1-10, each caravan and 2 rerolls", () => {
    let rolls = 0;
    for (const hero of HEROES4) for (let seed = 1; seed <= 60; seed++) for (let day = 1; day <= 10; day++) {
      const run = caravan(hero, seed, day, 100);
      for (let r = 0; r < 3; r++) {
        if (r) expect(reroll(run)).toBe(true);
        rolls++;
        for (const w of run.shop.wagons) for (const o of w.offers) expect(["beltcrate", "plating"], `${hero} ${seed} d${day} r${r}`).not.toContain(o.def);
      }
    }
    expect(rolls).toBe(4 * 60 * 10 * 3);
  });
});

describe("P5: the save keeps pack buys", () => {
  const g = globalThis as { localStorage?: Storage };
  afterEach(() => { delete g.localStorage; });
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
      getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    };
  };

  it("a reload keeps the belt, the hull and the gold of every pack bought", () => {
    g.localStorage = mem();
    const run = caravan("bastion", 6, 4, 40);
    const belt0 = run.build.beltCap, hull0 = run.build.hullBonus;
    for (const p of ["belt", "belt", "armor", "belt", "armor"] as PackId[]) buyPack(run, p);
    saveRun(run);
    const back = loadRun()!;
    expect([back.build.beltCap, back.build.hullBonus, back.gold]).toEqual([belt0 + 12, hull0 + 50, 40 - 6 - 10]);
    expect(J(back.shop)).toBe(J(run.shop));
  });
});

describe("P3: validation stays bounded by gold, on the strict and the player checks", () => {
  /** The hero's day-1 deck with `belts` BELT PACKs and `armors` ARMOR PACKs added. */
  const withPacks0 = (hero: HeroId, belts: number, armors: number) => {
    const b = heroStartBuild(hero, 1);
    b.beltCap += 4 * belts;
    b.hullBonus += 25 * armors;
    return b;
  };

  it("strict: packs are costed at 2 and 5 against maxGoldByDay; one ARMOR or BELT PACK past the day's gold is refused with the budget message", () => {
    for (const hero of HEROES4) for (const day of [1, 2, 5, 10]) {
      const base = buildCost(withPacks0(hero, 0, 0)).total, max = maxGoldByDay(day);
      const n = Math.floor((max - base) / 5);
      expect(validateBuild(withPacks0(hero, 0, n), day).errors, `${hero} d${day} ${n} armor`).toEqual([]);
      const over = validateBuild(withPacks0(hero, 0, n + 1), day).errors;
      expect(over.join(" | "), `${hero} d${day} armor +1`).toMatch(new RegExp(`^budget: build costs ${base + 5 * (n + 1)} gold \\(.*${n + 1} plating\\) but day ${day} allows at most ${max}$`));
      const m = Math.floor((max - base) / 2);
      expect(validateBuild(withPacks0(hero, m, 0), day).errors, `${hero} d${day} ${m} belt`).toEqual([]);
      expect(validateBuild(withPacks0(hero, m + 1, 0), day).errors.join(" | "), `${hero} d${day} belt +1`).toMatch(/^budget: build costs \d+ gold \(.* crates, 0 plating\) but day \d+ allows at most \d+$/);
    }
  });

  it("player mode (the upload check): the ceiling is the day's gold plus the best road mix; one ARMOR PACK past it is refused with the budget message", () => {
    for (const hero of HEROES4) for (const day of [1, 3, 6, 10]) {
      let n = 0;
      while (validateUpload(withPacks0(hero, 0, n + 1), day).ok) n++;
      expect(n, `${hero} d${day}`).toBeGreaterThanOrEqual(Math.floor((maxGoldByDay(day) - buildCost(withPacks0(hero, 0, 0)).total) / 5));
      const errs = validateUpload(withPacks0(hero, 0, n + 1), day).errors;
      expect(errs.join(" | "), `${hero} d${day}`).toMatch(/^budget: build costs \d+ gold \(.*\) but a player's day \d+ allows at most \d+ \(maxGoldByDay \d+ \+ roadCap \d+\)$/);
      const f = playerFits(withPacks0(hero, 0, n + 1), day, buildCost(withPacks0(hero, 0, n + 1)));
      expect(f.fits[0].cost, `${hero} d${day}`).toBeGreaterThan(f.fits[0].allow);
    }
  });

  it("a hull or a belt that no road mix plus whole packs can make stays refused (strict and player)", () => {
    for (const hero of HEROES4) {
      const odd = withPacks0(hero, 0, 0);
      odd.hullBonus = 1;
      expect(validateBuild(odd, 10).errors.join(" | ")).toMatch(/supply: hullBonus 1 is not a whole number of \+25 plating/);
      expect(validateUpload(odd, 10).errors.join(" | ")).toMatch(/supply: hullBonus 1 is not a hull a player can reach by day 10/);
      const belt = withPacks0(hero, 0, 0);
      belt.beltCap = HEROES[hero].belt + 1;
      expect(validateBuild(belt, 10).errors.join(" | ")).toMatch(/supply: beltCap \d+ is not \d+ \+ a whole number of \+4 belt crates/);
      expect(validateUpload(belt, 10).errors.join(" | ")).toMatch(/supply: beltCap \d+ is not \d+ \+ whole \+4 belt crates/);
    }
  });

  it("the client's snapshot check takes beltCap and hullBonus exactly as the strict decoder does", () => {
    const b0 = heroStartBuild("furnace", 1);
    const snap = (beltCap: number, hullBonus: number): GhostSnapshot => ({
      v: SNAPSHOT_VERSION, rules: RULES_VERSION, hero: "furnace", day: 10, wins: 9, lives: 5,
      build: { ...b0, beltCap, hullBonus }, runId: "packs-check", playerId: "p-packs", createdAt: 1_790_000_000_000,
    });
    const server = (s: GhostSnapshot) => { try { decodeSnapshot(JSON.stringify(s)); return true; } catch { return false; } };
    const cases: [number, number][] = [
      [b0.beltCap, 0], [b0.beltCap + 4 * 60, 25 * 24], [1000, 10000], [0, -1000], [1001, 0], [-1, 0], [b0.beltCap + 0.5, 0],
      [b0.beltCap, 10001], [b0.beltCap, -1001], [b0.beltCap, 12.5], [b0.beltCap, Number.NaN],
    ];
    const got = cases.map(([bc, hb]) => [bc, hb, server(snap(bc, hb)), isSnapshot(JSON.parse(JSON.stringify(snap(bc, hb))))]);
    for (const [bc, hb, s, c] of got) expect(c, `beltCap ${bc} hullBonus ${hb}`).toBe(s);
    expect(got.filter((g) => g[2]).length).toBe(4); // the first four are shape-legal, the rest aren't
    expect(encodeSnapshot(snap(b0.beltCap + 8, 50))).toContain(`"beltCap":${b0.beltCap + 8}`);
  });
});

describe("P6: the bots buy packs on value", () => {
  it("the par player (value) buys packs in most runs of every hero, at the flat prices, and its dusk decks carry them", () => {
    for (const hero of HEROES4) {
      let runs = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const days = playerRun(hero, 10, seed);
        const buys = packBuys(days);
        if (buys.length) runs++;
        for (const b of buys) expect([b.price, b.merged, b.stars], `${hero} ${seed}`).toEqual([ITEMS[b.def].price, false, 1]);
        const last = days[days.length - 1].build, start = heroStartBuild(hero, 1);
        expect(last.beltCap - start.beltCap, `${hero} ${seed} belt`).toBe(4 * buys.filter((b) => b.def === "beltcrate").length);
        expect(last.hullBonus - start.hullBonus, `${hero} ${seed} hull`).toBe(25 * buys.filter((b) => b.def === "plating").length);
      }
      expect(runs, hero).toBeGreaterThanOrEqual(4);
    }
  });

  it("never buys none; ARMOR-greedy and BELT-greedy spend every coin left on their pack at the day's end", () => {
    const never = withPacks("weaver", "never", () => playerRun("weaver", 10, 3, { onDecide: () => {} }));
    expect(packBuys(never)).toEqual([]);
    const armor = withPacks("weaver", "armor", () => playerRun("weaver", 10, 3, { onDecide: () => {} }));
    for (const d of armor) expect(d.gold, `armor d${d.day}`).toBeLessThan(5);
    const belt = withPacks("weaver", "belt", () => playerRun("weaver", 10, 3, { onDecide: () => {} }));
    for (const d of belt) expect(d.gold, `belt d${d.day}`).toBeLessThan(2);
    // a greedy buy is always its own pack; the greedy runs end their days with less gold than the value run's
    expect(packBuys(armor).filter((b) => b.why === "greedy").every((b) => b.def === "plating")).toBe(true);
    expect(packBuys(belt).filter((b) => b.why === "greedy").every((b) => b.def === "beltcrate")).toBe(true);
  });

  it("an honest pack-heavy run passes the upload check on every day: value, ARMOR-greedy and BELT-greedy (strict and player)", () => {
    for (const hero of HEROES4) for (const p of ["value", "armor", "belt"] as PackPolicy[]) for (const seed of [1, 2]) {
      const days = withPacks(hero, p, () => playerRun(hero, 10, seed, { onDecide: () => {} }));
      expect(packBuys(days).length, `${hero} ${p} ${seed}`).toBeGreaterThan(0);
      for (const d of days) {
        expect(validateUpload(d.build, d.day).errors, `${hero} ${p} seed ${seed} day ${d.day}`).toEqual([]);
        expect(validateBuild(d.build, d.day).errors, `${hero} ${p} seed ${seed} day ${d.day} strict`).toEqual([]);
      }
    }
  });
});
