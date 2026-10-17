// SHAPES-2 step 6a (REQ-BFG-114 (3), REQ-BFG-086 (3); BRIEF-SHAPES2 S6 a, c): PLACEMENT VALUE. How much does where a shaped rig goes
// matter on the par decks? Ported from PIECES-1's shapeHits (5.2) and SHAPES-1's parFill.ts: the par field's decks (parField(hero,
// day, --k), the four playable heroes, --days 6,10), the world as --s2 / --plain say (the 1D world: both on; every other switch as
// the base ships it). For each shaped rig (the nine, or --rigs) and each deck, every placement (anchor x, y x rot 0-3) whose cells
// are on the deck, free (no machinery, no belt) and off the row-0 intake cells, with its hits (beltside.ts hitsIfPlaced: the real
// engine: one hit per arrow that points at a belt tile):
//  - best: the placement with the most hits on that deck (what a player who plans for it gets, shapedSpot's global best);
//  - spots: the placements with at least one hit (the useful spots), and careless: the mean hits over them (a random useful spot);
//  - typical: the par player's own choice (the "typical" policy draws one random belt tile and takes the best placement that
//    hits it, shapedSpot with a tile): the mean over every belt tile of the best hits that tile's placement makes;
//  - ratio: best / careless, per deck and pooled (REQ-BFG-086 (3): the best spot worth about 1.5x a careless one or more);
//  - vs1: best against a 1-cell rig with the same number of arrows (WHETSTONE-like: its best hits on the same deck), as PIECES-1
//    5.2's "beats a 1-cell rig" and 5.3's numbers rule (a shaped rig's per-hit number x its best hits against the 1-cell rig's number x
//    its own: NAIL STRIP 12 x 1.4-2 = 17-24 against WHETSTONE 20), with the rig's ★1 stat and the reference's given.
// Usage: node <built>/place.js --s2 on --plain on --days 6,10 --k 24 --out place.json [--md place.md]
// Pure harness reads; no battles; writes only --out and --md.
import { writeFileSync } from "node:fs";
import { GRID, ITEMS, type HeroId } from "../../src/sim/content";
import { arrowCell, isIntakeCell, key, occupancy, type Build } from "../../src/sim/deck";
import { footOnDeck, footprintCells } from "../../src/sim/foot";
import { hitsIfPlaced, beltIndex, shapedSpot } from "../../src/sim/beltside";
import { setShapes } from "../../src/sim/shapes";
import { SHAPES_IDS } from "../../src/sim/shapes";
import { SHAPES2_IDS, setShapes2 } from "../../src/sim/shapes2";
import { setPlainRigs } from "../../src/sim/plainRigs";
import { parField } from "../../src/sim/harness/par";

const arg = (k: string, d: string): string => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const S2 = arg("--s2", "on") === "on", PLAIN = arg("--plain", "on") === "on";
const DAYS = arg("--days", "6,10").split(",").map(Number), K = Number(arg("--k", "24"));
const OUT = arg("--out", "place.json"), MD = arg("--md", "");
const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
setShapes2(false); setShapes(false); setPlainRigs(false);
setPlainRigs(PLAIN); setShapes(true); setShapes2(S2);
const RIGS = arg("--rigs", [...SHAPES_IDS, ...(S2 ? SHAPES2_IDS : [])].join(",")).split(",").filter(Boolean);
/** A 1-cell rig's reference: its id (the best hits of a rig with the same arrows), by rarity (arrows: common 1, rare 2, epic 3). */
const REF: Record<string, string> = { common: "whetstone", rare: "longhaul", epic: "platebreaker" };

interface Row { rig: string; hero: string; day: number; decks: number; best: number; spots: number; careless: number; typical: number; ratio: number; ratioTypical: number; ref: number; vs1: number; idle: number }
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const r2 = (x: number): number => Math.round(100 * x) / 100;

/** Every legal placement of `def` on `b` with its hits: [x, y, rot, hits]. */
function placements(b: Build, def: string, belts = beltIndex(b)): [number, number, number, number][] {
  const d = ITEMS[def], occ = occupancy(b), out: [number, number, number, number][] = [];
  for (let rot = 0; rot < 4; rot++) for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
    if (!footOnDeck(d, x, y, rot)) continue;
    const cells = footprintCells(d, x, y, rot);
    if (cells.some((k) => occ[k].item >= 0 || occ[k].route >= 0 || isIntakeCell(b, k))) continue;
    out.push([x, y, rot, hitsIfPlaced(b, def, x, y, rot, belts).length]);
  }
  return out;
}

const t0 = Date.now();
const rows: Row[] = [];
for (const day of DAYS) for (const hero of HEROES) {
  const decks = parField(hero, day, K);
  for (const rig of RIGS) {
    if (!ITEMS[rig]) continue;
    const ref = REF[ITEMS[rig].rarity];
    const best: number[] = [], spots: number[] = [], careless: number[] = [], typical: number[] = [], refBest: number[] = [], idle: number[] = [], ratios: number[] = [], ratiosT: number[] = [];
    for (const b of decks) {
      const ps = placements(b, rig), useful = ps.filter((p) => p[3] > 0);
      if (!ps.length) continue;
      const bestHits = Math.max(0, ...ps.map((p) => p[3]));
      best.push(bestHits);
      spots.push(useful.length);
      idle.push(1 - useful.length / ps.length);
      const c = useful.length ? mean(useful.map((p) => p[3])) : 0;
      careless.push(c);
      // the typical player: one belt tile, the best placement that hits it
      const tiles = b.routes.flatMap((r, ri) => r.cells.map((_, ti) => [ri, ti] as const));
      const ts = tiles.map(([ri, ti]) => shapedSpot(b, rig, undefined, undefined, [ri, ti])?.hits.length ?? 0).filter((n) => n > 0);
      typical.push(ts.length ? mean(ts) : 0);
      if (useful.length && c > 0) { ratios.push(bestHits / c); }
      if (ts.length && mean(ts) > 0) ratiosT.push(bestHits / mean(ts));
      const rp = ITEMS[ref] ? placements(b, ref) : [];
      refBest.push(Math.max(0, ...rp.map((p) => p[3])));
    }
    const rb = mean(refBest);
    rows.push({ rig, hero, day, decks: best.length, best: r2(mean(best)), spots: r2(mean(spots)), careless: r2(mean(careless)), typical: r2(mean(typical)), ratio: r2(mean(ratios)), ratioTypical: r2(mean(ratiosT)), ref: r2(rb), vs1: r2(rb ? mean(best) / rb : 0), idle: r2(mean(idle)) });
  }
}
const label = `SHAPES2 ${S2 ? "+ " : "off, "}PLAIN_RIGS ${PLAIN ? "on" : "off"}, without RUN-1's LONG_RUN, on the old 10-day frame`;
writeFileSync(OUT, JSON.stringify({ label, s2: S2, plain: PLAIN, days: DAYS, k: K, rigs: RIGS, refs: REF, rows, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));

const L: string[] = [];
L.push(`### Placement value, ${label} (par field decks: ${K} a hero, heroes ${HEROES.join(", ")})`, "");
for (const day of DAYS) {
  L.push(`Day ${day}: best = the most hits any placement makes on a deck; spots = placements with 1+ hit; careless = mean hits over those spots; typical = the par player's pick (one random belt tile, the best placement hitting it); best/careless and best/typical pooled over decks; vs 1-cell = best hits against the best hits of a 1-cell rig of the same rarity (arrows: common 1, rare 2, epic 3; reference ${JSON.stringify(REF)}); idle = share of legal placements that hit nothing.`, "");
  L.push("| rig | hero | best | spots | careless | typical | best/careless | best/typical | 1-cell ref best | best vs 1-cell | idle |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const rig of RIGS) {
    const rs = rows.filter((r) => r.rig === rig && r.day === day);
    for (const r of rs) L.push(`| ${rig} | ${r.hero} | ${r.best} | ${r.spots} | ${r.careless} | ${r.typical} | ${r.ratio} | ${r.ratioTypical} | ${r.ref} | ${r.vs1} | ${r.idle} |`);
    if (rs.length) L.push(`| **${rig}** | **all** | **${r2(mean(rs.map((r) => r.best)))}** | **${r2(mean(rs.map((r) => r.spots)))}** | **${r2(mean(rs.map((r) => r.careless)))}** | **${r2(mean(rs.map((r) => r.typical)))}** | **${r2(mean(rs.map((r) => r.ratio)))}** | **${r2(mean(rs.map((r) => r.ratioTypical)))}** | **${r2(mean(rs.map((r) => r.ref)))}** | **${r2(mean(rs.map((r) => r.vs1)))}** | **${r2(mean(rs.map((r) => r.idle)))}** |`);
  }
  L.push("");
}
const md = L.join("\n");
console.log(md);
if (MD) writeFileSync(MD, md);
void arrowCell; void key;
