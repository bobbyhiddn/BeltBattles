// BUMP-1I (REQ-BFG-125, VETERAN), P1: the device's streak (src/game/online.ts STREAK_KEY, beside D2's run count; src/game/streakHook.ts for ABANDON).
//  - a run won at its 10 wins adds 1, once: a second end of the same run id changes nothing (the end of ENDLESS sets run.over "won" again);
//  - a lost run and the day cap's "complete" set 0; an abandoned run (ABANDON before the 10th win) sets 0; an abandon in ENDLESS changes nothing;
//  - an unreadable entry reads 0; the cap holds; an inactive session writes nothing (and ABANDON with no session, or a stub, does nothing);
//  - every request of one run carries the same streak, only when it is above 0; the store is device-only and the run holds no copy.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { Online, RUNS_KEY, STREAK_KEY, startOnline, stopOnline, type OnlineDeps } from "../src/game/online";
import { online, setSession, type Session } from "../src/game/session";
import { abandonRun } from "../src/game/streakHook";
import { VETERAN_STREAK_MAX } from "../src/net/veteran";
import type { Identity } from "../src/net/identity";
import type { FetchedGhost } from "../src/net/ghostClient";
import { testIdentity } from "./netIdentity";

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

function fakes(ident: Identity | null) {
  const requests: unknown[] = [];
  const store = mem();
  const deps: OnlineDeps = {
    fetchGhost: (async (_url: string, req: unknown) => { requests.push(req); return null as unknown as FetchedGhost; }) as unknown as OnlineDeps["fetchGhost"],
    submitGhost: (() => new Promise(() => {})) as unknown as OnlineDeps["submitGhost"],
    identity: async () => ident,
    store, now: () => 1_790_000_000_000, save: () => {},
  };
  return { deps, store, requests };
}

const stored = (store: Storage): { streak: number; last: string } | null => JSON.parse(store.getItem(STREAK_KEY) ?? "null");

afterEach(() => stopOnline());

describe("the device's streak (STREAK_KEY)", () => {
  let me: Identity;
  beforeAll(async () => {
    me = await testIdentity(3);
  });
  const start = async (ident: Identity | null = me) => {
    const f = fakes(ident);
    const s = new Online("https://ghosts.example", f.deps);
    if (ident) await until(() => s.active);
    else await until(() => s.failed);
    return { ...f, s };
  };

  it("the key is a new device-only entry beside RUNS_KEY; nothing is written until a run ends", async () => {
    expect(STREAK_KEY).toBe("beltbattles.streak.v1");
    expect(STREAK_KEY).not.toBe(RUNS_KEY);
    const { s, store } = await start();
    expect(s.streak()).toBe(0);
    expect(store.keys()).toEqual([]);
    const run = newRun("furnace", 1);
    expect(run).not.toHaveProperty("streak"); // no field on Run
    s.countRun(run); // not over: nothing
    expect(store.keys()).toEqual([]);
  });

  it("a won run adds 1, once: a second end of the same run id changes nothing", async () => {
    const { s, store } = await start();
    const a = newRun("furnace", 11);
    a.over = "won";
    s.countRun(a);
    expect(stored(store)).toEqual({ streak: 1, last: a.runId });
    s.countRun(a);
    s.countRun(a);
    expect(s.streak()).toBe(1);
    const b = newRun("weaver", 12);
    b.over = "won";
    s.countRun(b);
    expect(stored(store)).toEqual({ streak: 2, last: b.runId });
    expect(s.runs()).toBe(2); // D2's count is as before
  });

  it("the end of ENDLESS sets run.over \"won\" again: the guard makes it a no-op (the run was counted at its 10th win)", async () => {
    const { s, store } = await start();
    const a = newRun("furnace", 21);
    a.over = "won"; // the 10th win
    s.countRun(a);
    expect(s.streak()).toBe(1);
    // CONTINUE ENDLESS: day.ts startEndless clears `over` and sets the endless state; a dusk in it is no run's end
    a.over = null;
    a.endlessRun = { victoryDay: 12, wins: 0, losses: 0, draws: 0 };
    s.countRun(a);
    expect(s.streak()).toBe(1);
    // the endless ends: run.over is "won" a second time
    a.endlessRun = { victoryDay: 12, wins: 4, losses: 3, draws: 0, end: "hearts" };
    a.over = "won";
    s.countRun(a);
    expect(stored(store)).toEqual({ streak: 1, last: a.runId });
    expect(s.runs()).toBe(1);
  });

  it("a lost run and the day cap's \"complete\" set 0 (and a loss after a streak takes it back)", async () => {
    const { s, store } = await start();
    for (const seed of [31, 32, 33]) { const r = newRun("furnace", seed); r.over = "won"; s.countRun(r); }
    expect(s.streak()).toBe(3);
    const lost = newRun("furnace", 34);
    lost.over = "lost";
    s.countRun(lost);
    expect(stored(store)).toEqual({ streak: 0, last: lost.runId });
    const w = newRun("furnace", 35);
    w.over = "won";
    s.countRun(w);
    expect(s.streak()).toBe(1);
    const cap = newRun("furnace", 36);
    cap.over = "complete";
    s.countRun(cap);
    expect(s.streak()).toBe(0);
    s.countRun(cap);
    expect(s.streak()).toBe(0);
  });

  it("an abandoned run (before its 10th win) sets 0, once; an abandon of a run that is over, or in ENDLESS, changes nothing", async () => {
    const { s, store } = await start();
    for (const seed of [41, 42]) { const r = newRun("furnace", seed); r.over = "won"; s.countRun(r); }
    expect(s.streak()).toBe(2);
    // in ENDLESS (the run was won and counted): nothing
    const won = newRun("furnace", 43);
    won.over = "won";
    s.countRun(won);
    expect(s.streak()).toBe(3);
    won.over = null;
    won.endlessRun = { victoryDay: 12, wins: 1, losses: 0, draws: 0 };
    s.abandonRun(won);
    expect(s.streak()).toBe(3);
    // a run that is over: nothing
    const over = newRun("furnace", 44);
    over.over = "lost";
    s.abandonRun(over);
    expect(s.streak()).toBe(3);
    // an abandon before the 10th win: 0
    const run = newRun("weaver", 45);
    run.wins = 6;
    s.abandonRun(run);
    expect(stored(store)).toEqual({ streak: 0, last: run.runId });
    // the guard: the same run id again changes nothing (the entry remembers the run whose end it last took, as RUNS_KEY does)
    s.abandonRun(run);
    expect(stored(store)).toEqual({ streak: 0, last: run.runId });
    const next = newRun("weaver", 46);
    next.over = "won";
    s.countRun(next);
    expect(stored(store)).toEqual({ streak: 1, last: next.runId });
    s.abandonRun(next); // a run that is over: nothing
    expect(s.streak()).toBe(1);
  });

  it("ABANDON RUN reaches the page's session through streakHook (a session without the method, and no session, do nothing)", async () => {
    const f = fakes(me);
    const s = startOnline("https://ghosts.example", f.deps);
    await until(() => s.active);
    const w = newRun("furnace", 51);
    w.over = "won";
    s.countRun(w);
    const w2 = newRun("furnace", 52);
    w2.over = "won";
    s.countRun(w2);
    expect(s.streak()).toBe(2);
    abandonRun(newRun("weaver", 53));
    expect(stored(f.store)).toMatchObject({ streak: 0 });
    stopOnline();
    expect(online()).toBeNull();
    expect(() => abandonRun(newRun("weaver", 54))).not.toThrow(); // offline: nothing
    f.store.setItem(STREAK_KEY, JSON.stringify({ streak: 5, last: "x" }));
    const stub: Session = { url: "t", active: true, failed: false, tick() {}, settle() {}, submitDusk() {}, countRun() {} }; // a test's stub: no abandonRun
    setSession(stub);
    expect(() => abandonRun(newRun("weaver", 55))).not.toThrow();
    expect(stored(f.store)).toEqual({ streak: 5, last: "x" });
  });

  it("an unreadable entry reads 0", async () => {
    const { s, store } = await start();
    for (const bad of ["garbage", "null", "[]", '{"streak":-1}', '{"streak":1.5}', '{"streak":"3"}', '{"streak":100}', '{"streak":null}', "{", ""]) {
      store.setItem(STREAK_KEY, bad);
      expect(s.streak(), bad).toBe(0);
    }
    store.setItem(STREAK_KEY, '{"streak":2}');
    expect(s.streak()).toBe(2);
    // an unreadable entry is replaced by the next end, as a fresh count
    store.setItem(STREAK_KEY, "garbage");
    const w = newRun("furnace", 61);
    w.over = "won";
    s.countRun(w);
    expect(stored(store)).toEqual({ streak: 1, last: w.runId });
  });

  it("the cap holds: VETERAN_STREAK_MAX stays", async () => {
    const { s, store } = await start();
    store.setItem(STREAK_KEY, JSON.stringify({ streak: VETERAN_STREAK_MAX - 1, last: "old" }));
    const a = newRun("furnace", 71);
    a.over = "won";
    s.countRun(a);
    expect(s.streak()).toBe(VETERAN_STREAK_MAX);
    const b = newRun("furnace", 72);
    b.over = "won";
    s.countRun(b);
    expect(s.streak()).toBe(VETERAN_STREAK_MAX);
    expect(s.request(newRun("weaver", 73)).streak).toBe(VETERAN_STREAK_MAX);
  });

  it("an inactive session (no identity) writes nothing", async () => {
    const { s, store } = await start(null);
    expect(s.active).toBe(false);
    const w = newRun("furnace", 81);
    w.over = "won";
    s.countRun(w);
    const l = newRun("furnace", 82);
    l.over = "lost";
    s.countRun(l);
    s.abandonRun(newRun("furnace", 83));
    expect(store.keys()).toEqual([]);
  });

  it("every request of one run carries the same streak, and only above 0 (the store changes at a run's end alone)", async () => {
    const { s, store } = await start();
    const run = newRun("furnace", 91);
    expect(s.request(run)).not.toHaveProperty("streak"); // no streak: the request as it was
    store.setItem(STREAK_KEY, JSON.stringify({ streak: 0, last: "z" }));
    expect(s.request(run)).not.toHaveProperty("streak");
    store.setItem(STREAK_KEY, JSON.stringify({ streak: 2, last: "z" }));
    const seen: number[] = [];
    for (let day = 1; day <= 6; day++) {
      run.day = day;
      run.wins = Math.min(day - 1, 9);
      const req = s.request(run);
      seen.push(req.streak ?? -1);
      expect(req.runs).toBe(0);
      expect(req.rules).toBeTruthy();
    }
    expect(new Set(seen)).toEqual(new Set([2]));
    // a lost run takes it to 0; the next run's requests carry none
    const l = run;
    l.over = "lost";
    s.countRun(l);
    expect(s.request(newRun("weaver", 92))).not.toHaveProperty("streak");
  });

  it("the request goes to the fetch with the streak (the page's session ticks it)", async () => {
    const f = fakes(me);
    const s = startOnline("https://ghosts.example", f.deps);
    await until(() => s.active);
    f.store.setItem(STREAK_KEY, JSON.stringify({ streak: 3, last: "z" }));
    const run = newRun("furnace", 99);
    s.tick(run);
    await until(() => f.requests.length > 0);
    expect((f.requests[0] as { streak?: number }).streak).toBe(3);
  });
});
