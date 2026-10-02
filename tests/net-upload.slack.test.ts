import { describe, expect, it } from "vitest";
import { REROLL_COST, RUN_DAYS } from "../src/sim/content";
import { MATRIARCH_DAY, maxGoldByDay, warlordPool, type RivalId } from "../src/sim/rivals";
import { EVENT_IDS } from "../src/game/eventDefs";
import { discountGain, gmax, roadCap, roadCapHoard, roadOptions, warlordPays, type WarlordPay } from "../src/net/roadCap";

// v070-validate M4 (REPORT.md §2), re-derived on rel-062-final 40d2b2c (v070-rel M1): roadCap's slack per day. roadCap is
// the best road plan under relaxations that keep it safe; this file measures what they cost, against the best CONSISTENT
// plan one run can follow: one road stop a day, its own road gold funding its discounted caravan, every road part kept on
// the deck, the Hard captains one seed shows, and no SABOTAGE it did not hire. The relaxations:
//  1. gmax counts road parts as gold for the discount (roadCap - roadCapHoard);
//  2. gmax's gold-only plan is not the plan the deck took (roadCapHoard - "free": the consistent plan with roadCap's
//     Hard slot, the best captain every day and a free SABOTAGE);
//  3. the Hard slot's rotation (rivals.ts slotOrder and warlordOffer: one shuffle of the seven Hard captains on days 1-7
//     (0.8.0 N1, oracle 94b9559fbb7da299 (9); before: one shuffle of the five on days 1-5 and the next shuffle's head on
//     days 6-7, never yesterday's captain); after the Matriarch is beaten any captain but yesterday's): roadCap takes the
//     best captain on every day ("free" - "rot");
//  4. a free SABOTAGE: roadCap takes the better of each captain's decks with and without it ("rot" - "exact").
// On 3fbd553 and 7bcde98, 3 and 4 cost nothing. On 40d2b2c (TUNE-C: Hard warlord decks at good luck) one captain alone pays
// the day's best part on several days (HIGH SPIRE 6 on days 2-4, LONGTOOTH 10 on days 8-10), so the rotation costs gold;
// 4 still costs nothing (the tests below).
// It re-derives the road plans with its own code (a DP over days x used events x Matriarch x bounty x the plan's road gold,
// and for 3-4 the Hard slot's captains) and cross-checks roadCap.ts and itself by brute force on short runs.

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
/** What a won fight pays: its gold (counted when it can still be spent) and its part. */
interface Pay { gold: number; part: number }
/** How the Hard slot pays on a day: `hard` fixes the regular Hard captain's pay (default: roadCap's best captain);
 *  `noSab` drops every deck a SABOTAGE swapped in (default: roadCap's free SABOTAGE). */
interface Slot { hard?: Pay; noSab?: boolean }

/** The best of these pays for a fight whose gold can (`spend`) or can't still be spent on this deck. */
const bestOf = (pays: readonly Pay[], spend: boolean): Pay =>
  pays.reduce((x, p) => ((spend ? p.gold : 0) + p.part > (spend ? x.gold : 0) + x.part ? p : x));
const decks = (pays: readonly WarlordPay[], noSab = false): readonly WarlordPay[] => pays.filter((p) => !noSab || !p.sabotaged);

const EV_LABELS = OPTS.map((list, i) => list.map((o) => `event ${EV[i]}: ${o.label}`));

/** The day's Hard stop from a state: the Matriarch while she holds the slot, else a regular Hard captain paying `slot`. */
function hardMove(d: number, D: number, s: State, slot: Slot): Move {
  const spend = d < D;
  const bounty = spend ? AMOUNTS[s.b] : 0;
  const queen = d >= MATRIARCH_DAY && !s.beaten;
  const best = queen ? bestOf(decks(warlordPays("matriarch", d), slot.noSab), spend) : slot.hard ?? bestOf(decks(warlordPays("hard", d), slot.noSab), spend);
  const gold = (spend ? best.gold : 0) + bounty;
  return {
    label: `${queen ? "matriarch" : "hard"}${s.b ? " + bounty" : ""}`, value: gold + best.part,
    next: { mask: s.mask, beaten: queen ? 1 : s.beaten, b: 0, g: s.g + gold }, ...(queen ? {} : { hardPart: best.part }),
  };
}

/** The day's other road stops from a state (Easy/Medium, every unused event's choices): no Hard captain involved. */
function otherMoves(d: number, D: number, s: State, fund: Funding, noSab = false): Move[] {
  const spend = d < D; // gold received today can still be spent on this deck
  const caravan = d + 1 <= D; // the next caravan comes before the deck's dusk
  const out: Move[] = [];
  const flat = Math.max(0, ...(["easy", "medium"] as const).flatMap((t) => decks(warlordPays(t, d), noSab).map((p) => (spend ? p.gold : 0) + p.part)));
  out.push({ label: "easy/medium", value: flat, next: { ...s, g: s.g + flat } });
  OPTS.forEach((list, i) => {
    if (s.mask & (1 << i)) return;
    list.forEach((o, j) => {
      let value = (spend ? o.gold : 0) - o.pay + o.parts;
      if (caravan) value += o.reroll * REROLL_COST + (o.discount > 0 ? discountGain(o.discount, fund(d, s.g)) : 0);
      const liquid = (spend ? o.gold : 0) - o.pay + Math.min(0, o.parts); // a part given (the trader's good) was bought with gold
      out.push({
        label: EV_LABELS[i][j], value,
        next: { mask: s.mask | (1 << i), beaten: s.beaten, b: o.bounty > 0 ? AMOUNTS.indexOf(o.bounty) : s.b, g: s.g + liquid },
      });
    });
  });
  return out;
}

/** The day's stops in one order (Easy/Medium, Hard, the events), so ties trace the same plan whichever way they are built. */
const ordered = (others: Move[], hard: Move): Move[] => [others[0], hard, ...others.slice(1)];

/** One day's road stops from a state, valued as roadCap.ts planDP "deck" values them (no mix), for the deck of day D. */
function moves(d: number, D: number, s: State, fund: Funding, slot: Slot = {}): Move[] {
  return ordered(otherMoves(d, D, s, fund, slot.noSab), hardMove(d, D, s, slot));
}

// ------------------------------------------------------------------ the Hard slot's captains (relaxations 3 and 4)

const HARD = warlordPool("hard");
const H = HARD.length; // one shuffle of the Hard pool covers H days (rivals.ts slotOrder)
const MAT = -2; // the Iron Matriarch holds the Hard slot (from MATRIARCH_DAY until beaten)
const partOf = (id: RivalId, d: number, sabotaged = false): number => warlordPays("hard", d).find((p) => p.id === id && p.sabotaged === sabotaged)!.part;
type Sab = "free" | "none";

/** What Hard captain c (an index into HARD) pays on day d: with a free SABOTAGE the better of its decks with and without it. */
const payMemo = new Map<string, Pay>();
function captainPay(c: number, d: number, spend: boolean, sab: Sab): Pay {
  const k = `${c}|${d}|${spend}|${sab}`;
  let p = payMemo.get(k);
  if (!p) payMemo.set(k, (p = bestOf(warlordPays("hard", d).filter((x) => x.id === HARD[c] && (sab === "free" || !x.sabotaged)), spend)));
  return p;
}

/** The Hard slot's history: the captains of the current shuffle (days before MATRIARCH_DAY) and yesterday's (MAT: her). */
interface Rot { used: number; last: number }
const NO_ROT: Rot = { used: 0, last: -1 };

/** The captains the Hard slot can show on day d (indices into HARD), or [MAT] while she holds it. */
const optMemo = new Map<string, number[]>();
function slotOptions(d: number, r: Rot, beaten: number): number[] {
  const k = `${d}|${r.used}|${r.last}|${beaten}`;
  const hit = optMemo.get(k);
  if (hit) return hit;
  const all = Array.from({ length: H }, (_, i) => i);
  const fresh = (d - 1) % H === 0; // a new shuffle opens: never on yesterday's captain (slotOrder swaps its first two)
  const out = d >= MATRIARCH_DAY
    ? (beaten ? all.filter((c) => c !== r.last) : [MAT]) // warlordOffer's "after" stream
    : fresh ? all.filter((c) => c !== r.last) : all.filter((c) => !(r.used & (1 << c)));
  optMemo.set(k, out);
  return out;
}
function nextRot(d: number, r: Rot, c: number): Rot {
  if (d >= MATRIARCH_DAY) return { used: 0, last: c };
  return { used: ((d - 1) % H === 0 ? 0 : r.used) | (1 << c), last: c };
}

/** Whose Hard slot a plan fights: roadCap's (the best captain each day, a free SABOTAGE), the captains one seed shows (the
 *  DP picks them), or a given rotation (days before MATRIARCH_DAY only). */
type Mode = { kind: "roadcap" } | { kind: "rot"; sab: Sab } | { kind: "fixed"; captains: readonly number[]; sab: Sab };
const ROADCAP: Mode = { kind: "roadcap" };

interface Step { day: number; pick: string; value: number; hardPart?: number }
interface Plan { value: number; plan: Step[]; slot: string[] } // slot: the captain the Hard slot shows each day ("rot", "fixed")

/** The plan's road gold `g` is DP state only when it funds the discount (the consistent plan, before its scout). */
const goldKey = (s: State, fund: Funding) => (fund === byOwnGold && !(s.mask & SCOUT_BITS) ? s.g : 0);

/**
 * The best plan for every deck day D = 1..maxD, by one forward DP. A day d < D is valued the same for every such D (its
 * gold can be spent, its next caravan comes), so the layers are shared and only day D itself is valued per deck.
 */
function plans(fund: Funding, mode: Mode, maxD = RUN_DAYS): Plan[] {
  type Node = { v: number; s: State; r: Rot; prev: Node | null; step: Step | null; cap: string };
  const B = AMOUNTS.length;
  // an integer key: the plan's road gold is within -2048..2047 (a few road choices pay gold: it can go below 0)
  const keyOf = (s: State, r: Rot) => (((((s.mask * 2 + s.beaten) * B + s.b) * 4096 + goldKey(s, fund) + 2048) * 32 + r.used) * 8) + r.last + 3;
  const expand = (layer: Map<number, Node>, d: number, D: number): Map<number, Node> => {
    const out = new Map<number, Node>();
    const sab = mode.kind === "roadcap" ? "free" : mode.sab;
    for (const node of layer.values()) {
      const caps = mode.kind === "roadcap" ? [-1] : mode.kind === "fixed" ? [mode.captains[d - 1]] : slotOptions(d, node.r, node.s.beaten);
      const others = otherMoves(d, D, node.s, fund, sab === "none"); // the same whoever holds the Hard slot
      for (const c of caps) {
        const r2 = mode.kind === "rot" ? nextRot(d, node.r, c) : NO_ROT;
        const slot: Slot = c < 0 ? (sab === "none" ? { noSab: true } : {}) : { hard: captainPay(c, d, d < D, sab), noSab: sab === "none" };
        for (const m of ordered(others, hardMove(d, D, node.s, slot))) {
          const k = keyOf(m.next, r2), v = node.v + m.value;
          const had = out.get(k);
          if (!had || v > had.v) {
            out.set(k, {
              v, s: m.next, r: r2, prev: node, cap: c === MAT ? "matriarch" : c >= 0 ? HARD[c] : "",
              step: { day: d, pick: m.label, value: m.value, ...(m.hardPart !== undefined ? { hardPart: m.hardPart } : {}) },
            });
          }
        }
      }
    }
    return out;
  };
  const s0: State = { mask: 0, beaten: 0, b: 0, g: 0 };
  let layer = new Map<number, Node>([[keyOf(s0, NO_ROT), { v: 0, s: s0, r: NO_ROT, prev: null, step: null, cap: "" }]]);
  const out: Plan[] = [];
  for (let D = 1; D <= maxD; D++) {
    let top: Node | null = null;
    for (const n of expand(layer, D, D).values()) if (!top || n.v > top.v) top = n; // the deck's own day
    const plan: Step[] = [], slot: string[] = [];
    for (let n = top; n && n.step; n = n.prev) {
      plan.unshift(n.step);
      slot.unshift(n.cap);
    }
    out.push({ value: top!.v, plan, slot });
    if (D < maxD) layer = expand(layer, D, D + 1); // valued as for any later deck
  }
  return out;
}

/** roadCap's maximum by brute force over every plan (short runs only). */
function bruteForce(D: number, fund: Funding): number {
  const go = (d: number, s: State): number => (d > D ? 0 : Math.max(...moves(d, D, s, fund).map((m) => m.value + go(d + 1, m.next))));
  return go(1, { mask: 0, beaten: 0, b: 0, g: 0 });
}

function permutations<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Every Hard slot a seed can give days 1..7 (rivals.ts slotOrder): days 1-5 one shuffle of the five Hard captains,
 *  days 6-7 the head of the next shuffle, whose first captain is never day 5's: 120 x 16 = 1920 rotations. 0.8.0 N1: with
 *  seven Hard captains days 1-7 are one shuffle of the seven, the first seven entries of each rotation here (every order
 *  of the seven is one of them); the two entries after them fall past day 7 and are never read. */
const ROTATIONS: RivalId[][] = permutations(HARD).flatMap((p) => HARD.filter((a) => a !== p[4]).flatMap((a) => HARD.filter((c) => c !== a).map((c) => [...p, a, c])));

/**
 * rotationPlan's maxima for decks of days 1..7, by enumerating every rotation instead: one DP per rotation, keeping
 * only rotations whose parts no other rotation beats on every day (a plan's value never falls when a part rises).
 */
function enumeratedRotations(sab: Sab): number[] {
  const D = MATRIARCH_DAY - 1;
  const parts = (rot: RivalId[]) => rot.map((id, i) => captainPay(HARD.indexOf(id), i + 1, true, sab).part);
  const vecs = new Map<string, { rot: RivalId[]; p: number[] }>();
  for (const rot of ROTATIONS) vecs.set(parts(rot).join(","), { rot, p: parts(rot) });
  const all = [...vecs.values()];
  const front = all.filter((a) => !all.some((b) => b !== a && b.p.every((x, i) => x >= a.p[i]) && b.p.some((x, i) => x > a.p[i])));
  const best = Array.from({ length: D }, () => -Infinity);
  for (const { rot } of front) {
    plans(byOwnGold, { kind: "fixed", captains: rot.map((id) => HARD.indexOf(id)), sab }, D).forEach((p, i) => (best[i] = Math.max(best[i], p.value)));
  }
  return best;
}

/**
 * Some seed's Hard slots pay every Hard fight of `plan` the part it counted (unsabotaged decks): a rotation for days 1-7,
 * and after the Matriarch is beaten (warlordOffer's "after" stream) any captain but yesterday's. A witness, or null.
 * Written independently of the rotation DP (by enumeration), so it checks the DP's plans.
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

/** Every day's plans, computed once inside the first test that needs them (so its timeout covers the DPs). */
let memo: Record<"cap" | "hoard" | "free" | "rot" | "exact", Plan[]> | null = null;
function all(): NonNullable<typeof memo> {
  memo ??= {
    cap: plans(byGmax, ROADCAP),
    hoard: plans(byHoard, ROADCAP),
    free: plans(byOwnGold, ROADCAP), // roadCap's Hard slot: the best captain, a free SABOTAGE
    rot: plans(byOwnGold, { kind: "rot", sab: "free" }), // the captains one seed shows, a free SABOTAGE
    exact: plans(byOwnGold, { kind: "rot", sab: "none" }), // the captains one seed shows, no SABOTAGE
  };
  return memo;
}

describe("roadCap's slack per day (REPORT.md §2; v070-rel: re-derived on 40d2b2c)", () => {
  it("this file's DP reproduces roadCap and roadCapHoard on every day, and brute force agrees on days 1-4", () => {
    const { cap, hoard, free } = all();
    expect(cap.map((p) => p.value)).toEqual(DAYS.map(roadCap));
    expect(hoard.map((p) => p.value)).toEqual(DAYS.map(roadCapHoard));
    for (const d of [1, 2, 3, 4]) {
      expect(bruteForce(d, byGmax), `roadCap d${d}`).toBe(roadCap(d));
      expect(bruteForce(d, byHoard), `hoard d${d}`).toBe(roadCapHoard(d));
      expect(bruteForce(d, byOwnGold), `consistent d${d}`).toBe(free[d - 1].value);
    }
  }, 120_000);

  it("the rotation DP agrees with every seed's rotation enumerated (days 1-7), and its plans fit a seed's Hard slots", () => {
    const { rot, exact } = all();
    const early = (ps: Plan[]) => ps.slice(0, MATRIARCH_DAY - 1).map((p) => p.value);
    expect(enumeratedRotations("free")).toEqual(early(rot));
    expect(enumeratedRotations("none")).toEqual(early(exact));
    for (const d of DAYS) {
      const p = exact[d - 1];
      expect(rotationFor(p.plan), `exact d${d}`).not.toBeNull();
      expect(p.plan.reduce((s, x) => s + x.value, 0)).toBe(p.value);
      // the DP's own witness: the captain on each Hard day pays the part the plan counted
      p.plan.forEach((x, i) => {
        if (x.hardPart !== undefined) expect(partOf(p.slot[i] as RivalId, x.day), `exact d${d}: day ${x.day}`).toBe(x.hardPart);
      });
    }
  }, 120_000);

  it("a free SABOTAGE adds nothing: roadCap's best pays need no SABOTAGE, and neither does the best consistent plan", () => {
    const { rot, exact } = all();
    // roadCap (planDP) reads one best pay per slot and day; each is reached by a deck SABOTAGE did not swap in
    for (const d of DAYS) {
      for (const slot of ["easy", "medium", "hard", "matriarch"] as const) {
        if (!warlordPays(slot, d).length) continue;
        for (const spend of [false, true]) {
          const v = (p: Pay) => (spend ? p.gold : 0) + p.part;
          expect(v(bestOf(decks(warlordPays(slot, d), true), spend)), `${slot} d${d}`).toBe(v(bestOf(warlordPays(slot, d), spend)));
        }
      }
    }
    expect(exact.map((p) => p.value)).toEqual(rot.map((p) => p.value));
    // where a captain's day-before deck does offer a pricier part (no best plan fights it there)
    const pricier = DAYS.flatMap((d) => HARD.filter((id) => partOf(id, d, true) > partOf(id, d)).map((id) => `${id} d${d}: ${partOf(id, d)} -> ${partOf(id, d, true)}`));
    console.log(`v070-rel: Hard decks a SABOTAGE makes pricier: ${pricier.join(", ") || "none"}`);
    expect(pricier).toEqual(SABOTAGE_PRICIER);
  }, 120_000);

  it("prints and pins the slack: roadCap >= roadCapHoard >= free >= rot >= exact (the best consistent plan)", () => {
    const { cap, free, rot, exact } = all();
    const rows = DAYS.map((d) => {
      const c = roadCap(d), h = roadCapHoard(d), f = free[d - 1].value, r = rot[d - 1].value, o = exact[d - 1].value;
      return { d, c, h, f, r, o, liquid: c - h, mismatch: h - f, rotation: f - r, sabotage: r - o, slack: c - o };
    });
    for (const r of rows) {
      expect(r.h).toBeLessThanOrEqual(r.c);
      expect(r.f).toBeLessThanOrEqual(r.h);
      expect(r.r).toBeLessThanOrEqual(r.f);
      expect(r.o).toBeLessThanOrEqual(r.r);
    }
    console.log(`v070-rel roadCap slack per day (the best consistent plan: its own road gold funds its discount, parts kept, one seed's Hard captains, no free SABOTAGE):\n`
      + `  day | shop | roadCap | hoard | free | rot | consistent | slack | of which: parts as gold | gmax's other plan | the rotation | a free SABOTAGE\n`
      + rows.map((r) => `  d${r.d} | ${maxGoldByDay(r.d)} | ${r.c} | ${r.h} | ${r.f} | ${r.r} | ${r.o} | ${r.slack} | ${r.liquid} | ${r.mismatch} | ${r.rotation} | ${r.sabotage}`).join("\n")
      + `\n  roadCap's plans:\n`
      + cap.map((p, i) => `  d${i + 1} (${p.value}): ${p.plan.map((s) => `${s.day} ${s.pick} ${s.value}`).join(" | ")}`).join("\n")
      + `\n  the consistent plans and the Hard slot that pays them:\n`
      + exact.map((p, i) => `  d${i + 1} (${p.value}): ${p.plan.map((s) => `${s.day} ${s.pick} ${s.value}`).join(" | ")}\n      Hard slot: ${p.slot.map((c, j) => `d${j + 1} ${c}`).join(", ")}`).join("\n"));
    expect(rows.map((r) => r.slack)).toEqual(SLACK);
    expect(rows.map((r) => r.liquid)).toEqual(LIQUID);
    expect(rows.map((r) => r.mismatch)).toEqual(MISMATCH);
    expect(rows.map((r) => r.rotation)).toEqual(ROTATION);
    expect(rows.map((r) => r.sabotage)).toEqual(DAYS.map(() => 0));
  }, 120_000);
});

// Pinned per day (REPORT.md §2; output-v070-rel/REPORT.md §2 has the old and new values with their causes). A content change
// that moves them is reviewed on purpose.
/** roadCap - the best consistent plan (062m: 0 0 0 1 3 6 9 10 12 15). 0.8.0 N1 (oracle 94b9559fbb7da299 (9)): with
 *  seven Hard captains the rotation costs less (BASE 9855129: 0 0 0 2 4 6 8 10 12 14); roadCap itself is unchanged. */
const SLACK: number[] = [0, 0, 0, 1, 3, 5, 7, 9, 11, 14];
/** of which: road parts counted as gold in gmax, roadCap - roadCapHoard (062m: 0 0 0 0 2 4 7 9 9 12). */
const LIQUID: number[] = [0, 0, 0, 0, 2, 3, 4, 7, 8, 9];
/** of which: gmax's separate gold plan, roadCapHoard - free (062m: 0 0 0 1 1 2 2 1 3 3). */
const MISMATCH: number[] = [0, 0, 0, 1, 1, 2, 2, 1, 2, 3];
/** of which: the Hard rotation, free - rot (062m: 0 on every day). 0.8.0 N1 (BASE 9855129: 0 0 0 1 1 1 2 2 2 2). */
const ROTATION: number[] = [0, 0, 0, 0, 0, 0, 1, 1, 1, 2];
/** Hard captains whose day-before deck (SABOTAGE) offers a pricier part than their own (062m: none). */
const SABOTAGE_PRICIER: string[] = ["bulwark d9: 4 -> 5"];
