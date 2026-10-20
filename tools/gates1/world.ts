// GATES-1 step 7 (REQ-BFG-052; BRIEF-GATES1 G7): the bench tools' shared setup. Every switch as the base ships it (SHAPES, SHAPES2,
// PLAIN_RIGS, LONG_RUN, NPC_DAY, HULL_SCALE, LADDER_FIX, HEARTS, GUARD, OPEN_RUNES, FREE_JOINS, BOT_RUNES, SUSTAIN_LIVE on); GATES
// as --gates says. Every read is labelled "GATES on, with SHAPES2, PLAIN_RIGS and LONG_RUN as bump-accepted ships them, before
// BUMP-1E's scaling flip". The load order is the ship's (PLAIN_RIGS, SHAPES, SHAPES2, then GATES: ITEMS' order is part of the
// seeded draws). Pure harness reads.
import { ITEMS, type ItemDef } from "../../src/sim/content";
import { cloneBuild, hero, key, kx, ky, removeItem, routeInfo, type Build } from "../../src/sim/deck";
import { setShapes } from "../../src/sim/shapes";
import { setShapes2 } from "../../src/sim/shapes2";
import { setPlainRigs } from "../../src/sim/plainRigs";
import { setLongRun } from "../../src/sim/longRun";
import { GATES_IDS, setGates } from "../../src/sim/gates";
import { clearStarCache } from "../../src/sim/stars";
import { isConverterItem, splitProblem } from "../../src/sim/split";
import { suggestSplit } from "../../src/sim/splitPreview";

export const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
export const HEROES = ["furnace", "weaver", "foundry", "bastion"] as const;
export type Hero = (typeof HEROES)[number];

/** Set the world the bench runs in: the 1D load order, GATES last; LONG_RUN as --long says (default on, the bump's world). */
export function setWorld(gates: boolean): string {
  setGates(false); setShapes2(false); setShapes(false); setPlainRigs(false);
  setPlainRigs(true); setShapes(true); setShapes2(true); setGates(gates);
  setLongRun(arg("--long", "on") === "on");
  return `GATES ${gates ? "on" : "off"}, with SHAPES2, PLAIN_RIGS and LONG_RUN ${arg("--long", "on")} as bump-accepted ships them, before BUMP-1E's scaling flip`;
}

/** --set id.field=value (repeatable): patch a gate def before the bench (the guard's cuts): field = price | in | out | secs |
 *  bonus | share | burn (a ★1 number), id.L2.field / id.L3.field (a level's). */
export function applySets(): string[] {
  const sets: string[] = [];
  process.argv.forEach((a, i) => { if (a === "--set") sets.push(process.argv[i + 1]); });
  for (const s of sets) {
    const [lhs, v] = s.split("="), parts = lhs.split("."), id = parts[0];
    const was = ITEMS[id];
    const d: ItemDef = { ...was, converter: was.converter ? { ...was.converter } : undefined, levels: { ...was.levels } };
    if (parts[1] === "price") d.price = Number(v);
    else if (/^L[23]$/.test(parts[1])) { const lv = Number(parts[1][1]) as 2 | 3; d.levels = { ...d.levels, [lv]: { ...d.levels![lv], converter: { ...d.levels![lv]?.converter, [parts[2]]: Number(v) } } }; }
    else (d.converter as unknown as Record<string, number>)[parts[1]] = Number(v);
    (ITEMS as Record<string, ItemDef>)[id] = d;
  }
  if (sets.length) clearStarCache();
  return sets;
}

/** A deck without any gate (a gate lifted off leaves its belt whole). */
export function stripGates(b: Build): Build {
  const c = cloneBuild(b);
  for (const p of b.items.filter(isConverterItem)) removeItem(c, p.uid);
  return c;
}
export const gatesOn = (b: Build, id: string): number => b.items.filter((p) => p.def === id).length;
const nextUid = (b: Build): number => Math.max(0, ...b.items.map((p) => p.uid), ...b.mods.map((m) => m.uid)) + 1;

/** `b` with one gate `def` at ★`stars` standing on cell (x, y). */
export function withGate(b: Build, def: string, stars: number, at: { x: number; y: number }): Build {
  const c = cloneBuild(b);
  c.items.push({ uid: nextUid(c), def, x: at.x, y: at.y, ...(stars > 1 ? { stars } : {}) });
  return c;
}

/** The kind of the gun ("heavy", "light", "medium", "adaptable") the belt through cell `at` feeds; undefined when it feeds none. */
export function gunKindAt(b: Build, at: { x: number; y: number }): string | undefined {
  const k = key(at.x, at.y), i = b.routes.findIndex((r) => r.cells.includes(k));
  return i < 0 ? undefined : hero(b).turrets[routeInfo(b, i).turret]?.kind;
}

/** --strict on (default): the PAR PLAYER'S RULE (BRIEF-GATES1 G6: "par never places a gate where it does nothing"): a FUSER only on a
 *  belt into a HEAVY gun (r1d variant J), a SCATTER MILL only on a belt into a LIGHT gun (it needs room to fire), a SMELTER on any
 *  belt. --strict off: wherever the preview suggests (a fallback to any belt), which shows what a careless buyer gets. */
export const STRICT = arg("--strict", "on") !== "off";

/** The BEST spot (splitPreview.ts suggestSplit; under STRICT only where the gate suits the gun) or null when no belt suits. */
export function bestSpot(b: Build, def: string): { x: number; y: number } | null {
  const at = suggestSplit(b, def);
  if (!at || !STRICT) return at;
  const how = ITEMS[def]?.converter?.how, kind = gunKindAt(b, at);
  if (how === "fuse" && kind !== "heavy") return null;
  if (how === "pellet" && kind !== "light") return null;
  return at;
}

/** A CARELESS spot: the legal tile nearest the middle of the longest connected belt (what a player who drops it anywhere gets). */
export function midSpot(b: Build, def: string): { x: number; y: number } | null {
  const routes = b.routes.map((r, i) => ({ i, n: r.cells.length, info: routeInfo(b, i) })).filter((r) => r.info.connected && r.n >= 3).sort((p, q) => q.n - p.n || p.i - q.i);
  for (const r of routes) {
    const cells = b.routes[r.i].cells, mid = Math.floor((cells.length - 1) / 2);
    const order = cells.map((_, t) => t).sort((p, q) => Math.abs(p - mid) - Math.abs(q - mid) || p - q);
    for (const t of order) if (splitProblem(b, def, cells[t]) === null) return { x: kx(cells[t]), y: ky(cells[t]) };
  }
  return null;
}

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
export const sd = (xs: number[]): number => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)) : NaN; };
/** mean ± 95% interval of paired differences, in points of win rate. */
export const ci = (xs: number[]): { m: number; ci: number; n: number } => ({ m: 100 * mean(xs), ci: xs.length > 1 ? (100 * 1.96 * sd(xs)) / Math.sqrt(xs.length) : NaN, n: xs.length });
export const star = (day: number): number => (day <= 3 ? 1 : day <= 6 ? 2 : 3); // ★1 on day 3, ★2 on day 6, ★3 on day 10 (the stars carry the late game)
export { GATES_IDS };
