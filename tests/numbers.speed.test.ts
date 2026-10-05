// NUM-2 (REQ-BFG-047, N1 2.2): SPEED, K = 30. The checker of scripts/num2-speed.mjs: every turret and factory stores a
// whole `speed` (shots or slugs per 30 s), recorded against the base's interval in tests/fixtures/num2-base-intervals.json;
// the battle's interval is 30 / speed and its timers carry their remainder, so over 120 s a timer fires 120 x speed / 30
// times, within one shot. Re-run the script on a new base (its header) and this file checks it unchanged.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Battle } from "../src/sim/battle";
import { HEROES, ITEMS, SPEED_K, TURRET_SPEED, WAVE3_ITEMS, levelSpeed, secPer, type HeroId } from "../src/sim/content";
import { RACE_HEROES, RACE_ITEMS } from "../src/sim/races/data";
import { P1_WAVE3_ITEMS } from "../tools/wave3Defs";
import { cloneBuild, installedTurrets, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { effectAt } from "../src/sim/stars";
import { turretAt } from "../src/sim/battle"; // NUM-4
import { turretSlots } from "../src/sim/deck";
import { ICON } from "../src/render/font";
import { newRun } from "../src/game/run";
import { turretPanel } from "../src/screens/build/inspector";

interface Row { file: string; path: string; field: string; to: string; kind: "speed" | "rate"; base: number; value: number; track?: boolean }
const FIX = JSON.parse(readFileSync(new URL("./fixtures/num2-base-intervals.json", import.meta.url), "utf8")) as { K: number; FACTORY_STEP: number; rows: Row[] };
const TABLES: Record<string, unknown> = { ITEMS, WAVE3_ITEMS, HEROES, RACE_ITEMS, RACE_HEROES, P1_WAVE3_ITEMS };
const roundHalfUp = (x: number): number => Math.floor(x + 0.5 + 1e-9);

/** The live value at a recorded path, under the field's new name. */
function live(r: Row): unknown {
  const keys = r.path.split(".");
  keys[keys.length - 1] = r.to;
  let o: unknown = TABLES[keys[0]];
  for (const k of keys.slice(1)) o = (o as Record<string, unknown> | undefined)?.[k];
  return o;
}
const speeds = FIX.rows.filter((r) => r.kind === "speed" && r.base > 0);

describe("NUM-2 SPEED: the stored value (scripts/num2-speed.mjs, K = 30)", () => {
  it("records 114 speeds and 27 rate %s, K 30", () => {
    expect([FIX.K, SPEED_K]).toEqual([30, 30]);
    expect([FIX.rows.filter((r) => r.kind === "speed").length, FIX.rows.filter((r) => r.kind === "rate").length]).toEqual([114, 27]);
  });

  it("every speed equals roundHalfUp(30 / its recorded interval), a whole number (the BELTS FACTORY levels: belts.numbers)", () => {
    for (const r of speeds) {
      const v = live(r);
      expect(Number.isInteger(v), r.path).toBe(true);
      if (r.track) continue; // a signature factory's levels 2-4: whole steps of 25% of level 1 (tests/belts.numbers.test.ts)
      expect(v, r.path).toBe(roundHalfUp(30 / r.base));
    }
  });

  it("no rate moves more than 5% (N1: worst 4%); every speed 5-89; SABOT ★1 is 5", () => {
    let worst = 0, at = "";
    for (const r of speeds) {
      const move = Math.abs((live(r) as number) / (30 / r.base) - 1);
      if (move > worst) { worst = move; at = r.path; }
      expect(move, r.path).toBeLessThanOrEqual(0.05);
    }
    console.log(`NUM-2 worst rate move ${(100 * worst).toFixed(2)}% at ${at}`);
    const all = speeds.map((r) => live(r) as number);
    // TURRET SPEED's levels on the starting turrets (deck.ts turretSlots): the top of the range
    for (const h of Object.keys(HEROES) as HeroId[]) for (const t of HEROES[h].turrets) if (t.speed) all.push(levelSpeed(t.speed, 4, TURRET_SPEED));
    expect([Math.min(...all), Math.max(...all)]).toEqual([5, 88]);
    expect(ITEMS.sabot.factory!.speed).toBe(5);
  });

  it("no turret or factory in the tables keeps an interval: every one is recorded", () => {
    const recorded = new Set(FIX.rows.map((r) => r.path.replace(/\.(fireInterval|interval)$/, ".speed")));
    // FLIP-X2 (REQ-BFG-069, the sustain switch on): ITEMS lists MEND PRESS now. SUS-A wrote it after this script, with
    // whole speeds (ARMOR PRESS's 19 / 21 / 25, content.ts SUSTAIN_ITEMS), so its 3 speeds are NUM-2-native: never recorded,
    // each whole and pinned here; every other speed must be recorded, as before (was: every one recorded)
    const NATIVE: Record<string, number> = { "ITEMS.mendpress.factory.speed": 19, "ITEMS.mendpress.levels.2.factory.speed": 21, "ITEMS.mendpress.levels.3.factory.speed": 25 };
    const met: string[] = [];
    for (const [name, table] of Object.entries({ ITEMS, WAVE3_ITEMS, RACE_ITEMS })) {
      for (const [id, d] of Object.entries(table)) {
        // ITEMS holds the race and wave-3 tables too (content.ts): each is recorded under its own table's name
        if (name === "ITEMS" && (id in RACE_ITEMS || id in WAVE3_ITEMS)) continue;
        const levels = d.levels ?? {};
        for (const [lv, spec] of [["", d], ...Object.entries(levels)] as [string, typeof d][]) {
          const at = lv ? `${name}.${id}.levels.${lv}` : `${name}.${id}`;
          if (spec.turret && "speed" in spec.turret) expect(recorded.has(`${at}.turret.speed`), at).toBe(true);
          if (spec.factory && "speed" in spec.factory) {
            const path = `${at}.factory.speed`;
            if (path in NATIVE) {
              met.push(path);
              expect([recorded.has(path), spec.factory.speed], at).toEqual([false, NATIVE[path]]);
            } else expect(recorded.has(path), at).toBe(true);
          }
          expect(spec.turret && "fireInterval" in spec.turret, at).toBeFalsy();
          expect(spec.factory && "interval" in spec.factory, at).toBeFalsy();
        }
      }
    }
    expect(met.sort()).toEqual(Object.keys(NATIVE).sort()); // FLIP-X2: the walk meets all 3
  });
});

/** A battle where nothing dies in 120 s (both hulls huge) and nothing fights back but the wind. */
function quietBattle(b: Build): Battle {
  const me = cloneBuild(b), foe = heroStartBuild("bastion", 900);
  foe.routes = [];
  me.hullBonus = 1e8;
  foe.hullBonus = 1e8;
  return new Battle(me, foe, 20261005);
}

/** Over 120 s, the shots of every turret of side 0, each kept loaded every tick (its window topped up from a payload the
 *  deck's own factory made, so no belt backs up and nothing jams): the real Battle.chambers timers. */
function turretShots(b: Build): { speed: number; shots: number }[] {
  const bt = quietBattle(b);
  const s = bt.sides[0];
  let proto: unknown;
  while (!proto && bt.t < 10) { bt.step(); bt.events.length = 0; proto = s.routes.flatMap((r) => r.ammo)[0]?.p; }
  expect(proto).toBeDefined();
  for (const r of s.routes) r.ammo.length = 0;
  const shots = s.turrets.map(() => 0);
  const t0 = bt.t;
  while (bt.t < t0 + 120 - 1e-9 && !bt.over) {
    for (const tu of s.turrets) while (tu.stack.length < tu.window) tu.stack.push({ ...(proto as object), id: bt.newId() } as never);
    for (const r of s.routes) r.ammo.length = 0;
    bt.step();
    for (const e of bt.events) if (e.type === "fire" && e.side === 0) shots[e.turret]++;
    bt.events.length = 0;
  }
  return s.turrets.map((tu, i) => ({ speed: tu.speed, shots: shots[i] }));
}

describe("NUM-2 SPEED: the timers carry their remainder (Battle.chambers, Battle.produce)", () => {
  it("over 120 s an over-fed turret fires 120 x speed / 30 times, within one shot (SCRAP CANNON, DART GUN; TURRET SPEED 1-4)", () => {
    const seen: string[] = [];
    for (const hero of ["furnace", "weaver"] as HeroId[]) for (const level of [1, 2, 3, 4]) {
      const b = heroStartBuild(hero, 1);
      if (level > 1) b.upgrades = { ...(b.upgrades ?? {}), turret: level };
      const want = installedTurrets(b).map((t) => t.td.speed);
      const got = turretShots(b);
      expect(got.map((g) => g.speed), `${hero} L${level}`).toEqual(want);
      for (const g of got) {
        seen.push(`${hero} L${level} speed ${g.speed}: ${g.shots} (${(120 * g.speed) / 30})`);
        expect(Math.abs(g.shots - (120 * g.speed) / SPEED_K), `${hero} L${level} speed ${g.speed}`).toBeLessThanOrEqual(1);
      }
    }
    console.log(`NUM-2 120 s shots: ${seen.join("; ")}`);
  });

  // cap's oracle ec91a967c21f4c7b item 1: the carried remainder banks no time. A gun's shot timer stops within one tick
  // below 0 and a stalled factory's stamp timer is reset to 0, so after 5 s starved (or stalled) each fires ONCE when fed,
  // then once more one interval later (within a tick), with nothing in between: no burst
  it("no burst: a turret starved for 5 s and a factory stalled for 5 s fire once when fed, then once more one interval later", () => {
    const dt = 1 / 60;
    // the turret: FURNACE's SCRAP CANNON (speed 30, 1 s), no loads for 5 s, then a full window at once
    const bt = quietBattle(heroStartBuild("furnace", 1));
    const s = bt.sides[0], tu = s.turrets[0];
    let proto: unknown;
    while (!proto && bt.t < 10) { bt.step(); bt.events.length = 0; proto = s.routes.flatMap((r) => r.ammo)[0]?.p; }
    const startFed = bt.t + 5;
    while (bt.t < startFed) { for (const r of s.routes) r.ammo.length = 0; tu.stack.length = 0; bt.step(); bt.events.length = 0; }
    expect(tu.fireCd).toBeLessThanOrEqual(0);
    expect(tu.fireCd).toBeGreaterThan(-dt - 1e-12); // the timer stopped within one tick below 0: nothing banked
    for (let k = 0; k < tu.window; k++) tu.stack.push({ ...(proto as object), id: bt.newId() } as never);
    const fedAt = bt.t, shots: number[] = [];
    while (bt.t < fedAt + 1.5 * tu.interval) {
      for (const r of s.routes) r.ammo.length = 0;
      bt.step();
      for (const e of bt.events) if (e.type === "fire" && e.side === 0 && e.turret === tu.index) shots.push(bt.t);
      bt.events.length = 0;
    }
    expect(shots.length, `shots at ${shots.map((t) => (t - fedAt).toFixed(3)).join(", ")}`).toBe(2);
    expect(shots[0] - fedAt).toBeLessThanOrEqual(dt + 1e-9); // once when fed (the next tick)
    expect(Math.abs(shots[1] - shots[0] - tu.interval)).toBeLessThanOrEqual(dt + 1e-9); // once more an interval later
    // the factory: FURNACE's KILN (speed 24, 1.25 s), its mouth blocked for 5 s (the stall path), then its belts clear
    const bf = quietBattle(heroStartBuild("furnace", 1));
    const sf = bf.sides[0], f = sf.factories.find((x) => x.def.id === "kiln")!;
    let slug: unknown;
    while (!slug && bf.t < 10) { bf.step(); bf.events.length = 0; slug = sf.routes.flatMap((r) => r.ammo)[0]?.p; }
    const blockEnd = bf.t + 5;
    const mine = sf.routes.filter((r) => r.factory === f.uid);
    expect(mine.length).toBeGreaterThan(0);
    while (bf.t < blockEnd) {
      for (const r of mine) r.ammo.splice(0, r.ammo.length, { p: { ...(slug as object) }, s: 0, processed: -1, blocked: false } as never);
      bf.step();
      bf.events.length = 0;
    }
    expect(f.stalled).toBe(true);
    const interval = secPer(f.def.factory!.speed), stamps: number[] = [], freedAt = bf.t;
    let made = f.produced;
    while (bf.t < freedAt + 1.5 * interval) {
      for (const r of mine) r.ammo.length = 0;
      bf.step();
      if (f.produced !== made) { stamps.push(bf.t); made = f.produced; }
      bf.events.length = 0;
    }
    expect(stamps.length, `stamps at ${stamps.map((t) => (t - freedAt).toFixed(3)).join(", ")}`).toBe(2);
    expect(stamps[0] - freedAt).toBeLessThanOrEqual(dt + 1e-9); // once when its belts clear (the next tick)
    expect(Math.abs(stamps[1] - stamps[0] - interval)).toBeLessThanOrEqual(dt + 1e-9);
  });

  it("over 120 s a factory whose belts never back up stamps 120 x speed / 30 slugs, within one (KILN and LOOM, FACTORY 1-4)", () => {
    for (const hero of ["furnace", "weaver"] as HeroId[]) for (const level of [1, 2, 3, 4]) {
      const b = heroStartBuild(hero, 1);
      if (level > 1) b.upgrades = { ...(b.upgrades ?? {}), factory: level };
      const bt = quietBattle(b);
      const f = bt.sides[0].factories.find((x) => x.def.id === HEROES[hero].factory)!;
      const speed = effectAt(f.def.id, level).factory!.speed;
      expect(f.def.factory!.speed, `${hero} L${level}`).toBe(speed);
      const p0 = f.produced, t0 = bt.t;
      while (bt.t < t0 + 120 - 1e-9 && !bt.over) {
        for (const r of bt.sides[0].routes) r.ammo.length = 0; // nothing backs up: the stamp timer alone sets the pace
        bt.step();
        bt.events.length = 0;
      }
      const made = f.produced - p0;
      expect(Math.abs(made - (120 * speed) / SPEED_K), `${hero} FACTORY ${level}: speed ${speed}, ${made} slugs in 120 s`).toBeLessThanOrEqual(1);
      expect(secPer(speed)).toBeCloseTo(30 / speed, 12);
    }
  });
});

// NUM-4 (REQ-BFG-047; N1 2.5 "numbers.speed"): the printed SPEED is the battle's. A turret's and a factory's stat row lead
// with {RATE}n through fmtSpeed (faces.ts speedPair; tests/numbers.faces checks every piece x star against its spec); an
// installed turret's panel prints the speed makeTurret builds, so here every starting turret x TURRET SPEED level 1-4 x
// the speed gear (none, CALIBRATION and ESCAPEMENT at each star) prints exactly the TurretState speed the battle fights
// with. STEAM BREECH's plated rate and GATLING SPOOL's spin move during a fight: their rule lines say them (whole %s).
describe("NUM-4: the turret panel's {RATE}n is the battle's TurretState.speed (levels x speed gear)", () => {
  it("every starting turret, TURRET SPEED 1-4, no gear / CALIBRATION / ESCAPEMENT at each star", () => {
    const rateIn = (text: string): number => Number(new RegExp(`${ICON.RATE}(\\d+)`).exec(text)?.[1] ?? NaN);
    let n = 0;
    for (const hero of ["furnace", "weaver", "foundry", "bastion", "metronome", "siphon"] as HeroId[]) {
      const run = newRun(hero, 6262);
      const i = turretSlots(run.build).findIndex((s) => s.turret?.free);
      if (i < 0) continue;
      const slot = turretSlots(run.build)[i].slot;
      for (const level of [1, 2, 3, 4]) for (const gear of [null, "calibrate", "escapement"]) for (const stars of gear ? [1, 2, 3] : [1]) {
        run.build = { ...cloneBuild(heroStartBuild(hero, 1)), ...(level > 1 ? { upgrades: { turret: level } } : {}),
          mods: gear ? [{ uid: 990, def: gear, turret: slot, ...(stars > 1 ? { stars } : {}) }] : [] };
        const row = turretPanel(run, i)!.body.find((b) => b.role === "ability")!.text;
        const speed = turretAt(new Battle(run.build, heroStartBuild("weaver", 1), 4411).sides[0], slot)!.speed;
        expect([rateIn(row), Number.isInteger(speed)], `${hero} L${level} ${gear ?? "-"} ★${stars}: ${row}`).toEqual([speed, true]);
        n++;
      }
    }
    expect(n).toBe(6 * 4 * 7); // the 6 heroes' starting turrets x 4 levels x 7 gear cases
  });
});
