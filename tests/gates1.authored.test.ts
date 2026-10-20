// GATES-1 (REQ-BFG-052; BRIEF-GATES1 G6): captains and warlords get no gate, and every authored deck stays legal with GATES on.
// Every rival plan (rivals.ts RIVAL_IDS: the Easy, Medium and Hard captains, the warlords, the Iron Matriarch) on every day 1-10, at
// every luck tier and both fighting moments (the road warlord deck, the dusk stand-in deck), built with the switch off and with it on:
// the two builds are the same deck (a plan names no gate, and the switch moves no other part of it), none holds a piece of kind
// converter, and each passes the legality replay (tests/rivals.legality.ts: the build screen's own checks, rebuilt from empty) with
// the switch on, as it does with it off. Where a gate WOULD suit one is a read, not a rule: O/captains-gates.md (BRIEF G6).
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { GATES, setGates, withGates } from "../src/sim/gates";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalLoadout, standInBuild } from "../src/sim/rivals";
import { LUCKS } from "../src/sim/rivalBuilds";
import { legalityProblems } from "./rivals.legality";

afterEach(() => setGates(GATES));

const DAYS = Array.from({ length: 10 }, (_, i) => i + 1);
const hasConverter = (b: { items: { def: string }[] }): boolean => b.items.some((p) => ITEMS[p.def]?.kind === "converter");

describe("GATES-1 G6: captains and warlords get no gate; every authored deck stays legal with GATES on", () => {
  for (const id of RIVAL_IDS) {
    it(`${id}: the road deck and the dusk deck, on every day, at every luck tier: the same deck with the switch on, no converter, legal`, () => {
      for (const day of DAYS) {
        // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was `const road = rivalBuild(id, day), dusk = standInBuild(id, day);` bare, the
        // shipped world being GATES off; the switch-off build is now made under withGates(fn, false) and the switch-on build is the shipped state.
        const [road, dusk] = withGates(() => [rivalBuild(id, day), standInBuild(id, day)], false);
        const [roadOn, duskOn] = withGates(() => {
          expect(GATES).toBe(true); // BUMP-1F: was toBe(false); the shipped value is now ON (GATES = true, bb-0.13.0); withGates sets the live state for its call only
          return [rivalBuild(id, day), standInBuild(id, day)];
        });
        expect(JSON.stringify(roadOn), `${id} day ${day}: the road deck`).toBe(JSON.stringify(road));
        expect(JSON.stringify(duskOn), `${id} day ${day}: the dusk deck`).toBe(JSON.stringify(dusk));
        expect(hasConverter(roadOn) || hasConverter(duskOn), `${id} day ${day}`).toBe(false);
        withGates(() => {
          expect(legalityProblems(roadOn), `${id} day ${day}: road deck, GATES on`).toEqual([]);
          expect(legalityProblems(duskOn), `${id} day ${day}: dusk deck, GATES on`).toEqual([]);
        });
        for (const luck of LUCKS) for (const moment of ["warlord", "dusk"] as const) {
          const b = rivalLoadout(id, day, luck, moment).build;
          expect(hasConverter(b), `${id} day ${day} ${luck} ${moment}`).toBe(false);
          // the verdict of the legality replay is the same in both switch states, whatever it is (off first)
          // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), cause: GATES default): was `const off = legalityProblems(b);` bare ("the shipped state" was off); now off is made explicitly
          const off = withGates(() => legalityProblems(b), false);
          expect(withGates(() => legalityProblems(b)), `${id} day ${day} ${luck} ${moment}: the same verdict with GATES on`).toEqual(off);
        }
      }
    });
  }

  it("every rival has a hero the deck is built for (the read in O/captains-gates.md is per hero)", () => {
    expect(RIVAL_IDS.length).toBeGreaterThan(10);
    for (const id of RIVAL_IDS) expect(RIVALS[id].hero, id).toBeTruthy();
  });
});
