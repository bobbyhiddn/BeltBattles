// 0.6.1a harness v2 fix pass (F2, decision D2): the star-aware stand-in build code. It is the v1
// format of src/sim/standInPool.ts, "<beltCap> <hullBonus>/<items>/<routes>/<mods>", plus an
// optional "*2" or "*3" suffix on an item or module word (no suffix: 1 star). Examples:
//   "14 0/kiln64 temper44*2/1:544434241404/calibrate0*3"
// - A deck whose modules are all 1-star encodes byte-identical to encodeStandIn.
// - Every v1 / v1.1 code decodes exactly as decodeStandIn decodes it (same objects, same key order).
// The stand-in pool v2 dry run stores these codes, so what is written is exactly what was scored.
// It lives in the harness until the flip: porting it into src/sim/standInPool.ts (the loader the
// game copies) is the arsenal owner's call, then decodeStandIn must accept the suffix (OPEN).
// beltside-062-on-061 (ref/DESIGN-beltside.md §13 P15): the raw codec is the same here and in the loader
// (src/sim/standInPool.ts encodeStarred / decodeStarredRaw), and both write and read BELTSIDE's rig rotation
// before the stars: an item word is <id><yx>[r<rot>][*<stars>] (rot 1-3, rigs only; e.g. "temper43r1*2").
// This decode is the raw one (the deck as written, no D3 migration): the harness decodes decks it wrote,
// which stand natively; the game's load boundary is the loader's decodeStarred (raw, then migrateInlineGates).
// 0.6.2 step 5 (REQ-BFG-031 turret slots, REQ-BFG-027 belt joins): the same two optional parts as the loader's codec
// (src/sim/standInPool.ts header; tests/standin.turrets.test.ts holds the two codecs to each other). A deck without
// them encodes byte for byte as before, and every older code decodes exactly as before:
//   "<beltCap> <hullBonus>/<items>/<routes>/<mods>[/<turrets>]"
//   join:    a route word may end in ">yx", its join tile (RouteDef.join, the main belt's tile), e.g. "3:79695949>48".
//   turrets: a fifth section, written only when the deck carries Build.turrets and its words are not exactly the
//            starting layout's: <id><slot>[*<stars>][!] per installed turret, in slot order ("!" = a free copy, the
//            hull's starting copy; a slot without a word is empty), e.g. "14 0/kiln64/1:544434241404//scrapcannon0*2!".
//            Uids: a free copy of def d takes the starting uid (TURRET_UID0 + slot) of d's starting slots in slot order;
//            every other turret follows the mods (items 1..n, mods n+1..n+m, turrets n+m+1..). Decoding goes through
//            setTurretList, so a list equal to the starting layout leaves no field.
// BOTS-X (REQ-BFG-058; RUNES-2a 3 step 2): Build.runes, as the loader's codec writes it (src/sim/standInPool.ts header;
// runeWord / runesOf / headWords are shared with it, as upgradeWord / upgradesOf are): the head's last word,
//   "<beltCap> <hullBonus>[ u<t><f>][ r:<id>,<id>...]"
//   runes:   "r:" then the held runes' ids in pick order, comma-separated, written only when the deck holds a rune, e.g.
//            "14 0 r:iron_hide,coin_purse/kiln64/1:544434241404/". A rune-less deck encodes byte for byte as before;
//            every older code decodes exactly as before (no runes key); the decoded runes are the build's last key.

import { GRID, HEROES, ITEMS, type HeroId } from "../content";
import { rotOf, setTurretList, startingTurrets, type Build, type BuildTurret, type ModPlacement, type Placed, type RouteDef } from "../deck";
import { starsOf } from "../stars";
import { upgradeWord, upgradesOf } from "../standInPool"; // bb-0.8.3 (REQ-BFG-043 D10): the levels' head word
import { headWords, runeWord, runesOf } from "../standInPool"; // BOTS-X (REQ-BFG-058): the runes' head word

const cellCode = (x: number, y: number): string => `${y}${x}`;
const suffix = (p: { stars?: number }): string => (starsOf(p) > 1 ? `*${starsOf(p)}` : "");

/** Step 5: a route word's join suffix, ">yx" ("" for a belt that joins nothing). */
function joinSuffix(r: RouteDef): string {
  if (r.join === undefined) return "";
  if (!Number.isInteger(r.join) || r.join < 0 || r.join >= GRID * GRID) throw new Error(`stand-in code: route join ${r.join} is not a cell key 0..${GRID * GRID - 1}`);
  return `>${cellCode(r.join % GRID, Math.floor(r.join / GRID))}`;
}

/** Step 5: the turret section, or undefined (no Build.turrets, or exactly the starting layout's words). */
function turretSection(b: Build): string | undefined {
  if (!b.turrets) return undefined;
  const words = [...b.turrets].sort((x, y) => x.slot - y.slot).map((t) => {
    if (!/^[a-z]+$/.test(t.def)) throw new Error(`stand-in code: turret id "${t.def}" is not lowercase letters`);
    if (!Number.isInteger(t.slot) || t.slot < 0) throw new Error(`stand-in code: turret slot ${t.slot} is not a slot index`);
    return `${t.def}${t.slot}${suffix(t)}${t.free ? "!" : ""}`;
  }).join(" ");
  const start = startingTurrets(b.hero).map((t) => `${t.def}${t.slot}!`).join(" ");
  return words === start ? undefined : words;
}

/** Encode a deck as a star-aware stand-in build code (uids are renumbered on decode). */
export function encodeStarred(b: Build): string {
  if (GRID !== 10) throw new Error("stand-in build codes assume a 10x10 deck");
  const no = new Map<number, number>();
  const items = b.items.map((p, i) => {
    if (!/^[a-z]+$/.test(p.def)) throw new Error(`stand-in code: item id "${p.def}" is not lowercase letters`);
    no.set(p.uid, i + 1);
    const rot = rotOf(p);
    return `${p.def}${cellCode(p.x, p.y)}${rot ? `r${rot}` : ""}${suffix(p)}`;
  });
  const routes = b.routes.map((r) => {
    const f = no.get(r.factory);
    if (f === undefined) throw new Error(`stand-in code: route fed by unknown uid ${r.factory}`);
    return `${f}:${r.cells.map((k) => cellCode(k % GRID, Math.floor(k / GRID))).join("")}${joinSuffix(r)}`;
  });
  const mods = b.mods.map((m) => {
    if (!/^[a-z]+$/.test(m.def)) throw new Error(`stand-in code: module id "${m.def}" is not lowercase letters`);
    return `${m.def}${m.turret}${suffix(m)}`;
  });
  const turrets = turretSection(b);
  // bb-0.8.3 (REQ-BFG-043 D10): the levels as the head's third word (standInPool.ts upgradeWord, shared with the loader);
  // BOTS-X: then the runes, the head's last word (runeWord, shared too)
  return `${b.beltCap} ${b.hullBonus}${upgradeWord(b)}${runeWord(b)}/${items.join(" ")}/${routes.join(" ")}/${mods.join(" ")}${turrets === undefined ? "" : `/${turrets}`}`;
}

/** Decode a star-aware (or v1) stand-in build code into a fresh Build for `hero`. */
export function decodeStarred(hero: HeroId, code: string): Build {
  const parts = code.split("/");
  if (parts.length > 5) throw new Error(`stand-in code: more than five sections in "${code}"`);
  const [head, itemPart, routePart, modPart, turretPart] = parts;
  const [bc, hb, ...more] = head.split(" "), beltCap = Number(bc), hullBonus = Number(hb);
  const [up, rw] = headWords(more); // bb-0.8.3: `up`, the levels; BOTS-X: `rw`, the runes (the head's last word)
  const words = (s: string | undefined) => (s ? s.split(" ").filter(Boolean) : []);
  const star = (s: string | undefined) => (s ? { stars: Number(s) } : {});
  const items: Placed[] = words(itemPart).map((w, i) => {
    const m = /^([a-z]+)(\d)(\d)(?:r([1-3]))?(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad item "${w}"`);
    if (m[4] && ITEMS[m[1]].kind !== "gate") throw new Error(`stand-in code: "${w}" is not a rig and can't have a rotation`);
    return { uid: i + 1, def: m[1], x: Number(m[3]), y: Number(m[2]), ...(m[4] ? { rot: Number(m[4]) } : {}), ...star(m[5]) };
  });
  const routes: RouteDef[] = words(routePart).map((w) => {
    const m = /^(\d+):((?:\d\d)+)(?:>(\d)(\d))?$/.exec(w);
    if (!m || Number(m[1]) < 1 || Number(m[1]) > items.length) throw new Error(`stand-in code: bad route "${w}"`);
    const cells: number[] = [];
    for (let i = 0; i < m[2].length; i += 2) cells.push(Number(m[2][i]) * GRID + Number(m[2][i + 1]));
    return { factory: Number(m[1]), cells, ...(m[3] ? { join: Number(m[3]) * GRID + Number(m[4]) } : {}) };
  });
  const mods: ModPlacement[] = words(modPart).map((w, j) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?$/.exec(w);
    if (!m || !ITEMS[m[1]]) throw new Error(`stand-in code: bad module "${w}"`);
    return { uid: items.length + j + 1, def: m[1], turret: Number(m[2]), ...star(m[3]) };
  });
  if (!HEROES[hero]) throw new Error(`stand-in code: unknown hero "${hero}"`);
  const b: Build = { hero, items, routes, mods, beltCap, hullBonus };
  if (turretPart === undefined) return Object.assign(b, upgradesOf(up), runesOf(rw)); // bb-0.8.3 (D10): the levels; BOTS-X: the runes, the last key
  // the turret section: free copies take their def's starting uids (TURRET_UID0 + slot) in slot order, the rest follow
  // the mods
  const own = new Map<string, number[]>();
  for (const t of startingTurrets(hero)) own.set(t.def, [...(own.get(t.def) ?? []), t.uid]);
  let next = items.length + mods.length;
  const list: BuildTurret[] = words(turretPart).map((w) => {
    const m = /^([a-z]+)(\d+)(?:\*([23]))?(!)?$/.exec(w);
    if (!m || !ITEMS[m[1]] || ITEMS[m[1]].kind !== "turret") throw new Error(`stand-in code: bad turret "${w}"`);
    const uid = (m[4] ? own.get(m[1])?.shift() : undefined) ?? ++next;
    return { slot: Number(m[2]), def: m[1], uid, ...star(m[3]), ...(m[4] ? { free: true } : {}) };
  });
  setTurretList(b, list);
  return Object.assign(b, upgradesOf(up), runesOf(rw));
}
