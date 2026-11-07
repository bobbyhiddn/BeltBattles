// BUMP-1F P1 (BRIEF-BUMP1F section 2 P1; W/ref/PACKET-BUMP-0130.md section 5): the cross-feature rulings of the merge of GATES-1/1b and
// ENCHANT-1/1b/1c onto BUMP-1E's scaling world, each with its test. The rules cap decided (the pieces lane, 2026-10-19):
//  1. POISON (BUMP-1E's Payload.poison) through a FUSER ADDS, like BURN, and the FUSER's bonus does not touch it (it multiplies mult and flat,
//     and the FOR EACH part `each` with `flat`: "a split scales both", SCALE-2a F3);
//  2. a SCATTER MILL's pellets follow SPLITTER's rule: mult, flat, plate and each take the share, every other field (POISON too) copies whole;
//  3. a SMELTER adds BURN only: POISON (and `each`) stay;
//  4. ENCHANT: POISON is not a share key (MASSIVE and SWIFT leave it alone), an ECHOING copy copies it, FIERY adds BURN only;
//  5. the FUSER is a payload step at its tile in REQ-BFG-110's order (rigs before it count twice, rigs after it once); in the belt panel's
//     walk (convertWalk) it scales `each` with `flat`, and DRAKE NOZZLE still converts `flat` alone;
//  6. no word on a converter: all 8 words x the 3 converters give a reason, the stand-in codec leaves the judging to validation (which refuses),
//     the bots never rank one;
//  7. ITEMS' order: with every switch on, Object.keys(ITEMS) is the same before and after a validation under older rules (GATES outermost in the
//     world nesting, deck.ts loads ./scale before ./gates).
import { describe, expect, it } from "vitest";
import { Battle, type BeltAmmo, type Payload, type SideState } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { GATES_IDS, withGates } from "../src/sim/gates";
import { ENCHANT_IDS, enchantProblem, withEnchant } from "../src/sim/enchant";
import { convertWalk, fusePayload, pelletPayload, smeltPayload, type WalkSlug } from "../src/sim/convert";
import { PAYLOAD_RULES, echoCopy, payloadKeys, scaleShare } from "../src/sim/enchantFx";
import { flatOf } from "../src/sim/scale";
import { pct } from "../src/sim/pct";
import { validateBuild, validateUpload } from "../src/net/validate";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { decodeStarred, decodeStarredRaw, encodeStarred } from "../src/sim/standInPool";
import { rankWords } from "../src/sim/harness/enchantBot";
import { barge, bench } from "./arsenal.bench";

/** Both switches on for `fn` (synchronously only: a with* call puts its switch back at the first await). */
const allOn = <T>(fn: () => T): T => withGates(() => withEnchant(fn, true), true);
const slug = (id: number, o: Partial<Payload> = {}): Payload => ({ id, ammo: "plain", ride: 0, mult: 1, flat: 0, burn: 0, shock: false, prior: 0, factory: 1, copy: false, ...o });
const spec = (def: string, stars = 1) => effectAt(def, stars).converter!;

describe("BUMP-1F P1 rulings 1-3: POISON and FOR EACH DMG through the three converters", () => {
  it("the FUSER ADDS POISON like BURN; its bonus does not touch it, at any star", () => {
    for (const bonus of [50, 75, 100, 0]) {
      const f = fusePayload(slug(1, { poison: 2, burn: 1 }), slug(2, { poison: 3, burn: 4 }), { bonus }, 9);
      expect(f.poison, `bonus ${bonus}`).toBe(5);
      expect(f.burn).toBe(5);
    }
    // one slug without POISON: the other's stands; neither: absent (the field is not made up)
    expect(fusePayload(slug(1), slug(2, { poison: 3 }), { bonus: 100 }, 9).poison).toBe(3);
    expect(fusePayload(slug(1), slug(2), { bonus: 100 }, 9).poison).toBeUndefined();
  });

  it("the FUSER adds the FOR EACH DMG and scales it with `flat` (a split scales both); `flat` never takes it in", () => {
    const a = slug(1, { flat: 10, each: 4 }), b = slug(2, { flat: 10, each: 6 });
    const f = fusePayload(a, b, { bonus: 50 }, 9);
    expect(f.each).toBe(pct(4 + 6, 150)); // 15
    expect(f.flat).toBe(pct(20, 150)); // 30: both slugs' flat, x1.5, rounded half up once
    expect(flatOf(f)).toBe(f.flat + (f.each ?? 0)); // every reader of the flat bonus reads both; DRAKE NOZZLE (fireCore) converts `flat` alone
    // no `each` on either: none made
    expect(fusePayload(slug(1, { flat: 5 }), slug(2, { flat: 5 }), { bonus: 50 }, 9).each).toBeUndefined();
  });

  it("a SCATTER MILL pellet follows SPLITTER's rule: mult, flat, plate and each take the share, POISON copies whole", () => {
    const p = slug(1, { flat: 20, each: 10, plate: 6, poison: 4, burn: 3 });
    let next = 50;
    const pellets = pelletPayload(p, { out: 3, share: 60 }, () => next++);
    expect(pellets.length).toBe(3);
    for (const q of pellets) {
      expect(q.poison).toBe(4);
      expect(q.burn).toBe(3);
      expect(q.flat).toBe(pct(20, 60));
      expect(q.each).toBe(pct(10, 60));
      expect(q.plate).toBe(pct(6, 60));
      expect(q.mult).toBeCloseTo(0.6, 9);
    }
  });

  it("... and that is SPLITTER's own, read from the sim: a split of a POISONED slug with FOR EACH DMG (applyHit)", () => {
    const b = bench([["splitter", 4, 3, 1]]);
    const bt = new Battle(b, barge(), 7);
    const s: SideState = bt.sides[0];
    s.gates[0].online = true;
    s.factories[0].timer = 1000;
    const hit = s.routes[0].gateAt[2][0];
    const a: BeltAmmo = { p: slug(91, { ride: 3, flat: 20, each: 10, poison: 4 }), s: 30, processed: 2, blocked: false };
    const copies = (bt as unknown as { applyHit(s: SideState, a: BeltAmmo, h: unknown): BeltAmmo[] }).applyHit(s, a, hit);
    expect(copies.length).toBeGreaterThan(0);
    const share = effectAt("splitter", 1).gate!.split!.mult; // 0.6
    for (const x of [a, ...copies]) {
      expect(x.p.poison, "SPLITTER copies POISON whole").toBe(4);
      expect(x.p.flat).toBe(pct(20, 100 * share));
      expect(x.p.each).toBe(pct(10, 100 * share));
    }
    // the pellets of a SCATTER MILL make the same numbers from the same slug
    const q = pelletPayload(slug(91, { flat: 20, each: 10, poison: 4 }), { out: 1, share: 100 * share }, () => 5)[0];
    expect([q.poison, q.flat, q.each]).toEqual([a.p.poison, a.p.flat, a.p.each]);
  });

  it("a SMELTER adds BURN only: POISON and the FOR EACH DMG stay", () => {
    const p = slug(1, { flat: 7, each: 9, poison: 4, burn: 1 });
    const q = smeltPayload(p, { burn: 5 });
    expect([q.poison, q.each, q.flat, q.burn]).toEqual([4, 9, 7, 6]);
  });

  it("the belt panel's walk (convertWalk) goes through the engine's own rules and carries `each`: the FUSER doubles it and scales it with `flat`, a pellet takes its share, a SMELTER leaves it", () => allOn(() => {
    const walk: WalkSlug = { ammo: "plain", base: 30, ride: 2, mult: 1, flat: 10, each: 20, burn: 0, shock: false, prior: 0, heat: 0, heatBonus: 0, copies: 1 };
    const fu = spec("fuser", 1); // x1.5
    const fused = convertWalk(walk, fu);
    expect(fused.each).toBe(pct(40, 100 + fu.bonus!));
    expect(fused.flat).toBeGreaterThan(walk.flat); // doubled and scaled, apart from `each`
    const mill = convertWalk(walk, spec("scattermill", 1));
    expect(mill.each).toBe(pct(20, spec("scattermill", 1).share!));
    expect(mill.flat).toBe(pct(10, spec("scattermill", 1).share!));
    const sm = convertWalk(walk, spec("smelter", 1));
    expect([sm.each, sm.flat]).toEqual([20, 10]);
    // SCALE_RIGS off in a deck: `each` is 0 and stays 0 through every converter
    for (const id of ["fuser", "scattermill", "smelter"]) expect(convertWalk({ ...walk, each: 0 }, spec(id, 2)).each).toBe(0);
  }));
});

describe("BUMP-1F P1 ruling 4: ENCHANT leaves POISON and FOR EACH DMG alone", () => {
  it("PAYLOAD_RULES: `poison` is not a share key (MASSIVE and SWIFT leave it), only `burn` is FIERY's", () => {
    expect(PAYLOAD_RULES.poison).toBe("kept");
    expect(PAYLOAD_RULES.each).toBe("kept"); // no word adds FOR EACH DMG; every word's DMG is stat-row DMG, which rides `flat`
    expect(payloadKeys("share").sort()).toEqual(["flat", "mult", "plate"]);
    expect(payloadKeys("burn")).toEqual(["burn"]);
  });

  it("MASSIVE / SWIFT's share (scaleShare) leaves POISON and `each` alone; an ECHOING copy copies them", () => {
    const p = slug(1, { flat: 20, each: 10, poison: 4, burn: 2, plate: 8 });
    scaleShare(p, 0.5);
    expect([p.flat, p.poison, p.each, p.plate]).toEqual([10, 4, 10, 4]);
    const c = echoCopy(p, 99);
    expect([c.id, c.poison, c.each, c.flat]).toEqual([99, 4, 10, 10]);
  });

  it("FIERY adds BURN only: a FIERY rig's hit leaves a slug's POISON as it was", () => {
    allOn(() => {
      const b = bench([["whetstone", 4, 3, 1]]);
      b.items.find((p) => p.def === "whetstone")!.ench = "fiery";
      const bt = new Battle(b, barge(), 7);
      const s: SideState = bt.sides[0];
      s.gates[0].online = true;
      s.factories[0].timer = 1000;
      expect(s.gates[0].ench?.id).toBe("fiery");
      const hit = s.routes[0].gateAt[2][0];
      const a: BeltAmmo = { p: slug(91, { ride: 3, poison: 4, burn: 1 }), s: 30, processed: 2, blocked: false };
      (bt as unknown as { applyHit(s: SideState, a: BeltAmmo, h: unknown): BeltAmmo[] }).applyHit(s, a, hit);
      expect(a.p.burn, "FIERY's BURN").toBeGreaterThan(1);
      expect(a.p.poison).toBe(4);
    });
  });
});

describe("BUMP-1F P1 ruling 6: no word on a converter", () => {
  it("all 8 words x the 3 converters give a reason (NOT ON THIS PART), with GATES on", () => {
    allOn(() => {
      expect(ENCHANT_IDS.length).toBe(8);
      expect(GATES_IDS.length).toBe(3);
      for (const c of GATES_IDS) for (const w of ENCHANT_IDS) expect(enchantProblem(c, w), `${w} on ${c}`).toBe("NOT ON THIS PART");
    });
  });

  it("the stand-in codec reads a word as written (it judges no kind) and validation refuses it on a converter", () => {
    allOn(() => {
      // a one-belt furnace deck with a FUSER on the belt (cell 4,3) carrying FIERY; the codec round-trips it, validateBuild says no
      const b = heroStartBuild("furnace");
      const code = encodeStarred(b);
      expect(decodeStarredRaw("furnace", code)).toEqual(decodeStarred("furnace", code)); // sanity: the codec is deterministic on a plain deck
      const withWord = decodeStarredRaw("furnace", "6 0/fuser43~fi//");
      expect(withWord.items[0]).toMatchObject({ def: "fuser", ench: "fiery" });
      const bad = { ...b, items: [...b.items, { uid: 99, def: "fuser", x: 4, y: 3, ench: "fiery" }] };
      const v = validateBuild(bad, 5, "strict");
      expect(v.ok).toBe(false);
      expect(v.errors.join(" | ")).toContain("NOT ON THIS PART"); // enchantProblem's reason, validate.ts's enchant check
      // the same deck without the word is the control: what is refused is the word, on that part
      expect(validateBuild({ ...b, items: [...b.items, { uid: 99, def: "fuser", x: 4, y: 3 }] }, 5, "strict").errors.join(" | ")).not.toContain("NOT ON THIS PART");
    });
  });

  it("the bots never rank a converter: rankWords lists no FUSER, SCATTER MILL or SMELTER for any word", () => {
    allOn(() => {
      const b = heroStartBuild("furnace");
      b.items.push({ uid: 90, def: "fuser", x: 6, y: 1 }, { uid: 91, def: "scattermill", x: 6, y: 2 }, { uid: 92, def: "smelter", x: 6, y: 3 });
      for (const w of ENCHANT_IDS) {
        const spots = rankWords({ build: b, day: 5 }, w);
        for (const s of spots) expect(GATES_IDS as readonly string[], `${w} ranked ${s.def}`).not.toContain(s.def);
      }
    });
  });
});

describe("BUMP-1F P1 ruling 7: ITEMS' key order with every switch on", () => {
  it("the load order: the base's ids, then SCALE's seven, then GATES' three (deck.ts loads ./scale before ./gates)", () => {
    allOn(() => {
      const keys = Object.keys(ITEMS);
      expect(keys.slice(-GATES_IDS.length)).toEqual([...GATES_IDS]); // the three gates join ITEMS last
      const scaleSeven = ["cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];
      const at = keys.indexOf(scaleSeven[0]);
      expect(keys.slice(at, at + 7)).toEqual(scaleSeven); // SCALE's seven in a row, right before GATES' three
      expect(at + 7).toBe(keys.length - GATES_IDS.length);
    });
  });
  // The other half of the packet's ITEMS-order test, "Object.keys(ITEMS) is identical before and after validating an older-rules record",
  // is F1's rule (BRIEF-BUMP1F P2): it fails at the merge, because each world's restore re-adds its ids at the END, so the nest's order
  // decides the key order after the call (SCALE's seven came back BEFORE SHAPES' three in the run of this commit). It lands with F1's
  // fix, in tests/items.order.test.ts, with the sweep over every rules label.
});
