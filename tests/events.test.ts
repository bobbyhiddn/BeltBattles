import { describe, expect, it } from "vitest";
import { Battle, simulate, type SimEvent } from "../src/sim/battle";
import { startingBuild, warlordBuild } from "../src/sim/ai";
import { Arena } from "../src/game/arena";

// 0.4.1: Battle.drainEvents() double-buffers its event array and Arena.update() reuses its
// per-frame event list, so playback allocates no event arrays per tick or per frame. The
// event stream and every battle result must stay exactly as before.

const P = startingBuild("furnace", 1);
const E = warlordBuild("weaver", 1);
const SEED = 99;

/** The whole event stream, drained tick by tick (each event serialised when drained). */
function drainedStream(seed: number): { stream: string[]; b: Battle; arrays: Set<SimEvent[]> } {
  const b = new Battle(P, E, seed);
  const stream: string[] = [];
  const arrays = new Set<SimEvent[]>();
  while (!b.over && b.ticks < 60 * 200) {
    b.step();
    const pending = b.events.length;
    const ev = b.drainEvents();
    arrays.add(ev);
    expect(ev.length).toBe(pending);
    expect(b.events.length).toBe(0);
    expect(b.events).not.toBe(ev);
    for (let i = 0; i < ev.length; i++) stream.push(JSON.stringify(ev[i]));
  }
  return { stream, b, arrays };
}

/** Reference: the 0.4.0 semantics (a fresh array handed over every tick). */
function freshStream(seed: number): string[] {
  const b = new Battle(P, E, seed);
  const stream: string[] = [];
  while (!b.over && b.ticks < 60 * 200) {
    b.step();
    const ev = b.events;
    b.events = [];
    for (const e of ev) stream.push(JSON.stringify(e));
  }
  return stream;
}

describe("event buffers are reused and results are unchanged", () => {
  it("drainEvents() alternates two arrays and hands over each tick's events", () => {
    const { stream, b, arrays } = drainedStream(SEED);
    expect(arrays.size).toBe(2);
    expect(stream.length).toBeGreaterThan(50);
    const ref = simulate(P, E, SEED);
    expect(b.ticks).toBe(ref.ticks);
    expect(b.winner).toBe(ref.winner);
    expect(b.sides[0].hull.hp).toBe(ref.sides[0].hull.hp);
    expect(b.sides[1].hull.hp).toBe(ref.sides[1].hull.hp);
  });

  it("the drained event stream equals the fresh-array stream event for event", () => {
    for (const seed of [SEED, 7, 12345]) expect(drainedStream(seed).stream).toEqual(freshStream(seed));
  });

  it("drained events stay intact until the next drainEvents()", () => {
    const b = new Battle(P, E, SEED);
    let held: SimEvent[] = [];
    let copy: SimEvent[] = [];
    let checks = 0;
    while (!b.over && b.ticks < 60 * 200) {
      b.step(); // new events go to the other buffer, never into `held`
      expect(held).toEqual(copy);
      if (held.length) checks++;
      held = b.drainEvents();
      copy = held.slice();
    }
    expect(checks).toBeGreaterThan(20);
  });

  it("Arena.update() returns one reused array holding exactly that frame's events", () => {
    const a = new Arena(P, E, SEED, null);
    a.quiet = true;
    const first = a.update(1 / 60);
    const stream: string[] = first.map((e) => JSON.stringify(e));
    for (let f = 0; f < 60 * 200 && !a.b.over; f++) {
      a.speed = [1, 2, 4][Math.floor(f / 240) % 3];
      const ev = a.update(1 / 60);
      expect(ev).toBe(first);
      for (let i = 0; i < ev.length; i++) stream.push(JSON.stringify(ev[i]));
    }
    expect(a.b.over).toBe(true);
    expect(stream).toEqual(freshStream(SEED));
    expect(a.update(1 / 60, false)).toBe(first);
    expect(first.length).toBe(0);
  });
});
