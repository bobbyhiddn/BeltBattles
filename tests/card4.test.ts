// CARD-4 (REQ-BFG-107, REQ-BFG-081, REQ-BFG-004, REQ-BFG-087, REQ-BFG-089): READ-4's fixes on CARD-3's build.
// N: the rename notice reaches only a returning (0.9.8) player, decided once at this build's first run.
// P: on the rune cards only the TAP AGAIN TO TAKE IT bar takes a rune (its target a finger's on touch), never within 350 ms
//    of the card opening, never with the tap that closes a note that opened by itself; finger-tall word targets.
// K, D, S: first-sight notes open beside the hint strip; no note box over a panel's header; the strip over no price.
// T: the words READ-4 found misread.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { newRun } from "../src/game/run";
import { saveRun } from "../src/game/save";
import { emptyProfile, saveProfile } from "../src/game/profile";
import { saveSettings } from "../src/core/settings";
import {
  OLD_STORE_KEYS, PLAYER_IDS, TIPS_KEY, completeNotice, completeSight, completeTip, decidePlayer, renameNoticeDue,
  setTipsForTests,
} from "../src/ui/tips";

/** A localStorage for the store tests (as tests/card3.test.ts's Mem). */
class Mem {
  private m = new Map<string, string>();
  getItem(k: string): string | null { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string): void { this.m.set(k, String(v)); }
  removeItem(k: string): void { this.m.delete(k); }
  keys(): string[] { return [...this.m.keys()]; }
}
const g = globalThis as unknown as { localStorage?: unknown };
beforeEach(() => { g.localStorage = new Mem(); setTipsForTests("reload"); });
afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });
/** A page reload: the store read again, then this build's first module (src/ui/firstRun.ts) runs decidePlayer. */
const boot = (): boolean => { setTipsForTests("reload"); return decidePlayer(); };
const stored = (): string[] => JSON.parse((g.localStorage as Mem).getItem(TIPS_KEY) ?? "[]");

describe("CARD-4 (n): the rename notice reaches only a returning 0.9.8 player (REQ-BFG-107; READ-4 10.1)", () => {
  it("the 0.9.8 keys are r098's own names (the profile, the run v7 and v3-v6, the settings, the sound)", () => {
    expect(OLD_STORE_KEYS).toEqual([
      "beltbattles.profile.v1", "beltbattles.run.v7", "beltbattles.run.v6", "beltbattles.run.v5", "beltbattles.run.v4",
      "beltbattles.run.v3", "beltbattles.settings.v1", "beltbattles.sound",
    ]);
    // this build reads and writes the same names (so a 0.9.8 store is the store it would have written)
    const src = (p: string): string => readFileSync(p, "utf8");
    expect(src("src/game/profile.ts")).toContain('PROFILE_KEY = "beltbattles.profile.v1"');
    for (const v of [7, 6, 5, 4, 3]) expect(src("src/game/save.ts")).toContain(`"beltbattles.run.v${v}"`);
    expect(src("src/core/settings.ts")).toContain('const KEY = "beltbattles.settings.v1"');
    expect(src("src/audio/audio.ts")).toContain('localStorage.setItem("beltbattles.sound"');
    expect(PLAYER_IDS).toEqual({ returning: "rename107.returning", fresh: "rename107.new" });
  });

  it("a fresh store is decided new at the first run and stays new after this build writes tips, notes, a run, a profile with runsFinished 1 and settings", () => {
    expect(boot()).toBe(false);
    expect(stored()).toEqual([PLAYER_IDS.fresh]); // decided once, at once
    expect(renameNoticeDue()).toBe(false);
    completeTip("place");
    completeTip("turn");
    completeSight("kw:BURN");
    saveRun(newRun("furnace", 1, "card4-n"));
    const p = emptyProfile();
    p.counters.runs = 1;
    p.counters.runsFinished = 1;
    saveProfile(p);
    saveSettings();
    expect(OLD_STORE_KEYS.filter((k) => (g.localStorage as Mem).getItem(k) !== null).sort()).toEqual(["beltbattles.profile.v1", "beltbattles.run.v7", "beltbattles.settings.v1"]);
    expect(renameNoticeDue()).toBe(false);
    // later sessions read the decision: the keys this build wrote never make the player returning
    for (let i = 0; i < 3; i++) {
      expect(boot()).toBe(false);
      expect(renameNoticeDue()).toBe(false);
    }
    expect(stored()).toEqual(expect.arrayContaining(["place", "turn", "kw:BURN", PLAYER_IDS.fresh]));
    expect(stored()).not.toContain(PLAYER_IDS.returning);
  });

  it("a 0.9.8-shaped store (each key alone) is returning: the notice is due once, then never again, and the decision survives a reload", () => {
    for (const k of OLD_STORE_KEYS) {
      g.localStorage = new Mem();
      (g.localStorage as Mem).setItem(k, k.endsWith("sound") ? "1" : "{}");
      expect(boot(), k).toBe(true);
      expect(stored(), k).toEqual([PLAYER_IDS.returning]);
      expect(renameNoticeDue(), k).toBe(true);
      expect(boot(), `${k}: a reload before the notice`).toBe(true);
      expect(renameNoticeDue(), k).toBe(true);
      completeNotice("rename107");
      expect(renameNoticeDue(), k).toBe(false);
      // the 0.9.8 key gone (a run ended), a reload: still decided, still shown
      (g.localStorage as Mem).removeItem(k);
      expect(boot(), k).toBe(true);
      expect(renameNoticeDue(), `${k}: never again`).toBe(false);
    }
  });

  it("a store with no 0.9.8 key but other BeltBattles keys (a later build's tips, ghosts, a name) is new; with no storage the notice never shows", () => {
    for (const k of [TIPS_KEY, "beltbattles.ghosts.v1", "beltbattles.name.v1", "beltbattles.player.v1", "beltbattles.runs.v1"]) {
      g.localStorage = new Mem();
      (g.localStorage as Mem).setItem(k, k === TIPS_KEY ? '["place"]' : "x");
      expect(boot(), k).toBe(false);
      expect(renameNoticeDue(), k).toBe(false);
    }
    delete g.localStorage;
    expect(boot()).toBe(false);
    expect(renameNoticeDue()).toBe(false);
    // bb.tips("new"): a new player as the first run leaves the store (a reload keeps it new)
    g.localStorage = new Mem();
    (g.localStorage as Mem).setItem("beltbattles.profile.v1", "{}");
    setTipsForTests("new");
    expect(boot()).toBe(false);
    expect(renameNoticeDue()).toBe(false);
  });

  it("the decision runs before anything this build writes: main.ts's first import is src/ui/firstRun.ts, which imports only tips.ts (which imports nothing)", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const imports = main.split("\n").filter((l) => /^import\s/.test(l));
    expect(imports[0]).toMatch(/^import "\.\/ui\/firstRun";/);
    const first = readFileSync("src/ui/firstRun.ts", "utf8");
    expect(first.split("\n").filter((l) => /^import\s/.test(l))).toEqual(['import { decidePlayer } from "./tips";']);
    expect(first).toMatch(/^decidePlayer\(\);$/m);
    expect(readFileSync("src/ui/tips.ts", "utf8").split("\n").filter((l) => /^import\s/.test(l))).toEqual([]);
    // the build screen asks only whether it is due (no profile read: CARD-3's finishedRuns is gone)
    const build = readFileSync("src/screens/build/build.ts", "utf8");
    expect(build).toContain("else if (renameNoticeDue()) {");
    expect(build).not.toMatch(/finishedRuns|loadProfile/);
  });
});
