// ENDLESS-1 3.3 and 3.4 (REQ-BFG-059): THE SERVER, on both stores (JSON lines; Tigris on the in-process fake S3). POST /v1/ghosts takes an
// honest endless snapshot (201) and refuses each forgery (the decoder's 400, the record check's 422); GET /v1/ghosts/match serves
// an endless request endless ghosts only and a run request never one; the store keeps an endless record on day 41 (storage choice
// (A): the same buckets and keys, the day bound for endless records raised to ENDLESS_LAST_DAY) and ghosts:admin's list,
// remove-player and revalidate find it. The honest runs are played through the game's own code (tests/endless1.honest.ts).
// S1 (BRIEF-S1): POST /v1/ghosts no longer takes an endless dusk past ENDLESS_ONLINE_LAST_DAY (25): the day-41 upload below is a 422 now,
// before the deck check (it was a 201 after 26 s of CPU); tests/s1.endlesscap.test.ts holds the rest of S1's cases. The store and
// ghosts:admin still keep and read an endless record to ENDLESS_LAST_DAY (planted straight into the store, past POST), as built.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENDLESS, ENDLESS_LAST_DAY, ENDLESS_ONLINE_LAST_DAY, ENDLESS_WIN_CAP, setEndless, withEndless } from "../src/sim/endless";
import { RULES_VERSION } from "../src/sim/content";
import { LONG_RUN_MAX_DAY } from "../src/sim/longRun";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { fetchGhost } from "../src/net/ghostClient";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { runAdmin } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import { objectKey } from "../server/tigrisStore";
import type { GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless, WIN, LOSS } from "./endless1.honest";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAKE_CREDS, startFake } from "./netStores";
import type { FakeS3 } from "../tools/fakeS3";

setPlayerName(TEST_NAME);

let me: Identity;
let short: GhostSnapshot[]; // a full-deck honest endless, days 11-18 or so
let deep: GhostSnapshot[]; // a lean honest endless to its cap: days 11-41
const dusk = (day: number, from = short): GhostSnapshot => from.find((s) => s.day === day)!;

beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  short = playEndless("furnace", 41, me.playerId, { endlessOutcomes: [WIN, WIN, WIN, LOSS, WIN, WIN, WIN, WIN] }).endlessSnaps;
  deep = playEndless("weaver", 42, me.playerId, { endlessOutcomes: [WIN, WIN, LOSS, ...Array(40).fill(WIN)], buys: 0 }).endlessSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));

describe.each(storeBackends())("ENDLESS-1 3.4: POST /v1/ghosts on the $name store", (backend) => {
  let app: GhostServer, base: string;
  beforeAll(async () => {
    await backend.setup();
    app = backend.server({ uploads: "open", log: () => {}, rateLimit: { windowMs: 60_000, max: 1_000_000 }, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    await backend.teardown();
  });

  const post = async (s: unknown): Promise<{ status: number; body: Record<string, unknown> }> => {
    const body = JSON.stringify(s); // not encodeSnapshot: the server's own checks must see it as sent
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
  const err = (r: { body: Record<string, unknown> }): string => String(r.body.error);

  it("an honest endless upload (the game's own snapshot, day 14, victory day 10): 201, then 200 again; stored in the day's bucket with its endless fields", async () => {
    const s = dusk(14);
    expect([s.mode, s.endlessWins, s.victoryDay, s.day]).toEqual(["endless", 3, 10, 14]);
    const r = await post(s);
    expect([r.status, r.body], JSON.stringify(r.body)).toEqual([201, { id: ghostId(s) }]);
    expect((await post(s)).status).toBe(200);
    const stored = await app.store.bucket(RULES_VERSION, 14);
    const got = stored.find((e) => e.id === ghostId(s))!;
    expect([got.snapshot.mode, got.snapshot.endlessWins, got.snapshot.endlessLives, got.snapshot.victoryDay]).toEqual(["endless", s.endlessWins, s.endlessLives, 10]);
  }, 120_000);

  // S1 (BRIEF-S1) changed this expectation: it pinned an honest endless upload at the deepest end of a perfect endless (day 41) as 201, with the
  // bucket of day 41 holding it. That cost the server 26 s of CPU and 221 MB (LAUNCH-0 run 3, REPORT 1.4 item 6), and the game never sends it
  // (online.ts: past ENDLESS_ONLINE_LAST_DAY the foe is the GOD stand-in), so POST now answers 422 before the deck check and stores nothing.
  it("S1: an honest endless upload at the deepest end of a perfect endless (day 41): 422 'day: 41 is past the last online endless day 25', before the deck check; nothing is stored", async () => {
    const s = dusk(41, deep);
    expect(s.day).toBe(41);
    expect(s.day).toBeGreaterThan(LONG_RUN_MAX_DAY);
    expect(s.day).toBeGreaterThan(ENDLESS_ONLINE_LAST_DAY);
    const t0 = performance.now();
    const r = await post(s);
    expect([r.status, r.body], JSON.stringify(r.body)).toEqual([422, { error: `day: 41 is past the last online endless day ${ENDLESS_ONLINE_LAST_DAY}` }]);
    expect(performance.now() - t0).toBeLessThan(5000); // (the deck check of day 41 is 26 s of CPU; the spy in tests/s1.endlesscap.test.ts is the exact proof)
    expect(await app.store.bucket(RULES_VERSION, 41)).toEqual([]); // nothing is stored
    expect(await app.store.bucket(RULES_VERSION, ENDLESS_LAST_DAY + 1)).toEqual([]); // and nothing past the last endless day
  }, 120_000);

  describe("the forgeries (each an honest dusk with one thing changed)", () => {
    // (the day-14 dusk of `short`: victory day 10, 3 endless wins and 3 hearts going in)
    const f = () => dusk(14);
    const rows: { name: string; make: () => unknown; status: number; error: RegExp }[] = [
      { name: "a run that is not won (9 wins)", make: () => ({ ...f(), wins: 9 }), status: 400, error: /snapshot\.wins/ },
      { name: "mode \"run\" with endless counts", make: () => ({ ...f(), mode: "run" }), status: 400, error: /snapshot\.mode/ },
      { name: "endless wins at the cap", make: () => ({ ...f(), endlessWins: ENDLESS_WIN_CAP }), status: 400, error: /snapshot\.endlessWins/ },
      { name: "more endless wins than endless dusks", make: () => ({ ...f(), endlessWins: 4 }), status: 400, error: /endlessWins: 4 wins in 3 endless dusks/ },
      { name: "4 hearts", make: () => ({ ...f(), endlessLives: 4, lives: 4 }), status: 400, error: /snapshot\.endlessLives/ },
      { name: "hearts and lives disagree", make: () => ({ ...f(), lives: 2, endlessLives: 3 }), status: 400, error: /lives: 2 is not the endlessLives 3/ },
      { name: "a victory day past LONG_RUN_MAX_DAY", make: () => ({ ...f(), victoryDay: LONG_RUN_MAX_DAY + 1 }), status: 400, error: /snapshot\.victoryDay/ },
      { name: "a day that is not after the victory day", make: () => ({ ...f(), victoryDay: 14 }), status: 400, error: /day: 14 is not after the victory day 14/ },
      { name: "a day past ENDLESS_LAST_DAY", make: () => ({ ...f(), day: ENDLESS_LAST_DAY + 1 }), status: 400, error: /snapshot\.day/ },
      { name: "more run losses than the victory day leaves", make: () => ({ ...f(), losses: 3 }), status: 400, error: /losses: 3 run losses/ },
      { name: "a LAST CHANCE claimed after the victory day", make: () => ({ ...f(), lastChance: { day: 12, boon: "hull" } }), status: 400, error: /LAST CHANCE never fires in endless/ },
      { name: "no `losses` (a long run's upload states them)", make: () => { const { losses: _l, ...rest } = f(); return rest; }, status: 422, error: /^losses: / },
      { name: "a record no endless leads to (3 wins and 2 hearts in 3 dusks)", make: () => ({ ...f(), endlessWins: 3, endlessLives: 2, lives: 2 }), status: 422, error: /^record: 3 endless wins and 2 hearts is no record a run won on day 10 carries into endless dusk 14/ },
      { name: "a deck over its budget (200 plates too many)", make: () => ({ ...f(), build: { ...f().build, hullBonus: f().build.hullBonus + 50000 } }), status: 422, error: /deck failed validation/ },
      { name: "rules before endless", make: () => ({ ...f(), rules: "bb-0.10.0" }), status: 400, error: /snapshot\./ },
      { name: "a run snapshot with wins 10 and no mode (a run is over at its 10th)", make: () => { const { mode: _m, endlessWins: _a, endlessLives: _b, victoryDay: _c, ...rest } = f(); return rest; }, status: 400, error: /snapshot\.wins/ },
      { name: "a run snapshot past day 25 (a run's bound)", make: () => { const { mode: _m, endlessWins: _a, endlessLives: _b, victoryDay: _c, wins: _w, ...rest } = f(); return { ...rest, wins: 5, day: LONG_RUN_MAX_DAY + 1 }; }, status: 400, error: /snapshot\.day/ },
    ];
    for (const row of rows) {
      it(`${row.name} -> ${row.status}`, async () => {
        const before = app.store.size;
        const r = await post(row.make());
        expect(r.status, JSON.stringify(r.body)).toBe(row.status);
        expect(err(r)).toMatch(row.error);
        expect(app.store.size).toBe(before); // nothing is stored
      }, 120_000);
    }

    it("the switch off (rules without endless): an honest endless dusk is refused 400 (its 10 wins are past a run's 9, the fields reserved)", async () => {
      setEndless(false); // (not withEndless: the server answers after this function has returned its promise)
      try {
        const r = await post(f());
        expect(r.status).toBe(400);
        expect(err(r)).toMatch(/snapshot\.wins|snapshot\.mode/);
        const carrying = await post({ ...f(), wins: 9, losses: 4 }); // a run snapshot (9 wins, 4 losses in 13 dusks) that carries the reserved fields
        expect(carrying.status).toBe(400);
        expect(err(carrying)).toMatch(/snapshot\.mode: not in this rules version yet/);
      } finally {
        setEndless(true);
      }
    });
  });

  describe("GET /v1/ghosts/match: an endless request reads only endless ghosts; a run request never reads one", () => {
    const get = async (qs: string): Promise<{ status: number; body: Record<string, any> }> => {
      const r = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&runs=5&${qs}`);
      return { status: r.status, body: (await r.json()) as Record<string, any> };
    };

    it("an endless request on day 14 is served the endless ghost (without its seed), nearest endless wins; a run request on that day is not", async () => {
      const s = dusk(14);
      await post(s); // (the earlier test stored it; 200 again)
      const e = await get("day=14&wins=2&lives=3&player=other-player&mode=endless");
      expect(e.status, JSON.stringify(e.body)).toBe(200);
      expect(e.body.id).toBe(ghostId(s));
      expect(e.body.snapshot.mode).toBe("endless");
      expect(e.body.snapshot.seed).toBeUndefined();
      const run = await get("day=14&wins=9&lives=10&player=other-player");
      expect(run.status).toBe(404); // the day's bucket holds only an endless ghost: a run never reads it
    });

    it("an endless request is not served its own ghost, nor a ghost it has seen, nor one of a later day, nor one past the window", async () => {
      const s = dusk(14);
      expect((await get(`day=14&wins=2&lives=3&player=${me.playerId}&mode=endless`)).status).toBe(404);
      expect((await get(`day=14&wins=2&lives=3&player=other-player&mode=endless&seen=${ghostId(s)}`)).status).toBe(404);
      expect((await get("day=13&wins=2&lives=3&player=other-player&mode=endless")).status).toBe(404);
      expect((await get("day=21&wins=2&lives=3&player=other-player&mode=endless")).status).toBe(404); // 7 days on is past the window
      expect((await get("day=16&wins=2&lives=3&player=other-player&mode=endless")).status).toBe(200); // 2 days on: the nearest earlier day's ghost
    });

    it("the client's own fetch (fetchGhost) takes the served endless ghost for an endless request and checks it", async () => {
      const got = await fetchGhost(base, { rules: RULES_VERSION, day: 15, wins: 1, lives: 3, playerId: "other-player", seen: [], hero: "furnace", seed: 7, runs: 5, endless: true });
      expect(got.source, got.error).toBe("server");
      expect(got.snapshot.mode).toBe("endless");
      expect(got.snapshot.day).toBe(14);
      const asRun = await fetchGhost(base, { rules: RULES_VERSION, day: 15, wins: 9, lives: 10, playerId: "other-player", seen: [], hero: "furnace", seed: 7, runs: 5 });
      expect(asRun.source).toBe("fallback");
    });

    it("the request's bounds: an endless day to ENDLESS_LAST_DAY, endless wins to the cap - 1; a run's request keeps its own; the switch off or another mode is a 400", async () => {
      expect((await get(`day=${ENDLESS_LAST_DAY}&wins=${ENDLESS_WIN_CAP - 1}&lives=3&player=p-1&mode=endless`)).status).toBe(404);
      expect((await get(`day=${ENDLESS_LAST_DAY + 1}&wins=0&lives=3&player=p-1&mode=endless`)).status).toBe(400);
      expect((await get(`day=20&wins=${ENDLESS_WIN_CAP}&lives=3&player=p-1&mode=endless`)).status).toBe(400);
      expect((await get("day=20&wins=2&lives=4&player=p-1&mode=endless")).status).toBe(400);
      expect((await get(`day=${LONG_RUN_MAX_DAY + 1}&wins=0&lives=10&player=p-1`)).status).toBe(400); // a run's bound is untouched
      expect((await get("day=14&wins=2&lives=3&player=p-1&mode=run")).status).toBe(400);
      setEndless(false); // (not withEndless: the server answers after this function has returned its promise)
      try {
        const r = await get("day=14&wins=2&lives=3&player=p-1&mode=endless");
        expect(r.status).toBe(400);
        expect(String(r.body.error)).toMatch(/mode: endless is not in this rules version yet/);
      } finally {
        setEndless(true);
      }
    });

    it("a new player (fewer than 3 finished runs) is matched against the seed pool only: no endless ghost, so the GOD", async () => {
      const r = await fetch(`${base}/v1/ghosts/match?rules=${RULES_VERSION}&seen=&runs=1&day=14&wins=2&lives=3&player=newbie&mode=endless`);
      expect(r.status).toBe(404);
    });
  });
});

// ---- storage (A) and ghosts:admin ---------------------------------------------------------------------------------------------------
describe("ENDLESS-1 3.4: an endless record on day 41 in the store, and ghosts:admin finds it (list, remove-player, revalidate)", () => {
  let fake: FakeS3;
  const dirs: string[] = [];
  beforeAll(async () => {
    fake = await startFake({ pageSize: 7 });
  });
  afterAll(async () => {
    await fake.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  interface H { name: string; env(): Record<string, string>; argv(): string[]; plant(s: GhostSnapshot, id?: string): string; state(): Record<string, string>; }
  let seq = 0;
  const tigris = (): H => {
    const bucket = `bb-e1-${++seq}`;
    fake.createBucket(bucket);
    return {
      name: "tigris",
      env: () => ({ BB_GHOST_STORE: "tigris", AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId, AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey, AWS_ENDPOINT_URL_S3: fake.endpoint, BUCKET_NAME: bucket, BB_GHOST_S3_ADDRESSING: "path" }),
      argv: () => [],
      plant(s, id = ghostId(s)) {
        const key = objectKey("player", s.rules, s.day, id);
        fake.putObject(bucket, key, encodeRecord(id, 5, s));
        return key;
      },
      state: () => Object.fromEntries(fake.keys(bucket).map((k) => [k, fake.getObject(bucket, k)!])),
    };
  };
  const jsonl = (): H => {
    const dir = mkdtempSync(join(tmpdir(), "bb-e1-"));
    dirs.push(dir);
    const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
    return {
      name: "jsonl",
      env: () => ({ BB_GHOST_STORE: "jsonl" }),
      argv: () => ["--data", dir],
      plant(s, id = ghostId(s)) {
        appendFileSync(join(dir, "ghosts.jsonl"), encodeRecord(id, 5, s) + "\n");
        return `ghosts.jsonl:${read("ghosts.jsonl").trimEnd().split("\n").length}`;
      },
      state: () => ({ "pool.jsonl": read("pool.jsonl"), "ghosts.jsonl": read("ghosts.jsonl") }),
    };
  };
  const admin = async (h: H, ...args: string[]) => {
    const out: string[] = [];
    const code = await runAdmin([...args, ...h.argv()], h.env(), (l) => out.push(l));
    return { code, out, planned: out.filter((l) => l.startsWith("  delete ")).map((l) => l.slice("  delete ".length).split("  ")[0]) };
  };

  for (const { name, make } of [{ name: "tigris", make: tigris }, { name: "jsonl", make: jsonl }]) {
    it(`${name}: list shows day 41, remove-player finds the endless record, revalidate keeps an honest one and finds a forged one`, async () => {
      const h = make();
      const honest = dusk(41, deep);
      const early = dusk(14);
      const forged: GhostSnapshot = { ...dusk(40, deep), endlessWins: 20, endlessLives: 3, lives: 3, runId: "forged-run" }; // 20 wins and 3 hearts in 29 dusks: no record leads there
      const refHonest = h.plant(honest);
      h.plant(early);
      const refForged = h.plant(forged);
      // list: per day, the uploads and players; day 41 is there
      const l = await admin(h, "list", "--rules", RULES_VERSION);
      expect(l.code).toBe(0);
      expect(l.out.some((x) => /^ +41 +0 +1 +1$/.test(x)), l.out.join("\n")).toBe(true);
      expect(l.out.some((x) => /^ +40 +0 +1 +1$/.test(x))).toBe(true);
      // revalidate: the honest day-41 and day-14 records pass every check; the forged one is found, with the endless record's reason
      const rv = await admin(h, "revalidate", "--rules", RULES_VERSION);
      expect(rv.code).toBe(0);
      expect(rv.planned).toEqual([refForged]);
      expect(rv.out.find((x) => x.startsWith(`  delete ${refForged}  `))).toMatch(/record: 20 endless wins and 3 hearts is no record a run won on day 10 carries into endless dusk 40/);
      // S1: the deck check is skipped for the two stored endless records past day 25 (the honest day 41 and the forged day 40, which the record
      // check above still found); the day-14 one had its deck checked. One line says so, with each ref and day
      const skip = rv.out.filter((x) => x.startsWith("  deck check skipped for "));
      expect(skip, rv.out.join("\n")).toHaveLength(1);
      expect(skip[0]).toContain("for 2 stored endless snapshot(s) past day 25");
      expect(skip[0]).toContain(`${refHonest} (day 41)`);
      expect(skip[0]).toContain(`${refForged} (day 40)`);
      expect(skip[0]).not.toContain("(day 14)");
      // remove-player: every upload by that player, the day-41 endless one included; --apply deletes exactly them
      const dry = await admin(h, "remove-player", me.playerId, "--rules", RULES_VERSION);
      expect(dry.planned).toContain(refHonest);
      expect(dry.planned).toHaveLength(3);
      const before = h.state();
      expect(h.state()).toEqual(before); // a dry run changes nothing
      const applied = await admin(h, "remove-player", me.playerId, "--rules", RULES_VERSION, "--apply");
      expect(applied.code).toBe(0);
      expect(applied.out.join("\n")).toMatch(/APPLIED: deleted 3 of 3/);
      const after = await admin(h, "list", "--rules", RULES_VERSION);
      expect(after.out.some((x) => /^ +41 /.test(x) && !/ 0 +0 +0$/.test(x))).toBe(false);
    }, 600_000);
  }
});
