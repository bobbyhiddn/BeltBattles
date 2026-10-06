import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION, RUN_DAYS, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { STAND_IN_POOL_HEROES, standInPool } from "../src/sim/standInPool";
import { TURRETS_JOINS_RULES, parseRules, rulesAtLeast, rulesFeatures, rulesGateProblem, sustainFeatures } from "../src/net/rulesGate";
import { SNAPSHOT_V3, checkSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { floorRecord } from "../src/net/records"; // Y7b2 (the pools): a record the deck's day can carry
import { fetchGhost, submitGhost, type GhostRequest } from "../src/net/ghostClient";
import { loadGhostPool } from "../src/net/fallback";
import { battleRecordFor, replay, RulesMismatchError } from "../src/net/replay";
import type { BattleRecord } from "../src/sim/battle";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";

// v070-rel M2 (b), REQ-BFG-009, REQ-BFG-027, REQ-BFG-031: turret slots and belt joins are bb-0.6.2 rules. One helper in
// src/net (rulesGate.ts) reads `bb-MAJOR.MINOR.PATCH` and refuses what it can't read. Every accepting path refuses a
// build that carries turrets or a join under rules before bb-0.6.2, naming the rules version and the feature: player
// uploads (validateUpload; POST /v1/ghosts through the strict decoder), ghosts the client accepts (ghostClient), the
// bundled pool loader (fallback) and battle records (replay). Each path keeps its exact RULES_VERSION check after it.
// FLIP-X2 (cap's ruling 5d6d83ef57d1494c, item 5): an upload holds exactly `day` runes, and runes need bb-0.8.7 (the gate's
// second row). So each pool deck has two forms here: old(d), rune-less, as a client of bb-0.6.x rules carried it (every
// case under older, bb-0.6.2 or unreadable rules: only the turret and join row speaks), and up(d), holding its dawns'
// runes, as an upload under RULES_VERSION (v3: runes travel only in a v3 snapshot). The stand-in pool holds rune-less decks
// until FLIP-X2's regeneration, after which its decks carry their own runes: old(d) leaves them out, up(d) keeps them.

interface Deck { hero: HeroId; day: number; build: Build }
const hasTurrets = (b: Build) => (b.turrets ?? []).length > 0;
const hasJoin = (b: Build) => b.routes.some((r) => r.join !== undefined);
/** FLIP-X2: the deck without runes, as rules before bb-0.8.7 carry it (a no-op on a rune-less pool deck). */
function old(d: Deck): Build {
  const { runes: _runes, ...rest } = d.build;
  return rest;
}
/** FLIP-X2: the deck as an upload under RULES_VERSION holds it: its own runes, or (a rune-less pool deck) its day's
 *  neutral runes (tests/runeFill.ts: no hull, belt or gold, so it stays the same honest deck). */
const up = (d: Deck): Build => (d.build.runes === undefined ? withDawnRunes(d.build, d.day) : d.build);
/** The first honest stand-in pool deck (both modes accept it) with or without turrets and joins. FLIP-X2: and no sustain
 *  piece, which the gate's bb-0.9.0 row would refuse under these older rules (the pool held none before the flip). */
function poolDeck(turrets: boolean, joins: boolean): Deck {
  for (const hero of STAND_IN_POOL_HEROES) {
    for (let day = 1; day <= RUN_DAYS; day++) {
      for (const e of standInPool(hero, day)) {
        if (hasTurrets(e.build) === turrets && hasJoin(e.build) === joins && !sustainFeatures({ ...e.build, runes: undefined }).length) return { hero, day, build: e.build };
      }
    }
  }
  throw new Error(`no pool deck with turrets ${turrets} and joins ${joins}`);
}
const TURRETS = poolDeck(true, false), JOINS = poolDeck(false, true), BOTH = poolDeck(true, true), NEITHER = poolDeck(false, false);
const joinAt = (b: Build) => b.routes.findIndex((r) => r.join !== undefined);

const OLD = "bb-0.6.1";
const TURRET_WHY = `rules ${OLD} predate bb-0.6.2: turret slots (build.turrets) need bb-0.6.2 or later`;
const JOIN_WHY = `rules ${OLD} predate bb-0.6.2: belt joins (build.routes[${joinAt(JOINS.build)}].join) need bb-0.6.2 or later`;
/** Garbled rules, each with a deck carrying a 0.6.2 feature ("" fails the snapshot codec's rules pattern first). */
const GARBLED: [string, Deck][] = [["bb-0.6", TURRETS], ["0.6.2", JOINS], ["", BOTH]];
const garbledWhy = (rules: string, d: Deck) => `rules ${JSON.stringify(rules)} is not a bb-MAJOR.MINOR.PATCH version: ${rulesFeatures(d.build).join(" and ")} need bb-0.6.2 or later`;
const PATTERN = "snapshot.rules: expected a string matching /^[A-Za-z0-9._-]{1,32}$/";

/** FLIP-X2: under RULES_VERSION the deck holds its dawns' runes and travels as v3 (up); under any other rules it is the
 *  rune-less deck in v2, as before (old). */
function snapOf(d: Deck, rules: string, who = "x"): GhostSnapshot {
  const now = rules === RULES_VERSION;
  // Y7b2 (the pools): under this build's rules the record is the deck's day's floor record (records.ts floorRecord), a record a
  // run carries into that dusk. Was 0 wins and 3 lives at every day, which the regenerated pool's first deck with turrets and
  // joins (a day-3 deck) can't carry ("record: 0W 3 lives is no record a run carries into dusk 3"); older rules are refused
  // before the record check, so their record stays as it was
  const rec = now ? floorRecord(d.day) : { wins: 0, lives: 3 };
  return { v: now ? SNAPSHOT_V3 : 2, rules, hero: d.hero, day: d.day, wins: rec.wins, lives: rec.lives, build: now ? up(d) : old(d), runId: `gate-${who}`, playerId: `ghost-${who}`, createdAt: 1_790_000_000_000 };
}

describe("v070-rel M2 (b): the helper", () => {
  it("reads bb-MAJOR.MINOR.PATCH and nothing else; rulesAtLeast refuses what it can't read", () => {
    expect(TURRETS_JOINS_RULES).toBe("bb-0.6.2");
    expect(parseRules("bb-0.6.2")).toEqual([0, 6, 2]);
    expect(parseRules("bb-10.0.11")).toEqual([10, 0, 11]);
    for (const g of ["bb-0.6", "0.6.2", "", "bb-0.6.2a", "bb-0.6.2-rc1", "bb-00.6.2", "bb-0.06.2", " bb-0.6.2", "bb-0.6.2 ", "BB-0.6.2", "bb-+1.0.0", "bb-0.6.2.1", 7, null, undefined]) {
      expect(parseRules(g), JSON.stringify(g)).toBeNull();
      expect(rulesAtLeast(g, "bb-0.6.2"), JSON.stringify(g)).toBe(false);
    }
    expect(rulesAtLeast("bb-0.6.2", "bb-0.6.2")).toBe(true);
    expect(rulesAtLeast("bb-0.6.10", "bb-0.6.2")).toBe(true); // numbers, not strings
    expect(rulesAtLeast("bb-0.7.0", "bb-0.6.2")).toBe(true);
    expect(rulesAtLeast("bb-1.0.0", "bb-0.6.2")).toBe(true);
    for (const old of ["bb-0.6.1", "bb-0.6.0", "bb-0.5.9", "bb-0.4.0", "bb-0.3.0"]) expect(rulesAtLeast(old, "bb-0.6.2"), old).toBe(false);
    expect(() => rulesAtLeast("bb-0.6.2", "0.6.2")).toThrow(/not a bb-MAJOR\.MINOR\.PATCH rules version/);
    expect(rulesAtLeast(RULES_VERSION, TURRETS_JOINS_RULES)).toBe(true); // today's rules hold both features
  });

  it("refuses turrets or a join under older or unreadable rules, naming the rules version and the feature", () => {
    for (const d of [TURRETS, JOINS, BOTH, NEITHER]) expect(validateBuild(d.build, d.day).ok).toBe(true); // honest decks
    expect(rulesFeatures(TURRETS.build)).toEqual(["turret slots (build.turrets)"]);
    expect(rulesFeatures(JOINS.build)).toEqual([`belt joins (build.routes[${joinAt(JOINS.build)}].join)`]);
    expect(rulesFeatures(NEITHER.build)).toEqual([]);
    // FLIP-X2: under these older rules, the rune-less decks (old: no runes before bb-0.8.7)
    expect(rulesGateProblem(OLD, old(TURRETS))).toBe(TURRET_WHY);
    expect(rulesGateProblem(OLD, old(JOINS))).toBe(JOIN_WHY);
    expect(rulesGateProblem(OLD, old(BOTH))).toBe(`rules ${OLD} predate bb-0.6.2: turret slots (build.turrets) and belt joins (build.routes[${joinAt(BOTH.build)}].join) need bb-0.6.2 or later`);
    expect(rulesGateProblem(OLD, old(NEITHER))).toBeNull(); // neither: the gate passes
    expect(rulesGateProblem("bb-0.6.2", old(BOTH))).toBeNull();
    for (const [rules, d] of GARBLED) expect(rulesGateProblem(rules, old(d))).toBe(garbledWhy(rules, d));
    expect(garbledWhy("bb-0.6", TURRETS)).toBe('rules "bb-0.6" is not a bb-MAJOR.MINOR.PATCH version: turret slots (build.turrets) need bb-0.6.2 or later');
    // a non-empty turret list counts; an explicitly empty one installs no turret
    expect(rulesGateProblem(OLD, { ...old(NEITHER), turrets: [] })).toBeNull();
    for (const g of [null, 7, "x", [], { routes: "x", turrets: "y" }]) expect(rulesFeatures(g)).toEqual([]);
  });
});

describe("v070-rel M2 (b): every accepting path", () => {
  it("validateUpload: refused under older or unreadable rules; bb-0.6.1 with neither passes; bb-0.6.2 with both, legal, passes", () => {
    expect(validateUpload(old(TURRETS), TURRETS.day, OLD)).toEqual({ ok: false, errors: [`rules: ${TURRET_WHY}`] });
    expect(validateUpload(old(JOINS), JOINS.day, OLD)).toEqual({ ok: false, errors: [`rules: ${JOIN_WHY}`] });
    for (const [rules, d] of GARBLED) expect(validateUpload(old(d), d.day, rules), JSON.stringify(rules)).toEqual({ ok: false, errors: [`rules: ${garbledWhy(rules, d)}`] });
    // the gate passes; validateUpload holds no exact-version check of its own (its callers do: the tests below).
    // FLIP-X2: what refuses these two now is the exact rune count, not the gate and not a rules check (each was
    // { ok: true, errors: [] }): a deck under rules before bb-0.8.7 holds no runes, and the same deck with its day's runes
    // meets the gate's runes row, so no upload passes under bb-0.6.1 or bb-0.6.2 any more
    const none = (d: Deck) => ({ ok: false, errors: [`rune: runes: 0 held on day ${d.day}, one a dawn (${d.day})`] });
    expect(validateUpload(old(NEITHER), NEITHER.day, OLD)).toEqual(none(NEITHER));
    expect(validateUpload(old(BOTH), BOTH.day, "bb-0.6.2")).toEqual(none(BOTH));
    expect(validateUpload(up(BOTH), BOTH.day, "bb-0.6.2")).toEqual({ ok: false, errors: ["rules: rules bb-0.6.2 predate bb-0.8.7: runes (build.runes) need bb-0.8.7 or later"] });
    expect(validateUpload(up(BOTH), BOTH.day)).toEqual({ ok: true, errors: [] }); // default: this build's RULES_VERSION (FLIP-X2: with its runes)
  });

  it("the strict snapshot decoder (every path below decodes with it) refuses them the same way", () => {
    expect(() => checkSnapshot(snapOf(TURRETS, OLD))).toThrow(`snapshot.rules: ${TURRET_WHY}`);
    expect(() => checkSnapshot(snapOf(JOINS, OLD))).toThrow(`snapshot.rules: ${JOIN_WHY}`);
    expect(checkSnapshot(snapOf(NEITHER, OLD)).rules).toBe(OLD); // the gate passes; the callers' exact checks follow
    expect(checkSnapshot(snapOf(BOTH, RULES_VERSION)).build).toEqual(up(BOTH)); // FLIP-X2: the upload's deck, with its runes (was BOTH.build)
  });

  it("POST /v1/ghosts: 400 before the exact check; bb-0.6.1 with neither gets the exact check (422); bb-0.6.2 with both is stored", async () => {
    const me = await testIdentity(0); // v070a: uploads are signed (async-062); the gate runs only after the signature
    const post = async (s: GhostSnapshot) => {
      const body = JSON.stringify(ownedBy(s, me));
      const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
      return { status: r.status, body: (await r.json()) as { id?: string; error?: string; errors?: string[] } };
    };
    expect(await post(snapOf(TURRETS, OLD))).toEqual({ status: 400, body: { error: `snapshot.rules: ${TURRET_WHY}` } });
    expect(await post(snapOf(JOINS, OLD))).toEqual({ status: 400, body: { error: `snapshot.rules: ${JOIN_WHY}` } });
    expect(await post(snapOf(NEITHER, OLD))).toEqual({ status: 422, body: { error: `rules ${OLD} not accepted: this server validates ${RULES_VERSION}` } });
    for (const [rules, d] of GARBLED) {
      expect(await post(snapOf(d, rules)), JSON.stringify(rules)).toEqual({ status: 400, body: { error: rules ? `snapshot.rules: ${garbledWhy(rules, d)}` : PATTERN } });
    }
    expect(await post(snapOf(NEITHER, "bb-0.6"))).toEqual({ status: 422, body: { error: `rules bb-0.6 not accepted: this server validates ${RULES_VERSION}` } });
    expect(app.store.size).toBe(0);
    const ok = await post(snapOf(BOTH, RULES_VERSION));
    expect(ok.status).toBe(201);
    expect(app.store.size).toBe(1);
    // the client's own upload encoder refuses first, without a request
    expect(await submitGhost(base, ownedBy(snapOf(TURRETS, OLD), me), me, 2000)).toEqual({ ok: false, error: `snapshot.rules: ${TURRET_WHY}` });
    expect(await submitGhost(base, ownedBy(snapOf(JOINS, OLD), me), me, 2000)).toEqual({ ok: false, error: `snapshot.rules: ${JOIN_WHY}` });
  });

  it("fetchGhost: a served ghost with them under older or unreadable rules falls back with the reason; bb-0.6.2 with both is fought", async () => {
    // the stub server answers by the request's player id
    const served: Record<string, GhostSnapshot> = {
      turrets: snapOf(TURRETS, OLD), joins: snapOf(JOINS, OLD), neither: snapOf(NEITHER, OLD), both: snapOf(BOTH, RULES_VERSION),
      ...Object.fromEntries(GARBLED.map(([rules, d], i) => [`garbled${i}`, snapOf(d, rules)])),
    };
    const srv = createServer((q, s) => {
      s.setHeader("content-type", "application/json");
      const who = new URL(q.url ?? "/", "http://stub").searchParams.get("player") ?? "";
      s.end(JSON.stringify({ id: `g-${who}`, snapshot: served[who] }));
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
    const a = srv.address();
    const url = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
    const ask = (who: string) => {
      // Y7b2 (the pools): the request carries the served day's floor record, as snapOf's ghost does (was 0 wins, 3 lives)
      const rec = floorRecord(served[who].day);
      const req: GhostRequest = { rules: RULES_VERSION, day: served[who].day, wins: rec.wins, lives: rec.lives, playerId: who, seen: [], hero: "furnace", seed: 7 };
      return fetchGhost(url, req, 2000);
    };
    try {
      expect(await ask("turrets")).toMatchObject({ source: "fallback", error: `bad snapshot: snapshot.rules: ${TURRET_WHY}` });
      expect(await ask("joins")).toMatchObject({ source: "fallback", error: `bad snapshot: snapshot.rules: ${JOIN_WHY}` });
      expect(await ask("neither")).toMatchObject({ source: "fallback", error: `ghost rules ${OLD} do not match ${RULES_VERSION}` });
      for (const [i, [rules, d]] of GARBLED.entries()) {
        expect(await ask(`garbled${i}`), JSON.stringify(rules)).toMatchObject({ source: "fallback", error: `bad snapshot: ${rules ? `snapshot.rules: ${garbledWhy(rules, d)}` : PATTERN}` });
      }
      const both = await ask("both");
      expect(both).toMatchObject({ source: "server", id: "g-both" });
      expect(both.snapshot.build).toEqual(up(BOTH)); // FLIP-X2: served with its runes (was BOTH.build)
    } finally {
      srv.closeAllConnections();
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it("the bundled pool loader rejects them under older or unreadable rules and loads bb-0.6.2 with both", () => {
    const raw = [snapOf(TURRETS, OLD), snapOf(JOINS, OLD), snapOf(NEITHER, OLD), snapOf(BOTH, RULES_VERSION), ...GARBLED.map(([rules, d]) => snapOf(d, rules))];
    const load = loadGhostPool(JSON.stringify(raw));
    expect(load.entries.map((e) => [e.snapshot.rules, e.snapshot.build])).toEqual([[RULES_VERSION, up(BOTH)]]); // FLIP-X2: with its runes (was BOTH.build)
    expect(load.rejected).toEqual([
      { index: 0, error: `snapshot.rules: ${TURRET_WHY}` },
      { index: 1, error: `snapshot.rules: ${JOIN_WHY}` },
      { index: 2, error: `rules ${OLD} is not ${RULES_VERSION}` }, // neither: the gate passes, the exact check refuses
      ...GARBLED.map(([rules, d], i) => ({ index: 4 + i, error: rules ? `snapshot.rules: ${garbledWhy(rules, d)}` : PATTERN })),
    ]);
  });

  it("replay refuses a battle record whose builds carry them under older or unreadable rules; bb-0.6.2 with both replays", () => {
    // FLIP-X2: under older or unreadable rules the rune-less decks (old), as a record of those rules held them
    const rec = (rules: string, a: Deck, b: Deck): BattleRecord => ({ ...(rules === RULES_VERSION ? battleRecordFor(a.build, b.build, 7) : battleRecordFor(old(a), old(b), 7)), rules });
    const refusal = (r: BattleRecord): RulesMismatchError => {
      try {
        replay(r);
      } catch (e) {
        expect(e).toBeInstanceOf(RulesMismatchError);
        return e as RulesMismatchError;
      }
      throw new Error("replayed");
    };
    expect(refusal(rec(OLD, TURRETS, NEITHER)).message).toBe(`battle record under rules "${OLD}" cannot replay: builds[0]: ${TURRET_WHY}`);
    expect(refusal(rec(OLD, NEITHER, JOINS)).message).toBe(`battle record under rules "${OLD}" cannot replay: builds[1]: ${JOIN_WHY}`);
    // neither: the gate passes, the exact check refuses
    expect(refusal(rec(OLD, NEITHER, NEITHER)).message).toBe(`battle record was made under rules "${OLD}"; this build runs "${RULES_VERSION}" and cannot replay it`);
    for (const [rules, d] of GARBLED) {
      expect(refusal(rec(rules, d, NEITHER)).message, JSON.stringify(rules)).toBe(`battle record under rules "${rules}" cannot replay: builds[0]: ${garbledWhy(rules, d)}`);
    }
    const out = replay(rec(RULES_VERSION, BOTH, BOTH));
    expect(out.ticks).toBeGreaterThan(0);
  });
});

let dir: string;
let app: GhostServer;
let base: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bb-v070rel-gate-"));
  app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});

afterAll(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
