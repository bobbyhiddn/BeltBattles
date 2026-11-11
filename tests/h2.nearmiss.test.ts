// 0.8.0 H2 M1b (REQ-BFG-009, REQ-BFG-016; the Prime's 0.8.x-11, VERIFIED-RC F1): near-miss rules strings are refused
// and never stored. The server's rules check is string equality with RULES_VERSION (bb-0.8.0 when H2 wrote this; BELTS's
// bb-0.8.3 now: the near misses below still miss it, with the same answers, and tests/belts.rules.test.ts adds bb-0.8.3's
// own, bb-0.8.0 first); a check loosened to compare only "bb-0.8" (the Prime's mutant CM2) let bb-0.8.1 in while every
// test stayed green. On both stores (tests/netStores.ts), uploads open in-process, each near miss goes up signed, on
// three decks, with a reachable record:
//  - a FURNACE deck with no turret and no join (the decoder's rules gate has nothing to refuse, and FURNACE travels under
//    any rules), so every near miss the decoder's pattern takes meets the server's exact check: 422;
//  - a FURNACE deck with turrets and a join: rules the gate can't read as bb-MAJOR.MINOR.PATCH get 400 at the decoder;
//  - a FOUNDRY deck: rules below bb-0.8.0 or unreadable carry FURNACE and WEAVER only (RULES_HEROES): 400 at the decoder.
// " bb-0.8.0" and "bb-0.8.0 " fail the decoder's rules pattern on every deck: 400. Nothing is stored under any of them:
// health's count, the store's records, every Tigris object, and the near miss's own bucket stay as they were, and the
// match route has no ghost for it (404).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RULES_VERSION, START_LIVES } from "../src/sim/content";
import { parseRules, rulesAtLeast } from "../src/net/rulesGate";
import { encodeSnapshot, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { isReachable } from "../src/net/records";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import type { TigrisStore } from "../server/tigrisStore";
import { raceDeck, softPicked } from "../tools/samplePool"; // SOFT-1 (REQ-BFG-092): + softPicked
import { generateSamplePool } from "./helpers/poolCache"; // CACHE-1: the cached twin
import { withFreeJoins } from "../src/sim/freeJoins"; // HULL-ON (the flip, FREE_JOINS): the FOUNDRY deck's join
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const POOL = generateSamplePool();
const plainOf = (s: GhostSnapshot) => !s.build.turrets?.length && !s.build.routes.some((r) => r.join !== undefined);
const twoFeatures = (s: GhostSnapshot) => !!s.build.turrets?.length && s.build.routes.some((r) => r.join !== undefined);
const DECKS: Record<"plain" | "turretsJoin" | "foundry", GhostSnapshot> = {
  plain: POOL.find((s) => s.hero === "furnace" && plainOf(s))!,
  // BUMP-1D (LONG_RUN ships on): and whose record a plain upload carries (a seed ghost has no lastChance; under bb-0.11.0 the server reads the
  // record with its stated `losses`): the first furnace deck with both, d13 1W 1 heart after 7 losses, needs a LAST CHANCE or a PATCH UP
  // (422 "record: 1W 1 lives and 7 losses is no record a run carries into dusk 13" on this build's own rules string); was the first with both
  // BUMP-1D run 4 (RULING-BUMP-R3 R3.4 (b)): and of days 1-10 (`s.day <= 10`). The committed pool (server/seedPoolData.ts) holds days 1-16 now (192 ghosts) and
  // this pick ran over all of it; but every near miss but one (bb-1.8.0) is an older rules string than bb-0.11.0, which reads the 10-day run, and the decoder bounds a
  // snapshot's day by its rules (snapshot.ts checkSnapshot: int(day, 1, maxDayFor(rules)), MAX_DAY 10 below bb-0.11.0, LONG_RUN_MAX_DAY 25 from it), BEFORE the rules gate,
  // the hero gate and the server's exact check these tests are about: a day 11-16 deck gets 400 "snapshot.day: expected an integer in 1..10" on bb-0.8.1 (measured: the
  // furnace d14 8W 2 hearts deck this pick took first: 400, expected 422). The 10-day span is what the test means (it was the pool's whole span when it was written).
  // The pick is the furnace floor ghost of day 6 now (pool index 69: 0W 3 hearts after 5 losses, 1 turret, 1 join); was the first of any day (the d14 ghost, index 13)
  turretsJoin: POOL.find((s) => s.hero === "furnace" && s.day <= 10 && twoFeatures(s) && isReachable(s.day, s.wins, s.lives, { lastChance: null, losses: s.losses }))!,
  foundry: POOL.find((s) => s.hero === "foundry")!,
};

/** The brief's five near misses, then a few more of the same kind. */
const NEAR = ["bb-0.8.1", "bb-0.8.0x", "bb-0.8", "BB-0.8.0", " bb-0.8.0", "bb-0.8.0 ", "bb-0.8.00", "bb-0.08.0", "bb-0.8.10", "bb-0.8.0.1", "bb-0.7.9", "bb-1.8.0", "bb_0.8.0"];
const PATTERN_OK = (r: string) => /^[A-Za-z0-9._-]{1,32}$/.test(r); // src/net/snapshot.ts RULES_PATTERN

/** What each near miss gets on each deck, from the decoder's rules (the pattern, the gate, RULES_HEROES), then the
 *  server's exact check. */
function expected(rules: string, deck: keyof typeof DECKS): { status: number; error: RegExp } {
  if (!PATTERN_OK(rules)) return { status: 400, error: /^snapshot\.rules: / };
  const readable = parseRules(rules) !== null;
  if (deck === "turretsJoin" && !readable) return { status: 400, error: /^snapshot\.rules: rules ".*" is not a bb-MAJOR\.MINOR\.PATCH version: turret slots/ };
  // HULL-ON (the flip, FREE_JOINS): the FOUNDRY deck (the par player's dusk deck, tools/samplePool.ts raceDeck) carries a
  // belt join now (the par player plans joins with no join pace and no limit), so under rules the gate can't read, the
  // decoder's first failing check on it is the rules gate's, as on the turrets-and-join deck (was the hero gate's: the
  // deck carried no join). Same status (400); the hero gate still answers bb-0.7.9 on it (readable, below bb-0.8.0)
  // BUMP-1D: this branch had gone dormant when SOFT-1's pick held no join; the 16-day table's day-1 pick holds one again (see the pure test), so it answers
  // the unreadable rules strings on the FOUNDRY deck once more
  if (deck === "foundry" && !readable && DECKS.foundry.build.routes.some((r) => r.join !== undefined)) {
    return { status: 400, error: /^snapshot\.rules: rules ".*" is not a bb-MAJOR\.MINOR\.PATCH version: belt joins/ };
  }
  // the hero gate's threshold: FOUNDRY travels from bb-0.8.0 on (rulesGate.ts HEROES_RULES), under BELTS's rules too
  if (deck === "foundry" && !rulesAtLeast(rules, "bb-0.8.0")) return { status: 400, error: /^snapshot\.hero: rules .* accept only FURNACE, WEAVER, not FOUNDRY$/ };
  // BUMP-1D: the server names this build's rules, bb-0.11.0 (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7)
  return { status: 422, error: new RegExp(`^rules ${rules.replace(/[.]/g, "\\.")} not accepted: this server validates bb-0\\.16\\.0$`) }; // BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the server's message): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0\\.13\\.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the server names bb-0.13.0 (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0).
}

/** FLIP-X2: the pool decks now hold their day's runes (v3, with a run seed), and rules before bb-0.8.7 (or unreadable)
 *  refuse a deck holding runes at the decoder (400). A near miss is a pre-rune client's rules string on its deck, so the
 *  deck goes up as that client sends it: rune-less v2, no seed (was the pool deck itself), and meets the gates and the
 *  exact rules check as before. AZ-BUMP (the flip, NPC_DAY; REVIEW-PARAZ N3): with NPC_DAY on a seed ghost also carries its
 *  run's road log (`road`, v3 only: "snapshot.road: not allowed in a v2 snapshot"), which a pre-rune client never sent, so
 *  the copy drops it too.
 *  HULL-ON (the flip, PICK): with PICK on a seed ghost carries its grade (snapshot.grade, v3 only, and refused under rules
 *  before PICK_RULES), which no client ever sends: the copy drops it too. HULL-ON (the flip, HEARTS): the pool's records
 *  are on 10 hearts now, but under a near miss's rules (any rules before bb-0.10.0) a run has 5 lives, and the decoder
 *  bounds lives by the rules (livesCapFor: 1..9 there; 10 got 400 "snapshot.lives" before the check the near miss is
 *  about), so the copy carries its record on that scale: at most START_LIVES (a day-1 deck's 5, as before the flip). */
function runeless(s: GhostSnapshot): GhostSnapshot {
  const out: GhostSnapshot = { ...s, v: SNAPSHOT_VERSION, build: { ...s.build } };
  delete out.seed;
  delete out.road; // AZ-BUMP (the flip, NPC_DAY): the road log is v3 only, as the runes and the seed
  delete out.grade; // HULL-ON (the flip, PICK): the seed step's grade, v3 only (no client uploads one)
  delete out.losses; // BUMP-1D (LONG_RUN ships on): the seed ghost states its dusks lost (bb-0.11.0), which an older client never sends and a v2 snapshot cannot hold ("snapshot.losses: not allowed in a v2 snapshot": 400 on "bb-0.8.1" plain, was 422)
  out.lives = Math.min(s.lives, START_LIVES); // HULL-ON (the flip, HEARTS): an older rules string's 5-lives scale
  delete out.build.runes;
  // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), the regenerated pool on bb-0.13.0 holds enchantments): and the words (`ench`, `enchDir`, `grow`) of ENCHANT, which no client before bb-0.13.0 sent and
  // the decoder refuses under an older rules string ("snapshot.build.items[i].ench: unknown field", 400, before the exact check this file is about): the copy drops them, as it drops the runes
  const noWords = <P extends object>(list: P[] | undefined): P[] | undefined => list?.map((p) => { const { ench: _e, enchDir: _d, grow: _g, ...rest } = p as Record<string, unknown>; return rest as P; });
  out.build.items = noWords(out.build.items)!;
  if (out.build.turrets) out.build.turrets = noWords(out.build.turrets)!;
  return out;
}

describe("H2 M1b: the near-miss rules strings (pure)", () => {
  it("are all different from RULES_VERSION, and the three decks are honest bb-0.8.3 seed decks with a reachable record", () => {
    expect(RULES_VERSION).toBe("bb-0.16.0") /* BUMP-1I (rules bb-0.15.0 -> bb-0.16.0, the stamped literal): was bb-0.15.0. BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    for (const r of NEAR) expect(r).not.toBe(RULES_VERSION);
    expect(new Set(NEAR).size).toBe(NEAR.length);
    for (const s of Object.values(DECKS)) expect([s.rules, isReachable(s.day, s.wins, s.lives)]).toEqual([RULES_VERSION, true]);
    // the decoder's view of each: the brief's five, and which of them its pattern refuses first
    expect(NEAR.slice(0, 5).map((r) => [r, PATTERN_OK(r), parseRules(r) !== null])).toEqual([
      ["bb-0.8.1", true, true], ["bb-0.8.0x", true, false], ["bb-0.8", true, false], ["BB-0.8.0", true, false], [" bb-0.8.0", false, false],
    ]);
    // HULL-ON (the flip, FREE_JOINS): the FOUNDRY deck is the par player's day-1 deck (raceDeck variant 0), which holds 1
    // join now; with FREE_JOINS off the par player's deck holds none, as before the flip (measured: OPEN_RUNES off or GUARD
    // off leave the join), and the near misses' expected() reads the deck's join
    // SOFT-1: the seed pool softened (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): in the shipped world the FOUNDRY deck is
    // SOFT1_PICKS' day-1 variant 0 (softPicked: the par field's run "f8", still a par player's day-1 deck), which holds no
    // join; expected() reads that, and the statuses below are the same. Outside SOFT1_PICKS' world (FREE_JOINS off) the pool's
    // deck is raceDeck's again, with no join. Was raceDeck("foundry", day, 0).build (the run hashSeed picks, 1 join) and
    // joinsOf toBe(1)
    // BUMP-1D run 4 (RULING-BUMP-R3 R3.4 (b)): SOFT1_PICKS was re-read for days 1-16 (commit 3cd0ea8, BUMP-1D P4 R2; SOFT_TARGET 250, was 400): the
    // FOUNDRY deck is the day-1 variant 0 pick "f10:76156a2a" now (the par field's run 10; was "f8:129e6069"), and that par player's day-1 deck holds 1 join again: the CRUCIBLE's two
    // 6-cell belts and the SCRAPPER's 1-cell belt that joins the first at cell 12 (server/seedPoolData.ts, ghost 96, the committed pool's first
    // FOUNDRY ghost; its variants 1 and 2 hold none). That is what is there, and it is a legal deck, not a defect: FREE_JOINS (no join pace, no
    // limit) is on, a join gates only on rules (bb-0.6.2), and the generator passed the ghost through checkSnapshot, validateBuild's strict rules
    // and validateUpload's player mode with its road log (tools/samplePool.ts seedGhost, which throws on any failure; the seed step re-checks it).
    // expected() reads the deck's join (its belt-joins branch for unreadable rules, live again; the statuses are the same). Was joinsOf toBe(0)
    expect(softPicked("foundry", DECKS.foundry.day)![0].build).toEqual(DECKS.foundry.build);
    const joinsOf = (b: GhostSnapshot["build"]) => b.routes.filter((r) => r.join !== undefined).length;
    // BUMP-1E (R2, 2875b03: SOFT1_PICKS re-read on the regenerated stand-in pool, the pools R1-R3 under bb-0.12.0): the FOUNDRY deck is the day-1 variant 0 pick
    // "f3:c5680d21" now (the par field's run 3; was "f10:76156a2a"), whose day-1 deck holds no join; a different pick, a legal deck all the
    // same (the generator passes every ghost through checkSnapshot and the strict checks, tools/samplePool.ts seedGhost). expected() reads the deck's join, so the near
    // misses' unreadable-rules branch for this deck answers the hero gate's (400 FOUNDRY not accepted) again, and every status below is unchanged
    expect(joinsOf(DECKS.foundry.build)).toBe(0); // BUMP-1E: was toBe(1) (the regenerated pools, R2); BUMP-1D: was toBe(0) (the 10-day table's pick "f8" held no join), then 1
    expect(withFreeJoins(() => joinsOf(raceDeck("foundry", DECKS.foundry.day, 0).build), false)).toBe(0);
    // BUMP-1D run 4 (RULING-BUMP-R3 R3.4 (b)): why DECKS.turretsJoin is bounded at day 10, as a check (new): a furnace deck with both features of the pool's days
    // 11-16 (the one the pick took before the bound) is refused by the decoder under a near miss's older rules (the 10-day run: maxDayFor = MAX_DAY) at the day
    // bound, before any gate this file is about, and is decoded under a long run's rules (bb-1.8.0 reads bb-0.11.0's: the day bound is LONG_RUN_MAX_DAY)
    const deep = POOL.find((s) => s.hero === "furnace" && s.day > 10 && twoFeatures(s) && isReachable(s.day, s.wins, s.lives, { lastChance: null, losses: s.losses }))!;
    expect(deep.day).toBeGreaterThan(10);
    expect(() => encodeSnapshot({ ...runeless(deep), rules: "bb-0.8.1" })).toThrow(/^snapshot\.day: expected an integer in 1\.\.10$/);
    expect(JSON.parse(encodeSnapshot({ ...runeless(deep), rules: "bb-1.8.0" })).day).toBe(deep.day);
  });
});

describe.each(storeBackends())("H2 M1b: near-miss rules strings on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1_000_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(1);
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const state = async () => ({
    ghosts: ((await (await fetch(`${base}/v1/health`)).json()) as { ghosts: number }).ghosts,
    size: app.store.size,
    records: backend.storedRecords(),
    objects: backend.name === "tigris" ? (await (app.store as TigrisStore).s3.listAll("")).map((o) => o.key).sort() : null,
  });

  it("refuses every near miss on every deck, with the status and error its first failing check gives, and stores nothing", async () => {
    const before = await state();
    const seen: Record<string, number[]> = {};
    let k = 0;
    for (const rules of NEAR) {
      for (const deck of Object.keys(DECKS) as (keyof typeof DECKS)[]) {
        const s = ownedBy({ ...runeless(DECKS[deck]), rules, runId: `h2-near-${k}`, createdAt: 1_790_400_000_000 + k++ }, me); // FLIP-X2: runeless (was DECKS[deck])
        const body = JSON.stringify(s); // raw: encodeSnapshot itself refuses what the decoder refuses
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const got = { status: r.status, error: ((await r.json()) as { error: string }).error };
        const want = expected(rules, deck);
        (seen[JSON.stringify(rules)] ??= []).push(got.status);
        expect(got.status, `${JSON.stringify(rules)} on ${deck}: ${got.error}`).toBe(want.status);
        expect(got.error, `${JSON.stringify(rules)} on ${deck}`).toMatch(want.error);
      }
    }
    // the statuses, per near miss: plain FURNACE, FURNACE with turrets and a join, FOUNDRY
    expect(seen).toEqual({
      '"bb-0.8.1"': [422, 422, 422], '"bb-0.8.0x"': [422, 400, 400], '"bb-0.8"': [422, 400, 400], '"BB-0.8.0"': [422, 400, 400],
      '" bb-0.8.0"': [400, 400, 400], '"bb-0.8.0 "': [400, 400, 400], '"bb-0.8.00"': [422, 400, 400], '"bb-0.08.0"': [422, 400, 400],
      '"bb-0.8.10"': [422, 422, 422], '"bb-0.8.0.1"': [422, 400, 400], '"bb-0.7.9"': [422, 422, 400], '"bb-1.8.0"': [422, 422, 422],
      '"bb_0.8.0"': [422, 400, 400],
    });
    expect(await state()).toEqual(before);
    for (const rules of NEAR.filter(PATTERN_OK)) {
      const day = DECKS.plain.day;
      expect(await app.store.bucket(rules, day, "all"), rules).toEqual([]);
      const m = await fetch(`${base}/v1/ghosts/match?rules=${encodeURIComponent(rules)}&day=${day}&wins=0&lives=5&player=near-miss&seen=&runs=3`);
      expect(m.status, rules).toBe(404);
    }
  });

  it("this build's own rules string on the same three decks is taken (201): the refusals above are the rules string's alone", async () => {
    let k = 0;
    for (const deck of Object.keys(DECKS) as (keyof typeof DECKS)[]) {
      // HULL-ON (the flip, PICK): the seed step grades the pool's ghosts (snapshot.grade) and POST refuses a graded upload
      // (422 "grade: only the seed pool's ghosts carry a grade"), so the deck goes up as a player uploads it: ungraded
      const { grade: _grade, ...uploaded } = DECKS[deck];
      const s = ownedBy({ ...uploaded, runId: `h2-near-ok-${k}`, createdAt: 1_790_400_100_000 + k++ }, me);
      const body = encodeSnapshot(s);
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      expect(r.status, `${deck}: ${JSON.stringify(await r.clone().json())}`).toBe(201); // BUMP-1D: the refusal's own words ride on the message
    }
  });
});
