// 0.7.0a M2 (REQ-BFG-016, REQ-BFG-009): the client wiring behind the server URL setting (docs/ASYNC.md steps 1-7).
//  D3: no server URL by default, and then the game is offline exactly as 0.6.2: no identity, no IndexedDB, no request,
//      no new storage key. ?server=<https URL> (http only for localhost/127.0.0.1) is saved; ?server=off clears it;
//      VITE_GHOST_SERVER is "" in the default build ("same-origin": the page's own origin).
//  D4: 4 s on the ghost fetch, then 0.6.2's own stand-in (standInFoe); the upload is fire and forget.
//  Steps: identity once; at dusk upload ghostOf(run, now, playerId) only if validateUpload (player mode) accepts it;
//  fetchGhost(url, { rules, day, wins, lives, playerId, seen, hero, seed, runs }, 4000); a server ghost fights as a
//  kind "ghost" DuskFoe stored in run.dusk (a reload fights it) and joins the seen list; a fallback is standInFoe.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RULES_VERSION } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): a new run's 10 hearts (was START_LIVES)
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: the 10-day run's save, kept beside the long run's
import { simulate, type SideStats } from "../src/sim/battle";
import { battleSeed, migrateRun, newRun, pendingRune, saveRun, SAVE_KEY, takeRune, type Run } from "../src/game/run";
import { duskFoe, finishDay, ghostOf, startDusk, storedFoe, storeOnlineFoe, ghostName } from "../src/game/day";
import { GHOST_KEY, loadPool, saveGhost, standInFoe } from "../src/game/ghosts";
import { PLAYER_KEY, setPlayerName } from "../src/game/ghostSnapshot";
import { PROFILE_KEY } from "../src/game/profile"; // CUSTOM-2a (REQ-BFG-072): the one profile key (REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5)
import {
  BUILD_SERVER, FETCH_TIMEOUT_MS, normalizeServerUrl, Online, resolveServerUrl, RUNS_KEY, SERVER_KEY, startOnline, stopOnline,
  UPLOAD_TIMEOUT_MS, type OnlineDeps,
} from "../src/game/online";
import { FINDING_GHOST, foeNote, online, onlineMode, SOURCE_OFFLINE, SOURCE_ONLINE } from "../src/game/session";
import { fetchGhost, submitGhost, type FetchedGhost, type SubmitResult } from "../src/net/ghostClient";
import { ghostId, SNAPSHOT_V3, SNAPSHOT_VERSION, type GhostSnapshot } from "../src/net/snapshot";
import { validateUpload } from "../src/net/validate";
import type { Identity } from "../src/net/identity";
import { createGhostServer, type GhostServer } from "../server/app";
import { seedStore } from "../server/seed";
import { generateSamplePool } from "./helpers/poolCache";
import { testIdentity, TEST_NAME } from "./netIdentity";

const NOSTATS = {} as SideStats;
const SEED_POOL = generateSamplePool();

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()].sort(),
  };
}

async function until(cond: () => boolean, ms = 6000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

// FLIP-X2: an upload (validateUpload, player mode) must hold exactly `day` runes (was at most `day`, so a rune-less day-1
// deck went up), so a run that uploads takes its dawn's rune (the first card) before its dusk, as tooling.ts playOut does
function takeDawnRune(run: Run): void {
  const offer = pendingRune(run);
  if (offer) takeRune(run, offer.ids[0]);
}

const g = globalThis as { localStorage?: Storage };
afterEach(() => {
  stopOnline();
  delete g.localStorage;
});

describe("D3: the server URL setting", () => {
  it("the default build sets none (VITE_GHOST_SERVER is \"\"), and with nothing set nothing resolves and nothing is written", () => {
    expect(BUILD_SERVER).toBe("");
    const store = mem();
    expect(resolveServerUrl("", store)).toBeNull();
    expect(resolveServerUrl("?seed=4&other=1", store)).toBeNull();
    expect(resolveServerUrl("", store, { origin: "https://beltbattles.fly.dev" })).toBeNull();
    expect(store.keys()).toEqual([]);
  });

  it("?server=<https URL> is used and saved; http only for localhost and 127.0.0.1; ?server=off clears it", () => {
    const store = mem();
    expect(resolveServerUrl("?server=https://beltbattles.fly.dev/", store)).toBe("https://beltbattles.fly.dev");
    expect(store.getItem(SERVER_KEY)).toBe("https://beltbattles.fly.dev");
    expect(resolveServerUrl("", store)).toBe("https://beltbattles.fly.dev"); // the next load: the saved URL
    expect(resolveServerUrl("?server=http://127.0.0.1:7790", store)).toBe("http://127.0.0.1:7790");
    expect(resolveServerUrl("?server=http://localhost:7790/api/", store)).toBe("http://localhost:7790/api");
    expect(store.getItem(SERVER_KEY)).toBe("http://localhost:7790/api");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    for (const bad of ["http://evil.example", "ftp://x.example", "https://user:pw@x.example", "not a url", "javascript:alert(1)"]) {
      expect(resolveServerUrl(`?server=${encodeURIComponent(bad)}`, store), bad).toBe("http://localhost:7790/api"); // ignored: the saved one stays
    }
    debug.mockRestore();
    expect(resolveServerUrl("?server=off", store)).toBeNull();
    expect(store.keys()).toEqual([]);
    expect(resolveServerUrl("", store)).toBeNull();
  });

  it("the build's VITE_GHOST_SERVER: a URL, or same-origin for the page's own https (or local) origin; a saved URL wins", () => {
    const store = mem();
    expect(resolveServerUrl("", store, { build: "https://ghosts.example/" })).toBe("https://ghosts.example");
    expect(resolveServerUrl("", store, { build: "same-origin", origin: "https://beltbattles.fly.dev" })).toBe("https://beltbattles.fly.dev");
    expect(resolveServerUrl("", store, { build: "same-origin", origin: "http://shore.example:7778" })).toBeNull(); // plain http
    expect(resolveServerUrl("", store, { build: "same-origin", origin: "http://127.0.0.1:7778" })).toBe("http://127.0.0.1:7778");
    expect(resolveServerUrl("?server=off", store, { build: "https://ghosts.example" })).toBeNull(); // off: offline this load
    store.setItem(SERVER_KEY, "https://saved.example");
    expect(resolveServerUrl("", store, { build: "https://ghosts.example" })).toBe("https://saved.example");
    expect(normalizeServerUrl("https://x.example/a/b/?q=1#h")).toBe("https://x.example/a/b");
  });

  it("with no URL the day loop is 0.6.2's: no session, no identity, no IndexedDB, no request, no new storage key", () => {
    const store = mem();
    g.localStorage = store;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("no request may be made offline"); });
    let idb = 0;
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, get: () => { idb++; return undefined; } });
    try {
      // main.ts: no ?server=, nothing saved, the default build: no session is started
      const url = resolveServerUrl("", store, { origin: "https://beltbattles.example" });
      expect(url).toBeNull();
      expect(online()).toBeNull();
      expect(onlineMode()).toBe(false);
      // the screens' calls, day by day, as they run offline (build preview, game step, dusk, result)
      const run = newRun("weaver", 4242);
      let foes = 0;
      while (!run.over) {
        online()?.tick(run); // game.ts, every frame
        const preview = duskFoe(run, onlineMode() ? [] : loadPool()); // build.ts
        expect(foeNote(run, preview)).toBeNull(); // 0.6.2's NEXT BATTLE card
        const foe = startDusk(run, loadPool()); // battle.ts, offline branch
        expect(foe).toEqual(preview);
        expect(foe.source).toBeUndefined();
        const mine = ghostOf(run);
        const b = simulate(run.build, foe.build, battleSeed(run));
        const res = finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS);
        expect(res.record).toBeUndefined();
        saveGhost(mine);
        saveRun(run);
        foes++;
      }
      expect(foes).toBeGreaterThan(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(idb).toBe(0);
      // CUSTOM-2a (REQ-BFG-072): decision D3 amended for exactly one more offline key, the profile (REVIEW-CUSTOM1 Q1, turn 9ecab1cc78e896d5)
      expect(store.keys().every((k) => [SAVE_KEY, GHOST_KEY, PLAYER_KEY, PROFILE_KEY].includes(k))).toBe(true); // 0.6.2's keys and the profile only
      expect(store.keys()).not.toContain(SERVER_KEY);
      expect(store.keys()).not.toContain(RUNS_KEY);
      expect(run).not.toHaveProperty("seenGhosts");
      expect(run).not.toHaveProperty("uploaded");
    } finally {
      fetchSpy.mockRestore();
      delete (globalThis as { indexedDB?: unknown }).indexedDB;
    }
  });
});

// ---------------------------------------------------------------- the session, with fakes

const SERVED = SEED_POOL.find((s) => s.day === 1 && s.build.routes.some((r) => r.join !== undefined)) ?? SEED_POOL[0];

function fakes(over: Partial<OnlineDeps> = {}, answer: (req: unknown) => FetchedGhost = () => ({ id: ghostId(SERVED), snapshot: SERVED, source: "server" })) {
  const calls = { fetch: [] as unknown[][], submit: [] as unknown[][], saves: 0 };
  const store = mem();
  let ident: Identity | null = null;
  const deps: OnlineDeps = {
    fetchGhost: (async (...a: unknown[]) => {
      calls.fetch.push(a);
      return answer(a[1]);
    }) as unknown as typeof fetchGhost,
    submitGhost: ((...a: unknown[]) => {
      calls.submit.push(a);
      return new Promise<SubmitResult>(() => {}); // never answers: nothing may wait for it
    }) as unknown as typeof submitGhost,
    identity: async () => ident,
    store, now: () => 1_790_000_000_000, save: () => void calls.saves++,
    ...over,
  };
  return { deps, calls, store, setIdentity: (i: Identity | null) => (ident = i) };
}

describe("the online session (src/game/online.ts), with fakes", () => {
  let me: Identity;
  beforeAll(async () => {
    me = await testIdentity(3);
  });

  it("fetches tonight's ghost once with the full request and a 4 s deadline, stores a kind ghost DuskFoe, saves, and remembers its id", async () => {
    const f = fakes();
    f.setIdentity(me);
    const s = startOnline("https://ghosts.example", f.deps);
    await until(() => s.active);
    expect(onlineMode()).toBe(true);
    const run = newRun("furnace", 99);
    run.seenGhosts = ["gaaaaaaaaaaaaaa"];
    expect(s.searching(run)).toBe(true);
    expect(foeNote(run, duskFoe(run, []))).toBe(FINDING_GHOST);
    s.tick(run);
    s.tick(run); // in flight: no second request
    expect(f.calls.fetch).toHaveLength(1);
    const [url, req, ms] = f.calls.fetch[0];
    expect(url).toBe("https://ghosts.example");
    expect(ms).toBe(FETCH_TIMEOUT_MS);
    expect(FETCH_TIMEOUT_MS).toBe(4000); // D4
    // HULL-ON (the flip, HEARTS): lives START_LIVES (5) -> HEARTS_START (10): a new run starts with 10 hearts, and the request
    // states the run's own lives going into the dusk
    expect(req).toEqual({ rules: RULES_VERSION, day: 1, wins: 0, lives: HEARTS_START, playerId: me.playerId, seen: ["gaaaaaaaaaaaaaa"], hero: "furnace", seed: battleSeed(run), runs: 0 });
    await until(() => s.lastFetch !== null);
    s.tick(run);
    const foe = storedFoe(run)!;
    expect(foe).toMatchObject({ day: 1, kind: "ghost", name: ghostName(SERVED), hero: SERVED.hero, source: "online", ghostId: ghostId(SERVED) });
    expect(foe.build).toEqual(SERVED.build);
    expect(foe.build).not.toBe(SERVED.build); // a cloned build
    // BUMP-1D: a served seed ghost states its losses now (the long run's pool: every ghost does), and the dusk foe's record stamp
    // carries a snapshot's stated losses, one optional key, last (b4b8dd4: day.ts `stated`, DuskFoe.record.losses; foeTitle prints
    // W-L from it) (was { wins, lives, runId, playerId, createdAt } alone)
    expect(foe.record).toEqual({ wins: SERVED.wins, lives: SERVED.lives, runId: SERVED.runId, playerId: SERVED.playerId, createdAt: SERVED.createdAt, ...(SERVED.losses !== undefined ? { losses: SERVED.losses } : {}) });
    expect(run.seenGhosts).toEqual(["gaaaaaaaaaaaaaa", ghostId(SERVED)]);
    expect(f.calls.saves).toBe(1);
    expect(foeNote(run, foe)).toBe(SOURCE_ONLINE);
    s.tick(run);
    expect(f.calls.fetch).toHaveLength(1); // stored: no new fetch today
    // the dusk fights exactly the stored ghost; a reload (the saved JSON) fights it again
    expect(startDusk(run, [], { ghost: null })).toBe(foe);
    const again = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(startDusk(again, [], { ghost: null })).toEqual(foe);
    expect(simulate(again.build, storedFoe(again)!.build, battleSeed(again)).winner).toBe(simulate(run.build, foe.build, battleSeed(run)).winner);
  });

  it("a fallback answer (fetchGhost's offline- stand-in) is 0.6.2's own dusk stand-in, standInFoe, and joins no seen list", async () => {
    const f = fakes({}, (req) => ({ id: "offline-weaver-d1", snapshot: SERVED, source: "fallback", error: "timeout", ...(req ? {} : {}) }));
    f.setIdentity(me);
    const s = startOnline("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = newRun("furnace", 7);
    s.tick(run);
    await until(() => s.lastFetch !== null);
    s.tick(run);
    const st = standInFoe(run.seed, run.day);
    expect(storedFoe(run)).toEqual({ day: 1, kind: "standin", name: st.name, hero: st.hero, build: st.build, rival: st.id, source: "offline" });
    expect(run.seenGhosts).toBeUndefined();
    expect(foeNote(run, storedFoe(run)!)).toBe(SOURCE_OFFLINE);
    // the scout's reveal or the dusk gate's deadline never wait: settle stores the stand-in when nothing has answered
    const run2 = newRun("weaver", 8);
    const slow = fakes({ fetchGhost: (() => new Promise(() => {})) as unknown as typeof fetchGhost });
    slow.setIdentity(me);
    const s2 = new Online("https://ghosts.example", slow.deps);
    await until(() => s2.active);
    s2.settle(run2);
    expect(storedFoe(run2)).toMatchObject({ kind: "standin", source: "offline", name: standInFoe(run2.seed, 1).name });
  });

  it("no identity (no WebCrypto, or plain http): the session has failed and the game plays offline: no fetch, no upload", async () => {
    const f = fakes();
    f.setIdentity(null);
    const s = startOnline("https://ghosts.example", f.deps);
    await until(() => s.failed);
    expect(onlineMode()).toBe(false);
    const run = newRun("furnace", 3);
    s.tick(run);
    s.submitDusk(run);
    expect(f.calls.fetch).toHaveLength(0);
    expect(f.calls.submit).toHaveLength(0);
    expect(foeNote(run, duskFoe(run, loadPool()))).toBeNull(); // 0.6.2's card
  });

  // FLIP-X2: the name said "as ghostOf v2"; ghostOf writes v3 since RUNES-1 (the assertion below already pinned SNAPSHOT_V3)
  it("uploads tonight's deck once per dusk, as ghostOf v3 under the device's playerId, only if validateUpload accepts it, never awaited", async () => {
    const f = fakes();
    f.setIdentity(me);
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = newRun("weaver", 31);
    takeDawnRune(run); // FLIP-X2: an upload holds `day` runes (was: none taken, refused "rune: runes: 0 held on day 1")
    s.submitDusk(run); // returns at once although the upload never answers
    s.submitDusk(run);
    expect(f.calls.submit).toHaveLength(1);
    const [url, snap, ident, ms] = f.calls.submit[0] as [string, GhostSnapshot, Identity, number];
    expect([url, ident, ms]).toEqual(["https://ghosts.example", me, UPLOAD_TIMEOUT_MS]);
    expect(snap).toEqual(ghostOf(run, 1_790_000_000_000, me.playerId));
    expect([snap.v, snap.rules, snap.playerId]).toEqual([SNAPSHOT_V3, RULES_VERSION, me.playerId]); // RUNES-1: v3 (the seed)
    expect(snap.build.runes).toEqual(run.build.runes); // FLIP-X2: the dawn's rune travels with the deck (runes only in v3)
    expect(snap.build.runes).toHaveLength(1);
    expect(run.uploaded).toBe(1);
    // a deck the player mode refuses is not uploaded (a console.debug line says why)
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const rich = newRun("weaver", 32);
    // FLIP-X2: the dawn's rune first, so the refusal is the budget's (without it: "rune: runes: 0 held on day 1"); the 20
    // ARMOR PACKs go on top of any hull the rune gave (was `= 5000` on a rune-less deck; validate.ts reads the bought hull)
    takeDawnRune(rich);
    rich.build.hullBonus += 5000; // NUM-1: hull x10 (was 500: 20 ARMOR PACKs, over day 1's budget)
    expect(validateUpload(rich.build, 1).ok).toBe(false);
    s.submitDusk(rich);
    expect(f.calls.submit).toHaveLength(1);
    expect(debug).toHaveBeenCalledWith(expect.stringMatching(/^\[beltbattles\] tonight's deck is not uploaded: budget/));
    expect(s.lastUpload).toMatchObject({ ok: false, refused: true });
    debug.mockRestore();
  });

  it("D2: counts each finished run once (won or lost) and sends the count as runs", async () => {
    const f = fakes();
    f.setIdentity(me);
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    expect(s.runs()).toBe(0);
    const run = newRun("furnace", 5);
    s.countRun(run); // not over: nothing
    run.over = "lost";
    s.countRun(run);
    s.countRun(run);
    expect(s.runs()).toBe(1);
    const next = newRun("furnace", 6);
    next.over = "complete";
    s.countRun(next);
    expect(s.runs()).toBe(2);
    expect(JSON.parse(f.store.getItem(RUNS_KEY)!)).toEqual({ runs: 2, last: next.runId });
    expect(s.request(newRun("weaver", 9)).runs).toBe(2);
  });
});

// ---------------------------------------------------------------- end to end against the in-process ghost server

describe("online end to end (the in-process server, signed uploads open, the seed pool)", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  let device: Identity;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-online-"));
    app = createGhostServer({ dataDir: dir, uploads: "open", log: () => {}, matchSalt: () => 0, rateLimit: { windowMs: 60_000, max: 1000 } });
    base = `http://127.0.0.1:${await app.listen(0)}`;
    await seedStore(app.store);
    device = await testIdentity(3);
    setPlayerName(TEST_NAME); // PACKS M2 (REQ-BFG-063): the device has a player name, so its uploads carry it
  }, 120_000); // BUMP-1F (RULING-BUMP1F-R1 R1.2 and RULING-BUMP1F-R11 R11.4; CACHE-1 finding 1): this hook's first seedStore builds the pool check the import-time build no longer warms: 120 s, was the 10-s hook default (13.9 s alone); the vite.config default is untouched

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const realDeps = (store = mem()): OnlineDeps => ({ fetchGhost, submitGhost, identity: async () => device, store, now: () => 1_790_000_000_000, save: () => {} });

  it("a dusk online: a seed ghost for a new player, fought on battleSeed; the upload is stored under the device's playerId; seen grows", async () => {
    const s = startOnline(base, realDeps());
    await until(() => s.active);
    const run = newRun("furnace", 2026);
    takeDawnRune(run); // FLIP-X2: an upload holds `day` runes (was: none taken, refused locally, so nothing was stored)
    s.tick(run);
    await until(() => s.lastFetch !== null);
    s.tick(run);
    const foe = storedFoe(run)!;
    expect(s.lastFetch!.source).toBe("server");
    expect(foe).toMatchObject({ kind: "ghost", source: "online" });
    expect(SEED_POOL.map(ghostId)).toContain(foe.ghostId); // runs 0: the seed pool (D2)
    expect(foe.record!.wins).toBe(0); // D1 at dusk 1: 0 wins, at most 5 lives
    // the dusk: the build committed, the deck goes up (fire and forget), the fight runs on battleSeed
    startDusk(run, [], { ghost: null });
    s.submitDusk(run);
    const b = simulate(run.build, foe.build, battleSeed(run));
    finishDay(run, b.winner ?? -1, b.t, NOSTATS, NOSTATS);
    await until(() => s.lastUpload !== null);
    expect(s.lastUpload).toMatchObject({ ok: true });
    const stored = (await app.store.bucket(RULES_VERSION, 1)).filter((e) => e.snapshot.playerId === device.playerId);
    expect(stored).toHaveLength(1);
    expect(stored[0].snapshot.runId).toBe(run.runId);
    // day 2: the request carries the ghost already fought
    s.tick(run);
    await until(() => storedFoe(run) !== null || s.fetches > 1);
    await until(() => s.lastFetch !== null && s.lastFetch.snapshot.day === 2);
    s.tick(run);
    expect(run.seenGhosts).toContain(foe.ghostId);
    expect(storedFoe(run)!.ghostId).not.toBe(foe.ghostId);
  });

  it("uploads closed: 403, silently; a server that is down: the fetch falls back to 0.6.2's stand-in", async () => {
    const closed = createGhostServer({ dataDir: mkdtempSync(join(dir, "closed-")), uploads: "closed", log: () => {}, matchSalt: () => 0 });
    const cbase = `http://127.0.0.1:${await closed.listen(0)}`;
    try {
      const s = new Online(cbase, realDeps());
      await until(() => s.active);
      const run = newRun("weaver", 77);
      takeDawnRune(run); // FLIP-X2: an upload holds `day` runes (was: none taken, refused locally before any request, no 403)
      s.submitDusk(run);
      await until(() => s.lastUpload !== null);
      expect(s.lastUpload).toMatchObject({ ok: false, status: 403 });
    } finally {
      await closed.close();
    }
    const down = new Online("http://127.0.0.1:9", realDeps()); // nothing listens there
    await until(() => down.active);
    const run = newRun("weaver", 78);
    down.tick(run);
    await until(() => down.lastFetch !== null);
    down.tick(run);
    expect(down.lastFetch!.source).toBe("fallback");
    expect(storedFoe(run)).toMatchObject({ kind: "standin", source: "offline", name: standInFoe(run.seed, 1).name });
  });
});

// ---------------------------------------------------------------- the save stays v7

describe("save v7: online play's fields are optional; every older save still loads", () => {
  it("an online run's fields round-trip; malformed ones are dropped; an offline run has none of them", () => {
    const run = newRun("furnace", 11);
    expect(Object.keys(run)).not.toEqual(expect.arrayContaining(["seenGhosts"]));
    const live: Run = { ...JSON.parse(JSON.stringify(run)), seenGhosts: ["g00112233445566", "bad id!"], uploaded: 1 };
    storeOnlineFoe(live, { id: "g0123456789abcd", snapshot: SERVED, source: "server" });
    const back = migrateRun(JSON.parse(JSON.stringify(live)))!;
    expect(back.seenGhosts).toEqual(["g00112233445566", "g0123456789abcd"]);
    expect(back.uploaded).toBe(1);
    expect(back.dusk).toMatchObject({ source: "online", ghostId: "g0123456789abcd" });
    // BUMP-1D: this run is a long run (bb-0.11.0, LONG_RUN on: run.longRun true), whose save keeps any integer `uploaded` from 1 on ("a long
    // run uploads on any day", save.ts normalizeOnline: no RUN_DAYS bound), so 99 is no junk here: the malformed value is 0 (below 1); the
    // 99 case is the 10-day run's, kept in the twin below (was uploaded: 99)
    const junk = migrateRun({ ...JSON.parse(JSON.stringify(live)), seenGhosts: "x", uploaded: 0, dusk: { ...live.dusk, source: "elsewhere", ghostId: "?" }, history: [{ day: 1, outcome: "win", income: 9, time: 20, foe: "x", ghost: false, player: {}, enemy: {}, record: { rules: 5 }, hulls: [1] }] })!;
    expect(junk.seenGhosts).toBeUndefined();
    expect(junk.uploaded).toBeUndefined();
    expect(junk.dusk!.source).toBeUndefined();
    expect(junk.dusk!.ghostId).toBeUndefined();
    expect(junk.history[0].record).toBeUndefined();
    expect(junk.history[0].hulls).toBeUndefined();
  });

  it("BUMP-1D: an `uploaded` past RUN_DAYS (99) is dropped from a 10-day run's save (withLongRun false: the old world) and kept in a long run's (no day bound)", () => {
    const ten = withLongRun(() => newRun("furnace", 11), false);
    expect(ten.longRun).toBeUndefined();
    const long = newRun("furnace", 11);
    expect(long.longRun).toBe(true);
    const save = (r: Run, uploaded: number) => migrateRun({ ...JSON.parse(JSON.stringify(r)), uploaded })!;
    expect(save(ten, 99).uploaded).toBeUndefined(); // the old world: 99 is past the 10 days
    expect(save(ten, 10).uploaded).toBe(10); // and the last day of it is not
    expect(save(long, 99).uploaded).toBe(99); // a long run uploads on any day
    expect(save(long, 0).uploaded).toBeUndefined();
    expect(save(long, 1.5).uploaded).toBeUndefined();
  });

  it("v3, v4, v5 and v6 saves load as before, with none of the new fields", () => {
    const base = JSON.parse(JSON.stringify(newRun("weaver", 777, "z"))) as Record<string, unknown>;
    const v6 = { ...base, version: 6 };
    delete (v6 as Record<string, unknown>).fuseFx;
    const v5 = { ...v6, version: 5 };
    for (const k of ["road", "warlord", "warlords", "matriarchBeatenOn", "bounty", "sabotage"]) delete (v5 as Record<string, unknown>)[k];
    const v4 = { ...v5, version: 4, round: 2 } as Record<string, unknown>;
    delete v4.day;
    delete v4.runId;
    delete v4.dusk;
    const v3 = { ...v4, version: 3 } as Record<string, unknown>;
    for (const k of ["stage", "event", "foe", "nextShop", "events"]) delete v3[k];
    for (const [name, save] of [["v3", v3], ["v4", v4], ["v5", v5], ["v6", v6]] as const) {
      const m = migrateRun(JSON.parse(JSON.stringify(save)));
      expect(m, name).not.toBeNull();
      expect(m!.version, name).toBe(8); // NUM-1: save v8 (save.ts v7to8; was 7)
      for (const k of ["seenGhosts", "uploaded"]) expect(m, `${name} ${k}`).not.toHaveProperty(k);
      expect(m!.history.every((h) => h.record === undefined && h.hulls === undefined), name).toBe(true);
    }
  });
});
