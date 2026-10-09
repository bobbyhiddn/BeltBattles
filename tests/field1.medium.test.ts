// FIELD-1 (REQ-BFG-075): the medium layer under the hull (render/carrier.ts). On water the ship canvases are today's (keys
// and pixels; tests/carrier.styles.test.ts pins their digests). On ground and in the air the canvases are keyed by the
// medium, carry no bow wave, add their units (tracks; engine pods) outboard of the hull along both flanks, and leave the
// hull art itself untouched, in every carrier style. The shadow: firmer on ground, faint and far below in the air.
import { describe, expect, it } from "vitest";
import { installRaster, type RasterCanvas } from "./raster.helpers";
import { CARRIERS, carrierStyle } from "../src/render/styles";
import { PIVOT_X, ROT_H, ROT_W, ROT_X, ROT_Y, SHIP_L, STERN_B, UNDER_IN, UNDER_OUT, halfBeam, shipCacheKeys, shipSprite, type ShipMedium } from "../src/render/carrier";
import { SHADOW, drawShip, shipKey } from "../src/render/ship";
import { heroPalette } from "../src/render/hull";
import { makeCanvas } from "../src/render/pixel";
import { C } from "../src/render/palette";
import type { HeroId } from "../src/sim/content";

describe("FIELD-1 the medium under the hull (REQ-BFG-075)", () => {
  installRaster();
  const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
  const px = (c: HTMLCanvasElement) => (c as unknown as RasterCanvas).px;
  /** Heading 0's sprite pixel (X, Y) in ship-local terms: x from the stern, dy from the centre line. */
  const local = (i: number): [number, number] => [(i % ROT_W) - ROT_X + PIVOT_X, Math.floor(i / ROT_W) - ROT_Y];
  const inside = (x: number, dy: number) => x >= 0 && x < SHIP_L && Math.abs(dy + 0.5) <= halfBeam(x + 0.5);
  /** The bow wave's foam (carrier.ts shipBase): white and ice off the bow's taper, slate4 and slate3 further out. */
  const FOAM = new Set([C.white, C.ice, C.slate4, C.slate3]);

  it("ground and air: keyed by the medium; the hull's pixels are water's exactly; no bow wave; the units show outboard on both flanks; every style", () => {
    const [, g] = makeCanvas(ROT_W * 2, ROT_H * 2);
    for (const hero of HEROES) {
      for (const s of CARRIERS) {
        const st = s.id === "war" ? undefined : carrierStyle(s.id), key = shipKey(hero, s.id);
        const water = px(shipSprite(key, heroPalette(hero), 0, st));
        let wave = 0;
        for (let i = 0; i < water.length; i++) { const [x, dy] = local(i); if (!inside(x, dy) && FOAM.has(water[i] as string) && x > 100) wave++; }
        expect(wave, `${hero} ${s.id}: the water ship has its bow wave`).toBeGreaterThan(20);
        for (const medium of ["ground", "air"] as ShipMedium[]) {
          drawShip(g, hero, ROT_W, ROT_H, 0, 0, s.id, medium);
          const keys = shipCacheKeys();
          for (const k of [`ship:${key}:${medium}`, `shipR:${key}:${medium}:0`, `shipS:${key}:${medium}:0`]) expect(keys, k).toContain(k);
          const p = px(shipSprite(key, heroPalette(hero), 0, st, medium));
          let hullDiffer = 0, bow = 0, units = 0;
          for (let i = 0; i < p.length; i++) {
            const [x, dy] = local(i);
            if (inside(x, dy)) { if (p[i] !== water[i]) hullDiffer++; continue; }
            if (FOAM.has(p[i] as string) && x > 100) bow++; // the bow wave's foam: none on ground or in the air
            if (p[i] !== null && Math.abs(dy) >= UNDER_IN - 1 && Math.abs(dy) <= UNDER_OUT + 4) units++;
          }
          expect(hullDiffer, `${hero} ${s.id} ${medium}: hull pixels changed`).toBe(0);
          expect(bow, `${hero} ${s.id} ${medium}: bow-wave pixels`).toBe(0);
          expect(units, `${hero} ${s.id} ${medium}: the units' pixels outboard`).toBeGreaterThan(medium === "ground" ? 1500 : 400);
        }
      }
    }
    // water keeps today's keys: no medium in them
    expect(shipCacheKeys().filter((k) => k.startsWith("ship:") && !k.includes(":ground") && !k.includes(":air")).every((k) => !k.includes(":water"))).toBe(true);
  });

  it("the shadow by medium: water's as today, firmer and closer on ground, faint and far below in the air", () => {
    expect(SHADOW.water).toEqual({ alpha: 0.35, dx: 2, dy: 3, bob: 1 });
    expect(SHADOW.ground.alpha).toBeGreaterThan(SHADOW.water.alpha);
    expect(SHADOW.ground.dy).toBeLessThan(SHADOW.water.dy);
    expect(SHADOW.air.alpha).toBeLessThan(0.2);
    expect(SHADOW.air.dy).toBeGreaterThan(10);
    expect(STERN_B / 2 + 4).toBeGreaterThanOrEqual(UNDER_OUT); // the units fit the ship's canvas
  });
});
