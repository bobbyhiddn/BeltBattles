// 0.6.1a harness v2 fix pass (F2, decision D2): the star-aware stand-in build code. It is the v1
// format of src/sim/standInPool.ts, "<beltCap> <hullBonus>/<items>/<routes>/<mods>", plus an
// optional "*2" or "*3" suffix on an item or module word (no suffix: 1 star). Examples:
//   "14 0/kiln64 temper44*2/1:544434241404/calibrate0*3"
// - A deck whose modules are all 1-star encodes byte-identical to encodeStandIn.
// - Every v1 / v1.1 code decodes exactly as decodeStandIn decodes it (same objects, same key order).
// The stand-in pool v2 dry run stores these codes, so what is written is exactly what was scored.
// It lives in the harness until the flip: porting it into src/sim/standInPool.ts (the loader the
// game copies) is the arsenal owner's call, then decodeStandIn must accept the suffix (OPEN).

import { GRID, HEROES, ITEMS, type HeroId } from "../content";
import type { Build, ModPlacement, Placed, RouteDef } from "../deck";
import { starsOf } from "../stars";

const cellCode = (x: number, y: number): string => `${y}${x}`;
const suffix = (p: { stars?: number }): string => (starsOf(p) > 1 ? `*${starsOf(p)}` : "");

/** Encode a deck as a star-aware stand-in build code (uids are renumbered on decode). */
export function encodeStarred(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    return `${p.def}${cellCode(p.x, p.y)}${suffix(p)}`;
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}`;
  });
  const mods = b.mods.map((m) => {
    if (!/^[a-z]+$/.test(m.def)) throw new Error(`stand-in code: module id "${m.def}" is not lowercase letters`);
    return `${m.def}${m.turret}${suffix(m)}`;
  });
  return `${b.beltCap} ${b.hullBonus}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}`;
}

/** Decode a star-aware (or v1) stand-in build code into a fresh Build for `hero`. */
export function decodeStarred(hero: HeroId, code: string): Build {
  const [head, itemPart, routePart, modPart] = code.split("/");
  const [beltCap, hullBonus] = head.split(" ").map(Number);
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const star = (s: string | undefined) => (s ? { stars: Number(s) } : {});
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]), ...star(m[4]) };
  });
  const routes: RouteDef[] = words(routePart).map((w) => {
    const m = /^(\d+):((?:\d\d)+)$/.exec(w);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > items.length) throw new Error(`stand-in code: bad route "${w}"`);
    const cells: number[] = [];
    for (let i = 0; i < m[2].length; i += 2) cells.push(Number(m[2][i]) * GRID + Number(m[2][i + 1]));
    return { factory: Number(m[1]), cells };
  });
  const mods: ModPlacement[] = words(modPart).map((w, j) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad module "${w}"`);
    return { uid: items.length + j + 1, def: m[1], turret: Number(m[2]), ...star(m[3]) };
  });
  if (!HEROES[hero]) throw new Error(`stand-in code: unknown hero "${hero}"`);
  return { hero, items, routes, mods, beltCap, hullBonus };
}
