// SUS-D (REQ-BFG-069; SUSTAIN-1 4.3, 4.6, 4.7): the sustain runes' hooks on a real battle (src/sim/battle.ts through
// runes.ts runeMods). For each rune: its hook works; heal()'s rules hold for every HEAL (BURN halves, nothing from
// WIND_START, never past max hull); MAX 3 SHIELD holds for every SHIELD; SEARING and SHATTER SHOT do what their lines say;
// a side without them battles exactly as before. No hook draws on the RNG.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Battle, simulate, type Payload, type SimEvent, type Target } from "../src/sim/battle";
import { SHIELD_CAP, TICK, WIND_START, withSustain } from "../src/sim/content";
import { cloneBuild, installedTurrets, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES, SUSTAIN_RUNE_LIST, runeMods } from "../src/sim/runes";

const W = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), ...ids.map((id) => ({ id }))] });
const n = (id: string) => RUNES[id].amount.n;
const FOE = heroStartBuild("weaver");
const WIND_TICKS = WIND_START * 60;
type Heal = Extract<SimEvent, { type: "heal" }>;
type Shield = Extract<SimEvent, { type: "shield" }>;
const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };

/** One projectile from side `from` lands now (Battle.impact), `dmg` damage, with payload extras. */
function land(bt: Battle, from: 0 | 1, dmg: number, extra: Partial<Payload> = {}, target: Target = HULL): void {
  const payload: Payload = { id: 1e6, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...extra };
  (bt as unknown as { impact(p: unknown): void }).impact({ id: 1e6, from, turret: 0, payload, dmg, t: 0, flight: 0, target, tx: 60, ty: 60, heavy: false });
}

/** Step `ticks` ticks; each tick's events (with the tick count) to `on`; `before` runs before each step. */
function run(bt: Battle, ticks: number, on: (e: SimEvent, tick: number) => void = () => {}, before?: (tick: number) => void): void {
  for (let i = 0; i < ticks && !bt.over; i++) {
    before?.(bt.ticks + 1);
    bt.step();
    for (const e of bt.drainEvents()) on(e, bt.ticks);
  }
}

/** Side 0's rune heals over `ticks` ticks, and side 0's shots that landed (all, and PAIR ones), by projectile id. */
function shotsAndHeals(bt: Battle, ticks: number, before?: () => void): { heals: Heal[]; landed: number; pairLanded: number } {
  const heals: Heal[] = [];
  let landed = 0, pairLanded = 0;
  for (let i = 0; i < ticks && !bt.over; i++) {
    before?.();
    const flying = new Map(bt.projectiles.filter((p) => p.from === 0).map((p) => [p.id, !!(p.payload.paired || p.payload.compound?.paired)]));
    bt.step();
    const still = new Set(bt.projectiles.map((p) => p.id));
    for (const [id, paired] of flying) if (!still.has(id)) { landed++; if (paired) pairLanded++; }
    for (const e of bt.drainEvents()) if (e.type === "heal" && e.side === 0 && e.source === "rune") heals.push(e);
  }
  return { heals, landed, pairLanded };
}

describe("SUS-D: the SHIELD runes (every SHIELD through gainShield: MAX 3 holds)", () => {
  it("BULWARK WARD: +2 SHIELD at t = 0; with WARD STONE (the same kind, startShield) 2 + 3 = 5, so MAX 3", () => {
    expect([RUNES.bulwark_ward.kind, RUNES.ward_stone.kind, n("bulwark_ward")]).toEqual(["startShield", "startShield", 2]);
    const bt = new Battle(W(FOE, "bulwark_ward"), FOE, 1);
    expect([bt.sides[0].shield, bt.sides[1].shield]).toEqual([2, undefined]);
    const both = new Battle(W(FOE, "bulwark_ward", "ward_stone"), FOE, 1);
    expect(runeMods([{ id: "bulwark_ward" }, { id: "ward_stone" }])!.startShield).toBe(5);
    expect(both.sides[0].shield).toBe(SHIELD_CAP);
    expect(both.events.filter((e): e is Shield => e.type === "shield")).toEqual([{ type: "shield", side: 0, amount: 3, shield: 3 }]);
  });

  it("TICK GUARD: +1 SHIELD every 6 s, the first at t = 6 s (tick 360); the timer carries its remainder", () => {
    const bt = new Battle(W(FOE, "tick_guard"), FOE, 3), s = bt.sides[0];
    expect([s.guardTimer, n("tick_guard"), bt.sides[1].guardTimer]).toEqual([6, 6, undefined]);
    const fired: number[] = [], gains: number[] = [];
    for (let i = 0; i < 60 * 18; i++) {
      const was = s.guardTimer!;
      bt.step();
      for (const e of bt.drainEvents()) if (e.type === "shield" && e.side === 0 && e.amount > 0) gains.push(bt.ticks);
      if (s.guardTimer! > was) fired.push(bt.ticks);
    }
    expect(fired).toEqual([360, 720, 1080]);
    expect(gains.length).toBeGreaterThan(0);
    for (const g of gains) expect(fired).toContain(g); // every SHIELD side 0 gained is the timer's
    // the carry at 1.01 s (not a whole number of ticks): the first tick past each k x 1.01 s, as WARD BELL's (a reset
    // timer would drift: 61, 122, 183, 244)
    const bt2 = new Battle(W(FOE, "tick_guard"), FOE, 3), s2 = bt2.sides[0];
    s2.rune!.shieldEvery = 1.01;
    s2.guardTimer = 1.01;
    const at: number[] = [];
    for (let i = 0; i < 250; i++) { const was = s2.guardTimer!; bt2.step(); bt2.drainEvents(); if (s2.guardTimer! > was) at.push(bt2.ticks); }
    expect(at).toEqual([61, 122, 182, 243]);
  });

  it("TICK GUARD: at MAX 3 its SHIELD is lost (no event); it still runs in the dark wind (SHIELD heals nothing)", () => {
    const bt = new Battle(W(FOE, "tick_guard"), FOE, 3), s = bt.sides[0];
    const guard = (bt as unknown as { runeGuard(s: unknown, dt: number): void }).runeGuard.bind(bt);
    bt.gainShield(s, 3);
    bt.drainEvents();
    for (let i = 0; i < 360; i++) guard(s, TICK);
    expect([s.shield, bt.drainEvents().filter((e) => e.type === "shield")]).toEqual([3, []]);
    const w = new Battle(W(FOE, "tick_guard"), FOE, 3), ws = w.sides[0];
    w.ticks = WIND_TICKS;
    const gains: number[] = [];
    for (let i = 0; i < 360; i++) { (w as unknown as { runeGuard(s: unknown, dt: number): void }).runeGuard(ws, TICK); }
    for (const e of w.drainEvents()) if (e.type === "shield" && e.amount > 0) gains.push(e.shield);
    expect(gains).toEqual([1]);
  });

  it("all three together never pass MAX 3", () => {
    const bt = new Battle(W(FOE, "bulwark_ward", "ward_stone", "tick_guard"), FOE, 3), s = bt.sides[0];
    let most = 0;
    run(bt, 60 * 20, () => { most = Math.max(most, s.shield ?? 0); });
    expect(most).toBe(SHIELD_CAP);
  });
});

describe("SUS-D: the HEAL and REGEN runes (every heal through heal())", () => {
  it("TWIN SALVE: HEAL 20 each time a PAIR shot of yours lands, none for a lone one; half with BURN, none in the wind", () => {
    const b = W(heroStartBuild("foundry"), "twin_salve");
    const plain = new Battle(b, FOE, 3);
    plain.sides[0].hull.hp -= 1000;
    expect(plain.sides[0].turrets.every((tu) => tu.pairing)).toBe(true); // its turrets read PAIRs
    const r = shotsAndHeals(plain, 900);
    expect(r.pairLanded).toBeGreaterThan(3);
    expect(r.heals.length).toBe(r.pairLanded);
    expect(r.heals.every((e) => e.amount === n("twin_salve"))).toBe(true);
    // a deck whose shots never pair: no heal (FURNACE's slugs, with the rune)
    const lone = new Battle(W(heroStartBuild("furnace"), "twin_salve"), FOE, 3);
    lone.sides[0].hull.hp -= 1000;
    const rl = shotsAndHeals(lone, 900);
    expect(rl.landed).toBeGreaterThan(3);
    expect([rl.pairLanded, rl.heals.length]).toEqual([0, 0]);
    const burnt = new Battle(b, FOE, 3);
    burnt.sides[0].hull.hp -= 1000;
    const rb = shotsAndHeals(burnt, 900, () => { const h = burnt.sides[0].hull; if (!h.burns.length) h.burns.push({ dps: 1, t: 50 }); });
    expect(rb.heals.length).toBeGreaterThan(3);
    expect(rb.heals.every((e) => e.amount === n("twin_salve") / 2)).toBe(true);
    const wind = new Battle(b, FOE, 3);
    wind.sides[0].hull.hp -= 1000;
    wind.ticks = WIND_TICKS;
    expect(shotsAndHeals(wind, 900).heals).toEqual([]);
    expect(wind.sides[0].heals!.windLost).toBeGreaterThan(0);
  });

  it("SCRAP MEDIC: HEAL 300 once, the first time your hull is below half (where LAST WALL fires); never past max", () => {
    const fresh = (...more: string[]) => { const bt = new Battle(W(heroStartBuild("bastion"), "scrap_medic", ...more), FOE, 1); return { bt, s: bt.sides[0] }; };
    const { bt, s } = fresh();
    run(bt, 30);
    expect(s.halfHealed).toBeUndefined();
    s.hull.hp = Math.floor(s.hull.max / 2) - 1;
    const heals: Heal[] = [];
    let k = 0, again = -1;
    run(bt, 120, (e) => { if (e.type === "heal" && e.side === 0) heals.push(e); }, () => { if (++k === 60) { s.hull.hp = 50; again = s.hull.hp; } });
    expect(again).toBe(50); // below half once more, 60 ticks later
    expect(heals.map((e) => [e.amount, e.source])).toEqual([[n("scrap_medic"), "rune"]]); // once: not again at 50 HULL
    expect(s.halfHealed).toBe(true);
    // with LAST WALL: both fire on the same tick, each its own (PLATE and HEAL)
    const both = fresh("last_wall");
    both.s.hull.hp = Math.floor(both.s.hull.max / 2) - 1;
    run(both.bt, 1);
    expect([both.s.halfPlated, both.s.halfHealed, both.s.heals!.healed]).toEqual([true, true, n("scrap_medic")]);
    // BURN halves it; in the dark wind it gives nothing and is used up; never past max hull
    const burnt = fresh();
    burnt.s.hull.burns.push({ dps: 1, t: 50 });
    burnt.s.hull.hp = Math.floor(burnt.s.hull.max / 2) - 1;
    run(burnt.bt, 1);
    expect(burnt.s.heals!.healed).toBe(n("scrap_medic") / 2);
    const wind = fresh();
    wind.bt.ticks = WIND_TICKS;
    wind.s.hull.hp = Math.floor(wind.s.hull.max / 2) - 1;
    run(wind.bt, 1);
    expect([wind.s.halfHealed, wind.s.heals!.healed, wind.s.heals!.windLost]).toEqual([true, 0, n("scrap_medic")]);
    const cap = fresh();
    cap.s.hull.max = 200;
    cap.s.hull.hp = 99; // below half of 200: 150 would pass max, so it gives 101
    run(cap.bt, 1);
    expect([cap.s.hull.hp, cap.s.heals!.healed]).toEqual([200, 101]);
  });

  it("LEECH VOW: HEAL 20 each time a shot of yours lands (a SHIELD-stopped one too); never past max", () => {
    const b = W(heroStartBuild("furnace"), "leech_vow");
    const bt = new Battle(b, FOE, 3);
    bt.sides[0].hull.hp -= 1000;
    const r = shotsAndHeals(bt, 900);
    expect(r.landed).toBeGreaterThan(5);
    expect(r.heals.length).toBe(r.landed);
    expect(r.heals.every((e) => e.amount === n("leech_vow"))).toBe(true);
    // a stopped hit still lands: the foe's SHIELD takes it whole, and the shot heals
    const st = new Battle(b, FOE, 3), me = st.sides[0], foe = st.sides[1];
    me.hull.hp -= 100;
    st.gainShield(foe, 1);
    st.drainEvents();
    const hp = foe.hull.hp;
    land(st, 0, 70);
    expect([foe.hull.hp, foe.blocked]).toEqual([hp, 1]);
    expect(st.drainEvents().filter((e) => e.type === "heal")).toEqual([{ type: "heal", side: 0, amount: n("leech_vow"), source: "rune" }]);
    me.hull.hp = me.hull.max - 2;
    land(st, 0, 70);
    expect(me.hull.hp).toBe(me.hull.max);
    me.hull.hp -= 100;
    me.hull.burns.push({ dps: 1, t: 50 });
    const before = me.hull.hp;
    land(st, 0, 70);
    expect(me.hull.hp - before).toBe(Math.floor(n("leech_vow") / 2)); // BURN's rule: 5 -> 2
    st.ticks = WIND_TICKS;
    const w0 = me.hull.hp;
    land(st, 0, 70);
    expect(me.hull.hp).toBe(w0);
  });

  it("GREEN THREAD: REGEN 10 at each whole second, added to a MENDING LOOM's (one heal a second); none from WIND_START", () => {
    const at: number[] = [], amt: number[] = [];
    const bt = new Battle(W(heroStartBuild("bastion"), "green_thread"), FOE, 3);
    bt.sides[0].hull.hp -= 1000;
    run(bt, 600, (e, tick) => { if (e.type === "heal" && e.side === 0) { at.push(tick); amt.push(e.amount); expect(e.source).toBe("regen"); } });
    expect(at).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => 60 * k));
    expect(new Set(amt)).toEqual(new Set([n("green_thread")]));
    // with a MENDING LOOM ★1 (REGEN 10): one heal of 20 a second
    const b = W(heroStartBuild("bastion"), "green_thread");
    b.mods.push({ uid: 900, def: "mendingloom", turret: installedTurrets(b)[0].slot });
    const both = new Battle(b, FOE, 3);
    both.sides[0].hull.hp -= 1000;
    const amt2: number[] = [];
    run(both, 300, (e) => { if (e.type === "heal" && e.side === 0) amt2.push(e.amount); });
    expect(amt2).toEqual([20, 20, 20, 20, 20]);
    // BURN halves it; nothing from WIND_START (tick 1500 is a whole second, and it gives nothing)
    const burnt = new Battle(W(heroStartBuild("bastion"), "green_thread"), FOE, 3);
    burnt.sides[0].hull.hp -= 1000;
    const amt3: number[] = [];
    run(burnt, 120, (e) => { if (e.type === "heal" && e.side === 0) amt3.push(e.amount); }, () => { const h = burnt.sides[0].hull; if (!h.burns.length) h.burns.push({ dps: 1, t: 50 }); });
    expect(amt3).toEqual([5, 5]);
    const wind = new Battle(W(heroStartBuild("bastion"), "green_thread"), FOE, 3);
    wind.sides[0].hull.hp -= 1000;
    wind.ticks = WIND_TICKS - 60;
    const at4: number[] = [];
    run(wind, 180, (e) => { if (e.type === "heal" && e.side === 0) at4.push(wind.ticks); });
    expect(at4).toEqual([]); // ticks 1441-1620: whole seconds 1500, 1560, 1620 are all in the wind
    expect(wind.sides[0].heals!.windLost).toBe(3 * n("green_thread"));
    // a dead hull regens nothing
    const dead = new Battle(W(heroStartBuild("bastion"), "green_thread"), FOE, 3);
    dead.sides[0].hull.hp = 0;
    expect(dead.heal(dead.sides[0], 10, "regen")).toBe(0);
  });
});

describe("SUS-D: the counters", () => {
  it("SEARING: a foe with BURN on its hull heals nothing (counted as lost to BURN); without BURN, or for the holder, as before", () => {
    const bt = new Battle(FOE, W(FOE, "searing"), 1);
    const s = bt.sides[0], holder = bt.sides[1];
    s.hull.hp -= 500;
    s.hull.burns.push({ dps: 1, t: 3 });
    expect(bt.heal(s, 21, "regen")).toBe(0);
    expect(s.heals).toMatchObject({ healed: 0, burnLost: 21 });
    expect(bt.events.filter((e) => e.type === "heal")).toEqual([]);
    s.hull.burns.length = 0;
    expect(bt.heal(s, 21, "regen")).toBe(21);
    // the holder's own heals: BURN's half, as before (SEARING reads the foe's hull only)
    holder.hull.hp -= 500;
    holder.hull.burns.push({ dps: 1, t: 3 });
    expect(bt.heal(holder, 21, "regen")).toBe(10);
    // the wind's rule comes first (lost to the wind, not to BURN)
    s.hull.burns.push({ dps: 1, t: 3 });
    bt.ticks = WIND_TICKS;
    expect(bt.heal(s, 21, "regen")).toBe(0);
    expect(s.heals).toMatchObject({ windLost: 21, burnLost: 21 });
    // in a battle: a MEND PRESS deck burning under a SEARING foe heals nothing while it burns
    const press = cloneBuild(heroStartBuild("weaver"));
    const fac = press.items.find((p) => p.def === "loom")!;
    fac.def = "mendpress";
    const ash = W(heroStartBuild("furnace"), "searing", "ash_kindle");
    const fight = new Battle(press, ash, 3);
    fight.sides[0].hull.hp -= 1000;
    let healedWhileBurning = 0;
    run(fight, 600, (e) => { if (e.type === "heal" && e.side === 0 && fight.sides[0].hull.burns.length) healedWhileBurning += e.amount; });
    expect(healedWhileBurning).toBe(0);
    expect(fight.sides[0].heals!.burnLost).toBeGreaterThan(0);
  });

  it("SHATTER SHOT: your hit breaks one SHIELD and its damage still lands, on PLATE, then HULL (not counted as stopped)", () => {
    const bt = new Battle(W(FOE, "shatter_shot"), FOE, 1);
    const def = bt.sides[1];
    bt.gainShield(def, 2);
    def.plate.plate = 30;
    bt.drainEvents();
    const hp = def.hull.hp;
    land(bt, 0, 70);
    expect([def.shield, def.blocked ?? 0, def.plate.plate, hp - def.hull.hp]).toEqual([1, 0, 0, 40]);
    expect(bt.drainEvents().filter((e) => e.type === "shield")).toEqual([{ type: "shield", side: 1, amount: -1, shield: 1 }]);
    // its BURN lands too, as any hit's
    land(bt, 0, 10, { burn: 2 });
    expect([def.shield, def.hull.burns.map((b) => b.dps)]).toEqual([0, [2]]);
    // the same hit without the rune is stopped whole
    const plain = new Battle(FOE, FOE, 1), d2 = plain.sides[1];
    plain.gainShield(d2, 2);
    d2.plate.plate = 30;
    const hp2 = d2.hull.hp;
    land(plain, 0, 70);
    expect([d2.shield, d2.blocked, d2.plate.plate, d2.hull.hp]).toEqual([1, 1, 30, hp2]);
    // with no SHIELD on the foe it is an ordinary hit
    const none = new Battle(W(FOE, "shatter_shot"), FOE, 1), d3 = none.sides[1];
    const hp3 = d3.hull.hp;
    land(none, 0, 70);
    expect([d3.shield, hp3 - d3.hull.hp]).toEqual([undefined, 70]);
  });
});

describe("SUS-D: a side without the sustain runes battles exactly as before", () => {
  it("the switch alone moves no battle; a build without these runes has every new kind at 0", () => {
    for (const [a, b, seed] of [["furnace", "weaver", 1], ["foundry", "bastion", 7], ["bastion", "furnace", 3]] as const) {
      const end = (x: Battle) => [x.winner, x.ticks, x.sides[0].hull.hp, x.sides[1].hull.hp, x.sides[0].stats.damage, x.sides[1].stats.damage];
      const b0 = heroStartBuild(a), b1 = W(heroStartBuild(b), "ward_stone", "iron_hide");
      expect(end(withSustain(() => simulate(b0, b1, seed)))).toEqual(end(simulate(b0, b1, seed)));
    }
    const m = runeMods([{ id: "ward_stone" }, { id: "war_edge" }])!;
    for (const k of ["shieldEvery", "pairHeal", "halfHeal", "hitHeal", "regen", "burnNoHeal", "shieldPierce"] as const) expect(m[k], k).toBe(0);
    const bt = new Battle(W(FOE, "war_edge"), FOE, 1);
    expect([bt.sides[0].guardTimer, bt.sides[0].halfHealed]).toEqual([undefined, undefined]);
  });

  it("each sustain rune changes only its holder's side: the foe of a rune that never fires battles as before", () => {
    // SEARING and SHATTER SHOT against a foe that never heals and holds no SHIELD: the battle is the plain one
    for (const id of ["searing", "shatter_shot"]) {
      const end = (x: Battle) => [x.winner, x.ticks, x.sides[0].hull.hp, x.sides[1].hull.hp];
      expect(end(simulate(W(heroStartBuild("furnace"), id), FOE, 5)), id).toEqual(end(simulate(heroStartBuild("furnace"), FOE, 5)));
    }
  });

  it("no SUS-D hook draws on the RNG (battle.ts: the SUS-D hook block and every SUS-D line)", () => {
    const src = readFileSync(new URL("../src/sim/battle.ts", import.meta.url), "utf8");
    const from = src.indexOf("// ---- SUS-D (REQ-BFG-069; SUSTAIN-1 4.6): the sustain runes' hooks");
    const to = src.indexOf("private runeHeal(", from);
    expect(from > 0 && to > from).toBe(true);
    expect(src.slice(from, src.indexOf("\n  }\n", to))).not.toMatch(/rng/);
    for (const line of src.split("\n")) if (/SUS-D/.test(line)) expect(line, line).not.toMatch(/rng/);
    expect(SUSTAIN_RUNE_LIST.length).toBe(8);
  });
});
