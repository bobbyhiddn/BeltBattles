// BELTS run 5 (REQ-BFG-043 D10): the gold upgrades' levels in a ghost snapshot, on both checks. The client's local
// check (src/game/ghostSnapshot.ts isSnapshot) must take exactly what the strict decoder (src/net/snapshot.ts
// checkSnapshot, checkBuildShape) takes: `upgrades` absent, or (v2 only) a strict object { turret?, factory? }, each an
// integer 1..UPGRADE_MAX (4). Run 5's regenerated pools put levels into real seed ghosts, which showed the local side had
// not learned the field.
import { describe, expect, it } from "vitest";
import * as local from "../src/game/ghostSnapshot";
import * as net from "../src/net/snapshot";
import { UPGRADE_MAX } from "../src/sim/content";
import { generateSamplePool } from "../tools/samplePool";

const POOL = generateSamplePool();

function netOk(s: unknown): boolean {
  try {
    net.checkSnapshot(s);
    return true;
  } catch {
    return false;
  }
}

describe("BELTS D10: the upgrade levels in a snapshot, local and strict checks agree", () => {
  const base = POOL.find((s) => s.build.upgrades === undefined)!;
  // FLIP-X2: the sample decks are v3 and hold their day's runes (BOT_RUNES), which a v1 or v2 snapshot refuses
  // ("snapshot.build.runes: not allowed in a v2 snapshot"), so the v2 and v1 rows take a rune-less copy of the deck
  // (was { ...base.build, upgrades }, runes and all: v2 turret 2 refused on both sides, [false, false] for [true, true])
  const { runes: _runes, ...runeless } = base.build;
  const withUp = (v: 1 | 2, upgrades: unknown) => ({ ...base, v, build: { ...runeless, upgrades } });
  const cases: [string, unknown, boolean][] = [
    ["turret 2", { turret: 2 }, true], ["factory 4", { factory: UPGRADE_MAX }, true], ["both 3", { turret: 3, factory: 3 }, true],
    ["level 1 written", { turret: 1 }, true], ["empty object", {}, true],
    ["turret 0", { turret: 0 }, false], ["factory 5", { factory: UPGRADE_MAX + 1 }, false], ["turret 1.5", { turret: 1.5 }, false],
    ["turret \"2\"", { turret: "2" }, false], ["factory null", { factory: null }, false], ["unknown track", { speed: 2 }, false],
    ["an array", [2, 2], false], ["null", null, false], ["a number", 2, false],
  ];

  it("v2 takes levels 1..4 on either track and nothing else; v1 takes none; both sides alike", () => {
    expect(local.isSnapshot(base) && netOk(base)).toBe(true);
    for (const [name, up, ok] of cases) {
      expect([local.isSnapshot(withUp(2, up)), netOk(withUp(2, up))], `v2 ${name}`).toEqual([ok, ok]);
      expect([local.isSnapshot(withUp(1, up)), netOk(withUp(1, up))], `v1 ${name}`).toEqual([false, false]);
    }
  });

  it("every seed ghost carrying levels passes both checks as v2, and both refuse its v1 copy", () => {
    const leveled = POOL.filter((s) => s.build.upgrades !== undefined);
    expect(leveled.length).toBeGreaterThan(0);
    for (const s of leveled) {
      expect([local.isSnapshot(s), netOk(s)], `${s.hero} d${s.day}`).toEqual([true, true]);
      expect([local.isSnapshot({ ...s, v: 1 }), netOk({ ...s, v: 1 })], `v1 ${s.hero} d${s.day}`).toEqual([false, false]);
    }
  });
});
