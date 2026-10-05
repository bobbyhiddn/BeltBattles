// Simulation events -> sound and juice (STUDY rules 7-11). Muzzle flash on fire; sparks,
// debris, scorch, a damage number and shake scaled by damage on impact; 3-frame hit-stop
// on big hits; a KO burst with slow-mo when a hull breaks. Read-only on the simulation.

import { settings } from "../core/settings";
import type { Side, SimEvent, TargetKind } from "../sim/battle";
import { CELL } from "../sim/content";
import { DX, DY } from "../sim/deck";
import { C } from "../render/palette";
import { hullBox, hullX, hullY, sx, sy } from "../render/frame";
import { muzzleX, muzzleY } from "../render/cruiser";
import { CLANK_TIME, FUSE_TIME } from "../render/raceFx"; // 0.8.0 H1 M3: FOUNDRY's weld flash, BASTION's CLANK
import type { Fx } from "../render/fx";
import { RELEASE_TIME, SHRUG_TIME } from "../render/wave3Moments"; // 0.8.0 I1 M4: A1's battle moments
import type { Arena } from "./arena";
import { ICON, ICON_COLOUR } from "../render/font"; // SUS-B (REQ-BFG-069): HEAL's and SHIELD's colours, one source
import { fmtDmg } from "../ui/statFormat"; // SUS-B: a heal's float prints as the faces print HEAL

const HOT = [C.fire5, C.fire4, C.fire3, C.white] as const;
const COLD = [C.white, C.ice, C.cyan] as const;
const STEEL = [C.steel3, C.steel2, C.white] as const;
const DEBRIS_ORC = [C.rust3, C.steel2, C.rust4, C.steel1] as const;
const DEBRIS_ELF = [C.verd3, C.brass3, C.verd4, C.steel2] as const;
// 0.8.0 H1: blued steel and brass off a FOUNDRY hull, granite and iron off a BASTION's (as many colours as the others)
const DEBRIS_HUMAN = [C.bsteel3, C.brass3, C.bsteel4, C.steel2] as const;
const DEBRIS_DWARF = [C.stone3, C.steel2, C.stone4, C.rune2] as const;
const debrisOf = (hero: string): readonly string[] =>
  hero === "furnace" ? DEBRIS_ORC : hero === "foundry" ? DEBRIS_HUMAN : hero === "bastion" ? DEBRIS_DWARF : DEBRIS_ELF;
const KO_DEBRIS = [C.steel2, C.rust3, C.steel1, C.fire3, C.bone] as const;
const SHOCK = [C.ice, C.white, C.cyan] as const;
// 0.8.0 H1 M3: a hit that BASTION's plating took throws plate chips, and its number shows in the plating strip's rune blue
const PLATED = [C.rune3, C.plate3, C.rune4] as const;

/** SUS-B (REQ-BFG-069; SUSTAIN-1 4.4): HEAL's colour (font.ts ICON_COLOUR, the one source: green) for its floats. */
export const HEAL_COLOUR = ICON_COLOUR[ICON.HEAL];
/** SUS-B: how long a broken SHIELD's pip flashes on the plate (s, real time). */
export const SHIELD_BREAK_TIME = 0.5;
/** SUS-B: a broken SHIELD's sparks, in SHIELD's rune glow (ICON_COLOUR) and white. */
const SHIELD_SPARKS = [ICON_COLOUR[ICON.SHIELD], C.white, C.rune4] as const;

/** SUS-B: where a heal's float rises: RIVETER's rig, MEND PRESS's factory, else (REGEN) the hull a little above centre. */
export function healPoint(a: Arena, e: Extract<SimEvent, { type: "heal" }>): [number, number] {
  const fr = a.drawn[e.side], s = a.b.sides[e.side];
  const g = e.gate !== undefined ? s.gates.find((v) => v.uid === e.gate) : undefined;
  if (g) return [sx(fr, (g.x + 0.5) * CELL, (g.y + 0.5) * CELL), sy(fr, (g.x + 0.5) * CELL, (g.y + 0.5) * CELL)];
  const f = e.factory !== undefined ? s.factories.find((q) => q.uid === e.factory) : undefined;
  if (f) {
    const lx = (f.x + f.def.size / 2) * CELL, ly = (f.y + f.def.size / 2) * CELL;
    return [sx(fr, lx, ly), sy(fr, lx, ly)];
  }
  return [hullCx(a, e.side), hullCy(a, e.side) - 10];
}

function hullCx(a: Arena, side: Side): number {
  const b = hullBox(a.drawn[side]);
  return b.x + b.w / 2;
}

function hullCy(a: Arena, side: Side): number {
  const b = hullBox(a.drawn[side]);
  return b.y + b.h / 2;
}

/** Camera trauma added by a hit: scales with the damage dealt (capped).
 *  NUM-2 (REQ-BFG-047; NUM-1's question 2, cap's answer): the damage keys x10 with NUM-1's damage (0.03 a point -> 0.003). */
export function hitTrauma(dmg: number): number {
  return Math.min(0.65, 0.04 + dmg * 0.003);
}

/** Directional camera kick (px) along the shell's travel: every hit nudges the camera at least
 *  1 world px on the frame it lands; heavier shells punch harder (up to 3 px). NUM-2: dmg / 40 or 50 (was 4 or 5). */
export function hitKick(dmg: number, heavy: boolean): number {
  return Math.max(1.1, Math.min(3, dmg / (heavy ? 40 : 50)));
}

/** Exact camera offset (world px) a hit shows on its landing frame, whatever the noise does:
 *  1 px for a light bolt, 2 px for any heavy shell or any hit of 60+ damage, 3 px from 100 (NUM-2: x10, was 6 and 10). */
export function hitPunch(dmg: number, heavy: boolean): number {
  return dmg >= 100 ? 3 : heavy || dmg >= 60 ? 2 : 1;
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

function machinePoint(a: Arena, side: Side, kind: TargetKind, ref: number, cell: number): [number, number] {
  const t = a.b.sides[side].targets.find((v) => v.kind === kind && v.ref === ref && v.cell === cell);
  return t ? [sx(a.drawn[side], t.x, t.y), sy(a.drawn[side], t.x, t.y)] : [hullCx(a, side), hullCy(a, side)];
}

/** 0.8.0 I1 M4: whether event `e` is the -1 plating a PLATE BREAKER's blow takes (Battle.spendPlate, pushed in the same
 *  applyHit right before that blow's `process` event; a hit's plating soak (absorb) is a separate event of the impacts). */
const spendOf = (e: SimEvent | null, side: Side): boolean => !!e && e.type === "plate" && !("turret" in e) && e.side === side && e.amount < 0;

/** `prev`: the event before `e` in the same step (null for the step's first): PLATE BREAKER's blow reads it. */
export function react(a: Arena, e: SimEvent, prev: SimEvent | null = null): void {
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
      // 0.8.0 I1 M4 (A1's PLATE BREAKER moment): did this blow take a plating (the -1 `plate` right before it), or none?
      if (e.def === "platebreaker") a.sfx[e.side].w3.spent.set(e.gate, spendOf(prev, e.side));
      const fr = a.drawn[e.side];
      // 0.6.2 BELTSIDE (V3): at the arrow's tip, where the rig works the belt tile it hit
      const lx = (gs.x + 0.5 + DX[e.dir] * 0.6) * CELL, ly = (gs.y + 0.5 + DY[e.dir] * 0.6) * CELL;
      const x = sx(fr, lx, ly), y = sy(fr, lx, ly);
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
    case "fuse": {
      // 0.8.0 H1 M3: FOUNDRY's two blanks weld into an alloy slug in this gun's chamber (drawTurrets plays the flash)
      const f = a.sfx[e.side];
      if (e.turret >= 0 && e.turret < f.fuse.length) f.fuse[e.turret] = FUSE_TIME;
      if (e.side === 0) snd?.play("sizzle");
      return;
    }
    case "plate": {
      // 0.8.0 H1 M3: a bulwark slug plated BASTION's hull: the CLANK on the gun and the strip's newest segment shines.
      // 0.8.0 I1 (the merge of H1 and P1): P1's E1 event shares the type (a wave-3 part's plating, + or -, the pool after,
      // no gun); only the bulwark slug's event names a gun, and only it CLANKs here
      if (!("turret" in e)) return;
      const f = a.sfx[e.side];
      if (e.turret >= 0 && e.turret < f.clank.length) f.clank[e.turret] = CLANK_TIME;
      f.plateShine = CLANK_TIME;
      if (e.side === 0) snd?.play("place");
      return;
    }
    case "fire": {
      const fr = a.drawn[e.side];
      const hb = a.b.sides[e.side].build; // 0.6.2s: the build's turret slots
      const x = muzzleX(fr, hb, e.turret, e.proj), y = muzzleY(fr, hb, e.turret, e.proj);
      const d = bowDir(a, e.side);
      const dx = d === 1 ? 1 : d === 3 ? -1 : 0, dy = d === 2 ? 1 : d === 0 ? -1 : 0;
      fx.muzzle(x + dx * 3, y + dy * 3, e.heavy, d);
      fx.spray(x, y, e.heavy ? 5 : 2, dx, dy, e.heavy ? HOT : COLD, e.heavy ? 90 : 70);
      fx.smoke(x, y, e.heavy ? 2 : 1, false, 6);
      if (e.core === "drake") fx.flameJet(x + dx * 3, y + dy * 3, dx, dy); // 0.6.1b: the flame cone's launch
      fx.addTrauma(e.heavy ? 0.1 : 0.02);
      if (e.heavy) fx.kick(-dx, -dy);
      snd?.play(e.heavy ? "fire_heavy" : "fire_light");
      // 0.8.0 I1 M4 (A1's ANVIL BREECH moment): sparks fly off the face with each shot (drawTurrets plays them)
      if (e.core === "anvil") {
        const w = a.sfx[e.side].w3.anvilAge;
        if (e.turret >= 0 && e.turret < w.length) w[e.turret] = 0;
      }
      return;
    }
    // 0.8.0 I1 M4 (A1's battle moments, REPORT-A1 5.2): P1's wave-3 events set the display timers the art reads
    case "pair": { // E2: TWIN TRIGGER's lamp and SEAM WELDER's seam light on this gun
      const w = a.sfx[e.side].w3.pairAge;
      if (e.turret >= 0 && e.turret < w.length) w[e.turret] = 0;
      return;
    }
    case "brace": // BRACE FRAME shortened an enemy stall, freeze or slow: its bolts glow
      a.sfx[e.side].w3.shrug.set(e.gate, SHRUG_TIME);
      return;
    case "release": // E4: TWIN LATCH lets a payload go: its fingers drop, the lamp turns green
      a.sfx[e.side].w3.release.set(e.gate, RELEASE_TIME);
      return;
    case "impact": {
      const fr = a.drawn[e.side];
      const x = sx(fr, e.x, e.y), y = sy(fr, e.x, e.y);
      // NUM-4 (REQ-BFG-047; N1 2.5's numbers.battle): the pop prints the impact's whole damage as the sim dealt it, through
      // fmtDmg (was max(1, round(dmg)): a SHIELDed hit's 0 popped as 1); the shake keeps its floor of 1
      const dmg = Math.max(1, e.dmg), shown = fmtDmg(e.dmg);
      const size = e.big ? 28 : e.heavy ? 20 : 12;
      fx.explode(x, y, size, !e.heavy);
      // sparks fly back toward the shooter's side
      const d = bowDir(a, e.side);
      const dx = d === 1 ? 1 : d === 3 ? -1 : 0, dy = d === 2 ? 1 : d === 0 ? -1 : 0;
      fx.spray(x, y, e.heavy ? 9 : 5, dx, dy, e.heavy ? HOT : COLD, e.heavy ? 110 : 80);
      fx.sparks(x, y, e.heavy ? 6 : 3, e.heavy ? HOT : COLD, 60);
      if (e.heavy) {
        const hero = a.b.sides[e.side].build.hero;
        fx.debris(x, y, e.big ? 9 : 5, debrisOf(hero));
        fx.smoke(x, y, e.big ? 4 : 2, true, 12);
      }
      if (e.x > -2 && e.x < 122 && e.y > -2 && e.y < 122) fx.scorch(x, y, e.big ? 6 : e.heavy ? 5 : 3);
      if (e.burn > 0) fx.embers(x, y, 4);
      // 0.8.0 H1 M3: BASTION's plating took (part of) this hit before the hull did: plate chips and a rune-blue number (0
      // on every hull without plating, which draws exactly as before)
      const soak = a.takeSoak(e.side, e.dmg);
      if (soak > 0) fx.sparks(x, y, 5, PLATED, 55);
      fx.popup(x + (fx.rnd() - 0.5) * 8, y - 6, shown, soak > 0 ? C.rune3 : e.big ? C.yellow : e.heavy ? C.fire4 : C.white, e.big);
      // shake scales with the damage dealt: the landing frame shows exactly 1 px for a light
      // bolt and 2+ px for a heavy shell or 60+ damage (NUM-2: x10); big hits add their trauma on top
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
      const hb = a.b.sides[e.side].build; // 0.6.2s: the build's turret slots
      fx.smoke(muzzleX(fr, hb, e.turret), muzzleY(fr, hb, e.turret), 4, true, 14);
      snd?.play("jam");
      return;
    }
    case "disrupt":
      if (e.side === 1 || !fast) snd?.play("zap");
      return;
    case "telegraph": {
      const [x, y] = machinePoint(a, e.side === 0 ? 1 : 0, e.target.kind, e.target.ref, e.target.cell);
      fx.ring(x, y, 9, C.red);
      return;
    }
    case "flak": {
      fx.smoke(hullCx(a, e.side), hullCy(a, e.side), 4, true, 12);
      fx.sparks(hullCx(a, e.side), hullCy(a, e.side), 6, STEEL, 55);
      return;
    }
    case "toll": {
      const g = a.b.sides[e.side].gates.find((v) => v.uid === e.gate);
      if (g) fx.ring(sx(a.drawn[e.side], (g.x + 0.5) * CELL, (g.y + 0.5) * CELL),
        sy(a.drawn[e.side], (g.x + 0.5) * CELL, (g.y + 0.5) * CELL), 10, C.brass4);
      return;
    }
    case "heal": {
      // SUS-A (REQ-BFG-069): was "repair". SUS-B: every heal floats a green "+n" (fmtDmg, the faces' damage-family number;
      // was RIVETER's only, toFixed(1) in lime): RIVETER's at its rig, MEND PRESS's at its factory, REGEN's at the hull.
      // Fast mode skips floats, as before
      if (fast) return;
      const [x, y] = healPoint(a, e);
      fx.popup(x, y, `+${fmtDmg(e.amount)}`, HEAL_COLOUR);
      return;
    }
    case "shield": {
      // SUS-B (REQ-BFG-069): a hit broke a SHIELD (-1): its pip on the plate flashes out (battleHud.ts drawPlate) and a few
      // rune sparks fly off the hull; a gain needs no cue (its pip lights)
      if (e.amount >= 0) return;
      const f = a.sfx[e.side];
      f.shieldBreak = SHIELD_BREAK_TIME;
      f.shieldAt = e.shield;
      if (!fast) fx.sparks(hullCx(a, e.side), hullCy(a, e.side), 5, SHIELD_SPARKS, 45);
      return;
    }
    case "keg": {
      const g = a.b.sides[e.side].gates.find((v) => v.uid === e.gate);
      if (g) {
        const x = sx(a.drawn[e.side], (g.x + 0.5) * CELL, (g.y + 0.5) * CELL);
        const y = sy(a.drawn[e.side], (g.x + 0.5) * CELL, (g.y + 0.5) * CELL);
        fx.explode(x, y, 26, false);
        fx.scorch(x, y, 7);
      }
      return;
    }
    case "wreck": case "rip": case "limpet": {
      const [x, y] = machinePoint(a, e.side, e.kind, e.ref, e.cell);
      fx.sparks(x, y, e.type === "wreck" || e.type === "limpet" ? 8 : 4, [C.red, C.white], 55);
      return;
    }
    case "arc": case "lance": case "splash": {
      const x = sx(a.drawn[e.side], e.x, e.y), y = sy(a.drawn[e.side], e.x, e.y);
      fx.sparks(x, y, 4, e.type === "splash" ? HOT : SHOCK, 50);
      return;
    }
    case "harass": return;
    case "burn":
      fx.popup(hullCx(a, e.side) + (fx.rnd() - 0.5) * 60, hullCy(a, e.side) + (fx.rnd() - 0.5) * 40, fmtDmg(e.dmg), C.fire3); // NUM-4
      return;
    case "poison":
      // NUM-4 (REQ-BFG-047): poison ticks whole damage once a second (NUM-1), printed as it is (was toFixed(1), from 0.1)
      if (!fast && e.dmg > 0) fx.popup(hullCx(a, e.side), hullCy(a, e.side), fmtDmg(e.dmg), C.lime);
      return;
    case "wind":
      for (const side of [0, 1] as Side[]) {
        fx.popup(hullCx(a, side) + (fx.rnd() - 0.5) * 50, hullCy(a, side), fmtDmg(e.dmg), C.plum4); // NUM-4: was Math.round
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
