// HULL-1c (REQ-BFG-078; REVIEW-HULL1B N4): the Matriarch's part is legendary on every deck she can fight with. The client
// puts her part in cargo at ★1 (road.ts finishWarlord's legendary branch); the server values a road log's drop at
// npcDay.ts dropStarsOf, which gives ★1 only because dropClass is null for a legendary def. If her topParts(deck, 1)[0]
// were ever not legendary, the server would count it at Hard's DROP_STARS while the client gave ★1. Checked on every day
// MATRIARCH_DAY..RUN_DAYS, sabotaged and not, under every switch (NPC_DAY, HULL_SCALE, LADDER_FIX: each through its own
// setter, all put back after each test).
import { afterEach, describe, expect, it } from "vitest";
import { ITEMS, RUN_DAYS } from "../src/sim/content";
import { dropClass, dropStarsOf, roadLog, setNpcDay } from "../src/sim/npcDay";
import { setHullScale } from "../src/sim/hullScale";
import { setLadderFix } from "../src/sim/ladderFix";
import { MATRIARCH_DAY, rivalDays } from "../src/sim/rivals";
import {
  finishWarlord, leaveCaravan, pickRoad, topParts, warlordDeck, warlordDeckDay, warlordDrop, warlordDropTable, warlordReward,
} from "../src/game/road";
import { newRun, type Run } from "../src/game/run";

afterEach(() => { // the shipped values (AZ-BUMP's flip; were false); both tests set every switch themselves (set)
  setNpcDay(true);
  setHullScale(true);
  setLadderFix(true);
});

const ON_OFF = [false, true] as const;
/** Every switch setting: NPC_DAY x HULL_SCALE x LADDER_FIX. */
const SETTINGS = ON_OFF.flatMap((nd) => ON_OFF.flatMap((hs) => ON_OFF.map((lf) => ({ nd, hs, lf }))));
const set = (s: { nd: boolean; hs: boolean; lf: boolean }): void => {
  setNpcDay(s.nd);
  setHullScale(s.hs);
  setLadderFix(s.lf);
};
/** Every copy of `def` a run holds (cargo, deck items, gear), with its stars. */
const copies = (run: Run, def: string): number[] => [...run.inventory, ...run.build.items, ...run.build.mods].filter((p) => p.def === def).map((p) => p.stars ?? 1);

describe("HULL-1c: the Matriarch's part is legendary on every deck she fights with (REVIEW-HULL1B N4)", () => {
  it("days MATRIARCH_DAY..RUN_DAYS, sabotaged and not, every switch: topParts(deck, 1)[0] is legendary, so dropStarsOf counts it at ★1", () => {
    expect(rivalDays("matriarch")).toEqual(Array.from({ length: RUN_DAYS - MATRIARCH_DAY + 1 }, (_, i) => MATRIARCH_DAY + i));
    let n = 0;
    for (const s of SETTINGS) {
      set(s);
      for (let day = MATRIARCH_DAY; day <= RUN_DAYS; day++) {
        for (const sabotaged of ON_OFF) {
          const at = `NPC_DAY ${s.nd}, HULL_SCALE ${s.hs}, LADDER_FIX ${s.lf}, day ${day}${sabotaged ? ", sabotaged" : ""}`;
          const deck = warlordDeck("matriarch", day, sabotaged);
          const part = topParts(deck, 1)[0];
          expect(part, at).toBeDefined();
          expect(ITEMS[part].rarity, `${at}: ${part}`).toBe("legendary");
          // the server: no drop class, so the road log's drop counts at ★1 (never Hard's DROP_STARS)
          expect(dropClass(part), at).toBeNull();
          expect(dropStarsOf({ tier: "hard", drop: part }), at).toBe(1);
          // the client: her reward, her drop table and her drop are that part
          const r = warlordReward("matriarch", "hard", deck, warlordDeckDay("matriarch", day, sabotaged), day);
          expect([r.parts, r.legendary], at).toEqual([[part], true]);
          expect(warlordDropTable("matriarch", "hard", deck).lines.map((l) => [l.def, l.cls]), at).toEqual([[part, "legendary"]]);
          expect(warlordDrop(day, day, "matriarch", "hard", deck), at).toBe(part);
          n++;
        }
      }
    }
    expect(n).toBe(SETTINGS.length * (RUN_DAYS - MATRIARCH_DAY + 1) * 2);
  });

  it("through the game: a won Matriarch fight puts her part in cargo at ★1, and its road entry's star (dropStarsOf) is ★1, sabotaged and not", () => {
    for (const s of SETTINGS.filter((x) => x.nd)) { // the road log is NPC_DAY's
      set(s);
      for (let day = MATRIARCH_DAY; day <= RUN_DAYS; day++) {
        for (const sabotaged of ON_OFF) {
          const at = `HULL_SCALE ${s.hs}, LADDER_FIX ${s.lf}, day ${day}${sabotaged ? ", sabotaged" : ""}`;
          const run = newRun("furnace", 77, "hull1c-matriarch");
          run.day = day;
          if (sabotaged) run.sabotage = { day: day - 1 };
          expect(leaveCaravan(run), at).toBe("fork");
          expect(pickRoad(run, "hard").ok, at).toBe(true);
          const w = run.warlord!;
          expect([w.id, w.sabotaged], at).toEqual(["matriarch", sabotaged]);
          const part = topParts(warlordDeck("matriarch", day, sabotaged), 1)[0];
          expect(finishWarlord(run, 0, 20)!.took, at).toBe(part);
          expect(copies(run, part), at).toEqual([1]);
          const e = roadLog(run.warlords).at(-1)!;
          expect([e.tier, e.drop, dropStarsOf(e)], at).toEqual(["hard", part, 1]);
        }
      }
    }
  });
});
