// RUNES-2a (REQ-BFG-058, R1b-2 1.6): the captains' rune lists. Every rival captain (src/sim/rivals.ts RIVALS) takes one
// rune at the dawn of each day 1..RUN_DAYS with the bots' picker (src/sim/runes.ts botRuneList): day d's pick is
// botRunePick(runeOffer(captainRuneSeed(id), d, hero, the picks before it), hero, rivalBuild(id, d)), the captain's
// named build of that day (rivalBuilds.ts PLANS at the captain's luck). Nothing else draws: the offer's own "rune"
// stream is the only RNG. So each list passes runeProblem(list, day, hero, captainRuneSeed(id)) for every day by
// construction (the generator checks it and throws otherwise). The Matriarch, met on days 8-10 only, gets RUN_DAYS
// picks too, so her ghost on day d holds exactly d runes (RUNES-2b's `runes.length === day`).
//
// THE CAPTAIN'S SEED: captainRuneSeed(id) = hashSeed("captain-runes", id). A captain has no run seed (its decks are
// fixed plans), so the seed is named after the captain id alone: stable across catalogue and roster edits.
//
// It writes a data module's text (CAPTAIN_RUNES: RivalId -> rune ids in pick order, entry i taken at the dawn of day
// i + 1, like CAPTAIN_LEVELS) to --out, never into src: RUNES-2b runs it on the final base and pins it (a hand edit for
// flavour is allowed if it still passes runeProblem with the captain's seed). One command, from the repo root:
//   npx vite build --ssr tools/genCaptainRunes.ts --outDir ../output-runes2a/.gen-captain-runes --emptyOutDir --logLevel warn && node ../output-runes2a/.gen-captain-runes/genCaptainRunes.js --out ../output-runes2a/captain-runes.ts.txt

//
// CATCHUP-091 (REQ-BFG-058, REQ-BFG-024): THE GENERATOR'S OWN RULES. Before the bots' picker reads a dawn's offer, the
// captain's copy of the offer loses the cards these rules name, and botRunePick takes the best of the rest: its next-best
// pick. The rules live here, in the generator, and nowhere in the shared picker (src/sim/runes.ts botRunePick and
// botRuneList), which the stand-in pool's generator and the par player also read. With no card named, a dawn's pick is
// exactly botRuneList's, so every list the rules don't touch is as before.
//  1. The dead rune (BAL-2's question 1; cap's answer 1 in REVIEW-BAL2): a captain never takes a rune whose effect is inert
//     for its hero (runeInertFor).
//  2. CAPTAIN_RUNE_SKIP: runes a captain never takes, each the least rune change that gives back a walls reading (cap's
//     ruling Q2 f77489ebe2e11698 rule 4; BRIEF-CATCHUP-091's lever b).
// If a rule would name every card of an offer, the captain takes the picker's own pick (no next-best exists).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { hashSeed } from "../src/core/rng";
import { RULES_VERSION, RUN_DAYS, type HeroId } from "../src/sim/content";
import { RIVALS, RIVAL_IDS, rivalBuild, type RivalId } from "../src/sim/rivals";
import { RUNES, botRunePick, runeList, runeOffer, runeProblem } from "../src/sim/runes"; // BOTS-X: runeList(), the dawn's own list

/** A captain's rune seed (see the header). */
export const captainRuneSeed = (id: RivalId): number => hashSeed("captain-runes", id);

/**
 * CATCHUP-091 rule 1 (BAL-2's question 1): `rune` does nothing for `hero`. Today that is COAL CHUTE and HEAT SINK (kind
 * heatPct) for every hero but FURNACE: heatPct raises the HEAT a slug gains as it rides (battle.ts rideOf and the HEAT
 * JACKET's heatBonus), and only FURNACE has the KILN (its CINDER SLUG rides up HEAT) and only FURNACE captains' plans hold a
 * HEAT JACKET. So EMBERLYN, a WEAVER captain, no longer takes COAL CHUTE on day 2.
 */
export const runeInertFor = (rune: string, hero: HeroId): boolean => RUNES[rune]?.kind === "heatPct" && hero !== "furnace";

/**
 * CATCHUP-091 rule 2 (cap's ruling Q2 f77489ebe2e11698 rule 4, the walls; REVIEW-BAL1 section 6: most walls misses are the
 * captains' own runes): runes a captain never takes; it takes its next-best card of the same offer instead (and every
 * later dawn draws on the picks as they now stand). Readings: the par field's top quartile (P75) against the captain's
 * road deck, FURNACE / WEAVER, BAL-2's preview at 7f642ec -> with the skip (W/output-c091/probe):
 * - MASTER VOSS: TWIN SUNS (day 6; next-best SCRAP SAINT): day 6 12 / 48 -> 34 / 67, day 7 17 / 69 -> 19 / 78, day 8
 *   39 / 59 -> 45 / 81; MOLTEN VOWS (day 10; next-best LOOM OF WOE): day 10 17 / 25 -> 61 / 68.
 * - LONGTOOTH: SCRAP SAINT (day 8; next-best RUNE TITHE): day 8 27 / 47 -> 50 / 60.
 */
export const CAPTAIN_RUNE_SKIP: Readonly<Partial<Record<RivalId, readonly string[]>>> = {
  voss: ["twin_suns", "molten_vows"],
  longtooth: ["scrap_saint"],
};

/** Captain `id`'s picks at the dawns of days 1..days (RUN_DAYS by default), in pick order. */
export function captainRunes(id: RivalId, days = RUN_DAYS): string[] {
  const hero = RIVALS[id].hero, seed = captainRuneSeed(id), skip = CAPTAIN_RUNE_SKIP[id] ?? [];
  // botRuneList's loop (runes.ts) with the generator's rules on the offer (the header): day d reads rivalBuild(id, d)
  // and runeOffer(seed, d, hero, the picks before it); it stops at an empty offer
  const list: string[] = [];
  for (let day = 1; day <= days; day++) {
    const offer = runeOffer(seed, day, hero, list);
    const cards = offer.ids.filter((q) => !runeInertFor(q, hero) && !skip.includes(q));
    const pick = botRunePick(cards.length ? cards : offer.ids, hero, rivalBuild(id, day));
    if (pick === null) break;
    list.push(pick);
  }
  if (list.length !== days) throw new Error(`captain runes ${id}: ${list.length} picks for ${days} dawns (an empty offer)`);
  for (let day = 1; day <= days; day++) {
    const p = runeProblem(list.slice(0, day).map((q) => ({ id: q })), day, hero, captainRuneSeed(id));
    if (p) throw new Error(`captain runes ${id} day ${day}: ${p}`);
  }
  return list;
}

/** Every captain's list, in roster order. */
export const allCaptainRunes = (): Record<RivalId, string[]> =>
  Object.fromEntries(RIVAL_IDS.map((id) => [id, captainRunes(id)])) as Record<RivalId, string[]>;

/** The data module's text (byte-stable for the same catalogue and roster). */
export function captainRunesText(lists: Record<RivalId, string[]> = allCaptainRunes()): string {
  const rows = RIVAL_IDS.map((id) => {
    const names = lists[id].map((q) => RUNES[q]?.name ?? q).join(", ");
    return `  ${id}: [${lists[id].map((q) => JSON.stringify(q)).join(", ")}], // ${RIVALS[id].hero}: ${names}`;
  });
  return [
    `// GENERATED by tools/genCaptainRunes.ts (RUNES-2a, REQ-BFG-058; R1b-2 1.6). Rules ${RULES_VERSION}, ${runeList().length} runes in the catalogue.`,
    "// Each captain's runes in pick order (entry i taken at the dawn of day i + 1): the bots' picker (src/sim/runes.ts",
    "// botRunePick) on runeOffer(hashSeed(\"captain-runes\", id), day, hero, the picks before it), reading rivalBuild(id, day).",
    "// Every prefix passes runeProblem with that seed. RUNES-2b pins this beside CAPTAIN_LEVELS.",
    "// CATCHUP-091: the generator's own rules (runeInertFor, CAPTAIN_RUNE_SKIP) take the picker's next-best card of an offer.",
    "",
    "import type { RivalId } from \"./rivals\";",
    "",
    "export const CAPTAIN_RUNES: Readonly<Record<RivalId, readonly string[]>> = {",
    ...rows,
    "};",
    "",
  ].join("\n");
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// the CLI (node <outDir>/genCaptainRunes.js); importing the module (tests) writes nothing
if (/genCaptainRunes\.[cm]?js$/.test(process.argv[1] ?? "")) {
  const out = resolve(flag("out") ?? "../output-runes2a/captain-runes.ts.txt");
  const lists = allCaptainRunes();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, captainRunesText(lists));
  console.log(`wrote ${RIVAL_IDS.length} captains' rune lists (${RUN_DAYS} dawns each, ${runeList().length} runes in the catalogue) to ${out}`);
}
