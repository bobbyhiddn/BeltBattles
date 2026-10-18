// ENCHANT-1b (REQ-BFG-085; BRIEF-ENCHANT1B N1 and N3): the word's kinds and the rig that hits no slug.
//  N1: MASSIVE goes on a turret only and SWIFT on a factory only (lastChanceWord and the stand-in decoder follow enchantProblem);
//  N3: FIERY, RISING, GROWING and ECHOING are refused on a rig whose arrows never hit a slug (`IT HITS NO SLUGS`): the STOKER, found by a
//      rule on the def (enchant.ts rigHitsSlugs), proved here against deck.ts rigHits for EVERY rig def. The server, APPLY, the buy and the
//      bots follow enchantProblem. WIDE and BRACED stay legal on such a rig.
import { afterEach, describe, expect, it } from "vitest";
import "../src/sim/plainRigs"; // the six plain stat rigs are in ITEMS while PLAIN_RIGS is on (deck.ts loads it); named so the list never depends on the import order
import "../src/sim/shapes2"; // the shaped rigs of rule set B
import { ITEMS } from "../src/sim/content";
import { rigHits, rotField, type Build, type Placed } from "../src/sim/deck";
import { ENCHANT, SLUG_WORDS, enchantKindOf, enchantProblem, rigHitsSlugs, setEnchant, withEnchant } from "../src/sim/enchant";
import { lastChanceWord } from "../src/sim/enchantSources";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { rankWords } from "../src/sim/harness/enchantBot";
import { decodeStarredRaw, encodeStarred } from "../src/sim/standInPool";
import { validateBuild } from "../src/net/validate";
import { buyEnchant, enchantChoices } from "../src/game/enchanter";
import { newRun } from "../src/game/run";
import { K, furnaceBench } from "./wave3.helpers";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

const defs = Object.values(ITEMS);
const rigs = defs.filter((d) => d.kind === "gate");

/** Does a rig of `def` get a hit on the FURNACE bench's belt (column 4, rows 0-5) from some placement and facing beside it? */
function hitsSomewhere(def: string): boolean {
  for (const x of [3, 2, 1, 5, 6]) {
    for (const y of [3, 2, 4]) {
      for (let rot = 0; rot < 4; rot++) {
        const b = furnaceBench();
        const rig: Placed = { uid: 9, def, x, y, ...rotField(def, rot) };
        b.items.push(rig);
        if (rigHits(b).some((r) => r.some((t) => t.some((h) => h.uid === 9)))) return true;
      }
    }
  }
  return false;
}

describe("ENCHANT-1b N3: a rig that hits no slug refuses the four slug words", () => {
  it("the slug words are FIERY, RISING, GROWING and ECHOING (WIDE and BRACED do not depend on a hit)", () => {
    expect([...SLUG_WORDS]).toEqual(["fiery", "rising", "growing", "echoing"]);
  });

  it("the rule is the sim's own: a rig def refuses the four words exactly when no placement beside a belt gives it a hit (every rig def; the one that hits nothing is the STOKER)", () => {
    expect(rigs.length).toBeGreaterThanOrEqual(40); // the base's rigs, the plain stat rigs and the shaped rigs
    const none: string[] = [];
    for (const d of rigs) {
      const hits = hitsSomewhere(d.id);
      if (!hits) none.push(d.id);
      expect(rigHitsSlugs(d), `${d.id}: rigHitsSlugs`).toBe(hits);
      for (const w of SLUG_WORDS) expect(enchantProblem(d, w), `${w} on ${d.id}`).toBe(hits ? null : "IT HITS NO SLUGS");
    }
    // Named on purpose: a rig added later whose arrows hit no belt makes this list longer and fails here, so cap chooses it (the rule above
    // already refuses its slug words; this pin makes the choice visible). BALLAST, TOLLBOOTH, RIVETER, BRACE FRAME and IRON WALL give a slug
    // nothing of their own but their arrows DO hit slugs, so the word still adds its BURN or DMG there and they stay legal.
    expect(none).toEqual(["stoker"]);
  });

  it("WIDE and BRACED stay legal on the STOKER; factories and turrets take all four slug words (the rule is for rigs)", () => {
    expect(enchantProblem("stoker", "braced")).toBeNull();
    expect(enchantProblem("stoker", "wide")).toBeNull(); // an II rig: two free sides
    expect(enchantProblem("stoker", "massive")).toBe("ONLY ON A TURRET"); // the kind says first
    expect(enchantProblem("stoker", "swift")).toBe("ONLY ON A FACTORY");
    for (const d of defs) {
      if (enchantKindOf(d) !== "factory" && enchantKindOf(d) !== "turret") continue;
      for (const w of SLUG_WORDS) expect(enchantProblem(d, w), `${w} on ${d.id}`).toBeNull();
    }
  });

  const stokerRun = () => {
    const run = newRun("furnace", 7);
    run.build.items.push({ uid: 300, def: "stoker", x: 6, y: 2 });
    run.gold = 20;
    run.shop.enchanter = { day: 3, offers: [{ ench: "fiery", price: 4, sold: false }, { ench: "braced", price: 4, sold: false }] };
    return run;
  };

  it("APPLY: the STOKER does not glow for the four (its reason is IT HITS NO SLUGS) and does for BRACED; buying FIERY onto it is refused, takes no gold and keeps the offer", () => {
    const run = stokerRun();
    on(() => {
      const at = (word: string) => enchantChoices(run, word).find((c) => c.target.kind === "item" && c.target.uid === 300)!;
      for (const w of SLUG_WORDS) expect(at(w).reason, w).toBe("IT HITS NO SLUGS");
      expect(at("braced").reason).toBeNull();
      expect(at("wide").reason).toBeNull();
      // a rig that does hit slugs still glows (the deck's own LONG HAUL, say), so the refusal is the STOKER's, not the word's
      const hit = enchantChoices(run, "fiery").filter((c) => c.reason === null);
      expect(hit.length).toBeGreaterThan(0);
      const r = buyEnchant(run, 0, { kind: "item", uid: 300 });
      expect(r).toMatchObject({ ok: false, reason: "IT HITS NO SLUGS" });
      expect(run.gold).toBe(20);
      expect(run.shop.enchanter!.offers[0].sold).toBe(false);
      expect(run.build.items.find((p) => p.uid === 300)!.ench).toBeUndefined();
      expect(buyEnchant(run, 1, { kind: "item", uid: 300 }).ok).toBe(true); // BRACED goes on
      expect(run.gold).toBe(16);
    });
  });

  const withStoker = (ench?: string): Build => {
    const b = heroStartBuild("furnace");
    return { ...b, items: [...b.items, { uid: 20, def: "stoker", x: 6, y: 2, ...(ench ? { ench } : {}) }] };
  };

  it("the server's piece check (E6.1, both modes) refuses each slug word on a STOKER with the reason and takes BRACED; the stand-in decoder lets `stoker26~fi` through and the validator refuses it", () => {
    for (const w of SLUG_WORDS) {
      const v = on(() => validateBuild(withStoker(w), 8, "strict"));
      expect(v.ok, `${w}: ${JSON.stringify(v.errors)}`).toBe(false);
      expect(v.errors.join(" | "), w).toMatch(new RegExp(`can't take ${w.toUpperCase()}: IT HITS NO SLUGS`));
    }
    expect(on(() => validateBuild(withStoker("braced"), 8, "strict")).errors, "braced").toEqual([]);
    expect(on(() => validateBuild(withStoker(), 8, "strict")).errors, "no word").toEqual([]);
    const code = encodeStarred(withStoker("fiery"));
    expect(code).toContain("stoker26~fi"); // the stand-in word writes the STOKER's word like any piece's
    const back = decodeStarredRaw("furnace", code); // the codec judges no kind: the word reads back as written
    expect(back.items.find((p) => p.def === "stoker")).toMatchObject({ def: "stoker", ench: "fiery" });
    const v = on(() => validateBuild(back, 8, "strict"));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" | ")).toMatch(/can't take FIERY: IT HITS NO SLUGS/);
  });

  it("the bots never put a slug word on a STOKER, and a LAST CHANCE STOKER arrives with WIDE or BRACED only (300 seeds x 3 days)", () => {
    const b = withStoker();
    on(() => {
      for (const w of SLUG_WORDS) expect(rankWords({ build: b, day: 5 }, w).some((s) => s.def === "stoker"), w).toBe(false);
    });
    for (let seed = 1; seed <= 300; seed++) {
      for (const day of [3, 6, 9]) {
        const w = lastChanceWord(seed, day, "stoker");
        expect(w !== null && ["wide", "braced"].includes(w.ench), `seed ${seed} day ${day}: ${w?.ench}`).toBe(true);
      }
    }
  });
});

describe("ENCHANT-1b N1: lastChanceWord follows the kinds (a word legal on the part only)", () => {
  it("MASSIVE only on a turret and SWIFT only on a factory, over every rig, factory and turret def, 100 seeds x 3 days; gear gets none", () => {
    const seen = new Set<string>();
    for (const d of defs) {
      const kind = enchantKindOf(d);
      for (let seed = 1; seed <= 100; seed++) {
        for (const day of [3, 6, 9]) {
          const w = lastChanceWord(seed, day, d.id);
          if (!kind) {
            expect(w, `${d.id} is not a rig, factory or turret`).toBeNull();
            continue;
          }
          expect(w, `${d.id}`).not.toBeNull();
          expect(enchantProblem(d, w!.ench, w!.enchDir !== undefined ? { enchDir: w!.enchDir } : undefined), `${d.id}: ${w!.ench}`).toBeNull();
          if (w!.ench === "massive") expect(kind, `${d.id} MASSIVE`).toBe("turret");
          if (w!.ench === "swift") expect(kind, `${d.id} SWIFT`).toBe("factory");
          seen.add(`${kind}:${w!.ench}`);
        }
      }
    }
    // each kind does draw its own word now and then (so the filter is not hiding them)
    expect(seen.has("turret:massive")).toBe(true);
    expect(seen.has("factory:swift")).toBe(true);
    expect(seen.has("rig:massive") || seen.has("factory:massive") || seen.has("rig:swift") || seen.has("turret:swift")).toBe(false);
  });

  // (the stand-in decoder's `~ma` on a factory and `~sw` on a turret are pinned, with their validator reasons, in tests/enchant1.data.test.ts)
});

void K;
