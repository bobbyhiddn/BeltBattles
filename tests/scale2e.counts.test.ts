// SCALE-2e E1 (REQ-BFG-098; SCALE-2d REPORT section 9 point 2): the bench duels pass the run's counts, SCALE_RIGS on only.
// A tournament.ts Job carries optional per-side `wins` and `lost`; jobCounts turns them (or, with neither and a `day`, the par
// run model's counts for that day: scaleRating.ts runCounts) into the whole numbers one battle passes to simulate(), a
// fraction by a seeded carry. Off, a Job passes nothing: playJob, jobDetail and jobStats are the base's calls. LAST CHANCE's
// mirror (harness/lastChance.ts losses) gets the same hearts lost, on only. Switch on via withScaleRigs (sync bodies only).
import { describe, expect, it } from "vitest";
import { simulate } from "../src/sim/battle";
import { Battle } from "../src/sim/battle";
import { scaleRules, withScaleRigs } from "../src/sim/scale";
import { READ_PAR, carryCount, onCurve, runCounts } from "../src/sim/scaleRating";
import { jobCounts, jobDetail, jobStats, playJob, type Job } from "../src/sim/harness/tournament";
import { losses } from "../src/sim/harness/lastChance";
import { type Build } from "../src/sim/deck";
import { SEED, barge, furnaceBench, item, withItem } from "./wave3.helpers";

/** Deck b with rig `def` at (3, y), turned so it works the bench's tile 5 - y (scale2c.sim.test.ts's aimed). */
function aimed(b: Build, uid: number, def: string, y: number, stars = 1): Build {
  for (let rot = 0; rot < 4; rot++) {
    const t = withItem(b, item(uid, def, 3, y, rot, stars));
    const g = new Battle(t, barge(), SEED).sides[0].gates.find((q) => q.uid === uid)!;
    if (g.hits.some((h) => h.route === 0 && h.tile === 5 - y)) return t;
  }
  throw new Error(`no turn aims ${def} at tile ${5 - y}`);
}
const SEEDS = [11, 12, 13, 14];

describe("SCALE-2e E1: the bench duels' counts, switch off", () => {
  it("ships off: a Job passes no counts, set or not, and playJob is the base's call", () => {
    expect(scaleRules()).toBe(false);
    const field = [furnaceBench(), barge()];
    for (const j of [{ a: 0, b: 1, seeds: SEEDS, day: 6 }, { a: 0, b: 1, seeds: SEEDS, day: 9, wins: [3, 3], lost: [5, 5] } as Job]) {
      for (const s of SEEDS) {
        expect(jobCounts(j, s)).toEqual({});
        expect(jobCounts(j, s, true)).toEqual({});
      }
      // the base's playJob, written out: simulate(a, b, seed, undefined, undefined, day) from both sides
      let pts = 0;
      for (const s of j.seeds) {
        const x = simulate(field[j.a], field[j.b], s, undefined, undefined, j.day).winner;
        const y = simulate(field[j.b], field[j.a], s, undefined, undefined, j.day).winner;
        pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
      }
      expect(playJob(field, j)).toBe(pts);
      expect(jobStats(field, j).pts).toBe(pts);
      expect(jobDetail(field, j).split(";").length).toBe(2 * j.seeds.length);
    }
  });

  it("LAST CHANCE's mirror passes no hearts lost off: the fight is the base's", () => {
    const a = furnaceBench(), b = barge();
    const base = simulate(a, b, SEED, undefined, [0, 0], 6);
    const lo = losses(a, b, SEED, 0, 6);
    expect(lo).toEqual([0, 1].map((i) => Math.max(0, base.sides[i].hull.max - base.sides[i].hull.hp - base.sides[i].stats.windTaken)));
  });
});

describe("SCALE-2e E1: the bench duels' counts, switch on", () => {
  it("a Job with a day and no counts carries the run model's, whole by a seeded carry (the mean over seeds is the model's)", () => {
    withScaleRigs(() => {
      for (const day of [1, 3, 6, 9, 10, 12]) {
        const c = runCounts(day);
        expect(c.wins).toBe(onCurve(READ_PAR.wins, day));
        expect(c.lost).toBe(onCurve(READ_PAR.heartsLost, day));
        const j: Job = { a: 0, b: 1, seeds: [], day };
        let w = 0, l = 0;
        const N = 4000;
        for (let s = 1; s <= N; s++) {
          const k = jobCounts(j, s);
          expect(k.wins![0]).toBe(k.wins![1]); // both sides alike
          expect([Math.floor(c.wins), Math.floor(c.wins) + 1]).toContain(k.wins![0]);
          expect([Math.floor(c.lost), Math.floor(c.lost) + 1]).toContain(k.lost![0]);
          w += k.wins![0];
          l += k.lost![0];
        }
        expect(Math.abs(w / N - c.wins)).toBeLessThan(0.05);
        expect(Math.abs(l / N - c.lost)).toBeLessThan(0.05);
      }
      // the anchors: 1.0 wins and hearts on day 3, 2.5 / 3.5 on day 6, 4.2 / 6.8 on day 9 (COUNTS.md section 8)
      expect(runCounts(3)).toEqual({ wins: 1, lost: 1 });
      expect(runCounts(6)).toEqual({ wins: 2.5, lost: 3.5 });
      expect(runCounts(9)).toEqual({ wins: 4.2, lost: 6.8 });
      expect(carryCount(5, 77)).toBe(5);
      expect(carryCount(0, 77)).toBe(0);
    });
  });

  it("a Job's own wins and lost win over the model; b's counts swap sides in the battle where b is the player; no day and no counts passes none", () => {
    withScaleRigs(() => {
      const j: Job = { a: 0, b: 1, seeds: SEEDS, day: 6, wins: [2, 0], lost: [3, 1] };
      expect(jobCounts(j, 5)).toEqual({ wins: [2, 0], lost: [3, 1] });
      expect(jobCounts(j, 5, true)).toEqual({ wins: [0, 2], lost: [1, 3] });
      expect(jobCounts({ a: 0, b: 1, seeds: SEEDS, lost: [4, 0] }, 5)).toEqual({ wins: undefined, lost: [4, 0] });
      expect(jobCounts({ a: 0, b: 1, seeds: SEEDS }, 5)).toEqual({});
    });
  });

  it("a GRUDGE ROD and a TROPHY CHAIN read the bench duel's counts: the day-9 fight deals more than the same fight at none", () => {
    withScaleRigs(() => {
      const rod = aimed(aimed(furnaceBench(), 30, "grudgerod", 5), 31, "trophychain", 4);
      const field = [rod, barge()];
      const model: Job = { a: 0, b: 1, seeds: SEEDS, day: 9 }; // wins 4.2, hearts lost 6.8
      const none: Job = { a: 0, b: 1, seeds: SEEDS, day: 9, wins: [0, 0], lost: [0, 0] };
      const withCounts = jobStats(field, model), without = jobStats(field, none);
      expect(withCounts.dmg).toBeGreaterThan(without.dmg);
      // playJob is the explicit call: simulate with the carried counts, from both sides
      let pts = 0;
      for (const s of SEEDS) {
        const cx = jobCounts(model, s), cy = jobCounts(model, s, true);
        const x = simulate(field[0], field[1], s, undefined, cx.wins, 9, cx.lost).winner;
        const y = simulate(field[1], field[0], s, undefined, cy.wins, 9, cy.lost).winner;
        pts += (x === 0 ? 1 : x === -1 ? 0.5 : 0) + (y === 1 ? 1 : y === -1 ? 0.5 : 0);
      }
      expect(playJob(field, model)).toBe(pts);
      expect(jobStats(field, model).pts).toBe(pts);
      // a fight whose decks read neither count is the base's call, counts or not (the barge reads none)
      const plain = [furnaceBench(), barge()];
      expect(jobStats(plain, model)).toEqual(jobStats(plain, none));
    });
  });

  it("LAST CHANCE's mirror carries the hearts lost on: a board with a GRUDGE ROD loses less hull with them than without", () => {
    withScaleRigs(() => {
      const board = aimed(furnaceBench(), 30, "grudgerod", 5);
      const foe = barge();
      let withModel = 0, withNone = 0;
      for (const s of SEEDS) {
        withModel += losses(board, foe, s, 0, 9)[1]; // the foe's loss: the model's 6.8 hearts
        withNone += losses(board, foe, s, 0, 9, 0)[1]; // hearts lost 0
      }
      expect(withModel).toBeGreaterThanOrEqual(withNone);
      expect(withModel).toBeGreaterThan(withNone);
    });
  });
});
