// M3 (REQ-BFG-119): the candidate marks, drawn with the game's own pixel-art code (src/render) on a 54 x 54 logical canvas.
// 54 is the adaptive icon's 108 dp layer at 2 dp a pixel: the five foreground files (108/162/216/324/432 px) are then
// whole-number scales (2/3/4/6/8) of it. Each subject is at most 32 pixels across (59% of the square, under the 61% rule) and
// round or nearly so, so it stays whole inside Android's 66 dp safe circle (33 pixels). Every pixel comes from the game:
// palette.ts colours, pixel.ts helpers, the hero portraits, the font and titleArt, the turrets, belts and ammunition.

import { C } from "../../../src/render/palette";
import { bayer, disc, makeCanvas, rect, type G } from "../../../src/render/pixel";
import { portraitImage, PORTRAIT_HEROES, type PortraitHero } from "../../../src/render/portraits";
import { titleArt, beltStraight, beltCorner, turntable, ammoIcon, factorySprite, itemIcon } from "./pieces";
import { turretArt, HEAT_RAMP } from "../../../src/render/turret";
import { muzzleFlash } from "../../../src/render/fxsprites";
import { drawText, textWidth } from "../../../src/render/font";

type Cv = HTMLCanvasElement;
export const N = 54;
const MID = N / 2; // 27: the badge's centre is a pixel corner, so every disc is symmetric

export interface Motif {
  blurb: string;
  /** the adaptive icon's background colour (a palette.ts value) */
  field: string;
  /** the subject on a transparent N x N canvas */
  subject: () => Cv;
}

export const MOTIFS: Record<string, Motif> = {};

const at = (g: G, cv: Cv, x: number, y: number): void => g.drawImage(cv, Math.round(x), Math.round(y));
const title = (s: string): Cv => titleArt(s, (gg, str, x, y, col) => drawText(gg, str, x, y, col), (str) => textWidth(str));

/** Keeps only what lies inside a disc (destination-in with a pixel disc). */
function clipDisc(src: Cv, r: number): Cv {
  const [c, g] = makeCanvas(N, N);
  g.drawImage(src, 0, 0);
  const [m, mg] = makeCanvas(N, N);
  disc(mg, MID, MID, r, "#fff");
  g.globalCompositeOperation = "destination-in";
  g.drawImage(m, 0, 0);
  g.globalCompositeOperation = "source-over";
  return c;
}

/** Draws `src` with the middle of its opaque pixels on the canvas centre (to whole pixels). */
function centred(src: Cv, dy = 0): Cv {
  const d = src.getContext("2d")!.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const [c, g] = makeCanvas(N, N);
  g.drawImage(src, Math.floor(MID - (x0 + x1 + 1) / 2), Math.floor(MID - (y0 + y1 + 1) / 2) + dy);
  return c;
}

/** The medallion: an ink-edged brass rim (light from the top left) round a face of `face`, a dithered lift toward the top. */
function medallion(g: G, face: string, lift: string): number {
  disc(g, MID, MID, 16, C.ink);
  disc(g, MID, MID, 15, C.brass1);
  disc(g, MID - 0.5, MID - 0.5, 14.5, C.brass3);
  disc(g, MID + 0.5, MID + 0.5, 13.5, C.brass2);
  disc(g, MID, MID, 13, C.ink);
  disc(g, MID, MID, 12, face);
  // the face's light: a Bayer-dithered patch of `lift` over its upper half, clipped to the face
  const [t, tg] = makeCanvas(N, N);
  bayer(tg, 0, 10, N, 14, lift, 0.5);
  g.drawImage(clipDisc(t, 12), 0, 0);
  return 12;
}

function portraitBadge(hero: PortraitHero, face: string, lift: string): () => Cv {
  return () => {
    const [c, g] = makeCanvas(N, N);
    const r = medallion(g, face, lift);
    const [p, pg] = makeCanvas(N, N);
    pg.drawImage(portraitImage(hero), MID - 12, MID - 12 + 1);
    g.drawImage(clipDisc(p, r), 0, 0);
    return c;
  };
}

// ------------------------------------------------------------------ the candidates

MOTIFS.captain = {
  blurb: "FURNACE, the orc captain (the first hero card): the portrait the game draws on hero select, in a brass-rimmed medallion",
  field: C.deepblue,
  subject: portraitBadge("furnace", C.slate2, C.slate3),
};

MOTIFS.bastion = {
  blurb: "BASTION, the dwarf captain (iron helm, ginger beard): the game's portrait in the same medallion",
  field: C.deepblue,
  subject: portraitBadge("bastion", C.slate2, C.slate3),
};

MOTIFS.logo = {
  blurb: "the title logo's letter B: the game's 5x7 pixel face through titleArt (its fire ramp and its ink and maroon outlines), on an ink disc with a brass rim",
  field: C.deepblue,
  subject: () => {
    const [c, g] = makeCanvas(N, N);
    disc(g, MID, MID, 16, C.brass3);
    disc(g, MID + 0.5, MID + 0.5, 15.5, C.brass1);
    disc(g, MID, MID, 15, C.ink);
    const [b, bg] = makeCanvas(N, N);
    bg.drawImage(title("B"), 0, 0);
    g.drawImage(centred(b), 0, 0);
    return c;
  },
};

MOTIFS.turret = {
  blurb: "the WEAVER cruiser's heavy twin-barrel turret (verdigris housing, brass barrels), as the battle draws it, with its breech glowing white-hot",
  field: C.deepblue,
  subject: () => {
    const [c, g] = makeCanvas(N, N);
    const art = turretArt("heavy", "elf", 0);
    const [t, tg] = makeCanvas(N, N);
    tg.drawImage(art.base, 0, 0);
    tg.drawImage(art.barrel, 0, 0);
    // the breech slit's glow (turret.ts GLOW_HEAVY = [-4, 3, 8, 2], turret-local, the pivot at 24, 24)
    rect(tg, 24 - 4, 24 + 3, 8, 2, HEAT_RAMP[4]);
    g.drawImage(centred(t), 0, 0);
    return c;
  },
};

/** The title screen's logo art for `text` (title.ts draws titleArt("BELTBATTLES", drawText, textWidth)). */
export const logoArt = (text: string): Cv => title(text);

/** A sheet of the game's own pieces (to choose the marks from), at the game's own pixel size (Node scales it). */
export function partsSheet(): Cv {
  const [c, g] = makeCanvas(420, 300);
  rect(g, 0, 0, 420, 300, C.slate0);
  PORTRAIT_HEROES.forEach((h, i) => at(g, portraitImage(h), 4 + i * 28, 4));
  at(g, title("BB"), 120, 4);
  at(g, title("B"), 170, 4);
  at(g, title("BELTBATTLES"), 4, 36);
  let x = 4;
  for (const faction of ["orc", "elf", "human", "dwarf"] as const) {
    for (const kind of ["heavy", "light"] as const) {
      const t = turretArt(kind, faction, 0);
      at(g, t.base, x, 70);
      at(g, t.barrel, x, 70);
      x += 50;
    }
  }
  x = 4;
  for (let d = 0; d < 4; d++) { at(g, beltStraight(d, 0), x, 124); x += 14; }
  at(g, beltCorner(2, 1, 0), x, 124); x += 14;
  at(g, turntable(0), x, 124); x += 16;
  for (const [k, t] of [["plain", 0], ["ember", 0], ["spark", 0], ["cinder", 0], ["cinder", 1], ["cinder", 2], ["cinder", 3], ["cinder", 4], ["shot", 0], ["slag", 0], ["thread", 0]] as const) {
    at(g, ammoIcon(k, t), x, 127); x += 9;
  }
  x = 4;
  for (const id of ["kiln", "loom", "press"]) { at(g, factorySprite(id, 0, false), x, 144); x += 26; }
  for (const [h, f] of [[true, 0], [true, 1], [true, 2], [false, 0], [false, 1]] as const) { at(g, muzzleFlash(h, f, 0), x, 146); x += 20; }
  x = 4;
  for (const id of ["scrapcannon", "rampart", "dartgun", "spikegun", "carronade", "swivel", "twinneedle", "hailgun", "deckgun", "railgun", "bombard", "siegegun", "thunderer", "kiln", "loom", "press", "chamber", "calibrate", "flak"]) {
    at(g, itemIcon(id), x, 176); x += 14;
  }
  return c;
}
