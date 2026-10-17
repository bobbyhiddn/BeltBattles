// ENCHANT-1 (REQ-BFG-085 (4); BRIEF-ENCHANT1 E6; run 2, step 5): THE SERVER'S UPLOAD CHECK for enchantments, rule by rule, each with forged
// fixtures that it refuses and legal fixtures that it accepts (src/net/enchantCheck.ts, the hooks in src/net/validate.ts):
//   E6.1 each word is one of the eight and sits on a kind it can go on; enchDir only with WIDE on a rig, on a side with no arrow
//   E6.2 the count is at most maxEnchantsByDay(day, LAST CHANCE took the part)
//   E6.3 each held word was on offer (re-derived from the run seed: possibleWords), and each offer is used once (the slots)
//   E6.4 gold: every word past the free sources' bound costs ENCHANTER_PRICE in buildCost, so the day's budget covers it
//   E6.5 GROWING's `grow` is at most day - 1 and sits only on a piece that holds GROWING
// Off, or under rules without ENCHANT, every ench / enchDir / grow is refused as today, and a deck without a word is judged and costed
// byte for byte as before. The PIN TEST at the end runs the same fixtures through the client's shape check (ghostSnapshot.ts isSnapshot),
// the strict decoder (snapshot.ts checkSnapshot), the client's full check (validateUpload) and POST /v1/ghosts, in BOTH switch states.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// deck.ts first (the ship's load order: ITEMS' key order is part of the seeded draws)
import { canPlaceItem, cloneBuild, turretList, type Build, type BuildTurret, type Placed } from "../src/sim/deck";
import { GRID, HEROES, ITEMS, RULES_VERSION, type HeroId } from "../src/sim/content";
import { ENCHANT, ENCHANT_IDS, enchantProblem, freeSides, setEnchant, withEnchant } from "../src/sim/enchant";
import {
  ENCHANTER_PRICE, enchanterWords, freeEnchantsByDay, lastChanceWord, maxEnchantsByDay, possibleWords, warlordPickWords,
} from "../src/sim/enchantSources";
import { lastChanceOffer, lastChanceParts, type TakenLastChance } from "../src/sim/lastChance";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { parRunSeed, playerRun } from "../src/sim/harness/player";
import { buildCost, maxGoldByDay, validateBuild, validateUpload, type ValidateContext } from "../src/net/validate";
import { enchantFreeWords, enchantGold, enchantProblems } from "../src/net/enchantCheck";
import { maxHonestSpend } from "../src/net/roadCap";
import { ENCHANT_RULES, longRunFor } from "../src/net/rulesGate";
import { reachableRecords } from "../src/net/records";
import { SNAPSHOT_V3, checkSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { createGhostServer, type GhostServer } from "../server/app";
import { ownedBy, signedHeaders, testIdentity } from "./netIdentity";
import { withDawnRunes } from "./runeFill";

vi.setConfig({ testTimeout: 240_000 }); // ENCHANT-1 (run 3): these sweeps play many seeded runs; under a loaded host (24 cores shared with other lanes) the 30 s default is a time-only red

afterEach(() => setEnchant(ENCHANT)); // the shipped value (off)
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const off = <T>(fn: () => T): T => withEnchant(fn, false);

const PLATE = ITEMS.plating.supply!.hull!;
const names = (v: { errors: string[] }): string => v.errors.join(" | ");

// ------------------------------------------------------------------------------------------------------------------ the hand deck (no seed)

/** FURNACE's starting deck plus a rig (WHETSTONE, an I rig), a STAMP PRESS, a LONG HAUL (II, sides 0 and 2 free) and an OVERDRIVE (X, 4 arrows). */
function deck(over: Record<number, { ench: string; enchDir?: number; grow?: number }> = {}): Build {
  const b = heroStartBuild("furnace");
  const items: Placed[] = [
    ...b.items,
    { uid: 10, def: "whetstone", x: 1, y: 5 }, { uid: 11, def: "press", x: 7, y: 7 }, { uid: 12, def: "longhaul", x: 2, y: 2 }, { uid: 13, def: "overdrive", x: 8, y: 4 },
  ].map((p) => ({ ...p, ...(over[p.uid] ?? {}) }));
  return { ...b, items };
}
const KILN = heroStartBuild("furnace").items.find((p) => p.def === ITEMS.kiln.id)!.uid; // the signature factory
/** The hand deck with its starting turret listed (uid 90) and extra fields on it. */
const withTurret = (b: Build, f: Record<string, unknown> = {}): Build => ({ ...b, turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ...f }] }) as Build;
/** Six distinct legal pieces of the hand deck and a word that fits each: n of them hold their word. */
const SIX: { uid: number; ench: string; enchDir?: number }[] = [
  { uid: 10, ench: "fiery" }, { uid: 11, ench: "rising" }, { uid: 12, ench: "wide", enchDir: 0 }, { uid: 13, ench: "echoing" }, { uid: KILN, ench: "massive" }, { uid: 90, ench: "swift" },
];
function handWords(n: number): Build {
  const items: Record<number, { ench: string; enchDir?: number }> = {};
  for (const w of SIX.slice(0, n).filter((x) => x.uid !== 90)) items[w.uid] = { ench: w.ench, ...(w.enchDir !== undefined ? { enchDir: w.enchDir } : {}) };
  const b = deck(items);
  return SIX.slice(0, n).some((x) => x.uid === 90) ? withTurret(b, { ench: "swift" }) : withTurret(b);
}
/** The player mode on a deck holding its day's neutral runes (no seed: the offers are not re-derived), ENCHANT on. */
const up = (b: Build, day: number, ctx: ValidateContext = {}) => on(() => validateUpload(withDawnRunes(b, day), day, RULES_VERSION, ctx));
/** The same deck with plates and crates added (supplies only: they change no piece). */
const supplied = (b: Build, plates: number, crates: number): Build => ({ ...b, hullBonus: b.hullBonus + plates * PLATE, beltCap: b.beltCap + 4 * crates });
/** A plate/crate mix that costs exactly `gold` (plating 5, crates 2). */
function mix(gold: number): [number, number] {
  for (let c = 0; c <= 4; c++) if (gold - 2 * c >= 0 && (gold - 2 * c) % 5 === 0) return [(gold - 2 * c) / 5, c];
  throw new Error(`no plate/crate mix costs ${gold}`);
}
const lcPart = (day = 2): TakenLastChance => ({ day, boon: "part", id: lastChanceParts()[0].id });

// ------------------------------------------------------------------------------------------------------------------ par decks (with the seed)

const HEROS: HeroId[] = ["furnace", "weaver", "foundry", "bastion"];
const runs = new Map<string, Build[]>();
/** The par player's deck of `day` for (hero, seed), made with ENCHANT off (no words): runes and gold are the run's own. */
function par(hero: HeroId, seed: number, day: number): Build {
  const key = `${hero}-${seed}`;
  if (!runs.has(key)) runs.set(key, playerRun(hero, 10, seed).map((d) => d.build));
  return cloneBuild(runs.get(key)![day - 1]);
}
type Target = { item: number } | { turret: number };
/** Every piece of the deck that takes `word`, items by uid then turrets by position (WIDE on a rig with its first free side). */
function targets(b: Build, word: string): { to: Target; dir?: number }[] {
  const out: { to: Target; dir?: number }[] = [];
  for (const p of [...b.items].sort((x, y) => x.uid - y.uid)) {
    if (enchantProblem(ITEMS[p.def], word) !== null) continue;
    out.push({ to: { item: p.uid }, ...(word === "wide" && ITEMS[p.def].kind === "gate" ? { dir: freeSides(ITEMS[p.def])[0] } : {}) });
  }
  turretList(b).forEach((t, k) => { if (enchantProblem(ITEMS[t.def], word) === null) out.push({ to: { turret: k } }); });
  return out;
}
/** `b` with a word (and its side or counter) put on one piece, raw: no normalisation, so a forged field stays. */
function put(b: Build, to: Target, f: { ench?: string; enchDir?: number; grow?: number }): Build {
  const nb = cloneBuild(b);
  if ("item" in to) nb.items = nb.items.map((q) => (q.uid === to.item ? { ...q, ...f } : q));
  else {
    const { enchDir: _side, ...tf } = f;
    void _side;
    nb.turrets = turretList(nb).map((t, k) => (k === to.turret ? { ...t, ...tf } : t)) as BuildTurret[];
  }
  return nb;
}
/** Put each word on the next piece that takes it and is still free (the words that find no piece are left out); returns the deck and how many landed. */
function assign(b: Build, words: string[]): { build: Build; placed: number } {
  let nb = b, placed = 0;
  const used = new Set<string>();
  for (const w of words) {
    const t = targets(nb, w).find((x) => !used.has(JSON.stringify(x.to)));
    if (!t) continue;
    used.add(JSON.stringify(t.to));
    nb = put(nb, t.to, { ench: w, ...(t.dir !== undefined ? { enchDir: t.dir } : {}) });
    placed++;
  }
  return { build: nb, placed };
}
/** The words an honest player could hold by `day`: warlord pick 1 (day 5) and pick 2 (day 8) when the day allows, then the ENCHANTER's offers in order. */
function honestWords(seed: number, day: number, bought: number): string[] {
  const out: string[] = [];
  if (day >= 5) out.push(warlordPickWords(seed, 5)[0]);
  if (day >= 8) out.push(warlordPickWords(seed, 8)[0]);
  const offers: string[] = [];
  for (let d = 3; d <= day; d++) offers.push(...enchanterWords(seed, d));
  return [...out, ...offers.slice(0, bought)];
}
const upSeed = (b: Build, day: number, seed: number, ctx: ValidateContext = {}) => on(() => validateUpload(b, day, RULES_VERSION, { seed, ...ctx }));
const enchErrors = (v: { errors: string[] }): string[] => v.errors.filter((e) => e.startsWith("enchant:"));

// ================================================================================================================== E6.1

describe("ENCHANT-1 E6.1: each word is one of the eight and sits on a kind it can go on (the piece check, in the player mode)", () => {
  it("legal words are accepted: a word on a rig, a factory, a signature factory and a turret, WIDE on a free side of a rig", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const v = up(handWords(n), 5);
      expect(v.ok, `${n} words: ${names(v)}`).toBe(true);
    }
    const v = up(handWords(6), 8); // six words: a rig, a WIDE rig, an X rig, a factory, the signature factory and a turret (day 8 allows 8)
    expect(v.ok, names(v)).toBe(true);
  });

  it("forged words are refused with the player's reason: MASSIVE and SWIFT on a rig, WIDE on an X, a shaped and a taken-side rig, no side, a stray side", () => {
    const refuse = (name: string, b: Build, re: RegExp, day = 5) => {
      const v = up(b, day);
      expect(v.ok, `${name} must be refused`).toBe(false);
      expect(names(v), name).toMatch(re);
    };
    refuse("rig-massive", deck({ 10: { ench: "massive" } }), /can't take MASSIVE: NOT ON A RIG/);
    refuse("rig-swift", deck({ 10: { ench: "swift" } }), /can't take SWIFT: NOT ON A RIG/);
    refuse("wide-x-rig", deck({ 13: { ench: "wide", enchDir: 1 } }), /can't take WIDE: NO FREE SIDE/);
    refuse("wide-taken-side", deck({ 12: { ench: "wide", enchDir: 1 } }), /can't take WIDE: NO FREE SIDE/);
    refuse("wide-no-side", deck({ 10: { ench: "wide" } }), /has WIDE but no side/);
    refuse("enchDir-on-a-factory", deck({ 11: { ench: "wide", enchDir: 1 } }), /only WIDE on a rig has a side/);
    const shaped = { ...deck(), items: [...deck().items, { uid: 14, def: "nailstrip", x: 5, y: 8, ench: "wide", enchDir: 0 } as Placed] };
    refuse("wide-shaped-rig", shaped, /NAIL STRIP can't take WIDE: NO FREE SIDE/);
    const supply = { ...deck(), items: [...deck().items, { uid: 14, def: "plating", x: 5, y: 8, ench: "fiery" } as Placed] };
    refuse("word-on-a-supply", supply, /can't take FIERY: NOT ON A SUPPLY/);
    const notTurret = withTurret(deck(), {}) as Build;
    notTurret.turrets = [{ slot: 0, def: "calibrate", uid: 90, ench: "fiery" }];
    refuse("word-in-the-turret-list-on-gear", notTurret, /is not a turret/);
  });

  it("the decoder refuses what no piece check could read: an unknown word, a word on gear, a stray enchDir, enchDir out of range", () => {
    const refuse = (name: string, b: Build, re: RegExp) => {
      const v = up(b, 5);
      expect(v.ok, `${name} must be refused`).toBe(false);
      expect(v.errors[0], name).toMatch(re);
    };
    refuse("unknown-word", deck({ 10: { ench: "keen" } }), /^shape: .*ench: expected one of/);
    refuse("enchDir-with-fiery", deck({ 10: { ench: "fiery", enchDir: 1 } }), /^shape: .*enchDir: only with WIDE/);
    refuse("enchDir-out-of-range", deck({ 10: { ench: "wide", enchDir: 4 } }), /^shape: .*enchDir: expected an integer in 0\.\.3/);
    const gear = { ...deck(), mods: [{ uid: 30, def: "calibrate", turret: 0, ench: "fiery" }] } as unknown as Build;
    refuse("word-on-gear", gear, /^shape: .*mods\[0\]\.ench: unknown field/);
    const core = Object.values(ITEMS).find((d) => d.kind === "core")!;
    const onCore = { ...deck(), mods: [{ uid: 30, def: core.id, turret: 0, ench: "fiery" }] } as unknown as Build;
    refuse("word-on-a-core", onCore, /^shape: .*mods\[0\]\.ench: unknown field/);
    refuse("turret-enchDir", { ...withTurret(deck(), { ench: "wide", enchDir: 1 }) }, /^shape: .*turrets\[0\]\.enchDir: unknown field/);
  });
});

// ================================================================================================================== E6.2

describe("ENCHANT-1 E6.2: the count is at most maxEnchantsByDay(day, LAST CHANCE took the part)", () => {
  const fake = (n: number): Build => ({
    hero: "furnace", routes: [], mods: [], beltCap: 14, hullBonus: 0,
    items: Array.from({ length: n }, (_, i) => ({ uid: i + 1, def: "whetstone", x: 0, y: 0, ench: "fiery" })),
  });

  it("the formula by day, with and without LAST CHANCE's part: the bound is accepted, one more is refused, days 1-14", () => {
    on(() => {
      for (let day = 1; day <= 14; day++) {
        for (const part of [false, true]) {
          const most = maxEnchantsByDay(day, part);
          const lc = part ? lcPart(1) : undefined;
          const atMost = enchantProblems(fake(most), day, { ...(lc ? { lastChance: lc } : {}) });
          expect(atMost.filter((e) => /allows at most/.test(e)), `day ${day} part ${part}: ${most} words`).toEqual([]);
          const over = enchantProblems(fake(most + 1), day, { ...(lc ? { lastChance: lc } : {}) });
          expect(over.filter((e) => /allows at most/.test(e)), `day ${day} part ${part}: ${most + 1} words`).toEqual([`enchant: ${most + 1} enchanted part${most + 1 === 1 ? "" : "s"}, but day ${day} allows at most ${most}${part ? " with LAST CHANCE's part" : ""}`]);
        }
      }
      // the bound's parts: 2 per ENCHANTER day up to the day, 1 pick from day 5, 2 from day 8, 1 for LAST CHANCE's part
      expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => maxEnchantsByDay(d, false))).toEqual([0, 0, 2, 2, 5, 5, 7, 8, 10, 10]);
      expect(maxEnchantsByDay(10, true)).toBe(11);
    });
  });

  it("through validateUpload: day 2 holds none, day 3-4 two, day 5 five (six with LAST CHANCE's part); one more is refused with the bound named", () => {
    const refusedFor = (n: number, day: number, ctx: ValidateContext = {}) => /allows at most (\d+)/.exec(names(up(handWords(n), day, ctx)))?.[1];
    expect(refusedFor(1, 2)).toBe("0"); // days 1-2 have no source at all
    for (const day of [3, 4]) {
      expect(refusedFor(2, day), `day ${day}, 2 words`).toBeUndefined();
      expect(refusedFor(3, day), `day ${day}, 3 words`).toBe("2");
    }
    expect(up(handWords(5), 5).ok, names(up(handWords(5), 5))).toBe(true);
    expect(refusedFor(6, 5)).toBe("5");
    // LAST CHANCE took the part: one more word, and the part is free (the budget grants its price)
    expect(refusedFor(6, 5, { lastChance: lcPart(3) })).toBeUndefined();
    const withPart = up(handWords(6), 5, { lastChance: lcPart(3) });
    expect(withPart.ok, names(withPart)).toBe(true);
    // a LAST CHANCE that took a rune or the hull gives no word
    expect(refusedFor(6, 5, { lastChance: { day: 3, boon: "hull" } })).toBe("5");
  });
});

// ================================================================================================================== E6.3

describe("ENCHANT-1 E6.3: each held word was on offer (re-derived from the run seed), and each offer is used once", () => {
  it("an honest deck holds only words its run could have got: accepted for 4 heroes x 6 seeds x days 3-10 (no enchant error)", () => {
    let decks = 0;
    for (const hero of HEROS) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = parRunSeed(hero, seed);
        for (const day of [3, 4, 5, 6, 8, 10]) {
          const { build, placed } = assign(par(hero, seed, day), honestWords(s, day, 4));
          if (!placed) continue;
          decks++;
          const v = upSeed(build, day, s);
          expect(enchErrors(v), `${hero} seed ${seed} day ${day}: ${placed} honest words`).toEqual([]);
        }
      }
    }
    expect(decks).toBeGreaterThan(100);
  });

  it("an honest deck is accepted whole (weaver, seed 1: days 3, 5, 10) and its word's budget fits", () => {
    for (const day of [3, 5, 8, 10]) {
      const s = parRunSeed("weaver", 1);
      const { build, placed } = assign(par("weaver", 1, day), honestWords(s, day, 3));
      expect(placed, `day ${day}`).toBeGreaterThanOrEqual(2);
      const v = upSeed(build, day, s);
      expect(v.ok, `day ${day}: ${names(v)}`).toBe(true);
    }
  });

  it("a word the seed never offers by that day is refused, with a short reason (forged on a legal piece, every hero and seed)", () => {
    let forged = 0;
    for (const hero of HEROS) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = parRunSeed(hero, seed);
        for (const day of [3, 4, 5, 6]) {
          const never = ENCHANT_IDS.filter((w) => !possibleWords(s, day).has(w));
          for (const w of never) {
            const t = targets(par(hero, seed, day), w)[0];
            if (!t) continue;
            forged++;
            const v = upSeed(put(par(hero, seed, day), t.to, { ench: w, ...(t.dir !== undefined ? { enchDir: t.dir } : {}) }), day, s);
            expect(v.ok, `${hero} seed ${seed} day ${day}: ${w}`).toBe(false);
            expect(enchErrors(v).join(" | "), `${hero} seed ${seed} day ${day}: ${w}`).toMatch(new RegExp(`holds ${w.toUpperCase()}, which this run's seed did not offer by day ${day}`));
          }
        }
      }
    }
    expect(forged).toBeGreaterThan(100);
  });

  it("days 1-2 have no source: any word is refused on count and on offer; without the seed only the count is judged (a served ghost, a stand-in)", () => {
    const s = parRunSeed("weaver", 1);
    const t = targets(par("weaver", 1, 2), "fiery")[0];
    const b = put(par("weaver", 1, 2), t.to, { ench: "fiery" });
    const v = upSeed(b, 2, s);
    expect(v.ok).toBe(false);
    expect(names(v)).toMatch(/1 enchanted part, but day 2 allows at most 0/);
    expect(names(v)).toMatch(/holds FIERY, which this run's seed did not offer by day 2/);
    // no seed: the offers are not re-derived (the count still is)
    const noSeed = on(() => validateUpload(b, 2, RULES_VERSION, {}));
    expect(names(noSeed)).toMatch(/allows at most 0/);
    expect(names(noSeed)).not.toMatch(/did not offer/);
    const day4 = put(par("weaver", 1, 4), targets(par("weaver", 1, 4), "rising")[0].to, { ench: "rising" }); // seed 1 never offers RISING by day 4
    expect(enchErrors(on(() => validateUpload(day4, 4, RULES_VERSION, {}))), "no seed, no offer check").toEqual([]);
    expect(enchErrors(upSeed(day4, 4, s)).join()).toMatch(/holds RISING, which this run's seed did not offer by day 4/);
  });

  it("a word is taken once per offer: more copies of a word than the seed offered slots for are refused (the slots)", () => {
    let forged = 0;
    for (const hero of HEROS) {
      for (let seed = 1; seed <= 8; seed++) {
        const s = parRunSeed(hero, seed);
        for (const day of [5, 6, 8, 10]) {
          // the slots that can give a word: each ENCHANTER offer of it, and a pick slot when some pick day offers it (pick 1 from day 5, pick 2 from day 8)
          const slots = (w: string): number => {
            let n = 0;
            const picks1 = new Set<string>(), picks2 = new Set<string>();
            for (let d = 1; d <= day; d++) {
              n += enchanterWords(s, d).filter((x) => x === w).length;
              if (d >= 5) warlordPickWords(s, d).forEach((x) => picks1.add(x));
              if (d >= 8) warlordPickWords(s, d).forEach((x) => picks2.add(x));
            }
            return n + (picks1.has(w) ? 1 : 0) + (picks2.has(w) ? 1 : 0);
          };
          for (const w of ["fiery", "rising", "growing", "echoing", "braced"]) {
            const k = slots(w);
            if (k < 1 || k + 1 > maxEnchantsByDay(day, false)) continue;
            const b = par(hero, seed, day);
            const ts = targets(b, w);
            if (ts.length < k + 1) continue;
            const hold = (n: number): Build => ts.slice(0, n).reduce((acc, t) => put(acc, t.to, { ench: w }), b);
            forged++;
            expect(enchErrors(upSeed(hold(k), day, s)), `${hero} seed ${seed} day ${day}: ${k} x ${w} (all its slots)`).toEqual([]);
            const v = upSeed(hold(k + 1), day, s);
            expect(v.ok, `${hero} seed ${seed} day ${day}: ${k + 1} x ${w}`).toBe(false);
            expect(enchErrors(v).join(" | "), `${hero} seed ${seed} day ${day}: ${k + 1} x ${w}`).toMatch(new RegExp(`holds ${w.toUpperCase()}, but the seed's offers of it by day ${day} are used up by other parts`));
          }
        }
      }
    }
    expect(forged).toBeGreaterThan(40);
  });

  it("LAST CHANCE's part brings its own word, on that part: accepted there, refused on another part, with another word, or when LAST CHANCE took no part", () => {
    const rigs = lastChanceParts().filter((d) => d.kind === "gate"), turrets = lastChanceParts().filter((d) => d.kind === "turret");
    expect(rigs.length + turrets.length).toBeGreaterThan(0);
    const fakeOf = (items: Partial<Placed>[]): Build => ({
      hero: "furnace", routes: [], mods: [], beltCap: 14, hullBonus: 0,
      items: items.map((p, i) => ({ uid: i + 1, def: "whetstone", x: 0, y: 0, ...p })),
    });
    let checked = 0, wides = 0;
    on(() => {
      for (let seed = 1; seed <= 40; seed++) {
        for (const d of [...rigs, ...turrets]) {
          const lcDay = 1, day = 2; // days 1-2 have no other source: LAST CHANCE's word is the only word this deck can hold
          const w = lastChanceWord(seed, lcDay, d.id)!;
          const lc: TakenLastChance = { day: lcDay, boon: "part", id: d.id };
          const piece = (def: string, f: Partial<Placed>): Build => fakeOf([{ def, ...f }]);
          const hold = d.kind === "gate" ? piece(d.id, { ench: w.ench, ...(w.enchDir !== undefined ? { enchDir: w.enchDir } : {}) }) : ({ ...fakeOf([]), turrets: [{ slot: 0, def: d.id, uid: 1, ench: w.ench }] } as Build);
          expect(enchantProblems(hold, day, { seed, lastChance: lc }), `seed ${seed} ${d.id}: its own word on the part`).toEqual([]);
          checked++;
          // LAST CHANCE took no part: the same word is not on offer on day 2
          expect(enchantProblems(hold, day, { seed }).join(" | "), `seed ${seed} ${d.id}: no LAST CHANCE`).toMatch(/did not offer/);
          // another word on the part: not on offer
          const other = ENCHANT_IDS.find((x) => x !== w.ench && enchantProblem(d, x) === null)!;
          const otherHold = d.kind === "gate" ? piece(d.id, { ench: other, ...(other === "wide" ? { enchDir: freeSides(d)[0] } : {}) }) : ({ ...fakeOf([]), turrets: [{ slot: 0, def: d.id, uid: 1, ench: other }] } as Build);
          expect(enchantProblems(otherHold, day, { seed, lastChance: lc }).join(" | "), `seed ${seed} ${d.id}: another word`).toMatch(/did not offer/);
          // its word on a different part: the word was LAST CHANCE's, on that part
          if (d.kind === "gate") {
            const elsewhere = d.id === "whetstone" ? "longhaul" : "whetstone"; // any other rig that can take the word (WIDE on its first free side)
            const moved = piece(elsewhere, { ench: w.ench, ...(w.ench === "wide" ? { enchDir: freeSides(elsewhere)[0] } : {}) });
            expect(enchantProblems(moved, day, { seed, lastChance: lc }).join(" | "), `seed ${seed} ${d.id}: its word on another part`).toMatch(/are used up by other parts/);
          }
          // WIDE on a rig keeps LAST CHANCE's seeded side
          if (w.ench === "wide" && d.kind === "gate") {
            wides++;
            const wrong = freeSides(d).find((s) => s !== w.enchDir);
            if (wrong !== undefined) {
              expect(enchantProblems(piece(d.id, { ench: "wide", enchDir: wrong }), day, { seed, lastChance: lc }).join(" | "), `seed ${seed} ${d.id}: the wrong side`).toMatch(/are used up by other parts/);
            }
          }
        }
      }
    });
    expect(checked).toBeGreaterThan(100);
    expect(wides).toBeGreaterThan(0);
    // the SIDE: every epic LAST CHANCE rig has one free side, so the seeded side cannot be told from the other there; the check reads
    // the part's id as given, so a rig with two free sides (LONG HAUL, II) shows it: the seeded side passes, the other free side is refused
    let sided = 0;
    on(() => {
      for (let seed = 1; seed <= 200 && sided < 5; seed++) {
        const w = lastChanceWord(seed, 1, "longhaul");
        if (w?.ench !== "wide" || w.enchDir === undefined) continue;
        sided++;
        const lc: TakenLastChance = { day: 1, boon: "part", id: "longhaul" };
        const wrong = freeSides("longhaul").find((s) => s !== w.enchDir)!;
        expect(enchantProblems(fakeOf([{ def: "longhaul", ench: "wide", enchDir: w.enchDir }]), 2, { seed, lastChance: lc }), `seed ${seed}: its seeded side`).toEqual([]);
        expect(enchantProblems(fakeOf([{ def: "longhaul", ench: "wide", enchDir: wrong }]), 2, { seed, lastChance: lc }).join(" | "), `seed ${seed}: the other free side`).toMatch(/are used up by other parts/);
      }
    });
    expect(sided).toBeGreaterThan(0);
  });

  it("LAST CHANCE through validateUpload: a rig part placed with its seeded word is accepted; the same deck without the taken part is refused", () => {
    let found = 0;
    for (const hero of HEROS) {
      for (let seed = 1; seed <= 12 && found < 3; seed++) {
        const s = parRunSeed(hero, seed);
        for (let lcDay = 1; lcDay <= 2 && found < 3; lcDay++) {
          const day = lcDay + 1;
          const b = par(hero, seed, day);
          const offer = lastChanceOffer(s, lcDay, hero, (b.runes ?? []).map((q) => q.id).slice(0, lcDay));
          const d = offer.part ? ITEMS[offer.part] : undefined;
          if (!d || d.kind !== "gate" || b.items.some((p) => p.def === d.id)) continue;
          // a free cell for the part (canPlaceItem is the editor's rule)
          let cell: [number, number] | undefined;
          for (let y = 0; y < GRID && !cell; y++) for (let x = 0; x < GRID && !cell; x++) if (canPlaceItem(b, d.id, x, y, -1, 0).ok) cell = [x, y];
          const word = lastChanceWord(s, lcDay, d.id);
          if (!cell || !word) continue;
          const held: Build = { ...b, items: [...b.items, { uid: 900, def: d.id, x: cell[0], y: cell[1], ench: word.ench, ...(word.enchDir !== undefined ? { enchDir: word.enchDir } : {}) }] };
          const lc: TakenLastChance = { day: lcDay, boon: "part", id: d.id };
          const ok = upSeed(held, day, s, { lastChance: lc });
          expect(enchErrors(ok), `${hero} seed ${seed} LC day ${lcDay} ${d.id}`).toEqual([]);
          expect(ok.ok, `${hero} seed ${seed} LC day ${lcDay} ${d.id}: ${names(ok)}`).toBe(true);
          const without = upSeed(held, day, s); // the snapshot does not say LAST CHANCE took the part
          expect(without.ok).toBe(false);
          expect(names(without)).toMatch(/enchant: /);
          found++;
        }
      }
    }
    expect(found, "at least one (hero, seed) fixture with a rig part").toBeGreaterThan(0);
  });
});

// ================================================================================================================== E6.4

describe("ENCHANT-1 E6.4: gold - every word past the free sources' bound costs 4 G in buildCost, so the day's budget covers it", () => {
  it("buildCost: unchanged without the argument, with ENCHANT off, and for a deck without a word; the words past the free ones add enchants and total", () => {
    const b = handWords(4);
    const plain = deck();
    const base = buildCost(plain);
    expect(Object.keys(base)).toEqual(["items", "mods", "crates", "plates", "total"]);
    // no argument: no term, on or off
    expect(JSON.stringify(on(() => buildCost(b)))).toBe(JSON.stringify(off(() => buildCost(b))));
    // off: nothing sees the words, whatever the argument
    expect(JSON.stringify(off(() => buildCost(b, 0)))).toBe(JSON.stringify(buildCost(b)));
    // a deck with no word: the same object with any argument, on or off
    for (const free of [0, 1, 5]) {
      expect(JSON.stringify(on(() => buildCost(plain, free)))).toBe(JSON.stringify(base));
      expect(JSON.stringify(off(() => buildCost(plain, free)))).toBe(JSON.stringify(base));
    }
    // on: 4 words, 1 free -> 3 bought = 12 G
    const c = on(() => buildCost(b, 1));
    expect(c.enchants).toBe(3 * ENCHANTER_PRICE);
    expect(c.total).toBe(buildCost(b).total + 12);
    expect(Object.keys(c)).toEqual(["items", "mods", "crates", "plates", "turrets", "enchants", "total"]);
    expect(on(() => buildCost(b, 4)).enchants).toBeUndefined(); // all four free: nothing bought
    expect(on(() => buildCost(b, 9)).total).toBe(buildCost(b).total);
    expect(on(() => enchantGold(b, 0))).toBe(16);
    expect(off(() => enchantGold(b, 0))).toBe(0);
    expect(enchantFreeWords(4, undefined)).toBe(0);
    expect(enchantFreeWords(5, undefined)).toBe(1);
    expect(enchantFreeWords(10, lcPart())).toBe(freeEnchantsByDay(10, true));
    expect(enchantFreeWords(10, { day: 2, boon: "rune", id: "x" })).toBe(freeEnchantsByDay(10, false));
  });

  it("the player mode: a deck exactly at maxHonestSpend passes with its bought words, 1 G over is refused, and the same supplies without the words pass", () => {
    for (const day of [5, 8]) {
      const n = freeEnchantsByDay(day, false) + 2; // two words bought at the ENCHANTER
      const words = handWords(n), plain = handWords(0);
      const paid = 2 * ENCHANTER_PRICE;
      const gap = maxHonestSpend(day) - buildCost(words).total - paid; // what supplies may still add
      expect(gap, `day ${day}`).toBeGreaterThanOrEqual(8);
      const [p0, c0] = mix(gap), [p1, c1] = mix(gap + 1);
      const at = up(supplied(words, p0, c0), day);
      expect(at.ok, `day ${day} at the line: ${names(at)}`).toBe(true);
      expect(buildCost(supplied(words, p0, c0)).total + paid).toBe(maxHonestSpend(day));
      const over = up(supplied(words, p1, c1), day);
      expect(over.ok, `day ${day} 1 G over`).toBe(false);
      expect(over.errors.map((e) => e.split(":")[0])).toEqual(["budget"]);
      expect(names(over)).toMatch(/that includes 8 gold for 2 enchantments past the \d+ free: 4 each at the ENCHANTER/);
      // the same plates and crates with no word: under the line
      const bare = up(supplied(plain, p1, c1), day);
      expect(bare.ok, `day ${day} without the words: ${names(bare)}`).toBe(true);
      // a deck holding only the free words costs nothing extra: the same supplies pass with them
      const free = handWords(freeEnchantsByDay(day, false));
      expect(up(supplied(free, p1, c1), day).ok, `day ${day}: the free words are free`).toBe(true);
    }
  });

  it("the strict mode counts them too: maxGoldByDay covers the bought words and not a word more", () => {
    const day = 5, words = handWords(freeEnchantsByDay(day, false) + 2), paid = 8;
    const gap = maxGoldByDay(day) - buildCost(words).total - paid;
    expect(gap).toBeGreaterThanOrEqual(8);
    const [p0, c0] = mix(gap), [p1, c1] = mix(gap + 1);
    const strict = (b: Build) => on(() => validateBuild(b, day, "strict"));
    expect(strict(supplied(words, p0, c0)).ok, names(strict(supplied(words, p0, c0)))).toBe(true);
    const over = strict(supplied(words, p1, c1));
    expect(over.ok).toBe(false);
    expect(names(over)).toMatch(/^budget: build costs \d+ gold \(items \d+, mods \d+, \d+ crates, \d+ plating, enchantments 8\) but day 5 allows at most/);
    expect(strict(supplied(handWords(0), p1, c1)).ok).toBe(true);
  });

  it("with LAST CHANCE's part one more word is free: the part's word costs nothing, the next one costs 4 G", () => {
    const day = 5, lc = lcPart(3);
    const free = freeEnchantsByDay(day, true); // 1 pick + the part
    expect(free).toBe(2);
    const b = handWords(free + 1);
    expect(on(() => buildCost(b, enchantFreeWords(day, lc))).enchants).toBe(ENCHANTER_PRICE);
    expect(on(() => buildCost(b, enchantFreeWords(day, undefined))).enchants).toBe(2 * ENCHANTER_PRICE);
  });
});

// ================================================================================================================== E6.5

describe("ENCHANT-1 E6.5: GROWING's counter is at most day - 1 and sits only on a piece that holds GROWING", () => {
  it("the bound is the dusk fights fought before the snapshot: day - 1 passes, day is refused, on a rig, a factory and a turret (days 1-12)", () => {
    const pieces: [string, (g: number) => Build][] = [
      ["rig", (g) => deck({ 10: { ench: "growing", grow: g } })],
      ["factory", (g) => deck({ 11: { ench: "growing", grow: g } })],
      ["signature factory", (g) => deck({ [KILN]: { ench: "growing", grow: g } })],
      ["turret", (g) => withTurret(deck(), { ench: "growing", grow: g })],
    ];
    on(() => {
      for (let day = 1; day <= 12; day++) {
        for (const [name, at] of pieces) {
          // grow 1.. day - 1 are fought dusks; none of them is a grow problem (a count problem is E6.2's, so only the grow lines are read)
          for (const g of [1, day - 1].filter((x) => x >= 1 && x <= day - 1)) {
            expect(enchantProblems(at(g), day).filter((e) => /grow/.test(e)), `${name} grow ${g} on day ${day}`).toEqual([]);
          }
          const bad = enchantProblems(at(day), day).filter((e) => /grow/.test(e));
          expect(bad, `${name} grow ${day} on day ${day}`).toHaveLength(1);
          expect(bad[0], `${name} grow ${day} on day ${day}`).toMatch(new RegExp(`has grow ${day}, but only ${day - 1} dusk fight${day - 1 === 1 ? "" : "s"} came before day ${day}$`));
        }
      }
    });
    // whole verdicts in the player mode, on a day that can hold the word: grow 4 on day 5 passes, grow 5 does not
    const five = (g: number) => up(deck({ 10: { ench: "growing", grow: g } }), 5);
    expect(five(4).ok, names(five(4))).toBe(true);
    expect(five(5).ok).toBe(false);
    expect(names(five(5))).toMatch(/uid 10 WHETSTONE has grow 5, but only 4 dusk fights came before day 5/);
    const turret = up(withTurret(deck(), { ench: "growing", grow: 9 }), 9);
    expect(turret.ok).toBe(false);
    expect(names(turret)).toMatch(/uid 90 SCRAP CANNON has grow 9, but only 8 dusk fights came before day 9/);
  });

  it("grow only on a piece holding GROWING: the decoder refuses it elsewhere, and the check says the same for a caller that skipped the decoder", () => {
    const stray = (b: Build) => up(b, 6);
    expect(names(stray(deck({ 10: { ench: "fiery", grow: 2 } })))).toMatch(/^shape: .*grow: not in this rules version yet/);
    expect(names(stray(deck({ 10: { grow: 2 } as unknown as { ench: string } })))).toMatch(/^shape: .*grow: not in this rules version yet/);
    expect(names(stray(withTurret(deck(), { ench: "massive", grow: 2 })))).toMatch(/^shape: .*grow: not in this rules version yet/);
    const gearGrow = { ...deck(), mods: [{ uid: 30, def: "calibrate", turret: 0, grow: 1 }] } as unknown as Build;
    expect(names(stray(gearGrow))).toMatch(/^shape: .*mods\[0\]\.grow: not in this rules version yet/);
    // the check itself (a deck built in memory, no decoder)
    const raw: Build = { ...deck(), items: deck().items.map((p) => (p.uid === 10 ? { ...p, ench: "fiery", grow: 2 } : p)) };
    expect(on(() => enchantProblems(raw, 6)).join(" | ")).toBe("enchant: uid 10 WHETSTONE has a grow counter but holds no GROWING");
    const rawNoWord: Build = { ...deck(), items: deck().items.map((p) => (p.uid === 10 ? { ...p, grow: 1 } : p)) };
    expect(on(() => enchantProblems(rawNoWord, 6)).join(" | ")).toBe("enchant: uid 10 WHETSTONE has a grow counter but holds no GROWING");
  });
});

// ================================================================================================================== off, and older rules

describe("ENCHANT-1 E6: off, or under rules without ENCHANT, every ench, enchDir and grow is refused as today; a deck without a word is untouched", () => {
  const fixtures = (): [string, Build][] => [
    ["rig word", deck({ 10: { ench: "fiery" } })],
    ["rig WIDE with its side", deck({ 12: { ench: "wide", enchDir: 0 } })],
    ["factory word", deck({ 11: { ench: "massive" } })],
    ["GROWING with its counter", deck({ 10: { ench: "growing", grow: 2 } })],
    ["turret word", withTurret(deck(), { ench: "braced" })],
    ["a stray enchDir", deck({ 10: { ench: "fiery", enchDir: 1 } })],
    ["a stray grow", deck({ 10: { ench: "fiery", grow: 1 } })],
    ["a word on gear", { ...deck(), mods: [{ uid: 30, def: "calibrate", turret: 0, ench: "fiery" }] } as unknown as Build],
  ];

  it("switch off: the rules gate refuses every one, whatever the day, the seed or the LAST CHANCE", () => {
    for (const [name, b] of fixtures()) {
      for (const day of [3, 5, 10]) {
        const v = off(() => validateUpload(withDawnRunes(b, day), day, RULES_VERSION, { seed: 7 }));
        expect(v.ok, `${name} day ${day}`).toBe(false);
        expect(v.errors, `${name} day ${day}`).toEqual(["rules: enchantments (ench, enchDir, grow): not in this rules version yet"]);
      }
      expect(off(() => validateBuild(withDawnRunes(b, 5), 5, "player")).errors[0], name).toMatch(/^shape: .*(ench|enchDir|grow)/);
      expect(off(() => validateBuild(withDawnRunes(b, 5), 5, "strict")).errors[0], name).toMatch(/^shape: .*(ench|enchDir|grow)/);
    }
  });

  it("older rules: ENCHANT on but the snapshot's rules predate ENCHANT_RULES, so every one is refused naming both versions", () => {
    expect(ENCHANT_RULES).toBe(RULES_VERSION);
    for (const [name, b] of fixtures()) {
      const v = on(() => validateUpload(withDawnRunes(b, 5), 5, "bb-0.10.0", {}));
      expect(v.ok, name).toBe(false);
      expect(v.errors[0], name).toMatch(/^rules: rules bb-0\.10\.0 predate bb-0\.11\.0: enchantments \(ench, enchDir, grow\) need bb-0\.11\.0 or later$/);
    }
  });

  it("a deck without a word is judged and costed byte for byte the same on and off (hand deck, five par decks)", () => {
    const same = (b: Build, day: number, ctx: ValidateContext = {}) => {
      const a = off(() => validateUpload(b, day, RULES_VERSION, ctx)), c = on(() => validateUpload(b, day, RULES_VERSION, ctx));
      expect(JSON.stringify(c)).toBe(JSON.stringify(a));
      for (const free of [undefined, 0, 2]) expect(JSON.stringify(on(() => buildCost(b, free)))).toBe(JSON.stringify(off(() => buildCost(b, free))));
      return a;
    };
    expect(same(withDawnRunes(deck(), 5), 5).ok).toBe(true);
    for (const day of [1, 3, 5, 8, 10]) {
      const s = parRunSeed("weaver", 1);
      expect(same(par("weaver", 1, day), day, { seed: s }).ok, `day ${day}`).toBe(true);
    }
  });
});

// ================================================================================================================== the pin test

/** The fixtures every judge sees: a day-10 WEAVER par deck (made with ENCHANT off: no words) with words put on its pieces. `ok` is the
 *  verdict with ENCHANT on under this build's rules; with it off every one is refused. */
function pinFixtures(): { name: string; s: GhostSnapshot; ok: boolean; why?: RegExp; plain?: true }[] {
  const hero: HeroId = "weaver", seed = 1, day = 10, rs = parRunSeed(hero, seed);
  const rec = reachableRecords(day).find((r) => r.wins === day - 1) ?? reachableRecords(day)[0];
  const snap = (name: string, build: Build): GhostSnapshot => ({
    v: SNAPSHOT_V3, rules: RULES_VERSION, hero, day, wins: rec.wins, lives: rec.lives, build, runId: `enchant1-e6-${name}`, playerId: "p-enchant1-e6", createdAt: 1_790_000_000_000,
    seed: rs, ...(longRunFor(RULES_VERSION) ? { losses: day - 1 - rec.wins } : {}),
  });
  const base = par(hero, seed, day);
  const offered = ENCHANT_IDS.filter((w) => possibleWords(rs, day).has(w)), never = ENCHANT_IDS.filter((w) => !possibleWords(rs, day).has(w));
  const legalTwo = offered.filter((w) => w !== "massive" && w !== "swift" && w !== "wide"); // legal on every kind
  const out: { name: string; s: GhostSnapshot; ok: boolean; why?: RegExp; plain?: true }[] = [];
  const add = (name: string, build: Build, ok: boolean, why?: RegExp, plain?: true) => out.push({ name, s: snap(name, build), ok, why, ...(plain ? { plain } : {}) });
  const one = (w: string, f: { grow?: number } = {}) => { const t = targets(base, w)[0]; return put(base, t.to, { ench: w, ...(t.dir !== undefined ? { enchDir: t.dir } : {}), ...f }); };
  // legal, offered, counted, paid for
  add("honest-1", one(legalTwo[0]), true);
  add("honest-wide", one("wide"), offered.includes("wide"));
  add("honest-factory-massive", one("massive"), offered.includes("massive"));
  add("honest-growing-9", one("growing", { grow: 9 }), offered.includes("growing"));
  add("honest-4-words", assign(base, honestWords(rs, day, 2)).build, true);
  // forged
  add("never-offered", one(never[0] ?? "braced"), never.length === 0, /did not offer/);
  add("grow-past-the-bound", one("growing", { grow: 10 }), false, /has grow 10, but only 9 dusk fights came before day 10/);
  add("rig-massive", put(base, { item: base.items.find((p) => ITEMS[p.def].kind === "gate")!.uid }, { ench: "massive" }), false, /NOT ON A RIG/);
  const eleven = assign(base, Array.from({ length: 12 }, () => legalTwo[0]));
  add("over-the-count", eleven.build, false, new RegExp(`${eleven.placed} enchanted parts, but day 10 allows at most 10`));
  add("grow-on-fiery", one("fiery", { grow: 1 }), false);
  add("enchDir-on-fiery", put(base, targets(base, "fiery")[0].to, { ench: "fiery", enchDir: 1 }), false);
  add("unknown-word", put(base, targets(base, "fiery")[0].to, { ench: "keen" }), false);
  // gold: the most plates the plain deck can carry, then bought words past the free ones tip it over
  const plates = (k: number): Build => ({ ...base, hullBonus: base.hullBonus + k * PLATE });
  let k = 0;
  while (on(() => validateUpload(plates(k + 1), day, RULES_VERSION, { seed: rs })).ok && k < 400) k++;
  add("squeezed-plain", plates(k), true, undefined, true); // no word: accepted in both switch states
  add("squeezed-free-words-only", assign(plates(k), honestWords(rs, day, 0)).build, true); // the two picks' words cost nothing
  add("squeezed-two-bought-words", assign(plates(k), honestWords(rs, day, 2)).build, false, /budget: build costs/); // two offers bought: 8 G the line has not got
  return out;
}

describe("ENCHANT-1 E6 PIN: the client's shape check, the strict decoder, the client's full check and POST /v1/ghosts say the same, in both switch states", () => {
  let dir: string;
  let app: GhostServer;
  let base: string;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bb-enchant1-e6-"));
    app = createGhostServer({ dataDir: dir, origins: ["http://127.0.0.1:7778"], rateLimit: { windowMs: 60_000, max: 1000 }, log: () => {}, matchSalt: () => 0 });
    base = `http://127.0.0.1:${await app.listen(0)}`;
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("the fixtures hold each kind of word, the bound, the offers, the counter and the gold", () => {
    const fx = pinFixtures();
    const names = fx.map((f) => f.name);
    for (const n of ["honest-1", "never-offered", "grow-past-the-bound", "over-the-count", "squeezed-two-bought-words", "squeezed-free-words-only"]) expect(names, n).toContain(n);
    expect(fx.filter((f) => f.ok).length).toBeGreaterThanOrEqual(6);
    expect(fx.filter((f) => !f.ok).length).toBeGreaterThanOrEqual(6);
  });

  it("each fixture: shape (client = decoder), the full check, and the server's status agree; the verdict is the listed one with ENCHANT on, a refusal with it off", async () => {
    const fx = pinFixtures();
    const me = await testIdentity(0);
    const rows: string[] = [];
    for (const state of [true, false]) {
      setEnchant(state);
      for (const f of fx) {
        const body = JSON.stringify({ ...ownedBy(f.s, me), runId: `${f.s.runId}-${state ? "on" : "off"}` });
        const s = JSON.parse(body) as GhostSnapshot; // every judge sees exactly the bytes the server gets
        const clientShape = isSnapshot(s);
        let decoder = true;
        try { checkSnapshot(s); } catch { decoder = false; }
        const client = validateUpload(s.build, s.day, s.rules, { seed: s.seed });
        const r = await fetch(`${base}/v1/ghosts`, { method: "POST", headers: await signedHeaders(me, body), body });
        const text = await r.text();
        rows.push(`${state ? "on " : "off"} ${f.name}: shape ${clientShape ? "ok" : "no"}/${decoder ? "ok" : "no"} | upload ${client.ok ? "ok" : client.errors[0]} | server ${r.status}${r.status === 201 ? "" : ` ${text.slice(0, 120)}`}`);
        const at = `${f.name} ${state ? "on" : "off"}`;
        expect(clientShape, `${at}: the client's shape check = the strict decoder`).toBe(decoder);
        expect(r.status === 201, `${at}: server ${r.status} ${text.slice(0, 300)} vs shape ${decoder} and upload ${JSON.stringify(client.errors)}`).toBe(decoder && client.ok);
        expect(decoder && client.ok, `${at}: ${JSON.stringify(client.errors)}`).toBe(f.plain ? f.ok : state && f.ok); // a deck without a word is judged the same in both states
        if (f.plain) expect(r.status, `${at}: a deck without a word is accepted in both states`).toBe(201);
        if (state && f.why) expect(client.errors.join(" | "), at).toMatch(f.why);
      }
    }
    setEnchant(ENCHANT);
    for (const r of rows) console.log(`E6 PIN ${r}`);
    expect(rows.filter((r) => r.startsWith("off") && r.includes("honest-1:"))[0]).toContain("not in this rules version yet");
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("never-offered:"))[0]).toContain("did not offer");
    expect(rows.filter((r) => r.startsWith("on ") && r.includes("squeezed-free-words-only:"))[0]).toContain("server 201");
  }, 300_000);
});
