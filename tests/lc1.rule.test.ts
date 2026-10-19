// LC-1 (REQ-BFG-073): the LAST CHANCE rule (src/sim/lastChance.ts, src/game/day.ts finishDay, src/game/run.ts, save.ts).
// Z-BUMP (the flip): it is the game's rule and its switch is deleted, so the switch-on tests are plain tests. A test that
// compared a run with the switch-off game compares it with the same seed's run whose LAST CHANCE is already spent
// (playSpent), which no loss fires: the dusks the game played before LAST CHANCE.
// HULL-ON (the flip, HEARTS): these are LC-1's rule on a 5-life run (1 life left, 1 back, the day-3 refund), so every run
// here starts with HEARTS off (newRun's mark: a run plays on the scale it started on, as a run saved before the flip
// does); the hearts trigger (the first loss to 1 heart or fewer, which sets 1) is tests/retune1.hearts.test.ts's.
// BUMP-1D: and with the long run off (LONG_RUN ships on): LC-1's rule is "only before RUN_DAYS" and a 10-day run's save drops a
// day-10 card, as the runs saved before the bump do; LAST CHANCE on any day is the long run's (tests/run1.rule.test.ts).
import { describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { HEROES, ITEMS, RUN_DAYS, START_LIVES, buyableModules, type HeroId } from "../src/sim/content";
import {
  BOONS, LAST_CHANCE_HULL, LAST_CHANCE_PART_KINDS, lastChanceFires, lastChanceOffer, lastChanceParts, runeDawnOf, type Boon,
} from "../src/sim/lastChance";
import { RUNES, runeFits, runeGrants, runeList, runeMods, runeOffer, runeProblem } from "../src/sim/runes";
import { finishDay, lastChanceCardLine, ghostOf } from "../src/game/day";
import {
  LAST_CHANCE_FIRST, fightRefusal, lastChancePending, newRun, pendingLastChance, pendingRune, takeLastChance, takeRune,
  type Run,
} from "../src/game/run";
import { migrateRun } from "../src/game/save";
import { PATCH_UP_LIVES } from "../src/net/records";
import { withHullScale } from "../src/sim/hullScale"; // AZ-BUMP (the flip): LC-1's ★1 PART card, HULL_SCALE off
import { withHearts } from "../src/sim/hearts"; // HULL-ON (the flip, HEARTS): LC-1's runs start on 5 lives
import { withLongRun } from "../src/sim/longRun"; // BUMP-1D: LC-1's runs are 10-day runs
import { SCALE_RIGS } from "../src/sim/scale"; // BUMP-1E: the scaling rules ship on: TROPHY CHAIN (an epic rig) is on the PART card
import { openRunesRules, withOpenRunes } from "../src/sim/openRunes"; // HULL-ON (the flip, OPEN_RUNES): the offer rule

/** A fresh LC-1 run: 5 lives (HEARTS off) and the 10-day run (BUMP-1D: LONG_RUN off), both marks read by the run, as a run saved before the flips has none. */
const lc1Run = (hero: HeroId, seed: number, id: string): Run => withLongRun(() => withHearts(() => newRun(hero, seed, id), false), false);

const Z: SideStats = { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
type R = "W" | "L" | "D";
const winner = (r: R) => (r === "W" ? 0 : r === "L" ? 1 : -1) as 0 | 1 | -1;

/** One dusk through the game's finishDay, after the dawn's picks: a pending LAST CHANCE takes `pick`, then the dawn rune
 *  takes its first card (as a player tapping the first card would). */
function dusk(run: Run, r: R, pick: Boon = "hull"): void {
  if (pendingLastChance(run)) expect(takeLastChance(run, pick).ok).toBe(true);
  const o = pendingRune(run);
  if (o) expect(takeRune(run, o.ids[0]).ok).toBe(true);
  finishDay(run, winner(r), 20, { ...Z }, { ...Z });
}

/** A run of `rs` dusks (it stops when the run ends). */
function play(rs: string, hero: HeroId = "furnace", seed = 4242, pick: Boon = "hull"): Run {
  const run = lc1Run(hero, seed, `lc1-${hero}-${seed}`); // HULL-ON (the flip, HEARTS): a 5-life run; BUMP-1D: a 10-day run
  for (const r of rs) {
    if (run.over) break;
    dusk(run, r as R, pick);
  }
  return run;
}

const reload = (run: Run): Run => migrateRun(JSON.parse(JSON.stringify(run)))!;

/** play()'s run with its LAST CHANCE already spent before its first dusk: a taken HULL card on the record (the record is
 *  all the rule reads, so no hull is added). No loss fires it, so its dusks are the game's without LAST CHANCE: the twin a
 *  firing run is compared with, now that no switch turns the rule off (Z-BUMP). */
function playSpent(rs: string, hero: HeroId = "furnace", seed = 4242): Run {
  const run = lc1Run(hero, seed, `lc1-${hero}-${seed}`); // HULL-ON (the flip, HEARTS): a 5-life run; BUMP-1D: a 10-day run
  run.lastChance = { day: 1, boon: "hull" };
  for (const r of rs) {
    if (run.over) break;
    dusk(run, r as R);
  }
  return run;
}

describe("LC-1: a run whose LAST CHANCE is spent", () => {
  it("spent, a loss to 1 life is today's: no life back, nothing recorded; firing it adds only the life and the record", () => {
    const spent = playSpent("LLLLL"); // d1-2 lose to 3, dawn 3 refund to 4, d3-5 lose to 1
    expect([spent.day, spent.lives, spent.lastChance, spent.history[4].lastChance]).toEqual([6, 1, { day: 1, boon: "hull" }, undefined]);
    // the same five losses firing it: that run with the life back and the record, nothing else (the loss itself is today's)
    const run = play("LLLLL");
    expect([run.day, run.lives, run.lastChance, run.history[4].lastChance]).toEqual([6, 2, { day: 5 }, { lives: 1 }]);
    const rest = (r: Run) => JSON.stringify({ ...r, lives: undefined, lastChance: undefined, history: r.history.map((h) => ({ ...h, lastChance: undefined })) });
    expect(rest(run)).toBe(rest(spent));
  });
});

describe("LC-1: the trigger", () => {
  it("fires on a loss that leaves exactly 1 life before day 10: 1 -> 2 at once, recorded on that day's result", () => {
    const run = play("LLLLL");
    expect(run.lives).toBe(2);
    expect(run.lastChance).toEqual({ day: 5 });
    expect(run.history[4]).toMatchObject({ day: 5, outcome: "loss", lastChance: { lives: 1 } });
    expect(lastChanceCardLine(run.history[4])).toBe("LAST CHANCE: +1 LIFE");
    expect(lastChanceCardLine(run.history[3])).toBeNull();
    expect(run.over).toBeNull();
  });

  it("edges: lastChanceFires only on a loss, only at 1 life left, only before RUN_DAYS, only once", () => {
    expect(lastChanceFires(5, "loss", 1, false)).toBe(true);
    expect(lastChanceFires(9, "loss", 1, false)).toBe(true);
    expect(lastChanceFires(RUN_DAYS, "loss", 1, false)).toBe(false); // day 10: the run completes anyway
    expect(lastChanceFires(5, "draw", 1, false)).toBe(false);
    expect(lastChanceFires(5, "win", 1, false)).toBe(false);
    expect(lastChanceFires(5, "loss", 0, false)).toBe(false); // the last life: the run is lost
    expect(lastChanceFires(5, "loss", 2, false)).toBe(false);
    expect(lastChanceFires(5, "loss", 1, true)).toBe(false); // once a run
  });

  it("not on day 10: a loss to 1 life on the last day completes the run with 1 life", () => {
    const run = play("WWWWWWLLLL");
    expect([run.over, run.lives, run.lastChance]).toEqual(["complete", 1, undefined]);
  });

  it("not on a draw or a win, and not on a loss to 2 or to 0", () => {
    const draws = play("LLLLDDD");
    expect([draws.lives, draws.lastChance]).toEqual([2, undefined]);
    const wins = play("LLLLWWW");
    expect([wins.lives, wins.lastChance]).toEqual([2, undefined]);
    // after LAST CHANCE (day 5) two more losses: 2 -> 1 (no second one) -> 0 (lost)
    const lost = play("LLLLLLL");
    expect([lost.over, lost.lives, lost.lastChance]).toEqual(["lost", 0, { day: 5, boon: "hull" }]);
  });

  it("once a run: a second loss to 1 doesn't fire it, even after the refund or PATCH UP lifted the lives", () => {
    // the refund lifted day 3 (two early losses), LAST CHANCE on day 5; PATCH UP then lifts 2 -> 3; losses to 1 again
    const run = play("LLLLL");
    expect(run.lastChance?.day).toBe(5);
    dusk(run, "W");
    run.lives = Math.min(START_LIVES, run.lives + PATCH_UP_LIVES); // the DOCK's PATCH UP on day 7's road
    expect(run.lives).toBe(3);
    dusk(run, "L");
    dusk(run, "L");
    expect([run.lives, run.lastChance, run.history.filter((h) => h.lastChance).length]).toEqual([1, { day: 5, boon: "hull" }, 1]);
    dusk(run, "L");
    expect(run.over).toBe("lost");
  });
});

describe("LC-1: the offer", () => {
  it("is deterministic and survives a reload: the same seed, day, hero and runes give the same three cards", () => {
    // HULL-ON (the flip, OPEN_RUNES): LC-1's card is the closed one (an epic rune that fits the hero), so OPEN_RUNES is off
    // here; the open card (no runeFits filter: the game's with the switch on) is tests/open1.offers.test.ts's
    withOpenRunes(() => {
      const run = play("LLLLL", "weaver", 77);
      const a = pendingLastChance(run)!;
      expect(a).toEqual(lastChanceOffer(run.seed, 5, "weaver", (run.build.runes ?? []).map((q) => q.id)));
      expect(pendingLastChance(reload(run))).toEqual(a);
      expect(reload(run).lastChance).toEqual({ day: 5 });
      // the cards: an epic rune that fits WEAVER and isn't held; an epic part of the catalogue; +LAST_CHANCE_HULL hull
      const d = RUNES[a.rune!.id];
      expect([d.tier, a.rune!.tier, runeFits(d, "weaver"), (run.build.runes ?? []).some((q) => q.id === d.id)]).toEqual(["epic", "epic", true, false]);
      expect(lastChanceParts().map((p) => p.id)).toContain(a.part);
      expect(a.hull).toBe(LAST_CHANCE_HULL);
      // another day or seed may differ; the same arguments never do
      for (let s = 1; s <= 30; s++) expect(lastChanceOffer(s, 6, "bastion", [])).toEqual(lastChanceOffer(s, 6, "bastion", []));
    }, false);
  });

  it("the rune card falls back a tier (then up) when every fitting epic is held, and says which", () => {
    const epics = runeList().filter((d) => d.tier === "epic" && runeFits(d, "furnace")).map((d) => d.id);
    expect(epics.length).toBeGreaterThan(0);
    const o = lastChanceOffer(9, 6, "furnace", epics);
    expect(o.rune!.tier).toBe("rare");
    expect(epics).not.toContain(o.rune!.id);
    const all = runeList().filter((d) => runeFits(d, "furnace") && d.tier !== "legendary").map((d) => d.id);
    expect(lastChanceOffer(9, 6, "furnace", all).rune!.tier).toBe("legendary");
  });

  it("the part card is an epic, buyable part, never a hero's own factory, and the draw covers the catalogue", () => {
    const parts = lastChanceParts();
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) expect([p.rarity, p.price > 0, !!p.merchant, p.kind !== "supply"]).toEqual(["epic", true, true, true]);
    expect(parts.map((p) => p.id)).not.toContain("kiln");
    expect(parts.map((p) => p.id)).not.toContain("loom");
    const seen = new Set<string>();
    for (let s = 1; s <= 400; s++) seen.add(lastChanceOffer(s, 5 + (s % 5), "foundry", []).part!);
    expect(seen.size).toBe(parts.length);
  });

  it("never shifts another stream: a run that never fires it plays identically to the same seed's run whose LAST CHANCE is spent", () => {
    const spent = playSpent("WLWLWLDWLW", "bastion", 31);
    const run = play("WLWLWLDWLW", "bastion", 31);
    expect(run.lastChance).toBeUndefined();
    expect(JSON.stringify(run)).toBe(JSON.stringify({ ...spent, lastChance: undefined })); // byte for byte, but the twin's record
  });

  it("a run that fires it keeps the next dawn's shop and rune offer of the same seed's spent run (a HULL pick changes neither)", () => {
    const spent = playSpent("LLLLL", "foundry", 5);
    const fired = play("LLLLL", "foundry", 5);
    expect(JSON.stringify(fired.shop)).toBe(JSON.stringify(spent.shop)); // day 6's caravan, rolled before the pick
    takeLastChance(fired, "hull");
    expect(pendingRune(fired)).toEqual(pendingRune(spent)); // day 6's dawn rune: the same held runes, the same stream
  });
});

describe("Z-PREP (REQ-BFG-073): the PART card draws rigs, turrets and gear only (cap's answer to LC-1 Q3)", () => {
  const SEVEN = ["chamber", "hailgun", "platebreaker", "railgun", "siegegun", "sorting", "splitter"];
  // BUMP-1D: SHAPES2 ships on, and PICKAXE (src/sim/shapes2.ts: an epic gate, 8 G, QUARTERMASTER) is the one epic rig of its six: it joins
  // the PART card by the kind rule below, so the catalogue is the SEVEN and PICKAXE (8 parts; the other five shaped rigs are not epic)
  // BUMP-1E: the scaling rules ship on (bb-0.12.0), and TROPHY CHAIN (src/sim/scale.ts SCALE_ITEMS: an epic gate, 7 G, QUARTERMASTER) is the one epic
  // rig of the seven new ones: it joins the PART card by the same kind rule, so the catalogue is the 9 (BUMP-1E: was 8, the SEVEN and PICKAXE)
  const PARTS = [...SEVEN, "pickaxe", "trophychain"].sort();

  it("the catalogue is exactly the 9 epic rigs, turrets and gear at this tip (the 7, SHAPES-2's PICKAXE and SCALE-2c's TROPHY CHAIN); by kind, so the 9 left out are the factories and cores", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the scaling switch ships on; TROPHY CHAIN is on the card because of it
    const parts = lastChanceParts();
    expect(parts.map((p) => p.id).sort()).toEqual(PARTS);
    // PLAIN-1F (M6, M8): PLATE BREAKER's display name is SHIELD FUEL (the cold read's pick; its key platebreaker stays, above)
    expect(parts.map((p) => p.name).sort()).toEqual(["EXT. CHAMBER", "HAIL GUN", "PICKAXE", "RAIL GUN", "SHIELD FUEL", "SIEGE GUN", "SORTING ARM", "SPLITTER", "TROPHY CHAIN"]); // BUMP-1E: was 8 names, without TROPHY CHAIN
    expect(LAST_CHANCE_PART_KINDS).toEqual(["gate", "turret", "mod"]);
    for (const p of parts) expect([LAST_CHANCE_PART_KINDS.includes(p.kind), p.rarity, p.price > 0, !!p.merchant]).toEqual([true, "epic", true, true]);
    // the rule is the kind: every buyable epic part of those kinds is in, whatever its id (a later one joins by itself) ...
    const signatures = Object.values(HEROES).map((h) => h.factory);
    const epic = buyableModules().filter((d) => d.rarity === "epic" && !signatures.includes(d.id));
    expect(parts).toEqual(epic.filter((d) => LAST_CHANCE_PART_KINDS.includes(d.kind)));
    // ... and LC-1's other 9 epic parts are exactly the 5 factories and 4 cores
    const out = epic.filter((d) => !parts.includes(d));
    expect(out.map((d) => d.kind).sort()).toEqual(["core", "core", "core", "core", "factory", "factory", "factory", "factory", "factory"]);
  });

  it("over many seeds, days and heroes no factory or core is ever offered, and the draw covers the 9", () => { // BUMP-1E: was the 8
    const seen = new Map<string, number>();
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as HeroId[]) {
      for (let day = 1; day < RUN_DAYS; day++) {
        for (let s = 1; s <= 150; s++) {
          const part = lastChanceOffer(s * 7919 + day, day, hero, []).part!;
          const k = ITEMS[part].kind;
          expect(k === "factory" || k === "core", `${hero} d${day} seed ${s}: ${part} (${k})`).toBe(false);
          seen.set(part, (seen.get(part) ?? 0) + 1);
        }
      }
    }
    expect([...seen.keys()].sort()).toEqual(PARTS);
    for (const n of seen.values()) expect(n).toBeGreaterThan(5400 / PARTS.length / 2); // an even draw: each part near 1/9 of 5,400 (BUMP-1E: was 1/8, TROPHY CHAIN joined; BUMP-1D: was 1/7, the SEVEN, PICKAXE joined)
  });

  it("still deterministic, and a PART pick still moves no other stream: the next dawn's shop and rune offer are the same seed's spent run's", () => {
    for (let s = 1; s <= 30; s++) expect(lastChanceOffer(s, 7, "furnace", [])).toEqual(lastChanceOffer(s, 7, "furnace", []));
    for (const [hero, seed] of [["foundry", 5], ["weaver", 12], ["bastion", 3], ["furnace", 8]] as [HeroId, number][]) {
      const spent = playSpent("LLLLL", hero, seed);
      const fired = play("LLLLL", hero, seed);
      expect(JSON.stringify(fired.shop)).toBe(JSON.stringify(spent.shop));
      const offer = pendingLastChance(fired)!;
      expect(takeLastChance(fired, "part").ok).toBe(true);
      expect(fired.lastChance).toEqual({ day: 5, boon: "part", id: offer.part });
      expect(LAST_CHANCE_PART_KINDS).toContain(ITEMS[offer.part!].kind);
      expect(pendingRune(fired)).toEqual(pendingRune(spent));
    }
  });
});

describe("LC-1: the pick", () => {
  it("is pending until taken: the dawn rune waits, a fight is refused, and a pick is refused when none is pending", () => {
    const run = play("LLLLL");
    // play() took HULL only at the next dusk; re-create a pending one
    const p = lc1Run("furnace", 4242, "lc1-pending"); // HULL-ON (the flip, HEARTS): a 5-life run; BUMP-1D: a 10-day run
    for (const r of "LLLLL") dusk(p, r as R);
    expect(lastChancePending(p)).toBe(true);
    expect(pendingRune(p)).toBeNull();
    expect(fightRefusal(p)).toBe(LAST_CHANCE_FIRST);
    expect(takeLastChance(p, "hull").ok).toBe(true);
    expect(fightRefusal(p)).toBe("TAKE TODAY'S RUNE FIRST"); // then day 6's dawn rune, as every dawn
    expect(pendingRune(p)!.day).toBe(6);
    expect(takeLastChance(p, "hull")).toEqual({ ok: false, reason: "NO LAST CHANCE TO PICK" });
    expect(run.lastChance).toEqual({ day: 5 }); // still pending in play()'s run (no dusk after day 5)
  });

  it(`HULL: +${LAST_CHANCE_HULL} max hull for the rest of the run, recorded on the run and the day's row`, () => {
    expect(LAST_CHANCE_HULL).toBe(500); // Z-PREP: cap's answer to LC-1 Q1 (was 1000)
    const run = play("LLLLL");
    const hull = run.build.hullBonus;
    expect(takeLastChance(run, "hull").ok).toBe(true);
    expect(run.build.hullBonus).toBe(hull + LAST_CHANCE_HULL);
    expect(run.lastChance).toEqual({ day: 5, boon: "hull" });
    expect(run.history[4].lastChance).toEqual({ lives: 1, boon: "hull" });
    expect(reload(run).lastChance).toEqual({ day: 5, boon: "hull" });
  });

  // AZ-BUMP (the flip, HULL_SCALE): the PART card's star moves with HULL_SCALE on purpose (HULL-1d, lastChance.ts
  // lastChancePartStars: LAST_CHANCE_PART_STARS 2, so the bots take the card within its band): the copy goes to cargo at ★2
  // (1 -> 2; valued at ★2 by the server). With HULL_SCALE off it is LC-1's card at 1 star, checked at the end (the title
  // keeps its key and names LC-1's star)
  it("PART: the offered epic part goes to cargo free at 1 star (no gold spent)", () => {
    const run = play("LLLLL", "weaver", 12);
    const offer = pendingLastChance(run)!, gold = run.gold, cargo = run.inventory.length;
    const r = takeLastChance(run, "part");
    expect(r.ok).toBe(true);
    expect(run.gold).toBe(gold);
    expect(run.inventory.length).toBe(cargo + 1);
    const it = run.inventory[run.inventory.length - 1];
    expect([it.def, it.stars ?? 1]).toEqual([offer.part, 2]); // AZ-BUMP (the flip, HULL_SCALE): 1 -> 2, the PART card at ★2
    expect(run.lastChance).toEqual({ day: 5, boon: "part", id: offer.part });
    expect(run.history[4].lastChance).toEqual({ lives: 1, boon: "part", id: offer.part });
    // HULL_SCALE off: the same run's card is LC-1's, its copy at 1 star
    const off = withHullScale(() => {
      const o = play("LLLLL", "weaver", 12), part = pendingLastChance(o)!.part;
      expect(takeLastChance(o, "part").ok).toBe(true);
      const c = o.inventory[o.inventory.length - 1];
      return [part, c.def, c.stars ?? 1];
    }, false);
    expect(off).toEqual([offer.part, offer.part, 1]);
  });

  it("RUNE: held right after day 5's dawn pick; the battle reads it; later dawns exclude it and still owe their picks", () => {
    const run = play("LLLLL", "bastion", 3);
    const offer = pendingLastChance(run)!, id = offer.rune!.id;
    expect(run.build.runes!.length).toBe(5);
    expect(takeLastChance(run, "rune").ok).toBe(true);
    expect(run.build.runes![5]).toEqual({ id }); // index = its day: after the dawn picks of days 1-5
    expect(run.lastChance).toEqual({ day: 5, boon: "rune", id });
    const k = RUNES[id].kind;
    if (k !== "hull" && k !== "belt" && k !== "dawnGold" && k !== "runeTithe" && k !== "victorGold") expect(runeMods(run.build.runes)![k as keyof NonNullable<ReturnType<typeof runeMods>>]).toBeGreaterThan(0);
    // day 6's dawn: still owed, its offer excludes the LAST CHANCE rune (held) and is runeOffer on the held runes
    const d6 = pendingRune(run)!;
    expect(d6.day).toBe(6);
    expect(d6.ids).not.toContain(id);
    // HULL-ON (the flip, OPEN_RUNES): the game's dawn offer and the upload rule below are on the switch's offer rule (open)
    expect(d6).toEqual(runeOffer(run.seed, 6, "bastion", run.build.runes!.map((q) => q.id), openRunesRules()));
    dusk(run, "W", "rune"); // takes day 6's rune, fights
    expect(run.build.runes!.length).toBe(7);
    expect(pendingRune(run)!.day).toBe(7); // day 7 is owed: the dawn count leaves the LAST CHANCE rune out
    dusk(run, "W", "rune");
    expect(run.build.runes!.length).toBe(8);
    // the rune order passes the upload rule with the seed, told where the LAST CHANCE rune is (index 5)
    expect(runeProblem(run.build.runes, 7, "bastion", run.seed, "exact", false, 5, openRunesRules())).toBeNull();
    expect(runeProblem(run.build.runes, 7, "bastion", run.seed, "exact")).toMatch(/held on day 7/);
    expect(runeDawnOf(4, 5)).toBe(5);
    expect(runeDawnOf(5, 5)).toBe(6);
    expect(runeDawnOf(6, 5)).toBe(6);
    expect(runeDawnOf(7, 5)).toBe(7);
  });

  it("the snapshot carries the taken LAST CHANCE last; a run without one snapshots as before", () => {
    const run = play("LLLLL", "furnace", 8);
    const offer = pendingLastChance(run)!;
    takeLastChance(run, "part");
    const g = ghostOf(run, 1, "p1", null);
    expect(g.lastChance).toEqual({ day: 5, boon: "part", id: offer.part });
    expect(Object.keys(g).at(-1)).toBe("lastChance");
    const plain = play("WWWW", "furnace", 8);
    expect(ghostOf(plain, 1, "p1", null).lastChance).toBeUndefined();
    expect(Object.keys(ghostOf(plain, 1, "p1", null))).not.toContain("lastChance");
  });

  it("every card works for every boon value; a bad boon is refused", () => {
    for (const b of BOONS) {
      const run = play("LLLLL", "foundry", 21);
      expect(takeLastChance(run, b).ok).toBe(true);
      expect(run.lastChance!.boon).toBe(b);
    }
    const run = play("LLLLL", "foundry", 21);
    expect(takeLastChance(run, "gold" as Boon)).toEqual({ ok: false, reason: "NOT ON OFFER" });
  });
});

describe("LC-1: runeGrants with a LAST CHANCE rune", () => {
  it("off (lcAt -1) every amount is as before; a dawn-gold rune at the LAST CHANCE place pays from the dawn after its day", () => {
    const list = ["iron_hide", "steady_iron", "ward_stone", "rune_tithe", "scab_iron"].map((id) => ({ id }));
    for (let day = 1; day <= 10; day++) expect(runeGrants(list, day, -1)).toEqual(runeGrants(list, day));
    // RUNE TITHE (index 3) as a LAST CHANCE rune of day 3: taken at the dawn of day 4 with 4 held, then each later dawn
    // pays for the runes taken before it (days 5..: 4 dawn runes + itself, and so on)
    const g = runeGrants(list, 6, 3).gold;
    expect(g).toBeGreaterThan(0);
    expect(g).toBeGreaterThanOrEqual(runeGrants(list.slice(0, 4), 6, 3).gold);
  });
});

describe("LC-1: the save", () => {
  it("old saves load as before; a pending or taken LAST CHANCE survives; a malformed one is dropped", () => {
    const plain = play("WWLW");
    expect(reload(plain)).toEqual(plain);
    const run = play("LLLLL");
    expect(reload(run).lastChance).toEqual({ day: 5 });
    for (const bad of [{ day: 10 }, { day: 0 }, { day: 5, boon: "gold" }, { day: 5, boon: "rune" }, { day: 5, boon: "hull", id: "x" }, "x", [1]]) {
      const raw = JSON.parse(JSON.stringify(run));
      raw.lastChance = bad;
      expect(migrateRun(raw)!.lastChance).toBeUndefined();
    }
    const raw = JSON.parse(JSON.stringify(run));
    raw.history[4].lastChance = "yes";
    expect(migrateRun(raw)!.history[4].lastChance).toBeUndefined();
    expect(run.version).toBe(8); // no save version bump
  });
});