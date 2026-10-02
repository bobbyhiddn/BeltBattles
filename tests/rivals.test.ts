import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import { kx, ky, type Build } from "../src/sim/deck";
import { BATTLE_CAP, HEROES, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, difficultyOf, rivalBuild, rivalDays, rivalLoadout,
  standInGhost, standInGhosts, warlordOffer, warlordOffers, warlordPool, type RivalId,
} from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { battleSeed, newRun } from "../src/game/run";
import { legalityProblems } from "./rivals.legality";

const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);

/** Gold a player who wins every day has had to spend before the fights of day `day`. */
function budget(day: number): number {
  let g = START_GOLD;
  for (let r = 1; r < day; r++) g += incomeFor(r, true);
  return g;
}

describe("rival roster", () => {
  it("fills Easy, Medium and Hard from both factions; the Matriarch is Hard on days 8-10 only", () => {
    // 0.8.0 N1 (BRIEF-wave3-N1 section 3, the expected roster changes): 19 captains; BRASSWICK joins Easy, GRIMHOLD Medium,
    // MASTER VOSS and THANE KARSK Hard (4 / 5 / 7); LOCKJAW and THISTLEMAIL stand in only and hold no slot (difficultyOf null)
    expect(RIVAL_IDS.length).toBe(19);
    // Part 4: SOOTJAW moved up to Medium and RATCHET down to Easy (the per-day ladder).
    expect(warlordPool("easy")).toEqual(["nettle", "grubnose", "ratchet", "brasswick"]);
    expect(warlordPool("medium")).toEqual(["sootjaw", "sparkfang", "lacewing", "emberlyn", "grimhold"]);
    expect(warlordPool("hard")).toEqual(["mothqueen", "bulwark", "silkshade", "longtooth", "highspire", "voss", "karsk"]);
    // every pool keeps both of the old factions (orc and elf); N1: humans join Easy and Hard, dwarves Medium and Hard
    for (const d of DIFFICULTIES) for (const f of ["orc", "elf"]) expect(warlordPool(d).map((id) => RIVALS[id].faction), `${d} ${f}`).toContain(f);
    expect(DIFFICULTIES.map((d) => new Set(warlordPool(d).map((id) => RIVALS[id].faction)).size)).toEqual([3, 3, 4]);
    expect(RIVAL_IDS.filter((id) => RIVALS[id].standInOnly)).toEqual(["lockjaw", "thistlemail"]);
    for (const id of RIVAL_IDS) {
      const r = RIVALS[id];
      const want = r.standInOnly ? null : r.rank !== "regular" || r.tier === 3 ? "hard" : r.tier === 1 ? "easy" : "medium";
      expect(difficultyOf(id), id).toBe(want);
      expect(rivalDays(id), id).toEqual(id === "matriarch" ? [8, 9, 10] : DAYS);
    }
    expect(difficultyOf("matriarch")).toBe("hard");
    expect([RUN_DAYS, MATRIARCH_DAY]).toEqual([10, 8]);
  });

  it("every rival has a short caps name, a trick, a blurb and a portrait note", () => {
    const names = new Set<string>();
    for (const id of RIVAL_IDS) {
      const d = RIVALS[id];
      expect(d.id).toBe(id);
      expect(d.name).toBe(d.name.toUpperCase());
      expect(d.name.length).toBeLessThanOrEqual(14);
      names.add(d.name);
      expect(d.faction).toBe(HEROES[d.hero].faction);
      expect(d.trick).toBe(d.trick.toUpperCase());
      expect(d.trick.length).toBeGreaterThan(0);
      expect(d.blurb).toBe(d.blurb.toUpperCase());
      expect(d.blurb.length).toBeLessThanOrEqual(44);
      expect(d.portrait.palette.length).toBeGreaterThanOrEqual(3);
      expect(d.portrait.palette.length).toBeLessThanOrEqual(4);
      expect(d.portrait.feature.length).toBeGreaterThan(0);
    }
    expect(names.size).toBe(RIVAL_IDS.length);
  });
});

describe("rival builds are legal production builds", () => {
  for (const id of RIVAL_IDS) {
    it(`${id}: legal on every day 1-10, affordable on every day it can be met`, () => {
      for (const day of DAYS) {
        const l = rivalLoadout(id, day);
        const b = l.build;
        expect(b.hero).toBe(RIVALS[id].hero);
        expect(legalityProblems(b), `${id} day ${day}`).toEqual([]);
        expect(b.beltCap).toBe(HEROES[b.hero].belt + 4 * l.crates);
        expect(b.hullBonus).toBe(warlordHull(day) + 25 * l.plating);
        if (rivalDays(id).includes(day)) expect(l.value, `${id} day ${day} value`).toBeLessThanOrEqual(budget(day));
      }
    });
  }

  it("the legality replay rejects broken decks (the check is not vacuous)", () => {
    const base = () => JSON.parse(JSON.stringify(rivalBuild("matriarch", 10))) as Build;
    const stray = base();
    stray.mods.push({ uid: 1, def: "chamber", turret: 0 }); // not on the rival item list
    const idle = base();
    idle.items.push({ uid: 2, def: "splitter", x: 9, y: 9 }); // 0.6.2 BELTSIDE: no arrow reaches a belt
    const onBelt = base();
    onBelt.items.push({ uid: 3, def: "splitter", x: kx(onBelt.routes[0].cells[2]), y: ky(onBelt.routes[0].cells[2]) }); // on a belt tile
    const short = base();
    short.routes[0].cells.pop(); // no longer reaches its intake
    const crossed = base();
    crossed.routes[1].cells.splice(1, 0, crossed.routes[0].cells[3]);
    const noFactory = base();
    noFactory.items = noFactory.items.filter((p) => p.def !== "kiln");
    for (const b of [stray, idle, onBelt, short, crossed, noFactory]) expect(legalityProblems(b).length).toBeGreaterThan(0);
    expect(legalityProblems(idle)).toEqual(["rig splitter@9,9 is IDLE"]);
    expect(legalityProblems(onBelt)[0]).toMatch(/^rig splitter@.*: BELT IN THE WAY$/);
    expect(legalityProblems(base())).toEqual([]);
  });

  it("builds never shrink from one day to the next, and grow over the days they are met", () => {
    for (const id of RIVAL_IDS) {
      const at = PLANS[id].upgrades.map((u) => u.at);
      expect(at, `${id} lists its upgrades in day order`).toEqual([...at].sort((x, y) => x - y));
      for (let day = 2; day <= RUN_DAYS; day++) {
        const a = rivalLoadout(id, day - 1), b = rivalLoadout(id, day);
        expect(b.value, `${id} day ${day}`).toBeGreaterThanOrEqual(a.value);
        expect(b.plating, `${id} day ${day}`).toBeGreaterThanOrEqual(a.plating);
        expect(b.build.items.length + b.build.mods.length).toBeGreaterThanOrEqual(a.build.items.length + a.build.mods.length);
        for (const p of a.build.items) {
          const next = b.build.items.find((q) => q.uid === p.uid);
          expect(next, `${id} day ${day} uid ${p.uid}`).toMatchObject({ uid: p.uid, def: p.def, x: p.x, y: p.y });
          expect(next!.stars ?? 1, `${id} day ${day} uid ${p.uid} stars`).toBeGreaterThanOrEqual(p.stars ?? 1);
        }
        for (const m of a.build.mods) {
          const next = b.build.mods.find((q) => q.uid === m.uid);
          expect(next, `${id} day ${day} turret uid ${m.uid}`).toMatchObject({ uid: m.uid, def: m.def, turret: m.turret });
          expect(next!.stars ?? 1, `${id} day ${day} turret uid ${m.uid} stars`).toBeGreaterThanOrEqual(m.stars ?? 1);
        }
        for (const r of a.build.routes) expect(b.build.routes, `${id} day ${day}`).toContainEqual(r);
      }
      const days = rivalDays(id);
      expect(rivalLoadout(id, days[days.length - 1]).value, id).toBeGreaterThan(rivalLoadout(id, days[0]).value);
    }
  });
});

describe("rival battles simulate cleanly", () => {
  const SEEDS = Array.from({ length: 10 }, (_, i) => (i + 1) * 7919);
  for (const id of RIVAL_IDS) {
    it(`${id} vs both starting builds and the other warlord, 10 seeds per day it can be met`, () => {
      for (const day of rivalDays(id)) {
        const foe = rivalBuild(id, day);
        const opponents: Build[] = [
          startingBuild("furnace", 1), startingBuild("weaver", 1), warlordBuild(other(RIVALS[id].hero), day),
        ];
        for (const p of opponents) {
          for (const seed of SEEDS) {
            const bt = simulate(p, foe, seed);
            expect(bt.over).toBe(true);
            expect(bt.t).toBeLessThanOrEqual(BATTLE_CAP + 1e-9);
            expect([0, 1, -1]).toContain(bt.winner);
            for (const s of bt.sides) {
              expect(Number.isFinite(s.hull.hp)).toBe(true);
              expect(Number.isFinite(s.stats.damage)).toBe(true);
              expect(Number.isFinite(s.stats.payloadSum)).toBe(true);
            }
            expect(bt.sides[1].stats.shots).toBeGreaterThan(0); // the captain's production really fires
          }
        }
      }
    });
  }
});

describe("road-stop warlords and stand-in ghosts (200 seeds)", () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => (i === 0 ? 0 : (i * 2654435761) >>> 0));

  it("offers are deterministic, and each slot's captain has that slot's difficulty", () => {
    const seen = new Set<RivalId>();
    for (const seed of SEEDS) {
      const offers = warlordOffers(seed);
      expect(offers.length).toBe(RUN_DAYS);
      expect(warlordOffers(seed)).toEqual(offers);
      DAYS.forEach((day) => {
        const o = warlordOffer(seed, day);
        expect(o).toEqual(offers[day - 1]);
        for (const slot of DIFFICULTIES) {
          expect(difficultyOf(o[slot]), `seed ${seed} day ${day} ${slot}`).toBe(slot);
          seen.add(o[slot]);
        }
      });
    }
    // every road captain is offered in some run; 0.8.0 N1: the two stand-in-only captains never are
    expect(seen.size).toBe(RIVAL_IDS.filter((id) => !RIVALS[id].standInOnly).length);
    for (const id of ["lockjaw", "thistlemail"] as RivalId[]) expect(seen.has(id), id).toBe(false);
    expect(warlordOffer(7, 0)).toEqual(warlordOffer(7, 1)); // days clamp to 1-10
    expect(warlordOffer(7, 99)).toEqual(warlordOffer(7, 10));
  });

  it("the Matriarch is offered only in the Hard slot, and only on days 8-10 (always then)", () => {
    for (const seed of SEEDS) {
      for (const day of DAYS) {
        const o = warlordOffer(seed, day);
        expect(o.hard === "matriarch", `seed ${seed} day ${day}`).toBe(day >= MATRIARCH_DAY);
        expect([o.easy, o.medium]).not.toContain("matriarch");
      }
    }
  });

  it("no captain is offered on two consecutive days, in any slot (the Matriarch's days 8-10 aside)", () => {
    for (const seed of SEEDS) {
      for (let day = 2; day <= RUN_DAYS; day++) {
        const today = Object.values(warlordOffer(seed, day)).filter((id) => id !== "matriarch");
        const yesterday = new Set(Object.values(warlordOffer(seed, day - 1)));
        for (const id of today) expect(yesterday.has(id), `seed ${seed} day ${day}: ${id}`).toBe(false);
      }
    }
  });

  it("stand-ins: 10 distinct per run, never the Matriarch, never one of that day's warlords", () => {
    const seen = new Set<RivalId>();
    for (const seed of SEEDS) {
      const s = standInGhosts(seed);
      expect(standInGhosts(seed)).toEqual(s);
      expect(s.length).toBe(RUN_DAYS);
      expect(new Set(s).size).toBe(RUN_DAYS);
      expect(s).not.toContain("matriarch");
      DAYS.forEach((day) => {
        const id = standInGhost(seed, day);
        expect(id).toBe(s[day - 1]);
        expect(Object.values(warlordOffer(seed, day)), `seed ${seed} day ${day}`).not.toContain(id);
        expect(legalityProblems(rivalBuild(id, day))).toEqual([]);
        seen.add(id);
      });
    }
    expect(seen.size).toBe(RIVAL_IDS.length - 1); // all 12 stand in somewhere (0.8.0 N1: all 18)
    // both factions: mirrors stay (0.8.0 N1: orc, elf, human and dwarf captains all stand in)
    expect(new Set([...seen].map((id) => RIVALS[id].faction)).size).toBe(4);
  });

  it("the warlord and stand-in streams leave the shop and battle streams alone", () => {
    const run = newRun("furnace", 4242);
    const shop = JSON.stringify(run.shop), seed = battleSeed(run);
    warlordOffers(run.seed);
    standInGhosts(run.seed);
    DAYS.forEach((day) => { warlordOffer(run.seed, day); standInGhost(run.seed, day); });
    expect(JSON.stringify(run.shop)).toBe(shop);
    expect(battleSeed(run)).toBe(seed);
    expect(JSON.stringify(newRun("furnace", 4242).shop)).toBe(shop);
  });
});
