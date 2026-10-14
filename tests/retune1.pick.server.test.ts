// RETUNE-1 T5 (REQ-BFG-092): the server with PICK. GET /v1/ghosts/match picks with pick.ts matchPick: with PICK on, a
// record deep behind (PICK_RULE: 2+ since RULING-S8-R8; was 3+) is served from the weakest share of its eligible seed ghosts (by grade), exactly the ghost
// matchPick names for that request and seed; with PICK off, pickGhost's ghost (as today). POST /v1/ghosts refuses an
// upload that carries a grade: 400 at decode with PICK off (the field is not in this rules version), 422 with it on (only
// the seed pool's ghosts carry a grade). Every switch is put back off after each test.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Rng } from "../src/core/rng";
import { RULES_VERSION } from "../src/sim/content";
import { PICK_RULE, matchPick, setPick } from "../src/net/pick"; // S8 run 3 (RULING-S8-R8): + PICK_RULE (the cut's share)
import { eligible, matchSeed, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

afterEach(() => setPick(false));

function ghost(i: number, day: number, wins: number, lives: number, grade?: number): GhostSnapshot {
  return {
    v: 3, rules: RULES_VERSION, hero: "furnace", day, wins, lives,
    build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 30, hullBonus: 0 },
    runId: `run-${i}`, playerId: `seed-${i}`, createdAt: 0,
    ...(grade !== undefined ? { grade } : {}),
  } as GhostSnapshot;
}
const GRADES = [700, 100, 500, 900, 300, 800, 200, 600, 400];
const entries = (graded: boolean): PoolEntry[] =>
  GRADES.map((g, i) => ghost(i, 6, i % 3, 1 + (i % 2), graded ? g : undefined)).map((s) => ({ id: ghostId(s), snapshot: s }));

describe("RETUNE-1 PICK: the server's routes", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-rt1p-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const match = async (wins: number, lives: number) => {
    const r = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&day=6&wins=${wins}&lives=${lives}&player=me&runs=0`);
    expect(r.status).toBe(200);
    return ((await r.json()) as { id: string }).id;
  };
  const request = (wins: number, lives: number): MatchRequest => ({ rules: RULES_VERSION, day: 6, wins, lives, playerId: "me", seen: [], runs: 0 });

  it("GET /v1/ghosts/match: PICK on, a deep loser is served matchPick's ghost from the weakest share; PICK off, pickGhost's", async () => {
    setPick(true);
    const graded = entries(true);
    await app.store.replacePool(RULES_VERSION, graded);
    for (const [wins, lives] of [[1, 3], [0, 2], [2, 3], [3, 2]] as const) {
      const m = request(wins, lives);
      const want = matchPick(graded, m, new Rng(matchSeed(m, 0)))!;
      expect(await match(wins, lives)).toBe(want.id);
    }
    // the deep loser's ghost is one of the weakest ceil(PICK_RULE.deep x n) by grade. S8 run 3 (RULING-S8-R8: PICK_RULE
    // re-tuned on the regenerated pool): the cut reads PICK_RULE.deep (0.5; was 0.667 written in)
    const deep = request(1, 3);
    const ok = eligible(graded, deep).map((e) => e.snapshot.grade!).sort((a, b) => a - b);
    const served = graded.find((e) => e.id === matchPick(graded, deep, new Rng(matchSeed(deep, 0)))!.id)!;
    expect(ok.slice(0, Math.ceil(PICK_RULE.deep * ok.length))).toContain(served.snapshot.grade);
    setPick(false);
    const plain = entries(false);
    await app.store.replacePool(RULES_VERSION, plain);
    for (const [wins, lives] of [[1, 3], [0, 2], [2, 3]] as const) {
      const m = request(wins, lives);
      expect(await match(wins, lives)).toBe(pickGhost(plain, m, new Rng(matchSeed(m, 0)))!.id);
    }
  }, 120_000);

  it("POST /v1/ghosts refuses an upload carrying a grade: 400 with PICK off, 422 with it on; nothing is stored", async () => {
    const me = await testIdentity(0);
    const before = app.store.size;
    const post = async (s: GhostSnapshot) => {
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: JSON.stringify(await r.json()) };
    };
    const off = await post({ ...ghost(50, 6, 1, 3, 100), runId: "rt1-graded-off" });
    expect(off.status).toBe(400);
    expect(off.body).toContain("snapshot.grade");
    setPick(true);
    const on = await post({ ...ghost(51, 6, 1, 3, 100), runId: "rt1-graded-on" });
    expect(on.status).toBe(422);
    expect(on.body).toContain("grade: only the seed pool's ghosts carry a grade");
    expect(app.store.size).toBe(before);
  }, 120_000);
});
