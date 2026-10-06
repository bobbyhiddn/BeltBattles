// LC-1 (REQ-BFG-073): the LAST CHANCE rule (src/sim/lastChance.ts, src/game/day.ts finishDay, src/game/run.ts, save.ts),
// behind its switch. Every test that turns the switch on does it inside withLastChance, which puts it back even on a throw.
import { afterEach, describe, expect, it } from "vitest";
import type { SideStats } from "../src/sim/battle";
import { RUN_DAYS, START_LIVES, type HeroId } from "../src/sim/content";
import {
  BOONS, LAST_CHANCE, LAST_CHANCE_HULL, lastChanceFires, lastChanceOffer, lastChanceParts, lastChanceRules, runeDawnOf,
  setLastChance, withLastChance, type Boon,
} from "../src/sim/lastChance";
import { RUNES, runeFits, runeGrants, runeList, runeMods, runeOffer, runeProblem } from "../src/sim/runes";
import { finishDay, lastChanceCardLine, ghostOf } from "../src/game/day";
import {
  LAST_CHANCE_FIRST, fightRefusal, lastChancePending, newRun, pendingLastChance, pendingRune, takeLastChance, takeRune,
  type Run,
} from "../src/game/run";
import { migrateRun } from "../src/game/save";
import { PATCH_UP_LIVES } from "../src/net/records";

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
  const run = newRun(hero, seed, `lc1-${hero}-${seed}`);
  for (const r of rs) {
    if (run.over) break;
    dusk(run, r as R, pick);
  }
  return run;
}

const reload = (run: Run): Run => migrateRun(JSON.parse(JSON.stringify(run)))!;

afterEach(() => setLastChance(false));

describe("LC-1: the switch", () => {
  it("ships off; withLastChance turns it on for the call and back, even when the call throws", () => {
    expect([LAST_CHANCE, lastChanceRules()]).toEqual([false, false]);
    expect(withLastChance(() => lastChanceRules())).toBe(true);
    expect(lastChanceRules()).toBe(false);
    expect(withLastChance(() => withLastChance(() => lastChanceRules(), false))).toBe(false);
    expect(() => withLastChance(() => { throw new Error("boom"); })).toThrow("boom");
    expect(lastChanceRules()).toBe(false);
  });

  it("off, a loss to 1 life is today's: no life back, nothing recorded", () => {
    const run = play("LLLLL"); // d1-2 lose to 3, dawn 3 refund to 4, d3-5 lose to 1
    expect([run.day, run.lives, run.lastChance, run.history[4].lastChance]).toEqual([6, 1, undefined, undefined]);
  });
});

describe("LC-1: the trigger (switch on)", () => {
  it("fires on a loss that leaves exactly 1 life before day 10: 1 -> 2 at once, recorded on that day's result", () => withLastChance(() => {
    const run = play("LLLLL");
    expect(run.lives).toBe(2);
    expect(run.lastChance).toEqual({ day: 5 });
    expect(run.history[4]).toMatchObject({ day: 5, outcome: "loss", lastChance: { lives: 1 } });
    expect(lastChanceCardLine(run.history[4])).toBe("LAST CHANCE: +1 LIFE");
    expect(lastChanceCardLine(run.history[3])).toBeNull();
    expect(run.over).toBeNull();
  }));

  it("edges: lastChanceFires only on a loss, only at 1 life left, only before RUN_DAYS, only once", () => withLastChance(() => {
    expect(lastChanceFires(5, "loss", 1, false)).toBe(true);
    expect(lastChanceFires(9, "loss", 1, false)).toBe(true);
    expect(lastChanceFires(RUN_DAYS, "loss", 1, false)).toBe(false); // day 10: the run completes anyway
    expect(lastChanceFires(5, "draw", 1, false)).toBe(false);
    expect(lastChanceFires(5, "win", 1, false)).toBe(false);
    expect(lastChanceFires(5, "loss", 0, false)).toBe(false); // the last life: the run is lost
    expect(lastChanceFires(5, "loss", 2, false)).toBe(false);
    expect(lastChanceFires(5, "loss", 1, true)).toBe(false); // once a run
    expect(withLastChance(() => lastChanceFires(5, "loss", 1, false), false)).toBe(false); // switch off
  }));

  it("not on day 10: a loss to 1 life on the last day completes the run with 1 life", () => withLastChance(() => {
    const run = play("WWWWWWLLLL");
    expect([run.over, run.lives, run.lastChance]).toEqual(["complete", 1, undefined]);
  }));

  it("not on a draw or a win, and not on a loss to 2 or to 0", () => withLastChance(() => {
    const draws = play("LLLLDDD");
    expect([draws.lives, draws.lastChance]).toEqual([2, undefined]);
    const wins = play("LLLLWWW");
    expect([wins.lives, wins.lastChance]).toEqual([2, undefined]);
    // after LAST CHANCE (day 5) two more losses: 2 -> 1 (no second one) -> 0 (lost)
    const lost = play("LLLLLLL");
    expect([lost.over, lost.lives, lost.lastChance]).toEqual(["lost", 0, { day: 5, boon: "hull" }]);
  }));

  it("once a run: a second loss to 1 doesn't fire it, even after the refund or PATCH UP lifted the lives", () => withLastChance(() => {
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
  }));
});

describe("LC-1: the offer (switch on)", () => {
  it("is deterministic and survives a reload: the same seed, day, hero and runes give the same three cards", () => withLastChance(() => {
    const run = play("LLLLL", "weaver", 77);
    const a = pendingLastChance(run)!;
    expect(a).toEqual(lastChanceOffer(run.seed, 5, "weaver", (run.build.runes ?? []).map((q) => q.id)));
    expect(pendingLastChance(reload(run))).toEqual(a);
    expect(reload(run).lastChance).toEqual({ day: 5 });
    // the cards: an epic rune that fits WEAVER and isn't held; an epic part of the catalogue; +1000 hull
    const d = RUNES[a.rune!.id];
    expect([d.tier, a.rune!.tier, runeFits(d, "weaver"), (run.build.runes ?? []).some((q) => q.id === d.id)]).toEqual(["epic", "epic", true, false]);
    expect(lastChanceParts().map((p) => p.id)).toContain(a.part);
    expect(a.hull).toBe(LAST_CHANCE_HULL);
    // another day or seed may differ; the same arguments never do
    for (let s = 1; s <= 30; s++) expect(lastChanceOffer(s, 6, "bastion", [])).toEqual(lastChanceOffer(s, 6, "bastion", []));
  }));

  it("the rune card falls back a tier (then up) when every fitting epic is held, and says which", () => withLastChance(() => {
    const epics = runeList().filter((d) => d.tier === "epic" && runeFits(d, "furnace")).map((d) => d.id);
    expect(epics.length).toBeGreaterThan(0);
    const o = lastChanceOffer(9, 6, "furnace", epics);
    expect(o.rune!.tier).toBe("rare");
    expect(epics).not.toContain(o.rune!.id);
    const all = runeList().filter((d) => runeFits(d, "furnace") && d.tier !== "legendary").map((d) => d.id);
    expect(lastChanceOffer(9, 6, "furnace", all).rune!.tier).toBe("legendary");
  }));

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

  it("never shifts another stream: a run that never fires it plays identically with the switch on and off", () => {
    const off = play("WLWLWLDWLW", "bastion", 31);
    const on = withLastChance(() => play("WLWLWLDWLW", "bastion", 31));
    expect(on.lastChance).toBeUndefined();
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });

  it("a run that fires it keeps the next dawn's shop and rune offer of the switch-off run (a HULL pick changes neither)", () => {
    const off = play("LLLLL", "foundry", 5);
    const on = withLastChance(() => play("LLLLL", "foundry", 5));
    expect(JSON.stringify(on.shop)).toBe(JSON.stringify(off.shop)); // day 6's caravan, rolled before the pick
    withLastChance(() => takeLastChance(on, "hull"));
    expect(pendingRune(on)).toEqual(pendingRune(off)); // day 6's dawn rune: the same held runes, the same stream
  });
});

describe("LC-1: the pick (switch on)", () => {
  it("is pending until taken: the dawn rune waits, a fight is refused, and a pick is refused when none is pending", () => withLastChance(() => {
    const run = play("LLLLL");
    // play() took HULL only at the next dusk; re-create a pending one
    const p = newRun("furnace", 4242, "lc1-pending");
    for (const r of "LLLLL") dusk(p, r as R);
    expect(lastChancePending(p)).toBe(true);
    expect(pendingRune(p)).toBeNull();
    expect(fightRefusal(p)).toBe(LAST_CHANCE_FIRST);
    expect(takeLastChance(p, "hull").ok).toBe(true);
    expect(fightRefusal(p)).toBe("TAKE TODAY'S RUNE FIRST"); // then day 6's dawn rune, as every dawn
    expect(pendingRune(p)!.day).toBe(6);
    expect(takeLastChance(p, "hull")).toEqual({ ok: false, reason: "NO LAST CHANCE TO PICK" });
    expect(run.lastChance).toEqual({ day: 5 }); // still pending in play()'s run (no dusk after day 5)
  }));

  it("HULL: +1000 max hull for the rest of the run, recorded on the run and the day's row", () => withLastChance(() => {
    const run = play("LLLLL");
    const hull = run.build.hullBonus;
    expect(takeLastChance(run, "hull").ok).toBe(true);
    expect(run.build.hullBonus).toBe(hull + LAST_CHANCE_HULL);
    expect(run.lastChance).toEqual({ day: 5, boon: "hull" });
    expect(run.history[4].lastChance).toEqual({ lives: 1, boon: "hull" });
    expect(reload(run).lastChance).toEqual({ day: 5, boon: "hull" });
  }));

  it("PART: the offered epic part goes to cargo free at 1 star (no gold spent)", () => withLastChance(() => {
    const run = play("LLLLL", "weaver", 12);
    const offer = pendingLastChance(run)!, gold = run.gold, cargo = run.inventory.length;
    const r = takeLastChance(run, "part");
    expect(r.ok).toBe(true);
    expect(run.gold).toBe(gold);
    expect(run.inventory.length).toBe(cargo + 1);
    const it = run.inventory[run.inventory.length - 1];
    expect([it.def, it.stars ?? 1]).toEqual([offer.part, 1]);
    expect(run.lastChance).toEqual({ day: 5, boon: "part", id: offer.part });
    expect(run.history[4].lastChance).toEqual({ lives: 1, boon: "part", id: offer.part });
  }));

  it("RUNE: held right after day 5's dawn pick; the battle reads it; later dawns exclude it and still owe their picks", () => withLastChance(() => {
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
    expect(d6).toEqual(runeOffer(run.seed, 6, "bastion", run.build.runes!.map((q) => q.id)));
    dusk(run, "W", "rune"); // takes day 6's rune, fights
    expect(run.build.runes!.length).toBe(7);
    expect(pendingRune(run)!.day).toBe(7); // day 7 is owed: the dawn count leaves the LAST CHANCE rune out
    dusk(run, "W", "rune");
    expect(run.build.runes!.length).toBe(8);
    // the rune order passes the upload rule with the seed, told where the LAST CHANCE rune is (index 5)
    expect(runeProblem(run.build.runes, 7, "bastion", run.seed, "exact", false, 5)).toBeNull();
    expect(runeProblem(run.build.runes, 7, "bastion", run.seed, "exact")).toMatch(/held on day 7/);
    expect(runeDawnOf(4, 5)).toBe(5);
    expect(runeDawnOf(5, 5)).toBe(6);
    expect(runeDawnOf(6, 5)).toBe(6);
    expect(runeDawnOf(7, 5)).toBe(7);
  }));

  it("the snapshot carries the taken LAST CHANCE last; a run without one snapshots as before", () => withLastChance(() => {
    const run = play("LLLLL", "furnace", 8);
    const offer = pendingLastChance(run)!;
    takeLastChance(run, "part");
    const g = ghostOf(run, 1, "p1", null);
    expect(g.lastChance).toEqual({ day: 5, boon: "part", id: offer.part });
    expect(Object.keys(g).at(-1)).toBe("lastChance");
    const plain = play("WWWW", "furnace", 8);
    expect(ghostOf(plain, 1, "p1", null).lastChance).toBeUndefined();
    expect(Object.keys(ghostOf(plain, 1, "p1", null))).not.toContain("lastChance");
  }));

  it("every card works for every boon value; a bad boon is refused", () => withLastChance(() => {
    for (const b of BOONS) {
      const run = play("LLLLL", "foundry", 21);
      expect(takeLastChance(run, b).ok).toBe(true);
      expect(run.lastChance!.boon).toBe(b);
    }
    const run = play("LLLLL", "foundry", 21);
    expect(takeLastChance(run, "gold" as Boon)).toEqual({ ok: false, reason: "NOT ON OFFER" });
  }));
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
  it("old saves load as before; a pending or taken LAST CHANCE survives; a malformed one is dropped", () => withLastChance(() => {
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
  }));
});
