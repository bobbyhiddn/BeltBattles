// RETUNE-1 run 2 step 4 (REQ-BFG-096): the upload guard (src/game/ghostGuard.ts). cap's ruling: "A run without the
// hearts mark, under rules where heartsFor is true, neither uploads its snapshot (online.ts) nor saves its ghost (ghosts.ts
// saveGhost). Its match requests stay as they are." With HEARTS off (and on a hearts run) both as today. The switch is set
// through its setter and put back after each test (HULL-ON: to its shipped value, on; the off tests set it off themselves).
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RULES_VERSION, START_LIVES } from "../src/sim/content";
import { HEARTS_START, heartsRun, setHearts, withHearts } from "../src/sim/hearts";
import { HEARTS_RULES, heartsFor } from "../src/net/rulesGate";
import { ghostAllowed, saveRunGhost } from "../src/game/ghostGuard";
import { GHOST_KEY, loadPool } from "../src/game/ghosts";
import { ghostOf } from "../src/game/day";
import { battleSeed, newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { Online, stopOnline, type OnlineDeps } from "../src/game/online";
import type { fetchGhost, submitGhost, SubmitResult } from "../src/net/ghostClient";
import type { Identity } from "../src/net/identity";
import type { GhostSnapshot } from "../src/net/snapshot";
import { testIdentity } from "./netIdentity";

const NOW = 1_790_000_000_000;
/** The rules just before HEARTS_RULES (a record from before the bump). */
const OLDER = "bb-0.9.6";

afterEach(() => {
  setHearts(true); // HULL-ON (the flip, HEARTS): the shipped value (HULL-ON's flip; was false)
  stopOnline();
});

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; }, clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k),
  };
}

/** An upload holds `day` runes (FLIP-X2): take the dawn's first card, as online.test.ts does. */
function takeDawnRune(run: Run): Run {
  const offer = pendingRune(run);
  if (offer) takeRune(run, offer.ids[0]);
  return run;
}

/** online.test.ts's fakes: every fetch and submit recorded; the fetch answers null (the stand-in), the submit never. */
function fakes(me: Identity) {
  const calls = { fetch: [] as unknown[][], submit: [] as unknown[][] };
  const deps: OnlineDeps = {
    fetchGhost: (async (...a: unknown[]) => {
      calls.fetch.push(a);
      return null;
    }) as unknown as typeof fetchGhost,
    submitGhost: ((...a: unknown[]) => {
      calls.submit.push(a);
      return new Promise<SubmitResult>(() => {});
    }) as unknown as typeof submitGhost,
    identity: async () => me,
    store: mem(), now: () => NOW, save: () => {},
  };
  return { deps, calls };
}

async function until(cond: () => boolean, ms = 6000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A run started with the switch off: no mark, 5 lives (a save from before the bump). HULL-ON (the flip, HEARTS): started
 *  under withHearts(fn, false) (the switch ships on now), as heartsRunAt starts its run under withHearts. */
const livesRun = (seed: number): Run => takeDawnRune(withHearts(() => newRun("weaver", seed), false));
/** A run started with the switch on: the mark, 10 hearts. */
const heartsRunAt = (seed: number): Run => takeDawnRune(withHearts(() => newRun("weaver", seed)));

describe("RETUNE-1 run 2: the upload guard (ghostAllowed)", () => {
  it("HEARTS off: every run's snapshot may go up and into the pool, whatever the rules", () => {
    // HULL-ON (the flip, HEARTS): the switch ships on, so this off test sets it off itself (withHearts(fn, false))
    withHearts(() => {
      expect(heartsFor(RULES_VERSION)).toBe(false);
      for (const run of [{}, { hearts: true }]) {
        expect(ghostAllowed(run)).toBe(true);
        expect(ghostAllowed(run, RULES_VERSION)).toBe(true);
        expect(ghostAllowed(run, OLDER)).toBe(true);
      }
    }, false);
  });

  it("HEARTS on: a run without the mark is refused under hearts rules (this build's, HEARTS_RULES), allowed under older rules; a hearts run always allowed", () => {
    setHearts(true);
    expect(HEARTS_RULES).toBe(RULES_VERSION);
    expect([heartsFor(RULES_VERSION), heartsFor(OLDER)]).toEqual([true, false]);
    expect(ghostAllowed({})).toBe(false);
    expect(ghostAllowed({ hearts: undefined }, RULES_VERSION)).toBe(false);
    expect(ghostAllowed({}, OLDER)).toBe(true);
    expect(ghostAllowed({ hearts: true })).toBe(true);
    expect(ghostAllowed({ hearts: true }, OLDER)).toBe(true);
    // a run's own mark: newRun with the switch off gives none, with it on gives the mark
    expect(ghostAllowed(withHearts(() => newRun("furnace", 1), false))).toBe(false);
    expect(ghostAllowed(newRun("furnace", 1))).toBe(true);
  });
});

describe("RETUNE-1 run 2: the local ghost save (saveRunGhost, battle.ts)", () => {
  it("an unmarked 5-life run under hearts rules saves no ghost; a hearts run saves as today; HEARTS off saves as today", () => {
    const old = livesRun(41);
    const hr = heartsRunAt(42);
    expect([old.lives, heartsRun(old), hr.lives, heartsRun(hr)]).toEqual([START_LIVES, false, HEARTS_START, true]);

    // HEARTS off: the unmarked run's ghost joins the pool, as saveGhost does today. HULL-ON (the flip, HEARTS): the switch
    // ships on, so this off half sets it off itself (withHearts(fn, false))
    const off = mem();
    withHearts(() => {
      expect(saveRunGhost(old, ghostOf(old, NOW, "p-off"), off)).toBe(true);
      expect(loadPool(off).map((g) => [g.runId, g.lives])).toEqual([[old.runId, START_LIVES]]);
    }, false);

    setHearts(true);
    const st = mem();
    expect(saveRunGhost(old, ghostOf(old, NOW, "p-on"), st)).toBe(false);
    expect(st.getItem(GHOST_KEY)).toBeNull(); // nothing written
    expect(loadPool(st)).toEqual([]);
    expect(saveRunGhost(hr, ghostOf(hr, NOW, "p-on"), st)).toBe(true);
    expect(loadPool(st).map((g) => [g.runId, g.lives])).toEqual([[hr.runId, HEARTS_START]]);
    // a snapshot under older rules is not a hearts record: the unmarked run's goes in
    expect(saveRunGhost(old, { ...ghostOf(old, NOW, "p-on"), rules: OLDER } as GhostSnapshot, st)).toBe(true);
    expect(loadPool(st)).toHaveLength(2);
  });

  it("battle.ts saves the dusk's ghost through the guard only (saveRunGhost(run, mine), no bare saveGhost call)", () => {
    const src = readFileSync(new URL("../src/screens/battle.ts", import.meta.url), "utf8");
    expect(src).toContain("saveRunGhost(run, mine);");
    expect(src).not.toMatch(/\bsaveGhost\(/);
  });
});

describe("RETUNE-1 run 2: the upload (Online.submitDusk) and the match request (Online.request)", () => {
  let me: Identity;
  beforeAll(async () => {
    me = await testIdentity(3);
  });

  it("HEARTS off: an unmarked run's deck goes up once per dusk, as ghostOf, as today", async () => {
    setHearts(false); // HULL-ON (the flip, HEARTS): the switch ships on, so this off test sets it off (afterEach puts it back)
    const f = fakes(me);
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = livesRun(31);
    s.submitDusk(run);
    s.submitDusk(run);
    expect(f.calls.submit).toHaveLength(1);
    expect(f.calls.submit[0][1]).toEqual(ghostOf(run, NOW, me.playerId));
    expect([s.uploads, run.uploaded]).toEqual([1, 1]);
  });

  it("HEARTS on: an unmarked 5-life run uploads nothing (no POST), but its match request is as today", async () => {
    const f = fakes(me);
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    const run = livesRun(31);
    const reqOff = withHearts(() => s.request(run), false); // HULL-ON (the flip, HEARTS): today's request, made with the switch off
    setHearts(true);
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    s.submitDusk(run);
    s.submitDusk(run);
    expect(f.calls.submit).toHaveLength(0);
    expect(s.uploads).toBe(0);
    expect(run.uploaded).toBe(1); // once per dusk, as before
    expect(s.lastUpload).toMatchObject({ ok: false, refused: true });
    expect(debug).toHaveBeenCalledWith("[beltbattles] tonight's deck is not uploaded: a lives run under hearts rules");
    debug.mockRestore();
    // the match request: unchanged, and still sent
    expect(s.request(run)).toEqual(reqOff);
    expect(reqOff).toEqual({ rules: RULES_VERSION, day: 1, wins: 0, lives: START_LIVES, playerId: me.playerId, seen: [], hero: "weaver", seed: battleSeed(run), runs: 0 });
    s.tick(run);
    expect(f.calls.fetch).toHaveLength(1);
    expect(f.calls.fetch[0][1]).toEqual(reqOff);
  });

  it("HEARTS on: a hearts run's deck goes up as today (its 10 hearts), and its request is the run's own", async () => {
    const f = fakes(me);
    const s = new Online("https://ghosts.example", f.deps);
    await until(() => s.active);
    setHearts(true);
    const run = heartsRunAt(32);
    s.submitDusk(run);
    expect(f.calls.submit).toHaveLength(1);
    const snap = f.calls.submit[0][1] as GhostSnapshot;
    expect(snap).toEqual(ghostOf(run, NOW, me.playerId));
    expect([snap.rules, snap.lives]).toEqual([RULES_VERSION, HEARTS_START]);
    expect([s.uploads, run.uploaded]).toEqual([1, 1]);
    expect(s.request(run)).toMatchObject({ rules: RULES_VERSION, lives: HEARTS_START });
  });
});
