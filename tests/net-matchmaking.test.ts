import { describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { RULES_VERSION } from "../src/sim/content";
import { eligible, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import type { PoolEntry } from "../src/net/snapshot";
import { entry } from "./netHelpers";

const PLAYERS = Array.from({ length: 12 }, (_, i) => `player-${i}`);

function randomPool(n: number, seed: number): PoolEntry[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const day = 1 + rng.int(10);
    return entry(`g${String(i).padStart(4, "0")}`, {
      rules: rng.chance(0.8) ? RULES_VERSION : "bb-0.3.0", day, wins: rng.int(day), lives: 1 + rng.int(5),
      playerId: rng.pick(PLAYERS),
    });
  });
}

function randomRequest(rng: Rng, pool: readonly PoolEntry[]): MatchRequest {
  const day = 1 + rng.int(10);
  const seen = pool.filter(() => rng.chance(0.15)).map((e) => e.id);
  return {
    rules: rng.chance(0.9) ? RULES_VERSION : "bb-0.3.0", day, wins: rng.int(day), lives: 1 + rng.int(5),
    playerId: rng.pick(PLAYERS), seen,
  };
}

const POOL = randomPool(400, 11);
const REQUESTS = (() => {
  const rng = new Rng(99);
  return Array.from({ length: 600 }, () => randomRequest(rng, POOL));
})();

describe("matchmaking properties", () => {
  it("only ever returns a ghost with the same rules version and day", () => {
    let hits = 0;
    REQUESTS.forEach((req, i) => {
      const g = pickGhost(POOL, req, new Rng(i));
      if (!g) return;
      hits++;
      expect(g.snapshot.rules).toBe(req.rules);
      expect(g.snapshot.day).toBe(req.day);
    });
    expect(hits).toBeGreaterThan(400);
  });

  it("never returns the requester's own build or a ghost already seen this run", () => {
    REQUESTS.forEach((req, i) => {
      const g = pickGhost(POOL, req, new Rng(i));
      if (!g) return;
      expect(g.snapshot.playerId).not.toBe(req.playerId);
      expect(req.seen).not.toContain(g.id);
    });
  });

  it("returns the nearest record first: fewest win difference, then fewest lives difference", () => {
    REQUESTS.forEach((req, i) => {
      const g = pickGhost(POOL, req, new Rng(i));
      const pool = eligible(POOL, req);
      if (!g) {
        expect(pool).toHaveLength(0);
        return;
      }
      const rank = (e: PoolEntry) => [Math.abs(e.snapshot.wins - req.wins), Math.abs(e.snapshot.lives - req.lives)];
      const [gw, gl] = rank(g);
      for (const e of pool) {
        const [w, l] = rank(e);
        expect(w > gw || (w === gw && l >= gl)).toBe(true);
      }
    });
  });

  it("returns null when nothing is left", () => {
    const req: MatchRequest = { rules: RULES_VERSION, day: 3, wins: 1, lives: 3, playerId: "me", seen: [] };
    expect(pickGhost([], req, new Rng(1))).toBeNull();
    const pool = [entry("a", { day: 3, wins: 1 }), entry("b", { day: 3, wins: 2 }), entry("c", { day: 3, playerId: "me" })];
    expect(pickGhost(pool, { ...req, seen: ["a", "b"] }, new Rng(1))).toBeNull();
    expect(pickGhost(pool, { ...req, rules: "bb-9.9.9" }, new Rng(1))).toBeNull();
    expect(pickGhost(pool, { ...req, day: 4 }, new Rng(1))).toBeNull();
    expect(pickGhost(pool, req, new Rng(1))?.id).toBe("a");
  });

  it("is deterministic for a given rng and does not depend on pool order", () => {
    const shuffled = new Rng(5).shuffle([...POOL]);
    REQUESTS.slice(0, 200).forEach((req, i) => {
      const a = pickGhost(POOL, req, new Rng(1000 + i));
      const b = pickGhost(POOL, req, new Rng(1000 + i));
      const c = pickGhost(shuffled, req, new Rng(1000 + i));
      expect(b?.id).toBe(a?.id);
      expect(c?.id).toBe(a?.id);
    });
  });

  it("picks uniformly within the best rank", () => {
    const pool = ["w", "x", "y", "z"].map((id) => entry(id, { day: 5, wins: 2, lives: 3, playerId: `p-${id}` }));
    pool.push(entry("far", { day: 5, wins: 0, lives: 3, playerId: "p-far" }));
    const req: MatchRequest = { rules: RULES_VERSION, day: 5, wins: 2, lives: 3, playerId: "me", seen: [] };
    const counts: Record<string, number> = {};
    for (let s = 0; s < 4000; s++) {
      const id = pickGhost(pool, req, new Rng(s))!.id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(counts.far).toBeUndefined();
    for (const id of ["w", "x", "y", "z"]) expect(Math.abs(counts[id] - 1000)).toBeLessThan(150);
  });
});
