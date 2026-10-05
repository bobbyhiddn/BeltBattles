import { expect, it } from "vitest";
import { Battle } from "../src/sim/battle";
import { startingBuild } from "../src/sim/ai";
import { TICK } from "../src/sim/content";
import { FURNACE_LONG_BELT } from "../src/sim/battle"; // NUM-2 (REQ-BFG-047): the long belt's whole rate %
import { ITEMS, rateMul, secPer } from "../src/sim/content"; // NUM-2: SPEED
import { key } from "../src/sim/deck";

it("Furnace's Breech speeds up only when a connected belt of eight tiles feeds it", () => {
  const short = startingBuild("furnace", 1);
  const long = startingBuild("furnace", 1);
  long.routes[0].cells = [
    key(4, 5), key(3, 5), key(3, 4), key(3, 3),
    key(3, 2), key(4, 2), key(4, 1), key(4, 0),
  ];
  const foe = startingBuild("weaver", 1);
  foe.routes = [];

  const burst = (build: typeof short) => {
    const battle = new Battle(build, foe, 13);
    const gun = battle.sides[0].turrets[0];
    const payload = (id: number) => ({
      id, ammo: "cinder" as const, ride: 2, mult: 1, flat: 0, burn: 0,
      shock: false, prior: 0, factory: 1, copy: false,
    });
    gun.stack.push(payload(1), payload(2), payload(3));
    gun.phase = "fire";
    const fired: number[] = [];
    while (fired.length < 3 && battle.t < 4) {
      battle.step();
      for (const event of battle.events) if (event.type === "fire" && event.side === 0) fired.push(battle.t);
      battle.events.length = 0;
    }
    expect(fired).toHaveLength(3);
    return { interval: gun.interval, fired };
  };

  // NUM-2 (REQ-BFG-047, N1 2.3): the long belt is a whole rate %, +39 (was the interval x0.72): the SCRAP CANNON's speed
  // 30 x 139 / 100 = 41.7, rounded half up once to 42, fires every 30 / 42 = 0.714 s (was 0.72 s)
  const longInterval = secPer(Math.floor(ITEMS.scrapcannon.turret!.speed * rateMul(FURNACE_LONG_BELT) + 0.5 + 1e-9));
  const a = burst(short), b = burst(long);
  expect(a.interval).toBe(1);
  expect(b.interval).toBe(longInterval); // NUM-2 (was 0.72)
  expect(a.fired[2]).toBeGreaterThan(1.5);
  // NUM-2: re-measured with the carried shot timer and the rounded speed: shots at ticks 1 / 44 / 87, 43 ticks (0.717 s)
  // apart, within 0.05 s of the interval as before (was toBeCloseTo(0.72, 1))
  expect(b.fired[1] - b.fired[0]).toBeCloseTo(longInterval, 1);
  expect(b.fired[2] - b.fired[1]).toBeCloseTo(longInterval, 1);
  expect(b.fired[2]).toBeLessThan(1.5 + TICK);

  long.routes[0].cells[7] = key(5, 0); // diagonal final step makes the route invalid
  expect(new Battle(long, foe, 13).sides[0].turrets[0].interval).toBe(1);
});
