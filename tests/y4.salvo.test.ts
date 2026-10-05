// Y4 (release Y; REQ-BFG-047; BRIEF-Y4 S1): SALVO RACK's exact volley pace, with the star switch on. One helper (cores.ts
// salvoSpeed) makes the turret row's RATE (screens/build/inspector.ts turretPanel, Y1's cue) and, with the switch on, the
// sim's volley reload (cores.ts salvoReload: ROUTINES.salvo's cadence and battle.ts loadPace): the interval of a turret at
// that whole SPEED, so the row's RATE 19 is the sim's own value. Off, the sim reloads for the interval x reloadMul as before.
import { describe, expect, it } from "vitest";
import { Battle, loadPace, type Payload, type TurretState } from "../src/sim/battle";
import { ITEMS, secPer, withStarRules } from "../src/sim/content";
import { key, type Build } from "../src/sim/deck";
import { ROUTINES, salvoReload, salvoSpeed } from "../src/sim/cores";
import { newRun, type Run } from "../src/game/run";
import { turretPanel } from "../src/screens/build/inspector";
import { speedPair } from "../src/ui/faces";
import { statRow } from "../src/ui/icons";
import { fmtCount } from "../src/ui/statFormat";
import { SEED, barge, furnaceBench, withMod } from "./wave3.helpers";

const MUL = ITEMS.salvo.core!.reloadMul!;
/** FURNACE's bench with a SALVO RACK on its SCRAP CANNON (the free starting copy) at TURRET SPEED `level`; `long`: its
 *  belt is 8 tiles (tests/furnace.cadence's), so E1's long belt makes it 39% faster. */
function salvoBench(level = 1, long = false): Build {
  const b = withMod(furnaceBench(), 60, "salvo", 0, 1);
  if (level > 1) b.upgrades = { turret: level };
  if (long) b.routes[0].cells = [key(4, 5), key(3, 5), key(3, 4), key(3, 3), key(3, 2), key(4, 2), key(4, 1), key(4, 0)];
  return b;
}
const turret = (b: Build, star: boolean): TurretState => withStarRules(() => new Battle(b, barge(), SEED).sides[0].turrets[0], star);
/** The scenes: TURRET SPEED levels 1-4 (SPEED 30 / 36 / 42 / 48) and the long belt (30 x 1.39 = 41.7, SPEED 42). */
const SCENES: { name: string; b: () => Build; speed: number; rate: number }[] = [
  { name: "SCRAP CANNON", b: () => salvoBench(1), speed: 30, rate: 19 }, // 18.75
  { name: "TURRET SPEED 2", b: () => salvoBench(2), speed: 36, rate: 23 }, // 22.5
  { name: "TURRET SPEED 3", b: () => salvoBench(3), speed: 42, rate: 26 }, // 26.25
  { name: "TURRET SPEED 4", b: () => salvoBench(4), speed: 48, rate: 30 },
  { name: "the long belt", b: () => salvoBench(1, true), speed: 42, rate: 26 },
];

describe("Y4 S1: SALVO RACK's volley pace, one helper for the sim and the turret row", () => {
  it("salvoSpeed: the SPEED over reloadMul (1.6), rounded half up once, as makeTurret rounds a SPEED", () => {
    expect(MUL).toBe(1.6);
    expect([30, 36, 42, 48, 55, 40].map((v) => salvoSpeed(v, MUL))).toEqual([19, 23, 26, 30, 34, 25]);
  });

  it("the sim: on, the volley reload is the interval of a turret at that SPEED (off: the interval x 1.6), in ROUTINES.salvo and loadPace", () => {
    for (const sc of SCENES) {
      const on = turret(sc.b(), true), off = turret(sc.b(), false);
      expect([on.speed, off.speed], sc.name).toEqual([sc.speed, sc.speed]);
      expect(withStarRules(() => ROUTINES.salvo.cadence(on, 0)), sc.name).toBe(secPer(sc.rate));
      expect(withStarRules(() => ROUTINES.salvo.cadence(off, 0), false), sc.name).toBe(off.interval * MUL);
      expect(withStarRules(() => loadPace(on)), sc.name).toBe(secPer(sc.rate) / on.window);
      expect(withStarRules(() => loadPace(off), false), sc.name).toBe((off.interval * MUL) / off.window);
      // the switch is live: on and off differ wherever SPEED / 1.6 isn't whole (48 / 1.6 = 30 is the one exact case here)
      const same = Math.abs(withStarRules(() => salvoReload(on)) - off.interval * MUL) < 1e-12;
      expect(same, sc.name).toBe(sc.speed === 48);
    }
  });

  it("the row: the turret panel's RATE is that SPEED, and with the switch on its interval is the sim's volley reload", () => {
    for (const sc of SCENES) {
      const b = sc.b();
      const run: Run = newRun("furnace", 5, "y4salvo");
      run.build = { ...run.build, items: b.items, routes: b.routes, mods: b.mods, ...(b.upgrades ? { upgrades: b.upgrades } : {}) };
      const row = (star: boolean) => withStarRules(() => turretPanel(run, 0)!.body.filter((x) => x.role !== "warn")[0].text, star);
      const want = statRow([speedPair(sc.rate), ["SLUG", fmtCount(3)], ["GEAR", fmtCount(1)]]);
      expect([row(true), row(false)], sc.name).toEqual([want, want]); // the row is the same number whatever the switch
      expect(withStarRules(() => salvoReload(turret(b, true))), sc.name).toBe(secPer(sc.rate)); // and the sim's own, on
    }
  });

  it("battle: on, a seeded SALVO gun kept full fires its volleys every 30 / 19 s on average (off every 1.6 s)", () => {
    // the gun's chamber is refilled whenever it opens empty (no belt: tests/furnace.cadence's burst), so each volley waits
    // for its reload only; the shot timer carries its remainder (NUM-2), so the mean gap is the reload to within a tick / n
    const payload = (id: number): Payload => ({ id, ammo: "cinder", ride: 2, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false });
    const volleys = (star: boolean, n = 25): number[] => withStarRules(() => {
      const b = salvoBench();
      b.routes = [];
      const bt = new Battle(b, barge(), SEED), gun = bt.sides[0].turrets[0];
      const times: number[] = [];
      let id = 9000;
      while (times.length < n && bt.t < 120) {
        if (gun.phase === "load" && gun.stack.length === 0) while (gun.stack.length < gun.window) gun.stack.push(payload(id++));
        bt.step();
        if (bt.drainEvents().some((e) => e.type === "fire" && e.side === 0)) times.push(bt.t);
      }
      return times;
    }, star);
    const mean = (t: number[]) => (t[t.length - 1] - t[0]) / (t.length - 1);
    const on = volleys(true), off = volleys(false);
    expect([on.length, off.length]).toEqual([25, 25]);
    expect(Math.abs(mean(on) - secPer(19))).toBeLessThanOrEqual(1 / 60 / 24 + 1e-9);
    expect(Math.abs(mean(off) - 1.6)).toBeLessThanOrEqual(1 / 60 / 24 + 1e-9);
  });
});
