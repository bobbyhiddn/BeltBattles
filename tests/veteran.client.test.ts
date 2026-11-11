// BUMP-1I PIN-OFFLINE (REQ-BFG-125, VETERAN; battle rules bb-0.16.0): the client's offline pick. TESTS ONLY.
// When the server cannot be reached, fetchGhost answers with veteranFallback(req, opts.pool) (src/net/ghostClient.ts:111; before BUMP-1I the
// line was fallbackGhost(req, opts.pool)). The route's pick is pinned on the wire (tests/veteran.route.test.ts) and veteranFallback itself is
// pinned by tests/veteran.pick.test.ts, but no test reached the line at ghostClient.ts:111: putting fallbackGhost back there (M1) or dropping
// the streak from the request there (M2) left tests/veteran.pick.test.ts, tests/veteran.device.test.ts and tests/online.test.ts green (48 tests
// in each run), because no test hands fetchGhost a pool. This file says what the line does.
//
// It runs the real fetchGhost against an address that refuses the connection (a port that was open a moment ago) with the committed seed pool
// (254 ghosts, stamped bb-0.16.0, decoded as tests/veteran.route.test.ts does) as the 4th argument. A tier ghost is a pool entry whose player
// id is `sample-<its hero>-3`, read off the snapshot (independent of veteran.ts isTierGhost). The pick's seed is the request's: new Rng(req.seed).
//  A. the shield: no streak, streak 0 and streak 1 at day 12, 9 wins, 8 hearts are never given a tier ghost, and the answer is veteranPick's;
//     the control, asserted FIRST: fallbackGhost (the plain pick) on the same pool and requests gives a tier ghost.
//  B. the lead: streak 2 at day 8, 5 wins, 10 hearts and at day 12, 7 wins, 9 hearts is given veteranPick's ghost, which is not fallbackGhost's
//     and not the shield's (the same request without the streak).
//  C. the veteran meets a tier ghost offline: streak 2 at day 12, 9 wins, 8 hearts.
//  D. without a pool the answer is offlineGhost's stand-in whatever the streak, and never a tier ghost (a scratch run at the tip met 0 tier
//     decks in 7,680 such requests: 16 records x 3 forms x 4 heroes x 40 seeds; this case asserts 3 records x 40 seeds x 2 forms).
//  E. the page hands fetchGhost NO pool (src/game/online.ts:275 passes url, request and deadline), so D is what a player offline meets
//     (and src/game/day.ts onlineFoe fights 0.6.2's stand-in for a fallback answer in any case: tests/online.test.ts). A later change that hands
//     the page a pool meets E.
// Mutants: M1 (ghostClient.ts:111 back to fallbackGhost) reddens A and B; M2 (the streak dropped there) reddens B and C.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { hashSeed, Rng } from "../src/core/rng";
import { SEED_POOL } from "../server/seedPoolData";
import { newRun } from "../src/game/run";
import { FETCH_TIMEOUT_MS, startOnline, stopOnline, STREAK_KEY, type OnlineDeps } from "../src/game/online";
import { fallbackGhost } from "../src/net/fallback";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { veteranPick } from "../src/net/veteran";
import { testIdentity } from "./netIdentity";

const R16 = "bb-0.16.0";
const SEEDS = 40; // requests a sweep makes (the record stays put, the seed moves)
const HEROES = ["furnace", "weaver", "foundry", "bastion"] as const; // the requester's hero cycles; the pool's pick does not read it

/** The committed seed pool as pool entries (the rules literal set and the ids from ghostId, as tests/veteran.route.test.ts stamps its store's). */
const committed: GhostSnapshot[] = SEED_POOL.map((line) => checkSnapshot(JSON.parse(line) as unknown));
const POOL: PoolEntry[] = committed.map((s) => { const snapshot = { ...s, rules: R16 }; return { id: ghostId(snapshot), snapshot }; });

/** A tier ghost, read off a snapshot: its player id is `sample-<hero>-3`. */
const isTier = (s: { hero: string; playerId: string }): boolean => s.playerId === `sample-${s.hero}-3`;

interface Spot { day: number; wins: number; lives: number }
const AT: Spot = { day: 12, wins: 9, lives: 8 }; // the tier's neighbourhood: the plain pick draws a tier ghost here
const LEAD_A: Spot = { day: 8, wins: 5, lives: 10 }; // where the lead's ghost is not the plain pick's (tests/veteran.route.test.ts C)
const LEAD_B: Spot = { day: 12, wins: 7, lives: 9 };

/** The i-th request at a record: the page's shape (online.ts request), the seed as battleSeed makes one, a streak only when stated. */
const reqOf = (r: Spot, i: number, streak?: number): GhostRequest => ({
  rules: R16, ...r, playerId: "vc-player", seen: [], hero: HEROES[i % HEROES.length], seed: hashSeed(i, "battle", r.day), runs: 5, ...(streak === undefined ? {} : { streak }),
});

const FORMS = [["no streak", undefined], ["streak=0", 0], ["streak=1", 1]] as const; // not a veteran's

describe("fetchGhost offline (the server refuses the connection) with a pool: the veteran's pick (ghostClient.ts:111)", () => {
  let dead = ""; // a base URL whose port answered nobody a moment ago
  beforeAll(async () => {
    dead = await new Promise<string>((resolve) => {
      const srv = createServer(() => { /* it is closed before anyone asks */ });
      srv.listen(0, "127.0.0.1", () => { const addr = srv.address(); const port = typeof addr === "object" && addr ? addr.port : 0; srv.close(() => resolve(`http://127.0.0.1:${port}`)); });
    });
  });

  /** SEEDS requests at one record with one form of streak, each asked of the real fetchGhost with the pool and compared with the pick itself. `exact`: the
   *  answer is the ghost veteranPick names; `plainTier`: the tier ghosts fallbackGhost draws on the same pool and requests (the control); `vsPlain`: the
   *  requests where veteranPick's ghost is not fallbackGhost's; `vsShield`: where it is not the pick of the same request without the streak. */
  async function sweep(r: Spot, streak: number | undefined) {
    let fallback = 0, exact = 0, tier = 0, plainTier = 0, vsPlain = 0, vsShield = 0;
    for (let i = 1; i <= SEEDS; i++) {
      const req = reqOf(r, i, streak);
      const got = await fetchGhost(dead, req, FETCH_TIMEOUT_MS, { pool: POOL });
      const want = veteranPick(POOL, req, new Rng(req.seed));
      const plain = fallbackGhost(req, POOL);
      const shield = veteranPick(POOL, { ...req, streak: undefined }, new Rng(req.seed));
      if (got.source === "fallback") fallback++;
      if (want && got.id === want.id) exact++;
      if (isTier(got.snapshot)) tier++;
      if (isTier(plain.snapshot)) plainTier++;
      if (want && want.id !== plain.id) vsPlain++;
      if (want && want.id !== shield?.id) vsShield++;
    }
    return { fallback, exact, tier, plainTier, vsPlain, vsShield };
  }

  for (const [form, streak] of FORMS) {
    it(`A. the shield offline: ${form} is never given a tier ghost at day 12, 9 wins, 8 hearts (40 seeds), where fallbackGhost's pick is`, async () => {
      const r = await sweep(AT, streak);
      expect(r.plainTier, `the control: fallbackGhost on the same pool and requests gives a tier ghost in ${r.plainTier} of ${SEEDS}`).toBeGreaterThanOrEqual(1);
      expect(r.fallback, "answers with source fallback").toBe(SEEDS);
      expect(r.tier, `${form}: tier ghosts given in ${SEEDS} (fallbackGhost: ${r.plainTier})`).toBe(0);
      expect(r.exact, "answers that are the ghost veteranPick names").toBe(SEEDS);
      expect(r.vsPlain, "requests where veteranPick's ghost is not fallbackGhost's").toBeGreaterThanOrEqual(1);
    });
  }

  for (const [name, spot] of [["day 8, 5 wins, 10 hearts", LEAD_A], ["day 12, 7 wins, 9 hearts", LEAD_B]] as const) {
    it(`B. the lead offline: streak=2 is given veteranPick's ghost at ${name} (40 seeds), which is not fallbackGhost's and not the shield's`, async () => {
      const r = await sweep(spot, 2);
      expect(r.fallback, "answers with source fallback").toBe(SEEDS);
      expect(r.exact, "answers that are the ghost veteranPick names").toBe(SEEDS);
      expect(r.vsPlain, "requests where veteranPick's ghost is not fallbackGhost's").toBeGreaterThanOrEqual(1);
      expect(r.vsShield, "requests where veteranPick's ghost is not the pick of the same request without the streak").toBeGreaterThanOrEqual(1);
    });
  }

  it("C. the veteran meets a tier ghost offline: streak=2 at day 12, 9 wins, 8 hearts (40 seeds)", async () => {
    const r = await sweep(AT, 2);
    expect(r.plainTier, `the control: fallbackGhost on the same pool and requests gives a tier ghost in ${r.plainTier} of ${SEEDS}`).toBeGreaterThanOrEqual(1);
    expect(r.fallback, "answers with source fallback").toBe(SEEDS);
    expect(r.tier, `streak=2: tier ghosts given in ${SEEDS} (fallbackGhost: ${r.plainTier})`).toBeGreaterThanOrEqual(1);
    expect(r.exact, "answers that are the ghost veteranPick names").toBe(SEEDS);
  });

  it("D. without a pool (the page's call): the answer is offlineGhost's stand-in, the same with streak=2 as without, and never a tier ghost", async () => {
    let asked = 0;
    for (const r of [AT, LEAD_A, { day: 16, wins: 9, lives: 1 }]) for (let i = 1; i <= SEEDS; i++) {
      const none = await fetchGhost(dead, reqOf(r, i), FETCH_TIMEOUT_MS);
      const vet = await fetchGhost(dead, reqOf(r, i, 2), FETCH_TIMEOUT_MS);
      asked++;
      expect(none.source).toBe("fallback");
      expect(none.id, `day ${r.day}: the stand-in's id`).toMatch(/^offline-(furnace|weaver)-d\d+$/);
      expect(vet, `day ${r.day}, seed ${i}: streak=2 is the same answer as no streak`).toEqual(none);
      expect(isTier(none.snapshot), `day ${r.day}, seed ${i}: a tier ghost`).toBe(false);
    }
    expect(asked).toBe(3 * SEEDS);
  });
});

// E. what the page hands fetchGhost: tests/online.test.ts's own set-up (a memory store, fake deps, a test identity), the device holding streak 2.
const until = async (cond: () => boolean): Promise<void> => { for (let n = 0; !cond(); n++) { if (n > 1000) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 5)); } };
afterEach(() => stopOnline());
describe("the page's call (src/game/online.ts:275)", () => {
  it("E. Online.tick calls deps.fetchGhost(url, request, FETCH_TIMEOUT_MS): three arguments, no pool, the request carrying the device's streak", async () => {
    const calls: unknown[][] = [];
    const me = await testIdentity(3);
    const kv = new Map<string, string>([[STREAK_KEY, JSON.stringify({ streak: 2, last: "r0" })]]);
    const deps: OnlineDeps = {
      fetchGhost: ((...a: unknown[]) => { calls.push(a); return new Promise(() => {}); }) as unknown as typeof fetchGhost,
      submitGhost: (() => new Promise(() => {})) as unknown as typeof submitGhost,
      identity: async () => me, store: { getItem: (k) => kv.get(k) ?? null, setItem: (k, v) => void kv.set(k, v) }, now: () => 1_790_000_000_000, save: () => {},
    };
    const s = startOnline("https://ghosts.example", deps);
    await until(() => s.active);
    s.tick(newRun("furnace", 99));
    expect(calls).toHaveLength(1);
    expect(calls[0], "url, request, deadline: no 4th argument, so no pool").toHaveLength(3);
    expect(calls[0][2]).toBe(FETCH_TIMEOUT_MS);
    expect(calls[0][1], "the request carries the device's streak").toMatchObject({ hero: "furnace", streak: 2 });
  });
});
