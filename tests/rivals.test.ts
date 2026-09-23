import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { startingBuild, warlordBuild, warlordHull } from "../src/sim/ai";
import {
  canExtend, canPlaceItem, commitRoute, connectorClaims, key, occupancy, placeItem, routeInfo,
  routesOf, turretHasFreeHardpoint, beltUsed, type Build,
} from "../src/sim/deck";
import { BATTLE_CAP, HEROES, ITEMS, START_GOLD, incomeFor, type HeroId } from "../src/sim/content";
import {
  ACTS, RIVALS, RIVAL_IDS, actFor, rivalBuild, rivalFor, rivalLoadout, rivalPool, rivalRounds,
  rivalSchedule, rivalSlot, type RivalId,
} from "../src/sim/rivals";
import { PLANS, planBuild } from "../src/sim/rivalBuilds";
import { battleSeed, newRun } from "../src/game/run";

const ALLOWED = new Set([
  "kiln", "loom", "press", "temper", "whetstone", "grease", "brake", "longhaul", "coil", "splitter",
  "overdrive", "calibrate", "beltcrate", "plating",
]);
const other = (h: HeroId): HeroId => (h === "furnace" ? "weaver" : "furnace");

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

/** Gold a player who wins every round has had to spend before battle `round`. */
function budget(round: number): number {
  let g = START_GOLD;
  for (let r = 1; r < round; r++) g += incomeFor(r, true);
  return g;
}

describe("rival roster", () => {
  it("has 8+ regulars over three tiers, two act elites and one boss, from both factions", () => {
    const regular = RIVAL_IDS.filter((id) => RIVALS[id].rank === "regular");
    expect(regular.length).toBeGreaterThanOrEqual(8);
    for (const act of [1, 2, 3] as const) {
      const pool = rivalPool(act, "regular");
      expect(pool.length).toBeGreaterThanOrEqual(act === 2 ? 3 : 2);
      expect(new Set(pool.map((id) => RIVALS[id].faction)).size).toBe(2);
    }
    expect(rivalPool(1, "elite").length).toBe(1);
    expect(rivalPool(2, "elite").length).toBe(1);
    expect(rivalPool(3, "elite").length).toBe(0);
    expect(RIVAL_IDS.filter((id) => RIVALS[id].rank === "boss").length).toBe(1);
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
    it(`${id}: legal at every round 1-12, affordable at its scheduled rounds`, () => {
      for (let r = 1; r <= 12; r++) {
        const l = rivalLoadout(id, r);
        const b = l.build;
        expect(b.hero).toBe(RIVALS[id].hero);
        expect(legalityProblems(b), `${id} r${r}`).toEqual([]);
        expect(b.beltCap).toBe(HEROES[b.hero].belt + 4 * l.crates);
        expect(b.hullBonus).toBe(warlordHull(r) + 25 * l.plating);
        if (rivalRounds(id).includes(r)) expect(l.value, `${id} r${r} value`).toBeLessThanOrEqual(budget(r));
      }
    });
  }

  it("round-1 openers only change round 1 and keep the same factories", () => {
    const facs = (b: Build) => b.items.filter((p) => ITEMS[p.def].kind === "factory").map((p) => `${p.uid}:${p.def}`);
    for (const id of RIVAL_IDS) {
      const plan = PLANS[id];
      if (!plan.opener) continue;
      expect(plan.opener.map((f) => f.def), id).toEqual(plan.factories.map((f) => f.def));
      expect(facs(rivalBuild(id, 1)), id).toEqual(facs(rivalBuild(id, 2)));
      expect(rivalBuild(id, 1).routes, id).not.toEqual(planBuild({ ...plan, opener: undefined }, 1).build.routes);
      expect(rivalBuild(id, 2)).toEqual(planBuild({ ...plan, opener: undefined }, 2).build);
    }
    expect(RIVAL_IDS.filter((id) => PLANS[id].opener)).toEqual(["sootjaw", "nettle"]);
  });

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

  it("builds escalate with the round they are fought in and never shrink", () => {
    for (const id of RIVAL_IDS) {
      const rounds = rivalRounds(id);
      for (let r = 2; r <= 12; r++) {
        const a = rivalLoadout(id, r - 1), b = rivalLoadout(id, r);
        expect(b.value).toBeGreaterThanOrEqual(a.value);
        expect(b.build.items.length + b.build.mods.length).toBeGreaterThanOrEqual(a.build.items.length + a.build.mods.length);
      }
      if (rounds.length > 1) {
        const first = rivalLoadout(id, rounds[0]), last = rivalLoadout(id, rounds[rounds.length - 1]);
        expect(last.value, id).toBeGreaterThan(first.value);
      }
    }
  });
});

describe("rival battles simulate cleanly", () => {
  const SEEDS = Array.from({ length: 10 }, (_, i) => (i + 1) * 7919);
  for (const id of RIVAL_IDS) {
    it(`${id} vs both starting builds and the other warlord, 10 seeds per round`, () => {
      for (const r of rivalRounds(id)) {
        const foe = rivalBuild(id, r);
        const opponents: Build[] = [
          startingBuild("furnace", 1), startingBuild("weaver", 1), warlordBuild(other(RIVALS[id].hero), r),
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
            expect(bt.sides[1].stats.shots).toBeGreaterThan(0); // the rival's production really fires
          }
        }
      }
    });
  }
});

describe("rival schedule", () => {
  const SEEDS = Array.from({ length: 200 }, (_, i) => (i === 0 ? 0 : (i * 2654435761) >>> 0));

  it("is deterministic, never repeats a regular, and follows the act plan (200 seeds)", () => {
    const seen = new Set<RivalId>();
    for (const seed of SEEDS) {
      const s = rivalSchedule(seed);
      expect(rivalSchedule(seed)).toEqual(s);
      s.forEach((id, i) => expect(rivalFor(seed, i + 1)).toBe(id));
      const regular = s.filter((id) => RIVALS[id].rank === "regular");
      expect(new Set(regular).size).toBe(regular.length);
      expect(regular.length).toBe(7);
      const tierOf = (r: number) => RIVALS[s[r - 1]].tier;
      const rankOf = (r: number) => RIVALS[s[r - 1]].rank;
      for (const r of [1, 2]) expect([tierOf(r), rankOf(r)]).toEqual([1, "regular"]);
      expect([tierOf(3), rankOf(3)]).toEqual([1, "elite"]);
      for (const r of [4, 5, 6]) expect([tierOf(r), rankOf(r)]).toEqual([2, "regular"]);
      expect([tierOf(7), rankOf(7)]).toEqual([2, "elite"]);
      for (const r of [8, 9]) expect([tierOf(r), rankOf(r)]).toEqual([3, "regular"]);
      for (const r of [10, 11, 12]) expect(rankOf(r)).toBe("boss");
      s.forEach((id) => seen.add(id));
    }
    expect(seen.size).toBe(RIVAL_IDS.length); // every rival shows up in some run
  });

  it("has act banners that match the slots, and leaves the shop and battle streams alone", () => {
    for (let r = 1; r <= 12; r++) {
      const a = actFor(r);
      expect(a.act).toBe(rivalSlot(r).act);
      expect(r).toBeGreaterThanOrEqual(a.first);
      expect(r).toBeLessThanOrEqual(a.last);
    }
    expect(ACTS.map((a) => [a.first, a.last])).toEqual([[1, 3], [4, 7], [8, 12]]);
    const run = newRun("furnace", 4242);
    const shop = JSON.stringify(run.shop), seed = battleSeed(run);
    rivalSchedule(run.seed);
    expect(JSON.stringify(run.shop)).toBe(shop);
    expect(battleSeed(run)).toBe(seed);
  });
});
