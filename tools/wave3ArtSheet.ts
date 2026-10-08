// 0.8.0 A1 M3 (REQ-BFG-022, REQ-BFG-024): the wave-3 art contact sheets (a dev page, tools/wave3-art.html; never in the
// game build). Everything is drawn through the game's own entry points: gateSprite, gateSil, factorySprite,
// factoryFlashSil, itemIcon, itemSlot, portraitPixels, and whole decks through cruiserModel + drawHull + drawMachinery +
// drawTurrets. The deck views need a def for each part (machinery.ts and cruiser.ts read ITEMS), so the page installs
// P1's 15 entries in memory first (tools/wave3Defs.ts; never in src). Sheet (?view=sheet, the default):
//  - every wave-3 part in a row: its icon and cargo slot at 1-3 stars, idle frames 0-7, the active (hit) frame, its battle
//    states, its silhouette, and the part on a deck beside a belt (or in a gun) at 1, 2 and 3 stars, bow north (the
//    player's FURNACE deck) and bow south (an enemy WEAVER deck); then, in the same row, two or three existing parts of the
//    same kind and merchant (its closest look-alikes) the same way;
//  - the two factories inside whole cruiser decks with their belts (TWIN MOULD on FOUNDRY's mirrored belts, ARMOR PRESS
//    on BASTION's), 1-3 stars, and their flash silhouettes and battle effects;
//  - the six new NPC portraits beside today's 13 captains and the four heroes' portraits.
// Phone (?view=phone, tools/wave3ArtPage.ts): two decks holding every wave-3 part, cropped to the phone's logical width
// and scaled by the build screen's own integer scale for a 390x844 phone at dpr 3 (screens/build/layout.ts buildScale),
// in device pixels, as the phone shows them.

import { C } from "../src/render/palette";
import { makeCanvas, rect, type G } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { frameForHull } from "../src/render/frame";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { cruiserModel, drawTurrets, turretPivotX, turretPivotY, type CruiserView } from "../src/render/cruiser";
import { drawDeckHull } from "./stillDraw"; // CUSTOM-2a: drawHull (the tracked hull) is gone
import { drawMachinery } from "../src/render/machinery";
import { PORTRAIT_KEYS, WAVE3_NPC_IDS, portraitPixels, type PortraitKey } from "../src/render/portraits";
import {
  WAVE3_CORES, WAVE3_FACTORIES, WAVE3_GEAR, WAVE3_RIGS, anvilSparks, stokeFlare, wave3FactoryArt, wave3GateSprite, wave3GearFace,
  wave3Gem, type Wave3RigState,
} from "../src/render/wave3Art";
import { itemSlot } from "../src/ui/ui";
import { buildScale } from "../src/screens/build/layout";
import { GRID, ITEMS, type HeroId } from "../src/sim/content";
import { DX, DY, cloneBuild, hitsOfRig, inGrid, key, kx, ky, occupancy, rigHits, rotField, turretSlots, type Build } from "../src/sim/deck";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { VERSION } from "../src/version";
import { installWave3Defs } from "./wave3Defs";

installWave3Defs();

export const SHEET_W = 1500, SHEET_H = 1500;

const label = (g: G, s: string, x: number, y: number, col: string = C.bone, small = true): void => {
  drawText(g, s, x, y, col, { font: small ? "3" : "5" });
};
const name = (id: string): string => ITEMS[id]?.name ?? id.toUpperCase();

/** The look-alikes: two or three existing parts of the same kind and merchant (the closest looks first). */
const LOOKALIKES: Record<string, string[]> = {
  plateroller: ["riveter", "tollbooth", "brake"],
  twingauge: ["overclocker", "longhaul", "grease"],
  pincer: ["whetstone", "temper", "sifter"],
  braceframe: ["riveter", "tollbooth", "coil"],
  twinlatch: ["longhaul", "brake", "surge"],
  stoker: ["keg", "counterweight"],
  platebreaker: ["keg", "counterweight", "splitter"],
  shieldwall: ["riveter", "tollbooth", "overdrive"],
  twinmould: ["gantry", "slagpot", "doublestamp"],
  armorpress: ["press", "doublestamp", "slagpot"],
  anvil: ["mortar", "hullbreaker", "pressure"],
  steambreech: ["pressure", "rotary", "scatter"],
  twintrigger: ["chamber", "calibrate", "spotter"],
  spallcatcher: ["flak", "hopper", "mantlet"],
  seamwelder: ["mantlet", "chamber", "ram"],
};

/** The battle states each rig's Art line names (shown beside its frames). */
const RIG_STATES: Record<string, [string, Wave3RigState][]> = {
  plateroller: [],
  twingauge: [["MATCHED", { matched: true }]],
  pincer: [["1 RIG", { crowd: 1 }], ["2", { crowd: 2 }], ["3", { crowd: 3 }]],
  braceframe: [["SHRUG", { shrug: true }]],
  twinlatch: [["HOLD", { latch: "hold" }], ["GO", { latch: "release" }]],
  stoker: [],
  platebreaker: [["NO PLATE", { spent: false }]],
  shieldwall: [["12+ PLATED", { plated: true }]],
};

// ------------------------------------------------------------------------------------------------------------ decks

/** A build drawn as the build screen draws it: hull, machinery, turrets; bow north (0) or south (2). */
function deck(b: Build, facing: 0 | 2, t = 0.4): HTMLCanvasElement {
  const [cv, g] = makeCanvas(176, 184);
  rect(g, 0, 0, 176, 184, C.soil1);
  const f = facing === 0 ? frameForHull(0, 10, 32) : frameForHull(2, 10, 12);
  const v: CruiserView = { side: facing === 0 ? 0 : 1, build: b, model: cruiserModel(b), frame: f, t, tread: 0 };
  drawDeckHull(g, v);
  drawMachinery(g, v);
  drawTurrets(g, v);
  return cv;
}

/** The deck frame deckView uses, to find a cell on screen. */
const frameOf = (facing: 0 | 2) => (facing === 0 ? frameForHull(0, 10, 32) : frameForHull(2, 10, 12));
function cellXY(facing: 0 | 2, x: number, y: number): [number, number] {
  const f = frameOf(facing);
  return facing === 0 ? [f.dx + x * 12, f.dy + y * 12] : [f.dx + x * 12, f.dy + 120 - (y + 1) * 12];
}

/** Place rig `id` (stars) on `hero`'s start deck where its arrows work the most belt tiles. */
function withRig(hero: HeroId, id: string, stars: number): { b: Build; x: number; y: number } {
  const base = heroStartBuild(hero, 1);
  const occ = occupancy(base);
  let best: { b: Build; x: number; y: number; n: number; d: number } | null = null;
  for (let k = 0; k < GRID * GRID; k++) {
    if (occ[k].item >= 0 || occ[k].route >= 0) continue;
    const x = kx(k), y = ky(k);
    const nearBelt = [0, 1, 2, 3].some((d) => inGrid(x + DX[d], y + DY[d]) && occ[key(x + DX[d], y + DY[d])].route >= 0);
    if (!nearBelt) continue;
    for (let rot = 0; rot < 4; rot++) {
      const b = cloneBuild(base);
      b.items.push({ uid: 990, def: id, x, y, ...(stars > 1 ? { stars } : {}), ...rotField(id, rot) });
      const n = hitsOfRig(b, 990, rigHits(b)).length;
      const d = Math.abs(x - 4.5) + Math.abs(y - 5);
      if (!best || n > best.n || (n === best.n && d < best.d)) best = { b, x, y, n, d };
    }
  }
  if (!best) throw new Error(`no cell for ${id}`);
  return best;
}

/** A crop of a deck canvas around cell (x, y): w x h cells (12 px) centred on it, clamped to the canvas. */
function crop(src: HTMLCanvasElement, cx: number, cy: number, w: number, h: number): HTMLCanvasElement {
  const [c, g] = makeCanvas(w, h);
  const x0 = Math.max(0, Math.min(src.width - w, Math.round(cx - w / 2))), y0 = Math.max(0, Math.min(src.height - h, Math.round(cy - h / 2)));
  g.drawImage(src, x0, y0, w, h, 0, 0, w, h);
  return c;
}

/** A rig on a deck beside a belt: [patch at stars 1-3 on FURNACE, bow north] + [WEAVER, bow south]. */
function rigPatches(id: string): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (const [hero, facing, stars] of [["furnace", 0, 1], ["furnace", 0, 2], ["furnace", 0, 3], ["weaver", 2, 1]] as [HeroId, 0 | 2, number][]) {
    const { b, x, y } = withRig(hero, id, stars);
    const [sx, sy] = cellXY(facing, x, y);
    out.push(crop(deck(b, facing), sx + 6, sy + 6, 48, 48));
  }
  return out;
}

/** A gear piece or core on the first gun: FURNACE (heavy) bow north at 1-3 stars, WEAVER (light) bow south. */
function gunPatches(id: string): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  for (const [hero, facing, stars] of [["furnace", 0, 1], ["furnace", 0, 2], ["furnace", 0, 3], ["weaver", 2, 1]] as [HeroId, 0 | 2, number][]) {
    const b = cloneBuild(heroStartBuild(hero, 1));
    b.mods = [{ uid: 980, def: id, turret: 0, ...(stars > 1 ? { stars } : {}) }];
    const cv = deck(b, facing);
    // centred on the first gun's pivot
    const td = turretSlots(b)[0].td!;
    const f = frameOf(facing);
    out.push(crop(cv, turretPivotX(f, td.col0, td.width), turretPivotY(f, td.col0, td.width), 64, 40));
  }
  return out;
}

/** A factory in its start deck's signature factory's place (its belts leave through its chutes): the whole deck. */
function factoryDeck(id: string, hero: HeroId, stars: number, facing: 0 | 2, t = 0.4): HTMLCanvasElement {
  const b = cloneBuild(heroStartBuild(hero, 1));
  const sig = b.routes[0]?.factory;
  const p = b.items.find((q) => q.uid === sig);
  if (p) { p.def = id; if (stars > 1) p.stars = stars; }
  return deck(b, facing, t);
}

// ------------------------------------------------------------------------------------------------------------ the rows

const SCALE = 2; // sprites in the rows at 2x (the sheet itself is 1x pixels; the 3x render triples it)

function blit(g: G, img: HTMLCanvasElement, x: number, y: number, s = SCALE): void {
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, img.width * s, img.height * s);
}

function cell(g: G, img: HTMLCanvasElement, x: number, y: number, s = SCALE, bg: string = C.slate1): number {
  rect(g, x - 1, y - 1, img.width * s + 2, img.height * s + 2, bg);
  blit(g, img, x, y, s);
  return x + img.width * s + 4;
}

function slot(id: string, stars: number): HTMLCanvasElement {
  const [cv, g] = makeCanvas(20, 20);
  itemSlot(g, 1, 1, id, false, 0, stars);
  return cv;
}

function head(g: G, id: string, x0: number, y0: number, isNew: boolean): void {
  label(g, `${name(id)}${isNew ? "" : " (TODAY)"}`, x0, y0, isNew ? C.yellow : C.slate4);
  const d = ITEMS[id];
  label(g, `${d.merchant?.toUpperCase() ?? ""} ${d.rarity.toUpperCase()}${d.kind === "gate" ? ` ${d.shape ?? ""}` : ""}`, x0, y0 + 7, C.slate4);
}

/** A new rig's row (icon, slots, idle 0-7, active, states, silhouette, deck patches); returns x after it. */
function rigRow(g: G, id: string, x0: number, y0: number): number {
  head(g, id, x0, y0, true);
  let x = x0;
  const y = y0 + 15;
  x = cell(g, itemIcon(id), x, y, 1, C.navy);
  for (const s of [1, 2, 3]) x = cell(g, slot(id, s), x, y, 1, C.navy);
  x += 4;
  for (let f = 0; f < 8; f++) x = cell(g, gateSprite(id, f, false), x, y);
  x += 2;
  x = cell(g, gateSprite(id, 0, true), x, y, SCALE, C.plum2);
  x = cell(g, gateSprite(id, 4, true), x, y, SCALE, C.plum2);
  for (const [lab, st] of RIG_STATES[id] ?? []) {
    label(g, lab, x, y - 7, C.slate4);
    x = cell(g, wave3GateSprite(id, 0, false, st)!, x, y, SCALE, C.deepblue);
  }
  x = cell(g, gateSil(id), x + 2, y, SCALE, C.slate0);
  x += 4;
  for (const p of rigPatches(id)) x = cell(g, p, x, y - 8, 1, C.navy);
  return x;
}

/** A look-alike rig, compact: icon, frame 0, active, silhouette and the 1-star deck patch. */
function rigLook(g: G, id: string, x0: number, y0: number): number {
  head(g, id, x0, y0, false);
  let x = x0;
  const y = y0 + 15;
  x = cell(g, itemIcon(id), x, y, 1, C.navy);
  x = cell(g, gateSprite(id, 0, false), x, y);
  x = cell(g, gateSprite(id, 0, true), x, y, SCALE, C.plum2);
  x = cell(g, gateSil(id), x, y, SCALE, C.slate0);
  x = cell(g, rigPatches(id)[0], x, y - 8, 1, C.navy);
  return x + 6;
}

/** A factory's row: icon 2x, slots, idle 0-7, the stamp, the stamp with its flash silhouette, 2 and 3 stars (compact: icon,
 *  frame 0, stamp, 3 stars). */
function factoryRow(g: G, id: string, x0: number, y0: number, isNew: boolean): number {
  head(g, id, x0, y0, isNew);
  let x = x0;
  const y = y0 + 15;
  x = cell(g, itemIcon(id), x, y, 2, C.navy);
  if (isNew) for (const s of [1, 2, 3]) x = cell(g, slot(id, s), x, y, 1, C.navy);
  x += 2;
  for (let f = 0; f < (isNew ? 8 : 1); f++) x = cell(g, factorySprite(id, f, false), x, y, 1);
  x += 2;
  x = cell(g, factorySprite(id, 0, true), x, y, 1, C.plum2);
  if (isNew) {
    const [fl, fg] = makeCanvas(24, 24);
    fg.drawImage(factorySprite(id, 0, true), 0, 0);
    fg.globalAlpha = 0.6;
    fg.drawImage(factoryFlashSil(id), 0, 0);
    fg.globalAlpha = 1;
    x = cell(g, fl, x, y, 1, C.plum2);
  }
  for (const s of isNew ? [2, 3] : [3]) x = cell(g, factorySprite(id, 0, false, s), x, y, 1, C.deepblue);
  return x + 6;
}

/** A core's or gear piece's row: icon 1x and 3x, slots, on the first gun at 1-3 stars and as an enemy (compact: icon 1x
 *  and 3x, the 1-star gun). */
function itemRow(g: G, id: string, x0: number, y0: number, isNew: boolean): number {
  head(g, id, x0, y0, isNew);
  let x = x0;
  const y = y0 + 15;
  x = cell(g, itemIcon(id), x, y, 1, C.navy);
  x = cell(g, itemIcon(id), x, y, 3, C.navy);
  if (isNew) for (const s of [1, 2, 3]) x = cell(g, slot(id, s), x, y, 1, C.navy);
  x += 2;
  const guns = gunPatches(id);
  for (const p of isNew ? guns : guns.slice(0, 1)) x = cell(g, p, x, y - 2, 1, C.navy);
  return x + 6;
}

function portraitsSection(g: G, x0: number, y0: number): number {
  label(g, "PORTRAITS 24X24 AT 2X: THE SIX NEW NPCS (TOP), TODAY'S 13 CAPTAINS AND THE FOUR HEROES (BELOW)", x0, y0, C.white, false);
  const draw = (k: PortraitKey, x: number, y: number, tag: string, col: string) => {
    rect(g, x - 2, y - 2, 52, 52, C.navy);
    const p = portraitPixels(k);
    const [cv, cg] = makeCanvas(24, 24);
    p.px.forEach((n, j) => { if (n) rect(cg, j % 24, Math.floor(j / 24), 1, 1, C[n]); });
    blit(g, cv, x, y, 2);
    blit(g, cv, x + 50, y + 26, 1);
    label(g, tag, x, y + 52, col);
  };
  const NPC_NAME: Record<string, string> = { brasswick: "BRASSWICK", voss: "MASTER VOSS", grimhold: "GRIMHOLD", karsk: "THANE KARSK", lockjaw: "LOCKJAW", thistlemail: "THISTLEMAIL" };
  WAVE3_NPC_IDS.forEach((k, i) => draw(k, x0 + i * 82, y0 + 14, NPC_NAME[k] ?? k.toUpperCase(), C.yellow));
  PORTRAIT_KEYS.forEach((k, i) => draw(k, x0 + (i % 9) * 82, y0 + 84 + Math.floor(i / 9) * 70, k.toUpperCase(), C.slate4));
  return 84 + 70 * Math.ceil(PORTRAIT_KEYS.length / 9) + 6;
}

function factoryDecks(g: G, x0: number, y0: number): number {
  label(g, "THE FACTORIES IN CRUISER DECKS WITH THEIR BELTS: TWIN MOULD ON FOUNDRY'S MIRRORED BELTS, ARMOR PRESS ON BASTION'S BELT", x0, y0, C.white, false);
  label(g, "STARS 1, 2, 3 (BOW NORTH, THE PLAYER) AND 1 (BOW SOUTH, AN ENEMY); STAMP FLASH; ARMOR PRESS PLATING SLIDE; STOKER FLARE; ANVIL SPARKS", x0, y0 + 9, C.slate4);
  let x = x0;
  const y = y0 + 20;
  for (const [id, hero] of [["twinmould", "foundry"], ["armorpress", "bastion"]] as [string, HeroId][]) {
    for (const [s, facing] of [[1, 0], [2, 0], [3, 0], [1, 2]] as [number, 0 | 2][]) {
      const cv = factoryDeck(id, hero, s, facing);
      rect(g, x - 1, y - 1, cv.width + 2, cv.height + 2, C.navy);
      g.drawImage(cv, x, y);
      label(g, `${name(id)}, ${s} STAR${s > 1 ? "S" : ""}, ${facing ? "ENEMY" : "PLAYER"}`, x, y + cv.height + 2, C.slate4);
      x += cv.width + 6;
    }
  }
  // the battle effects with their state arguments (for I1)
  let ex = x0;
  const ey = y + 184 + 14;
  label(g, "ARMOR PRESS PLATE SLIDE (PLATET 0-0.7 S)", ex, ey, C.slate4);
  for (let k = 0; k < 8; k++) ex = cell(g, wave3FactoryArt("armorpress", 1, false, 1, { plateT: k * 0.1 })!, ex, ey + 9, 2);
  ex += 10;
  label(g, "STOKER FLARE 0-3", ex, ey, C.slate4);
  for (let k = 0; k < 4; k++) ex = cell(g, stokeFlare(k), ex, ey + 9, 3, C.belt1);
  ex += 10;
  label(g, "ANVIL SPARKS 0-2", ex, ey, C.slate4);
  for (let k = 0; k < 3; k++) ex = cell(g, anvilSparks(k), ex, ey + 9, 3, C.belt1);
  ex += 10;
  label(g, "GEAR FACES: IDLE, PAIR/CHARGED", ex, ey, C.slate4);
  for (const id of WAVE3_GEAR) {
    for (const st of [{}, { pair: 0.1, charge: 1 }]) {
      const face = wave3GearFace(id, st)!;
      const [cv, cg] = makeCanvas(5, 5);
      rect(cg, 0, 0, 5, 5, C.ink);
      face.forEach((col, k) => rect(cg, 1 + (k % 3), 1 + Math.floor(k / 3), 1, 1, col));
      ex = cell(g, cv, ex, ey + 9, 4, C.belt1);
    }
  }
  ex += 10;
  label(g, "STEAM GEM BARE / PLATED", ex, ey, C.slate4);
  for (const pl of [false, true]) { rect(g, ex, ey + 9, 16, 16, C.ink); rect(g, ex + 2, ey + 11, 12, 12, wave3Gem("steambreech", pl)!); ex += 20; }
  return ey + 50 - y0;
}

export function drawSheet(g: G, tag: string): void {
  rect(g, 0, 0, SHEET_W, SHEET_H, C.ink);
  label(g, `BELTBATTLES ${VERSION}: WAVE 3, THE 15 NEW PARTS AND THE SIX NEW NPC PORTRAITS (0.8.0 A1) · ${tag}`, 8, 6, C.yellow, false);
  label(g, "1X PIXELS (ROW SPRITES AT 2X). EACH NEW PART (YELLOW) IS FOLLOWED BY ITS LOOK-ALIKES: TODAY'S PARTS OF THE SAME KIND AND MERCHANT (GREY). ICON, CARGO SLOT AT 1-3 STARS, IDLE FRAMES 0-7, ACTIVE (PLUM), STATES (BLUE), SILHOUETTE, ON A DECK AT 1-3 STARS (FURNACE, BOW NORTH) AND 1 STAR (WEAVER, BOW SOUTH)", 8, 17, C.slate4);
  let y = 30;
  label(g, "RIGS (12X12 AT 2X): ICON, SLOTS, IDLE 0-7, ACTIVE, STATES, SILHOUETTE, ON A DECK AT 1-3 STARS AND AS AN ENEMY; THEN ITS LOOK-ALIKES", 8, y, C.white, false);
  y += 12;
  for (const id of WAVE3_RIGS) {
    let x = rigRow(g, id, 8, y) + 10;
    for (const o of LOOKALIKES[id]) x = rigLook(g, o, x, y);
    y += 62;
  }
  y += 4;
  label(g, "FACTORIES (24X24 AT 1X): ICON 2X, SLOTS, IDLE 0-7, STAMP, STAMP + FLASH SILHOUETTE, 2 AND 3 STARS; THEN ITS LOOK-ALIKES", 8, y, C.white, false);
  y += 12;
  for (const id of WAVE3_FACTORIES) {
    let x = factoryRow(g, id, 8, y, true) + 10;
    for (const o of LOOKALIKES[id]) x = factoryRow(g, o, x, y, false);
    y += 50;
  }
  y += 4;
  label(g, "TURRET CORES AND GEAR: ICON 1X AND 3X, SLOTS, ON THE FIRST GUN AT 1-3 STARS (FURNACE, BOW NORTH) AND AS AN ENEMY (WEAVER, BOW SOUTH); THEN ITS LOOK-ALIKES", 8, y, C.white, false);
  y += 12;
  for (const id of [...WAVE3_CORES, ...WAVE3_GEAR]) {
    let x = itemRow(g, id, 8, y, true) + 10;
    for (const o of LOOKALIKES[id]) x = itemRow(g, o, x, y, false);
    y += 64;
  }
  y += 8;
  y += factoryDecks(g, 8, y);
  y += 8;
  portraitsSection(g, 8, y);
}

// --------------------------------------------------------------------------------------------------------- the phone

/** The phone's build-screen scale (390x844 CSS at dpr 3), from the game's own pick. */
export const PHONE_PW = 1170, PHONE_PH = 2532;
export const PHONE_SCALE = buildScale(PHONE_PW, PHONE_PH, true);

/** Two decks that hold every wave-3 part (with P1's defs in memory), for the phone view. */
export function phoneDecks(): [HTMLCanvasElement, HTMLCanvasElement] {
  // FOUNDRY: TWIN MOULD on the mirrored belts, the I and II rigs beside them, TWIN TRIGGER and SEAM WELDER on gun 1, ANVIL
  const a = cloneBuild(heroStartBuild("foundry", 1));
  const sigA = a.routes[0]?.factory;
  const pa = a.items.find((q) => q.uid === sigA);
  if (pa) pa.def = "twinmould";
  // BASTION: ARMOR PRESS, the L, T and X rigs and STOKER, SPALL CATCHER and STEAM BREECH on its gun
  const b = cloneBuild(heroStartBuild("bastion", 1));
  const sigB = b.routes[0]?.factory;
  const pb = b.items.find((q) => q.uid === sigB);
  if (pb) { pb.def = "armorpress"; pb.stars = 2; }
  const place = (bd: Build, ids: string[]) => {
    let uid = 950;
    for (const id of ids) {
      const occ = occupancy(bd);
      let best: { x: number; y: number; rot: number; n: number } | null = null;
      for (let k = 0; k < GRID * GRID; k++) {
        if (occ[k].item >= 0 || occ[k].route >= 0) continue;
        for (let rot = 0; rot < 4; rot++) {
          const t = cloneBuild(bd);
          t.items.push({ uid: 999, def: id, x: kx(k), y: ky(k), ...rotField(id, rot) });
          const n = hitsOfRig(t, 999, rigHits(t)).length;
          if (!best || n > best.n) best = { x: kx(k), y: ky(k), rot, n };
        }
      }
      if (best) bd.items.push({ uid: uid++, def: id, x: best.x, y: best.y, ...rotField(id, best.rot) });
    }
  };
  place(a, ["plateroller", "twingauge", "pincer", "twinlatch"]);
  place(b, ["braceframe", "stoker", "platebreaker", "shieldwall"]);
  a.mods = [{ uid: 940, def: "twintrigger", turret: 0 }, { uid: 941, def: "seamwelder", turret: 0, stars: 2 }, { uid: 942, def: "anvil", turret: 1 }];
  b.mods = [{ uid: 943, def: "spallcatcher", turret: 0, stars: 3 }, { uid: 944, def: "steambreech", turret: 0 }];
  return [deck(a, 0, 0.4), deck(b, 0, 0.4)];
}
