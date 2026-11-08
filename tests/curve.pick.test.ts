// BUMP-1H (REQ-BFG-124, battle rules bb-0.15.0; BRIEF-BUMP1H P1): THE LEAD PICK (src/net/pick.ts matchPick) behind the CURVE switch
// (src/net/curve.ts) and its rules gate (src/net/rulesGate.ts LEAD_RULES, leadFor). The lead is R1's mirror of `deep`: a request whose record is
// `lead.at` or more wins ahead of its losses draws from the strongest `lead.share` of its eligible ghosts by grade, then pickGhost's nearest-record
// rank runs inside them. These tests pin the shape that keeps every older bucket as it was benched:
//  - a bb-0.14.0 request picks exactly as before with the switch on (the lead is rules-gated);
//  - a bb-0.15.0 request `at` or more ahead draws only from the strongest share (and the nearest-record ghost is NOT the pick: the mirror bites);
//  - a record behind or level never meets a ghost with a better record (D1), at any rules label and with the switch on;
//  - an endless request picks as before;
//  - the switch off picks exactly as before at every rules label.
// The rule given to matchPick is explicit here ({ ...PICK_RULE, lead }): PICK_RULE itself gets its `lead` only in P3's take.
import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { CURVE, curveRules, setCurve, withCurve } from "../src/net/curve";
import { LEAD_RULES, leadFor } from "../src/net/rulesGate";
import { GRADE_MAX, ghostId, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { lossesOf, matchPick, PICK_RULE, pickShare, setPick } from "../src/net/pick";
import { eligible, noBetterRecord, pickGhost, type MatchRequest } from "../src/net/matchmaking";

// every test leaves the shipped value of each switch it touched
afterEach(() => {
  setCurve(CURVE);
  setPick(true);
});

/** A small seed ghost of day `day` with record (wins, lives), graded `grade`, under `rules`. */
function ghost(i: number, day: number, wins: number, lives: number, grade: number, rules: string, extra: Record<string, unknown> = {}): GhostSnapshot {
  return {
    v: 3, rules, hero: "furnace", day, wins, lives,
    build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 30, hullBonus: 0 },
    runId: `run-${i}`, playerId: `seed-${i}`, createdAt: 0, grade, ...extra,
  } as GhostSnapshot;
}
const entry = (s: GhostSnapshot): PoolEntry => ({ id: ghostId(s), snapshot: s });

/** Day 8, nine ghosts: the strong ones (grades 900-500) sit at the LOW records (0-4 wins), the weak ones (200-100) at the records nearest a streak's
 *  (5 and 6 wins). So the nearest-record pick of a 6-win request is a weak ghost and the mirror's pick is the strong ghost nearest in record. */
const RECS: readonly (readonly [number, number, number])[] = [[0, 10, 900], [1, 10, 800], [2, 10, 700], [3, 10, 600], [4, 10, 500], [5, 10, 100], [5, 9, 150], [6, 10, 200], [6, 9, 120]];
const pool = (rules: string, day = 8): PoolEntry[] => RECS.map(([w, l, g], i) => entry(ghost(i, day, w, l, g, rules)));
const req = (rules: string, wins: number, lives: number, day = 8): MatchRequest => ({ rules, day, wins, lives, playerId: "me", seen: [] });
const LEAD = { share: 0.5, at: 4 } as const;
const RULE = { ...PICK_RULE, lead: LEAD };
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

describe("BUMP-1H CURVE: the switch and its rules gate", () => {
  it("the switch is a module switch in effectFloor.ts's form: on from P2's flip, set by setCurve, put back by withCurve even on a throw", () => {
    expect(CURVE).toBe(true); // BUMP-1H P2: was false (P1's switch-off proof was read with it off)
    expect(curveRules()).toBe(CURVE);
    expect(withCurve(() => curveRules())).toBe(true);
    expect(withCurve(() => curveRules(), false)).toBe(false);
    expect(curveRules()).toBe(CURVE);
    expect(() => withCurve(() => { throw new Error("boom"); })).toThrow("boom");
    expect(curveRules()).toBe(CURVE); // put back after the throw
    setCurve(true);
    expect(curveRules()).toBe(true);
    setCurve(false);
    expect(curveRules()).toBe(false);
  });

  it("leadFor: the switch AND rules at or after LEAD_RULES (bb-0.15.0)", () => {
    expect(LEAD_RULES).toBe("bb-0.15.0");
    withCurve(() => {
      expect(leadFor("bb-0.15.0")).toBe(true);
      expect(leadFor("bb-0.16.0")).toBe(true);
      expect(leadFor("bb-1.0.0")).toBe(true);
      expect(leadFor("bb-0.14.0")).toBe(false);
      expect(leadFor("bb-0.14.9")).toBe(false);
      expect(leadFor("bb-0.9.1")).toBe(false);
      expect(leadFor("nonsense")).toBe(false);
      expect(leadFor(undefined)).toBe(false);
    });
    withCurve(() => {
      for (const r of ["bb-0.15.0", "bb-0.16.0", "bb-0.14.0", "bb-0.9.1", "nonsense"]) expect(leadFor(r), r).toBe(false); // off: false at every label
    }, false);
  });

  it("PICK_RULE has no lead at P1 (P3's take gives it one): nothing changes for a request that passes no rule", () => {
    expect(PICK_RULE.lead).toBeUndefined();
    withCurve(() => {
      const p = pool("bb-0.15.0"), r = req("bb-0.15.0", 6, 10);
      for (const s of SEEDS) expect(matchPick(p, r, new Rng(s))?.id, `seed ${s}`).toBe(matchPick(p, r, new Rng(s), PICK_RULE)?.id);
    });
  });
});

describe("BUMP-1H CURVE: the lead pick", () => {
  it("a bb-0.15.0 request `at` or more wins ahead draws only from the strongest share, and not the nearest-record ghost (the mirror bites)", () => {
    withCurve(() => {
      const p = pool("bb-0.15.0"), r = req("bb-0.15.0", 6, 10);
      expect(lossesOf(r)).toBe(1); // 7 dusks fought, 6 won
      expect(pickShare(r, RULE)).toEqual({ share: 0.5, strong: true }); // 5 ahead, at 4
      const ok = eligible(p, r);
      expect(ok.length).toBe(9);
      const ranked = ok.slice().sort((a, b) => b.snapshot.grade! - a.snapshot.grade! || (a.id < b.id ? -1 : 1));
      const strong = new Set(ranked.slice(0, Math.ceil(LEAD.share * ranked.length)).map((e) => e.id));
      expect(strong.size).toBe(5);
      const nearest = pickGhost(p, r, new Rng(1))!; // today's pick: the exact record (6 wins, 10 lives), a weak ghost
      expect(nearest.snapshot.grade).toBe(200);
      expect(strong.has(nearest.id)).toBe(false);
      for (const s of SEEDS) {
        const hit = matchPick(p, r, new Rng(s), RULE)!;
        expect(strong.has(hit.id), `seed ${s}`).toBe(true);
        expect(hit.snapshot.wins, `seed ${s}: the nearest record inside the strong share`).toBe(4); // wins 4 is nearest to 6 among wins 0-4
        expect(hit.id).not.toBe(nearest.id);
      }
    });
  });

  it("exactly `at` ahead is the lead; one less is today's pick (a record 3 ahead at lead.at 4 picks as pickGhost does)", () => {
    withCurve(() => {
      const p = pool("bb-0.15.0");
      const on = req("bb-0.15.0", 5, 10), off = req("bb-0.15.0", 4, 10); // day 8: 7 dusks: 5W 2L = 3 ahead; 4W 3L = 1 ahead
      expect(pickShare(on, RULE).strong).toBe(false); // 3 ahead < at 4
      const atFour = req("bb-0.15.0", 6, 9); // 6W 1L = 5 ahead
      expect(pickShare(atFour, RULE).strong).toBe(true);
      const at3 = { ...RULE, lead: { share: 0.5, at: 3 } }; // at 3: the 5W 2L record is exactly 3 ahead
      expect(pickShare(on, at3)).toEqual({ share: 0.5, strong: true });
      for (const s of SEEDS) {
        expect(matchPick(p, on, new Rng(s), RULE)?.id, `3 ahead, at 4, seed ${s}`).toBe(pickGhost(p, on, new Rng(s))?.id);
        expect(matchPick(p, off, new Rng(s), RULE)?.id, `1 ahead, seed ${s}`).toBe(pickGhost(p, off, new Rng(s))?.id);
      }
    });
  });

  it("D1: a record never meets a ghost with a better record, whatever the rules label and the rule (the sweep of every record on day 8)", () => {
    for (const rules of ["bb-0.14.0", "bb-0.15.0"]) {
      withCurve(() => {
        const p = pool(rules);
        for (let wins = 0; wins <= 7; wins++) for (let lives = 1; lives <= 10; lives++) {
          const r = req(rules, wins, lives);
          for (const s of [1, 2, 3]) {
            const hit = matchPick(p, r, new Rng(s), RULE);
            if (hit) expect(noBetterRecord(hit.snapshot, r), `${rules} ${wins}W ${lives}: met ${hit.snapshot.wins}W ${hit.snapshot.lives}`).toBe(true);
          }
        }
      });
    }
  });
});

describe("BUMP-1H CURVE: every other request picks as today", () => {
  it("a bb-0.14.0 request picks exactly as pickGhost does with the switch on, lead or no lead (the bb-0.14.0 bucket keeps its benched odds)", () => {
    withCurve(() => {
      const p = pool("bb-0.14.0");
      for (const [w, l] of [[6, 10], [6, 9], [5, 10], [3, 7], [0, 10], [7, 10]] as const) {
        const r = req("bb-0.14.0", w, l);
        for (const s of SEEDS) {
          expect(matchPick(p, r, new Rng(s), RULE)?.id, `${w}W ${l} seed ${s}: = the rule without a lead`).toBe(matchPick(p, r, new Rng(s), PICK_RULE)?.id);
        }
      }
      // and the lead-less bb-0.14.0 pick is the nearest-record pick for a record ahead (share 1), so a 6-win request meets the exact record
      const r = req("bb-0.14.0", 6, 10);
      expect(matchPick(p, r, new Rng(1), RULE)?.id).toBe(pickGhost(p, r, new Rng(1))?.id);
    });
  });

  it("the switch off picks exactly as today at every rules label, with a lead in the rule", () => {
    withCurve(() => {
      for (const rules of ["bb-0.15.0", "bb-0.16.0", "bb-0.14.0", "bb-0.10.0"]) {
        const p = pool(rules), r = req(rules, 6, 10);
        for (const s of SEEDS) expect(matchPick(p, r, new Rng(s), RULE)?.id, `${rules} seed ${s}`).toBe(matchPick(p, r, new Rng(s), PICK_RULE)?.id);
      }
    }, false);
  });

  it("losing records pick as today with the switch on: `deep` still cuts to the weakest share, under both rules labels", () => {
    withCurve(() => {
      for (const rules of ["bb-0.14.0", "bb-0.15.0"]) {
        const p = pool(rules), r = req(rules, 1, 10); // day 8: 1W 6L = 5 behind: deep
        expect(pickShare(r, RULE)).toEqual({ share: 0.5, strong: false });
        for (const s of SEEDS) expect(matchPick(p, r, new Rng(s), RULE)?.id, `${rules} seed ${s}`).toBe(matchPick(p, r, new Rng(s), PICK_RULE)?.id);
      }
    });
  });

  it("an endless request picks by nearest endless wins as before, with the switch on and a lead in the rule", () => {
    withCurve(() => {
      const day = 30;
      const ends: PoolEntry[] = [0, 1, 2, 3, 4, 5, 6].map((e, i) => entry(ghost(i, day, 10, 3, 100 + 100 * i, "bb-0.15.0", { mode: "endless", endlessWins: e, endlessLives: 3, victoryDay: 10 }))); // an endless ghost is a won run's (10 wins, won on day 10)
      const r: MatchRequest = { rules: "bb-0.15.0", day, wins: 4, lives: 3, playerId: "me", seen: [], endless: true };
      for (const s of SEEDS) {
        const hit = matchPick(ends, r, new Rng(s), RULE);
        expect(hit?.id, `seed ${s}`).toBe(pickGhost(ends, r, new Rng(s))?.id);
        expect(hit?.snapshot.endlessWins, `seed ${s}: the nearest endless wins`).toBe(4);
      }
    });
  });

  it("the grade scale the lead reads is the snapshot's (permille), and a streak ghost outranks a SOFT-1 pick by it", () => {
    expect(GRADE_MAX).toBe(1000);
    withCurve(() => {
      // two ghosts at the same record: the streak ghost (grade 300) and a SOFT-1 pick (150); a request ahead meets the stronger of the two
      const same = [entry(ghost(0, 8, 5, 10, 150, "bb-0.15.0")), entry(ghost(1, 8, 5, 10, 300, "bb-0.15.0"))];
      const r = req("bb-0.15.0", 6, 10);
      for (const s of SEEDS) expect(matchPick(same, r, new Rng(s), { ...PICK_RULE, lead: { share: 0.5, at: 4 } })?.snapshot.grade, `seed ${s}`).toBe(300);
    });
  });
});
