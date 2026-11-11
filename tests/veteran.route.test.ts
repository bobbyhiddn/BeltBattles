// BUMP-1I PIN-V3 (REQ-BFG-125, VETERAN; battle rules bb-0.16.0): the match route gives a request the veteran's pick. TESTS ONLY.
// STAGE-0917's mutant V3 put the route's two veteranPick calls (server/app.ts: the request's own day, and a thin day's earlier days)
// back to matchPick and every test stayed green: tests/veteran.pick.test.ts picks over pools it builds itself and its route case
// runs on an empty store, tests/veteran.device.test.ts is the device's side (the streak it sends), and the probe's veteran row
// passes on any 200. So no test said that the route gives a player on a streak the veteran's pick (the lead) and everyone else the
// shield (never a tier ghost while another ghost is eligible). This file says it.
//
// It runs the real route (createGhostServer on 127.0.0.1, an in-process store seeded with the committed seed pool, bb-0.16.0) and
// asks over HTTP, as tests/retune1.pick.server.test.ts does. The pick's seed is made from rules, day, wins, lives, player, seen and
// the salt (matchmaking.ts matchSeed; `runs` and `streak` are not in it), so a sweep varies the PLAYER and never the record, and every
// sweep that counts tier ghosts counts them for the plain pick (matchPick) on the same bucket and seeds too: its control, asserted
// first, so a case can never pass at a record where the shield has nothing to do. A tier ghost is a pool entry whose player id is
// `sample-<its hero>-3` (veteran.ts isTierGhost); here it is read off the snapshot, served or stored.
//  A. the shield on the wire: a request that is not a veteran's (no streak, streak 0, streak 1) is never served a tier ghost.
//  B. the veteran on the wire: streak 2 and streak 5 meet tier ghosts (the streak reaches the pick; the shield is not theirs).
//  C. the exact pick: with the salt fixed, the served ghost is the one veteranPick names for that bucket, request and seed, on
//     requests where it is not matchPick's (the shield's, and the lead's).
//  D. the widened day (the route's second call): a thin day is served from the nearest earlier day, with the same two rules.
//  E. old rules: a bb-0.15.0 request with streak 2 is served matchPick's ghost, not the lead pick's.
// Mutants (STAGE-0917 V3, and one call at a time): V3 reddens A, C and D; V3a (the first call alone) A and C; V3b (the second
// call alone) D; V1 (VETERAN_SHIELD false) A, C and D.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Rng } from "../src/core/rng";
import { SEED_POOL } from "../server/seedPoolData";
import { createGhostServer, parseMatchQuery, type GhostServer } from "../server/app";
import { isNewPlayer, matchSeed } from "../src/net/matchmaking";
import { matchPick } from "../src/net/pick";
import { checkSnapshot, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { VETERAN_RULE, veteranPick, type VeteranRequest } from "../src/net/veteran";

const R16 = "bb-0.16.0", R15 = "bb-0.15.0";
const SALT = 0; // the option matchSalt: the route's seed is matchSeed(request, SALT)
const SEEDS = 40; // players a sweep asks for (the record stays put)

/** The committed seed pool (254 ghosts, stamped bb-0.16.0): a copy of it with the rules literal set (ids from ghostId, as tests/veteran.pick.test.ts does). */
const committed: GhostSnapshot[] = SEED_POOL.map((line) => checkSnapshot(JSON.parse(line) as unknown));
const stamped = (snaps: readonly GhostSnapshot[], rules: string): PoolEntry[] => snaps.map((s) => { const snapshot = { ...s, rules }; return { id: ghostId(snapshot), snapshot }; });

/** A tier ghost, read off a snapshot (a stored one or the served one): its player id is `sample-<hero>-3`. */
const isTier = (s: { hero: string; playerId: string }): boolean => s.playerId === `sample-${s.hero}-3`;

/** A record to ask at (and the rules, when not bb-0.16.0); the player and the streak are the sweep's. */
interface Spot { day: number; wins: number; lives: number; rules?: string }
const player = (i: number): string => `vp-${String(i).padStart(2, "0")}`;
const queryOf = (r: Spot, who: string, streak?: number): string =>
  `rules=${r.rules ?? R16}&runs=5&day=${r.day}&wins=${r.wins}&lives=${r.lives}&player=${who}${streak === undefined ? "" : `&streak=${streak}`}`;

/** The forms of request: a streak that is not a veteran's (none, 0, 1) and one that is (2, and a larger one). */
const NON_VETERAN_FORMS = [["no streak", undefined], ["streak=0", 0], ["streak=1", 1]] as const;
const VETERAN_FORMS = [["streak=2", 2], ["streak=5", 5]] as const;

describe("the match route gives a request the veteran's pick (STAGE-0917's mutant V3)", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-veteran-route-"));
    app = createGhostServer({ dataDir: dir, uploads: "closed", log: () => {}, matchSalt: () => SALT, rateLimit: { windowMs: 60_000, max: 100_000 } });
    await app.store.replacePool(R16, stamped(committed, R16));
    await app.store.replacePool(R15, stamped(committed.filter((s) => s.day === 12), R15)); // E: a few entries of the older rules
    base = `http://127.0.0.1:${await app.listen(0)}`;
  }, 60_000);
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** One request over HTTP: the status, and the served ghost's id, hero, player id and day (empty when the answer is not a 200). */
  const ask = async (query: string) => {
    const res = await fetch(`${base}/v1/ghosts/match?${query}`);
    const body = (await res.json()) as { id?: string; snapshot?: { hero: string; playerId: string; day: number } };
    return { status: res.status, id: body.id ?? "", hero: body.snapshot?.hero ?? "", playerId: body.snapshot?.playerId ?? "", day: body.snapshot?.day ?? 0 };
  };
  /** The request as the route parses it, the bucket the route reads for it (scope "pool" for a new player, else "all"), and its pick's rng. */
  const parsed = (query: string): VeteranRequest => parseMatchQuery(new URLSearchParams(query));
  const bucketOf = (m: VeteranRequest, day: number = m.day) => app.store.bucket(m.rules, day, isNewPlayer(m) ? "pool" : "all");
  const seedOf = (m: VeteranRequest): Rng => new Rng(matchSeed(m, SALT));

  /** SEEDS players ask the route for one record with one form of streak. `from` is the day whose bucket the pick is made on (the request's own day, or a thin day's earlier one).
   *  Counts the 200s, the tier ghosts the route served, the days they came from, and the tier ghosts matchPick draws on that bucket for the same requests and seeds (the control). */
  async function sweep(r: Spot, streak: number | undefined, from: number = r.day) {
    let ok = 0, tier = 0, plainTier = 0;
    const days = new Set<number>();
    for (let i = 1; i <= SEEDS; i++) {
      const query = queryOf(r, player(i), streak);
      const got = await ask(query);
      if (got.status === 200) {
        ok++;
        if (isTier(got)) tier++;
        days.add(got.day);
      }
      const m = parsed(query);
      const plain = matchPick(await bucketOf(m, from), m, seedOf(m));
      if (plain && isTier(plain.snapshot)) plainTier++;
    }
    return { ok, tier, plainTier, days: [...days] };
  }

  /** The record of A and B: the STAGE's own (rules=bb-0.16.0&runs=5&day=12&wins=9&lives=8, no streak), where the pick before the shield served a tier ghost on 4 of 4 reads. */
  const AT: Spot = { day: 12, wins: 9, lives: 8 };

  for (const [form, streak] of NON_VETERAN_FORMS) {
    it(`A. the shield on the wire: ${form} is never served a tier ghost at day 12, 9 wins, 8 hearts (40 players), where the plain pick draws one`, async () => {
      const r = await sweep(AT, streak);
      expect(r.plainTier, `the control: matchPick on the same bucket and seeds draws a tier ghost in ${r.plainTier} of ${SEEDS}`).toBeGreaterThanOrEqual(1);
      expect(r.ok, "answers with status 200").toBe(SEEDS);
      expect(r.tier, `${form}: tier ghosts served by the route in ${SEEDS} (the plain pick: ${r.plainTier})`).toBe(0);
    }, 60_000);
  }

  for (const [form, streak] of VETERAN_FORMS) {
    it(`B. the veteran on the wire: ${form} meets a tier ghost at day 12, 9 wins, 8 hearts (40 players)`, async () => {
      const r = await sweep(AT, streak);
      expect(r.plainTier, `the control: matchPick on the same bucket and seeds draws a tier ghost in ${r.plainTier} of ${SEEDS}`).toBeGreaterThanOrEqual(1);
      expect(r.ok, "answers with status 200").toBe(SEEDS);
      expect(r.tier, `${form}: tier ghosts served by the route in ${SEEDS} (the plain pick: ${r.plainTier})`).toBeGreaterThanOrEqual(1);
    }, 60_000);
  }

  it("C. the exact pick: with the salt fixed, the served ghost is veteranPick's for that bucket, request and seed (24 forms of request, 3 players each), and it is not always matchPick's", async () => {
    // days 5, 8, 12 and 16, two records each. The plain pick lands on a tier ghost, so the shield serves another, at 4W10L on day 5, 7W10L on day 8,
    // 9W8L on day 12 and both records of day 16; a veteran's lead serves another ghost than the plain pick at 5W10L on day 8 and 7W9L on day 12;
    // 2W6L on day 5 is a record where all the picks agree
    const spots: Spot[] = [
      { day: 5, wins: 4, lives: 10 }, { day: 5, wins: 2, lives: 6 }, { day: 8, wins: 7, lives: 10 }, { day: 8, wins: 5, lives: 10 },
      { day: 12, wins: 9, lives: 8 }, { day: 12, wins: 7, lives: 9 }, { day: 16, wins: 9, lives: 1 }, { day: 16, wins: 9, lives: 5 },
    ];
    let asked = 0, wrong = 0, differs = 0, differsShield = 0, differsVeteran = 0;
    const firstWrong: string[] = [];
    for (const r of spots) for (const streak of [undefined, 0, 2]) for (const who of [player(1), player(2), player(3)]) {
      const query = queryOf(r, who, streak);
      const m = parsed(query);
      const bucket = await bucketOf(m);
      const want = veteranPick(bucket, m, seedOf(m));
      const plain = matchPick(bucket, m, seedOf(m));
      const got = await ask(query);
      asked++;
      if (!want || got.status !== 200 || got.id !== want.id) {
        wrong++;
        if (firstWrong.length < 3) firstWrong.push(`${query}: served ${got.status} ${got.id}, veteranPick ${want?.id}`);
      }
      if (want && plain && want.id !== plain.id) {
        differs++;
        if (streak === 2) differsVeteran++;
        else differsShield++;
      }
    }
    expect(asked).toBeGreaterThanOrEqual(24);
    expect(wrong, `requests not served veteranPick's ghost: ${firstWrong.join("; ")}`).toBe(0);
    expect(differs, "requests where veteranPick's ghost is not matchPick's").toBeGreaterThanOrEqual(3);
    expect(differsShield, "of them, requests that are not a veteran's (the shield)").toBeGreaterThanOrEqual(1);
    expect(differsVeteran, "of them, requests with streak=2 (the lead)").toBeGreaterThanOrEqual(1);
  }, 60_000);

  describe("D. the widened day (the route's second call)", () => {
    /** Day 17 holds no ghost: the nearest earlier day with an eligible one is day 16 (the STAGE read day 17 served from day 16). */
    const THIN: Spot = { day: 17, wins: 9, lives: 8 };
    const FROM = 16;
    it("the request's own day answers null for every form (the first call has nothing to pick), so the pick is the second call's", async () => {
      for (const streak of [undefined, 0, 1, 2, 5]) {
        const m = parsed(queryOf(THIN, player(1), streak));
        expect(veteranPick(await bucketOf(m), m, seedOf(m)), `day 17, streak ${streak}: veteranPick on the request's own day`).toBeNull();
        expect(matchPick(await bucketOf(m), m, seedOf(m)), `day 17, streak ${streak}: matchPick on the request's own day`).toBeNull();
        expect((await bucketOf(m, FROM)).length, "day 16 holds ghosts").toBeGreaterThan(0);
      }
    });
    for (const [form, streak] of NON_VETERAN_FORMS) {
      it(`${form} is served from day 16 and never a tier ghost (40 players), where the plain pick on day 16's bucket draws one`, async () => {
        const r = await sweep(THIN, streak, FROM);
        expect(r.plainTier, `the control: matchPick on day 16's bucket draws a tier ghost in ${r.plainTier} of ${SEEDS}`).toBeGreaterThanOrEqual(1);
        expect(r.ok, "answers with status 200").toBe(SEEDS);
        expect(r.days, "the day the ghosts are served from").toEqual([FROM]);
        expect(r.tier, `${form}: tier ghosts served by the route in ${SEEDS} (the plain pick: ${r.plainTier})`).toBe(0);
      }, 60_000);
    }
    it("streak=2 is served from day 16 and meets a tier ghost (40 players)", async () => {
      const r = await sweep(THIN, 2, FROM);
      expect(r.ok, "answers with status 200").toBe(SEEDS);
      expect(r.days, "the day the ghosts are served from").toEqual([FROM]);
      expect(r.tier, `streak=2: tier ghosts served by the route in ${SEEDS} (the plain pick: ${r.plainTier})`).toBeGreaterThanOrEqual(1);
    }, 60_000);
  });

  it("E. old rules: a bb-0.15.0 request with streak=2 is served matchPick's ghost, not the lead pick's", async () => {
    const r: Spot = { rules: R15, day: 12, wins: 7, lives: 9 }; // a record where the lead picks another ghost than the plain pick (checked below)
    let leadDiffers = 0;
    for (let i = 1; i <= 10; i++) {
      const query = queryOf(r, player(i), 2);
      const m = parsed(query);
      const bucket = await bucketOf(m);
      expect(bucket.length, "the bb-0.15.0 entries this test seeded").toBeGreaterThan(0);
      const want = matchPick(bucket, m, seedOf(m));
      const lead = matchPick(bucket, m, seedOf(m), VETERAN_RULE);
      expect(want, "matchPick names a ghost for this request").not.toBeNull();
      const got = await ask(query);
      expect(got.status).toBe(200);
      expect(got.id).toBe(want?.id);
      if (lead?.id !== want?.id) leadDiffers++;
    }
    expect(leadDiffers, "requests where the lead pick would have served another ghost").toBeGreaterThanOrEqual(1);
  });
});
