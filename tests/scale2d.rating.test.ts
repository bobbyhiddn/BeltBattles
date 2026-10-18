// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-108, REQ-BFG-106, REQ-BFG-110; BRIEF-SCALE2d D1): the bots' rating with SCALE_RIGS
// on (withScaleRigs; the shipped switch stays off) prices the 12 scaling pieces and VENOM DRIP's POISON from the typical
// counts by day (src/sim/scaleRating.ts), WITH a feeder when the deck holds one and the par count without; the route walk
// keeps FOR EACH DMG out of the flat DRAKE NOZZLE converts (SCALE-2a F3). Off, every rating is M0's (scale2c-accepted
// 0f2ba8d), pinned in tests/fixtures/scale2d-rating-off.json for every par, warlord and rival deck on days 1-10.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RATING_CURVE, drakeGain, fightTime, rateDeck } from "../src/sim/deckRating";
import { rigArrowCells, walkRoute, type Build, type Placed } from "../src/sim/deck";
import { honestReference, RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { warlordBuild } from "../src/sim/ai";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { SCALE_PIECES, scaleRules, withScaleRigs } from "../src/sim/scale";
import { READER_FEEDERS, hasFeeder, needsFeeder, onCurve, readCtx, readerCount, READ_FED, READ_PAR } from "../src/sim/scaleRating";
import { ITEMS } from "../src/sim/content";
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
  it("ships off", () => {
    expect(scaleRules()).toBe(false);
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
    const off = walkRoute(b, 0).estimate;
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
    expect(rate()).toEqual(pins);
    withScaleRigs(() => rate());
    expect(rate()).toEqual(pins);
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
