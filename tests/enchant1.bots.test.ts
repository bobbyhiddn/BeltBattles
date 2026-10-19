// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E8; step 8): THE BOTS' WORDS. The par player values each offered word on every legal piece by the
// change in that piece's route damage (the deck rating, src/sim/harness/enchantBot.ts) and buys the best pair when its gain for the gold beats
// the threshold it holds a part to; a merge keeps the higher-valued word and no word is replaced by a lower-valued one; the casual player buys
// by its own seeded rule; LAST CHANCE's part keeps its word; GROWING grows in the harness's runs; every authored deck stays legal; the three
// generators' codecs carry `~<code>`; and with ENCHANT off every bot is what it was. HOLDING (words held by day 4 and 10, by source) prints
// with BB_HOLDING=1 (it plays 240 runs; it asserts nothing).
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rng } from "../src/core/rng";
import { ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { cloneBuild, rigHits, turretList, type Build } from "../src/sim/deck";
import { placeRigAt } from "../src/sim/beltside";
import { heroRefBuild, heroStartBuild } from "../src/sim/heroBuilds";
import { ENCHANT, ENCHANT_IDS, ENCHANT_NUM, enchantProblem, mergeWord, setEnchant, withEnchant } from "../src/sim/enchant";
import { lastChanceWord, maxEnchantsByDay } from "../src/sim/enchantSources";
import { lastChanceOffer } from "../src/sim/lastChance";
import { RIVAL_IDS, rivalBuild } from "../src/sim/rivals";
import { encodeStarred as loaderEncode, decodeStarred as loaderDecode } from "../src/sim/standInPool";
import { decodeStarred, encodeStarred } from "../src/sim/harness/standinCode";
import { decodeStandInCode, standInCodeOf } from "../src/sim/harness/standins";
import { fuseDeck } from "../src/sim/harness/merge";
import { CASUAL_TUNES, casualOpts, casualRun } from "../src/sim/harness/casual";
import { botLastChancePick } from "../src/sim/harness/lastChance";
import { Shopper } from "../src/sim/harness/shopper";
import { parRunSeed, playerRoadLog, playerRun, rateOn, type PlayerDay } from "../src/sim/harness/player";
import {
  CASUAL_WORD_RATE, WORD_PRIOR, bestWordFor, botWarlordPick, casualWarlordPick, chooser, chooserFor, modelOf, piecesOf, rankWords, stunsPerFight, wordCount,
  wordValue, wordsHeld,
} from "../src/sim/harness/enchantBot";
import { RATING_CURVE, firedShare } from "../src/sim/deckRating";
import { newRun, type Run } from "../src/game/run";
import { gainModule } from "../src/game/fuse";
import { finishDay } from "../src/game/day";
import { openWarlordPick, pendingEnchantPick } from "../src/game/enchanter";
import { validateBuild, validateUpload } from "../src/net/validate";
import { decodeSnapshot, encodeSnapshot, SNAPSHOT_V3 } from "../src/net/snapshot";
import { floorRecord } from "../src/net/records";
import { seedGhost } from "../tools/samplePool";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1 (run 3): these sweeps play many seeded runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

// ---------------------------------------------------------------- fixtures

/** A hero's start deck with `n` WHETSTONEs beside its belts (the harness's own spots: Shopper.rigSpot), uids from 200. */
function withRigs(hero: HeroId, n: number, day = 5, factory?: number): Build {
  const b = heroStartBuild(hero, 1);
  if (factory) b.upgrades = { factory, turret: 1 };
  const s = new Shopper(b, 999, day, new Rng(1), "on", 3, "on", "on");
  let put = 0;
  for (const [ri, ti] of s.rigTiles()) {
    if (put >= n) break;
    const sp = s.rigSpot("whetstone", ri, ti);
    if (sp) placeRigAt(b, 200 + put++, "whetstone", sp);
  }
  return b;
}

const top = (b: Build, word: string, day = 5) => bestWordFor({ build: b, day }, word);
const isItem = (t: { kind: string } | undefined, uid: number): boolean => !!t && t.kind === "item" && (t as unknown as { uid: number }).uid === uid;

// ---------------------------------------------------------------- the valuation: PIECES-1 4.8's rules of thumb
// (ENCHANT-1b, N1: MASSIVE is a turret's word and SWIFT a factory's, so the rules of thumb read: MASSIVE on a turret whose gun queues; SWIFT on a
// factory whose belt carries 2 or more stat rigs and whose gun has spare rate. A word is never valued, or offered, on the kind it does not go on.)

describe("ENCHANT-1 E8: the valuation reproduces the rules of thumb", () => {
  it("FIERY, RISING and GROWING go on the piece with the most slugs or shots: a LOOM's three belts beat each gun's one", () => {
    on(() => {
      const b = heroStartBuild("weaver", 1); // the LOOM (uid 1) feeds three dart guns, a third of its slugs each
      for (const w of ["fiery", "rising", "growing"]) {
        const best = top(b, w);
        expect(best, w).not.toBeNull();
        expect(isItem(best!.target, 1), `${w} -> ${JSON.stringify(best!.target)}`).toBe(true);
        const rank = rankWords({ build: b, day: 5 }, w);
        expect(rank[0].value, w).toBeGreaterThan(2 * rank[1].value); // three times the slugs: the next piece (a gun) is worth about a third
      }
    });
  });

  it("an unfed gun gets nothing: the word goes where the payloads are", () => {
    on(() => {
      const b = heroStartBuild("foundry", 1); // the CRUCIBLE's two belts end in carronade 0; carronade 1 is fed by none
      for (const w of ["fiery", "rising", "echoing"]) {
        const rank = rankWords({ build: b, day: 5 }, w);
        const slot1 = rank.find((s) => s.target.kind === "turret" && s.target.slot === 1)!;
        expect(slot1.value, w).toBe(0);
        expect(rank[0].value, w).toBeGreaterThan(0.1);
      }
    });
  });

  it("MASSIVE goes on a turret whose belts bring more slugs than it can fire, and is worth more the deeper the queue", () => {
    on(() => {
      // ENCHANT-1b (N1): MASSIVE is a turret's word (the factory branch is gone). The valuation halves the gun's rate and gives each shot
      // massiveShare x the DMG; a gun fed past its rate jams (firedShare falls with the load), so the half rate loses the less, the deeper the queue.
      const worth = (lvl: number): { gun: number; load: number; rule: number } => {
        const b = heroStartBuild("furnace", 1);
        b.upgrades = { factory: lvl, turret: 1 }; // a faster KILN into the same SCRAP CANNON: the arrival passes the gun's rate
        const t = modelOf(b, 5).turrets.get(0)!;
        const fired = (cap: number): number => Math.min(t.A, cap) * firedShare(t.A / cap, t.noJam, RATING_CURVE); // what the gun fires a second at that rate
        return {
          gun: rankWords({ build: b, day: 5 }, "massive").find((s) => s.target.kind === "turret")?.value ?? 0,
          load: t.A / t.cap,
          rule: (ENCHANT_NUM.massiveShare * fired(t.cap / 2)) / fired(t.cap) - 1, // the one gun is the whole offense: half the rate, massiveShare x a shot
        };
      };
      const l2 = worth(2), l3 = worth(3), l4 = worth(4);
      expect(l3.load).toBeGreaterThan(1); // the belts bring more slugs than the gun can fire ...
      expect(l4.load).toBeGreaterThan(l3.load); // ... and at level 4 more still
      expect(l4.gun).toBeGreaterThan(l3.gun); // the deeper queue is worth more
      expect(l3.gun).toBeGreaterThan(l2.gun); // and a gun just at its rate (load 1) gains less than one that queues
      for (const l of [l2, l3, l4]) expect(l.gun).toBeCloseTo(l.rule, 9);
      const b = heroStartBuild("furnace", 1);
      b.upgrades = { factory: 3, turret: 1 };
      expect(rankWords({ build: b, day: 5 }, "massive").map((s) => s.target)).toEqual([{ kind: "turret", slot: 0 }]); // the one place MASSIVE can go on this deck: the gun
      if (ENCHANT_NUM.massiveShare >= 3) { // at the shipped 3x the double shot more than pays for the half rate on a gun that queues (at 2x it does not here: only the order above holds)
        expect(l3.gun).toBeGreaterThan(0.1);
        expect(top(b, "massive")!.target).toEqual({ kind: "turret", slot: 0 }); // so the bots would put it there
      }
    });
  });

  it("MASSIVE's value on a turret follows ENCHANT_NUM.massiveShare (run 4: the valuation priced the old 2x after the number moved to 3)", () => {
    on(() => {
      for (const factory of [1, 3]) { // the plain start deck, and a gun that queues
        const b = heroStartBuild("furnace", 1);
        b.upgrades = { factory, turret: 1 };
        const gun = (): number => rankWords({ build: b, day: 5 }, "massive").find((s) => s.target.kind === "turret")?.value ?? 0;
        const was = ENCHANT_NUM.massiveShare;
        try {
          ENCHANT_NUM.massiveShare = 2;
          const two = gun();
          ENCHANT_NUM.massiveShare = 4;
          const four = gun();
          ENCHANT_NUM.massiveShare = 3;
          const three = gun();
          expect(three, `factory level ${factory}`).toBeGreaterThan(two);
          expect(four, `factory level ${factory}`).toBeGreaterThan(three);
          // the one gun is the whole offense, so its gain is massiveShare x (what it fires at half the rate / what it fires) - 1: 1 + value goes with the share
          expect((1 + three) / (1 + two), `factory level ${factory}`).toBeCloseTo(3 / 2, 9);
          expect((1 + four) / (1 + three), `factory level ${factory}`).toBeCloseTo(4 / 3, 9);
        } finally {
          ENCHANT_NUM.massiveShare = was;
        }
      }
    });
  });

  it("ENCHANT-1b (N1): MASSIVE is offered turrets only and SWIFT factories only: rankWords and bestWordFor never list a rig or the other kind, and value it at nothing", () => {
    on(() => {
      let listed = 0;
      for (const hero of HEROES4) {
        for (const [b, day] of [[heroStartBuild(hero, 1), 5], [withRigs(hero, 3), 5], [withRigs(hero, 4, 8, 3), 8]] as const) { // the start deck, rigs added, a later deck with a faster factory
          for (const [word, home] of [["massive", "turret"], ["swift", "factory"]] as const) {
            const at = `${hero} day ${day} ${word}`;
            const rank = rankWords({ build: b, day }, word);
            expect(rank.length, at).toBeGreaterThan(0);
            for (const s of rank) {
              expect(ITEMS[s.def].kind, `${at} -> ${s.def}`).toBe(home);
              listed++;
            }
            const best = bestWordFor({ build: b, day }, word);
            if (best) expect(ITEMS[best.def].kind, `${at} best -> ${best.def}`).toBe(home);
            // a piece of any other kind is worth nothing for it, listed or not
            for (const p of piecesOf(b)) if (p.kind !== home) expect(wordValue(b, day, p.target, word), `${at} on a ${p.kind}`).toBe(0);
          }
        }
      }
      expect(listed).toBeGreaterThan(20);
    });
  });

  it("BRACED's stun estimate is run 3's named guess (1 + 0.4 a day), kept on purpose: run 4 measured 0.86 a day landing on a rig, factory or turret (tools/enchant1/stuns.ts) and the static rating overvalues a stun, so the guess is the less wrong pair", () => {
    expect(stunsPerFight(5)).toBeCloseTo(3, 6);
    expect(stunsPerFight(10)).toBeCloseTo(5, 6);
  });

  it("SWIFT goes on a factory whose belt carries two or more stat rigs and whose gun has spare rate", () => {
    on(() => {
      const rigs = withRigs("weaver", 4); // four WHETSTONEs on the LOOM's belts; the dart guns fire a third of what they could
      const best = top(rigs, "swift");
      expect(best).not.toBeNull();
      expect(isItem(best!.target, 1)).toBe(true);
      expect(best!.value).toBeGreaterThan(0.2);
      expect(top(heroStartBuild("weaver", 1), "swift")).toBeNull(); // no stat rig: twice the slugs at half the DMG gains nothing
      expect(top(withRigs("furnace", 4), "swift")).toBeNull(); // the gun has no spare rate: twice the slugs only queue
    });
  });

  it("WIDE goes on a rig whose free side faces another belt tile, and the added arrow really hits it", () => {
    on(() => {
      const b = withRigs("weaver", 4);
      const best = top(b, "wide");
      expect(best).not.toBeNull();
      expect(best!.target.kind).toBe("item");
      expect(best!.dir).toBeDefined();
      const uid = (best!.target as { uid: number }).uid;
      const hitsOf = (x: Build): number => rigHits(x).reduce((n, r) => n + r.reduce((m, t) => m + t.filter((h) => h.uid === uid).length, 0), 0);
      const after = cloneBuild(b);
      Object.assign(after.items.find((p) => p.uid === uid)!, { ench: "wide", enchDir: best!.dir });
      expect(hitsOf(after)).toBe(hitsOf(b) + 1); // the game's own arrow reads the word: one more hit
      const others = rankWords({ build: b, day: 5 }, "wide").filter((s) => s.target.kind === "item" && s.target.uid !== uid);
      for (const s of others) expect(s.value).toBeLessThan(best!.value); // a rig whose free sides face nothing gains nothing
      expect(wordValue(b, 5, best!.target, "wide")).toBeCloseTo(best!.value, 9);
    });
  });

  it("WIDE goes on a turret with gear waiting in cargo, and on no turret without it", () => {
    on(() => {
      const gear = Object.values(ITEMS).filter((d) => d.kind === "mod" && d.merchant).map((d) => d.id);
      let found: { held: string; spare: string; value: number } | undefined;
      for (const held of gear) {
        const b = heroStartBuild("weaver", 1); // dart guns with ONE gear slot each
        b.mods.push({ uid: 300, def: held, turret: 0 });
        for (const spare of gear) {
          if (spare === held) continue;
          const s = bestWordFor({ build: b, day: 5, inventory: [{ uid: 301, def: spare }], nextUid: 400 }, "wide");
          if (s && s.target.kind === "turret" && s.target.slot === 0 && s.value > 0) { found = { held, spare, value: s.value }; break; }
        }
        if (found) break;
      }
      expect(found, "some gear pair should rate a gain in a second gear slot").toBeDefined();
      const b = heroStartBuild("weaver", 1);
      b.mods.push({ uid: 300, def: found!.held, turret: 0 });
      const none = rankWords({ build: b, day: 5 }, "wide").filter((s) => s.target.kind === "turret");
      for (const s of none) expect(s.value).toBe(0); // nothing waits in cargo
    });
  });

  it("ECHOING is a third more on a gun; BRACED is small and worth the stun time it saves; GROWING is worth more the earlier it is bought", () => {
    on(() => {
      const b = withRigs("furnace", 4);
      const e = top(b, "echoing")!;
      expect(e.target.kind).toBe("turret");
      expect(e.value).toBeCloseTo(1 / ENCHANT_NUM.echoEvery, 6);
      const br = top(b, "braced")!;
      expect(br.value).toBeGreaterThan(0);
      expect(br.value).toBeLessThan(0.1);
      expect(br.value).toBeLessThan(top(b, "fiery")!.value / 3);
      expect(stunsPerFight(10)).toBeGreaterThan(stunsPerFight(1));
      const g3 = top(b, "growing", 3)!.value, g9 = top(b, "growing", 9)!.value;
      expect(g3).toBeGreaterThan(2 * g9);
      // the numbers come from ENCHANT_NUM through the stars: a ★3 piece is worth three FIERYs' BURN
      const star = cloneBuild(heroStartBuild("furnace", 1));
      star.upgrades = { factory: 3, turret: 1 };
      const plain = heroStartBuild("furnace", 1);
      expect(top(star, "fiery")!.value).toBeGreaterThan(top(plain, "fiery")!.value);
    });
  });

  it("the model is read-only: valuing words changes no deck, and the same deck gives the same numbers", () => {
    on(() => {
      const b = withRigs("weaver", 3);
      const was = JSON.stringify(b);
      const a = ENCHANT_IDS.map((w) => rankWords({ build: b, day: 6 }, w).map((s) => s.value));
      expect(JSON.stringify(b)).toBe(was);
      expect(ENCHANT_IDS.map((w) => rankWords({ build: b, day: 6 }, w).map((s) => s.value))).toEqual(a);
      expect(modelOf(b, 6).turrets.size).toBe(3);
    });
    expect(bestWordFor({ build: heroStartBuild("weaver", 1), day: 5 }, "fiery")).toBeNull(); // ENCHANT off: no word is worth anything
  });
});

// ---------------------------------------------------------------- a held word is replaced only for a higher-valued one

describe("ENCHANT-1 E8: never a lower-valued word over a held one", () => {
  it("a held FIERY is not replaced by BRACED; a held BRACED is replaced by FIERY, and the gain is net of what is lost", () => {
    on(() => {
      const b = withRigs("weaver", 2);
      const loom = b.items.find((p) => p.def === "loom")!;
      loom.ench = "fiery";
      const brace = bestWordFor({ build: b, day: 5 }, "braced");
      expect(brace === null || !isItem(brace.target, loom.uid)).toBe(true); // the loom keeps FIERY
      const rising = rankWords({ build: b, day: 5 }, "rising").find((s) => isItem(s.target, loom.uid))!;
      expect(rising.replaces).toBe("fiery");
      expect(Number.isFinite(rising.value)).toBe(true); // RISING minus FIERY there (net of what is lost), whatever the sign
      loom.ench = "braced";
      const fiery = bestWordFor({ build: b, day: 5 }, "fiery")!;
      expect(isItem(fiery.target, loom.uid)).toBe(true);
      expect(fiery.replaces).toBe("braced");
      const bare = cloneBuild(b);
      delete bare.items.find((p) => p.def === "loom")!.ench;
      expect(fiery.value).toBeCloseTo(wordValue(bare, 5, { kind: "item", uid: loom.uid }, "fiery") - wordValue(bare, 5, { kind: "item", uid: loom.uid }, "braced"), 9);
      // the same word again is no candidate at all
      loom.ench = "fiery";
      expect(rankWords({ build: b, day: 5 }, "fiery").some((s) => isItem(s.target, loom.uid))).toBe(false);
    });
  });

  it("in par runs, every word that replaced another gained over it, and no word was bought for nothing", () => {
    on(() => {
      let buys = 0, replaced = 0;
      for (const [hero, seed] of [["furnace", 2], ["weaver", 1], ["foundry", 2], ["bastion", 4]] as const) {
        for (const d of playerRun(hero, 10, seed)) {
          for (const b of d.buys) {
            if (!b.word) continue;
            buys++;
            expect(b.word.value, `${hero} ${seed} day ${d.day}`).toBeGreaterThan(0);
            if (b.word.replaced) replaced++;
          }
        }
      }
      expect(buys).toBeGreaterThan(8);
      expect(replaced).toBeGreaterThanOrEqual(0);
    });
  });
});

// ---------------------------------------------------------------- merges keep the higher-valued word

describe("ENCHANT-1 E8: a merge keeps the higher-valued word", () => {
  it("the blind chooser follows the prior (the damage words over BRACED), keeps the survivor's on a tie, and is symmetric", () => {
    const f = { ench: "fiery" }, b = { ench: "braced" }, r = { ench: "rising" };
    expect(chooser({ def: "whetstone", stars: 2, a: b, b: f })).toEqual(f);
    expect(chooser({ def: "whetstone", stars: 2, a: f, b })).toEqual(f);
    expect(chooser({ def: "whetstone", stars: 2, a: f, b: f })).toEqual(f);
    expect(mergeWord({ ench: "growing", grow: 1 }, { ench: "growing", grow: 6 }, chooser as never).kept).toEqual({ ench: "growing", grow: 6 }); // the same word: mergeWord keeps the higher counter itself, the chooser is not asked
    expect(chooser({ def: "scrapcannon", stars: 3, a: r, b: { ench: "growing", grow: 4 } })).toEqual({ ench: "growing", grow: 4 });
    for (const kind of Object.keys(WORD_PRIOR) as (keyof typeof WORD_PRIOR)[]) for (const w of ENCHANT_IDS) expect(WORD_PRIOR[kind][w]).toBeGreaterThanOrEqual(0);
    // the words a kind cannot take are worth nothing there (ENCHANT-1b N1: MASSIVE on a rig or a factory, SWIFT on a rig or a turret) ...
    expect([WORD_PRIOR.rig.massive, WORD_PRIOR.factory.massive, WORD_PRIOR.rig.swift, WORD_PRIOR.turret.swift]).toEqual([0, 0, 0, 0]);
    // ... and the kind each does go on is worth something
    expect(WORD_PRIOR.turret.massive).toBeGreaterThan(0);
    expect(WORD_PRIOR.factory.swift).toBeGreaterThan(0);
  });

  it("the deck-aware chooser keeps the word that does more where the survivor stands, whichever copy held it", () => {
    on(() => {
      for (const survivorHolds of ["braced", "fiery"] as const) {
        const run = newRun("furnace", 5);
        run.day = 5;
        run.gold = 0;
        const s = new Shopper(run.build, 999, 5, new Rng(1), "on", 3, "on", "on");
        const [ri, ti] = s.rigTiles()[0];
        placeRigAt(run.build, 200, "whetstone", s.rigSpot("whetstone", ri, ti)!);
        const incoming = survivorHolds === "braced" ? "fiery" : "braced";
        run.build.items.find((p) => p.uid === 200)!.ench = survivorHolds;
        const g = gainModule(run, "whetstone", undefined, 1, { word: { ench: incoming }, choose: chooserFor(run) });
        expect(g.survivor).toBe(200);
        expect(run.build.items.find((p) => p.uid === 200)).toMatchObject({ stars: 2, ench: "fiery" }); // FIERY's burn beats BRACED's stun time on a working rig
        expect(run.enchMerge?.lost.ench).toBe("braced");
      }
    });
  });

  it("harness/merge.ts: fuseDeck and gainInto take the chooser (ENCHANT on: the bots' by default; an explicit one wins)", () => {
    on(() => {
      const b = heroStartBuild("furnace", 1);
      b.items.push({ uid: 5, def: "whetstone", x: 1, y: 7, ench: "braced" }, { uid: 6, def: "whetstone", x: 1, y: 8, ench: "rising" });
      const kept = fuseDeck(b);
      expect(kept.steps).toHaveLength(1);
      expect(kept.build.items.find((p) => p.def === "whetstone")).toMatchObject({ stars: 2, ench: "rising" }); // the prior: RISING over BRACED
      const forced = fuseDeck(b, ({ a, b: other }) => (a.ench === "braced" ? a : other));
      expect(forced.build.items.find((p) => p.def === "whetstone")?.ench).toBe("braced");
    });
    const b = heroStartBuild("furnace", 1);
    b.items.push({ uid: 5, def: "whetstone", x: 1, y: 7 }, { uid: 6, def: "whetstone", x: 1, y: 8 });
    expect(fuseDeck(b).build.items.find((p) => p.def === "whetstone")).toEqual({ uid: 5, def: "whetstone", x: 1, y: 7, stars: 2 }); // off: as before
  });
});

// ---------------------------------------------------------------- the par player's purchases

const HEROES4: readonly HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const uploadOk = (hero: HeroId, seed: number, days: readonly PlayerDay[]): string[] =>
  days.flatMap((d) => {
    const r = validateUpload(d.build, d.day, RULES_VERSION, { seed: parRunSeed(hero, seed) >>> 0, road: playerRoadLog(days, d.day) });
    return r.ok ? [] : r.errors.map((e) => `${hero} ${seed} day ${d.day}: ${e}`);
  });

describe("ENCHANT-1 E8: the par player's words (seeded runs to day 10)", () => {
  it("every day's deck stays legal, holds words, within the day's bound, and the ENCHANTER's gold is counted", () => {
    on(() => {
      let held10 = 0, runs = 0, problems: string[] = [];
      for (const [hero, seed] of [["furnace", 1], ["furnace", 2], ["weaver", 1], ["weaver", 3], ["foundry", 2], ["bastion", 1]] as const) {
        const days = playerRun(hero, 10, seed);
        problems = problems.concat(uploadOk(hero, seed, days));
        for (const d of days) {
          for (const w of wordsHeld(d.build)) expect(enchantProblem(w.def, w.word), `${hero} ${seed} day ${d.day}`).toBeNull();
          expect(wordCount(d.build)).toBeLessThanOrEqual(maxEnchantsByDay(d.day, false));
          const paid = days.slice(0, d.day).reduce((n, x) => n + x.buys.filter((b) => b.word).reduce((m, b) => m + b.price, 0), 0);
          expect(d.wordGold ?? 0, `${hero} ${seed} day ${d.day}`).toBe(paid);
        }
        held10 += wordCount(days[9].build);
        runs++;
      }
      expect(problems).toEqual([]);
      expect(held10 / runs).toBeGreaterThan(1.5); // par buys words
    });
  });

  it("it buys only when the gain beats its threshold: with the threshold out of reach (minRel 50) no word is bought", () => {
    on(() => {
      const count = (tune?: { minRel: number }) => [1, 2].reduce((n, seed) => n + playerRun("weaver", 10, seed, tune ? { tune } : {}).reduce((m, d) => m + d.buys.filter((b) => b.word).length, 0), 0);
      expect(count()).toBeGreaterThan(0);
      expect(count({ minRel: 50 })).toBe(0);
      // and every word it did buy gained more than minRel (0.004) for its price (the gain per gold is what picked it)
      for (const d of playerRun("weaver", 10, 1)) for (const b of d.buys) if (b.word) expect(b.word.value).toBeGreaterThan(0.004);
    });
  });

  it("the run is deterministic, and GROWING grows once per dusk: grow = the dusks since the word was bought, all run", () => {
    on(() => {
      expect(playerRun("weaver", 10, 1).map((d) => JSON.stringify(d.build))).toEqual(playerRun("weaver", 10, 1).map((d) => JSON.stringify(d.build)));
      let checked = 0;
      for (const hero of HEROES4) {
        for (let seed = 1; seed <= 5; seed++) {
          const days = playerRun(hero, 10, seed);
          for (const d of days) for (const b of d.buys) {
            if (b.word?.id !== "growing") continue;
            // the word sits on that piece from day d.day; the build of day D has met the dusks d.day .. D - 1 (growPieces after each),
            // so its counter is D - d.day (absent at 0), unless the piece merged since (the higher counter) or lost its word
            const isTurret = ITEMS[b.word.on].kind === "turret";
            const find = (build: Build) => (isTurret ? (build.turrets ?? []).find((t) => t.slot === b.word!.slot) : build.items.find((p) => p.uid === b.word!.slot));
            const stars0 = find(d.build)?.stars;
            for (const later of days.filter((x) => x.day > d.day)) {
              const p = find(later.build);
              if (!p || p.ench !== "growing" || p.def !== b.word.on || p.stars !== stars0) continue;
              expect(p.grow ?? 0, `${hero} ${seed} day ${later.day} (bought day ${d.day})`).toBe(later.day - d.day);
              checked++;
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(3);
    });
    on(() => { // and exactly, on one piece: finishDay (the harness's nextDawn) grows it by 1 a dusk, from the day it was applied
      const run = newRun("furnace", 9);
      run.day = 4;
      const t = turretList(run.build)[0];
      run.build.turrets = turretList(run.build).map((x) => (x.uid === t.uid ? { ...x, ench: "growing" } : x));
      for (let i = 1; i <= 3; i++) {
        finishDay(run, 0, 20, { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 }, { shots: 0, damage: 0, firstShot: 0, idle: 0, turretTime: 0, maxQueue: 0, jams: 0, disrupted: 0, windTaken: 0, burnDealt: 0, payloadSum: 0, produced: 0, stalled: 0 });
        expect(turretList(run.build).find((x) => x.uid === t.uid)!.grow).toBe(i);
      }
    });
  }, 180_000);
});

// ---------------------------------------------------------------- the casual player, the warlord pick, LAST CHANCE

describe("ENCHANT-1 E8: the casual player, the warlord pick and LAST CHANCE", () => {
  it("the casual player buys by its own coin (CASUAL_WORD_RATE) on a seeded legal piece with no word, reads no rating, and is deterministic", () => {
    on(() => {
      let bought = 0, offered = 0;
      for (const hero of HEROES4) {
        for (let seed = 1; seed <= 6; seed++) {
          const days = casualRun(hero, 10, seed);
          expect(casualRun(hero, 10, seed).map((d) => JSON.stringify(d.build))).toEqual(days.map((d) => JSON.stringify(d.build)));
          for (const d of days) {
            for (const b of d.buys) if (b.word) {
              bought++;
              expect(b.why).toBe("word");
              expect(b.word.value).toBe(0); // no rating was read
              expect(b.word.replaced).toBeUndefined(); // and it never replaces a word
            }
            for (const w of wordsHeld(d.build)) expect(enchantProblem(w.def, w.word)).toBeNull();
          }
          offered += 4;
          // the words are legal and counted; the deck's belts are the casual player's own business (a turret merge can orphan a belt with ENCHANT
          // off too: furnace seed 4 does it on day 5), so only the lines about enchantments are held to nothing
          expect(uploadOk(hero, seed, days).filter((e) => /enchant|ench|word|gold|budget/i.test(e))).toEqual([]);
        }
      }
      expect(bought).toBeGreaterThan(8);
      expect(bought).toBeLessThan(offered * 4); // not every offer: the coin is CASUAL_WORD_RATE
      expect(casualOpts("c5").tune?.wordBuy).toBe(CASUAL_WORD_RATE);
    });
    expect(casualOpts("c5").tune).toEqual(CASUAL_TUNES.c5); // off: the knobs exactly as before, no word knob
  }, 180_000);

  it("a warlord pick: the par player takes the word that gains most on its best piece for nothing, or says NO THANKS when none gains", () => {
    on(() => {
      const open = (run: Run, words: [string, string]): void => { run.enchPick = { day: 5, no: 1, words }; };
      const run = newRun("weaver", 5);
      run.day = 5;
      run.gold = 7;
      open(run, ["braced", "fiery"]);
      const took = botWarlordPick(run);
      expect(took).not.toBe("skipped");
      expect(took && took !== "skipped" ? took.took : "").toBe("fiery");
      expect(run.enchPick).toBeUndefined();
      expect(run.gold).toBe(7); // free
      expect(wordCount(run.build)).toBe(1);
      const none = newRun("furnace", 5);
      none.day = 5;
      open(none, ["swift", "wide"]); // a SCRAP CANNON has no spare rate for twice the slugs, and nothing waits for a WIDE slot: neither gains anywhere
      expect(botWarlordPick(none)).toBe("skipped");
      expect(pendingEnchantPick(none)).toBeNull();
      expect(wordCount(none.build)).toBe(0);
      expect(botWarlordPick(none)).toBeNull(); // nothing open
      // the casual pick: a seeded word on a seeded legal piece, never reading a rating; the same seed picks the same
      const c1 = newRun("furnace", 5), c2 = newRun("furnace", 5);
      for (const c of [c1, c2]) { c.day = 5; open(c, ["rising", "growing"]); }
      expect(casualWarlordPick(c1, new Rng(3))).toBe(true);
      expect(casualWarlordPick(c2, new Rng(3))).toBe(true);
      expect(JSON.stringify(c1.build)).toBe(JSON.stringify(c2.build));
      expect(wordCount(c1.build)).toBe(1);
      expect(c1.enchPick).toBeUndefined();
    });
  });

  it("ENCHANT-1b (N1): the casual pick puts MASSIVE on a turret and SWIFT on a factory, whichever way its coin falls, and never on the other kind", () => {
    on(() => {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 16; seed++) {
        const run = newRun("furnace", 5);
        run.day = 5;
        run.enchPick = { day: 5, no: 1, words: ["massive", "swift"] };
        expect(casualWarlordPick(run, new Rng(seed)), `seed ${seed}`).toBe(true); // a legal piece always stands (the gun for MASSIVE, the KILN for SWIFT): the pick is never lost to an illegal one
        const held = wordsHeld(run.build);
        expect(held, `seed ${seed}`).toHaveLength(1);
        expect(enchantProblem(held[0].def, held[0].word), `seed ${seed}`).toBeNull();
        seen.add(`${held[0].word}@${held[0].def}`);
      }
      expect([...seen].sort()).toEqual(["massive@scrapcannon", "swift@kiln"]);
    });
  });

  it("a Hard-tier win opens the pick the bots answer (road.ts openWarlordPick), and a Medium win opens none", () => {
    on(() => {
      const run = newRun("furnace", 5);
      run.day = 6;
      openWarlordPick(run, { tier: "medium", id: "ironclad", day: 6 }, true);
      expect(run.enchPick).toBeUndefined();
      openWarlordPick(run, { tier: "hard", id: "ironclad", day: 6 }, true);
      expect(pendingEnchantPick(run)).not.toBeNull();
      expect(botWarlordPick(run)).not.toBeNull();
      expect(pendingEnchantPick(run)).toBeNull();
    });
  });

  it("LAST CHANCE's part arrives with its word and the harness run keeps it; the bot's pick counts the word in the part's rating", () => {
    on(() => {
      let kept = 0, rated = 0, tried = 0;
      for (const hero of ["furnace", "weaver", "foundry"] as const) {
        for (let seed = 1; seed <= 10 && kept < 2; seed++) {
          const run = newRun(hero, parRunSeed(hero, seed));
          const part = lastChanceOffer(run.seed, 3, hero, [], true).part;
          const word = part ? lastChanceWord(run.seed, 3, part) : null;
          if (!part || !word) continue;
          tried++;
          const days = playerRun(hero, 4, seed, { lastChance: { day: 3, boon: "part" } });
          const held = [...days[3].build.items, ...(days[3].build.turrets ?? [])].filter((p) => p.def === part);
          if (!held.length) continue; // the part found no spot (it waits in cargo)
          if (held.some((p) => p.ench === word.ench)) kept++;
          else expect(held.some((p) => p.ench !== undefined), `${hero} ${seed}: the part's word must not vanish`).toBe(true); // merged into a twin holding another word
        }
      }
      expect(tried).toBeGreaterThan(0);
      expect(kept).toBeGreaterThan(0);
      // the rating: the same offer on the same board, with the word and without
      for (const hero of ["furnace", "weaver", "foundry"] as const) {
        for (let seed = 1; seed <= 8 && rated < 2; seed++) {
          const board = playerRun(hero, 3, seed)[2].build, run = newRun(hero, parRunSeed(hero, seed));
          const offer = lastChanceOffer(run.seed, 3, hero, (board.runes ?? []).map((q) => q.id), true);
          if (!offer.part || !lastChanceWord(run.seed, 3, offer.part)) continue;
          const withWord = botLastChancePick(offer, hero, board, 3).rating.part;
          const without = withEnchant(() => botLastChancePick(offer, hero, board, 3).rating.part, false);
          if (withWord !== without) rated++;
        }
      }
      expect(rated).toBeGreaterThan(0);
    });
  }, 180_000);
});

// ---------------------------------------------------------------- authored decks and the generators' codecs

describe("ENCHANT-1 E8: authored decks stay legal; the generators carry `~<code>`", () => {
  it("captains' and warlords' decks, the heroes' start and reference decks: no word, and the same verdict with ENCHANT on as off", () => {
    const decks: { name: string; day: number; build: Build }[] = [];
    for (const id of RIVAL_IDS) for (const day of [1, 3, 5, 8, 10]) decks.push({ name: id, day, build: rivalBuild(id, day) });
    for (const h of HEROES4) for (const day of [1, 4, 7, 10]) decks.push({ name: `${h} ref`, day, build: heroRefBuild(h, day) }, { name: `${h} start`, day, build: heroStartBuild(h, day) });
    const off = decks.map((d) => validateBuild(d.build, d.day, "strict").errors);
    on(() => {
      decks.forEach((d, i) => {
        expect([...d.build.items, ...(d.build.turrets ?? [])].some((p) => p.ench !== undefined || p.grow !== undefined), `${d.name} day ${d.day}`).toBe(false);
        expect(validateBuild(d.build, d.day, "strict").errors, `${d.name} day ${d.day}`).toEqual(off[i]);
      });
    });
  });

  it("a deck with words round-trips through the stand-in codecs (the loader's, the harness's and the generator's standins.ts)", () => {
    on(() => {
      let withTilde = 0;
      for (const [hero, seed] of [["furnace", 2], ["weaver", 1], ["foundry", 2], ["bastion", 4], ["furnace", 3]] as const) {
        const b = playerRun(hero, 10, seed)[9].build;
        const words = wordsHeld(b);
        expect(words.length).toBeGreaterThan(0);
        for (const code of [encodeStarred(b), loaderEncode(b), standInCodeOf(b, "on")]) {
          expect(code).toContain("~");
          withTilde++;
          const back = hero === "furnace" || true ? decodeStarred(hero, code) : b;
          expect(wordsHeld(back).map((w) => `${w.word}@${w.def}:${w.grow}`).sort()).toEqual(words.map((w) => `${w.word}@${w.def}:${w.grow}`).sort());
          expect(encodeStarred(back)).toBe(code); // and the code is a fixed point
          expect(loaderEncode(loaderDecode(hero, code))).toBe(loaderEncode(b));
          expect(encodeStarred(decodeStandInCode(hero, code, "on"))).toBe(code);
        }
      }
      expect(withTilde).toBe(15);
    });
    // a deck without words encodes without a tilde, as it always did
    expect(encodeStarred(heroStartBuild("furnace", 1))).not.toContain("~");
  });

  it("a seed ghost with words and a GROWING counter passes the generator's checks, travels as v3, and its snapshot round-trips", () => {
    on(() => {
      let grown = 0, ghosts = 0;
      for (const hero of HEROES4) {
        for (let seed = 1; seed <= 6; seed++) {
          const days = playerRun(hero, 10, seed);
          for (const d of days.filter((x) => x.day >= 5 && wordCount(x.build) > 0)) {
            const road = playerRoadLog(days, d.day);
            const snap = seedGhost(hero, d.day, 0, d.build, floorRecord(d.day), Date.UTC(2026, 9, 17), parRunSeed(hero, seed) >>> 0, road);
            ghosts++;
            const has = [...d.build.items, ...(d.build.turrets ?? [])].some((p) => p.grow !== undefined);
            if (has) { grown++; expect(snap.v).toBe(SNAPSHOT_V3); }
            expect(wordsHeld(snap.build).length).toBe(wordsHeld(d.build).length);
            expect(decodeSnapshot(encodeSnapshot(snap))).toEqual(snap);
            break;
          }
        }
      }
      expect(ghosts).toBeGreaterThan(10);
      expect(grown).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------- ENCHANT off: every bot is what it was

describe("ENCHANT-1 E8: with ENCHANT off every bot is what it was", () => {
  it("par and casual runs carry no word, no field, no ENCHANTER gold, and are the same twice and after an ENCHANT-on run", () => {
    const sig = (days: readonly PlayerDay[]): string => JSON.stringify(days);
    const before = HEROES4.map((h) => sig(playerRun(h, 10, 3))), cas = sig(casualRun("weaver", 10, 3));
    on(() => { for (const h of HEROES4) playerRun(h, 10, 3); casualRun("weaver", 10, 3); }); // the cache keeps the worlds apart ("|en")
    expect(HEROES4.map((h) => sig(playerRun(h, 10, 3)))).toEqual(before);
    expect(sig(casualRun("weaver", 10, 3))).toBe(cas);
    for (const s of [...before, cas]) {
      expect(s).not.toContain("\"ench\"");
      expect(s).not.toContain("wordGold");
      expect(s).not.toContain("\"word\"");
      expect(s).not.toContain("ench:");
    }
    expect(wordCount(playerRun("weaver", 10, 1)[9].build)).toBe(0);
    expect(rateOn(heroStartBuild("furnace", 1), 3)).toBeGreaterThan(0);
  });

  it("the ENCHANT-on world is its own: the same seed buys words, and its decks differ from the switch-off decks", () => {
    const off = JSON.stringify(playerRun("weaver", 10, 1).map((d) => d.build));
    const onRun = on(() => JSON.stringify(playerRun("weaver", 10, 1).map((d) => d.build)));
    expect(onRun).not.toBe(off);
    expect(onRun).toContain("\"ench\"");
  });
});

// ---------------------------------------------------------------- HOLDING (print only)

describe.skipIf(!process.env.BB_HOLDING)("ENCHANT-1 E8: HOLDING (a sanity read of par's words; E9c measures it)", () => {
  it("prints words held by day 4 and by day 10, the split by source and the gold, over seeds 1-60 and every hero", () => {
    on(() => {
      const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      const median = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
      const lines: string[] = ["HOLDING (par, ENCHANT on, seeds 1-60, the game's caravan and the Medium road): words held at dusk of day 4 / day 10, gold spent on words by day 10"];
      const all4: number[] = [], all10: number[] = [], gold: number[] = [];
      let enchanter = 0, runs = 0;
      for (const hero of HEROES4) {
        const h4: number[] = [], h10: number[] = [], g10: number[] = [];
        for (let seed = 1; seed <= 60; seed++) {
          const days = playerRun(hero, 10, seed);
          h4.push(wordCount(days[3].build));
          h10.push(wordCount(days[9].build));
          g10.push(days[9].wordGold ?? 0);
          enchanter += days.reduce((n, d) => n + d.buys.filter((b) => b.word).length, 0);
          runs++;
        }
        lines.push(`${hero.padEnd(8)} day 4: mean ${mean(h4).toFixed(2)} median ${median(h4)} | day 10: mean ${mean(h10).toFixed(2)} median ${median(h10)} | gold mean ${mean(g10).toFixed(1)}`);
        all4.push(...h4); all10.push(...h10); gold.push(...g10);
      }
      lines.push(`ALL      day 4: mean ${mean(all4).toFixed(2)} median ${median(all4)} | day 10: mean ${mean(all10).toFixed(2)} median ${median(all10)} | gold mean ${mean(gold).toFixed(1)}`);
      lines.push(`source: ENCHANTER ${(enchanter / runs).toFixed(2)} words bought a run; warlord pick 0 (par fights the Medium captain; a pick opens on a Hard win only); LAST CHANCE 0 (par pays a win every day and never fires one)`);
      // the same read for the casual player
      const c4: number[] = [], c10: number[] = [], cg: number[] = [];
      for (const hero of HEROES4) for (let seed = 1; seed <= 60; seed++) {
        const days = casualRun(hero, 10, seed);
        c4.push(wordCount(days[3].build)); c10.push(wordCount(days[9].build)); cg.push(days[9].wordGold ?? 0);
      }
      lines.push(`casual   day 4: mean ${mean(c4).toFixed(2)} median ${median(c4)} | day 10: mean ${mean(c10).toFixed(2)} median ${median(c10)} | gold mean ${mean(cg).toFixed(1)}`);
      console.log(lines.join("\n"));
    });
    expect(true).toBe(true);
  }, 3_600_000);
});
