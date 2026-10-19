// ENCHANT-2 (REQ-BFG-085; BRIEF-ENCHANT2 T2): NPC DROPS KEEP THEIR WORD (REQ-BFG-078, a clause 3 source). What this proves:
//   - dropWordOf: the word (and WIDE's side) the deck's copy of a def holds; a deck with two copies and one word gives it; none with ENCHANT off;
//   - finishWarlord: a win's drop arrives in cargo WITH the word the rival's copy of that part held that day, at the drop's star; the roll itself
//     (the part, the odds) is the same with ENCHANT on and off; with ENCHANT off no piece anywhere holds a word;
//   - the Matriarch's legendary part keeps hers;
//   - the surfaces: the inspect panel's drop list and the victory card say the word in its colour before the part's name, and fit;
//   - the T6 fix round (E2-03, words only): the victory card of a drop that arrives with a word spells its star (`STAR 2`, not the 3x5 `★2` five of six readers took for `x2`).
import { afterEach, describe, expect, it } from "vitest";
import { finishWarlord, pickRoad, todaysWarlord, warlordDropTable } from "../src/game/road";
import { gainModule } from "../src/game/fuse";
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { turretList, type Build } from "../src/sim/deck";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, enchantProblem, setEnchant, withEnchant } from "../src/sim/enchant";
import { DROP_STARS, dropTable } from "../src/sim/npcDay";
import { NPC_WORDS, dropWordOf } from "../src/sim/npcWords";
import { starsOf } from "../src/sim/stars";
import { rivalBuild, type Difficulty } from "../src/sim/rivals";
import { itemName } from "../src/screens/event/cards";
import { cutName, dropCardText, dropListText, dropWord, fitWordName } from "../src/screens/fork/drops";
import { textWidth } from "../src/render/font";

afterEach(() => setEnchant(ENCHANT)); // the shipped value (off)

/** Every piece the run holds of `def`, anywhere: cargo, the deck's rigs and factories, the installed turrets. */
function holding(run: Run, def: string): { ench?: string; enchDir?: number; stars: number }[] {
  return [
    ...run.inventory.filter((i) => i.def === def),
    ...run.build.items.filter((p) => p.def === def),
    ...turretList(run.build).filter((t) => t.def === def),
  ].map((p) => ({ ench: p.ench, enchDir: (p as { enchDir?: number }).enchDir, stars: starsOf(p) }));
}

/** A fresh run on `day` that picks a `tier` warlord and wins the fight (finishWarlord): the run, the fight and its result. */
function win(seed: number, day: number, tier: Difficulty) {
  const run = newRun("furnace", seed, "t2-drop");
  run.day = day;
  const pick = pickRoad(run, tier);
  if (!pick.ok) throw new Error(`pickRoad ${tier}: ${pick.reason}`);
  const w = todaysWarlord(run)!;
  const res = finishWarlord(run, 0, 25)!;
  return { run, w, res };
}

const plain = (b: Build): boolean => !JSON.stringify(b).includes('"ench"');

describe("ENCHANT-2 T2: dropWordOf", () => {
  const deck = (ench: [string | undefined, string | undefined]): Pick<Build, "hero" | "items" | "turrets"> => ({
    hero: "furnace", turrets: undefined,
    items: [{ uid: 1, def: "temper", x: 0, y: 0, ...(ench[0] ? { ench: ench[0] } : {}) }, { uid: 2, def: "temper", x: 1, y: 0, ...(ench[1] ? { ench: ench[1] } : {}) }],
  });

  it("two copies of a def and only one with a word: the drop has it, whichever copy holds it", () => {
    withEnchant(() => {
      expect(dropWordOf(deck(["fiery", undefined]), "temper")).toEqual({ ench: "fiery" });
      expect(dropWordOf(deck([undefined, "fiery"]), "temper")).toEqual({ ench: "fiery" });
      expect(dropWordOf(deck([undefined, undefined]), "temper")).toBeNull();
      expect(dropWordOf(deck(["fiery", "rising"]), "temper")).toEqual({ ench: "fiery" }); // two words: the first copy's
      expect(dropWordOf(deck(["fiery", undefined]), "whetstone")).toBeNull(); // another def
    });
  });

  it("WIDE on a rig brings its side along, a word on a turret comes from the installed list, and ENCHANT off gives none", () => {
    const d: Pick<Build, "hero" | "items" | "turrets"> = {
      hero: "furnace", items: [{ uid: 1, def: "venom", x: 0, y: 0, ench: "wide", enchDir: 2 }], turrets: [{ slot: 0, def: "scrapcannon", uid: 9, free: true, ench: "echoing" }],
    };
    withEnchant(() => {
      expect(dropWordOf(d, "venom")).toEqual({ ench: "wide", enchDir: 2 });
      expect(dropWordOf(d, "scrapcannon")).toEqual({ ench: "echoing" });
    });
    expect(dropWordOf(d, "venom")).toBeNull();
    expect(dropWordOf(d, "scrapcannon")).toBeNull();
  });
});

describe("ENCHANT-2 T2: a warlord's drop keeps the word its rival's copy held", () => {
  it("the cargo copy has the word (and WIDE's side) at the drop's star; the part and the odds are the same as with ENCHANT off", () => {
    let cases = 0, withWord = 0;
    const wordsSeen = new Set<string>();
    for (const tier of ["easy", "medium", "hard"] as const) {
      for (let day = 5; day <= 12; day++) {
        for (let seed = 1; seed <= 120; seed++) {
          const off = withEnchant(() => win(seed, day, tier), false);
          const on = withEnchant(() => win(seed, day, tier), true);
          expect(on.res.took, `${tier} d${day} seed ${seed}: the roll is the roll`).toBe(off.res.took);
          expect(on.w.id).toBe(off.w.id);
          expect(JSON.stringify(off.run.inventory) + JSON.stringify(off.run.build), `${tier} d${day} seed ${seed}: ENCHANT off, no word anywhere`).not.toContain('"ench"');
          cases++;
          const took = on.res.took;
          if (!took) continue;
          const want = withEnchant(() => dropWordOf(on.w.build, took));
          if (!want) continue;
          withWord++;
          wordsSeen.add(want.ench);
          const held = withEnchant(() => holding(on.run, took));
          expect(held.length, `${tier} d${day} seed ${seed}: ${took} is in the run`).toBeGreaterThan(0);
          const there = held.find((p) => p.ench === want.ench && (want.enchDir === undefined || p.enchDir === want.enchDir));
          expect(there, `${tier} d${day} seed ${seed}: the ${want.ench} dropped with ${took} (cargo or merged into a twin)`).toBeDefined();
        }
      }
    }
    expect(cases).toBe(3 * 8 * 120);
    expect(withWord, "drops that carried a word").toBeGreaterThan(40);
    expect(wordsSeen.size, "different words dropped").toBeGreaterThanOrEqual(4);
  });

  it("an unmerged drop sits in cargo with its word at the tier's star (Hard's at ★2)", () => {
    let hard = 0, other = 0;
    for (const tier of ["easy", "medium", "hard"] as const) {
      for (let day = 5; day <= 7; day++) { // before the Matriarch holds the Hard slot, the deck's twin of a drop is rarely on the starting deck
        for (let seed = 1; seed <= 200; seed++) {
          const { run, w, res } = withEnchant(() => win(seed, day, tier));
          const took = res.took;
          if (!took) continue;
          const want = withEnchant(() => dropWordOf(w.build, took));
          if (!want || !run.inventory.some((i) => i.def === took && i.ench === want.ench)) continue; // merged: the other test
          const copy = run.inventory.find((i) => i.def === took && i.ench === want.ench)!;
          expect(starsOf(copy), `${tier} d${day} seed ${seed}`).toBe(DROP_STARS[tier]);
          if (tier === "hard") hard++; else other++;
        }
      }
    }
    expect(hard).toBeGreaterThan(3);
    expect(other).toBeGreaterThan(10);
  });

  it("the Iron Matriarch's legendary part is her LANCE, a core: a core takes no word, so it arrives plain whatever her three words are", () => {
    withEnchant(() => {
      for (let day = 8; day <= 14; day += 3) {
        const run = newRun("furnace", 11, "t2-queen");
        run.day = day;
        expect(pickRoad(run, "hard").ok).toBe(true);
        const w = todaysWarlord(run)!;
        expect(w.id).toBe("matriarch"); // she holds the Hard slot from day 8 until beaten
        const part = w.reward.parts[0];
        expect(part).toBe("lance");
        expect(ITEMS[part].kind, "her legendary part is a core").toBe("core");
        expect(enchantProblem(part, "fiery"), "a core is refused every word").toBe("NOT ON A CORE");
        expect(dropWordOf(w.build, part)).toBeNull();
        const res = finishWarlord(run, 0, 30)!;
        expect(res.took).toBe(part);
        expect(holding(run, part).map((p) => p.ench), `d${day}`).toEqual([undefined]);
      }
    });
  });

  it("a drop that merges into a twin without a word keeps its own word, and into a twin with another word opens the pick (nothing is lost silently)", () => {
    withEnchant(() => {
      const run = newRun("furnace", 7, "t2-merge");
      // cargo twin of a ★1 TEMPER holding RISING; the drop is a ★1 TEMPER with FIERY: two different words: the merge asks
      run.inventory.push({ uid: 900, def: "temper", ench: "rising" } as never);
      run.nextUid = 901;
      const g = gainModule(run, "temper", undefined, 1, { word: { ench: "fiery" } });
      expect(g.steps.length).toBeGreaterThan(0);
      expect(run.enchMerge, "two different words: the pick is open").toBeDefined();
      // and a twin with no word: the drop's word is kept on the survivor
      const run2 = newRun("furnace", 8, "t2-merge2");
      run2.inventory.push({ uid: 900, def: "temper" } as never);
      run2.nextUid = 901;
      const g2 = gainModule(run2, "temper", undefined, 1, { word: { ench: "fiery" } });
      expect(g2.steps.length).toBeGreaterThan(0);
      expect(run2.enchMerge).toBeUndefined();
      expect(holding(run2, "temper").map((p) => p.ench)).toEqual(["fiery"]);
    });
  });
});

describe("ENCHANT-2 T2: the drop's surfaces say the word before the part's name", () => {
  it("warlordDropTable lines carry the word of the deck's copy (ENCHANT on); none with it off; the odds are the same", () => {
    withEnchant(() => {
      let lines = 0, worded = 0;
      for (const id of ["sootjaw", "nettle", "longtooth", "lockjaw", "matriarch"] as const) {
        const deck = rivalBuild(id, 12);
        const t = warlordDropTable(id, "hard", deck);
        const bare = withEnchant(() => dropTable("hard", { ...deck, items: deck.items.map(({ ench: _e, enchDir: _d, ...p }) => p), turrets: turretList(deck).map(({ ench: _e, ...t2 }) => t2) }), false);
        if (id !== "matriarch") expect(t.lines.map((l) => [l.def, l.cls, l.odds]), id).toEqual(bare.lines.map((l) => [l.def, l.cls, l.odds]));
        for (const l of t.lines) {
          lines++;
          const w = dropWordOf(deck, l.def);
          expect(l.ench, `${id} ${l.def}`).toBe(w?.ench);
          if (w) worded++;
        }
      }
      expect(lines).toBeGreaterThan(20);
      expect(worded).toBeGreaterThan(5);
    });
    const deck = rivalBuild("sootjaw", 12);
    expect(warlordDropTable("sootjaw", "hard", deck).lines.every((l) => l.ench === undefined && !("enchDir" in l))).toBe(true);
    expect(plain(deck)).toBe(true);
  });

  it("the ⓘ list rows start with the word, then the name; a plain row is what it was", () => {
    withEnchant(() => {
      const deck = rivalBuild("sootjaw", 12);
      const t = warlordDropTable("sootjaw", "hard", deck);
      const rows = dropListText(t);
      expect(rows).toHaveLength(t.lines.length);
      for (const [i, l] of t.lines.entries()) {
        const pre = l.ench ? `${ENCHANT_DEFS[l.ench].name} ` : "";
        expect(rows[i].startsWith(`${pre}${itemName(l.def)} · `), `${l.def}: ${rows[i]}`).toBe(true);
      }
      expect(t.lines.some((l) => l.ench)).toBe(true);
    });
  });

  it("the victory card's text carries the word and its colour; a plain drop's is what it was", () => {
    const part = Object.keys(ITEMS).find((d) => ITEMS[d].kind === "gate" && ITEMS[d].rarity === "common")!;
    expect(dropCardText(part, false)).toEqual({ name: itemName(part), sub: "DROP · TO CARGO · ★1" });
    expect(dropCardText(part, false, 2)).toEqual({ name: itemName(part), sub: "DROP · TO CARGO · ★2" }); // a plain Hard drop keeps its glyph (ENCHANT off draws what it drew)
    // T6 fix round (E2-03, words only): a drop that arrives with a word SPELLS its star (the 3x5 ★ read as `x2`, two copies, to 5 of 6 readers of the strict read's round 1)
    expect(dropCardText(part, false, 2, "fiery")).toEqual({ name: itemName(part), sub: "DROP · TO CARGO · STAR 2", word: "FIERY " });
    expect(dropCardText(part, false, 1, "fiery")).toEqual({ name: itemName(part), sub: "DROP · TO CARGO · STAR 1", word: "FIERY " });
    expect(dropCardText(part, true, 1, "echoing")!.word).toBe("ECHOING ");
    expect(dropCardText(part, true, 1, "echoing")!.sub).toBe("LEGENDARY · TO CARGO"); // the Matriarch's says LEGENDARY, no star, word or not
    expect(dropCardText(part, false, 2, "not-a-word")!.sub).toBe("DROP · TO CARGO · ★2"); // a forged id is no word: the plain line
    expect(dropWord("fiery")).toEqual({ text: "FIERY ", colour: ENCHANT_DEFS.fiery.color });
    expect(dropWord(undefined)).toBeUndefined();
    expect(dropWord("not-a-word")).toBeUndefined();
  });

  it("the spelled star's sub line fits the victory card: 23 px in, 3x5, the narrowest card the game draws (W 200: panel 190, card 170) and the widest (194)", () => {
    const part = Object.keys(ITEMS).find((d) => ITEMS[d].kind === "gate" && ITEMS[d].rarity === "common")!;
    for (const cardW of [170, 194]) {
      for (const stars of [1, 2, 3]) {
        const sub = dropCardText(part, false, stars, "massive")!.sub;
        expect(sub).toBe(`DROP · TO CARGO · STAR ${stars}`);
        expect(23 + textWidth(sub, "3") + 4, `STAR ${stars} on a ${cardW} px card`).toBeLessThanOrEqual(cardW);
      }
    }
  });

  it("word and name fit the victory card (5x7) or the 3x5 face with the name cut with a dot, for every word and every part", () => {
    const room = 168; // the card's 194 px less the icon (a 214 px panel's cw - 20, drops.ts drawDropCard: w - 26)
    let big = 0, small = 0;
    for (const id of ENCHANT_IDS) {
      const word = `${ENCHANT_DEFS[id].name} `;
      for (const d of Object.values(ITEMS)) {
        const f = fitWordName(word, itemName(d.id), room);
        expect(textWidth(word, f.font) + textWidth(f.name, f.font), `${word}${d.name}`).toBeLessThanOrEqual(room);
        if (f.font === "5") big++; else small++;
      }
    }
    expect(big).toBeGreaterThan(small);
    expect(fitWordName("MASSIVE ", "ARMOR PLATING", 60).font).toBe("3");
    expect(textWidth(fitWordName("MASSIVE ", "ARMOR PLATING", 60).name, "3") + textWidth("MASSIVE ", "3")).toBeLessThanOrEqual(60);
    expect(cutName("ABC", "3", 100)).toBe("ABC");
  });

  it("every rival's grant is a drop the table can show: the (def, word) pair is in its deck's drop table on the day it is live", () => {
    withEnchant(() => {
      for (const id of Object.keys(NPC_WORDS) as (keyof typeof NPC_WORDS)[]) {
        const deck = rivalBuild(id, 12);
        for (const g of NPC_WORDS[id]) {
          const w = dropWordOf(deck, g.def);
          expect(w?.ench, `${id} ${g.def}`).toBe(g.word);
        }
      }
    });
  });
});
