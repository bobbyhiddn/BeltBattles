// PROFILE-UP step 4 (REQ-BFG-074 clause 4, backlog #371; BRIEF-PROFILEUP P7): the client half. putProfile builds the wire form
// (never seen, folded or runNew), signs it in the profile domain and PUTs it; every failure is a value, never a throw or a
// console line. game/online.ts calls it after a run's end was folded (once per run id) and after a CUSTOMIZE pick (debounced,
// dropped when a run's end comes first), only in its online state (an identity loaded), one try per trigger, never at boot, and
// writes no storage key. The offline page makes no request and opens no IndexedDB.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { PROFILE_KEY, emptyProfile, evaluateUnlocks, foldDusk, foldEnd, loadProfile, saveProfile, type Profile, type RunFacts } from "../src/game/profile";
import { HISTORY_KEY } from "../src/game/history"; // IDENT-2: the one new key a device writes
import { PROFILE_DEBOUNCE_MS, UPLOAD_TIMEOUT_MS, startOnline, stopOnline, type Online, type OnlineDeps } from "../src/game/online";
import { online, setSession, type Session } from "../src/game/session";
import { foldDuskResult, foldRunEnd, foldWarlordResult } from "../src/game/styleFolds";
import { newRun, type Run } from "../src/game/run";
import { CustomizeState } from "../src/screens/customize";
import { KEY_HEADER, SIG_HEADER, verifyProfile, verifyUpload, type Identity } from "../src/net/identity";
import { putProfile } from "../src/net/profileClient";
import { MAX_PROFILE_BYTES, decodeWire, encodeWire, toWire } from "../src/net/profileWire";
import type { fetchGhost, submitGhost } from "../src/net/ghostClient";
import { createGhostServer } from "../server/app";
import { MemoryProfileStore } from "../server/profileStore";
import type { GhostStore } from "../server/store";
import { testIdentity } from "./netIdentity";

let ME: Identity;
beforeAll(async () => {
  ME = await testIdentity(0);
});

const g = globalThis as { localStorage?: Storage; indexedDB?: unknown };

function mem(): Storage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()].sort(),
  };
}

const facts = (o: Partial<RunFacts> = {}): RunFacts => ({ runId: "r1", hero: "furnace", day: 2, over: null, flawless: false, belts: 1, ...o });

/** A player some runs in (as tests/customize.test.ts has it): TIMBER DECK and TREAD PLATE open, VERDIGRIS belts. */
function player(st: Storage): Profile {
  const p = loadProfile(st);
  for (let d = 1; d <= 4; d++) foldDusk(p, facts({ day: d + 1 }), d, "win");
  foldEnd(p, facts({ over: "lost", day: 5 }));
  foldEnd(p, facts({ runId: "r2", over: null, day: 1 }));
  saveProfile(p, st);
  return loadProfile(st);
}

async function until(cond: () => boolean, ms = 6000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const ended = (over: Run["over"] = "lost", day = 4): Run => {
  const run = newRun("furnace", 7);
  run.over = over;
  run.day = day;
  return run;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stopOnline();
  setSession(null);
  delete g.localStorage;
  delete g.indexedDB;
});

// ---------------------------------------------------------------------------------------------------- putProfile

interface Received {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Uint8Array;
}

/** A server that records every request and answers `status` with `reply` (or never answers: status 0). */
async function recorder(status = 200, reply = ""): Promise<{ base: string; got: Received[]; close(): Promise<void> }> {
  const got: Received[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on("data", (c: Uint8Array) => chunks.push(c));
    req.on("end", () => {
      let n = 0;
      for (const c of chunks) n += c.length;
      const body = new Uint8Array(n);
      let o = 0;
      for (const c of chunks) {
        body.set(c, o);
        o += c.length;
      }
      got.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body });
      if (status === 0) return; // never answers
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const a = server.address();
  return {
    base: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`,
    got,
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

describe("putProfile: the signed PUT", () => {
  it("sends the canonical wire form, signed in the profile domain: no seen, folded or runNew, and the ghost domain cannot verify it", async () => {
    const st = mem();
    const p = player(st);
    p.seen = ["style:floor.timber"];
    p.runNew = { runId: "r1", ids: ["style:floor.tread"] };
    expect(p.folded.length).toBeGreaterThan(0);
    const rec = await recorder();
    const result = await putProfile(`${rec.base}/`, ME, p, 2000); // a trailing slash is fine
    await rec.close();
    expect(result).toEqual({ ok: true });
    expect(rec.got).toHaveLength(1);
    const [r] = rec.got;
    expect(r.method).toBe("PUT");
    expect(r.url).toBe("/v1/profile");
    expect(r.headers["content-type"]).toBe("application/json");
    const text = new TextDecoder().decode(r.body);
    expect(text).toBe(encodeWire(toWire(p))); // the canonical bytes, and nothing else
    for (const left of ["seen", "folded", "runNew", "r1:"]) expect(text, left).not.toContain(left);
    expect(Object.keys(JSON.parse(text))).toEqual(["v", "counters", "heroesWon", "heroesFinished", "unlocked", "chosen", "updatedAt"]);
    expect(decodeWire(text)).toEqual(toWire(p)); // the strict decode takes it
    expect(r.body.length).toBeLessThanOrEqual(MAX_PROFILE_BYTES);
    const key = r.headers[KEY_HEADER] as string, sig = r.headers[SIG_HEADER] as string;
    expect(key).toHaveLength(87);
    expect(sig).toHaveLength(86);
    expect(await verifyProfile(r.body, key, sig)).toEqual({ ok: true, playerId: ME.playerId });
    expect((await verifyUpload(r.body, key, sig)).ok).toBe(false); // not a ghost upload's signature
  });

  it("reports a refusal as a value: 404 (an older server), 403 (closed), 401, 422 with its words, 5xx, and a page that is not JSON", async () => {
    const p = player(mem());
    const cases: [number, string, string][] = [
      [404, '{"error":"not found"}', "not found"],
      [403, '{"error":"uploads are not open yet"}', "uploads are not open yet"],
      [401, '{"error":"x-bb-sig: the signature does not match this body and key"}', "x-bb-sig: the signature does not match this body and key"],
      [422, '{"error":"counters.bestDay: 1000 is over the ceiling 999"}', "counters.bestDay: 1000 is over the ceiling 999"],
      [503, '{"error":"ghost storage unavailable, try again shortly"}', "ghost storage unavailable, try again shortly"],
      [500, "<html>oops</html>", "HTTP 500"],
      [201, "", "HTTP 201"], // only 200 is success
    ];
    const quiet = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "debug")];
    quiet.forEach((s) => s.mockImplementation(() => {}));
    for (const [status, reply, error] of cases) {
      const rec = await recorder(status, reply);
      const r = await putProfile(rec.base, ME, p, 2000);
      await rec.close();
      expect(r, String(status)).toEqual({ ok: false, status, error });
    }
    for (const s of quiet) expect(s).not.toHaveBeenCalled();
  });

  it("reports a refused connection, a timeout and a signing failure as values, never a throw or a console line", async () => {
    const p = player(mem());
    const quiet = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "debug")];
    quiet.forEach((s) => s.mockImplementation(() => {}));
    const dead = await recorder();
    await dead.close(); // nothing listens there now
    const refused = await putProfile(dead.base, ME, p, 2000);
    expect(refused.ok).toBe(false);
    expect(refused).not.toHaveProperty("status");
    const silent = await recorder(0);
    const slow = await putProfile(silent.base, ME, p, 60);
    await silent.close();
    expect(slow).toEqual({ ok: false, error: "timeout" });
    const noKey: Identity = { playerId: ME.playerId, publicKey: ME.publicKey, sign: async () => { throw new Error("no crypto.subtle here"); } };
    const rec = await recorder();
    expect(await putProfile(rec.base, noKey, p, 2000)).toEqual({ ok: false, error: "no crypto.subtle here" });
    const syncThrow: Identity = { playerId: ME.playerId, publicKey: ME.publicKey, sign: () => { throw new Error("sync"); } };
    expect(await putProfile(rec.base, syncThrow, p, 2000)).toEqual({ ok: false, error: "sync" });
    await rec.close();
    expect(rec.got).toHaveLength(0); // nothing was sent without a signature
    for (const s of quiet) expect(s).not.toHaveBeenCalled();
  });

  it("against the real server: 200, and the stored record is the wire form under the signer's id; a bigger profile merges in", async () => {
    const profiles = new MemoryProfileStore();
    const stub = { kind: "jsonl", size: 0 } as unknown as GhostStore;
    const app = createGhostServer({ store: stub, profileStore: profiles, log: () => {} });
    const base = `http://127.0.0.1:${await app.listen(0)}`;
    const st = mem();
    const p = player(st);
    expect(await putProfile(base, ME, p, 3000)).toEqual({ ok: true });
    const first = (await profiles.get(ME.playerId))!.profile;
    expect(first).toEqual(toWire(p));
    foldDusk(p, facts({ day: 7 }), 6, "win");
    foldEnd(p, facts({ runId: "r3", over: "complete", flawless: true, day: 12, belts: 4 }));
    saveProfile(p, st, Date.now() + 1000);
    expect(await putProfile(base, ME, p, 3000)).toEqual({ ok: true });
    const second = (await profiles.get(ME.playerId))!.profile;
    expect(second).toEqual(toWire(p));
    expect(second.counters.runs).toBe(first.counters.runs + 1);
    expect(second.counters.bestDay).toBe(12);
    await app.close();
  });
});

// ---------------------------------------------------------------------------------------------------- the triggers

interface Rig {
  s: Online;
  store: Storage & { keys(): string[] };
  puts: unknown[][];
}

/** An online session over fakes (a profile upload recorder, an identity), the profile folds writing to the same memory store. */
async function rig(identity: Identity | null = ME, over: Partial<OnlineDeps> = {}): Promise<Rig> {
  const store = mem();
  g.localStorage = store; // where styleFolds' commitFold reads and writes
  const puts: unknown[][] = [];
  const never = (async () => { throw new Error("the ghost route is not under test"); }) as unknown as typeof fetchGhost;
  const deps: OnlineDeps = {
    fetchGhost: never, submitGhost: never as unknown as typeof submitGhost,
    identity: async () => identity, store, now: () => 1_790_000_000_000, save: () => {},
    putProfile: (async (...a: unknown[]) => { puts.push(a); return { ok: true }; }) as unknown as typeof putProfile,
    ...over,
  };
  const s = startOnline("https://ghosts.example", deps);
  if (identity) await until(() => s.active);
  else await until(() => s.failed);
  return { s, store, puts };
}

describe("a run's end uploads the profile", () => {
  it("foldRunEnd: one try, with the stored profile that has the end in it, the session's url and identity and the upload deadline", async () => {
    const { s, puts, store } = await rig();
    const run = ended("lost", 4);
    foldRunEnd(run);
    expect(puts).toHaveLength(1);
    const [url, id, profile, ms] = puts[0] as [string, Identity, Profile, number];
    expect(url).toBe("https://ghosts.example");
    expect(id).toBe(ME);
    expect(ms).toBe(UPLOAD_TIMEOUT_MS);
    expect(profile.counters.runs).toBe(1);
    expect(profile.counters.bestDay).toBe(4);
    expect(profile.folded).toContain(`${run.runId}:end`);
    expect(profile).toEqual(loadProfile(store)); // read back from the store after the fold was committed
    expect(s.profileUploads).toBe(1);
    expect(UPLOAD_TIMEOUT_MS).toBe(4000);
  });

  it("the battle folds the end (foldDuskResult) and the summary folds it again: still one upload for that run; the next run uploads", async () => {
    const { s, puts } = await rig();
    const run = ended("lost", 3);
    foldDuskResult(run, { day: 3, outcome: "loss" }); // battle.ts: the dusk that ended the run
    expect(puts).toHaveLength(1);
    expect((puts[0][2] as Profile).counters.runs).toBe(1);
    foldRunEnd(run); // summary.ts enter(): once per run, the profile already counted it
    foldRunEnd(run);
    expect(puts).toHaveLength(1);
    const next = ended("complete", 11);
    foldRunEnd(next);
    expect(puts).toHaveLength(2);
    expect((puts[1][2] as Profile).counters).toMatchObject({ runs: 2, runsFinished: 1, bestDay: 11 });
    expect(s.profileUploads).toBe(2);
  });

  it("ABANDON is a run's end too; a dusk or a warlord fold that ends nothing uploads nothing", async () => {
    const { puts } = await rig();
    const running = ended(null, 2);
    foldDuskResult(running, { day: 1, outcome: "win" }); // mid-run
    foldDuskResult(running, { day: 2, outcome: "loss" });
    foldWarlordResult(running, 2, "win", "matriarch");
    expect(puts).toHaveLength(0);
    foldRunEnd(running); // ABANDON: the run is not over, but its end is folded
    expect(puts).toHaveLength(1);
    expect((puts[0][2] as Profile).counters).toMatchObject({ runs: 1, runsFinished: 0, duskWins: 1, warlordWins: 1, matriarchWins: 1 });
  });
});

describe("a CUSTOMIZE pick uploads, debounced", () => {
  it("one upload a while after the last pick, with the latest pick in it; a preview of a locked style and opening the screen upload nothing", async () => {
    const { s, puts, store } = await rig();
    vi.useFakeTimers();
    const cs = new CustomizeState(player(store), store);
    expect(PROFILE_DEBOUNCE_MS).toBe(3000);
    expect(cs.tapRow("rune")).toBe("preview"); // locked: previewed only
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 2);
    expect(puts).toHaveLength(0);
    expect(cs.tapRow("timber")).toBe("worn");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS - 1);
    expect(puts).toHaveLength(0);
    expect(cs.tapRow("tread")).toBe("worn"); // another pick restarts the wait
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS - 1);
    expect(puts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(puts).toHaveLength(1);
    expect((puts[0][2] as Profile).chosen.floor).toBe("tread");
    expect(toWire(puts[0][2] as Profile).chosen.floor).toBe("tread");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 5);
    expect(puts).toHaveLength(1); // one try, no loop
    expect(s.profileUploads).toBe(1);
  });

  it("tapping the style already worn changes nothing and uploads nothing", async () => {
    const { puts, store } = await rig();
    vi.useFakeTimers();
    const cs = new CustomizeState(player(store), store);
    expect(cs.tapRow("plate")).toBe("worn"); // the default floor is worn already
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 2);
    expect(puts).toHaveLength(0);
    cs.tapRow("timber");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS);
    expect(puts).toHaveLength(1);
    cs.tapRow("timber"); // worn already
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 2);
    expect(puts).toHaveLength(1);
  });

  it("a run's end before the wait is over sends at once and carries the pick; the pick's own upload never follows", async () => {
    const { puts, store } = await rig();
    vi.useFakeTimers();
    const cs = new CustomizeState(player(store), store);
    cs.tapRow("timber");
    await vi.advanceTimersByTimeAsync(1000);
    foldRunEnd(ended("lost", 5));
    expect(puts).toHaveLength(1);
    expect((puts[0][2] as Profile).chosen.floor).toBe("timber");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 3);
    expect(puts).toHaveLength(1);
  });

  it("a pick whose session was stopped before the wait is over is never sent", async () => {
    const { puts, store } = await rig();
    vi.useFakeTimers();
    new CustomizeState(player(store), store).tapRow("timber");
    stopOnline();
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 3);
    expect(puts).toHaveLength(0);
  });
});

describe("only in the online state; never at boot", () => {
  it("no request at boot: starting the session, loading the identity and ticking a run send no profile", async () => {
    const { s, puts } = await rig();
    expect(s.active).toBe(true);
    const run = newRun("furnace", 3);
    s.tick(run);
    s.tick(run);
    await new Promise((r) => setTimeout(r, 30));
    expect(puts).toHaveLength(0);
    expect(s.profileUploads).toBe(0);
  });

  it("no identity (no WebCrypto, no IndexedDB): the session failed, and a run's end or a pick uploads nothing", async () => {
    const { s, puts, store } = await rig(null);
    expect(s.failed).toBe(true);
    vi.useFakeTimers();
    foldRunEnd(ended());
    new CustomizeState(player(store), store).tapRow("timber");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 3);
    expect(puts).toHaveLength(0);
  });

  it("the identity still loading: a trigger is dropped, not queued (no retry once it loads)", async () => {
    let load: (i: Identity) => void = () => {};
    const pending = new Promise<Identity | null>((r) => { load = r; });
    const store = mem();
    g.localStorage = store;
    const puts: unknown[][] = [];
    const s = startOnline("https://ghosts.example", {
      fetchGhost: (async () => { throw new Error("x"); }) as unknown as typeof fetchGhost, submitGhost: (async () => { throw new Error("x"); }) as unknown as typeof submitGhost,
      identity: () => pending, store, now: () => 1, save: () => {},
      putProfile: (async (...a: unknown[]) => { puts.push(a); return { ok: true as const }; }) as never,
    });
    foldRunEnd(ended());
    load(ME);
    await until(() => s.active);
    await new Promise((r) => setTimeout(r, 30));
    expect(puts).toHaveLength(0);
    foldRunEnd(ended("lost", 6)); // the next trigger, identity loaded: it goes
    expect(puts).toHaveLength(1);
  });

  it("a profile written by a newer build is read-only here (profile.ts never writes it back), so nothing is uploaded from it", async () => {
    const { puts, store } = await rig();
    store.setItem(PROFILE_KEY, JSON.stringify({ ...emptyProfile(), v: 2, updatedAt: Date.now() }));
    foldRunEnd(ended());
    expect(puts).toHaveLength(0);
    expect(loadProfile(store).v).toBe(2); // and it is still the newer build's, untouched
    loadProfile(mem()); // a fresh store resets profile.ts's write guard for the tests after this one
  });

  it("a session with no profile upload in its deps (a test's own) sends none; a stub session without the method is fine", async () => {
    const { puts } = await rig(ME, { putProfile: undefined });
    foldRunEnd(ended());
    expect(puts).toHaveLength(0);
    const stub: Session = { url: "test", active: true, failed: false, tick() {}, settle() {}, submitDusk() {}, countRun() {} };
    setSession(stub);
    expect(online()).toBe(stub);
    expect(() => foldRunEnd(ended())).not.toThrow();
    expect(() => new CustomizeState(player(mem()), mem()).tapRow("timber")).not.toThrow();
  });

  it("offline (no session): a run's end and a pick make no request, open no IndexedDB, and write no key but the profile's", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline pages make no request"));
    let idb = 0;
    g.indexedDB = { open: () => { idb++; throw new Error("no IndexedDB offline"); } };
    const store = mem();
    g.localStorage = store;
    vi.useFakeTimers();
    expect(online()).toBeNull();
    foldRunEnd(ended("lost", 4));
    foldDuskResult(ended("complete", 10), { day: 10, outcome: "win" });
    new CustomizeState(player(store), store).tapRow("timber");
    await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 5);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(idb).toBe(0);
    // IDENT-2: the one new key is the run history (beltbattles.history.v1, written by every device, online or not, at a run's end); the
    // four pinned offline-key lists stand (they end before a run's end)
    expect(store.keys()).toEqual([HISTORY_KEY, PROFILE_KEY]);
  });
});

describe("failures are silent; one try per trigger; no new storage key", () => {
  it("a refusal, a rejection and a synchronous throw: no console line, no retry, no unhandled rejection, play goes on", async () => {
    const quiet = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "debug")];
    quiet.forEach((s) => s.mockImplementation(() => {}));
    const answers = [
      async () => ({ ok: false as const, status: 404, error: "not found" }),
      async () => { throw new Error("network down"); },
      () => { throw new Error("sync"); },
      async () => ({ ok: false as const, status: 503, error: "ghost storage unavailable, try again shortly" }),
    ];
    let n = 0;
    const calls: number[] = [];
    const { s, store } = await rig(ME, {
      putProfile: ((..._a: unknown[]) => {
        calls.push(n);
        return answers[n++ % answers.length]();
      }) as unknown as typeof putProfile,
    });
    vi.useFakeTimers();
    for (let i = 0; i < 4; i++) {
      foldRunEnd(ended("lost", 3 + i));
      await vi.advanceTimersByTimeAsync(PROFILE_DEBOUNCE_MS * 4);
      expect(calls).toHaveLength(i + 1); // one try for this trigger, however it went
    }
    expect(s.lastProfileUpload).toEqual({ ok: false, status: 503, error: "ghost storage unavailable, try again shortly" });
    for (const q of quiet) expect(q).not.toHaveBeenCalled();
    expect(store.keys()).toEqual([HISTORY_KEY, PROFILE_KEY]); // the session wrote nothing: no run count, no marker, no queue (IDENT-2: the run history is the fold's, not the session's)
  });

  it("the profile read for the upload is the stored one: the same bytes the next page load would send", async () => {
    const { puts, store } = await rig();
    const run = ended("complete", 12);
    foldRunEnd(run);
    const sent = puts[0][2] as Profile;
    expect(encodeWire(toWire(sent))).toBe(encodeWire(toWire(loadProfile(store))));
    evaluateUnlocks(sent);
    expect(emptyProfile().counters.runs).toBe(0);
  });

  it("end to end: a run's end on the online session reaches the server's record for this device", async () => {
    const profiles = new MemoryProfileStore();
    const stub = { kind: "jsonl", size: 0 } as unknown as GhostStore;
    const app = createGhostServer({ store: stub, profileStore: profiles, log: () => {} });
    const url = `http://127.0.0.1:${await app.listen(0)}`;
    const store = mem();
    g.localStorage = store;
    const real = await import("../src/net/profileClient");
    const s = startOnline(url, {
      fetchGhost: (async () => { throw new Error("x"); }) as unknown as typeof fetchGhost, submitGhost: (async () => { throw new Error("x"); }) as unknown as typeof submitGhost,
      identity: async () => ME, store, now: () => Date.now(), save: () => {}, putProfile: real.putProfile,
    });
    await until(() => s.active);
    foldRunEnd(ended("lost", 9));
    await until(() => s.lastProfileUpload !== null);
    expect(s.lastProfileUpload).toEqual({ ok: true });
    const stored = (await profiles.get(ME.playerId))!.profile;
    expect(stored.counters).toMatchObject({ runs: 1, bestDay: 9 });
    expect(stored).toEqual(toWire(loadProfile(store)));
    await app.close();
  });
});
