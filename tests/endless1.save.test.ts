// ENDLESS-1 3.2 (REQ-BFG-059): THE SAVES. A save mid-endless resumes in endless (the mark, the endless state and the 3-heart clamp
// survive saveRun / loadRun); a save without the mark loads as before; malformed endless fields are dropped, not trusted. A run that
// is over (an ended endless, a lost run, an unmarked won run) is not kept, as every finished run never was; the ONE exception (run 2,
// 3.2): a won run that carries the mark and has not chosen yet is kept while its RUN WON offer is open, so a reload offers it again.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { finishDay, startEndless } from "../src/game/day";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { SAVE_KEY, loadRun, saveRun, migrateRun } from "../src/game/save";
import { ENDLESS_LIVES, endlessRunShapeOk, inEndless, withEndless } from "../src/sim/endless";
import { hashSeed } from "../src/core/rng";

const NOSTATS = {} as never;
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k),
};
beforeEach(() => store.clear());
afterAll(() => delete (globalThis as { localStorage?: unknown }).localStorage);

function wonRun(endless = true): Run {
  // BUMP-1E: ENDLESS ships on, so the unmarked run is made with it off (was a bare newRun)
  const run = withEndless(() => newRun("weaver", hashSeed("e1-save"), "save-run"), endless);
  while (!run.over) {
    const o = pendingRune(run);
    if (o) takeRune(run, o.ids[0]);
    finishDay(run, 0, 20, NOSTATS, NOSTATS);
  }
  return run;
}
const reload = (): Run | null => loadRun();

describe("ENDLESS-1 3.2: saves", () => {
  it("a save mid-endless resumes in endless: the mark, the endless state, 3 hearts and the day come back, and the next dusk is an endless dusk", () => {
    const run = wonRun();
    startEndless(run);
    finishDay(run, 0, 20, NOSTATS, NOSTATS); // an endless win
    finishDay(run, 1, 20, NOSTATS, NOSTATS); // an endless loss
    saveRun(run);
    expect(store.has(SAVE_KEY)).toBe(true);
    const back = reload()!;
    expect(back.endless).toBe(true);
    expect(back.endlessRun).toEqual({ victoryDay: 10, wins: 1, losses: 1, draws: 0 });
    expect([back.lives, back.day, back.wins, back.over]).toEqual([ENDLESS_LIVES - 1, run.day, 10, null]);
    expect(inEndless(back)).toBe(true);
    // and it plays on as endless: a win adds an endless win, the run's wins stay 10
    finishDay(back, 0, 20, NOSTATS, NOSTATS);
    expect(back.endlessRun!.wins).toBe(2);
    expect(back.wins).toBe(10);
    expect(back.lives).toBe(ENDLESS_LIVES - 1);
  });

  it("the won run before its choice IS kept while its offer is open (run 2: a reload offers it again); an ended endless, and a won run without the mark, are not kept (a finished run never was)", () => {
    const run = wonRun();
    saveRun(run);
    expect(store.has(SAVE_KEY)).toBe(true); // marked, won, undecided: the RUN WON offer survives a reload
    const back = reload()!;
    expect([back.over, back.endless, back.endlessRun]).toEqual(["won", true, undefined]);
    saveRun(wonRun(false));
    expect(store.has(SAVE_KEY)).toBe(false); // the unmarked run's slot is as it always was
    startEndless(run);
    for (let i = 0; i < 3; i++) finishDay(run, 1, 20, NOSTATS, NOSTATS);
    expect(run.over).toBe("won");
    saveRun(wonRun());
    saveRun(run);
    expect(store.has(SAVE_KEY)).toBe(false);
  });

  it("a save without the mark loads as before: no endless key is added, the hearts clamp is the run's", () => {
    const run = withEndless(() => newRun("furnace", 5, "plain"), false); // BUMP-1E: a run started with ENDLESS off (it ships on now; was a bare newRun)
    saveRun(run);
    const back = reload()!;
    expect(Object.keys(back)).not.toContain("endless");
    expect(Object.keys(back)).not.toContain("endlessRun");
    expect(back.lives).toBe(10);
    expect(JSON.stringify(back)).toBe(JSON.stringify(run));
  });

  it("malformed endless fields are dropped, not trusted (the mark must be true; the state must be well formed)", () => {
    const run = newRun("furnace", 6, "bad");
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    expect(migrateRun({ ...raw, endless: "yes" })!.endless).toBeUndefined();
    expect(migrateRun({ ...raw, endlessRun: { victoryDay: "x", wins: 0, losses: 0, draws: 0 } })!.endlessRun).toBeUndefined();
    expect(migrateRun({ ...raw, endlessRun: { victoryDay: 12, wins: 31, losses: 0, draws: 0 } })!.endlessRun).toBeUndefined();
    expect(migrateRun({ ...raw, endlessRun: { victoryDay: 12, wins: 1, losses: 0, draws: 0, extra: 1 } })!.endlessRun).toBeUndefined();
    expect(migrateRun({ ...raw, endlessRun: { victoryDay: 12, wins: 1, losses: 0, draws: 0, end: "weather" } })!.endlessRun).toBeUndefined();
    expect(migrateRun({ ...raw, endless: true, endlessRun: { victoryDay: 12, wins: 1, losses: 2, draws: 0 } })!.endlessRun).toEqual({ victoryDay: 12, wins: 1, losses: 2, draws: 0 });
  });

  it("a mid-endless save's hearts clamp to ENDLESS_LIVES (a run's 10 would be wrong); an ended endless state keeps the run's cap", () => {
    const run = wonRun();
    startEndless(run);
    const raw = JSON.parse(JSON.stringify(run)) as Record<string, unknown>;
    expect(migrateRun({ ...raw, lives: 9 })!.lives).toBe(ENDLESS_LIVES);
    expect(migrateRun({ ...raw, lives: 0 })!.lives).toBe(0);
    expect(migrateRun({ ...raw, lives: 9, endlessRun: { ...(raw.endlessRun as object), end: "hearts" } })!.lives).toBe(9);
  });

  it("endlessRunShapeOk: the five keys, whole numbers, end one of three words", () => {
    expect(endlessRunShapeOk({ victoryDay: 10, wins: 0, losses: 0, draws: 0 })).toBe(true);
    expect(endlessRunShapeOk({ victoryDay: 40, wins: 30, losses: 4, draws: 3, end: "cap" })).toBe(true); // a run past day 25 keeps playing
    for (const bad of [null, [], 3, { victoryDay: 9, wins: 0, losses: 0, draws: 0 }, { victoryDay: 10, wins: -1, losses: 0, draws: 0 }, { victoryDay: 10.5, wins: 0, losses: 0, draws: 0 }, { wins: 0, losses: 0, draws: 0 }]) {
      expect(endlessRunShapeOk(bad)).toBe(false);
    }
  });
});
