// 0.8.0 H1 M1 (REQ-BFG-011): the FOUNDRY and BASTION art contact sheet (a dev page, tools/heroes-art.html; not in the
// game build). It draws only through the game's own render entry points (portraitPixels, factorySprite, payloadSprite,
// shellSprite, trailColors, turretArt, hullSprite, miniCruiser, and live Arenas through drawArena), so the same page shows
// what any tree draws: run on v070-rc it shows the placeholders the race heroes had (a STAMP PRESS for each signature,
// cinder slugs, the light art, the elf and orc hulls, no portrait); run on the H1 branch it shows the race art.
// Every cell has today's FURNACE/WEAVER art beside it for a style check, in player (bow north) and enemy (bow south)
// colouring and in landscape. tools/heroes-art-shot.mjs renders it at 1x (desktop's integer scale is larger, the phone's
// smaller: both are nearest-neighbour multiples of this) and at 3x.

import { C, FACTION } from "../src/render/palette";
import { makeCanvas, rect, type G } from "../src/render/pixel";
import { drawText } from "../src/render/font";
import { frameForHull, type Facing } from "../src/render/frame";
import { HULL_M, hullSprite } from "../src/render/hull";
import { factoryFlashSil, factorySprite } from "../src/render/sprites";
import { TS, turretArt } from "../src/render/turret";
import { payloadHalo, payloadSprite, shellSprite, trailColors } from "../src/render/ammo";
import { miniCruiser } from "../src/render/eventArt";
import { portraitPixels, type PortraitKey } from "../src/render/portraits";
import { Arena } from "../src/game/arena";
import { drawArenaStill } from "./stillDraw"; // CUSTOM-2a: drawArena (the tracked hulls) is gone
import { HEROES, type Faction, type HeroId, type TurretKind } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { VERSION } from "../src/version";

export const SHEET_W = 1080, SHEET_H = 1260;

const label = (g: G, s: string, x: number, y: number, col: string = C.bone, small = false): void => {
  drawText(g, s, x, y, col, { font: small ? "3" : "5" });
};

export function drawSheet(g: G, tag: string): void {
  rect(g, 0, 0, SHEET_W, SHEET_H, C.ink);
  label(g, `BELTBATTLES ${VERSION}: FOUNDRY (HUMAN) AND BASTION (DWARF) ART · ${tag}`, 8, 6, C.yellow);
  label(g, "1X PIXELS. FURNACE AND WEAVER BESIDE THEM FOR A STYLE CHECK. PLAYER = BOW NORTH, ENEMY = BOW SOUTH.", 8, 16, C.slate4, true);
  portraits(g, 8, 30);
  factories(g, 300, 30);
  ammo(g, 8, 150);
  turrets(g, 8, 300);
  minis(g, 760, 150);
  cruisers(g, 8, 520);
}

function portraits(g: G, x: number, y: number): void {
  label(g, "PORTRAITS 24X24, AT 2X (HERO SELECT)", x, y, C.white);
  const keys: PortraitKey[] = ["furnace", "weaver", "foundry", "bastion"];
  keys.forEach((k, i) => {
    const px = x + i * 66, py = y + 12;
    rect(g, px - 2, py - 2, 52, 52, C.navy);
    try {
      const p = portraitPixels(k);
      const [cv, cg] = makeCanvas(24, 24);
      p.px.forEach((n, j) => { if (n) rect(cg, j % 24, Math.floor(j / 24), 1, 1, C[n]); });
      g.imageSmoothingEnabled = false;
      g.drawImage(cv, px, py, 48, 48);
    } catch {
      label(g, "NO", px + 14, py + 14, C.red, true);
      label(g, "PORTRAIT", px + 6, py + 22, C.red, true);
    }
    label(g, k.toUpperCase(), px, py + 52, C.slate4, true);
  });
}

function factories(g: G, x: number, y: number): void {
  label(g, "FACTORIES 24X24: IDLE FRAMES 0-7, THE STAMP, THE STAMP FLASH", x, y, C.white);
  ["crucible", "wardworks", "kiln", "loom"].forEach((id, r) => {
    const yy = y + 12 + r * 27;
    label(g, id.toUpperCase(), x, yy + 9, C.slate4, true);
    for (let f = 0; f < 8; f++) g.drawImage(factorySprite(id, f, false), x + 52 + f * 26, yy);
    g.drawImage(factorySprite(id, 0, true), x + 52 + 8 * 26 + 6, yy);
    g.drawImage(factorySprite(id, 0, true), x + 52 + 9 * 26 + 6, yy);
    g.globalAlpha = 0.6;
    g.drawImage(factoryFlashSil(id), x + 52 + 9 * 26 + 6, yy);
    g.globalAlpha = 1;
  });
}

function ammo(g: G, x: number, y: number): void {
  label(g, "AMMO ON THE BELT 7X7 AT DAMAGE TIERS 0-4 (HALO FROM 3), SHELLS N E S W, TRAILS", x, y, C.white);
  ["blank", "alloy", "bulwark", "cinder", "thread", "plain"].forEach((kind, r) => {
    const yy = y + 12 + r * 22;
    label(g, kind.toUpperCase(), x, yy + 4, C.slate4, true);
    for (let t = 0; t <= 4; t++) {
      const bx = x + 56 + t * 22;
      rect(g, bx - 3, yy - 3, 17, 17, C.belt1);
      if (t >= 3) g.drawImage(payloadHalo(kind, t), bx - 2, yy - 2);
      g.drawImage(payloadSprite(kind, t), bx, yy);
    }
    for (let d = 0; d < 4; d++) g.drawImage(shellSprite(kind, 2, d), x + 176 + d * 16, yy);
    trailColors(kind, 3).forEach((c, i) => rect(g, x + 250 + i * 6, yy + 2, 5, 4, c));
  });
}

function turrets(g: G, x: number, y: number): void {
  label(g, "TURRETS 48X48 (BASE + BARREL), FACINGS 0 (PLAYER) 2 (ENEMY) 1 3 (LANDSCAPE), ON THE HULL'S BOW BAND", x, y, C.white);
  const rows: [string, Faction, TurretKind][] = [
    ["FOUNDRY MEDIUM", "human", "medium"], ["BASTION HEAVY", "dwarf", "heavy"],
    ["HUMAN HEAVY", "human", "heavy"], ["HUMAN LIGHT", "human", "light"],
    ["DWARF MEDIUM", "dwarf", "medium"], ["DWARF LIGHT", "dwarf", "light"],
    ["FURNACE HEAVY", "orc", "heavy"], ["WEAVER LIGHT", "elf", "light"],
  ];
  rows.forEach(([name, faction, kind], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const xx = x + col * 380, yy = y + 12 + row * 50;
    label(g, name, xx, yy + 18, C.slate4, true);
    ([0, 2, 1, 3] as Facing[]).forEach((f, k) => {
      const cx = xx + 70 + k * 56;
      const P = FACTION[faction];
      rect(g, cx, yy, 48, 48, P.hull2);
      rect(g, cx, yy + 36, 48, 12, P.deck1);
      const a = turretArt(kind, faction, f);
      g.drawImage(a.base, cx, yy);
      g.drawImage(a.barrel, cx, yy);
    });
  });
}

function minis(g: G, x: number, y: number): void {
  label(g, "ROAD-EVENT CRUISERS", x, y, C.white);
  (["human", "dwarf", "orc", "elf"] as Faction[]).forEach((f, i) => {
    const yy = y + 12 + i * 26;
    rect(g, x - 2, yy - 2, 100, 24, C.plum1);
    try {
      g.drawImage(miniCruiser(f as "orc"), x, yy);
      g.drawImage(miniCruiser(f as "orc", true), x + 50, yy);
    } catch { label(g, "-", x, yy, C.red, true); }
    label(g, f.toUpperCase(), x + 104, yy + 8, C.slate4, true);
  });
}

/** One live battle drawn as the game draws it, stepped `secs` seconds; portrait (bows north/south) or landscape. */
function fight(g: G, x: number, y: number, a: HeroId, b: HeroId, day: number, landscape: boolean, secs: number): void {
  const A = day ? heroRefBuild(a, day) : heroStartBuild(a, 1);
  const B = day ? heroRefBuild(b, day) : heroStartBuild(b, 500);
  const arena = new Arena(A, B, 4242 + day, null);
  arena.quiet = true;
  for (let t = 0; t < secs; t += 1 / 60) arena.update(1 / 60);
  const W = landscape ? 330 : 172, H = landscape ? 172 : 330;
  const [cv, cg] = makeCanvas(W, H);
  rect(cg, 0, 0, W, H, C.soil1);
  const f0 = landscape ? frameForHull(1, 4 + HULL_M, 8) : frameForHull(0, 8, H - 146);
  const f1 = landscape ? frameForHull(3, W - 146, 8) : frameForHull(2, 8, 4);
  arena.setFrames([f0, f1], landscape ? [[-1, 0], [1, 0]] : [[0, 1], [0, -1]]);
  drawArenaStill(cg, arena, W, H);
  g.drawImage(cv, x, y);
  label(g, `${HEROES[a].name} (PLAYER) VS ${HEROES[b].name}${day ? `, DAY ${day} REFERENCE DECKS` : ", START DECKS"}, ${secs} S`, x, y + H + 3, C.slate4, true);
}

function cruisers(g: G, x: number, y: number): void {
  label(g, "CRUISERS IN BATTLE (THE GAME'S OWN DRAW), PORTRAIT AND LANDSCAPE", x, y, C.white);
  fight(g, x, y + 12, "foundry", "bastion", 0, false, 6);
  fight(g, x + 184, y + 12, "bastion", "foundry", 5, false, 9);
  fight(g, x + 368, y + 12, "foundry", "furnace", 7, false, 8);
  fight(g, x + 552, y + 12, "weaver", "bastion", 3, false, 7);
  fight(g, x, y + 360, "foundry", "bastion", 10, true, 8);
  fight(g, x + 350, y + 360, "bastion", "weaver", 10, true, 8);
  // the hull sprites alone (no deck machinery), player and enemy facing
  const hy = y + 560;
  label(g, "HULLS ALONE: FOUNDRY 0 AND 2, BASTION 0 AND 2, FURNACE 0, WEAVER 0", x, hy, C.white);
  ([["foundry", 0], ["foundry", 2], ["bastion", 0], ["bastion", 2], ["furnace", 0], ["weaver", 0]] as [HeroId, Facing][]).forEach(([h, f], i) => {
    g.drawImage(hullSprite(h, f), x + i * 176, hy + 12);
  });
  void TS;
}
