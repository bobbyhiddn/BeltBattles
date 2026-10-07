// Z-BUMP S4 (REQ-BFG-073; REVIEW-ZPREP finding F1): ghosts:admin's record check knows the record's rules.
// uploadProblems (server/ghostAdmin.ts, the check revalidate runs on every stored upload) uses LAST CHANCE's reachability
// only for a snapshot whose rules are LAST_CHANCE_RULES or later: records.ts isReachable's `rules` option asks
// recordHasLastChance, which asks rulesGate.ts lastChanceGateProblem, the gate the strict decoder asks. A record under older
// rules keeps the record model of its own rules (no LAST CHANCE: today's isReachable before the flip), so an honest
// bb-0.9.3 record at 1 life is never flagged. (The code landed in the flip, which made every reader of a stored record ask
// the rules gate; these are F1's tests.) Note: the CLI's revalidate takes only this build's rules (parseArgs refuses any
// other --rules, exit 2, touching nothing), so uploadProblems is called here directly, as tests/names.upload.test.ts does
// for bb-0.6.1 records.
import { describe, expect, it } from "vitest";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { BOONS, lastChanceOffer, type Boon } from "../src/sim/lastChance";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { isReachable, reachableRecords, recordHasLastChance } from "../src/net/records";
import { LAST_CHANCE_RULES } from "../src/net/rulesGate";
import { parseArgs, uploadProblems, UsageError, type StoredRecord } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import { TEST_NAME } from "./netIdentity";
import type { Build } from "../src/sim/deck";

const OLD = "bb-0.9.3"; // release Y's rules (0.9.3-0.9.5), the last without LAST CHANCE
const D = 5; // five losses (the early-loss refund lifts day 3) leave 1 life at dusk 5
const PLATE = ITEMS.plating.supply!.hull!;

/** `s` as the store holds an upload (JSON lines: {id, at, snapshot}). */
const stored = (s: GhostSnapshot, id = ghostId(s)): StoredRecord => ({
  ref: "ghosts.jsonl:1", kind: "upload", day: s.day, id, playerId: s.playerId, text: encodeRecord(id, 5, s), keyed: false,
});

/** A plain upload (no LAST CHANCE) under `rules`: FURNACE's par deck at dusk 6 with 0 wins and 1 life, the record five
 *  losses leave under rules without LAST CHANCE (the loss at dusk 5 leaves 1 life). */
function plain(rules: string): GhostSnapshot {
  return {
    v: SNAPSHOT_V3, rules, hero: "furnace", day: 6, wins: 0, lives: 1, build: playerRun("furnace", 6, 5)[5].build,
    runId: "zbump-f1-plain", playerId: "p-zbump", createdAt: 1_790_000_000_000, name: TEST_NAME, seed: parRunSeed("furnace", 5),
  };
}

/** An honest upload at dusk 6 after a LAST CHANCE on day D that took `boon` (the par player's own run, as
 *  tests/zprep.admin.test.ts makes it), filled with plates to its budget's edge. */
function honest(boon: Boon, hero: HeroId): GhostSnapshot {
  const seed = 5, runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id));
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon } })[D].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  const s: GhostSnapshot = {
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 2, build, runId: `zbump-f1-${hero}-${boon}`,
    playerId: "p-zbump", createdAt: 1_790_000_000_000, name: TEST_NAME, seed: runSeed, lastChance: { day: D, boon, ...(id ? { id } : {}) },
  };
  const check = (x: GhostSnapshot) => validateUpload(x.build, x.day, x.rules, { seed: x.seed, lastChance: x.lastChance });
  const at = (n: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + n * PLATE } as Build });
  let k = 0;
  while (k < 60 && check(at(k + 1)).ok) k++;
  return at(k);
}

describe("Z-BUMP F1 (REVIEW-ZPREP): revalidate's record check knows the record's rules", () => {
  it("this build's rules and LAST CHANCE's row are bb-0.9.7; bb-0.9.3 predates it, so its records are read without LAST CHANCE", () => {
    expect([RULES_VERSION, LAST_CHANCE_RULES]).toEqual(["bb-0.9.7", "bb-0.9.7"]);
    expect([recordHasLastChance(RULES_VERSION), recordHasLastChance(OLD), recordHasLastChance(undefined), recordHasLastChance("nope")]).toEqual([true, false, true, false]);
    // the model under bb-0.9.3 is the one before the flip: 1 life at dusk 6 after five losses; under bb-0.9.7 the loss at
    // dusk 5 fires LAST CHANCE, so that run carries 2 lives, never 1
    expect([isReachable(6, 0, 1, { rules: OLD, lastChance: null }), isReachable(6, 0, 1, { rules: OLD })]).toEqual([true, true]);
    expect([isReachable(6, 0, 1, { lastChance: null }), isReachable(6, 0, 1, { rules: RULES_VERSION, lastChance: null })]).toEqual([false, false]);
    expect([isReachable(6, 0, 2, { lastChance: D }), isReachable(6, 0, 2, { lastChance: 3 })]).toEqual([true, false]);
    // the whole model, dusks 1-10: 178 records under bb-0.9.3 (the model before the flip), 172 under bb-0.9.7
    const count = (rules?: string) => Array.from({ length: 10 }, (_, i) => reachableRecords(i + 1, { rules }).length).reduce((a, b) => a + b, 0);
    expect([count(OLD), count(RULES_VERSION), count()]).toEqual([178, 172, 172]);
  });

  it("a bb-0.9.3 record at 0W 1L on dusk 6 revalidates clean (uploadProblems under --rules bb-0.9.3); the CLI itself takes only bb-0.9.7", () => {
    const s = plain(OLD);
    expect(uploadProblems(stored(s), OLD)).toEqual([]);
    // revalidate's CLI path reads only this build's rules: --rules bb-0.9.3 is a usage error (exit 2), nothing is read
    expect(() => parseArgs(["revalidate", "--rules", OLD])).toThrow(UsageError);
    expect(() => parseArgs(["revalidate", "--rules", OLD])).toThrow(`revalidate checks uploads with this build's rules, ${RULES_VERSION}; for ${OLD} use wipe-uploads or remove-player`);
  });

  it("the same record under bb-0.9.7 is refused: a run at 1 life on dusk 6 would have had its LAST CHANCE", () => {
    const s = plain(RULES_VERSION);
    expect(uploadProblems(stored(s), RULES_VERSION)).toEqual(["record: 0W 1 lives is no record a run carries into dusk 6"]);
  });

  it("an honest bb-0.9.7 LAST CHANCE record revalidates clean, each card; stamped bb-0.9.3 its field is the decoder's refusal", () => {
    for (const hero of ["furnace", "bastion"] as HeroId[]) {
      for (const boon of BOONS) {
        const s = honest(boon, hero);
        const rec = stored(s);
        expect(uploadProblems(rec, RULES_VERSION), `${hero} ${boon}`).toEqual([]);
        // the same stored text with its rules string set to bb-0.9.3 (the encoder refuses to write such a snapshot, so the
        // text is edited as a store could hold it): the decoder's gate refuses the field, before any other check
        const old: StoredRecord = { ...rec, text: rec.text.replace(`"rules":"${RULES_VERSION}"`, `"rules":"${OLD}"`) };
        expect(old.text, `${hero} ${boon}`).not.toBe(rec.text);
        expect(uploadProblems(old, OLD), `${hero} ${boon}`)
          .toEqual([`strict decode: snapshot.lastChance: rules ${OLD} predate ${RULES_VERSION}: LAST CHANCE (snapshot.lastChance) needs ${RULES_VERSION} or later`]);
      }
    }
  });
});
