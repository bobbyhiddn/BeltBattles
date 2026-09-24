import { describe, expect, it } from "vitest";
import { standInPick } from "../src/sim/standInPool";
import { RULES_VERSION } from "../src/sim/content";
import { fallbackGhost, loadGhostPool, offlineGhost, rivalHero } from "../src/net/fallback";
import { encodeSnapshot, ghostId } from "../src/net/snapshot";
import { validateBuild } from "../src/net/validate";
import { generateSamplePool, samplePoolJson } from "../tools/samplePool";
import { snap } from "./netHelpers";

describe("sample pool and offline fallback", () => {
  it("generates 40 valid snapshots across days 1-10 for both heroes, reproducibly", () => {
    const pool = generateSamplePool();
    expect(pool).toHaveLength(40);
    for (const hero of ["furnace", "weaver"]) {
      for (let day = 1; day <= 10; day++) {
        expect(pool.filter((s) => s.hero === hero && s.day === day)).toHaveLength(2);
      }
    }
    for (const s of pool) expect(validateBuild(s.build, s.day)).toEqual({ ok: true, errors: [] });
    expect(samplePoolJson()).toBe(samplePoolJson(pool));
  });

  it("loads the bundled pool JSON with every entry validated", () => {
    const load = loadGhostPool(samplePoolJson());
    expect(load.rejected).toEqual([]);
    expect(load.entries).toHaveLength(40);
    expect(new Set(load.entries.map((e) => e.id)).size).toBe(40);
  });

  it("rejects bad pool entries and keeps the good ones", () => {
    const good = snap({ day: 2, wins: 1 });
    const overBudget = snap({ build: { ...good.build, hullBonus: 100 } });
    const foreignRules = snap({ rules: "bb-0.3.0" });
    const raw = [good, { ...good, extra: 1 }, overBudget, foreignRules, good, "junk"].map((s) => JSON.parse(JSON.stringify(s)));
    const load = loadGhostPool(raw);
    expect(load.entries.map((e) => e.id)).toEqual([ghostId(good)]);
    expect(load.rejected.map((r) => r.index)).toEqual([1, 2, 3, 5]);
    expect(load.rejected[1].error).toMatch(/budget/);
    expect(load.rejected[2].error).toMatch(/rules bb-0.3.0/);
    expect(() => loadGhostPool("{")).toThrow(/not valid JSON/);
    expect(() => loadGhostPool("{}")).toThrow(/array/);
  });

  it("the offline ghost is a stand-in pool deck of the other faction's hero for that day", () => {
    const g = offlineGhost("furnace", 4, 99, { wins: 2, lives: 2 });
    expect(rivalHero("furnace")).toBe("weaver");
    expect(rivalHero("weaver")).toBe("furnace");
    expect(g.id).toBe("offline-weaver-d4");
    expect(g.snapshot).toMatchObject({ hero: "weaver", day: 4, wins: 2, lives: 2, rules: RULES_VERSION });
    expect(g.snapshot.build).toEqual(standInPick("weaver", 4, 99));
    expect(() => encodeSnapshot(g.snapshot)).not.toThrow();
    expect(offlineGhost("weaver", 1, 5, { wins: 7, lives: 0 }).snapshot).toMatchObject({ hero: "furnace", wins: 0, lives: 1 });
  });

  it("fallbackGhost prefers a matching pool ghost, then the stand-in", () => {
    const { entries } = loadGhostPool(samplePoolJson());
    const req = { rules: RULES_VERSION, day: 6, wins: 3, lives: 2, playerId: "me", seen: [] as string[], hero: "weaver" as const, seed: 42 };
    const hit = fallbackGhost(req, entries);
    expect(hit.snapshot.day).toBe(6);
    expect(hit.id.startsWith("g")).toBe(true);
    const all = entries.filter((e) => e.snapshot.day === 6).map((e) => e.id);
    const stand = fallbackGhost({ ...req, seen: all }, entries);
    expect(stand.id).toBe("offline-furnace-d6");
    expect(fallbackGhost(req).id).toBe("offline-furnace-d6");
  });
});
