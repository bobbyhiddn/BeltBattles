// Turret art for all four facings. Authored in turret-local space (u across, v along the
// bow axis, forward = -v, pivot at 0,0) and mapped so light stays upper-left. The barrel
// is a separate layer so recoil and wind-up can slide it along the firing axis.

import { C, FACTION } from "./palette";
import { bevel, disc, ellipse, makeCanvas, rect, ring, type G } from "./pixel";
import type { Facing } from "./frame";
import type { Faction, TurretKind } from "../sim/content"; // races:
import { isArtRace, raceTurretArt } from "./raceArt"; // 0.8.0 H1: FOUNDRY's MEDIUM guns, BASTION's HEAVY

type Cv = HTMLCanvasElement;
export const TS = 48; // square canvas
const c = TS / 2;

export interface TurretArt {
  base: Cv;
  barrel: Cv;
  tip: number; // muzzle distance from the pivot along the bow axis
}

/** Turret-local rect -> canvas rect for a facing. */
export function tmap(f: Facing, u: number, v: number, w: number, h: number): [number, number, number, number] {
  switch (f) {
    case 0:
      return [c + u, c + v, w, h];
    case 2:
      return [c + u, c - v - h, w, h];
    case 1:
      return [c - v - h, c + u, h, w];
    default:
      return [c + v, c + u, h, w];
  }
}

class TP {
  constructor(readonly g: G, readonly f: Facing) {}
  R(u: number, v: number, w: number, h: number, col: string): void {
    const [x, y, ww, hh] = tmap(this.f, u, v, w, h);
    rect(this.g, x, y, ww, hh, col);
  }
  B(u: number, v: number, w: number, h: number, fill: string, hi: string, lo: string, out?: string): void {
    const [x, y, ww, hh] = tmap(this.f, u, v, w, h);
    bevel(this.g, x, y, ww, hh, fill, hi, lo, out);
  }
}

const cache = new Map<string, TurretArt>();

/** Muzzle distance from the pivot (no canvas needed: used by playback logic). */
// races: PLACEHOLDER art mapping until the race-art pass: medium uses light art, adaptable heavy.
const HEAVY_ART = (kind: TurretKind) => kind === "heavy" || kind === "adaptable"; // races:
export const TURRET_TIP: Record<TurretKind, number> = { heavy: 20, light: 15, medium: 15, adaptable: 20 }; // races:

export function turretArt(kind: TurretKind, faction: Faction, f: Facing): TurretArt { // races: widened types
  const k = `${kind}:${faction}:${f}`;
  let a = cache.get(k);
  if (!a) {
    // 0.8.0 H1: a human or dwarf hull's MEDIUM gun, and a dwarf HEAVY, are the race art's (raceArt.ts); every other
    // turret, an orc's and an elf's included, is drawn as before (in the race palette on a human or dwarf hull)
    a = (isArtRace(faction) ? raceTurretArt(kind, faction, f) : undefined) ?? (HEAVY_ART(kind) ? heavy(faction, f) : light(faction, f)); // races:
    cache.set(k, a);
  }
  return a;
}

function heavy(faction: Faction, f: Facing): TurretArt { // races: widened faction
  const P = FACTION[faction];
  const [base, g] = makeCanvas(TS, TS);
  disc(g, c, c, 10.5, C.ink);
  disc(g, c, c, 9.5, P.trim0);
  ring(g, c, c, 9.5, P.trim1);
  disc(g, c, c, 7.5, C.ink);
  const p = new TP(g, f);
  // armoured housing with a rear breech slit
  p.B(-8, -7, 16, 14, P.hull2, P.hull4, P.hull1, C.ink);
  p.R(-6, -4, 12, 1, P.hull1);
  p.R(-5, 3, 10, 2, C.ink);
  p.R(-4, 3, 8, 1, C.fire0);
  for (const [u, v] of [[-6, -5], [5, -5], [-6, 4], [5, 4]]) p.R(u, v, 1, 1, P.hull4);
  if (faction === "orc") {
    p.R(-10, -6, 2, 1, C.bone);
    p.R(-11, -7, 1, 1, C.bone);
    p.R(8, -6, 2, 1, C.bone);
    p.R(10, -7, 1, 1, C.bone);
  }
  const [barrel, bg] = makeCanvas(TS, TS);
  const b = new TP(bg, f);
  for (const u of [-5, 2]) {
    b.R(u - 1, -18, 5, 12, C.ink);
    b.R(u, -18, 3, 12, P.trim1);
    b.R(u, -18, 1, 12, P.trim2);
    b.R(u + 2, -18, 1, 12, P.trim0);
    b.R(u, -12, 3, 1, faction === "orc" ? C.maroon : P.trim2);
    // muzzle brake
    b.R(u - 2, -20, 7, 4, C.ink);
    b.R(u - 1, -19, 5, 2, P.trim2);
    b.R(u, -19, 1, 1, C.white);
  }
  return { base, barrel, tip: 20 };
}

function light(faction: Faction, f: Facing): TurretArt { // races: widened faction
  const P = FACTION[faction];
  const [base, g] = makeCanvas(TS, TS);
  disc(g, c, c, 7.5, C.ink);
  disc(g, c, c, 6.5, P.trim1);
  ring(g, c, c, 6.5, P.trim2);
  ellipse(g, c, c, 5, 5.5, C.ink);
  ellipse(g, c, c, 4, 4.5, P.hull3);
  const p = new TP(g, f);
  p.R(-3, -3, 2, 2, P.hull4);
  p.R(2, 2, 1, 1, P.hull1);
  p.R(-1, -1, 2, 2, C.blue);
  // side fins
  p.R(-8, -2, 2, 4, C.ink);
  p.R(-7, -1, 1, 2, P.trim2);
  p.R(6, -2, 2, 4, C.ink);
  p.R(6, -1, 1, 2, P.trim2);
  const [barrel, bg] = makeCanvas(TS, TS);
  const b = new TP(bg, f);
  b.R(-2, -14, 4, 10, C.ink);
  b.R(-1, -14, 2, 10, P.trim1);
  b.R(-1, -14, 1, 10, P.trim2);
  b.R(-2, -16, 4, 3, C.ink);
  b.R(-1, -15, 2, 1, C.ice);
  return { base, barrel, tip: 15 };
}

/** Wind-up glow ramps (0..4). */
export const HEAT_RAMP = [C.fire0, C.fire1, C.fire2, C.fire3, C.fire4];
export const CRYSTAL_RAMP = [C.deepblue, C.blue, C.cyan, C.ice, C.white];

/** Glow patch in turret-local space (breech slit / crystal core). */
const GLOW_HEAVY: [number, number, number, number] = [-4, 3, 8, 2];
const GLOW_LIGHT: [number, number, number, number] = [-2, -2, 4, 4];
export function glowRect(kind: TurretKind): [number, number, number, number] { // races: widened kind
  return HEAVY_ART(kind) ? GLOW_HEAVY : GLOW_LIGHT; // races:
}
