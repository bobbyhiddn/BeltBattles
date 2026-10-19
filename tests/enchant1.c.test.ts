// ENCHANT-1c (REQ-BFG-085; BRIEF-ENCHANT1C C2, C3, C4): the small rulings after ENCHANT-1b's review.
//  C2: ECHOING on a rig whose hit gives a slug nothing to double is refused with `NOTHING TO DOUBLE` (cap's ruling on 1b's QUESTION 1). ONE def-level rule
//      (enchant.ts rigEchoDoubles, read by enchantProblem), proved here against Battle.applyHit on a real deck for EVERY rig def: the echoed hit and the plain hit
//      give the same slug, copies and ship exactly for the defs the rule refuses. The server (E6.1), APPLY, the buy, the bots and LAST CHANCE's part word follow.
//  C3: pick 2's day is the Iron Matriarch's day (rivals.ts MATRIARCH_DAY), one literal.
//  C4: the merge note (below).
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import "../src/sim/plainRigs"; // the six plain stat rigs are in ITEMS while PLAIN_RIGS is on (deck.ts loads it); named so the list never depends on the import order
import "../src/sim/shapes2"; // the shaped rigs of rule set B
import { Battle, type BeltAmmo, type Payload } from "../src/sim/battle";
import { ITEMS } from "../src/sim/content";
import { rigHits, rotField, type Build } from "../src/sim/deck";
import { rotFacing } from "../src/sim/beltside";
import {
  ENCHANT, ENCHANT_NUM, SLUG_WORDS, enchantKindOf, enchantProblem, rigEchoDoubles, rigHitsSlugs, setEnchant, withEnchant,
} from "../src/sim/enchant";
import { doubles } from "../src/sim/overclock";
import { effectAt } from "../src/sim/stars";
import { WARLORD_PICK_FROM, lastChanceWord, warlordPicksByDay } from "../src/sim/enchantSources";
import { MATRIARCH_DAY, RUN_DAYS, rivalDays } from "../src/sim/rivals";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { rankWords } from "../src/sim/harness/enchantBot";
import { decodeStarredRaw, encodeStarred } from "../src/sim/standInPool";
import { validateBuild } from "../src/net/validate";
import { buyEnchant, enchantChoices, openWarlordPick } from "../src/game/enchanter";
import { gainModule } from "../src/game/fuse";
import { newRun } from "../src/game/run";
import { ENCHANT_NOTES } from "../src/ui/enchantFaces";
import { banned } from "./textRules";
import { barge, bench } from "./arsenal.bench";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);

const defs = Object.values(ITEMS);
const rigs = defs.filter((d) => d.kind === "gate");

// ------------------------------------------------------------------------------------------------------------ C2: the real hit, with and without the echo

/** A slug as a factory makes it, carrying something for every conditional rig to read: BURN to spend, a ride, prior gates, a flat to scale. */
const slug = (): Payload => ({ id: 91, ammo: "plain", ride: 7, mult: 1, flat: 4, burn: 5, shock: false, prior: 3, factory: 1, copy: false });

/** Where a rig of `def` can stand beside the KILN's belt (column 4: tile i is the cell (4, 5 - i)) so that some arrow of it lands on a belt tile: the first of
 *  a short list of placements west of the belt, as tests/enchant1.b.test.ts hitsSomewhere searches them (a shaped rig of rule set B needs its own spot). */
function place(def: string): { x: number; y: number; rot: number; tile: number } | null {
  for (const x of [3, 2, 1, 0]) {
    for (const y of [3, 2, 4, 1, 5]) {
      for (let rot = 0; rot < 4; rot++) {
        const b: Build = bench([]);
        b.items.push({ uid: 10, def, x, y, ...rotField(def, rot) });
        const tile = rigHits(b)[0].findIndex((t) => t.some((h) => h.uid === 10));
        if (tile >= 0) return { x, y, rot, tile };
      }
    }
  }
  return null;
}
const spots = new Map<string, ReturnType<typeof place>>();

/**
 * ONE hit of rig `def` at `stars` on a real deck (tests/arsenal.bench.ts: the KILN's belt up column 4, the rig beside it, a second working rig WHETSTONE on
 * the other side of the same tile for PINCER's crossfire), with the word ECHOING on the rig and its count one short of the echo (so this slug is the
 * ECHOING's fifth: Battle.applyHit's `doubled`) or with no word. Battle.applyHit runs on a fresh slug in a rich state (the ship's pool holds plating, a foe
 * part is stalled, a SORTING ARM is one short of its copy, a TWIN GAUGE's belt is matched). Returns everything the hit changed as one string (the slug, the
 * copies it made, the ship's plating, hull, heals and shield, the rig's own counter), or null when the rig has no arrow on the belt (the STOKER).
 */
function oneHit(def: string, stars: number, echo: boolean): string | null {
  return on(() => {
    if (!spots.has(def)) spots.set(def, place(def));
    const at = spots.get(def);
    if (!at) return null;
    const deck: Build = bench([]);
    deck.items.push({ uid: 10, def, x: at.x, y: at.y, ...rotField(def, at.rot), ...(stars > 1 ? { stars } : {}), ...(echo ? { ench: "echoing" } : {}) });
    deck.items.push({ uid: 11, def: "whetstone", x: 5, y: 5 - at.tile, ...rotField("whetstone", rotFacing("whetstone", 3)) }); // east of the same tile, its arrow pointing west
    const bt = new Battle(deck, barge(), 7);
    const s = bt.sides[0];
    for (const g of s.gates) g.online = true;
    s.factories[0].timer = 1000; // the KILN stamps nothing meanwhile
    const g = s.gates.find((q) => q.uid === 10)!;
    const hit = s.routes[0].gateAt[at.tile].find((h) => h.g === g);
    if (!hit) return null;
    if (echo) {
      expect(g.ench?.id, `${def}: the rig holds ECHOING`).toBe("echoing");
      g.ench!.n = ENCHANT_NUM.echoEvery - 1; // the next NEW slug it hits is its echoEvery-th
    } else expect(g.ench, `${def}: no word`).toBeUndefined();
    s.plate.plate = 100; // plating to take and to count (IRON WALL's bonus, SHIELD FUEL)
    bt.sides[1].factories[0].disrupted = 3; // a stalled foe part (LODESTONE)
    const e = effectAt(def, stars).gate!;
    if (e.sort) g.sorted = e.sort.every - 1; // a SORTING ARM's next hit copies the slug
    if (e.gauge) hit.matched = true; // a TWIN GAUGE pays its matched number on a matched belt
    const a: BeltAmmo = { p: slug(), s: 30, processed: 2, blocked: false };
    const copies: BeltAmmo[] = (bt as unknown as { applyHit(s: unknown, a: BeltAmmo, h: unknown): BeltAmmo[] }).applyHit(s, a, hit);
    return JSON.stringify({ p: a.p, copies: copies.map((c) => c.p), plate: s.plate, hull: s.hull.hp, heals: s.heals ?? null, shield: s.shield ?? null, sorted: g.sorted });
  });
}

interface Proof { id: string; name: string; star: { stars: number; hit: boolean; changes: boolean; rule: boolean }[]; hit: boolean; changesAtAnyStar: boolean; rigEchoDoubles: boolean }
let memo: Proof[] | undefined;
/** What the rule says for every rig def, and what the real hit shows (the echo changes the hit at which stars; hit false = the rig has no arrow on the belt). Run once. */
const proofOf = (): Proof[] => (memo ??= rigs.map((d) => {
  const star = [1, 2, 3].map((s) => {
    const plain = oneHit(d.id, s, false), echoed = oneHit(d.id, s, true);
    return { stars: s, hit: plain !== null, changes: plain !== null && echoed !== plain, rule: doubles(effectAt(d.id, s).gate!) };
  });
  return { id: d.id, name: d.name, star, hit: star.every((x) => x.hit), changesAtAnyStar: star.some((x) => x.changes), rigEchoDoubles: rigEchoDoubles(d) };
}));
/** The rigs ECHOING is refused on by C2 alone: they hit slugs and the echo changes nothing at any star. */
const refusedOf = (): string[] => proofOf().filter((p) => p.hit && !p.rigEchoDoubles).map((p) => p.id);

describe("ENCHANT-1c C2: ECHOING refuses a rig with nothing to double (NOTHING TO DOUBLE), one def-level rule, proved for EVERY rig def against Battle.applyHit", () => {
  it("the proof covers every rig def (46 with PLAIN_RIGS and SHAPES2 on) at every star; exactly one has no arrow on a belt: the STOKER", () => {
    const proof = proofOf();
    expect(rigs.length).toBe(46);
    expect(proof.filter((p) => !p.hit).map((p) => p.id)).toEqual(["stoker"]);
    expect(proof.every((p) => p.star.length === 3)).toBe(true);
  });

  it("(opt-in) writes the proof table for the REPORT when C2_PROOF_OUT is set", () => {
    const out = process.env.C2_PROOF_OUT;
    if (!out) return;
    const rows = proofOf().map((p) => `${p.id.padEnd(14)} ${p.name.padEnd(18)} hit=${p.hit ? "yes" : "NO "}  echo changes the hit at ★1/★2/★3: ${p.star.map((x) => (x.changes ? "yes" : "no ")).join("/")}  rule(doubles)=${p.star.map((x) => (x.rule ? "yes" : "no ")).join("/")}  enchantProblem(echoing)=${enchantProblem(ITEMS[p.id], "echoing") ?? "null (allowed)"}`);
    writeFileSync(out, `${rows.length} rig defs\n${rows.join("\n")}\nrefused (NOTHING TO DOUBLE): ${refusedOf().length}: ${refusedOf().join(", ")}\n`);
  });

  it("the rule is the sim's own: for every rig def and star, the echoed hit differs from the plain hit exactly when doubling changes the rig's effect (overclock.ts doubles)", () => {
    for (const p of proofOf()) {
      if (!p.hit) continue;
      for (const x of p.star) expect(x.changes, `${p.id} ★${x.stars}: echoed hit differs from the plain hit`).toBe(x.rule);
    }
  });

  it("enchantProblem refuses ECHOING on a rig with NOTHING TO DOUBLE exactly when the echo changes the hit at no star; every other rig takes it (the STOKER keeps IT HITS NO SLUGS)", () => {
    let allowed = 0;
    for (const p of proofOf()) {
      const d = ITEMS[p.id];
      const why = enchantProblem(d, "echoing");
      if (p.hit) expect(p.rigEchoDoubles, `${p.id}: rigEchoDoubles is the real hit's answer at some star`).toBe(p.changesAtAnyStar);
      if (!p.hit) expect(why, `${p.id}: no arrow on a belt, so IT HITS NO SLUGS says first`).toBe("IT HITS NO SLUGS");
      else if (p.changesAtAnyStar) {
        expect(why, `${p.id}: the echo changes the hit`).toBeNull();
        allowed++;
      } else expect(why, `${p.id}: the echo changes nothing`).toBe("NOTHING TO DOUBLE");
    }
    expect(allowed).toBe(32);
  });

  it("the refused defs, named on purpose (a rig added later whose hit has nothing to double makes this list longer and fails here, so cap chooses): 13 of the 46", () => {
    const refused = refusedOf();
    expect([...refused].sort()).toEqual([
      "ballast", "braceframe", "brake", "coil", "grease", "keg", "overclocker", "overdrive", "riveter", "sifter", "surge", "tollbooth", "twinlatch",
    ]);
    // read by the sim's own doubling: a speed rig (GREASE WORKS, BRAKE SHOE, OVERDRIVE), TOLLBOOTH, SIFTER, SURGE VALVE, RIVETER, OVERCLOCKER, POWDER KEG, BRACE FRAME,
    // BALLAST work in other places than the hit's numbers; GALVANIC COIL's SHOCK is a flag (twice is once) and TWIN LATCH's damage is 0
    for (const id of refused) for (const s of [1, 2, 3]) expect(doubles(effectAt(id, s).gate!), `${id} ★${s}`).toBe(false);
    expect(refused).not.toContain("stoker");
    // none of them is a list: the rule reads effectAt(def, star).gate; a def with a doubled number at some star is allowed
    for (const id of ["whetstone", "temper", "longhaul", "splitter", "plateroller", "pincer", "shieldwall", "lodestone"]) expect(rigEchoDoubles(ITEMS[id]), id).toBe(true);
  });

  it("FIERY, RISING, GROWING, WIDE (where it has a side) and BRACED stay legal on every refused rig: they add their own BURN or DMG at the hit; MASSIVE and SWIFT keep their kind reasons", () => {
    for (const id of refusedOf()) {
      const d = ITEMS[id];
      for (const w of ["fiery", "rising", "growing", "braced"]) expect(enchantProblem(d, w), `${w} on ${id}`).toBeNull();
      expect(enchantProblem(d, "massive"), `massive on ${id}`).toBe("ONLY ON A TURRET");
      expect(enchantProblem(d, "swift"), `swift on ${id}`).toBe("ONLY ON A FACTORY");
      expect(enchantProblem(d, "echoing"), `echoing on ${id}`).toBe("NOTHING TO DOUBLE");
    }
    // the STOKER's reason stays IT HITS NO SLUGS for ECHOING, as for the other three (N3)
    for (const w of SLUG_WORDS) expect(enchantProblem("stoker", w), `${w} on the STOKER`).toBe("IT HITS NO SLUGS");
    expect(rigHitsSlugs(ITEMS.stoker)).toBe(false);
  });

  it("factories and turrets are untouched: ECHOING goes on every one (it always does something there); gear, cores and supplies keep their kind reasons", () => {
    let n = 0;
    for (const d of defs) {
      const kind = enchantKindOf(d);
      if (kind === "factory" || kind === "turret") {
        expect(enchantProblem(d, "echoing"), `echoing on ${d.id}`).toBeNull();
        n++;
      } else if (!kind) expect(enchantProblem(d, "echoing"), `echoing on ${d.id}`).toMatch(/^NOT ON /);
    }
    expect(n).toBeGreaterThan(30);
  });

  it("the reason is plain text that fits: no digit, no icon, in the house words (TEXT-STYLE), 17 characters", () => {
    expect("NOTHING TO DOUBLE").toMatch(/^[A-Z ]+$/);
    expect(enchantProblem("tollbooth", "echoing")).toBe("NOTHING TO DOUBLE");
  });

  // ------------------------------------------------------------------------------------------------ everything that reads enchantProblem follows

  const withRig = (def: string, ench?: string): Build => {
    const b = heroStartBuild("furnace");
    return { ...b, items: [...b.items, { uid: 20, def, x: 6, y: 2, ...(ench ? { ench } : {}) }] };
  };

  it("the server's piece check (E6.1, both modes) refuses ECHOING on each refused rig with the reason and takes it on a rig with something to double; a stand-in `~ec` on such a rig decodes as written and the validator refuses it", () => {
    for (const id of refusedOf()) {
      for (const mode of ["strict"] as const) {
        const v = on(() => validateBuild(withRig(id, "echoing"), 8, mode));
        expect(v.ok, `${id} ${mode}`).toBe(false);
        expect(v.errors.join(" | "), `${id} ${mode}`).toMatch(/can't take ECHOING: NOTHING TO DOUBLE/);
      }
      // FIERY on the same rig is no E6.1 problem
      expect(on(() => validateBuild(withRig(id, "fiery"), 8, "strict")).errors.join(" | "), `${id}: FIERY`).not.toMatch(/can't take/);
    }
    const ok = on(() => validateBuild(withRig("whetstone", "echoing"), 8, "strict"));
    expect(ok.errors.join(" | ")).not.toMatch(/can't take/);
    const code = encodeStarred(withRig("tollbooth", "echoing"));
    expect(code).toMatch(/tollbooth\d+~ec/); // the stand-in word writes the rig's word like any piece's
    const back = decodeStarredRaw("furnace", code); // the codec judges no kind: the word reads back as written
    expect(back.items.find((p) => p.def === "tollbooth")).toMatchObject({ def: "tollbooth", ench: "echoing" });
    const v = on(() => validateBuild(back, 8, "strict"));
    expect(v.ok).toBe(false);
    expect(v.errors.join(" | ")).toMatch(/can't take ECHOING: NOTHING TO DOUBLE/);
  });

  const apply = () => {
    const run = newRun("furnace", 7);
    run.build.items.push({ uid: 300, def: "tollbooth", x: 6, y: 2 }, { uid: 301, def: "whetstone", x: 7, y: 2 });
    run.gold = 20;
    run.shop.enchanter = { day: 3, offers: [{ ench: "echoing", price: 4, sold: false }, { ench: "fiery", price: 4, sold: false }] };
    return run;
  };

  it("APPLY: a rig with NOTHING TO DOUBLE does not glow for ECHOING (its reason is the text), the buy refuses it, takes no gold and keeps the offer; it still glows for FIERY; a rig with something to double takes ECHOING", () => {
    const run = apply();
    on(() => {
      const at = (word: string, uid: number) => enchantChoices(run, word).find((c) => c.target.kind === "item" && c.target.uid === uid)!;
      expect(at("echoing", 300).reason).toBe("NOTHING TO DOUBLE");
      expect(at("echoing", 301).reason).toBeNull();
      expect(at("fiery", 300).reason).toBeNull();
      const r = buyEnchant(run, 0, { kind: "item", uid: 300 });
      expect(r).toMatchObject({ ok: false, reason: "NOTHING TO DOUBLE" });
      expect(run.gold).toBe(20);
      expect(run.shop.enchanter!.offers[0].sold).toBe(false);
      expect(run.build.items.find((p) => p.uid === 300)!.ench).toBeUndefined();
      expect(buyEnchant(run, 0, { kind: "item", uid: 301 }).ok).toBe(true); // the WHETSTONE takes it
      expect(run.gold).toBe(16);
      expect(buyEnchant(run, 1, { kind: "item", uid: 300 }).ok).toBe(true); // FIERY goes on the TOLLBOOTH
      expect(run.gold).toBe(12);
    });
  });

  it("the bots never rank ECHOING onto a rig with nothing to double (every refused def, one at a time)", () => {
    on(() => {
      for (const id of refusedOf()) expect(rankWords({ build: withRig(id), day: 5 }, "echoing").some((s) => s.def === id), `echoing on ${id}`).toBe(false);
    });
  });

  it("LAST CHANCE's part word: a part that is a refused rig never arrives with ECHOING (300 seeds x days 1-16, every def), and a part that can take it still draws it now and then", () => {
    let echo = 0;
    for (const d of defs) {
      const kind = enchantKindOf(d);
      if (!kind) continue;
      const c2Only = kind === "rig" && rigHitsSlugs(d) && !rigEchoDoubles(d);
      for (let seed = 1; seed <= 300; seed++) {
        for (let day = 1; day <= 16; day += d.id === "tollbooth" ? 1 : 5) {
          const w = lastChanceWord(seed, day, d.id);
          expect(w, `${d.id}`).not.toBeNull();
          expect(enchantProblem(d, w!.ench, w!.enchDir !== undefined ? { enchDir: w!.enchDir } : undefined), `${d.id}: ${w!.ench}`).toBeNull();
          if (c2Only) expect(w!.ench, `${d.id} seed ${seed} day ${day}`).not.toBe("echoing");
          else if (w!.ench === "echoing") echo++;
        }
      }
    }
    expect(echo, "ECHOING is still drawn for the parts that can take it").toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------------------------------------------------ C3: pick 2's day is the Matriarch's day

describe("ENCHANT-1c C3: pick 2's day is the Matriarch's day", () => {
  it("WARLORD_PICK_FROM[1] === MATRIARCH_DAY, which is the first day she can be fought; nothing moves today ([5, 8])", () => {
    expect(WARLORD_PICK_FROM[1]).toBe(MATRIARCH_DAY);
    expect(rivalDays("matriarch")[0]).toBe(WARLORD_PICK_FROM[1]);
    expect([...WARLORD_PICK_FROM]).toEqual([5, 8]);
    expect(MATRIARCH_DAY).toBe(8);
  });

  it("the picks a deck can have had follow it: one from day 5, two from the Matriarch's day (warlordPicksByDay)", () => {
    expect(warlordPicksByDay(WARLORD_PICK_FROM[0] - 1)).toBe(0);
    expect(warlordPicksByDay(WARLORD_PICK_FROM[0])).toBe(1);
    expect(warlordPicksByDay(MATRIARCH_DAY - 1)).toBe(1);
    expect(warlordPicksByDay(MATRIARCH_DAY)).toBe(2);
    expect(warlordPicksByDay(RUN_DAYS)).toBe(2);
  });

  it("the client's pick 2 opens on the Matriarch's win on the day the constant names, and the pair is that day's (the server re-derives the same words)", () => {
    on(() => {
      const run = newRun("furnace", 11);
      openWarlordPick(run, { tier: "hard", id: "matriarch", day: MATRIARCH_DAY }, true);
      expect(run.enchPick?.no, "pick 2").toBe(2);
      expect(run.enchPick?.day).toBe(WARLORD_PICK_FROM[1]);
    });
  });

  it("the source has no second literal: enchantSources.ts takes the day from rivals.ts (the import makes no cycle: rivals.ts reaches nothing of enchantSources.ts)", () => {
    const src = readFileSync("src/sim/enchantSources.ts", "utf8");
    expect(src).toMatch(/import \{ MATRIARCH_DAY \} from "\.\/rivals";/);
    expect(src).toMatch(/export const WARLORD_PICK_FROM: readonly \[number, number\] = \[5, MATRIARCH_DAY\];/);
    expect(src).not.toMatch(/WARLORD_PICK_FROM[^\n]*=\s*\[\s*5\s*,\s*8\s*\]/);
  });
});

// ------------------------------------------------------------------------------------------------------------ C4: the merge note

describe("ENCHANT-1c C4: the hidden NOTES say what a merge does when only ONE part holds a word", () => {
  const NOTE = "IF ONLY ONE PART HAS ONE, A MERGE KEEPS IT.";

  it("the note is the fourth NOTES line (behind the hover or the tap, REQ-BFG-089), in the house words", () => {
    expect(ENCHANT_NOTES).toHaveLength(4);
    expect(ENCHANT_NOTES[3]).toBe(NOTE);
    expect(banned(NOTE)).toEqual([]);
    expect(NOTE).not.toMatch(/\d/);
  });

  it("and the code does exactly that, both ways round (the same fixtures as tests/enchant1.merge.test.ts): the word of the survivor, or of the absorbed copy, is the merged part's", () => {
    on(() => {
      const mk = () => { const run = newRun("furnace", 5); run.day = 3; run.gold = 50; return run; };
      const alone = mk(); // only the survivor has a word
      alone.build.items.push({ uid: 200, def: "whetstone", x: 1, y: 5, ench: "fiery" });
      gainModule(alone, "whetstone");
      expect(alone.build.items.find((p) => p.uid === 200)).toMatchObject({ stars: 2, ench: "fiery" });
      expect(alone.enchMerge, "no pick: there was only one").toBeUndefined();
      const absorbed = mk(); // only the absorbed copy has a word
      absorbed.build.items.push({ uid: 200, def: "whetstone", x: 1, y: 5 });
      absorbed.inventory.push({ uid: 201, def: "whetstone", stars: 2, ench: "rising" });
      gainModule(absorbed, "whetstone");
      expect(absorbed.build.items.find((p) => p.uid === 200)).toMatchObject({ stars: 3, ench: "rising" });
      expect(absorbed.enchMerge).toBeUndefined();
    });
  });
});
