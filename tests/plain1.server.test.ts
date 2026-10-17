// PLAIN-1 (REQ-BFG-084.6; BRIEF-PLAIN1 P6, step 3): the upload check and the six plain stat rigs. The same fixtures, an
// honest day-1 FURNACE dusk (its start deck, its day-1 rune, as server/ghostProbe.ts's honest row) with one plain rig
// beside its belt, go through the client check (validateUpload in player mode) and POST /v1/ghosts (server/app.ts:
// validateUpload in player mode, then the record check), in both switch states: on, each is accepted (201); off, each is
// refused with the same line on both sides (no piece the rules don't hold is ever stored).
// BALLAST and the hull ceiling (P3): the server bounds a deck's hullBonus (a day-1 number: plating, the ARMOR PACK, HULL
// runes and road hull; validate.ts supply/budget, roadCap.ts), never a max hull. M(d) (HULL_SCALE) and BALLAST's % both
// apply where a battle starts (Battle.makeSide), from the deck itself, so the server's replay (src/net/replay.ts, the same
// Battle) gets BALLAST's hull with no line of its own; a BALLAST deck's hullBonus is checked exactly as before. Pinned
// below: the hull a BALLAST deck fights with and the unchanged supply verdict for a hull one ARMOR PACK over the budget.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HEROES, ITEMS, RULES_VERSION } from "../src/sim/content";
import { Battle } from "../src/sim/battle";
import { canPlaceItem, rigHits, rotField, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { PLAIN_RIGS, PLAIN_RIG_IDS, setPlainRigs } from "../src/sim/plainRigs";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { createGhostServer, type GhostServer } from "../server/app";
import { PROBE_SEED, probeRunes } from "../server/ghostProbe";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { barge, SEED } from "./wave3.helpers";
import { HEARTS_START } from "../src/sim/hearts"; // PLAIN-1F (M1): HEARTS (c099): day 1's record on hearts

afterEach(() => setPlainRigs(PLAIN_RIGS)); // the shipped value (BUMP-1D: on; it was false)

/** FURNACE's start deck with `def` on the first free cell beside its belt (its arrow turned onto the belt when one fits),
 *  then its day-1 rune. Built with the switch on (placement reads the def). */
function fixture(def: string): Build {
  const b = heroStartBuild("furnace");
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (!canPlaceItem(b, def, x, y).ok) continue;
    for (let rot = 0; rot < 4; rot++) {
      const p = { uid: 900, def, x, y, ...rotField(def, rot) };
      const t: Build = { ...b, items: [...b.items, p] };
      if (rigHits(t).flat(2).some((h) => h.uid === 900)) return probeRunes(t, 1); // canPlaceItem: never on a belt tile
    }
  }
  throw new Error(`no belt-side cell for ${def}`);
}

const snap = (build: Build, runId: string): GhostSnapshot => ({
  // PLAIN-1F (M1): re-pinned by cause, HEARTS (c099, HULL-ON's flip): day 1's record holds HEARTS_START (10) hearts, not 5
  // lives (as tests/net-upload.server.test.ts re-pinned it at HULL-ON)
  v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "furnace", day: 1, wins: 0, lives: HEARTS_START, build, runId, playerId: "p", createdAt: 1_760_000_000_000,
  name: "TESTER", seed: PROBE_SEED,
  // BUMP-1D (RUN-1, rules bb-0.11.0): a long run's upload states the dusks it lost (the server answers 422 "losses: ..." without it):
  // day 1 has had no dusk, so none (day - 1 = wins + losses + draws = 0)
  losses: 0,
});
const client = (b: Build) => validateUpload(b, 1, RULES_VERSION, { seed: PROBE_SEED });

describe("P6: the client check and POST /v1/ghosts, the same fixtures, both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-plain1-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("on: each of the six is accepted by both; off: each is refused by both, with the same line", async () => {
    const me = await testIdentity(0);
    const post = async (s: GhostSnapshot): Promise<{ status: number; body: { errors?: string[]; error?: string } }> => {
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: (await r.json()) as { errors?: string[]; error?: string } };
    };
    setPlainRigs(true);
    const fixtures = PLAIN_RIG_IDS.map((id) => ({ id, build: fixture(id) }));
    const lines: string[] = [];
    for (const { id, build } of fixtures) {
      setPlainRigs(true);
      expect(build.items.some((p) => p.def === id), id).toBe(true);
      expect(client(build).errors, `on: ${id}`).toEqual([]);
      const on = await post(snap(build, `plain1-on-${id}`));
      expect(on.status, `on: ${id} ${JSON.stringify(on.body)}`).toBe(201);
      setPlainRigs(false);
      const c = client(build);
      expect(c.ok, `off: ${id}`).toBe(false);
      const off = await post(snap(build, `plain1-off-${id}`));
      expect(off.status, `off: ${id}`).toBe(422);
      expect(off.body.errors, `off: ${id}`).toEqual(c.errors);
      lines.push(`${id}: ${c.errors[0]}`);
    }
    expect(app.store.size).toBe(PLAIN_RIG_IDS.length); // only the switch-on uploads were stored
    console.log(`PLAIN1 P6 off lines:\n${lines.join("\n")}`);
  });

  it("BALLAST: the server bounds hullBonus only, as before; the battle (and so the replay) fights with its %", () => {
    setPlainRigs(true);
    const b = fixture("ballast");
    const h = HEROES.furnace.hull + b.hullBonus;
    expect(new Battle(b, barge(), SEED).sides[0].hull.max).toBe(Math.floor((h * 108) / 100));
    const pack = ITEMS.plating.supply!.hull!;
    const over = { ...b, hullBonus: b.hullBonus + 4 * pack };
    const withBallast = client(over).errors.filter((e) => e.startsWith("budget:") || e.startsWith("supply:"));
    const noBallast = client({ ...over, items: over.items.filter((p) => p.def !== "ballast") }).errors.filter((e) => e.startsWith("budget:") || e.startsWith("supply:"));
    expect(withBallast.length).toBeGreaterThan(0); // four ARMOR PACKs over day 1's budget: refused, as without it
    expect(withBallast.map((e) => e.replace(/\d+/g, "#"))).toEqual(noBallast.map((e) => e.replace(/\d+/g, "#")));
  });
});
