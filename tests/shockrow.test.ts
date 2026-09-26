// 0.6.2 TUNE-M T4.3, RULE SHOCK ROW (ROADMAP 0.6.2; ref/BRIEF-final-062-tune.md T4): the dusk result card gets a SHOCK
// STALLS row beside its damage and Burn rows: the enemy machines each side's Shock stalled. Display only: the Arena counts
// the battle's own "harass" events (cause "shock"), played or skipped; the battle itself is untouched.
import { describe, expect, it } from "vitest";
import { Arena } from "../src/game/arena";
import { Battle, type SideStats } from "../src/sim/battle";
import { RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import type { Build } from "../src/sim/deck";
import { resultRows } from "../src/screens/battleHud";

const clone = (b: Build): Build => JSON.parse(JSON.stringify(b)) as Build;

/** A plain battle (no Arena), its result and the shocks counted straight from its events. */
function plain(a: Build, b: Build, seed: number): { shocks: [number, number]; end: unknown[] } {
  const bt = new Battle(clone(a), clone(b), seed);
  const shocks: [number, number] = [0, 0];
  while (!bt.over && bt.ticks < 60 * 200) {
    bt.step();
    for (const e of bt.drainEvents()) if (e.type === "harass" && e.cause === "shock") shocks[e.side === 0 ? 1 : 0]++;
  }
  return { shocks, end: [bt.winner, bt.t, bt.ticks, bt.sides[0].hull.hp, bt.sides[1].hull.hp, JSON.stringify(bt.sides[0].stats), JSON.stringify(bt.sides[1].stats)] };
}
const endOf = (a: Arena): unknown[] => [a.b.winner, a.b.t, a.b.ticks, a.b.sides[0].hull.hp, a.b.sides[1].hull.hp, JSON.stringify(a.b.sides[0].stats), JSON.stringify(a.b.sides[1].stats)];

/** Captain decks (day 5) whose battles shock: [a, b, seed], the first few found in a fixed order. */
function shockingPairs(n: number): [Build, Build, number][] {
  const out: [Build, Build, number][] = [];
  const decks = RIVAL_IDS.map((id) => rivalBuild(id, 5));
  for (const a of decks) for (const b of decks) {
    if (out.length >= n || a === b) continue;
    const r = plain(a, b, 77);
    if (r.shocks[0] > 0 && r.shocks[1] >= 0) out.push([a, b, 77]);
  }
  return out;
}

describe("0.6.2 RULE SHOCK ROW", () => {
  it("the Arena counts each side's shock stalls from the battle's events, skipped or played, and the battle is unchanged", () => {
    const pairs = shockingPairs(3);
    expect(pairs.length, "some captain decks shock").toBe(3);
    for (const [a, b, seed] of pairs) {
      const ref = plain(a, b, seed);
      expect(ref.shocks[0]).toBeGreaterThan(0);
      const skipped = new Arena(clone(a), clone(b), seed, null);
      skipped.finish();
      expect([...skipped.shocks]).toEqual(ref.shocks);
      expect(endOf(skipped)).toEqual(ref.end);
      const played = new Arena(clone(a), clone(b), seed, null);
      played.speed = 4;
      for (let f = 0; f < 60 * 400 && !played.b.over; f++) played.update(1 / 60);
      expect(played.b.over).toBe(true);
      expect([...played.shocks]).toEqual(ref.shocks);
      expect(endOf(played)).toEqual(ref.end);
    }
  });

  it("the card's SHOCK STALLS row sits beside the damage and Burn rows; a result saved before 0.6.2 reads -", () => {
    const s = { damage: 120.4, shots: 30, firstShot: 2.25, idle: 3, turretTime: 30, jams: 1, burnDealt: 17.6, disrupted: 0 } as unknown as SideStats;
    const rows = resultRows({ player: s, enemy: s, shocks: [7, 2] });
    const labels = rows.map((r) => r[0]);
    expect(labels).toEqual(["DAMAGE DEALT", "SHOTS", "FIRST SHOT", "GUNS IDLE", "JAMS", "BURN DAMAGE", "SHOCK STALLS"]);
    expect(rows[6]).toEqual(["SHOCK STALLS", "7", "2"]);
    expect(rows[5]).toEqual(["BURN DAMAGE", "18", "18"]);
    expect(resultRows({ player: s, enemy: s })[6]).toEqual(["SHOCK STALLS", "-", "-"]);
  });
});
