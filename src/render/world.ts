// World renderer: ground, cruisers (hull, treads, deck machinery, ammunition, turrets),
// projectiles, merchant wagons and the dark wind. World origin is the centre of the gap
// between the two cruisers; the player (side 0) is south, the enemy (side 1) north.

import { cellNoise } from "../core/rng";
import { AMMO, BELT_SPEED, CELL, HEROES, ITEMS, type TurretDef } from "../sim/content";
import {
  adjacentToFactory, defOf, kx, ky, opposite, payloadDamage, routeDirs, routeInfo,
  type Build, type Dir, type RouteDef,
} from "../sim/deck";
import type { Battle, Payload, SideState } from "../sim/battle";
import { C, FACTION, RARITY_COLOR } from "./palette";
import {
  ammoSprite, BELT_PERIOD, beltCorner, beltStopper, beltStraight, boltIcon, explosion, factoryFlashSil,
  factorySprite, gateSil, gateSprite, heatTier, HULL_H, HULL_M, hullFlash, hullShade, hullSprite, itemIcon,
  shadowBlob, shellSprite, turntable, turretArt, WAGON_H, WAGON_SLOT_STEP, WAGON_SLOT_X, wagonSprite,
  wrenchIcon,
} from "./sprites";
import { bayer, disc, ellipse, frame, makeCanvas, px, rect, type G } from "./pixel";
import { drawText } from "./font";

export const DECK_X = -60;
export const FWD_Y = 38;

type Side = 0 | 1;

export function cellTL(side: Side, cx: number, cy: number): { x: number; y: number } {
  return side === 0
    ? { x: DECK_X + cx * CELL, y: FWD_Y + cy * CELL }
    : { x: DECK_X + cx * CELL, y: -FWD_Y - (cy + 1) * CELL };
}

export function footTL(side: Side, x: number, y: number, size: number): { x: number; y: number } {
  return side === 0
    ? { x: DECK_X + x * CELL, y: FWD_Y + y * CELL }
    : { x: DECK_X + x * CELL, y: -FWD_Y - (y + size) * CELL };
}

export function l2w(side: Side, lx: number, ly: number): { x: number; y: number } {
  return side === 0 ? { x: DECK_X + lx, y: FWD_Y + ly } : { x: DECK_X + lx, y: -FWD_Y - ly };
}

export function w2cell(side: Side, wx: number, wy: number): { cx: number; cy: number; lx: number; ly: number } {
  const lx = wx - DECK_X;
  const ly = side === 0 ? wy - FWD_Y : -FWD_Y - wy;
  return { cx: Math.floor(lx / CELL), cy: Math.floor(ly / CELL), lx, ly };
}

/** Local deck direction -> screen direction (enemy decks are mirrored vertically). */
export function sdir(side: Side, d: number): number {
  if (side === 0) return d;
  return d === 0 ? 2 : d === 2 ? 0 : d;
}

export function turretPivot(side: Side, t: TurretDef): { x: number; y: number } {
  return l2w(side, (t.col0 + t.width / 2) * CELL, -9);
}

export function hullOrigin(side: Side): { x: number; y: number } {
  return side === 0 ? { x: -72 - HULL_M, y: 20 - HULL_M } : { x: -72 - HULL_M, y: -20 - HULL_H - HULL_M };
}

/** World rect of the whole hull (for hit tests / layout). */
export function hullRect(side: Side): { x: number; y: number; w: number; h: number } {
  return side === 0 ? { x: -72, y: 20, w: 144, h: HULL_H } : { x: -72, y: -20 - HULL_H, w: 144, h: HULL_H };
}

// ------------------------------------------------------------------ ground

let groundTile: HTMLCanvasElement | null = null;
const GT = 128;

function buildGround(): HTMLCanvasElement {
  const [c, g] = makeCanvas(GT, GT);
  // value noise (wrapping) at 16px cells for broad tone patches
  const N = 8;
  const val = (i: number, j: number) => cellNoise(((i % N) + N) % N, ((j % N) + N) % N, 11);
  const tones = [C.soil1, C.soil2, C.soil2, C.soil3];
  for (let y = 0; y < GT; y++) {
    for (let x = 0; x < GT; x++) {
      const fx = x / 16, fy = y / 16;
      const i = Math.floor(fx), j = Math.floor(fy);
      const tx = fx - i, ty = fy - j;
      const a = val(i, j), b = val(i + 1, j), cc = val(i, j + 1), d = val(i + 1, j + 1);
      const v = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty;
      const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const th = BAY[(y & 3) * 4 + (x & 3)] / 16;
      const idx = Math.min(3, Math.floor(v * 3.2 + th * 0.9));
      px(g, x, y, tones[idx]);
    }
  }
  // pebbles and stones
  for (let k = 0; k < 70; k++) {
    const x = Math.floor(cellNoise(k, 1, 5) * GT), y = Math.floor(cellNoise(k, 2, 5) * GT);
    const big = cellNoise(k, 3, 5) > 0.82;
    if (big) {
      ellipse(g, x + 0.5, y + 1.5, 3, 2, C.soil0);
      ellipse(g, x, y + 0.5, 3, 2, C.soil4);
      px(g, x - 1, y - 1, C.soil5);
    } else {
      px(g, x, y + 1, C.soil0);
      px(g, x, y, cellNoise(k, 4, 5) > 0.5 ? C.soil4 : C.soil5);
    }
  }
  // cracks
  for (let k = 0; k < 9; k++) {
    let x = Math.floor(cellNoise(k, 7, 9) * GT), y = Math.floor(cellNoise(k, 8, 9) * GT);
    for (let s = 0; s < 14; s++) {
      px(g, ((x % GT) + GT) % GT, ((y % GT) + GT) % GT, C.soil0);
      const r = cellNoise(k, s, 13);
      if (r < 0.4) x++;
      else if (r < 0.7) y++;
      else { x++; y--; }
    }
  }
  // scrub tufts
  for (let k = 0; k < 16; k++) {
    const x = Math.floor(cellNoise(k, 21, 3) * (GT - 4)), y = Math.floor(cellNoise(k, 22, 3) * (GT - 4));
    px(g, x + 1, y + 2, C.soil0);
    px(g, x, y + 1, C.scrub0);
    px(g, x + 1, y, C.scrub1);
    px(g, x + 2, y + 1, C.scrub0);
    px(g, x + 1, y + 1, C.scrub1);
  }
  return c;
}

/** ox, oy: screen position of world origin. scroll: ground travel (px, grows southward). */
export function drawGround(g: G, ox: number, oy: number, W: number, H: number, scroll: number): void {
  if (!groundTile) groundTile = buildGround();
  const sx = ((Math.round(ox) % GT) + GT) % GT;
  const sy = ((Math.round(oy + scroll) % GT) + GT) % GT;
  for (let y = sy - GT; y < H; y += GT) {
    for (let x = sx - GT; x < W; x += GT) g.drawImage(groundTile, x, y);
  }
  // tread tracks through the whole field
  for (const tx of [-67, 66]) {
    const x = Math.round(ox + tx);
    rect(g, x - 1, 0, 9, H, C.soil1);
    const off = Math.round(oy + scroll);
    for (let y = ((off % 4) + 4) % 4 - 4; y < H; y += 4) rect(g, x, y, 7, 1, C.soil0);
  }
}

/** Soft dithered cloud shadows drifting over the field. */
export function drawCloudShadows(g: G, W: number, H: number, t: number): void {
  for (let k = 0; k < 3; k++) {
    const w = 120 + k * 40, h = 60 + k * 14;
    const x = ((t * (6 + k * 2) + k * 260) % (W + w * 2)) - w;
    const y = ((k * 173) % Math.max(1, H)) - h / 3;
    g.fillStyle = C.soil0;
    for (let j = 0; j < h; j += 1) {
      const dy = (j - h / 2) / (h / 2);
      const half = Math.sqrt(Math.max(0, 1 - dy * dy)) * (w / 2);
      const x0 = Math.round(x + w / 2 - half), x1 = Math.round(x + w / 2 + half);
      for (let i = x0; i < x1; i++) if (((i + j) & 1) === 0 && ((i >> 1) + j) % 3 !== 0) g.fillRect(i, Math.round(y + j), 1, 1);
    }
  }
}

// ------------------------------------------------------------------ cruiser

export interface CruiserView {
  side: Side;
  build: Build;
  sim?: SideState;
  simT?: number; // battle clock
  t: number;
  treadPhase: number;
  highlightConnectors?: number[];
  ghost?: { factory: number; cells: number[]; connected: boolean; valid: boolean } | null;
  hideRoute?: number;
  hideItem?: number;
  dimAll?: boolean;
}

function prepSpeedProfile(b: Build, r: RouteDef, ri: number): number[] {
  const info = routeInfo(b, ri);
  const speeds: number[] = [];
  let st = 1;
  const at = new Map<number, number>();
  info.gateCells.forEach((ci, gi) => at.set(ci, info.gates[gi]));
  for (let i = 0; i < r.cells.length; i++) {
    const uid = at.get(i);
    if (uid !== undefined) {
      const p = b.items.find((q) => q.uid === uid);
      const sp = p ? ITEMS[p.def].gate?.speed : undefined;
      if (sp) st = sp;
    }
    speeds.push(st);
  }
  return speeds;
}

function drawTread(g: G, x: number, y: number, h: number, phase: number): void {
  rect(g, x, y, 9, h, C.ink);
  const p = Math.round(phase);
  for (let j = 0; j < h; j++) {
    const m = (((j + p) % 4) + 4) % 4;
    const col = m === 0 ? C.steel2 : m === 1 ? C.steel1 : m === 2 ? C.steel0 : null;
    if (col) rect(g, x + 1, y + j, 7, 1, col);
  }
  rect(g, x + 4, y, 1, h, C.ink);
  // sprockets
  for (const yy of [y + 2, y + h - 7]) {
    disc(g, x + 4.5, yy + 2.5, 3, C.ink);
    disc(g, x + 4.5, yy + 2.5, 2, C.steel1);
    px(g, x + 3, yy + 1, C.steel3);
  }
}

function drawBeltCell(
  g: G, side: Side, x: number, y: number, dinLocal: number, doutLocal: number, phase: number,
  variant: "normal" | "warn" | "dead",
): void {
  const din = sdir(side, dinLocal), dout = sdir(side, doutLocal);
  const f = Math.floor(phase) % BELT_PERIOD;
  const a = opposite(din as Dir); // side the belt enters through
  if (a === opposite(dout as Dir)) {
    g.drawImage(beltStraight(dout, f, variant), x, y);
  } else {
    g.drawImage(beltCorner(a, dout, f, variant), x, y);
    // turntable spins with belt travel; direction by turn handedness
    const right = dout === (din + 1) % 4;
    const ang = Math.floor(phase / 6) * (right ? 1 : -1);
    g.drawImage(turntable(ang, variant), x, y);
  }
}

function payloadColor(p: Payload): string {
  if (p.ammo === "thread") return C.ice;
  if (p.ammo === "plain") return C.steel2;
  const a = AMMO[p.ammo];
  const d = payloadDamage(a.base, a.rideScale, p.ride, p.mult, p.flat);
  return [C.steel1, C.rust3, C.fire2, C.fire3, C.fire4][heatTier(d)];
}

export function drawCruiser(g: G, v: CruiserView, ox: number, oy: number): void {
  const { side, build, sim, t } = v;
  const h = HEROES[build.hero];
  const facing: 0 | 2 = side === 0 ? 0 : 2;
  const P = FACTION[h.faction];
  const ho = hullOrigin(side);
  const hx = Math.round(ox + ho.x), hy = Math.round(oy + ho.y);
  g.drawImage(hullSprite(h.faction, facing), hx, hy);
  if (sim && sim.hull.flash > 0) {
    g.globalAlpha = Math.min(0.85, sim.hull.flash * 8);
    g.drawImage(hullFlash(h.faction, facing), hx, hy);
    g.globalAlpha = 1;
  }
  // treads
  const ty = side === 0 ? 30 : -162;
  drawTread(g, Math.round(ox - 71), Math.round(oy + ty), 132, v.treadPhase);
  drawTread(g, Math.round(ox + 62), Math.round(oy + ty), 132, v.treadPhase);

  // connectors (turret intakes) on the forward edge
  const occupiedCols = new Set<number>();
  if (sim) sim.routes.forEach((r) => { if (r.connected) occupiedCols.add(kx(r.cells[r.cells.length - 1])); });
  else build.routes.forEach((_, i) => { const info = routeInfo(build, i); if (info.connected) occupiedCols.add(info.connector); });
  for (const tu of h.turrets) {
    for (const col of tu.connectors) {
      const wx = Math.round(ox + DECK_X + col * CELL + 2);
      const wy = Math.round(oy + (side === 0 ? FWD_Y - 3 : -FWD_Y - 2));
      rect(g, wx, wy, 8, 5, C.ink);
      rect(g, wx + 1, wy + 1, 6, 3, P.trim1);
      rect(g, wx + 2, side === 0 ? wy + 2 : wy + 1, 4, 2, C.ink);
      const hl = v.highlightConnectors?.includes(col);
      const lamp = occupiedCols.has(col) ? C.lime : hl ? (Math.floor(t * 6) % 2 ? C.yellow : C.amber) : C.slate2;
      px(g, wx + 7, side === 0 ? wy + 1 : wy + 3, lamp);
      if (hl && !occupiedCols.has(col)) {
        frame(g, wx - 1, wy - 1, 10, 7, Math.floor(t * 6) % 2 ? C.yellow : C.amber);
      }
    }
  }

  // belts
  if (sim) {
    for (const r of sim.routes) {
      const dirs = routeDirs(build, build.routes[r.index], r.connected);
      const warnCells = new Set<number>();
      for (const a of r.ammo) if (a.blocked) warnCells.add(Math.min(r.cells.length - 1, Math.floor(a.s / CELL)));
      r.cells.forEach((k, i) => {
        const tl = cellTL(side, kx(k), ky(k));
        const variant = !r.connected ? "dead" : warnCells.has(i) && r.pressure >= 2 ? "warn" : "normal";
        drawBeltCell(g, side, Math.round(ox + tl.x), Math.round(oy + tl.y), dirs[i].din, dirs[i].dout, r.phase[i], variant);
        if (r.cellDisrupt[i] > 0) drawShockOverlay(g, Math.round(ox + tl.x), Math.round(oy + tl.y), t);
      });
      if (!r.connected && r.cells.length) {
        const last = r.cells[r.cells.length - 1];
        const tl = cellTL(side, kx(last), ky(last));
        g.drawImage(beltStopper(sdir(side, dirs[dirs.length - 1].dout)), Math.round(ox + tl.x), Math.round(oy + tl.y));
      }
    }
  } else {
    build.routes.forEach((r, ri) => {
      if (ri === v.hideRoute) return;
      const info = routeInfo(build, ri);
      const dirs = routeDirs(build, r, info.connected);
      const speeds = prepSpeedProfile(build, r, ri);
      r.cells.forEach((k, i) => {
        const tl = cellTL(side, kx(k), ky(k));
        const phase = t * BELT_SPEED * speeds[i];
        drawBeltCell(g, side, Math.round(ox + tl.x), Math.round(oy + tl.y), dirs[i].din, dirs[i].dout, phase, info.connected ? "normal" : "dead");
      });
      if (!info.connected && r.cells.length) {
        const last = r.cells[r.cells.length - 1];
        const tl = cellTL(side, kx(last), ky(last));
        g.drawImage(beltStopper(sdir(side, dirs[dirs.length - 1].dout)), Math.round(ox + tl.x), Math.round(oy + tl.y));
      }
    });
  }
  // ghost route being drawn
  if (v.ghost && v.ghost.cells.length) {
    const gr: RouteDef = { factory: v.ghost.factory, cells: v.ghost.cells };
    const tmp: Build = { ...build, routes: [...build.routes, gr] };
    const dirs = routeDirs(tmp, gr, v.ghost.connected);
    gr.cells.forEach((k, i) => {
      const tl = cellTL(side, kx(k), ky(k));
      drawBeltCell(g, side, Math.round(ox + tl.x), Math.round(oy + tl.y), dirs[i].din, dirs[i].dout, t * BELT_SPEED * 1.5, v.ghost!.connected ? "normal" : "warn");
    });
    const blink = Math.floor(t * 8) % 2;
    gr.cells.forEach((k) => {
      const tl = cellTL(side, kx(k), ky(k));
      frame(g, Math.round(ox + tl.x), Math.round(oy + tl.y), 12, 12, v.ghost!.connected ? C.lime : blink ? C.yellow : C.amber);
    });
  }

  // ammunition on belts
  if (sim) {
    for (const r of sim.routes) {
      for (const a of r.ammo) {
        const lp = pointAtPts(r.pts, a.s);
        const w = l2w(side, lp.x, lp.y);
        const x = Math.round(ox + w.x - 2), y = Math.round(oy + w.y - 2);
        const ad = AMMO[a.p.ammo];
        const dmg = payloadDamage(ad.base, ad.rideScale, a.p.ride, a.p.mult, a.p.flat);
        const tier = a.p.ammo === "cinder" ? heatTier(dmg) : 0;
        if (tier >= 3) {
          g.globalAlpha = 0.5;
          disc(g, x + 2.5, y + 2.5, 4, tier >= 4 ? C.fire3 : C.fire2);
          g.globalAlpha = 1;
        }
        g.drawImage(ammoSprite(a.p.ammo, tier), x, y);
        if (a.p.burn > 0 && Math.floor(t * 10 + a.p.id) % 2) px(g, x + 2, y - 1, C.fire4);
        if (a.p.shock && Math.floor(t * 12 + a.p.id) % 3 === 0) px(g, x + 5, y + 1, C.ice);
      }
    }
  }

  // factories and output chutes
  for (const p of build.items) {
    const d = defOf(p);
    if (d.kind !== "factory" || p.uid === v.hideItem) continue;
    const tl = footTL(side, p.x, p.y, d.size);
    const fx = Math.round(ox + tl.x), fy = Math.round(oy + tl.y);
    const fs = sim?.factories.find((f) => f.uid === p.uid);
    const flash = !!fs && fs.flash > 0;
    const frameIdx = d.id === "loom" ? Math.floor(t * 9) : d.id === "press" ? (fs ? (flash ? 0 : 1) : Math.floor(t * 2)) : Math.floor(t * 7);
    g.drawImage(factorySprite(d.id, frameIdx, flash), fx, fy);
    if (flash && fs) {
      g.globalAlpha = Math.min(0.6, fs.flash * 3);
      g.drawImage(factoryFlashSil(d.id), fx, fy);
      g.globalAlpha = 1;
    }
    // output chutes
    build.routes.forEach((r, ri) => {
      if (r.factory !== p.uid || !r.cells.length || ri === v.hideRoute) return;
      drawChute(g, side, build, r, ox, oy, d.id);
    });
    if (v.ghost && v.ghost.factory === p.uid && v.ghost.cells.length) {
      drawChute(g, side, build, { factory: p.uid, cells: v.ghost.cells }, ox, oy, d.id);
    }
    if (fs && fs.disrupted > 0) drawShockOverlay(g, fx + 6, fy + 6, t);
    if (fs && fs.stalled && Math.floor(t * 4) % 2) drawText(g, "!", fx + 22, fy - 2, C.yellow, { outline: C.ink });
  }

  // gates
  for (const p of build.items) {
    const d = defOf(p);
    if (d.kind !== "gate" || p.uid === v.hideItem) continue;
    const tl = footTL(side, p.x, p.y, 1);
    const gx = Math.round(ox + tl.x), gy = Math.round(oy + tl.y);
    const gs = sim?.gates.find((q) => q.uid === p.uid);
    const active = !!gs && gs.flash > 0;
    g.drawImage(gateSprite(d.id, Math.floor(t * 8), active), gx, gy);
    if (active && gs) {
      g.globalAlpha = Math.min(0.7, gs.flash * 4);
      g.drawImage(gateSil(d.id), gx, gy);
      g.globalAlpha = 1;
    }
    const onRoute = gs ? gs.route >= 0 : build.routes.some((r) => r.cells.some((k) => kx(k) === p.x && ky(k) === p.y));
    if (!onRoute) {
      // disconnected gate: dimmed
      g.globalAlpha = 0.55;
      rect(g, gx + 1, gy + 1, 10, 10, C.ink);
      g.globalAlpha = 1;
    } else if (gs && !gs.online) {
      g.globalAlpha = 0.5;
      rect(g, gx + 1, gy + 1, 10, 10, C.ink);
      g.globalAlpha = 1;
      const left = Math.max(0, gs.commissionAt - (v.simT ?? 0));
      if (Math.floor(t * 6) % 2 || left < 0.3) g.drawImage(wrenchIcon(), gx + 4, gy + 3);
    }
    if (gs && gs.disrupted > 0) drawShockOverlay(g, gx, gy, t);
  }

  // turrets
  h.turrets.forEach((td, i) => {
    const art = turretArt(td.kind, h.faction, facing);
    const pv = turretPivot(side, td);
    const bx = Math.round(ox + pv.x - art.px), by = Math.round(oy + pv.y - art.py);
    const ts = sim?.turrets[i];
    g.drawImage(art.base, bx, by);
    const rec = ts ? Math.round(ts.recoil * (td.kind === "heavy" ? 4 : 2)) : 0;
    g.drawImage(art.barrel, bx, by + (side === 0 ? rec : -rec));
    // chamber pips
    const window = td.window;
    const pipX = Math.round(ox + pv.x + (td.kind === "heavy" ? 13 : 8));
    for (let k = 0; k < window; k++) {
      const pyy = Math.round(oy + pv.y + (side === 0 ? -4 + k * 4 : 1 - k * 4));
      rect(g, pipX, pyy, 4, 4, C.ink);
      const loaded = ts ? ts.stack[k] : undefined;
      rect(g, pipX + 1, pyy + 1, 2, 2, loaded ? payloadColor(loaded) : C.slate1);
    }
    if (ts && ts.phase === "fire" && Math.floor(t * 10) % 2) {
      px(g, pipX + 4, Math.round(oy + pv.y + (side === 0 ? -5 : 5)), C.red);
    }
    if (ts && ts.disrupted > 0) drawShockOverlay(g, Math.round(ox + pv.x - 6), Math.round(oy + pv.y - 6), t);
    if (ts && ts.jamFx > 0) {
      const jy = Math.round(oy + pv.y + (side === 0 ? -16 : 12));
      if (Math.floor(t * 8) % 2) drawText(g, "JAM!", Math.round(ox + pv.x), jy, C.red, { font: "3", align: "center", outline: C.ink });
    }
    // mods fitted
    const mods = build.mods.filter((m) => m.turret === i);
    mods.forEach((m, mi) => {
      const icon = itemIcon(m.def);
      const ix = Math.round(ox + pv.x - (td.kind === "heavy" ? 22 : 15) - mi * 7);
      const iy = Math.round(oy + pv.y - 3);
      g.drawImage(icon, 0, 0, 12, 12, ix, iy, 6, 6);
    });
  });

  if (v.dimAll) {
    g.globalAlpha = 0.35;
    g.drawImage(hullShade(h.faction, facing), hx, hy);
    g.globalAlpha = 1;
  }
}

function drawChute(g: G, side: Side, b: Build, r: RouteDef, ox: number, oy: number, id: string): void {
  const k0 = r.cells[0];
  const d = adjacentToFactory(b, r.factory, k0);
  if (d < 0) return;
  const tl = cellTL(side, kx(k0), ky(k0));
  const sd = sdir(side, opposite(d as Dir)); // edge of first cell touching the factory
  const x = Math.round(ox + tl.x), y = Math.round(oy + tl.y);
  const mouth = id === "kiln" ? C.fire2 : id === "loom" ? C.ice : C.steel2;
  if (sd === 0 || sd === 2) {
    const yy = sd === 0 ? y - 2 : y + 9;
    rect(g, x + 2, yy, 8, 5, C.ink);
    rect(g, x + 3, yy + 1, 6, 3, C.steel1);
    rect(g, x + 4, yy + (sd === 0 ? 2 : 1), 4, 1, mouth);
  } else {
    const xx = sd === 3 ? x - 2 : x + 9;
    rect(g, xx, y + 2, 5, 8, C.ink);
    rect(g, xx + 1, y + 3, 3, 6, C.steel1);
    rect(g, xx + (sd === 3 ? 2 : 1), y + 4, 1, 4, mouth);
  }
}

function drawShockOverlay(g: G, x: number, y: number, t: number): void {
  const f = Math.floor(t * 14);
  const pts = [[1, 2], [4, 1], [7, 3], [10, 1], [9, 6], [11, 9], [6, 10], [2, 9], [3, 5]];
  for (let i = 0; i < pts.length; i++) {
    if ((i + f) % 3 === 0) px(g, x + pts[i][0], y + pts[i][1], (i + f) % 2 ? C.white : C.ice);
  }
  if (f % 4 === 0) g.drawImage(boltIcon(), x + 4, y + 3);
}

function pointAtPts(pts: { x: number; y: number }[], s: number): { x: number; y: number } {
  let rem = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (rem <= len || i === pts.length - 1) {
      const tt = len > 0 ? Math.min(1, rem / len) : 0;
      return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
    }
    rem -= len;
  }
  return pts[pts.length - 1] ?? { x: 0, y: 0 };
}

// ------------------------------------------------------------------ projectiles

export function projectileWorld(b: Battle, pr: Battle["projectiles"][number]): { x: number; y: number; z: number; sx: number; sy: number; tx: number; ty: number } {
  const from = b.sides[pr.from];
  const td = from.hero.turrets[pr.turret];
  const pv = turretPivot(pr.from, td);
  const tip = td.kind === "heavy" ? 20 : 15;
  const sx = pv.x + (td.kind === "heavy" ? (pr.id % 2 ? -3 : 3) : 0);
  const sy = pv.y + (pr.from === 0 ? -tip : tip);
  const tgtSide: Side = pr.from === 0 ? 1 : 0;
  const tw = l2w(tgtSide, pr.tx, pr.ty);
  const k = Math.min(1, pr.t / pr.flight);
  const x = sx + (tw.x - sx) * k;
  const y = sy + (tw.y - sy) * k;
  const z = pr.heavy ? Math.sin(k * Math.PI) * 16 : 0;
  return { x, y, z, sx, sy, tx: tw.x, ty: tw.y };
}

export function drawProjectiles(g: G, b: Battle, ox: number, oy: number): void {
  for (const pr of b.projectiles) {
    const w = projectileWorld(b, pr);
    const facing: 0 | 2 = pr.from === 0 ? 0 : 2;
    const ad = AMMO[pr.payload.ammo];
    const dmg = payloadDamage(ad.base, ad.rideScale, pr.payload.ride, pr.payload.mult, pr.payload.flat);
    const tier = pr.payload.ammo === "cinder" ? heatTier(dmg) : 0;
    if (pr.heavy) {
      const sh = shadowBlob(6);
      g.globalAlpha = 0.5;
      g.drawImage(sh, Math.round(ox + w.x - 3), Math.round(oy + w.y + 2));
      g.globalAlpha = 1;
    }
    const img = shellSprite(pr.payload.ammo, tier, facing);
    g.drawImage(img, Math.round(ox + w.x - img.width / 2), Math.round(oy + w.y - w.z - img.height / 2));
  }
}

// ------------------------------------------------------------------ wagons

export interface WagonView {
  merchant: string;
  name: string;
  x: number; // world top-left
  y: number;
  open: number; // 0..1
  wheel: number;
  offers: { def: string; price: number; sold: boolean; affordable: boolean }[];
  selected: number; // offer index or -1
  hover: number;
  hideOffer: number;
}

export function wagonSlotRect(w: { x: number; y: number }, i: number): { x: number; y: number; w: number; h: number } {
  return { x: w.x + WAGON_SLOT_X + i * WAGON_SLOT_STEP, y: w.y + 4, w: 12, h: 18 };
}

export function drawWagon(g: G, w: WagonView, ox: number, oy: number, t: number): void {
  const x = Math.round(ox + w.x), y = Math.round(oy + w.y);
  // ground shadow
  g.globalAlpha = 0.45;
  rect(g, x + 2, y + WAGON_H - 1, 60, 2, C.ink);
  g.globalAlpha = 1;
  g.drawImage(wagonSprite(w.merchant, w.open, w.wheel), x, y);
  if (w.open > 0.8) {
    w.offers.forEach((o, i) => {
      const r = wagonSlotRect({ x, y }, i);
      if (o.sold) {
        rect(g, r.x + 1, r.y + 2, 10, 10, C.wood1);
        drawText(g, "x", r.x + 6, r.y + 4, C.maroon, { font: "3", align: "center" });
        return;
      }
      if (i === w.hideOffer) return;
      const d = ITEMS[o.def];
      const bob = i === w.selected ? (Math.floor(t * 4) % 2 ? -1 : 0) : 0;
      // rarity mat under the item
      rect(g, r.x - 1, r.y + 1 + bob, 14, 13, C.ink);
      rect(g, r.x, r.y + 2 + bob, 12, 11, C.wood1);
      hline2(g, r.x, r.y + 12 + bob, 12, RARITY_COLOR[d.rarity]);
      g.drawImage(itemIcon(o.def), r.x, r.y + 1 + bob);
      // price tag
      const pc = o.affordable ? C.yellow : C.red;
      drawText(g, String(o.price), r.x + 6, r.y + 14, pc, { font: "3", align: "center", outline: C.ink });
      if (i === w.selected) frame(g, r.x - 2, r.y + bob, 16, 15, Math.floor(t * 6) % 2 ? C.white : C.yellow);
      else if (i === w.hover) frame(g, r.x - 2, r.y, 16, 15, C.bone);
    });
  }
  drawText(g, w.name, x + 38, y - 7, C.bone, { font: "3", align: "center", outline: C.ink });
}

function hline2(g: G, x: number, y: number, w: number, c: string): void {
  rect(g, x, y, w, 1, c);
}

// ------------------------------------------------------------------ dark wind

export function drawWind(g: G, level: number, W: number, H: number, t: number): void {
  if (level <= 0) return;
  // global tint
  g.globalAlpha = Math.min(0.32, level * 0.32);
  rect(g, 0, 0, W, H, C.plum0);
  g.globalAlpha = 1;
  // storm front from the west
  const front = level * W * 0.42;
  for (let y = 0; y < H; y += 2) {
    const wob = Math.sin(y * 0.07 + t * 1.3) * 7 + Math.sin(y * 0.19 - t * 2.3) * 3;
    const fx = Math.max(0, Math.round(front + wob));
    if (fx <= 0) continue;
    g.globalAlpha = 0.55;
    rect(g, 0, y, fx, 2, C.plum0);
    g.globalAlpha = 1;
    bayer(g, fx - 10, y, 10, 2, C.plum1, 0.5, 0, y);
    bayer(g, fx - 4, y, 6, 2, C.plum2, 0.35, 1, y);
  }
  // streaks
  const n = Math.floor(10 + level * 40);
  for (let k = 0; k < n; k++) {
    const speed = 90 + (k % 7) * 20;
    const span = front + 60;
    const x = ((k * 97 + t * speed) % span) - 30;
    const y = (k * 53 + Math.sin(t + k) * 10) % H;
    const col = k % 3 === 0 ? C.plum4 : C.plum3;
    rect(g, Math.round(x), Math.round(y), 5 + (k % 4), 1, col);
  }
}

export { explosion };
