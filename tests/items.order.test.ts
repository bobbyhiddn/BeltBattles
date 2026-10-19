// BUMP-1F P2 (F1 and Q5 of BUMP-1E's REPORT section 11; BRIEF-BUMP1F "THE WORLDS LEAVE ITEMS AS THEY FOUND IT"; PACKET-BUMP-0130 section 5's
// ITEMS-order test). THE RULE: after any world call returns (validateUpload, validate.ts's inRulesWorld and the four worlds nested in it, the
// server's warm-up nest, ghosts:admin's revalidate), ITEMS is deep-equal to what it was AND Object.keys(ITEMS) is identical AND ITEMS.quench is
// the def it was (KINDLING with the scaling switch on). The tests:
//  1. the old nests (the ladder fix switched off OUTSIDE the scaling switch's off call, the scaling switch innermost) were the damage: they
//     permuted ITEMS and put QUENCH TANK over KINDLING. They are fixed at the root now (ranked adds; the ladder fix's round trip), with no
//     guard around them; keepItems and the suite guard stay as defence in depth;
//  2. the packet's test: with every switch on, an older-rules record leaves ITEMS' keys as they were;
//  3. the SWEEP: every rules label from the oldest the server meets to bb-0.13.0 (and two it can't read), each world alone, the whole nest as
//     validateUpload and the server's warm-up build it, validateUpload on a real deck, ghosts:admin revalidate on stored records (the committed
//     seed pool's ghosts): keys, defs and ITEMS.quench identical after;
//  4. a seeded draw (a new run's shop) is the same before and after the sweep: the observable F1 broke (a SOFT-1 pick drawn from a permuted
//     ITEMS differed);
//  5. keepItems itself: puts ITEMS back after a throw, touches nothing when nothing moved.
// The suite guard (tests/setup/itemsGuard.ts) fails any test that leaves the keys or ITEMS.quench changed, so this file is also the guard's test.
import { describe, expect, it, vi } from "vitest";
import { ITEMS, RULES_VERSION } from "../src/sim/content";
import { SEED_POOL } from "../server/seedPoolData";
import { uploadProblems, type StoredRecord } from "../server/ghostAdmin";
import { encodeRecord } from "../server/store";
import { warmRoadCap } from "../server/warm";
import { checkSnapshot, ghostId } from "../src/net/snapshot";
import { withFreeJoins } from "../src/sim/freeJoins";
import { inEnchantWorld, inGatesWorld, inRulesWorld, inScaleWorld, inShapes2World, inShapesWorld, validateUpload } from "../src/net/validate";
import { itemsAre, keepItems, putItemsBack, snapshotItems } from "../src/sim/itemsKeep";
import { gatesRules, withGates } from "../src/sim/gates";
import { enchantRules } from "../src/sim/enchant";
import { scaleRules, withScaleRigs } from "../src/sim/scale";
import { shapesRules } from "../src/sim/shapes";
import { shapes2Rules, withShapes2 } from "../src/sim/shapes2";
import { plainRigsRules } from "../src/sim/plainRigs";
import { ladderFixRules, withLadderFix } from "../src/sim/ladderFix";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { newRun } from "../src/game/run";

/** Every rules label the server can meet, oldest first: the boundaries of each gate (rulesGate.ts) and a patch either side of the ones that switch
 *  a def in or out of ITEMS (NPC_DAY/SHAPES bb-0.10.0, SHAPES2 bb-0.11.0, SCALE bb-0.12.0, GATES bb-0.13.0), then two labels the parser can't read. */
const LABELS = [
  "bb-0.1.0", "bb-0.3.0", "bb-0.6.0", "bb-0.6.2", "bb-0.7.0", "bb-0.8.0", "bb-0.8.3", "bb-0.8.6", "bb-0.8.7", "bb-0.9.0", "bb-0.9.1", "bb-0.9.3", "bb-0.9.7",
  "bb-0.9.99", "bb-0.10.0", "bb-0.10.9", "bb-0.11.0", "bb-0.11.9", "bb-0.12.0", "bb-0.12.9", "bb-0.13.0", "bb-0.13.1", "junk", "",
];

const NEST = <T>(rules: string, fn: () => T): T =>
  inGatesWorld(rules, () => inRulesWorld(rules, () => inShapesWorld(rules, () => inShapes2World(rules, () => inScaleWorld(rules, () => inEnchantWorld(rules, () => withFreeJoins(fn)))))));

/** The state the rule is about, read now. */
const state = () => ({ snap: snapshotItems(), quench: ITEMS.quench, name: ITEMS.quench.name });
const same = (a: ReturnType<typeof state>, why: string): void => {
  expect(itemsAre(a.snap), `${why}: ITEMS' keys and defs`).toBe(true);
  expect(Object.keys(ITEMS), `${why}: Object.keys(ITEMS)`).toEqual(a.snap.keys);
  expect(ITEMS.quench, `${why}: ITEMS.quench`).toBe(a.quench);
};

describe("BUMP-1F F1 and Q5: every switch is on, so the sweep means something", () => {
  it("PLAIN_RIGS, SHAPES, SHAPES2, SCALE_RIGS, GATES, ENCHANT and LADDER_FIX are all on as the build ships them", () => {
    expect([plainRigsRules(), shapesRules(), shapes2Rules(), scaleRules(), gatesRules(), enchantRules(), ladderFixRules()]).toEqual([true, true, true, true, true, true, true]);
    expect(ITEMS.quench.name).toBe("KINDLING"); // the scaling switch's rework of QUENCH TANK (Q5)
    const keys = Object.keys(ITEMS);
    expect(keys.slice(-3)).toEqual(["fuser", "scattermill", "smelter"]); // ./scale loads before ./gates: SCALE's seven, then GATES' three
    expect(keys.slice(-10, -3)).toEqual(["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"]);
  });
});

describe("BUMP-1F F1: ITEMS' key order does not depend on which module loads first", () => {
  it("six load orders of the five switch modules give one order: the base's ids, PLAIN_RIGS' six, SHAPES' three, SHAPES2's six, SCALE's seven, GATES' three", async () => {
    const orders = [
      ["gates", "scale", "shapes2", "shapes", "plainRigs"], ["plainRigs", "shapes", "shapes2", "scale", "gates"], ["scale", "gates", "plainRigs", "shapes2", "shapes"],
      ["shapes2", "gates", "shapes", "scale", "plainRigs"], ["gates", "plainRigs", "scale", "shapes", "shapes2"], ["shapes", "plainRigs", "gates", "shapes2", "scale"],
    ];
    const seen: string[][] = [];
    for (const order of orders) {
      vi.resetModules();
      const content = await import("../src/sim/content");
      for (const m of order) await import(`../src/sim/${m}`);
      seen.push(Object.keys(content.ITEMS));
    }
    vi.resetModules();
    for (let i = 1; i < seen.length; i++) expect(seen[i], `load order ${orders[i].join(" > ")}`).toEqual(seen[0]);
    const keys = seen[0];
    const at = (id: string): number => keys.indexOf(id);
    expect(at("brandingiron")).toBeGreaterThan(-1);
    expect(at("brandingiron")).toBeLessThan(at("nailstrip")); // PLAIN_RIGS' six, then SHAPES' three
    expect(at("spikerail")).toBeLessThan(at("elbowguard")); // ... then SHAPES2's six
    expect(at("pickaxe")).toBeLessThan(at("cindermail")); // ... then SCALE's seven
    expect(at("trophychain")).toBeLessThan(at("fuser")); // ... then GATES' three, the last keys
    expect(keys.slice(-3)).toEqual(["fuser", "scattermill", "smelter"]);
  });
});

describe("BUMP-1F F1 and Q5: the old nests no longer damage ITEMS, at the root", () => {
  it("Q5 (F1's first face): the ladder fix off OUTSIDE the scaling switch's off call leaves KINDLING over QUENCH TANK (ladderFix.ts puts back the def it displaced)", () => {
    const was = state();
    withLadderFix(() => withScaleRigs(() => undefined, false), false); // inRulesWorld's old nest for rules before bb-0.10.0, WITHOUT keepItems
    expect(ITEMS.quench.name).toBe("KINDLING");
    same(was, "the raw old nest, no keepItems");
    withLadderFix(() => undefined, false); // the ladder alone, off and on again, the scaling switch staying on
    same(was, "the ladder fix alone, no keepItems");
  });

  it("F1's second face (the scaling switch innermost, SHAPES2 off outside it: the six came back behind the seven) is gone at the root: each switch adds its ids at their rank", () => {
    const was = state();
    withShapes2(() => withScaleRigs(() => undefined, false), false); // validateUpload's old nest for rules before bb-0.11.0, WITHOUT keepItems
    same(was, "the raw old nest, no keepItems");
    withScaleRigs(() => withGates(() => withShapes2(() => undefined, false), false), false); // and the reverse nest of three
    same(was, "the raw nest of three, no keepItems");
  });

  it("keepItems puts ITEMS back after the old nest, and after a throw", () => {
    const was = state();
    keepItems(() => withLadderFix(() => withScaleRigs(() => undefined, false), false));
    same(was, "keepItems around the old nest");
    expect(() => keepItems(() => withGates(() => { throw new Error("boom"); }, false))).toThrow("boom");
    same(was, "keepItems around a throw");
  });
});

describe("BUMP-1F F1 and Q5: the packet's ITEMS-order test", () => {
  it("with every switch on, Object.keys(ITEMS) is identical before and after validating an older-rules record", () => {
    const was = state();
    for (const rules of ["bb-0.9.0", "bb-0.10.0", "bb-0.11.0", "bb-0.12.0"]) {
      validateUpload(heroStartBuild("furnace"), 1, rules);
      same(was, `validateUpload under ${rules}`);
    }
  });
});

describe("BUMP-1F F1 and Q5: the sweep, every rules label", () => {
  it("each world alone, the whole nest (validateUpload's and the warm-up's), leaves keys, defs and ITEMS.quench as they were", () => {
    const was = state();
    for (const rules of LABELS) {
      for (const [name, world] of [
        ["inRulesWorld", inRulesWorld], ["inShapesWorld", inShapesWorld], ["inShapes2World", inShapes2World], ["inScaleWorld", inScaleWorld],
        ["inGatesWorld", inGatesWorld], ["inEnchantWorld", inEnchantWorld],
      ] as const) {
        world(rules, () => undefined);
        same(was, `${name}(${JSON.stringify(rules)})`);
      }
      NEST(rules, () => undefined);
      same(was, `the whole nest under ${JSON.stringify(rules)}`);
    }
  });

  it("the worlds change what the deck is judged in and still give it back: inside a nest under older rules the old pieces are on, after it the ship's", () => {
    const was = state();
    // bb-0.9.7: before the NPC day (the ladder fix off), SHAPES, SHAPES2, SCALE and GATES: the base's pieces; QUENCH TANK is the old def
    NEST("bb-0.9.7", () => {
      expect(gatesRules()).toBe(false);
      expect(scaleRules()).toBe(false);
      expect(Object.keys(ITEMS)).not.toContain("fuser");
      expect(Object.keys(ITEMS)).not.toContain("cindermail");
      expect(ITEMS.quench.name).toBe("QUENCH TANK");
    });
    same(was, "after bb-0.9.7");
    // bb-0.12.0: GATES is a world away (the three gates are off), SCALE still on
    NEST("bb-0.12.0", () => {
      expect(gatesRules()).toBe(false);
      expect(scaleRules()).toBe(true);
      expect(Object.keys(ITEMS)).toContain("cindermail");
      expect(ITEMS.quench.name).toBe("KINDLING");
    });
    same(was, "after bb-0.12.0");
    // this build's: nothing is switched
    NEST(RULES_VERSION, () => {
      expect(gatesRules() && scaleRules() && enchantRules()).toBe(true);
    });
    same(was, "after this build's rules");
  });

  it("validateUpload on a real deck of every hero under every label leaves ITEMS as it found it, whatever the answer", () => {
    const was = state();
    for (const rules of LABELS) {
      for (const hero of PLAYABLE_HEROES) {
        validateUpload(heroStartBuild(hero), 1, rules);
        validateUpload(heroStartBuild(hero), 7, rules);
      }
      same(was, `validateUpload under ${JSON.stringify(rules)}`);
    }
  });

  it("ghosts:admin revalidate (uploadProblems) on stored records, the committed seed pool's ghosts under their own and older labels, leaves ITEMS as it found it", () => {
    const was = state();
    const picks = [0, 17, 63, 120, 191].filter((i) => i < SEED_POOL.length);
    for (const i of picks) {
      const s = checkSnapshot(JSON.parse(SEED_POOL[i]) as unknown);
      const id = ghostId(s);
      const rec: StoredRecord = { ref: `ghosts.jsonl:${i + 1}`, kind: "upload", day: s.day, id, playerId: s.playerId, text: encodeRecord(id, 5, s), keyed: false };
      for (const rules of [s.rules, RULES_VERSION, "bb-0.12.0", "bb-0.11.0", "bb-0.10.0", "bb-0.9.7"]) {
        uploadProblems(rec, rules);
        same(was, `uploadProblems(pool ghost ${i}, ${rules})`);
      }
    }
  });

  it("the server's warm-up (warmRoadCap) builds its memo in the same nest and leaves ITEMS as it found it", async () => {
    const was = state();
    await warmRoadCap(() => undefined, "bb-0.11.0", 2);
    same(was, "warmRoadCap under bb-0.11.0");
    await warmRoadCap(() => undefined, RULES_VERSION, 2);
    same(was, "warmRoadCap under this build's rules");
  });

  it("a seeded draw is the same after the sweep: a new run's shop (the observable F1 broke: a SOFT-1 pick drawn from a permuted ITEMS differed)", () => {
    const shop = (): string => JSON.stringify(newRun("furnace", 4242).shop);
    const before = shop();
    for (const rules of LABELS) NEST(rules, () => undefined);
    expect(shop()).toBe(before);
  });
});

describe("BUMP-1F F1 and Q5: keepItems", () => {
  it("touches nothing when nothing moved (the same object, no re-adding)", () => {
    const was = snapshotItems();
    let ran = 0;
    keepItems(() => { ran++; });
    expect(ran).toBe(1);
    expect(itemsAre(was)).toBe(true);
    expect(putItemsBack(was)).toBe(false);
  });

  it("puts back a deleted key at its place and a def swapped under its key", () => {
    const was = snapshotItems();
    const items = ITEMS as Record<string, (typeof ITEMS)[string]>;
    const quench = items.quench;
    const k = Object.keys(items)[10];
    const def = items[k];
    delete items[k];
    items.quench = items.kiln;
    expect(itemsAre(was)).toBe(false);
    expect(putItemsBack(was)).toBe(true);
    expect(itemsAre(was)).toBe(true);
    expect(Object.keys(items)[10]).toBe(k);
    expect(items[k]).toBe(def);
    expect(items.quench).toBe(quench);
  });

  it("is what the suite guard (tests/setup/itemsGuard.ts) relies on: a withGates(off) round trip alone keeps the keys (GATES is the last three ids)", () => {
    const was = state();
    withGates(() => undefined, false);
    same(was, "withGates(off)");
  });
});
