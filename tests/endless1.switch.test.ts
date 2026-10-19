// ENDLESS-1 3.1 (REQ-BFG-059, its second step): THE SWITCH. src/sim/endless.ts ENDLESS (false) with endlessRules() / setEndless(on) /
// withEndless(fn, on = true), built as longRun.ts built LONG_RUN; rulesGate.ts ENDLESS_RULES (reads RULES_VERSION until the bump
// that ships endless writes the literal) and endlessFor(rules); newRun's mark (Run.endless). Off, the game is byte for byte 0.9.11's.
import { afterEach, describe, expect, it } from "vitest";
import { ENDLESS, ENDLESS_LAST_DAY, ENDLESS_LIVES, ENDLESS_MAX_DRAWS, ENDLESS_WIN_CAP, endlessDusk, endlessMarked, endlessOffered, endlessRules, inEndless, setEndless, withEndless } from "../src/sim/endless";
import { ENDLESS_RULES, LONG_RUN_RULES, endlessFor, longRunFor } from "../src/net/rulesGate";
import { RULES_VERSION } from "../src/sim/content";
import { newRun } from "../src/game/run";
import { LONG_RUN, WIN_GOAL } from "../src/sim/longRun";

afterEach(() => setEndless(ENDLESS));

describe("ENDLESS-1 3.1: the switch (src/sim/endless.ts)", () => {
  it("ships ON (BUMP-1E: was 'ships OFF', ENDLESS false): ENDLESS is true and the module switch reads it", () => {
    expect(ENDLESS).toBe(true);
    expect(endlessRules()).toBe(true);
  });

  it("setEndless turns it on and off; withEndless runs a call with it on (or off) and puts it back, even when the call throws", () => {
    setEndless(true);
    expect(endlessRules()).toBe(true);
    setEndless(false);
    expect(withEndless(() => endlessRules())).toBe(true);
    expect(endlessRules()).toBe(false);
    expect(withEndless(() => endlessRules(), false)).toBe(false);
    setEndless(true);
    expect(withEndless(() => endlessRules(), false)).toBe(false);
    expect(endlessRules()).toBe(true);
    setEndless(false);
    expect(() => withEndless(() => { throw new Error("boom"); })).toThrow("boom");
    expect(endlessRules()).toBe(false);
  });

  it("the numbers: 3 fresh hearts, a perfect endless at 30 endless wins, 2 draws an upload may carry, and a last day under the stores' 99", () => {
    expect([ENDLESS_LIVES, ENDLESS_WIN_CAP, ENDLESS_MAX_DRAWS]).toEqual([3, 30, 2]);
    expect(ENDLESS_LAST_DAY).toBeGreaterThan(WIN_GOAL);
    expect(ENDLESS_LAST_DAY).toBeLessThanOrEqual(99); // server/tigrisStore.ts dDD keys
  });
});

describe("ENDLESS-1 3.1: rulesGate.ts ENDLESS_RULES and endlessFor", () => {
  it("ENDLESS_RULES is the literal bb-0.12.0 (BUMP-1E wrote it; it read RULES_VERSION until the bump that ships endless), and this build's rules are it", () => {
    expect(ENDLESS_RULES).toBe("bb-0.12.0"); // BUMP-1E: was expect(ENDLESS_RULES).toBe(RULES_VERSION)
    expect(RULES_VERSION).toBe(ENDLESS_RULES);
  });

  it("endlessFor(rules) = the switch on AND rules at or after ENDLESS_RULES: off, nothing is endless whatever the rules", () => {
    // BUMP-1E: ENDLESS ships on, so the off half is read under withEndless(fn, false) (was a bare read)
    withEndless(() => {
      expect(endlessFor(RULES_VERSION)).toBe(false);
      expect(endlessFor("bb-9.9.9")).toBe(false);
      expect(endlessFor(undefined)).toBe(false);
    }, false);
  });

  it("switch on: this build's rules and later are endless; older rules, unreadable rules and non-strings are not", () => {
    withEndless(() => {
      expect(endlessFor(RULES_VERSION)).toBe(true);
      expect(endlessFor("bb-9.9.9")).toBe(true);
      expect(endlessFor(LONG_RUN_RULES)).toBe(RULES_VERSION === LONG_RUN_RULES); // the version that wrote the long run's literal is this build's today
      expect(endlessFor("bb-0.10.0")).toBe(false);
      expect(endlessFor("bb-0.9.7")).toBe(false);
      expect(endlessFor("0.11.0")).toBe(false);
      expect(endlessFor(null)).toBe(false);
      expect(endlessFor(42)).toBe(false);
    });
  });

  it("a record or a request asks endlessFor, never the switch alone, and endless rules are long-run rules (a won run to continue)", () => {
    expect(LONG_RUN).toBe(true);
    withEndless(() => {
      for (const r of ["bb-0.11.0", "bb-0.12.0", "bb-1.0.0"]) if (endlessFor(r)) expect(longRunFor(r)).toBe(true);
    });
  });
});

describe("ENDLESS-1 3.1: newRun's mark (Run.endless)", () => {
  it("off: no mark, the run is exactly as before (no `endless` and no `endlessRun` key)", () => {
    const run = withEndless(() => newRun("furnace", 7, "x-1"), false); // BUMP-1E: ENDLESS ships on; the off world is read under withEndless(fn, false) (was a bare newRun)
    expect(Object.keys(run)).not.toContain("endless");
    expect(Object.keys(run)).not.toContain("endlessRun");
    expect(endlessMarked(run)).toBe(false);
    expect(endlessOffered({ ...run, over: "won" })).toBe(false); // a run saved before the release plays on its own rules
  });

  it("on: newRun sets the mark (true only), after the long-run mark; a run started with it off keeps playing without it", () => {
    const marked = withEndless(() => newRun("weaver", 9, "x-2"));
    expect(marked.endless).toBe(true);
    const keys = Object.keys(marked);
    expect(keys.indexOf("endless")).toBeGreaterThan(keys.indexOf("longRun"));
    expect(endlessMarked(marked)).toBe(true);
    expect(endlessMarked(withEndless(() => newRun("weaver", 9, "x-3"), false))).toBe(false); // a run started with the switch off is not marked (BUMP-1E: was a bare newRun, the switch off by default)
    expect(endlessMarked(marked)).toBe(true); // a run never reads the switch after its start
  });

  it("only a MARKED, WON run with no endless state yet is offered CONTINUE ENDLESS", () => {
    const marked = withEndless(() => newRun("foundry", 3, "x-4"));
    expect(endlessOffered(marked)).toBe(false); // not won
    expect(endlessOffered({ ...marked, over: "won" })).toBe(true);
    expect(endlessOffered({ ...marked, over: "lost" })).toBe(false);
    expect(endlessOffered({ ...marked, over: "complete" })).toBe(false);
    expect(endlessOffered({ ...marked, over: "won", endlessRun: { victoryDay: 12, wins: 0, losses: 0, draws: 0 } })).toBe(false); // already taken
    expect(inEndless({ ...marked })).toBe(false);
  });
});

describe("ENDLESS-1 3.2: the endless dusk step (endless.ts endlessDusk), the one the game, the model and the bots take", () => {
  it("a win adds an endless win and costs nothing; a loss costs ONE heart on every day; a draw costs nothing", () => {
    expect(endlessDusk(3, 0, 12, "win")).toEqual({ hearts: 3, wins: 1, cost: 0, end: null });
    for (const day of [1, 3, 4, 7, 10, 11, 25, 40]) expect(endlessDusk(3, 4, day, "loss")).toEqual({ hearts: 2, wins: 4, cost: 1, end: null }); // not the run's 1/2/2 ladder
    expect(endlessDusk(2, 5, 30, "draw")).toEqual({ hearts: 2, wins: 5, cost: 0, end: null });
  });

  it("endless ends at the 3rd heart lost, at the ENDLESS_WIN_CAP-th win, or after the dusk of the last day (hearts first, then the cap, then the day)", () => {
    expect(endlessDusk(1, 7, 20, "loss")).toEqual({ hearts: 0, wins: 7, cost: 1, end: "hearts" });
    expect(endlessDusk(3, ENDLESS_WIN_CAP - 1, 20, "win")).toEqual({ hearts: 3, wins: ENDLESS_WIN_CAP, cost: 0, end: "cap" });
    expect(endlessDusk(3, 2, ENDLESS_LAST_DAY, "win").end).toBe("lastDay");
    expect(endlessDusk(3, 2, ENDLESS_LAST_DAY, "draw").end).toBe("lastDay");
    expect(endlessDusk(1, 2, ENDLESS_LAST_DAY, "loss").end).toBe("hearts");
    expect(endlessDusk(3, ENDLESS_WIN_CAP - 1, ENDLESS_LAST_DAY, "win").end).toBe("cap");
    expect(endlessDusk(3, 2, ENDLESS_LAST_DAY - 1, "win").end).toBeNull();
  });
});
