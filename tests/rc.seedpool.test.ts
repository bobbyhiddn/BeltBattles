// 0.8.0 RC M2 (REQ-BFG-016, REQ-BFG-011, REQ-BFG-009): the bb-0.8.0 seed pool for the four playable heroes.
//  - tools/samplePool.ts generateSamplePool(): every playable hero on every day 1-10, three ghosts per hero and day as in
//    0.7.0's pool (two sample ghosts and one floor ghost), 120 in all. FURNACE and WEAVER's 60 are 7c7feb9's pool byte
//    for byte but the rules string (W/output-RC/ghosts: ghost-pool.7c7feb9.bb-0.6.2.json, sha256 110f813c...). FOUNDRY
//    and BASTION's 60 are the par player's dusk decks from the par field's runs (raceGhosts), pinned by their own digest.
//  - Every ghost passes the upload check: the strict decoder, validateUpload in the player mode, the reachable-record
//    check (src/net/records.ts) and the rules gate (turrets and joins, heroes); a deck that fails it never enters the pool.
//  - On both stores (JSON lines, and Tigris through tools/fakeS3.ts) the seed writes all 120 and `ghosts:admin list
//    --rules bb-0.8.0` shows 12 a day; nothing under bb-0.6.2.
//  - A dusk served by the in-process server meets a FOUNDRY ghost and a BASTION ghost, labelled ONLINE GHOST (the NEXT
//    BATTLE card and the enemy plate both read session.ts foeNote); a FOUNDRY or BASTION player meets ghosts of all four.
// BELTS (REQ-BFG-043, REQ-BFG-044): the pool is generated under this build's rules, bb-0.8.7 since RUNES-1 (bb-0.8.6 since PACKS, bb-0.8.3 since BELTS) (the titles
// below say so), with the same composition; `ghosts:admin list --rules bb-0.8.7` shows it. BELTS run 5 regenerated the
// stand-in pool (the bots buy the gold upgrades), so FURNACE and WEAVER's 60 are no longer 7c7feb9's: both parts are
// pinned by their own digests, and 59 of the 120 ghosts carry upgrade levels (W/output-belts/ghosts/).
// RUNES-1 (REQ-BFG-058, decision 10): bb-0.8.7 carries bb-0.8.6's pools forward unregenerated (content.ts POOL_RULES;
// tests/runes.parity.test.ts): the seed ghosts travel under bb-0.8.7, and both digests are taken with the rules string
// normalised to POOL_RULES (bb-0.8.6), so they still pin PACKS's decks and records byte for byte.
// FLIP-X2 (release X, bb-0.9.0; REQ-BFG-058, REQ-BFG-069): the ONE regeneration. The stand-in pool was regenerated at
// step 4.1 (native N1: BUNDLED_POOL_HULL_SCALE deleted) and the par player takes its dawn runes, so both parts are new
// decks, each holding exactly `day` runes, as v3 snapshots (the race ghosts with their par run's seed). Nothing is carried
// any more (POOL_RULES = RULES_VERSION): NUM-1's /10 conversion, NUM-2/NUM-3's lists of changed race decks, their
// digests and the tripwire are gone; each part is pinned by its own new digest. The whole pool's digest is the file
// `npm run gen:ghosts` wrote at step 4.2 (sha256 620f5c9e2eea14e68b21c6dd31f1963251e4c7481a5e0031548e6ce18fc012b5).
// Y7b2 step 5 (release Y, bb-0.9.3; the pools): the one regeneration. The stand-in pool regenerated at 4d772e4 under
// bb-0.9.3, and gen:ghosts wrote the seed pool as v3 (T/output-y7b2/seedpool/ghost-pool.sample.json, 101,631 B, sha256
// c25691a1dd0fd3a2f2389a6be42268d5431368fb25c9645c38bddbc03e8f9a73, byte for byte samplePoolJson(generateSamplePool())).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, POOL_RULES, RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content"; // S8c: + ITEMS (the ARMOR PACK's hull)
import { npcDayRules } from "../src/sim/npcDay"; // S8c (T1e's form): the budget line is left to the player mode only while NPC_DAY is on
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): a new run's start; START_LIVES for the older-rules copies
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { PAR_K, parSeeds } from "../src/sim/harness/par";
import { parRunSeed, playerBuild } from "../src/sim/harness/player";
import { encodeStarred } from "../src/sim/standInPool";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { floorRecord, isReachable } from "../src/net/records";
import { heroGateProblem, rulesGateProblem, sustainFeatures } from "../src/net/rulesGate";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { newRun } from "../src/game/run";
import { storedFoe } from "../src/game/day";
import { startOnline, stopOnline, type OnlineDeps } from "../src/game/online";
import { foeNote, SOURCE_ONLINE } from "../src/game/session";
import { createGhostServer, type GhostServer } from "../server/app";
import { checkPool, seedStore } from "../server/seed";
import { JsonlStore } from "../server/store";
import { runAdmin } from "../server/ghostAdmin";
import {
  FLOOR_VARIANT, RACE_SEED_HEROES, RACE_VARIANTS, raceDeck, samplePoolJson,
  SAMPLE_VARIANTS, softPicked, type RaceDeck, // SOFT-1 (REQ-BFG-092): the race part's variant 0 and 1 decks
} from "../tools/samplePool";
import { floorGhosts, generateSamplePool, raceGhosts, sampleGhosts, softDeckOf } from "./helpers/poolCache"; // CACHE-1: the cached twins, and the generator's own deckOf (the copy below was this function)
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, startFake, tigrisFor } from "./netStores";
import { testIdentity } from "./netIdentity";

// BUMP-1D: LONG_RUN ships on, so generateSamplePool() is the long world's pool: 192 ghosts over days 1-16 (4 heroes x 16 days x 3 variants), each
// stating its losses; FURNACE and WEAVER's part is 2 heroes x 3 variants x 16 = 96 (the sample ghosts, then the floor ghosts), the race part the
// other 96 (was 60 and 60 over days 1-10). The floor ghosts are FLOOR_PICKS' chosen casual runs (the weakest qualifying run, not the first seed).
const POOL = generateSamplePool();
const DAYS = 16; // BUMP-1D: the pool's days (was 10)
const STANDIN_PART = POOL.slice(0, 96); // BUMP-1D: was slice(0, 60)
const RACE_PART = POOL.slice(96); // BUMP-1D: was slice(60)
/** HULL-ON (the flip, PICK): a seed ghost without the seed step's grade (generateSamplePool writes it last, PICK on). */
const ungraded = (s: GhostSnapshot): GhostSnapshot => {
  const { grade: _grade, ...u } = s;
  return u;
};
// FLIP-X2: NUM-2's NUM2_GHOSTS_DIFFER (11) and NUM2_RACE_PART_SHA256, NUM-3's NUM3_GHOSTS_DIFFER (9) and
// NUM3_RACE_PART_SHA256, their tripwire (EXCEPTIONS_RULES bb-0.8.7), BASE_DECKS (runes.parity's bb-0.8.6 fixture), RUNES-1's
// carried() (rules normalised to POOL_RULES) and NUM-1's preNum1 (/10) are deleted: the pool is regenerated, not carried.
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const variantOf = (s: GhostSnapshot) => Number(s.playerId.slice(-1));
/** FURNACE and WEAVER's 60 as a pool file: the sample and floor ghosts of the stand-in pool. Until BELTS they were
 *  7c7feb9's seed pool but the rules string (its sha256 110f813c..., with the rules normalised to bb-0.6.2); BELTS run 5
 *  regenerated the stand-in pool they are drawn from (44ee031, the gold upgrades), so they are pinned by their own
 *  digest now (W/output-belts/ghosts). A change to the stand-in pool or to this generator moves it. PACKS (bb-0.8.6): the
 *  stand-in pool regenerated with the packs (23bb3d2). */
// REDO-X step 2 (4.1-4.2): the stand-in pool regenerated once more on FIX-ABE's offers (09ce97c; the pools changed, the
// regeneration) (was 4de26dafb7ca9c3c2b9017ff1774ecc1a3a9973c09025755b99ed8f18f074a3f at FLIP-X2)
// BAL-2 step 5 (4.1-4.2): the stand-in pool regenerated once on bb-0.9.1 (c5e4780; the pools changed, the regeneration)
// (was a7ba169fcadaed6a6ac9787ac14856c1970f6fc2eace1d5c0021306e7a8f2b13 at REDO-X)
// Y7b2 (the pools): the stand-in pool regenerated once on bb-0.9.3 (4d772e4), so its sample and floor ghosts moved, each
// under bb-0.9.3: was 92b20ff61667399981a3f2069a4b48c327e7fc68d516ac66bfd8633391a980af at BAL-2
// Z-BUMP (the flip: the runtime seed pool's six labels follow LAST CHANCE (LC-1's six: the four day-6 floor ghosts 0W 1L -> 0W 2L, FURNACE d10 5W 1L -> 5W 2L; decks and ids unchanged); proved by records under bb-0.9.1 rebuilding the old digest (flip-T2.md). The pools move it again (S6)): was f36cd6ea...
// Z-BUMP (the pools: the seed pool regenerated once under bb-0.9.7 (2c4ba76): the stand-in pool and the par player with the overfeed; every snapshot stamped bb-0.9.7): was 3bbf3b32...
// S8c (the pools: the stand-in pool regenerated ONCE under bb-0.10.0 with every switch on, P1 83c039d, and the seed pool by
// gen:ghosts LAST, c6d3445; BRIEF-S8 S8c, RULING-S8-R5 section 3 item 2): was e6446558bf12b898... (the bb-0.9.7 stand-in pool)
// SOFT-1 (the seed pool softened, REQ-BFG-092; 26769d1: RULING-SOFT1-R1's C2bw in RULING-SOFT1-R2's form, the 80 picks in
// tools/samplePool.ts SOFT1_PICKS, gen:ghosts' server/seedPoolData.ts sha16 e0318ad8969cbf38): FURNACE and WEAVER's sample
// decks are the softer picks (39 of 40 par-field runs' dusk decks, with their runs' seeds and road logs), the floor ghosts as
// before: was c58eb2b740e38871... (S8c's)
// BUMP-1D (the pools: the stand-in pool regenerated for days 1-16 under bb-0.11.0, 8fc5e24, and the seed pool by gen:ghosts, 5e93e1e: 192 ghosts
// in the long world, so this part is the first 96 lines of server/seedPoolData.ts: the 64 sample ghosts and the 32 floor ghosts, the floor ghosts
// now FLOOR_PICKS' chosen casual runs; its digest is the sha256 of those 96 lines as samplePoolJson writes them, measured off the committed file
// (the whole pool's json: sha16 1f0c16a9454332c5, as the commit says)): was d7488847a88ceecb... (S8c's, SOFT-1's picks, 60 ghosts)
// BUMP-1E (the pools: the stand-in pool R1 (19ae423), the SOFT-1 and FLOOR picks R2 (2875b03: FLOOR_PICKS furnace 9011, weaver 9007, foundry 9008, bastion 9007) and the seed
// pool R3 (04fab9a, gen:ghosts) regenerated under bb-0.12.0: 192 ghosts, days 1-16, the json 325,693 B, sha16 bb04a889e7d45ebd): this part is the first 96 lines of the
// committed server/seedPoolData.ts, hashed as above (measured off the file, and the generator in this worker gives the same bytes): was 5eb8766e794a942c... (BUMP-1D's)
const STANDIN_PART_SHA256 = "34e2493a0a04b44da8e207130847690d74ca1318bfee0c11704e021cd2b77cce"; // BUMP-1E: the regenerated pool (R3). FLIP-X2: the regenerated pool (was 2bd3adfd..., under POOL_RULES bb-0.8.6, /10)
/** The race part (FOUNDRY and BASTION, 60) as a pool file: a change to the par player or this generator moves it.
 *  BELTS run 5: the par player buys the gold upgrades (was 9daab76d...). PACKS (bb-0.8.6): it buys BELT and ARMOR PACKs. */
// REDO-X (cap's ruling on FIX-ABE, REVIEW-FIXABE: rc.seedpool :98 re-pinned after the regeneration): the race ghosts are
// the par player's dusk decks, which moved with the offers (74e14a1) (was
// f60d1921aecdd0023a5284add12e331ed86bd10b2b93118f5af34be5a3eb8ac3 at FLIP-X2)
// BAL-2 (the lines and the pools): the race ghosts are the par player's FOUNDRY and BASTION dusk decks, whose dawn runes
// moved with the four FURNACE runes revived (every offer draws from 65 runes, was 61) (was
// a232005b6300c4c6c0e661ebea350d0de9bd660ab34b049ff32864ae4b118eee at REDO-X)
// Y7b2 (the pools): the seed pool regenerated at step 5, each ghost under bb-0.9.3; the race ghosts are the par player's
// FOUNDRY and BASTION dusk decks, which moved with release Y's rules (the flip: the par player's rating reads them): was
// 0990f4bb6a957b71e68b88c6b440db82d134af80e21a9800893329ec08ccee59 at BAL-2
// Z-BUMP (the pools: the seed pool regenerated once under bb-0.9.7 (2c4ba76): the stand-in pool and the par player with the overfeed; every snapshot stamped bb-0.9.7): was 2285dce9...
// S8c (the pools: the seed pool regenerated by gen:ghosts LAST, c6d3445, every switch on as shipped; the race ghosts are the
// par player's FOUNDRY and BASTION dusk decks, with their road logs, after HULL-ON's five, SHAPES-1 and FIT-099; BRIEF-S8 S8c,
// RULING-S8-R5 section 3 item 2): was 0f6dd49c07790f30... (Z-BUMP's)
// SOFT-1 (the seed pool softened, REQ-BFG-092; 26769d1, tools/samplePool.ts SOFT1_PICKS): FOUNDRY and BASTION's variant 0 and
// 1 decks are the softer picks (par-field runs' dusk decks of the day, softPicked), the floor ghosts as before: was
// 9d30c0ec0769920103e6... (S8c's)
// BUMP-1D (the pools: the seed pool regenerated by gen:ghosts, 5e93e1e, days 1-16, the long world; FOUNDRY and BASTION's 96 are the file's last
// 96 lines: SOFT_TARGET 250's variant 0 and 1 picks, the floor ghosts FLOOR_PICKS' casual runs foundry 9003 and bastion 9004, each ghost stating
// its losses; measured off the committed file as above): was 26a23962474bb59a... (SOFT-1's picks, 60 ghosts)
// BUMP-1E (the pools: R1-R3 under bb-0.12.0, as above; this part is the file's last 96 lines: the par player's FOUNDRY and BASTION dusk decks, the floor ghosts
// FLOOR_PICKS' casual runs foundry 9008 and bastion 9007; measured off the committed file, the generator in this worker giving the same bytes): was 73d3f62dea998e5d... (BUMP-1D's)
const RACE_PART_SHA256 = "d353afdfecd634a1dd1beffca6a1082c8fc9a93b0d2426137681592fe63d2545";
/** SOFT-1 (REQ-BFG-092; tools/samplePool.ts SOFT1_PICKS): a race seed deck as generateSamplePool's deckOf gives it in the
 *  shipped world: variant 0 and 1 from SOFT1_PICKS (softPicked: a par-field run's dusk deck, its field seed and road log),
 *  the floor variant (2) from raceDeck as before. */
// CACHE-1: softDeckOf is tests/helpers/poolCache.ts's now (this very function, marked pure so raceGhosts(undefined, softDeckOf) is cached and shared)
// FLIP-X2: the par player with its runes (was 94e26280... at PACKS; NUM-3 pinned b3c0ea31..., /10)

// Y7b2 (the bump, the pools): title bb-0.9.1 -> bb-0.9.3, and Y7b2's regeneration added (was "... again at REDO-X and BAL-2; ...")
// Z-BUMP (the bump, the pools): title bb-0.9.3 -> bb-0.9.7, and Z-BUMP's regeneration added (was "... again at REDO-X, BAL-2 and Y7b2; ...")
// AZ-BUMP (the bump): title bb-0.9.7 -> bb-0.10.0 (the pool's decks move at S8's regeneration)
// BUMP-1D (the bump): title bb-0.10.0 -> bb-0.11.0 (regenerated again, 5e93e1e: days 1-16, 192 ghosts)
// BUMP-1E (the bump): title bb-0.11.0 -> bb-0.12.0 (regenerated again, R3 04fab9a under bb-0.12.0: 192 ghosts)
describe("the bb-0.12.0 seed pool (tools/samplePool.ts; regenerated at FLIP-X2, again at REDO-X, BAL-2, Y7b2, Z-BUMP, BUMP-1D and BUMP-1E; v3 snapshots holding their runes)", () => {
  it("holds every playable hero on every day 1-16, three ghosts per hero and day (variants 0, 1 and the floor ghost 2), 192 in all", () => {
    // BUMP-1D: days 1-16, 192 ghosts (was days 1-10, 120)
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect([...STAND_IN_HEROES]).toEqual(["furnace", "weaver"]);
    expect([...RACE_SEED_HEROES]).toEqual(["foundry", "bastion"]);
    expect(RACE_VARIANTS).toBe(3);
    expect(POOL).toHaveLength(192);
    for (const hero of PLAYABLE_HEROES) for (let day = 1; day <= DAYS; day++) {
      const here = POOL.filter((s) => s.hero === hero && s.day === day);
      expect(here.map(variantOf), `${hero} d${day}`).toEqual([0, 1, 2]);
    }
    expect(new Set(POOL.map((s) => s.rules))).toEqual(new Set([RULES_VERSION]));
    expect(new Set(POOL.map(ghostId)).size).toBe(192);
    // FLIP-X2: every ghost is a v3 snapshot whose deck holds exactly its day's runes (one a dawn)
    for (const s of POOL) expect([s.v, s.build.runes?.length], `${s.hero} d${s.day} v${variantOf(s)}`).toEqual([SNAPSHOT_V3, s.day]);
  });

  // Y7b2 (the bump, the pools): title bb-0.9.1 -> bb-0.9.3
  // Z-BUMP (the bump, the pools): title bb-0.9.3 -> bb-0.9.7
  // S8c (the pools: the stand-in pool regenerated once under bb-0.10.0, P1 83c039d): title bb-0.9.7 -> bb-0.10.0
  // BUMP-1E (the pools): title bb-0.11.0 -> bb-0.12.0 (the stand-in pool regenerated under bb-0.12.0, R1 19ae423)
  it("FURNACE and WEAVER's 96 come first: the sample and floor ghosts of the bb-0.12.0 stand-in pool, pinned by their digest", () => {
    // BUMP-1D: 96 (2 heroes x 3 variants x 16 days; was 60), the stand-in pool of 16 days under bb-0.11.0 (8fc5e24; was the bb-0.10.0 pool)
    // HULL-ON (the flip, PICK): every seed ghost carries the seed step's grade (generateSamplePool, written last), which
    // the sample and floor ghosts' own generators don't write, so the parts compare without it; the digest below still
    // reads the pool as generated (graded): S8's, as at 66cc267
    expect(STANDIN_PART.every((s) => typeof s.grade === "number")).toBe(true);
    expect(STANDIN_PART.map(ungraded)).toEqual([...sampleGhosts(), ...floorGhosts()]);
    expect(STANDIN_PART.every((s) => s.hero === "furnace" || s.hero === "weaver")).toBe(true);
    expect(POOL_RULES).toBe(RULES_VERSION); // FLIP-X2: nothing carried (was "bb-0.8.6")
    expect(sha(samplePoolJson(STANDIN_PART))).toBe(STANDIN_PART_SHA256);
  });

  it("each FOUNDRY and BASTION ghost is the par player's dusk deck of its day from a par-field run; three distinct decks per hero and day", () => {
    // SOFT-1 (REQ-BFG-092): over the softer picks' decks (softDeckOf, the generator's deckOf); was raceGhosts() (raceDeck's)
    expect(RACE_PART.map(ungraded)).toEqual(raceGhosts(undefined, softDeckOf)); // HULL-ON (the flip, PICK): without the seed step's grade (above)
    // FLIP-X2: the regenerated race part, pinned by its own digest (NUM-2/NUM-3's changed-deck lists and tripwire deleted)
    expect(sha(samplePoolJson(RACE_PART))).toBe(RACE_PART_SHA256);
    const field = parSeeds(PAR_K);
    for (const hero of RACE_SEED_HEROES) for (let day = 1; day <= DAYS; day++) { // BUMP-1D: days 1-16 (was 1-10)
      const here = RACE_PART.filter((s) => s.hero === hero && s.day === day);
      expect(here).toHaveLength(3);
      expect(new Set(here.map((s) => encodeStarred(s.build))).size, `${hero} d${day}`).toBe(3);
      for (const s of here) {
        // S8c (P2: LOSS-1 P2, 5f3ac64, merged at S7L 3b19771, behind NPC_DAY, which ships on): the floor ghost (variant 2) is
        // its hero's casual floor run's deck, not the par player's (tools/samplePool.ts raceGhosts; tests/p2.floor holds it:
        // one casual run per hero, floorRecord, v3 with its road log, distinct from variants 0 and 1). So with NPC_DAY on it
        // keeps its floor record here and the par-player checks below read variants 0 and 1 (a red hidden behind this test's
        // digest line since the flip: foundry d1 v2's beltCap 18, not the par deck's 26). Off, every variant as before
        if (npcDayRules() && variantOf(s) === FLOOR_VARIANT) {
          expect({ wins: s.wins, lives: s.lives }, `${hero} d${day} v2`).toEqual(floorRecord(day));
          continue;
        }
        // SOFT-1 (REQ-BFG-092): the field run of the softer pick (softDeckOf; was raceDeck's run, hashSeed's pick)
        const { seed } = softDeckOf(hero, day, variantOf(s));
        expect(field).toContain(seed);
        expect(s.build, `${hero} d${day} v${variantOf(s)}`).toEqual(playerBuild(hero, day, seed));
        expect(s.seed, `${hero} d${day} v${variantOf(s)}`).toBe(parRunSeed(hero, seed) >>> 0); // FLIP-X2: its par run's seed travels in v3
        if (variantOf(s) === FLOOR_VARIANT) expect({ wins: s.wins, lives: s.lives }).toEqual(floorRecord(day));
      }
    }
  });

  it("every ghost passes the upload check: the strict decoder, validateUpload (player mode), the reachable record and the rules gate; under 0.7.0's rules FOUNDRY and BASTION can't travel", () => {
    const branch = { sustain: 0, standIn: 0, heroGate: 0 };
    for (const s of POOL) {
      const at = `${s.hero} d${s.day} v${variantOf(s)}`;
      expect(decodeSnapshot(encodeSnapshot(s)), at).toEqual(s);
      // S8c (RULING-S8-R5 section 3 item 1, T1e's form; cause a48010b): the player mode with its road log and run seed, as
      // seedGhost and checkPool read it (was validateUpload(s.build, s.day, s.rules) bare: a road-fed deck's drops count only
      // through its road log, so weaver d1 v0 read "14 gold ... at most 13 (maxGoldByDay 8 + roadCap 5)" without it)
      expect(validateUpload(s.build, s.day, s.rules, { ...(s.seed !== undefined ? { seed: s.seed } : {}), ...(s.road ? { road: s.road } : {}) }), at).toEqual({ ok: true, errors: [] });
      // S8c (RULING-S8-R5 section 3 item 1: T1e's form, RULING-S8-R1 item 3; cause a48010b: with NPC_DAY on, a road-fed deck
      // spends the road's drops too, by design): the stand-in pool is road-fed (P1 83c039d, generated with NPC_DAY on as
      // shipped), so a seed ghost's deck may be over the shop's gold alone, which the strict mode's budget line counts; its
      // drops count through its road log, in the player mode. So each ghost is held, as seedGhost and checkPool hold it, to
      // validateBuild's lines minus its ONE budget line (by its "budget: " prefix, and only while NPC_DAY is on: off, the strict
      // check stays whole), AND to validateUpload in the player mode with its road log and run seed. Was:
      // validateBuild(s.build, s.day).ok whole (red at s8-base: furnace d1 v2; on the regenerated pool: furnace d1 v0)
      const strict = validateBuild(s.build, s.day).errors;
      const budget = npcDayRules() ? strict.filter((e) => e.startsWith("budget: ")) : [];
      expect(budget.length, `${at}: at most its one budget line`).toBeLessThanOrEqual(1);
      expect(strict.filter((e) => !budget.includes(e)), `${at}: every other strict line`).toEqual([]);
      const up = validateUpload(s.build, s.day, s.rules, { ...(s.seed !== undefined ? { seed: s.seed } : {}), ...(s.road ? { road: s.road } : {}) });
      expect(up.errors, `${at}: the player mode with its road log and run seed`).toEqual([]);
      expect(isReachable(s.day, s.wins, s.lives), at).toBe(true);
      expect(rulesGateProblem(s.rules, s.build), at).toBeNull();
      expect(heroGateProblem(s.rules, s.hero), at).toBeNull();
      // FLIP-X2: a bb-0.6.2 client holds no runes (they need bb-0.8.7), so the hero-gate check reads the ghost as such a
      // client sent it: v2, without its runes and seed (was { ...s, rules: "bb-0.6.2" }); with its runes it is refused first
      // HULL-ON (the flip, HEARTS, PICK): the bb-0.6.2 copies carry the record on their own rules' 5-lives scale (lives
      // min(lives, START_LIVES), as seed.test.ts and h2.nearmiss: the decoder bounds lives at 9 before hearts, so a copy
      // keeping its 10 hearts was refused "snapshot.lives: expected an integer in 1..9" before the gate under test), and
      // without the seed step's grade (no client before PICK sends one)
      const older = { ...ungraded(s), lives: Math.min(s.lives, START_LIVES) };
      // BUMP-1D: a bb-0.6.2 snapshot's day is bounded at 10 (snapshot.ts maxDayFor: days past 10 are the long run's rules alone), so a ghost of day 11-16 is
      // refused on its day, before any other line; the runes and hero-gate lines below read the ghosts of days 1-10 (what a bb-0.6.2 client could send)
      if (s.day > 10) {
        expect(() => checkSnapshot({ ...older, rules: "bb-0.6.2" }), at).toThrow(/snapshot\.day: expected an integer in 1\.\.10/);
        continue;
      }
      expect(() => checkSnapshot({ ...older, rules: "bb-0.6.2" }), at).toThrow(/runes \(build\.runes\) need bb-0\.8\.7 or later/);
      const { runes: _runes, ...bare } = s.build;
      // AZ-BUMP S7L (the cause LOSS-1 P2, 5f3ac64, merged at 3b19771): the floor ghosts now carry their casual run's road
      // log (v3 only), which a bb-0.6.2 client never sent, so the copy drops it too, as the runes and the seed
      // BUMP-1D: and its stated losses (a long run's v3 field, which a v2 snapshot of bb-0.6.2 does not carry)
      const { seed: _seed, road: _road, losses: _losses, ...rest } = older; // HULL-ON (HEARTS, PICK): the copy above
      const old = { ...rest, v: 2, rules: "bb-0.6.2", build: bare };
      // FLIP-X2: a deck holding a sustain piece (WARD BELL, MEND PRESS, MENDING LOOM; SUSTAIN_LIVE) can't travel under
      // bb-0.6.2 at all: the rules gate (bb-0.9.0's row) refuses it before the hero gate is read
      if (sustainFeatures(bare).length) { branch.sustain++; expect(() => checkSnapshot(old), at).toThrow(/^snapshot\.rules: rules bb-0\.6\.2 predate bb-0\.9\.0: sustain pieces/); }
      else if (STAND_IN_HEROES.includes(s.hero)) { branch.standIn++; expect(checkSnapshot(old).hero).toBe(s.hero); }
      else { branch.heroGate++; expect(() => checkSnapshot(old), at).toThrow(/^snapshot\.hero: rules bb-0\.6\.2 accept only FURNACE, WEAVER/); }
    }
    // FLIP-X2: both pre-flip branches are still exercised (the hero gate on FOUNDRY / BASTION, a stand-in hero passing)
    expect(branch.standIn, JSON.stringify(branch)).toBeGreaterThan(0);
    expect(branch.heroGate, JSON.stringify(branch)).toBeGreaterThan(0);
    console.log(`rc.seedpool (FLIP-X2): under bb-0.6.2 ${JSON.stringify(branch)}`);
    expect(checkPool(POOL)).toHaveLength(192); // BUMP-1D: was 120
  });

  it("a race deck that fails validateUpload never enters the pool: the generator throws on it", () => {
    const rich = (hero: HeroId, day: number, v: number) => {
      const d = raceDeck(hero, day, v);
      // S8c (cause a48010b with PACKS' plating; RULING-S8-R5 section 3 items 1-2): "forty plates" was 25 * 40 hull, sized for
      // bb-0.8.0's +25 plating. Since PACKS a plate is the ARMOR PACK (+250 hull, 5 G), so that was 4 packs (20 G), over the
      // strict budget (day 4: 38 G) but, with NPC_DAY on, within the player mode seedGhost leaves the budget to (day 4: 38 G
      // + roadCap 51 + this run's drops 17 = 106 G), so the generator no longer threw (red since HULL-ON's flip). Forty ARMOR
      // PACKs (+10,000 hull, 200 G) are past any honest ceiling again (kit-s8/probes/zz-r3rich: +20 packs already fails)
      if (hero === "bastion" && day === 4 && v === 1) d.build.hullBonus += ITEMS.plating.supply!.hull! * 40; // forty plates (ARMOR PACKs) past the honest ceiling
      return d;
    };
    expect(() => raceGhosts(96, rich)).toThrow(/sample ghost bastion v1 day 4 is invalid|fails validateUpload/); // BUMP-1D: 96, the race part's first createdAt index (was 60)
  });
});

/** One store as the admin tool and the seed see it. */
interface Store { name: string; store(): ReturnType<typeof tigrisFor> | JsonlStore; env(): Record<string, string>; argv(): string[] }

// Y7b2 (the bump): title bb-0.9.1 -> bb-0.9.3
// Z-BUMP (the bump, the pools): title bb-0.9.3 -> bb-0.9.7
// AZ-BUMP (the bump): title bb-0.9.7 -> bb-0.10.0
// BUMP-1D (the bump): title bb-0.10.0 -> bb-0.11.0
// BUMP-1E (the bump): title bb-0.11.0 -> bb-0.12.0
describe("the seed pool on both stores: ghosts:admin list --rules bb-0.12.0", () => {
  let fake: FakeS3;
  const dirs: string[] = [];
  beforeAll(async () => {
    fake = await startFake();
  }, 120_000);
  afterAll(async () => {
    await fake.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const stores = (): Store[] => {
    const dir = mkdtempSync(join(tmpdir(), "bb-rc-pool-"));
    dirs.push(dir);
    return [
      { name: "jsonl", store: () => { const s = new JsonlStore(dir); s.load(); return s; }, env: () => ({ BB_GHOST_STORE: "jsonl" }), argv: () => ["--data", dir] },
      {
        name: "tigris", store: () => tigrisFor(fake, "bb-test"), argv: () => [],
        env: () => ({
          BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
          AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: "bb-test", BB_GHOST_S3_ADDRESSING: "path",
        }),
      },
    ];
  };
  const table = (out: string[]) => {
    const t: Record<string, number[]> = {};
    for (const l of out) {
      const m = /^ +(\d+|all|\?) +(\d+) +(\d+) +(\d+)$/.exec(l);
      if (m) t[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    return t;
  };

  // Y7b2 (the bump): title bb-0.9.1 -> bb-0.9.3
  // Z-BUMP (the bump, the pools): title bb-0.9.3 -> bb-0.9.7
  it("the seed writes 192 on each store, and list shows 12 seed ghosts a day (3 per hero) under bb-0.12.0 (BUMP-1E: was bb-0.11.0; BUMP-1D: was 120 and bb-0.10.0; AZ-BUMP: was bb-0.9.7), none under bb-0.6.2", async () => {
    for (const h of stores()) {
      expect(await seedStore(h.store()), h.name).toMatchObject({ rules: RULES_VERSION, entries: 192, written: 192, removed: 0 });
      for (const [rules, perDay, all] of [[RULES_VERSION, 12, 192], ["bb-0.6.2", 0, 0]] as const) {
        const out: string[] = [];
        expect(await runAdmin(["list", "--rules", rules, ...h.argv()], h.env(), (l) => out.push(l)), `${h.name} ${rules}`).toBe(0);
        const t = table(out);
        for (let day = 1; day <= DAYS; day++) { // BUMP-1D: days 1-16 (was 1-10)
          if (perDay) expect(t[String(day)], `${h.name} ${rules} day ${day}`).toEqual([perDay, 0, 0]);
          else expect(t[String(day)] ?? [0, 0, 0], `${h.name} ${rules} day ${day}`).toEqual([0, 0, 0]);
        }
        expect(t.all, `${h.name} ${rules}`).toEqual([all, 0, 0]);
      }
      for (let day = 1; day <= DAYS; day++) {
        const heroes = (await h.store().bucket(RULES_VERSION, day, "pool")).map((e) => e.snapshot.hero).sort();
        expect(heroes, `${h.name} day ${day}`).toEqual(["bastion", "bastion", "bastion", "foundry", "foundry", "foundry", "furnace", "furnace", "furnace", "weaver", "weaver", "weaver"]);
      }
    }
  });
});

describe("online against the in-process server with the seed pool (uploads closed, as in production)", () => {
  let dir: string, app: GhostServer, base: string;
  let salt = 0;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-rc-online-"));
    app = createGhostServer({ dataDir: dir, uploads: "closed", log: () => {}, matchSalt: () => salt++, rateLimit: { windowMs: 60_000, max: 100_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    await seedStore(app.store);
  }, 120_000); // the seed builds the race ghosts (the par player's runs): seconds, more under load
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => stopOnline());

  it("a dusk meets a FOUNDRY ghost and a BASTION ghost, and the card and the plate say ONLINE GHOST", async () => {
    const device = await testIdentity(2);
    const deps: OnlineDeps = { fetchGhost, submitGhost, identity: async () => device, store: null, now: () => 1_790_000_000_000, save: () => {} };
    const met = new Map<HeroId, string>();
    for (let seed = 1; seed <= 60 && met.size < 4; seed++) {
      const s = startOnline(base, deps);
      for (let i = 0; i < 200 && !s.active; i++) await new Promise((r) => setTimeout(r, 5));
      const run = newRun(PLAYABLE_HEROES[seed % 4], 9000 + seed);
      s.tick(run);
      for (let i = 0; i < 400 && s.lastFetch === null; i++) await new Promise((r) => setTimeout(r, 5));
      s.tick(run);
      const foe = storedFoe(run)!;
      expect(foe).toMatchObject({ kind: "ghost", source: "online" });
      expect(foeNote(run, foe)).toBe(SOURCE_ONLINE);
      met.set(foe.hero, foe.ghostId!);
    }
    expect(met.has("foundry")).toBe(true);
    expect(met.has("bastion")).toBe(true);
    const ids = new Set(POOL.map(ghostId));
    for (const id of met.values()) expect(ids.has(id)).toBe(true);
  });

  it("a FOUNDRY or BASTION player meets seed ghosts of all four heroes (matching is hero-blind)", async () => {
    const device = await testIdentity(3);
    for (const hero of RACE_SEED_HEROES) {
      const met = new Set<string>();
      let refused = 0;
      for (let day = 1; day <= DAYS; day++) for (let k = 0; k < 12; k++) { // BUMP-1D: days 1-16 (was 1-10)
        // HULL-ON (the flip, HEARTS): lives 5 -> HEARTS_START: a new run's start (was START_LIVES' 5 by hand). The seed ghosts
        // carry hearts labels (day 1's are 0W 10), so on 5 lives every one was a better record and D1 left none (fallback)
        const r = await fetchGhost(base, { rules: RULES_VERSION, day, wins: 0, lives: HEARTS_START, playerId: device.playerId, seen: [], hero, seed: k, runs: 0 }, 3000);
        if (r.source === "server") { met.add(r.snapshot.hero); continue; }
        // BUMP-1E (REPORT finding F5; was: expect(r.source).toBe("server") on every day 1-16): with SCALE_RIGS on the client checks a served
        // ghost's record (ghostClient.ts:84, SCALE-2d D5: isReachable), and a request of 0 wins asks for the 0W ghosts alone (D1: no better record),
        // which from day 7 are the floor ghosts' 0W 1 life: a record only a LAST CHANCE carries into that dusk, and the seed ghosts state no
        // lastChance (tools/samplePool.ts seedGhost writes none; the server's own seed check, server/seed.ts:65, omits the option and refuses 0 of 192).
        // So from day 7 the client refuses the floor ghost and takes the stand-in (the stand-in is a valid ghost: source "fallback"). Pinned as shipped;
        // whether the client should read a ghost with no lastChance field as "may hold one" or the generator should stamp one is cap's call (F5)
        expect(r.error, `${hero} d${day}: the client refuses the floor ghost's record`).toBe(`server returned a ghost whose record (0W 1 lives) no run carries into dusk ${day}`);
        expect(day, `${hero}: the refusals start at day 7`).toBeGreaterThanOrEqual(7);
        refused++;
      }
      expect(refused, `${hero}: every request on days 7-16 (10 days x 12) falls back on the floor ghost's record`).toBe(120);
      expect([...met].sort(), hero).toEqual(["bastion", "foundry", "furnace", "weaver"]); // from the served days 1-6
    }
  });
});
