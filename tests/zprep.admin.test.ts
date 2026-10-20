// Z-PREP (REQ-BFG-073; REVIEW-LC1, carried to the flip): ghosts:admin revalidate (server/ghostAdmin.ts uploadProblems,
// the check it runs on every stored upload) checks a LAST CHANCE upload as POST /v1/ghosts checked it: validateUpload
// told its seed and its card, and the record check told its LAST CHANCE day (or none). Honest uploads are the par
// player's own LAST CHANCE runs (as tests/lc1.server.test.ts makes them), each at its budget's edge.
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule and its switch is gone, so these tests are plain. What
// the switch's off side showed is read now from a record stored under older rules (bb-0.9.1, before LAST_CHANCE_RULES),
// which the rules gate reads without LAST CHANCE (rulesGate.ts lastChanceGateProblem, records.ts recordHasLastChance).
import { describe, expect, it } from "vitest";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { LAST_CHANCE_HULL, lastChanceOffer, lastChanceParts, type Boon } from "../src/sim/lastChance";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { inEnchantWorld, inGatesWorld, inScaleWorld, inShapes2World, inShapesWorld, validateUpload } from "../src/net/validate"; // SHAPES-1 flip: an older record's deck in its shapes world; BUMP-1F: and in the other worlds (gates, scale, enchant, shapes2) validate.ts nests
import { isReachable } from "../src/net/records";
import { LAST_CHANCE_RULES } from "../src/net/rulesGate"; // Z-BUMP: the gate's words for a record under older rules
import { uploadProblems, type StoredRecord } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import { TEST_NAME } from "./netIdentity";
import type { Build } from "../src/sim/deck";
import { openRunesRules } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the par player's card rule

// HULL-ON (the flip, HEARTS): 5 -> 6, the record model of this build's rules is the hearts one (heartsFor): six losses
// leave 9 8 7 5 3 hearts and then 1 or fewer at dusk 6, so LAST CHANCE fires there and sets 1 heart (on 5 lives five losses,
// the early-loss refund lifting day 3, left 1 life at dusk 5)
const D = 6;
const PLATE = ITEMS.plating.supply!.hull!;

/** An honest upload at dusk 7 after a LAST CHANCE on day D that took `boon`: the par player's deck and run seed. */
function honest(boon: Boon, hero: HeroId = "furnace", seed = 5): GhostSnapshot {
  const runSeed = parRunSeed(hero, seed);
  const before = playerRun(hero, D, seed)[D - 1].build;
  // HULL-ON (the flip, OPEN_RUNES): the par player takes the card on the switch's offer rule (open: no runeFits filter), the
  // rule the server re-derives for this build's rules (openRunesFor(RULES_VERSION))
  const offer = lastChanceOffer(runSeed, D, hero, (before.runes ?? []).map((q) => q.id), openRunesRules());
  const build = playerRun(hero, D + 1, seed, { lastChance: { day: D, boon } })[D].build;
  const id = boon === "rune" ? offer.rune!.id : boon === "part" ? offer.part! : undefined;
  return {
    // HULL-ON (the flip, HEARTS): lives 2 -> 1 (LAST CHANCE sets 1 heart)
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day: D + 1, wins: 0, lives: 1, build, runId: `zprep-${hero}-${seed}-${boon}`,
    playerId: "p-zprep", createdAt: 1_790_000_000_000, name: TEST_NAME, seed: runSeed, lastChance: { day: D, boon, ...(id ? { id } : {}) },
  };
}

/** POST's own check (server/app.ts): the seed and the card. */
const check = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });

/** `s` with whole plates added up to the most POST's check takes (the deck at its budget's edge). */
function fillPlates(s: GhostSnapshot): GhostSnapshot {
  let k = 0;
  const at = (n: number): GhostSnapshot => ({ ...s, build: { ...s.build, hullBonus: s.build.hullBonus + n * PLATE } as Build });
  while (k < 60 && check(at(k + 1)).ok) k++;
  return at(k);
}

/** `s` as the store holds an upload (JSON lines: {id, at, snapshot}). */
const stored = (s: GhostSnapshot, id = ghostId(s)): StoredRecord => ({
  ref: "ghosts.jsonl:1", kind: "upload", day: s.day, id, playerId: s.playerId, text: encodeRecord(id, 5, s), keyed: false,
});

/** Z-BUMP: a rules version before LAST_CHANCE_RULES (it stays older after the bump too). */
const OLDER = "bb-0.9.1";

/** BUMP-1F (RULING-BUMP1F-R5 R5.2 (2): GATES and ENCHANT ship on; was inShapesWorld alone): run `fn` in the world OLDER's rules were played in, the
 *  worlds validate.ts nests for a stored record's deck (gates outermost, then shapes, shapes2, scale, enchant innermost), each turning its switch off for
 *  rules before its own: the par player buys no converter and takes no word there (a bb-0.9.1 record holding an `ench` is "snapshot.build.items[0].ench:
 *  unknown field" to the strict decoder), as every ITEMS-keeping world function leaves ITEMS as it found it (BUMP-1F F1). */
const inOlderWorld = <T,>(fn: () => T): T =>
  inGatesWorld(OLDER, () => inShapesWorld(OLDER, () => inShapes2World(OLDER, () => inScaleWorld(OLDER, () => inEnchantWorld(OLDER, fn)))));

describe("Z-PREP: ghosts:admin revalidate and a stored LAST CHANCE upload", () => {
  it("an honest LAST CHANCE upload at its budget's edge revalidates clean, each card; the old call refused each one", () => {
    for (const hero of ["furnace", "bastion"] as HeroId[]) {
      for (const boon of ["rune", "part", "hull"] as Boon[]) {
        const s = fillPlates(honest(boon, hero));
        expect(check(s).ok, `${hero} ${boon}`).toBe(true);
        expect(uploadProblems(stored(s), RULES_VERSION), `${hero} ${boon}`).toEqual([]);
        // what revalidate called before Z-PREP: validateUpload without the seed and the card (one rune too many, the hull
        // counted as bought, the part's price) ...
        const old = validateUpload(s.build, s.day, s.rules);
        expect(old.ok, `${hero} ${boon}`).toBe(false);
        // HULL-ON (the flip, HEARTS): 7 held on day 6 -> 8 held on day 7
        expect(old.errors.join(), `${hero} ${boon}`).toMatch(boon === "rune" ? /^rune: runes: 8 held on day 7, at most one a dawn/ : /^(budget|supply): /);
      }
    }
    // ... and the record check needs its LAST CHANCE day: 0W 2 lives at dusk 6 after one on day 5, never after one on day 3
    // HULL-ON (the flip, HEARTS): the hearts record, 0W 1 heart at dusk 7 after one on day 6, never after one on day 3
    expect([isReachable(7, 0, 1, { lastChance: D }), isReachable(7, 0, 1, { lastChance: 3 })]).toEqual([true, false]);
  });

  it("a forged one fails, each with POST's line: a LAST CHANCE on day 3, a part not on offer, the hull twice, 1 life with none", () => {
    const h = honest("hull");
    expect(uploadProblems(stored({ ...h, lastChance: { day: 3, boon: "hull" } }), RULES_VERSION)) // HULL-ON (HEARTS): 0W 2, dusk 6 -> 0W 1, dusk 7
      .toEqual(["record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3"]);
    const p = honest("part");
    const offered = p.lastChance!.id!;
    const wrong = lastChanceParts().find((d) => d.id !== offered)!.id;
    expect(uploadProblems(stored({ ...p, lastChance: { day: D, boon: "part", id: wrong } }), RULES_VERSION))
      .toEqual([`validateUpload: lastChance: part ${wrong} was not in the LAST CHANCE offer of day ${D} (it offered ${offered})`]);
    const edge = fillPlates(h);
    const twice = { ...edge, build: { ...edge.build, hullBonus: edge.build.hullBonus + LAST_CHANCE_HULL } };
    expect(uploadProblems(stored(twice), RULES_VERSION).join()).toMatch(/^validateUpload: (budget|supply): /);
    // an upload without a LAST CHANCE: the record check is told none, so 1 life at dusk 6 is no record (the loss that left
    // it would have fired one); its deck is checked exactly as before (no seed, as today's revalidate)
    const par: GhostSnapshot = {
      v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "furnace", day: 6, wins: 0, lives: 1, build: playerRun("furnace", 6, 5)[5].build,
      runId: "zprep-plain", playerId: "p-zprep", createdAt: 1_790_000_000_000, name: TEST_NAME, seed: parRunSeed("furnace", 5),
    };
    expect(uploadProblems(stored(par), RULES_VERSION)).toEqual(["record: 0W 1 lives is no record a run carries into dusk 6"]);
    // Z-BUMP (the flip; was: the switch off, the same call clean): the same upload stored under older rules is read by
    // those rules, without LAST CHANCE: their record model carries 1 life into dusk 6, so it revalidates clean under its
    // own rules version (an honest record: the encoder writes it and gives its id; older rules are asked no name)
    // SHAPES-1 flip (step 8): its deck is the same par run made in bb-0.9.1's world, SHAPES off (validate.ts inShapesWorld
    // judges it so); with SHAPES on the par player buys shaped rigs, which rules before bb-0.10.0 refuse (shapesGateProblem)
    // BUMP-1F (GATES and ENCHANT ship on): and in bb-0.9.1's gates, scale and enchant worlds too (inOlderWorld; was inShapesWorld(OLDER, ...) alone): the par player
    // takes no word and buys no converter there
    const older: GhostSnapshot = { ...par, rules: OLDER, build: inOlderWorld(() => playerRun("furnace", 6, 5)[5].build) };
    expect(uploadProblems(stored(older), OLDER)).toEqual([]);
  });

  it("under older rules (bb-0.9.1): a stored LAST CHANCE upload is refused by the strict decoder in the rules gate's words (as POST refuses it); without the field, as before", () => {
    const s = honest("rune");
    // Z-BUMP (the flip; was: written with the switch on, read with it off): the same upload stamped with rules before
    // LAST_CHANCE_RULES. No encoder writes it (the gate refuses the field there: the point), so it keeps the id of the
    // upload under this build's rules; the decoder refuses it before any id is read
    // BUMP-1F (GATES and ENCHANT ship on): the stamped upload's deck is made in bb-0.9.1's world (inOlderWorld), so the strict decoder's first refusal is still the
    // LAST CHANCE gate's (was ...s, whose shipped-world deck holds words, and the decoder said "snapshot.build.items[0].ench: unknown field" first)
    const rec = stored({ ...s, rules: OLDER, build: inOlderWorld(() => honest("rune").build) }, ghostId(s));
    expect(uploadProblems(rec, OLDER)).toEqual([
      `strict decode: snapshot.lastChance: rules ${OLDER} predate ${LAST_CHANCE_RULES}: LAST CHANCE (snapshot.lastChance) needs ${LAST_CHANCE_RULES} or later`,
    ]);
    // the same deck without its lastChance: today's checks, today's words (one rune too many for its day)
    // HULL-ON (the flip, HEARTS): and the record line too: 0W 1 heart at dusk 7 is no hearts record without its LAST
    // CHANCE (the loss that left it would have fired one; the 5-life record, 0W 2 lives at dusk 6, was one); 7 held on day
    // 6 -> 8 held on day 7
    const { lastChance: _lc, ...plain } = s;
    expect(uploadProblems(stored(plain), RULES_VERSION)).toEqual([`validateUpload: ${validateUpload(plain.build, plain.day, plain.rules).errors.join("; ")}`, "record: 0W 1 lives is no record a run carries into dusk 7"]);
    expect(uploadProblems(stored(plain), RULES_VERSION)[0]).toMatch(/^validateUpload: rune: runes: 8 held on day 7, at most one a dawn/);
  });
});
