import { describe, expect, it } from "vitest";
import { AMMO, BELT_SPEED } from "../src/sim/content";
import { key as K, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import { simulate } from "../src/sim/battle";
import { cruiserModel, fixedSpeedOf } from "../src/render/cruiser";
import { chevronSpeed, chevronTint } from "../src/render/machinery";
import { Arena } from "../src/game/arena";

// 0.6.2p (item 5): a belt that carries fixed-speed ammo (SLAG POT's slag, AMMO.slag.fixedSpeed 0.75) rides at that
// speed whatever its speed rigs, slows and Drag do (Battle.transport; walkRoute), yet its chevrons took the rigs' tint
// and pace, in the build preview (cruiser.ts speeds -> machinery.ts speedTint) and in battle (Battle's render-only
// speedAt -> Arena's beltPhase). The render layer now shows its real state: neutral, at the slag's own pace.

describe("the chevron decision (machinery.ts chevronTint, chevronSpeed)", () => {
  it("a fixed-speed belt is neutral at its own pace, whatever speed state its tile holds", () => {
    for (const state of [0.3, 0.5, 0.75, 1, 1.6, 2.3, 3, 5]) {
      expect(chevronTint(state, 0.75), `state ${state}`).toBe("n");
      expect(chevronSpeed(state, 0.75), `state ${state}`).toBe(0.75);
    }
  });

  it("any other belt keeps V1: yellow above 1x, hot at 3x and up, blue below 1x, neutral at 1x; its state's pace", () => {
    expect([1, 1.6, 3, 5, 0.5, 0.3].map((s) => chevronTint(s))).toEqual(["n", "f", "o", "o", "s", "s"]);
    expect([1, 1.6, 0.5].map((s) => chevronSpeed(s))).toEqual([1, 1.6, 0.5]);
  });
});

/** A FURNACE deck: the Kiln's belt up column 4 and a SLAG POT (uid 20, ★stars) belt up column 5 into the heavy turret's
 *  second intake. A GREASE WORKS and a BRAKE SHOE work each belt: west of the Kiln's, east of the slag's. */
function slagDeck(stars = 1): Build {
  const east = rotFacing("grease", 1), west = rotFacing("grease", 3);
  return {
    hero: "furnace", mods: [], beltCap: 30, hullBonus: 0,
    items: [
      { uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 20, def: "slagpot", x: 6, y: 6, ...(stars > 1 ? { stars } : {}) },
      { uid: 31, def: "grease", x: 3, y: 4, ...rotField("grease", east) }, { uid: 32, def: "brake", x: 3, y: 2, ...rotField("brake", east) },
      { uid: 41, def: "grease", x: 6, y: 4, ...rotField("grease", west) }, { uid: 42, def: "brake", x: 6, y: 2, ...rotField("brake", west) },
    ],
    routes: [
      { factory: 1, cells: [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)] },
      { factory: 20, cells: [K(6, 5), K(5, 5), K(5, 4), K(5, 3), K(5, 2), K(5, 1), K(5, 0)] },
    ],
  };
}

describe("the build preview: a SLAG POT belt with a speed rig and a BRAKE SHOE", () => {
  it("the model marks the slag belt fixed (0.75x) at every star; its chevrons are neutral at 0.75x on every tile", () => {
    for (const stars of [1, 2, 3]) {
      const b = slagDeck(stars);
      expect(fixedSpeedOf(b, 20)).toBe(AMMO.slag.fixedSpeed);
      expect(fixedSpeedOf(b, 1)).toBeUndefined();
      const [kiln, slag] = cruiserModel(b).routes;
      expect([kiln.fixed, slag.fixed]).toEqual([undefined, 0.75]);
      // the rigs' preview state is still there (GREASE 1.6x from its tile, BRAKE half speed from its tile) ...
      expect([...slag.speeds].map((v) => +v.toFixed(3))).toEqual([1, 1, 1.6, 1.6, 0.5, 0.5, 0.5]);
      // ... but the slag belt's chevrons ignore it
      expect([...slag.speeds].map((s) => chevronTint(s, slag.fixed))).toEqual(Array(7).fill("n"));
      expect([...slag.speeds].map((s) => chevronSpeed(s, slag.fixed))).toEqual(Array(7).fill(0.75));
      // the Kiln's belt, with the same two rigs, keeps its tints: neutral, yellow from the GREASE, blue from the BRAKE
      expect([...kiln.speeds].map((s) => chevronTint(s, kiln.fixed))).toEqual(["n", "f", "f", "s", "s", "s"]);
    }
  });

  it("the sim agrees the slag ignores those rigs: the route walk keeps 0.75x to the gun", async () => {
    const { walkRoute } = await import("../src/sim/deck");
    const w = walkRoute(slagDeck(), 1);
    expect([w.fixed, w.speedEnd]).toEqual([0.75, 0.75]);
    expect(walkRoute(slagDeck(), 0).speedEnd).toBe(0.5); // the Kiln's belt ends on the BRAKE's half speed
  });
});

describe("in battle: Arena's belt phase on the slag belt runs at 0.75x, whatever Battle's render-only speedAt holds", () => {
  it("every tile's chevrons advance by 0 (stopped) or BELT_SPEED x 0.75 a second; the Kiln's belt keeps its states", () => {
    const foe = slagDeck();
    const a = new Arena(slagDeck(), foe, 7, null);
    a.quiet = true;
    for (let i = 0; i < 60 * 4; i++) a.update(1 / 60); // every rig online (commissioned from 1.2 s)
    const s = a.b.sides[0], ph = a.sfx[0].beltPhase;
    // Battle's own speed state on the slag belt still follows the rigs (render-only; the payloads ignore it) ...
    expect(s.routes[1].speedAt.some((v) => Math.abs(v - 0.75) > 1e-6)).toBe(true);
    let moving = 0;
    for (let f = 0; f < 60; f++) {
      const before = ph.map((p) => [...p]);
      a.update(1 / 60);
      for (let i = 0; i < ph[1].length; i++) {
        const d = ph[1][i] - before[1][i];
        // ... but its chevrons don't: stopped (a queued or stalled tile) or at the slag's pace
        if (d !== 0) {
          expect(d, `slag tile ${i}`).toBeCloseTo((BELT_SPEED * 0.75) / 60, 4);
          moving++;
        }
        // and the tint is neutral
        expect(chevronTint(s.routes[1].speedAt[i], a.sfx[0].model.routes[1].fixed)).toBe("n");
      }
      for (let i = 0; i < ph[0].length; i++) {
        const d = ph[0][i] - before[0][i];
        if (d !== 0) expect(d, `kiln tile ${i}`).toBeCloseTo((BELT_SPEED * s.routes[0].speedAt[i]) / 60, 4);
      }
    }
    expect(moving).toBeGreaterThan(0);
    expect(s.routes[0].speedAt.map((v) => chevronTint(v))).toContain("f"); // the Kiln's belt still shows its GREASE
  });

  it("playback stays the sim's: the same battle ends as simulate() does (render-only change)", () => {
    const a = new Arena(slagDeck(2), slagDeck(), 11, null);
    a.quiet = true;
    let frames = 0;
    while (!a.b.over && frames < 60 * 200) { a.update(1 / 60); frames++; }
    const r = simulate(slagDeck(2), slagDeck(), 11);
    expect(a.b.over).toBe(true);
    expect([a.b.ticks, a.b.winner, a.b.sides[0].hull.hp, a.b.sides[1].hull.hp]).toEqual([r.ticks, r.winner, r.sides[0].hull.hp, r.sides[1].hull.hp]);
  });
});
