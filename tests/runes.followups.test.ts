// RUNES-2a (REQ-BFG-058) M1: RUNES-1's follow-ups. Q4: the rules gate's "runes need bb-0.8.7" row, asked by the strict
// decoder and (new) by the client's isSnapshot, so both checks stay equal and no verdict changes today. Gap 6: run.ts
// refuses a fight while a rune pick is pending (fightRefusal; the build screen's FIGHT asks it). Q6: HAIR TRIGGER's new
// form, YOUR TURRETS AND FACTORIES: +N% RATE.
import { describe, expect, it } from "vitest";
import { RULES_ROWS, RUNES_RULES, TURRETS_JOINS_RULES, rulesGateProblem, runeFeatures } from "../src/net/rulesGate";
import { LAST_CHANCE_RULES, lastChanceGateProblem } from "../src/net/rulesGate"; // Z-BUMP: LAST CHANCE's row
import { SUSTAIN_RULES } from "../src/net/rulesGate"; // FLIP-X2: the third row, bb-0.9.0
import { FURNACE_RUNES_RULES, furnaceRuneFeatures } from "../src/net/rulesGate"; // BAL-2: the fourth row, bb-0.9.1
import { rulesAtLeast } from "../src/net/rulesGate"; // Y7b2: bb-0.9.3 adds no row, so this build's rules are at or after every row
import { checkSnapshot } from "../src/net/snapshot";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { ghostOf, finishDay } from "../src/game/day";
import { RUNE_FIRST, fightRefusal, newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { RULES_VERSION } from "../src/sim/content";
import { rateMul, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): a whole rate % on the speed, 30 / speed
import { roundHalfUp } from "../src/sim/pct"; // NUM-2: a turret's speed rounds half up once (battle.ts setSpeed)
import { RUNES } from "../src/sim/runes";
import { Battle } from "../src/sim/battle";
import { cloneBuild, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";

const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };

/** A run that took its day-1 rune, at day 2's dawn with day 2's rune taken too: its dusk snapshot holds 2 runes. */
function twoRunes(hero: Run["hero"] = "foundry", seed = 4242): Run {
  const run = newRun(hero, seed);
  takeRune(run, pendingRune(run)!.ids[0]);
  finishDay(run, 0, 10, stats, stats);
  takeRune(run, pendingRune(run)!.ids[1]);
  return run;
}
const refused = (s: unknown): string | null => { try { checkSnapshot(s); return null; } catch (e) { return (e as Error).message; } };

describe("RUNES-2a M1 (Q4): the rules gate's runes row", () => {
  it("runes need bb-0.8.7 (RUNES_RULES), the second row after turrets and joins (bb-0.6.2), and this build's rules are it", () => {
    expect(RUNES_RULES).toBe("bb-0.8.7");
    // FLIP-X2 (REQ-BFG-069, step 3's one bump): this build's rules are bb-0.9.0, SUSTAIN_RULES, the third row after the runes
    // row (was RULES_VERSION === RUNES_RULES and two rows); the runes row is unchanged.
    // BAL-2 (the bump to bb-0.9.1): this build's rules are FURNACE_RUNES_RULES, the fourth row after the sustain row (was
    // RULES_VERSION === SUSTAIN_RULES and three rows); the runes and sustain rows are unchanged.
    // Y7b2 (the bump to bb-0.9.3): release Y adds no id (it changes the rules of pieces bb-0.9.1 already carries), so the
    // gate gains no row: this build's rules are bb-0.9.3, at or after every row (was RULES_VERSION === FURNACE_RUNES_RULES).
    // Z-BUMP (the bump to bb-0.9.7; REQ-BFG-073): RULES_ROWS gains no row either. LAST CHANCE's row gates a snapshot field
    // (snapshot.lastChance), not a build feature, so it is rulesGate.ts lastChanceGateProblem with LAST_CHANCE_RULES, beside
    // RULES_ROWS (checked below); this build's rules are bb-0.9.7, at or after every row and LAST_CHANCE_RULES
    expect(RULES_VERSION).toBe("bb-0.9.7"); // Z-BUMP: the bump (was bb-0.9.3)
    expect(LAST_CHANCE_RULES).toBe("bb-0.9.7"); // Z-BUMP: LAST CHANCE's row, a literal
    expect(lastChanceGateProblem(RULES_VERSION)).toBeNull();
    expect(lastChanceGateProblem("bb-0.9.3")).toBe("rules bb-0.9.3 predate bb-0.9.7: LAST CHANCE (snapshot.lastChance) needs bb-0.9.7 or later");
    expect(RULES_ROWS.every((r) => rulesAtLeast(RULES_VERSION, r.from))).toBe(true);
    expect(FURNACE_RUNES_RULES).toBe("bb-0.9.1");
    expect(SUSTAIN_RULES).toBe("bb-0.9.0");
    expect(RULES_ROWS.map((r) => r.from)).toEqual([TURRETS_JOINS_RULES, RUNES_RULES, SUSTAIN_RULES, FURNACE_RUNES_RULES]);
    const b: Build = { ...heroStartBuild("weaver"), runes: [{ id: "iron_skin" }] };
    expect(runeFeatures(b)).toEqual(["runes (build.runes)"]);
    for (const none of [heroStartBuild("weaver"), { ...heroStartBuild("weaver"), runes: [] }, null, 7, "x", { runes: "x" }]) expect(runeFeatures(none)).toEqual([]);
    expect(rulesGateProblem("bb-0.8.7", b)).toBeNull();
    expect(rulesGateProblem("bb-0.9.0", b)).toBeNull();
    expect(rulesGateProblem("bb-0.9.1", b)).toBeNull();
    expect(rulesGateProblem("bb-0.9.3", b)).toBeNull(); // Y7b2: release Y's rules
    expect(rulesGateProblem("bb-0.9.7", b)).toBeNull(); // Z-BUMP: this build's rules
    // BAL-2: the fourth row. A FURNACE rune needs bb-0.9.1 (dormant under bb-0.9.0, other effects before it); others don't
    for (const id of ["coal_chute", "heat_sink", "searing", "shatter_shot"]) {
      const f: Build = { ...heroStartBuild("furnace"), runes: [{ id: "iron_skin" }, { id }] };
      expect(furnaceRuneFeatures(f), id).toEqual(["FURNACE's runes (COAL CHUTE, HEAT SINK, SEARING, SHATTER SHOT)"]);
      expect(rulesGateProblem("bb-0.9.1", f), id).toBeNull();
      expect(rulesGateProblem("bb-0.9.3", f), id).toBeNull(); // Y7b2: release Y's rules
      expect(rulesGateProblem("bb-0.9.7", f), id).toBeNull(); // Z-BUMP: this build's rules
      expect(rulesGateProblem("bb-0.9.0", f), id).toBe("rules bb-0.9.0 predate bb-0.9.1: FURNACE's runes (COAL CHUTE, HEAT SINK, SEARING, SHATTER SHOT) need bb-0.9.1 or later");
    }
    for (const none of [b, heroStartBuild("furnace"), null, 7, "x", { runes: "x" }, { runes: [{ id: 7 }] }]) expect(furnaceRuneFeatures(none)).toEqual([]);
    expect(rulesGateProblem("bb-0.8.6", b)).toBe("rules bb-0.8.6 predate bb-0.8.7: runes (build.runes) need bb-0.8.7 or later");
    expect(rulesGateProblem("bb-x", b)).toBe(`rules "bb-x" is not a bb-MAJOR.MINOR.PATCH version: runes (build.runes) need bb-0.8.7 or later`);
    // a build without runes: the runes row never refuses (under any rules); the bb-0.6.2 row keeps its own words, first
    expect(rulesGateProblem("bb-0.1.0", heroStartBuild("weaver"))).toBeNull();
    const old = { ...b, turrets: [{ slot: 0, def: "dartgun", uid: 1 }] };
    expect(rulesGateProblem("bb-0.6.1", old)).toBe("rules bb-0.6.1 predate bb-0.6.2: turret slots (build.turrets) need bb-0.6.2 or later");
  });

  it("the client's isSnapshot asks the gate as the strict decoder does: both refuse runes under bb-0.8.6, both take bb-0.8.7", () => {
    const g = ghostOf(twoRunes(), 1000, "p1", null);
    expect(g.build.runes!.length).toBe(2);
    expect(isSnapshot(g)).toBe(true);
    expect(refused(g)).toBeNull();
    const old = { ...g, rules: "bb-0.8.6" };
    expect(isSnapshot(old)).toBe(false);
    expect(refused(old)).toMatch(/snapshot\.rules: rules bb-0\.8\.6 predate bb-0\.8\.7: runes \(build\.runes\) need bb-0\.8\.7/);
    const garbled = { ...g, rules: "bb-8" };
    expect([isSnapshot(garbled), refused(garbled) !== null]).toEqual([false, true]);
    // the same snapshot without runes passes the gate under the old rules on both sides (no verdict changes today)
    const bare = { ...old, v: 2 as const, build: { ...cloneBuild(g.build), runes: undefined } };
    delete (bare as { seed?: number }).seed;
    expect([isSnapshot(bare), refused(bare)]).toEqual([true, null]);
    // the hero row too: a FOUNDRY ghost under bb-0.7.0 (FURNACE and WEAVER only) is refused by both
    const hero = { ...bare, rules: "bb-0.7.0" };
    expect([isSnapshot(hero), refused(hero) !== null]).toEqual([false, true]);
  });
});

describe("RUNES-2a M1 (gap 6): run.ts refuses a fight while a rune pick is pending", () => {
  it("a new run can't fight until its day-1 rune is taken; each dawn asks again; no pick owed, no refusal", () => {
    const run = newRun("weaver", 99);
    expect(pendingRune(run)).not.toBeNull();
    expect(fightRefusal(run)).toBe(RUNE_FIRST);
    expect(RUNE_FIRST).toBe("TAKE TODAY'S RUNE FIRST");
    takeRune(run, pendingRune(run)!.ids[2]);
    expect(fightRefusal(run)).toBeNull();
    finishDay(run, 1, 10, stats, stats);
    expect(run.day).toBe(2);
    expect(fightRefusal(run)).toBe(RUNE_FIRST);
    takeRune(run, pendingRune(run)!.ids[0]);
    expect(fightRefusal(run)).toBeNull();
    // a save from before runes owes no pick, so it is never refused; nor is a run that is over
    const old = newRun("furnace", 5);
    delete old.runeDay;
    expect(fightRefusal(old)).toBeNull();
    const done = newRun("furnace", 6);
    done.over = "lost";
    expect(fightRefusal(done)).toBeNull();
  });

  it("the build screen's FIGHT asks it first, and the summary tooling takes the dawn rune before each dusk", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../src/screens/build/build.ts", import.meta.url), "utf8");
    const fight = src.slice(src.indexOf("  fight(): void {"));
    expect(fight.slice(0, fight.indexOf("fightBlock("))).toContain("fightRefusal(this.run)");
    const { playOut } = await import("../src/tooling");
    const run = playOut({ hero: "bastion", seed: 777, results: "WLWDW" });
    expect(run.build.runes!.length).toBe(5);
  });
});

describe("RUNES-2a M1 (Q6): HAIR TRIGGER, YOUR TURRETS AND FACTORIES: +N% RATE (rare)", () => {
  it("a rare whose whole N speeds every turret and every factory", () => {
    const d = RUNES.hair_trigger;
    expect([d.tier, d.theme, d.kind, d.amount.unit, d.text]).toEqual(["rare", "turrets", "allRate", "pct", "YOUR TURRETS AND FACTORIES: +{N} {RATE}."]);
    expect(Number.isInteger(d.amount.n) && d.amount.n >= 1).toBe(true);
    const foe = heroStartBuild("weaver");
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) {
      const b = heroStartBuild(hero);
      const s0 = new Battle(b, foe, 1).sides[0];
      const s1 = new Battle({ ...cloneBuild(b), runes: [{ id: "hair_trigger" }] }, foe, 1).sides[0];
      const k = 1 + d.amount.n / 100;
      // NUM-2 (REQ-BFG-047, N1 2.3): a RATE rune multiplies the turret's unrounded speed by rateMul(N) inside its one
      // rounding (battle.ts setSpeed): interval = 30 / roundHalfUp(speedRaw x (100 + N) / 100) (was the interval / k, which
      // the rounding no longer gives exactly: SCRAP CANNON 30 x 1.08 = 32.4 -> 32, 0.9375 s, not 1 / 1.08 = 0.926 s).
      // The factories' pace is unchanged (x k).
      const at = (raw: number): number => secPer(roundHalfUp(raw));
      s0.turrets.forEach((tu, i) => expect(s1.turrets[i].interval).toBeCloseTo(at(tu.speedRaw * rateMul(d.amount.n)), 12)); // NUM-2 (was tu.interval / k)
      s0.factories.forEach((f, i) => expect(s1.factories[i].pace).toBeCloseTo(f.pace * k, 12));
      // with GUN OIL and STOKED FIRES the percentages add
      const s2 = new Battle({ ...cloneBuild(b), runes: [{ id: "hair_trigger" }, { id: "gun_oil" }, { id: "stoked_fires" }] }, foe, 1).sides[0];
      s0.turrets.forEach((tu, i) => expect(s2.turrets[i].interval).toBeCloseTo(at(tu.speedRaw * rateMul(d.amount.n + RUNES.gun_oil.amount.n)), 12)); // NUM-2 (was tu.interval / (1 + (N + GUN OIL) / 100))
      s0.factories.forEach((f, i) => expect(s2.factories[i].pace).toBeCloseTo(f.pace * (1 + (d.amount.n + RUNES.stoked_fires.amount.n) / 100), 12));
    }
  });
});
