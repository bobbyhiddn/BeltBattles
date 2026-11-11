// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-106; BRIEF-SCALE2d D5): the server and the upload check for the 12 scaling pieces
// (REPORT-SHAPES1 section 5's form). With SCALE_RIGS on (withScaleRigs / setScaleRigs; the shipped switch stays off) a
// build holding one of the seven new ids is accepted under this build's rules and refused under older ones (rulesGate.ts
// scaleGateProblem); with the switch off each is refused as an unknown item, as at the base. GRUDGE ROD reads hearts lost
// and TROPHY CHAIN wins, so a forged count is a forged damage number: the snapshot's (wins, lives) must be a record a run
// carries into that dusk (records.ts isReachable, the server's step 6), and a battle record's counts are held to the run's
// bounds (replay.ts readCountsProblem). The pin: the same bytes through the client check and a signed POST /v1/ghosts,
// both switch states. The server's data dir is under os.tmpdir() (run with TMPDIR set).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { canPlaceItem, cloneBuild, type Build } from "../src/sim/deck";
import { SCALE_IDS, scaleRules, setScaleRigs, withScaleRigs } from "../src/sim/scale";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { buildCost, maxHonestSpend, roadCap, validateUpload } from "../src/net/validate";
import { SCALE_RULES, heartsLostCapFor, scaleFeatures, scaleGateProblem, scaleWorld } from "../src/net/rulesGate";
import { isReachable, reachableRecords } from "../src/net/records";
import { MAX_LIVES, SNAPSHOT_V3, decodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { battleRecordFor, checkRecord, readCountsProblem } from "../src/net/replay";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const HERO: HeroId = "weaver", DAY = 6, SEED = 1;
/** The honest record the fixtures carry: 2 wins and the fewest hearts such a run can hold at day 6's dusk (some lost). */
const REC = reachableRecords(DAY).filter((r) => r.wins === 2).sort((a, b) => a.lives - b.lives)[0];

/** The par player's day-6 WEAVER deck (built with the switch off), its rigs taken off to free gold and cells. */
function baseDeck(): Build {
  const b = withScaleRigs(() => cloneBuild(playerRun(HERO, DAY, SEED)[DAY - 1].build), false);
  b.items = b.items.filter((p) => ITEMS[p.def].kind !== "gate");
  return b;
}
/** The first free cell (row order) where `def` fits, at rot 0 (the seven are one cell each). */
function spot(b: Build, def: string): { x: number; y: number } {
  for (let y = 1; y < 10; y++) for (let x = 0; x < 10; x++) if (canPlaceItem(b, def, x, y, -1, 0).ok) return { x, y };
  throw new Error(`no cell for ${def}`);
}
const snap = (name: string, build: Build, rec: { wins: number; lives: number } = REC): GhostSnapshot => ({
  v: SNAPSHOT_V3, rules: RULES_VERSION, hero: HERO, day: DAY, wins: rec.wins, lives: rec.lives, build, runId: `scale2d-${name}`,
  playerId: "p-scale2d", createdAt: 1_790_000_000_000, seed: parRunSeed(HERO, SEED),
  // BUMP-1E P1b (the scale tests move into the 0.9.11 world; was no `losses` field): since BUMP-1D (RUN-1; rules bb-0.11.0) a long run's
  // upload states the dusks it lost, or the server answers 422 "losses: ..."
  // (server/app.ts lossesProblem; day - 1 = wins + losses + draws). REC and the forgeries below hold no draw, so losses = day - 1 - wins
  // (3 for REC); the wins-past-day forgery is refused at the decoder's wins bound before `losses` is read
  losses: Math.max(0, DAY - 1 - rec.wins),
});
/** One deck per new id (switch on: canPlaceItem needs the def). */
function fixtures(): { id: string; build: Build }[] {
  const base = baseDeck();
  return withScaleRigs(() => SCALE_IDS.map((id, i) => {
    const b = cloneBuild(base), s = spot(b, id);
    b.items.push({ uid: 900 + i, def: id, x: s.x, y: s.y });
    return { id, build: b };
  }));
}
/** The client's check of the exact bytes: the strict decode, the deck (validateUpload by its rules) and the record
 *  (isReachable), the server's steps 4 and 6. */
function clientCheck(body: string): { ok: boolean; why: string } {
  let s: GhostSnapshot;
  try {
    s = decodeSnapshot(body);
  } catch (e) {
    return { ok: false, why: `decode: ${(e as Error).message}` };
  }
  const v = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
  if (!v.ok) return { ok: false, why: v.errors[0] };
  if (!isReachable(s.day, s.wins, s.lives, { lastChance: s.lastChance?.day ?? null })) return { ok: false, why: `record: ${s.wins}W ${s.lives} lives` };
  return { ok: true, why: "" };
}

describe("SCALE-2d D5: the gate by rules", () => {
  it("ships on (BUMP-1E; was off); off, the gate says nothing and a new id is an unknown item (the base's words)", () => {
    expect(scaleRules()).toBe(true); // BUMP-1E: was toBe(false)
    const fx = fixtures();
    // BUMP-1E: the off half asks for the 0.9.11 world outright (the switch ships on); was bare
    withScaleRigs(() => {
      for (const f of fx) {
        expect(scaleGateProblem(RULES_VERSION, f.build)).toBeNull();
        const v = validateUpload(f.build, DAY, RULES_VERSION, { seed: parRunSeed(HERO, SEED) });
        expect(v.ok).toBe(false);
        expect(v.errors.some((e) => e.includes(`is unknown item "${f.id}"`)), JSON.stringify(v.errors)).toBe(true);
      }
    }, false);
  });

  it("on: SCALE_RULES is this build's rules; older or unreadable rules refuse the new ids, naming them", () => {
    expect(SCALE_RULES).toBe("bb-0.12.0"); // BUMP-1E: was toBe(RULES_VERSION): SCALE_RULES is a literal from the flip on (a later bump leaves it)
    // BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): was expect(RULES_VERSION).toBe(SCALE_RULES) (both bb-0.12.0, "this build's rules are the first that have the twelve"). SCALE_RULES is a literal
    // gate (the rules that brought the twelve) and stays bb-0.12.0; this build's rules are bb-0.13.0, the version after it, and still have them (scaleWorld below)
    expect(RULES_VERSION).toBe("bb-0.15.0"); // BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0.
    expect(RULES_VERSION).not.toBe(SCALE_RULES);
    const f = fixtures().find((x) => x.id === "grudgerod")!;
    withScaleRigs(() => {
      expect(scaleFeatures(f.build)).toEqual(["scaling rigs (GRUDGE ROD)"]);
      expect(scaleWorld(RULES_VERSION)).toBe(true);
      expect(scaleWorld("bb-0.9.7")).toBe(false);
      expect(scaleGateProblem(RULES_VERSION, f.build)).toBeNull();
      expect(scaleGateProblem("bb-0.9.7", f.build)).toBe(`rules bb-0.9.7 predate ${SCALE_RULES}: scaling rigs (GRUDGE ROD) need ${SCALE_RULES} or later`);
      expect(scaleGateProblem("nonsense", f.build)).toMatch(/is not a bb-MAJOR\.MINOR\.PATCH version/);
      const old = validateUpload(f.build, DAY, "bb-0.9.7", { seed: parRunSeed(HERO, SEED) });
      expect(old.ok).toBe(false);
      // a deck without a new id has nothing to gate, whatever the rules
      expect(scaleGateProblem("bb-0.9.7", baseDeck())).toBeNull();
    });
    expect(scaleWorld(RULES_VERSION)).toBe(true); // BUMP-1E: the switch ships on, so it is back on (was toBe(false) // off)
    withScaleRigs(() => expect(scaleWorld(RULES_VERSION)).toBe(false), false); // off
  });

  it("the honest-spend ceiling holds with the new prices: roadCap and maxHonestSpend are the same off and on, days 1-10", () => {
    const off = withScaleRigs(() => [...Array(10).keys()].map((i) => [roadCap(i + 1), maxHonestSpend(i + 1)]), false); // BUMP-1E: the switch ships on; off is asked for (was bare)
    const on = withScaleRigs(() => [...Array(10).keys()].map((i) => [roadCap(i + 1), maxHonestSpend(i + 1)]));
    expect(on).toEqual(off);
    withScaleRigs(() => {
      expect(Object.fromEntries(["crowdpress", "grudgerod", "cindermail", "rotgauge", "leechcoil", "aegisspike", "trophychain", "shieldwall"].map((id) => [id, ITEMS[id].price])))
        .toEqual({ crowdpress: 3, grudgerod: 3, cindermail: 5, rotgauge: 5, leechcoil: 5, aegisspike: 5, trophychain: 7, shieldwall: 10 });
      // each fixture is within the player mode's budget (its cost counts the new piece at its price)
      for (const f of fixtures()) expect(buildCost(f.build).total, f.id).toBeLessThanOrEqual(maxHonestSpend(DAY));
    });
  });
});

describe("SCALE-2d D5: the hearts and wins bounds", () => {
  it("hearts lost: at most the start hearts less one, by the rules (10 hearts: 9; older rules' 5 lives: 4)", () => {
    expect(heartsLostCapFor(RULES_VERSION, MAX_LIVES)).toBe(9);
    expect(heartsLostCapFor("bb-0.9.7", MAX_LIVES)).toBe(4);
  });

  it("a record's counts (readCountsProblem): hearts lost past the cap, wins past the day, more hearts lost than the day allows", () => {
    expect(readCountsProblem(RULES_VERSION, 6, [2, 3], [3, 1])).toBeNull();
    expect(readCountsProblem(RULES_VERSION, undefined, [9, 9], [9, 9])).toBeNull(); // no day: the cap alone
    expect(readCountsProblem(RULES_VERSION, undefined, [0, 0], [10, 0])).toMatch(/hearts lost 10 is past 9/);
    expect(readCountsProblem(RULES_VERSION, 3, [3, 0], [0, 0])).toMatch(/3 wins can't come before day 3/);
    expect(readCountsProblem(RULES_VERSION, 2, [0, 0], [2, 0])).toMatch(/more than a run can lose before day 2's fight \(1\)/);
    expect(readCountsProblem(RULES_VERSION, 2, [0, 1], [1, 0])).toBeNull();
    expect(readCountsProblem("bb-0.9.7", undefined, [0, 0], [5, 0])).toMatch(/past 4/);
  });

  it("a stored battle record with a forged count is refused with SCALE_RIGS on, read as before off", () => {
    const f = fixtures().find((x) => x.id === "grudgerod")!;
    const foe = baseDeck();
    withScaleRigs(() => {
      const rec = battleRecordFor(f.build, foe, 7, [2, 1], DAY, [3, 2]);
      expect(rec.lost).toEqual([3, 2]);
      expect(() => checkRecord(rec)).not.toThrow();
      expect(() => checkRecord({ ...rec, lost: [9, 2] })).toThrow(/more than a run can lose before day 6's fight/);
      expect(() => checkRecord({ ...rec, wins: [6, 1] })).toThrow(/6 wins can't come before day 6/);
    });
    // off: `lost` is passed over and the wins keep their old bound (0..9), as at the base
    const rec = withScaleRigs(() => battleRecordFor(f.build, foe, 7, [2, 1], DAY, [3, 2]));
    withScaleRigs(() => expect(() => checkRecord({ ...rec, lost: [9, 2], wins: [6, 1] })).not.toThrow(), false); // BUMP-1E: the switch ships on; the off check asks for it (was bare)
  });
});

describe("SCALE-2d D5: the pin (the client check and POST /v1/ghosts, both switch states)", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  let wasOn = scaleRules(); // BUMP-1E: the switch ships on; this file puts it back as it found it (was setScaleRigs(false) at the end)
  beforeAll(async () => {
    wasOn = scaleRules();
    dir = mkdtempSync(join(tmpdir(), "bb-scale2d-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    setScaleRigs(wasOn); // BUMP-1E: was setScaleRigs(false)
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("on: one build per new id accepted; the same build with forged hearts lost or wins refused; off: each refused as unknown", async () => {
    const fx = fixtures();
    expect(fx.map((f) => f.id)).toEqual(["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"]);
    expect(REC.lives).toBeLessThan(10);
    const me = await testIdentity(0);
    const rows: string[] = [];
    // the forgeries: lives 1 (9 hearts lost by day 6, no LAST CHANCE: no run gets there), 5 wins with hearts lost (5 wins in 5
    // fights is no loss), and 6 wins (past day - 1: the decoder's bound)
    const cases: { name: string; rec: { wins: number; lives: number }; on: boolean }[] = [
      { name: "honest", rec: REC, on: true },
      { name: "forged-hearts", rec: { wins: REC.wins, lives: 1 }, on: false },
      { name: "forged-wins", rec: { wins: DAY - 1, lives: REC.lives }, on: false },
      { name: "wins-past-day", rec: { wins: DAY, lives: REC.lives }, on: false },
    ];
    for (const on of [true, false]) {
      setScaleRigs(on);
      for (const f of fx) {
        for (const c of cases) {
          if (!on && c.name !== "honest") continue;
          const body = JSON.stringify(ownedBy(snap(`${f.id}-${c.name}-${on ? "on" : "off"}`, f.build, c.rec), me));
          const client = clientCheck(body);
          const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
          const text = await r.text();
          rows.push(`${on ? "on " : "off"} ${f.id} ${c.name}: client ${client.ok ? "ok" : client.why} | server ${r.status} ${r.status === 201 ? "" : text.slice(0, 140)}`);
          expect(r.status === 201, `${f.id} ${c.name} ${on ? "on" : "off"}: server ${r.status} ${text.slice(0, 300)} vs client ${client.why}`).toBe(client.ok);
          expect(client.ok, `${f.id} ${c.name} ${on ? "on" : "off"}: ${client.why}`).toBe(on && c.on);
          if (!on) expect(client.why).toContain(`is unknown item "${f.id}"`);
        }
      }
    }
    setScaleRigs(wasOn); // BUMP-1E: was setScaleRigs(false)
    for (const r of rows) console.log(`S2D PIN ${r}`);
  }, 180_000);
});
