// BUMP-1E P6 (roadCap's warm-up at the server's boot): server/warm.ts fills roadCap's memo for days 1..N in the live rules' world, day by day, and
// changes nothing else.
import { describe, expect, it } from "vitest";
import "../src/sim/deck"; // load order: the ITEMS key order is part of the seeded draws
import { RULES_VERSION } from "../src/sim/content";
import { scaleRules } from "../src/sim/scale";
import { shapesRules } from "../src/sim/shapes";
import { shapes2Rules } from "../src/sim/shapes2";
import { longRunRules } from "../src/sim/longRun";
import { withFreeJoins, freeJoinsRules } from "../src/sim/freeJoins";
import { inRulesWorld, inScaleWorld, inShapes2World, inShapesWorld } from "../src/net/validate";
import { resetRoadCapMemo, roadCap, roadCapHoard } from "../src/net/roadCap";
import { warmRoadCap } from "../server/warm";

const live = <T,>(fn: () => T): T => inRulesWorld(RULES_VERSION, () => inShapesWorld(RULES_VERSION, () => inShapes2World(RULES_VERSION, () => inScaleWorld(RULES_VERSION, () => withFreeJoins(fn)))));
const switches = () => [scaleRules(), shapesRules(), shapes2Rules(), longRunRules(), freeJoinsRules()];

describe("roadCap's warm-up (BUMP-1E P6)", () => {
  it("warms days 1..N, logs once, leaves every switch as it found it, and the warmed values are the ones a cold call gives", async () => {
    resetRoadCapMemo();
    const cold = live(() => [roadCap(5), roadCapHoard(5), roadCap(9), roadCapHoard(9)]);
    resetRoadCapMemo();
    const lines: string[] = [];
    const before = switches();
    const r = await warmRoadCap((l) => lines.push(l), RULES_VERSION, 9);
    expect(r.days).toBe(9);
    expect(switches()).toEqual(before);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^road model warmed for days 1-9 under rules ${RULES_VERSION.replace(/\./g, "\\.")} in \\d+ ms$`));
    expect(live(() => [roadCap(5), roadCapHoard(5), roadCap(9), roadCapHoard(9)])).toEqual(cold);
  });

  it("the second pass over the same days is a memo hit (a tenth of the first, or under 50 ms)", async () => {
    resetRoadCapMemo();
    const a = await warmRoadCap(() => {}, RULES_VERSION, 12);
    const b = await warmRoadCap(() => {}, RULES_VERSION, 12);
    expect(b.ms === 0 || b.ms < a.ms / 10 || b.ms < 50, `first ${a.ms} ms, second ${b.ms} ms`).toBe(true);
  });
});
