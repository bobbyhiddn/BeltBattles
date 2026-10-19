// Arena drawing helpers: damage cracks, shells with arcs and trails, and the arena's views. game/arenaMotion.ts draws the
// arena (carriers, boards, effects, numbers, the dark wind and screen flashes) with them.
// CUSTOM-2a (REVIEW-MOTION2 Q2): drawArena (the tracked hulls on 0.9.4's floor, the test builds' ?motion=0 path) is gone;
// the cracks and shells it owned stay here, for the motion code.

import { AMMO, HEROES } from "../sim/content";
import { payloadDamage } from "../sim/deck";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { hullX, hullY, sx, sy, type DeckFrame } from "../render/frame";
import { muzzleX, muzzleY, type CruiserView } from "../render/cruiser";
import { flameCone, heatTier, pelletSprite, shadowDisc, shellSprite, trailColors, volleySprite } from "../render/ammo";
import type { Side } from "../sim/battle";
import { flatOf } from "../sim/scale"; // SCALE-2a (REQ-BFG-110): the flat bonus's sum (stat rows + FOR EACH)
import type { Arena } from "./arena";

/** Crack polylines in hull-local space: start point + unit steps (dx,dy pairs). */
export const CRACKS_50: number[][] = [
  [22, 3, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0],
  [120, 136, 1, -1, 1, 0, 1, -1, 0, -1, 1, -1],
  [2, 60, 0, 1, 1, 1, 0, 1, 0, 1],
];
export const CRACKS_25: number[][] = [
  [104, 4, -1, 1, 0, 1, -1, 1, -1, 0, -1, 1, 0, 1],
  [153, 90, 0, 1, -1, 1, 0, 1, 0, 1, -1, 1],
  [40, 137, 1, -1, 1, 0, 0, -1, 1, -1, 1, 0],
];

/** MOTION-1 (REQ-BFG-071): `hx0`..`hx1` (hull-local, absent: all) keeps only the crack pixels on a board plate. */
export function cracks(g: G, f: DeckFrame, list: number[][], hx0 = -Infinity, hx1 = Infinity): void {
  for (const c of list) {
    let hx = c[0], hy = c[1];
    for (let i = 2; i <= c.length; i += 2) {
      if (hx >= hx0 && hx < hx1) rect(g, Math.round(hullX(f, hx, hy)), Math.round(hullY(f, hx, hy)), 1, 1, C.ink);
      if (i < c.length) {
        hx += c[i];
        hy += c[i + 1];
      }
    }
  }
}

/** MOTION-1 (REQ-BFG-071): a board's map from rest-screen space (its deck frame's drawing) to the screen now. */
export interface ShotMap {
  toScreen(side: Side, x: number, y: number, out: number[]): number[];
}
const P0 = [0, 0], P1 = [0, 0];

/** The shells in flight. MOTION-1: with `map` (a motion build), each frame a shot flies from its gun's current screen
 *  position to its target's current position (both boards move), so it still lands on its tile or hull; without it,
 *  exactly as before. */
export function drawShells(g: G, a: Arena, map?: ShotMap): void {
  const b = a.b;
  for (let n = 0; n < b.projectiles.length; n++) {
    const pr = b.projectiles[n];
    if (!a.show[pr.from]) continue;
    const from = a.drawn[pr.from], to = a.drawn[(1 - pr.from) as Side];
    const hb = b.sides[pr.from].build; // 0.6.2s: the build's turret slots
    let x0 = muzzleX(from, hb, pr.turret, pr.id), y0 = muzzleY(from, hb, pr.turret, pr.id);
    let x1 = sx(to, pr.tx, pr.ty), y1 = sy(to, pr.tx, pr.ty);
    if (map) {
      map.toScreen(pr.from, x0, y0, P0);
      map.toScreen((1 - pr.from) as Side, x1, y1, P1);
      x0 = P0[0]; y0 = P0[1]; x1 = P1[0]; y1 = P1[1];
    }
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.abs(dx) + Math.abs(dy);
    const arc = pr.heavy || pr.core === "mortar" ? 8 + dist * 0.09 : 0;
    const k = Math.min(1, pr.t / pr.flight);
    const ad = AMMO[pr.payload.ammo];
    const tier = pr.payload.ammo === "cinder" ? heatTier(payloadDamage(pr.payload.base ?? ad.base, ad.rideScale, pr.payload.ride, pr.payload.mult, flatOf(pr.payload) + (pr.payload.heatBonus ?? 0))) : 0; // SCALE-2a: the sum
    if (pr.payload.harass) {
      const c = Math.floor(a.clock * 6) % 2 ? C.red : C.fire4;
      for (const [vx, vy] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) rect(g, Math.round(x1 + vx), Math.round(y1 + vy), 2, 2, c);
    }
    // 0.6.1c: HOT SWAP's ember / spark slugs keep their tint in flight (a plain Payload with `preset`)
    const kind = pr.payload.preset ?? pr.payload.ammo;
    // trail: earlier points of the same flight path, fading
    const trail = trailColors(kind, tier);
    const tw = pr.heavy ? 2 : 1;
    for (let j = trail.length; j >= 1; j--) {
      const kj = k - j * (pr.heavy ? 0.045 : 0.06);
      if (kj <= 0) continue;
      const tx = x0 + dx * kj, ty = y0 + dy * kj - Math.sin(kj * Math.PI) * arc;
      rect(g, Math.round(tx) - (tw >> 1), Math.round(ty) - (tw >> 1), tw, tw, trail[j - 1]);
    }
    // 0.6.1p FINISHER RAM (catalogue art): the finisher shot drags a 1 px red trail
    if (pr.finisher) {
      for (let j = 1; j <= 6; j++) {
        const kj = k - j * 0.025;
        if (kj <= 0) continue;
        rect(g, Math.round(x0 + dx * kj), Math.round(y0 + dy * kj - Math.sin(kj * Math.PI) * arc), 1, 1, C.red);
      }
    }
    const x = x0 + dx * k, y = y0 + dy * k;
    const z = Math.sin(k * Math.PI) * arc;
    if (pr.heavy) {
      const sh = shadowDisc(6);
      g.globalAlpha = 0.45;
      g.drawImage(sh, Math.round(x - 3), Math.round(y + 1));
      g.globalAlpha = 1;
    }
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    // 0.6.1b (ARSENAL.md §8.4): a bought core's projectile shape -- SCATTER's pellet, DRAKE's flame
    // cone, SALVO's brass-banded volley round. ROTARY/PRESSURE/GATLING/HULLBREAKER fire the plain shell.
    const img = pr.core === "scatter" ? pelletSprite(kind, tier, dir)
      : pr.core === "drake" ? flameCone(dir)
      : pr.core === "salvo" ? volleySprite(pr.payload.ammo, tier, dir)
      : shellSprite(kind, tier, dir);
    g.drawImage(img, Math.round(x - img.width / 2), Math.round(y - z - img.height / 2));
  }
}

/** Views are plain data, built once per arena and mutated per frame. */
export function makeViews(a: Arena): [CruiserView, CruiserView] {
  const mk = (s: Side): CruiserView => ({
    side: s, build: a.b.sides[s].build, model: a.sfx[s].model, frame: a.drawn[s], sim: a.b.sides[s],
    t: 0, tread: 0, beltPhase: a.sfx[s].beltPhase, windup: a.sfx[s].windup, recoil: a.sfx[s].recoil,
    fuse: a.sfx[s].fuse, clank: a.sfx[s].clank, // 0.8.0 H1 M3: the weld flash and the CLANK
    w3: a.sfx[s].w3, // 0.8.0 I1 M4: wave 3's event moments
  });
  return [mk(0), mk(1)];
}

export function heroName(a: Arena, s: Side): string {
  return HEROES[a.b.sides[s].build.hero].name;
}
