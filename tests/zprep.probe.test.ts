// Z-PREP (REQ-BFG-073; LC-1 REPORT 9.3): the uploads step's probe (server/ghostProbe.ts) gets LAST CHANCE's two rows: an
// honest LAST CHANCE upload (FURNACE, the HULL card, dusk 6 at 0W 2L after a LAST CHANCE on day 5, with its seed) for
// 201, and the same with its LAST CHANCE on day 3 for the record's 422, after today's nine rows, which stay byte for byte.
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule and its switch is gone, so the plan is the eleven rows
// (PROBE_RULES has LAST CHANCE: the rules gate) and these tests are plain. The nine rows the plan had before the flip
// (the whole plan with the switch off) are its first nine, pinned by their bytes' digest (PRE_FLIP_NINE).
// HULL-ON (the flip; cap's ruling 12a42239093fb6ec, Q2): with HEARTS on, the probe's rows follow the hearts rule through
// heartsFor(PROBE_RULES): the start rows hold 10 hearts and the LAST CHANCE rows sit at dusk 7 at 0W 1 heart after a
// LAST CHANCE on day 6 (9 8 7 5 3, then 1); with OPEN_RUNES on, the honest decks' dawn runes come from the open offers
// (openRunesFor(PROBE_RULES)). So the first nine rows' bytes are FLIP_NINE now; with HEARTS and OPEN_RUNES off they are
// still PRE_FLIP_NINE byte for byte (the pre-hearts plan: 5 lives, as before).
import { describe, expect, it } from "vitest";
import { probeLastChance } from "../server/ghostProbe"; // HULL-ON (HEARTS): the hearts rule's LAST CHANCE row
import { withHearts } from "../src/sim/hearts"; // HULL-ON: the pre-hearts plan (the off check)
import { withOpenRunes } from "../src/sim/openRunes"; // HULL-ON: the pre-open-pool runes (the off check)
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { LC_DUSK, PROBE_SEED, PROBE_STORED, probePlan, probeStored, runProbe } from "../server/ghostProbe";
import { LAST_CHANCE_HULL } from "../src/sim/lastChance";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { isReachable } from "../src/net/records";

const NINE = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON"];
const ELEVEN = [...NINE, "lastchance-signed", "lastchance-day3"];
// AZ-BUMP (the bump to bb-0.10.0; REQ-BFG-077, REQ-BFG-078): the NPC day's two rows follow LAST CHANCE's
const THIRTEEN = [...ELEVEN, "npcday-signed", "npcday-forged"];
const NOW = 1_790_000_000_000;
const rows = (plan: ReturnType<typeof probePlan>) => plan.map((p) => [p.name, p.text, p.signed, p.expected]);
const ctx = (s: GhostSnapshot) => ({ seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });
/** sha256 of a value's JSON (key order included), as tests/botsx.runes.test.ts pins bytes from before a change. */
const digest = (x: unknown): string => createHash("sha256").update(JSON.stringify(x)).digest("hex");
/**
 * Z-BUMP (the flip): digest(rows(plan)) of the plan before the flip, probePlan("p-zprep", NOW) on zbump 9d82f93 with the
 * switch off (its shipped value: the nine rows); with it on there, the first nine rows gave the same digest. Every row
 * carries this build's rules (bb-0.9.3) and the 201 rows their ghost ids, so the bump moves it (re-pinned there).
 */
// Z-BUMP (the bump): each of the nine rows' bytes carries this build's rules (now bb-0.9.7) and the 201 rows their
// ghost ids, so the digest moved with the rules string; was c39396ca... under bb-0.9.3 (the flip commit, where it equals the
// pre-flip build's own nine rows, flip-T3.md)
// AZ-BUMP (the bump): the nine rows' bytes carry this build's rules, now bb-0.10.0, so the digest moved again with
// the rules string; was bb8341cb... under bb-0.9.7 (Z-BUMP's pin). The nine rows are otherwise as before, in order
const PRE_FLIP_NINE = "3e2f6adeffe09f9c102792286d97eefe0201e81ad97c4f5d119a9faabf3c7847";
/** HULL-ON (the flip, HEARTS and OPEN_RUNES; ruling 12a42239093fb6ec): digest(rows(plan.slice(0, 9))) with every switch on:
 *  the start rows at 10 hearts (HEARTS: was 5 lives) and BASTION's, METRONOME's and SIPHON's dawn runes from the open
 *  offers (OPEN_RUNES). With HEARTS alone off it reads 3c5741a1...; with both off, PRE_FLIP_NINE. */
const FLIP_NINE = "9db1302669b581ca9a609261609ccf03bb83cc2e5a3618a880a6911a05d8f03a";
/** HULL-ON (the off check): the plan with HEARTS and OPEN_RUNES off, the probe's rows as before the flip. */
const preFlipPlan = () => withHearts(() => withOpenRunes(() => probePlan("p-zprep", NOW), false), false);

describe("Z-PREP: the probe's LAST CHANCE rows", () => {
  it("the plan: the nine rows it had before the flip first (in order, byte for byte, none carries a lastChance), then the two LAST CHANCE rows and the NPC day's two (AZ-BUMP); 6 decks are expected", () => {
    const plan = probePlan("p-zprep", NOW);
    expect(plan.map((p) => p.name)).toEqual(THIRTEEN); // AZ-BUMP (the bump): was ELEVEN. Z-BUMP (the flip): was NINE, the whole plan with the switch off
    const nine = plan.slice(0, 9);
    expect(digest(rows(nine))).toBe(FLIP_NINE); // HULL-ON (the flip, HEARTS and OPEN_RUNES): was PRE_FLIP_NINE. Z-BUMP: the first nine, byte for byte the plan before the flip
    expect(digest(rows(preFlipPlan().slice(0, 9)))).toBe(PRE_FLIP_NINE); // HULL-ON: with HEARTS and OPEN_RUNES off, byte for byte as before
    expect(nine.some((p) => p.snapshot.lastChance !== undefined || p.text.includes("lastChance"))).toBe(false);
    expect([probeStored(), PROBE_STORED]).toEqual([6, 4]); // AZ-BUMP (the bump): was [5, 4] (the NPC day's honest row stores one more). Z-BUMP (the flip): was [4, 4]; the nine rows still store 4
  });

  it("the nine rows unchanged, then the two flip rows; the honest one passes POST's checks, the forged one fails only the record", () => {
    const on = probePlan("p-zprep", NOW);
    expect(on.map((p) => p.name)).toEqual(THIRTEEN); // AZ-BUMP (the bump): was ELEVEN
    expect(digest(rows(on.slice(0, 9)))).toBe(FLIP_NINE); // HULL-ON (the flip, HEARTS and OPEN_RUNES): was PRE_FLIP_NINE. The first nine, byte for byte (Z-BUMP: was rows(off), the switch-off plan)
    const [h, f] = on.slice(9, 11); // AZ-BUMP: LAST CHANCE's two rows (the NPC day's two follow)
    // HULL-ON (the flip, HEARTS; ruling 12a42239093fb6ec): the hearts rule's LAST CHANCE: a run that loses every dusk holds
    // 9 8 7 5 3, then 1 at dusk 6, where LAST CHANCE fires (it sets the hearts to 1), so the row is dusk 7 at 0W 1 heart
    // after a LAST CHANCE on day 6, with seven dawn runes (was dusk 6 at 0W 2L after one on day 5, six runes: LC_DUSK, 5 lives)
    expect(probeLastChance()).toEqual({ dusk: { day: 7, wins: 0, lives: 1 }, day: 6 });
    expect(withHearts(() => probeLastChance(), false)).toEqual({ dusk: LC_DUSK, day: 5 }); // the off check: as before
    // the honest row: FURNACE's start deck, its seven dawn runes on PROBE_SEED, +LAST_CHANCE_HULL; the encoder's bytes
    expect(h.snapshot).toMatchObject({ hero: "furnace", day: 7, wins: 0, lives: 1, seed: PROBE_SEED, lastChance: { day: 6, boon: "hull" } }); // HULL-ON (HEARTS): was ...LC_DUSK, day 5
    expect(h.snapshot.build.runes).toHaveLength(7); // HULL-ON (HEARTS): was 6 (dusk 6)
    expect(h.snapshot.build.hullBonus).toBeGreaterThanOrEqual(heroStartBuild("furnace").hullBonus + LAST_CHANCE_HULL);
    expect(h.text).toBe(encodeSnapshot(h.snapshot));
    expect(decodeSnapshot(h.text).lastChance).toEqual({ day: 6, boon: "hull" }); // HULL-ON (HEARTS): was day 5
    expect(validateUpload(h.snapshot.build, h.snapshot.day, h.snapshot.rules, ctx(h.snapshot))).toEqual({ ok: true, errors: [] });
    expect(isReachable(7, 0, 1, { lastChance: 6 })).toBe(true); // HULL-ON (HEARTS): was isReachable(6, 0, 2, { lastChance: 5 })
    expect([h.signed, h.expected]).toEqual([true, `201 {"id":"${ghostId(h.snapshot)}"}`]);
    // the forged row: the same deck, its LAST CHANCE on day 3: a deck POST takes, a record no run carries
    expect(f.snapshot.lastChance).toEqual({ day: 3, boon: "hull" });
    expect(f.snapshot.build).toEqual(h.snapshot.build);
    expect(validateUpload(f.snapshot.build, f.snapshot.day, f.snapshot.rules, ctx(f.snapshot)).ok).toBe(true);
    expect(isReachable(7, 0, 1, { lastChance: 3 })).toBe(false); // HULL-ON (HEARTS): was isReachable(6, 0, 2, { lastChance: 3 })
    expect([f.signed, f.expected]).toEqual([true, "422 record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3"]); // HULL-ON (HEARTS): was "0W 2 lives ... dusk 6 ..."
    expect(probeStored()).toBe(6); // AZ-BUMP: the bump (was 5; the NPC day's honest row)
  });

  it("end to end: thirteen checks as expected against a fresh server, which stores six decks (AZ-BUMP: was eleven and five)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-zprep-probe-"));
    const store = new JsonlStore(join(dir, "data"));
    store.load();
    const app = createGhostServer({ store, uploads: "open", log: () => {} });
    try {
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const r = await runProbe(base, () => {}, 15_000, NOW);
      expect(r.checks.map((c) => [c.name, c.ok])).toEqual(THIRTEEN.map((n) => [n, true])); // AZ-BUMP: was ELEVEN
      expect(r.checks[9].got).toMatch(/^201 \{"id":"g[0-9a-f]{14}"\}$/);
      expect(r.checks[10].got).toBe("422 record: 0W 1 lives is no record a run carries into dusk 7 after a LAST CHANCE on day 3"); // HULL-ON (the flip, HEARTS): was "0W 2 lives ... dusk 6 ..."
      expect([r.ok, r.stored, probeStored()]).toEqual([true, 6, 6]); // AZ-BUMP: the bump (was [true, 5, 5])
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
