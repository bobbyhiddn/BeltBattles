// beltside-062c (ref/BRIEF-beltside-merge-061c.md, P10): every road-item draw of SALVAGE, SMUGGLER and TRADER SWAP
// over a fixed grid of seeds, days, picks and parts held. Not a test file itself (no .test suffix). It uses only APIs
// that 0.6.1c (4ecf202) already has, so the very same function ran on a clean `git archive` of 4ecf202 to write
// tests/fixtures/beltside-062c/roadDraws-061c.json, and tests/beltside.merge061c.test.ts runs it on this branch and
// compares the unchanged wreck and smuggler draws. Trader swaps intentionally change when new
// sold modules enter the shared rarity pool.
// 0.8.0 T1 (VERIFIED-I1 call 3): tests/fixtures/beltside-062c/roadDraws-062b.json is likewise a one-time capture
// (arsenal-062b's draws, which the history check compares today's against), so BB_WRITE_ROAD_DRAWS no longer rewrites it
// (tests/beltside.merge061c.test.ts, refuse062b). Only the live fixture roadDraws-080.json is rewritten from this
// function, by BB_WRITE_ROAD_DRAWS_080.
import { salvagePart, smugglerParts, swapPart, type Choice, type EventId } from "../src/game/eventDefs";
import { choicesFor, makeEvent } from "../src/game/events";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { fusible } from "../src/sim/stars";

type Held = { cargo: [string, number][]; deck: [string, number, number, number, number][]; mods: [string, number][] };

/** Parts held: cargo [def, stars], deck rigs [def, x, y, rot, stars] beside the starting belt (column 4), mods [def, stars]. */
export const DRAW_HELD: Record<string, Held> = {
  none: { cargo: [], deck: [], mods: [] },
  some: { cargo: [["temper", 1], ["hopper", 1]], deck: [["whetstone", 3, 3, 1, 1]], mods: [["calibrate", 1]] },
  many: {
    cargo: [["temper", 2], ["grease", 1], ["brake", 3], ["coil", 1], ["scatter", 1], ["splitter", 1], ["hotswap", 1]],
    deck: [["whetstone", 3, 3, 1, 1], ["longhaul", 3, 2, 0, 2]],
    mods: [["chamber", 2]],
  },
};

const DRAW_SEEDS = Array.from({ length: 12 }, (_, i) => 1 + i * 7919);
const PICKS = Array.from({ length: 64 }, (_, i) => (i + 0.5) / 64);
const st = (s: number) => (s > 1 ? { stars: s } : {});

function heldRun(seed: number, day: number, held: Held, oldSave = false): Run {
  const run = newRun("furnace", seed);
  // 0.8.0 I1 M3: an old save (a run without the per-run draw's wares: its road grants read the whole catalogue)
  if (oldSave) delete (run as { wares?: unknown }).wares;
  run.day = day;
  run.gold = 20;
  let uid = 900;
  run.build.items = [
    ...run.build.items.filter((p) => !fusible(p.def)),
    ...held.deck.map(([def, x, y, rot, s]) => ({ uid: uid++, def, x, y, ...(rot ? { rot } : {}), ...st(s) })),
  ];
  run.build.mods = held.mods.map(([def, s]) => ({ uid: uid++, def, turret: 0, ...st(s) }));
  run.inventory = held.cargo.map(([def, s]) => ({ uid: uid++, def, ...st(s) }));
  run.nextUid = 1000;
  return run;
}

/** A choice that moves a part, as "LABEL:gained<given" (item defs only), "!" when blocked; "" for any other choice. */
const choiceKey = (c: Choice): string => {
  const items = (l: Choice["gain"]) => l.flatMap((x) => (x.k === "item" ? [x.def] : [])).join("+");
  const gain = items(c.gain), cost = items(c.cost);
  return gain || cost || c.blocked ? `${c.label}:${gain}${cost ? `<${cost}` : ""}${c.blocked ? "!" : ""}` : "";
};

export interface RoadDraws {
  choices: Record<string, string>; // `${event}|${held}|${seed}` -> the 10 days' choices, " / "-joined
  salvage: Record<string, string>; // held -> salvagePart over PICKS (day 5)
  smuggler: string; // smugglerParts over PICKS
  swap: Record<string, string>; // good def -> swapPart over 16 picks
}

/** 0.8.0 I1 M3: `oldSave` plays every run as a save without wares (today's rule over the whole catalogue). */
export function roadDraws(oldSave = false): RoadDraws {
  const out: RoadDraws = { choices: {}, salvage: {}, smuggler: "", swap: {} };
  for (const id of ["wreck", "smuggler", "trader"] as EventId[]) {
    for (const [k, held] of Object.entries(DRAW_HELD)) {
      for (const seed of DRAW_SEEDS) {
        out.choices[`${id}|${k}|${seed}`] = Array.from({ length: 10 }, (_, i) => {
          const run = heldRun(seed, i + 1, held, oldSave);
          run.event = makeEvent(seed, i + 1, id);
          run.stage = "event";
          return choicesFor(run).map(choiceKey).filter(Boolean).join(";");
        }).join(" / ");
      }
    }
  }
  for (const [k, held] of Object.entries(DRAW_HELD)) {
    const run = heldRun(12345, 5, held, oldSave);
    out.salvage[k] = PICKS.map((p) => salvagePart(run, p) ?? "-").join(",");
  }
  out.smuggler = PICKS.map((p) => smugglerParts(p).map((x) => x ?? "-").join("+")).join(",");
  // 0.6.2s: turrets are fusible but never a trade good (eventDefs tradeGood), so no swap starts from one
  for (const def of Object.keys(ITEMS).filter((d) => fusible(d) && ITEMS[d].kind !== "turret")) {
    out.swap[def] = PICKS.filter((_, i) => i % 4 === 0).map((p) => swapPart(def, p) ?? "-").join(",");
  }
  return out;
}
