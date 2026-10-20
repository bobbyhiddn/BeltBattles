// GATES-1 (REQ-BFG-057; BRIEF-GATES1 G3): THE DROP-TO-SPLIT PREVIEW. While a gate (FUSER, SCATTER MILL, SMELTER; gates.ts) is
// carried over a belt tile, the editor shows what the drop would do before it happens: the gate's art on the tile, the tiles
// after it outlined, and a tag `SPLITS IT: 2 TILES IN, 3 TILES OUT` (the tiles before it are its input, the tiles after it its own
// output path to the original destination), with `1 ARROW IDLES` when rig arrows aim at the tile (DESIGN-beltside R5: they
// idle; PIECES-1 6.2). A refused tile shows the reason (split.ts splitProblem: DROP IT ON A BELT, NEEDS BELT ON BOTH SIDES) the
// way a refused join is marked. This file is the data; cues.ts draws it. It lives beside split.ts, not in it, because it reads
// the rig hits (deck.ts), and deck.ts imports split.ts (a cycle otherwise).
// Also here: where to suggest a bought gate (cues.ts suggestCell): the second-last tile before a heavy gun for a FUSER (r1d
// variant J), a tile with room to fire for a SCATTER MILL, any legal tile for a SMELTER.

import { ITEMS } from "./content";
import { hero, kx, ky, rigHits, routeInfo, type Build } from "./deck";
import { SPLIT_NO_BELT, SPLIT_OFF_BELT, beltTile, splitProblem } from "./split";

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

/** `1 TILE`, `2 TILES`: a count of tiles, singular for one (GATES-1b B2). */
const tiles = (n: number): string => `${n} TILE${n === 1 ? "" : "S"}`;

/** The tag over the carried gate: `SPLITS IT: 2 TILES IN, 3 TILES OUT` (`1 TILE` when a count is 1; GATES-1b B2: the cold read's
 *  readers took `3 OUT` for three outputs), and with arrows aimed at the tile `· 1 ARROW IDLES`; a refused tile shows its
 *  reason alone. Words: docs/TEXT-STYLE.md (capitals, a few words, `·` between two notes). The longest real case, two 2-digit
 *  counts, is 133 px wide in the tag's font and fits the narrowest hull box (140 px, a turned hull): tests/gates1.tag.test.ts. */
export function splitTag(p: SplitPreview): string {
  if (!p.ok) return p.reason ?? "";
  const line = `SPLITS IT: ${tiles(p.tilesIn)} IN, ${tiles(p.tilesOut)} OUT`;
  return p.idles ? `${line} · ${p.idles} ARROW${p.idles > 1 ? "S IDLE" : " IDLES"}` : line;
}

/** The tag in its real cases as the text sheet lists it (tools/textSheet.ts --gates; GATES-1b B2): markdown lines. */
export function splitSheetLines(): string[] {
  const ok = (tilesIn: number, tilesOut: number, idles = 0): SplitPreview => ({ ok: true, route: 0, tile: tilesIn, tilesIn, tilesOut, outCells: [], idles });
  const row = (what: string, text: string): string => `- ${what}: \`${text}\``;
  return [
    "", "## Drop-to-split tag (GATES-1b: the words over a carried gate, src/sim/splitPreview.ts splitTag)", "",
    row("2 tiles before the gate, 3 after", splitTag(ok(2, 3))),
    row("1 tile on each side", splitTag(ok(1, 1))),
    row("the longest real case: two counts of 2 digits", splitTag(ok(14, 15))),
    row("rig arrows aim at the tile (second line)", splitTag(ok(2, 3, 1)).split(" · ")[1]),
    row("two rig arrows aim at it (second line)", splitTag(ok(2, 3, 2)).split(" · ")[1]),
    row("a refused tile, off every belt", SPLIT_OFF_BELT),
    row("a refused tile, a belt's end or beside another gate", SPLIT_NO_BELT),
    "",
  ];
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
