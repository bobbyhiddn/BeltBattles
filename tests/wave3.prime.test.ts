// 0.8.0 I1 verification (the Prime's mutants, output-I1/verify-cap/F-mutants.md): four of the Prime's 32 mutants on the
// draw, the tags and the battle-moment hooks survived I1's tests. These checks kill them:
// - D-oldsave-legendary-day1: a run without wares (a save from before 0.8.0) keeps run.ts dayPool's legendary gate: no
//   legendary on sale before day 4, and legendaries on sale from day 4 (the gate opens).
// - H-shrug-time, H-anvil-frozen: A1's moment timings (REPORT-A1 5.2: BRACE FRAME's shrug 0.3 s, TWIN LATCH's release
//   0.25 s, ANVIL BREECH's 3 spark frames of 0.1 s), and tickWave3Fx ages every slot's pair and anvil timers by the
//   frame's seconds and runs the shrug and release timers down to nothing.
// - H-crowd-cap2: PINCER's crowd counts up to 3 other working rigs on its tile, never itself, never a stalled one.
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { newRun, rollShop } from "../src/game/run";
import { ANVIL_TIME, RELEASE_TIME, SHRUG_TIME, newWave3Fx, rigMoment, tickWave3Fx } from "../src/render/wave3Moments";

describe("0.8.0 I1: the Prime's checks on the draw and the moments", () => {
  it("an old save (no wares) offers no legendary before day 4, and does from day 4 (run.ts dayPool's gate)", () => {
    let early = 0, late = 0;
    for (const hero of ["furnace", "weaver"] as const) for (let seed = 1; seed <= 400; seed++) {
      const r = newRun(hero, seed, "prime");
      delete r.wares;
      for (let day = 1; day <= 10; day++) {
        r.day = day;
        r.shop.rerolls = 0;
        rollShop(r);
        const n = r.shop.wagons.flatMap((w) => w.offers).filter((o) => ITEMS[o.def].rarity === "legendary").length;
        if (day < 4) early += n;
        else late += n;
      }
    }
    expect(early).toBe(0);
    expect(late).toBeGreaterThan(0);
  });

  it("A1's moment timings: BRACE FRAME's shrug 0.3 s, TWIN LATCH's release 0.25 s, ANVIL BREECH's sparks 3 frames of 0.1 s", () => {
    expect([SHRUG_TIME, RELEASE_TIME, ANVIL_TIME]).toEqual([0.3, 0.25, 0.3]);
  });

  it("tickWave3Fx ages every slot's pair and anvil timers by the frame's seconds and runs the shrug and release down to nothing", () => {
    const w = newWave3Fx(2);
    w.pairAge[0] = 0;
    w.anvilAge[1] = 0;
    w.shrug.set(7, SHRUG_TIME);
    w.release.set(8, RELEASE_TIME);
    const side = { factories: [] } as never;
    tickWave3Fx(w, side, 0.1);
    expect(w.pairAge[0]).toBeCloseTo(0.1, 5);
    expect(w.anvilAge[1]).toBeCloseTo(0.1, 5);
    expect(w.pairAge[1]).toBe(Infinity);
    expect(w.anvilAge[0]).toBe(Infinity);
    expect(w.shrug.get(7)).toBeCloseTo(0.2, 5);
    expect(w.release.get(8)).toBeCloseTo(0.15, 5);
    tickWave3Fx(w, side, 0.25);
    expect(w.anvilAge[1]).toBeCloseTo(0.35, 5);
    expect(w.shrug.has(7)).toBe(false);
    expect(w.release.has(8)).toBe(false);
  });

  it("PINCER's crowd counts up to 3 other working rigs on its hit's tile, never itself and never a stalled one", () => {
    const rig = (stalled = false) => ({ online: true, wrecked: false, disrupted: stalled ? 1 : 0, frozen: 0, hits: [] as { route: number; tile: number }[] });
    const me = rig();
    me.hits.push({ route: 0, tile: 3 });
    const crowd = (others: ReturnType<typeof rig>[]) => {
      const side = { routes: [{ gateAt: { 3: [{ g: me }, ...others.map((g) => ({ g }))] } }] } as never;
      return rigMoment("pincer", 1, me as never, side, undefined).crowd;
    };
    expect(crowd([])).toBeUndefined();
    expect(crowd([rig()])).toBe(1);
    expect(crowd([rig(), rig(true)])).toBe(1);
    expect(crowd([rig(), rig()])).toBe(2);
    expect(crowd([rig(), rig(), rig()])).toBe(3);
    expect(crowd([rig(), rig(), rig(), rig()])).toBe(3);
  });
});
