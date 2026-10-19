import { describe, expect, it } from "vitest";
// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T3): THE ASH SHRINE, client side: the 11th road event under ENCHANT, its three cards, its gain, the bag
// it joins, the open pick it leaves behind and the road-cap model that must still accept every honest deck. With ENCHANT off nothing here moves:
// the bag, eventSequence and eventFor are byte for byte the ten-event game's (pinned below from the base commit 016347f, and by a copy of the old
// algorithm over many seeds).
import { Rng, hashSeed } from "../src/core/rng";
import { BAG_IDS, EVENTS, EVENT_IDS, WARLORD_EVENT_IDS, bagIds, eventIds, type EventId } from "../src/game/eventDefs";
import { choicesFor, eventFor, eventSequence, makeEvent, pickChoice } from "../src/game/events";
import { pendingEnchantPick, pieceAt, skipWarlordWord, takeWarlordWord, openWarlordPick, enchantChoices } from "../src/game/enchanter";
import { migrateRun, newRun, type Run } from "../src/game/run";
import { SHRINE_HULL, SHRINE_ID, SHRINE_NO_PART, shrineGive, shrineOffer } from "../src/game/shrine";
import { HEROES, RUN_DAYS, type HeroId } from "../src/sim/content";
import { ENCHANT_IDS, enchantRules, withEnchant } from "../src/sim/enchant";
import { shrineWords } from "../src/sim/enchantSources";
import { MODELLED_EVENTS, MODELLED_DELTAS, checkRoadModel, playerFits, resetRoadCapMemo, roadCap, roadMixesFor, roadOptions, bagsFor } from "../src/net/roadCap";
import { buildCost, offeredEvents } from "../src/net/validate";
import { startingBuild } from "../src/sim/ai";
import { withLongRun } from "../src/sim/longRun";

const OLD_IDS: EventId[] = ["wreck", "cache", "trader", "dice", "dock", "herald", "sappers", "scout", "storm", "smuggler"];
const HEROES4: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];

/** The pre-ENCHANT-2 eventSequence, copied word for word (events.ts at the base commit 016347f): the OFF world must equal it. */
function oldSequence(seed: number, n: number, long = false): EventId[] {
  const lastDayDud = (id: EventId): boolean => ["herald", "sappers"].includes(id);
  const keepDudsOffLastDay = (order: EventId[]): void => {
    const last = RUN_DAYS - 1;
    if (order.length <= last || !lastDayDud(order[last])) return;
    for (let j = last - 1; j >= 0; j--) {
      if (!lastDayDud(order[j])) {
        [order[j], order[last]] = [order[last], order[j]];
        return;
      }
    }
  };
  const out: EventId[] = [];
  const want = long ? n : Math.max(n, RUN_DAYS);
  for (let bag = 0; out.length < want; bag++) {
    const ids = new Rng(hashSeed(seed, "event-bag", bag)).shuffle([...OLD_IDS]);
    if (ids[0] === out[out.length - 1]) [ids[0], ids[1]] = [ids[1], ids[0]];
    const before = out.length;
    out.push(...ids);
    if (!long && before < RUN_DAYS && out.length >= RUN_DAYS) keepDudsOffLastDay(out);
  }
  return out.slice(0, n);
}

/** Literal sequences from the BASE commit 016347f (a throwaway export of it, eventSequence run there): 10 days, 12 days, and 25 days of a long run. */
const PINS: Record<string, string> = {
  "1:10": "smuggler,cache,storm,scout,wreck,sappers,dice,trader,herald,dock",
  "1:25L": "smuggler,cache,storm,scout,wreck,sappers,dice,trader,herald,dock,dice,storm,wreck,smuggler,cache,herald,trader,dock,scout,sappers,cache,dock,trader,smuggler,dice",
  "2:10": "herald,dice,smuggler,cache,trader,storm,scout,wreck,sappers,dock",
  "3:25L": "wreck,smuggler,scout,dice,trader,sappers,cache,dock,storm,herald,dice,scout,sappers,smuggler,herald,wreck,trader,dock,cache,storm,trader,dock,dice,scout,herald",
  "4242:10": "trader,dice,storm,sappers,dock,cache,herald,smuggler,scout,wreck",
  "644245094:25L": "dock,herald,scout,sappers,smuggler,storm,trader,wreck,cache,dice,wreck,herald,dice,smuggler,dock,cache,trader,sappers,scout,storm,scout,dock,wreck,smuggler,cache",
  "987654321:10": "storm,herald,scout,trader,smuggler,dock,sappers,dice,cache,wreck",
};

/** A run on the road before `day`'s dusk at the ASH SHRINE, with some gold and (optionally) a spare part in cargo. */
function atShrine(hero: HeroId = "furnace", seed = 4242, day = 6, cargo: string[] = ["whetstone"]): Run {
  const run = newRun(hero, seed);
  run.day = day;
  run.gold = 20;
  for (const def of cargo) run.inventory.push({ uid: run.nextUid++, def });
  run.event = makeEvent(seed, day, SHRINE_ID);
  run.stage = "event";
  return run;
}

describe("ENCHANT off: the ten-event game is untouched", () => {
  it("EVENT_IDS and BAG_IDS are the old ten, in the old order, and the rules world's lists are the same arrays", () => {
    expect(enchantRules()).toBe(false);
    expect(EVENT_IDS).toEqual(OLD_IDS);
    expect(BAG_IDS).toEqual(OLD_IDS);
    expect(eventIds()).toBe(EVENT_IDS);
    expect(bagIds()).toBe(BAG_IDS);
    expect(WARLORD_EVENT_IDS).toEqual(["herald", "sappers"]);
    expect(Object.keys(EVENTS)).toHaveLength(11); // the shrine's def exists (the screens draw it) but no list the game reads holds it
  });

  it("eventSequence and eventFor equal the base commit's, pinned literals and a copy of the old algorithm over 300 seeds and 5 lengths, long and not", () => {
    for (const [k, want] of Object.entries(PINS)) {
      const [seed, tail] = k.split(":");
      const long = tail.endsWith("L"), n = parseInt(tail, 10);
      expect(eventSequence(Number(seed), n, long).join(","), k).toBe(want);
    }
    for (let seed = 1; seed <= 300; seed++) {
      for (const n of [1, 9, 10, 11, 23]) {
        for (const long of [false, true]) expect(eventSequence(seed * 7919, n, long), `${seed} ${n} ${long}`).toEqual(oldSequence(seed * 7919, n, long));
      }
      for (const d of [1, 5, 10, 14]) expect(eventFor(seed, d)).toBe(oldSequence(seed, d)[d - 1]);
    }
  });

  it("no seed's first 30 days (long) holds the shrine, and the shrine card is not a modelled road option", () => {
    for (let seed = 1; seed <= 200; seed++) expect(eventSequence(seed, 30, true)).not.toContain(SHRINE_ID);
    expect(roadOptions().has(SHRINE_ID)).toBe(false);
    expect(roadMixesFor(1).some((m) => m.key.includes("shrine"))).toBe(false);
  });

  it("the gain does nothing off: no open word", () => {
    const run = atShrine();
    expect(pickChoice(run, 0).ok).toBe(true); // the card can be played by a tool; the word is simply not opened
    expect(run.enchShrine).toBeUndefined();
    expect(pendingEnchantPick(run)).toBeNull();
  });
});

describe("ENCHANT on: the bag holds the ASH SHRINE once", () => {
  it("bagIds and eventIds hold the ten and the shrine (eleven), the shrine last", () => {
    withEnchant(() => {
      expect(bagIds()).toEqual([...OLD_IDS, SHRINE_ID]);
      expect(eventIds()).toEqual([...OLD_IDS, SHRINE_ID]);
      expect(bagIds()).toHaveLength(11);
    });
    expect(bagIds()).toHaveLength(10); // and back to ten when the switch goes back
  });

  it("each bag of a long run holds every one of the eleven events exactly once, and never the same event two days running", () => {
    withEnchant(() => {
      for (let seed = 1; seed <= 150; seed++) {
        const seq = eventSequence(seed * 31, 66, true);
        for (let b = 0; b < 6; b++) expect([...seq.slice(b * 11, b * 11 + 11)].sort(), `${seed} bag ${b}`).toEqual([...bagIds()].sort());
        expect(seq.filter((e) => e === SHRINE_ID)).toHaveLength(6);
        for (let i = 1; i < seq.length; i++) expect(seq[i], `${seed} day ${i + 1}`).not.toBe(seq[i - 1]);
        expect(eventFor(seed * 31, 5, true)).toBe(seq[4]);
      }
    });
  });

  it("a 10-day run draws from the eleven, meets the shrine at most once, and day 10 is never HERALD or SAPPERS", () => {
    withEnchant(() => {
      let withShrine = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const seq = eventSequence(seed * 17, 10);
        expect(seq.filter((e) => e === SHRINE_ID).length).toBeLessThanOrEqual(1);
        withShrine += seq.includes(SHRINE_ID) ? 1 : 0;
        expect(WARLORD_EVENT_IDS).not.toContain(seq[9]);
      }
      expect(withShrine).toBeGreaterThan(300); // 10 of the bag's 11 slots: about 91% of seeds meet it in 10 days
    });
  });

  it("the sequences differ from the ten-event ones (the event days reshuffle, as the brief expects)", () => {
    const off = eventSequence(1, 10);
    const on = withEnchant(() => eventSequence(1, 10));
    expect(on).not.toEqual(off);
  });
});

describe("the shrine's words and cards", () => {
  it("two different words a day, from the shrine's own stream, each legal on some piece of every hero's start deck", () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (let day = 1; day <= 16; day += 3) {
        const [a, b] = shrineWords(seed, day);
        expect(a).not.toBe(b);
        expect(ENCHANT_IDS).toContain(a);
        expect(ENCHANT_IDS).toContain(b);
        expect(shrineOffer(seed, day)).toEqual([a, b]);
      }
    }
    withEnchant(() => {
      for (const hero of HEROES4) {
        const run = newRun(hero, 7);
        for (const word of ENCHANT_IDS) expect(enchantChoices(run, word).some((c) => c.reason === null), `${hero} ${word}`).toBe(true);
      }
    });
  });

  it("three cards: a word for max hull, a word for a cargo part named by pick, MOVE ON", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, ["whetstone", "temper"]);
      const [a, b] = shrineWords(4242, 6);
      const cs = choicesFor(run);
      expect(cs).toHaveLength(3);
      expect(cs[0].cost).toEqual([{ k: "hull", n: SHRINE_HULL }]);
      expect(cs[0].gain).toEqual([{ k: "ench", word: a }]);
      const give = shrineGive(run, run.event!.pick)!;
      expect(cs[1].cost).toEqual([{ k: "item", def: give.def, uid: give.uid, from: "cargo" }]);
      expect(cs[1].gain).toEqual([{ k: "ench", word: b }]);
      expect(cs[2]).toMatchObject({ label: "MOVE ON", cost: [], gain: [] });
      expect(cs.every((c) => !c.blocked)).toBe(true);
      expect(EVENTS.shrine.title).toBe("ASH SHRINE");
    });
  });

  it("the part is named by the event's pick (a reload names the same one) and differs with the pick; plain parts come first; turrets and free copies never", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, ["whetstone", "temper", "grease"]);
      const names = new Set<string>();
      for (let i = 0; i < 10; i++) names.add(shrineGive(run, (i + 0.5) / 10)!.def);
      expect(names.size).toBe(3);
      expect(shrineGive(run, 0.3)).toEqual(shrineGive(JSON.parse(JSON.stringify(run)) as Run, 0.3));
      // a part with a word is offered only when nothing plain is left
      run.inventory[0].ench = "fiery";
      for (let i = 0; i < 10; i++) expect(shrineGive(run, (i + 0.5) / 10)!.def).not.toBe("whetstone");
      run.inventory[1].ench = "rising";
      run.inventory[2].ench = "echoing";
      expect(shrineGive(run, 0.5)).toBeDefined();
      // a turret copy and a free copy are never the offering
      const run2 = atShrine("furnace", 4242, 6, []);
      run2.inventory.push({ uid: run2.nextUid++, def: "scrapcannon" }, { uid: run2.nextUid++, def: "kiln", free: true });
      expect(shrineGive(run2, 0.5)).toBeUndefined();
    });
  });

  it("with nothing to offer card 2 is blocked (NOTHING TO OFFER) and cannot be picked; card 1 and MOVE ON stay open", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, []);
      const cs = choicesFor(run);
      expect(cs[1].blocked).toBe(SHRINE_NO_PART);
      expect(cs[0].blocked).toBeUndefined();
      expect(pickChoice(run, 1)).toMatchObject({ ok: false, reason: SHRINE_NO_PART });
      expect(run.event!.picked).toBe(-1);
      expect(run.enchShrine).toBeUndefined();
    });
  });

  it("card 1 is HULL TOO WEAK on a hull that would fall under the floor", () => {
    withEnchant(() => {
      const run = atShrine();
      run.build.hullBonus = 1000 + 50 - HEROES[run.hero].hull;
      expect(choicesFor(run)[0].blocked).toBe("HULL TOO WEAK");
      expect(pickChoice(run, 0).ok).toBe(false);
    });
  });
});

describe("what a card does", () => {
  it("card 1 pays the hull and opens the word (a free pick of 1) for a part of your choice; APPLY puts it on and closes the pick", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, []);
      const [a] = shrineWords(4242, 6);
      const hull0 = run.build.hullBonus;
      const r = pickChoice(run, 0);
      expect(r.ok).toBe(true);
      expect(run.build.hullBonus).toBe(hull0 - SHRINE_HULL);
      expect(run.enchShrine).toEqual({ day: 6, word: a });
      const pk = pendingEnchantPick(run)!;
      expect(pk).toEqual({ day: 6, no: 3, words: [a] });
      const row = enchantChoices(run, a).find((c) => c.reason === null)!;
      expect(takeWarlordWord(run, 0, row.target, row.sides.length ? { dir: row.sides[0] } : {}).ok).toBe(true);
      expect(pieceAt(run, row.target)!.ench).toBe(a);
      expect(run.enchShrine).toBeUndefined();
      expect(pendingEnchantPick(run)).toBeNull();
    });
  });

  it("card 2 gives up the named cargo part, opens word B, and the resolved card still names the part (also after a reload)", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, ["whetstone"]);
      const [, b] = shrineWords(4242, 6);
      expect(pickChoice(run, 1).ok).toBe(true);
      expect(run.inventory.find((i) => i.def === "whetstone")).toBeUndefined();
      expect(run.event!.gave).toBe("whetstone");
      expect(run.enchShrine).toEqual({ day: 6, word: b });
      const reloaded = migrateRun(JSON.parse(JSON.stringify(run)))!;
      expect(reloaded.enchShrine).toEqual({ day: 6, word: b });
      expect(pendingEnchantPick(reloaded)).toEqual({ day: 6, no: 3, words: [b] });
      const cs = choicesFor(reloaded);
      expect(cs[1].cost).toEqual([{ k: "item", def: "whetstone", uid: expect.any(Number), from: "cargo" }]);
      expect(cs[1].blocked).toBeUndefined(); // the cargo it emptied does not dim the card it was paid for
      expect(cs[1].gain).toEqual([{ k: "ench", word: b }]);
    });
  });

  it("MOVE ON changes nothing; NO THANKS closes the shrine's word and the word is lost", () => {
    withEnchant(() => {
      const run = atShrine();
      const state = (r: Run): string => JSON.stringify([r.gold, r.lives, r.build, r.inventory, r.nextShop, r.bounty, r.sabotage]);
      const before = state(run);
      expect(pickChoice(run, 2).ok).toBe(true);
      expect(state(run)).toBe(before);
      expect(run.enchShrine).toBeUndefined();
      const run2 = atShrine();
      pickChoice(run2, 0);
      expect(skipWarlordWord(run2)).toBe(true);
      expect(run2.enchShrine).toBeUndefined();
      expect(skipWarlordWord(run2)).toBe(false);
    });
  });

  it("an open warlord pick is answered first; the shrine's word waits behind it and is not lost", () => {
    withEnchant(() => {
      const run = atShrine("furnace", 4242, 6, []);
      openWarlordPick(run, { tier: "hard", id: "sootjaw", day: 6 }, true);
      expect(run.enchPick).toBeDefined();
      pickChoice(run, 0);
      const [a] = shrineWords(4242, 6);
      expect(run.enchShrine).toEqual({ day: 6, word: a });
      expect(pendingEnchantPick(run)!.words).toHaveLength(2); // the warlord pick shows first
      expect(skipWarlordWord(run)).toBe(true); // NO THANKS on the warlord pick
      expect(run.enchPick).toBeUndefined();
      expect(pendingEnchantPick(run)).toEqual({ day: 6, no: 3, words: [a] }); // now the shrine's word
    });
  });

  it("the open word survives a save and a reload exactly as the warlord pick's does (the whole run is saved as JSON)", () => {
    withEnchant(() => {
      const run = atShrine("weaver", 99, 8, ["temper"]);
      pickChoice(run, 1);
      const saved = JSON.parse(JSON.stringify(run)) as Run;
      const loaded = migrateRun(saved)!;
      expect(loaded.enchShrine).toEqual(run.enchShrine);
      expect(loaded.event).toEqual(run.event);
      expect(loaded.event!.picked).toBe(1);
    });
  });
});

describe("the road-cap model (src/net/roadCap.ts)", () => {
  it("the shrine is a reviewed event and 'ench' a reviewed gain, so the D4 guard passes in both switch states", () => {
    expect(MODELLED_EVENTS.shrine).toBe("fixed");
    expect(MODELLED_DELTAS).toContain("ench");
    checkRoadModel();
    withEnchant(() => checkRoadModel());
  });

  it("with ENCHANT on the shrine is a hull-mix event (card 1: -100 hull, like RIDE THROUGH) and a no-op; off it is absent", () => {
    resetRoadCapMemo();
    const off = roadOptions();
    expect(off.has(SHRINE_ID)).toBe(false);
    withEnchant(() => {
      const on = roadOptions();
      expect(on.has(SHRINE_ID)).toBe(true);
      const opts = on.get(SHRINE_ID)!;
      const pay = opts.find((o) => o.hull !== 0)!;
      expect(pay).toMatchObject({ gold: 0, pay: 0, parts: 0, hull: -SHRINE_HULL, belt: 0, bounty: 0 });
      expect(opts.some((o) => o.hull === 0 && o.gold === 0 && o.parts === 0)).toBe(true); // MOVE ON
      const mixes = roadMixesFor(1);
      expect(mixes.some((m) => m.key.includes(`shrine(-${SHRINE_HULL},0)`))).toBe(true);
    });
    resetRoadCapMemo();
    expect(roadOptions().has(SHRINE_ID)).toBe(false); // and the memo forgets it again when the switch goes back
  });

  it("the ceiling does not move on days 1-10 (an event with no gold and no deck value raises nothing); after that it follows the 11-day bag", () => {
    resetRoadCapMemo();
    const caps = (): number[] => Array.from({ length: 16 }, (_, i) => roadCap(i + 1));
    const off = caps();
    resetRoadCapMemo();
    const on = withEnchant(() => caps());
    resetRoadCapMemo();
    expect(on.slice(0, 10)).toEqual(off.slice(0, 10)); // the first bag's days: the shrine never adds gold, so the ten days an honest deck has are what they were
    // a long run (the default world) meets the next bag one day later with the shrine in the bag, so days 11-14 differ: the ceiling is the 11-day bag's own
    for (const run of [off, on]) for (let d = 1; d < 16; d++) expect(run[d]).toBeGreaterThan(run[d - 1]);
    expect(on[10]).toBeLessThanOrEqual(off[10]); // day 11 is still the first bag's last day with the shrine: one fewer repeat than the ten-event bag's day 11
  });

  it("a bag is 11 days with the shrine in it, 10 without: bagsFor follows the rules world", () => {
    withLongRun(() => {
      expect(bagsFor(10)).toBe(1);
      expect(bagsFor(11)).toBe(2);
      withEnchant(() => {
        expect(bagsFor(11)).toBe(1);
        expect(bagsFor(12)).toBe(2);
        expect(bagsFor(22)).toBe(2);
        expect(bagsFor(23)).toBe(3);
      });
    });
  });
});

describe("honest decks that took the shrine's hull card (the player ceiling, both switch states)", () => {
  const fit = (hull: number, day: number, offered?: ReturnType<typeof offeredEvents>) => {
    const b = { ...startingBuild("furnace", 1), hullBonus: hull };
    return playerFits(b, day, buildCost(b), offered);
  };
  const keys = (hull: number, day: number, offered?: ReturnType<typeof offeredEvents>): string[] => fit(hull, day, offered).fits.map((f) => f.mix.key);
  const firstSeed = (want: (seq: EventId[]) => boolean, days: number): number => {
    for (let seed = 1; seed < 5000; seed++) if (want(eventSequence(seed, days, true))) return seed;
    throw new Error("no such seed");
  };

  it("ENCHANT on: one plating less the shrine's 100 hull is explained by the shrine when the seed offered it (and by no other event), refused when it did not", () => {
    withEnchant(() => {
      const yes = firstSeed((q) => q.includes(SHRINE_ID) && !q.includes("storm"), 6); // the shrine offered, the DARK WIND (also -100) not
      const no = firstSeed((q) => !q.includes(SHRINE_ID) && !q.includes("storm"), 6);
      const hull = 250 - SHRINE_HULL;
      expect(keys(hull, 6, offeredEvents(yes, 6))).toContain(`shrine(-${SHRINE_HULL},0)`);
      expect(fit(hull, 6, offeredEvents(yes, 6)).hullOk).toBe(true);
      expect(fit(hull, 6, offeredEvents(no, 6)).hullOk).toBe(false); // neither event on this road: nothing explains a hull of 150
      expect(fit(hull, 6, offeredEvents(no, 6)).unofferedHull?.some((l) => l.includes("shrine"))).toBe(true);
      // seed-blind (a served ghost, a stand-in): the shrine's mix is among the honest ones
      expect(keys(hull, 6)).toContain(`shrine(-${SHRINE_HULL},0)`);
      // and with its dock plating, the shrine and the dark wind together: 200 + 250 - 100 - 100 = 250 + 0
      expect(fit(400 - 2 * SHRINE_HULL + 50, 8).hullOk).toBe(true);
    });
  });

  it("ENCHANT off: a hull of 150 is the DARK WIND's as ever, and the model knows no shrine key", () => {
    expect(keys(250 - 100, 6).some((k) => k.startsWith("storm("))).toBe(true);
    expect(keys(250 - 100, 6).some((k) => k.includes("shrine"))).toBe(false);
    expect(fit(250 - 100, 6).hullOk).toBe(true);
  });
});
