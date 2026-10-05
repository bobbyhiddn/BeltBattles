// 0.6.1b M2: the turret core routines (ARSENAL.md §2 and §10 item 1; brief 0.6.1b "Tests"). Every core at
// 1-3 stars on a heavy turret (FURNACE), a medium one (a stand-in TurretDef, speed 40: 30 / 40 = 0.75 s; NUM-2, was
// fireInterval 0.75) and a light one (WEAVER). A bench side keeps its factory but has no belts, so only the loads a test puts in the
// chamber fire; the foe is a passive barge (no belts, +2000 hull). Plain slugs deal 3 (NUM-1: 30, AMMO.plain.base).
import { describe, expect, it } from "vitest";
import { Battle, makeTurret, type Payload, type Projectile, type TurretState } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { AMMO, HEROES, ITEMS, SIGNATURE_CORES, WINDOW_TIME, classFactor, type HeroId, type TurretDef } from "../src/sim/content";
import { rateMul, secPer } from "../src/sim/content"; // NUM-2 (REQ-BFG-047): SPEED, 30 / speed; a whole rate %
import type { Build } from "../src/sim/deck";
import { CORE_ABSOLUTE, ROUTINES, pressureBonus, resolveCore } from "../src/sim/cores";
import { effectAt } from "../src/sim/stars";

const CORES = ["scatter", "rotary", "pressure", "gatling", "hullbreaker", "drake", "salvo"];
const STARS = [1, 2, 3];
// NUM-2 (REQ-BFG-047; was fireInterval: 0.75): speed 40, the converter's roundHalfUp(30 / 0.75), exactly 0.75 s again
const MEDIUM: TurretDef = { col0: 4, width: 2, connectors: [4, 5], kind: "medium", speed: 40, window: 2, flight: 0.45 };
interface Cls { name: string; hero: "furnace" | "weaver"; t: number; td?: TurretDef; k: number }
const CLASSES: Cls[] = [
  { name: "heavy FURNACE", hero: "furnace", t: 0, k: 1 },
  { name: "medium stand-in (0.75 s)", hero: "furnace", t: 0, td: MEDIUM, k: 0.75 },
  // NUM-2 (was 0.55): k = classFactor = 30 / speed 55 = 0.5454..; its whole class % roundHalfUp(3000 / 55) = 55, as before
  { name: "light WEAVER", hero: "weaver", t: 1, k: secPer(HEROES.weaver.turrets[0].speed) },
];
const TICK = 1 / 60;

const barge = (): Build => ({ ...startingBuild("furnace", 500), routes: [], hullBonus: 2000 });
function bench(c: Cls, def: string | null, stars = 1, seed = 5): { bt: Battle; tu: TurretState } {
  const b: Build = { ...startingBuild(c.hero, 1), routes: [] };
  if (def) b.mods.push({ uid: 900, def, turret: c.t, ...(stars > 1 ? { stars } : {}) });
  const bt = new Battle(b, barge(), seed);
  if (c.td) bt.sides[0].turrets[c.t] = makeTurret(bt.sides[0].build, c.t, c.td);
  return { bt, tu: bt.sides[0].turrets[c.t] };
}
let pid = 1e6;
const load = (o: Partial<Payload> = {}): Payload => ({
  id: pid++, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 0, copy: false, ...o,
});
const loads = (n: number, o: Partial<Payload> = {}): Payload[] => Array.from({ length: n }, () => load(o));
/** Put loads straight in the chamber; "fire" opens fire, "load" lets the window rule close it. */
function chamber(tu: TurretState, ps: Payload[], phase: "load" | "fire"): void {
  tu.stack.push(...ps);
  tu.phase = phase;
  tu.loadTimer = 0;
}
interface Shot { t: number; pr: Projectile }
/** Step until `until` s (or `n` new projectiles), recording each new projectile and when it was fired. */
function run(bt: Battle, until: number, n = Infinity): Shot[] {
  const seen = new Set<number>(), out: Shot[] = [];
  while (bt.t < until - 1e-9 && out.length < n) {
    bt.step();
    for (const pr of bt.projectiles) if (!seen.has(pr.id)) { seen.add(pr.id); out.push({ t: bt.t, pr }); }
    bt.events.length = 0;
  }
  return out;
}
const round = (v: number) => Math.round(v * 1e9) / 1e9;
// NUM-1 (REQ-BFG-047): the integer pipeline. A plain (and a thread) slug deals AMMO base 30 (x10 of 3); a % rounds half up
// once (src/sim/pct.ts's rule); the class factor is a whole % (kp = round(100 k)) and each scaled core number is
// round(v x kp / 100), at install (cores.ts scaleCore).
const PLAIN = AMMO.plain.base; // 30
const half = (x: number) => Math.floor(x + 0.5 + 1e-9);
const scaled = (v: number, k: number) => half((v * half(100 * k)) / 100);

describe("the core resolver and the class factor", () => {
  it("classFactor = clamp(fireInterval / 1 s, 0.4, 1.2): heavy 1, medium 0.75, light 0.55", () => {
    expect(classFactor(HEROES.furnace.turrets[0])).toBe(1);
    expect(classFactor(MEDIUM)).toBe(0.75);
    // NUM-2 (REQ-BFG-047; was 0.55): the interval is 30 / speed, 30 / 55 = 0.5454..; the class % it scales by stays 55
    expect(classFactor(HEROES.weaver.turrets[0])).toBe(30 / 55);
    expect(half(100 * classFactor(HEROES.weaver.turrets[0]))).toBe(55);
    // NUM-2 (was { fireInterval: 0.1 } and { fireInterval: 3 }): the same intervals as speeds, 30 / 0.1 = 300, 30 / 3 = 10
    expect(classFactor({ speed: 300 })).toBe(0.4);
    expect(classFactor({ speed: 10 })).toBe(1.2);
  });

  it("without a bought core every hero's turrets run its signature core, the identity routine", () => {
    for (const h of Object.keys(HEROES) as HeroId[]) {
      const sig = HEROES[h].core!;
      expect(SIGNATURE_CORES[sig], h).toBeTruthy();
      expect(ITEMS[sig], `${sig} is never an ITEMS entry`).toBeUndefined();
      const b: Build = { hero: h, items: [], routes: [], mods: [], beltCap: 0, hullBonus: 0 };
      HEROES[h].turrets.forEach((_, t) => expect(resolveCore(b, t)).toMatchObject({ def: sig, bought: false, routine: "identity", stars: 1 }));
    }
    expect(Object.values(HEROES).map((h) => SIGNATURE_CORES[h.core!].name)).toEqual(
      ["KILN BREECH", "LOOM SHUTTLE", "CRUCIBLE BREECH", "BULWARK CANNON", "PENDULUM HAMMER", "LEECH NEEDLE"]);
  });

  it("the 7 cores: kind core, the catalogue's price, rarity and merchant (SALVO RACK at the Gunsmith for now)", () => {
    const got = CORES.map((id) => [id, ITEMS[id].kind, ITEMS[id].price, ITEMS[id].rarity, ITEMS[id].merchant].join(" "));
    // 0.6.2m (REQ-BFG-033's offer-mix tune): the rig sellers sell no cores; ROTARY and PRESSURE BREECH moved from the
    // Tinker to the Gunsmith, DRAKE NOZZLE from the Alchemist to the Arcane Dealer (content.ts MERCHANTS)
    expect(got).toEqual([
      "scatter core 4 common gunsmith", "rotary core 3 common gunsmith", "pressure core 4 common gunsmith",
      "gatling core 6 rare gunsmith", "hullbreaker core 5 rare gunsmith", "drake core 5 rare arcane", "salvo core 7 epic gunsmith",
    ]);
    for (const id of CORES) expect(ITEMS[id].desc.every((l) => l.length <= 20), id).toBe(true);
  });

  it("k scales only the absolute numbers (perQueued, volleyFlat, addBurn half up, min 1); the rest is unscaled", () => {
    for (const c of CLASSES) for (const id of CORES) for (const s of STARS) {
      const raw = effectAt(id, s).core!;
      const b: Build = { hero: c.hero, items: [], routes: [], mods: [{ uid: 1, def: id, turret: c.t, ...(s > 1 ? { stars: s } : {}) }], beltCap: 0, hullBonus: 0 };
      const got = resolveCore(b, c.t, c.td ?? HEROES[c.hero].turrets[c.t]);
      expect(got).toMatchObject({ def: id, bought: true, routine: id, stars: s, k: c.k });
      for (const [key, v] of Object.entries(raw)) {
        // NUM-1: each absolute number x the whole class % kp, rounded half up once at install (addBurn: at least 1)
        const want = !(CORE_ABSOLUTE as readonly string[]).includes(key) ? v
          : key === "addBurn" ? Math.max(1, scaled(v as number, c.k)) : scaled(v as number, c.k);
        expect(got.spec[key as keyof typeof raw], `${c.name} ${id} ${s} ${key}`).toBe(want);
      }
    }
    const pq = (td: TurretDef) => resolveCore({ hero: "furnace", items: [], routes: [], mods: [{ uid: 1, def: "pressure", turret: 0 }], beltCap: 0, hullBonus: 0 }, 0, td).spec.perQueued!;
    // NUM-1: x10 (was 1.2 / 0.9 / 0.66); 12 x 55% = 6.6 rounds half up to 7 at install
    expect([pq(HEROES.furnace.turrets[0]), pq(MEDIUM), pq(HEROES.weaver.turrets[0])]).toEqual([12, 9, 7]);
  });
});

describe("the identity routine (no bought core) is today's firing", () => {
  for (const c of CLASSES) {
    it(`${c.name}: LIFO, the window closes after WINDOW_TIME, one load per interval`, () => {
      const { bt, tu } = bench(c, null);
      // NUM-2 (REQ-BFG-047; was tu.def.fireInterval): the interval is 30 / the turret's speed
      expect([tu.window, tu.windowTime, tu.interval]).toEqual([tu.def.window, WINDOW_TIME, secPer(tu.def.speed)]);
      const ps = loads(tu.window);
      chamber(tu, ps, "fire");
      const shots = run(bt, 5);
      expect(shots.map((x) => x.pr.payload.id)).toEqual([...ps].reverse().map((p) => p.id));
      expect(shots.every((x) => x.pr.core === undefined && x.pr.share === undefined && x.pr.burn === undefined)).toBe(true);
      const b2 = bench(c, null);
      chamber(b2.tu, [load()], "load");
      expect(run(b2.bt, 4, 1)[0].t).toBeCloseTo(WINDOW_TIME, 1);
    });
  }
});

describe("each core at 1-3 stars on heavy, medium and light turrets", () => {
  for (const c of CLASSES) {
    it(`SCATTER CHOKE, ${c.name}: pellets at share each, Burn split rounded up, Shock on all, Fray once`, () => {
      for (const s of STARS) {
        const lv = effectAt("scatter", s).core!;
        const { bt, tu } = bench(c, "scatter", s);
        chamber(tu, [load({ ammo: "thread", burn: 5, shock: true })], "fire");
        const shots = run(bt, 2);
        expect(shots.length).toBe(lv.pellets);
        expect(new Set(shots.map((x) => x.t)).size).toBe(1);
        const pellet = half(AMMO.thread.base * lv.share!); // NUM-1: 30 x share, rounded half up once: 12 / 14 / 13 (was 3 x share)
        shots.forEach(({ pr }, j) => {
          expect(pr).toMatchObject({ core: "scatter", share: lv.share, burn: Math.ceil(5 / lv.pellets!), noFray: j > 0 });
          expect(pr.dmg).toBe(pellet);
          expect(pr.payload.shock).toBe(true);
        });
        // NUM-1: the pellets' total is pellets x the rounded pellet, 36 / 42 / 52 (was pellets x share x 3: 3.6 / 4.32 / 5.04)
        expect(shots.reduce((n, x) => n + x.pr.dmg, 0)).toBe(lv.pellets! * pellet);
        run(bt, 4);
        expect(bt.sides[1].hull.fray).toBe(1); // the thread slug's Fray once, not once per pellet
      }
    });

    it(`ROTARY BREECH, ${c.name}: oldest load first, windows close in 0.8 s, intervalMul, no jam at 3 stars`, () => {
      for (const s of STARS) {
        const lv = effectAt("rotary", s).core!;
        const { bt, tu } = bench(c, "rotary", s);
        expect(tu.windowTime).toBe(0.8);
        // NUM-2 (REQ-BFG-047; was the interval x intervalMul 0.85 / 0.7): ★2 / ★3 fire a whole 18% / 43% faster, the
        // speed x (100 + fireRate) / 100 rounded half up once (battle.ts makeTurret), and the interval is 30 / that speed
        expect(tu.interval).toBe(secPer(Math.max(1, half(tu.def.speed * rateMul(lv.fireRate)))));
        expect(ROUTINES.rotary.noJam(tu)).toBe(s === 3);
        const ps = loads(tu.window);
        chamber(tu, ps, "fire");
        const shots = run(bt, 5);
        expect(shots.map((x) => x.pr.payload.id)).toEqual(ps.map((p) => p.id)); // FIFO
        expect(shots[1].t - shots[0].t).toBeCloseTo(tu.interval, 1);
        const b2 = bench(c, "rotary", s);
        chamber(b2.tu, [load()], "load");
        expect(run(b2.bt, 4, 1)[0].t).toBeCloseTo(0.8, 1);
      }
    });

    it(`PRESSURE BREECH, ${c.name}: + perQueued x k per load queued (this one included), at most 5, never jams`, () => {
      for (const s of STARS) {
        const lv = effectAt("pressure", s).core!;
        const { bt, tu } = bench(c, "pressure", s);
        expect(ROUTINES.pressure.noJam(tu)).toBe(true);
        const n = tu.window;
        chamber(tu, loads(n), "fire");
        const shots = run(bt, 5);
        expect(shots.length).toBe(n);
        const pq = scaled(lv.perQueued!, c.k); // NUM-1: perQueued x kp, whole at install (heavy 12 / 26 / 42, light 7 / 14 / 23)
        expect(tu.core.spec.perQueued).toBe(pq);
        shots.forEach(({ pr }, i) => expect(pr.dmg).toBe(PLAIN + pq * (n - i)));
        expect(pressureBonus(tu.core.spec, 9)).toBe(pq * 5); // maxCount 5
      }
    });

    it(`GATLING SPOOL, ${c.name}: x1.2 at first, each quick shot a step faster down to the floor, a long gap halves the spin`, () => {
      for (const s of STARS) {
        const lv = effectAt("gatling", s).core!;
        const { tu } = bench(c, "gatling", s);
        // NUM-2 (REQ-BFG-047, N1 2.3): start and top are whole rate %s (-17; +67 / +150 / +245); the spin stays the interval
        // share between them, 100 / (100 + rate) (was the multipliers start 1.2 and floor 0.6 / 0.4 / 0.29), stepping by
        // `step`. EQUIVALENT check of the new form: the spin walks start -> top as the multiplier did, and each cadence is
        // 30 / the whole speed at that spin (the turret's speed / spin rounded half up once; was interval x spin exactly)
        const start = 1 / rateMul(lv.start), top = 1 / rateMul(lv.top);
        const at = (speed: number, spin: number) => secPer(Math.max(1, half(speed / spin)));
        expect(tu.spin).toBe(start); // NUM-2 (was 1.2): -17% as an interval share, 100 / 83 = 1.2048..
        let t = 10;
        const muls: number[] = [];
        for (let i = 0; i < 40; i++, t += 2.4) {
          expect(ROUTINES.gatling.cadence(tu, t)).toBe(at(tu.def.speed, tu.spin));
          muls.push(round(tu.spin));
        }
        expect(muls[0]).toBe(round(start));
        expect(muls[1]).toBe(round(start - lv.step!));
        expect(muls.at(-1)).toBe(round(top)); // the spin's top (NUM-2: was the floor)
        expect(Math.min(...muls)).toBe(round(top));
        const next = ROUTINES.gatling.cadence(tu, t - 2.4 + 2.6); // a 2.6 s gap
        expect(round(tu.spin)).toBe(round(start - (start - top) / 2));
        expect(next).toBe(at(tu.def.speed, tu.spin));
        // no loading window (oracle 5624d721a73a6282): a lone load on an idle barrel fires at once,
        // where the signature core waits out its window
        const g = bench(c, "gatling", s), id = bench(c, null);
        chamber(g.tu, [load()], "load");
        chamber(id.tu, [load()], "load");
        expect(run(g.bt, 3, 1)[0].t).toBeLessThanOrEqual(TICK + 1e-9);
        expect(run(id.bt, 3, 1)[0].t).toBeCloseTo(WINDOW_TIME, 1);
        // the next load waits only for the barrel: interval x spin after the last shot (NUM-2: 30 / the whole speed at the
        // first spin, -17%: heavy 25 -> 1.2 s, medium 33 -> 0.91 s, light 46 -> 0.65 s; was interval x 1.2)
        const p2 = load();
        chamber(g.tu, [p2], "load");
        const second = run(g.bt, 3).find((x) => x.pr.payload.id === p2.id)!;
        expect(second.t - TICK).toBeCloseTo(at(g.tu.def.speed, start), 1);
      }
    });

    it(`HULLBREAKER, ${c.name}: every shot hits bare hull (no target draw) at x hullMul`, () => {
      for (const s of STARS) {
        const lv = effectAt("hullbreaker", s).core!;
        const { bt, tu } = bench(c, "hullbreaker", s);
        const shots: Shot[] = [];
        for (let v = 0; v < 8; v++) {
          chamber(tu, [load()], "fire");
          shots.push(...run(bt, bt.t + 1.5));
        }
        expect(shots.length).toBe(8);
        for (const { pr } of shots) {
          expect(pr.target.kind).toBe("hull");
          expect(pr.dmg).toBe(half(PLAIN * lv.hullMul!)); // NUM-1: 30 x hullMul rounded half up once, 39 / 50 / 62 (was 3 x hullMul)
        }
      }
      const { bt, tu } = bench(c, null); // the identity shot does hit machines
      const kinds: string[] = [];
      for (let v = 0; v < 8; v++) {
        chamber(tu, [load()], "fire");
        kinds.push(...run(bt, bt.t + 1.5).map((x) => x.pr.target.kind));
      }
      expect(kinds.some((k) => k !== "hull")).toBe(true);
    });

    it(`DRAKE NOZZLE, ${c.name}: flat becomes Burn (1 per flatPerBurn), + addBurn x k, burning burnTime, a short spout`, () => {
      for (const s of STARS) {
        const lv = effectAt("drake", s).core!;
        const { bt, tu } = bench(c, "drake", s);
        const add = Math.max(1, Math.floor(lv.addBurn! * c.k + 0.5));
        expect(tu.core.spec.addBurn).toBe(add);
        chamber(tu, [load({ flat: 40, burn: 1 })], "fire"); // NUM-1: a flat of 40 (x10 of 4), as flatPerBurn 20 / 15 / 10
        const [{ pr }] = run(bt, 1, 1);
        const stacks = Math.floor(40 / lv.flatPerBurn!); // 2 / 2 / 4, as before
        expect(pr.burn).toBe(1 + stacks + add);
        expect(pr.dmg).toBe(PLAIN + 40 - stacks * lv.flatPerBurn!); // NUM-1: 30 / 40 / 30 (was 3 / 4 / 3)
        expect(pr.burnTime).toBe(lv.burnTime);
        expect(pr.flight).toBeLessThanOrEqual(tu.def.flight * 0.7 + 0.22 + 1e-9);
        while (bt.projectiles.length) bt.step();
        const burn = bt.sides[1].hull.burns.find((b) => b.dps === pr.burn)!;
        expect(burn.t).toBeCloseTo(lv.burnTime! - TICK, 9); // lasts burnTime, not BURN_TIME 3 s
      }
    });

    it(`SALVO RACK, ${c.name}: waits for a full window, fires all of it at + volleyFlat x k, reloads x1.6`, () => {
      for (const s of STARS) {
        const lv = effectAt("salvo", s).core!;
        const { bt, tu } = bench(c, "salvo", s);
        const ps = loads(tu.window);
        chamber(tu, ps, "load");
        bt.step(); // the window is full: one volley, this tick
        const vol = bt.projectiles.filter((p) => p.from === 0);
        expect(vol.map((p) => p.payload.id)).toEqual([...ps].reverse().map((p) => p.id)); // all of it, LIFO
        // NUM-1: volleyFlat x kp, whole at install (heavy +20 / 44 / 70, medium +15 / 33 / 53, light +11 / 24 / 39)
        vol.forEach((p) => expect(p.dmg).toBe(PLAIN + scaled(lv.volleyFlat!, c.k)));
        expect(tu.fireCd).toBeCloseTo(tu.interval * lv.reloadMul!, 12);
        const b2 = bench(c, "salvo", s); // one load: the window stays open twice the window time
        chamber(b2.tu, [load()], "load");
        expect(run(b2.bt, 5, 1)[0].t).toBeCloseTo(2 * WINDOW_TIME, 1);
      }
    });
  }
});
