// SUS-A (REQ-BFG-069; SUSTAIN-1 4.2-4.7 as cap accepted it): SHIELD, HEAL and REGEN in the battle. SHIELD is a whole count
// (MAX 3) that stops whole hits where WARD STONE's blockHits did; heal() is every hull gain (never past max hull, nothing
// from 25 s, half with BURN on the hull); REGEN heals at each whole second on the integer tick count; the new timers
// carry their remainder and pause while their piece is stalled; the pieces stay out of every listing behind one switch.
import { describe, expect, it } from "vitest";
import { Battle, type Payload, type SimEvent, type Target } from "../src/sim/battle";
import {
  HEROES, ITEMS, SHIELD_CAP, SUSTAIN_IDS, SUSTAIN_LIVE, TICK, WIND_START, buyableModules, itemsSoldBy, sustainLive, withSustain,
} from "../src/sim/content";
import { arrowCell, cloneBuild, installedTurrets, occupancy, rigArrows, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { KIND_UNIT, RUNES } from "../src/sim/runes";
import { effectAt } from "../src/sim/stars";
import { rateDeck } from "../src/sim/deckRating";
import { validateBuild } from "../src/net/validate";

const FOE = heroStartBuild("weaver");
type Heal = Extract<SimEvent, { type: "heal" }>;
type Shield = Extract<SimEvent, { type: "shield" }>;

/** b with gear `def` on its first installed turret. */
function withGear(b0: Build, def: string, stars = 1): Build {
  const b = cloneBuild(b0);
  b.mods.push({ uid: 900, def, turret: installedTurrets(b)[0].slot, ...(stars > 1 ? { stars } : {}) });
  return b;
}

/** b with its signature factory turned into a MEND PRESS (same spot and belts). */
function withPress(b0: Build, stars = 1): Build {
  const b = cloneBuild(b0);
  const f = b.items.find((p) => p.def === HEROES[b.hero].factory)!;
  f.def = "mendpress";
  if (stars > 1) f.stars = stars;
  return b;
}

/** b with a RIVETER on the first free cell (off the forward row) whose arrow hits a belt tile. */
function withRiveter(b0: Build): { b: Build; uid: number } {
  const b = cloneBuild(b0), occ = occupancy(b);
  for (let k = 10; k < 100; k++) {
    if (occ[k].item >= 0 || occ[k].route >= 0) continue;
    for (let rot = 0; rot < 4; rot++) {
      if (!rigArrows("riveter", rot).some((d) => { const c = arrowCell(k % 10, Math.floor(k / 10), d); return c >= 0 && occ[c].route >= 0; })) continue;
      b.items.push({ uid: 901, def: "riveter", x: k % 10, y: Math.floor(k / 10), ...(rot ? { rot } : {}) });
      return { b, uid: 901 };
    }
  }
  throw new Error("no cell for a RIVETER");
}

const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };

/** One projectile from side `from` lands now (Battle.impact), `dmg` damage, with payload extras. */
function land(bt: Battle, from: 0 | 1, dmg: number, extra: Partial<Payload> = {}, target: Target = HULL): void {
  const payload: Payload = { id: 1e6, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...extra };
  (bt as unknown as { impact(p: unknown): void }).impact({ id: 1e6, from, turret: 0, payload, dmg, t: 0, flight: 0, target, tx: 60, ty: 60, heavy: false });
}
const hullEffects = (bt: Battle) => (bt as unknown as { hullEffects(dt: number): void }).hullEffects(TICK);

/** Step `ticks` ticks; each tick's events (with the tick count) to `on`; `before` runs before each step. */
function run(bt: Battle, ticks: number, on: (e: SimEvent, tick: number) => void = () => {}, before?: (tick: number) => void): void {
  for (let i = 0; i < ticks && !bt.over; i++) {
    before?.(bt.ticks + 1);
    bt.step();
    for (const e of bt.drainEvents()) on(e, bt.ticks);
  }
}

describe("SUS-A: SHIELD", () => {
  it("a SHIELD stops one whole hit (0, its FRAY bonus included), costs no PLATE, and breaks; the next hit lands", () => {
    const bt = new Battle(FOE, FOE, 1);
    const def = bt.sides[1];
    bt.gainShield(def, 1);
    def.hull.fray = 5; // a 10 FRAY bonus on each hit
    def.plate.plate = 100;
    const hp = def.hull.hp;
    land(bt, 0, 70);
    expect([def.hull.hp, def.plate.plate, def.shield, def.blocked]).toEqual([hp, 100, 0, 1]);
    expect(bt.events.filter((e): e is Shield => e.type === "shield")).toEqual([
      { type: "shield", side: 1, amount: 1, shield: 1 }, { type: "shield", side: 1, amount: -1, shield: 0 },
    ]);
    land(bt, 0, 70); // no SHIELD left: PLATE soaks 80 (70 + the FRAY bonus), the hull takes none
    expect([def.hull.hp, def.plate.plate, def.shield, def.blocked]).toEqual([hp, 20, 0, 1]);
  });

  it("MAX 3: a gain never goes past SHIELD_CAP, and one at the cap is lost (no event)", () => {
    const bt = new Battle(FOE, FOE, 1), s = bt.sides[0];
    expect(SHIELD_CAP).toBe(3);
    expect(bt.gainShield(s, 5)).toBe(3);
    expect(bt.gainShield(s, 1)).toBe(0);
    expect([s.shield, s.heals?.gained]).toEqual([3, 3]);
    expect(bt.events.filter((e) => e.type === "shield")).toHaveLength(1);
  });

  it("a stopped hit's BURN, FRAY, STUN and poison still land", () => {
    const bt = new Battle(FOE, FOE, 1), def = bt.sides[1];
    bt.gainShield(def, 3);
    const hp = def.hull.hp;
    land(bt, 0, 50, { burn: 2 });
    land(bt, 0, 50, { ammo: "thread", poison: 3 });
    const f = def.factories[0], ft = def.targets.find((t) => t.kind === "factory" && t.ref === f.uid)!;
    land(bt, 0, 50, { shock: true }, ft);
    expect([def.hull.hp, def.shield, def.blocked]).toEqual([hp, 0, 3]);
    expect(def.hull.burns.map((b) => b.dps)).toEqual([2]);
    expect([def.hull.fray, def.hull.poison.stacks]).toEqual([1, 3]);
    expect(f.disrupted).toBeGreaterThan(0);
  });

  it("BURN ticks, poison ticks, limpet blasts and the dark wind go past it (they are not hits)", () => {
    const bt = new Battle(FOE, FOE, 1), s = bt.sides[1];
    bt.gainShield(s, 3);
    s.hull.burns.push({ dps: 1, t: 3 });
    s.hull.poison = { stacks: 2, t: 6 };
    s.limpets.push({ at: 0, target: s.targets[0], from: 0, blast: 50, stall: 0 });
    const hp = s.hull.hp;
    for (let i = 0; i < 60; i++) hullEffects(bt); // 1 s: the blast, one BURN tick (10), one poison tick (8)
    expect([hp - s.hull.hp, s.shield]).toEqual([50 + 10 + 8, 3]);
    bt.t = WIND_START + 1;
    const before = s.hull.hp;
    for (let i = 0; i < 60; i++) hullEffects(bt);
    expect(s.hull.hp).toBeLessThan(before - 10 - 8 + 1); // the wind's 10 came too
    expect(s.shield).toBe(3);
  });

  // SUS-D (REQ-BFG-069): its SHIELD line moved into runes.ts (SUS-B drew it from runeText.ts RUNE_TEXT, whose row is gone),
  // so the text pin follows it; the rule is the same (3 at t = 0)
  it("WARD STONE is SHIELD now: its kind is startShield (a count), 3 at t = 0, its SHIELD line in runes.ts", () => {
    expect([RUNES.ward_stone.kind, RUNES.ward_stone.amount.n, KIND_UNIT.startShield]).toEqual(["startShield", 3, "count"]);
    expect(RUNES.ward_stone.text).toBe("START: +{N} {*SHIELD}.");
    const bt = new Battle({ ...cloneBuild(FOE), runes: [{ id: "ward_stone" }] }, FOE, 1);
    expect([bt.sides[0].shield, bt.sides[1].shield]).toEqual([3, undefined]);
  });
});

describe("SUS-A: heal()", () => {
  const fresh = () => { const bt = new Battle(heroStartBuild("bastion"), FOE, 1); return { bt, s: bt.sides[0] }; };

  it("never past max hull; a dead hull heals nothing", () => {
    const { bt, s } = fresh();
    s.hull.hp = s.hull.max - 5;
    expect(bt.heal(s, 20, "regen")).toBe(5);
    expect(s.hull.hp).toBe(s.hull.max);
    expect(bt.heal(s, 20, "regen")).toBe(0);
    s.hull.hp = 0;
    expect(bt.heal(s, 20, "regen")).toBe(0);
  });

  it("nothing heals from WIND_START (25 s: tick 1500 on the integer count), counted as lost to the wind", () => {
    const { bt, s } = fresh();
    s.hull.hp -= 500;
    bt.ticks = WIND_START * 60 - 1;
    expect(bt.heal(s, 20, "mendpress")).toBe(20);
    bt.ticks = WIND_START * 60;
    expect(bt.heal(s, 20, "mendpress")).toBe(0);
    expect(s.heals).toMatchObject({ healed: 20, windLost: 20, burnLost: 0 });
  });

  it("a hull with any BURN heals half, rounded down", () => {
    const { bt, s } = fresh();
    s.hull.hp -= 500;
    s.hull.burns.push({ dps: 1, t: 3 });
    expect([21, 13, 6, 15, 1].map((n) => bt.heal(s, n, "riveter"))).toEqual([10, 6, 3, 7, 0]);
    expect(s.heals!.burnLost).toBe(11 + 7 + 3 + 8 + 1);
  });

  it("the heal event: side, the amount actually healed, the source and its piece", () => {
    const { bt, s } = fresh();
    s.hull.hp = s.hull.max - 4;
    bt.heal(s, 6, "riveter", 77);
    s.hull.hp -= 100;
    bt.heal(s, 20, "mendpress", 5);
    bt.heal(s, 10, "regen");
    expect(bt.events.filter((e) => e.type === "heal")).toEqual([
      { type: "heal", side: 0, amount: 4, source: "riveter", gate: 77 },
      { type: "heal", side: 0, amount: 20, source: "mendpress", factory: 5 },
      { type: "heal", side: 0, amount: 10, source: "regen" },
    ]);
  });
});

describe("SUS-A: the pieces in battle", () => {
  it("MENDING LOOM: REGEN only at whole seconds (every 60 ticks), 10 / 15 / 20 by star", () => {
    for (const [stars, n] of [[1, 10], [2, 15], [3, 20]] as const) {
      const bt = new Battle(withGear(heroStartBuild("bastion"), "mendingloom", stars), FOE, 3);
      bt.sides[0].hull.hp -= 1000;
      const at: number[] = [], amt: number[] = [];
      run(bt, 600, (e, tick) => { if (e.type === "heal" && e.source === "regen") { at.push(tick); amt.push(e.amount); } });
      expect(at).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => 60 * k));
      expect(new Set(amt)).toEqual(new Set([n]));
    }
  });

  it("MENDING LOOM pauses while its turret is frozen (no REGEN at that whole second)", () => {
    const bt = new Battle(withGear(heroStartBuild("bastion"), "mendingloom"), FOE, 3);
    bt.sides[0].hull.hp -= 1000;
    const tu = bt.sides[0].turrets.find((t) => t.regen)!;
    const at: number[] = [];
    run(bt, 240, (e, tick) => { if (e.type === "heal" && e.source === "regen") at.push(tick); }, (tick) => { if (tick === 120) tu.frozen = 0.2; });
    expect(at).toEqual([60, 180, 240]);
  });

  // ★1 is the fallback's 8 s (the design's 6 s; the acceptance bench's typ2r had FURNACE < 45% pooled)
  it("WARD BELL: +1 SHIELD EVERY 8 / 5 / 4 s, the first at t = every; its timer carries (+= every)", () => {
    for (const [stars, every] of [[1, 8], [2, 5], [3, 4]] as const) {
      expect(effectAt("wardbell", stars).mod!.shield).toEqual({ every, amount: 1 });
      const bt = new Battle(withGear(heroStartBuild("bastion"), "wardbell", stars), FOE, 3);
      const tu = bt.sides[0].turrets.find((t) => t.bell)!;
      const at: number[] = [], gains: number[] = [];
      for (let i = 0; i < 60 * 3 * every; i++) {
        const was = tu.bell!.timer;
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === "shield" && e.side === 0 && e.amount > 0) gains.push(bt.ticks);
        if (tu.bell!.timer > was) at.push(bt.ticks); // the timer ran out (and added `every`)
      }
      expect(at).toEqual([1, 2, 3].map((k) => 60 * every * k));
      expect(gains.length).toBeGreaterThan(0);
      for (const g of gains) expect(at).toContain(g); // every SHIELD gain is a bell's (none at the cap)
    }
    // the carry: at 1.01 s (not a whole number of ticks) it fires at the first tick past each k x 1.01 s (a reset timer
    // would drift a tick a beat: 61, 122, 183, 244)
    const bt = new Battle(withGear(heroStartBuild("bastion"), "wardbell"), FOE, 3);
    const tu = bt.sides[0].turrets.find((t) => t.bell)!;
    tu.bell!.every = 1.01;
    tu.bell!.timer = 1.01;
    const at: number[] = [];
    for (let i = 0; i < 250; i++) { const was = tu.bell!.timer; bt.step(); bt.drainEvents(); if (tu.bell!.timer > was) at.push(bt.ticks); }
    expect(at).toEqual([61, 122, 182, 243]);
  });

  it("WARD BELL pauses while its turret is stunned: it doesn't advance and banks nothing", () => {
    const bt = new Battle(withGear(heroStartBuild("bastion"), "wardbell"), FOE, 3);
    const tu = bt.sides[0].turrets.find((t) => t.bell)!;
    let paused = 0, first = -1;
    for (let i = 0; i < 600 && first < 0; i++) {
      if (bt.ticks === 120) tu.disrupted = 1;
      const was = tu.bell!.timer;
      bt.step();
      bt.drainEvents();
      if (tu.disrupted > 0 || tu.frozen > 0) paused++;
      if (tu.bell!.timer > was) first = bt.ticks;
    }
    expect(paused).toBeGreaterThanOrEqual(59);
    expect(first).toBe(60 * effectAt("wardbell", 1).mod!.shield!.every + paused); // ★1: 480 ticks + the paused ones
  });

  it("MEND PRESS: HEAL 20 / 30 / 45 EVERY 3 s through heal(), ARMOR PRESS's timer and kind; it carries its remainder", () => {
    expect([1, 2, 3].map((s) => effectAt("mendpress", s).factory!.heal)).toEqual([20, 30, 45].map((amount) => ({ every: 3, amount })));
    expect([1, 2, 3].map((s) => effectAt("mendpress", s).factory!.speed)).toEqual([1, 2, 3].map((s) => effectAt("armorpress", s).factory!.speed));
    expect([ITEMS.mendpress.kind, ITEMS.mendpress.size, ITEMS.mendpress.rarity, ITEMS.mendpress.price, ITEMS.mendpress.merchant])
      .toEqual([ITEMS.armorpress.kind, ITEMS.armorpress.size, ITEMS.armorpress.rarity, ITEMS.armorpress.price, ITEMS.armorpress.merchant]);
    const bt = new Battle(withPress(heroStartBuild("furnace")), FOE, 3);
    const s = bt.sides[0], f = s.factories[0];
    s.hull.hp -= 1000;
    expect([f.healTimer, f.pace]).toEqual([3, 1]);
    const at: number[] = [];
    run(bt, 600, (e, tick) => { if (e.type === "heal" && e.source === "mendpress") { at.push(tick); expect(e).toMatchObject({ amount: 20, factory: f.uid }); } });
    expect(at).toEqual([180, 360, 540]);
    // the carry at a pace that doesn't divide 3 s (x1.1): the k-th HEAL at the first tick past k x 3 / 1.1 s (a reset
    // timer would give 164, 328, 492, 656)
    const bt2 = new Battle(withPress(heroStartBuild("furnace")), FOE, 3);
    const f2 = bt2.sides[0].factories[0];
    f2.pace = 1.1;
    const at2: number[] = [];
    for (let i = 0; i < 700; i++) { const was = f2.healTimer!; bt2.step(); bt2.drainEvents(); if (f2.healTimer! > was) at2.push(bt2.ticks); }
    expect(at2).toEqual([164, 328, 491, 655]);
  });

  it("MEND PRESS pauses while stalled or frozen, as ARMOR PRESS does; with no belt to a turret its timer never runs", () => {
    const bt = new Battle(withPress(heroStartBuild("furnace")), FOE, 3);
    const f = bt.sides[0].factories[0];
    let paused = 0, first = -1;
    for (let i = 0; i < 600 && first < 0; i++) {
      if (bt.ticks === 60) f.disrupted = 1;
      const was = f.healTimer!;
      bt.step();
      bt.drainEvents();
      if (f.disrupted > 0 || f.frozen > 0) paused++;
      if (f.healTimer! > was) first = bt.ticks;
    }
    expect(paused).toBeGreaterThanOrEqual(59);
    expect(first).toBe(180 + paused);
    const loose = withPress(heroStartBuild("furnace"));
    loose.routes = [];
    expect(new Battle(loose, FOE, 3).sides[0].factories[0].healTimer).toBeUndefined();
  });

  it("RIVETER heals through heal(): 6 a payload, half with BURN on the hull, nothing in the wind, nothing while stalled", () => {
    expect(ITEMS.riveter.gate).toEqual({ heal: 6 });
    expect([2, 3].map((s) => effectAt("riveter", s).gate!.heal)).toEqual([13, 21]);
    const { b, uid } = withRiveter(heroStartBuild("furnace"));
    const heals = (setup: (bt: Battle) => void, before?: (bt: Battle) => void) => {
      const bt = new Battle(b, FOE, 3);
      bt.sides[0].hull.hp -= 1000;
      setup(bt);
      const out: Heal[] = [];
      run(bt, 600, (e) => { if (e.type === "heal" && e.source === "riveter") out.push(e); }, () => before?.(bt));
      return { bt, out };
    };
    const plain = heals(() => {});
    expect(plain.out.length).toBeGreaterThan(3);
    expect(plain.out.every((e) => e.amount === 6 && e.gate === uid && e.side === 0)).toBe(true);
    expect(plain.bt.sides[0].heals!.healed).toBe(6 * plain.out.length);
    const burnt = heals(() => {}, (bt) => { const h = bt.sides[0].hull; if (!h.burns.length) h.burns.push({ dps: 1, t: 50 }); });
    expect(burnt.out.length).toBeGreaterThan(3);
    expect(burnt.out.every((e) => e.amount === 3)).toBe(true);
    const wind = heals((bt) => { bt.ticks = WIND_START * 60; });
    expect(wind.out).toEqual([]);
    expect(wind.bt.sides[0].heals!.windLost).toBeGreaterThan(0);
    const stalled = heals((bt) => { bt.sides[0].gates.find((g) => g.uid === uid)!.disrupted = 100; });
    expect(stalled.out).toEqual([]);
  });
});

describe("SUS-A: the switch and the readers", () => {
  it("the three pieces resolve in ITEMS but are in no listing while SUSTAIN_LIVE is off; withSustain shows them and puts the switch back", () => {
    // FLIP-X2 (REQ-BFG-069, release X): SUSTAIN_LIVE is on (was [false, false]), so every listing shows them by default; the
    // off world is withSustain(fn, false), and the switch comes back on after it
    expect([SUSTAIN_LIVE, sustainLive()]).toEqual([true, true]);
    expect(SUSTAIN_IDS).toEqual(["wardbell", "mendpress", "mendingloom"]);
    const listed = () => [...Object.keys(ITEMS), ...buyableModules().map((d) => d.id),
      ...(["tinker", "ironmonger", "alchemist"] as const).flatMap((m) => itemsSoldBy(m).map((d) => d.id))];
    withSustain(() => {
      for (const id of SUSTAIN_IDS) {
        expect(ITEMS[id].id).toBe(id);
        expect(listed()).not.toContain(id);
      }
    }, false);
    for (const id of SUSTAIN_IDS) expect(listed()).toContain(id); // the switch is back on
    withSustain(() => { for (const id of SUSTAIN_IDS) expect(listed()).toContain(id); });
    for (const id of SUSTAIN_IDS) expect(listed()).toContain(id);
    expect([ITEMS.wardbell, ITEMS.mendingloom].map((d) => [d.kind, d.rarity, d.price, d.merchant])).toEqual([["mod", "rare", 5, "tinker"], ["mod", "rare", 5, "alchemist"]]);
    expect(ITEMS.mendingloom.mod!.regen).toBe(10);
    expect([2, 3].map((s) => effectAt("mendingloom", s).mod!.regen)).toEqual([15, 20]);
  });

  it("validate refuses a deck that holds one while the switch is off", () => {
    const b = withGear(heroStartBuild("bastion"), "wardbell");
    // FLIP-X2 (REQ-BFG-069): the switch is on by default, so off is withSustain(fn, false) (was the default); on, the same
    // deck has no WARD BELL error on day 3 (its first day)
    expect(withSustain(() => validateBuild(b, 3, "lenient"), false).errors.join("\n")).toMatch(/WARD BELL is not in the game yet/);
    expect(validateBuild(b, 3, "lenient").errors.filter((e) => /WARD BELL/.test(e))).toEqual([]);
  });

  it("deckRating reads decks holding each new piece: finite, never NaN", () => {
    for (const b of [withGear(heroStartBuild("bastion"), "wardbell", 3), withGear(heroStartBuild("weaver"), "mendingloom", 2), withPress(heroStartBuild("furnace"), 3), withRiveter(heroStartBuild("foundry")).b]) {
      const r = rateDeck(b);
      for (const [k, v] of Object.entries(r)) if (typeof v === "number") expect(Number.isFinite(v), `${b.hero} ${k}`).toBe(true);
    }
  });
});
