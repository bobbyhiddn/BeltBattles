// 0.6.0c item 2 (decision 5): no dead stakes on the last day. HERALD's STAKE 3 (ELITE BOUNTY) and
// SAPPERS' HIRE (SABOTAGE) act only on a later warlord; on day 10 (run.day >= RUN_DAYS) none is
// left, so both are blocked with "NO WARLORD LEFT". Days 1-9 are unchanged.
import { describe, expect, it } from "vitest";
import { blockReason, choicesFor, EVENT_IDS, makeEvent, pickChoice } from "../src/game/events";
import { newRun, type Run } from "../src/game/run";
import { RUN_DAYS } from "../src/sim/content";
import type { EventId } from "../src/game/eventDefs";

function atEvent(id: EventId, day: number, seed = 4242): Run {
  const run = newRun("furnace", seed);
  run.day = day;
  run.gold = 20;
  run.lives = 3;
  run.road = { day, pick: "event" };
  run.event = makeEvent(run.seed, day, id);
  run.stage = "event";
  return run;
}

describe("no dead stakes on the last day (0.6.0c)", () => {
  it("HERALD's STAKE and SAPPERS' HIRE are blocked on day 10 with NO WARLORD LEFT", () => {
    expect(RUN_DAYS).toBe(10);
    for (const id of ["herald", "sappers"] as EventId[]) {
      const run = atEvent(id, RUN_DAYS);
      const cs = choicesFor(run);
      expect(cs[0].label).toBe(id === "herald" ? "STAKE 3" : "HIRE");
      expect(cs[0].blocked).toBe("NO WARLORD LEFT");
      expect(blockReason(run, cs[0])).toBe("NO WARLORD LEFT");
      expect(cs[1].blocked).toBeUndefined(); // DECLINE / MOVE ON stays open
      expect(pickChoice(run, 0)).toEqual({ ok: false, reason: "NO WARLORD LEFT" });
      expect(run.gold).toBe(20);
      expect(run.bounty ?? null).toBe(null);
      expect(run.sabotage ?? null).toBe(null);
      expect(pickChoice(run, 1).ok).toBe(true);
    }
  });

  it("days 1-9: STAKE and HIRE are open and pay as before", () => {
    for (let day = 1; day < RUN_DAYS; day++) {
      const h = atEvent("herald", day);
      expect(choicesFor(h)[0].blocked).toBeUndefined();
      expect(pickChoice(h, 0).ok).toBe(true);
      expect(h.gold).toBe(17);
      expect(h.bounty).toEqual({ day, stake: 3, pay: 10 });
      const s = atEvent("sappers", day);
      expect(choicesFor(s)[0].blocked).toBeUndefined();
      expect(pickChoice(s, 0).ok).toBe(true);
      expect(s.gold).toBe(16);
      expect(s.sabotage).toEqual({ day });
    }
  });

  it("gold still gates first on days 1-9; the day-10 block names the real reason", () => {
    const poor = atEvent("herald", 5);
    poor.gold = 1;
    expect(choicesFor(poor)[0].blocked).toBe("NEED 2 MORE GOLD");
    const last = atEvent("herald", RUN_DAYS);
    last.gold = 1;
    expect(choicesFor(last)[0].blocked).toBe("NO WARLORD LEFT");
  });

  it("no other event choice is ever blocked with NO WARLORD LEFT", () => {
    for (const id of EVENT_IDS) {
      if (id === "herald" || id === "sappers") continue;
      for (const day of [1, 9, RUN_DAYS]) {
        for (const c of choicesFor(atEvent(id, day))) expect(c.blocked).not.toBe("NO WARLORD LEFT");
      }
    }
  });
});
