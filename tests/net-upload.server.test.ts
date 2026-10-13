import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ITEMS, RULES_VERSION } from "../src/sim/content";
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { validateBuild, validateUpload, maxHonestSpend } from "../src/net/validate";
import { roadOptions } from "../src/net/roadCap";
import { floorRecord } from "../src/net/records";
import { createGhostServer, type GhostServer } from "../server/app";
import { driveRun, type DriverRun } from "./uploadDriver";
import { snap, upSnap } from "./netHelpers";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): day 1's record on hearts

// v070-validate M2: the two call sites that now use the player mode, end to end. POST /v1/ghosts
// (server/app.ts) and fetchGhost's check of a served ghost (ghostClient.ts) accept an honest player deck the
// strict check refuses (dock PLATING, RIDE THROUGH, road value), and still refuse one over the player ceiling.
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes. The driver's decks take each dawn's
// rune (tests/uploadDriver.ts) and travel as v3; the hand-built decks below hold their day's neutral runes (upSnap).

let dir: string;
let app: GhostServer;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bb-v070-"));
  app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

function req(over: Partial<GhostRequest> = {}): GhostRequest {
  return { rules: RULES_VERSION, day: 1, wins: 0, lives: 3, playerId: "me", seen: [], hero: "furnace", seed: 7, ...over };
}

// NUM-1 (x10): the road's hull choices as the live events give them (roadCap.ts roadOptions), and a plate's hull
const DOCK_PLATING = roadOptions().get("dock")!.find((o) => o.label === "PLATING")!.hull; // +200 (was +20)
const RIDE_THROUGH = roadOptions().get("storm")!.find((o) => o.label === "RIDE THROUGH")!.hull; // -100 (was -10)
const PLATE = ITEMS.plating.supply!.hull!; // +250 (was +25)

/** The driver's honest dusks the snapshots below leave out: each holds a warlord's drop that only its road log accounts for
 *  (NPC-1: with NPC_DAY on a fight's drop counts through the log, never in roadCap), and these snapshots carry no log. */
const needsLog: DriverRun["dusks"] = [];

/** Honest dusk decks from the driver that the strict check refuses (road hull, road value), as v3 snapshots (FLIP-X2: the
 *  decks hold their dawns' runes, which travel only in v3; was v2).
 *  SHAPES-1 (RUN5-SHAPES1 3, cap's ruling 1.1: EMBER TROUGH 4 -> 5 G): these snapshots carry no road log, so a dusk whose
 *  deck is worth more than the log-less ceiling is set aside in `needsLog` (the test checks it passes with its log). Since
 *  the price, seed 1's FURNACE day-1 dusk is one: a medium win's drop (PLATE ROLLER, 3 G) and SALVAGE's EMBER TROUGH (5 G)
 *  make 14 G against the log-less 8 + roadCap 5 = 13 (at 4 G it was 13 and passed by a hair) */
function honestRefusedByStrict(n: number): GhostSnapshot[] {
  const out: GhostSnapshot[] = [];
  needsLog.length = 0;
  for (let seed = 1; out.length < n && seed < 400; seed++) {
    const r = driveRun(seed, seed % 2 ? "furnace" : "weaver");
    for (const d of r.dusks) {
      if (out.length >= n || validateBuild(d.build, d.day).ok) continue;
      if (!validateUpload(d.build, d.day).ok) { needsLog.push(d); continue; }
      // 0.8.0 H2 (a): 3 lives, or the fewest a run carries into that dusk where 3 is out of reach (day 1: 5, day 2: 4)
      out.push({ v: SNAPSHOT_V3, rules: RULES_VERSION, hero: r.hero, day: d.day, wins: 0, lives: Math.max(3, floorRecord(d.day).lives), build: d.build, runId: `drv-${seed}`, playerId: `p${seed}`, createdAt: 1_790_000_000_000 });
    }
  }
  return out;
}

describe("the player mode at its call sites (server upload, served ghost)", () => {
  it("POST /v1/ghosts stores honest decks the strict check refuses, and refuses one over maxHonestSpend", async () => {
    const me = await testIdentity(0); // v070a: uploads are signed (async-062); each snapshot under the key's playerId
    const decks = honestRefusedByStrict(12);
    expect(decks).toHaveLength(12);
    // SHAPES-1 (RUN5-SHAPES1 3): the dusk set aside for its road log (measured, run 6), and it passes with that log and its
    // run seed, as the game's ghostOf sends them (tests/hull1a.server, hull1d.server read the driver's dusks the same way)
    expect(needsLog.map((d) => `${d.hero} #${d.seed} d${d.day}`)).toEqual(["furnace #1 d1"]);
    for (const d of needsLog) expect(validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog }).errors, `${d.hero} #${d.seed} d${d.day}`).toEqual([]);
    for (const s of decks) {
      expect(validateUpload(s.build, s.day).ok).toBe(true);
      const res = await submitGhost(base, ownedBy(s, me), me, 3000);
      expect(res, `${s.hero} d${s.day}`).toMatchObject({ ok: true });
    }
    expect(app.store.size).toBe(12);
    // a day-1 deck with the dock's +200 hull (NUM-1: x10, was +20): strict refuses it (off the plating grid), the server stores it
    expect([DOCK_PLATING, RIDE_THROUGH, PLATE]).toEqual([200, -100, 250]); // NUM-1: x10 (was 20, -10, 25)
    // FLIP-X2: upSnap: day 1's rune, v3 (was snap's rune-less v1 deck)
    // 0.8.0 H2 (a): day 1's one reachable record. HULL-ON (the flip, HEARTS): 0W 5 lives -> 0W HEARTS_START (10 hearts):
    // under this build's rules a run starts with 10 hearts (POST answered 422 "record: 0W 5 lives is no record ...")
    const dock = upSnap({ lives: HEARTS_START, build: { ...snap().build, hullBonus: DOCK_PLATING } });
    expect(validateBuild(dock.build, 1).ok).toBe(false);
    expect(await submitGhost(base, ownedBy(dock, me), me, 3000)).toMatchObject({ ok: true });
    // over the player ceiling: refused on budget (day 1 allows maxHonestSpend(1) = 13 on 40d2b2c, was 15; 4 plates cost 20)
    const rich = upSnap({ build: { ...snap().build, hullBonus: 4 * PLATE } }); // NUM-1: 4 plates are 1000 hull (was 100). FLIP-X2: upSnap
    expect(maxHonestSpend(1)).toBeLessThan(20);
    const richBody = JSON.stringify(ownedBy(rich, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, richBody), body: richBody });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { errors: string[] }).errors.join()).toMatch(/^budget: build costs 20 gold .* allows at most 13 /);
  });

  it("fetchGhost fights a served player ghost with a road hull; it still falls back on one the player mode refuses", async () => {
    // FLIP-X2: served ghosts hold their day's runes, v3 (upSnap; were snap's rune-less v1 decks)
    const ride = upSnap({ day: 3, wins: 1, build: { ...snap().build, hullBonus: RIDE_THROUGH } }); // NUM-1: -100 (was -10)
    const off = upSnap({ day: 4, wins: 0, build: { ...snap().build, hullBonus: 300 } }); // NUM-1: x10 (was 30)
    const srv = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      s.end(JSON.stringify(q.url?.includes("day=3") ? { id: "gride", snapshot: ride } : { id: "goff", snapshot: off }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    try {
      expect(validateBuild(ride.build, 3).ok).toBe(false); // strict: -100 is not whole plating
      const g = await fetchGhost(url, req({ day: 3, wins: 1 }), 2000);
      expect(g).toMatchObject({ source: "server", id: "gride" });
      const f = await fetchGhost(url, req({ day: 4 }), 2000);
      expect(f.source).toBe("fallback");
      expect(f.error).toMatch(/ghost deck invalid: supply: hullBonus 300 is not a hull a player can reach by day 4/); // NUM-1: x10 (was 30)
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });
});
