// 0.6.1a: fusion (ARSENAL.md §10 item 2, REQ-BFG-019). 1+1 = 2 stars, 2+2 = 3, chains resolve at once,
// 3 is the maximum; the survivor rules; every source goes through gainModule; supplies and signatures
// never fuse; value at every star; mergePreview; and the invariant property test.
import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { choicesFor, makeEvent, pickChoice } from "../src/game/events";
import { fuseAll, fuseFrom, gainModule, mergePreview, unfusedInRun, type FuseStep } from "../src/game/fuse";
import { buyOffer, newRun, reroll, sellInventory, storeMod, storePlaced, takeFromInventory, type Run } from "../src/game/run";
import { finishDay, startDusk } from "../src/game/day";
import { finishWarlord, pickPending, pickRoad, takePart, topParts } from "../src/game/road";
import { tradeGood, EVENTS } from "../src/game/eventDefs";
import { setupRun, setupWarlord } from "../src/tooling";
import type { SideStats } from "../src/sim/battle";
import { ITEMS, sellValue, type HeroId } from "../src/sim/content";
import { beltUsed, canPlaceItem, key, kx, ky, moveItem, occupancy, placeItem, type Build } from "../src/sim/deck";
import { deckCost } from "../src/sim/rivals";
import { buildCost } from "../src/net/validate";
import { starField, starsOf, valueOf } from "../src/sim/stars";

const K = key;
const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const fresh = (hero: HeroId = "furnace"): Run => newRun(hero, 7, "fuse-test");
/** Setup only (bypasses gainModule): a copy with `stars` in cargo, on a cell or on a turret. */
function put(run: Run, def: string, stars = 1, at?: { x: number; y: number } | { turret: number }): number {
  const uid = run.nextUid++;
  if (at && "turret" in at) run.build.mods.push({ uid, def, turret: at.turret, ...starField(stars) });
  else if (at) run.build.items.push({ uid, def, x: at.x, y: at.y, ...starField(stars) });
  else run.inventory.push({ uid, def, ...starField(stars) });
  return uid;
}
const copies = (run: Run, def: string) => [
  ...run.inventory.filter((i) => i.def === def).map((i) => ({ uid: i.uid, stars: starsOf(i), where: "cargo" })),
  ...run.build.items.filter((p) => p.def === def).map((p) => ({ uid: p.uid, stars: starsOf(p), where: `deck ${p.x},${p.y}` })),
  ...run.build.mods.filter((m) => m.def === def).map((m) => ({ uid: m.uid, stars: starsOf(m), where: `turret ${m.turret}` })),
];
const stock = (run: Run, defs: string[]) => {
  run.gold = 200;
  run.shop.wagons = [{ merchant: "tinker", offers: defs.map((def) => ({ def, price: ITEMS[def].price, sold: false })) }];
};

describe("fusion: 1+1 = 2, 2+2 = 3, chains, and 3 is the maximum", () => {
  it("1+1 = 2 stars (lower uid survives in cargo)", () => {
    const run = fresh();
    const a = gainModule(run, "temper"), b = gainModule(run, "temper");
    expect(a.steps).toEqual([]);
    expect(b.steps).toEqual<FuseStep[]>([{ def: "temper", absorbed: b.uid, survivor: a.uid, stars: 2, where: "cargo" }]);
    expect(copies(run, "temper")).toEqual([{ uid: a.uid, stars: 2, where: "cargo" }]);
    expect(run.fuseFx).toEqual(["MERGED: TEMPER ★★"]);
  });
  it("2+2 = 3 stars, and a 1-star + 2-star + a new copy chain to 3 in one call", () => {
    const run = fresh();
    const two = put(run, "whetstone", 2), one = put(run, "whetstone", 1);
    const g = gainModule(run, "whetstone");
    expect(g.steps.map((s) => s.stars)).toEqual([2, 3]);
    expect(copies(run, "whetstone")).toEqual([{ uid: two, stars: 3, where: "cargo" }]);
    expect(g.steps[0].survivor).toBe(one);
    expect(run.inventory.some((i) => i.stars === 1)).toBe(false); // stars: 1 is never written
  });
  it("3 is the maximum: a fifth copy stays 1 star; two 3-star copies coexist", () => {
    const run = fresh();
    for (let i = 0; i < 4; i++) gainModule(run, "grease");
    expect(copies(run, "grease").map((c) => c.stars)).toEqual([3]);
    gainModule(run, "grease");
    expect(copies(run, "grease").map((c) => c.stars).sort()).toEqual([1, 3]);
    for (let i = 0; i < 3; i++) gainModule(run, "grease");
    expect(copies(run, "grease").map((c) => c.stars)).toEqual([3, 3]);
    expect(fuseFrom(run, copies(run, "grease")[0].uid)).toEqual([]);
    expect(unfusedInRun(run)).toEqual([]);
  });
});

describe("the survivor keeps its spot (ARSENAL.md §4.1 rule 4)", () => {
  it("a placed copy beats one in cargo", () => {
    const run = fresh();
    const placed = put(run, "temper", 1, { x: 4, y: 3 });
    const g = gainModule(run, "temper");
    expect([g.survivor, g.where, g.stars]).toEqual([placed, "deck", 2]);
    expect(run.inventory).toEqual([]);
  });
  it("two placed copies: the twin already at that level keeps its cell; the absorbed gate's cell is plain belt", () => {
    const run = fresh();
    const old = put(run, "temper", 1, { x: 4, y: 3 });
    const routes = JSON.stringify(run.build.routes);
    const g = gainModule(run, "temper", { x: 4, y: 2 });
    expect([g.survivor, g.where, g.stars]).toEqual([old, "deck", 2]);
    expect(occupancy(run.build)[K(4, 2)]).toEqual({ item: -1, route: 0 }); // plain belt
    expect(JSON.stringify(run.build.routes)).toBe(routes); // the route is intact
  });
  it("in a chain the pre-existing 2-star keeps its spot", () => {
    const run = fresh();
    const two = put(run, "brake", 2, { x: 4, y: 4 });
    put(run, "brake", 1);
    const g = gainModule(run, "brake");
    expect(copies(run, "brake")).toEqual([{ uid: two, stars: 3, where: "deck 4,4" }]);
    expect(g.steps.map((s) => s.where)).toEqual(["cargo", "deck"]);
  });
  it("two placed factories: more belts survives; the absorbed factory's belts go back to belt capacity", () => {
    const run = fresh();
    const a = put(run, "press", 1, { x: 6, y: 6 }), b = put(run, "press", 1, { x: 0, y: 6 });
    run.build.routes.push({ factory: b, cells: [K(0, 5), K(0, 4)] });
    const steps = fuseAll(run);
    expect(steps).toEqual([{ def: "press", absorbed: a, survivor: b, stars: 2, where: "deck" }]); // b had 1 belt, a none
    const run2 = fresh();
    const c = put(run2, "press", 1, { x: 6, y: 6 }), d = put(run2, "press", 1, { x: 0, y: 6 });
    run2.build.routes.push({ factory: c, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] });
    run2.build.routes.push({ factory: d, cells: [K(0, 5), K(0, 4)] });
    const used = beltUsed(run2.build);
    const s2 = fuseAll(run2);
    expect(s2).toEqual([{ def: "press", absorbed: d, survivor: c, stars: 2, where: "deck", belts: 1 }]); // tie: lower uid
    expect(beltUsed(run2.build)).toBe(used - 2);
    expect(run2.build.routes.some((r) => r.factory === d)).toBe(false);
    expect(run2.fuseFx).toEqual(["MERGED: STAMP PRESS ★★", "MERGED · 1 BELT REMOVED"]);
  });
  it("otherwise the lower uid survives; an absorbed mod frees its hardpoint", () => {
    const run = fresh("weaver");
    const t0 = put(run, "calibrate", 1, { turret: 0 });
    const g = gainModule(run, "calibrate", { turret: 2 });
    expect([g.survivor, g.where]).toEqual([t0, "turret"]);
    expect(run.build.mods.filter((m) => m.turret === 2)).toEqual([]);
    const run2 = fresh("weaver");
    put(run2, "coil"); put(run2, "coil");
    const [lo] = run2.inventory.map((i) => i.uid);
    expect(fuseAll(run2)[0].survivor).toBe(lo);
  });
});

describe("every source goes through gainModule", () => {
  it("card buy", () => {
    const run = fresh();
    stock(run, ["temper"]);
    put(run, "temper");
    const r = buyOffer(run, 0, 0);
    expect(r.ok && r.item?.stars).toBe(2);
    expect(run.gold).toBe(197);
  });
  it("drag onto the deck: a placed twin takes the merge; a cargo-only twin merges where the copy was dropped", () => {
    const run = fresh();
    stock(run, ["temper", "temper"]);
    const placed = put(run, "temper", 1, { x: 4, y: 3 });
    expect(buyOffer(run, 0, 0, { x: 4, y: 2 }).gain?.survivor).toBe(placed);
    expect(occupancy(run.build)[K(4, 2)].item).toBe(-1); // the drop target is ignored
    const run2 = fresh();
    stock(run2, ["temper"]);
    put(run2, "temper");
    const g = buyOffer(run2, 0, 0, { x: 4, y: 2 }).gain!;
    expect(copies(run2, "temper")).toEqual([{ uid: g.uid, stars: 2, where: "deck 4,2" }]);
  });
  it("drag onto a turret: fitted there when the twin is in cargo, into the fitted twin otherwise", () => {
    const run = fresh();
    stock(run, ["calibrate", "calibrate"]);
    put(run, "calibrate");
    buyOffer(run, 0, 0, { turret: 0 });
    expect(copies(run, "calibrate").map((c) => [c.stars, c.where])).toEqual([[2, "turret 0"]]);
    put(run, "calibrate"); // a 1-star in cargo + the 2-star on the turret: the chain lands on the turret
    buyOffer(run, 0, 1, { turret: 0 });
    expect(copies(run, "calibrate").map((c) => [c.stars, c.where])).toEqual([[3, "turret 0"]]);
    const run2 = fresh("weaver");
    stock(run2, ["chamber"]);
    put(run2, "chamber", 1, { turret: 1 });
    buyOffer(run2, 0, 0, { turret: 1 }); // onto its own fitted twin: no second piece of gear
    expect(copies(run2, "chamber").map((c) => [c.stars, c.where])).toEqual([[2, "turret 1"]]);
  });
  it("Hard pick and the Matriarch's prize (1-star copies, then merged)", () => {
    const run = setupWarlord("hard", { day: 3, outcome: 0 });
    expect(pickPending(run.warlord)).toBe(true);
    const part = run.warlord!.result!.parts[0];
    gainModule(run, part);
    expect(takePart(run, 0)).toBe(part);
    expect(copies(run, part).map((c) => c.stars)).toEqual([2]);
    const m = setupWarlord("hard", { day: 8 });
    expect(m.warlord!.id).toBe("matriarch");
    const prize = m.warlord!.reward.parts[0];
    gainModule(m, prize);
    finishWarlord(m, 0, 30);
    expect(copies(m, prize).map((c) => c.stars)).toEqual([2]);
  });
  it("road-event items: SALVAGE and the trader's SWAP", () => {
    const at = (id: "wreck" | "trader") => { const r = fresh(); r.day = 3; r.event = makeEvent(r.seed, 3, id); r.stage = "event"; return r; };
    const w = at("wreck");
    const salvage = (choicesFor(w)[0].gain[0] as { def: string }).def;
    put(w, salvage);
    pickChoice(w, 0);
    expect(copies(w, salvage).map((c) => c.stars)).toEqual([2]);
    const t = at("trader");
    put(t, "temper"); // the trade good (cheapest)
    const swap = (EVENTS.trader.choices(t, t.event!)[1].gain[0] as { def: string }).def;
    put(t, swap);
    pickChoice(t, 1);
    expect(copies(t, swap).map((c) => c.stars)).toEqual([2]);
    expect(copies(t, "temper")).toEqual([]);
  });
  it("tooling: setupRun cargo", () => {
    const run = setupRun({ cargo: ["temper", "temper", "temper", "coil"] });
    expect(copies(run, "temper").map((c) => c.stars).sort()).toEqual([1, 2]);
    expect(unfusedInRun(run)).toEqual([]);
  });
  it("supplies and signatures never fuse; moving never fuses", () => {
    const run = fresh();
    stock(run, ["beltcrate", "beltcrate"]);
    buyOffer(run, 0, 0); buyOffer(run, 0, 1);
    expect(run.inventory).toEqual([]);
    put(run, "kiln"); put(run, "kiln"); put(run, "plating"); put(run, "plating");
    expect(fuseAll(run)).toEqual([]);
    const r2 = fresh();
    const two = put(r2, "temper", 2, { x: 4, y: 3 });
    expect(storePlaced(r2, two)).toBe(true);
    expect(r2.inventory).toEqual([{ uid: two, def: "temper", stars: 2 }]);
    expect(r2.fuseFx ?? []).toEqual([]);
  });
});

describe("value at every star (ARSENAL.md §5.1) and mergePreview", () => {
  it("valueOf, sellValue and selling a starred copy", () => {
    for (const s of [1, 2, 3]) {
      expect(valueOf("splitter", s)).toBe(7 * 2 ** (s - 1));
      expect(sellValue("splitter", s)).toBe(Math.max(1, Math.floor(valueOf("splitter", s) / 2)));
    }
    const run = fresh();
    const u = put(run, "splitter", 3);
    const g = run.gold;
    expect(sellInventory(run, u)).toBe(14);
    expect(run.gold).toBe(g + 14);
  });
  it("deckCost == buildCost at every star (items and mods)", () => {
    for (const s of [1, 2, 3]) {
      const b: Build = JSON.parse(JSON.stringify(fresh().build));
      b.items.push({ uid: 50, def: "temper", x: 4, y: 3, ...starField(s) }, { uid: 51, def: "longhaul", x: 4, y: 2, ...starField(s) });
      b.mods.push({ uid: 52, def: "chamber", turret: 0, ...starField(s) });
      const want = (3 + 5 + 7) * 2 ** (s - 1);
      expect(deckCost(b).total).toBe(want);
      expect(buildCost(b)).toEqual(deckCost(b));
    }
  });
  it("the trader ranks spare parts by value and SELL pays it in full; topParts sorts by value", () => {
    const run = fresh();
    put(run, "temper", 2); // value 6
    const coil = put(run, "coil"); // value 5: the cheapest
    expect(tradeGood(run)?.uid).toBe(coil);
    run.inventory = [];
    put(run, "whetstone", 3);
    run.day = 3;
    run.event = makeEvent(run.seed, 3, "trader");
    expect(choicesFor(run)[0].gain).toEqual([{ k: "gold", n: 12 }]);
    const b: Build = JSON.parse(JSON.stringify(fresh().build));
    b.items.push({ uid: 60, def: "whetstone", x: 4, y: 3, stars: 3 }, { uid: 61, def: "splitter", x: 4, y: 2 });
    expect(topParts(b, 2)).toEqual(["whetstone", "splitter"]); // 12 > 7
    b.items[1].stars = 2;
    expect(topParts(b, 2)).toEqual(["splitter", "whetstone"]); // 14 > 12
  });
  it("mergePreview: none, a 2-star, a chain to 3, a waiting copy and MAX; the run is untouched", () => {
    const run = fresh();
    expect(mergePreview(run, "temper")).toBeNull();
    const one = put(run, "temper", 1, { x: 4, y: 3 });
    const before = JSON.stringify(run);
    expect(mergePreview(run, "temper")).toEqual({ toStars: 2, survivorUid: one, where: "deck" });
    expect(JSON.stringify(run)).toBe(before);
    put(run, "temper", 2);
    expect(mergePreview(run, "temper")?.toStars).toBe(3);
    run.build.items = run.build.items.filter((p) => p.uid !== one);
    expect(mergePreview(run, "temper")).toBeNull(); // only a 2-star: the copy waits as 1 star
    run.inventory[0].stars = 3;
    expect(mergePreview(run, "temper")).toBeNull(); // MAX
    expect(mergePreview(run, "beltcrate")).toBeNull();
  });
});

/** Free belt cells (a gate can sit there) of the run's deck. */
function beltCells(run: Run, def: string, ignore = -1): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const r of run.build.routes) for (const k of r.cells) if (canPlaceItem(run.build, def, kx(k), ky(k), ignore).ok) out.push({ x: kx(k), y: ky(k) });
  return out;
}

describe("invariant: no unfused pair after any mutation (300 seeded 10-day runs, random buyer)", () => {
  it("buys (card, cell, turret), sells, moves, stores, rerolls, road picks and dusk", () => {
    const bad: string[] = [];
    let merges = 0, mutations = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rng = new Rng(seed * 7919);
      const run = newRun(seed % 2 ? "furnace" : "weaver", seed, `inv-${seed}`);
      const check = (what: string) => {
        mutations++;
        const u = unfusedInRun(run);
        if (u.length) bad.push(`seed ${seed} day ${run.day} after ${what}: ${u.join(", ")}`);
      };
      const turrets = run.build.hero === "furnace" ? 1 : 3;
      const freeTurret = () => [...Array(turrets).keys()].filter((t) => !run.build.mods.some((m) => m.turret === t));
      while (!run.over) {
        for (let a = 0; a < 10; a++) {
          const op = rng.int(10);
          if (op < 4) {
            const slots = run.shop.wagons.flatMap((w, wi) => w.offers.map((o, si) => ({ o, wi, si }))).filter((x) => !x.o.sold && x.o.price <= run.gold);
            if (!slots.length) continue;
            const { o, wi, si } = rng.pick(slots);
            const k = ITEMS[o.def].kind;
            const cells = k === "gate" ? beltCells(run, o.def) : [], ts = k === "mod" ? freeTurret() : [];
            const at = rng.chance(0.5) ? undefined : cells.length ? rng.pick(cells) : ts.length ? { turret: rng.pick(ts) } : undefined;
            merges += buyOffer(run, wi, si, at).gain?.steps.length ?? 0;
            check(`buy ${o.def}`);
          } else if (op === 4 && run.inventory.length) {
            sellInventory(run, rng.pick(run.inventory).uid);
            check("sell");
          } else if (op === 5 && run.inventory.length) {
            const it = rng.pick(run.inventory), k = ITEMS[it.def].kind;
            const cells = k === "gate" ? beltCells(run, it.def) : [], ts = k === "mod" ? freeTurret() : [];
            if (cells.length) { takeFromInventory(run, it.uid); placeItem(run.build, { uid: it.uid, def: it.def, ...rng.pick(cells), ...starField(starsOf(it)) }); }
            else if (ts.length) { takeFromInventory(run, it.uid); run.build.mods.push({ uid: it.uid, def: it.def, turret: rng.pick(ts), ...starField(starsOf(it)) }); }
            check("place from cargo");
          } else if (op === 6) {
            const items = run.build.items.filter((p) => p.def !== "kiln" && p.def !== "loom");
            if (items.length && rng.chance(0.5)) storePlaced(run, rng.pick(items).uid);
            else if (run.build.mods.length) storeMod(run, rng.pick(run.build.mods).uid);
            check("store");
          } else if (op === 7) {
            const gates = run.build.items.filter((p) => ITEMS[p.def].kind === "gate");
            if (!gates.length) continue;
            const g = rng.pick(gates), cells = beltCells(run, g.def, g.uid);
            if (cells.length) { const c = rng.pick(cells); moveItem(run.build, g.uid, c.x, c.y); }
            check("move");
          } else if (op === 8) {
            reroll(run);
            check("reroll");
          }
        }
        const pick = rng.pick(["event", "easy", "medium", "hard"] as const);
        pickRoad(run, pick);
        if (pick === "event") {
          const cs = choicesFor(run).map((c, i) => ({ c, i })).filter((x) => !x.c.blocked);
          if (cs.length) pickChoice(run, rng.pick(cs).i);
          check("event");
        } else {
          finishWarlord(run, rng.chance(0.7) ? 0 : 1, 30);
          check("warlord");
          if (pickPending(run.warlord)) { takePart(run, rng.int(2)); check("hard pick"); }
        }
        startDusk(run, []);
        finishDay(run, rng.chance(0.6) ? 0 : 1, 30, STATS, STATS);
        check("dusk");
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(merges).toBeGreaterThan(300); // the buyer does merge (not a vacuous pass)
    expect(mutations).toBeGreaterThan(20000);
  });
});
