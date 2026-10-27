// M3 (REQ-BFG-119): the art page's API. scripts/m3/icon.mjs builds this page from the game's src/render and calls window.m3:
//   m3.motifs()         the candidate marks: { name, blurb, field }
//   m3.subject(name)    one candidate's subject layer on the 54 x 54 logical canvas (transparent outside the subject): RGBA, base64
//   m3.parts()          a sheet of the game's own pieces the marks are made of (for choosing)
// The page draws; Node scales (whole numbers, nearest neighbour), composes and encodes the PNGs (scripts/m3/img.mjs).

import { MOTIFS, N, partsSheet, logoArt } from "./motifs";
import { battleFrame, type FrameSpec } from "./frame";

type Cv = HTMLCanvasElement;
const b64 = (d: Uint8ClampedArray): string => {
  let s = "";
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};
const grab = (c: Cv) => ({ w: c.width, h: c.height, rgba: b64(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data) });

(window as unknown as { m3: unknown }).m3 = {
  N,
  motifs: () => Object.entries(MOTIFS).map(([name, m]) => ({ name, blurb: m.blurb, field: m.field })),
  subject: (name: string) => {
    const m = MOTIFS[name];
    if (!m) throw new Error(`no motif ${name}`);
    return { N, field: m.field, ...grab(m.subject()) };
  },
  parts: () => grab(partsSheet()),
  /** the title's logo for `text`, as the title screen draws it (sprites.ts titleArt over the 5x7 face; 3 pixels a pixel, outlined) */
  logo: (text: string) => grab(logoArt(text)),
  /** a battle frame (frame.ts): the game's own battle code, drawn at W x H logical pixels */
  battle: (spec: FrameSpec) => {
    const r = battleFrame(spec);
    return { ...grab(r.canvas), info: r.info };
  },
};
