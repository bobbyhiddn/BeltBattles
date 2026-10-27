// S1 (BRIEF-S1; LAUNCH-0 run 3, REPORT section 1.4 item 6): POST /v1/ghosts refuses an ENDLESS snapshot past ENDLESS_ONLINE_LAST_DAY (25) with a cheap
// 422 and a one-line reason, BEFORE validateUpload (server/app.ts, step 5b). The game never uploads such a dusk (online.ts offlineEndless: past
// day 25 the foe is the GOD stand-in and nothing goes up), but the strict decoder takes an endless day to ENDLESS_LAST_DAY (64) and the deck check
// grows about x1.11 a day: a signed day-33 endless snapshot held the real 0.9.13 server for 7.7 s, day 41 costs 26 s and 221 MB, so one POST from a
// hand-built client with a free key could freeze or kill the 256 MB server. Here, on both stores (JSON lines; Tigris on the in-process fake S3):
//  - an honest signed endless snapshot of day 26 and one of day 33 each get 422 with that reason, and the deck check NEVER RUNS (validateUpload is
//    spied: it calls through, so every other POST behaves as before; the proof is that it is not called), and nothing is stored;
//  - the guard is before the deck check (a forged deck on day 33 is refused for its day) and after the signature, decode and playerId checks;
//  - a day-25 endless snapshot (the last online day) and a run (not endless) snapshot still take the normal path;
//  - ghosts:admin revalidate (the one other place that re-runs the deck check on stored snapshots) skips a stored endless snapshot past day 25 with
//    one line, and still finds a forged endless record by the cheap checks.
// The honest runs are played through the game's own code (tests/endless1.honest.ts), a lean deck (`buys: 0`) so a deck check is as cheap as it gets.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDLESS, ENDLESS_LAST_DAY, ENDLESS_ONLINE_LAST_DAY, setEndless } from "../src/sim/endless";
import { RULES_VERSION } from "../src/sim/content";
import { setPlayerName } from "../src/game/ghostSnapshot";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import { runAdmin, uploadProblems, type StoredRecord } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import type { GhostServer } from "../server/app";
import type { Identity } from "../src/net/identity";
import { storeBackends } from "./netStores";
import { signedHeaders, testIdentity, TEST_NAME } from "./netIdentity";
import { playEndless, WIN, LOSS } from "./endless1.honest";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The deck check, spied. It calls through to the real one, so a POST that reaches it behaves exactly as before.
vi.mock("../src/net/validate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/net/validate")>();
  return { ...actual, validateUpload: vi.fn(actual.validateUpload) };
});
const deckChecks = () => vi.mocked(validateUpload);

setPlayerName(TEST_NAME);

let me: Identity, other: Identity;
let endlessSnaps: GhostSnapshot[]; // a lean honest endless, days 11-34 (a run won on day 10; WIN, WIN, LOSS, then wins)
let runSnaps: GhostSnapshot[]; // the same run's dusks before its win, days 1-10
const dusk = (day: number): GhostSnapshot => endlessSnaps.find((s) => s.day === day)!;
const reason = (day: number) => `day: ${day} is past the last online endless day ${ENDLESS_ONLINE_LAST_DAY}`;

beforeAll(async () => {
  setEndless(true);
  me = await testIdentity(0);
  other = await testIdentity(1);
  const played = playEndless("weaver", 42, me.playerId, { endlessOutcomes: [WIN, WIN, LOSS, ...Array(40).fill(WIN)], buys: 0, until: 34 });
  endlessSnaps = played.endlessSnaps;
  runSnaps = played.runSnaps;
}, 300_000);
afterAll(() => setEndless(ENDLESS));
beforeEach(() => {
  deckChecks().mockClear();
});

it("the bound is the game's own: ENDLESS_ONLINE_LAST_DAY is 25, below the decoder's ENDLESS_LAST_DAY, and the honest run has dusks on both sides of it", () => {
  expect(ENDLESS_ONLINE_LAST_DAY).toBe(25);
  expect(ENDLESS_LAST_DAY).toBeGreaterThan(ENDLESS_ONLINE_LAST_DAY);
  for (const d of [ENDLESS_ONLINE_LAST_DAY, ENDLESS_ONLINE_LAST_DAY + 1, 33]) expect([dusk(d).mode, dusk(d).day, dusk(d).victoryDay]).toEqual(["endless", d, 10]);
});

describe.each(storeBackends())("S1: POST /v1/ghosts on the $name store", (backend) => {
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

  const post = async (s: unknown, who: Identity = me): Promise<{ status: number; body: Record<string, unknown> }> => {
    const body = JSON.stringify(s); // not encodeSnapshot: the server's own checks must see it as sent
    const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(who, body), body });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };

  // These two run first, in a cold process: the deck check of day 33 would cost 7.7 s of CPU here (11 s at the LAUNCH-0 bench), so the time bound means something
  for (const day of [ENDLESS_ONLINE_LAST_DAY + 1, 33]) {
    it(`an honest signed endless snapshot of day ${day}: 422 '${reason(day)}'; the deck check never runs; nothing is stored`, async () => {
      const s = dusk(day);
      const before = backend.storedRecords();
      const t0 = performance.now();
      const r = await post(s);
      const ms = performance.now() - t0;
      expect([r.status, r.body], JSON.stringify(r.body)).toEqual([422, { error: reason(day) }]);
      expect(deckChecks()).not.toHaveBeenCalled(); // the proof: validateUpload was never called
      expect(ms).toBeLessThan(2000); // and a sanity bound far under the deck check's seconds
      expect(backend.storedRecords()).toBe(before);
      expect(await app.store.bucket(RULES_VERSION, day)).toEqual([]);
    }, 120_000);
  }

  it("the guard is before the deck check: a day-33 endless snapshot with an illegal deck is refused for its day, not 'deck failed validation'", async () => {
    // the illegal deck: its first rig placed twice, on the same cells (the decoder takes it; validateUpload refuses it on any day). Proved on day 11, where the
    // check is cheap: the honest deck passes the server's own call and the doubled one does not
    const doubled = (s: GhostSnapshot): GhostSnapshot => ({ ...s, build: { ...s.build, items: [...s.build.items, { ...s.build.items[0], uid: Math.max(...s.build.items.map((i) => i.uid)) + 1 }] } });
    const call = (s: GhostSnapshot) => validateUpload(s.build, s.day, s.rules, { seed: s.seed, ...(s.lastChance ? { lastChance: s.lastChance } : {}), ...(s.road ? { road: s.road } : {}), ...(s.firstRun ? { firstRun: true } : {}) });
    expect(call(dusk(11)).ok).toBe(true);
    expect(call(doubled(dusk(11))).ok).toBe(false);
    deckChecks().mockClear();
    const r = await post(doubled(dusk(33)));
    expect([r.status, r.body.error], JSON.stringify(r.body)).toEqual([422, reason(33)]);
    expect(r.body.errors).toBeUndefined(); // no deck errors: the deck was not looked at
    expect(deckChecks()).not.toHaveBeenCalled();
  }, 120_000);

  it("the guard comes after the signature, the strict decode and the playerId check: a bad signature is 401, another key 403, a day past the decoder's bound 400", async () => {
    const s = dusk(33);
    const body = JSON.stringify(s);
    const badSig = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body + " "), body }); // signed over other bytes
    expect(badSig.status).toBe(401);
    expect((await post(s, other)).status).toBe(403); // `me`'s snapshot under `other`'s key
    const past = await post({ ...s, day: ENDLESS_LAST_DAY + 1 });
    expect([past.status, String(past.body.error)]).toEqual([400, expect.stringMatching(/snapshot\.day/)]);
    expect(deckChecks()).not.toHaveBeenCalled();
  }, 120_000);

  it("day 25, the last online day, takes the normal path: 201 after the deck check, stored in its bucket; a re-send is 200", async () => {
    const s = dusk(ENDLESS_ONLINE_LAST_DAY);
    const r = await post(s);
    expect([r.status, r.body], JSON.stringify(r.body)).toEqual([201, { id: ghostId(s) }]);
    expect(deckChecks()).toHaveBeenCalledTimes(1);
    expect(deckChecks().mock.calls[0][1]).toBe(ENDLESS_ONLINE_LAST_DAY); // validateUpload(build, day, ...)
    expect((await app.store.bucket(RULES_VERSION, ENDLESS_ONLINE_LAST_DAY)).map((e) => e.id)).toContain(ghostId(s));
    expect((await post(s)).status).toBe(200);
  }, 120_000);

  it("a run snapshot (not endless) is unaffected: its dusk of day 10 takes the normal path, 201 after the deck check", async () => {
    const s = runSnaps.find((x) => x.day === 10)!;
    expect(s.mode).toBeUndefined();
    const r = await post(s);
    expect([r.status, r.body], JSON.stringify(r.body)).toEqual([201, { id: ghostId(s) }]);
    expect(deckChecks()).toHaveBeenCalledTimes(1);
    expect(deckChecks().mock.calls[0][1]).toBe(10);
  }, 120_000);
});

// ---- ghosts:admin revalidate, the one other place that re-runs the deck check on a stored snapshot -------------------------------------------------
describe("S1: ghosts:admin revalidate skips the deck check of a stored endless snapshot past day 25", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });
  const stored = (s: GhostSnapshot, line = 1): StoredRecord => ({ ref: `ghosts.jsonl:${line}`, kind: "upload", day: s.day, id: ghostId(s), playerId: s.playerId, text: encodeRecord(ghostId(s), 5, s), keyed: false });
  // 10 endless wins and 3 hearts in 22 endless dusks: no run leads there (at most 2 draws and a few hearts' worth of losses)
  const forgedAt = (day: number): GhostSnapshot => ({ ...dusk(day), endlessWins: 10, endlessLives: 3, lives: 3, runId: "forged-run" });

  it("uploadProblems: no deck check and onSkip told for day 33; the cheap checks still find a forged record; day 25 and below are deck-checked as before", () => {
    const skipped: [string, number][] = [];
    expect(uploadProblems(stored(dusk(33), 3), RULES_VERSION, (ref, day) => skipped.push([ref, day]))).toEqual([]);
    expect(skipped).toEqual([["ghosts.jsonl:3", 33]]);
    expect(deckChecks()).not.toHaveBeenCalled();
    expect(uploadProblems(stored(forgedAt(33)), RULES_VERSION)).toEqual([expect.stringMatching(/^record: 10 endless wins and 3 hearts is no record a run won on day 10 carries into endless dusk 33/)]);
    expect(deckChecks()).not.toHaveBeenCalled();
    skipped.length = 0;
    expect(uploadProblems(stored(dusk(ENDLESS_ONLINE_LAST_DAY)), RULES_VERSION, (ref, day) => skipped.push([ref, day]))).toEqual([]);
    expect(skipped).toEqual([]);
    expect(deckChecks()).toHaveBeenCalledTimes(1); // day 25 is deck-checked
  }, 120_000);

  it("runAdmin revalidate over an honest day 33, a forged day 33 and an honest day 20: one skip line for the two deep ones, the forged one planned, the deck checked once", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bb-s1-"));
    dirs.push(dir);
    for (const s of [dusk(33), forgedAt(33), dusk(20)]) appendFileSync(join(dir, "ghosts.jsonl"), encodeRecord(ghostId(s), 5, s) + "\n");
    const out: string[] = [];
    const code = await runAdmin(["revalidate", "--rules", RULES_VERSION, "--data", dir], { BB_GHOST_STORE: "jsonl" }, (l) => out.push(l));
    expect(code, out.join("\n")).toBe(0);
    expect(out.filter((l) => l.startsWith("  delete ")).map((l) => l.slice("  delete ".length).split("  ")[0])).toEqual(["ghosts.jsonl:2"]);
    const skip = out.filter((l) => l.startsWith("  deck check skipped for "));
    expect(skip, out.join("\n")).toHaveLength(1);
    expect(skip[0]).toContain("for 2 stored endless snapshot(s) past day 25");
    expect(skip[0]).toContain("ghosts.jsonl:1 (day 33)");
    expect(skip[0]).toContain("ghosts.jsonl:2 (day 33)");
    expect(skip[0]).not.toContain("ghosts.jsonl:3");
    expect(deckChecks()).toHaveBeenCalledTimes(1); // the day-20 record only
    expect(out.join("\n")).toContain("DRY RUN: nothing was deleted");
  }, 120_000);
});
