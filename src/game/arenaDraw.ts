// Arena drawing: cruisers, scorch decals and damage cracks, machinery and turrets, shells
// with arcs and trails, particles, damage numbers, the dark wind and screen flashes. The
// camera shake is one integer translate around the world layer (STUDY rule 1).

import { settings } from "../core/settings";
import { AMMO, HEROES } from "../sim/content";
import { payloadDamage } from "../sim/deck";
import { C } from "../render/palette";
import { rect, type G } from "../render/pixel";
import { hullX, hullY, sx, sy, type DeckFrame } from "../render/frame";
import { drawDim, drawHull, drawTurrets, muzzleX, muzzleY, type CruiserView } from "../render/cruiser";
import { drawMachinery } from "../render/machinery";
import { flameCone, heatTier, pelletSprite, shadowDisc, shellSprite, trailColors, volleySprite } from "../render/ammo";
import { drawWind } from "../render/world";
import type { Side } from "../sim/battle";
import type { Arena } from "./arena";

/** Crack polylines in hull-local space: start point + unit steps (dx,dy pairs). */
const CRACKS_50: number[][] = [
  [22, 3, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0],
  [120, 136, 1, -1, 1, 0, 1, -1, 0, -1, 1, -1],
  [2, 60, 0, 1, 1, 1, 0, 1, 0, 1],
];
const CRACKS_25: number[][] = [
  [104, 4, -1, 1, 0, 1, -1, 1, -1, 0, -1, 1, 0, 1],
  [153, 90, 0, 1, -1, 1, 0, 1, 0, 1, -1, 1],
  [40, 137, 1, -1, 1, 0, 0, -1, 1, -1, 1, 0],
];

function cracks(g: G, f: DeckFrame, list: number[][]): void {
  for (const c of list) {
    let hx = c[0], hy = c[1];
    for (let i = 2; i <= c.length; i += 2) {
      rect(g, Math.round(hullX(f, hx, hy)), Math.round(hullY(f, hx, hy)), 1, 1, C.ink);
      if (i < c.length) {
        hx += c[i];
        hy += c[i + 1];
      }
    }
  }
}

export function drawArena(g: G, a: Arena, W: number, H: number): void {
  const b = a.b;
  const ox = a.fx.shakeX, oy = a.fx.shakeY;
  g.translate(ox, oy);
  const views = a.views;
  for (let s = 0; s < 2; s++) {
    if (!a.show[s]) continue;
    const v = views[s];
    v.t = a.clock;
    v.tread = a.tread;
    v.flash = b.sides[s].hull.flash;
    drawHull(g, v);
  }
  a.fx.drawDecals(g, 0, 0);
  for (let s = 0; s < 2; s++) {
    if (!a.show[s]) continue;
    const hp = b.sides[s].hull.hp / b.sides[s].hull.max;
    if (hp < 0.5) cracks(g, a.drawn[s], CRACKS_50);
    if (hp < 0.25) cracks(g, a.drawn[s], CRACKS_25);
  }
  for (let s = 0; s < 2; s++) {
    if (!a.show[s]) continue;
    const v = views[s];
    drawMachinery(g, v);
    drawTurrets(g, v);
    if (a.loser === v.side && a.koT > 0.35) drawDim(g, v, Math.min(0.62, (a.koT - 0.35) * 1.1));
  }
  if (!b.over) drawShells(g, a);
  a.fx.draw(g, 0, 0);
  a.fx.drawPops(g, 0, 0);
  g.translate(-ox, -oy);
  drawWind(g, b.windLevel() * Math.max(0, 1 - a.overT / 1.2), W, H, a.clock);
  if (a.fx.flash > 0 && !settings.reducedMotion) {
    g.globalAlpha = Math.min(0.5, a.fx.flash);
    rect(g, 0, 0, W, H, a.fx.flashColor);
    g.globalAlpha = 1;
  }
}

function drawShells(g: G, a: Arena): void {
  const b = a.b;
  for (let n = 0; n < b.projectiles.length; n++) {
    const pr = b.projectiles[n];
    if (!a.show[pr.from]) continue;
    const from = a.drawn[pr.from], to = a.drawn[(1 - pr.from) as Side];
    const hero = b.sides[pr.from].build.hero;
    const x0 = muzzleX(from, hero, pr.turret, pr.id), y0 = muzzleY(from, hero, pr.turret, pr.id);
    const x1 = sx(to, pr.tx, pr.ty), y1 = sy(to, pr.tx, pr.ty);
    const dx = x1 - x0, dy = y1 - y0;
    const dist = Math.abs(dx) + Math.abs(dy);
    const arc = pr.heavy ? 8 + dist * 0.09 : 0;
    const k = Math.min(1, pr.t / pr.flight);
    const ad = AMMO[pr.payload.ammo];
    const tier = pr.payload.ammo === "cinder" ? heatTier(payloadDamage(pr.payload.base ?? ad.base, ad.rideScale, pr.payload.ride, pr.payload.mult, pr.payload.flat)) : 0;
    // trail: earlier points of the same flight path, fading
    const trail = trailColors(pr.payload.ammo, tier);
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
    const img = pr.core === "scatter" ? pelletSprite(pr.payload.ammo, tier, dir)
      : pr.core === "drake" ? flameCone(dir)
      : pr.core === "salvo" ? volleySprite(pr.payload.ammo, tier, dir)
      : shellSprite(pr.payload.ammo, tier, dir);
    g.drawImage(img, Math.round(x - img.width / 2), Math.round(y - z - img.height / 2));
  }
}

/** Views are plain data, built once per arena and mutated per frame. */
export function makeViews(a: Arena): [CruiserView, CruiserView] {
  const mk = (s: Side): CruiserView => ({
    side: s, build: a.b.sides[s].build, model: a.sfx[s].model, frame: a.drawn[s], sim: a.b.sides[s],
    t: 0, tread: 0, beltPhase: a.sfx[s].beltPhase, windup: a.sfx[s].windup, recoil: a.sfx[s].recoil,
  });
  return [mk(0), mk(1)];
}

export function heroName(a: Arena, s: Side): string {
  return HEROES[a.b.sides[s].build.hero].name;
}
