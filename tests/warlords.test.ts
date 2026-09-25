// Warlord fights at the road fork (0.6.0b, spec §19, decision 3, R3): PvE, never a life, rewards
// by tier, the Hard part pick, the Iron Matriarch, and save/reload replaying the same fight.
import { describe, expect, it } from "vitest";
import { hashSeed } from "../src/core/rng";
import { finishDay } from "../src/game/day";
import {
  MATRIARCH_GOLD, REWARD_GOLD, finishWarlord, forkFor, hardParts, leaveCaravan, pickPending, pickRoad, takePart, topParts, warlordSeed,
} from "../src/game/road";
import { battleSeed, migrateRun, newRun, rollShop, type Run } from "../src/game/run";
import { simulate, type SideStats } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { starsOf, valueOf } from "../src/sim/stars";
import { DIFFICULTIES, MATRIARCH_DAY, difficultyOf, warlordOffer } from "../src/sim/rivals";

const SEEDS = Array.from({ length: 30 }, (_, i) => 11 + i * 7919);
const STATS: SideStats = { damage: 0, shots: 0, firstShot: -1, idle: 0, turretTime: 0, jams: 0, burnDealt: 0, maxQueue: 0 } as unknown as SideStats;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const reload = (r: Run): Run => migrateRun(JSON.parse(JSON.stringify(r)))!;
const defs = (r: Run): string[] => r.inventory.map((i) => i.def);

function atDay(seed: number, day: number): Run {
  const run = newRun(seed % 2 ? "weaver" : "furnace", seed);
  run.day = day;
  rollShop(run);
  return run;
}

/** A deck's distinct parts a warlord can give away, ranked by its best starred copy's value. */
function giveable(b: Build): string[] {
  const best = new Map<string, number>();
  for (const p of [...b.items, ...b.mods]) best.set(p.def, Math.max(best.get(p.def) ?? 0, valueOf(p.def, starsOf(p))));
  return [...best.keys()]
    .filter((d) => d !== "kiln" && d !== "loom" && ITEMS[d] && ITEMS[d].kind !== "supply")
    .sort((a, c) => best.get(c)! - best.get(a)! || (a < c ? -1 : a > c ? 1 : 0));
}

describe("warlords: rewards", () => {
  it("(a) a loss or draw keeps every life and pays 0; a win pays Easy 2, Medium 4, Hard 3 and keeps lives; idempotent", () => {
    expect(REWARD_GOLD).toEqual({ easy: 2, medium: 4, hard: 3 });
    for (const seed of SEEDS.slice(0, 10)) {
      for (const day of [1, 4, 7]) {
        for (const tier of DIFFICULTIES) {
          for (const winner of [0, 1, -1] as const) {
            const run = atDay(seed, day);
            run.lives = 1;
            expect(pickRoad(run, tier).ok).toBe(true);
            const g0 = run.gold, inv0 = defs(run);
            const out = finishWarlord(run, winner, 42)!;
            expect(out.outcome).toBe(winner === 0 ? "win" : winner === 1 ? "loss" : "draw");
            const pay = winner === 0 ? REWARD_GOLD[tier] : 0;
            expect(out.gold).toBe(pay);
            expect(run.gold - g0).toBe(pay);
            expect(run.lives).toBe(1);
            expect(run.over).toBe(null);
            expect(defs(run)).toEqual(inv0); // a regular warlord's part waits for takePart
            expect(run.warlords).toHaveLength(1);
            const again = clone(run);
            expect(finishWarlord(run, 0, 7)).toEqual(out); // a second call pays nothing more
            expect(finishWarlord(run, 1, 9)).toEqual(out);
            expect(run).toEqual(again);
          }
        }
      }
    }
  });

  it("(b) a Hard win offers 2 distinct parts of that warlord's deck, priciest first; takePart takes exactly one", () => {
    const seen = new Set<string>();
    const short: string[] = [];
    for (const seed of SEEDS) {
      for (let day = 1; day < MATRIARCH_DAY; day++) {
        const run = atDay(seed, day);
        pickRoad(run, "hard");
        const w = run.warlord!;
        seen.add(w.id);
        const parts = w.reward.parts;
        const pool = giveable(w.build);
        // 0.6.0c: always 2; a deck with fewer giveable parts is filled from the captain's later decks
        expect(parts).toEqual(hardParts(w.id, w.build, day));
        expect(parts.slice(0, Math.min(2, pool.length))).toEqual(pool.slice(0, 2));
        if (pool.length < 2) short.push(`${w.id} day ${day} [${parts.join(" ")}]`);
        expect(parts).toHaveLength(2);
        expect(new Set(parts).size).toBe(parts.length);
        const own = parts.slice(0, Math.min(2, pool.length));
        for (const p of parts) expect(["kiln", "loom"]).not.toContain(p);
        for (const p of own) expect([...w.build.items.map((x) => x.def), ...w.build.mods.map((m) => m.def)]).toContain(p);
        const worth = (def: string) => Math.max(...[...w.build.items, ...w.build.mods].filter((p) => p.def === def).map((p) => valueOf(def, starsOf(p))));
        for (let i = 1; i < own.length; i++) expect(worth(own[i - 1])).toBeGreaterThanOrEqual(worth(own[i]));
        expect(w.reward.legendary).toBe(false);
        finishWarlord(run, 0, 30);
        expect(pickPending(run.warlord)).toBe(parts.length > 0);
        const i = (seed + day) % parts.length;
        const inv0 = defs(run);
        expect(takePart(run, i)).toBe(parts[i]);
        expect(defs(run)).toEqual([...inv0, parts[i]]);
        expect(run.warlord!.result!.took).toBe(parts[i]);
        expect(run.warlords[run.warlords.length - 1].part).toBe(parts[i]);
        expect(pickPending(run.warlord)).toBe(false);
        expect(takePart(run, i)).toBe(null);
        expect(takePart(run, 1 - i)).toBe(null);
        expect(defs(run)).toEqual([...inv0, parts[i]]);
      }
    }
    expect(seen.size).toBe(5); // every Hard captain of days 1-7 was checked
    // eslint-disable-next-line no-console
    if (short.length) console.log(`Hard decks with fewer than 2 giveable parts: ${[...new Set(short)].join(", ")}`);
  });

  it("a loss or draw has no part pick", () => {
    for (const winner of [1, -1] as const) {
      const run = atDay(SEEDS[1], 3);
      pickRoad(run, "hard");
      finishWarlord(run, winner, 60);
      expect(pickPending(run.warlord)).toBe(false);
      expect(takePart(run, 0)).toBe(null);
      expect(run.inventory).toEqual([]);
    }
  });

  it("(c) the Iron Matriarch (Hard, day 8, unbeaten): a win pays 5 gold, her priciest part lands in cargo at once, beaten on 8", () => {
    expect(MATRIARCH_GOLD).toBe(5);
    for (const seed of SEEDS.slice(0, 10)) {
      const run = atDay(seed, 8);
      expect(forkFor(run).warlords.hard).toBe("matriarch");
      pickRoad(run, "hard");
      const w = run.warlord!;
      expect(w.id).toBe("matriarch");
      expect(w.reward).toEqual({ gold: MATRIARCH_GOLD, parts: [giveable(w.build)[0]], legendary: true });
      const part = w.reward.parts[0];
      expect(ITEMS[part].price).toBe(Math.max(...giveable(w.build).map((d) => ITEMS[d].price)));
      const g0 = run.gold, lives0 = run.lives, inv0 = defs(run);
      const out = finishWarlord(run, 0, 50)!;
      expect(out.gold).toBe(MATRIARCH_GOLD);
      expect(run.gold - g0).toBe(MATRIARCH_GOLD);
      expect(run.lives).toBe(lives0);
      expect(out.took).toBe(part);
      expect(defs(run)).toEqual([...inv0, part]); // straight to cargo, no pick
      expect(pickPending(run.warlord)).toBe(false);
      expect(takePart(run, 0)).toBe(null);
      expect(defs(run)).toEqual([...inv0, part]);
      expect(run.matriarchBeatenOn).toBe(8);
      expect(run.warlords[0]).toMatchObject({ day: 8, tier: "hard", id: "matriarch", outcome: "win", gold: MATRIARCH_GOLD, part });
    }
    const lost = atDay(SEEDS[0], 8);
    pickRoad(lost, "hard");
    const g0 = lost.gold;
    finishWarlord(lost, 1, 90);
    expect([lost.gold, lost.inventory.length, lost.matriarchBeatenOn]).toEqual([g0, 0, null]);
  });
});

describe("warlords: R3, reloads and the dusk", () => {
  it("(d) R3 end to end: beat her on day 8, dusk, save and reload: days 9 and 10 offer a regular Hard captain", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const run = atDay(seed, 8);
      expect(pickRoad(run, "hard").ok).toBe(true);
      expect(run.warlord!.id).toBe("matriarch");
      finishWarlord(run, 0, 40);
      finishDay(run, 0, 30, STATS, STATS);
      let loaded = reload(run);
      expect(loaded.day).toBe(9);
      for (const day of [9, 10]) {
        expect(loaded.day).toBe(day);
        expect(loaded.matriarchBeatenOn).toBe(8); // survives the reload
        const hard = forkFor(loaded).warlords.hard;
        expect(hard).not.toBe("matriarch");
        expect(difficultyOf(hard)).toBe("hard");
        expect(hard).toBe(warlordOffer(seed, day, 8).hard);
        const probe = clone(loaded);
        pickRoad(probe, "hard");
        expect(probe.warlord!.id).toBe(hard);
        if (day === 9) {
          finishDay(loaded, 0, 30, STATS, STATS);
          loaded = reload(loaded);
        }
      }
      // an unbeaten run still meets her on days 9 and 10
      const unbeaten = atDay(seed, 8);
      pickRoad(unbeaten, "hard");
      finishWarlord(unbeaten, 1, 90);
      finishDay(unbeaten, 0, 30, STATS, STATS);
      let u = reload(unbeaten);
      for (const day of [9, 10]) {
        expect(u.day).toBe(day);
        expect(u.matriarchBeatenOn).toBe(null);
        expect(forkFor(u).warlords.hard).toBe("matriarch");
        if (day === 9) {
          finishDay(u, 0, 30, STATS, STATS);
          u = reload(u);
        }
      }
    }
  });

  it("(e) a reload in the middle of a warlord fight replays the same fight: same deck, same seed, same winner and time", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      for (const day of [1, 5, 9]) {
        const run = atDay(seed, day);
        pickRoad(run, "medium");
        const loaded = reload(run);
        expect(loaded.stage).toBe("warlord");
        expect(loaded.warlord).toEqual(run.warlord);
        expect(warlordSeed(loaded)).toBe(warlordSeed(run));
        expect(warlordSeed(run)).toBe(hashSeed(seed, "warlord", day));
        expect(warlordSeed(run)).not.toBe(battleSeed(run)); // not the dusk's seed
        expect(leaveCaravan(loaded)).toBe("warlord");
        const a = simulate(run.build, run.warlord!.build, warlordSeed(run));
        const b = simulate(run.build, run.warlord!.build, warlordSeed(run));
        const c = simulate(loaded.build, loaded.warlord!.build, warlordSeed(loaded));
        expect(a.over).toBe(true);
        expect([b.winner, b.t]).toEqual([a.winner, a.t]);
        expect([c.winner, c.t]).toEqual([a.winner, a.t]);
        const out = finishWarlord(loaded, a.winner as 0 | 1 | -1, a.t)!;
        expect(out.time).toBe(a.t);
        expect(leaveCaravan(loaded)).toBe("battle"); // fought: on to the dusk
      }
    }
  });

  it("(f) a warlord win, loss or draw never touches the dusk: wins, losses, history and the dusk foe are unchanged", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const tier of DIFFICULTIES) {
        for (const winner of [0, 1, -1] as const) {
          const run = newRun("furnace", seed);
          finishDay(run, 0, 30, STATS, STATS);
          finishDay(run, 1, 30, STATS, STATS);
          expect([run.day, run.wins, run.losses, run.history.length]).toEqual([3, 1, 1, 2]);
          pickRoad(run, tier);
          const before = clone({ wins: run.wins, losses: run.losses, history: run.history, dusk: run.dusk, lives: run.lives, day: run.day });
          finishWarlord(run, winner, 33);
          expect({ wins: run.wins, losses: run.losses, history: run.history, dusk: run.dusk, lives: run.lives, day: run.day }).toEqual(before);
        }
      }
    }
  });
});
