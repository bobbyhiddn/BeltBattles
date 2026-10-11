// 0.6.2 TUNE-M, RULE EASY PAY (ROADMAP 0.6.2): the Easy warlord pays +3 gold from day 4; days 1-3 keep +2. Medium (+4),
// Hard (+3 and a part) and the Iron Matriarch (+5 and her legendary part) are unchanged. The fork's warlord card shows
// the day's pay, and a SABOTAGE that swaps the warlord's deck for the day before doesn't change it (the run's day pays).
import { describe, expect, it } from "vitest";
import {
  EASY_PAY_FROM, EASY_PAY_LATE, MATRIARCH_GOLD, REWARD_GOLD, finishWarlord, forkFor, pickRoad, rewardGold, warlordDeck,
  warlordDeckDay, warlordReward,
} from "../src/game/road";
import { newRun, rollShop, type Run } from "../src/game/run";
import { rewardText } from "../src/screens/fork/cards";
import { rivalBuild } from "../src/sim/rivals";
import { withNpcDay } from "../src/sim/npcDay"; // AZ-BUMP (the flip): 0.9.7's reward line, NPC_DAY off

function atDay(seed: number, day: number): Run {
  const run = newRun(seed % 2 ? "weaver" : "furnace", seed);
  run.day = day;
  rollShop(run);
  return run;
}

describe("RULE EASY PAY", () => {
  it("Easy pays +2 on days 1-3 and +3 from day 4; Medium and Hard as before", () => {
    expect([EASY_PAY_FROM, EASY_PAY_LATE]).toEqual([4, 3]);
    expect(REWARD_GOLD).toEqual({ easy: 2, medium: 4, hard: 3 });
    const days = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(days.map((d) => rewardGold("easy", d))).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3, 3]);
    expect(days.map((d) => rewardGold("medium", d))).toEqual(days.map(() => 4));
    expect(days.map((d) => rewardGold("hard", d))).toEqual(days.map(() => 3));
  });

  it("an Easy win pays the day's amount into the run's gold, and the card says it", () => {
    for (const seed of [11, 7930, 15849, 23768]) {
      for (const day of [3, 4, 9]) {
        const run = atDay(seed, day);
        expect(pickRoad(run, "easy").ok).toBe(true);
        const pay = day >= 4 ? 3 : 2;
        expect(run.warlord!.reward.gold).toBe(pay);
        // AZ-BUMP (the flip, NPC_DAY): `WIN +${pay} GOLD` -> `WIN +${pay}G · DROP 60%`: with NPC_DAY on every win rolls a drop and
        // the reward line says its chance (NPC-1, REQ-BFG-078; Easy's 60%); the gold is the same. Off: 0.9.7's line, below
        expect(rewardText(run.warlord!.reward)).toBe(`WIN +${pay}G · DROP 60%`); // the fork card's and the HUD's reward line
        expect(withNpcDay(() => rewardText(warlordReward(run.warlord!.id, "easy", run.warlord!.build, day, day)), false)).toBe(`WIN +${pay} GOLD`);
        const g0 = run.gold;
        expect(finishWarlord(run, 0, 30)!.gold).toBe(pay);
        expect(run.gold - g0).toBe(pay);
      }
    }
  });

  it("the card's reward is the run's day, also under SABOTAGE (the deck of the day before)", () => {
    const run = atDay(11, 4);
    const id = forkFor(run).warlords.easy;
    const sabotaged = warlordReward(id, "easy", warlordDeck(id, 4, true), warlordDeckDay(id, 4, true), 4);
    expect(sabotaged.gold).toBe(3);
    run.sabotage = { day: 3 } as unknown as Run["sabotage"];
    expect(pickRoad(run, "easy").ok).toBe(true);
    expect(run.warlord!.sabotaged).toBe(true);
    expect(run.warlord!.reward.gold).toBe(3);
    // callers without a run day read the deck's day, as before
    expect(warlordReward("sootjaw", "easy", rivalBuild("sootjaw", 3), 3).gold).toBe(2);
    expect(warlordReward("matriarch", "hard", rivalBuild("matriarch", 8), 8, 8).gold).toBe(MATRIARCH_GOLD);
  });
});
