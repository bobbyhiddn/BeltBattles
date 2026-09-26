import { describe, expect, it } from "vitest";
import { REROLL_COST, RUN_DAYS } from "../src/sim/content";
import { MATRIARCH_DAY, maxGoldByDay, warlordPool, type RivalId } from "../src/sim/rivals";
import { EVENT_IDS } from "../src/game/eventDefs";
import { discountGain, gmax, roadCap, roadCapHoard, roadOptions, warlordPays } from "../src/net/roadCap";

// v070-validate M4 (REPORT.md §2): roadCap's slack per day. roadCap is the best road plan under relaxations that
// keep it safe; this file measures what they cost, against the best CONSISTENT plan: one road stop a day, the
// deck plan's own road gold funding its discounted caravan, every road part kept on the deck.
//  1. gmax counts road parts as gold for the discount (roadCap - roadCapHoard);
//  2. gmax's gold-only plan is not the plan the deck took (roadCapHoard - consistent);
//  3. the Hard slot's rotation (warlordOffers: days 1-5 one shuffle of the five Hard captains, then the next
//     shuffle, never yesterday's captain): roadCap takes the best captain on every day;
//  4. a free SABOTAGE: roadCap takes the best of each captain's deck with and without it.
// It re-derives the road plans with its own code (a DP over days x used events x Matriarch x bounty x the
// plan's road gold) and cross-checks roadCap.ts by brute force on short runs.

const EV = EVENT_IDS;
/** Each event's plain-deck options (the hull and belt "mixes" are costed separately, D3). */
const OPTS = EV.map((e) => roadOptions().get(e)!.filter((o) => o.hull === 0 && o.belt === 0));
const AMOUNTS = [0, ...new Set(OPTS.flat().filter((o) => o.bounty > 0).map((o) => o.bounty))];
const SCOUT_BITS = EV.reduce((m, e, i) => (OPTS[i].some((o) => o.discount > 0) ? m | (1 << i) : m), 0);

/** The gold a run holds at caravan d + 1 when the scout's discount lands there. */
type Funding = (d: number, g: number) => number;
const byGmax: Funding = (d) => gmax(d + 1); // roadCap
const byHoard: Funding = (d) => gmax(d + 1, true); // roadCapHoard
const byOwnGold: Funding = (d, g) => maxGoldByDay(d + 1) + g; // the consistent plan: its own road gold

interface State { mask: number; beaten: number; b: number; g: number }
interface Move { label: string; value: number; next: State; hardPart?: number }

/** One day's road stops from a state, valued as roadCap.ts planDP "deck" values them (no mix). */
function moves(d: number, D: number, s: State, fund: Funding): Move[] {
  const spend = d < D; // gold received today can still be spent on this deck
  const caravan = d + 1 <= D; // the next caravan comes before the deck's dusk
  const out: Move[] = [];
  const flat = Math.max(0, ...(["easy", "medium"] as const).flatMap((t) => warlordPays(t, d).map((p) => (spend ? p.gold : 0) + p.part)));
  out.push({ label: "easy/medium", value: flat, next: { ...s, g: s.g + flat } });
  const bounty = spend ? AMOUNTS[s.b] : 0;
  const queen = d >= MATRIARCH_DAY && !s.beaten;
  const pays = warlordPays(queen ? "matriarch" : "hard", d);
  const best = pays.reduce((x, p) => ((spend ? p.gold : 0) + p.part > (spend ? x.gold : 0) + x.part ? p : x));
  const gold = (spend ? best.gold : 0) + bounty;
  out.push({
    label: `${queen ? "matriarch" : "hard"}${s.b ? " + bounty" : ""}`, value: gold + best.part,
    next: { mask: s.mask, beaten: queen ? 1 : s.beaten, b: 0, g: s.g + gold }, ...(queen ? {} : { hardPart: best.part }),
  });
  OPTS.forEach((list, i) => {
    if (s.mask & (1 << i)) return;
    for (const o of list) {
      let value = (spend ? o.gold : 0) - o.pay + o.parts;
      if (caravan) value += o.reroll * REROLL_COST + (o.discount > 0 ? discountGain(o.discount, fund(d, s.g)) : 0);
      const liquid = (spend ? o.gold : 0) - o.pay + Math.min(0, o.parts); // a part given (the trader's good) was bought with gold
      out.push({
        label: `event ${EV[i]}: ${o.label}`, value,
        next: { mask: s.mask | (1 << i), beaten: s.beaten, b: o.bounty > 0 ? AMOUNTS.indexOf(o.bounty) : s.b, g: s.g + liquid },
      });
    }
  });
  return out;
}

interface Step { day: number; pick: string; value: number; hardPart?: number }
interface Plan { value: number; plan: Step[] }

/** The best plan over days 1..D by DP. The plan's road gold `g` is state only when it funds the discount. */
function bestPlan(D: number, fund: Funding): Plan {
  const keyOf = (s: State) => `${s.mask}|${s.beaten}|${s.b}|${fund === byOwnGold && !(s.mask & SCOUT_BITS) ? s.g : 0}`;
  type Node = { v: number; s: State; prev: Node | null; step: Step | null };
  let cur = new Map<string, Node>([[keyOf({ mask: 0, beaten: 0, b: 0, g: 0 }), { v: 0, s: { mask: 0, beaten: 0, b: 0, g: 0 }, prev: null, step: null }]]);
  for (let d = 1; d <= D; d++) {
    const nxt = new Map<string, Node>();
    for (const node of cur.values()) {
      for (const m of moves(d, D, node.s, fund)) {
        const k = keyOf(m.next), v = node.v + m.value;
        const had = nxt.get(k);
        if (!had || v > had.v) nxt.set(k, { v, s: m.next, prev: node, step: { day: d, pick: m.label, value: m.value, ...(m.hardPart !== undefined ? { hardPart: m.hardPart } : {}) } });
      }
    }
    cur = nxt;
  }
  let top: Node | null = null;
  for (const n of cur.values()) if (!top || n.v > top.v) top = n;
  const plan: Step[] = [];
  for (let n = top; n && n.step; n = n.prev) plan.unshift(n.step);
  return { value: top!.v, plan };
}

/** The same maximum by brute force over every plan (short runs only). */
function bruteForce(D: number, fund: Funding): number {
  const go = (d: number, s: State): number => (d > D ? 0 : Math.max(...moves(d, D, s, fund).map((m) => m.value + go(d + 1, m.next))));
  return go(1, { mask: 0, beaten: 0, b: 0, g: 0 });
}

const HARD = warlordPool("hard");
const partOf = (id: RivalId, d: number, sabotaged = false): number => warlordPays("hard", d).find((p) => p.id === id && p.sabotaged === sabotaged)!.part;

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Every Hard slot a seed can give days 1..7 (rivals.ts slotOrder): days 1-5 one shuffle of the five Hard captains,
 *  days 6-7 the head of the next shuffle, whose first captain is never day 5's: 120 x 16 = 1920 rotations. */
const ROTATIONS: RivalId[][] = permutations(HARD).flatMap((p) => HARD.filter((a) => a !== p[4]).flatMap((a) => HARD.filter((c) => c !== a).map((c) => [...p, a, c])));

/**
 * Some seed's Hard slots pay every Hard fight of `plan` the part it counted: a rotation for days 1-7, and after the
 * Matriarch is beaten (warlordOffer's "after" stream) any captain but yesterday's. A witness, or null.
 */
function rotationFor(plan: Step[]): string[] | null {
  const early = plan.filter((p) => p.hardPart !== undefined && p.day < MATRIARCH_DAY);
  const r = ROTATIONS.find((rot) => early.every((p) => partOf(rot[p.day - 1], p.day) >= p.hardPart!));
  if (!r) return null;
  const queen = plan.find((p) => p.pick.startsWith("matriarch"))?.day;
  const late = plan.filter((p) => p.hardPart !== undefined && p.day >= MATRIARCH_DAY);
  if (late.length && queen === undefined) return null; // the Matriarch holds the Hard slot until beaten
  // after her: every sequence of captains, never yesterday's (at most 5^2 of them)
  const fill = (d: number, yesterday: RivalId | null): string[] | null => {
    if (d > plan.length) return [];
    const need = late.find((p) => p.day === d)?.hardPart ?? 0;
    for (const id of HARD.filter((c) => c !== yesterday && partOf(c, d) >= need)) {
      const rest = fill(d + 1, id);
      if (rest) return [`d${d} ${id}`, ...rest];
    }
    return null;
  };
  const after = fill((queen ?? plan.length) + 1, null);
  if (!after) return null;
  return [...r.slice(0, Math.min(plan.length, MATRIARCH_DAY - 1)).map((id, i) => `d${i + 1} ${id}`), ...(queen ? [`d${queen} matriarch`] : []), ...after];
}

const DAYS = Array.from({ length: RUN_DAYS }, (_, i) => i + 1);

describe("roadCap's slack per day (REPORT.md §2)", () => {
  const cap = DAYS.map((d) => bestPlan(d, byGmax));
  const hoard = DAYS.map((d) => bestPlan(d, byHoard));
  const own = DAYS.map((d) => bestPlan(d, byOwnGold));

  it("this file's DP reproduces roadCap and roadCapHoard on every day, and brute force agrees on days 1-4", () => {
    expect(cap.map((p) => p.value)).toEqual(DAYS.map(roadCap));
    expect(hoard.map((p) => p.value)).toEqual(DAYS.map(roadCapHoard));
    for (const d of [1, 2, 3, 4]) {
      expect(bruteForce(d, byGmax), `roadCap d${d}`).toBe(roadCap(d));
      expect(bruteForce(d, byHoard), `hoard d${d}`).toBe(roadCapHoard(d));
      expect(bruteForce(d, byOwnGold), `consistent d${d}`).toBe(own[d - 1].value);
    }
  }, 120_000);

  it("a free SABOTAGE never adds value: no captain's day-before deck offers a pricier part", () => {
    for (const d of DAYS) {
      for (const id of HARD) expect(partOf(id, d, true), `${id} d${d}`).toBeLessThanOrEqual(partOf(id, d));
      if (d >= MATRIARCH_DAY) {
        const q = warlordPays("matriarch", d);
        expect(q.find((p) => p.sabotaged)!.part).toBeLessThanOrEqual(q.find((p) => !p.sabotaged)!.part);
      }
    }
  });

  it("the rotation adds nothing: the best plans of roadCap and of the consistent run fit a seed's Hard slots", () => {
    for (const d of DAYS) {
      expect(rotationFor(cap[d - 1].plan), `roadCap d${d}`).not.toBeNull();
      expect(rotationFor(own[d - 1].plan), `consistent d${d}`).not.toBeNull();
    }
  });

  it("prints and pins the slack: roadCap >= roadCapHoard >= the best consistent plan", () => {
    const rows = DAYS.map((d) => {
      const c = roadCap(d), h = roadCapHoard(d), o = own[d - 1].value;
      return { d, c, h, o, liquid: c - h, mismatch: h - o, slack: c - o };
    });
    for (const r of rows) {
      expect(r.h).toBeLessThanOrEqual(r.c);
      expect(r.o).toBeLessThanOrEqual(r.h);
    }
    console.log(`v070 roadCap slack per day (the best consistent plan: its own road gold funds its discount, parts kept):\n`
      + `  day | shop | roadCap | hoard | consistent | slack | of which: parts as gold | of which: gmax's other plan\n`
      + rows.map((r) => `  d${r.d} | ${maxGoldByDay(r.d)} | ${r.c} | ${r.h} | ${r.o} | ${r.slack} | ${r.liquid} | ${r.mismatch}`).join("\n")
      + `\n  the consistent plans and a Hard rotation that pays them:\n`
      + own.map((p, i) => `  d${i + 1} (${p.value}): ${p.plan.map((s) => `${s.day} ${s.pick} ${s.value}`).join(" | ")}\n      rotation: ${rotationFor(p.plan)!.join(", ")}`).join("\n"));
    expect(rows.map((r) => r.slack)).toEqual(SLACK);
    expect(rows.map((r) => r.liquid)).toEqual([0, 0, 0, 0, 2, 4, 7, 9, 9, 12]);
  });
});

/** Pinned per-day slack (roadCap - the best consistent plan): REPORT.md §2. A content change that moves it is reviewed. */
const SLACK: number[] = [0, 0, 0, 1, 3, 6, 9, 10, 12, 15];
