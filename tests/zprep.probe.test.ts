// Z-PREP (REQ-BFG-073; LC-1 REPORT 9.3): the uploads step's probe (server/ghostProbe.ts) gets LAST CHANCE's two rows: an
// honest LAST CHANCE upload (FURNACE, the HULL card, dusk 6 at 0W 2L after a LAST CHANCE on day 5, with its seed) for
// 201, and the same with its LAST CHANCE on day 3 for the record's 422, after today's nine rows, which stay byte for byte.
// Z-BUMP (REQ-BFG-073, the flip): LAST CHANCE is the game's rule and its switch is gone, so the plan is the eleven rows
// (PROBE_RULES has LAST CHANCE: the rules gate) and these tests are plain. The nine rows the plan had before the flip
// (the whole plan with the switch off) are its first nine, pinned by their bytes' digest (PRE_FLIP_NINE).
import { describe, expect, it } from "vitest";
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
const PRE_FLIP_NINE = "bb8341cb5d8178ecabb1c04d02ffefed8e21dcb7cd39ce5419fed0d237c8f080";

describe("Z-PREP: the probe's LAST CHANCE rows", () => {
  it("the plan: the nine rows it had before the flip first (in order, byte for byte, none carries a lastChance), then the two LAST CHANCE rows; 5 decks are expected", () => {
    const plan = probePlan("p-zprep", NOW);
    expect(plan.map((p) => p.name)).toEqual(ELEVEN); // Z-BUMP (the flip): was NINE, the whole plan with the switch off
    const nine = plan.slice(0, 9);
    expect(digest(rows(nine))).toBe(PRE_FLIP_NINE); // Z-BUMP: the first nine, byte for byte the plan before the flip
    expect(nine.some((p) => p.snapshot.lastChance !== undefined || p.text.includes("lastChance"))).toBe(false);
    expect([probeStored(), PROBE_STORED]).toEqual([5, 4]); // Z-BUMP (the flip): was [4, 4]; the nine rows still store 4
  });

  it("the nine rows unchanged, then the two flip rows; the honest one passes POST's checks, the forged one fails only the record", () => {
    const on = probePlan("p-zprep", NOW);
    expect(on.map((p) => p.name)).toEqual(ELEVEN);
    expect(digest(rows(on.slice(0, 9)))).toBe(PRE_FLIP_NINE); // the first nine, byte for byte (Z-BUMP: was rows(off), the switch-off plan)
    const [h, f] = on.slice(9);
    // the honest row: FURNACE's start deck, its six dawn runes on PROBE_SEED, +LAST_CHANCE_HULL; the encoder's bytes
    expect(h.snapshot).toMatchObject({ hero: "furnace", ...LC_DUSK, seed: PROBE_SEED, lastChance: { day: 5, boon: "hull" } });
    expect(h.snapshot.build.runes).toHaveLength(6);
    expect(h.snapshot.build.hullBonus).toBeGreaterThanOrEqual(heroStartBuild("furnace").hullBonus + LAST_CHANCE_HULL);
    expect(h.text).toBe(encodeSnapshot(h.snapshot));
    expect(decodeSnapshot(h.text).lastChance).toEqual({ day: 5, boon: "hull" });
    expect(validateUpload(h.snapshot.build, h.snapshot.day, h.snapshot.rules, ctx(h.snapshot))).toEqual({ ok: true, errors: [] });
    expect(isReachable(6, 0, 2, { lastChance: 5 })).toBe(true);
    expect([h.signed, h.expected]).toEqual([true, `201 {"id":"${ghostId(h.snapshot)}"}`]);
    // the forged row: the same deck, its LAST CHANCE on day 3: a deck POST takes, a record no run carries
    expect(f.snapshot.lastChance).toEqual({ day: 3, boon: "hull" });
    expect(f.snapshot.build).toEqual(h.snapshot.build);
    expect(validateUpload(f.snapshot.build, f.snapshot.day, f.snapshot.rules, ctx(f.snapshot)).ok).toBe(true);
    expect(isReachable(6, 0, 2, { lastChance: 3 })).toBe(false);
    expect([f.signed, f.expected]).toEqual([true, "422 record: 0W 2 lives is no record a run carries into dusk 6 after a LAST CHANCE on day 3"]);
    expect(probeStored()).toBe(5);
  });

  it("end to end: eleven checks as expected against a fresh server, which stores five decks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-zprep-probe-"));
    const store = new JsonlStore(join(dir, "data"));
    store.load();
    const app = createGhostServer({ store, uploads: "open", log: () => {} });
    try {
      const base = `http://127.0.0.1:${await app.listen(0)}`;
      const r = await runProbe(base, () => {}, 15_000, NOW);
      expect(r.checks.map((c) => [c.name, c.ok])).toEqual(ELEVEN.map((n) => [n, true]));
      expect(r.checks[9].got).toMatch(/^201 \{"id":"g[0-9a-f]{14}"\}$/);
      expect(r.checks[10].got).toBe("422 record: 0W 2 lives is no record a run carries into dusk 6 after a LAST CHANCE on day 3");
      expect([r.ok, r.stored, probeStored()]).toEqual([true, 5, 5]);
    } finally {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
