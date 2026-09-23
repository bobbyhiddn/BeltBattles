// Faction dressing for hull sprites: orc war paint, rivets, bow teeth and exhausts; elven
// brass filigree, crystal lamps, side fins and glow ports. Kept off the turret mounts.

import { HEROES, type HeroId } from "../sim/content";
import { C, type FactionPalette } from "./palette";
import { BOW, HULL_A, HULL_L, SIDE } from "./frame";
import type { HullPainter } from "./hull";

const A = HULL_A, L = HULL_L;

/** Hull-local x spans covered by turret bases (kept clear of decoration). */
function turretSpans(hero: HeroId): [number, number][] {
  return HEROES[hero].turrets.map((t) => {
    const cx = SIDE + (t.col0 + t.width / 2) * 12;
    const r = t.kind === "heavy" ? 14 : 10;
    return [cx - r, cx + r];
  });
}

const clear = (spans: [number, number][], x0: number, x1: number) => spans.every(([a, b]) => x1 < a || x0 > b);

export function hullDeco(p: HullPainter, hero: HeroId, P: FactionPalette): void {
  const spans = turretSpans(hero);
  if (HEROES[hero].faction === "orc") orc(p, P, spans);
  else elf(p, P, spans);
}

function orc(p: HullPainter, P: FactionPalette, spans: [number, number][]): void {
  // rivet rows on the bow plate
  for (let x = 17; x < A - 16; x += 8) {
    if (!clear(spans, x - 1, x + 1)) continue;
    p.P(x, 3, P.hull4);
    p.P(x, 10, P.hull0);
  }
  // war-paint chevrons pointing at the enemy
  for (let cx = 26; cx < A - 20; cx += 16) {
    if (!clear(spans, cx - 5, cx + 5)) continue;
    for (let k = 0; k < 4; k++) {
      p.R(cx - k - 1, 4 + k, 2, 1, C.maroon);
      p.R(cx + k, 4 + k, 2, 1, C.maroon);
    }
  }
  // bone teeth along the bow edge
  for (const x of [20, 29, A - 30, A - 21]) {
    if (!clear(spans, x - 2, x + 2)) continue;
    p.R(x - 2, -1, 5, 1, C.ink);
    p.R(x - 1, -1, 3, 1, C.bone);
    p.R(x - 1, -2, 3, 1, C.ink);
    p.P(x, -2, C.bone);
    p.P(x, -3, C.ink);
    p.P(x - 1, 0, C.steel3);
  }
  // skirt bolts and a scrap patch
  for (let y = 16; y < L - 10; y += 12) {
    p.P(1, y, P.hull4);
    p.P(A - 2, y, P.hull3);
  }
  p.B(A - 30, BOW - 11, 9, 5, P.trim1, P.trim2, P.trim0, C.ink);
  p.P(A - 28, BOW - 9, P.trim0);
  // stern exhausts with a banked glow, pipes jutting behind the engine block
  for (const x of [30, 56, 96, 122]) {
    p.R(x - 2, L - 5, 5, 4, C.ink);
    p.R(x - 1, L - 4, 3, 2, C.fire1);
    p.P(x, L - 4, C.fire3);
    p.R(x - 1, L, 3, 2, C.ink);
    p.P(x, L, C.steel2);
  }
}

function elf(p: HullPainter, P: FactionPalette, spans: [number, number][]): void {
  // brass filigree line with leaf studs
  p.R(16, 8, A - 32, 1, P.trim1);
  for (let x = 22; x < A - 20; x += 12) {
    if (!clear(spans, x - 2, x + 2)) continue;
    p.P(x, 7, P.trim2);
    p.P(x - 1, 8, P.trim2);
    p.P(x + 1, 8, P.trim2);
    p.P(x, 9, P.trim2);
    p.P(x, 4, P.hull4);
  }
  // crystal bow lamps
  for (const x of [16, A - 18]) {
    p.R(x - 1, 2, 4, 4, C.ink);
    p.R(x, 3, 2, 2, C.ice);
    p.P(x, 3, C.white);
  }
  // swept side fins
  for (const y of [30, 58, 86, 114]) {
    for (let t = 0; t < 10; t++) {
      const w = Math.max(1, Math.round(3.4 - Math.abs(t - 3.5) * 0.7));
      const col = t < 3 ? P.trim2 : P.trim1;
      p.R(-w, y + t, w, 1, col);
      p.R(A, y + t, w, 1, t < 3 ? P.trim1 : P.trim0);
    }
    p.P(-1, y + 9, C.ink);
    p.P(A, y + 9, C.ink);
  }
  // skirt studs
  for (let y = 18; y < L - 10; y += 14) {
    p.P(1, y, P.trim2);
    p.P(A - 2, y, P.trim1);
  }
  // stern glow ports
  for (const x of [44, 78, 112]) {
    p.R(x - 2, L - 5, 5, 4, C.ink);
    p.R(x - 1, L - 4, 3, 2, C.deepblue);
    p.P(x, L - 4, C.ice);
  }
}
