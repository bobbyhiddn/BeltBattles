// 0.8.0 H2 M1 (REQ-BFG-009, REQ-BFG-016; backlog 325): POST /v1/ghosts refuses, with 422, a snapshot whose (day, wins,
// lives) record no run can carry into that day's dusk (src/net/records.ts isReachable, as the seed and ghosts:admin
// revalidate already check). Before H2 an honest, signed, budget-checked and hero-gated deck could carry a fake low
// record, for example day 1 with 1 life, and so be eligible for more matches (D1 serves only ghosts with no better
// record). The check comes after the rules check and validateUpload and before store.add, so nothing is stored.
// On both stores (tests/netStores.ts: JSON lines, and Tigris through tools/fakeS3.ts), uploads open in-process:
//  - every unreachable record the decoder takes gets 422 with the record error, and the store is unchanged: the
//    /v1/health ghosts count, the store's own listing (every day's bucket), its stored records and, on Tigris, every
//    object in the bucket (listed through the store's own S3 client);
//  - every reachable record of every day 1-10 (floorRecord included) gets 201 and is stored;
//  - the order: closed 403, signing 401, decode 400 (a record the decoder bounds keeps its 400), playerId 403, rules 422
//    (a bb-0.6.2 FURNACE snapshot with an unreachable record meets the rules 422, as a 0.7.0 page does), deck 422, then
//    the record 422;
//  - a resend of a stored ghost still gets 200; a ghost planted past POST with an unreachable record (stored before
//    this check) gets the record 422 on a resend, and the store keeps its one copy;
//  - all 120 seed ghosts of this build's rules (generateSamplePool(): the RC's bb-0.8.0 pool, bb-0.8.3 since BELTS),
//    posted as one player's signed dusks, get 201 (ported from the Prime's RC check, output-RC/verify-cap/zz-caprc.test.ts).
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule. A loss to 1 life before day 10 gives a life back (1 -> 2,
// once a run), so the record model (records.ts) gives 172 records over dusks 1-10 (was 178; under rules before LAST CHANCE,
// "bb-0.9.1", still 178). 13 of them only a run that had its LAST CHANCE carries (1 life at dusks 7-10); POST reads an
// upload's record with its lastChance (its day, null when it has none), so such a record goes up with an honest LAST CHANCE
// (a day the model accepts for it, the HULL card on the deck) and gets 201, and plainly gets the record 422. The seed pool
// carries the model's labels too (server/seed.ts checkPool reads them with or without one), but a seed ghost never carries
// a lastChance: the 22 whose label only a LAST CHANCE reaches get the record 422 as plain uploads, the other 98 get 201.
// HULL-ON (the flip, HEARTS): this build's rules read a record on the hearts model (records.ts heartsRecords: 10 hearts, a
// loss 1/2/3 by day, no refund, LAST CHANCE setting 1): 324 records over dusks 1-10 (was 172 on 5 lives), 17 of them
// LAST CHANCE-only (was 13), and the decoder's lives bound is 10 (livesCapFor); with HEARTS off, the 5-lives model as
// before. (PICK): the pool decks carry the seed step's grade, which POST refuses, so `mine` uploads a deck without it.
// BUMP-1D (LONG_RUN ships on, bb-0.11.0): records read on the long run's model (records.ts longRunRecords): 307 over dusks 1-10 (was 324), 13 of
// them LAST CHANCE-only (was 17), and an upload states its `losses` (day - 1 = wins + losses + draws; the decoder takes at most MAX_RUN_DRAWS = 8
// draws, so the plain attempt at a LAST CHANCE-only record states the fewest losses it takes: lossesFor). The seed pool is the committed
// 192-ghost long-run pool (days 1-16, each ghost stating its own `losses`; was 120 over days 1-10): 131 of its ghosts get 201 as plain
// uploads (was 96) and 61 the record 422 (was 24), each on 1 heart, which only a run with its LAST CHANCE carries (LAST_CHANCE_SEEDS).
// BUMP-1E (the regenerated pools, R3: the committed pool is bb-0.12.0's): 132 get 201 and 60 the record 422 (was 131 and 61; weaver d10 3W 1L is gone from the pool).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION } from "../src/sim/content";
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): the 5-lives checks
import { MAX_RUN_DRAWS, withLongRun } from "../src/sim/longRun"; // BUMP-1D (LONG_RUN ships on): the 10-day world's models, read with the switch off; and the draws an upload may carry (8)
import { LAST_CHANCE_HULL } from "../src/sim/lastChance"; // Z-BUMP (REQ-BFG-073): the HULL card
import { floorRecord, isReachable, reachableRecords } from "../src/net/records";
import { rulesGateProblem } from "../src/net/rulesGate"; // SOFT-1 (REQ-BFG-092): the 0.7.0 page's deck
import { decodeSnapshot, encodeSnapshot, ghostId, MAX_DAY, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import type { TigrisStore } from "../server/tigrisStore";
import { generateSamplePool } from "./helpers/poolCache";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

// the seed pool (bb-0.8.3 since BELTS; the RC's was bb-0.8.0): BUMP-1D: bb-0.11.0's, the committed server/seedPoolData.ts byte for byte
// (tests/s8.seedfile.test.ts): 192 ghosts, four heroes x days 1-16 x 3, each stating its own `losses` (was 120 ghosts, four heroes x days 1-10 x 3)
const POOL = generateSamplePool();
/** An honest deck of `day`: the FURNACE seed ghost of that day without turrets or joins where there is one. */
const deckOf = (day: number): GhostSnapshot => {
  const ofDay = POOL.filter((s) => s.day === day && s.hero === "furnace");
  return ofDay.find((s) => !s.build.turrets?.length && !s.build.routes.some((r) => r.join !== undefined)) ?? ofDay[0];
};
/** FLIP-X2: `s` as a client before bb-0.8.7 (runes) sends it: a rune-less v2 snapshot, no build.runes and no run seed. */
function runeless(s: GhostSnapshot): GhostSnapshot {
  const out: GhostSnapshot = { ...s, v: SNAPSHOT_VERSION, build: { ...s.build } };
  delete out.seed;
  // S8 (the pools: P1 83c039d's tuples carry a road log, so FURNACE / WEAVER seed ghosts do too): and the road log, v3 only and
  // gated by NPC_DAY's rules, which a pre-rune client never sends ("snapshot.road: not allowed in a v2 snapshot")
  delete out.road;
  delete out.losses; // BUMP-1D (LONG_RUN ships on): and the dusks lost (v3 only: "snapshot.losses: not allowed in a v2 snapshot")
  delete out.build.runes;
  // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), the regenerated pool on bb-0.13.0 holds enchantments): and the words (`ench`, `enchDir`, `grow`) of ENCHANT, which no client before bb-0.13.0 sent and the strict
  // decoder refuses under an older rules string ("snapshot.build.items[1].ench: unknown field", before the rules 422 this test reads): the copy drops them, as it drops the runes
  const noWords = <P extends object>(list: P[] | undefined): P[] | undefined => list?.map((p) => { const { ench: _e, enchDir: _d, grow: _g, ...rest } = p as Record<string, unknown>; return rest as P; });
  out.build.items = noWords(out.build.items)!;
  if (out.build.turrets) out.build.turrets = noWords(out.build.turrets)!;
  return out;
}
// BUMP-1D (LONG_RUN ships on): an upload under this build's rules states the dusks the run lost, and the server's record error names them
// (server/app.ts: "record: 0W 1 lives and 0 losses is no record a run carries into dusk 1"); `losses` absent: the old words (was always those)
const recordError = (day: number, wins: number, lives: number, losses?: number) => `record: ${wins}W ${lives} lives${losses !== undefined ? ` and ${losses} losses` : ""} is no record a run carries into dusk ${day}`;
/** BUMP-1D: the `losses` a long run's upload of this record states: the first count 0..day - 1 - wins of a run that reaches (wins, lives) with the
 *  snapshot's LAST CHANCE (reachableRecords reads `losses`). For a record no run reaches with that LAST CHANCE (a row nothing reaches, or the plain
 *  attempt at a LAST CHANCE-only record, which has no lastChance) the fewest losses the decoder takes: at most MAX_RUN_DRAWS (8) of the dusks
 *  before the snapshot's are draws, so Math.max(0, day - 1 - wins - 8) (BUMP-1D: was 0, which the decoder refuses at day 10 with 0 wins:
 *  "snapshot.losses: 9 draws in 9 dusks is past 8"; the same 0 as before for every other row this file posts, whose day - 1 - wins is at most 8). */
const lossesFor = (s: GhostSnapshot): number =>
  Array.from({ length: Math.max(0, s.day - s.wins) }, (_, x) => x).find((x) => isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null, losses: x })) ?? Math.max(0, s.day - 1 - s.wins - MAX_RUN_DRAWS);

/** Z-BUMP (the flip): a record of dusk `day` that only a run which had its LAST CHANCE carries (reachable, but not with
 *  lastChance null): the first day whose LAST CHANCE the record model accepts for it; null for a record a plain run carries. */
const lastChanceDayFor = (day: number, wins: number, lives: number): number | null => {
  if (isReachable(day, wins, lives, { lastChance: null })) return null;
  return Array.from({ length: MAX_DAY - 1 }, (_, i) => i + 1).find((d) => isReachable(day, wins, lives, { lastChance: d })) ?? null;
};
/** Z-BUMP: the records only a LAST CHANCE reaches, with the LAST CHANCE day each goes up with (the model's first).
 *  HULL-ON (the flip, HEARTS): the hearts model's 17 (was the 13 below): still 1 heart at dusks 7-10, LAST CHANCE first
 *  on day 6 (six losses: 1+1+1+2+2+2 = 9 of 10 hearts), on day 7 with up to 5 dusks lost before (a day-7 loss costs 3),
 *  and on day 9 for d10 6W (three day-7+ losses). */
const LAST_CHANCE_RECORDS = [
  "d7 0W 1L @6", "d8 0W 1L @6", "d8 1W 1L @6", "d8 2W 1L @7", "d9 0W 1L @6", "d9 1W 1L @6", "d9 2W 1L @6",
  "d9 3W 1L @7", "d10 0W 1L @6", "d10 1W 1L @6", "d10 2W 1L @6", "d10 3W 1L @6", "d10 4W 1L @7",
];
// BUMP-1D (HEART_COSTS [1,2,2], measured with the long run's model and with the 10-day hearts model alike): 13 (was the 17 above on [1,2,3]: gone
// d8 3W, d9 4W, d10 5W and d10 6W, which a day-7+ loss costing 3 had put on 1 heart)
/** HULL-ON (the flip, HEARTS): the 5-lives model's 13 (HEARTS off), as Z-BUMP pinned them. */
const LAST_CHANCE_RECORDS_OFF = [
  "d7 0W 1L @5", "d8 0W 1L @5", "d8 1W 1L @5", "d8 2W 1L @6", "d9 0W 1L @5", "d9 1W 1L @5", "d9 2W 1L @5", "d9 3W 1L @6",
  "d10 0W 1L @5", "d10 1W 1L @5", "d10 2W 1L @5", "d10 3W 1L @5", "d10 4W 1L @6",
];
/** Z-BUMP: the seed ghosts (hero, day, wins, lives) whose label only a LAST CHANCE reaches: a plain upload of each gets the
 *  record 422 (generateSamplePool() at this commit; sorted).
 *  HULL-ON (the flip, HEARTS): the pool's labels are hearts labels (samplePool.ts drawnLabel), so 24 (was 22, read from
 *  the run's diff): + bastion d10 4W, foundry d9 4W, furnace d10 5W (a day-7+ loss costs 3, so more wins still fall to 1
 *  heart); - one weaver d7 0W (its drawn losses, 1 or 2 hearts each on days 1-6, leave it more than 1 heart).
 *  BUMP-1D: was 24, now 61 (LONG_RUN ships on): the committed 192-ghost long-run pool (days 1-16, each ghost states its own `losses`, which
 *  POST holds its record to) holds 61 ghosts on 1 heart, and these are exactly they (the 24 of the 120-ghost pool were its 1-heart ghosts
 *  too). The hearts model gives 1 heart only to a run whose LAST CHANCE has fired (the first loss that leaves 1 heart or fewer sets the
 *  hearts to 1, once a run, on any day: records.ts longStates), and a seed ghost carries no lastChance, so a plain upload of each is no
 *  record; the other 131 are on 2 hearts or more, which a run without a LAST CHANCE carries with the ghost's losses. 19 of the 61 sit at
 *  dusks 7-10 (5 fewer than the 24: the same ghosts' drawn losses leave bastion d10 4W and one of its d10 0W, foundry d9 4W, furnace d8 2W
 *  and furnace d10 5W on 4, 2, 2, 2 and 2 hearts now that a day-7+ loss costs 2 hearts, was 3) and 42 at dusks 11-16 (8, 4, 9, 6, 5, 10).
 *  BUMP-1E (the regenerated pools, R3 04fab9a: the committed seed pool, server/seedPoolData.ts, rules bb-0.12.0): 60 (was 61): the same list less
 *  "weaver d10 3W 1L": the regenerated pool's weaver d10 variant 1 ghost is 6W on 4 hearts with 3 losses (was 3W on 1 heart with 5), so 18 of the 60 sit at
 *  dusks 7-10 (was 19) and 42 at dusks 11-16 (unchanged); counted off the committed file (60 of its 192 ghosts state 1 heart) as well as off generateSamplePool().
 *  BUMP-1H (P6; the committed seed pool, server/seedPoolData.ts at bcfc5595: 230 ghosts, the 192 and the CURVE's 24 streak and 14 depth ghosts): 66 (was 60): the same list plus six of the DEPTH ghosts, all FURNACE's, whose
 *  records carry many losses: day 11 1W (slot 1-6), day 14 5W (5-7), day 15 8W twice (8-6) and day 16 8W twice (8-6); the 24 streak ghosts (6-0 .. 9-2) and the other 8 depth ghosts are on 2 hearts or more. */
const LAST_CHANCE_SEEDS = [
  "bastion d10 0W 1L", "bastion d11 0W 1L", "bastion d11 3W 1L", "bastion d12 0W 1L", "bastion d13 0W 1L", "bastion d13 0W 1L", "bastion d13 1W 1L",
  "bastion d14 0W 1L", "bastion d14 4W 1L", "bastion d14 5W 1L", "bastion d15 0W 1L", "bastion d16 0W 1L", "bastion d16 3W 1L", "bastion d16 6W 1L",
  "bastion d7 0W 1L", "bastion d8 0W 1L", "bastion d9 0W 1L",
  "foundry d10 0W 1L", "foundry d11 0W 1L", "foundry d11 0W 1L", "foundry d12 0W 1L", "foundry d13 0W 1L", "foundry d13 1W 1L", "foundry d14 0W 1L",
  "foundry d15 0W 1L", "foundry d15 8W 1L", "foundry d16 0W 1L", "foundry d16 6W 1L", "foundry d7 0W 1L", "foundry d8 0W 1L", "foundry d9 0W 1L",
  // BUMP-1H: + "furnace d11 1W 1L", "furnace d14 5W 1L", "furnace d15 8W 1L" (twice) and "furnace d16 8W 1L" (twice) (see above)
  "furnace d10 0W 1L", "furnace d11 0W 1L", "furnace d11 0W 1L", "furnace d11 1W 1L", "furnace d12 0W 1L", "furnace d13 0W 1L", "furnace d13 1W 1L", "furnace d14 0W 1L", "furnace d14 5W 1L",
  "furnace d15 0W 1L", "furnace d15 8W 1L", "furnace d15 8W 1L", "furnace d16 0W 1L", "furnace d16 1W 1L", "furnace d16 8W 1L", "furnace d16 8W 1L", "furnace d7 0W 1L", "furnace d7 0W 1L", "furnace d8 0W 1L", "furnace d9 0W 1L", "furnace d9 0W 1L",
  "weaver d10 0W 1L", "weaver d11 0W 1L", "weaver d11 1W 1L", "weaver d12 0W 1L", "weaver d13 0W 1L", "weaver d13 2W 1L", "weaver d14 0W 1L", // BUMP-1E: - "weaver d10 3W 1L" (see above)
  "weaver d15 0W 1L", "weaver d16 0W 1L", "weaver d16 2W 1L", "weaver d16 8W 1L", "weaver d7 0W 1L", "weaver d8 0W 1L", "weaver d9 0W 1L",
];

/** The brief's unreachable records the decoder takes: [day, wins, lives]. The first is backlog 325's example. */
const UNREACHABLE: readonly [number, number, number][] = [
  [1, 0, 1], [1, 0, 4], [2, 1, 4], [3, 0, 3], [3, 1, 4], [2, 0, 6], [10, 9, 1],
];

describe("H2: the records the check refuses and takes (pure)", () => {
  it("the seven unreachable records pass the strict decoder with an honest deck of their day, and isReachable refuses each", () => {
    for (const [day, wins, lives] of UNREACHABLE) {
      // BUMP-1D: + losses 0: the pool deck states its OWN dusks lost (a bb-0.11.0 seed ghost), which the row's record may not fit (the strict
      // decoder: "snapshot.losses: expected an integer in 0..0" at day 2 with 1 win); 0 fits every row (wins <= day - 1)
      const s = { ...deckOf(day), wins, lives, losses: 0 };
      expect(validateUpload(s.build, day), `d${day}`).toEqual({ ok: true, errors: [] });
      expect(decodeSnapshot(encodeSnapshot(s)), `d${day} ${wins}W ${lives}L`).toEqual(s);
      expect(isReachable(day, wins, lives), `d${day} ${wins}W ${lives}L`).toBe(false);
    }
    expect(recordError(1, 0, 1)).toBe("record: 0W 1 lives is no record a run carries into dusk 1");
  });

  // Z-BUMP (the flip): 172 (was 178, the model without LAST CHANCE, which rules before it still read: 178)
  it("each day's floorRecord is reachable; 307 reachable records over days 1-10 (BUMP-1D: was 172)", () => {
    for (let day = 1; day <= MAX_DAY; day++) {
      const f = floorRecord(day);
      expect(isReachable(day, f.wins, f.lives), `d${day}`).toBe(true);
    }
    const count = (opts: Parameters<typeof reachableRecords>[1]) => Array.from({ length: MAX_DAY }, (_, i) => reachableRecords(i + 1, opts).length).reduce((a, b) => a + b);
    // HULL-ON (the flip, HEARTS): 172 -> 324, the hearts model's (this build's rules); with HEARTS off, 172 as before
    // BUMP-1D (LONG_RUN ships on; HEART_COSTS [1,2,2]): 307 over dusks 1-10 (measured), the long run's model (records.ts longRunRecords) under this
    // build's rules; the 10-day hearts model (switch off) reads 307 too now that a lost dusk costs 1/2/2 hearts (was 324 on 1/2/3); with the
    // switch off and HEARTS off, the 5-lives model's 172 as before (the long run's model comes first, so HEARTS off is read in the 10-day world)
    expect(count({})).toBe(307);
    expect(withLongRun(() => count({}), false)).toBe(307);
    expect(withLongRun(() => withHearts(() => count({}), false), false)).toBe(172);
    expect(count({ rules: "bb-0.9.1" })).toBe(178); // a record under rules before LAST CHANCE: the model before the flip
    // the 13 only a LAST CHANCE reaches (a plain run, lastChance null, carries the other 159), each with the model's first day
    // HULL-ON (the flip, HEARTS): 17 and 307 on hearts (LAST_CHANCE_RECORDS); with HEARTS off, the 13 and 159 as before
    // BUMP-1D: 13 LAST CHANCE-only records on the 1/2/2 hearts (was 17 on 1/2/3) and 294 for a plain run (was 307)
    expect(count({ lastChance: null })).toBe(294);
    expect(withLongRun(() => count({ lastChance: null }), false)).toBe(294);
    expect(withLongRun(() => withHearts(() => count({ lastChance: null }), false), false)).toBe(159);
    const only = (): string[] => {
      const out: string[] = [];
      for (let day = 1; day <= MAX_DAY; day++) {
        for (const { wins, lives } of reachableRecords(day)) {
          const lc = lastChanceDayFor(day, wins, lives);
          if (lc !== null) out.push(`d${day} ${wins}W ${lives}L @${lc}`);
        }
      }
      return out;
    };
    expect(only()).toEqual(LAST_CHANCE_RECORDS);
    expect(withLongRun(only, false)).toEqual(LAST_CHANCE_RECORDS); // BUMP-1D: the 10-day hearts world on 1/2/2 hearts: the same 13
    expect(withLongRun(() => withHearts(only, false), false)).toEqual(LAST_CHANCE_RECORDS_OFF);
  });
});

describe.each(storeBackends())("H2: POST /v1/ghosts and the record on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity, other: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(2);
    other = await testIdentity(1);
    // BUMP-1D: 192 = 4 heroes x days 1-16 x 3 variants (the long run's seed pool), was 120 (days 1-10)
    // BUMP-1H: 230 = those 192 + the CURVE's 24 streak and 14 depth ghosts (server/seedPoolData.ts at bcfc5595), was 192
    expect(await seedStore(app.store)).toMatchObject({ rules: RULES_VERSION, entries: 230, written: 230 });
  }, 180_000);
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  let k = 0;
  /** `s` as `me` uploads it from a run of its own (a fresh runId and time, so each POST is a new ghost unless resent).
   *  HULL-ON (the flip, PICK): without the seed step's grade, which every pool deck carries with PICK on and no upload
   *  does (POST: 422 "grade: only the seed pool's ghosts carry a grade"): the deck as a player's run uploads it. */
  // BUMP-1D (LONG_RUN ships on): and with the `losses` of a run that reaches the row's record (lossesFor; `stamp` false: the seed ghost's own
  // stated losses stay), as a long run's upload states them (the pool deck's own `losses` fit the row's record only by chance)
  const mine = (s: GhostSnapshot, stamp = true): GhostSnapshot => {
    const { grade: _grade, ...plain } = s;
    const row = { ...plain, runId: `h2-${backend.name}-${k}`, createdAt: 1_790_200_000_000 + k++ };
    return ownedBy(stamp ? { ...row, losses: lossesFor(row) } : row, me);
  };
  const send = async (body: string, headers: Record<string, string>) => {
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers, body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
  };
  const post = async (s: GhostSnapshot, signer: Identity = me) => {
    const body = encodeSnapshot(s);
    return send(body, await signedHeaders(signer, body));
  };
  /** Signed raw JSON, for bodies encodeSnapshot itself refuses (it checks what it encodes). */
  const postRaw = async (o: unknown) => {
    const body = JSON.stringify(o);
    return send(body, await signedHeaders(me, body));
  };
  /** Everything a POST could have changed: health's count, the store's own listing, its records, the bucket's objects. */
  const state = async () => {
    const listing: string[] = [];
    for (let day = 1; day <= MAX_DAY; day++) for (const e of await app.store.bucket(RULES_VERSION, day, "all")) listing.push(e.id);
    const health = (await (await fetch(`${base}/v1/health`)).json()) as { ghosts: number };
    const objects = backend.name === "tigris" ? (await (app.store as TigrisStore).s3.listAll("")).map((o) => o.key).sort() : null;
    return { ghosts: health.ghosts, size: app.store.size, listing: listing.sort(), records: backend.storedRecords(), objects };
  };

  it("refuses every unreachable record the decoder takes: 422 with the record error that names the record and the day; nothing is stored", async () => {
    const before = await state();
    for (const [day, wins, lives] of UNREACHABLE) {
      const s = mine({ ...deckOf(day), wins, lives });
      const r = await post(s);
      expect(r, `d${day} ${wins}W ${lives}L`).toEqual({ status: 422, body: { error: recordError(day, wins, lives, s.losses) } }); // BUMP-1D: + the stated losses (0 for a record no run reaches)
      expect(await state(), `d${day} ${wins}W ${lives}L: the store is unchanged`).toEqual(before);
      expect((await app.store.bucket(RULES_VERSION, day, "all")).some((e) => e.id === ghostId(s))).toBe(false);
    }
    // backlog 325's example, word for word
    const ex = await post(mine({ ...deckOf(1), wins: 0, lives: 1 }));
    // BUMP-1D: and the long run's upload states its losses (0), which the error names (was "record: 0W 1 lives is no record a run carries into dusk 1")
    expect(ex).toEqual({ status: 422, body: { error: "record: 0W 1 lives and 0 losses is no record a run carries into dusk 1" } });
    expect(await state()).toEqual(before);
  });

  // Z-BUMP (the flip): 172 (was 178). A record only a LAST CHANCE reaches (13, LAST_CHANCE_RECORDS; the floorRecord of
  // dusks 7-10 among them) goes up as the run that carries it uploads it: with its LAST CHANCE (the model's first day for
  // it, the HULL card: always offered, its LAST_CHANCE_HULL on the deck as takeLastChance puts it there): 201. Plainly it
  // gets the record 422, word for word, and nothing is stored
  it("takes every reachable record of every day 1-10 (each day's floorRecord included): 201, stored once each", async () => {
    let n = 0;
    const withLastChance: string[] = [];
    for (let day = 1; day <= MAX_DAY; day++) {
      const recs = reachableRecords(day);
      expect(recs).toContainEqual(floorRecord(day));
      for (const { wins, lives } of recs) {
        const before = await state();
        const deck = deckOf(day);
        const lcDay = lastChanceDayFor(day, wins, lives);
        let s = mine({ ...deck, wins, lives });
        if (lcDay !== null) {
          expect(await post(s), `d${day} ${wins}W ${lives}L plain`).toEqual({ status: 422, body: { error: recordError(day, wins, lives, s.losses) } });
          expect(await state(), `d${day} ${wins}W ${lives}L plain: the store is unchanged`).toEqual(before);
          s = mine({ ...deck, wins, lives, build: { ...deck.build, hullBonus: deck.build.hullBonus + LAST_CHANCE_HULL }, lastChance: { day: lcDay, boon: "hull" } });
          withLastChance.push(`d${day} ${wins}W ${lives}L @${lcDay}`);
        }
        const r = await post(s);
        expect(r, `d${day} ${wins}W ${lives}L${lcDay !== null ? ` LAST CHANCE ${lcDay}` : ""}`).toEqual({ status: 201, body: { id: ghostId(s) } });
        const after = await state();
        expect([after.ghosts, after.size, after.records], `d${day} ${wins}W ${lives}L`).toEqual([before.ghosts + 1, before.size + 1, before.records + 1]);
        expect(after.listing).toEqual([...before.listing, ghostId(s)].sort());
        if (before.objects) expect(after.objects!.length).toBe(before.objects.length + 1);
        n++;
      }
    }
    expect(n).toBe(307); // HULL-ON (the flip, HEARTS): the hearts model's 324 (was 172), its 17 LAST CHANCE-only (was 13); BUMP-1D: 307 and 13 (1/2/2 hearts, the long run's model)
    expect(withLastChance).toEqual(LAST_CHANCE_RECORDS);
  }, 120_000);

  it("keeps the order: closed 403, signing 401, decode 400, playerId 403, rules 422, deck 422, then the record 422", async () => {
    const before = await state();
    const bad = mine({ ...deckOf(3), wins: 0, lives: 3 }); // unreachable at dusk 3 (the refund gives a life back)
    expect(isReachable(3, 0, 3)).toBe(false);
    // closed: 403 before the body is read (a second server, uploads closed, over fresh storage)
    const closed = backend.server({ uploads: "closed", log: () => {}, rateLimit: { windowMs: 60_000, max: 1000 } }, true);
    const closedBase = `http://127.0.0.1:${await closed.listen(0)}`;
    const body = encodeSnapshot(bad);
    const c = await fetch(`${closedBase}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    expect([c.status, ((await c.json()) as { error: string }).error]).toEqual([403, "uploads are not open yet"]);
    await closed.close();
    // signing: unsigned, then a signature over other bytes
    expect((await send(body, { "content-type": "application/json" })).status).toBe(401);
    expect((await send(body, await signedHeaders(me, `${body} `))).status).toBe(401);
    // decode: a record the decoder bounds keeps its 400 (wins at most day - 1, lives 1..9), as does an unknown field
    // HULL-ON (the flip, HEARTS): the lives bound under this build's rules is 10 (livesCapFor), so 10 -> 11, the first
    // past it (0W 10 hearts at dusk 3 is a record: two draws); with HEARTS off, 10 is past the bound as before
    // BUMP-1D (LONG_RUN ships on): the 5-lives bound is the 10-day world's (switch off, HEARTS off), whose snapshot states no `losses`
    const { losses: _lost, ...tenHearts } = mine({ ...deckOf(3), wins: 0, lives: 10 });
    expect(() => withLongRun(() => withHearts(() => decodeSnapshot(JSON.stringify(tenHearts)), false), false)).toThrow(/^snapshot\.lives: /);
    for (const [day, wins, lives, field] of [[1, 1, 5, "wins"], [3, 0, 0, "lives"], [3, 0, 11, "lives"], [3, 3, 5, "wins"]] as const) {
      const r = await postRaw(mine({ ...deckOf(day), wins, lives }));
      expect(r.status, `d${day} ${wins}W ${lives}L`).toBe(400);
      expect(r.body.error, `d${day} ${wins}W ${lives}L`).toMatch(new RegExp(`^snapshot\\.${field}: `));
    }
    expect((await postRaw({ ...bad, extra: 1 })).status).toBe(400);
    // playerId: another player's id under my key
    expect((await post({ ...bad, playerId: other.playerId })).status).toBe(403);
    // rules: a bb-0.6.2 FURNACE snapshot with an unreachable record meets the rules 422 (what a 0.7.0 page meets)
    // FLIP-X2: the seed pool's decks now hold their day's runes (v3, with a seed) and bb-0.6.2 predates runes (bb-0.8.7),
    // so the 0.7.0 page's snapshot is the deck as it sends it: rune-less v2, no seed (was { ...bad, rules: "bb-0.6.2" })
    // SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): deckOf(3) is FURNACE d3 variant 1 now, a
    // par-field run's dusk deck holding sustain pieces (WARD BELL, MEND PRESS, MENDING LOOM: bb-0.9.0 on), which no 0.7.0
    // page sent, so the page's snapshot carries the first FURNACE day-3 seed deck the bb-0.6.2 gate takes, with bad's record
    // and ids (was runeless(bad): "rules bb-0.6.2 predate bb-0.9.0: sustain pieces" at encodeSnapshot)
    const deck062 = POOL.find((s) => s.hero === "furnace" && s.day === 3 && rulesGateProblem("bb-0.6.2", runeless(s).build) === null)!;
    const old = await post({ ...runeless({ ...bad, build: deck062.build }), rules: "bb-0.6.2" });
    expect(old).toEqual({ status: 422, body: { error: `rules bb-0.6.2 not accepted: this server validates ${RULES_VERSION}` } });
    // deck: over the player ceiling with an unreachable record: the deck's 422 and its errors
    const rich = await post({ ...bad, build: { ...bad.build, hullBonus: bad.build.hullBonus + 5000 } }); // NUM-1: hull x10 (was + 500)
    expect([rich.status, rich.body.error]).toEqual([422, "deck failed validation"]);
    expect(rich.body.errors!.join()).toMatch(/budget/);
    // and only then the record
    expect(await post(bad)).toEqual({ status: 422, body: { error: recordError(3, 0, 3, bad.losses) } }); // BUMP-1D: + the stated losses
    expect(await state()).toEqual(before);
  });

  it("a resend of a stored ghost still gets 200 with its id; a ghost planted past POST with an unreachable record gets the record 422 on a resend, and the store keeps its one copy", async () => {
    // HULL-ON (the flip, HEARTS): 2W 3 lives -> 2W 8 hearts (two dusks lost on days 1-3, a heart each): 2W 3 is no hearts
    // record at dusk 5 (two losses cost at most 1 + 2); with HEARTS off, 2W 3 lives as before
    const s = mine({ ...deckOf(5), wins: 2, lives: 8 });
    expect(isReachable(5, 2, 8)).toBe(true);
    expect([isReachable(5, 2, 3), withLongRun(() => withHearts(() => isReachable(5, 2, 3), false), false)]).toEqual([false, true]); // BUMP-1D: the 5-lives model is the 10-day world's (the long run's model comes first)
    const before = await state();
    expect(await post(s)).toEqual({ status: 201, body: { id: ghostId(s) } });
    expect(await post(s)).toEqual({ status: 200, body: { id: ghostId(s) } }); // a fresh signature over the same bytes
    const once = await state();
    expect([once.size, once.records]).toEqual([before.size + 1, before.records + 1]);
    // stored before this check (or planted by an admin): exactly as a POST stored it
    const planted = mine({ ...deckOf(6), wins: 5, lives: 1 });
    expect(isReachable(6, 5, 1)).toBe(false);
    const { id, created } = await app.store.add(decodeSnapshot(encodeSnapshot(planted)));
    expect([id, created]).toEqual([ghostId(planted), true]);
    const held = await state();
    expect(await post(planted)).toEqual({ status: 422, body: { error: recordError(6, 5, 1, planted.losses) } }); // BUMP-1D: + the stated losses
    expect(await state()).toEqual(held);
  });

  // Z-BUMP (the flip): the pool's labels are the record model's with LAST CHANCE (all 120 reachable with or without one, as
  // server/seed.ts checkPool reads them), but a seed ghost carries no lastChance, so POST reads each as a plain run's: the
  // 98 a plain run carries are taken (201) and stored (was all 120); the 22 whose label only a LAST CHANCE reaches
  // (LAST_CHANCE_SEEDS: 1 life at dusks 7-10) get the record 422, word for word, and are not stored
  // BUMP-1D (LONG_RUN ships on): the pool is the 192-ghost long-run pool (was 120), each ghost stating its own `losses` (the record is held to
  // exactly those, `mine(s, false)` keeps them): the 131 a plain run carries (2 hearts or more) are taken (201) and stored (was 96 of 120); the
  // 61 on 1 heart (LAST_CHANCE_SEEDS: a run is at 1 heart only after its LAST CHANCE, and a seed ghost carries none; dusks 7-16, was 24 at
  // dusks 7-10) get the record 422, word for word, naming the ghost's losses, and are not stored
  // BUMP-1E (the regenerated pools, R3 04fab9a; the rules label): the committed pool is bb-0.12.0's (was "bb-0.11.0 seed ghosts"), and its 1-heart ghosts are 60 (was 61:
  // weaver d10 3W 1L is gone, see LAST_CHANCE_SEEDS), so 132 a plain upload carries are taken (was 131) and 60 get the record 422 (was 61), 192 - 60 = 132
  // BUMP-1H (P6): was "all 192 bb-0.12.0 seed ghosts (...), ...: the 132 a plain upload carries are taken (201) and stored, the 60 only a LAST CHANCE reaches get the record 422" (the committed pool is bb-0.15.0's, 230 ghosts: 164 taken, 66 refused)
  it("all 230 bb-0.15.0 seed ghosts (generateSamplePool(), the committed long-run pool: days 1-16, the 192 and the CURVE's 38), posted as one player's signed dusks: the 164 a plain upload carries are taken (201) and stored, the 66 only a LAST CHANCE reaches get the record 422", async () => {
    expect(POOL).toHaveLength(230); // BUMP-1H: was 192 (the CURVE's 24 streak and 14 depth ghosts follow the 192: 230). BUMP-1D: 4 heroes x days 1-16 x 3 variants (was 120)
    expect(POOL.filter((s) => !isReachable(s.day, s.wins, s.lives, { losses: s.losses })).map((s) => `${s.hero} d${s.day} ${s.wins}W ${s.lives}L`)).toEqual([]);
    const before = await state();
    const statuses: Record<number, number> = {};
    const refused: string[] = [];
    for (const s of POOL) {
      const r = await post(mine(s, false)); // BUMP-1D: a seed ghost states its own losses (the pool's), they are not re-derived
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      const what = `${s.hero} d${s.day} ${s.wins}W ${s.lives}L`;
      if (isReachable(s.day, s.wins, s.lives, { lastChance: null, losses: s.losses })) expect(r.status, `${what}: ${JSON.stringify(r.body)}`).toBe(201);
      else {
        expect(r, what).toEqual({ status: 422, body: { error: recordError(s.day, s.wins, s.lives, s.losses) } });
        refused.push(what);
      }
    }
    expect(refused.sort()).toEqual(LAST_CHANCE_SEEDS);
    // HULL-ON (the flip, HEARTS): 96 taken and 24 refused (were 98 and 22), the hearts pool's (LAST_CHANCE_SEEDS)
    // BUMP-1D: 131 taken and 61 refused (was 96 and 24 of 120): the 192-ghost long-run pool, 192 - 61 = 131 (LAST_CHANCE_SEEDS holds the 61)
    // BUMP-1E: 132 taken and 60 refused (was 131 and 61): the regenerated seed pool (R3), 192 - 60 = 132 (LAST_CHANCE_SEEDS holds the 60)
    // BUMP-1H: 164 taken and 66 refused (was 132 and 60 of 192): the 230-ghost pool, 230 - 66 = 164 (LAST_CHANCE_SEEDS holds the 66)
    expect(statuses).toEqual({ 201: 164, 422: 66 });
    const after = await state();
    expect([after.ghosts - before.ghosts, after.records - before.records]).toEqual([164, 164]); // BUMP-1H: was [132, 132]. BUMP-1D: was [96, 96]; BUMP-1E: was [131, 131]
  }, 120_000);
});
