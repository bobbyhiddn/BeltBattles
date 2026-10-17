// GATES-1 (REQ-BFG-057; BRIEF-GATES1 G3): THE DROP-TO-SPLIT PREVIEW. While a gate (FUSER, SCATTER MILL, SMELTER; gates.ts) is
// carried over a belt tile, the editor shows what the drop would do before it happens: the gate's art on the tile, the tiles
// after it outlined, and a tag `SPLITS IT: 2 TILES IN, 3 OUT` (the tiles before it are its input, the tiles after it its own
// output path to the original destination), with `1 ARROW IDLES` when rig arrows aim at the tile (DESIGN-beltside R5: they
// idle; PIECES-1 6.2). A refused tile shows the reason (split.ts splitProblem: DROP IT ON A BELT, NEEDS BELT ON BOTH SIDES) the
// way a refused join is marked. This file is the data; cues.ts draws it. It lives beside split.ts, not in it, because it reads
// the rig hits (deck.ts), and deck.ts imports split.ts (a cycle otherwise).
// Also here: where to suggest a bought gate (cues.ts suggestCell): the second-last tile before a heavy gun for a FUSER (r1d
// variant J), a tile with room to fire for a SCATTER MILL, any legal tile for a SMELTER.

import { ITEMS } from "./content";
import { hero, kx, ky, rigHits, routeInfo, type Build } from "./deck";
import { SPLIT_OFF_BELT, beltTile, splitProblem } from "./split";

/** What a drop of a gate on belt tile k would do. */
export interface SplitPreview {
  ok: boolean;
  reason?: string; // why not (player text), when !ok
  route: number; // the belt it would split (-1: off every belt)
  tile: number; // its tile's index along it
  tilesIn: number; // tiles before it: the gate's input
  tilesOut: number; // tiles after it: the gate's own path to the destination
  outCells: number[]; // the cells of those tiles, for the outline
  idles: number; // rig arrows aimed at this tile, which would idle
}

/** The preview of dropping gate `defId` on belt tile `k` of `b` (`ignoreUid`: the gate being moved). */
export function previewSplit(b: Build, defId: string, k: number, ignoreUid = -1): SplitPreview {
  const reason = splitProblem(b, defId, k, ignoreUid);
  const at = beltTile(b, k);
  if (!at) return { ok: false, reason: reason ?? SPLIT_OFF_BELT, route: -1, tile: -1, tilesIn: 0, tilesOut: 0, outCells: [], idles: 0 };
  const [ri, ti] = at, cells = b.routes[ri].cells;
  return {
    ok: reason === null, ...(reason !== null ? { reason } : {}), route: ri, tile: ti, tilesIn: ti, tilesOut: cells.length - ti - 1,
    outCells: cells.slice(ti + 1), idles: rigHits(b)[ri]?.[ti]?.length ?? 0,
  };
}

/** The tag over the carried gate: `SPLITS IT: 2 TILES IN, 3 OUT`, and with arrows aimed at the tile `· 1 ARROW IDLES`; a
 *  refused tile shows its reason alone. Words: docs/TEXT-STYLE.md (capitals, a few words, `·` between two notes). */
export function splitTag(p: SplitPreview): string {
  if (!p.ok) return p.reason ?? "";
  const tiles = `SPLITS IT: ${p.tilesIn} TILE${p.tilesIn === 1 ? "" : "S"} IN, ${p.tilesOut} OUT`;
  return p.idles ? `${tiles} · ${p.idles} ARROW${p.idles > 1 ? "S IDLE" : " IDLES"}` : tiles;
}

/**
 * Where to suggest a bought gate (cues.ts suggestCell): the legal belt tile that suits it, or null when no belt has one.
 * FUSER: the second-last tile of the longest belt into a HEAVY gun (r1d variant J measured it best there), else of the longest
 * belt that reaches a gun; a tile nearer the start when that one is refused. SCATTER MILL: the middle of the longest belt into a
 * LIGHT gun (it needs room after it for the pellets to fly, ~3 tiles), else of any belt. SMELTER: the middle of the longest
 * belt. Deterministic: the longest belt, the lower route index on a tie.
 */
export function suggestSplit(b: Build, defId: string): { x: number; y: number } | null {
  const how = ITEMS[defId]?.converter?.how;
  const h = hero(b);
  const routes = b.routes.map((r, i) => ({ i, n: r.cells.length, info: routeInfo(b, i) })).filter((r) => r.n >= 3 && r.info.wellFormed);
  const kindOf = (r: { info: { turret: number } }) => h.turrets[r.info.turret]?.kind;
  const longest = (list: typeof routes) => list.slice().sort((p, q) => q.n - p.n || p.i - q.i);
  const connected = routes.filter((r) => r.info.connected);
  const want = how === "fuse" ? "heavy" : how === "pellet" ? "light" : undefined;
  const ordered = [...longest(connected.filter((r) => want && kindOf(r) === want)), ...longest(connected), ...longest(routes)];
  for (const r of ordered) {
    const cells = b.routes[r.i].cells;
    const first = how === "fuse" ? cells.length - 2 : Math.floor((cells.length - 1) / 2);
    // from the preferred tile toward the start (a FUSER keeps to the end of the belt), then the other way
    const tiles = [first, ...Array.from({ length: cells.length }, (_, t) => t).filter((t) => t !== first)
      .sort((p, q) => Math.abs(p - first) - Math.abs(q - first) || p - q)];
    for (const t of tiles) if (splitProblem(b, defId, cells[t]) === null) return { x: kx(cells[t]), y: ky(cells[t]) };
  }
  return null;
}
