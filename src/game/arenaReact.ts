// Simulation events -> sound and juice (STUDY rules 7-11). Muzzle flash on fire; sparks,
// debris, scorch, a damage number and shake scaled by damage on impact; 3-frame hit-stop
// on big hits; a KO burst with slow-mo when a hull breaks. Read-only on the simulation.

import { settings } from "../core/settings";
import type { Side, SimEvent } from "../sim/battle";
import { CELL } from "../sim/content";
import { C } from "../render/palette";
import { hullBox, hullX, hullY, sx, sy } from "../render/frame";
import { muzzleX, muzzleY } from "../render/cruiser";
import type { Fx } from "../render/fx";
import type { Arena } from "./arena";

const HOT = [C.fire5, C.fire4, C.fire3, C.white] as const;
const COLD = [C.white, C.ice, C.cyan] as const;
const STEEL = [C.steel3, C.steel2, C.white] as const;
const DEBRIS_ORC = [C.rust3, C.steel2, C.rust4, C.steel1] as const;
const DEBRIS_ELF = [C.verd3, C.brass3, C.verd4, C.steel2] as const;
const KO_DEBRIS = [C.steel2, C.rust3, C.steel1, C.fire3, C.bone] as const;
const SHOCK = [C.ice, C.white, C.cyan] as const;

function hullCx(a: Arena, side: Side): number {
  const b = hullBox(a.drawn[side]);
  return b.x + b.w / 2;
}

function hullCy(a: Arena, side: Side): number {
  const b = hullBox(a.drawn[side]);
  return b.y + b.h / 2;
}

/** Camera trauma added by a hit: scales with the damage dealt (capped). */
export function hitTrauma(dmg: number): number {
  return Math.min(0.65, 0.04 + dmg * 0.03);
}

/** Directional camera kick (px) along the shell's travel: every hit nudges the camera at least
 *  1 world px on the frame it lands; heavier shells punch harder (up to 3 px). */
export function hitKick(dmg: number, heavy: boolean): number {
  return Math.max(1.1, Math.min(3, dmg / (heavy ? 4 : 5)));
}

/** Exact camera offset (world px) a hit shows on its landing frame, whatever the noise does:
 *  1 px for a light bolt, 2 px for any heavy shell or any hit of 6+ damage, 3 px from 10. */
export function hitPunch(dmg: number, heavy: boolean): number {
  return dmg >= 10 ? 3 : heavy || dmg >= 6 ? 2 : 1;
}

/** Camera response to a hit of `dmg` (as shown) from a shell travelling along (dx, dy):
 *  trauma noise and a decaying kick, plus the deterministic landing-frame punch. */
export function hitShake(fx: Fx, dmg: number, heavy: boolean, dx: number, dy: number): void {
  fx.addTrauma(hitTrauma(dmg));
  const kick = hitKick(dmg, heavy);
  fx.kick(dx * kick, dy * kick);
  fx.land(dx, dy, hitPunch(dmg, heavy));
}

/** Camera trauma of a KO (the hardest shake in the game). */
export const KO_TRAUMA = 0.95;

/** Screen direction (0 N, 1 E, 2 S, 3 W) a side's bow points. */
function bowDir(a: Arena, side: Side): number {
  return a.drawn[side].facing;
}

export function react(a: Arena, e: SimEvent): void {
  const fx = a.fx;
  const snd = a.quiet ? null : a.sound;
  const fast = a.speed > 2;
  switch (e.type) {
    case "produce": {
      const f = a.b.sides[e.side].factories.find((q) => q.uid === e.factory);
      if (!f) return;
      const fr = a.drawn[e.side];
      const lx = (f.x + f.def.size / 2) * CELL, ly = (f.y + f.def.size / 2) * CELL;
      const x = sx(fr, lx, ly), y = sy(fr, lx, ly);
      fx.smoke(x + 5, y - 9, 1, true, 10);
      if (f.def.id === "kiln") fx.embers(x, y - 6, 2);
      if (e.side === 0) snd?.play("stamp");
      return;
    }
    case "process": {
      const gs = a.b.sides[e.side].gates.find((q) => q.uid === e.gate);
      if (!gs) return;
      const fr = a.drawn[e.side];
      const x = sx(fr, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL), y = sy(fr, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL);
      if (e.def === "temper") {
        fx.embers(x, y, 3);
        if (e.side === 0) snd?.play("sizzle");
      } else if (e.def === "coil") {
        fx.sparks(x, y, 4, SHOCK, 40);
        if (e.side === 0) snd?.play("zap");
      } else fx.sparks(x, y, 3, STEEL, 36);
      return;
    }
    case "commission": {
      const gs = a.b.sides[e.side].gates.find((q) => q.uid === e.gate);
      if (!gs) return;
      const fr = a.drawn[e.side];
      fx.sparkle(sx(fr, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL), sy(fr, (gs.x + 0.5) * CELL, (gs.y + 0.5) * CELL));
      if (e.side === 0) snd?.play("commission");
      return;
    }
    case "load":
      if (e.side === 0) snd?.play("load");
      return;
    case "fire": {
      const fr = a.drawn[e.side];
      const hero = a.b.sides[e.side].build.hero;
      const x = muzzleX(fr, hero, e.turret, e.proj), y = muzzleY(fr, hero, e.turret, e.proj);
      const d = bowDir(a, e.side);
      const dx = d === 1 ? 1 : d === 3 ? -1 : 0, dy = d === 2 ? 1 : d === 0 ? -1 : 0;
      fx.muzzle(x + dx * 3, y + dy * 3, e.heavy, d);
      fx.spray(x, y, e.heavy ? 5 : 2, dx, dy, e.heavy ? HOT : COLD, e.heavy ? 90 : 70);
      fx.smoke(x, y, e.heavy ? 2 : 1, false, 6);
      if (e.core === "drake") fx.flameJet(x + dx * 3, y + dy * 3, dx, dy); // 0.6.1b: the flame cone's launch
      fx.addTrauma(e.heavy ? 0.1 : 0.02);
      if (e.heavy) fx.kick(-dx, -dy);
      snd?.play(e.heavy ? "fire_heavy" : "fire_light");
      return;
    }
    case "impact": {
      const fr = a.drawn[e.side];
      const x = sx(fr, e.x, e.y), y = sy(fr, e.x, e.y);
      const dmg = Math.max(1, Math.round(e.dmg));
      const size = e.big ? 28 : e.heavy ? 20 : 12;
      fx.explode(x, y, size, !e.heavy);
      // sparks fly back toward the shooter's side
      const d = bowDir(a, e.side);
      const dx = d === 1 ? 1 : d === 3 ? -1 : 0, dy = d === 2 ? 1 : d === 0 ? -1 : 0;
      fx.spray(x, y, e.heavy ? 9 : 5, dx, dy, e.heavy ? HOT : COLD, e.heavy ? 110 : 80);
      fx.sparks(x, y, e.heavy ? 6 : 3, e.heavy ? HOT : COLD, 60);
      if (e.heavy) {
        const hero = a.b.sides[e.side].build.hero;
        fx.debris(x, y, e.big ? 9 : 5, hero === "furnace" ? DEBRIS_ORC : DEBRIS_ELF);
        fx.smoke(x, y, e.big ? 4 : 2, true, 12);
      }
      if (e.x > -2 && e.x < 122 && e.y > -2 && e.y < 122) fx.scorch(x, y, e.big ? 6 : e.heavy ? 5 : 3);
      if (e.burn > 0) fx.embers(x, y, 4);
      fx.popup(x + (fx.rnd() - 0.5) * 8, y - 6, String(dmg), e.big ? C.yellow : e.heavy ? C.fire4 : C.white, e.big);
      // shake scales with the damage dealt: the landing frame shows exactly 1 px for a light
      // bolt and 2+ px for a heavy shell or 6+ damage; big hits add their trauma on top
      hitShake(fx, dmg, e.heavy, -dx, -dy);
      if (e.big) {
        fx.ring(x, y, 14, C.fire4);
        if (!settings.reducedMotion) fx.screenFlash(C.fire4, 0.2);
        if (!fast) fx.hitstop = 3;
        snd?.play("boom");
      } else snd?.play(e.heavy ? "impact" : "impact_small");
      if (e.shock) {
        fx.sparks(x, y, 7, SHOCK, 70);
        snd?.play("zap");
      }
      return;
    }
    case "jam": {
      const fr = a.drawn[e.side];
      const hero = a.b.sides[e.side].build.hero;
      fx.smoke(muzzleX(fr, hero, e.turret), muzzleY(fr, hero, e.turret), 4, true, 14);
      snd?.play("jam");
      return;
    }
    case "disrupt":
      if (e.side === 1 || !fast) snd?.play("zap");
      return;
    case "burn":
      fx.popup(hullCx(a, e.side) + (fx.rnd() - 0.5) * 60, hullCy(a, e.side) + (fx.rnd() - 0.5) * 40, String(e.dmg), C.fire3);
      return;
    case "wind":
      for (const side of [0, 1] as Side[]) {
        fx.popup(hullCx(a, side) + (fx.rnd() - 0.5) * 50, hullCy(a, side), String(Math.round(e.dmg)), C.plum4);
      }
      snd?.play("whoosh");
      return;
    case "windwarn":
      snd?.play("siren");
      return;
    case "end":
      ko(a, e.winner);
      return;
  }
}

/** Hull-local emitter points: [hx, hy] pairs (below 50% and below 25% hull). */
const SMOKE_50 = [24, 6, 132, 134];
const SMOKE_25 = [98, 60, 8, 70, 150, 34];
const SPARKY = [C.fire4, C.yellow, C.white] as const;

/** Damage states: smoke and sparks below 50% hull, fire and heavy smoke below 25%. */
export function damageFx(a: Arena, side: Side, dt: number): void {
  const s = a.b.sides[side];
  const pct = Math.max(0, s.hull.hp) / s.hull.max;
  if (pct >= 0.5 || dt <= 0) return;
  const f = a.sfx[side];
  f.smokeT -= dt;
  if (f.smokeT > 0) return;
  const fx = a.fx;
  const crit = pct < 0.25;
  f.smokeT = crit ? 0.09 : 0.26;
  const pts = crit && fx.rnd() < 0.6 ? SMOKE_25 : SMOKE_50;
  const i = Math.floor(fx.rnd() * (pts.length / 2)) * 2;
  const fr = a.drawn[side];
  const x = hullX(fr, pts[i], pts[i + 1]), y = hullY(fr, pts[i], pts[i + 1]);
  fx.smoke(x, y, 1, crit, crit ? 16 : 10);
  if (crit && fx.rnd() < 0.5) fx.embers(x, y, 2);
  if (fx.rnd() < (crit ? 0.3 : 0.12)) fx.sparks(x, y, crit ? 4 : 2, SPARKY, 45);
}

/** KO: chained explosions across the losing hull, debris, shockwave, slow-mo. */
function ko(a: Arena, winner: Side | -1): void {
  const fx = a.fx;
  const loser: Side | -1 = winner === 0 ? 1 : winner === 1 ? 0 : -1;
  a.loser = loser;
  a.koT = 0;
  if (loser === -1) return;
  const b = hullBox(a.drawn[loser]);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  for (let i = 0; i < 12; i++) {
    const x = b.x + 10 + fx.rnd() * (b.w - 20), y = b.y + 10 + fx.rnd() * (b.h - 20);
    fx.explode(x, y, 18 + Math.floor(fx.rnd() * 16), false, i * 0.07);
  }
  fx.explode(cx, cy, 34, false, 0.45);
  fx.ring(cx, cy, 40, C.fire4, 0.45);
  fx.ring(cx, cy, 26, C.white, 0.5);
  fx.debris(cx, cy, 22, KO_DEBRIS, 90);
  fx.smoke(cx, cy, 12, true, 16);
  fx.addTrauma(KO_TRAUMA);
  if (!settings.reducedMotion) fx.screenFlash(C.white, 0.55);
  fx.hitstop = 4;
  if (a.sound && !a.quiet) a.sound.play("boom");
}
