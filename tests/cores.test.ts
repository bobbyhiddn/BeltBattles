// 0.6.1b M2: the turret core routines (ARSENAL.md §2 and §10 item 1; brief 0.6.1b "Tests"). Every core at
// 1-3 stars on a heavy turret (FURNACE), a medium one (a stand-in TurretDef, fireInterval 0.75) and a light
// one (WEAVER). A bench side keeps its factory but has no belts, so only the loads a test puts in the
// chamber fire; the foe is a passive barge (no belts, +2000 hull). Plain slugs deal 3.
import { describe, expect, it } from "vitest";
import { Battle, makeTurret, type Payload, type Projectile, type TurretState } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { HEROES, ITEMS, SIGNATURE_CORES, WINDOW_TIME, classFactor, type HeroId, type TurretDef } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { CORE_ABSOLUTE, ROUTINES, pressureBonus, resolveCore } from "../src/sim/cores";
import { effectAt } from "../src/sim/stars";

const CORES = ["scatter", "rotary", "pressure", "gatling", "hullbreaker", "drake", "salvo"];
const STARS = [1, 2, 3];
const MEDIUM: TurretDef = { col0: 4, width: 2, connectors: [4, 5], kind: "medium", fireInterval: 0.75, window: 2, flight: 0.45 };
interface Cls { name: string; hero: "furnace" | "weaver"; t: number; td?: TurretDef; k: number }
const CLASSES: Cls[] = [
  { name: "heavy FURNACE", hero: "furnace", t: 0, k: 1 },
  { name: "medium stand-in (0.75 s)", hero: "furnace", t: 0, td: MEDIUM, k: 0.75 },
  { name: "light WEAVER", hero: "weaver", t: 1, k: 0.55 },
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

describe("the core resolver and the class factor", () => {
  it("classFactor = clamp(fireInterval / 1 s, 0.4, 1.2): heavy 1, medium 0.75, light 0.55", () => {
    expect(classFactor(HEROES.furnace.turrets[0])).toBe(1);
    expect(classFactor(MEDIUM)).toBe(0.75);
    expect(classFactor(HEROES.weaver.turrets[0])).toBe(0.55);
    expect(classFactor({ fireInterval: 0.1 })).toBe(0.4);
    expect(classFactor({ fireInterval: 3 })).toBe(1.2);
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
        const want = !(CORE_ABSOLUTE as readonly string[]).includes(key) ? v
          : key === "addBurn" ? Math.max(1, Math.floor((v as number) * c.k + 0.5)) : (v as number) * c.k;
        expect(got.spec[key as keyof typeof raw], `${c.name} ${id} ${s} ${key}`).toBe(want);
      }
    }
    const pq = (td: TurretDef) => resolveCore({ hero: "furnace", items: [], routes: [], mods: [{ uid: 1, def: "pressure", turret: 0 }], beltCap: 0, hullBonus: 0 }, 0, td).spec.perQueued!;
    expect([pq(HEROES.furnace.turrets[0]), pq(MEDIUM), pq(HEROES.weaver.turrets[0])].map(round)).toEqual([1.2, 0.9, 0.66]);
  });
});

describe("the identity routine (no bought core) is today's firing", () => {
  for (const c of CLASSES) {
    it(`${c.name}: LIFO, the window closes after WINDOW_TIME, one load per interval`, () => {
      const { bt, tu } = bench(c, null);
      expect([tu.window, tu.windowTime, tu.interval]).toEqual([tu.def.window, WINDOW_TIME, tu.def.fireInterval]);
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
        shots.forEach(({ pr }, j) => {
          expect(pr).toMatchObject({ core: "scatter", share: lv.share, burn: Math.ceil(5 / lv.pellets!), noFray: j > 0 });
          expect(pr.dmg).toBeCloseTo(3 * lv.share!, 12);
          expect(pr.payload.shock).toBe(true);
        });
        expect(round(shots.reduce((n, x) => n + x.pr.dmg, 0) / 3)).toBe(round(lv.pellets! * lv.share!)); // 1.2 / 1.44 / 1.68
        run(bt, 4);
        expect(bt.sides[1].hull.fray).toBe(1); // the thread slug's Fray once, not once per pellet
      }
    });

    it(`ROTARY BREECH, ${c.name}: oldest load first, windows close in 0.8 s, intervalMul, no jam at 3 stars`, () => {
      for (const s of STARS) {
        const lv = effectAt("rotary", s).core!;
        const { bt, tu } = bench(c, "rotary", s);
        expect(tu.windowTime).toBe(0.8);
        expect(tu.interval).toBe(tu.def.fireInterval * (lv.intervalMul ?? 1));
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
        shots.forEach(({ pr }, i) => expect(pr.dmg).toBeCloseTo(3 + lv.perQueued! * c.k * (n - i), 9));
        expect(round(pressureBonus(tu.core.spec, 9))).toBe(round(lv.perQueued! * c.k * 5)); // maxCount 5
      }
    });

    it(`GATLING SPOOL, ${c.name}: x1.2 at first, each quick shot a step faster down to the floor, a long gap halves the spin`, () => {
      for (const s of STARS) {
        const lv = effectAt("gatling", s).core!;
        const { tu } = bench(c, "gatling", s);
        expect(tu.spin).toBe(1.2);
        let t = 10;
        const muls: number[] = [];
        for (let i = 0; i < 40; i++, t += 2.4) muls.push(round(ROUTINES.gatling.cadence(tu, t) / tu.interval));
        expect(muls[0]).toBe(1.2);
        expect(muls[1]).toBe(round(1.2 - lv.step!));
        expect(muls.at(-1)).toBe(round(lv.floor!)); // the spin floor
        expect(Math.min(...muls)).toBe(round(lv.floor!));
        const next = round(ROUTINES.gatling.cadence(tu, t - 2.4 + 2.6) / tu.interval); // a 2.6 s gap
        expect(next).toBe(round(1.2 - (1.2 - lv.floor!) / 2));
        // no loading window (oracle 5624d721a73a6282): a lone load on an idle barrel fires at once,
        // where the signature core waits out its window
        const g = bench(c, "gatling", s), id = bench(c, null);
        chamber(g.tu, [load()], "load");
        chamber(id.tu, [load()], "load");
        expect(run(g.bt, 3, 1)[0].t).toBeLessThanOrEqual(TICK + 1e-9);
        expect(run(id.bt, 3, 1)[0].t).toBeCloseTo(WINDOW_TIME, 1);
        // the next load waits only for the barrel: interval x spin after the last shot
        const p2 = load();
        chamber(g.tu, [p2], "load");
        const second = run(g.bt, 3).find((x) => x.pr.payload.id === p2.id)!;
        expect(second.t - TICK).toBeCloseTo(g.tu.interval * 1.2, 1);
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
          expect(pr.dmg).toBeCloseTo(3 * lv.hullMul!, 12);
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
        chamber(tu, [load({ flat: 4, burn: 1 })], "fire");
        const [{ pr }] = run(bt, 1, 1);
        const stacks = Math.floor(4 / lv.flatPerBurn!);
        expect(pr.burn).toBe(1 + stacks + add);
        expect(pr.dmg).toBeCloseTo(3 + 4 - stacks * lv.flatPerBurn!, 12);
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
        vol.forEach((p) => expect(p.dmg).toBeCloseTo(3 + lv.volleyFlat! * c.k, 12));
        expect(tu.fireCd).toBeCloseTo(tu.interval * lv.reloadMul!, 12);
        const b2 = bench(c, "salvo", s); // one load: the window stays open twice the window time
        chamber(b2.tu, [load()], "load");
        expect(run(b2.bt, 5, 1)[0].t).toBeCloseTo(2 * WINDOW_TIME, 1);
      }
    });
  }
});
