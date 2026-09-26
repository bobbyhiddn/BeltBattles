// Cruiser renderer for any facing: hull + animated tracks, then deck machinery (belts,
// ammunition, factories, gates) and turrets with wind-up glow and recoil. Static route
// geometry is precomputed once per build in a CruiserModel so drawing never allocates.

import { settings } from "../core/settings";
import { ITEMS, type HeroId, type TurretDef } from "../sim/content";
import {
  adjacentToFactory, arrowsOf, hero, hitsOfRig, itemByUid, rigHits, routeDirs, routeInfo, routePolyline, speedWinner,
  turretSlots, type Build, type Dir,
} from "../sim/deck";
import { effectAt } from "../sim/stars"; // 0.6.2 BELTSIDE: preview speeds at the rig's stars
import { speedLocked } from "../sim/races/metronome"; // races: METRONOME belts ignore speed states
import { C } from "./palette";
import { disc, type G } from "./pixel";
import { HULL_L, TURRET_LY, hullBox, sx, sy, turnX, turnY, type Box, type DeckFrame } from "./frame";
import { HULL_M, TREAD_HX, TREAD_HY0, TREAD_LEN, TREAD_W, hullFlash, hullRim, hullShade, hullSprite, treadStrip } from "./hull";
import { CRYSTAL_RAMP, HEAT_RAMP, TS, TURRET_TIP, glowRect, turretArt } from "./turret";
import { coreFor } from "../sim/deck"; // 0.6.1b: the core socket
import { starsOf } from "../sim/stars"; // 0.6.1b
import { gemColor } from "./coreArt"; // 0.6.1b
import { gearStats, turretAt } from "../sim/battle"; // 0.6.1p: the gear's window slots (EXT. CHAMBER, HOPPER); 0.6.2s: by slot

/** 0.6.1p: the hardpoint box colour per gear (catalogue.json art); anything else keeps 0.6.0's cyan. */
const GEAR_BOX: Record<string, string> = { chamber: C.lime, hopper: C.brass3, mantlet: C.steel3, ram: C.red };

export interface RouteModel {
  index: number;
  factory: number;
  cells: number[];
  din: Int8Array;
  dout: Int8Array;
  speeds: Float32Array; // speed state per cell with every rig online (build preview; 0.6.2: R7 per tile, at stars)
  connected: boolean;
  pts: { x: number; y: number }[];
  d0: number; // local dir from the factory into the first cell (-1 if detached)
}

/** 0.6.2 BELTSIDE: a placed rig's arrows (local dirs, shape order) and whether each lands on a belt tile. */
export interface RigModel {
  dirs: Dir[];
  hit: boolean[];
}

export interface CruiserModel {
  hero: HeroId;
  routes: RouteModel[];
  connectedCols: Set<number>;
  gateOnRoute: Set<number>; // rigs with at least one hit (the others are IDLE)
  rigs: Map<number, RigModel>; // 0.6.2 BELTSIDE: by rig uid
}

export function cruiserModel(b: Build): CruiserModel {
  const connectedCols = new Set<number>();
  const gateOnRoute = new Set<number>();
  const hits = rigHits(b);
  const locked = speedLocked(b.hero); // races: METRONOME belts ignore speed states
  const routes = b.routes.map((r, i): RouteModel => {
    const info = routeInfo(b, i, undefined, undefined, hits);
    if (info.connected) connectedCols.add(info.connector);
    for (const uid of info.gates) gateOnRoute.add(uid);
    const dirs = routeDirs(b, r, info.connected);
    const speeds = new Float32Array(r.cells.length);
    let st = 1;
    for (let c = 0; c < r.cells.length; c++) {
      // R7 item 4: the tile's biggest speed change wins from here downstream (deck.ts speedWinner)
      const won = locked ? undefined : speedWinner((hits[i]?.[c] ?? []).map((h) => effectAt(h.def, starsOf(itemByUid(b, h.uid))).gate?.speed ?? 0));
      if (won !== undefined) st = won;
      speeds[c] = st;
    }
    return {
      index: i, factory: r.factory, cells: [...r.cells], connected: info.connected, speeds,
      din: Int8Array.from(dirs.map((d) => d.din)), dout: Int8Array.from(dirs.map((d) => d.dout)),
      pts: routePolyline(b, r, info.connected), d0: r.cells.length ? adjacentToFactory(b, r.factory, r.cells[0]) : -1,
    };
  });
  const rigs = new Map<number, RigModel>();
  for (const p of b.items) {
    if (ITEMS[p.def]?.kind !== "gate") continue;
    const dirs = arrowsOf(p);
    const mine = hitsOfRig(b, p.uid, hits);
    rigs.set(p.uid, { dirs, hit: dirs.map((d) => mine.some((h) => h.dir === d)) });
  }
  return { hero: b.hero, routes, connectedCols, gateOnRoute, rigs };
}

export interface CruiserView {
  side: 0 | 1;
  build: Build;
  model: CruiserModel;
  frame: DeckFrame;
  sim?: import("../sim/battle").SideState;
  simT?: number;
  t: number; // animation clock (s)
  tread: number; // track travel (px)
  beltPhase?: Float32Array[]; // per route, per cell belt travel (battle playback)
  windup?: Float32Array; // per turret 0..1
  recoil?: Float32Array; // per turret px
  flash?: number; // hull hit flash 0..1
  highlightConnectors?: number[];
  ghost?: { factory: number; cells: number[]; connected: boolean } | null;
  hideRoute?: number;
  hideItem?: number;
}

const box: Box = { x: 0, y: 0, w: 0, h: 0 };

/** Hull-local rect -> screen, for a hull whose box starts at (bx, by). */
function hrect(f: DeckFrame, bx: number, by: number, hx: number, hy: number, w: number, h: number): Box {
  const L = HULL_L;
  switch (f.facing) {
    case 0: box.x = bx + hx; box.y = by + hy; box.w = w; box.h = h; break;
    case 2: box.x = bx + hx; box.y = by + L - hy - h; box.w = w; box.h = h; break;
    case 1: box.x = bx + L - hy - h; box.y = by + hx; box.w = h; box.h = w; break;
    default: box.x = bx + hy; box.y = by + hx; box.w = h; box.h = w;
  }
  return box;
}

function sprocket(g: G, f: DeckFrame, bx: number, by: number, hx: number, hy: number, tread: number): void {
  const s = hrect(f, bx, by, hx, hy, 1, 1);
  disc(g, s.x + 0.5, s.y + 0.5, 3.6, C.ink);
  disc(g, s.x + 0.5, s.y + 0.5, 2.6, C.steel1);
  const a = tread * 0.25;
  g.fillStyle = C.steel3;
  g.fillRect(Math.round(s.x + Math.cos(a) * 1.5), Math.round(s.y + Math.sin(a) * 1.5), 1, 1);
}

export function drawHull(g: G, v: CruiserView): void {
  const f = v.frame;
  const hb = hullBox(f);
  const bx = Math.round(hb.x), by = Math.round(hb.y);
  g.drawImage(hullSprite(v.model.hero, f.facing), bx - HULL_M, by - HULL_M);
  // animated tracks: one blit per track from a pre-rendered strip
  const vertical = f.facing === 0 || f.facing === 2;
  const strip = treadStrip(vertical);
  const off = ((Math.floor(v.tread) % 4) + 4) % 4;
  const so = f.facing === 0 || f.facing === 3 ? off : 3 - off;
  for (let k = 0; k < TREAD_HX.length; k++) {
    const tx = TREAD_HX[k];
    const r = hrect(f, bx, by, tx + 1, TREAD_HY0, TREAD_W - 2, TREAD_LEN);
    if (vertical) g.drawImage(strip, 0, so, r.w, r.h, r.x, r.y, r.w, r.h);
    else g.drawImage(strip, so, 0, r.w, r.h, r.x, r.y, r.w, r.h);
    sprocket(g, f, bx, by, tx + 5, TREAD_HY0 + 3, v.tread);
    sprocket(g, f, bx, by, tx + 5, TREAD_HY0 + TREAD_LEN - 4, v.tread);
  }
  // hit flash: a white rim for the first frames after an impact, plus a faint wash
  if (v.flash && v.flash > 0.05 && !settings.reducedMotion) {
    g.drawImage(hullRim(v.model.hero, f.facing), bx - HULL_M, by - HULL_M);
    g.globalAlpha = 0.12;
    g.drawImage(hullFlash(v.model.hero, f.facing), bx - HULL_M, by - HULL_M);
    g.globalAlpha = 1;
  }
}

/** Darken the whole hull (wrecks, idle previews). */
export function drawDim(g: G, v: CruiserView, k: number): void {
  if (k <= 0) return;
  const hb = hullBox(v.frame);
  g.globalAlpha = Math.min(0.7, k);
  g.drawImage(hullShade(v.model.hero, v.frame.facing), Math.round(hb.x) - HULL_M, Math.round(hb.y) - HULL_M);
  g.globalAlpha = 1;
}

export function turretPivotX(f: DeckFrame, col0: number, width: number): number {
  return sx(f, (col0 + width / 2) * 12, TURRET_LY);
}

export function turretPivotY(f: DeckFrame, col0: number, width: number): number {
  return sy(f, (col0 + width / 2) * 12, TURRET_LY);
}

function trect(g: G, f: DeckFrame, px: number, py: number, u: number, v: number, w: number, h: number, col: string): void {
  let x: number, y: number, ww: number, hh: number;
  switch (f.facing) {
    case 0: x = px + u; y = py + v; ww = w; hh = h; break;
    case 2: x = px + u; y = py - v - h; ww = w; hh = h; break;
    case 1: x = px - v - h; y = py + u; ww = h; hh = w; break;
    default: x = px + v; y = py + u; ww = h; hh = w;
  }
  g.fillStyle = col;
  g.fillRect(x, y, ww, hh);
}

/** 0.6.1b: the 6x6 hexagon core socket gem at mount offset (u, v): ink rim, gem fill, one highlight pixel. */
function socketGem(g: G, f: DeckFrame, px: number, py: number, u: number, v: number, col: string): void {
  trect(g, f, px, py, u + 1, v, 4, 1, C.ink);
  trect(g, f, px, py, u, v + 1, 6, 4, C.ink);
  trect(g, f, px, py, u + 1, v + 5, 4, 1, C.ink);
  trect(g, f, px, py, u + 1, v + 1, 4, 4, col);
  trect(g, f, px, py, u + 2, v + 1, 2, 1, C.white);
}

/** 0.6.1b: star pips (ARSENAL.md §8.2/§8.4): two or three 2x1 yellow pips from (u, v); 1 star shows none. */
function starPips(g: G, f: DeckFrame, px: number, py: number, u: number, v: number, stars: number): void {
  if (stars < 2) return;
  for (let k = 0; k < stars; k++) trect(g, f, px, py, u + k * 3, v, 2, 1, C.yellow);
}

/** A chamber pip's colour. 0.6.1c: the wave-1 kinds (SHOT's pewter since 0.6.1f, with a white highlight pixel that
 *  drawTurrets adds; SLAG's orange, HOT SWAP's ember red and spark blue; drawTurrets passes `preset ?? ammo`); every
 *  other kind as before. */
function payloadColor(ammo: string): string {
  switch (ammo) {
    case "shot": return C.steel3;
    case "slag": return C.fire2;
    case "ember": return C.red;
    case "spark": return C.blue;
    default: return ammo === "thread" ? C.ice : ammo === "plain" ? C.steel2 : C.fire3;
  }
}

/** 0.6.2s (REQ-BFG-031 S10): an empty TURRET SLOT: a bolted ring plate with an open socket, no barrel. */
function drawEmptyMount(g: G, f: DeckFrame, px: number, py: number): void {
  trect(g, f, px, py, -7, -7, 14, 14, C.ink);
  trect(g, f, px, py, -6, -6, 12, 12, C.slate1);
  trect(g, f, px, py, -4, -4, 8, 8, C.ink);
  trect(g, f, px, py, -3, -3, 6, 6, C.slate2);
  for (const [u, v] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) trect(g, f, px, py, u, v, 1, 1, C.steel2);
}

export function drawTurrets(g: G, v: CruiserView): void {
  const f = v.frame;
  // 0.6.2s (REQ-BFG-031 S9): the build's TURRET SLOTS (deck.ts hero(b): installed turrets, empty slots marked)
  const h = hero(v.build);
  const mods = v.build.mods;
  for (let i = 0; i < h.turrets.length; i++) {
    const td = h.turrets[i];
    if (td.empty) {
      drawEmptyMount(g, f, Math.round(turretPivotX(f, td.col0, td.width)), Math.round(turretPivotY(f, td.col0, td.width)));
      continue;
    }
    const art = turretArt(td.kind, h.faction, f.facing);
    const px = Math.round(turretPivotX(f, td.col0, td.width)), py = Math.round(turretPivotY(f, td.col0, td.width));
    const ts = v.sim ? turretAt(v.sim, i) : undefined; // 0.6.2s: by slot
    const wind = v.windup ? v.windup[i] : 0;
    const rec = Math.round((v.recoil ? v.recoil[i] : 0) + (wind > 0.75 ? 1 : 0));
    g.drawImage(art.base, px - TS / 2, py - TS / 2);
    g.drawImage(art.barrel, px - TS / 2 + turnX(f, 0, rec), py - TS / 2 + turnY(f, 0, rec));
    // wind-up (anticipation): a charge ring fills around the mount while the breech /
    // crystal glow ramps up; at full charge the barrel pulls back a pixel, then FIRE
    if (wind > 0.05) {
      const ramp = td.kind === "heavy" ? HEAT_RAMP : CRYSTAL_RAMP;
      const lvl = Math.min(4, Math.floor(wind * 5));
      const gr = glowRect(td.kind);
      trect(g, f, px, py, gr[0], gr[1], gr[2], gr[3], ramp[lvl]);
      if (lvl >= 3 && Math.floor(v.t * 16) % 2) trect(g, f, px, py, gr[0] + 1, gr[1], Math.max(1, gr[2] - 2), 1, C.white);
      const R = td.kind === "heavy" ? 9.5 : 6.5;
      const steps = td.kind === "heavy" ? 36 : 24;
      const lit = Math.round(steps * Math.min(1, wind));
      g.fillStyle = lvl >= 4 ? C.white : td.kind === "heavy" ? C.fire3 : C.ice;
      for (let k = 0; k < lit; k++) {
        const a = -Math.PI / 2 + (k / steps) * Math.PI * 2;
        g.fillRect(Math.round(px + Math.cos(a) * R - 0.5), Math.round(py + Math.sin(a) * R - 0.5), 1, 1);
      }
    }
    // chamber pips: loaded payloads beside the mount (0.6.1p: one per window slot, EXT. CHAMBER and HOPPER included)
    const pu = td.kind === "heavy" ? 12 : 9;
    const win = ts ? ts.window : td.window + gearStats(v.build, i).window;
    for (let k = 0; k < win; k++) {
      const pv = -4 + k * 4;
      trect(g, f, px, py, pu, pv, 4, 4, C.ink);
      const loaded = ts ? ts.stack[k] : undefined;
      const kind = loaded ? loaded.preset ?? loaded.ammo : undefined;
      trect(g, f, px, py, pu + 1, pv + 1, 2, 2, kind ? payloadColor(kind) : C.slate1);
      if (kind === "shot") trect(g, f, px, py, pu + 1, pv + 1, 1, 1, C.white); // 0.6.1f: the pewter shot's highlight
    }
    let gi = 0; // 0.6.2s (S4): a turret's gear pieces sit side by side, in hardpoint order (the first where 0.6.1 drew it)
    for (let m = 0; m < mods.length; m++) {
      if (mods[m].turret !== i || ITEMS[mods[m].def]?.kind === "core") continue; // 0.6.1b: gear only (the core has its socket)
      const bu = -pu - 5 - 6 * gi++;
      trect(g, f, px, py, bu, -3, 5, 5, C.ink);
      trect(g, f, px, py, bu + 1, -2, 3, 3, GEAR_BOX[mods[m].def] ?? C.cyan);
      if (mods[m].def === "mantlet") trect(g, f, px, py, bu + 2, -1, 1, 1, C.white); // MANTLET: one white rivet
      else trect(g, f, px, py, bu + 2, -2, 1, 3, C.white);
      starPips(g, f, px, py, bu, 3, starsOf(mods[m])); // 0.6.1b: 2 or 3 pips beside the hardpoint box
    }
    // 0.6.1b: the core socket (ARSENAL.md §8.4): a 6x6 hexagon gem at the rear of the mount, on the side away
    // from the gear box, in the bought core's gem colour or the faction glow (signature core); its pips beside it
    const core = coreFor(v.build, i);
    const su = td.kind === "heavy" ? 3 : 1, sv = pu - 8;
    socketGem(g, f, px, py, su, sv, gemColor(core?.def, v.model.hero));
    starPips(g, f, px, py, su - 9, sv + 2, starsOf(core)); // left of the gem (the chamber pips sit to its right)
    if (ts && ts.jamFx > 0 && Math.floor(v.t * 8) % 2) trect(g, f, px, py, -6, 4, 12, 2, C.red);
  }
}

/** 0.6.2s (REQ-BFG-031 S9): the TurretDef in slot i of a build (or of a hull's starting layout, given a HeroId). */
function slotTd(who: HeroId | Pick<Build, "hero" | "turrets">, i: number): TurretDef {
  const s = turretSlots(typeof who === "string" ? { hero: who } : who)[i];
  return s?.td ?? { col0: s?.col0 ?? 4, width: s?.width ?? 2, connectors: [], kind: "light", fireInterval: 0, window: 0, flight: 0, empty: true };
}

/** Muzzle tip of the turret in slot i (barrel 0/1 for twin heavies), screen space. 0.6.2s: pass the build. */
export function muzzleX(f: DeckFrame, who: HeroId | Pick<Build, "hero" | "turrets">, i: number, barrel = 0): number {
  const td = slotTd(who, i);
  return turretPivotX(f, td.col0, td.width) + turnX(f, td.kind === "heavy" ? (barrel % 2 ? 3.5 : -3.5) : 0, -TURRET_TIP[td.kind]);
}

export function muzzleY(f: DeckFrame, who: HeroId | Pick<Build, "hero" | "turrets">, i: number, barrel = 0): number {
  const td = slotTd(who, i);
  return turretPivotY(f, td.col0, td.width) + turnY(f, td.kind === "heavy" ? (barrel % 2 ? 3.5 : -3.5) : 0, -TURRET_TIP[td.kind]);
}
