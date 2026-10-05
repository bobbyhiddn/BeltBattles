// 0.8.0 RC M2 (REQ-BFG-016, REQ-BFG-011, REQ-BFG-009): the bb-0.8.0 seed pool for the four playable heroes.
//  - tools/samplePool.ts generateSamplePool(): every playable hero on every day 1-10, three ghosts per hero and day as in
//    0.7.0's pool (two sample ghosts and one floor ghost), 120 in all. FURNACE and WEAVER's 60 are 7c7feb9's pool byte
//    for byte but the rules string (W/output-RC/ghosts: ghost-pool.7c7feb9.bb-0.6.2.json, sha256 110f813c...). FOUNDRY
//    and BASTION's 60 are the par player's dusk decks from the par field's runs (raceGhosts), pinned by their own digest.
//  - Every ghost passes the upload check: the strict decoder, validateUpload in the player mode, the reachable-record
//    check (src/net/records.ts) and the rules gate (turrets and joins, heroes); a deck that fails it never enters the pool.
//  - On both stores (JSON lines, and Tigris through tools/fakeS3.ts) the seed writes all 120 and `ghosts:admin list
//    --rules bb-0.8.0` shows 12 a day; nothing under bb-0.6.2.
//  - A dusk served by the in-process server meets a FOUNDRY ghost and a BASTION ghost, labelled ONLINE GHOST (the NEXT
//    BATTLE card and the enemy plate both read session.ts foeNote); a FOUNDRY or BASTION player meets ghosts of all four.
// BELTS (REQ-BFG-043, REQ-BFG-044): the pool is generated under this build's rules, bb-0.8.7 since RUNES-1 (bb-0.8.6 since PACKS, bb-0.8.3 since BELTS) (the titles
// below say so), with the same composition; `ghosts:admin list --rules bb-0.8.7` shows it. BELTS run 5 regenerated the
// stand-in pool (the bots buy the gold upgrades), so FURNACE and WEAVER's 60 are no longer 7c7feb9's: both parts are
// pinned by their own digests, and 59 of the 120 ghosts carry upgrade levels (W/output-belts/ghosts/).
// RUNES-1 (REQ-BFG-058, decision 10): bb-0.8.7 carries bb-0.8.6's pools forward unregenerated (content.ts POOL_RULES;
// tests/runes.parity.test.ts): the seed ghosts travel under bb-0.8.7, and both digests are taken with the rules string
// normalised to POOL_RULES (bb-0.8.6), so they still pin PACKS's decks and records byte for byte.
// FLIP-X2 (release X, bb-0.9.0; REQ-BFG-058, REQ-BFG-069): the ONE regeneration. The stand-in pool was regenerated at
// step 4.1 (native N1: BUNDLED_POOL_HULL_SCALE deleted) and the par player takes its dawn runes, so both parts are new
// decks, each holding exactly `day` runes, as v3 snapshots (the race ghosts with their par run's seed). Nothing is carried
// any more (POOL_RULES = RULES_VERSION): NUM-1's /10 conversion, NUM-2/NUM-3's lists of changed race decks, their
// digests and the tripwire are gone; each part is pinned by its own new digest. The whole pool's digest is the file
// `npm run gen:ghosts` wrote at step 4.2 (sha256 620f5c9e2eea14e68b21c6dd31f1963251e4c7481a5e0031548e6ce18fc012b5).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { POOL_RULES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { PAR_K, parSeeds } from "../src/sim/harness/par";
import { parRunSeed, playerBuild } from "../src/sim/harness/player";
import { encodeStarred } from "../src/sim/standInPool";
import { STAND_IN_HEROES } from "../src/net/fallback";
import { floorRecord, isReachable } from "../src/net/records";
import { heroGateProblem, rulesGateProblem, sustainFeatures } from "../src/net/rulesGate";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, ghostId, SNAPSHOT_V3, type GhostSnapshot } from "../src/net/snapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { newRun } from "../src/game/run";
import { storedFoe } from "../src/game/day";
import { startOnline, stopOnline, type OnlineDeps } from "../src/game/online";
import { foeNote, SOURCE_ONLINE } from "../src/game/session";
import { createGhostServer, type GhostServer } from "../server/app";
import { checkPool, seedStore } from "../server/seed";
import { JsonlStore } from "../server/store";
import { runAdmin } from "../server/ghostAdmin";
import {
  FLOOR_VARIANT, RACE_SEED_HEROES, RACE_VARIANTS, floorGhosts, generateSamplePool, raceDeck, raceGhosts, sampleGhosts, samplePoolJson,
} from "../tools/samplePool";
import type { FakeS3 } from "../tools/fakeS3";
import { FAKE_CREDS, startFake, tigrisFor } from "./netStores";
import { testIdentity } from "./netIdentity";

const POOL = generateSamplePool();
const STANDIN_PART = POOL.slice(0, 60);
const RACE_PART = POOL.slice(60);
// FLIP-X2: NUM-2's NUM2_GHOSTS_DIFFER (11) and NUM2_RACE_PART_SHA256, NUM-3's NUM3_GHOSTS_DIFFER (9) and
// NUM3_RACE_PART_SHA256, their tripwire (EXCEPTIONS_RULES bb-0.8.7), BASE_DECKS (runes.parity's bb-0.8.6 fixture), RUNES-1's
// carried() (rules normalised to POOL_RULES) and NUM-1's preNum1 (/10) are deleted: the pool is regenerated, not carried.
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const variantOf = (s: GhostSnapshot) => Number(s.playerId.slice(-1));
/** FURNACE and WEAVER's 60 as a pool file: the sample and floor ghosts of the stand-in pool. Until BELTS they were
 *  7c7feb9's seed pool but the rules string (its sha256 110f813c..., with the rules normalised to bb-0.6.2); BELTS run 5
 *  regenerated the stand-in pool they are drawn from (44ee031, the gold upgrades), so they are pinned by their own
 *  digest now (W/output-belts/ghosts). A change to the stand-in pool or to this generator moves it. PACKS (bb-0.8.6): the
 *  stand-in pool regenerated with the packs (23bb3d2). */
// REDO-X step 2 (4.1-4.2): the stand-in pool regenerated once more on FIX-ABE's offers (09ce97c; the pools changed, the
// regeneration) (was 4de26dafb7ca9c3c2b9017ff1774ecc1a3a9973c09025755b99ed8f18f074a3f at FLIP-X2)
const STANDIN_PART_SHA256 = "a7ba169fcadaed6a6ac9787ac14856c1970f6fc2eace1d5c0021306e7a8f2b13"; // FLIP-X2: the regenerated pool (was 2bd3adfd..., under POOL_RULES bb-0.8.6, /10)
/** The race part (FOUNDRY and BASTION, 60) as a pool file: a change to the par player or this generator moves it.
 *  BELTS run 5: the par player buys the gold upgrades (was 9daab76d...). PACKS (bb-0.8.6): it buys BELT and ARMOR PACKs. */
// REDO-X (cap's ruling on FIX-ABE, REVIEW-FIXABE: rc.seedpool :98 re-pinned after the regeneration): the race ghosts are
// the par player's dusk decks, which moved with the offers (74e14a1) (was
// f60d1921aecdd0023a5284add12e331ed86bd10b2b93118f5af34be5a3eb8ac3 at FLIP-X2)
const RACE_PART_SHA256 = "a232005b6300c4c6c0e661ebea350d0de9bd660ab34b049ff32864ae4b118eee"; // FLIP-X2: the par player with its runes (was 94e26280... at PACKS; NUM-3 pinned b3c0ea31..., /10)

describe("the bb-0.9.0 seed pool (tools/samplePool.ts; regenerated at FLIP-X2, v3 snapshots holding their runes)", () => {
  it("holds every playable hero on every day 1-10, three ghosts per hero and day (variants 0, 1 and the floor ghost 2), 120 in all", () => {
    expect([...PLAYABLE_HEROES]).toEqual(["furnace", "weaver", "foundry", "bastion"]);
    expect([...STAND_IN_HEROES]).toEqual(["furnace", "weaver"]);
    expect([...RACE_SEED_HEROES]).toEqual(["foundry", "bastion"]);
    expect(RACE_VARIANTS).toBe(3);
    expect(POOL).toHaveLength(120);
    for (const hero of PLAYABLE_HEROES) for (let day = 1; day <= 10; day++) {
      const here = POOL.filter((s) => s.hero === hero && s.day === day);
      expect(here.map(variantOf), `${hero} d${day}`).toEqual([0, 1, 2]);
    }
    expect(new Set(POOL.map((s) => s.rules))).toEqual(new Set([RULES_VERSION]));
    expect(new Set(POOL.map(ghostId)).size).toBe(120);
    // FLIP-X2: every ghost is a v3 snapshot whose deck holds exactly its day's runes (one a dawn)
    for (const s of POOL) expect([s.v, s.build.runes?.length], `${s.hero} d${s.day} v${variantOf(s)}`).toEqual([SNAPSHOT_V3, s.day]);
  });

  it("FURNACE and WEAVER's 60 come first: the sample and floor ghosts of the bb-0.9.0 stand-in pool, pinned by their digest", () => {
    expect(STANDIN_PART).toEqual([...sampleGhosts(), ...floorGhosts()]);
    expect(STANDIN_PART.every((s) => s.hero === "furnace" || s.hero === "weaver")).toBe(true);
    expect(POOL_RULES).toBe(RULES_VERSION); // FLIP-X2: nothing carried (was "bb-0.8.6")
    expect(sha(samplePoolJson(STANDIN_PART))).toBe(STANDIN_PART_SHA256);
  });

  it("each FOUNDRY and BASTION ghost is the par player's dusk deck of its day from a par-field run; three distinct decks per hero and day", () => {
    expect(RACE_PART).toEqual(raceGhosts());
    // FLIP-X2: the regenerated race part, pinned by its own digest (NUM-2/NUM-3's changed-deck lists and tripwire deleted)
    expect(sha(samplePoolJson(RACE_PART))).toBe(RACE_PART_SHA256);
    const field = parSeeds(PAR_K);
    for (const hero of RACE_SEED_HEROES) for (let day = 1; day <= 10; day++) {
      const here = RACE_PART.filter((s) => s.hero === hero && s.day === day);
      expect(here).toHaveLength(3);
      expect(new Set(here.map((s) => encodeStarred(s.build))).size, `${hero} d${day}`).toBe(3);
      for (const s of here) {
        const { seed } = raceDeck(hero, day, variantOf(s));
        expect(field).toContain(seed);
        expect(s.build, `${hero} d${day} v${variantOf(s)}`).toEqual(playerBuild(hero, day, seed));
        expect(s.seed, `${hero} d${day} v${variantOf(s)}`).toBe(parRunSeed(hero, seed) >>> 0); // FLIP-X2: its par run's seed travels in v3
        if (variantOf(s) === FLOOR_VARIANT) expect({ wins: s.wins, lives: s.lives }).toEqual(floorRecord(day));
      }
    }
  });

  it("every ghost passes the upload check: the strict decoder, validateUpload (player mode), the reachable record and the rules gate; under 0.7.0's rules FOUNDRY and BASTION can't travel", () => {
    const branch = { sustain: 0, standIn: 0, heroGate: 0 };
    for (const s of POOL) {
      const at = `${s.hero} d${s.day} v${variantOf(s)}`;
      expect(decodeSnapshot(encodeSnapshot(s)), at).toEqual(s);
      expect(validateUpload(s.build, s.day, s.rules), at).toEqual({ ok: true, errors: [] });
      expect(validateBuild(s.build, s.day).ok, at).toBe(true);
      expect(isReachable(s.day, s.wins, s.lives), at).toBe(true);
      expect(rulesGateProblem(s.rules, s.build), at).toBeNull();
      expect(heroGateProblem(s.rules, s.hero), at).toBeNull();
      // FLIP-X2: a bb-0.6.2 client holds no runes (they need bb-0.8.7), so the hero-gate check reads the ghost as such a
      // client sent it: v2, without its runes and seed (was { ...s, rules: "bb-0.6.2" }); with its runes it is refused first
      expect(() => checkSnapshot({ ...s, rules: "bb-0.6.2" }), at).toThrow(/runes \(build\.runes\) need bb-0\.8\.7 or later/);
      const { runes: _runes, ...bare } = s.build;
      const { seed: _seed, ...rest } = s;
      const old = { ...rest, v: 2, rules: "bb-0.6.2", build: bare };
      // FLIP-X2: a deck holding a sustain piece (WARD BELL, MEND PRESS, MENDING LOOM; SUSTAIN_LIVE) can't travel under
      // bb-0.6.2 at all: the rules gate (bb-0.9.0's row) refuses it before the hero gate is read
      if (sustainFeatures(bare).length) { branch.sustain++; expect(() => checkSnapshot(old), at).toThrow(/^snapshot\.rules: rules bb-0\.6\.2 predate bb-0\.9\.0: sustain pieces/); }
      else if (STAND_IN_HEROES.includes(s.hero)) { branch.standIn++; expect(checkSnapshot(old).hero).toBe(s.hero); }
      else { branch.heroGate++; expect(() => checkSnapshot(old), at).toThrow(/^snapshot\.hero: rules bb-0\.6\.2 accept only FURNACE, WEAVER/); }
    }
    // FLIP-X2: both pre-flip branches are still exercised (the hero gate on FOUNDRY / BASTION, a stand-in hero passing)
    expect(branch.standIn, JSON.stringify(branch)).toBeGreaterThan(0);
    expect(branch.heroGate, JSON.stringify(branch)).toBeGreaterThan(0);
    console.log(`rc.seedpool (FLIP-X2): under bb-0.6.2 ${JSON.stringify(branch)}`);
    expect(checkPool(POOL)).toHaveLength(120);
  });

  it("a race deck that fails validateUpload never enters the pool: the generator throws on it", () => {
    const rich = (hero: HeroId, day: number, v: number) => {
      const d = raceDeck(hero, day, v);
      if (hero === "bastion" && day === 4 && v === 1) d.build.hullBonus += 25 * 40; // forty plates past the honest ceiling
      return d;
    };
    expect(() => raceGhosts(60, rich)).toThrow(/sample ghost bastion v1 day 4 is invalid|fails validateUpload/);
  });
});

/** One store as the admin tool and the seed see it. */
interface Store { name: string; store(): ReturnType<typeof tigrisFor> | JsonlStore; env(): Record<string, string>; argv(): string[] }

describe("the seed pool on both stores: ghosts:admin list --rules bb-0.9.0", () => {
  let fake: FakeS3;
  const dirs: string[] = [];
  beforeAll(async () => {
    fake = await startFake();
  }, 120_000);
  afterAll(async () => {
    await fake.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const stores = (): Store[] => {
    const dir = mkdtempSync(join(tmpdir(), "bb-rc-pool-"));
    dirs.push(dir);
    return [
      { name: "jsonl", store: () => { const s = new JsonlStore(dir); s.load(); return s; }, env: () => ({ BB_GHOST_STORE: "jsonl" }), argv: () => ["--data", dir] },
      {
        name: "tigris", store: () => tigrisFor(fake, "bb-test"), argv: () => [],
        env: () => ({
          BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
          AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: "bb-test", BB_GHOST_S3_ADDRESSING: "path",
        }),
      },
    ];
  };
  const table = (out: string[]) => {
    const t: Record<string, number[]> = {};
    for (const l of out) {
      const m = /^ +(\d+|all|\?) +(\d+) +(\d+) +(\d+)$/.exec(l);
      if (m) t[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
    }
    return t;
  };

  it("the seed writes 120 on each store, and list shows 12 seed ghosts a day (3 per hero) under bb-0.9.0, none under bb-0.6.2", async () => {
    for (const h of stores()) {
      expect(await seedStore(h.store()), h.name).toMatchObject({ rules: RULES_VERSION, entries: 120, written: 120, removed: 0 });
      for (const [rules, perDay, all] of [[RULES_VERSION, 12, 120], ["bb-0.6.2", 0, 0]] as const) {
        const out: string[] = [];
        expect(await runAdmin(["list", "--rules", rules, ...h.argv()], h.env(), (l) => out.push(l)), `${h.name} ${rules}`).toBe(0);
        const t = table(out);
        for (let day = 1; day <= 10; day++) {
          if (perDay) expect(t[String(day)], `${h.name} ${rules} day ${day}`).toEqual([perDay, 0, 0]);
          else expect(t[String(day)] ?? [0, 0, 0], `${h.name} ${rules} day ${day}`).toEqual([0, 0, 0]);
        }
        expect(t.all, `${h.name} ${rules}`).toEqual([all, 0, 0]);
      }
      for (let day = 1; day <= 10; day++) {
        const heroes = (await h.store().bucket(RULES_VERSION, day, "pool")).map((e) => e.snapshot.hero).sort();
        expect(heroes, `${h.name} day ${day}`).toEqual(["bastion", "bastion", "bastion", "foundry", "foundry", "foundry", "furnace", "furnace", "furnace", "weaver", "weaver", "weaver"]);
      }
    }
  });
});

describe("online against the in-process server with the seed pool (uploads closed, as in production)", () => {
  let dir: string, app: GhostServer, base: string;
  let salt = 0;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-rc-online-"));
    app = createGhostServer({ dataDir: dir, uploads: "closed", log: () => {}, matchSalt: () => salt++, rateLimit: { windowMs: 60_000, max: 100_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    await seedStore(app.store);
  }, 120_000); // the seed builds the race ghosts (the par player's runs): seconds, more under load
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => stopOnline());

  it("a dusk meets a FOUNDRY ghost and a BASTION ghost, and the card and the plate say ONLINE GHOST", async () => {
    const device = await testIdentity(2);
    const deps: OnlineDeps = { fetchGhost, submitGhost, identity: async () => device, store: null, now: () => 1_790_000_000_000, save: () => {} };
    const met = new Map<HeroId, string>();
    for (let seed = 1; seed <= 60 && met.size < 4; seed++) {
      const s = startOnline(base, deps);
      for (let i = 0; i < 200 && !s.active; i++) await new Promise((r) => setTimeout(r, 5));
      const run = newRun(PLAYABLE_HEROES[seed % 4], 9000 + seed);
      s.tick(run);
      for (let i = 0; i < 400 && s.lastFetch === null; i++) await new Promise((r) => setTimeout(r, 5));
      s.tick(run);
      const foe = storedFoe(run)!;
      expect(foe).toMatchObject({ kind: "ghost", source: "online" });
      expect(foeNote(run, foe)).toBe(SOURCE_ONLINE);
      met.set(foe.hero, foe.ghostId!);
    }
    expect(met.has("foundry")).toBe(true);
    expect(met.has("bastion")).toBe(true);
    const ids = new Set(POOL.map(ghostId));
    for (const id of met.values()) expect(ids.has(id)).toBe(true);
  });

  it("a FOUNDRY or BASTION player meets seed ghosts of all four heroes (matching is hero-blind)", async () => {
    const device = await testIdentity(3);
    for (const hero of RACE_SEED_HEROES) {
      const met = new Set<string>();
      for (let day = 1; day <= 10; day++) for (let k = 0; k < 12; k++) {
        const r = await fetchGhost(base, { rules: RULES_VERSION, day, wins: 0, lives: 5, playerId: device.playerId, seen: [], hero, seed: k, runs: 0 }, 3000);
        expect(r.source, `${hero} d${day}`).toBe("server");
        met.add(r.snapshot.hero);
      }
      expect([...met].sort(), hero).toEqual(["bastion", "foundry", "furnace", "weaver"]);
    }
  });
});
