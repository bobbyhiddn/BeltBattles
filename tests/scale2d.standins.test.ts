// SCALE-2d (REQ-BFG-098 098.6; BRIEF-SCALE2d D4): stand-ins and deck codes with SCALE_RIGS on (withScaleRigs; the shipped
// switch stays off). Both codecs (the harness's standinCode.ts and the game's loader standInPool.ts) write and read the seven
// new ids with the switch on (an item word is <lowercase id><yx>, so no codec change is needed); off, a new id is a bad item,
// as at the base, and the shipped pool decodes exactly as before (and the same with the switch on: it holds no new id).
// The DRY sample (REPORT-SHAPES1 section 6's form, NOT the shipped pool: BUMP-1E regenerates it): genStandIns on a tiny
// caravan population (the CLI's sources: --source caravan --par field, cores and factories on), switch on, in memory,
// nothing written: every pick round-trips through both codecs, and the generator's own check of what it would write
// (standins.ts writtenProblems: decode = what was scored, validateBuild, no unfused pair, 2 stars, the day's gold) finds
// nothing; the holders of each of the 12 are counted (TABLE_OUT). The sample is opt-in (SCALE2D_DRY=1): minutes of play.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEMS } from "../src/sim/content";
import { canPlaceItem, cloneBuild, type Build } from "../src/sim/deck";
import { SCALE_IDS, SCALE_PIECES, scaleRules, setScaleRigs, withScaleRigs } from "../src/sim/scale";
import { decodeStarred, encodeStarred } from "../src/sim/harness/standinCode";
import { decodeStarredRaw, encodeStarred as loaderEncode, standInPool, STAND_IN_POOL_HEROES } from "../src/sim/standInPool";
import { STANDIN_DEFAULTS, dataModuleText, genStandIns, writtenProblems } from "../src/sim/harness/standins";
import { localRunner } from "../src/sim/harness/tournament";
import { furnaceBench } from "./wave3.helpers";

const holds = (b: Build, id: string): boolean => b.items.some((p) => p.def === id) || b.mods.some((m) => m.def === id);
/** The bench with one new id on the first free cell (switch on). */
function withId(id: string, uid: number): Build {
  const b = cloneBuild(furnaceBench(0));
  for (let y = 1; y < 10; y++) for (let x = 0; x < 10; x++) if (canPlaceItem(b, id, x, y, -1, 0).ok) { b.items.push({ uid, def: id, x, y, stars: 2 }); return b; }
  throw new Error(`no cell for ${id}`);
}
/** withScaleRigs for an async body. withScaleRigs puts the switch back as soon as its fn returns, which for an async fn is
 *  at its first await: the generation below would run with the switch OFF (the first draft of this sample did). So the
 *  switch stays on here until the body's promise settles, then goes back, even on a throw. */
async function onWhile<T>(fn: () => Promise<T>): Promise<T> {
  setScaleRigs(true);
  try {
    return await fn();
  } finally {
    setScaleRigs(false);
  }
}
const strip = (b: Build): unknown => JSON.parse(JSON.stringify({ ...b, items: b.items.map(({ uid: _u, ...p }) => p), mods: b.mods.map(({ uid: _u, ...m }) => m) }));

describe("SCALE-2d D4: deck codes", () => {
  it("ships off; with the switch on both codecs write and read each new id (★2 too); off it is a bad item", () => {
    expect(scaleRules()).toBe(false);
    const codes = withScaleRigs(() => SCALE_IDS.map((id, i) => {
      const b = withId(id, 50 + i);
      const code = encodeStarred(b);
      expect(loaderEncode(b), id).toBe(code); // the two codecs write the same words
      expect(code, id).toContain(`${id}`);
      expect(strip(decodeStarred("furnace", code)), id).toEqual(strip(b));
      expect(strip(decodeStarredRaw("furnace", code)), id).toEqual(strip(b));
      expect(encodeStarred(decodeStarred("furnace", code))).toBe(code);
      return code;
    }));
    for (const [i, code] of codes.entries()) {
      expect(() => decodeStarred("furnace", code), SCALE_IDS[i]).toThrow(/bad item/);
      expect(() => decodeStarredRaw("furnace", code), SCALE_IDS[i]).toThrow(/bad item/);
    }
  });

  it("the shipped pool decodes the same off and on, and every code reads back to itself (byte for byte)", () => {
    const read = (): string => JSON.stringify(STAND_IN_POOL_HEROES.flatMap((h) => [...Array(10).keys()].map((i) => standInPool(h, i + 1))));
    const off = read();
    expect(withScaleRigs(read)).toBe(off);
    let n = 0;
    for (const h of STAND_IN_POOL_HEROES) for (let d = 1; d <= 10; d++) for (const e of standInPool(h, d)) {
      const code = encodeStarred(e.build);
      expect(encodeStarred(decodeStarred(h, code))).toBe(code);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
});

// The sample plays 20 hero-days of caravan runs (5 to 13 minutes on this host), so it is opt-in: SCALE2D_DRY=1 (and
// TABLE_OUT=<file> for the table). BUMP-1E's regeneration runs the same writtenProblems check on the real pool.
describe("SCALE-2d D4: the DRY stand-in sample (switch on, in memory, nothing written; SCALE2D_DRY=1)", () => {
  it.runIf(process.env.SCALE2D_DRY === "1")("a tiny caravan population: every pick round-trips and validates; the holders of each of the 12", async () => {
    const tiny = {
      ...STANDIN_DEFAULTS, pop: 6, gauntlet: 2, seeds: 1, elites: 2, refSeeds: 2, per: 2, grow: [8], stars: "on" as const,
      cores: "on" as const, factories: "on" as const, source: "caravan" as const, par: "field" as const,
    };
    const res = await onWhile(async () => {
      const r = await genStandIns(tiny, localRunner);
      const rows: string[] = [];
      let picks = 0, pop = 0;
      const count = new Map<string, { picks: number; pop: number }>(SCALE_PIECES.map((id) => [id, { picks: 0, pop: 0 }]));
      for (const hd of r.days) {
        pop += hd.pop.length;
        for (const c of hd.pop) for (const id of SCALE_PIECES) if (holds(c.build, id)) count.get(id)!.pop++;
        for (const p of hd.picks) {
          picks++;
          // both codecs write the same words and read each other's code back to the same deck
          const code = encodeStarred(p.build);
          expect(loaderEncode(p.build)).toBe(code);
          const back = decodeStarred(hd.hero, code);
          expect(encodeStarred(back)).toBe(code);
          expect(strip(decodeStarredRaw(hd.hero, code))).toEqual(strip(back));
          for (const id of SCALE_PIECES) if (holds(p.build, id)) count.get(id)!.picks++;
        }
      }
      // the generator's own check of what it would write (standins.ts writtenProblems, the --check path), in memory: every
      // stored code decodes to exactly the deck that was scored, passes validateBuild (strict; under NPC_DAY the budget line is
      // the road-aware one below it), has no unfused pair, stops at 2 stars and fits maxGoldByDay + the runes' gold + the road
      const problems = writtenProblems(tiny, r.days, dataModuleText(tiny, r.days));
      rows.push(`hero-days ${r.days.length}, population ${pop} decks, picks ${picks} (tiny: pop 6, gauntlet 2, 1 seed, 2 elites, caravan, par field, cores and factories on); writtenProblems: ${problems.length}`);
      rows.push("| piece | picks holding it | population holding it |", "|---|---|---|");
      for (const id of SCALE_PIECES) rows.push(`| ${ITEMS[id].name} | ${count.get(id)!.picks} | ${count.get(id)!.pop} |`);
      return { rows, picks, problems, held: [...count.values()].reduce((n, c) => n + c.pop, 0) };
    });
    if (process.env.TABLE_OUT) writeFileSync(process.env.TABLE_OUT, res.rows.join("\n") + "\n");
    console.log(res.rows.join("\n"));
    expect(res.problems).toEqual([]);
    expect(res.picks).toBeGreaterThan(0);
    expect(res.held).toBeGreaterThan(0); // the bots buy some of the 12 into the dry sample's decks
  }, 1_800_000);
});
