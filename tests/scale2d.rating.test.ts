// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-108, REQ-BFG-106, REQ-BFG-110; BRIEF-SCALE2d D1): the bots' rating with SCALE_RIGS
// on (withScaleRigs; the shipped switch stays off) prices the 12 scaling pieces and VENOM DRIP's POISON from the typical
// counts by day (src/sim/scaleRating.ts), WITH a feeder when the deck holds one and the par count without; the route walk
// keeps FOR EACH DMG out of the flat DRAKE NOZZLE converts (SCALE-2a F3). Off, every rating is M0's (scale2c-accepted
// 0f2ba8d), pinned in tests/fixtures/scale2d-rating-off.json for every par, warlord and rival deck on days 1-10.
// BUMP-1E: the switch ships ON (SCALE_RIGS = true, bb-0.12.0), so "off" below is the 0.9.11 world, asked for outright with
// withScaleRigs(fn, false) (synchronously only); the "on" reads are the shipped world, bare or under withScaleRigs(fn).
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RATING_CURVE, drakeGain, fightTime, rateDeck } from "../src/sim/deckRating";
import { rigArrowCells, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { honestReference, RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { SCALE_PIECES, SCALE_RIGS, scaleRules, withScaleRigs } from "../src/sim/scale";
import { READER_FEEDERS, hasFeeder, needsFeeder, onCurve, readCtx, readerCount, READ_FED, READ_PAR } from "../src/sim/scaleRating";
import { ITEMS } from "../src/sim/content";
import { withEnchant } from "../src/sim/enchant"; // BUMP-1F (ENCHANT on): the off world is the ENCHANT-off one too
import { effectAt } from "../src/sim/stars";
import { K, furnaceBench, withMod } from "./wave3.helpers";

const DAY = 6;
const value = (b: Build, day = DAY): number => rateDeck(b, RATING_CURVE, fightTime(day), undefined, undefined, day).value;

/** A one-cell rig `def` at (x, y), turned so an arrow hits the bench belt's cell (4, y) (column 4: furnaceBench). */
function rigAt(uid: number, def: string, x: number, y: number, stars = 1): Placed {
  for (let rot = 0; rot < 4; rot++) {
    if (rigArrowCells(def, x, y, rot).some((a) => a.to === K(4, y))) {
      return { uid, def, x, y, ...(rot ? { rot } : {}), ...(stars > 1 ? { stars } : {}) };
    }
  }
  throw new Error(`${def} hits nothing at ${x},${y}`);
}
const kindOf = (def: string): string => ITEMS[def].kind;
/** b with `def` added: a rig beside the belt at row `y` (column 3 or 5), or a gun part / core on turret 0. */
function add(b: Build, uid: number, def: string, y: number, stars = 1): Build {
  if (kindOf(def) === "gate") {
    const used = new Set(b.items.map((p) => K(p.x, p.y)));
    const x = used.has(K(3, y)) ? 5 : 3;
    return { ...b, items: [...b.items, rigAt(uid, def, x, y, stars)] };
  }
  return withMod(b, uid, def, 0, stars);
}
/** The feeder each test deck uses (one of READER_FEEDERS the bench can hold). POWDER KEG takes its OVERCLOCKER: a
 *  SPLITTER doubles the bench's slugs past its one gun's rate, and the jams then cost the keg more than its fed count adds
 *  (a real deck's pair is valued by the rating, which sees that). */
const FEEDER: Record<string, string> = {
  quench: "temper", pressure: "splitter", shieldwall: "plateroller", spallcatcher: "plateroller", keg: "overclocker",
  cindermail: "temper", rotgauge: "venom", leechcoil: "venom", crowdpress: "splitter", aegisspike: "wardbell",
};

/** The reader's lift on the FURNACE bench (one kiln, one 6-tile belt), with and without its feeder, at `stars`. */
function lifts(id: string, day = DAY, stars = 1): { fed: number; unfed: number } {
  const base = furnaceBench();
  const f = FEEDER[id];
  const fed0 = f ? add(base, 20, f, 4) : base;
  return {
    fed: value(add(fed0, 30, id, 2, stars), day) - value(fed0, day),
    unfed: value(add(base, 30, id, 2, stars), day) - value(base, day),
  };
}

describe("SCALE-2d D1: the rating with SCALE_RIGS on", () => {
  it("ships on (BUMP-1E; was off)", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on (bb-0.12.0)
    expect(scaleRules()).toBe(true); // BUMP-1E: was toBe(false)
  });

  it("each of the 12 and VENOM DRIP rates above 0 with its feeder (★1, day 6)", () => {
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const l = lifts(id);
        expect(l.fed, `${id} fed`).toBeGreaterThan(0);
      }
      const venom = value(add(furnaceBench(), 30, "venom", 2)) - value(furnaceBench());
      expect(venom, "VENOM DRIP's POISON").toBeGreaterThan(0);
    });
  });

  it("each reader that wants a feeder rates lower without it than with it, on days 3, 6 and 9", () => {
    withScaleRigs(() => {
      for (const id of SCALE_PIECES.filter(needsFeeder)) {
        for (const day of [3, 6, 9]) {
          const l = lifts(id, day);
          expect(l.unfed, `${id} day ${day}: unfed ${l.unfed} < fed ${l.fed}`).toBeLessThan(l.fed);
        }
      }
      // GRUDGE ROD and TROPHY CHAIN want none: their counts are the run's (COUNTS.md 8), and grow by day
      for (const id of ["grudgerod", "trophychain"]) expect(lifts(id, 9).fed).toBeGreaterThan(lifts(id, 3).fed);
    });
  });

  it("a reader without its feeder rates low: KINDLING with no BURN source and the POISON readers without VENOM DRIP are 0", () => {
    withScaleRigs(() => {
      const bench = furnaceBench();
      const w = walkRoute(bench, 0).estimate;
      expect(w.burn).toBe(0); // the bench's slugs carry no BURN
      for (const id of ["quench", "rotgauge", "leechcoil"]) expect(Math.abs(lifts(id).unfed), id).toBeLessThan(1e-9);
      const ctx = readCtx(bench, DAY, false);
      expect(readerCount(bench, "quench", "foeBurn", ctx)).toBe(0);
      expect(readerCount(bench, "rotgauge", "foePoison", ctx)).toBe(0);
    });
  });

  it("the counts follow COUNTS.md: fed above par wherever a feeder variant exists; the run's hearts and wins by day", () => {
    for (const c of Object.keys(READ_FED) as (keyof typeof READ_FED)[]) {
      for (const d of [1, 3, 6, 9, 10]) expect(onCurve(READ_FED[c]!, d), `${c} d${d}`).toBeGreaterThan(onCurve(READ_PAR[c], d));
    }
    expect(onCurve(READ_PAR.heartsLost, 3)).toBe(1.0);
    expect(onCurve(READ_PAR.heartsLost, 9)).toBe(6.8);
    expect(onCurve(READ_PAR.wins, 6)).toBe(2.5);
    expect(onCurve(READ_PAR.wins, 10)).toBeCloseTo(4.2 + 2.6 / 3, 9);
    expect(onCurve(READ_PAR.foeBurn, 1)).toBe(2.2); // clamped before the first anchor
  });

  it("feeders: every listed feeder is a module in ITEMS with the switch on; hasFeeder reads the deck", () => {
    withScaleRigs(() => {
      for (const [id, fs] of Object.entries(READER_FEEDERS)) {
        expect(ITEMS[id], id).toBeDefined();
        for (const f of fs) expect(ITEMS[f], `${id} <- ${f}`).toBeDefined();
      }
      const b = add(furnaceBench(), 20, "temper", 4);
      expect(hasFeeder(b, "quench")).toBe(true);
      expect(hasFeeder(furnaceBench(), "quench")).toBe(false);
      expect(hasFeeder(furnaceBench(), "grudgerod")).toBe(true);
    });
  });

  it("stars raise each reader's price (★1 < ★2 < ★3, fed, day 9)", () => {
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const [a, b, c] = [1, 2, 3].map((s) => lifts(id, 9, s).fed);
        expect(b, `${id} ★2`).toBeGreaterThan(a);
        expect(c, `${id} ★3`).toBeGreaterThan(b);
      }
    });
  });

  it("DRAKE NOZZLE's estimate follows step 4: the walk's flat leaves FOR EACH DMG out with the switch on", () => {
    // a LONG HAUL-type rig (perPriorGate) after two WHETSTONE-type hits: off its count joins `flat`, on it rides `each`
    expect(effectAt("longhaul", 1).gate?.perPriorGate).toBeGreaterThan(0);
    expect(effectAt("whetstone", 1).gate).toEqual({ flat: 20 });
    let b = furnaceBench();
    b = { ...b, items: [...b.items, rigAt(40, "whetstone", 3, 4), rigAt(41, "whetstone", 3, 3), rigAt(42, "longhaul", 3, 1)] };
    const off = withScaleRigs(() => walkRoute(b, 0).estimate, false); // BUMP-1E: the switch ships on, so the off walk is read with it off (was bare)
    const on = withScaleRigs(() => walkRoute(b, 0).estimate);
    expect(off.each).toBeUndefined();
    expect(on.each ?? 0).toBeGreaterThan(0);
    expect(on.flat! + on.each!).toBe(off.flat);
    expect(on.dmg).toBe(off.dmg);
    // the DRAKE price reads the walk's flat: on, the count's DMG is not converted
    const drake = Object.keys(ITEMS).find((id) => ITEMS[id].kind === "core" && effectAt(id, 3).core?.routine === "drake")!;
    const spec = effectAt(drake, 3).core!;
    expect(drakeGain(spec, on.flat!)).not.toBe(drakeGain(spec, off.flat!));
  });

  it("the walk records each reader line on its hit (display data) and adds nothing for it", () => {
    withScaleRigs(() => {
      const b = add(furnaceBench(), 30, "quench", 2);
      const w = walkRoute(b, 0);
      const th = w.timeline.flatMap((r) => r.hits).find((h) => h.uid === 30)!;
      expect(th.reads).toEqual(effectAt("quench", 1).gate!.reads);
      expect(w.estimate.dmg).toBe(walkRoute(furnaceBench(), 0).estimate.dmg);
    });
  });

  it("off equals M0: every par, warlord and rival deck's rating, days 1-10 (and after a switch round trip)", () => {
    const pins = JSON.parse(readFileSync("tests/fixtures/scale2d-rating-off.json", "utf8")) as Record<string, number[]>;
    const rate = (): Record<string, number[]> => {
      const out: Record<string, number[]> = {};
      const put = (k: string, b: Build, d: number): void => {
        const r = rateDeck(b, RATING_CURVE, fightTime(d), undefined, undefined, d), q = rateDeck(b);
        out[k] = [r.offense, r.defense, q.offense, q.defense];
      };
      for (let d = 1; d <= 10; d++) {
        for (const h of PLAYABLE_HEROES) { put(`par/${h}/${d}`, honestReference(h, d), d); put(`warlord/${h}/${d}`, warlordBuild(h, d), d); }
        for (const id of RIVAL_IDS) put(`rival/${id}/${d}`, rivalBuild(id, d), d);
      }
      return out;
    };
    // BUMP-1E: the switch ships on, so the off ratings are read with it off (was `rate()` bare). The par, warlord and rival decks are fixed
    // layouts and plans (ai.ts warlordBuild, rivals.ts honestReference and rivalBuild over rivalBuilds.ts PLANS: no stand-in pool and no par
    // run in them), so the seven new ids in the committed pool do not reach them and the off world reads M0's pins, but for two keys.
    // BUMP-1E C3 (211c498, the captains' ladder; in every world, the captains' decks are not switch-aware): SOOTJAW's SCATTER CHOKE comes on
    // day 5 (was 3), so his day-3 and day-4 decks are other decks and rate lower with the switch off too (offense only; the defense and every
    // day-5-and-later pin are as they were). The fixture keeps M0's two arrays; the two new ones are pinned here, and the next test proves the move
    // is the choke alone (the new deck with the old plan's choke put back rates M0's pin).
    const MOVED: Record<string, number[]> = {
      "rival/sootjaw/3": [88.08237751004019, 2300, 112.37572266666669, 2300], // BUMP-1E C3: was [98.65226281124501, 2300, 125.8608093866667, 2300]
      "rival/sootjaw/4": [168.96471165644175, 2660, 212.126208, 2660], // BUMP-1E C3: was [189.24047705521477, 2660, 237.58135296, 2660]
      // BUMP-1F (P3 D1's two captain-deck steps, src/sim/rivalBuilds.ts, in every world: the captains' decks are not switch-aware; RULING-BUMP1F-R2 R2.4 and R5 R5.2 (2)): BRASSWICK's second factory (the TWIN MOULD) comes
      // on day 7 (was 5; fa0e336, F7: the day-6 ladder), so his day-5 and day-6 decks rate lower (offense only); OLD BULWARK's good-luck GREASE comes on day 3 (was 6; 0c98513), and a Hard captain's warlord deck is his
      // good-luck deck, so his day-3, -4 and -5 decks rate other offense numbers (see each line). Measured in this world with ENCHANT and SCALE_RIGS off; the defense and every other key are M0's.
      // The cause is the two plan steps alone: in a scratch copy of the tree with bump1f-base's rivalBuilds.ts put back, this test passes with the sootjaw entries only (and refitaz.road's all-off digest reads its old pin)
      "rival/brasswick/5": [60.315104166666664, 3210.1375, 65.69839791666668, 3229.375], // BUMP-1F (F7): was [97.12073414694281, 3210.1375, 104.39747418333334, 3229.375]
      "rival/brasswick/6": [78.61348314606741, 3583.4, 83.9592, 3605], // BUMP-1F (F7): was [115.7145947565543, 3583.4, 122.65827626666666, 3605]
      "rival/bulwark/3": [86.70639877627485, 2300, 104.20407130290458, 2300], // BUMP-1F (D1 second step): was [59.62034750400571, 2300, 117.36212038951315, 2300]
      "rival/bulwark/4": [107.43148668731905, 2660, 137.91965130675345, 2660], // BUMP-1F (D1 second step): was [103.00550944304103, 2660, 167.96590052638615, 2660]
      "rival/bulwark/5": [141.43333395982492, 3020, 177.45117130675348, 3020], // BUMP-1F (D1 second step): was [147.7279861932939, 3020, 225.26211385971948, 3020]
    };
    const want = { ...pins, ...MOVED };
    expect(Object.keys(want).length).toBe(Object.keys(pins).length); // the two keys are the fixture's own: nothing is added or dropped
    // BUMP-1F (ENCHANT on, bb-0.13.0; RULING-BUMP1F-R3.1): M0's pins are the ENCHANT-off world's decks, and with ENCHANT on the rivals carry their own words from day 5 (ENCHANT-2, npcWords.ts:
    // rivalBuild reads them), which the rating prices, so LOCKJAW's and LONGTOOTH's days 5-10 rated other numbers (offense and defense) with the scaling switch off too; the off world is read with
    // ENCHANT off as well (was withScaleRigs(rate, false))
    const rateOff = (): Record<string, number[]> => withEnchant(() => withScaleRigs(rate, false), false);
    expect(rateOff()).toEqual(want);
    withScaleRigs(() => rate()); // the switch on in between
    expect(rateOff()).toEqual(want);
  });

  it("BUMP-1E C3: SOOTJAW's day-3 and day-4 off pins moved with his SCATTER CHOKE's day (3 -> 5), and only with it: put back, the deck rates M0's pins", () => {
    const pins = JSON.parse(readFileSync("tests/fixtures/scale2d-rating-off.json", "utf8")) as Record<string, number[]>;
    const rated = (b: Build, d: number): number[] => {
      const r = rateDeck(b, RATING_CURVE, fightTime(d), undefined, undefined, d), q = rateDeck(b);
      return [r.offense, r.defense, q.offense, q.defense];
    };
    withScaleRigs(() => {
      for (const d of [3, 4]) {
        const now = rivalBuild("sootjaw", d);
        expect(now.mods.some((m) => m.def === "scatter"), `sootjaw d${d} holds no SCATTER CHOKE now (the plan buys it on day 5)`).toBe(false);
        // the old plan's M(3, "scatter", 0) sat at index 3 of his upgrades: uid 9000 + 10 + 3 (rivalBuilds.ts assemble), on turret 0
        const back: Build = { ...now, mods: [...now.mods, { uid: 9013, def: "scatter", turret: 0 }] };
        expect(rated(back, d), `sootjaw d${d} with the choke put back`).toEqual(pins[`rival/sootjaw/${d}`]);
        expect(rated(now, d)[0], `sootjaw d${d} without it rates lower (offense)`).toBeLessThan(pins[`rival/sootjaw/${d}`][0]);
      }
      expect(rivalBuild("sootjaw", 5).mods.some((m) => m.def === "scatter")).toBe(true); // from day 5 he holds it, as the pins say
    }, false);
  });

  it("the D1 table (REPORT section 2): each reader's count and ★1 value a hit by day, fed and not (TABLE_OUT)", () => {
    withScaleRigs(() => {
      const rows: string[] = [];
      const one = (r: number): string => (Math.abs(r) >= 10 ? r.toFixed(0) : r.toFixed(1));
      for (const id of SCALE_PIECES) {
        const cells: string[] = [];
        const d1 = effectAt(id, 1), reads = d1.gate?.reads ?? d1.mod?.reads;
        for (const day of [3, 6, 9, 10]) {
          const at = (fed: boolean): { n: number; v: number } => {
            const f = FEEDER[id];
            const b = fed && f ? add(furnaceBench(), 20, f, 4) : furnaceBench();
            const out = { stokeKeep: new Map<number, number>(), arrival: new Map<number, number>() };
            rateDeck(b, RATING_CURVE, fightTime(day), out, undefined, day);
            const ctx = readCtx(b, day, walkRoute(b, 0).estimate.burn > 0);
            if (fed && f === "plateroller") ctx.plateFight = (effectAt(f, 1).gate!.plate ?? 0) * (out.arrival.get(0) ?? 0) * fightTime(day);
            if (id === "pressure") { const n = readerCount(b, id, "waiting", ctx); return { n, v: effectAt(id, 1).core!.perQueued! * n }; }
            const n = readerCount(b, id, reads!.count, ctx);
            return { n, v: reads!.each * (reads!.per ? n / reads!.per : n) };
          };
          const fed = at(true), par = at(false);
          cells.push(`${one(fed.n)} -> ${one(fed.v)} (${one(par.n)} -> ${one(par.v)})`);
        }
        rows.push(`| ${ITEMS[id].name} | ${reads ? `${reads.count}, ${reads.each}${reads.per ? ` per ${reads.per}` : ""} ${reads.give}` : "waiting, 12 dmg"} | ${cells.join(" | ")} |`);
      }
      if (process.env.TABLE_OUT) writeFileSync(process.env.TABLE_OUT, rows.join("\n") + "\n");
      expect(rows.length).toBe(12);
    });
  });
});
