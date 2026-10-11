// RETUNE-1 T5 (REQ-BFG-092): PICK, the graded pick (src/net/pick.ts), behind its switch (off) and its rules gate
// (rulesGate.ts PICK_RULES, pickFor). With the switch off, or under older rules, matchPick is pickGhost exactly (the same
// picks as today on a fixed pool and seed). With it on: a record 3+ losses behind draws from the weakest ceil(0.667 x n)
// of its eligible ghosts by grade, then the nearest-record pick; 1-2 behind and at or above even, today's pick; an
// ungraded ghost counts as its bucket's median grade; the mirror (lead) is a number pair, absent = off. The grade travels
// in the snapshot (v3, last, only with PICK on and under rules with it; ghostId leaves it out): the strict decoder and the
// client's check take it only then; POST /v1/ghosts refuses an upload carrying one; the match route and the client's
// fallback both pick with matchPick. Every switch is put back off after each test.
import { afterEach, describe, expect, it } from "vitest";
import { Rng } from "../src/core/rng";
import { RULES_VERSION } from "../src/sim/content";
import { GRADE_K, GRADE_SEEDS, lossesOf, matchPick, medianGrade, PICK, PICK_RULE, pickRules, pickShare, setPick, withPick } from "../src/net/pick";
import { pickFor, pickGateProblem, PICK_RULES } from "../src/net/rulesGate";
import { eligible, pickGhost, type MatchRequest } from "../src/net/matchmaking";
import { checkSnapshot, decodeSnapshot, encodeSnapshot, ghostId, GRADE_MAX, SNAPSHOT_V3, type GhostSnapshot, type PoolEntry } from "../src/net/snapshot";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { fallbackGhost } from "../src/net/fallback";
import { setHearts } from "../src/sim/hearts";

afterEach(() => {
  setPick(false);
  setHearts(false);
});

/** A small v3 seed ghost for day `day` with record (wins, lives); `grade` only when given. */
function ghost(i: number, day: number, wins: number, lives: number, grade?: number, rules = RULES_VERSION): GhostSnapshot {
  return {
    v: 3, rules, hero: "furnace", day, wins, lives,
    build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 30, hullBonus: 0 },
    runId: `run-${i}`, playerId: `seed-${i}`, createdAt: 0,
    ...(grade !== undefined ? { grade } : {}),
  } as GhostSnapshot;
}
const entry = (s: GhostSnapshot): PoolEntry => ({ id: ghostId(s), snapshot: s });
/** Day 6: 9 ghosts with records 0W..2W (no better than a 2W 3-life requester), grades 100..900 in a shuffled order. */
const GRADES = [700, 100, 500, 900, 300, 800, 200, 600, 400];
function pool(graded = true): PoolEntry[] {
  return GRADES.map((g, i) => entry(ghost(i, 6, i % 3, 1 + (i % 2), graded ? g : undefined)));
}
const req = (wins: number, lives: number, day = 6, rules = RULES_VERSION): MatchRequest => ({ rules, day, wins, lives, playerId: "me", seen: [] });

describe("RETUNE-1 PICK: the switch, the gate and the numbers", () => {
  it("off by default; pickFor needs the switch and rules at or after PICK_RULES", () => {
    expect(PICK).toBe(false);
    expect(pickRules()).toBe(false);
    expect(PICK_RULES).toBe(RULES_VERSION);
    expect(pickFor(RULES_VERSION)).toBe(false);
    expect(pickGateProblem(RULES_VERSION)).toBe("not in this rules version yet");
    withPick(() => {
      expect(pickFor(RULES_VERSION)).toBe(true);
      expect(pickFor("bb-0.9.1")).toBe(false);
      expect(pickFor("nonsense")).toBe(false);
      expect(pickGateProblem(RULES_VERSION)).toBeNull();
      expect(pickGateProblem("bb-0.9.1")).toMatch(/predate/);
    });
    expect(pickRules()).toBe(false);
  });

  it("PICK_RULE is the tuned read (losing 1, deep 0.667, deepAt 3; no mirror) and the grade is K 6 x 1 seed", () => {
    expect(PICK_RULE).toEqual({ losing: 1, deep: 0.667, deepAt: 3 });
    expect(PICK_RULE.lead).toBeUndefined();
    expect([GRADE_K, GRADE_SEEDS, GRADE_MAX]).toEqual([6, 1, 1000]);
  });

  it("the share by record: 3+ behind 0.667, 1-2 behind and even or ahead the whole field; the mirror only when given", () => {
    expect(lossesOf({ day: 6, wins: 1 })).toBe(4);
    expect(pickShare({ day: 6, wins: 1 })).toEqual({ share: 0.667, strong: false }); // 4 losses, 1 win: 3 behind
    expect(pickShare({ day: 6, wins: 2 })).toEqual({ share: 1, strong: false }); // 3 losses, 2 wins: 1 behind (losing 1)
    expect(pickShare({ day: 6, wins: 0 })).toEqual({ share: 0.667, strong: false }); // 5 behind
    expect(pickShare({ day: 4, wins: 0 })).toEqual({ share: 0.667, strong: false }); // 3 behind on day 4
    expect(pickShare({ day: 6, wins: 4 })).toEqual({ share: 1, strong: false }); // ahead, no mirror
    const mirror = { ...PICK_RULE, lead: { share: 0.5, at: 3 } };
    expect(pickShare({ day: 6, wins: 4 }, mirror)).toEqual({ share: 0.5, strong: true }); // 4 wins, 1 loss: 3 ahead
    expect(pickShare({ day: 6, wins: 3 }, mirror)).toEqual({ share: 1, strong: false }); // 1 ahead
  });
});

describe("RETUNE-1 PICK: matchPick", () => {
  it("off (or older rules): the same picks as pickGhost on a fixed pool and seed, for every record", () => {
    const p = pool();
    for (const pick of [false, true]) {
      setPick(pick);
      for (let wins = 0; wins <= 5; wins++) for (const lives of [1, 2, 3]) for (let seed = 1; seed <= 20; seed++) {
        const rules = pick ? "bb-0.9.1" : RULES_VERSION; // with the switch on, only an older-rules request
        const pr = { ...req(wins, lives), rules };
        const pp = p.map((e) => ({ ...e, snapshot: { ...e.snapshot, rules } }));
        expect(matchPick(pp, pr, new Rng(seed))?.id).toBe(pickGhost(pp, pr, new Rng(seed))?.id);
      }
    }
  });

  it("on: a record 3+ behind meets only the weakest ceil(0.667 x n) of its eligible ghosts, then the nearest record", () => {
    withPick(() => {
      const p = pool();
      const r = req(1, 3); // day 6, 1 win, 4 losses: 3 behind
      const ok = eligible(p, r);
      const keep = Math.ceil(0.667 * ok.length);
      const weakest = ok.map((e) => e.snapshot.grade!).sort((a, b) => a - b).slice(0, keep);
      const seenGrades = new Set<number>();
      for (let seed = 1; seed <= 60; seed++) {
        const hit = matchPick(p, r, new Rng(seed))!;
        expect(weakest).toContain(hit.snapshot.grade);
        seenGrades.add(hit.snapshot.grade!);
      }
      expect(ok.length).toBeGreaterThan(keep); // the cut bites here
      // 1 behind (day 6, 2 wins): today's pick exactly
      for (let seed = 1; seed <= 20; seed++) expect(matchPick(p, req(2, 3), new Rng(seed))?.id).toBe(pickGhost(p, req(2, 3), new Rng(seed))?.id);
    });
  });

  it("the cut is a whole count: 0.667 keeps all of 1-3 eligible ghosts, 3 of 4, 4 of 5, 5 of 6", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => Math.max(1, Math.ceil(PICK_RULE.deep * n)))).toEqual([1, 2, 3, 3, 4, 5]);
  });

  it("an ungraded ghost counts as its bucket's median grade; with no grade at all, the pick is today's", () => {
    withPick(() => {
      expect(medianGrade(pool())).toBe(500);
      expect(medianGrade(pool(false))).toBe(GRADE_MAX / 2);
      const p = pool(false);
      for (let seed = 1; seed <= 20; seed++) {
        const a = matchPick(p, req(1, 3), new Rng(seed));
        expect(a && eligible(p, req(1, 3)).some((e) => e.id === a.id)).toBe(true);
      }
      // a strong ungraded upload in a graded bucket ranks at the median: below the strong half
      const up = entry({ ...ghost(99, 6, 0, 1), playerId: "upload-1" });
      const mixed = [...pool(), up];
      expect(medianGrade(mixed)).toBe(500);
    });
  });

  it("the client's fallback picks with the same function (a bundled pool, PICK on and off)", () => {
    for (const on of [false, true]) {
      setPick(on);
      const p = pool();
      for (let seed = 1; seed <= 20; seed++) {
        const fr = { ...req(1, 3), hero: "weaver" as const, seed };
        expect(fallbackGhost(fr, p).id).toBe(matchPick(p, fr, new Rng(seed))!.id);
      }
    }
  });
});

describe("RETUNE-1 PICK: the grade in the snapshot", () => {
  it("off: a grade is refused by the strict decoder (400) and the client's check; an ungraded snapshot is unchanged", () => {
    const s = ghost(1, 6, 1, 3, 420);
    expect(() => checkSnapshot(s)).toThrow(/snapshot\.grade: not in this rules version yet/);
    expect(isSnapshot(s)).toBe(false);
    const u = ghost(1, 6, 1, 3);
    expect(isSnapshot(u)).toBe(true);
    expect(encodeSnapshot(u)).not.toContain("grade");
  });

  it("on: taken under rules with PICK, last, 0..1000 whole, v3 only; refused under older rules; ghostId leaves it out", () => {
    withPick(() => {
      const s = ghost(1, 6, 1, 3, 420);
      const c = checkSnapshot(s);
      expect(c.grade).toBe(420);
      expect(Object.keys(c).pop()).toBe("grade");
      expect(isSnapshot(s)).toBe(true);
      expect(decodeSnapshot(encodeSnapshot(s)).grade).toBe(420);
      expect(ghostId(s)).toBe(ghostId(ghost(1, 6, 1, 3)));
      for (const bad of [-1, 1001, 4.5]) {
        expect(() => checkSnapshot({ ...s, grade: bad })).toThrow(/snapshot\.grade/);
        expect(isSnapshot({ ...s, grade: bad })).toBe(false);
      }
      expect(() => checkSnapshot({ ...s, v: 2 })).toThrow(/not allowed in a v2 snapshot/);
      expect(isSnapshot({ ...s, v: 2 })).toBe(false);
      const old = ghost(1, 6, 1, 3, 420, "bb-0.9.1");
      expect(isSnapshot(old)).toBe(false);
      expect(SNAPSHOT_V3).toBe(3);
    });
  });
});
