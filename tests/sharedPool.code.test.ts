// 0.8.0 H1 M4 (REQ-BFG-021, acceptance 2; ref/BRIEF-v080-H1.md section 5.2): a code check that no shop, merchant or
// draw code reads a race, faction or hero field of a module.
//  1. A module (ItemDef) has no such field at all: every catalogue entry's keys are ItemDef's own, and its tags are
//     effect words.
//  2. The source of every function that rolls the caravan (merchants, their stock, the offers, the familiar slot, the
//     MERGE badge), draws a road part (SALVAGE, SMUGGLER, the trader's SWAP and good), grants a part (events, merging,
//     a warlord's reward) or builds the harness's draw sets names no race, faction or hero (comments stripped; an
//     unused `_hero` parameter is the harness adapter's signature, never read).
//  3. The one hero-table read near them, road.ts's SIGNATURE set, excludes every hero's signature factory alike: a deck
//     holding all six never pays one out.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HEROES, ITEMS, type HeroId, type ItemDef, type ModuleTag } from "../src/sim/content";
import { topParts } from "../src/game/road";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { HARNESS_HEROES } from "../src/sim/harness/heroes";
import { EVENT_IDS, choicesFor, makeEvent } from "../src/game/events";
import { newRun } from "../src/game/run";

/** ItemDef's fields (src/sim/content.ts). */
// SHAPES-1 flip: + "foot" (REQ-BFG-086 R1), set on the three shaped rigs and the reshaped GANTRY PRESS and ASSEMBLY LINE
const FIELDS: (keyof ItemDef)[] = ["id", "name", "kind", "rarity", "price", "size", "foot", "desc", "merchant", "shape", "gate", "factory", "mod", "core", "turret", "reason", "supply", "levels", "tags"];
// 0.8.0 I1 (oracle c38b1df9f2e9c338): family map v2's seven names (VERIFIED-D1 Q1), written out, so a new tag needs a
// deliberate edit here; none names a race, faction or hero
const TAGS: ModuleTag[] = ["FORGE", "HARASS", "SWARM", "BURST", "TEMPO", "TWIN", "PLATE"];

/** The shop, merchant and draw code: file and the functions (or const arrows) in it. */
const SOURCES: [string, string[]][] = [
  ["src/game/run.ts", ["rollRarity", "baseMerchantWeight", "startingCopy", "starLevelsOwned", "ownsDef", "dayPool", "merchantWeight", "pickMerchants", "familiarChance", "familiarCandidates", "rollShop", "shopBadge", "reroll", "buyOffer"]],
  ["src/sim/content.ts", ["itemsSoldBy", "buyableModules", "rarityWeights"]],
  ["src/game/eventDefs.ts", ["roadPart", "roadParts", "salvagePool", "smugglerPool", "ofRarity", "UPGRADE", "draw", "holds", "salvagePart", "smugglerParts", "swapPart", "partChoice", "tradeGood"]],
  ["src/game/events.ts", ["owns", "blockReason", "choicesFor", "receive", "pickChoice"]],
  ["src/game/fuse.ts", ["gainModule", "mergePreview"]],
  ["src/game/road.ts", ["topParts", "hardParts", "warlordReward"]],
  ["src/sim/harness/heroes.ts", ["shopItems", "shopFactories"]],
];

/** Words that would read a race, faction or hero: the field names, the race tables and hero ids. */
const FORBIDDEN = /\b(faction|factions|Faction|race|races|Race\w*|RACE_\w+|isRaceHero|hero|heroes|Hero\w*|HEROES|furnace|weaver|foundry|bastion|metronome|siphon|orc|elf|human|dwarf)\b/;

/**
 * The one hero read among them, and why it can't change a part: blockReason blocks a choice whose hull cost would leave
 * the run's own hull under 100 (HEROES[run.hero].hull, the hull rule; a module has no hull). Only RIDE THROUGH costs
 * hull, and it pays gold; the test below checks that no part-granting choice ever costs hull.
 */
const ALLOWED: Record<string, RegExp> = { "src/game/events.ts blockReason": /HEROES\[run\.hero\]\.hull/g };

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/** The text of `name`'s definition in `src`: a function's body, or a const's initializer (to its closing brace or the
 *  end of its statement). */
function definition(src: string, name: string): string {
  const fn = new RegExp(`(?:^|\\n)(?:export )?function ${name}\\b[^{]*\\{`).exec(src);
  const cn = new RegExp(`(?:^|\\n)(?:export )?const ${name}\\b[^=]*=`).exec(src);
  const m = fn ?? cn;
  if (!m) throw new Error(`no definition of ${name}`);
  let i = m.index + m[0].length;
  if (!fn) {
    // a const: to the end of its statement (a ";" at depth 0)
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{" || c === "(" || c === "[") depth++;
      else if (c === "}" || c === ")" || c === "]") depth--;
      else if (c === ";" && depth === 0) break;
    }
    return src.slice(start, i);
  }
  let depth = 1;
  const start = i;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
  }
  return src.slice(start, i - 1);
}

describe("REQ-BFG-021: no shop, merchant or draw code reads a race, faction or hero field of a module", () => {
  it("a module has no race, faction or hero field: only ItemDef's own keys, and family tags (map v2)", () => {
    for (const d of Object.values(ITEMS)) {
      for (const k of Object.keys(d)) expect(FIELDS as string[], `${d.id}.${k}`).toContain(k);
      for (const t of d.tags ?? []) expect(TAGS, `${d.id} tag ${t}`).toContain(t);
    }
  });

  it("the shop, merchant, road-part, grant and harness draw functions name no race, faction or hero", () => {
    let checked = 0;
    for (const [file, names] of SOURCES) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const name of names) {
        const allowed = ALLOWED[`${file} ${name}`];
        const raw = definition(src, name);
        if (allowed) expect(raw, `${file} ${name}`).toMatch(allowed);
        const body = allowed ? raw.replace(allowed, "") : raw;
        expect(body.length, `${file} ${name}`).toBeGreaterThan(10);
        const hit = FORBIDDEN.exec(body);
        expect(hit?.[0], `${file} ${name} reads "${hit?.[0]}"`).toBeUndefined();
        checked++;
      }
    }
    expect(checked).toBe(SOURCES.reduce((n, [, names]) => n + names.length, 0));
  });

  it("no road choice that grants a part costs hull (so blockReason's hull rule never blocks a part for one hero only)", () => {
    let parts = 0;
    for (const id of EVENT_IDS) for (const day of [1, 4, 8]) for (const hero of HARNESS_HEROES) {
      const run = newRun(hero, 77, "code-check");
      run.day = day;
      run.inventory = [{ uid: 300, def: "whetstone" }];
      run.event = makeEvent(run.seed, day, id);
      for (const c of choicesFor(run)) {
        if (!c.gain.some((d) => d.k === "item")) continue;
        parts++;
        expect(c.cost.some((d) => d.k === "hull"), `${id} ${c.label}`).toBe(false);
        expect(c.blocked ?? "", `${id} ${c.label} for ${hero}`).not.toBe("HULL TOO WEAK");
      }
    }
    expect(parts).toBeGreaterThan(0);
  });

  it("road.ts's SIGNATURE (the one hero-table read) excludes every hero's signature alike: none is ever a reward part", () => {
    const deck = heroStartBuild("furnace", 1);
    HARNESS_HEROES.forEach((h: HeroId, i) => deck.items.push({ uid: 7000 + i, def: HEROES[h].factory, x: 0, y: 0 }));
    deck.items.push({ uid: 7100, def: "whetstone", x: 0, y: 0 });
    const parts = topParts(deck, 99);
    for (const h of HARNESS_HEROES) expect(parts, h).not.toContain(HEROES[h].factory);
    expect(parts).toContain("whetstone");
  });
});
