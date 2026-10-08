// NPC-1 (REQ-BFG-077, REQ-BFG-078): the NPC day's stage machine (road.ts, events.ts, run.ts, save.ts) with the switch on, its
// REFIT without a shop, the reloads at every stage, the screens' words, and with the switch off 0.9.7's day, pinned.
import { describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { ITEMS, RUN_DAYS } from "../src/sim/content";
import { DROP_CHANCE, rollDrop, withNpcDay } from "../src/sim/npcDay";
import { EVENT_IDS } from "../src/game/eventDefs";
import { choicesFor, eventFor, makeEvent, pickChoice } from "../src/game/events";
import { finishDay, ghostOf } from "../src/game/day";
import {
  EVENT_AFTER_FIGHT, ROAD_PICKS, finishWarlord, forkFor, forkPicks, leaveCaravan, onToTheRoad, pickPending, pickRoad, takePart,
  todaysWarlord, warlordDropTable, warlordReward, warlordDeck, warlordSeed,
} from "../src/game/road";
import {
  REFIT_NO_SHOP, battleSeed, buyOffer, buyPack, buyUpgrade, newRun, pendingRune, reroll, sellInstalled, sellInventory, shopShut,
  storePlaced, takeRune, type Run,
} from "../src/game/run";
import { migrateRun } from "../src/game/save";
import { rewardText } from "../src/screens/fork/cards";
import { NO_DROP, dropCardText, dropLine, dropListText } from "../src/screens/fork/drops";
import { afterTheFight } from "../src/screens/fork/fork";
import { ON_TO_THE_ROAD } from "../src/screens/warlordHud";
import { REFIT_LABEL } from "../src/screens/event/event";
import { itemName } from "../src/screens/event/cards";
import { EVENTS } from "../src/game/eventDefs";
import { scriptDigest } from "./npc1.script";
import type { Difficulty } from "../src/sim/rivals";

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
const reload = (run: Run): Run => migrateRun(JSON.parse(JSON.stringify(run)))!;
const dawn = (run: Run) => {
  const o = pendingRune(run);
  if (o) expect(takeRune(run, o.ids[0]).ok).toBe(true);
};

/** One NPC day (switch on) through the rules, as the screens drive it: fork, fight, ON TO THE ROAD, the event's first open
 *  choice, REFIT, dusk. `re`: save and load after every step (a reload at every stage). Returns the run (maybe reloaded). */
function npcDay(run0: Run, tier: Difficulty, won: 0 | 1 | -1, dusk: 0 | 1 | -1, re: boolean, log: unknown[]): Run {
  let run = run0;
  const r = () => { if (re) run = reload(run); };
  dawn(run);
  r();
  log.push(leaveCaravan(run), run.stage);
  r();
  log.push(pickRoad(run, tier), run.stage);
  r();
  log.push(leaveCaravan(run), run.stage); // mid-fight (a reload replays the stored fight)
  r();
  log.push(finishWarlord(run, won, 20), run.stage);
  r();
  log.push(onToTheRoad(run), run.stage); // the result's ON TO THE ROAD
  r();
  const i = choicesFor(run).findIndex((c) => !c.blocked);
  log.push(i, pickChoice(run, i).ok, run.event?.picked);
  r();
  log.push(onToTheRoad(run), run.stage); // the event's REFIT (the choice is made: REFIT)
  r();
  log.push(shopShut(run), leaveCaravan(run), run.stage); // REFIT's FIGHT: dusk
  r();
  log.push(ghostOf(run, 1000 * run.day, "p-npc1", null));
  log.push(finishDay(run, dusk, 30, { ...Z }, { ...Z }));
  return run;
}

describe("NPC-1 with the switch off: 0.9.7's day", () => {
  it("a scripted three-day run reads exactly as at npc1-base (digests from tests/npc1.script.ts run at 236ac6f)", () => {
    expect(scriptDigest(9701)).toBe("5865119d:6292");
    expect(scriptDigest(4242)).toBe("6ab6cc53:6243");
    expect(scriptDigest(31337)).toBe("8a31722d:6331");
  });

  it("the fork keeps its event stop, Hard its pick of 2, REFIT its sales, and the snapshot has no road", () => {
    expect([...forkPicks()]).toEqual([...ROAD_PICKS]);
    const run = newRun("weaver", 555, "npc1-off");
    dawn(run);
    leaveCaravan(run);
    expect(pickRoad(run, "hard").ok).toBe(true);
    expect(run.warlord!.reward.chance).toBeUndefined();
    finishWarlord(run, 0, 20);
    expect(pickPending(run.warlord)).toBe(true);
    expect(takePart(run, 0)).not.toBeNull();
    run.stage = "refit";
    expect(shopShut(run)).toBe(false);
    const uid = run.inventory[0].uid;
    expect(sellInventory(run, uid)).toBeGreaterThan(0);
    expect(ghostOf(run, 1, "p", null).road).toBeUndefined();
    const before = JSON.stringify(run);
    expect(onToTheRoad(run)).toBeNull(); // off: no event after the fight, nothing changes
    expect(JSON.stringify(run)).toBe(before);
  });
});

describe("NPC-1 the day with the switch on (REQ-BFG-077)", () => {
  it("the fork has no event pick: pickRoad('event') is refused and changes nothing", () => {
    withNpcDay(() => {
      expect([...forkPicks()]).toEqual(["easy", "medium", "hard"]);
      const run = newRun("furnace", 77, "npc1-fork");
      dawn(run);
      expect(leaveCaravan(run)).toBe("fork");
      const before = JSON.stringify(run);
      expect(pickRoad(run, "event")).toEqual({ ok: false, reason: EVENT_AFTER_FIGHT });
      expect(JSON.stringify(run)).toBe(before);
      expect(pickRoad(run, "medium").ok).toBe(true);
      expect(run.warlord!.reward).toEqual({ gold: 4, parts: [], legendary: false, chance: DROP_CHANCE.medium });
    });
  });

  it("the order is fight, event, REFIT, dusk; a win rolls its drop once, to cargo, in the warlord log", () => {
    withNpcDay(() => {
      const run = newRun("furnace", 2024, "npc1-order");
      const log: unknown[] = [];
      const gold0 = run.gold;
      dawn(run);
      expect(leaveCaravan(run)).toBe("fork");
      expect(pickRoad(run, "hard").ok).toBe(true);
      expect(run.stage).toBe("warlord");
      expect(leaveCaravan(run)).toBe("warlord");
      const w = todaysWarlord(run)!;
      const want = rollDrop(run.seed, 1, "hard", w.build);
      const res = finishWarlord(run, 0, 20)!;
      expect(res.took).toBe(want);
      expect(res.parts).toEqual([]);
      expect(pickPending(run.warlord)).toBe(false);
      expect(takePart(run, 0)).toBeNull(); // no pick of 2 under the switch
      expect(run.warlords[0].part).toBe(want);
      if (want) expect(run.inventory.some((i) => i.def === want)).toBe(true);
      expect(finishWarlord(run, 0, 20)).toBe(res); // idempotent: no second roll, no second pay
      expect(run.gold).toBe(gold0 + w.reward.gold + (run.gold - gold0 - w.reward.gold));
      expect(onToTheRoad(run)).toBe("event");
      expect(run.stage).toBe("event");
      expect(run.event).toEqual(makeEvent(run.seed, 1, eventFor(run.seed, 1)));
      expect(leaveCaravan(run)).toBe("event"); // the caravan's FIGHT can't skip it either
      const i = choicesFor(run).findIndex((c) => !c.blocked);
      expect(pickChoice(run, i).ok).toBe(true);
      expect(onToTheRoad(run)).toBe("refit");
      expect(run.stage).toBe("refit");
      expect(leaveCaravan(run)).toBe("battle");
      expect(run.stage).toBe("battle");
      log.push(finishDay(run, 0, 30, { ...Z }, { ...Z }));
      expect(run.day).toBe(2);
      expect(run.stage).toBe("caravan");
    });
  });

  it("a loss pays nothing and drops nothing, and still goes on to the road (the event, then REFIT)", () => {
    withNpcDay(() => {
      const run = newRun("weaver", 31, "npc1-loss");
      dawn(run);
      leaveCaravan(run);
      pickRoad(run, "easy");
      const gold = run.gold, cargo = run.inventory.length;
      const res = finishWarlord(run, 1, 20)!;
      expect([res.outcome, res.gold, res.took]).toEqual(["loss", 0, null]);
      expect([run.gold, run.inventory.length]).toEqual([gold, cargo]);
      expect(onToTheRoad(run)).toBe("event");
    });
  });

  it("the battle, shop and event streams don't move: the drop has its own", () => {
    const on = withNpcDay(() => {
      const run = newRun("furnace", 4711, "npc1-streams");
      dawn(run);
      leaveCaravan(run);
      pickRoad(run, "medium");
      const shop = JSON.stringify(run.shop);
      finishWarlord(run, 0, 20);
      expect(JSON.stringify(run.shop)).toBe(shop);
      onToTheRoad(run);
      return { ws: warlordSeed(run), bs: battleSeed(run), ev: run.event, shop };
    });
    const run = newRun("furnace", 4711, "npc1-streams");
    dawn(run);
    expect(warlordSeed(run)).toBe(on.ws);
    expect(battleSeed(run)).toBe(on.bs);
    expect(makeEvent(run.seed, 1, eventFor(run.seed, 1))).toEqual(on.ev);
    expect(JSON.stringify(run.shop)).toBe(on.shop);
  });

  it("REFIT before dusk: moving and storing work; buying, selling, rerolling, packs and upgrades are refused", () => {
    withNpcDay(() => {
      const run = newRun("furnace", 99, "npc1-refit");
      dawn(run);
      leaveCaravan(run);
      pickRoad(run, "easy");
      finishWarlord(run, 0, 20);
      onToTheRoad(run);
      pickChoice(run, choicesFor(run).findIndex((c) => !c.blocked));
      expect(onToTheRoad(run)).toBe("refit");
      run.gold = 200;
      run.inventory.push({ uid: 9001, def: Object.keys(ITEMS).find((d) => ITEMS[d].kind === "mod")! });
      const before = JSON.stringify(run);
      expect(shopShut(run)).toBe(true);
      expect(buyOffer(run, 0, 0)).toEqual({ ok: false, reason: REFIT_NO_SHOP });
      expect(reroll(run)).toBe(false);
      expect(buyPack(run, "armor")).toMatchObject({ ok: false, reason: REFIT_NO_SHOP });
      expect(buyUpgrade(run, "factory")).toMatchObject({ ok: false, reason: REFIT_NO_SHOP });
      expect(sellInventory(run, 9001)).toBe(0);
      expect(sellInstalled(run, 0)).toBe(0);
      expect(JSON.stringify(run)).toBe(before); // nothing changed
      const rig = run.build.items.find((p) => ITEMS[p.def].kind === "gate");
      if (rig) expect(storePlaced(run, rig.uid)).toBe(true); // moving still works
      run.stage = "caravan";
      expect(shopShut(run)).toBe(false); // the next dawn's caravan sells again
    });
  });

  it("a reload at every stage (fork, mid-fight, result, event before and after the choice, REFIT, dusk) resumes in place", () => {
    withNpcDay(() => {
      for (const [seed, tiers] of [[808, ["hard", "easy", "medium"]], [1999, ["medium", "hard", "easy"]]] as const) {
        const a: unknown[] = [], b: unknown[] = [];
        let x = newRun("furnace", seed, "npc1-re"), y = newRun("furnace", seed, "npc1-re");
        tiers.forEach((t, d) => {
          x = npcDay(x, t, d % 2 ? 1 : 0, 0, false, a);
          y = npcDay(y, t, d % 2 ? 1 : 0, 0, true, b);
        });
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(JSON.stringify(y)).toBe(JSON.stringify(x));
        expect(x.warlords.length).toBe(3);
      }
    });
  });

  it("a 10-day run meets all ten events, one a day after each fight, and its snapshot carries one road entry a day", () => {
    withNpcDay(() => {
      let run = newRun("weaver", 1717, "npc1-ten");
      const log: unknown[] = [];
      for (let d = 1; d <= RUN_DAYS && !run.over; d++) run = npcDay(run, (["easy", "medium", "hard"] as const)[d % 3], 0, 0, true, log);
      expect(run.over).toBe("complete");
      expect(new Set(run.events.map((e) => e.id))).toEqual(new Set(EVENT_IDS));
      expect(run.events.map((e) => e.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      const last = log.filter((v) => v && typeof v === "object" && "road" in (v as object)).pop() as { road: unknown[]; day: number };
      expect(last.day).toBe(10);
      expect(last.road.length).toBe(10);
    });
  });
});

describe("NPC-1 the screens' words (REQ-BFG-077, REQ-BFG-078)", () => {
  it("the fork: AFTER THE FIGHT: <EVENT TITLE>; the reward line says the chance; the inspect panel the odds", () => {
    withNpcDay(() => {
      const run = newRun("furnace", 321, "npc1-words");
      const f = forkFor(run);
      expect(afterTheFight(f.event)).toBe(`AFTER THE FIGHT: ${EVENTS[f.event].title}`);
      const id = f.warlords.medium, deck = warlordDeck(id, 1);
      const rw = warlordReward(id, "medium", deck, 1, 1);
      expect(rewardText(rw)).toBe("WIN +4G · DROP 75%");
      expect(rewardText(rw, 10)).toBe("WIN +4G · DROP 75% +10 BOUNTY");
      const t = warlordDropTable(id, "medium", deck);
      expect(dropLine(t)).toBe("DROP 75%");
      const rows = dropListText(t);
      expect(rows.length).toBe(t.lines.length);
      for (const [i, l] of t.lines.entries()) expect(rows[i]).toMatch(new RegExp(`^${itemName(l.def).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} · [A-Z ]+ · (<1|\\d+)%$`));
    });
    // off: 0.9.7's reward lines
    const run = newRun("furnace", 321, "npc1-words");
    const f = forkFor(run);
    expect(rewardText(warlordReward(f.warlords.medium, "medium", warlordDeck(f.warlords.medium, 1), 1, 1))).toBe("WIN +4 GOLD");
  });

  it("the victory screen: the drop as a part card going to cargo, or NO DROP; one way on: ON TO THE ROAD; the event's REFIT", () => {
    const part = Object.keys(ITEMS).find((d) => ITEMS[d].kind === "gate" && ITEMS[d].rarity === "common")!;
    expect(dropCardText(part, false)).toEqual({ name: itemName(part), sub: "DROP · TO CARGO · ★1" });
    expect(dropCardText(null, false)).toBeNull();
    expect(NO_DROP).toBe("NO DROP");
    expect(ON_TO_THE_ROAD).toBe("ON TO THE ROAD");
    expect(REFIT_LABEL).toBe("REFIT");
  });
});
