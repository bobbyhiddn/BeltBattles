import { describe, expect, it } from "vitest";
import { hashSeed, Rng } from "../src/core/rng";
// 0.6.0b: standIn(seed, day) is gone; the dusk stand-in is standInFoe (a rival captain + its deck;
// 0.6.2 TUNE-C: the deck is the captain's named build standInBuild; from 0.6.0d the pool's standInPick)
import { GHOST_KEY, POOL_MAX, loadPool, pickGhost, saveGhost, standInFoe, type GhostSnapshot } from "../src/game/ghosts";
import { chooseFoe, finishDay, ghostOf, startDusk } from "../src/game/day";
import { battleSeed, buyOffer, newRun, reroll } from "../src/game/run";
import { beginRoad, choicesFor, pickChoice } from "../src/game/events";
import { finishWarlord, leaveCaravan, onToTheRoad, pickRoad } from "../src/game/road"; // AZ-BUMP (the flip): the NPC day's fight
import { startingBuild } from "../src/sim/ai";
import { RIVALS, standInBuild, standInGhost } from "../src/sim/rivals";
import { HEROES, RULES_VERSION, RUN_DAYS } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): a run's 10 hearts (was START_LIVES, 5)
import { beltUsed } from "../src/sim/deck";
import { Battle, simulate, type SideStats } from "../src/sim/battle";

const STATS = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;

class MemStore {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}

// 0.6.0b: a GhostSnapshot v1 (rules, playerId, createdAt; no rulesVersion, losses or savedAt)
const snap = (o: Partial<GhostSnapshot> = {}): GhostSnapshot => ({
  v: 1, rules: RULES_VERSION, hero: "weaver", day: 3, wins: 1, lives: 4,
  build: startingBuild("weaver", 1), runId: "other", playerId: "p-test", createdAt: 0, ...o,
});

describe("the local ghost pool", () => {
  it("saves and loads snapshots, keeps at most 300 and drops the oldest", () => {
    const st = new MemStore();
    expect(loadPool(st)).toEqual([]);
    // 0.6.0b: the v1 stamp is createdAt (savedAt is gone)
    saveGhost(snap({ createdAt: 1 }), st);
    expect(loadPool(st)).toEqual([snap({ createdAt: 1 })]);
    for (let i = 2; i <= POOL_MAX + 5; i++) saveGhost(snap({ createdAt: i }), st);
    const pool = loadPool(st);
    expect(POOL_MAX).toBe(300);
    expect(pool.length).toBe(300);
    expect(pool[0].createdAt).toBe(6);
    expect(pool[299].createdAt).toBe(305);
    expect(st.data.has(GHOST_KEY)).toBe(true);
  });

  it("ignores storage errors and malformed entries", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(loadPool(broken)).toEqual([]);
    expect(() => saveGhost(snap(), broken)).not.toThrow();
    const st = new MemStore();
    st.setItem(GHOST_KEY, "{not json");
    expect(loadPool(st)).toEqual([]);
    st.setItem(GHOST_KEY, JSON.stringify([snap(), { v: 2 }, null, { ...snap(), build: null }]));
    expect(loadPool(st)).toEqual([snap()]);
    expect(saveGhost(snap(), undefined)).toBe(undefined); // no localStorage in node: a no-op
  });
});

describe("pickGhost", () => {
  // 0.6.0b: the query is { rules, day, runId, wins, lives, seed } (2-0 going into day 3 = 5 lives)
  const q = { rules: RULES_VERSION, day: 3, runId: "me", wins: 2, lives: 5, seed: 1234 };

  it("only the same rules version and day, never the current run", () => {
    // 0.6.0b: the rules version field is `rules`; the stamp is createdAt; lives replace losses
    expect(pickGhost([snap({ rules: "bb-0.3.0" }), snap({ day: 4 }), snap({ runId: "me" })], q)).toBe(null);
    const ok = snap({ createdAt: 9 });
    expect(pickGhost([snap({ day: 2 }), ok, snap({ runId: "me", wins: 2, lives: 5 })], q)).toEqual(ok);
  });

  // 0.6.0b: ranked by |wins diff| first, then |lives diff| (a v1 snapshot has no losses)
  it("prefers the nearest wins, then the nearest lives", () => {
    const far = snap({ wins: 0, lives: 5 }), near = snap({ wins: 2, lives: 4 }), exact = snap({ wins: 2, lives: 5 });
    expect(pickGhost([far, near], q)).toEqual(near);
    expect(pickGhost([far, near, exact], q)).toEqual(exact);
  });

  it("breaks ties with hashSeed(seed, 'ghost', day): deterministic, and the seed matters", () => {
    // 0.6.0b: ties are equal wins and lives; createdAt tells them apart
    const ties = Array.from({ length: 7 }, (_, i) => snap({ wins: 2, lives: 5, createdAt: i }));
    const a = pickGhost(ties, q)!;
    expect(pickGhost(ties, q)).toBe(a);
    expect(a).toBe(ties[hashSeed(1234, "ghost", 3) % 7]);
    const picks = new Set(Array.from({ length: 40 }, (_, s) => pickGhost(ties, { ...q, seed: s })!.createdAt));
    expect(picks.size).toBeGreaterThan(3);
  });

  // 0.6.0b: the stand-in is the run's rival captain (standInFoe) and the captain's name, not a
  // seeded hero's honest warlord deck under a warlord name. 0.6.2 TUNE-C: its deck is the captain's
  // named build standInBuild(id, day) (from 0.6.0d until TUNE-C the pool pick standInPick(hero, day, seed))
  it("no match: the day's stand-in captain (standInFoe: its named standInBuild deck, its name)", () => {
    const run = newRun("furnace", 555, "me");
    run.day = 6;
    const f = chooseFoe(run, [snap({ day: 5 })]);
    const s = standInFoe(555, 6);
    const id = standInGhost(555, 6);
    expect(f.kind).toBe("standin");
    expect([s.id, f.rival]).toEqual([id, id]);
    expect(f.hero).toBe(RIVALS[id].hero);
    expect(f.build).toEqual(standInBuild(id, 6));
    expect(f.build).toEqual(s.build);
    expect(f.build.hullBonus % 25).toBe(0); // whole paid plating (R1)
    expect(f.name).toBe(RIVALS[id].name);
    const heroes = new Set(Array.from({ length: 30 }, (_, i) => standInFoe(i, 1).hero));
    // seeded: both heroes show up, mirror matches included (0.8.0 N1, oracle 94b9559fbb7da299 (5): FOUNDRY's and BASTION's
    // captains stand in too, so all four)
    expect(heroes.size).toBe(4);
  });

  it("a ghost's build is fought exactly as submitted", () => {
    const them = newRun("weaver", 31, "them");
    them.day = 2;
    them.build.items.push({ uid: 500, def: "temper", x: 4, y: 3 });
    const g = ghostOf(them, 5);
    const before = JSON.stringify(g);
    const me = newRun("furnace", 32, "me");
    me.day = 2;
    const f = startDusk(me, [g]);
    expect(f.kind).toBe("ghost");
    expect(f.build).toEqual(g.build);
    // 0.6.0b: a ghost is named by its hero, wins and lives going into dusk (no W-L)
    // HULL-ON (the flip, HEARTS): 5♥ -> 10♥: the ghost's run started with HEARTS_START hearts, and the tag reads hearts
    expect(f.name).toBe(`GHOST · ${HEROES.weaver.name} · 0W ${HEARTS_START}♥`);
    const b = new Battle(me.build, f.build, battleSeed(me));
    while (!b.over && b.ticks < 60 * 200) b.step();
    const ref = simulate(me.build, g.build, battleSeed(me));
    expect([b.winner, b.ticks, b.sides[1].hull.hp]).toEqual([ref.winner, ref.ticks, ref.sides[1].hull.hp]);
    expect(JSON.stringify(g)).toBe(before);
    expect(f.build).toEqual(g.build);
  });
});

describe("soft-lock sweep: 300 seeded 10-day runs against a filling pool", () => {
  it("every run ends at day 10 or at 0 lives; invariants hold; later runs meet pool ghosts", () => {
    const pool: GhostSnapshot[] = [];
    let complete = 0, lost = 0, picks = 0, draws = 0, ghostsLate = 0, dusksLate = 0;
    for (let n = 0; n < 300; n++) {
      const seed = 101 + n * 104729;
      const rng = new Rng(hashSeed(seed, "softlock"));
      const run = newRun(n % 2 ? "weaver" : "furnace", seed, `run-${n}`);
      for (let guard = 0; guard < 20 && !run.over; guard++) {
        if (rng.chance(0.2)) reroll(run);
        run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, si) => {
          if (!o.sold && run.gold >= o.price && rng.chance(0.5)) expect(buyOffer(run, wi, si).ok).toBe(true);
        }));
        // AZ-BUMP (the flip, NPC_DAY): the shipped day is a warlord fight at the fork (pickRoad(run, "event") is refused), then
        // the day's event after it, won or lost (ON TO THE ROAD), then REFIT and the dusk: the sweep plays it, a tier and the
        // fight's outcome drawn from the run's stream (a win's drop goes to cargo, so the invariants below see it)
        leaveCaravan(run);
        expect(pickRoad(run, (["easy", "medium", "hard"] as const)[rng.int(3)]).ok).toBe(true);
        finishWarlord(run, rng.chance(0.6) ? 0 : 1, 25);
        if (onToTheRoad(run) === "event") {
          const ok = choicesFor(run).map((c, i) => (c.blocked ? -1 : i)).filter((i) => i >= 0);
          expect(ok.length).toBeGreaterThan(0);
          expect(pickChoice(run, ok[rng.int(ok.length)]).ok).toBe(true);
          picks++;
        }
        expect(beginRoad(run)).toBe(false);
        const foe = startDusk(run, pool);
        if (foe.kind === "standin") expect(foe.build.routes.length).toBeGreaterThan(0);
        else expect(foe.record!.runId).not.toBe(run.runId);
        if (n >= 200) { dusksLate++; if (foe.kind === "ghost") ghostsLate++; }
        const mine = ghostOf(run, n * 100 + guard);
        const u = rng.next();
        const winner = u < 0.45 ? 0 : u < 0.9 ? 1 : -1;
        if (winner === -1) draws++;
        finishDay(run, winner, 30, STATS, STATS);
        pool.push(mine);
        if (pool.length > 300) pool.shift();
        expect(run.gold).toBeGreaterThanOrEqual(0);
        expect(run.lives).toBeGreaterThanOrEqual(0);
        expect(run.lives).toBeLessThanOrEqual(HEARTS_START); // HULL-ON (the flip, HEARTS): START_LIVES (5) -> HEARTS_START (10)
        const uids = [...run.inventory.map((i) => i.uid), ...run.build.items.map((p) => p.uid), ...run.build.mods.map((m) => m.uid)];
        expect(new Set(uids).size).toBe(uids.length);
        expect(beltUsed(run.build)).toBeLessThanOrEqual(run.build.beltCap);
      }
      expect(run.over).not.toBe(null);
      if (run.over === "complete") {
        complete++;
        expect([run.day, run.history.length]).toEqual([RUN_DAYS, RUN_DAYS]);
        expect(run.lives).toBeGreaterThan(0);
      } else {
        lost++;
        expect(run.lives).toBe(0);
        expect(run.day).toBeLessThanOrEqual(RUN_DAYS);
      }
      expect(run.wins + run.losses + run.history.filter((h) => h.outcome === "draw").length).toBe(run.history.length);
    }
    expect(complete + lost).toBe(300);
    expect(pool.length).toBe(300);
    expect(draws).toBeGreaterThan(50);
    expect(picks).toBeGreaterThan(300 * 3);
    expect(ghostsLate / dusksLate).toBeGreaterThan(0.9);
    // eslint-disable-next-line no-console
    console.log(`soft-lock sweep: 300 runs, ${complete} complete, ${lost} lost, ${draws} draws, ${picks} event picks, late runs met ghosts at ${ghostsLate}/${dusksLate} dusks`);
  });
});
