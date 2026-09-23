import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import {
  canExtend, canPlaceItem, commitRoute, connectorClaims, key, occupancy, placeItem, routeInfo,
  routesOf, turretHasFreeHardpoint, beltUsed, type Build,
} from "../src/sim/deck";
import { BATTLE_CAP, HEROES, ITEMS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import {
  DIFFICULTIES, MATRIARCH_DAY, RIVALS, RIVAL_IDS, RUN_DAYS, difficultyOf, rivalBuild, rivalDays, rivalLoadout,
  standInGhost, standInGhosts, warlordOffer, warlordOffers, warlordPool, type RivalId,
} from "../src/sim/rivals";
import { PLANS } from "../src/sim/rivalBuilds";
import { battleSeed, newRun } from "../src/game/run";

const ALLOWED = new Set([
  "kiln", "loom", "press", "temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter",
  "overdrive", "calibrate", "beltcrate", "plating",
]);
const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");
const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);

/** Rebuild a deck from empty with the build screen's own checks; returns every problem found. */
function legalityProblems(b: Build): string[] {
  const bad: string[] = [];
  const h = HEROES[b.hero];
  const nb: Build = { hero: b.hero, items: [], routes: [], mods: [], beltCap: b.beltCap, hullBonus: b.hullBonus };
  const uids = [...b.items, ...b.mods].map((p) => p.uid);
  if (new Set(uids).size !== uids.length) bad.push("duplicate uids");
  for (const p of [...b.items, ...b.mods]) if (!ALLOWED.has(p.def)) bad.push(`stray item ${p.def}`);
  const facs = b.items.filter((p) => ITEMS[p.def]?.kind === "factory");
  const gates = b.items.filter((p) => ITEMS[p.def]?.kind === "gate");
  if (facs.length + gates.length !== b.items.length) bad.push("non-deck item on the deck");
  if (facs.filter((p) => p.def === h.factory).length !== 1) bad.push(`needs exactly one ${h.factory}`);
  for (const f of facs) if (f.def !== h.factory && f.def !== "press") bad.push(`foreign factory ${f.def}`);
  for (const f of facs) {
    const chk = canPlaceItem(nb, f.def, f.x, f.y);
    if (chk.ok) placeItem(nb, f);
    else bad.push(`factory ${f.def}@${f.x},${f.y}: ${chk.reason}`);
  }
  b.routes.forEach((r, i) => {
    const pending: number[] = [];
    let completes = false;
    for (const k of r.cells) {
      const chk = canExtend(nb, r.factory, pending, k, -1);
      if (!chk.ok) return bad.push(`route ${i} at ${k}: ${chk.reason}`);
      pending.push(k);
      completes = !!chk.completes;
    }
    if (!completes) bad.push(`route ${i} does not end at a free intake`);
    commitRoute(nb, r.factory, pending, -1);
  });
  for (const f of facs) {
    const n = routesOf(nb, f.uid).length;
    if (n < 1 || n > ITEMS[f.def].factory!.outputs) bad.push(`${f.def} feeds ${n} belts`);
  }
  for (const g of gates) {
    const chk = canPlaceItem(nb, g.def, g.x, g.y);
    if (!chk.ok) bad.push(`gate ${g.def}@${g.x},${g.y}: ${chk.reason}`);
    else placeItem(nb, g);
    if (occupancy(nb)[key(g.x, g.y)].route < 0) bad.push(`gate ${g.def}@${g.x},${g.y} is not on a belt`);
  }
  for (const m of b.mods) {
    if (ITEMS[m.def]?.kind !== "mod") bad.push(`${m.def} is not turret gear`);
    if (m.turret < 0 || m.turret >= h.turrets.length) bad.push(`no turret ${m.turret}`);
    else if (!turretHasFreeHardpoint(nb, m.turret)) bad.push(`turret ${m.turret} already has gear`);
    nb.mods.push(m);
  }
  b.routes.forEach((_, i) => { if (!routeInfo(b, i).connected) bad.push(`route ${i} not connected`); });
  if (connectorClaims(b).size !== b.routes.length) bad.push("two belts share an intake");
  if (beltUsed(b) > b.beltCap) bad.push(`belt ${beltUsed(b)}/${b.beltCap}`);
  return bad;
}

/** Gold a player who wins every day has had to spend before the fights of day `day`. */
function budget(day: number): number {
  let g = START_GOLD;
  for (let r = 1; r < day; r++) g += incomeFor(r, true);
  return g;
}

describe("rival roster", () => {
  it("fills Easy, Medium and Hard from both factions; the Matriarch is Hard on days 8-10 only", () => {
    expect(RIVAL_IDS.length).toBe(13);
    expect(warlordPool("easy")).toEqual(["sootjaw", "nettle", "grubnose"]);
    expect(warlordPool("medium")).toEqual(["sparkfang", "lacewing", "ratchet", "emberlyn"]);
    expect(warlordPool("hard")).toEqual(["mothqueen", "bulwark", "silkshade", "longtooth", "highspire"]);
    for (const d of DIFFICULTIES) expect(new Set(warlordPool(d).map((id) => RIVALS[id].faction)).size).toBe(2);
    for (const id of RIVAL_IDS) {
      const r = RIVALS[id];
      const want = r.rank !== "regular" || r.tier === 3 ? "hard" : r.tier === 1 ? "easy" : "medium";
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
    const offBelt = base();
    offBelt.items.push({ uid: 2, def: "temper", x: 9, y: 9 });
    const short = base();
    short.routes[0].cells.pop(); // no longer reaches its intake
    const crossed = base();
    crossed.routes[1].cells.splice(1, 0, crossed.routes[0].cells[3]);
    const noFactory = base();
    noFactory.items = noFactory.items.filter((p) => p.def !== "kiln");
    for (const b of [stray, offBelt, short, crossed, noFactory]) expect(legalityProblems(b).length).toBeGreaterThan(0);
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
        for (const p of a.build.items) expect(b.build.items, `${id} day ${day}`).toContainEqual(p);
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
    expect(seen.size).toBe(RIVAL_IDS.length); // every captain is offered in some run
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
    expect(seen.size).toBe(RIVAL_IDS.length - 1); // all 12 stand in somewhere
    expect(new Set([...seen].map((id) => RIVALS[id].faction)).size).toBe(2); // both factions: mirrors stay
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
