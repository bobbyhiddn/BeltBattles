// RUNES-1 (REQ-BFG-058) M1: the rune system (src/sim/runes.ts), its run hooks (run.ts pendingRune / takeRune / runeDawn,
// day.ts finishDay) and its battle hooks (battle.ts via runeMods). Determinism, the offer rules (one tier a dawn with
// its fallback, the weighted draw, no held rune, one card a theme, FIX-10), the check (runeProblem), the grants, the
// whole-number rule and every effect kind on a real battle.
import { describe, expect, it } from "vitest";
import {
  GENERIC_THEMES, HERO_STYLE, KIND_UNIT, RUNE_LIST, RUNES, TIER_ODDS, dawnGold, offerSize, runeFits, runeGrants, runeMods,
  runeOffer, runeProblem, tierOdds, type RuneDef,
} from "../src/sim/runes";
import { HEROES, ITEMS, RARITIES, type HeroId } from "../src/sim/content";
import { newRun, pendingRune, takeRune, type Run } from "../src/game/run";
import { finishDay } from "../src/game/day";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { Battle, type Projectile } from "../src/sim/battle";
import { cloneBuild, type Build } from "../src/sim/deck";

const PLAYABLE: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const DEF_PATTERN = /^[a-z0-9_]{1,32}$/; // = src/net/snapshot.ts DEF_PATTERN
const fill = (d: RuneDef) => d.text.replace("{N}", d.amount.unit === "pct" ? `${d.amount.n}%` : String(d.amount.n));

describe("RUNES-1 M1: the catalogue", () => {
  // RUNES-2a: RUNES-1's 21 plus 40 (at least 8 epics and 4 legendaries, so epic and legendary dawns show their own tier)
  it("61 runes: 25 common, 20 rare, 11 epic, 5 legendary; ids unique and snapshot-safe, names 14 characters at most", () => {
    expect(RUNE_LIST.length).toBe(61);
    expect(RARITIES.map((t) => RUNE_LIST.filter((d) => d.tier === t).length)).toEqual([25, 20, 11, 5]);
    expect(new Set(RUNE_LIST.map((d) => d.id)).size).toBe(RUNE_LIST.length);
    expect(new Set(RUNE_LIST.map((d) => d.name)).size).toBe(RUNE_LIST.length);
    for (const d of RUNE_LIST) {
      expect(DEF_PATTERN.test(d.id), d.id).toBe(true);
      expect(d.name.length, d.name).toBeLessThanOrEqual(14);
      expect(RARITIES, d.id).toContain(d.tier);
      expect(RUNES[d.id]).toBe(d);
    }
    // RUNES-2a: no two runes share a kind at one tier, and every kind RUNES-2a added is one rune's (a new hook each)
    const shipped = RUNE_LIST.slice(0, 21).map((d) => d.kind);
    for (const d of RUNE_LIST.slice(21)) expect(shipped, `${d.id} reuses a shipped kind`).not.toContain(d.kind);
    expect(new Set(RUNE_LIST.slice(21).map((d) => d.kind)).size).toBe(40);
  });

  it("no rune shares a name with a shop piece or a hero", () => {
    const taken = new Set([...Object.values(ITEMS).map((i) => i.name), ...Object.values(HEROES).map((h) => h.name)]);
    for (const d of RUNE_LIST) expect(taken.has(d.name), d.name).toBe(false);
  });

  it("every amount is typed by its kind's unit and is a whole number; no rune text holds a literal number", () => {
    for (const d of RUNE_LIST) {
      expect(d.amount.unit, d.id).toBe(KIND_UNIT[d.kind]);
      expect(Number.isInteger(d.amount.n) && d.amount.n > 0, d.id).toBe(true);
      expect(/\d/.test(d.text), `${d.id}: "${d.text}" holds a literal number`).toBe(false);
      expect(d.text.split("{N}").length, `${d.id}: one {N}`).toBe(2);
    }
  });

  it("every number in every rune text is whole (the text as the amounts fill it in)", () => {
    for (const d of RUNE_LIST) {
      const text = fill(d);
      expect(/\d+\.\d/.test(text), `${d.id}: "${text}"`).toBe(false);
      for (const num of text.match(/\d+(?:\.\d+)?/g) ?? []) expect(Number.isInteger(Number(num)), `${d.id}: ${num}`).toBe(true);
    }
  });

  it("one idea a rune: a bare effect or TRIGGER: EFFECT, one sentence, no '·' chains", () => {
    for (const d of RUNE_LIST) {
      expect(d.text.includes("·"), d.id).toBe(false);
      expect(d.text.endsWith("."), d.id).toBe(true);
      expect(d.text.slice(0, -1).includes("."), d.id).toBe(false);
      expect((d.text.match(/:/g) ?? []).length, d.id).toBeLessThanOrEqual(1);
    }
  });

  it("every theme has a common, and the four hero styles each have a rare", () => {
    for (const t of [...GENERIC_THEMES, ...Object.values(HERO_STYLE)]) {
      expect(RUNE_LIST.some((d) => d.theme === t && d.tier === "common"), t).toBe(true);
    }
    for (const t of Object.values(HERO_STYLE)) expect(RUNE_LIST.some((d) => d.theme === t && d.tier === "rare"), t).toBe(true);
  });
});

describe("RUNES-1 M1: the odds and the offer", () => {
  it("R1b-2 1.1's odds: every row sums to 100; day 1 is all common; no legendary before day 5; day 14+ keeps the last row", () => {
    for (const row of TIER_ODDS) expect(row.reduce((a, b) => a + b, 0)).toBe(100);
    expect(tierOdds(1)).toEqual({ common: 100, rare: 0, epic: 0, legendary: 0 });
    for (let d = 1; d <= 4; d++) expect(tierOdds(d).legendary).toBe(0);
    expect(tierOdds(5)).toEqual({ common: 30, rare: 45, epic: 22, legendary: 3 });
    expect(tierOdds(10)).toEqual({ common: 0, rare: 33, epic: 52, legendary: 15 });
    expect(tierOdds(14)).toEqual(tierOdds(30));
  });

  it("1 of 3 on days 1-4, 1 of 2 from day 5", () => {
    expect([1, 2, 3, 4, 5, 6, 10, 14].map(offerSize)).toEqual([3, 3, 3, 3, 2, 2, 2, 2]);
  });

  it("deterministic: the same (seed, day, hero, held) gives the same offer; the stream is the rune stream, not the shop's", () => {
    for (const seed of [1, 7, 123456789, 4294967295]) for (let day = 1; day <= 10; day++) {
      const a = runeOffer(seed, day, "weaver", []);
      expect(runeOffer(seed, day, "weaver", [])).toEqual(a);
    }
    // different dawns differ somewhere (a stream per day)
    const days = Array.from({ length: 10 }, (_, i) => runeOffer(99, i + 1, "furnace", []).ids.join(","));
    expect(new Set(days).size).toBeGreaterThan(3);
  });

  it("every offer: the right size, one tier, distinct runes, none held, one card a theme, at least one that fits the hero", () => {
    let n = 0;
    for (const hero of PLAYABLE) for (let seed = 1; seed <= 60; seed++) {
      const held: string[] = [];
      for (let day = 1; day <= 10; day++) {
        const o = runeOffer(seed * 7919, day, hero, held);
        expect(o.ids.length, `${hero} ${seed} d${day}`).toBe(offerSize(day));
        const defs = o.ids.map((id) => RUNES[id]);
        expect(new Set(defs.map((d) => d.tier)).size).toBe(1);
        expect(defs[0].tier).toBe(o.tier);
        expect(new Set(o.ids).size).toBe(o.ids.length);
        for (const id of o.ids) expect(held).not.toContain(id);
        expect(new Set(defs.map((d) => d.theme)).size, `${hero} ${seed} d${day} themes`).toBe(defs.length);
        // FIX-10, whenever the tier still holds a rune that fits (late in a run every fitting one may be held)
        const canFit = RUNE_LIST.some((d) => d.tier === o.tier && !held.includes(d.id) && runeFits(d, hero));
        if (canFit) expect(defs.some((d) => runeFits(d, hero)), `${hero} ${seed} d${day} FIX-10`).toBe(true);
        held.push(o.ids[(seed + day) % o.ids.length]);
        n++;
      }
    }
    expect(n).toBe(4 * 60 * 10);
  });

  // RUNES-2a (decision 4): with epics and legendaries in the catalogue, RUNES-1's "every epic or legendary dawn shows RARE"
  // becomes: every dawn shows the tier it drew while that tier holds enough runes (1,600 dawns: 489 epic, 110 legendary)
  it("the tier fallback: with nothing held, every dawn shows the tier it drew, epic and legendary dawns too", () => {
    const shown: Record<string, number> = {};
    for (let seed = 1; seed <= 400; seed++) for (const day of [3, 5, 8, 10]) {
      const o = runeOffer(seed, day, "bastion", []);
      expect(o.tier, `${seed} d${day}`).toBe(o.drawn);
      shown[o.tier] = (shown[o.tier] ?? 0) + 1;
    }
    expect(shown).toEqual({ common: 396, rare: 605, epic: 489, legendary: 110 });
  });

  it("with a tier too thin for the offer, the next lower tier with enough runes, then a higher one", () => {
    const ids = (t: string) => RUNE_LIST.filter((d) => d.tier === t).map((d) => d.id);
    let rare = 0, epic = 0, legend = 0;
    for (let seed = 1; seed <= 200; seed++) {
      // every rare but one held: a rare dawn falls to common (the next lower tier); the other tiers stand
      const o = runeOffer(seed, 9, "weaver", ids("rare").slice(1));
      if (o.drawn === "rare") { expect(o.tier).toBe("common"); rare++; } else expect(o.tier).toBe(o.drawn);
      // every epic but two held on day 4 (3 cards): an epic dawn falls to rare
      const e = runeOffer(seed, 4, "foundry", ids("epic").slice(2));
      if (e.drawn === "epic") { expect(e.tier).toBe("rare"); epic++; }
      // every legendary but one held on day 8 (2 cards): a legendary dawn falls to epic
      const l = runeOffer(seed, 8, "bastion", ids("legendary").slice(1));
      if (l.drawn === "legendary") { expect([l.tier, l.ids.length]).toEqual(["epic", 2]); legend++; }
      // every common but one held on day 1 (all common odds): no lower tier, so the next higher one, rare
      expect(runeOffer(seed, 1, "weaver", ids("common").slice(1)).tier).toBe("rare");
    }
    expect([rare, epic, legend].every((n) => n > 5)).toBe(true);
  });

  it("the weighted draw: a hero's own style comes up more often than another hero's style", () => {
    const count: Record<string, number> = {};
    for (let seed = 1; seed <= 1500; seed++) for (const id of runeOffer(seed, 1, "furnace", []).ids) count[RUNES[id].theme] = (count[RUNES[id].theme] ?? 0) + 1;
    expect(count.furnace).toBeGreaterThan(count.weaver);
    expect(count.furnace).toBeGreaterThan(count.foundry);
    expect(count.furnace).toBeGreaterThan(count.bastion);
  });
});

describe("RUNES-1 M1: runeProblem (the check both sides run) and the grants", () => {
  // a legal run: take the first card of every dawn
  const legal = (seed: number, hero: HeroId, days: number) => {
    const held: string[] = [];
    for (let d = 1; d <= days; d++) held.push(runeOffer(seed, d, hero, held).ids[0]);
    return held.map((id) => ({ id }));
  };

  it("a legal pick sequence passes with its seed and without one; absent runes pass", () => {
    const runes = legal(4242, "foundry", 6);
    expect(runeProblem(runes, 6, "foundry", 4242)).toBeNull();
    expect(runeProblem(runes, 6, "foundry")).toBeNull();
    expect(runeProblem(runes.slice(0, 3), 6, "foundry", 4242)).toBeNull(); // fewer than day: allowed until RUNES-2
    expect(runeProblem(undefined, 6, "foundry", 4242)).toBeNull();
  });

  it("refuses one rune too many, an unknown id, a duplicate, a counter and a rune its dawn didn't offer", () => {
    const runes = legal(4242, "foundry", 6);
    expect(runeProblem(runes, 5, "foundry", 4242)).toMatch(/at most one a dawn/);
    expect(runeProblem([...runes.slice(0, 5), { id: "no_such_rune" }], 6, "foundry")).toMatch(/unknown rune/);
    expect(runeProblem([...runes.slice(0, 5), runes[0]], 6, "foundry")).toMatch(/held twice/);
    expect(runeProblem([{ id: runes[0].id, n: 3 }], 6, "foundry")).toMatch(/runes\[0\]\.n: not in this rules version/);
    const offered = runeOffer(4242, 1, "foundry", []).ids;
    const other = RUNE_LIST.find((d) => d.tier === "common" && !offered.includes(d.id))!;
    expect(runeProblem([{ id: other.id }], 1, "foundry", 4242)).toMatch(/not offered at the dawn of day 1/);
    expect(runeProblem([{ id: other.id }], 1, "foundry")).toBeNull(); // no seed (a served ghost): the offer rule is skipped
    expect(runeProblem("x", 1, "foundry")).toMatch(/expected a list/);
  });

  it("grants: HULL and BELT as taken; dawn gold from the dawn it is taken through the day's dusk", () => {
    expect(runeGrants([{ id: "iron_skin" }, { id: "tar_barrel" }, { id: "spare_hull" }], 3)).toEqual({ hull: 45, belt: 8, gold: 0 });
    expect(runeGrants([{ id: "coin_purse" }], 3).gold).toBe(3); // days 1, 2, 3
    expect(runeGrants([{ id: "iron_skin" }, { id: "fat_purse" }], 3).gold).toBe(4); // days 2, 3
    expect(dawnGold([{ id: "coin_purse" }, { id: "fat_purse" }, { id: "war_edge" }])).toBe(3);
    expect(runeMods(undefined)).toBeUndefined();
    // RUNES-2a: every battle field of a run-only rune is 0 (the field list grows with the catalogue)
    const mods = runeMods([{ id: "iron_skin" }])!;
    expect(Object.keys(mods)).toEqual(expect.arrayContaining(["shotDmg", "firstShotDmg", "pairDmg", "turretRate", "factoryRate", "startPlate", "heatPct", "startFray", "frayHit"]));
    expect(Object.values(mods).every((v) => v === 0)).toBe(true);
  });
});

describe("RUNES-1 M2: the dawn pick in the run", () => {
  const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
  const dusk = (run: Run) => finishDay(run, 0, 10, stats, stats);

  it("a new run owes day 1's pick (1 of 3, common); taking it applies it and clears the pick; no second pick that dawn", () => {
    const run = newRun("bastion", 31337);
    expect(run.runeDay).toBe(1);
    const o = pendingRune(run)!;
    expect(o.ids.length).toBe(3);
    expect(o.tier).toBe("common");
    expect(takeRune(run, "no_such_rune")).toEqual({ ok: false, reason: "NOT ON OFFER" });
    const before = { hull: run.build.hullBonus, belt: run.build.beltCap, gold: run.gold };
    const id = o.ids[0];
    expect(takeRune(run, id)).toEqual({ ok: true });
    expect(run.build.runes).toEqual([{ id }]);
    const d = RUNES[id];
    expect(run.build.hullBonus - before.hull).toBe(d.kind === "hull" ? d.amount.n : 0);
    expect(run.build.beltCap - before.belt).toBe(d.kind === "belt" ? d.amount.n : 0);
    expect(run.gold - before.gold).toBe(d.kind === "dawnGold" ? d.amount.n : 0);
    expect(run.runeDay).toBeUndefined();
    expect(pendingRune(run)).toBeNull();
    expect(takeRune(run, o.ids[1]).ok).toBe(false);
  });

  it("each dawn owes the next pick (held runes never offered again), pays dawn gold, and a reload shows the same cards", () => {
    const run = newRun("furnace", 777);
    for (let day = 1; day <= 7; day++) {
      expect(run.day).toBe(day);
      const o = pendingRune(run)!;
      expect(o.ids.length).toBe(offerSize(day));
      const copy = JSON.parse(JSON.stringify(run)) as Run; // a save and a reload
      expect(pendingRune(copy)).toEqual(o);
      const pick = o.ids.includes("coin_purse") ? "coin_purse" : o.ids[0];
      expect(takeRune(run, pick).ok).toBe(true);
      const gold = run.gold, purse = dawnGold(run.build.runes);
      dusk(run);
      expect(run.gold - gold).toBe(run.history[run.history.length - 1].income + purse);
    }
    expect(run.build.runes!.length).toBe(7);
    expect(new Set(run.build.runes!.map((q) => q.id)).size).toBe(7);
    expect(runeProblem(run.build.runes, run.day, run.hero, run.seed)).toBeNull();
  });

  it("a run that skipped a dawn (a save from before runes) is never offered one again", () => {
    const run = newRun("weaver", 5);
    delete run.runeDay; // a 0.8.6 save: no pick owed, no runes held
    dusk(run);
    expect(run.day).toBe(2);
    expect(run.runeDay).toBeUndefined();
    expect(pendingRune(run)).toBeNull();
  });
});

describe("RUNES-1 M1: the effects in battle (both sides; no RNG; nothing without runes)", () => {
  const foe = heroStartBuild("weaver");
  const withRunes = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: ids.map((id) => ({ id })) });
  /** The first `n` projectiles side 0 fires, in order. */
  function shots(b: Build, n: number, enemy = foe, seed = 11): Projectile[] {
    const bt = new Battle(b, enemy, seed);
    const out: Projectile[] = [];
    const seen = new Set<number>();
    while (!bt.over && out.length < n) {
      bt.step();
      for (const p of bt.projectiles) if (p.from === 0 && !seen.has(p.id)) { seen.add(p.id); out.push({ ...p }); }
    }
    return out;
  }

  it("a build without runes battles exactly as before (an empty list too)", () => {
    const b = heroStartBuild("foundry");
    const run = (x: Build) => { const bt = new Battle(x, foe, 5); while (!bt.over) bt.step(); return [bt.winner, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp]; };
    expect(run({ ...cloneBuild(b), runes: [] })).toEqual(run(b));
  });

  it("WAR EDGE: +1 DMG on every shot; SHARP SCRAP: +5 DMG on each turret's first shot only", () => {
    const b = heroStartBuild("furnace");
    const base = shots(b, 4), edge = shots(withRunes(b, "war_edge"), 4), sharp = shots(withRunes(b, "sharp_scrap"), 4);
    base.forEach((p, i) => expect(edge[i].dmg - p.dmg).toBeCloseTo(1, 9));
    const firsts = new Set<number>();
    base.forEach((p, i) => {
      const first = !firsts.has(p.turret);
      firsts.add(p.turret);
      expect(sharp[i].dmg - p.dmg).toBeCloseTo(first ? 5 : 0, 9);
    });
  });

  it("TWIN NAILS: +2 DMG on a PAIR shot (FOUNDRY's fused loads), nothing on a lone one", () => {
    const b = heroStartBuild("foundry");
    const base = shots(b, 8), nails = shots(withRunes(b, "twin_nails"), 8);
    expect(nails.every((p) => p.payload.paired)).toBe(true); // the rune's side reads pairs (a FOUNDRY fusion is one)
    base.forEach((p, i) => expect(nails[i].dmg - p.dmg).toBeCloseTo(2, 9));
    // WEAVER's darts come in one at a time: no pair, nothing added
    const w = heroStartBuild("weaver"), lone = shots(w, 6), wn = shots(withRunes(w, "twin_nails"), 6);
    lone.forEach((p, i) => expect([wn[i].payload.paired ?? false, wn[i].dmg - p.dmg]).toEqual([false, 0]));
  });

  it("GUN OIL / HAIR TRIGGER: turrets fire a whole % faster; OILED COGS / STOKED FIRES: factories run faster", () => {
    const b = heroStartBuild("weaver");
    const s0 = new Battle(b, foe, 1).sides[0];
    const pct = (...ids: string[]) => ids.reduce((s, id) => s + RUNES[id].amount.n, 0) / 100;
    const oil = new Battle(withRunes(b, "gun_oil", "hair_trigger"), foe, 1).sides[0];
    s0.turrets.forEach((tu, i) => expect(oil.turrets[i].interval).toBeCloseTo(tu.interval / (1 + pct("gun_oil", "hair_trigger")), 12));
    const cogs = new Battle(withRunes(b, "oiled_cogs", "stoked_fires"), foe, 1).sides[0];
    s0.factories.forEach((f, i) => expect(cogs.factories[i].pace).toBeCloseTo(f.pace * (1 + pct("oiled_cogs", "stoked_fires")), 12));
  });

  it("RIVET HOARD / GRAVE PLATES: PLATE at the start (PLATE_CAP holds); LOOSE THREAD / TANGLE WIRE: FRAY on the foe's hull", () => {
    const b = heroStartBuild("bastion");
    const bt = new Battle(withRunes(b, "rivet_hoard", "grave_plates", "loose_thread"), withRunes(foe, "tangle_wire"), 1);
    expect(bt.sides[0].plate.plate).toBe(18);
    expect(bt.sides[1].plate.plate).toBe(0);
    expect(bt.sides[1].hull.fray).toBe(3);
    expect(bt.sides[0].hull.fray).toBe(6); // the ghost's runes act on its side too
    const capped = new Battle(withRunes(b, "rivet_hoard", "grave_plates", ...[]), foe, 1);
    expect(capped.sides[0].plate.plate).toBeLessThanOrEqual(24);
  });

  it("HEAT SINK: a slug that carries HEAT (a HEAT JACKET's) gains 50% more of it on the ride", () => {
    const b = heroStartBuild("furnace");
    const heated = (x: Build) => {
      const bt = new Battle(x, foe, 2);
      let a: { p: { heat?: number; heatBonus?: number } } | undefined;
      while (!a) { bt.step(); a = bt.sides[0].routes.flatMap((r) => r.ammo)[0]; }
      a.p.heat = 0.4; // as a HEAT JACKET gives it
      for (let i = 0; i < 20; i++) bt.step();
      return a.p.heatBonus ?? 0;
    };
    const base = heated(b), sink = heated(withRunes(b, "heat_sink"));
    expect(base).toBeGreaterThan(0);
    expect(sink).toBeCloseTo(base * 1.5, 9);
  });

  it("DOUBLE KNOT: each WEAVER hit that adds FRAY adds 1 more", () => {
    const b = heroStartBuild("weaver");
    const fray = (x: Build) => {
      const bt = new Battle(x, heroStartBuild("bastion"), 3);
      while (!bt.over && bt.sides[1].hull.fray === 0) bt.step();
      return bt.sides[1].hull.fray;
    };
    expect(fray(withRunes(b, "double_knot")) - fray(b)).toBe(1);
  });
});

describe("RUNES-1 M2: a reload keeps the held runes and the pending pick (save.ts migrateRun)", () => {
  it("held runes and today's pending pick survive a save and a load; a malformed rune field is dropped", async () => {
    const { migrateRun } = await import("../src/game/save");
    const run = newRun("foundry", 2468);
    const o = pendingRune(run)!;
    takeRune(run, o.ids[1]);
    const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
    finishDay(run, 0, 10, stats, stats);
    const back = migrateRun(JSON.parse(JSON.stringify(run)))!;
    expect(back.build.runes).toEqual([{ id: o.ids[1] }]);
    expect(back.runeDay).toBe(2);
    expect(pendingRune(back)).toEqual(pendingRune(run));
    const bad = JSON.parse(JSON.stringify(run));
    bad.runeDay = "2";
    bad.build.runes = [{ name: "x" }];
    const fixed = migrateRun(bad)!;
    expect([fixed.runeDay, fixed.build.runes]).toEqual([undefined, undefined]);
  });
});
