// 0.7.0a M3 (REQ-BFG-016): the Prime's matchmaking decisions.
//  D1, the record rule: never hand a player a ghost with a better record. Eligible only with fewer wins, or as many
//      wins and at most as many lives; ranked as before (|dwins|, |dlives|, the seeded rng). On the server
//      (matchmaking.ts eligible, the match route) and in any client-side pick (fallbackGhost; fetchGhost's check).
//  D2, the new-player pool: a player's first NEW_PLAYER_RUNS finished runs match only seed ghosts (the server's
//      pool), never another player's upload. The client sends `runs`; absent counts as 0.
//  None eligible: the server answers 404 and the client falls back.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { Rng } from "../src/core/rng";
import { RULES_VERSION, type HeroId } from "../src/sim/content";
import { eligible, isNewPlayer, NEW_PLAYER_RUNS, noBetterRecord, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { fetchGhost, matchUrl, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { fallbackGhost } from "../src/net/fallback";
import { decodeSnapshot, encodeSnapshot, ghostId, MAX_LIVES, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { isReachable, reachableRecords } from "../src/net/records"; // HULL-ON (HEARTS): reachableRecords, the POST rows' count
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS; ruling 22e26ded338944ea Q3): the records' lives scale
import { longRunRules, setLongRun } from "../src/sim/longRun"; // BUMP-1D (LONG_RUN ships on; RULING-BUMP-R3 R3.4 b): the D2 test's 10-day half (inWorld below)
import { SCALE_RIGS } from "../src/sim/scale"; // BUMP-1E: the switch ships on; the client's record check (SCALE-2d D5) is live in the D1 client test
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { generateSamplePool } from "./helpers/poolCache";
import { entry } from "./netHelpers";
import { ownedBy, testIdentity } from "./netIdentity";
import { storeBackends } from "./netStores";

const better = (g: { wins: number; lives: number }, r: { wins: number; lives: number }) =>
  g.wins > r.wins || (g.wins === r.wins && g.lives > r.lives);

/** Every record a snapshot of `day` can carry (wins 0..day-1, lives 1..MAX_LIVES), two ghosts each. */
function everyRecordPool(day: number): PoolEntry[] {
  const out: PoolEntry[] = [];
  for (let w = 0; w < day; w++) {
    for (let l = 1; l <= MAX_LIVES; l++) {
      for (const k of [0, 1]) out.push(entry(`g-d${day}-w${w}-l${l}-${k}`, { day, wins: w, lives: l, playerId: `p-${w}-${l}-${k}` }));
    }
  }
  return out;
}

describe("D1: the record rule in matchmaking.ts (pure, exhaustive)", () => {
  it("noBetterRecord is: fewer wins, or as many wins and at most as many lives", () => {
    expect(noBetterRecord({ wins: 1, lives: 5 }, { wins: 2, lives: 1 })).toBe(true); // fewer wins: any lives
    expect(noBetterRecord({ wins: 2, lives: 3 }, { wins: 2, lives: 3 })).toBe(true); // the same record
    expect(noBetterRecord({ wins: 2, lives: 2 }, { wins: 2, lives: 3 })).toBe(true);
    expect(noBetterRecord({ wins: 2, lives: 4 }, { wins: 2, lives: 3 })).toBe(false); // more lives
    expect(noBetterRecord({ wins: 3, lives: 1 }, { wins: 2, lives: 5 })).toBe(false); // more wins
  });

  it("never returns a ghost with a better record, for every day 1-10 and every request state the server accepts", () => {
    let requests = 0, hits = 0, misses = 0, betterInPool = 0;
    for (let day = 1; day <= 10; day++) {
      const pool = everyRecordPool(day);
      for (let wins = 0; wins <= 10; wins++) {
        for (let lives = 0; lives <= MAX_LIVES; lives++) {
          const req: MatchRequest = { rules: RULES_VERSION, day, wins, lives, playerId: "me", seen: [] };
          const ok = pool.filter((e) => !better(e.snapshot, req));
          if (pool.some((e) => better(e.snapshot, req))) betterInPool++;
          expect(eligible(pool, req).map((e) => e.id)).toEqual(ok.map((e) => e.id));
          for (let seed = 0; seed < 3; seed++) {
            requests++;
            const g = pickGhost(pool, req, new Rng(seed));
            if (!g) {
              misses++;
              expect(ok).toHaveLength(0); // null only when nothing is eligible
              continue;
            }
            hits++;
            expect(better(g.snapshot, req), `day ${day} req ${wins}W ${lives}L got ${g.id}`).toBe(false);
            // still the nearest record among the eligible: |dwins| first, then |dlives|
            const rank = (s: GhostSnapshot) => Math.abs(s.wins - wins) * 100 + Math.abs(s.lives - lives);
            expect(rank(g.snapshot)).toBe(Math.min(...ok.map((e) => rank(e.snapshot))));
          }
        }
      }
    }
    expect(requests).toBe(10 * 11 * 10 * 3);
    // states where the pool holds a better record (so the rule has something to refuse): per day d, every request
    // with at most d-2 wins (10 lives values each), plus d-1 wins with lives 0..8: (d-1)*10 + 9, 540 over days 1-10
    expect(betterInPool).toBe(540);
    // nothing eligible only at 0 wins and 0 lives (every ghost has a life); 3 seeds a day
    expect(misses).toBe(30);
    expect(hits).toBe(3270);
  });

  it("with an equal-wins ghost on more lives and a lower-wins one, it takes the lower-wins ghost (rank after the rule)", () => {
    const pool = [entry("more-lives", { day: 5, wins: 2, lives: 5 }), entry("one-win-less", { day: 5, wins: 1, lives: 5 })];
    const req: MatchRequest = { rules: RULES_VERSION, day: 5, wins: 2, lives: 3, playerId: "me", seen: [] };
    for (let s = 0; s < 20; s++) expect(pickGhost(pool, req, new Rng(s))?.id).toBe("one-win-less");
  });

  it("applies to client-side picks: fallbackGhost never takes a better-record pool ghost (it falls back to a stand-in)", () => {
    const pool = [entry("ahead", { day: 4, wins: 3, lives: 5 })];
    const req = { rules: RULES_VERSION, day: 4, wins: 1, lives: 4, playerId: "me", seen: [], hero: "furnace" as HeroId, seed: 9 };
    expect(fallbackGhost(req, pool).id).toMatch(/^offline-/);
    expect(fallbackGhost({ ...req, wins: 3, lives: 5 }, pool).id).toBe("ahead");
  });
});

describe("D2: isNewPlayer", () => {
  it("a player with fewer than NEW_PLAYER_RUNS (3) finished runs, or none stated, is new", () => {
    expect(NEW_PLAYER_RUNS).toBe(3);
    for (const runs of [undefined, 0, 1, 2, -1, 2.5, Number.NaN]) expect(isNewPlayer({ runs }), String(runs)).toBe(true);
    for (const runs of [3, 4, 50, 9999]) expect(isNewPlayer({ runs }), String(runs)).toBe(false);
  });

  it("the client sends runs in the match request; without it the server reads 0", () => {
    const req: GhostRequest = { rules: RULES_VERSION, day: 2, wins: 1, lives: 5, playerId: "me", seen: ["ga", "gb"], hero: "furnace", seed: 3 };
    expect(new URL(matchUrl("http://h", { ...req, runs: 2 })).searchParams.get("runs")).toBe("2");
    expect(new URL(matchUrl("http://h", req)).searchParams.has("runs")).toBe(false);
  });
});

describe("D1 on the client: a served ghost with a better record is never fought", () => {
  it("fetchGhost falls back when a server (one without D1) answers with a better record", async () => {
    const seed = generateSamplePool().find((s) => s.day === 4)!;
    // BUMP-1E: SCALE_RIGS ships on, and with it the client takes a served ghost only if its record is one a run carries into the dusk (SCALE-2d D5,
    // ghostClient.ts problem: isReachable). The ghost's record is the hearts model's now: three wins and no loss reach dusk 4 with HEARTS_START hearts,
    // where 3W 5 lives (the 5-lives scale) is no record any run carries there, so the equal-record request below fell back on that line, not on D1
    // (was lives: 5 here and in the request, the expected error and the equal request below)
    const ahead: GhostSnapshot = { ...seed, wins: 3, lives: HEARTS_START, playerId: "someone" };
    let served: GhostSnapshot = ahead; // BUMP-1E: what the stub answers (ahead, then the old fixture's unreachable record)
    const srv = createServer((_q, s) => {
      s.setHeader("content-type", "application/json");
      s.end(JSON.stringify({ id: ghostId(served), snapshot: served }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    try {
      const req: GhostRequest = { rules: RULES_VERSION, day: 4, wins: 2, lives: 5, playerId: "me", seen: [], hero: "weaver", seed: 4, runs: 3 };
      const f = await fetchGhost(url, req, 2000);
      expect(f.source).toBe("fallback");
      expect(f.error).toBe(`server returned a ghost with a better record (3W ${HEARTS_START} lives)`); // BUMP-1E: was (3W 5 lives)
      expect(await fetchGhost(url, { ...req, wins: 3, lives: HEARTS_START }, 2000)).toMatchObject({ source: "server", id: ghostId(ahead) }); // BUMP-1E: was wins 3, lives 5
      // BUMP-1E: the old fixture's record, equal to the request's and not better, is refused all the same: the shipped client's record check (the switch ships on)
      expect(SCALE_RIGS).toBe(true);
      served = { ...ahead, lives: 5 };
      const odd = await fetchGhost(url, { ...req, wins: 3, lives: 5 }, 2000);
      expect(odd.source).toBe("fallback");
      expect(odd.error).toBe("server returned a ghost whose record (3W 5 lives) no run carries into dusk 4");
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});

// ---------------------------------------------------------------- the server's match route, on both stores

const DAY = 3;
const SEED_POOL = generateSamplePool();
const SEED_IDS = new Set(SEED_POOL.map(ghostId));
const BASE_DECK = SEED_POOL.find((s) => s.day === DAY)!;

// BUMP-1D (LONG_RUN ships on): run an async body in the 10-day world (long = false: a request reads its own day only, as withLongRun(fn, false)) or
// in the long run. The server of this file runs in this process and reads the switch when it answers, after the test's `await fetch`, but
// withLongRun's own finally puts the switch back as soon as its function has returned the promise, before the server has read anything: so the
// switch is set here around the awaits (tests/net-server.test.ts inWorld does the same), and put back even if an assertion throws.
async function inWorld<T>(long: boolean, fn: () => Promise<T>): Promise<T> {
  const was = longRunRules();
  setLongRun(long);
  try {
    return await fn();
  } finally {
    setLongRun(was);
  }
}

describe.each(storeBackends())("the match route (D1, D2), $name store", (backend) => {
  let app: GhostServer;
  let base: string;
  const uploads: PoolEntry[] = [];
  let players: Identity[];

  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ rateLimit: { windowMs: 60_000, max: 100_000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    expect((await seedStore(app.store)).entries).toBe(SEED_POOL.length);
    players = [await testIdentity(1), await testIdentity(2)];
    // one signed upload per record a day-3 snapshot can carry (wins 0..2, lives 1..5), from two players
    // HULL-ON (the flip, HEARTS; cap's ruling 22e26ded338944ea Q3): the records are re-shaped to the hearts scale: lives
    // 1..HEARTS_START (was 1..5, the 5-lives scale, where no hearts run carries any of them into dusk 3, so all 15 were
    // planted). isReachable reads this build's rules on the hearts model (records.ts heartsRecords, the game's heartsDusk
    // step), so the records the hearts rule reaches on day 3 (0W 8-10, 1W 9-10, 2W 10) go through the signed POST again;
    // the other rows stay planted below (store.add): their point is a store that still holds an unreachable record. The
    // spread stays lives 1..10 at each win count, so D1 serves 27 of its 28 request states, as at 66cc267.
    // HULL-ON (the flip, PICK): every row's deck is BASE_DECK as a player uploads it, ungraded (BASE_DECK is a seed ghost,
    // which carries the seed step's grade, and POST refuses a graded upload: 422 "grade: only the seed pool's ghosts carry
    // a grade"; a planted row goes in exactly as a POST would store it, so ungraded too)
    const { grade: _grade, ...uploadDeck } = BASE_DECK;
    let posted = 0;
    for (let w = 0; w < DAY; w++) {
      for (let l = 1; l <= HEARTS_START; l++) {
        const who = players[(w + l) % 2];
        // BUMP-1D (LONG_RUN ships on): BASE_DECK is a bb-0.11.0 seed ghost, which states its OWN `losses`, and a long run's upload states
        // the dusks the run lost (day - 1 = wins + losses + draws; records.ts): a row keeps BASE_DECK's only by chance, so each row states
        // the losses of a run that reaches its (wins, lives): the first count 0..DAY - 1 - w for which isReachable holds with it (reachableRecords
        // reads `losses`); a record no run reaches (a planted row, below) states 0. Was { ...uploadDeck, wins: w, lives: l } (POST answered 422
        // "0W 10 lives and N losses is no record a run carries into dusk 3" for the rows whose records BASE_DECK's losses did not fit)
        const reached = Array.from({ length: DAY - w }, (_, x) => x).find((x) => isReachable(DAY, w, l, { losses: x }));
        const s = ownedBy({ ...uploadDeck, wins: w, lives: l, losses: reached ?? 0, runId: `up-${w}-${l}` }, who);
        if (reached === undefined) {
          // 0.8.0 H2 (P1, oracle 9c95e37aab0a70fb): POST /v1/ghosts now refuses (422) these 11 records (HULL-ON, HEARTS: 24 on
          // the hearts grid): no run carries
          // them into dusk 3. A store can still hold such a ghost: one uploaded before that check (until ghosts:admin
          // revalidate clears it) or one an admin planted. The match route must still work with them there, so they go
          // in exactly as a POST stores them: the snapshot decoded from the bytes submitGhost sends, then store.add.
          const { id, created } = await app.store.add(decodeSnapshot(encodeSnapshot(s)));
          expect(created, `${w}W ${l}L`).toBe(true);
          expect(id, `${w}W ${l}L`).toBe(ghostId(s));
          uploads.push({ id, snapshot: s });
          continue;
        }
        const r = await submitGhost(base, s, who, 3000);
        expect(r.ok, `${w}W ${l}L`).toBe(true);
        if (r.ok) uploads.push({ id: r.id, snapshot: s });
        posted++;
      }
    }
    // HULL-ON (the flip, HEARTS; ruling 22e26ded338944ea Q3): 15 -> DAY * HEARTS_START (30) rows, and every record the
    // hearts rule reaches on day 3 went up through the signed POST (reachableRecords: 6)
    expect(uploads).toHaveLength(DAY * HEARTS_START);
    expect(posted).toBe(reachableRecords(DAY).length);
    expect(posted).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const match = async (q: Record<string, string | number>) => {
    const u = new URLSearchParams({ rules: RULES_VERSION, day: String(DAY), player: "requester", seen: "", ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) });
    const r = await fetch(`${base}/v1/ghosts/match?${u}`);
    return { status: r.status, body: (await r.json()) as { id?: string; snapshot?: GhostSnapshot } };
  };

  it("D1: an experienced player never gets a better record, over every request state; 404 exactly when none is eligible", async () => {
    const all = [...SEED_POOL.filter((s) => s.day === DAY).map((s) => ({ id: ghostId(s), snapshot: s })), ...uploads];
    let served = 0, notFound = 0;
    for (let wins = 0; wins <= DAY; wins++) {
      for (let lives = 0; lives <= 6; lives++) {
        const r = await match({ wins, lives, runs: NEW_PLAYER_RUNS });
        const req = { wins, lives };
        const any = all.some((e) => noBetterRecord(e.snapshot, req));
        if (r.status === 404) {
          notFound++;
          expect(any, `${wins}W ${lives}L: 404 with an eligible ghost`).toBe(false);
          continue;
        }
        served++;
        expect(r.status).toBe(200);
        expect(better(r.body.snapshot!, req), `${wins}W ${lives}L got ${r.body.snapshot!.wins}W ${r.body.snapshot!.lives}L`).toBe(false);
      }
    }
    expect(served).toBeGreaterThan(20);
    expect(notFound).toBeGreaterThan(0); // lives 0: nothing has fewer than one life
  });

  it("D2: a new player (runs absent, 0, 1 or 2) only ever gets a seed ghost, never an upload; from 3 runs uploads come too", async () => {
    const uploadIds = new Set(uploads.map((e) => e.id));
    let newServed = 0;
    for (const runs of [undefined, 0, 1, 2]) {
      for (let wins = 0; wins < DAY; wins++) {
        for (let lives = 1; lives <= 5; lives++) {
          const r = await match(runs === undefined ? { wins, lives } : { wins, lives, runs });
          if (r.status === 404) continue;
          newServed++;
          expect(SEED_IDS.has(r.body.id!), `runs ${runs} ${wins}W ${lives}L got ${r.body.id}`).toBe(true);
          expect(uploadIds.has(r.body.id!)).toBe(false);
        }
      }
    }
    expect(newServed).toBeGreaterThan(30);
    // with every seed ghost already seen, a new player gets 404 (no upload stands in) and an experienced one an upload
    // BUMP-1D (LONG_RUN ships on; RULING-BUMP-R3 R3.4 b): in a long run "every seed ghost" is every seed ghost of days <= DAY (seenAll). Was
    // `seen` = the seed ghosts of day DAY alone (seenDay), which gave 404 only while a request read its own day: a long run's match WIDENS to
    // the nearest EARLIER day with an eligible ghost when its own day has none, and a new player's buckets are the seed pool, so with the day-3
    // seed ghosts seen it was handed a day-2 seed ghost, 200 where 404 was expected (run 3's 2 reds, one per store). The line that widens a long
    // run's match to earlier days is src/net/matchmaking.ts:71 (36c305e), in matchDays:
    //     return Array.from({ length: top }, (_, i) => top - i);
    // the request's own day, then every earlier day down to 1 (line 69 returns [req.day] for the 10-day rules). The match route reads that list at
    // server/app.ts:403-410 (`const days = matchDays(m)`; with no hit on days[0] it reads the buckets of days.slice(1), in the same scope: "pool" for
    // a new player). The 404 of the 10-day world (the exact-day rule only) is kept below, under inWorld(false) (= withLongRun false), with seenDay.
    const seenDay = SEED_POOL.filter((s) => s.day === DAY).map(ghostId).join(",");
    const seenAll = SEED_POOL.filter((s) => s.day <= DAY).map(ghostId).join(",");
    // the widening itself, seen from the new player's side: with only the day's own seed ghosts seen it is served an EARLIER day's seed ghost, never an upload
    const wide = await match({ wins: 2, lives: 5, runs: 0, seen: seenDay });
    expect(wide.status).toBe(200);
    expect(SEED_IDS.has(wide.body.id!)).toBe(true);
    expect(uploadIds.has(wide.body.id!)).toBe(false);
    expect(wide.body.snapshot!.day).toBeLessThan(DAY);
    for (const runs of [0, 1, 2]) expect((await match({ wins: 2, lives: 5, runs, seen: seenAll })).status).toBe(404);
    const vet = await match({ wins: 2, lives: 5, runs: NEW_PLAYER_RUNS, seen: seenAll });
    expect(vet.status).toBe(200);
    expect(uploadIds.has(vet.body.id!)).toBe(true);
    // the 10-day world (the switch off): a request reads its own day only, so the day's own seed ghosts seen are enough for the 404, as before
    await inWorld(false, async () => {
      // a control, so that the 404 below is the exact-day rule's and not a pool this world cannot read: nothing seen, the pool serves the day's own ghost
      const own = await match({ wins: 2, lives: 5, runs: 0 });
      expect(own.status).toBe(200);
      expect(SEED_IDS.has(own.body.id!)).toBe(true);
      expect(own.body.snapshot!.day).toBe(DAY);
      for (const runs of [0, 1, 2]) expect((await match({ wins: 2, lives: 5, runs, seen: seenDay })).status).toBe(404);
      const vet10 = await match({ wins: 2, lives: 5, runs: NEW_PLAYER_RUNS, seen: seenDay });
      expect(vet10.status).toBe(200);
      expect(uploadIds.has(vet10.body.id!)).toBe(true);
    });
  });

  it("no eligible ghost: 404, and the client falls back to its stand-in", async () => {
    const r = await match({ wins: 0, lives: 0, runs: NEW_PLAYER_RUNS });
    expect(r.status).toBe(404);
    const req: GhostRequest = { rules: RULES_VERSION, day: DAY, wins: 0, lives: 0, playerId: "requester", seen: [], hero: "furnace", seed: 5, runs: 3 };
    const f = await fetchGhost(base, req, 3000);
    expect(f).toMatchObject({ source: "fallback", error: "no ghost on the server for this day" });
    expect(f.id).toMatch(/^offline-/);
  });

  it("rejects a malformed runs value (400)", async () => {
    for (const runs of ["-1", "x", "10000", "1.5"]) expect((await match({ wins: 1, lives: 5, runs })).status, runs).toBe(400);
  });
});
