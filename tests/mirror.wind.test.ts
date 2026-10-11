// MIRROR-1 (operator's test, 2026-10-11): both carriers are the same hero with the same hull and the same equipment,
// kept as empty as possible (the hero's starting deck with its belts cut, so no turret ever loads and nothing fires).
// Only the dark wind can move a hull. Logs both hulls every second from 20 s to the end, and the second before the end.
// Throwaway on wave3-mock (0.9.8 rules, fa1e9ed + mock tools); not game code. WIND-2 (REQ-BFG-093): the mirror is the
// check now; its JSON goes to the OS temp dir (TMPDIR), not another lane's workspace.
import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Battle } from "../src/sim/battle";
import { WIND_START, type HeroId } from "../src/sim/content";
import { heroStartBuild } from "../src/sim/heroBuilds";
import type { Build } from "../src/sim/deck";

const silent = (hero: HeroId, uid: number): Build => ({ ...heroStartBuild(hero, uid), routes: [] });

describe("MIRROR-1: same hull, same kit, nothing fires", () => {
  it("the wind takes the same from both carriers every second, to the end", () => {
    const bt = new Battle(silent("furnace", 1), silent("furnace", 101), 7);
    const [p, e] = bt.sides;
    const rows: { t: number; you: number; foe: number }[] = [];
    let lastWhole = -1;
    while (!bt.over && bt.t < 200) {
      bt.step();
      const whole = Math.floor(bt.t);
      if (whole !== lastWhole) {
        lastWhole = whole;
        if (whole >= WIND_START - 5) rows.push({ t: whole, you: p.hull.hp, foe: e.hull.hp });
      }
      bt.events.length = 0;
    }
    const end = { t: Math.round(bt.t * 100) / 100, you: p.hull.hp, foe: e.hull.hp, winner: (bt as any).winner ?? null };
    const before = rows.filter((r) => r.t <= Math.floor(end.t) - 1).slice(-1)[0];
    const out = { maxHull: [p.hull.max, e.hull.max], windTaken: [p.stats.windTaken, e.stats.windTaken], before, end, rows };
    writeFileSync(join(tmpdir(), "mirror-wind.json"), JSON.stringify(out, null, 1));
    console.log("MIRROR-1", JSON.stringify({ maxHull: out.maxHull, windTaken: out.windTaken, before, end }));
    expect(p.hull.max).toBe(e.hull.max);
    for (const r of rows) expect(r.you).toBe(r.foe);
  });
});
