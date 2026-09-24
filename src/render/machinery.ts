// Deck machinery for any facing: turret intakes, conveyor belts (animated by real travel),
// chunky ammunition riding them, factories with output chutes, and processing gates.

import { AMMO, BELT_SPEED, CELL, HEROES } from "../sim/content";
import { defOf, kx, ky, opposite, payloadDamage, routeDirs, type Build, type Dir, type RouteDef } from "../sim/deck";
import { starsOf } from "../sim/stars";
import type { FactoryState } from "../sim/battle"; // 0.6.1c: read-only render state (frame index)
import { C } from "./palette";
import { frame as frameRect, rect, type G } from "./pixel";
import { drawText } from "./font";
import { footX, footY, localRect, sdir, sx, sy, type Box, type DeckFrame } from "./frame";
import {
  BELT_PERIOD, beltCorner, beltStopper, beltStraight, boltIcon, factoryFlashSil, factorySprite, gateSil,
  gateSprite, turntable, wrenchIcon,
} from "./sprites";
import { ammoSprite, heatHalo, heatTier } from "./ammo";
import type { CruiserView } from "./cruiser";

/** 0.6.1d2: two cosmetic, build-screen-only cues threaded through CruiserView without touching
 *  cruiser.ts (0.6.1b's custody): the survivor ring (which deck twin a hovered/selected shop offer
 *  would merge into) and the merge animation's pip override (hide the newest pip until its "pop"
 *  beat). Never turrets: 0.6.1b owns turret rendering. */
declare module "./cruiser" {
  interface CruiserView {
    survivorUid?: number;
    fuseAnimUid?: number;
    fuseAnimStars?: number;
  }
}

const box: Box = { x: 0, y: 0, w: 0, h: 0 };
const pt = { x: 0, y: 0 };

/** Point at distance s along an axis-aligned polyline (writes into `pt`). */
function pointAt(pts: { x: number; y: number }[], s: number): void {
  let rem = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (rem <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rem / len) : 0;
      pt.x = a.x + (b.x - a.x) * t;
      pt.y = a.y + (b.y - a.y) * t;
      return;
    }
    rem -= len;
  }
  const last = pts[pts.length - 1];
  pt.x = last ? last.x : 0;
  pt.y = last ? last.y : 0;
}

type Variant = "normal" | "warn" | "dead";

function beltCell(g: G, f: DeckFrame, x: number, y: number, din: number, dout: number, phase: number, variant: Variant): void {
  const si = sdir(f, din), so = sdir(f, dout);
  const fr = ((Math.floor(phase) % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  const a = opposite(si as Dir);
  if (a === opposite(so as Dir)) {
    g.drawImage(beltStraight(so, fr, variant), x, y);
  } else {
    g.drawImage(beltCorner(a, so, fr, variant), x, y);
    const right = so === (si + 1) % 4;
    g.drawImage(turntable(Math.floor(phase / 6) * (right ? 1 : -1), variant), x, y);
  }
}

function drawIntakes(g: G, v: CruiserView): void {
  const f = v.frame;
  const h = HEROES[v.model.hero];
  const blink = Math.floor(v.t * 6) % 2 === 1;
  for (let ti = 0; ti < h.turrets.length; ti++) {
    const cons = h.turrets[ti].connectors;
    for (let ci = 0; ci < cons.length; ci++) {
      const col = cons[ci];
      const on = v.model.connectedCols.has(col);
      const hl = !on && !!v.highlightConnectors && v.highlightConnectors.includes(col);
      localRect(f, col * CELL + 2, -3, 8, 5, box);
      rect(g, box.x, box.y, box.w, box.h, C.ink);
      rect(g, box.x + 1, box.y + 1, box.w - 2, box.h - 2, C.steel1);
      localRect(f, col * CELL + 4, -2, 4, 2, box);
      rect(g, box.x, box.y, box.w, box.h, C.ink);
      localRect(f, col * CELL + 8, -2, 1, 1, box);
      rect(g, box.x, box.y, 1, 1, on ? C.lime : hl ? (blink ? C.yellow : C.amber) : C.slate2);
      if (hl) {
        localRect(f, col * CELL + 1, -4, 10, 7, box);
        frameRect(g, box.x, box.y, box.w, box.h, blink ? C.yellow : C.amber);
      }
    }
  }
}

function drawBelts(g: G, v: CruiserView): void {
  const f = v.frame;
  const sim = v.sim;
  const routes = v.model.routes;
  for (let ri = 0; ri < routes.length; ri++) {
    if (ri === v.hideRoute) continue;
    const rm = routes[ri];
    const sr = sim ? sim.routes[ri] : undefined;
    const phases = v.beltPhase ? v.beltPhase[ri] : undefined;
    for (let i = 0; i < rm.cells.length; i++) {
      const k = rm.cells[i];
      const x = Math.round(footX(f, kx(k), ky(k))), y = Math.round(footY(f, kx(k), ky(k)));
      let variant: Variant = rm.connected ? "normal" : "dead";
      if (sr && rm.connected && sr.pressure >= 2) {
        for (let a = 0; a < sr.ammo.length; a++) {
          const am = sr.ammo[a];
          if (am.blocked && Math.min(rm.cells.length - 1, Math.floor(am.s / CELL)) === i) { variant = "warn"; break; }
        }
      }
      const phase = phases ? phases[i] : v.t * BELT_SPEED * rm.speeds[i];
      beltCell(g, f, x, y, rm.din[i], rm.dout[i], phase, variant);
      if (sr && sr.cellDisrupt[i] > 0) shock(g, x, y, v.t);
    }
    if (!rm.connected && rm.cells.length) {
      const last = rm.cells[rm.cells.length - 1];
      g.drawImage(beltStopper(sdir(f, rm.dout[rm.dout.length - 1])), Math.round(footX(f, kx(last), ky(last))), Math.round(footY(f, kx(last), ky(last))));
    }
  }
}

function drawGhost(g: G, v: CruiserView): void {
  const gh = v.ghost!;
  if (!gh.cells.length) return;
  const f = v.frame;
  const gr: RouteDef = { factory: gh.factory, cells: gh.cells };
  const tmp: Build = { ...v.build, routes: [...v.build.routes, gr] };
  const dirs = routeDirs(tmp, gr, gh.connected);
  const blink = Math.floor(v.t * 8) % 2 === 1;
  for (let i = 0; i < gh.cells.length; i++) {
    const k = gh.cells[i];
    const x = Math.round(footX(f, kx(k), ky(k))), y = Math.round(footY(f, kx(k), ky(k)));
    beltCell(g, f, x, y, dirs[i].din, dirs[i].dout, v.t * BELT_SPEED * 1.5, gh.connected ? "normal" : "warn");
    frameRect(g, x, y, 12, 12, gh.connected ? C.lime : blink ? C.yellow : C.amber);
  }
}

function drawAmmo(g: G, v: CruiserView): void {
  const f = v.frame;
  const sim = v.sim!;
  for (let ri = 0; ri < sim.routes.length; ri++) {
    const r = sim.routes[ri];
    for (let ai = 0; ai < r.ammo.length; ai++) {
      const a = r.ammo[ai];
      pointAt(r.pts, a.s);
      const x = Math.round(sx(f, pt.x, pt.y)) - 3, y = Math.round(sy(f, pt.x, pt.y)) - 3;
      const ad = AMMO[a.p.ammo];
      const tier = a.p.ammo === "cinder" ? heatTier(payloadDamage(ad.base, ad.rideScale, a.p.ride, a.p.mult, a.p.flat)) : 0;
      if (tier >= 3) g.drawImage(heatHalo(tier), x - 2, y - 2);
      g.drawImage(ammoSprite(a.p.preset ?? a.p.ammo, tier), x, y); // 0.6.1c: HOT SWAP's ember / spark tint
      if (a.p.burn > 0 && Math.floor(v.t * 10 + a.p.id) % 2) rect(g, x + 3, y - 1, 1, 1, C.fire4);
      if (a.p.shock && Math.floor(v.t * 12 + a.p.id) % 3 === 0) rect(g, x + 6, y + 1, 1, 1, C.white);
    }
  }
}

function drawChute(g: G, f: DeckFrame, k0: number, d0: number, id: string): void {
  if (d0 < 0) return;
  const lx = kx(k0) * CELL, ly = ky(k0) * CELL;
  // chute straddles the edge of the first cell that touches the factory
  if (d0 === 0) localRect(f, lx + 2, ly + 9, 8, 5, box);
  else if (d0 === 2) localRect(f, lx + 2, ly - 2, 8, 5, box);
  else if (d0 === 1) localRect(f, lx - 2, ly + 2, 5, 8, box);
  else localRect(f, lx + 9, ly + 2, 5, 8, box);
  rect(g, box.x, box.y, box.w, box.h, C.ink);
  rect(g, box.x + 1, box.y + 1, box.w - 2, box.h - 2, C.steel1);
  const mouth = id === "kiln" || id === "slagpot" ? C.fire2 : id === "loom" ? C.ice : C.steel3; // 0.6.1c: slag glows
  if (box.w > box.h) rect(g, box.x + 2, box.y + 2, box.w - 4, 1, mouth);
  else rect(g, box.x + 2, box.y + 2, 1, box.h - 4, mouth);
}

function drawFactories(g: G, v: CruiserView): void {
  const f = v.frame;
  const items = v.build.items;
  for (let n = 0; n < items.length; n++) {
    const p = items[n];
    const d = defOf(p);
    if (d.kind !== "factory" || p.uid === v.hideItem) continue;
    const x = Math.round(footX(f, p.x, p.y, d.size)), y = Math.round(footY(f, p.x, p.y, d.size));
    let fs = null;
    if (v.sim) for (const q of v.sim.factories) if (q.uid === p.uid) fs = q;
    const flash = !!fs && fs.flash > 0;
    const fstars = animStars(v, p.uid, starsOf(p)); // 0.6.1c: the art's stars too (GANTRY PRESS's third chute pops with the pip)
    const fi = d.id === "loom" ? Math.floor(v.t * 9) : d.id === "press" ? (fs ? (flash ? 0 : 1) : Math.floor(v.t * 2)) : factoryFrame(d.id, v.t, fs, flash, fstars);
    for (const rm of v.model.routes) {
      if (rm.factory === p.uid && rm.cells.length && rm.index !== v.hideRoute) drawChute(g, f, rm.cells[0], rm.d0, d.id);
    }
    if (v.ghost && v.ghost.factory === p.uid && v.ghost.cells.length) drawChute(g, f, v.ghost.cells[0], v.ghost.cells.length ? ghostD0(v, p.uid) : -1, d.id);
    g.drawImage(factorySprite(d.id, fi, flash, fstars), x, y);
    if (flash && fs) {
      g.globalAlpha = Math.min(0.6, fs.flash * 3);
      g.drawImage(factoryFlashSil(d.id, fstars), x, y);
      g.globalAlpha = 1;
    }
    if (fs && fs.disrupted > 0) shock(g, x + 6, y + 6, v.t);
    if (fs && fs.stalled && Math.floor(v.t * 4) % 2) drawText(g, "!", x + 22, y - 2, C.yellow, { outline: C.ink });
    drawPips(g, x + 2, y + 21, 20, fstars, "left");
    if (fstars >= 3) frameRect(g, x, y, 24, 24, C.brass3);
    if (v.survivorUid === p.uid) drawSurvivorRing(g, x - 1, y - 1, 26, 26, v.t);
  }
}

/**
 * 0.6.1c: the frame index of each factory other than LOOM and STAMP PRESS (factorySprite reads it mod 8; the
 * wave-1 contracts are in factoryArt.ts). In battle (`fs`) the wave-1 factories follow the sim's state -- `flash`
 * right after a stamp, `produced` (stamps so far) and `rr` (the next route) -- read only; in the build view they
 * run on the clock. KILN, the race factories and any other id keep 7 fps.
 */
function factoryFrame(id: string, t: number, fs: FactoryState | null, flash: boolean, stars: number): number {
  switch (id) {
    case "doublestamp": // stamp n thumps the left hammer when n is odd, the right one when even; idle: both up
      return fs ? (flash ? (fs.produced % 2 ? 0 : 2) : 1) : Math.floor(t * 4);
    case "hotswap": // the window of the preset stamped last (the cycle starts on EMBER), the drum turning
      return fs ? (fs.produced % 2 ? 0 : 4) + (Math.floor(t * 6) % 4) : Math.floor(t * 2);
    case "gantry": { // the head over the chute of the route fed last, down while it flashes
      if (fs) {
        const n = Math.max(1, fs.routes.length);
        return ((fs.rr + n - 1) % n) * 2 + (flash ? 0 : 1);
      }
      const n = stars >= 2 ? 3 : 2;
      return (Math.floor(t * 1.5) % n) * 2 + (Math.floor(t * 3) % 2);
    }
    case "shottower": return Math.floor(t * 8); // the shot keeps falling down the slot
    case "slagpot": return Math.floor(t * 5);
    case "assembly": return Math.floor(t * 6);
    default: return Math.floor(t * 7);
  }
}

function ghostD0(v: CruiserView, uid: number): number {
  const k = v.ghost!.cells[0];
  const b = v.build;
  for (const p of b.items) {
    if (p.uid !== uid) continue;
    const s = defOf(p).size;
    const x = kx(k), y = ky(k);
    if (y === p.y - 1 && x >= p.x && x < p.x + s) return 0;
    if (y === p.y + s && x >= p.x && x < p.x + s) return 2;
    if (x === p.x - 1 && y >= p.y && y < p.y + s) return 3;
    if (x === p.x + s && y >= p.y && y < p.y + s) return 1;
  }
  return -1;
}

function drawGates(g: G, v: CruiserView): void {
  const f = v.frame;
  const items = v.build.items;
  for (let n = 0; n < items.length; n++) {
    const p = items[n];
    const d = defOf(p);
    if (d.kind !== "gate" || p.uid === v.hideItem) continue;
    const x = Math.round(footX(f, p.x, p.y)), y = Math.round(footY(f, p.x, p.y));
    let gs = null;
    if (v.sim) for (const q of v.sim.gates) if (q.uid === p.uid) gs = q;
    const active = !!gs && gs.flash > 0;
    g.drawImage(gateSprite(d.id, Math.floor(v.t * 8), active), x, y);
    if (active && gs) {
      g.globalAlpha = Math.min(0.7, gs.flash * 4);
      g.drawImage(gateSil(d.id), x, y);
      g.globalAlpha = 1;
    }
    const onRoute = gs ? gs.route >= 0 : v.model.gateOnRoute.has(p.uid);
    if (!onRoute || (gs && !gs.online)) {
      g.globalAlpha = 0.55;
      rect(g, x + 1, y + 1, 10, 10, C.ink);
      g.globalAlpha = 1;
      if (gs && !gs.online && Math.floor(v.t * 6) % 2) g.drawImage(wrenchIcon(), x + 4, y + 3);
    }
    if (gs && gs.disrupted > 0) shock(g, x, y, v.t);
    const gstars = animStars(v, p.uid, starsOf(p));
    drawPips(g, x + 1, y + 10, 10, gstars);
    if (gstars >= 3) frameRect(g, x, y, 12, 12, C.brass3);
    if (v.survivorUid === p.uid) drawSurvivorRing(g, x - 1, y - 1, 14, 14, v.t);
  }
}

/** 0.6.1d2: the merge animation's pip override for `uid` (Math.max(1, step.stars - 1) pre-pop, the
 *  real value once popped or when nothing is animating on this uid). */
function animStars(v: CruiserView, uid: number, real: number): number {
  return v.fuseAnimUid === uid && v.fuseAnimStars !== undefined ? v.fuseAnimStars : real;
}

/** 0.6.1d2 (ARSENAL.md §8.1): a 1px yellow ring, pulsing in brightness, around the deck twin a
 *  hovered or selected shop offer would merge into. */
function drawSurvivorRing(g: G, x: number, y: number, w: number, h: number, t: number): void {
  g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 5));
  frameRect(g, x, y, w, h, C.yellow);
  g.globalAlpha = 1;
}

/** 0.6.1d (ARSENAL.md §8.2): none at ★1, two 2x1 yellow pips at ★2, three plus a 1px gold rim at
 *  ★3. Gates centre them on the bottom row; factories (bottom-left) pass align "left". */
function drawPips(g: G, x: number, y: number, w: number, stars: number, align: "center" | "left" = "center"): void {
  if (stars < 2) return;
  const n = stars >= 3 ? 3 : 2;
  const totalW = n * 2 + (n - 1) * 1;
  let px = align === "center" ? x + Math.max(0, Math.round((w - totalW) / 2)) : x;
  for (let i = 0; i < n; i++) {
    rect(g, px, y, 2, 1, C.yellow);
    px += 3;
  }
}

const SHOCK_PTS = [1, 2, 4, 1, 7, 3, 10, 1, 9, 6, 11, 9, 6, 10, 2, 9, 3, 5];
function shock(g: G, x: number, y: number, t: number): void {
  const fr = Math.floor(t * 14);
  for (let i = 0; i < SHOCK_PTS.length / 2; i++) {
    if ((i + fr) % 3 === 0) rect(g, x + SHOCK_PTS[i * 2], y + SHOCK_PTS[i * 2 + 1], 1, 1, (i + fr) % 2 ? C.white : C.ice);
  }
  if (fr % 4 === 0) g.drawImage(boltIcon(), x + 4, y + 3);
}

export function drawMachinery(g: G, v: CruiserView): void {
  drawIntakes(g, v);
  drawBelts(g, v);
  if (v.ghost) drawGhost(g, v);
  if (v.sim) drawAmmo(g, v);
  drawFactories(g, v);
  drawGates(g, v);
}
