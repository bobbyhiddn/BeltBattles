// 0.8.0 H1 M1 (REQ-BFG-011): FOUNDRY's and BASTION's art in today's render code. Ported from the race-art branch
// (raceart 0c094b2 by cap_epsilon, drawn on 0.4.1: render/races/factoriesA.ts, factoriesV2.ts, turretsA.ts,
// turretsV2.ts, ammo.ts, ammoV2.ts, hull.ts, hullTrim.ts), with its colours moved into the shared palette (palette.ts
// bsteel, stone, rune) and its race palettes as FACTION.human and FACTION.dwarf:
//  - the CRUCIBLE and WARDWORKS factories (24x24, 8 idle frames and the stamp pose), and their chute-mouth glow;
//  - ALLOY BLANK, ALLOY SLUG and BULWARK SLUG on the belt (7x7, with today's payload tiers: a bright rim from tier 2, a
//    lit core at tier 4, a halo from tier 3), in flight (shells, pellets, volley rounds) and their trails;
//  - the human MEDIUM gun (two per FOUNDRY hull) and the dwarf HEAVY gun (BASTION), plus the other turret kinds a human
//    or dwarf hull can mount (today's shapes in the race palettes), with each kind's glow, charge ring and muzzle;
//  - the human and dwarf hull silhouettes and trim, kept off every turret slot.
// Nothing here is used for an orc or elf hull: Furnace and Weaver draw exactly as before.

import { C, FACTION, type FactionPalette } from "./palette";
import { bevel, disc, flipX, flipY, fromRows, hline, line, makeCanvas, px, rect, ring, rot90, vline } from "./pixel";
import type { Facing } from "./frame";
import { HULL_A, HULL_L, SIDE } from "./frame";
import type { HullPainter } from "./hull";
import { TS, tmap, type TurretArt } from "./turret";
import type { Faction, TurretKind } from "../sim/content";

type Cv = HTMLCanvasElement;
type G = CanvasRenderingContext2D;

/** The factions with race art in the game (FOUNDRY's and BASTION's). */
export type ArtRace = "human" | "dwarf";
export const isArtRace = (f: Faction): f is ArtRace => f === "human" || f === "dwarf";

// ------------------------------------------------------------------------------------------------------------ factories

/** CRUCIBLE (raceart factoriesA.ts, unchanged in part 2): a copper bowl with a brass rim slung in a riveted steel frame,
 *  a pour spout, molten alloy swirling; the stamp pose pours a white-hot stream with sparks. */
function drawCrucible(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  const P = FACTION.human;
  bevel(g, 0, 0, 24, 24, P.hull2, P.hull4, P.hull0, C.ink);
  rect(g, 3, 3, 18, 18, C.ink);
  rect(g, 4, 4, 16, 16, P.hull0);
  hline(g, 4, 4, 16, C.bsteel1);
  for (const [x, y] of [[1, 1], [11, 1], [22, 1], [1, 11], [22, 11], [1, 22], [11, 22], [22, 22]]) px(g, x, y, C.brass3);
  bevel(g, 1, 9, 4, 7, C.brass2, C.brass4, C.brass0, C.ink);
  bevel(g, 19, 9, 4, 7, C.brass2, C.brass3, C.brass0, C.ink);
  bevel(g, 15, 3, 6, 6, C.cop2, C.cop3, C.cop0, C.ink);
  px(g, 18, 5, flash ? C.white : C.yellow);
  px(g, 19, 4, flash ? C.fire4 : C.brass2);
  disc(g, 12, 12.5, 7.6, C.ink);
  disc(g, 12, 12.5, 6.6, C.cop2);
  ring(g, 12, 12.5, 6.6, C.brass3);
  for (const [x, y] of [[8, 7], [7, 8], [9, 6], [6, 9]]) px(g, x, y, C.brass4);
  for (const [x, y] of [[16, 17], [17, 16], [15, 18]]) px(g, x, y, C.cop1);
  disc(g, 12, 12.5, 4.7, C.brass1);
  disc(g, 12, 12.5, 3.9, flash ? C.brass4 : C.yellow);
  const a = (f / 8) * Math.PI * 2;
  for (const k of [0, Math.PI]) {
    px(g, Math.round(12 + Math.cos(a + k) * 2.2 - 0.5), Math.round(12.5 + Math.sin(a + k) * 2.2 - 0.5), flash ? C.white : C.brass4);
  }
  px(g, 11, 11, flash ? C.white : C.fire4);
  if (f % 4 === 1) px(g, 14, 14, C.amber);
  px(g, 10 + (f % 3), 4 - (f % 2), f % 2 ? C.brass2 : C.steel2);
  if (flash) {
    line(g, 20, 3, 23, 0, C.fire4);
    px(g, 21, 2, C.white);
    for (const [x, y] of [[5, 5], [18, 20], [4, 18], [20, 8]]) px(g, x, y, C.yellow);
  }
  return c;
}

const RUNES: [number, number][][] = [
  [[0, 0], [0, 1], [0, 2], [1, 1]],
  [[0, 0], [1, 1], [0, 2], [1, 2]],
  [[1, 0], [0, 1], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [0, 1], [1, 2]],
];

/** WARDWORKS (raceart factoriesA.ts + the part-2 rims of factoriesV2.ts): a squat granite forge under an iron hood with
 *  a breathing rune-blue fire, and four rune plates with bright bevelled iron rims, lit in turn (all blaze on a stamp). */
function drawWardworks(f: number, flash: boolean): Cv {
  const [c, g] = makeCanvas(24, 24);
  const P = FACTION.dwarf;
  bevel(g, 0, 1, 24, 23, P.hull2, P.hull4, P.hull0, C.ink);
  hline(g, 1, 8, 22, P.hull1);
  hline(g, 1, 16, 22, P.hull1);
  for (const [x, y0, h] of [[8, 2, 6], [16, 2, 6], [4, 9, 7], [19, 9, 7], [8, 17, 5], [16, 17, 5]]) vline(g, x, y0, h, P.hull1);
  for (const [x, y] of [[0, 1], [19, 1], [0, 19], [19, 19]]) {
    bevel(g, x, y, 5, 5, P.trim1, P.trim2, P.trim0, C.ink);
    px(g, x + 2, y + 2, C.steel3);
  }
  bevel(g, 6, 6, 12, 12, P.trim1, P.trim2, P.trim0, C.ink);
  rect(g, 8, 8, 8, 8, C.ink);
  const breathe = f % 4 < 2;
  rect(g, 9, 9, 6, 6, flash ? C.rune2 : C.rune0);
  rect(g, 10, 10, 4, 4, flash ? C.rune3 : breathe ? C.rune2 : C.rune1);
  rect(g, 11, 11, 2, 2, flash ? C.white : breathe ? C.rune3 : C.rune2);
  px(g, 10 + ((f >> 1) % 3), 10, flash ? C.rune4 : C.rune3);
  hline(g, 8, 12, 8, C.ink);
  // part 2: the plates redrawn at 6x7 (7x6 on the sides) with bright rims; the ink edges land on the hood and block
  const plates: [number, number, number, number][] = [[9, 0, 6, 7], [17, 9, 7, 6], [9, 17, 6, 7], [0, 9, 7, 6]];
  plates.forEach(([x, y, w, h], i) => {
    const lit = flash || i === (f >> 1) % 4;
    const [hi, lo] = flash ? [C.white, C.rune3] : lit ? [C.rune4, C.rune2] : [C.steel3, C.steel2];
    bevel(g, x, y, w, h, P.trim0, hi, lo, C.ink);
    rect(g, x + 2, y + 2, w - 4, h - 4, C.ink);
    const side = w > h;
    for (const [dx, dy] of RUNES[i]) px(g, x + 2 + (side ? dy : dx), y + 2 + (side ? dx : dy), lit ? (flash ? C.rune4 : C.rune3) : C.rune1);
  });
  if (flash) for (const [x, y] of [[5, 5], [18, 5], [5, 18], [18, 18], [12, 4]]) px(g, x, y, C.rune4);
  return c;
}

/** The race factories' 24x24 art at idle frame f (0-7) or the stamp pose; undefined for any other id. */
export function raceFactoryArt(id: string, f: number, flash: boolean): Cv | undefined {
  if (id === "crucible") return drawCrucible(f, flash);
  if (id === "wardworks") return drawWardworks(f, flash);
  return undefined;
}

/** The glow inside a race factory's output chute (machinery.ts drawChute: the kiln's fire, the loom's ice); undefined
 *  for any other factory. */
export function raceChuteMouth(id: string): string | undefined {
  return id === "crucible" ? C.yellow : id === "wardworks" ? C.rune2 : undefined;
}

// ----------------------------------------------------------------------------------------------------------------- ammo

const ALLOY = { k: C.ink, Y: C.brass4, y: C.brass3, b: C.brass2, d: C.brass1, W: C.white, w: C.fire4, C: C.cop3, c: C.cop2, e: C.cop1 };
const IRON = { k: C.ink, S: C.steel3, s: C.steel2, d: C.steel1, R: C.rune3 };

/** 7x7 belt sprites (raceart ammo.ts / ammoV2.ts): the ALLOY BLANK is a 5x5 coin with a bright brass-to-copper rim
 *  (half a slug), the ALLOY SLUG a pinched two-part slug with a white weld, the BULWARK SLUG an iron shield with a rune. */
const BELT_ROWS: Record<string, [string[], Record<string, string>]> = {
  blank: [[".......", "..kkk..", ".kYYCk.", ".kYeck.", ".kCcck.", "..kkk..", "......."], ALLOY],
  alloy: [[".kkkkk.", "kYyyybk", "kyybbdk", ".kWwWk.", "kCcccek", "kcceeek", ".kkkkk."], ALLOY],
  bulwark: [["kkkkkkk", "kSSsssk", "kSsRsdk", "ksRRRdk", ".ksRdk.", "..kdk..", "...k..."], IRON],
};

/** The race ammo kinds with art. */
export const isRaceAmmo = (kind: string): boolean => Object.prototype.hasOwnProperty.call(BELT_ROWS, kind);

const cache = new Map<string, Cv>();
function cached(k: string, make: () => Cv): Cv {
  let c = cache.get(k);
  if (!c) {
    c = make();
    cache.set(k, c);
  }
  return c;
}

/** Each kind's [rim at tier 2, lit core at tier 4, halo] colours (0.6.2 BELTSIDE V2's payload tiers). */
const TIER_LOOK: Record<string, [string, string, string]> = {
  blank: [C.brass3, C.white, C.brass3],
  alloy: [C.brass4, C.white, C.fire4],
  bulwark: [C.steel3, C.rune4, C.rune3],
};

/** A race payload on the belt at damage tier t (0-4): its 7x7 sprite, the ink rim brightened from tier 2 and white
 *  from tier 3, the core lit at tier 4 (as payloadSprite does for thread and plain slugs). */
export function raceBeltSprite(kind: string, t: number): Cv {
  return cached(`rbelt:${kind}:${t}`, () => {
    const [rows, pal] = BELT_ROWS[kind];
    const [rim, core] = TIER_LOOK[kind];
    const k = t >= 3 ? C.white : t >= 2 ? rim : C.ink;
    const lit: Record<string, string> = t >= 4 ? { Y: core, S: core, W: core } : {};
    return fromRows(rows, { ...pal, k, ...lit });
  });
}

/** The halo behind a tier-3+ race payload (11x11), in its ammo's colour. */
export function raceHalo(kind: string, tier: number): Cv {
  return cached(`rhalo:${kind}:${tier >= 4 ? 4 : 3}`, () => {
    const [cv, g] = makeCanvas(11, 11);
    g.fillStyle = tier >= 4 ? C.white : TIER_LOOK[kind][2];
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const d = Math.hypot(x + 0.5 - 5.5, y + 0.5 - 5.5);
        if (d < 5.5 && d > 3 && ((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  });
}

function orient(src: Cv, dir: number): Cv {
  if (dir === 0) return src;
  if (dir === 1) return rot90(src);
  if (dir === 2) return flipY(src);
  return flipX(rot90(src));
}

const SHELL_ROWS: Record<string, [string[], Record<string, string>]> = {
  blank: [[".kkk.", "kYYCk", "kYeck", "kCcck", ".kkk."], ALLOY],
  alloy: [["..k..", ".kYk.", "kYybk", "kybdk", "kWwWk", "kCcek", "kceek", ".kkk."], ALLOY],
  bulwark: [["..k..", ".kRk.", "kSRdk", "kSRdk", "kSsdk", "kkkkk"], IRON],
};

/** A race shell in flight pointing along screen dir (0 N, 1 E, 2 S, 3 W). */
export function raceShellSprite(kind: string, dir: number): Cv {
  return cached(`rshell:${kind}:${dir}`, () => {
    const [rows, pal] = SHELL_ROWS[kind];
    return orient(fromRows(rows, pal), dir);
  });
}

/** SCATTER CHOKE's pellet (3x3) of a race payload: [highlight, body]. */
export const RACE_PELLET: Readonly<Record<string, [string, string]>> = {
  blank: [C.brass4, C.cop2], alloy: [C.white, C.brass3], bulwark: [C.rune3, C.steel2],
};

/** Trail colours, head to tail. */
export const RACE_TRAIL: Readonly<Record<string, readonly string[]>> = {
  blank: [C.brass4, C.brass3, C.cop2, C.cop1],
  alloy: [C.white, C.fire4, C.brass3, C.cop2, C.cop1],
  bulwark: [C.rune4, C.rune3, C.rune2, C.rune1],
};

/** A loaded chamber pip's colour. */
export const RACE_PIP: Readonly<Record<string, string>> = { blank: C.cop3, alloy: C.brass4, bulwark: C.rune3 };

// -------------------------------------------------------------------------------------------------------------- turrets

/** Turret-local painter on today's tmap (raceart tp.ts). */
class RTP {
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

/** The turret canvas centre. A function, not a module constant: turret.ts imports this file (turretArt), so TS must
 *  not be read while the modules load. */
const mid = (): number => TS / 2;

/** The MEDIUM gun (raceart turretsV2.ts humanMediumV2): a riveted gun house 14 wide with a front band and corner rivets,
 *  shell hoists on both flanks, and one jacketed barrel with a muzzle ring. Humans trim it in brass, dwarves in iron. */
function mediumGun(race: ArtRace, f: Facing): TurretArt {
  const P = FACTION[race];
  const [b0, b1, b2, b3, b4] = race === "human" ? [C.brass0, C.brass1, C.brass2, C.brass3, C.brass4] : [C.steel0, C.steel1, C.steel2, C.steel3, C.white];
  const [base, g] = makeCanvas(TS, TS);
  const c0 = mid();
  disc(g, c0, c0, 9.5, C.ink);
  disc(g, c0, c0, 8.5, P.hull1);
  ring(g, c0, c0, 8.5, P.hull3);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    px(g, Math.round(c0 + Math.cos(a) * 7 - 0.5), Math.round(c0 + Math.sin(a) * 7 - 0.5), b3);
  }
  disc(g, c0, c0, 5.5, C.ink);
  const p = new RTP(g, f);
  p.R(-10, -2, 3, 6, C.ink);
  p.R(-9, -1, 1, 4, b2);
  p.R(7, -2, 3, 6, C.ink);
  p.R(8, -1, 1, 4, b1);
  p.B(-7, -6, 14, 12, P.hull2, P.hull4, P.hull0, C.ink);
  p.R(-6, -5, 12, 1, b2);
  p.R(-6, -4, 12, 1, P.hull1);
  for (const [u, v] of [[-6, -2], [5, -2], [-6, 4], [5, 4]]) p.R(u, v, 1, 1, b3);
  p.R(-5, 0, 1, 2, P.hull0);
  p.R(4, 0, 1, 2, P.hull0);
  p.R(-3, 1, 6, 4, C.ink);
  p.R(-2, 2, 4, 2, b0);
  const [barrel, bg] = makeCanvas(TS, TS);
  const b = new RTP(bg, f);
  b.R(-3, -16, 6, 11, C.ink);
  b.R(-2, -16, 4, 11, C.steel1);
  b.R(-2, -16, 1, 11, C.steel3);
  b.R(1, -16, 1, 11, C.steel0);
  for (let v = -15; v <= -10; v += 2) b.R(0, v, 1, 1, C.ink); // the perforated cooling jacket
  b.R(-2, -8, 4, 1, b2);
  b.R(-4, -19, 8, 4, C.ink);
  b.R(-3, -18, 6, 2, b2);
  b.R(-3, -18, 1, 1, b4);
  b.R(-1, -18, 2, 1, C.ink);
  return { base, barrel, tip: 19 };
}

/** The dwarf HEAVY gun (raceart turretsA.ts dwarfHeavy): a squat stone casemate behind a bolted iron mantlet wider than
 *  itself, a rear rune vent, and one short, fat rune-banded barrel with a blunt muzzle collar. */
function dwarfHeavy(f: Facing): TurretArt {
  const P = FACTION.dwarf;
  const [base, g] = makeCanvas(TS, TS);
  const c0 = mid();
  disc(g, c0, c0, 11.5, C.ink);
  disc(g, c0, c0, 10.5, P.trim0);
  ring(g, c0, c0, 10.5, P.trim1);
  disc(g, c0, c0, 8.5, C.ink);
  disc(g, c0, c0, 7.5, P.hull1);
  const p = new RTP(g, f);
  p.B(-9, -5, 18, 12, P.hull2, P.hull4, P.hull1, C.ink);
  p.R(-8, 1, 16, 1, P.hull1);
  p.R(0, 2, 1, 4, P.hull1);
  p.R(-4, 3, 8, 3, C.ink);
  p.R(-3, 4, 6, 1, C.rune0);
  p.B(-11, -10, 22, 6, P.trim1, P.trim2, P.trim0, C.ink);
  p.R(-10, -6, 20, 1, P.trim0);
  for (const u of [-9, -6, 5, 8]) p.R(u, -8, 1, 1, C.steel3);
  p.R(-8, -9, 1, 1, C.rune2);
  p.R(7, -9, 1, 1, C.rune2);
  const [barrel, bg] = makeCanvas(TS, TS);
  const b = new RTP(bg, f);
  b.R(-4, -16, 8, 8, C.ink);
  b.R(-3, -16, 6, 8, P.trim1);
  b.R(-3, -16, 1, 8, P.trim2);
  b.R(2, -16, 1, 8, P.trim0);
  b.R(-3, -12, 6, 1, C.rune1);
  b.R(-5, -19, 10, 4, C.ink);
  b.R(-4, -18, 8, 2, P.trim2);
  b.R(-4, -18, 1, 1, C.white);
  b.R(-1, -18, 2, 2, C.ink);
  return { base, barrel, tip: 19 };
}

/** The race turret art a hull of `race` mounts for `kind`, or undefined for the kinds that keep today's shapes in the
 *  race palette (light; heavy on a human hull; adaptable). FOUNDRY's starting guns are MEDIUM, BASTION's is HEAVY. */
export function raceTurretArt(kind: TurretKind, race: ArtRace, f: Facing): TurretArt | undefined {
  if (kind === "medium") return mediumGun(race, f);
  if (kind === "heavy" && race === "dwarf") return dwarfHeavy(f);
  return undefined;
}

/** How a turret of `kind` on a `race` hull glows, charges and fires: today's numbers for the shapes it shares, the race
 *  art's for its own (raceart layout.ts RACE_TURRET_TIP and turrets.ts RACE_GLOW_RECT, RACE_CHARGE_R). */
export interface RaceTurretLook {
  glow: [number, number, number, number]; // the wind-up glow patch, turret-local
  ramp: readonly string[]; // its colours, cold to full charge
  chargeR: number; // the charge ring's radius
  chargeCol: string; // the ring's colour below full charge
  tip: number; // muzzle distance from the pivot
  twin: boolean; // two barrels (today's heavy): shells leave from either
  pip: number; // the chamber pips' column, turret-local u (clear of the base)
  socket: number; // the core socket's u
}

const RAMP: Record<ArtRace, readonly string[]> = {
  human: [C.brass1, C.brass2, C.yellow, C.brass4, C.white],
  dwarf: [C.rune0, C.rune1, C.rune2, C.rune3, C.rune4],
};

export function raceTurretLook(kind: TurretKind, race: ArtRace): RaceTurretLook {
  const ramp = RAMP[race], chargeCol = race === "human" ? C.yellow : C.rune3;
  if (kind === "medium") return { glow: [-2, 2, 4, 2], ramp, chargeR: 8.5, chargeCol, tip: 19, twin: false, pip: 12, socket: 3 };
  if (kind === "heavy" && race === "dwarf") return { glow: [-3, 4, 6, 1], ramp, chargeR: 10.5, chargeCol, tip: 19, twin: false, pip: 13, socket: 3 };
  if (kind === "heavy" || kind === "adaptable") return { glow: [-4, 3, 8, 2], ramp, chargeR: 9.5, chargeCol, tip: 20, twin: true, pip: 12, socket: 3 };
  return { glow: [-2, -2, 4, 4], ramp, chargeR: 6.5, chargeCol, tip: 15, twin: false, pip: 9, socket: 1 };
}

/** bb-0.8.3 (REQ-BFG-043 D11): the chamber pips' column (turret-local u) of a `kind` gun on a `faction` hull: the race
 *  art's on a human or dwarf hull, today's elsewhere (12 on a heavy, else 9). cruiser.ts drawTurrets draws the pips there;
 *  levelMark.ts caps the column with the TURRET SPEED level. */
export function pipColumn(kind: TurretKind, faction: Faction): number {
  return isArtRace(faction) ? raceTurretLook(kind, faction).pip : kind === "heavy" ? 12 : 9;
}

// ----------------------------------------------------------------------------------------------------------------- hull

const A = HULL_A, L = HULL_L;

/** Race hull silhouettes, hull-local (raceart hull.ts raceInside): humans have clean rolled-plate chamfers, dwarves
 *  stepped masonry corners at bow and stern. The tread channels and the bow band stay inside. */
export function raceInside(race: ArtRace, hx: number, hy: number): boolean {
  if (hx < 0 || hx >= A || hy < 0 || hy >= L) return false;
  const sl = L - 1 - hy;
  const near = Math.min(hx, A - 1 - hx);
  if (race === "human") {
    if (hy < 6 && near < 6 - hy) return false;
    if (sl < 3 && near < 3 - sl) return false;
    return true;
  }
  if (hy < 3 && near < 9) return false;
  if (hy < 6 && near < 5) return false;
  if (hy < 9 && near < 2) return false;
  if (sl < 3 && near < 5) return false;
  return true;
}

/** The deck's noise salt per race (hull.ts drawDeck: FURNACE 3, WEAVER 7). */
export const RACE_DECK_SALT: Record<ArtRace, number> = { human: 11, dwarf: 13 };

type Spans = [number, number][];
const clear = (spans: Spans, x0: number, x1: number) => spans.every(([a, b]) => x1 < a || x0 > b);

/** Race trim (raceart hullTrim.ts), kept off `spans` (hullDeco.ts: every turret slot, the empty extra one too). */
export function raceHullTrim(p: HullPainter, race: ArtRace, P: FactionPalette, spans: Spans): void {
  if (race === "human") human(p, P, spans);
  else dwarf(p, P, spans);
}

function human(p: HullPainter, P: FactionPalette, spans: Spans): void {
  // double rivet rows and a brass band across the bow plate
  p.R(14, 6, A - 28, 1, C.brass1);
  for (let x = 16; x < A - 15; x += 4) {
    if (!clear(spans, x - 1, x + 1)) continue;
    p.P(x, 3, C.brass3);
    p.P(x, 9, P.hull0);
  }
  // hazard stripes on the bow corners
  for (const x0 of [15, A - 27]) {
    if (!clear(spans, x0, x0 + 11)) continue;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) p.P(x0 + i, 8 + j, ((i + j) >> 1) % 2 ? C.yellow : C.ink);
  }
  // riveted plate seams down the skirts
  for (let y = 14; y < L - 8; y += 16) {
    p.R(1, y, 2, 1, P.hull0);
    p.R(A - 3, y, 2, 1, P.hull0);
    p.P(1, y + 2, C.brass3);
    p.P(A - 2, y + 2, C.brass2);
  }
  // twin brass smokestacks and two stern hatches
  for (const x of [34, A - 35]) {
    p.R(x - 3, L - 5, 7, 5, C.ink);
    p.R(x - 2, L - 4, 5, 3, C.brass2);
    p.R(x - 2, L - 4, 5, 1, C.brass3);
    p.R(x - 1, L - 3, 3, 1, C.ink);
    p.R(x - 2, L, 5, 2, C.ink);
    p.R(x - 1, L, 3, 1, C.steel2);
  }
  for (const x of [66, A - 67]) p.B(x - 4, L - 5, 9, 4, P.hull3, P.hull4, P.hull1, C.ink);
}

function dwarf(p: HullPainter, P: FactionPalette, spans: Spans): void {
  // masonry: a course line and staggered joints on the bow band
  p.R(14, 6, A - 28, 1, P.hull1);
  for (let x = 20; x < A - 16; x += 10) {
    if (clear(spans, x - 1, x + 1)) p.R(x, 2, 1, 4, P.hull1);
    if (clear(spans, x + 4, x + 6)) p.R(x + 5, 7, 1, 5, P.hull1);
  }
  // iron corner caps
  p.B(13, 1, 7, 6, P.trim1, P.trim2, P.trim0, C.ink);
  p.B(A - 20, 1, 7, 6, P.trim1, P.trim2, P.trim0, C.ink);
  // rune plates between the mounts
  for (const x of [30, 48, A - 49, A - 31]) {
    if (!clear(spans, x - 3, x + 3)) continue;
    p.B(x - 3, 3, 7, 8, P.trim1, P.trim2, P.trim0, C.ink);
    p.R(x, 4, 1, 6, C.rune2);
    p.P(x - 1, 5, C.rune3);
    p.P(x + 1, 5, C.rune3);
    p.P(x, 4, C.rune4);
  }
  // buttresses on both skirts: the very high hull
  for (let y = 20; y < L - 14; y += 22) {
    p.B(-3, y, 5, 10, P.hull3, P.hull4, P.hull1, C.ink);
    p.B(A - 2, y, 5, 10, P.hull2, P.hull3, P.hull0, C.ink);
  }
  // stern forge vents, rune-lit
  for (const x of [34, 62, A - 63, A - 35]) {
    p.R(x - 3, L - 5, 7, 4, C.ink);
    p.R(x - 2, L - 4, 5, 2, C.rune1);
    p.P(x, L - 4, C.rune3);
  }
}

/** The turret spans' clearance radius for the race trim (raceart layout.ts RACE_TURRET_CLEAR: medium 12, heavy 14). */
export function raceSpanRadius(kind: TurretKind | undefined): number {
  return kind === "medium" ? 12 : kind === "heavy" || kind === "adaptable" || kind === undefined ? 14 : 10;
}

/** A hull-local x span for a turret slot at col0, width (2) with radius r. */
export const slotSpan = (col0: number, width: number, r: number): [number, number] => {
  const cx = SIDE + (col0 + width / 2) * 12;
  return [cx - r, cx + r];
};
