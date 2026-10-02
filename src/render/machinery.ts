// Deck machinery for any facing: turret intakes, conveyor belts (animated by real travel),
// chunky ammunition riding them, factories with output chutes, and processing gates.

import { AMMO, AMMO_SPACING, BELT_SPEED, CELL, GRID } from "../sim/content";
import { DX, DY, defOf, hero, kx, ky, opposite, payloadDamage, routeDirs, type Build, type Dir, type RouteDef } from "../sim/deck";
import { dirBetween } from "../sim/deck"; // 0.6.2j: the pending join's direction
import type { GateState } from "../sim/battle";
import { starsOf } from "../sim/stars";
import type { FactoryState } from "../sim/battle"; // 0.6.1c: read-only render state (frame index)
import { C } from "./palette";
import { frame as frameRect, rect, type G } from "./pixel";
import { drawText } from "./font";
import { footX, footY, localRect, sdir, sx, sy, type Box, type DeckFrame } from "./frame";
import {
  BELT_PERIOD, beltCorner, beltStopper, beltStraight, boltIcon, factoryFlashSil, factorySprite, gateSil,
  gateSprite, rigNozzle, rigTip, speedTint, turntable, wrenchIcon, type ArrowState, type BeltTint,
} from "./sprites";
import { heatTier, payloadHalo, payloadSprite } from "./ammo";
import { raceChuteMouth } from "./raceArt"; // 0.8.0 H1
import type { CruiserView, RigModel } from "./cruiser";

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
const pt = { x: 0, y: 0, ux: 0, uy: -1 };

/** Point at distance s along an axis-aligned polyline, and the unit direction of travel there (writes into `pt`). */
function pointAt(pts: { x: number; y: number }[], s: number): void {
  let rem = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (rem <= len || i === pts.length - 1) {
      const t = len > 0 ? Math.min(1, rem / len) : 0;
      pt.x = a.x + (b.x - a.x) * t;
      pt.y = a.y + (b.y - a.y) * t;
      pt.ux = Math.sign(b.x - a.x);
      pt.uy = Math.sign(b.y - a.y);
      return;
    }
    rem -= len;
  }
  const last = pts[pts.length - 1];
  pt.x = last ? last.x : 0;
  pt.y = last ? last.y : 0;
}

type Variant = "normal" | "warn" | "dead";

function beltCell(g: G, f: DeckFrame, x: number, y: number, din: number, dout: number, phase: number, variant: Variant, tint: BeltTint = "n"): void {
  const si = sdir(f, din), so = sdir(f, dout);
  const fr = ((Math.floor(phase) % BELT_PERIOD) + BELT_PERIOD) % BELT_PERIOD;
  const a = opposite(si as Dir);
  if (a === opposite(so as Dir)) {
    g.drawImage(beltStraight(so, fr, variant, tint), x, y);
  } else {
    g.drawImage(beltCorner(a, so, fr, variant, tint), x, y);
    const right = so === (si + 1) % 4;
    g.drawImage(turntable(Math.floor(phase / 6) * (right ? 1 : -1), variant), x, y);
  }
}

function drawIntakes(g: G, v: CruiserView): void {
  const f = v.frame;
  const h = hero(v.build); // 0.6.2s (REQ-BFG-031 S2): the installed turrets' intakes; an empty slot has none
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

/**
 * 0.6.2p (item 5): the speed state a belt tile's chevrons show. A fixed-speed belt (RouteModel.fixed: SLAG POT's slag)
 * carries payloads that speed rigs, slows and Drag never touch (Battle.transport), so its chevrons run at that fixed
 * speed whatever state the sim (speedAt) or the build preview (speeds) holds for the tile; any other belt shows it (V1).
 */
export function chevronSpeed(speed: number, fixed?: number): number {
  return fixed ?? speed;
}

/** 0.6.2p (item 5): that tile's chevron tint: neutral on a fixed-speed belt (nothing sped it up or slowed it down; its
 *  own pace isn't a slow), else the speed state's tint (sprites.ts speedTint). */
export function chevronTint(speed: number, fixed?: number): BeltTint {
  return fixed !== undefined ? "n" : speedTint(speed);
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
      // V1: the chevrons move at the tile's speed and are tinted by its speed state (the sim's in battle, advanced by
      // Arena into beltPhase; the all-rigs-online preview in the build screen). 0.6.2p (item 5): a fixed-speed belt's
      // chevrons keep its own pace, neutral (chevronSpeed, chevronTint)
      const state = sr ? sr.speedAt[i] : rm.speeds[i];
      const phase = phases ? phases[i] : v.t * BELT_SPEED * chevronSpeed(rm.speeds[i], rm.fixed);
      beltCell(g, f, x, y, rm.din[i], rm.dout[i], phase, variant, chevronTint(state, rm.fixed));
      if (sr && sr.cellDisrupt[i] > 0) shock(g, x, y, v.t);
    }
    if (!rm.connected && !rm.join && rm.cells.length) { // 0.6.2j: a joining belt runs on into its main belt
      const last = rm.cells[rm.cells.length - 1];
      g.drawImage(beltStopper(sdir(f, rm.dout[rm.dout.length - 1])), Math.round(footX(f, kx(last), ky(last))), Math.round(footY(f, kx(last), ky(last))));
    }
  }
  // 0.6.2j (J11): each join, marked on its join tile over the main belt (whose tile keeps its own chevrons and tint);
  // in the build view, a payload pip crosses from the joining belt into it on a loop
  for (let ri = 0; ri < routes.length; ri++) {
    const rm = routes[ri];
    if (!rm.join || ri === v.hideRoute || rm.join.route === v.hideRoute) continue;
    joinMark(g, f, rm.join.cell, rm.join.dir, rm.connected ? C.cyan : C.slate4);
    if (!sim && rm.connected) crossPips(g, v, rm.pts, rm.cells.length * CELL);
  }
}

/**
 * 0.6.2j (J11): the join mark on a join tile: a seam across the edge a joining belt enters by and an arrowhead
 * pointing into the main belt, in `col` (cyan: no rig arrowhead uses it). Drawn in the tile's deck-local pixels with
 * `dir` (the joining belt's direction into the tile) as +u, so it reads the same for every facing.
 */
function joinMark(g: G, f: DeckFrame, cell: number, dir: number, col: string): void {
  const tx = kx(cell) * CELL, ty = ky(cell) * CELL;
  const at = (u: number, v: number, c: string) => {
    const lx = dir === 1 ? tx + u : dir === 3 ? tx + 11 - u : dir === 2 ? tx + 11 - v : tx + v;
    const ly = dir === 1 ? ty + v : dir === 3 ? ty + 11 - v : dir === 2 ? ty + u : ty + 11 - u;
    localRect(f, lx, ly, 1, 1, box);
    rect(g, box.x, box.y, 1, 1, c);
  };
  for (let v = 1; v <= 10; v++) at(0, v, v === 1 || v === 10 ? C.brass3 : col); // the seam, brass rivets at its ends
  for (let v = 2; v <= 9; v++) at(1, v, C.ink);
  for (let v = 3; v <= 8; v++) at(2, v, v === 3 || v === 8 ? C.ink : col); // the arrowhead, ink-rimmed
  for (let v = 4; v <= 7; v++) at(3, v, v === 4 || v === 7 ? C.ink : col);
  at(4, 5, C.ink);
  at(4, 6, C.ink);
}

/** 0.6.2j (J11), build view: two payload pips on a loop from a joining belt's last tile centre into its join tile's
 *  centre (its polyline, `end` px = its end at the join tile's side), so the crossing reads before any battle. */
function crossPips(g: G, v: CruiserView, pts: { x: number; y: number }[], end: number): void {
  const f = v.frame;
  for (let n = 0; n < 2; n++) {
    const ph = (v.t * 0.9 + n / 2) % 1;
    pointAt(pts, end - CELL / 2 + ph * CELL);
    const x = Math.round(sx(f, pt.x, pt.y)) - 2, y = Math.round(sy(f, pt.x, pt.y)) - 2;
    rect(g, x, y, 4, 4, C.ink);
    rect(g, x + 1, y + 1, 2, 2, ph < 0.5 ? C.fire4 : C.bone);
  }
}

function drawGhost(g: G, v: CruiserView): void {
  const gh = v.ghost!;
  if (!gh.cells.length) return;
  const f = v.frame;
  const gr: RouteDef = { factory: gh.factory, cells: gh.cells };
  const tmp: Build = { ...v.build, routes: [...v.build.routes, gr] };
  // 0.6.2j (J11): a pending drag that will join runs its last tile into the join tile and previews the join mark
  const jdir = gh.join !== undefined ? dirBetween(gh.cells[gh.cells.length - 1], gh.join) : -1;
  const link = jdir >= 0 ? { route: -1, tile: -1, cell: gh.join!, dir: jdir as Dir } : undefined;
  const dirs = routeDirs(tmp, gr, gh.connected, link);
  const blink = Math.floor(v.t * 8) % 2 === 1;
  for (let i = 0; i < gh.cells.length; i++) {
    const k = gh.cells[i];
    const x = Math.round(footX(f, kx(k), ky(k))), y = Math.round(footY(f, kx(k), ky(k)));
    beltCell(g, f, x, y, dirs[i].din, dirs[i].dout, v.t * BELT_SPEED * 1.5, gh.connected ? "normal" : "warn");
    frameRect(g, x, y, 12, 12, gh.connected ? C.lime : blink ? C.yellow : C.amber);
  }
  if (link) {
    const x = Math.round(footX(f, kx(link.cell), ky(link.cell))), y = Math.round(footY(f, kx(link.cell), ky(link.cell)));
    joinMark(g, f, link.cell, link.dir, blink ? C.white : C.cyan);
    frameRect(g, x, y, 12, 12, gh.connected ? C.lime : blink ? C.yellow : C.amber);
  }
  // J11: a join the drag was refused: a red cross on that belt tile (the reason is the error the drag showed)
  if (gh.refused) {
    const k = gh.refused.cell;
    const x = Math.round(footX(f, kx(k), ky(k))), y = Math.round(footY(f, kx(k), ky(k)));
    frameRect(g, x, y, 12, 12, C.red);
    for (let i = 2; i <= 9; i++) {
      rect(g, x + i, y + i, 1, 1, C.red);
      rect(g, x + 11 - i, y + i, 1, 1, C.red);
    }
  }
}

/** 0.6.2 BELTSIDE (V2): split copies still closer than AMMO_SPACING ride side by side, up to 3 px either side of
 *  the belt's centre line, easing back into single file as they separate: the pair visibly peels apart. */
const PEEL = 3;
function peel(r: { ammo: { s: number; p: { copy: boolean } }[] }, ai: number): number {
  let off = 0;
  const a = r.ammo[ai], ahead = r.ammo[ai - 1], behind = r.ammo[ai + 1];
  if (ahead && a.p.copy && ahead.p.copy && ahead.s - a.s < AMMO_SPACING) off -= PEEL * (1 - (ahead.s - a.s) / AMMO_SPACING);
  if (behind && a.p.copy && behind.p.copy && a.s - behind.s < AMMO_SPACING) off += PEEL * (1 - (a.s - behind.s) / AMMO_SPACING);
  return Math.round(off);
}

/** Burn: the payload's top rim glows and embers flicker up off it, 2-4 by its stacks, each a bright head with a
 *  cooler tail, yellow to red as it rises. Readable at 12 px cells: every burning payload shows at least two. */
function embers(g: G, x: number, y: number, burn: number, t: number, id: number): void {
  const f = Math.floor(t * 12) + id;
  rect(g, x + 2, y, 3, 1, f % 2 ? C.fire4 : C.fire3); // the hot rim
  const n = burn >= 7 ? 4 : burn >= 4 ? 3 : 2;
  for (let e = 0; e < n; e++) {
    if ((f + e * 2) % 7 === 0) continue; // flicker
    const ph = (t * 2.4 + id * 0.37 + e / n) % 1;
    const ex = x + ((id + e * 2) % 6), ey = y - 1 - Math.floor(ph * 4);
    rect(g, ex, ey, 1, 1, ph < 0.4 ? C.fire5 : ph < 0.75 ? C.fire4 : C.fire3);
    rect(g, ex, ey + 1, 1, 1, ph < 0.5 ? C.fire3 : C.fire2);
  }
}

/** A 3-px zigzag bolt at each corner of the payload's rim: [dx, dy] of its first pixel, then its steps. */
const BOLT_AT: [number, number, number, number][] = [[-2, 0, 1, 1], [7, -1, -1, 1], [8, 5, -1, -1], [-1, 7, 1, -1]];
/** Shock: a blue-white bolt hops around the payload's rim, and the rim itself crackles ice on alternate frames. */
function spark(g: G, x: number, y: number, t: number, id: number): void {
  const f = Math.floor(t * 10) + id;
  const [dx, dy, sx1, sy1] = BOLT_AT[f % 4];
  rect(g, x + dx, y + dy, 1, 1, C.white);
  rect(g, x + dx + sx1, y + dy + sy1, 1, 1, C.ice);
  rect(g, x + dx, y + dy + 2 * sy1, 1, 1, C.white);
  if (f % 2) {
    rect(g, x + 1, y - 1, 5, 1, C.ice);
    rect(g, x + 1, y + 7, 5, 1, C.ice);
    rect(g, x - 1, y + 1, 1, 5, C.ice);
    rect(g, x + 7, y + 1, 1, 5, C.ice);
  }
}

function drawAmmo(g: G, v: CruiserView): void {
  const f = v.frame;
  const sim = v.sim!;
  for (let ri = 0; ri < sim.routes.length; ri++) {
    const r = sim.routes[ri];
    for (let ai = 0; ai < r.ammo.length; ai++) {
      const a = r.ammo[ai];
      // 0.6.2j (J11): a payload that just joined crosses from its joining belt's side to the join tile's centre
      const jr = a.via !== undefined ? sim.routes[a.via] : undefined;
      if (jr?.join && a.s < jr.join.enter + CELL / 2) pointAt(jr.pts, jr.L + a.s - jr.join.enter);
      else pointAt(r.pts, a.s);
      const off = peel(r, ai);
      const lx = pt.x - pt.uy * off, ly = pt.y + pt.ux * off; // perpendicular to the travel
      const x = Math.round(sx(f, lx, ly)) - 3, y = Math.round(sy(f, lx, ly)) - 3;
      const ad = AMMO[a.p.ammo];
      const tier = heatTier(payloadDamage(a.p.base ?? ad.base, ad.rideScale, a.p.ride, a.p.mult, a.p.flat + (a.p.heatBonus ?? 0)));
      // beltside-062c: BELTSIDE's V2 payload with 0.6.1c's preset tint. payloadSprite hands every kind but thread
      // and plain to ammoSprite, so shot, slag and HOT SWAP's ember and spark slugs draw as 0.6.1c draws them; the
      // halo keeps the ammo's colour (a tinted slug is plain ammo, so a spark never gets a fire ring)
      if (tier >= 3) g.drawImage(payloadHalo(a.p.ammo, tier), x - 2, y - 2);
      g.drawImage(payloadSprite(a.p.preset ?? a.p.ammo, tier), x, y); // 0.6.1c: HOT SWAP's ember / spark tint
      if (a.p.burn > 0) embers(g, x, y, a.p.burn, v.t, a.p.id);
      if (a.p.shock) spark(g, x, y, v.t, a.p.id);
      if (a.p.debuffs?.chill) { rect(g, x - 1, y, 2, 2, C.ice); rect(g, x + 6, y + 5, 2, 2, C.ice); }
      if (a.p.debuffs?.snag) rect(g, x - 1, y + 6, 3, 1, C.amber);
      if (a.p.debuffs?.sap) rect(g, x + 5, y - 1, 3, 1, C.verd3);
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
  // 0.6.1c: slag glows; 0.8.0 H1: the CRUCIBLE's molten yellow, the WARDWORKS' rune blue
  const mouth = id === "kiln" || id === "slagpot" ? C.fire2 : id === "loom" ? C.ice : raceChuteMouth(id) ?? C.steel3;
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

/** 0.6.2 BELTSIDE (V3): the look of a rig's arrow k: idle when it reaches no belt; flash while its hit applies;
 *  held while the rig is offline (commissioning or disrupted: R9 stops all its arrows); else live. */
function arrowState(rm: RigModel, k: number, gs: GateState | null): ArrowState {
  if (!rm.hit[k]) return 0;
  if (!gs) return 1; // the build screen: every rig online
  if (gs.arrowFlash[rm.dirs[k]] > 0) return 2;
  return gs.online && gs.disrupted <= 0 ? 1 : 3;
}

function gateStateOf(v: CruiserView, uid: number): GateState | null {
  if (v.sim) for (const q of v.sim.gates) if (q.uid === uid) return q;
  return null;
}

/** V3: every arrow that hits a belt drives its arrowhead into that tile's edge (under the payloads). */
function drawArrowTips(g: G, v: CruiserView): void {
  const f = v.frame;
  for (const p of v.build.items) {
    if (p.uid === v.hideItem) continue;
    const rm = v.model.rigs.get(p.uid);
    if (!rm) continue;
    const gs = gateStateOf(v, p.uid);
    for (let k = 0; k < rm.dirs.length; k++) {
      if (!rm.hit[k]) continue;
      const d = rm.dirs[k], nx = p.x + DX[d], ny = p.y + DY[d];
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      g.drawImage(rigTip(sdir(f, d), arrowState(rm, k, gs)), Math.round(footX(f, nx, ny)), Math.round(footY(f, nx, ny)));
    }
  }
}

/** The rigs (kind "gate"): the body, its arrow nozzles (bright when they work a belt, dim when idle, white on a
 *  hit), then commissioning, disruption, stars and the merge ring. */
function drawRigs(g: G, v: CruiserView): void {
  const f = v.frame;
  const items = v.build.items;
  for (let n = 0; n < items.length; n++) {
    const p = items[n];
    const d = defOf(p);
    if (d.kind !== "gate" || p.uid === v.hideItem) continue;
    const x = Math.round(footX(f, p.x, p.y)), y = Math.round(footY(f, p.x, p.y));
    const gs = gateStateOf(v, p.uid);
    const active = !!gs && gs.flash > 0;
    g.drawImage(gateSprite(d.id, Math.floor(v.t * 8), active), x, y);
    if (d.id === "keg" && gs?.online && !gs.consumed) {
      const full = gs.def.gate?.keg?.fuse ?? 12;
      g.strokeStyle = C.yellow;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x + 6, y + 6, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, gs.fuse / full));
      g.stroke();
    }
    if (active && gs) {
      g.globalAlpha = Math.min(0.7, gs.flash * 4);
      g.drawImage(gateSil(d.id), x, y);
      g.globalAlpha = 1;
    }
    const onRoute = gs ? gs.hits.length > 0 : v.model.gateOnRoute.has(p.uid);
    if (!onRoute || (gs && !gs.online)) {
      g.globalAlpha = 0.55;
      rect(g, x + 1, y + 1, 10, 10, C.ink);
      g.globalAlpha = 1;
    }
    const rm = v.model.rigs.get(p.uid);
    if (rm) for (let k = 0; k < rm.dirs.length; k++) g.drawImage(rigNozzle(sdir(f, rm.dirs[k]), arrowState(rm, k, gs)), x, y);
    if (gs && !gs.online && onRoute && Math.floor(v.t * 6) % 2) g.drawImage(wrenchIcon(), x + 4, y + 3);
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
  drawArrowTips(g, v); // 0.6.2 BELTSIDE: arrowheads on the belt tiles, under the payloads riding past
  if (v.sim) drawAmmo(g, v);
  drawFactories(g, v);
  drawRigs(g, v);
}
