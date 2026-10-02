// 0.8.0 H1 (REQ-BFG-011): "Furnace and Weaver screens stay unchanged". A dev page (tools/fw-digest.html) that draws
// everything a FURNACE or WEAVER run can show through the game's own render entry points and hashes each canvas's pixels
// (FNV-1a over RGBA). tools/fw-digest-run.mjs runs it in Chromium on any tree; the H1 check runs it on a v070-rc export
// and on the branch, and the two digests must be equal key for key. Nothing race-only is drawn here (the CRUCIBLE and
// WARDWORKS, the ALLOY and BULWARK ammo, a human or dwarf hull or turret); everything else is, at every frame or tier:
//  - hulls (furnace, weaver; facings 0-3; flash, rim, shade), tread strips;
//  - turrets of every kind on orc and elf hulls, facings 0-3 (base and barrel);
//  - every other factory (frames 0-7, idle and stamp, stars 1-3, flash silhouette), every rig (frames, active, silhouette),
//    every item icon;
//  - every other ammo kind on the belt (tiers 0-4, halos), shells, pellets and volley rounds (tiers 0-4, 4 directions),
//    trail colours;
//  - the road-event cruisers (orc, elf, wrecked) and every road scene for a FURNACE and a WEAVER player;
//  - every rival's portrait and FURNACE's and WEAVER's (pixel data);
//  - live Furnace/Weaver battles through Arena + drawArena at fixed render times, portrait and landscape framing.

import { makeCanvas, type G } from "../src/render/pixel";
import { frameForHull, type Facing } from "../src/render/frame";
import { HULL_M, hullFlash, hullRim, hullShade, hullSprite, treadStrip } from "../src/render/hull";
import { factoryFlashSil, factorySprite, gateSil, gateSprite, itemIcon } from "../src/render/sprites";
import { turretArt } from "../src/render/turret";
import { ammoSprite, payloadHalo, payloadSprite, pelletSprite, shellSprite, trailColors, volleySprite } from "../src/render/ammo";
import { miniCruiser } from "../src/render/eventArt";
import { drawScene } from "../src/render/scenes";
import { portraitPixels, type PortraitKey } from "../src/render/portraits";
import { Arena } from "../src/game/arena";
import { drawArena } from "../src/game/arenaDraw";
import { EVENT_IDS } from "../src/game/events";
import { AMMO, ITEMS, type HeroId, type TurretKind } from "../src/sim/content";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { RIVAL_IDS } from "../src/sim/rivals";

const RACE_ONLY = new Set(["crucible", "wardworks", "blank", "alloy", "bulwark"]);
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

function run(): void {
  seedRandom(1);
  const heroes: HeroId[] = ["furnace", "weaver"];
  for (const h of heroes) for (let f = 0; f < 4; f++) {
    put(`hull/${h}/${f}`, hullSprite(h, f as Facing));
    put(`hullFlash/${h}/${f}`, hullFlash(h, f as Facing));
    put(`hullRim/${h}/${f}`, hullRim(h, f as Facing));
    put(`hullShade/${h}/${f}`, hullShade(h, f as Facing));
  }
  put("tread/v", treadStrip(true));
  put("tread/h", treadStrip(false));
  for (const kind of ["heavy", "light", "medium", "adaptable"] as TurretKind[]) for (const fac of ["orc", "elf"] as const) for (let f = 0; f < 4; f++) {
    const a = turretArt(kind, fac, f as Facing);
    put(`turret/${kind}/${fac}/${f}/base`, a.base);
    put(`turret/${kind}/${fac}/${f}/barrel`, a.barrel);
    out[`turret/${kind}/${fac}/${f}/tip`] = String(a.tip);
  }
  for (const d of Object.values(ITEMS)) {
    if (RACE_ONLY.has(d.id)) continue;
    put(`icon/${d.id}`, itemIcon(d.id));
    if (d.kind === "factory") {
      for (const stars of [1, 2, 3]) {
        for (let f = 0; f < 8; f++) for (const flash of [false, true]) put(`factory/${d.id}/${stars}/${f}/${flash ? 1 : 0}`, factorySprite(d.id, f, flash, stars));
        put(`factorySil/${d.id}/${stars}`, factoryFlashSil(d.id, stars));
      }
    }
    if (d.kind === "gate") {
      for (let f = 0; f < 4; f++) for (const active of [false, true]) put(`gate/${d.id}/${f}/${active ? 1 : 0}`, gateSprite(d.id, f, active));
      put(`gateSil/${d.id}`, gateSil(d.id));
    }
  }
  const kinds = [...Object.keys(AMMO), "ember", "spark"].filter((k) => !RACE_ONLY.has(k));
  for (const kind of kinds) {
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
  for (const fac of ["orc", "elf"] as const) for (const w of [false, true]) put(`mini/${fac}/${w ? 1 : 0}`, miniCruiser(fac, w));
  for (const h of heroes) for (const id of EVENT_IDS) for (const [w, hh] of [[180, 90], [120, 64]]) for (const calm of [false, true]) {
    const [cv, g] = makeCanvas(w, hh);
    drawScene(g as G, id, 0, 0, w, hh, h, "whetstone", 1.25, calm);
    put(`scene/${h}/${id}/${w}x${hh}/${calm ? 1 : 0}`, cv);
  }
  for (const k of [...RIVAL_IDS, ...heroes] as PortraitKey[]) out[`portrait/${k}`] = fnv(portraitPixels(k).px.map((c) => c ?? "-").join(","));
  // live battles, the game's own draw, at fixed render times
  const fights: [string, () => [ReturnType<typeof heroStartBuild>, ReturnType<typeof heroStartBuild>]][] = [
    ["start", () => [heroStartBuild("furnace", 1), heroStartBuild("weaver", 500)]],
    ["d5", () => [heroRefBuild("weaver", 5), heroRefBuild("furnace", 5)]],
    ["d10", () => [heroRefBuild("furnace", 10), heroRefBuild("weaver", 10)]],
    ["mirror7", () => [heroRefBuild("weaver", 7), heroRefBuild("weaver", 7)]],
  ];
  for (const [name, decks] of fights) for (const landscape of [false, true]) {
    seedRandom(7);
    const [a, b] = decks();
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
    }
  }
}

try {
  run();
  (window as unknown as { __digest: unknown }).__digest = { ok: true, n: Object.keys(out).length, out };
} catch (e) {
  (window as unknown as { __digest: unknown }).__digest = { ok: false, error: String((e as Error)?.stack ?? e) };
}
