// HULL-1c (REQ-BFG-078; REVIEW-HULL1A Q1): NPC-1's day-1 refusal, fixed. HULL-1a's repro (kit-hull1a/zz-base9106.test.ts),
// made a test that passes. At hull1-base, NPC_DAY on, 1 of the upload driver's 200 mixed dusks (seeds 9100-9107 and
// 8100-8111) was refused: FOUNDRY, driver seed 9106, day 1, a Hard win that dropped TEMPER, then the dock's PLATING paid from
// that win's gold, with roadCap -2 on day 1. roadCap's NPC day now lets the deck's own day's fight gold pay that day's event
// (src/net/roadCap.ts npcPlanDP), so every one of those dusks passes. NPC_DAY off, roadCap is 0.9.7's (the event is the
// day's one road stop, paid from the purse). roadCap's memo keys carry HULL_SCALE too (the day's gold reads it). Every test
// puts NPC_DAY and HULL_SCALE back.
import { afterEach, describe, expect, it } from "vitest";
import { HEROES, RULES_VERSION, type HeroId } from "../src/sim/content";
import { setNpcDay } from "../src/sim/npcDay";
import { setHullScale } from "../src/sim/hullScale";
import { withShrine } from "../src/game/shrine"; // BUMP-1F (ENCHANT on): the 10-event bag of the seed's refusal is read with the ASH SHRINE out
import { heroGateProblem } from "../src/net/rulesGate";
import { validateUpload } from "../src/net/validate";
import { explainRoadCap, gmax, resetRoadCapMemo, roadCap, roadCapFor, roadMixes, roadOptions } from "../src/net/roadCap";
import { driveRuns } from "./uploadDriver";

const HEROS = (Object.keys(HEROES) as HeroId[]).filter((h) => heroGateProblem(RULES_VERSION, h) === null);
afterEach(() => { // the shipped values (AZ-BUMP's flip; were false): a test that reads a switch off sets it off itself
  setNpcDay(true);
  setHullScale(true);
});

describe("HULL-1c: NPC-1's day-1 refusal (REVIEW-HULL1A Q1)", () => {
  it("the driver's mixed runs from 9100 and 8100, NPC_DAY on: every dusk passes, seed 9106's FOUNDRY day 1 among them", () => {
    setNpcDay(true);
    const sweep = (): { bad: string[]; n: number; seen: string } => {
      const bad: string[] = [];
      let n = 0, seen = "";
      for (const seed0 of [9100, 8100]) {
        for (const r of driveRuns(seed0 === 9100 ? 8 : 12, seed0, HEROS, "mixed")) {
          for (const d of r.dusks) {
            n++;
            const v = validateUpload(d.build, d.day, RULES_VERSION, { seed: d.runSeed, road: d.roadLog });
            if (!v.ok) bad.push(`${d.hero} seed ${d.seed} d${d.day}: ${d.road}: ${v.errors[0]}`);
            if (d.hero === "foundry" && d.seed === 9106 && d.day === 1) seen = `${d.road}; ${v.ok ? "passes" : v.errors[0]}`;
          }
        }
      }
      return { bad, n, seen };
    };
    // BUMP-1F (ENCHANT on, bb-0.13.0; RULING-BUMP1F-R3.1): was the sweep once, in one world. With ENCHANT on the road-event bag holds the ASH SHRINE (an 11-event bag, ENCHANT-2 T3), so the run seeds draw
    // other events and seed 9106's FOUNDRY day 1 is "event smuggler: BURN" now (was the dock's PLATING): the refusal this test keeps is the 10-event bag's, so it is read there (withShrine(.., false),
    // synchronously: the shrine out of the bag, ENCHANT as shipped), every assertion as it was; the shipped world's sweep then passes the same 200 dusks (no refusal, n 200)
    const old = withShrine(sweep, false);
    console.log(`HULL1C-BASE9106 ${old.n} dusks, ${old.bad.length} refused; seed 9106 FOUNDRY day 1: ${old.seen}\n${old.bad.join("\n")}`);
    expect(old.seen).toMatch(/^hard [a-z0-9_]+: win, took [a-z0-9_]+; event dock: PLATING; passes$/);
    expect(old.bad).toEqual([]);
    expect(old.n).toBe(200);
    const now = sweep();
    console.log(`HULL1C-BASE9106 (ASH SHRINE in the bag) ${now.n} dusks, ${now.bad.length} refused; seed 9106 FOUNDRY day 1: ${now.seen}\n${now.bad.join("\n")}`);
    expect(now.bad).toEqual([]);
    expect(now.n).toBe(200);
  });

  it("the model: day 1 with the dock's PLATING is roadCap 0 with NPC_DAY on (the fight's gold pays it), -its cost off (0.9.7's day: the event alone)", () => {
    setNpcDay(false); // AZ-BUMP (the flip, NPC_DAY): the switch-off model first (it ships on; the afterEach puts it back)
    const dock = roadMixes().find((m) => m.labels.length === 1 && m.labels[0] === "dock PLATING")!;
    expect(dock).toBeDefined();
    const cost = roadOptions().get("dock")!.find((o) => o.label === "PLATING")!.pay;
    expect(cost).toBeGreaterThan(0);
    expect(roadCapFor(1, dock)).toBe(-cost); // NPC_DAY off: the day's one road stop, paid from the purse, as before
    setNpcDay(true);
    expect(roadCapFor(1, dock)).toBe(0); // a fight, then the event: the win's gold pays the PLATING (was -cost)
    expect(explainRoadCap(1, dock)).toEqual([{ day: 1, pick: "easy/medium (or a lost fight), then event dock: PLATING", value: 0 }]);
    setNpcDay(false);
    expect(roadCapFor(1, dock)).toBe(-cost); // the memo keys keep the switch apart
  });

  it("the memo keys carry HULL_SCALE: a value computed with it off is never reused with it on, nor back (NPC_DAY off and on)", () => {
    const read = () => Array.from({ length: 10 }, (_, i) => [gmax(i + 2), roadCap(i + 1)]);
    setHullScale(false); // AZ-BUMP (the flip, HULL_SCALE): each pass reads the switch-off values first (it ships on)
    for (const nd of [false, true]) {
      setNpcDay(nd);
      resetRoadCapMemo();
      const off = read();
      setHullScale(true);
      const on = read(); // read after the switch-off values were kept
      resetRoadCapMemo();
      expect(read(), `NPC_DAY ${nd}: HULL_SCALE on`).toEqual(on);
      setHullScale(false);
      const back = read(); // read after the switch-on values were kept
      resetRoadCapMemo();
      expect(read(), `NPC_DAY ${nd}: HULL_SCALE off again`).toEqual(back);
      expect(back).toEqual(off);
      console.log(`HULL1C-MEMO NPC_DAY ${nd}: [gmax(d + 1), roadCap(d)] d1-10 off ${JSON.stringify(off)} on ${JSON.stringify(on)}`);
    }
  });
});
