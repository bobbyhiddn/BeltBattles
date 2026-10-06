// Z-PREP (REQ-BFG-073; LC-1 REPORT 9.3): the uploads step's probe (server/ghostProbe.ts) gets LAST CHANCE's two rows only
// while the switch is on: an honest LAST CHANCE upload (FURNACE, the HULL card, dusk 6 at 0W 2L after a LAST CHANCE on
// day 5, with its seed) for 201, and the same with its LAST CHANCE on day 3 for the record's 422. With the switch off the
// plan is today's nine rows, byte for byte (tests/ghost-probe.test.ts runs it end to end, unchanged).
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGhostServer } from "../server/app";
import { JsonlStore } from "../server/store";
import { LC_DUSK, PROBE_SEED, PROBE_STORED, probePlan, probeStored, runProbe } from "../server/ghostProbe";
import { LAST_CHANCE_HULL, setLastChance, withLastChance } from "../src/sim/lastChance";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { decodeSnapshot, encodeSnapshot, ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { isReachable } from "../src/net/records";

const NINE = ["furnace-signed", "furnace-unsigned", "dishonest-signed", "unreachable-signed", "hero-WEAVER", "hero-FOUNDRY", "hero-BASTION", "hero-METRONOME", "hero-SIPHON"];
const ELEVEN = [...NINE, "lastchance-signed", "lastchance-day3"];
const NOW = 1_790_000_000_000;
const rows = (plan: ReturnType<typeof probePlan>) => plan.map((p) => [p.name, p.text, p.signed, p.expected]);
const ctx = (s: GhostSnapshot) => ({ seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}) });

afterEach(() => setLastChance(false));

describe("Z-PREP: the probe's LAST CHANCE rows", () => {
  it("switch off: the plan is today's nine rows in order, none carries a lastChance, and 4 decks are expected", () => withLastChance(() => {
    const plan = probePlan("p-zprep", NOW);
    expect(plan.map((p) => p.name)).toEqual(NINE);
    expect(plan.some((p) => p.snapshot.lastChance !== undefined || p.text.includes("lastChance"))).toBe(false);
    expect([probeStored(), PROBE_STORED]).toEqual([4, 4]);
  }, false));

  it("switch on: the nine rows unchanged, then the two flip rows; the honest one passes POST's checks, the forged one fails only the record", () => {
    const off = withLastChance(() => probePlan("p-zprep", NOW), false);
    withLastChance(() => {
      const on = probePlan("p-zprep", NOW);
      expect(on.map((p) => p.name)).toEqual(ELEVEN);
      expect(rows(on.slice(0, 9))).toEqual(rows(off)); // the first nine, byte for byte
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
    expect(rows(withLastChance(() => probePlan("p-zprep", NOW), false))).toEqual(rows(off)); // and off again: today's
  });

  it("switch on, end to end: eleven checks as expected against a fresh server, which stores five decks", async () => {
    setLastChance(true);
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
