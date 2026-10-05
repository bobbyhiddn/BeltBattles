// NUM-3 (REQ-BFG-046, REQ-BFG-047): R1's STUN fold, whole-second durations and the cadence carry, in the battle.
// - The fold: FROSTBITE's, DRAG CHAIN's and SABOT's rounds STUN the part they hit through Battle.disrupt (one timer, one
//   meaning), SABOT still wrecks a rig and lost its bare-hull +60, CHILL and SNAG are gone, MANTLET is immune to every
//   STUN source from ★1 (FULL GUARD at ★2), and SUS-A's WARD BELL and MENDING LOOM pause for every STUN source.
// - The durations: every shown duration in the data is a whole number of seconds (N1 2.2), and a STUN starts and ends on
//   the battle's integer tick count.
// - The carry: SURGE VALVE's pulse runs on the integer tick count and carries its remainder; ARMOR PRESS's plate timer
//   carries too (it did before NUM-3: pinned here at an off-grid pace, as SUS-A pinned MEND PRESS).
import { describe, expect, it } from "vitest";
import { Battle, type SimEvent, type Target } from "../src/sim/battle";
import {
  AMMO, BURN_TIME, DISRUPT_TIME, HEROES, ITEMS, STUN_CAUSES, TICK, WIND_START, WIND_WARN, type HarassCause, type ItemDef,
} from "../src/sim/content";
import { arrowCell, cloneBuild, installedTurrets, occupancy, rigArrows, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { debuffedDamage, siftDebuffs } from "../src/sim/harassment";
import type { HarassRound } from "../src/sim/harassment";

const FOE = heroStartBuild("weaver");
type Heal = Extract<SimEvent, { type: "heal" }>;

/** b with gear `def` on its first installed turret. */
function withGear(b0: Build, def: string, stars = 1): Build {
  const b = cloneBuild(b0);
  b.mods.push({ uid: 900 + b.mods.length, def, turret: installedTurrets(b)[0].slot, ...(stars > 1 ? { stars } : {}) });
  return b;
}

/** b with its signature factory turned into `def` (same spot and belts). */
function withFactory(b0: Build, def: string, stars = 1): Build {
  const b = cloneBuild(b0);
  const f = b.items.find((p) => p.def === HEROES[b.hero].factory)!;
  f.def = def;
  if (stars > 1) f.stars = stars;
  return b;
}

/** b with rig `def` on the first free cell (off the forward row) whose arrow hits a belt tile (SUS-A's withRiveter). */
function withRig(b0: Build, def: string): Build {
  const b = cloneBuild(b0), occ = occupancy(b);
  for (let k = 10; k < 100; k++) {
    if (occ[k].item >= 0 || occ[k].route >= 0) continue;
    for (let rot = 0; rot < 4; rot++) {
      if (!rigArrows(def, rot).some((d) => { const c = arrowCell(k % 10, Math.floor(k / 10), d); return c >= 0 && occ[c].route >= 0; })) continue;
      b.items.push({ uid: 950, def, x: k % 10, y: Math.floor(k / 10), ...(rot ? { rot } : {}) });
      return b;
    }
  }
  throw new Error(`no cell for a ${def}`);
}

/** The battle's private hooks these tests drive (as SUS-A's tests drive impact and hullEffects). */
interface Hooks {
  disrupt(s: unknown, t: Target, secs?: number, cause?: HarassCause): boolean;
  roundImpact(s: unknown, t: Target, round: HarassRound, from: 0 | 1): void;
  pulsePhase(p: { on: number; period: number }): { on: boolean; cycle: number };
}
const hooks = (bt: Battle) => bt as unknown as Hooks;

/** The enemy side's (side 1's) first target of a kind. */
function targetOf(bt: Battle, kind: Target["kind"], side: 0 | 1 = 1): Target {
  const t = bt.sides[side].targets.find((x) => x.kind === kind);
  if (!t) throw new Error(`no ${kind} target`);
  return t;
}

/** The STUN timer a target reads (Battle.disrupt writes it). */
function stunOf(bt: Battle, t: Target, side: 0 | 1 = 1): number {
  const s = bt.sides[side];
  if (t.kind === "turret") return s.turrets.find((tu) => tu.index === t.ref)!.disrupted;
  if (t.kind === "factory") return s.factories.find((f) => f.uid === t.ref)!.disrupted;
  if (t.kind === "gate") return s.gates.find((g) => g.uid === t.ref)!.disrupted;
  return s.routes[t.ref].cellDisrupt[t.cell];
}

const round = (def: string, stars = 1): HarassRound => effectAt(def, stars).factory!.round as HarassRound;

describe("NUM-3 step 1: R1's STUN fold", () => {
  it("FROSTBITE, DRAG CHAIN and SABOT rounds STUN a turret, a factory and a belt tile for their round's seconds (one timer)", () => {
    for (const def of ["frostbite", "dragchain", "sabot"]) {
      for (const kind of ["turret", "factory", "belt"] as const) {
        const bt = new Battle(FOE, FOE, 1);
        const t = targetOf(bt, kind);
        hooks(bt).roundImpact(bt.sides[1], t, round(def), 0);
        expect(stunOf(bt, t), `${def} on a ${kind}`).toBeCloseTo((round(def) as { seconds: number }).seconds, 9);
        expect(bt.sides[1].turrets.every((tu) => tu.frozen === 0) && bt.sides[1].factories.every((f) => f.frozen === 0), `${def}: nothing freezes`).toBe(true);
      }
    }
  });

  it("FROSTBITE ★2/★3 HOARFROST: the STUN also lands on the 1 / 2 nearest other parts", () => {
    for (const [stars, n] of [[2, 1], [3, 2]] as const) {
      const bt = new Battle(FOE, FOE, 1);
      const t = targetOf(bt, "turret");
      hooks(bt).roundImpact(bt.sides[1], t, round("frostbite", stars), 0);
      const s = bt.sides[1];
      const stunned = [...s.turrets, ...s.factories, ...s.gates].filter((m) => m.disrupted > 0).length
        + s.routes.reduce((k, r) => k + r.cellDisrupt.filter((x) => x > 0).length, 0);
      expect(stunned, `★${stars}`).toBe(1 + n);
    }
  });

  it("a SABOT round wrecks a rig (no STUN), and on bare hull deals its round's damage only (the +60 is gone)", () => {
    const deck = heroStartBuild("furnace");
    const bt = new Battle(FOE, deck, 1);
    const rig = bt.sides[1].targets.find((x) => x.kind === "gate");
    if (rig) {
      hooks(bt).roundImpact(bt.sides[1], rig, round("sabot"), 0);
      const g = bt.sides[1].gates.find((x) => x.uid === rig.ref)!;
      expect([g.wrecked, g.disrupted]).toEqual([true, 0]);
    }
    const bt2 = new Battle(FOE, FOE, 1);
    const hp = bt2.sides[1].hull.hp;
    const payload = { id: 1e6, ammo: "sabot" as const, ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, harass: round("sabot") };
    const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
    (bt2 as unknown as { impact(p: unknown): void }).impact({ id: 1e6, from: 0, turret: 0, payload, dmg: AMMO.sabot.base, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false });
    expect(hp - bt2.sides[1].hull.hp).toBe(AMMO.sabot.base);
  });

  it("CHILL and SNAG are gone: a payload's marks are SAP only; SIFTER removes SAP, and nothing else cuts damage", () => {
    expect(siftDebuffs({ sap: true }, 1)).toBe(1);
    expect(siftDebuffs({}, "all")).toBe(0);
    expect(debuffedDamage(100, { sap: true })).toBe(80);
    expect(debuffedDamage(100, {})).toBe(100);
    // DRAG CHAIN's round has no slow multiplier any more, and no route keeps a slow
    for (const s of [1, 2, 3]) expect(Object.keys(round("dragchain", s)).sort()).toEqual(["kind", "seconds"]);
    const bt = new Battle(FOE, FOE, 1);
    expect(bt.sides[1].routes.every((r) => !("cellSlow" in r))).toBe(true);
  });

  it("MANTLET: immune to every STUN source from ★1 (frost, chain, sabot and limpet included); ★2 is FULL GUARD", () => {
    expect([...STUN_CAUSES].sort()).toEqual(["arc", "drag", "freeze", "limpet", "sabot", "shock", "static"]);
    for (const s of [1, 2, 3]) expect([...effectAt("mantlet", s).mod!.immune!].sort(), `★${s}`).toEqual([...STUN_CAUSES].sort());
    expect([2, 3].map((s) => ITEMS.mantlet.levels![s as 2 | 3]!.perk)).toEqual(["FULL GUARD", "BULWARK SKIRT"]);
    for (const cause of STUN_CAUSES) {
      const bt = new Battle(FOE, withGear(heroStartBuild("bastion"), "mantlet"), 1);
      const tu = bt.sides[1].turrets.find((x) => x.immune.length)!;
      const t = bt.sides[1].targets.find((x) => x.kind === "turret" && x.ref === tu.index)!;
      expect(hooks(bt).disrupt(bt.sides[1], t, 2, cause), cause).toBe(false);
      expect(tu.disrupted, cause).toBe(0);
    }
    // the rounds' own paths reach the same immunity
    for (const def of ["frostbite", "dragchain", "sabot"]) {
      const bt = new Battle(FOE, withGear(heroStartBuild("bastion"), "mantlet"), 1);
      const tu = bt.sides[1].turrets.find((x) => x.immune.length)!;
      const t = bt.sides[1].targets.find((x) => x.kind === "turret" && x.ref === tu.index)!;
      hooks(bt).roundImpact(bt.sides[1], t, round(def), 0);
      expect(tu.disrupted, def).toBe(0);
    }
  });

  it("SUS-A's WARD BELL and MENDING LOOM pause while their turret is stunned, for every STUN source", () => {
    for (const cause of STUN_CAUSES) {
      const b = withGear(withGear(heroStartBuild("bastion"), "wardbell"), "mendingloom");
      const bt = new Battle(FOE, b, 3);
      const s = bt.sides[1];
      const tu = s.turrets.find((x) => x.bell && x.regen)!;
      const t = s.targets.find((x) => x.kind === "turret" && x.ref === tu.index)!;
      for (let i = 0; i < 59; i++) { bt.step(); bt.drainEvents(); }
      // after tick 59, a 2 s STUN (120 ticks): it reads 0 from tick 179 on, so both pause on ticks 60-178 (as an impact's
      // STUN, set in its tick's flight before sustainTick, pauses them on that tick and the next n - 1)
      expect(hooks(bt).disrupt(s, t, 2, cause), cause).toBe(true);
      const timer = tu.bell!.timer;
      let regen = 0;
      for (let i = 0; i < 119; i++) {
        bt.step();
        for (const e of bt.drainEvents()) if (e.type === "heal" && (e as Heal).source === "regen" && (e as Heal).side === 1) regen++;
        expect(tu.bell!.timer, `${cause}: tick ${bt.ticks}`).toBe(timer);
      }
      expect(regen, `${cause}: no REGEN at 1 s and 2 s (ticks 60 and 120)`).toBe(0);
      bt.step(); bt.drainEvents();
      expect(tu.bell!.timer, `${cause}: runs again on tick 179`).toBeLessThan(timer);
    }
  });
});

describe("NUM-3 step 2: whole-second durations", () => {
  it("every shown duration in the data is a whole number of seconds at every star (N1 2.2's picks)", () => {
    const whole = (x: number | undefined) => x === undefined || Number.isInteger(x);
    const rows: string[] = [];
    for (const d of Object.values(ITEMS) as ItemDef[]) for (const s of [1, 2, 3]) {
      const e = effectAt(d.id, s);
      const r = e.factory?.round as { seconds?: number; stall?: number; delay?: number } | undefined;
      const spark = e.factory?.cycle?.find((p) => p.tint === "spark");
      const vals: [string, number | undefined][] = [
        ["round.seconds", r?.seconds], ["round.stall", r?.stall], ["round.delay", r?.delay], ["spark.shockTime", spark?.shockTime],
        ["gate.shockTime", e.gate?.shockTime], ["gate.staticTime", e.gate?.staticTime], ["gate.overclockCooldown", e.gate?.overclockCooldown],
        ["gate.pulse.period", e.gate?.pulse?.period], ["gate.pulse.on", e.gate?.pulse?.on], ["gate.latch.hold", e.gate?.latch?.hold],
        ["gate.keg.fuse", e.gate?.keg?.fuse], ["gate.burnPerRide.per", e.gate?.burnPerRide?.per], ["core.stall", e.core?.stall],
        ["core.burnTime", e.core?.burnTime], ["core.maxSeconds", e.core?.maxSeconds], ["mod.longRideMin", e.mod?.longRideMin],
        ["factory.plate.every", e.factory?.plate?.every],
      ];
      for (const [k, v] of vals) if (!whole(v)) rows.push(`${d.id} ★${s} ${k} ${v}`);
    }
    expect(rows).toEqual([]);
    expect([DISRUPT_TIME, BURN_TIME, WIND_WARN, WIND_START].every(Number.isInteger)).toBe(true);
  });

  it("N1's picks, star by star", () => {
    const at = (f: (e: ItemDef) => number | undefined, def: string) => [1, 2, 3].map((s) => f(effectAt(def, s)));
    expect([DISRUPT_TIME, ...at((e) => e.gate!.shockTime, "coil").slice(1)]).toEqual([2, 2, 3]);
    expect(at((e) => e.factory!.cycle!.find((p) => p.tint === "spark")!.shockTime ?? DISRUPT_TIME, "hotswap")).toEqual([2, 2, 3]);
    expect(at((e) => e.gate!.staticTime, "staticbrush")).toEqual([1, 2, 3]);
    expect(at((e) => e.core!.stall, "tesla")).toEqual([1, 1, 1]);
    expect(at((e) => (e.factory!.round as { seconds: number }).seconds, "frostbite")).toEqual([2, 3, 3]);
    expect(at((e) => (e.factory!.round as { seconds: number }).seconds, "dragchain")).toEqual([1, 2, 2]);
    expect(at((e) => (e.factory!.round as { seconds: number }).seconds, "sabot")).toEqual([4, 4, 4]);
    expect(at((e) => (e.factory!.round as { stall?: number }).stall, "limpet")).toEqual([undefined, 1, 2]);
    expect(at((e) => e.gate!.overclockCooldown, "overclocker")).toEqual([4, 2, 1]);
    expect(at((e) => e.gate!.pulse!.period, "surge")).toEqual([3, 3, 2]);
    expect(at((e) => e.gate!.latch!.hold, "twinlatch")).toEqual([1, 1, 1]); // today's 1 s (N1's 1 / 2 / 2 reads R1's unbuilt 1 / 1.5 / 2)
    expect(at((e) => e.gate!.burnPerRide!.burn, "bellows")).toEqual([4, 9, 14]);
    expect(at((e) => e.gate!.burnPerRide!.per, "bellows")).toEqual([10, 10, 10]);
    expect(at((e) => e.core!.windowTime, "rotary")).toEqual([0.75, 0.75, 0.75]); // LOAD 50% SHORTER: 1.5 s x 50%
  });

  it("a STUN starts and ends on the integer tick count: n whole ticks, after BRACE FRAME's or STEADY IRON's cut, no float drift", () => {
    for (const [secs, ticks] of [[1, 60], [2, 120], [3, 180], [4, 240], [0.7, 42], [1.6, 96], [1.75, 105]] as const) {
      const bt = new Battle(FOE, FOE, 1);
      for (let i = 0; i < 37; i++) { bt.step(); bt.drainEvents(); }
      const t = targetOf(bt, "turret");
      hooks(bt).disrupt(bt.sides[1], t, secs, "shock");
      const start = bt.ticks;
      let last = -1;
      for (let i = 0; i < ticks + 5; i++) { bt.step(); bt.drainEvents(); if (stunOf(bt, t) > 0) last = bt.ticks; }
      expect(last - start, `${secs} s`).toBe(ticks - 1); // reads > 0 after ticks start+1 .. start+n-1, and exactly 0 from start+n
      expect(stunOf(bt, t), `${secs} s`).toBe(0);
    }
  });

  it("a 1 s STUN from a real round late in a fight (the float clock drifted) still lasts exactly 60 ticks", () => {
    const bt = new Battle(FOE, FOE, 1);
    for (let i = 0; i < 899; i++) { bt.step(); bt.drainEvents(); }
    expect(bt.over).toBe(false);
    expect(Math.abs(bt.t - 15)).toBeGreaterThan(0); // the float clock has drifted off 15 s; the tick count hasn't
    const t = targetOf(bt, "belt");
    hooks(bt).roundImpact(bt.sides[1], t, round("dragchain"), 0);
    const start = bt.ticks;
    let end = -1;
    for (let i = 0; i < 70 && !bt.over; i++) { bt.step(); bt.drainEvents(); if (end < 0 && stunOf(bt, t) === 0) end = bt.ticks; }
    expect(end - start).toBe(60);
  });
});

describe("NUM-3 step 3: the cadence carry", () => {
  it("SURGE VALVE's pulse: on the integer tick count, whole-second periods start on exact ticks (3 s: 180, 360; 2 s: 120)", () => {
    const bt = new Battle(FOE, FOE, 1);
    const phase = (ticks: number, period: number, on = 1) => { bt.ticks = ticks; return hooks(bt).pulsePhase({ on, period }); };
    // ★1 / ★2: 3 s, on 1 s: on for ticks [0, 60), [180, 240), [360, 420); ★3: 2 s
    expect([59, 60, 179, 180, 239, 240, 359, 360].map((n) => phase(n, 3).on)).toEqual([true, false, false, true, true, false, false, true]);
    expect([179, 180, 360].map((n) => phase(n, 3).cycle)).toEqual([0, 1, 2]);
    expect([119, 120, 179, 180, 240].map((n) => phase(n, 2).on)).toEqual([false, true, true, false, true]);
    // late in the fight, where the float clock has drifted (this.t is 24.99999999999986 on tick 1500)
    expect([1439, 1440, 1499, 1500].map((n) => phase(n, 3).on)).toEqual([false, true, true, false]);
  });

  it("SURGE VALVE's pulse carries its remainder at an off-grid period: 1.01 s pulses start on ticks 61, 122, 182, 243", () => {
    const bt = new Battle(FOE, FOE, 1);
    const starts: number[] = [];
    let was = true;
    for (let n = 1; n <= 250; n++) {
      bt.ticks = n;
      const on = hooks(bt).pulsePhase({ on: 0.5, period: 1.01 }).on;
      if (on && !was) starts.push(n);
      was = on;
    }
    expect(starts).toEqual([61, 122, 182, 243]); // a reset timer would drift a tick a beat: 61, 122, 183, 244
  });

  it("SURGE VALVE in a battle: its belt runs fast exactly on the pulse's ticks once the rig is online", () => {
    // a WEAVER start deck with a ★1 SURGE VALVE on the first free cell whose arrow hits a belt tile
    const b = withRig(heroStartBuild("weaver"), "surge");
    const bt = new Battle(b, FOE, 1);
    const g = bt.sides[0].gates.find((x) => x.def.id === "surge");
    expect(g?.hits.length).toBeGreaterThan(0);
    if (!g || !g.hits.length) return;
    const h = g.hits[0], r = bt.sides[0].routes[h.route];
    const fast: number[] = [];
    for (let i = 0; i < 400 && !bt.over; i++) {
      bt.step(); bt.drainEvents();
      if (g.online && g.disrupted <= 0 && r.speedAt[h.tile] > 1 && bt.ticks >= 180 && bt.ticks < 420) fast.push(bt.ticks);
    }
    expect(fast.length).toBeGreaterThan(0);
    // only ticks inside the pulses [180, 240) and [360, 420)
    expect(fast.every((n) => (n >= 180 && n < 240) || (n >= 360 && n < 420))).toBe(true);
  });

  it("ARMOR PRESS's plate timer carries its remainder at an off-grid pace (x1.1: 164, 328, 491, 655; a reset gives 492, 656)", () => {
    const bt = new Battle(withFactory(heroStartBuild("furnace"), "armorpress"), FOE, 3);
    const f = bt.sides[0].factories[0];
    expect(f.plateTimer).toBe(3);
    f.pace = 1.1;
    const at: number[] = [];
    for (let i = 0; i < 700; i++) { const was = f.plateTimer!; bt.step(); bt.drainEvents(); if (f.plateTimer! > was) at.push(bt.ticks); }
    expect(at).toEqual([164, 328, 491, 655]);
  });

});
