// C1 (BRIEF-C1 item 1; store hardening for the phone and Steam builds): no network, said at once. When navigator.onLine is
// false at the moment the game would ask for tonight's ghost, the request is skipped and the stand-in the fallback already uses
// (standInFoe, source "offline") is stored at once; the NEXT BATTLE card says OFFLINE STAND-IN instead of FINDING A GHOST...;
// uploads are skipped quietly. With onLine true the game asks exactly as before, and the 4 s deadline still covers a dead
// network. Everything here is built from fakes: navigator, the window's events, the session's deps and fetch.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isOffline, watchConnectivity, type EventHost, type NavLike } from "../src/core/connectivity";
import { duskFoe, ghostOf, storedFoe } from "../src/game/day";
import { standInFoe } from "../src/game/ghosts";
import { defaultDeps, FETCH_TIMEOUT_MS, Online, startOnline, stopOnline, UPLOAD_TIMEOUT_MS, type OnlineDeps } from "../src/game/online";
import { battleSeed, newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { FINDING_GHOST, foeNote, offlineMode, OFFLINE_LINE, searchNote, SOURCE_OFFLINE } from "../src/game/session";
import { fetchGhost, type FetchedGhost, type submitGhost, type SubmitResult } from "../src/net/ghostClient";
import type { Identity } from "../src/net/identity";
import { ghostId, type GhostSnapshot } from "../src/net/snapshot";
import type { putProfile } from "../src/net/profileClient";
import { RULES_VERSION } from "../src/sim/content";
import { HEARTS_START } from "../src/sim/hearts";
import { testIdentity } from "./netIdentity";

/** The ghost a server answers with (another player's day-1 deck: ghostOf, as an upload makes it; set up below). */
let SERVED: GhostSnapshot;
const BASE = "https://ghosts.example";

let me: Identity;
beforeAll(async () => {
  me = await testIdentity(3);
  const other = newRun("weaver", 21);
  takeDawnRune(other);
  SERVED = ghostOf(other, 1_790_000_000_000, (await testIdentity(1)).playerId, "TESTER");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  stopOnline();
});

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

function takeDawnRune(run: Run): void {
  const offer = pendingRune(run);
  if (offer) takeRune(run, offer.ids[0]);
}

interface Rig {
  s: Online;
  /** What the fake `deps.offline` answers (flip it to go online or offline). */
  net: { offline: boolean };
  calls: { fetch: unknown[][]; submit: unknown[][]; put: unknown[][]; saves: number };
}

/** An online session over fakes. `offline`: the answer deps.offline gives (undefined: the dep is absent, as in every test before C1). */
async function rig(offline: boolean | undefined, answer: () => FetchedGhost = () => ({ id: ghostId(SERVED), snapshot: SERVED, source: "server" })): Promise<Rig> {
  const net = { offline: offline === true };
  const calls = { fetch: [] as unknown[][], submit: [] as unknown[][], put: [] as unknown[][], saves: 0 };
  const deps: OnlineDeps = {
    fetchGhost: (async (...a: unknown[]) => { calls.fetch.push(a); return answer(); }) as unknown as typeof fetchGhost,
    submitGhost: ((...a: unknown[]) => { calls.submit.push(a); return new Promise<SubmitResult>(() => {}); }) as unknown as typeof submitGhost,
    putProfile: (async (...a: unknown[]) => { calls.put.push(a); return { ok: true }; }) as unknown as typeof putProfile,
    identity: async () => me, store: mem(), now: () => 1_790_000_000_000, save: () => void calls.saves++,
    ...(offline === undefined ? {} : { offline: () => net.offline }),
  };
  const s = startOnline(BASE, deps);
  await until(() => s.active);
  return { s, net, calls };
}

// ---------------------------------------------------------------- the question and its events

describe("C1 item 1: isOffline and the online / offline events (fakes)", () => {
  it("is true only when navigator.onLine is false; a missing navigator or a missing onLine is not offline", () => {
    expect(isOffline({ onLine: false })).toBe(true);
    expect(isOffline({ onLine: true })).toBe(false);
    expect(isOffline({})).toBe(false);
    expect(isOffline(undefined)).toBe(false);
    // the default reads the page's navigator at the time of the call
    vi.stubGlobal("navigator", { onLine: false } satisfies NavLike);
    expect(isOffline()).toBe(true);
    vi.stubGlobal("navigator", { onLine: true } satisfies NavLike);
    expect(isOffline()).toBe(false);
    vi.unstubAllGlobals();
    expect(isOffline()).toBe(false); // node 20 has no navigator: not offline, the game as it was
  });

  it("watchConnectivity tells each change of the window's offline and online events, and stops when asked", () => {
    const l = new Map<string, Set<() => void>>();
    const host: EventHost = {
      addEventListener: (t, f) => void (l.get(t) ?? l.set(t, new Set()).get(t)!).add(f),
      removeEventListener: (t, f) => void l.get(t)?.delete(f),
    };
    const fire = (t: string) => [...(l.get(t) ?? [])].forEach((f) => f());
    const seen: boolean[] = [];
    const stop = watchConnectivity(host, (off) => seen.push(off));
    fire("offline");
    fire("online");
    fire("offline");
    expect(seen).toEqual([true, false, true]);
    stop();
    fire("online");
    expect(seen).toEqual([true, false, true]);
    expect([...l.values()].every((set) => set.size === 0)).toBe(true);
    expect(watchConnectivity(undefined, () => seen.push(true))()).toBeUndefined(); // no window: listens to nothing
  });
});

// ---------------------------------------------------------------- the ghost request

describe("C1 item 1: tonight's ghost is not asked for while offline", () => {
  it("offline at the first tick: no request, 0.6.2's own stand-in is stored at once (source offline), the run is saved, the card says OFFLINE STAND-IN", async () => {
    const r = await rig(true);
    const run = newRun("furnace", 99);
    expect(r.s.searching(run)).toBe(true);
    r.s.tick(run);
    expect(r.calls.fetch).toHaveLength(0);
    expect(r.s.fetches).toBe(0);
    const st = standInFoe(run.seed, run.day);
    expect(storedFoe(run)).toEqual({ day: 1, kind: "standin", name: st.name, hero: st.hero, build: st.build, rival: st.id, source: "offline" });
    expect(run.seenGhosts).toBeUndefined();
    expect(r.calls.saves).toBe(1);
    expect(r.s.searching(run)).toBe(false);
    expect(foeNote(run, storedFoe(run)!)).toBe(SOURCE_OFFLINE);
    // a stored foe stays: coming back online the same day asks nobody, and a second tick stores nothing again
    r.net.offline = false;
    r.s.tick(run);
    expect(r.calls.fetch).toHaveLength(0);
    expect(r.calls.saves).toBe(1);
  });

  it("the stand-in is the very one a fallback answer stores (fetchGhost's offline- stand-in -> standInFoe)", async () => {
    const a = await rig(true);
    const runA = newRun("weaver", 7);
    a.s.tick(runA);
    stopOnline();
    const b = await rig(false, () => ({ id: "offline-weaver-d1", snapshot: SERVED, source: "fallback", error: "timeout" }));
    const runB = newRun("weaver", 7);
    b.s.tick(runB);
    await until(() => b.s.lastFetch !== null);
    b.s.tick(runB);
    expect(storedFoe(runA)).toEqual(storedFoe(runB)!);
    expect(storedFoe(runA)!.source).toBe("offline");
  });

  it("online (or no offline dep at all) the request is exactly what it was: the same fields, the 4 s deadline, nothing skipped", async () => {
    const requests: unknown[] = [];
    for (const offline of [false, undefined] as const) {
      const r = await rig(offline);
      const run = newRun("furnace", 99);
      run.seenGhosts = ["gaaaaaaaaaaaaaa"];
      r.s.tick(run);
      r.s.tick(run); // in flight: no second request
      expect(r.calls.fetch).toHaveLength(1);
      const [url, req, ms] = r.calls.fetch[0];
      expect([url, ms]).toEqual([BASE, FETCH_TIMEOUT_MS]);
      expect(FETCH_TIMEOUT_MS).toBe(4000);
      expect(req).toEqual({ rules: RULES_VERSION, day: 1, wins: 0, lives: HEARTS_START, playerId: me.playerId, seen: ["gaaaaaaaaaaaaaa"], hero: "furnace", seed: battleSeed(run), runs: 0 });
      requests.push(req);
      await until(() => r.s.lastFetch !== null);
      r.s.tick(run);
      expect(storedFoe(run)).toMatchObject({ kind: "ghost", source: "online", ghostId: ghostId(SERVED) });
      expect(r.s.fetches).toBe(1);
      stopOnline();
    }
    expect(requests[0]).toEqual(requests[1]); // the dep absent and the dep false ask the same thing
  });

  it("offline, then online the next day: the next day asks as before (the skip is for tonight only, and a stored foe stays)", async () => {
    const r = await rig(true);
    const run = newRun("furnace", 5);
    r.s.tick(run);
    expect(r.calls.fetch).toHaveLength(0);
    run.day = 2;
    r.net.offline = false;
    r.s.tick(run);
    expect(r.calls.fetch).toHaveLength(1);
    expect((r.calls.fetch[0][1] as { day: number }).day).toBe(2);
  });

  it("a request already in flight when the network drops is not cut: the 4 s deadline decides (settle stores the stand-in meanwhile when asked)", async () => {
    const r = await rig(false);
    const run = newRun("furnace", 6);
    r.s.tick(run);
    expect(r.calls.fetch).toHaveLength(1);
    r.net.offline = true; // the network drops after the request went out
    r.s.tick(run); // answer not in yet: nothing new, nothing stored by the skip (the request owns tonight)
    expect(r.calls.fetch).toHaveLength(1);
    await until(() => r.s.lastFetch !== null);
    r.s.tick(run);
    expect(storedFoe(run)).toMatchObject({ kind: "ghost", source: "online" });
  });

  it("through the real client: offline, fetch is never called; onLine true, it is called once (the page's navigator, stubbed)", async () => {
    const fetchSpy = vi.fn((..._a: unknown[]) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("navigator", { onLine: false });
    const s = startOnline(BASE, { ...defaultDeps(), identity: async () => me, store: mem(), save: () => {} });
    await until(() => s.active);
    const run = newRun("furnace", 4);
    s.tick(run);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storedFoe(run)?.source).toBe("offline");
    vi.stubGlobal("navigator", { onLine: true });
    const run2 = newRun("furnace", 5);
    s.tick(run2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/^https:\/\/ghosts\.example\/v1\/ghosts\/match\?/);
    expect(storedFoe(run2)).toBeNull(); // waiting, as ever
  });

  it("onLine true with a dead network: the fetch's own 4 s deadline still ends the wait with the stand-in answer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", (_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const req = { rules: RULES_VERSION, day: 1, wins: 0, lives: HEARTS_START, playerId: me.playerId, seen: [], hero: "furnace" as const, seed: 1, runs: 0 };
    const p = fetchGhost(BASE, req, FETCH_TIMEOUT_MS);
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ source: "fallback", error: "timeout" });
  });
});

// ---------------------------------------------------------------- the card

describe("C1 item 1: the NEXT BATTLE card's words", () => {
  it("while tonight's ghost is not stored: FINDING A GHOST... online, OFFLINE STAND-IN at once offline; with no session, nothing (0.6.2's card)", async () => {
    const run = newRun("furnace", 99);
    vi.stubGlobal("navigator", { onLine: false });
    expect(foeNote(run, duskFoe(run, []))).toBeNull(); // no session: 0.6.2's card, whatever the network says
    expect(offlineMode()).toBe(false);
    await rig(undefined);
    vi.stubGlobal("navigator", { onLine: true });
    expect(foeNote(run, duskFoe(run, []))).toBe(FINDING_GHOST);
    expect(searchNote()).toBe(FINDING_GHOST);
    expect(offlineMode()).toBe(false);
    vi.stubGlobal("navigator", { onLine: false });
    expect(foeNote(run, duskFoe(run, []))).toBe(SOURCE_OFFLINE);
    expect(searchNote()).toBe(SOURCE_OFFLINE);
    expect(offlineMode()).toBe(true);
    expect(SOURCE_OFFLINE).toBe("OFFLINE STAND-IN");
    expect(OFFLINE_LINE).toBe("OFFLINE: PLAYING AGAINST STAND-INS");
  });

  it("a stored foe keeps its own source line, whatever the network says now (as before)", async () => {
    const r = await rig(false);
    const run = newRun("furnace", 3);
    r.s.tick(run);
    await until(() => r.s.lastFetch !== null);
    r.s.tick(run);
    vi.stubGlobal("navigator", { onLine: false });
    expect(foeNote(run, storedFoe(run)!)).toBe("ONLINE GHOST");
  });

  it("a session that failed (no identity) is 0.6.2's offline play: no line, no note, offline or not", async () => {
    const s = startOnline(BASE, { fetchGhost: undefined as never, submitGhost: undefined as never, identity: async () => null, store: mem(), now: () => 0, save: () => {} });
    await until(() => s.failed);
    vi.stubGlobal("navigator", { onLine: false });
    expect(offlineMode()).toBe(false);
    expect(foeNote(newRun("furnace", 3), duskFoe(newRun("furnace", 3), []))).toBeNull();
  });
});

// ---------------------------------------------------------------- the uploads

describe("C1 item 1: uploads while offline are skipped quietly", () => {
  it("the dusk's deck: no request, no deck check, no console line, no counter, `uploaded` untouched; online it goes up as before", async () => {
    const r = await rig(true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const run = newRun("weaver", 31);
    takeDawnRune(run);
    r.s.submitDusk(run);
    r.s.submitDusk(run);
    expect(r.calls.submit).toHaveLength(0);
    expect(r.s.uploads).toBe(0);
    expect(r.s.lastUpload).toBeNull();
    expect(run.uploaded).toBeUndefined();
    expect(debug).not.toHaveBeenCalled();
    r.net.offline = false;
    r.s.submitDusk(run);
    r.s.submitDusk(run);
    expect(r.calls.submit).toHaveLength(1);
    const [url, snap, ident, ms] = r.calls.submit[0] as [string, unknown, Identity, number];
    expect([url, ident, ms]).toEqual([BASE, me, UPLOAD_TIMEOUT_MS]);
    expect(snap).toEqual(ghostOf(run, 1_790_000_000_000, me.playerId));
    expect(run.uploaded).toBe(1);
  });

  it("the profile: skipped while offline (no request, no count); a run's end online uploads once, as before", async () => {
    const r = await rig(true);
    r.s.profileChanged("end", "run-a");
    expect(r.calls.put).toHaveLength(0);
    expect(r.s.profileUploads).toBe(0);
    r.net.offline = false;
    r.s.profileChanged("end", "run-b");
    expect(r.calls.put).toHaveLength(1);
    expect(r.s.profileUploads).toBe(1);
  });

  it("with the dep absent (every test's own deps before C1) nothing is skipped", async () => {
    const r = await rig(undefined);
    const run = newRun("weaver", 31);
    takeDawnRune(run);
    r.s.submitDusk(run);
    r.s.profileChanged("end", "run-c");
    expect(r.calls.submit).toHaveLength(1);
    expect(r.calls.put).toHaveLength(1);
  });
});

describe("C1 item 1: the real session's default deps read the page's navigator", () => {
  it("defaultDeps().offline follows navigator.onLine live", () => {
    const d = defaultDeps();
    expect(d.offline?.()).toBe(false); // no navigator here: not offline
    vi.stubGlobal("navigator", { onLine: false });
    expect(d.offline?.()).toBe(true);
    vi.stubGlobal("navigator", { onLine: true });
    expect(d.offline?.()).toBe(false);
  });
});
