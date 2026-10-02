// 0.8.0 A1 M0 (REQ-BFG-022): the ALL-EXISTING-ART digest (BRIEF-wave3-A1 section 3, rule 1). A dev page
// (tools/art-digest.html; never in the game build) that draws every piece of art the game has through the game's own
// render entry points and hashes each canvas's pixels (FNV-1a over RGBA). tools/art-digest-run.mjs runs it in Chromium on
// any tree; A1's gate runs it on a fresh git-archive export of v080-heroes dae2177 and on wave3-art, and the two outputs
// must be cmp-identical. It enumerates only what exists (the enumerable ITEMS, PORTRAIT_KEYS, HEROES, AMMO, EVENT_IDS),
// plus a few unknown ids that pin each entry point's fallback, so wave 3's art (keyed by ids that no ITEMS entry carries
// here) adds nothing to it. H1's tools/fwDigest.ts (FURNACE and WEAVER only) stays as it is; this one covers everything:
//  - every module: its icon and its cargo/inspector slot at 1-3 stars; a factory's sprite (frames 0-7, idle and stamp,
//    stars 1-3) and flash silhouette; a rig's sprite (frames 0-7, idle and active) and its silhouette;
//  - every core's socket-gem colour on every hero's guns (gemColor), and each hero's signature glow;
//  - hulls of all six heroes (facings 0-3: sprite, flash, rim, shade) and the tread strips;
//  - turrets of every kind on every faction (facings 0-3: base, barrel, tip);
//  - every ammo kind (tiers 0-4: belt sprite, payload, halo, shell, pellet, volley round, trail);
//  - belts, corners, turntables, stoppers, rig nozzles and tips, explosions, sparks, the small UI and road-event icons,
//    the fx sprites, and FOUNDRY's and BASTION's signature visuals (FUSE, CLANK, SYNC, the plating strip);
//  - the road-event cruisers of every faction and every road scene for every hero, with a rig and a core on offer;
//  - every portrait (PORTRAIT_KEYS: today's captains and the four heroes with portraits), as pixel data and as a canvas;
//  - build-screen decks (hull, machinery, turrets) of all six heroes' start decks and reference decks (days 1, 4, 7, 10),
//    bow north and bow south, at three animation times; and decks that carry every rig, every factory (with its chutes),
//    every gear piece and every core at 1-3 stars on every hero's hull;
//  - live battles of the four playable heroes through Arena + drawArena at fixed render times, portrait and landscape,
//    with their battle plates (drawPlate).

import { makeCanvas, type G } from "../src/render/pixel";
import { frameForHull, type Facing } from "../src/render/frame";
import { HULL_M, hullFlash, hullRim, hullShade, hullSprite, treadStrip } from "../src/render/hull";
import {
  beltCorner, beltIcon, beltStopper, beltStraight, boltIcon, coinIcon, explosion, factoryFlashSil, factorySprite, gateSil,
  gateSprite, heartIcon, itemIcon, rigNozzle, rigTip, sparkStar, turntable, wrenchIcon, type ArrowState, type BeltTint,
} from "../src/render/sprites";
import { turretArt } from "../src/render/turret";
import {
  ammoSprite, flameCone, heatHalo, payloadHalo, payloadSprite, pelletSprite, shadowDisc, shellSprite, trailColors, volleySprite,
} from "../src/render/ammo";
import { arrowDir, muzzleFlash, ringSprite, scorchSprite } from "../src/render/fxsprites";
import { crate, crateIcon, die, figure, gantry, miniCruiser, pennant, rerollIcon, shieldIcon, skullIcon, tagIcon, wagon } from "../src/render/eventArt";
import { drawScene } from "../src/render/scenes";
import { PORTRAIT_KEYS, portraitImage, portraitPixels } from "../src/render/portraits";
import { gemColor } from "../src/render/coreArt";
import { C } from "../src/render/palette";
import { drawPlatingStrip, fuseFlash, platingClank, syncIcon } from "../src/render/raceFx";
import { cruiserModel, drawHull, drawTurrets, type CruiserView } from "../src/render/cruiser";
import { drawMachinery } from "../src/render/machinery";
import { itemSlot } from "../src/ui/ui";
import { Arena } from "../src/game/arena";
import { drawArena } from "../src/game/arenaDraw";
import { drawPlate } from "../src/screens/battleHud";
import type { Game } from "../src/game/game";
import { EVENT_IDS } from "../src/game/events";
import { AMMO, GRID, HEROES, ITEMS, type Faction, type HeroId, type TurretKind } from "../src/sim/content";
import { DX, DY, cloneBuild, inGrid, key, kx, ky, occupancy, rotField, turretSlots, type Build } from "../src/sim/deck";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";

const out: Record<string, string> = {};

function fnv(bytes: Uint8ClampedArray | string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= typeof bytes === "string" ? bytes.charCodeAt(i) : bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + ":" + bytes.length;
}

const pix = (c: HTMLCanvasElement): string => fnv(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data);
const put = (k: string, c: HTMLCanvasElement): void => { out[k] = `${c.width}x${c.height}:${pix(c)}`; };

/** A seeded Math.random, so nothing cosmetic depends on the run (the battle effects use their own RNG anyway). */
function seedRandom(seed: number): void {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HERO_IDS = Object.keys(HEROES) as HeroId[];
const PLAYABLE: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const FACTIONS: Faction[] = ["orc", "elf", "human", "dwarf", "beastfolk", "unaligned"];
const DEFS = Object.values(ITEMS); // enumerable entries only: what the game lists
// ids no ITEMS entry carries, and prototype keys: they pin each entry point's fallback (a wave-3 hook sits in front of it)
const UNKNOWN = ["zz-none", "constructor", "toString", "hasOwnProperty"];

// ------------------------------------------------------------------------------------------------- modules and icons

function modules(): void {
  const ids = [...DEFS.map((d) => d.id), ...UNKNOWN];
  for (const id of ids) {
    put(`icon/${id}`, itemIcon(id));
    for (const stars of [1, 2, 3]) {
      const [cv, g] = makeCanvas(20, 20);
      itemSlot(g as G, 1, 1, ITEMS[id] && Object.prototype.hasOwnProperty.call(ITEMS, id) ? id : null, false, 0, stars);
      put(`slot/${id}/${stars}`, cv);
    }
  }
  const factories = [...DEFS.filter((d) => d.kind === "factory").map((d) => d.id), ...UNKNOWN];
  for (const id of factories) {
    for (const stars of [1, 2, 3]) {
      for (let f = 0; f < 8; f++) for (const flash of [false, true]) put(`factory/${id}/${stars}/${f}/${flash ? 1 : 0}`, factorySprite(id, f, flash, stars));
      put(`factorySil/${id}/${stars}`, factoryFlashSil(id, stars));
    }
  }
  const rigs = [...DEFS.filter((d) => d.kind === "gate").map((d) => d.id), ...UNKNOWN];
  for (const id of rigs) {
    for (let f = 0; f < 8; f++) for (const active of [false, true]) put(`gate/${id}/${f}/${active ? 1 : 0}`, gateSprite(id, f, active));
    put(`gateSil/${id}`, gateSil(id));
  }
  const cores = [...DEFS.filter((d) => d.kind === "core").map((d) => d.id), ...UNKNOWN];
  for (const h of HERO_IDS) {
    out[`gem/-/${h}`] = gemColor(undefined, h);
    for (const id of cores) out[`gem/${id}/${h}`] = String(gemColor(id, h));
  }
}

// ---------------------------------------------------------------------------------------- hulls, turrets, ammo, sprites

function hullsTurretsAmmo(): void {
  for (const h of HERO_IDS) for (let f = 0; f < 4; f++) {
    put(`hull/${h}/${f}`, hullSprite(h, f as Facing));
    put(`hullFlash/${h}/${f}`, hullFlash(h, f as Facing));
    put(`hullRim/${h}/${f}`, hullRim(h, f as Facing));
    put(`hullShade/${h}/${f}`, hullShade(h, f as Facing));
  }
  put("tread/v", treadStrip(true));
  put("tread/h", treadStrip(false));
  for (const kind of ["heavy", "light", "medium", "adaptable"] as TurretKind[]) for (const fac of FACTIONS) for (let f = 0; f < 4; f++) {
    const a = turretArt(kind, fac, f as Facing);
    put(`turret/${kind}/${fac}/${f}/base`, a.base);
    put(`turret/${kind}/${fac}/${f}/barrel`, a.barrel);
    out[`turret/${kind}/${fac}/${f}/tip`] = String(a.tip);
  }
  for (const kind of [...Object.keys(AMMO), "ember", "spark"]) {
    for (let t = 0; t <= 4; t++) {
      put(`ammo/${kind}/${t}`, ammoSprite(kind, t));
      put(`payload/${kind}/${t}`, payloadSprite(kind, t));
      if (t >= 3) put(`halo/${kind}/${t}`, payloadHalo(kind, t));
      for (let d = 0; d < 4; d++) {
        put(`shell/${kind}/${t}/${d}`, shellSprite(kind, t, d));
        put(`pellet/${kind}/${t}/${d}`, pelletSprite(kind, t, d));
        put(`volley/${kind}/${t}/${d}`, volleySprite(kind, t, d));
      }
      out[`trail/${kind}/${t}`] = trailColors(kind, t).join(",");
    }
  }
  for (let t = 0; t <= 4; t++) put(`heatHalo/${t}`, heatHalo(t));
  for (let d = 0; d < 4; d++) put(`flameCone/${d}`, flameCone(d));
  for (const w of [4, 6, 8]) put(`shadow/${w}`, shadowDisc(w));
  for (const v of ["normal", "warn", "dead"] as const) {
    for (const tint of ["n", "f", "o", "s"] as BeltTint[]) for (let fr = 0; fr < 6; fr++) {
      for (let d = 0; d < 4; d++) put(`belt/${v}/${tint}/${fr}/${d}`, beltStraight(d, fr, v, tint));
      for (const [a, b] of [[0, 1], [0, 3], [1, 2], [1, 0], [2, 3], [2, 1], [3, 0], [3, 2]]) put(`corner/${v}/${tint}/${fr}/${a}${b}`, beltCorner(a, b, fr, v, tint));
    }
    for (let a = 0; a < 8; a++) put(`turntable/${v}/${a}`, turntable(a, v));
  }
  for (let d = 0; d < 4; d++) {
    put(`stopper/${d}`, beltStopper(d));
    for (const st of [0, 1, 2, 3] as ArrowState[]) {
      put(`nozzle/${d}/${st}`, rigNozzle(d, st));
      put(`tip/${d}/${st}`, rigTip(d, st));
    }
  }
  for (const size of [12, 20, 28]) for (let f = 0; f < 7; f++) for (const cool of [false, true]) put(`explosion/${size}/${f}/${cool ? 1 : 0}`, explosion(size, f, cool));
  for (let f = 0; f < 3; f++) put(`sparkStar/${f}`, sparkStar(f));
  put("coin", coinIcon());
  put("heart/1", heartIcon(true));
  put("heart/0", heartIcon(false));
  put("belticon", beltIcon());
  put("wrench", wrenchIcon());
  put("bolt", boltIcon());
  for (const heavy of [false, true]) for (let f = 0; f < 3; f++) for (let d = 0; d < 4; d++) put(`muzzle/${heavy ? 1 : 0}/${f}/${d}`, muzzleFlash(heavy, f, d));
  for (const r of [9, 14]) put(`ring/${r}`, ringSprite(r, C.fire4));
  for (const r of [3, 5, 7]) for (let v = 0; v < 3; v++) put(`scorch/${r}/${v}`, scorchSprite(r, v));
  for (let d = 0; d < 4; d++) put(`arrow/${d}`, arrowDir(C.yellow, d));
  for (let f = 0; f < 4; f++) put(`fuse/${f}`, fuseFlash(f));
  for (let f = 0; f < 3; f++) put(`clank/${f}`, platingClank(f));
  for (const lit of [false, true]) for (const f of [0, 1]) put(`sync/${lit ? 1 : 0}/${f}`, syncIcon(lit, f));
  for (const [plate, shown, shine] of [[0, 0, 0], [7, 7, 0], [12, 16, 0], [24, 24, 0.7], [13, 13, 0.3]]) {
    const [cv, g] = makeCanvas(124, 4);
    drawPlatingStrip(g as G, 2, 1, 120, plate, shown, 24, 6, shine);
    put(`strip/${plate}/${shown}/${shine}`, cv);
  }
}

// ------------------------------------------------------------------------------------------ road events and portraits

function roadAndPortraits(): void {
  for (const fac of FACTIONS) for (const w of [false, true]) put(`mini/${fac}/${w ? 1 : 0}`, miniCruiser(fac, w));
  put("ev/shield", shieldIcon());
  put("ev/skull", skullIcon());
  put("ev/tag", tagIcon());
  put("ev/reroll", rerollIcon());
  put("ev/crateIcon", crateIcon());
  put("ev/crate", crate());
  put("ev/gantry", gantry());
  put("ev/wagon", wagon(C.slate2, C.slate3, C.slate1));
  put("ev/figure", figure(C.verd3, C.verd2));
  for (let n = 1; n <= 6; n++) put(`ev/die/${n}`, die(n));
  for (let f = 0; f < 4; f++) put(`ev/pennant/${f}`, pennant(C.red, C.maroon, f));
  for (const h of HERO_IDS) for (const id of EVENT_IDS) for (const offer of ["whetstone", "rotary"]) for (const calm of [false, true]) {
    const [cv, g] = makeCanvas(180, 90);
    drawScene(g as G, id, 0, 0, 180, 90, h, offer, 1.25, calm);
    put(`scene/${h}/${id}/${offer}/${calm ? 1 : 0}`, cv);
  }
  for (const k of PORTRAIT_KEYS) {
    out[`portrait/${k}`] = fnv(portraitPixels(k).px.map((c) => c ?? "-").join(","));
    put(`portraitImage/${k}`, portraitImage(k));
  }
}

// ------------------------------------------------------------------------------------------------------ deck views

/** A build drawn as the build screen draws it (no sim): hull, machinery, turrets. Bow north (0) or south (2). */
function deckView(name: string, b: Build, facing: 0 | 2, times: number[] = [0.4]): void {
  const model = cruiserModel(b);
  for (const t of times) {
    const [cv, g] = makeCanvas(176, 184);
    const f = facing === 0 ? frameForHull(0, 10, 32) : frameForHull(2, 10, 12);
    const v: CruiserView = { side: facing === 0 ? 0 : 1, build: b, model, frame: f, t, tread: Math.floor(t * 20) };
    drawHull(g as G, v);
    drawMachinery(g as G, v);
    drawTurrets(g as G, v);
    put(`deck/${name}/${facing}/${t}`, cv);
  }
}

/** Free deck cells (no item, no belt), those beside a belt tile first. */
function freeCells(b: Build): number[] {
  const occ = occupancy(b);
  const cells: number[] = [];
  for (let k = 0; k < GRID * GRID; k++) if (occ[k].item < 0 && occ[k].route < 0) cells.push(k);
  const nearBelt = (k: number): number => ([0, 1, 2, 3].some((d) => {
    const x = kx(k) + DX[d], y = ky(k) + DY[d];
    return inGrid(x, y) && occ[key(x, y)].route >= 0;
  }) ? 1 : 0);
  return cells.sort((a, c) => nearBelt(c) - nearBelt(a) || a - c);
}

function decks(): void {
  for (const h of HERO_IDS) {
    for (const facing of [0, 2] as const) {
      deckView(`start/${h}`, heroStartBuild(h, 1), facing, [0, 0.4, 1.3]);
      for (const d of [1, 4, 7, 10]) deckView(`ref/${h}/${d}`, heroRefBuild(h, d), facing, [0.4, 1.3]);
    }
  }
  const rigs = DEFS.filter((d) => d.kind === "gate").map((d) => d.id);
  const factories = DEFS.filter((d) => d.kind === "factory" && d.size === 2).map((d) => d.id);
  const gear = DEFS.filter((d) => d.kind === "mod").map((d) => d.id);
  const cores = DEFS.filter((d) => d.kind === "core").map((d) => d.id);
  for (const h of HERO_IDS) {
    const start = heroStartBuild(h, 1);
    for (const stars of [1, 2, 3]) {
      // every rig, a deck at a time, on the free cells beside the start deck's belt (rotations 0-3 in turn)
      for (let i0 = 0; i0 < rigs.length; i0 += 12) {
        const b = cloneBuild(start);
        const cells = freeCells(b);
        rigs.slice(i0, i0 + 12).forEach((id, i) => {
          const k = cells[i];
          if (k === undefined) return;
          b.items.push({ uid: 900 + i, def: id, x: kx(k), y: ky(k), ...(stars > 1 ? { stars } : {}), ...rotField(id, (i0 + i) % 4) });
        });
        deckView(`rigs/${h}/${stars}/${i0}`, b, 0, [0.4, 1.3]);
      }
      // every factory in the start deck's signature factory's place, so its belts leave through its chutes
      const sig = start.routes[0]?.factory;
      for (const id of factories) {
        const b = cloneBuild(start);
        const p = b.items.find((q) => q.uid === sig);
        if (!p) continue;
        p.def = id;
        if (stars > 1) p.stars = stars;
        deckView(`factory/${h}/${stars}/${id}`, b, 0, [0.4, 1.3]);
      }
      // every gear piece on the first gun (side by side), and on every gun in turn
      const slots = turretSlots(start).filter((s) => s.td && !s.td.empty).length;
      const gb = cloneBuild(start);
      gb.mods = gear.map((id, i) => ({ uid: 800 + i, def: id, turret: 0, ...(stars > 1 ? { stars } : {}) }));
      deckView(`gear/${h}/${stars}`, gb, 0);
      const gs = cloneBuild(start);
      gs.mods = gear.map((id, i) => ({ uid: 800 + i, def: id, turret: i % Math.max(1, slots), ...(stars > 1 ? { stars } : {}) }));
      deckView(`gearSpread/${h}/${stars}`, gs, 2);
      // every core in the first gun's socket
      for (const id of cores) {
        const cb = cloneBuild(start);
        cb.mods = [{ uid: 700, def: id, turret: 0, ...(stars > 1 ? { stars } : {}) }];
        deckView(`core/${h}/${stars}/${id}`, cb, 0);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------ live battles

function battles(): void {
  const fights: [string, () => [Build, Build]][] = [
    ["start-fw", () => [heroStartBuild("furnace", 1), heroStartBuild("weaver", 500)]],
    ["start-ob", () => [heroStartBuild("foundry", 1), heroStartBuild("bastion", 500)]],
    ["start-bf", () => [heroStartBuild("bastion", 1), heroStartBuild("furnace", 500)]],
    ["start-wo", () => [heroStartBuild("weaver", 1), heroStartBuild("foundry", 500)]],
    ["d5-wf", () => [heroRefBuild("weaver", 5), heroRefBuild("furnace", 5)]],
    ["d5-bo", () => [heroRefBuild("bastion", 5), heroRefBuild("foundry", 5)]],
    ["d10-fb", () => [heroRefBuild("furnace", 10), heroRefBuild("bastion", 10)]],
    ["d10-ow", () => [heroRefBuild("foundry", 10), heroRefBuild("weaver", 10)]],
    ["d7-bb", () => [heroRefBuild("bastion", 7), heroRefBuild("bastion", 7)]],
    ["d3-oo", () => [heroRefBuild("foundry", 3), heroRefBuild("foundry", 3)]],
  ];
  for (const [name, mk] of fights) for (const landscape of [false, true]) {
    seedRandom(7);
    const [a, b] = mk();
    const arena = new Arena(a, b, 2026, null);
    arena.quiet = true;
    const W = landscape ? 330 : 172, H = landscape ? 172 : 330;
    const f0 = landscape ? frameForHull(1, 4 + HULL_M, 8) : frameForHull(0, 8, H - 146);
    const f1 = landscape ? frameForHull(3, W - 146, 8) : frameForHull(2, 8, 4);
    arena.setFrames([f0, f1], landscape ? [[-1, 0], [1, 0]] : [[0, 1], [0, -1]]);
    let t = 0;
    for (const at of [2.5, 6, 11]) {
      while (t < at) { arena.update(1 / 60); t += 1 / 60; }
      const [cv, g] = makeCanvas(W, H);
      drawArena(g as G, arena, W, H);
      put(`arena/${name}/${landscape ? "land" : "port"}/${at}`, cv);
      const [pc, pg] = makeCanvas(140, 26);
      const game = { t: arena.clock } as unknown as Game;
      drawPlate(pg as G, game, arena, { x: 2, y: 2, w: 132, h: 10 }, 0, HEROES[a.hero].name, String(Math.ceil(arena.b.sides[0].hull.hp)));
      drawPlate(pg as G, game, arena, { x: 2, y: 14, w: 132, h: 9 }, 1, HEROES[b.hero].name, String(Math.ceil(arena.b.sides[1].hull.hp)), "OFFLINE");
      put(`plates/${name}/${landscape ? "land" : "port"}/${at}`, pc);
    }
  }
  void PLAYABLE;
}

try {
  seedRandom(1);
  modules();
  hullsTurretsAmmo();
  roadAndPortraits();
  decks();
  battles();
  (window as unknown as { __digest: unknown }).__digest = { ok: true, n: Object.keys(out).length, out };
} catch (e) {
  (window as unknown as { __digest: unknown }).__digest = { ok: false, error: String((e as Error)?.stack ?? e) };
}
