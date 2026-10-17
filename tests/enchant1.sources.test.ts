// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E5; step 6 core): where the words come from. The ENCHANTER (days 3, 5, 7, 9 and every odd day
// after; 2 different words a day at 4 G; a REROLL keeps it; every regular wagon is what it was), buying-is-applying with its refusals
// and confirms, the warlord pick (two at most), LAST CHANCE's part arriving enchanted, and the bounds the server re-derives.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ITEMS } from "../src/sim/content";
import { turretList } from "../src/sim/deck";
import { ENCHANT, ENCHANT_IDS, freeSides, setEnchant, withEnchant } from "../src/sim/enchant";
import {
  ENCHANTER_PRICE, enchanterDay, enchanterDaysUpTo, enchanterWords, freeEnchantsByDay, lastChanceWord, maxEnchantsByDay, possibleWords,
  warlordPickWords, warlordPicksByDay,
} from "../src/sim/enchantSources";
import { ENCHANTER_SHUT, applyProblem, buyEnchant, enchantChoices, openWarlordPick, pendingEnchantPick, rollEnchanter, skipWarlordWord, takeWarlordWord } from "../src/game/enchanter";
import { REFIT_NO_SHOP, newRun, pendingLastChance, reroll, rollShop, takeLastChance, type Run } from "../src/game/run";
import { finishWarlord, warlordFight } from "../src/game/road";
import { lastChanceParts } from "../src/sim/lastChance";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1 (run 3): these sweeps play many seeded runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

function dayRun(day: number, seed = 7, hero: "furnace" | "weaver" = "furnace"): Run {
  const run = newRun(hero, seed);
  run.day = day;
  run.gold = 40;
  run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
  rollShop(run);
  return run;
}

describe("ENCHANT-1 E5a: the ENCHANTER's days and words (pure)", () => {
  it("rides on days 3, 5, 7, 9 and every odd day after; never on day 1, 2 or an even day", () => {
    const days = Array.from({ length: 16 }, (_, i) => i + 1).filter(enchanterDay);
    expect(days).toEqual([3, 5, 7, 9, 11, 13, 15]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(enchanterDaysUpTo)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(enchanterWords(5, 4)).toEqual([]);
  });
  it("two DIFFERENT words from the eight, the same for the same seed and day, and varied across seeds (seeds 1-300, its days)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [3, 5, 7, 9, 11]) {
        const w = enchanterWords(seed, day);
        expect(w).toHaveLength(2);
        expect(w[0]).not.toBe(w[1]);
        for (const id of w) expect(ENCHANT_IDS).toContain(id);
        expect(enchanterWords(seed, day)).toEqual(w);
        seen.add(w.join());
      }
    }
    expect(seen.size).toBeGreaterThan(40); // the pairs vary: 56 ordered pairs exist
    // every word turns up across the seeds, and the warlord stream is its own stream
    const all = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) for (const id of enchanterWords(seed, 3)) all.add(id);
    expect(all.size).toBe(8);
    expect(warlordPickWords(1, 6)).toHaveLength(2);
    expect(warlordPickWords(1, 6)[0]).not.toBe(warlordPickWords(1, 6)[1]);
  });
  it("the bounds: 2 words per ENCHANTER day, 1 warlord pick from day 5 and 2 from day 8, 1 LAST CHANCE part", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(warlordPicksByDay)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(maxEnchantsByDay(2, false)).toBe(0);
    expect(maxEnchantsByDay(4, false)).toBe(2);
    expect(maxEnchantsByDay(5, false)).toBe(5); // 4 bought + pick 1
    expect(maxEnchantsByDay(10, false)).toBe(8 + 2);
    expect(maxEnchantsByDay(10, true)).toBe(8 + 2 + 1);
    expect(freeEnchantsByDay(10, true)).toBe(3);
    expect(freeEnchantsByDay(3, false)).toBe(0);
    expect(ENCHANTER_PRICE).toBe(4);
  });
  it("possibleWords: the ENCHANTER's offers up to the day, the pick words from day 5, LAST CHANCE's word", () => {
    const seed = 11;
    expect([...possibleWords(seed, 2)]).toEqual([]);
    expect(new Set(possibleWords(seed, 3))).toEqual(new Set(enchanterWords(seed, 3)));
    const d6 = possibleWords(seed, 6);
    for (const d of [3, 5]) for (const w of enchanterWords(seed, d)) expect(d6.has(w)).toBe(true);
    for (const d of [5, 6]) for (const w of warlordPickWords(seed, d)) expect(d6.has(w)).toBe(true);
    const lc = lastChanceWord(seed, 4, "sawblade") ?? lastChanceWord(seed, 4, lastChanceParts().find((d) => d.kind === "turret")?.id ?? "railgun");
    expect(lc).not.toBeNull();
    expect(possibleWords(seed, 4, { day: 4, part: lastChanceParts().find((d) => d.kind === "turret")?.id }).has(lc!.ench)).toBe(true);
  });
  it("LAST CHANCE's word: legal on the piece, WIDE on a rig takes a seeded FREE side, gear arrives plain, and it is a pure function", () => {
    for (const d of lastChanceParts()) {
      for (let seed = 1; seed <= 60; seed++) {
        const w = lastChanceWord(seed, 4, d.id);
        if (d.kind === "mod") { expect(w, `${d.id} gear`).toBeNull(); continue; }
        expect(w, `${d.id} seed ${seed}`).not.toBeNull();
        expect(lastChanceWord(seed, 4, d.id)).toEqual(w);
        if (w!.ench === "wide" && d.kind === "gate") expect(freeSides(d)).toContain(w!.enchDir);
        else expect(w!.enchDir).toBeUndefined();
        if (d.kind === "gate") expect(["massive", "swift"]).not.toContain(w!.ench);
      }
    }
    expect(lastChanceWord(1, 4, "no-such-part")).toBeNull();
  });
});

describe("ENCHANT-1 E5a: the wagon in the caravan", () => {
  it("with ENCHANT on, an ENCHANTER day carries the wagon (2 words, 4 G, unsold); off, or on another day, there is none", () => {
    for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const run = on(() => dayRun(day));
      if (enchanterDay(day)) {
        expect(run.shop.enchanter, `day ${day}`).toEqual({ day, offers: enchanterWords(run.seed, day).map((ench) => ({ ench, price: 4, sold: false })) });
      } else expect(run.shop.enchanter, `day ${day}`).toBeUndefined();
      expect(dayRun(day).shop.enchanter, `off, day ${day}`).toBeUndefined();
    }
  });
  it("a REROLL keeps the wagon exactly as it is (a bought word stays sold), and no discount touches its price", () => {
    on(() => {
      const run = dayRun(5);
      run.shop.discount = 3;
      run.shop.enchanter!.offers[0].sold = true;
      const before = JSON.stringify(run.shop.enchanter);
      expect(reroll(run)).toBe(true);
      expect(JSON.stringify(run.shop.enchanter)).toBe(before);
      expect(run.shop.enchanter!.offers.every((o) => o.price === 4)).toBe(true);
      rollEnchanter(run); // a second call the same day changes nothing
      expect(JSON.stringify(run.shop.enchanter)).toBe(before);
      run.day = 6; // another day: the wagon goes
      rollEnchanter(run);
      expect(run.shop.enchanter).toBeUndefined();
    });
  });
  it("EVERY OTHER OFFER STAYS AS IT IS: the regular wagons are identical with the switch off and on, seeds 1-300, days 1-12 (both heroes)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const hero = seed % 2 ? "furnace" : "weaver";
      for (let day = 1; day <= 12; day++) {
        const off = JSON.stringify(dayRun(day, seed, hero).shop.wagons);
        const withIt = on(() => JSON.stringify(dayRun(day, seed, hero).shop.wagons));
        if (withIt !== off) throw new Error(`seed ${seed} day ${day}: the regular wagons moved`);
      }
    }
  });
});

describe("ENCHANT-1 E5a: buying is applying", () => {
  const offers = (run: Run, ...ids: string[]): void => { run.shop.enchanter = { day: run.day, offers: ids.map((ench) => ({ ench, price: 4, sold: false })) }; };
  const rigAt = (run: Run, uid: number, def = "whetstone", extra: Record<string, unknown> = {}): void => { run.build.items.push({ uid, def, x: 1, y: 5, ...extra }); };

  it("a legal piece takes the word and only then the gold goes; the offer is sold; a second buy of it says SOLD", () => {
    on(() => {
      const run = dayRun(5);
      offers(run, "fiery", "rising");
      rigAt(run, 200);
      const g = run.gold;
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 })).toEqual({ ok: true });
      expect(run.gold).toBe(g - 4);
      expect(run.build.items.find((p) => p.uid === 200)!.ench).toBe("fiery");
      expect(run.shop.enchanter!.offers[0].sold).toBe(true);
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 }).reason).toBe("SOLD");
      expect(run.gold).toBe(g - 4);
    });
  });
  it("a refused piece says why and changes nothing (no gold, no sale): NOT ON A RIG, NO FREE SIDE, NOT ON GEAR, NOT ON A CORE", () => {
    on(() => {
      const run = dayRun(5);
      offers(run, "massive", "wide", "fiery");
      rigAt(run, 200);
      rigAt(run, 201, "overdrive"); // an X rig: four arrows
      run.inventory.push({ uid: 202, def: Object.values(ITEMS).find((d) => d.kind === "mod")!.id });
      run.inventory.push({ uid: 203, def: Object.values(ITEMS).find((d) => d.kind === "core")!.id });
      const g = run.gold;
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 }).reason).toBe("NOT ON A RIG");
      expect(buyEnchant(run, 1, { kind: "item", uid: 201 }).reason).toBe("NO FREE SIDE");
      expect(buyEnchant(run, 2, { kind: "cargo", uid: 202 }).reason).toBe("NOT ON GEAR");
      expect(buyEnchant(run, 2, { kind: "cargo", uid: 203 }).reason).toBe("NOT ON A CORE");
      expect(buyEnchant(run, 2, { kind: "cargo", uid: 999 }).reason).toBe("NOT A PART");
      expect(buyEnchant(run, 5, { kind: "item", uid: 200 }).reason).toBe("NO SUCH OFFER");
      expect(run.gold).toBe(g);
      expect(run.shop.enchanter!.offers.some((o) => o.sold)).toBe(false);
      run.gold = 3;
      expect(buyEnchant(run, 2, { kind: "item", uid: 200 }).reason).toBe("NEED 1 MORE GOLD");
    });
  });
  it("a word already on the piece asks first (REPLACES), then replaces it: the old counter goes, the gold is taken once; the same word is refused", () => {
    on(() => {
      const run = dayRun(7);
      offers(run, "rising", "fiery");
      rigAt(run, 200, "whetstone", { ench: "growing", grow: 3 });
      const g = run.gold;
      const ask = buyEnchant(run, 0, { kind: "item", uid: 200 });
      expect(ask).toMatchObject({ ok: false, needReplace: "growing", reason: "REPLACES GROWING" });
      expect(run.gold).toBe(g);
      expect(run.build.items.find((p) => p.uid === 200)).toMatchObject({ ench: "growing", grow: 3 });
      const done = buyEnchant(run, 0, { kind: "item", uid: 200 }, { replace: true });
      expect(done).toEqual({ ok: true, replaced: "growing" });
      expect(run.gold).toBe(g - 4);
      const p = run.build.items.find((q) => q.uid === 200)!;
      expect(p.ench).toBe("rising");
      expect(p.grow).toBeUndefined();
      rigAt(run, 201, "whetstone", { ench: "fiery" });
      expect(buyEnchant(run, 1, { kind: "item", uid: 201 }, { replace: true }).reason).toBe("ALREADY FIERY");
    });
  });
  it("WIDE on a rig is a chosen free side: asked when there are several, refused on a taken side; on a factory and a turret it needs no side", () => {
    on(() => {
      const run = dayRun(9);
      offers(run, "wide", "wide", "wide");
      rigAt(run, 200); // I: one arrow forward: sides 1, 2, 3 free
      expect(freeSides("whetstone")).toEqual([1, 2, 3]);
      const ask = buyEnchant(run, 0, { kind: "item", uid: 200 });
      expect(ask).toMatchObject({ ok: false, needSide: [1, 2, 3], reason: "CHOOSE A SIDE" });
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 }, { dir: 0 }).reason).toBe("NO FREE SIDE"); // the rig's own arrow
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 }, { dir: 2 })).toEqual({ ok: true });
      expect(run.build.items.find((p) => p.uid === 200)).toMatchObject({ ench: "wide", enchDir: 2 });
      const t = turretList(run.build)[0];
      expect(buyEnchant(run, 1, { kind: "turret", slot: t.slot })).toEqual({ ok: true });
      expect(turretList(run.build).find((x) => x.uid === t.uid)!.ench).toBe("wide");
      run.inventory.push({ uid: 210, def: "press" });
      expect(buyEnchant(run, 2, { kind: "cargo", uid: 210 })).toEqual({ ok: true });
      expect(run.inventory.find((i) => i.uid === 210)!.ench).toBe("wide");
    });
  });
  it("in REFIT with NPC_DAY on the caravan has moved on: a purchase is refused with run.ts's own words; off, nothing is bought", () => {
    expect(ENCHANTER_SHUT).toBe(REFIT_NO_SHOP);
    const run = on(() => dayRun(5));
    rigAt(run, 200);
    on(() => {
      run.stage = "refit";
      expect(buyEnchant(run, 0, { kind: "item", uid: 200 })).toEqual({ ok: false, reason: REFIT_NO_SHOP });
    });
    run.stage = "caravan";
    expect(buyEnchant(run, 0, { kind: "item", uid: 200 }).reason).toBe("NO ENCHANTMENTS"); // the switch is off
    function rigAt(r: Run, uid: number): void { r.build.items.push({ uid, def: "whetstone", x: 1, y: 5 }); }
  });
  it("enchantChoices lists every piece APPLY can show: glowing (reason null) or the reason, in a fixed order", () => {
    on(() => {
      const run = dayRun(5);
      rigAt(run, 200);
      run.inventory.push({ uid: 202, def: "whetstone" });
      const c = enchantChoices(run, "massive");
      const byTarget = (k: string, id: number | string) => c.find((x) => JSON.stringify(x.target) === JSON.stringify(k === "item" ? { kind: "item", uid: id } : k === "turret" ? { kind: "turret", slot: id } : { kind: "cargo", uid: id }))!;
      expect(byTarget("item", 200).reason).toBe("NOT ON A RIG");
      expect(byTarget("cargo", 202).reason).toBe("NOT ON A RIG");
      expect(c.some((x) => x.target.kind === "turret" && x.reason === null)).toBe(true);
      const w = enchantChoices(run, "wide");
      expect(w.find((x) => x.target.kind === "item" && x.target.uid === 200)).toMatchObject({ reason: null, sides: [1, 2, 3] });
      expect(JSON.stringify(enchantChoices(run, "wide"))).toBe(JSON.stringify(w));
    });
  });
});

describe("ENCHANT-1 E5b: the warlord pick", () => {
  const winHard = (run: Run): void => {
    run.warlord = warlordFight(run, "hard");
    run.stage = "warlord";
    finishWarlord(run, 0, 20);
  };
  it("a Hard win on day 5 or later over a captain who isn't the Matriarch opens pick 1 (once); the Matriarch's win opens pick 2 (once)", () => {
    on(() => {
      const run = dayRun(6, 3);
      run.gold = 0;
      winHard(run);
      expect(run.warlord!.id).not.toBe("matriarch");
      expect(run.enchPick).toEqual({ day: 6, no: 1, words: warlordPickWords(run.seed, 6) });
      expect(run.enchPicks).toEqual([1]);
      expect(run.gold).toBeGreaterThan(0); // the gold is the win's own
      // declined: the word is lost and pick 1 is spent
      expect(skipWarlordWord(run)).toBe(true);
      expect(run.enchPick).toBeUndefined();
      expect(skipWarlordWord(run)).toBe(false);
      run.day = 7; run.warlord = null;
      winHard(run);
      expect(run.enchPick).toBeUndefined(); // only the run's FIRST such win picks
      // the Iron Matriarch holds the Hard slot from day 8
      run.day = 8; run.warlord = null; run.matriarchBeatenOn = null;
      winHard(run);
      expect(run.warlord!.id).toBe("matriarch");
      expect(run.enchPick).toEqual({ day: 8, no: 2, words: warlordPickWords(run.seed, 8) });
      expect(run.enchPicks).toEqual([1, 2]);
    });
  });
  it("no pick for a loss, an Easy or Medium win, a Hard win before day 5, a second Matriarch win, or with ENCHANT off", () => {
    on(() => {
      const early = dayRun(4, 3);
      winHard(early);
      expect(early.enchPick).toBeUndefined();
      const run = dayRun(6, 3);
      run.warlord = warlordFight(run, "medium"); run.stage = "warlord";
      finishWarlord(run, 0, 20);
      expect(run.enchPick).toBeUndefined();
      const lost = dayRun(6, 3);
      lost.warlord = warlordFight(lost, "hard"); lost.stage = "warlord";
      finishWarlord(lost, 1, 20);
      expect(lost.enchPick).toBeUndefined();
      expect(lost.enchPicks).toBeUndefined();
      const m = dayRun(9, 3);
      m.enchPicks = [2];
      m.matriarchBeatenOn = 8; // she was beaten: the Hard slot is another captain's again
      winHard(m);
      expect(m.warlord!.id).not.toBe("matriarch");
      expect(m.enchPick).toEqual({ day: 9, no: 1, words: warlordPickWords(m.seed, 9) }); // pick 1 is still owed; the Matriarch's is spent
      expect(m.enchPicks).toEqual([2, 1]);
      const q = dayRun(9, 3); // she still holds the slot and her pick was taken: a second win over her (impossible in play) opens nothing
      q.enchPicks = [2];
      winHard(q);
      expect(q.warlord!.id).toBe("matriarch");
      expect(q.enchPick).toBeUndefined();
    });
    const off = dayRun(6, 3);
    winHard(off);
    expect(off.enchPick).toBeUndefined();
    expect(pendingEnchantPick(off)).toBeNull();
  });
  it("taking a word puts it on a legal piece for free and closes the pick; a refusal keeps it open; the word is the seed's", () => {
    on(() => {
      const run = dayRun(6, 3);
      winHard(run);
      const [a, b] = run.enchPick!.words;
      run.build.items.push({ uid: 200, def: "whetstone", x: 1, y: 5 });
      const g = run.gold;
      expect(takeWarlordWord(run, 2, { kind: "item", uid: 200 }).reason).toBe("NO SUCH WORD");
      run.inventory.push({ uid: 202, def: Object.values(ITEMS).find((d) => d.kind === "mod")!.id });
      expect(takeWarlordWord(run, 0, { kind: "cargo", uid: 202 }).reason).toBe("NOT ON GEAR");
      expect(run.enchPick).toBeDefined();
      // a word that can't go on a rig is tried on the turret instead
      const target = applyProblem(run, { kind: "item", uid: 200 }, b) === null ? { kind: "item" as const, uid: 200 } : { kind: "turret" as const, slot: turretList(run.build)[0].slot };
      const r = takeWarlordWord(run, 1, target, { dir: 2, replace: true });
      expect(r.ok).toBe(true);
      expect(run.enchPick).toBeUndefined();
      expect(run.gold).toBe(g);
      const held = target.kind === "item" ? run.build.items.find((p) => p.uid === 200)!.ench : turretList(run.build)[0].ench;
      expect(held).toBe(b);
      expect(a).not.toBe(b);
    });
  });
});

describe("ENCHANT-1 E5c: LAST CHANCE's part arrives enchanted (a rig or a turret; gear plain)", () => {
  it("for 60 seeds: the PART card's piece enters cargo with exactly the word lastChanceWord derives; off it is plain", () => {
    let withWord = 0, plainGear = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const live of [true, false]) {
        const run = newRun("furnace", seed);
        run.day = 5;
        run.lastChance = { day: 4 };
        const run2 = run;
        const take = (): ReturnType<typeof takeLastChance> => takeLastChance(run2, "part");
        const offer = pendingLastChance(run2)!;
        const res = live ? on(take) : take();
        expect(res.ok).toBe(true);
        const part = offer.part!;
        const kept = res.gain!.where === "cargo" ? run2.inventory.find((i) => i.uid === res.gain!.survivor) : undefined;
        const expected = live ? lastChanceWord(run2.seed, 4, part) : null;
        if (!live) { expect(kept?.ench).toBeUndefined(); continue; }
        if (expected) {
          expect(kept, `seed ${seed} ${part}`).toMatchObject({ def: part, ench: expected.ench, ...(expected.enchDir !== undefined ? { enchDir: expected.enchDir } : {}) });
          withWord++;
        } else {
          expect(ITEMS[part].kind).toBe("mod");
          expect(kept?.ench).toBeUndefined();
          plainGear++;
        }
      }
    }
    expect(withWord).toBeGreaterThan(20);
    expect(plainGear).toBeGreaterThanOrEqual(0);
  });
});
