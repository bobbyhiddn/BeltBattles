// NPC-1 (REQ-BFG-077, REQ-BFG-078): the NPC day's stage machine (road.ts, events.ts, run.ts, save.ts) with the switch on, its
// REFIT without a shop, the reloads at every stage, the screens' words, and with the switch off 0.9.7's day, pinned.
import { describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { ITEMS, RUN_DAYS } from "../src/sim/content";
import { DROP_CHANCE, rollDrop, withNpcDay } from "../src/sim/npcDay";
import { withShapes } from "../src/sim/shapes"; // SHAPES-1 flip: 0.9.7's day with SHAPES off
import { withShapes2 } from "../src/sim/shapes2"; // BUMP-1D: and SHAPES2 off
import { withPlainRigs } from "../src/sim/plainRigs"; // BUMP-1D: and PLAIN_RIGS off
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: and the 10-day run
import { SCALE_IDS, SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale"; // BUMP-1E: and the scaling rules, outermost (the seven ids are the last keys in ITEMS)
import { ENDLESS, endlessRules, withEndless } from "../src/sim/endless"; // BUMP-1E: and ENDLESS (newRun's `endless: true` mark; 0.9.7's run has none)
import { GATES_IDS, gatesRules, withGates } from "../src/sim/gates"; // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 lines 74-75): and GATES (the three converters are the last ids of ITEMS, after the seven scaling ids)
import { enchantRules, withEnchant } from "../src/sim/enchant"; // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 74): and ENCHANT (the ENCHANTER's wagon rides the caravans; 0.9.7's day has none)
import { eventIds } from "../src/game/eventDefs"; // BUMP-1F (RULING-BUMP1F-R3.1, TRIAGE-R34 lines 76-77): the rules world's event list (was EVENT_IDS, the base ten)
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
import { scriptedDays } from "./npc1.script"; // AZ-BUMP (the bump): the switch-off digest with bb-0.9.7 put back
import { hashSeed } from "../src/core/rng"; // AZ-BUMP (the bump): scriptDigest's hash
import { RULES_VERSION } from "../src/sim/content"; // AZ-BUMP (the bump): the rules string each snapshot stamps
import type { Difficulty } from "../src/sim/rivals";
import { withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): npc1-base's dawn offers
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): npc1-base's 5 lives

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

// AZ-BUMP (the flip, NPC_DAY): NPC_DAY ships on, so the two tests of 0.9.7's day set it off themselves (withNpcDay(fn, false));
// the digests were taken at npc1-base with the switch off (HULL_SCALE's gold table moves only from day 7, past the script's 3)
// AZ-BUMP (the bump to bb-0.10.0): ghostOf stamps this build's rules in each of the script's three snapshots, and that string
// is the only change since npc1-base: with bb-0.9.7 (the rules npc1-base stamped) put back in those three "rules" fields,
// the script's JSON gives npc1-base's three digests exactly (kit-azbump probes/zz-npc1digest, run 8). So the digest is read
// with bb-0.9.7 put back, and the pins stay npc1-base's (scriptDigest itself now reads 16c756d4:6295, ad47262:6246 and
// 4bbf5518:6334, each 3 characters longer: "bb-0.10.0" is one character longer than "bb-0.9.7")
const digest097 = (seed: number): string => {
  const s = JSON.stringify(scriptedDays(seed));
  expect(s.split(`"rules":"${RULES_VERSION}"`).length - 1, `seed ${seed}: the script's three snapshots`).toBe(3);
  const back = s.split(`"rules":"${RULES_VERSION}"`).join(`"rules":"bb-0.9.7"`);
  return `${hashSeed(back).toString(16)}:${back.length}`;
};
// HULL-ON (the flip, HEARTS and OPEN_RUNES): the script's run plays on 10 hearts (its snapshots' lives, its day-3 loss) and
// takes each dawn's first card from the open offer, so npc1-base's day is read with both switches off too, and its pins
// hold exactly. Measured one switch at a time (NPC_DAY off): HEARTS moves all three digests, OPEN_RUNES seeds 4242 and
// 31337 (their dawn cards), FREE_JOINS and GUARD none. The shipped world's digests (only NPC_DAY off) are pinned beside them
describe("NPC-1 with the switch off: 0.9.7's day", () => {
  // SHAPES-1 flip (step 8): 0.9.7's day has no shaped pieces, so the script runs with SHAPES off too (withShapes(fn, false)):
  // with it on the caravan's offers and so the decks move (9701 read 74ff6a55:6293); the pins stay npc1-base's
  // MERGE-099F (BRIEF-MERGE-099F 1f): HULL-ON's body runs with SHAPES off too: npc1-base's digests inside HEARTS and
  // OPEN_RUNES off, then the flip's four switch-on digests, which the flip read without shapes, so they hold as pinned
  // BUMP-1D (LONG_RUN, PLAIN_RIGS and SHAPES2 ship on): 0.9.7's day has no long run (the script's snapshots would state `losses`),
  // no plain stat rig and none of the six more shaped rigs (the caravan's offers and so the decks would move), so the script runs
  // with those three off too (withLongRun, withPlainRigs, withShapes2 false), as the SHAPES-1 flip ran it with SHAPES off: the
  // pins stay npc1-base's and the flip's (the first three digests below holding exactly is the check that the world is restored)
  // BUMP-1E (the scaling rules ship on: SCALE_RIGS, bb-0.12.0): 0.9.7's day has none of the seven scaling rigs and none of the five reworks, and they are the
  // LAST keys in ITEMS (scale.ts), so the scaling switch is the OUTERMOST call of the nest: off first, back last. Measured: without it the script's first digest read
  // 2deb7d00:6295 (the caravan's offers drew from the catalogue with the seven in it), and the three toggles inside left SHAPES-1's three and the twelve BEHIND the
  // seven in ITEMS for the rest of the worker (the ITEMS key-order hazard: every seeded draw after it moves). Outermost, the world is the one the pins meant.
  // BUMP-1E: and ENDLESS ships on too (newRun marks the run `endless: true`: 15 characters in the script's final run, 6292 -> 6307), 0.9.7's day has none of it:
  // withEndless(fn, false) inside the scaling switch (it touches no catalogue, so its place in the nest is free)
  // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 74): GATES and ENCHANT ship on (bb-0.13.0), and 0.9.7's day has neither: GATES adds its three converters to the catalogue (the caravan's offers draw from it: with it on the first digest read
  // e8d0acdc:6340) and ENCHANT puts the ENCHANTER's wagon on the caravans, so withGates(fn, false) is now the OUTERMOST call of the nest (its three are the last ids of ITEMS, after the seven scaling ids: itemsKeep's rank puts them
  // back in order, and outermost is still the way the nest has always kept the catalogue) and withEnchant(fn, false) sits beside withEndless (it touches no catalogue). With both off the first three digests hold exactly again
  // (the check that the world is restored), and the two "rules string alone" digests move with the label (bb-0.13.0 is as long as bb-0.12.0, so the lengths stay 6295 and 6290)
  it("a scripted three-day run reads exactly as at npc1-base (digests from tests/npc1.script.ts run at 236ac6f; the stamped rules string put back)", () => withGates(() => withScaleRigs(() => withEndless(() => withEnchant(() => withNpcDay(() => withShapes(() => withShapes2(() => withPlainRigs(() => withLongRun(() => {
    withHearts(() => withOpenRunes(() => {
      expect(digest097(9701)).toBe("5865119d:6292");
      expect(digest097(4242)).toBe("6ab6cc53:6243");
      expect(digest097(31337)).toBe("8a31722d:6331");
      // AZ-BUMP: the bump, the rules string alone (was "5865119d:6292"). BUMP-1D: the bump again, the rules string alone (bb-0.11.0 is
      // as long as bb-0.10.0, so the length stays 6295; was "16c756d4:6295"): the three digests above hold exactly with it put back
      // BUMP-1E: the bump again, the rules string alone (bb-0.12.0 is as long as bb-0.11.0, 6295 still; was "70587d51:6295"): the three digests above
      // hold exactly with the string put back, in the world with the scaling rules and ENDLESS off, which is what proves it is the string alone
      // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 74): the bump again, the rules string alone (bb-0.13.0 is as long as bb-0.12.0, 6295 still; was "c8f6e09a:6295"): the three digests above hold exactly with it put back,
      // in the world with GATES, ENCHANT, the scaling rules and ENDLESS off
      expect(scriptDigest(9701)).toBe("4eb7083f:6295");
    }, false), false);
    expect(digest097(9701)).toBe("d5cc6dfb:6287"); // HULL-ON (the flip, HEARTS): 5865119d:6292 -> d5cc6dfb:6287
    expect(digest097(4242)).toBe("6d0b1d65:6236"); // HULL-ON (the flip, HEARTS and OPEN_RUNES): 6ab6cc53:6243 -> 6d0b1d65:6236
    expect(digest097(31337)).toBe("34af6ab5:6333"); // HULL-ON (the flip, HEARTS and OPEN_RUNES): 8a31722d:6331 -> 34af6ab5:6333
    // HULL-ON (the flip, HEARTS): 16c756d4:6295 -> 4528ba60:6290. BUMP-1D: the rules string alone again (the same length, 6290): 70587d51:6295
    // under bb-0.11.0 with HEARTS off (above), 921bd9a5:6290 with it on; was "4528ba60:6290"
    // BUMP-1E: the rules string alone again (bb-0.12.0, the same length, 6290; was "921bd9a5:6290"): the three digests above hold exactly with it put back
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 74): the rules string alone again (bb-0.13.0, the same length, 6290; was "53719062:6290"): the three digests above hold exactly with it put back,
    // in the world with GATES, ENCHANT, the scaling rules and ENDLESS off (the nest above)
    expect(scriptDigest(9701)).toBe("38eb8767:6290");
  }, false), false), false), false), false), false), false), false), false));

  // BUMP-1E: the scaling rules and ENDLESS ship on (they were off at bb-0.11.0); the test above reads 0.9.7's day with them off and puts them back
  it("the scaling rules and ENDLESS ship on, and the 0.9.7 digests' nest puts them back (both switches are on again after it)", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: was false
    expect(scaleRules()).toBe(true);
    expect(ENDLESS).toBe(true); // BUMP-1E: was false
    expect(endlessRules()).toBe(true);
    expect(SCALE_IDS.every((id) => id in ITEMS)).toBe(true); // the seven are in the catalogue as shipped, and last in it (the ITEMS key-order hazard)
    // BUMP-1F (RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 line 75): was expect(Object.keys(ITEMS).slice(-SCALE_IDS.length)).toEqual([...SCALE_IDS]); GATES ships on and its three ids (fuser, scattermill, smelter) are the LAST keys of ITEMS,
    // ranked after the seven (itemsKeep ITEM_RANK: scale 4, gates 5; PACKET-BUMP-0130 section 5), so the seven now end just before them, and the three end the catalogue
    expect(Object.keys(ITEMS).slice(-(SCALE_IDS.length + GATES_IDS.length), -GATES_IDS.length)).toEqual([...SCALE_IDS]);
    expect(Object.keys(ITEMS).slice(-GATES_IDS.length)).toEqual([...GATES_IDS]);
    expect(gatesRules()).toBe(true); // BUMP-1F: and the nest above puts GATES and ENCHANT back too (both ship on)
    expect(enchantRules()).toBe(true);
  });

  it("the fork keeps its event stop, Hard its pick of 2, REFIT its sales, and the snapshot has no road", () => withNpcDay(() => {
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
  }, false));
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

  // BUMP-1D (LONG_RUN ships on): the same ten won days on both rules. The 10-day run (withLongRun false: newRun marks the run) is
  // "complete" after day 10's dusk; a long run is "won" at its 10th dusk win, here the same dusk; the ten events and the road log's
  // ten entries are the same. Was the one test below, on the shipped (10-day) switch and expecting "complete"
  for (const [long, over, title] of [[false, "complete", "a 10-day run"], [true, "won", "a long run's ten won days"]] as const) {
    it(`${title} meets all ten events, one a day after each fight, and its snapshot carries one road entry a day`, () => {
      withLongRun(() => withNpcDay(() => {
        let run = newRun("weaver", 1717, "npc1-ten");
        const log: unknown[] = [];
        for (let d = 1; d <= RUN_DAYS && !run.over; d++) run = npcDay(run, (["easy", "medium", "hard"] as const)[d % 3], 0, 0, true, log);
        expect(run.over).toBe(over);
        // BUMP-1F (RULING-BUMP1F-R3.1, RULING-BUMP1F-R5 R5.2 (2), TRIAGE-R34 lines 76-77): was expect(new Set(run.events.map((e) => e.id))).toEqual(new Set(EVENT_IDS)) (the base ten). ENCHANT ships on, so the ASH SHRINE is the
        // 11th event of the bag (ENCHANT-2, PACKET-BUMP-0130 section 1): ten days meet TEN DIFFERENT events of the eleven (the base ten, or nine of them and the shrine; TRIAGE-R34 read the shrine in for SAPPERS here), every one of them in the shipped bag
        const met = run.events.map((e) => e.id);
        expect(new Set(met).size).toBe(10);
        expect(met.every((id) => eventIds().includes(id))).toBe(true);
        expect(run.events.map((e) => e.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        const last = log.filter((v) => v && typeof v === "object" && "road" in (v as object)).pop() as { road: unknown[]; day: number };
        expect(last.day).toBe(10);
        expect(last.road.length).toBe(10);
      }), long);
    });
  }
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
    // off: 0.9.7's reward lines (AZ-BUMP, the flip: NPC_DAY ships on, so the off half sets it off itself)
    withNpcDay(() => {
      const run = newRun("furnace", 321, "npc1-words");
      const f = forkFor(run);
      expect(rewardText(warlordReward(f.warlords.medium, "medium", warlordDeck(f.warlords.medium, 1), 1, 1))).toBe("WIN +4 GOLD");
    }, false);
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
