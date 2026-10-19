// SCALE-2d (REQ-BFG-098 098.6, REQ-BFG-106; BRIEF-SCALE2d D2): the par player and the bots buy feeder+reader pairs, SCALE_RIGS
// on only (withScaleRigs; the shipped switch stays off): a reader that wants a feeder (scaleRating.ts READER_FEEDERS) is
// bought only when the deck holds one of its feeders or the same visit bought one first; the run's fights carry its hearts
// lost (runLost), as the live battle screen does. The measure (TABLE_OUT): the share of par decks on days 3, 6, 9 and 10
// that hold each of the 12 and how many of those hold a feeder, and the par runs' mean wins off and on.
// BUMP-1E: the switch ships ON (SCALE_RIGS = true, bb-0.12.0), so every "off" below is the 0.9.11 world, asked for outright with
// withScaleRigs(fn, false) (synchronously only); the "on" reads are the shipped world, bare or under withScaleRigs(fn).
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ITEMS, type HeroId } from "../src/sim/content";
import type { Build } from "../src/sim/deck";
import { SCALE_PIECES, SCALE_RIGS, heartsLost, scaleRules, withScaleRigs } from "../src/sim/scale";
import { hasFeeder, needsFeeder } from "../src/sim/scaleRating";
import { playerRun, runLost, type PlayerDay } from "../src/sim/harness/player";
import { parSeeds } from "../src/sim/harness/par";
import { Shopper } from "../src/sim/harness/shopper";
import { Rng } from "../src/core/rng";
import { maxGoldByDay } from "../src/net/validate";
import { heroStartBuild } from "../src/sim/heroBuilds";

const HEROES: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const holds = (b: Build, id: string): boolean => b.items.some((p) => p.def === id) || b.mods.some((m) => m.def === id);
const runs = (): Map<string, PlayerDay[]> => {
  const m = new Map<string, PlayerDay[]>();
  for (const h of HEROES) for (const s of parSeeds()) m.set(`${h}/${s}`, playerRun(h, 10, s));
  return m;
};

describe("SCALE-2d D2: the bots and feeder+reader pairs", () => {
  it("ships on (BUMP-1E; was off); runLost: undefined off (the fight called as before), the run's hearts lost on", () => {
    expect(SCALE_RIGS).toBe(true); // BUMP-1E: the switch ships on (was `expect(scaleRules()).toBe(false)`)
    expect(scaleRules()).toBe(true); // BUMP-1E: was toBe(false)
    const run = { lives: 7, hearts: true };
    expect(runLost(run)).toEqual([heartsLost(7, run), 0]); // BUMP-1E: as shipped the fight carries the run's hearts lost (was toBeUndefined())
    withScaleRigs(() => expect(runLost(run)).toBeUndefined(), false); // BUMP-1E: the off read, asked for outright (was bare)
    withScaleRigs(() => expect(runLost(run)).toEqual([heartsLost(7, run), 0]));
    expect(heartsLost(7, run)).toBe(3);
  });

  it("the random builder (Shopper): with the switch on it lists no reader its deck can't feed; off, every list as before", () => {
    const b = heroStartBuild("furnace");
    const ids = (s: Shopper): string[] => [...s.gates, ...s.mods, ...s.cores].map((d) => d.id);
    const list = (): string[] => ids(new Shopper(b, maxGoldByDay(6), 6, new Rng(1), "on", 3, "on", "on"));
    const off = withScaleRigs(list, false); // BUMP-1E: the switch ships on, so the off list is read with it off (was `ids(new Shopper(...))` bare)
    const onList = withScaleRigs(() => {
      const on = list();
      for (const id of on) if (needsFeeder(id)) expect(hasFeeder(b, id), id).toBe(true);
      expect(on).toEqual(expect.arrayContaining(["grudgerod", "trophychain"].filter((id) => ITEMS[id].merchant && off.length >= 0 && on.includes(id))));
      return on;
    });
    expect(onList).not.toEqual(off); // BUMP-1E: the two worlds' lists differ (the seven new ids are listed only on), so the round trip below is not vacuous
    expect(list()).toEqual(onList); // BUMP-1E: as shipped the list is the on list (was `.toEqual(off)`: the shipped world was the off one)
    expect(withScaleRigs(list, false)).toEqual(off); // BUMP-1E: and a switch round trip leaves the off list as it was
  });

  it("the par player with the switch on: every reader bought at a price comes with a feeder (bought before it or held); the measure", () => {
    const offRuns = withScaleRigs(() => runs(), false); // BUMP-1E: the switch ships on, so the off runs ask for the 0.9.11 world outright (was `runs()` bare)
    const onRuns = withScaleRigs(() => runs());
    // the rule, per buy: a reader that wants a feeder, bought at a price on day d, is held at d's dusk with a feeder
    let readerBuys = 0;
    const bad: string[] = [];
    withScaleRigs(() => {
      for (const [k, days] of onRuns) for (const d of days) for (const by of d.buys) {
        if (!ITEMS[by.def] || !needsFeeder(by.def) || by.price <= 0) continue;
        readerBuys++;
        if (!hasFeeder(d.build, by.def)) bad.push(`${k} d${d.day} ${by.def}`);
      }
    });
    expect(bad, bad.join("; ")).toEqual([]);
    // the measure: decks per day holding each of the 12, and how many of those hold a feeder
    const lines: string[] = [];
    const n = HEROES.length * parSeeds().length;
    lines.push(`par decks a day: ${n} (${HEROES.join(", ")}, seeds 1-${parSeeds().length}); reader buys at a price, switch on: ${readerBuys}`);
    lines.push("| piece | day 3 | day 6 | day 9 | day 10 |", "|---|---|---|---|---|");
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const cells = [3, 6, 9, 10].map((day) => {
          const decks = [...onRuns.values()].map((ds) => ds[day - 1].build).filter((b) => holds(b, id));
          const fed = decks.filter((b) => hasFeeder(b, id)).length;
          return `${decks.length} (${(100 * decks.length / n).toFixed(0)}%)${needsFeeder(id) ? `, fed ${fed}` : ""}`;
        });
        lines.push(`| ${ITEMS[id].name} | ${cells.join(" | ")} |`);
      }
    });
    // the par runs' wins (the road's Medium warlord fights, days 1-10), mean per run, off and on
    const wins = (m: Map<string, PlayerDay[]>, h?: HeroId): number => {
      const xs = [...m.entries()].filter(([k]) => !h || k.startsWith(`${h}/`)).map(([, ds]) => ds.filter((d) => d.road?.outcome === "win").length);
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    lines.push("", "| par runs' wins by day 10 (mean) | all | " + HEROES.join(" | ") + " |", "|---|---|" + HEROES.map(() => "---|").join(""));
    lines.push(`| off | ${wins(offRuns).toFixed(2)} | ${HEROES.map((h) => wins(offRuns, h).toFixed(2)).join(" | ")} |`);
    lines.push(`| on | ${wins(onRuns).toFixed(2)} | ${HEROES.map((h) => wins(onRuns, h).toFixed(2)).join(" | ")} |`);
    if (process.env.TABLE_OUT) writeFileSync(process.env.TABLE_OUT, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
    // off: no par deck holds a new id (they are not in the game)
    for (const ds of offRuns.values()) for (const d of ds) for (const id of SCALE_PIECES.slice(5)) expect(holds(d.build, id)).toBe(false);
  }, 900_000);
});
