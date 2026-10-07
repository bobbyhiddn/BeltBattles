// 0.6.2 final balance pass, FB-B (ref/BRIEF-fb-B-mods.md item 1, ref/HOPPER-DIAG.md; design: oracle 16085a6430e4cc6a):
// HOPPER. Every star keeps ★1's window (+1 slot) and timer (+0.5 s). ★2/★3 add a store: while the gun fires it takes
// 1/2 loads off the belt, and they drop into the next window; ★3 BOTTOMLESS never jams. Was: ★2 +2 slots and +1.0 s,
// ★3 +3 and +1.5 s. On a sparse belt the extra slot sat empty while the longer timer delayed every shot, so ★2 was a
// WORSE row on the E1 day-7 bench (first shot 4.15 s at ★1, 4.65 s at ★2 in HOPPER-DIAG's fight).
// Y7b2 (the flip; release Y, DESIGN-Y row 33): FB-B's +0.5 s load time, the ★2/★3 store and ★3's no-jam are gone; the
// chamber holds +1 / +2 / +3 loads (window). The store's tests (the two-arrival store, the drop into the next window,
// PRESSURE BREECH's stored queue) and the store / no-jam / +0.5 s assertions are deleted (switch-off only).
import { describe, expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { ITEMS, WINDOW_TIME } from "../src/sim/content";
import { RULES_VERSION } from "../src/sim/content"; // Y7b2: HOPPER's tripwire (cap's ruling e66379fbf3184e56) is keyed to bb-0.9.3
import type { Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { abilityText, gist, nextStarText } from "../src/ui/abilityText"; // 0.6.2rel: the glossary's words (REQ-BFG-032)
import { barge, bench, busy, run, SEED } from "./arsenal.bench";

const STARS = [1, 2, 3];

/** Every shot turret 0 of side 0 fires in `secs` (battle times). Y7b2 (the flip): no store to count (switch-off only). */
function shots(b: Build, secs = 40): { times: number[]; jams: number; damage: number } {
  const times: number[] = [];
  const bt = run(b, secs, barge(), SEED, (ev, x) => {
    for (const e of ev) if (e.type === "fire" && e.side === 0 && e.turret === 0) times.push(+x.t.toFixed(6));
  });
  return { times, jams: bt.sides[0].stats.jams, damage: bt.sides[0].stats.damage };
}

describe("FB-B HOPPER: ★1's window at every star, plus a store for loads that arrive while the gun fires", () => {
  // Y7b2 (the flip): was "the rule: +1 slot and +0.5 s at every star; a store of 0/1/2; ★3 never jams"
  it("the rule: +1 / +2 / +3 slots; the load time as it was", () => {
    const tu = (s: number) => new Battle(bench([], [["hopper", s]]), barge(), SEED).sides[0].turrets[0];
    // Y7b2 (the flip): was [4, WINDOW_TIME + 0.5, store 0/1/2, noJam ★3]; the store and no-jam columns are deleted
    // (switch-off only: no piece sets a store or a gear no-jam any more)
    expect(STARS.map((s) => [tu(s).window, tu(s).windowTime])).toEqual([
      [4, WINDOW_TIME], [5, WINDOW_TIME], [6, WINDOW_TIME],
    ]);
    // Y7b2 (the flip): was { window: 1, windowTime: 0.5 } + store 1 / store 2, noJam at ★2 / ★3
    expect(STARS.map((s) => effectAt("hopper", s).mod)).toEqual([{ window: 1 }, { window: 2 }, { window: 3 }]);
  });

  it("(brief test 1) a sparse route: ★2 and ★3 fire their first shot no later than ★1, and no shot later either", () => {
    const [one, two, three] = STARS.map((s) => shots(bench([], [["hopper", s]])));
    expect(one.times.length).toBeGreaterThan(20);
    expect(two.times[0], "★2 first shot").toBeLessThanOrEqual(one.times[0]);
    expect(three.times[0], "★3 first shot").toBeLessThanOrEqual(one.times[0]);
    for (const x of [two, three]) {
      expect(x.times.length).toBeGreaterThanOrEqual(one.times.length);
      one.times.forEach((t, k) => expect(x.times[k], `shot ${k}`).toBeLessThanOrEqual(t + 1e-9));
    }
    // the old ★2 (+2 slots, +1.0 s), for the record: its first shot slipped behind ★1's on this belt
    const old = new Battle(bench([], [["hopper", 1]]), barge(), SEED);
    old.sides[0].turrets[0].window += 1;
    old.sides[0].turrets[0].windowTime += 0.5;
    let first = -1;
    while (first < 0 && old.t < 10) { old.step(); for (const e of old.drainEvents()) if (e.type === "fire" && e.side === 0 && first < 0) first = old.t; }
    expect(first, "the old ★2's first shot").toBeGreaterThan(one.times[0]);
  });

  // Y7b2 (the flip): "(brief test 2) simultaneous arrivals while the gun fires: ★2 stores one, ★3 both", "the stored
  // loads drop into the next window, oldest first" and "PRESSURE BREECH counts stored loads as queued" are deleted: no
  // HOPPER has a store (switch-off only).

  // measured (60 s): ★1 38 shots, 18 jams, 185.2 damage; ★2 38, 18, 196.4 (10 loads stored); ★3 56, 0, 276.2 (30 stored).
  // Both belts together outrun the gun, so the backlog stays past the jam threshold even with a load in the store.
  // Y7b2 (the flip), measured (60 s, windows 4 / 5 / 6, no store, no no-jam): ★1 39 shots, 17 jams, 2020 damage; ★2 39,
  // 17, 2108; ★3 39, 17, 1976. The store and BOTTOMLESS asserts are deleted (switch-off only); ★2 -> ★3 deals less
  // (1976 < 2108): the tripwire below (cap's ruling e66379fbf3184e56). (The title was "...: the store takes loads off the
  // belts; each star ...")
  it("two belts into one gun (saturated): each star deals more, none jams more", () => {
    const [one, two, three] = STARS.map((s) => shots(busy([["hopper", s]], 5000), 60));
    expect(two.jams).toBeLessThanOrEqual(one.jams);
    // Y7b2 (cap's ruling e66379fbf3184e56): ★3's jams too, so the title's "none jams more" holds at every star (17 = 17)
    expect(three.jams).toBeLessThanOrEqual(one.jams);
    expect(two.times.length).toBeGreaterThanOrEqual(one.times.length);
    expect(three.times.length).toBeGreaterThanOrEqual(two.times.length);
    expect(two.damage).toBeGreaterThan(one.damage);
    // Y7b2 TRIPWIRE (cap's ruling e66379fbf3184e56; only while RULES_VERSION is "bb-0.9.3"; this saturated bench only): the
    // flip took ★2/★3's store and ★3's no-jam, and on a saturated gun every star fires 39 shots with 17 jams, so the extra
    // slots add no shots and only the packing moves the damage: ★3 < ★2 by 6.3% and ★3 < ★1 by 2.2% (was: each star deals
    // more). Its three damages are pinned exactly; the jams, the shot counts and ★2 > ★1 above stay live. Design list:
    // HOPPER's stars on saturated guns (one seed; check across seeds when fixing; fix it inside the window rule, with no
    // store or no-jam returning: REVIEW-STARD, Y7A-R6); once fixed, delete this tripwire and let ★3 > ★2 cover HOPPER again
    // Z-BUMP (REQ-BFG-073; the bump to bb-0.9.7, cap's call on Y7B2-Q3: re-rule, fix none): re-keyed bb-0.9.3 -> bb-0.9.7,
    // its three damages measured at Z-BUMP's tip. accepted for bb-0.9.7; the star-ladder pass fixes it (cap, Z-BUMP)
    if (RULES_VERSION === "bb-0.9.7") {
      const why = "Y7b2 tripwire (cap's ruling e66379fbf3184e56): HOPPER's saturated damages pinned under bb-0.9.7 (re-ruled at Z-BUMP), ★3 < ★2 by 6.3%, ★3 < ★1 by 2.2%; accepted for bb-0.9.7; the star-ladder pass fixes it (cap, Z-BUMP)";
      expect([one.damage, two.damage, three.damage], why).toEqual([2020, 2108, 1976]);
      expect(three.damage, `${why}: the recorded finding, ★3 under ★2`).toBeLessThan(two.damage);
      expect(three.damage, `${why}: the recorded finding, ★3 under ★1`).toBeLessThan(one.damage);
      return;
    }
    expect(three.damage).toBeGreaterThan(two.damage);
  });

  // Y7b2 (the flip): was "... still fuse through the store ..." (no store now); measured 24 fusions at every star
  it("FOUNDRY: twin blanks still fuse beside a HOPPER (fusions at ★2/★3 are not below ★1's)", () => {
    const b = heroStartBuild("foundry", 1);
    const fused = (s: number) => {
      const d: Build = { ...b, mods: [...b.mods, { uid: 950, def: "hopper", turret: 0, ...(s > 1 ? { stars: s } : {}) }] };
      return { fusions: run(d, 40, barge(), SEED).sides[0].race!.foundry.fusions };
    };
    const [one, two, three] = STARS.map(fused);
    expect(one.fusions).toBeGreaterThan(5);
    expect(two.fusions).toBeGreaterThanOrEqual(one.fusions);
    expect(three.fusions).toBeGreaterThanOrEqual(one.fusions);
  });

  // Y7b2 (the flip): was "player text: the star lines name the store; ★1's description is unchanged"
  it("player text: the star lines name the extra loads; ★1's description is unchanged", () => {
    // NUM-4 (REQ-BFG-047, N1 2.2): ★1's +0.5 s load time is a hidden sub-second timer, so it left the desc, the chamber
    // sentence and ★1's gist, which say the load time is LONGER (still true: the data's windowTime > 0); the extra slot
    // is the data's; FB-B's store is still not in the desc (was ["CHAMBER HOLDS 1 MORE", "LOAD; WINDOWS STAY",
    // "OPEN 0.5S LONGER."], "... THE LOAD TIME IS 0.5 SECONDS LONGER.", "HOLDS 1 MORE LOAD, LOAD TIME 0.5 SECONDS LONGER";
    // ★1's gist now "HOLDS 1 MORE LOAD, LONGER LOAD TIME")
    // Y7b2 (the flip): the data's windowTime > 0 check is deleted (no +0.5 s: switch-off only); the desc is the data's
    // as it stands (its LOAD TIME line may move with the words step)
    // TXT-096 (Y7B2-Q5; the Prime's ruling fd56a6c372070b6d step 4): the words step: no LOAD TIME (no +0.5 s since Y7b2, so
    // "ITS LOAD TIME RUNS LONGER." was false); the chamber's extra loads stay the data's (was [..., "LOAD; ITS LOAD TIME",
    // "RUNS LONGER."])
    const m1 = effectAt("hopper", 1).mod!;
    expect(ITEMS.hopper.desc).toEqual([`CHAMBER HOLDS ${m1.window} MORE`, "LOAD."]);
    // 0.6.2rel (REQ-BFG-032): the star lines are the glossary's sentences (abilityText) and clauses (gist, NEXT STAR)
    // Y7b2 (the flip): was [chamber], [chamber, store(1)], [chamber, store(2), "THE TURRET NEVER JAMS."] with chamber "THE
    // CHAMBER HOLDS 1 MORE LOAD, AND THE LOAD TIME IS LONGER." and store(n) "WHILE THE TURRET FIRES, IT STORES n LOAD(S)
    // FROM THE BELT FOR ITS NEXT CHAMBER."
    const chamber = (n: number) => `THE TURRET'S CHAMBER HOLDS ${n} MORE LOAD${n === 1 ? "" : "S"}.`;
    expect(STARS.map((s) => abilityText("hopper", s).sentences.slice(0, s))).toEqual([[chamber(1)], [chamber(2)], [chamber(3)]]);
    // Y7b2 (the words, 9e0fb21): ★3's perk name BOTTOMLESS left with its no-jam (content.ts), so no perk (was { name:
    // "BOTTOMLESS", stars: 3, after: 2 })
    expect(abilityText("hopper", 3).perk).toBeUndefined();
    // Y7b2 (the flip): was "HOLDS 1 MORE LOAD, LONGER LOAD TIME", "STORES 1 LOAD WHILE IT FIRES", "STORES 2 LOADS WHILE IT
    // FIRES, NEVER JAMS"; NEXT STAR was "STORES 1 LOAD WHILE IT FIRES."
    expect(STARS.map((s) => gist("hopper", s))).toEqual([
      `HOLDS ${m1.window} MORE LOAD`, "HOLDS 2 MORE LOADS", "HOLDS 3 MORE LOADS",
    ]);
    expect(nextStarText("hopper", 1)).toBe("NEXT STAR: HOLDS 2 MORE LOADS.");
  });
});
