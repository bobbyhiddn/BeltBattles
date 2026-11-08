// POLISH-5 (REQ-BFG-089; P5-1): scripts/scoutshots.mjs's warlord set-up after TOUCH-099's NPC_DAY drop card (scripts/warlordSetup.mjs).
//   With NPC_DAY on a Hard win gives no part pick: it rolls a drop (or NO DROP), and the card's one way on is ON TO THE ROAD (`toroad`): the day's road event, then REFIT. scoutshots.mjs wanted `take0` then `refit`, so its still ended
//   `SCOUTSHOTS: 1 FAILED` and its video tour `8 FAILED` and never reached the build screen. The module tells the two cards apart by the reward's drop chance (touchcheck.mjs scoutWarlord :2130), checks the NPC_DAY card with
//   touchcheck's own geometry (scoutWarlordNpcDay :2171-2173) and walks the set-up both ways. The browser proof is the scoutshots runs (the report); this file is what holds without one: the rule, both paths on a stub page, the wiring.
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

type Region = { x: number; y: number; w: number; h: number };
type Io = { region: (id: string) => Promise<Region | null>; tap: (x: number, y: number) => Promise<void>; steps: (n: number) => Promise<void> };
type Page = { evaluate: <T>(fn: () => T) => Promise<T> };
interface Setup {
  betweenDropAndRoad: (a: { vf: Region | null; road: Region | null; card: { y: number } | null | undefined; k: number }) => { ok: boolean; gap: number };
  isNpcDayCard: (p: Page) => Promise<boolean>;
  rectOf: (q: Region | null) => Region | null;
  toTheBuildScreen: (p: Page, io: Io) => Promise<{ how: string; problems: string[] }>;
}
const load = async (): Promise<Setup> => (await import(new URL("../scripts/warlordSetup.mjs", import.meta.url).href)) as Setup;

/** The stub game: the screen, the event's phase and beat, the reward's shape, the taps it saw, which event choices resolve (index >= firstOk), whether the day's event was already picked. */
interface World { screen: string; phase: string; pt: number; reward: { chance?: number }; picks: string[]; firstOk: number; eventDone: boolean }
/** A stub page: `evaluate` runs the function against a `window.bb` the stub game moves; `io` is scoutshots' region / tap / steps over the same world. */
function stage(w: World): { page: Page; io: Io } {
  (globalThis as unknown as { window: unknown }).window = { bb: { screen: () => w.screen, game: { screen: { get warlord() { return { reward: w.reward }; }, get phase() { return w.phase; }, get pt() { return w.pt; } } } } };
  const page: Page = { evaluate: async (fn) => fn() };
  const here: Record<string, () => Region | null> = {
    toroad: () => (w.screen === "result" && w.reward.chance !== undefined ? { x: 195, y: 580, w: 330, h: 44 } : null),
    take0: () => (w.screen === "result" && w.reward.chance === undefined && w.phase === "result" ? { x: 100, y: 560, w: 150, h: 60 } : null),
    choice0: () => (w.screen === "event" && w.phase === "choose" ? { x: 60, y: 300, w: 100, h: 200 } : null),
    choice1: () => (w.screen === "event" && w.phase === "choose" ? { x: 195, y: 300, w: 100, h: 200 } : null),
    choice2: () => (w.screen === "event" && w.phase === "choose" ? { x: 330, y: 300, w: 100, h: 200 } : null),
    // REFIT: the event's result button, or (the 0.9.7 card) the result card's once the part is taken
    refit: () => ((w.screen === "event" && w.phase === "result") || (w.screen === "result" && w.reward.chance === undefined && w.phase === "took") ? { x: 195, y: 700, w: 300, h: 44 } : null),
  };
  const id = (x: number, y: number): string | null => Object.keys(here).find((k) => { const q = here[k](); return !!q && x === q.x && y === q.y; }) ?? null;
  const io: Io = {
    region: async (name) => here[name]?.() ?? null,
    steps: async (n) => { w.pt += n / 60; },
    tap: async (x, y) => {
      const hit = id(x, y);
      w.picks.push(hit ?? `?(${x},${y})`);
      if (hit === "toroad") { w.screen = w.eventDone ? "build" : "event"; w.phase = "choose"; w.pt = 0; }
      else if (hit === "take0") w.phase = "took";
      else if (hit?.startsWith("choice")) { if (Number(hit.slice(6)) >= w.firstOk) { w.phase = "result"; w.pt = 0.4; } /* else the pick fails: a toast, the choice stays open */ }
      else if (hit === "refit") { w.screen = "build"; w.phase = "build"; }
    },
  };
  return { page, io };
}
const world = (o: Partial<World> = {}): World => ({ screen: "result", phase: "result", pt: 1, reward: { chance: 0.35 }, picks: [], firstOk: 0, eventDone: false, ...o });
afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

describe("POLISH-5 P5-1: the NPC_DAY card's check (touchcheck.mjs scoutWarlordNpcDay's rule)", () => {
  // the phone 390x844 at DPR 3: the game is 195 logical px wide at x6, k = 2 CSS px a logical px; the card {x:10, y:266, w:370, h:314}, its drop card's foot at y + 96 logical px = 458 CSS px (O11/logs/shots-base-stills.log's warlord-card still)
  const card = { y: 266 }, k = 2;
  it("VIEW BATTLEFIELD at least 10 logical px under the drop card and above ON TO THE ROAD passes; the phone's own numbers do", async () => {
    const { betweenDropAndRoad, rectOf } = await load();
    const vf = rectOf({ x: 195, y: 500, w: 330, h: 44 }), road = { x: 30, y: 540, w: 330, h: 44 };
    const r = betweenDropAndRoad({ vf, road, card, k });
    expect(r.ok).toBe(true);
    expect(r.gap).toBeCloseTo(10, 5); // 478 - (266 + 192) = 20 CSS px = 10 logical px
    // VIEW BATTLEFIELD's foot is at 478 + 44 = 522 CSS px: ON TO THE ROAD may start 0.5 CSS px above it (touchcheck's slack) and no more
    expect(betweenDropAndRoad({ vf, road: { ...road, y: 521.5 }, card, k }).ok, "0.5 CSS px of slack, as touchcheck").toBe(true);
    expect(betweenDropAndRoad({ vf, road: { ...road, y: 521.4 }, card, k }).ok, "a hair more overlaps").toBe(false);
  });
  it("fails when the view's target is too near the drop card, below ON TO THE ROAD, over it, or when a rect is missing", async () => {
    const { betweenDropAndRoad, rectOf } = await load();
    const road = { x: 30, y: 540, w: 330, h: 44 };
    expect(betweenDropAndRoad({ vf: rectOf({ x: 195, y: 490, w: 330, h: 44 }), road, card, k }).ok, "9 logical px under the drop card").toBe(false);
    expect(betweenDropAndRoad({ vf: rectOf({ x: 195, y: 600, w: 330, h: 44 }), road, card, k }).ok, "below ON TO THE ROAD").toBe(false);
    expect(betweenDropAndRoad({ vf: rectOf({ x: 195, y: 540, w: 330, h: 44 }), road: { ...road, y: 530 }, card, k }).ok, "over it").toBe(false);
    expect(betweenDropAndRoad({ vf: null, road, card, k })).toEqual({ ok: false, gap: -1 });
    expect(betweenDropAndRoad({ vf: rectOf({ x: 195, y: 500, w: 330, h: 44 }), road: null, card, k }).ok).toBe(false);
    expect(betweenDropAndRoad({ vf: rectOf({ x: 195, y: 500, w: 330, h: 44 }), road, card: undefined, k }).ok, "no card rect (a screen with no scout state)").toBe(false);
  });
  it("rectOf turns scoutshots' centre regions into top-left rects", async () => {
    const { rectOf } = await load();
    expect(rectOf({ x: 195, y: 500, w: 330, h: 44 })).toEqual({ x: 30, y: 478, w: 330, h: 44 });
    expect(rectOf(null)).toBeNull();
  });
});

describe("POLISH-5 P5-1: the set-up path to the build screen", () => {
  it("the drop chance tells the cards apart (touchcheck.mjs scoutWarlord :2130): a reward with one is NPC_DAY's, one without is 0.9.7's", async () => {
    const { isNpcDayCard } = await load();
    expect(await isNpcDayCard(stage(world({ reward: { chance: 0.35 } })).page)).toBe(true);
    expect(await isNpcDayCard(stage(world({ reward: { chance: 0 } })).page), "a drop chance of 0 is still NPC_DAY's card").toBe(true);
    expect(await isNpcDayCard(stage(world({ reward: {} })).page)).toBe(false);
  });
  it("NPC_DAY: ON TO THE ROAD, the day's event (the first choice that resolves), REFIT, the build screen; no problem", async () => {
    const { toTheBuildScreen } = await load();
    const w = world(), { page, io } = stage(w);
    const r = await toTheBuildScreen(page, io);
    expect(w.picks).toEqual(["toroad", "choice0", "refit"]);
    expect(w.screen).toBe("build");
    expect(r.problems).toEqual([]);
    expect(r.how).toBe("NPC_DAY card: ON TO THE ROAD, the day's event (choice 1), REFIT");
  });
  it("NPC_DAY: a choice that fails (a cost the run cannot pay) is passed over for the next one", async () => {
    const { toTheBuildScreen } = await load();
    const w = world({ firstOk: 1 }), { page, io } = stage(w);
    const r = await toTheBuildScreen(page, io);
    expect(w.picks).toEqual(["toroad", "choice0", "choice1", "refit"]);
    expect(w.screen).toBe("build");
    expect(r.problems).toEqual([]);
    expect(r.how).toContain("choice 2");
  });
  it("NPC_DAY: the day's event already picked, ON TO THE ROAD goes straight to REFIT (the build screen); one tap", async () => {
    const { toTheBuildScreen } = await load();
    const w = world({ eventDone: true }), { page, io } = stage(w);
    const r = await toTheBuildScreen(page, io);
    expect(w.picks).toEqual(["toroad"]);
    expect(w.screen).toBe("build");
    expect(r.problems).toEqual([]);
    expect(r.how).toContain("already picked");
  });
  it("NPC_DAY: no ON TO THE ROAD, no event choice that resolves: each is a problem for the caller's FAILED line, and the path stops there", async () => {
    const { toTheBuildScreen } = await load();
    const none = world({ screen: "build" }), a = stage(none);
    expect((await toTheBuildScreen(a.page, a.io)).problems).toEqual(["the set-up's toroad"]);
    expect(none.picks).toEqual([]);
    const stuck = world({ firstOk: 3 }), b = stage(stuck);
    expect((await toTheBuildScreen(b.page, b.io)).problems).toEqual(["the set-up's event choice"]);
    expect(stuck.picks).toEqual(["toroad", "choice0", "choice1", "choice2"]);
  });
  it("the 0.9.7 card (no drop chance): the old path, take0 then refit, and a missing one is the old FAILED line", async () => {
    const { toTheBuildScreen } = await load();
    const w = world({ reward: {} }), { page, io } = stage(w);
    const r = await toTheBuildScreen(page, io);
    expect(r.problems).toEqual([]);
    expect(w.picks).toEqual(["take0", "refit"]);
    expect(w.screen).toBe("build");
    expect(r.how).toBe("the part pick (take0), then REFIT");
    const gone = world({ reward: {}, screen: "build" }), g = stage(gone);
    expect((await toTheBuildScreen(g.page, g.io)).problems, "both are missing: the two lines the old set-up logged").toEqual(["the set-up's take0", "the set-up's refit"]);
  });
});

describe("POLISH-5 P5-1: scripts/scoutshots.mjs uses the module (the wiring)", () => {
  const src = readFileSync("scripts/scoutshots.mjs", "utf8"); // from the repo root, as vitest runs (the tests' own way: eventDefs.ts is read the same way)
  it("imports the module and calls it from the still and from the tour's set-up; the old inline take0 / refit loop is gone from the tour", () => {
    expect(src).toMatch(/from "\.\/warlordSetup\.mjs"/);
    expect(src).toContain("toTheBuildScreen(page,");
    expect(src).toContain("isNpcDayCard(page)");
    expect(src).toContain("betweenDropAndRoad(");
    expect(src).not.toContain('for (const id of ["take0", "refit"])');
  });
  it("keeps the old card's check for a card without the drop chance (the still's `above its picks` line) and names the NPC_DAY card's", () => {
    expect(src).toContain("the warlord's card shows VIEW BATTLEFIELD above its picks");
    expect(src).toContain("the warlord's card shows VIEW BATTLEFIELD between the drop card and ON TO THE ROAD");
  });
});
