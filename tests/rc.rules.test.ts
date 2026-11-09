// 0.8.0 RC M1 (REQ-BFG-009, REQ-BFG-016, REQ-BFG-011): rules bb-0.8.0. 0.8.0 changes battles (two heroes, fifteen parts,
// B1's numbers), so the rules string moves: a new rules version starts a fresh ghost pool, and the server's rules gate
// turns 0.7.0's bb-0.6.2 uploads away.
//  - On both stores (JSON lines, and Tigris through tools/fakeS3.ts), with uploads open in-process: a bb-0.8.0 upload of
//    each playable hero is stored (201); a bb-0.6.2 one is refused and nothing is stored: FURNACE and WEAVER meet the
//    exact rules check (422), FOUNDRY and BASTION already the decoder's hero gate (400).
//  - A 0.7.0 session meets the 0.8.0 server. 0.7.0's client is this build's online path under rules bb-0.6.2, so the
//    session here runs the game's own Online class with deps that send what a 0.7.0 client sends: the match request and
//    the signed upload carry bb-0.6.2. Its dawn fetch finds no bb-0.6.2 ghost (404) and falls back to the stand-in; its
//    dusk upload is refused (422) quietly: the run plays on to day 2 and nothing reaches the console. Where the store still
//    holds 0.7.0's bb-0.6.2 seed pool (the seed replaces only its own rules' pool), the match route serves a 0.7.0 client
//    one of those, never a bb-0.8.0 ghost, and its upload is still refused. (The browser check runs the real 0.7.0 page.)
//  - Offline (no server URL) a run of each of the four heroes through day 3 makes no request and opens no IndexedDB.
// BELTS (REQ-BFG-043, REQ-BFG-044): this build's rules are bb-0.8.3 (since PACKS, bb-0.8.6; since RUNES-1, bb-0.8.7). Where a check here meant this build's rules it reads
// RULES_VERSION or pins bb-0.8.7; HEROES_RULES stays bb-0.8.0 (the first rules that carry the four heroes), which
// RULES_VERSION is at or after. tests/belts.rules.test.ts turns bb-0.8.0's uploads and sessions away the same way.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RULES_VERSION, RUN_DAYS, START_LIVES, type HeroId } from "../src/sim/content";
import { withScaleRigs } from "../src/sim/scale"; // BUMP-1E: the scaling switch is the outermost of the old-rules validation below (honest)
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): records on each rules' scale
import { heartsFor } from "../src/net/rulesGate"; // HULL-ON (the flip, HEARTS): which scale a record's rules read
import type { Build } from "../src/sim/deck";
import { simulate, type SideStats } from "../src/sim/battle";
import { heroRefBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { HEROES_RULES, SCALE_RULES, gatesGateProblem, heroesFor, rulesAtLeast, sustainFeatures } from "../src/net/rulesGate"; // FLIP-X2: sustainFeatures; BUMP-1E: SCALE_RULES (honest); BUMP-1F: gatesGateProblem (the pool copy for bb-0.6.2)
import { ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { withDawnRunes } from "./runeFill"; // FLIP-X2: an upload holds its day's runes
import { validateUpload } from "../src/net/validate";
import { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { battleSeed, newRun, pendingRune, saveRun, SAVE_KEY, takeRune } from "../src/game/run"; // FLIP-X2: pendingRune, takeRune
import { duskFoe, finishDay, ghostOf, startDusk, storedFoe } from "../src/game/day";
import { GHOST_KEY, loadPool, saveGhost, standInFoe } from "../src/game/ghosts";
import { PLAYER_KEY } from "../src/game/ghostSnapshot";
import { PROFILE_KEY } from "../src/game/profile"; // CUSTOM-2a (REQ-BFG-072): the one profile key (REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5)
import { Online, resolveServerUrl, type OnlineDeps } from "../src/game/online";
import { foeNote, online, onlineMode } from "../src/game/session";
import type { Identity } from "../src/net/identity";
import type { GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { floorGhosts, sampleGhosts } from "./helpers/poolCache";
import { storeBackends } from "./netStores";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";

const OLD_RULES = "bb-0.6.2"; // 0.7.0's rules (and 0.6.2's)
const NOSTATS = {} as SideStats;
const DAYS = [1, 5, 9];

function snapOf(hero: HeroId, day: number, rules: string, build: Build = heroRefBuild(hero, day)): GhostSnapshot {
  // HULL-ON (the flip, HEARTS; tests/belts.rules.test.ts's dusk() pattern): 0W at full lives (every fight a draw) is on
  // each rules' own scale: HEARTS_START (10) hearts under this build's rules (heartsFor: the hearts record model, where 0W
  // 5 lives is no record a run carries into dusk 1: 422), 5 lives under older rules (bb-0.6.2, bb-0.9.7). Was lives: 5 on
  // every rules
  const lives = heartsFor(rules) ? HEARTS_START : START_LIVES;
  // BUMP-1D (LONG_RUN ships on): under this build's rules (a long run's: bb-0.11.0) the upload states the dusks the run lost
  // (server/app.ts lossesProblem: 422 "losses: ..." without it): 0W at full hearts is no losses (all draws). Any other rules take
  // no such field (the decoder refuses it, 400, ahead of the rules check these tests read). Callers make it v3 (losses is v3 only)
  return { v: SNAPSHOT_VERSION, rules, hero, day, wins: 0, lives, ...(rules === RULES_VERSION ? { losses: 0 } : {}), build, runId: `rc-${hero}-${day}`, playerId: `p-${hero}`, createdAt: 1_790_000_000_000 };
}

/** HULL-ON (the flip, PICK): a seed ghost without the seed step's grade (generateSamplePool writes it last, PICK on; no
 *  client before PICK sends one, and rules before bb-0.10.0 refuse it: pickGateProblem). As tests/rc.seedpool.test.ts. */
const ungraded = (s: GhostSnapshot): GhostSnapshot => {
  const { grade: _grade, ...u } = s;
  return u;
};

/** BUMP-1E: is the deck honest under `rules` (validateUpload's ok)? Under rules before SCALE_RULES validateUpload judges it with the scaling switch off, and under rules before
 *  bb-0.11.0 (the older neighbour, bb-0.10.0) with SHAPES2 off too, nested as validate.ts has them (inShapes2World outside inScaleWorld): the scaling switch comes back FIRST, so the seven
 *  scaling ids are re-added to ITEMS BEFORE SHAPES2's six and ITEMS' key order, which is part of every seeded draw (the par player's decks), has changed for the rest of the worker:
 *  the seed-pool test below then fails 'SOFT-1: stale: the pick f9:2fb07b77 for furnace day 1 no longer matches its deck' (found at eb6f751, tests/soft1.picks.test.ts in a fresh
 *  process resolves every pick). The scaling switch is the OUTERMOST of the nest here (off first, back last: tests/net-upload.test.ts's catalogueOff form), the world the call meant.
 *  Rules at or after SCALE_RULES (bb-0.12.1) are judged as the switch stands, on, where nothing is switched. */
const honest = (deck: Build, day: number, rules: string): boolean =>
  (rulesAtLeast(rules, SCALE_RULES) ? validateUpload(deck, day, rules) : withScaleRigs(() => validateUpload(deck, day, rules), false)).ok;

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

async function until(cond: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** FLIP-X2: `s` as a client before bb-0.8.7 (runes) sends it, 0.7.0's among them: a rune-less v2 snapshot, no
 *  build.runes and no run seed. Rules before bb-0.8.7 refuse a deck holding runes, and this build's decks hold them. */
function runeless(s: GhostSnapshot): GhostSnapshot {
  const out: GhostSnapshot = { ...s, v: SNAPSHOT_VERSION, build: { ...s.build } };
  delete out.seed;
  delete out.build.runes;
  // AZ-BUMP S7L (the cause LOSS-1 P2, 5f3ac64, merged at 3b19771): the seed pool's floor ghosts now carry their casual run's
  // road log (v3 only: "snapshot.road: not allowed in a v2 snapshot"), which no client before bb-0.8.7 sent, so it goes too,
  // as the runes and the seed (snapshot.contract and h2.nearmiss drop it the same way since the flip)
  delete out.road;
  // BUMP-1D (LONG_RUN ships on): and the `losses` a long run's snapshot states (v3 only, and only under a long run's rules; a
  // client before bb-0.8.7 sent none): "snapshot.losses: not allowed in a v2 snapshot"
  delete out.losses;
  // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), the regenerated pool on bb-0.13.0 holds enchantments): and the words (`ench`, `enchDir`, `grow`) of ENCHANT, which no client
  // before bb-0.13.0 sent: "snapshot.build.items[1].ench: unknown field" at ghostId under bb-0.6.2 (was nothing dropped)
  const noWords = <P extends object>(list: P[] | undefined): P[] | undefined => list?.map((p) => { const { ench: _e, enchDir: _d, grow: _g, ...rest } = p as Record<string, unknown>; return rest as P; });
  out.build.items = noWords(out.build.items)!;
  if (out.build.turrets) out.build.turrets = noWords(out.build.turrets)!;
  return out;
}

/** A 0.7.0 client's deps: the game's own fetch and upload, with 0.7.0's rules string on the request and the snapshot. */
function as070(identity: Identity, sent: GhostSnapshot[] = []): OnlineDeps {
  // HULL-ON (the flip, HEARTS; tests/belts.rules.test.ts's as080 pattern): a 0.7.0 client plays 0.6.2's 5 lives, so its
  // request and its dusk carry lives on that scale (at most START_LIVES: day 1's 5). This build's run holds HEARTS_START
  // (10) hearts, past bb-0.6.2's lives bound (livesCapFor: 9), so the match route would answer 400 (not the 404 of a
  // pool with no bb-0.6.2 ghost) and the upload a 400 before the rules check (was the run's own lives)
  const lives070 = (lives: number) => Math.min(lives, START_LIVES);
  return {
    fetchGhost: (url, req, ms, o) => fetchGhost(url, { ...req, rules: OLD_RULES, lives: lives070(req.lives) }, ms, o),
    submitGhost: (url, snap, id, ms) => {
      // FLIP-X2: the deck as a 0.7.0 client sends it, rune-less v2 (was { ...snap, rules: OLD_RULES }, which now holds the
      // run's dawn rune in v3 with its seed: bb-0.6.2 refuses that at the encoder, so no 422 would come back)
      const old = { ...runeless(snap), rules: OLD_RULES, lives: lives070(snap.lives) };
      sent.push(old);
      return submitGhost(url, old, id, ms);
    },
    identity: async () => identity, store: mem(), now: () => 1_790_000_000_000, save: () => {},
  };
}

describe("rules bb-0.8.7: the version", () => {
  it("RULES_VERSION is bb-0.8.7 (RUNES-1), at or after bb-0.8.0, the first rules that carry the four playable heroes (HEROES_RULES); bb-0.6.2 carries FURNACE and WEAVER", () => {
    expect(RULES_VERSION).toBe("bb-0.15.0") /* BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    // the RC's bump made RULES_VERSION HEROES_RULES itself; BELTS's comes after it, and the table needs no new row
    expect(HEROES_RULES).toBe("bb-0.8.0");
    expect(rulesAtLeast(RULES_VERSION, HEROES_RULES)).toBe(true);
    expect([...heroesFor(RULES_VERSION)]).toEqual([...PLAYABLE_HEROES]);
    expect([...heroesFor(OLD_RULES)]).toEqual(["furnace", "weaver"]);
  });
});

describe.each(storeBackends())("the rules gate on the $name store (uploads open in-process)", (backend) => {
  let app: GhostServer, base: string, me: Identity;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 10_000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    me = await testIdentity(1);
    await seedStore(app.store);
  }, 600_000); // the seed builds the race ghosts (the par player's runs): seconds, more under load
  // HULL-ON (the flip, PICK; cap's ruling 9c114aab5ba18dfe, tests/belts.rules.test.ts's same hook): 120 s -> 600 s.
  // seedStore's default pool, generateSamplePool(), grades every seed ghost with PICK on (samplePool.ts gradeSamplePool);
  // the first store's hook pays that one grading (the second store's hits the per-process memo). belts.rules' identical
  // hook measured the whole file 230 s alone unpinned (HULL-ON run 2), so 600 s is over 2x; here the jsonl hook timed out
  // at 120 s in HULL-ON run 4's suite (pinned, the allowed CPUs 100% busy: the file 803 s)
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });
  const post = async (s: GhostSnapshot) => {
    const body = JSON.stringify(ownedBy(s, me));
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as { id?: string; error?: string } };
  };
  const ask = (rules: string, day = 3) => fetch(`${base}/v1/ghosts/match?rules=${rules}&day=${day}&wins=1&lives=5&player=rc-new&seen=&runs=0`);

  it("/v1/health names bb-0.8.7, and the match route serves bb-0.8.7 seed ghosts and no bb-0.6.2 ghost", async () => {
    expect(((await (await fetch(`${base}/v1/health`)).json()) as { rules: string }).rules).toBe("bb-0.15.0") /* BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the served rules): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    const now = await ask(RULES_VERSION);
    expect(now.status).toBe(200);
    expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe("bb-0.15.0") /* BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the stamped literal): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the served rules): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the bump (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7) */;
    const old = await ask(OLD_RULES);
    expect(old.status).toBe(404);
    await old.text();
  });

  it("takes a bb-0.8.7 upload of each playable hero (201, stored) and refuses every bb-0.6.2 one, storing nothing: 422 for FURNACE and WEAVER, 400 for FOUNDRY and BASTION", async () => {
    const before = backend.storedRecords();
    let stored = 0;
    for (const hero of PLAYABLE_HEROES) for (const day of DAYS) {
      // FLIP-X2: an upload under RULES_VERSION holds exactly its day's runes (neutral ones, tests/runeFill.ts) and travels
      // in v3 (was heroRefBuild(hero, day) rune-less in snapOf's v2); the bb-0.6.2 upload stays the rune-less v2 deck a
      // 0.7.0 client sends (rules before bb-0.8.7 refuse runes)
      const ref = heroRefBuild(hero, day);
      const deck = withDawnRunes(ref, day);
      const up = { ...snapOf(hero, day, RULES_VERSION, deck), v: SNAPSHOT_V3 }; // BUMP-1D: snapOf states losses 0 under these rules
      expect(validateUpload(deck, day).ok, `${hero} d${day}`).toBe(true);
      const now = await post(up);
      expect(now.status, `${hero} d${day} ${RULES_VERSION}`).toBe(201);
      expect(now.body.id).toBe(ghostId(ownedBy(up, me)));
      stored++;
      expect((await app.store.bucket(RULES_VERSION, day)).map((e) => e.id)).toContain(now.body.id);
      const old = await post(snapOf(hero, day, OLD_RULES, ref));
      if (hero === "furnace" || hero === "weaver") {
        expect(old.status, `${hero} d${day} ${OLD_RULES}`).toBe(422);
        expect(old.body.error).toBe(`rules ${OLD_RULES} not accepted: this server validates bb-0.15.0`); // BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the server's message): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the server's rules message): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the server names bb-0.13.0 (was bb-0.12.0). BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: the server names bb-0.11.0 (was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1; BAL-2: was bb-0.9.0; FLIP-X2: was bb-0.8.7)
      } else {
        expect(old.status, `${hero} d${day} ${OLD_RULES}`).toBe(400);
        expect(old.body.error).toBe(`snapshot.hero: rules ${OLD_RULES} accept only FURNACE, WEAVER, not ${hero.toUpperCase()}`);
      }
    }
    expect(stored).toBe(12);
    expect(backend.storedRecords() - before).toBe(12);
    for (const day of DAYS) expect(await app.store.bucket(OLD_RULES, day)).toEqual([]);
  });

  // BUMP-1G (F20, the brief's P6; STAGE-0913 finding F20: mutant CM2b, the server's rules check loosened to a prefix, passed every test because the tests' anchor label was older
  // than every label they upload): the near misses are DERIVED from this build's RULES_VERSION: the previous release (minor - 1), the next patch (patch + 1) and the older label two
  // releases back (minor - 2). Any prefix of the current line ("bb-0.14", "bb-0") then accepts the next patch (and the previous release for "bb-0") and the test fails.
  const NEAR_MISSES = (() => {
    const m = /^bb-0\.(\d+)\.(\d+)$/.exec(RULES_VERSION);
    if (!m) throw new Error(`RULES_VERSION ${RULES_VERSION} is not bb-0.<minor>.<patch>`);
    const minor = Number(m[1]), patch = Number(m[2]);
    return [`bb-0.${minor - 1}.${patch}`, `bb-0.${minor}.${patch + 1}`, `bb-0.${minor - 2}.${patch}`];
  })();
  // STAGE-091, backlog 333-11 (VERIFIED-RC's mutant CM2): the server's rules check is exact, not a prefix. An otherwise
  // honest upload under this build's two neighbours, bb-0.12.0 (the rules it replaces, BUMP-1E's) and bb-0.13.1,
  // is refused with 422 at that check, and nothing is stored under either. A check loosened to the prefix "bb-0." would
  // store both, and one loosened to "bb-0.13" the second (CM2).
  // BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): the bump moved the neighbours (were bb-0.11.0 and bb-0.12.1 around bb-0.12.0, and the older label
  // bb-0.10.0, two releases back; now bb-0.12.0 and bb-0.13.1, and bb-0.11.0, two releases back; the loosened prefix was "bb-0.12"). BUMP-1E (E.1, REVIEW-STAGE0911): and a third, an OLDER label
  // from before the long run, bb-0.10.0 (AZ-BUMP's, two releases back): an old client's rules string is refused by the same
  // exact check (server/app.ts: snap.rules !== RULES_VERSION), not by a prefix or a "not older than" test. BUMP-1E: the bump moved
  // the neighbours (were bb-0.10.0 and bb-0.11.1 around bb-0.11.0). BUMP-1D: the bump moved the neighbours (were bb-0.9.7 and
  // bb-0.10.1 around bb-0.10.0; AZ-BUMP: bb-0.9.6 and bb-0.9.8 around bb-0.9.7; Z-BUMP: bb-0.9.2 and bb-0.9.4 around bb-0.9.3;
  // Y7b2: bb-0.9.0 and bb-0.9.2 around bb-0.9.1)
  it("refuses an otherwise honest upload under the previous release's label, under the next patch and under the older label two releases back (bb-0.13.0, bb-0.14.1 and bb-0.12.0 at bb-0.14.0): 422 at the exact rules check, nothing stored under any", async () => { // BUMP-1G (label bb-0.13.0 -> bb-0.14.0; F20): the three labels are DERIVED from RULES_VERSION below (was the literals bb-0.12.0, bb-0.13.1 and the older bb-0.11.0). BUMP-1F (label bb-0.12.0 -> bb-0.13.0): was bb-0.11.0, bb-0.12.1 and the older bb-0.10.0
    expect(RULES_VERSION).toBe("bb-0.14.0"); // BUMP-1G (label bb-0.13.0 -> bb-0.14.0, RULES_VERSION): was bb-0.13.0. the near misses are this build's neighbours (BUMP-1F: was bb-0.12.0; BUMP-1E: was bb-0.11.0; BUMP-1D: was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1)
    const before = backend.storedRecords();
    const day = 3;
    for (const rules of NEAR_MISSES) { // BUMP-1G (label bb-0.13.0 -> bb-0.14.0; F20, the brief's P6: anchored on RULES_VERSION, so a check loosened to a prefix of the current line, bb-0.14 or bb-0, stores one of them and fails here): was ["bb-0.12.0", "bb-0.13.1", "bb-0.11.0"]. BUMP-1F (label bb-0.12.0 -> bb-0.13.0): was ["bb-0.11.0", "bb-0.12.1", "bb-0.10.0"]. BUMP-1E: was ["bb-0.10.0", "bb-0.11.1"] (E.1 adds the third). BUMP-1D: was ["bb-0.9.7", "bb-0.10.1"]; AZ-BUMP: was ["bb-0.9.6", "bb-0.9.8"]; Z-BUMP: was ["bb-0.9.2", "bb-0.9.4"]; Y7b2: was ["bb-0.9.0", "bb-0.9.2"]
      for (const hero of PLAYABLE_HEROES) {
        const deck = withDawnRunes(heroRefBuild(hero, day), day);
        expect(honest(deck, day, rules), `${hero} ${rules}: honest under its own rules`).toBe(true); // only the rules string is off. BUMP-1E: was validateUpload(deck, day, rules).ok (honest: the scaling switch outermost for the rules before bb-0.12.0, so ITEMS keeps its order)
        const r = await post({ ...snapOf(hero, day, rules, deck), v: SNAPSHOT_V3 });
        expect(r.status, `${hero} d${day} ${rules}`).toBe(422);
        expect(r.body.error).toBe(`rules ${rules} not accepted: this server validates bb-0.15.0`); // BUMP-1H (rules bb-0.14.0 -> bb-0.15.0, the server's message): was bb-0.14.0. BUMP-1G (label bb-0.13.0 -> bb-0.14.0, the server's rules message): was bb-0.13.0. BUMP-1F (label bb-0.12.0 -> bb-0.13.0, RULES_VERSION): was bb-0.12.0. BUMP-1E: the bump (was bb-0.11.0). BUMP-1D: was bb-0.10.0; AZ-BUMP: was bb-0.9.7; Z-BUMP: was bb-0.9.3; Y7b2: was bb-0.9.1
      }
      expect(await app.store.bucket(rules, day)).toEqual([]);
    }
    expect(backend.storedRecords()).toBe(before);
  });

  it("a 0.7.0 session: its fetch falls back to the stand-in (404), its upload is refused quietly (422), and the run plays on to day 2 with no console line", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const debug = vi.spyOn(console, "debug");
    const before = backend.storedRecords();
    const sent: GhostSnapshot[] = [];
    try {
      const s = new Online(base, as070(me, sent));
      await until(() => s.active);
      const run = newRun("furnace", 7070);
      // FLIP-X2: the run takes its dawn rune, as the game makes it before the dusk: this build's online path uploads only
      // a deck validateUpload takes, which holds exactly `day` runes (was no rune taken: nothing was sent, sent = [])
      const offer = pendingRune(run);
      if (offer) takeRune(run, offer.ids[0]);
      s.tick(run);
      await until(() => s.lastFetch !== null);
      s.tick(run);
      expect(s.lastFetch).toMatchObject({ source: "fallback", error: "no ghost on the server for this day" });
      const foe = storedFoe(run)!;
      expect(foe).toMatchObject({ kind: "standin", source: "offline", name: standInFoe(run.seed, 1).name });
      startDusk(run, [], { ghost: null });
      s.submitDusk(run);
      expect(sent).toHaveLength(1);
      expect([sent[0].rules, sent[0].hero, sent[0].day]).toEqual([OLD_RULES, "furnace", 1]);
      const b = simulate(run.build, foe.build, battleSeed(run));
      finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS);
      await until(() => s.lastUpload !== null);
      expect(s.lastUpload).toMatchObject({ ok: false, status: 422 });
      expect(run.over).toBeFalsy();
      expect(run.day).toBe(2);
      s.tick(run); // day 2's dawn fetch: the stand-in again
      await until(() => s.fetches === 2 && s.lastFetch?.snapshot.day === 2);
      s.tick(run);
      expect(storedFoe(run)).toMatchObject({ kind: "standin", source: "offline" });
      expect(backend.storedRecords()).toBe(before);
      expect(error).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(debug).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      warn.mockRestore();
      debug.mockRestore();
    }
  });

  it("where the store still holds 0.7.0's bb-0.6.2 seed pool, a 0.7.0 client is served one of those (never a bb-0.8.7 ghost), and its upload is still refused", async () => {
    // FURNACE and WEAVER's seed ghosts as a bb-0.6.2 pool (0.7.0's seed made its pool the same way, from its own decks)
    // FLIP-X2: this build's pool decks hold their day's runes (v3, with a seed) and bb-0.6.2 predates runes, so 0.7.0's
    // pool is them as 0.7.0 made them: rune-less v2, no seed, leaving out a deck holding a sustain piece (WARD BELL, MEND
    // PRESS, MENDING LOOM need bb-0.9.0; 0.7.0 had none). Was [...].map((s) => ({ ...s, rules: OLD_RULES })).
    // HULL-ON (the flip, HEARTS, PICK; as tests/rc.seedpool.test.ts's bb-0.6.2 copies): each copy carries its record on
    // 0.7.0's 5-lives scale (min(lives, START_LIVES): the decoder bounds lives at 9 before hearts, and the pool's day-1
    // ghosts hold 10 hearts) and no grade (no client before PICK sends one, and bb-0.6.2 refuses it)
    const pool070 = [...sampleGhosts(), ...floorGhosts()].map((s) => ({ ...runeless(ungraded(s)), rules: OLD_RULES, lives: Math.min(s.lives, START_LIVES) }))
      .filter((s) => sustainFeatures(s.build).length === 0 && gatesGateProblem(OLD_RULES, s.build) === null && s.day <= RUN_DAYS); // BUMP-1F: and no FUSER, SCATTER MILL or SMELTER deck (gatesGateProblem: never in a bb-0.6.2 pool) // BUMP-1D (LONG_RUN ships on): and days 1-10 only: the sample pool goes to day 16 now, and bb-0.6.2's snapshot bound is day 10
    await app.store.replacePool(OLD_RULES, pool070.map((s) => ({ id: ghostId(s), snapshot: s })));
    try {
      const ids = new Set(pool070.map(ghostId));
      for (const day of [1, 3, 10]) {
        const r = await ask(OLD_RULES, day);
        expect(r.status, `day ${day}`).toBe(200);
        const body = (await r.json()) as { id: string; snapshot: GhostSnapshot };
        expect(body.snapshot.rules).toBe(OLD_RULES);
        expect(ids.has(body.id)).toBe(true);
      }
      const now = await ask(RULES_VERSION, 3); // a client of this build still meets bb-0.8.7 ghosts only
      expect(((await now.json()) as { snapshot: GhostSnapshot }).snapshot.rules).toBe(RULES_VERSION);
      const run = newRun("weaver", 7071);
      // HULL-ON (the flip, HEARTS): the run's day-1 dusk on 0.7.0's 5-lives scale (this build's run holds 10 hearts, past
      // bb-0.6.2's lives bound 9: a 400 before the rules check; was the run's own lives)
      const g070 = ghostOf(run, 1_790_000_000_000, me.playerId);
      const { losses: _losses, ...g070n } = g070; // BUMP-1D (LONG_RUN ships on): and without the `losses` this build's run states (0.7.0 sent none)
      const up = await submitGhost(base, { ...g070n, rules: OLD_RULES, lives: Math.min(g070.lives, START_LIVES) }, me, 3000);
      expect(up).toMatchObject({ ok: false, status: 422 });
    } finally {
      await app.store.replacePool(OLD_RULES, []);
    }
    expect(await app.store.bucket(OLD_RULES, 3)).toEqual([]);
    // BUMP-1D (test only, time limit only, no assertion moves): 600 s, the GATE RULE's limit for a reader of the pool generators (tests/net-pool.test.ts
    // carries the same). The first sampleGhosts() + floorGhosts() of the process now plays the long run's casual floor runs (16 days, FLOOR_PICKS): ~20 s
    // alone (twice, green), 32.3 s in the 12:59Z whole-suite run: red there against the 30 s testTimeout of vite.config.ts (this file was the same then)
  }, 600_000);
});

describe("offline play makes no request (no server URL)", () => {
  it("a run of each of the four heroes through day 3: no session, no request, no IndexedDB, only 0.6.2's storage keys", () => {
    const g = globalThis as { localStorage?: Storage };
    const store = mem();
    g.localStorage = store;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("no request may be made offline"); });
    let idb = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => { idb++; return undefined; } });
    try {
      expect(resolveServerUrl("", store, { origin: "https://beltbattles.example" })).toBeNull();
      expect(online()).toBeNull();
      expect(onlineMode()).toBe(false);
      for (const hero of PLAYABLE_HEROES) {
        const run = newRun(hero, 8080);
        let dusks = 0;
        while (!run.over && run.day <= 3) {
          online()?.tick(run);
          const preview = duskFoe(run, loadPool());
          expect(foeNote(run, preview)).toBeNull();
          const foe = startDusk(run, loadPool());
          expect(foe.source).toBeUndefined();
          const mine = ghostOf(run);
          const b = simulate(run.build, foe.build, battleSeed(run));
          expect(finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS).record).toBeUndefined();
          saveGhost(mine);
          saveRun(run);
          dusks++;
        }
        expect(dusks, hero).toBe(3);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(idb).toBe(0);
      // CUSTOM-2a (REQ-BFG-072): decision D3 amended for exactly one more offline key, the profile (REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5)
      expect(store.keys().every((k) => [SAVE_KEY, GHOST_KEY, PLAYER_KEY, PROFILE_KEY].includes(k))).toBe(true);
    } finally {
      fetchSpy.mockRestore();
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
      delete g.localStorage;
    }
  });
});
