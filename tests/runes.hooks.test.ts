// RUNES-2a (REQ-BFG-058) M2 and M3: each of the 40 new runes on a real battle (src/sim/battle.ts through runes.ts
// runeMods) or on the run (run.ts takeRune / runeDawn, runes.ts dawnGold / runeGrants). Base and rune battles share the
// seed, so their first shots line up and each test reads the rune's own difference. No rune hook draws on the RNG.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Battle, simulate, type Projectile, type SimEvent } from "../src/sim/battle";
import { AMMO, BURN_DPS, BURN_TIME, FRAY_BONUS } from "../src/sim/content";
import { cloneBuild, payloadDamage, turretList, type Build } from "../src/sim/deck";
import { pct } from "../src/sim/pct";
import { roundHalfUp } from "../src/sim/pct"; // NUM-2 (REQ-BFG-047): a turret's speed rounds half up once (battle.ts setSpeed)
import { rateMul, secPer } from "../src/sim/content"; // NUM-2: a whole rate % on the speed, 30 / speed
import { PLATE_CAP } from "../src/sim/races/bastion";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { RUNE_LIST, RUNES, dawnGold, mergedPieces, pickGold, runeGrants, runeMods, runeOffer } from "../src/sim/runes";
import { DORMANT_RUNES } from "../src/sim/runes"; // FLIP-X2: no dawn offers a dormant rune
import { newRun, pendingRune, takeRune } from "../src/game/run";
import { finishDay } from "../src/game/day";
import { battleRecordFor, replay } from "../src/net/replay";

const W = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), ...ids.map((id) => ({ id }))] });
const n = (id: string) => RUNES[id].amount.n;
const FOE = heroStartBuild("weaver");
type Shot = Projectile & { prior: number; ride: number; mult: number; ammo: string; paired: boolean };

/** The first `count` projectiles side 0 fires, as they leave (a copy with the load's prior, ride, mult and ammo). */
function fires(b0: Build, b1: Build, count: number, o: { seed?: number; setup?: (bt: Battle) => void; tick?: (bt: Battle) => void; wins?: [number, number] } = {}): Shot[] {
  const bt = new Battle(b0, b1, o.seed ?? 11, o.wins);
  o.setup?.(bt);
  const out: Shot[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < 60 * 60 && !bt.over && out.length < count; i++) {
    o.tick?.(bt);
    bt.step();
    for (const p of bt.projectiles) if (p.from === 0 && !seen.has(p.id)) {
      seen.add(p.id);
      out.push({ ...p, prior: p.payload.prior, ride: p.payload.ride, mult: p.payload.mult, ammo: p.payload.ammo, paired: !!p.payload.paired });
    }
  }
  return out.slice(0, count);
}

/** The first `count` impact events landing on `side`. */
function impacts(b0: Build, b1: Build, side: 0 | 1, count: number, setup?: (bt: Battle) => void, seed = 11): Extract<SimEvent, { type: "impact" }>[] {
  const bt = new Battle(b0, b1, seed);
  setup?.(bt);
  const out: Extract<SimEvent, { type: "impact" }>[] = [];
  for (let i = 0; i < 60 * 60 && !bt.over && out.length < count; i++) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "impact" && e.side === side) out.push({ ...e });
  }
  return out.slice(0, count);
}


describe("RUNES-2a: the catalogue block", () => {
  // RUNES-087F (cap's Q2 guard): EMBER SHOT is a generic epic (turrets), MANY HANDS a generic common (turrets)
  it("36 new runes (40 built, 4 left out on the bench): 11 common, 9 rare, 11 epic, 5 legendary, each on a kind of its own", () => {
    const block = RUNE_LIST.slice(21);
    expect(block.length).toBe(36);
    expect(["common", "rare", "epic", "legendary"].map((t) => block.filter((d) => d.tier === t).length)).toEqual([11, 9, 11, 5]);
    expect([RUNES.ember_shot.tier, RUNES.ember_shot.theme, RUNES.many_hands.theme]).toEqual(["epic", "turrets", "turrets"]);
    expect(new Set(block.map((d) => d.kind)).size).toBe(36);
    for (const gone of ["hot_iron", "wind_veil", "loose_molds", "saints_oil"]) expect(RUNES[gone], gone).toBeUndefined();
  });

  it("no rune hook draws on the RNG (battle.ts: the RUNES-2a hook block and every RUNES-2a line hold no rng)", () => {
    const src = readFileSync(new URL("../src/sim/battle.ts", import.meta.url), "utf8");
    const from = src.indexOf("// ---- RUNES-2a (REQ-BFG-058): the new runes' battle hooks");
    const to = src.indexOf("private runeHalf(", from);
    expect(from > 0 && to > from).toBe(true);
    expect(src.slice(from, src.indexOf("\n  }\n", to))).not.toMatch(/rng/);
    for (const line of src.split("\n")) if (/RUNES-2a/.test(line)) expect(line, line).not.toMatch(/rng/);
  });

  it("a build whose runes are only the run's (HULL, BELT, gold) battles exactly as one without runes", () => {
    const b = heroStartBuild("foundry");
    const end = (x: Build) => { const bt = simulate(x, FOE, 5); return [bt.winner, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp]; };
    expect(end(W(b, "coin_purse", "rune_tithe", "spoils_sack"))).toEqual(end(b));
  });
});

describe("RUNES-2a M2: the epics and legendaries", () => {
  // RUNES-087F (cap's Q1): MOLTEN VOWS is FOUNDRY's legendary (firing twice defines the run), its text and amount as before
  it("MOLTEN VOWS (legendary): a PAIR shot fires twice at its one target (same aim, no new draw), 0.08 s apart", () => {
    expect([RUNES.molten_vows.tier, RUNES.molten_vows.amount.n, RUNES.molten_vows.text]).toEqual(["legendary", 2, "YOUR {*PAIR} SHOTS FIRE {N} TIMES."]);
    const b = heroStartBuild("foundry");
    const base = fires(b, FOE, 4), vows = fires(W(b, "molten_vows"), FOE, 8);
    expect(vows.every((p) => p.paired)).toBe(true);
    base.forEach((p, i) => {
      const [a, c] = [vows[2 * i], vows[2 * i + 1]];
      expect([a.tx, a.ty, a.dmg, a.target]).toEqual([p.tx, p.ty, p.dmg, p.target]);
      expect([c.tx, c.ty, c.dmg, c.payload]).toEqual([a.tx, a.ty, a.dmg, a.payload]);
      expect(c.flight - a.flight).toBeCloseTo(0.08, 9);
    });
    // a lone load (WEAVER's darts come one at a time) fires once
    const w = heroStartBuild("weaver");
    expect(fires(W(w, "molten_vows"), FOE, 6).map((p) => p.tx)).toEqual(fires(w, FOE, 6).map((p) => p.tx));
  });

  it("SCRAP SAINT: +5% DMG per merged piece (rigs, factories, gear, cores and turrets at 2 or 3 stars)", () => {
    const b = cloneBuild(heroStartBuild("furnace"));
    const list = turretList(b);
    list[0].stars = 2;
    b.turrets = list;
    b.items[0].stars = 2;
    expect(mergedPieces(b)).toBe(2);
    const base = fires(b, FOE, 4), saint = fires(W(b, "scrap_saint"), FOE, 4);
    // NUM-1: whole damage; the runes' % sum applies once, rounded half up (pct, as battle.ts fire applies runeMul)
    base.forEach((p, i) => expect(saint[i].dmg).toBe(pct(p.dmg, 100 + 2 * n("scrap_saint"))));
    expect(fires(W(heroStartBuild("furnace"), "scrap_saint"), FOE, 2).map((p) => p.dmg)).toEqual(fires(heroStartBuild("furnace"), FOE, 2).map((p) => p.dmg));
  });

  it("SCAB IRON: each hit you take gives 1 PLATE, after that hit's soak (PLATE_CAP holds)", () => {
    const b = heroStartBuild("furnace");
    const bt = new Battle(W(b, "scab_iron"), FOE, 3);
    let hits = 0;
    while (!bt.over && hits < 6) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "impact" && e.side === 0) hits++; }
    expect(bt.sides[0].plate.gained).toBe(hits * n("scab_iron"));
    const none = new Battle(b, FOE, 3);
    for (let i = 0; i < bt.ticks; i++) none.step();
    expect(none.sides[0].plate.gained).toBe(0);
  });

  it("WIDOW'S WEB: +2% DMG per FRAY on the foe's hull", () => {
    const b = heroStartBuild("furnace");
    const setup = (bt: Battle) => { bt.sides[1].hull.fray = 10; };
    const base = fires(b, FOE, 1, { setup }), web = fires(W(b, "widows_web"), FOE, 1, { setup });
    expect(web[0].dmg).toBe(pct(base[0].dmg, 100 + 10 * n("widows_web"))); // NUM-1: the % sum once, rounded half up
  });

  it("THREAD STORM: a hit that adds no FRAY (FURNACE's slugs) adds 1; a FRAY hit adds as before", () => {
    const fray = (b: Build) => { const bt = new Battle(b, heroStartBuild("bastion"), 4); while (!bt.over && bt.sides[1].hull.fray === 0 && bt.t < 20) bt.step(); return bt.sides[1].hull.fray; };
    expect(fray(heroStartBuild("furnace"))).toBe(0);
    expect(fray(W(heroStartBuild("furnace"), "thread_storm"))).toBe(n("thread_storm"));
    expect(fray(W(heroStartBuild("weaver"), "thread_storm"))).toBe(fray(heroStartBuild("weaver")));
  });

  it("PYRE HEART: your BURN on their hull deals 50% more (ASH KINDLE's 4 BURN: 40 a second, 60 with it)", () => {
    const loss = (b: Build) => { const bt = new Battle(b, FOE, 9); const hp = bt.sides[1].hull.hp; for (let i = 0; i < 60; i++) bt.step(); return hp - bt.sides[1].hull.hp; };
    const b = heroStartBuild("furnace");
    // NUM-1: a BURN stack ticks once a second, BURN_DPS (10) each; the rune's % rounds half up once (pct)
    expect(loss(W(b, "ash_kindle"))).toBe(n("ash_kindle") * BURN_DPS); // no shot lands in the first second
    expect(loss(W(b, "ash_kindle", "pyre_heart"))).toBe(pct(n("ash_kindle") * BURN_DPS, 100 + n("pyre_heart")));
  });

  it("LAST STAND: below half HULL your turrets and factories work 50% faster; above half as before", () => {
    const cd = (b: Build, low: boolean) => {
      const bt = new Battle(b, FOE, 2);
      if (low) bt.sides[0].hull.hp = bt.sides[0].hull.max * 0.4;
      while (!bt.over && bt.sides[0].stats.shots === 0) bt.step();
      return bt.sides[0].turrets.find((t) => t.fireCd > 0)!.fireCd;
    };
    const b = heroStartBuild("furnace");
    expect(cd(W(b, "last_stand"), true)).toBeCloseTo(cd(b, true) / (1 + n("last_stand") / 100), 9);
    expect(cd(W(b, "last_stand"), false)).toBeCloseTo(cd(b, false), 12);
    // a factory's stamp timer after one tick (it starts at 0.35 s): it runs 50% faster below half hull
    const timer = (x: Build, low: boolean) => { const bt = new Battle(x, FOE, 2); if (low) bt.sides[0].hull.hp = bt.sides[0].hull.max * 0.4; bt.step(); return 0.35 - bt.sides[0].factories[0].timer; };
    expect(timer(W(b, "last_stand"), true)).toBeCloseTo(timer(b, true) * (1 + n("last_stand") / 100), 12);
    expect(timer(W(b, "last_stand"), false)).toBeCloseTo(timer(b, false), 12);
  });

  it("IRON HIDE: each hit on you deals 1 less", () => {
    const b = heroStartBuild("bastion");
    const base = impacts(b, FOE, 0, 5), hide = impacts(W(b, "iron_hide"), FOE, 0, 5);
    base.forEach((e, i) => expect(hide[i].dmg).toBeCloseTo(Math.max(0, e.dmg - n("iron_hide")), 9));
  });

  it("RUNE TITHE: at each dawn 1 GOLD per rune held, its own dawn too; the budget (runeGrants) is exactly what the runes paid", () => {
    expect(dawnGold([{ id: "rune_tithe" }, { id: "iron_skin" }, { id: "war_edge" }])).toBe(3);
    expect(pickGold(RUNES.rune_tithe, 4, false)).toBe(4);
    const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
    const run = newRun("weaver", 31);
    let got = 0; // the gold the runes have paid
    // a pick as run.ts takeRune applies it (the gold for its own dawn at once), for runes no offer is forced to show
    const take = (id: string) => {
      run.build.runes = [...(run.build.runes ?? []), { id }];
      const g = pickGold(RUNES[id], run.build.runes.length, run.history[run.history.length - 1]?.outcome === "win");
      run.gold += g;
      got += g;
      delete run.runeDay;
    };
    const picks = ["iron_skin", "rune_tithe", "war_edge", "sharp_scrap", "tar_barrel", "gun_oil"]; // only the tithe pays gold
    const tithe: number[] = [];
    for (let day = 1; day <= 6; day++) {
      take(picks[day - 1]);
      expect(runeGrants(run.build.runes, day).gold, `day ${day}`).toBe(got);
      tithe.push(got);
      if (day < 6) {
        const g = run.gold;
        finishDay(run, day % 2 ? 0 : 1, 10, stats, stats);
        got += run.gold - g - run.history[run.history.length - 1].income;
      }
    }
    // taken at the dawn of day 2 (2 runes then), then 2, 3, 4, 5 at the dawns of days 3-6 (the runes held before each pick)
    expect(tithe).toEqual([0, 2, 4, 7, 11, 16]);
  });

  it("FORGE WARD: each stamp gives 10 PLATE (PLATE_CAP holds)", () => {
    const bt = new Battle(W(heroStartBuild("weaver"), "forge_ward"), FOE, 6);
    while (!bt.over && bt.sides[0].stats.produced < 5) bt.step();
    expect(bt.sides[0].plate.gained).toBe(Math.min(PLATE_CAP, 5 * n("forge_ward"))); // NUM-1: the cap 240 (was a bare 24)
  });

  it("WARLORD'S DUE: +5% DMG per win the side carried in; the record keeps the wins and replays exactly", () => {
    const b = heroStartBuild("furnace");
    const base = fires(b, FOE, 3), due = fires(W(b, "warlords_due"), FOE, 3, { wins: [4, 0] });
    base.forEach((p, i) => expect(due[i].dmg).toBe(pct(p.dmg, 100 + 4 * n("warlords_due")))); // NUM-1: the % sum once, rounded half up
    expect(fires(W(b, "warlords_due"), FOE, 3).map((p) => p.dmg)).toEqual(base.map((p) => p.dmg)); // no wins: as before
    const bt = new Battle(W(b, "warlords_due"), FOE, 7, [4, 2]);
    expect(bt.record.wins).toEqual([4, 2]);
    expect(new Battle(b, FOE, 7, [4, 2]).record.wins).toBeUndefined(); // nobody reads them: the record is as before
    const rec = battleRecordFor(W(b, "warlords_due"), FOE, 7, [4, 2]);
    expect(rec.wins).toEqual([4, 2]);
    expect(battleRecordFor(b, FOE, 7, [4, 2])).not.toHaveProperty("wins");
    const end = simulate(W(b, "warlords_due"), FOE, 7, undefined, [4, 2]);
    expect(replay(JSON.parse(JSON.stringify(rec)))).toEqual({ winner: end.winner, ticks: end.ticks, hulls: [end.sides[0].hull.hp, end.sides[1].hull.hp] });
    expect(() => replay({ ...rec, wins: [4, 99] } as never)).toThrow(/wins/);
  });

  // RUNES-087F (cap's Q1): TWIN SUNS is FOUNDRY's epic, "+N% DMG" on a PAIR shot (RUNES-2a's legendary was x2)
  it("TWIN SUNS (epic): a PAIR shot deals +33% DMG; a lone one as before", () => {
    expect([RUNES.twin_suns.tier, RUNES.twin_suns.amount]).toEqual(["epic", { unit: "pct", n: 33 }]);
    const b = heroStartBuild("foundry");
    const base = fires(b, FOE, 4), suns = fires(W(b, "twin_suns"), FOE, 4);
    expect(suns.every((p) => p.paired)).toBe(true);
    base.forEach((p, i) => expect(suns[i].dmg).toBe(pct(p.dmg, 100 + n("twin_suns")))); // NUM-1: the % once, rounded half up
    const w = heroStartBuild("weaver");
    expect(fires(W(w, "twin_suns"), FOE, 4).map((p) => p.dmg)).toEqual(fires(w, FOE, 4).map((p) => p.dmg));
  });

  it("BULWARK OATH: every PLATE gain x2 (RIVET HOARD's 60 start as 120; BASTION's bulwark slugs plate twice), PLATE_CAP holds", () => {
    const start = (x: Build) => new Battle(x, FOE, 1).sides[0].plate.plate;
    const f = heroStartBuild("furnace");
    expect(start(W(f, "rivet_hoard", "bulwark_oath"))).toBe(n("rivet_hoard") * n("bulwark_oath"));
    expect(start(W(f, "rivet_hoard", "grave_plates", "bulwark_oath"))).toBe(PLATE_CAP); // the cap (NUM-1: 240, was a bare 24)
    // BASTION: the plating its bulwark slugs add by the first 3 loads, doubled (both well under the cap)
    const gained = (x: Build) => {
      const bt = new Battle(x, FOE, 4);
      let loads = 0;
      while (!bt.over && loads < 3) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "load" && e.side === 0) loads++; }
      return bt.sides[0].plate.gained;
    };
    const b = heroStartBuild("bastion");
    expect(gained(b)).toBeGreaterThan(0);
    expect(gained(W(b, "bulwark_oath"))).toBe(Math.min(PLATE_CAP, gained(b) * n("bulwark_oath"))); // NUM-1: whole plating; the cap 240 (was 24)
  });

  it("LOOM OF WOE: your FRAY bonus x2 (10 FRAY: +2 a hit becomes +4)", () => {
    const b = heroStartBuild("furnace");
    const setup = (bt: Battle) => { bt.sides[1].hull.fray = 10; };
    const base = impacts(b, FOE, 1, 1, setup), loom = impacts(W(b, "loom_of_woe"), FOE, 1, 1, setup);
    expect(loom[0].dmg - base[0].dmg).toBeCloseTo(10 * FRAY_BONUS * (n("loom_of_woe") - 1), 9);
  });

  it("FIRST BLOOD: the first shot of each volley +70% DMG, the rest as before; EMBER SHOT: that shot adds 1 BURN", () => {
    const b = heroStartBuild("weaver");
    const base = fires(b, FOE, 12), first = fires(W(b, "first_blood"), FOE, 12), ember = fires(W(b, "ember_shot"), FOE, 12);
    const k = 1 + n("first_blood") / 100;
    const ratios = base.map((p, i) => first[i].dmg / p.dmg);
    expect(ratios.every((r) => Math.abs(r - 1) < 1e-9 || Math.abs(r - k) < 1e-9)).toBe(true);
    expect(ratios[0]).toBeCloseTo(k, 9);
    expect(ratios.filter((r) => r > 1.1).length).toBeGreaterThanOrEqual(2);
    // EMBER SHOT marks exactly the volley openers FIRST BLOOD lifts, and changes no shot's DMG
    expect(ember.map((p) => p.runeBurn ?? 0)).toEqual(ratios.map((r) => (r > 1.1 ? n("ember_shot") : 0)));
    expect(ember.map((p) => p.dmg)).toEqual(base.map((p) => p.dmg));
    const bt = new Battle(W(heroStartBuild("furnace"), "ember_shot"), FOE, 3);
    while (!bt.over && !bt.sides[1].hull.burns.some((x) => x.dps === n("ember_shot")) && bt.t < 20) bt.step();
    expect(bt.sides[1].hull.burns.some((x) => x.dps === n("ember_shot"))).toBe(true);
  });

  it("THE LONG ROAD: a load's RIDE bonus x2", () => {
    const b = heroStartBuild("furnace");
    const base = fires(b, FOE, 3), road = fires(W(b, "long_road"), FOE, 3);
    base.forEach((p, i) => {
      const a = AMMO[p.ammo as keyof typeof AMMO];
      // NUM-1: a slug's damage is whole, rounded half up once when fired (deck.ts payloadDamage), so the rune's extra
      // rideScale x ride x mult x (n - 1) lands inside that one rounding: the shot is the slug's damage with its ride x n
      const dmg = (ride: number) => payloadDamage(p.payload.base ?? a.base, a.rideScale, ride, p.mult, p.payload.flat + (p.payload.heatBonus ?? 0));
      expect(p.dmg).toBe(dmg(p.ride));
      expect(road[i].dmg).toBe(dmg(p.ride * n("long_road")));
    });
    expect(base.some((p) => p.ride > 0)).toBe(true);
  });
});

describe("RUNES-2a M3: the commons and rares", () => {
  it("ASH KINDLE: the foe starts with 4 BURN; SLOW EMBERS: your BURN lasts 50% longer", () => {
    const bt = new Battle(W(heroStartBuild("furnace"), "ash_kindle"), FOE, 1);
    expect(bt.sides[1].hull.burns).toEqual([{ dps: n("ash_kindle"), t: BURN_TIME }]);
    expect(bt.sides[0].hull.burns).toEqual([]);
    const slow = new Battle(W(heroStartBuild("furnace"), "ash_kindle", "slow_embers"), FOE, 1);
    expect(slow.sides[1].hull.burns[0].t).toBeCloseTo(BURN_TIME * (1 + n("slow_embers") / 100), 12);
  });

  it("BARBED SILK: +1 DMG on a load that adds FRAY (WEAVER's darts); none on a slug", () => {
    const w = heroStartBuild("weaver");
    const base = fires(w, FOE, 4), silk = fires(W(w, "barbed_silk"), FOE, 4);
    base.forEach((p, i) => expect(silk[i].dmg - p.dmg).toBeCloseTo(n("barbed_silk"), 9));
    const f = heroStartBuild("furnace");
    expect(fires(W(f, "barbed_silk"), FOE, 3).map((p) => p.dmg)).toEqual(fires(f, FOE, 3).map((p) => p.dmg));
  });

  it("MANY HANDS: your turrets +12% RATE per turret (WEAVER's 3: +36%)", () => {
    const w = heroStartBuild("weaver");
    const s0 = new Battle(w, FOE, 1).sides[0], s1 = new Battle(W(w, "many_hands"), FOE, 1).sides[0];
    // NUM-2 (REQ-BFG-047, N1 2.3): the rune's % multiplies each turret's unrounded speed inside its one rounding (battle.ts
    // setSpeed): 30 / roundHalfUp(55 x 1.36 = 74.8) = 30 / 75 = 0.4 s (was the interval / 1.36 = 0.401 s)
    s0.turrets.forEach((tu, i) => expect(s1.turrets[i].interval).toBeCloseTo(secPer(roundHalfUp(tu.speedRaw * rateMul(n("many_hands") * s0.turrets.length))), 12)); // NUM-2 (was tu.interval / (1 + 36 / 100))
  });

  it("SEAM RIVETS: each PAIR gives PLATE (FOUNDRY's fusions)", () => {
    const bt = new Battle(W(heroStartBuild("foundry"), "seam_rivets"), FOE, 2);
    let pairs = 0;
    while (!bt.over && pairs < 3) { bt.step(); for (const e of bt.drainEvents()) if (e.type === "pair" && e.side === 0) pairs++; }
    expect(bt.sides[0].plate.gained).toBe(pairs * n("seam_rivets"));
    expect(pairs).toBe(3);
  });

  it("HOT SEAM: a PAIR shot adds 1 BURN on their hull", () => {
    const bt = new Battle(W(heroStartBuild("foundry"), "hot_seam"), FOE, 2);
    while (!bt.over && bt.sides[1].hull.burns.length === 0 && bt.t < 20) bt.step();
    expect(bt.sides[1].hull.burns.some((x) => x.dps === n("hot_seam"))).toBe(true);
  });

  it("LAST WALL: once, when your HULL first drops below half: 8 PLATE", () => {
    const bt = new Battle(W(heroStartBuild("furnace"), "last_wall"), heroStartBuild("foundry"), 5);
    bt.sides[0].hull.hp = bt.sides[0].hull.max * 0.6;
    while (!bt.over && bt.sides[0].hull.hp >= bt.sides[0].hull.max / 2) bt.step();
    if (!bt.over) bt.step();
    expect(bt.sides[0].halfPlated).toBe(true);
    expect(bt.sides[0].plate.gained).toBe(n("last_wall"));
    for (let i = 0; i < 120 && !bt.over; i++) bt.step();
    expect(bt.sides[0].plate.gained).toBe(n("last_wall"));
  });

  it("FINAL NAIL: +1 DMG on the shot that empties a volley, never on the others", () => {
    const w = heroStartBuild("weaver");
    const base = fires(w, FOE, 12), nail = fires(W(w, "final_nail"), FOE, 12);
    const d = base.map((p, i) => nail[i].dmg - p.dmg);
    expect(d.every((x) => Math.abs(x) < 1e-9 || Math.abs(x - n("final_nail")) < 1e-9)).toBe(true);
    expect(d.filter((x) => x > n("final_nail") / 2).length).toBeGreaterThanOrEqual(2); // WEAVER's darts: each empties its window
  });

  it("SCRAP BITER: +1 DMG on a hit that lands on a machine, none on the bare hull", () => {
    const b = heroStartBuild("furnace");
    const base = impacts(b, FOE, 1, 10), biter = impacts(W(b, "scrap_biter"), FOE, 1, 10);
    base.forEach((e, i) => expect(biter[i].dmg - e.dmg).toBeCloseTo(e.kind === "hull" ? 0 : n("scrap_biter"), 9));
    expect(base.some((e) => e.kind !== "hull") && base.some((e) => e.kind === "hull")).toBe(true);
  });

  it("QUICK LATCH: your rigs come online 50% sooner", () => {
    const b = heroRefBuild("furnace", 6);
    const g0 = new Battle(b, FOE, 1).sides[0].gates, g1 = new Battle(W(b, "quick_latch"), FOE, 1).sides[0].gates;
    expect(g0.length).toBeGreaterThan(0);
    g0.forEach((g, i) => expect(g1[i].commissionAt).toBeCloseTo(Number.isFinite(g.commissionAt) ? g.commissionAt * (1 - n("quick_latch") / 100) : Infinity, 12));
  });

  it("ASH CLOAK: BURN on your hull deals 50% less", () => {
    const loss = (b0: Build) => { const bt = new Battle(b0, W(heroStartBuild("weaver"), "ash_kindle"), 9); const hp = bt.sides[0].hull.hp; for (let i = 0; i < 60; i++) bt.step(); return hp - bt.sides[0].hull.hp; };
    const b = heroStartBuild("furnace");
    expect(loss(W(b, "ash_cloak"))).toBeCloseTo(loss(b) * (1 - n("ash_cloak") / 100), 6);
    expect(loss(b)).toBeGreaterThan(0);
  });

  it("BULKHEADS: HULL per turret; SCRAP HALO: HULL per merged piece (this battle's hull, not the build's)", () => {
    const w = heroStartBuild("weaver");
    const s0 = new Battle(w, FOE, 1).sides[0];
    const s1 = new Battle(W(w, "bulkheads"), FOE, 1).sides[0];
    expect(s1.hull.max - s0.hull.max).toBe(n("bulkheads") * s0.turrets.length);
    expect(s1.hull.hp).toBe(s1.hull.max);
    const m = cloneBuild(w);
    m.items[0].stars = 2;
    const s2 = new Battle(W(m, "scrap_halo"), FOE, 1).sides[0];
    expect(s2.hull.max - new Battle(m, FOE, 1).sides[0].hull.max).toBe(n("scrap_halo"));
  });

  it("SPOILS SACK: 2 GOLD at a dawn after a won dusk, none after a loss; the budget counts every dawn from its pick", () => {
    expect([dawnGold([{ id: "spoils_sack" }], true), dawnGold([{ id: "spoils_sack" }], false)]).toEqual([2, 0]);
    expect(runeGrants([{ id: "spoils_sack" }], 4).gold).toBe(2 * 3); // dawns 2, 3, 4 (never day 1's: no dusk before it)
    expect(runeGrants([{ id: "iron_skin" }, { id: "spoils_sack" }], 4).gold).toBe(2 * 3); // dawns 2, 3, 4
    expect(runeGrants([{ id: "iron_skin" }, { id: "war_edge" }, { id: "spoils_sack" }], 4).gold).toBe(2 * 2); // dawns 3, 4
    const run = newRun("furnace", 8);
    takeRune(run, pendingRune(run)!.ids[0]);
    run.build.runes = [...run.build.runes!, { id: "spoils_sack" }];
    const stats = { shots: 0, damage: 0, firstShot: -1, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 };
    const g0 = run.gold;
    finishDay(run, 0, 10, stats, stats); // a win: income + 2
    expect(run.gold - g0 - run.history[0].income - dawnGold(run.build.runes.filter((q) => q.id !== "spoils_sack"))).toBe(2);
  });

  it("SNARE KNOT: +2 DMG on a hit landing on a hull at its FRAY cap", () => {
    const b = heroStartBuild("furnace");
    const full = (bt: Battle) => { bt.sides[1].hull.fray = bt.sides[1].hull.frayMax; };
    const base = impacts(b, FOE, 1, 3, full), knot = impacts(W(b, "snare_knot"), FOE, 1, 3, full);
    base.forEach((e, i) => expect(knot[i].dmg - e.dmg).toBeCloseTo(n("snare_knot"), 9));
    const none = impacts(W(b, "snare_knot"), FOE, 1, 3);
    impacts(b, FOE, 1, 3).forEach((e, i) => expect(none[i].dmg).toBeCloseTo(e.dmg, 9));
  });

  it("IRON TEMPER: +3 DMG on your shots while your hull holds PLATE", () => {
    const b = W(heroStartBuild("furnace"), "rivet_hoard");
    const base = fires(b, FOE, 1), temper = fires(W(b, "iron_temper"), FOE, 1);
    expect(temper[0].dmg - base[0].dmg).toBeCloseTo(n("iron_temper"), 9);
    const bare = heroStartBuild("furnace");
    expect(fires(W(bare, "iron_temper"), FOE, 1)[0].dmg).toBeCloseTo(fires(bare, FOE, 1)[0].dmg, 9);
  });

  it("TOLL ROAD: +5% DMG per rig the load passed", () => {
    const b = heroRefBuild("furnace", 6);
    const base = fires(b, FOE, 6), road = fires(W(b, "toll_road"), FOE, 6);
    base.forEach((p, i) => expect(road[i].dmg).toBe(pct(p.dmg, 100 + n("toll_road") * p.prior))); // NUM-1: the % sum once, rounded half up
    expect(base.some((p) => p.prior > 0)).toBe(true);
  });

  it("WARD STONE: the foe's first 3 hits deal no DMG, the 4th on as before", () => {
    const b = heroStartBuild("bastion");
    const base = impacts(b, FOE, 0, 5), ward = impacts(W(b, "ward_stone"), FOE, 0, 5);
    expect(ward.slice(0, 3).map((e) => e.dmg)).toEqual([0, 0, 0]);
    expect(ward[3].dmg).toBeCloseTo(base[3].dmg, 9);
  });

  it("STEADY IRON: a STALL on your machines lasts 100% less (none)", () => {
    const stall = (b: Build) => {
      const bt = new Battle(b, FOE, 1);
      const s = bt.sides[0], f = s.factories[0];
      const t = s.targets.find((x) => x.kind === "factory" && x.ref === f.uid)!;
      (bt as unknown as { disrupt: (s: unknown, t: unknown, secs: number, c: string) => boolean }).disrupt(s, t, 1.6, "shock");
      return f.disrupted;
    };
    const b = heroStartBuild("furnace");
    expect(stall(W(b, "steady_iron"))).toBeCloseTo(stall(b) * (1 - n("steady_iron") / 100), 12);
    expect(stall(b)).toBeCloseTo(1.6, 12);
  });
});

describe("RUNES-2a: what a pick of each tier looks like now", () => {
  it("every new rune is offered somewhere in 600 runs' first 10 dawns (none is unreachable)", () => {
    const seen = new Set<string>();
    for (const hero of ["furnace", "weaver", "foundry", "bastion"] as const) for (let seed = 1; seed <= 150; seed++) {
      const held: string[] = [];
      for (let day = 1; day <= 10; day++) { const o = runeOffer(seed * 31, day, hero, held); o.ids.forEach((id) => seen.add(id)); held.push(o.ids[seed % o.ids.length]); }
    }
    // FLIP-X2 (REVIEW-TUNEX): RUNE_LIST's two dormant runes (DORMANT_RUNES: COAL CHUTE, HEAT SINK) are offered nowhere, every
    // other one somewhere (was every RUNE_LIST rune offered); and no dormant rune at all (SEARING and SHATTER SHOT neither)
    for (const d of RUNE_LIST) expect(seen.has(d.id), d.id).toBe(!DORMANT_RUNES.has(d.id));
    expect([...seen].filter((id) => DORMANT_RUNES.has(id))).toEqual([]);
    void runeMods;
  });
});

