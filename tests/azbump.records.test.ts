// AZ-BUMP S6 (REQ-BFG-077, REQ-BFG-078, REQ-BFG-079; BRIEF-AZBUMP S6 "Stored records", Z-BUMP S4's pattern): a stored record
// is judged by its own rules. The hull release's three switches (NPC_DAY, HULL_SCALE, LADDER_FIX) came on with its rules,
// bb-0.10.0 (NPC_DAY_RULES), so a bb-0.9.7 record (no road, no M or D, bb-0.9.7's gold table and road) is budgeted in
// bb-0.9.7's world: validateUpload asks the rules gate for the deck's rules (validate.ts inRulesWorld), never the global
// switch. ghosts:admin's revalidate runs uploadProblems on every stored upload; its CLI takes only this build's rules
// (parseArgs: `--rules bb-0.9.7` is a usage error, exit 2), so uploadProblems is called here directly under bb-0.9.7, as
// tests/zbump.f1.test.ts does for bb-0.9.3. The checks: a bb-0.9.7 record revalidates clean (at its own budget's edge; one
// plate more is refused; the global switches would put that edge elsewhere); an honest bb-0.10.0 NPC-day record revalidates
// clean; without its road log, or with a forged drop, it is refused; stamped bb-0.9.7 its road log is the decoder's refusal.
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { ITEMS, RULES_VERSION, START_LIVES, type HeroId } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): this build's records are on the hearts scale
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { dropPool, npcDayRules, roadDropValue, setNpcDay, withNpcDay } from "../src/sim/npcDay";
import { hullScaleRules, withHullScale } from "../src/sim/hullScale";
import { ladderFixRules, withLadderFix } from "../src/sim/ladderFix";
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: bb-0.9.7's world has SHAPES off
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: and SHAPES2 off
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: and the 10-day run
import { warlordOffer, type Difficulty } from "../src/sim/rivals";
import { choicesFor, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import { finishWarlord, leaveCaravan, onToTheRoad, pickRoad, warlordDeck } from "../src/game/road";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { inRulesWorld, validateBuild, validateUpload } from "../src/net/validate";
import { NPC_DAY_RULES } from "../src/net/rulesGate";
import { parseArgs, uploadProblems, UsageError, type StoredRecord } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import { TEST_NAME } from "./netIdentity";
import type { Build } from "../src/sim/deck";

const OLD = "bb-0.9.7"; // release Z's rules (0.9.7 and 0.9.8): no road, no M or D
const PLATE = ITEMS.plating.supply!.hull!;
const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

afterEach(() => setNpcDay(true)); // the shipped value

/** `s` as the store holds an upload (JSON lines: {id, at, snapshot}), as tests/zbump.f1.test.ts builds it. */
const stored = (s: GhostSnapshot, id = ghostId(s)): StoredRecord => ({
  ref: "ghosts.jsonl:1", kind: "upload", day: s.day, id, playerId: s.playerId, text: encodeRecord(id, 5, s), keyed: false,
});
/** `fn` in bb-0.9.7's world: every switch off, each put back after. SHAPES-1 flip (step 8): SHAPES off too, as the
 *  validator judges a record before bb-0.10.0 (validate.ts inShapesWorld): with it on the par player bought shaped rigs, which
 *  bb-0.9.7 refuses (rulesGate.ts shapesGateProblem), and its budget edge read SHAPES' prices.
 *  BUMP-1D (LONG_RUN and SHAPES2 ship on): and those two off as well, the worlds validate.ts judges a bb-0.9.7 record in (inRulesWorld
 *  puts the long run to the record's rules; inShapes2World the six more shaped rigs): a bb-0.9.7 run is the 10-day run (the road
 *  cap's event sequence has the day-10 swap), and refuses the six shaped rigs (shapes2GateProblem: "rules bb-0.9.7 predate
 *  bb-0.11.0: shaped rigs (ELBOW GUARD, ...) need bb-0.11.0 or later"), which the par player would buy. PLAIN_RIGS has no rules
 *  gate (the validator leaves it as it stands), so it is not turned off here. */
const old = <T>(fn: () => T): T => withNpcDay(() => withHullScale(() => withLadderFix(() => withShapes(() => withShapes2(() => withLongRun(fn, false), false), false), false), false), false);
/** `s` with `n` more plates of hull. */
const plated = (s: GhostSnapshot, n: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + n * PLATE } as Build });
/** The most plates `ok` lets `s` take. */
const edge = (s: GhostSnapshot, ok: (x: GhostSnapshot) => boolean): number => {
  let k = 0;
  while (k < 400 && ok(plated(s, k + 1))) k++;
  return k;
};

/** A bb-0.9.7 upload: FURNACE's par deck at dusk `day` made in bb-0.9.7's world (the par player with every switch off),
 *  with `day - 1` wins and 5 lives (a run that won every dusk). */
function oldRecord(day: number): GhostSnapshot {
  const build = old(() => playerRun("furnace", day, 5)[day - 1].build);
  return {
    v: SNAPSHOT_V3, rules: OLD, hero: "furnace", day, wins: day - 1, lives: 5, build, runId: `azbump-records-old-${day}`,
    playerId: "p-azbump", createdAt: 1_790_000_000_000, name: TEST_NAME, seed: parRunSeed("furnace", 5),
  };
}

/** tests/npc1.server.test.ts's honest run, through the game's own rules with the switches as shipped: `days` NPC days (each
 *  dawn's first rune, the fork's `tier`, a won warlord fight, the event's first open choice, REFIT, a dusk win),
 *  snapshotted at the last dusk with the uploader's name. */
function honest(hero: HeroId, seed: number, days: number, tier: Difficulty): GhostSnapshot {
  const run: Run = newRun(hero, seed, `azbump-records-${hero}-${seed}`);
  let snap: GhostSnapshot | null = null;
  for (let d = 1; d <= days; d++) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    leaveCaravan(run);
    expect(pickRoad(run, tier).ok).toBe(true);
    finishWarlord(run, 0, 20);
    onToTheRoad(run);
    const i = choicesFor(run).findIndex((c) => !c.blocked);
    if (i >= 0) pickChoice(run, i);
    onToTheRoad(run);
    leaveCaravan(run);
    snap = ghostOf(run, 1_790_000_000_000, "p-azbump", TEST_NAME);
    if (d < days) finishDay(run, 0, 30, { ...Z }, { ...Z });
  }
  return snap!;
}

describe("AZ-BUMP S6: a stored record is judged by its own rules (validate.ts inRulesWorld)", () => {
  it("the rules gate picks the world: bb-0.10.0 and later as the switches stand, older or unreadable rules with all three off", () => {
    // BUMP-1D: the bump moves RULES_VERSION to bb-0.11.0; NPC_DAY_RULES is a literal since AZ-BUMP and stays (was ["bb-0.10.0", "bb-0.10.0"])
    expect([RULES_VERSION, NPC_DAY_RULES]).toEqual(["bb-0.12.0", "bb-0.10.0"]); // BUMP-1E: the bump (was bb-0.11.0).
    const seen = (rules: unknown) => inRulesWorld(rules, () => [npcDayRules(), hullScaleRules(), ladderFixRules()]);
    expect(seen(RULES_VERSION)).toEqual([true, true, true]);
    expect(seen("bb-0.10.0")).toEqual([true, true, true]); // BUMP-1D: the rules the switches came on with, no longer this build's
    expect(seen("bb-0.10.1")).toEqual([true, true, true]);
    for (const r of [OLD, "bb-0.9.3", "bb-0.6.2", "nope", undefined]) expect(seen(r), String(r)).toEqual([false, false, false]);
    expect([npcDayRules(), hullScaleRules(), ladderFixRules()]).toEqual([true, true, true]); // each put back
    expect(() => inRulesWorld(OLD, () => { throw new Error("x"); })).toThrow("x");
    expect([npcDayRules(), hullScaleRules(), ladderFixRules()]).toEqual([true, true, true]); // put back on a throw too
  });

  it("a bb-0.9.7 record revalidates clean on the --rules bb-0.9.7 path, at its own budget's edge; one plate more is refused", () => {
    // the CLI reads only this build's rules: --rules bb-0.9.7 is a usage error (exit 2), so uploadProblems is called directly
    expect(() => parseArgs(["revalidate", "--rules", OLD])).toThrow(UsageError);
    const rows: string[] = [];
    let elsewhere = 0;
    for (const day of [1, 4, 8, 10]) {
      const s = oldRecord(day);
      const kOld = edge(s, (x) => old(() => validateBuild(x.build, x.day, "player").ok)); // bb-0.9.7's own budget
      const kNow = edge(s, (x) => validateBuild(x.build, x.day, "player").ok); // the global switches' (on): not its world
      rows.push(`d${day} ${kOld}/${kNow}`);
      expect(uploadProblems(stored(plated(s, kOld)), OLD), `d${day}`).toEqual([]);
      const over = uploadProblems(stored(plated(s, kOld + 1)), OLD);
      expect(over, `d${day}`).toHaveLength(1);
      expect(over[0], `d${day}`).toMatch(/^validateUpload: /);
      if (kNow !== kOld) elsewhere++;
    }
    console.log(`AZBUMP-RECORDS bb-0.9.7 par decks, plates to the edge (its world / the global switches'): ${rows.join(", ")}`);
    expect(elsewhere, rows.join(", ")).toBeGreaterThan(0); // the global switches would judge it otherwise: its rules decide
  }, 120_000);

  it("an honest bb-0.10.0 NPC-day record revalidates clean; without its road log, or with a forged drop, it is refused", () => {
    const s = honest("furnace", 77, 6, "hard"); // npc1.server's: its drops are worth more than a plate
    expect(s.rules).toBe(RULES_VERSION);
    expect(roadDropValue(s.road)).toBeGreaterThan(ITEMS.plating.price);
    const top = plated(s, edge(s, (x) => validateUpload(x.build, x.day, x.rules, { seed: x.seed, road: x.road }).ok));
    expect(uploadProblems(stored(top), RULES_VERSION)).toEqual([]);
    // without its road log the same deck is over budget: its drops count only through the log
    const bare = uploadProblems(stored({ ...top, road: undefined }), RULES_VERSION);
    expect(bare).toHaveLength(1);
    expect(bare[0]).toMatch(/^validateUpload: .*budget: /);
    // a forged drop: a part the seeded roll didn't give (another of that warlord's pool)
    const i = top.road!.findIndex((e) => e.outcome === "win" && e.drop !== undefined);
    const e = top.road![i];
    const other = dropPool(warlordDeck(warlordOffer(top.seed!, e.day)[e.tier], e.day)).find((d) => d !== e.drop)!;
    const forged = uploadProblems(stored({ ...top, road: top.road!.map((x, j) => (j === i ? { ...x, drop: other } : x)) }), RULES_VERSION);
    expect(forged).toHaveLength(1);
    expect(forged[0]).toMatch(new RegExp(`^validateUpload: road: day ${e.day}: the seeded roll of .+ gave ${e.drop}, not ${other}`));
    // the same honest record's text stamped bb-0.9.7: the decoder's gate refuses its road log, before any other check
    const rec = stored(top);
    // HULL-ON (the flip, HEARTS): the stamped copy also writes the lives its own rules mean. The honest run won every dusk:
    // HEARTS_START (10) hearts on bb-0.10.0's scale, START_LIVES (5) lives on bb-0.9.7's, whose decoder bound is 9
    // (rulesGate.ts livesCapFor), so a stamped 10 was refused first ("snapshot.lives: expected an integer in 1..9")
    expect(top.lives).toBe(HEARTS_START);
    // BUMP-1D (LONG_RUN ships on): and without the `losses` it carries (a long run's upload states the dusks lost, taken only under
    // long-run rules; a bb-0.9.7 client sends none): the decoder's gate refuses that field first ("snapshot.losses: not in this
    // rules version yet"), ahead of the road log under test. The honest run won every dusk, so its text holds "losses":0
    expect(top.losses).toBe(0);
    const older: StoredRecord = { ...rec, text: rec.text.replace(`"rules":"${RULES_VERSION}"`, `"rules":"${OLD}"`).replace(`"lives":${HEARTS_START},`, `"lives":${START_LIVES},`).replace(`,"losses":0`, "") };
    expect(older.text).not.toBe(rec.text);
    expect(older.text).not.toContain(`"losses"`);
    expect(uploadProblems(older, OLD)).toEqual([`strict decode: snapshot.road: rules ${OLD} predate ${NPC_DAY_RULES}: the road log (snapshot.road) needs ${NPC_DAY_RULES} or later`]);
  }, 120_000);
});
