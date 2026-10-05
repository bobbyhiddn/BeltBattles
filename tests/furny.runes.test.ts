// FURN-Y (release Y, ported by Y-FURN; REQ-BFG-069, REQ-BFG-047): FURNACE's four style runes in their working forms. The
// four stay dormant (DORMANT_RUNES) until Y7b; these tests hand them to a build directly.
// - COAL CHUTE / HEAT SINK (heatPct, no new kind): "YOUR HEAT: +n%" reads the KILN's HEAT (the cinder slug's own
//   rideScale x the seconds ridden, battle.ts rideOf) as well as a HEAT JACKET's; a deck with no ride-scaled slug and no
//   HEAT JACKET battles exactly as before.
// - SEARING (searBurn, new): n BURN on the foe's hull at the start, and a foe with your BURN heals nothing.
// - SHATTER SHOT (shatterPct, new): your shots +n% DMG (runeMul's whole % sum), and a hit breaks one SHIELD and still lands.
import { describe, expect, it } from "vitest";
import { Battle, simulate, type Payload, type Target } from "../src/sim/battle";
import { BURN_TIME } from "../src/sim/content";
import { cloneBuild, payloadDamage, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { RUNES, runeMods } from "../src/sim/runes";

const W = (b: Build, ...ids: string[]): Build => ({ ...cloneBuild(b), runes: [...(b.runes ?? []), ...ids.map((id) => ({ id }))] });
const n = (id: string) => RUNES[id].amount.n;
const FOE = heroStartBuild("weaver");
const HULL: Target = { kind: "hull", ref: -1, cell: -1, x: 60, y: 60, weight: 1 };
const pay = (extra: Partial<Payload> = {}): Payload =>
  ({ id: 1e6, ammo: "cinder", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...extra });
type Inner = { rideOf(s: unknown, p: Payload): number; runeMul(s: unknown, paired: boolean, p: Payload, first: boolean): number; impact(p: unknown): void };
const inner = (bt: Battle) => bt as unknown as Inner;
function land(bt: Battle, from: 0 | 1, dmg: number): void {
  inner(bt).impact({ id: 1e6, from, turret: 0, payload: pay({ ammo: "plain" }), dmg, t: 0, flight: 0, target: HULL, tx: 60, ty: 60, heavy: false });
}

describe("FURN-Y: COAL CHUTE and HEAT SINK read the KILN's HEAT", () => {
  it("the ride a cinder slug's damage reads is +n% (with THE LONG ROAD, x2 then +n%); without heatPct as before", () => {
    const f = heroStartBuild("furnace");
    for (const id of ["coal_chute", "heat_sink"]) {
      const bt = new Battle(W(f, id), FOE, 1), s = bt.sides[0];
      expect(inner(bt).rideOf(s, pay({ ride: 4 })), id).toBeCloseTo(4 * (1 + n(id) / 100), 9);
      const road = new Battle(W(f, id, "long_road"), FOE, 1);
      expect(inner(road).rideOf(road.sides[0], pay({ ride: 4 })), id).toBeCloseTo(4 * 2 * (1 + n(id) / 100), 9);
      // the slug's damage: base 40 + its HEAT 12 a second, the HEAT part +n% (N1: whole at fire)
      expect(payloadDamage(40, 12, inner(bt).rideOf(s, pay({ ride: 5 })), 1, 0)).toBe(Math.max(10, Math.round(40 + 12 * 5 * (1 + n(id) / 100))));
    }
    const plain = new Battle(f, FOE, 1);
    expect(inner(plain).rideOf(plain.sides[0], pay({ ride: 4 }))).toBe(4);
  });

  it("in battle: a FURNACE deck holding COAL CHUTE deals more; a deck with no ride-scaled slug battles exactly as before", () => {
    const f = heroStartBuild("furnace");
    const dmg = (b: Build) => simulate(b, FOE, 11).sides[0].stats.damage;
    expect(dmg(W(f, "coal_chute"))).toBeGreaterThan(dmg(f));
    const end = (x: Battle) => [x.winner, x.ticks, x.sides[0].hull.hp, x.sides[1].hull.hp];
    const w = heroStartBuild("weaver"), foe = heroStartBuild("foundry");
    expect(end(simulate(W(w, "heat_sink"), foe, 5))).toEqual(end(simulate(w, foe, 5)));
  });
});

describe("FURN-Y: SEARING (searBurn)", () => {
  it("n BURN on the foe's hull at the start, for BURN_TIME; a foe with your BURN heals nothing; the holder's heals as before", () => {
    const bt = new Battle(FOE, W(heroStartBuild("furnace"), "searing"), 1);
    const s = bt.sides[0], holder = bt.sides[1];
    expect(s.hull.burns).toEqual([{ dps: n("searing"), t: BURN_TIME }]);
    expect(holder.hull.burns).toEqual([]);
    s.hull.hp -= 500;
    expect(bt.heal(s, 21, "regen")).toBe(0);
    expect(s.heals).toMatchObject({ healed: 0, burnLost: 21 });
    s.hull.burns.length = 0;
    expect(bt.heal(s, 21, "regen")).toBe(21);
    holder.hull.hp -= 500;
    holder.hull.burns.push({ dps: 1, t: 3 });
    expect(bt.heal(holder, 21, "regen")).toBe(10); // BURN's half on the holder, as before
  });
});

describe("FURN-Y: SHATTER SHOT (shatterPct)", () => {
  it("your shots +n% DMG (runeMul), and a hit breaks one SHIELD and still lands on PLATE, then HULL", () => {
    const bt = new Battle(W(FOE, "shatter_shot"), FOE, 1);
    expect(inner(bt).runeMul(bt.sides[0], false, pay({ ammo: "plain" }), false)).toBeCloseTo(1 + n("shatter_shot") / 100, 9);
    const def = bt.sides[1];
    bt.gainShield(def, 2);
    def.plate.plate = 30;
    const hp = def.hull.hp;
    land(bt, 0, 70);
    expect([def.shield, def.blocked ?? 0, def.plate.plate, hp - def.hull.hp]).toEqual([1, 0, 0, 40]);
  });

  it("a build without the four battles with every FURN-Y kind at 0", () => {
    const m = runeMods([{ id: "war_edge" }, { id: "ash_kindle" }])!;
    expect([m.searBurn, m.shatterPct, m.heatPct]).toEqual([0, 0, 0]);
  });
});
