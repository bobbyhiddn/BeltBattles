// ENCHANT-1 (REQ-BFG-085; BRIEF-ENCHANT1 E1, E2; step 2): the switch, the rules gate, the legal kinds, the data (Placed.ench / enchDir,
// BuildTurret.ench, cargo, GROWING's `grow`), the snapshot (the strict decoder and the client's check, in both switch states and under
// older rules), the stand-in word `~<code>` (both codecs) and the validators. ENCHANT ships off: every switch-off pin is untouched.
// ENCHANT-1b (N1): MASSIVE goes on a TURRET only and SWIFT on a FACTORY only (the other six keep rig, factory and turret): the other kinds
// refuse them with `ONLY ON A TURRET` / `ONLY ON A FACTORY`, and enchantLine is null there.
import { afterEach, describe, expect, it } from "vitest";
// deck.ts first (the ship's load order: ITEMS' key order is part of the seeded draws)
import { cloneBuild, arrowsOf, rigHits, setTurretList, turretSlots, installedTurrets, type Build, type Placed } from "../src/sim/deck";
import { ITEMS, RULES_VERSION } from "../src/sim/content";
import {
  ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, ENCHANT_KINDS, ENCHANT_NUM, enchantCodeOf, enchantField, enchantIdOfCode, enchantLine, enchantProblem, enchantRate,
  enchantRules, enchantShare, freeSides, growPieces, isEnchantId, setEnchant, wideSlots, withEnchant,
} from "../src/sim/enchant";
import { ENCHANT_RULES, enchantFeatures, enchantGateProblem, enchantWorld, rulesAtLeast } from "../src/net/rulesGate";
import { SNAPSHOT_V3, checkSnapshot, decodeSnapshot, encodeSnapshot, type GhostSnapshot } from "../src/net/snapshot";
import { isSnapshot } from "../src/game/ghostSnapshot";
import { validateBuild, validateUpload } from "../src/net/validate";
import { heroStartBuild } from "../src/sim/heroBuilds";
import { decodeStarred, decodeStarredRaw, encodeStandIn, encodeStarred } from "../src/sim/standInPool";
import { decodeStarred as decodeH, encodeStarred as encodeH } from "../src/sim/harness/standinCode";
import { newRun, storePlaced, storeTurret, installFromCargo, takeFromInventory } from "../src/game/run";
import { withDawnRunes } from "./runeFill"; // the player mode wants the dawns' runes (one a dawn)

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const off = <T>(fn: () => T): T => withEnchant(fn, false);

/** FURNACE's starting deck plus a rig (WHETSTONE, an I rig), a STAMP PRESS, a LONG HAUL (II) and an OVERDRIVE (X); returns the build. */
function deck(over: { ench?: Partial<Record<number, { ench: string; enchDir?: number; grow?: number }>> } = {}): Build {
  const b = heroStartBuild("furnace");
  const items: Placed[] = [
    ...b.items,
    { uid: 10, def: "whetstone", x: 1, y: 5 }, { uid: 11, def: "press", x: 7, y: 7 }, { uid: 12, def: "longhaul", x: 2, y: 2 }, { uid: 13, def: "overdrive", x: 8, y: 4 },
  ].map((p) => ({ ...p, ...(over.ench?.[p.uid] ?? {}) }));
  return { ...b, items };
}

const snap = (build: Build, o: Partial<GhostSnapshot> = {}): GhostSnapshot => ({
  v: SNAPSHOT_V3, rules: RULES_VERSION, hero: "furnace", day: 5, wins: 3, lives: 5, build, runId: "e1-data", playerId: "p-e1-data", createdAt: 1_790_000_000_000, seed: 4242, ...o,
});
const refuses = (s: unknown): string | null => { try { checkSnapshot(s); return null; } catch (e) { return (e as Error).message; } };

/** ECHOING's count word (the bench sets ENCHANT_NUM.echoEvery: 3 THIRD, 5 FIFTH ...). */
const ORD = ["", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH"][ENCHANT_NUM.echoEvery] ?? `${ENCHANT_NUM.echoEvery}TH`;

type Kind = "rig" | "factory" | "turret";
const KINDS: readonly Kind[] = ["rig", "factory", "turret"];
/** ENCHANT-1b (N1), written out (not read from ENCHANT_DEFS, so a drift in the defs is caught): the kinds each word goes on. */
const GOES_ON: Readonly<Record<string, readonly Kind[]>> = {
  fiery: KINDS, rising: KINDS, growing: KINDS, echoing: KINDS, massive: ["turret"], swift: ["factory"], wide: KINDS, braced: KINDS,
};
/** The player's reason on a kind the word does not go on: a word with ONE kind says which (the other six have no such kind). */
const ONLY_ON: Readonly<Record<string, string>> = { massive: "ONLY ON A TURRET", swift: "ONLY ON A FACTORY" };
/** What enchantProblem says of `word` on a part of `kind` (WIDE's side aside): null where the word goes, else the reason. */
const wantProblem = (word: string, kind: Kind): string | null => (GOES_ON[word].includes(kind) ? null : ONLY_ON[word]);
/** The hand deck with its starting SCRAP CANNON listed (uid 90) and extra fields on it (a word on a turret needs the list). */
const withTurret = (b: Build, f: Record<string, unknown> = {}): Build => ({ ...b, turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ...f }] }) as Build;
const KILN = heroStartBuild("furnace").items.find((p) => p.def === ITEMS.kiln.id)!.uid; // the signature factory

describe("ENCHANT-1 E1: the eight words and the switch", () => {
  it("ENCHANT ships off, and the eight ids, two-letter codes and legal kinds are the brief's", () => {
    expect(ENCHANT).toBe(false);
    expect(enchantRules()).toBe(false);
    expect([...ENCHANT_IDS]).toEqual(["fiery", "rising", "growing", "echoing", "massive", "swift", "wide", "braced"]);
    expect(ENCHANT_IDS.map((id) => ENCHANT_DEFS[id].code)).toEqual(["fi", "ri", "gr", "ec", "ma", "sw", "wi", "br"]);
    expect(new Set(ENCHANT_IDS.map((id) => ENCHANT_DEFS[id].code)).size).toBe(8);
    for (const id of ENCHANT_IDS) {
      expect(enchantIdOfCode(enchantCodeOf(id)!)).toBe(id);
      expect(isEnchantId(id)).toBe(true);
      expect(ENCHANT_DEFS[id].name).toBe(id.toUpperCase());
      expect(ENCHANT_DEFS[id].color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(isEnchantId("keen")).toBe(false); // KEEN waits for CRIT, SPARKING for STUN RECOVERY: not at launch
    expect(isEnchantId("sparking")).toBe(false);
    expect(ENCHANT_KINDS).toEqual({ gate: "rig", factory: "factory", turret: "turret" });
    // ENCHANT-1b (N1): the legal kinds of each word: MASSIVE a turret only, SWIFT a factory only, the other six all three
    expect(Object.fromEntries(ENCHANT_IDS.map((id) => [id, [...ENCHANT_DEFS[id].kinds]]))).toEqual(GOES_ON);
  });

  it("setEnchant / withEnchant: the switch comes back, even on a throw", () => {
    expect(enchantRules()).toBe(false);
    expect(on(() => enchantRules())).toBe(true);
    expect(enchantRules()).toBe(false);
    expect(() => on(() => { throw new Error("x"); })).toThrow("x");
    expect(enchantRules()).toBe(false);
    setEnchant(true);
    expect(off(() => enchantRules())).toBe(false);
    expect(enchantRules()).toBe(true);
  });

  it("every line is one stat or one short line in core words, whole numbers, and none starts with YOUR, START or AT DAWN", () => {
    // ENCHANT-1b (N1): a line is said only on a kind the word goes on (MASSIVE: a turret, SWIFT: a factory); on the others it is null
    for (const id of ENCHANT_IDS) for (const kind of KINDS) {
      const line = enchantLine(id, kind);
      if (!GOES_ON[id].includes(kind)) { expect(line, `${id} on a ${kind}`).toBeNull(); continue; }
      expect(line, `${id} on a ${kind}`).toBeTruthy();
      expect(line).not.toMatch(/^(YOUR|START|AT DAWN)\b/);
      expect(line).not.toMatch(/\d\.\d|\bPCT\b|%/);
      expect(line!.length).toBeLessThanOrEqual(60);
    }
    expect(enchantLine("rising", "rig")).toBe(`EACH SLUG IT HITS: +${ENCHANT_NUM.risingStep} DMG MORE THAN THE LAST.`);
    expect(enchantLine("rising", "factory")).toBe(`EACH SLUG IT MAKES: +${ENCHANT_NUM.risingStep} DMG MORE THAN THE LAST.`);
    expect(enchantLine("rising", "turret")).toBe(`EACH SHOT: +${ENCHANT_NUM.risingStep} DMG MORE THAN THE LAST.`);
    expect(enchantLine("growing", "rig")).toBe("AFTER EACH DUSK FIGHT: ITS HIT +5 DMG, FOR THE RUN."); // run 5, E10's fix round: was ALL RUN (a reader hedged on it twice)
    expect(enchantLine("echoing", "rig")).toBe(`EVERY ${ORD} SLUG IT HITS GETS ITS STATS TWICE.`);
    expect(enchantLine("echoing", "factory")).toBe(`EVERY ${ORD} TIME IT WORKS: 1 MORE SLUG.`);
    expect(enchantLine("echoing", "turret")).toBe(`EVERY ${ORD} SHOT HITS TWICE.`);
    expect(enchantLine("massive", "turret")).toBe(`FIRES HALF AS OFTEN. ${ENCHANT_NUM.massiveShare}x DMG A SHOT.`);
    expect(enchantLine("swift", "factory")).toBe("WORKS TWICE AS OFTEN. ITS SLUGS DEAL HALF DMG.");
    expect(enchantLine("braced", "rig")).toBe(`THE FIRST ${ENCHANT_NUM.bracedStuns} [STUN]STUNS ON IT EACH FIGHT DO NOTHING.`);
    for (const [id, kind] of [["massive", "rig"], ["massive", "factory"], ["swift", "rig"], ["swift", "turret"]] as const) expect(enchantLine(id, kind), `${id} on a ${kind}`).toBeNull(); // the kinds they were dropped from
    expect(ENCHANT_NUM).toEqual({ burn: 1, risingStep: 1, growingStep: 5, echoEvery: 5, bracedStuns: 3, massiveShare: 3 }); // the SHIPPED numbers: the brief's starts were 1, 5, 5, 3, 2 and MASSIVE 2x; run 3's E9a read cut RISING (5 -> 2 -> 1) and ECHOING and raised BRACED and MASSIVE (REPORT 10)
  });

  it("enchantProblem: each word on each kind (the allow-list), with the player's reasons", () => {
    const core = Object.values(ITEMS).find((d) => d.kind === "core")!;
    const rig = ITEMS.whetstone, shaped = ITEMS.nailstrip, x = ITEMS.overdrive, factory = ITEMS.press, sig = ITEMS.kiln, turret = ITEMS.scrapcannon;
    // ENCHANT-1b (N1): MASSIVE goes on a turret only (a rig or a factory says ONLY ON A TURRET), SWIFT on a factory only (a rig or a turret
    // says ONLY ON A FACTORY); the other six go on all three
    for (const w of ENCHANT_IDS) {
      for (const d of [factory, sig]) expect(enchantProblem(d, w), `${w} on ${d.id}`).toBe(wantProblem(w, "factory"));
      expect(enchantProblem(turret, w), `${w} on ${turret.id}`).toBe(wantProblem(w, "turret"));
      expect(enchantProblem(rig, w), `${w} on a rig`).toBe(wantProblem(w, "rig"));
      expect(enchantProblem(ITEMS.calibrate, w), `${w} on gear`).toBe("NOT ON GEAR");
      expect(enchantProblem(core, w), `${w} on a core`).toBe("NOT ON A CORE");
      expect(enchantProblem(ITEMS.beltcrate, w), `${w} on a supply`).toBe("NOT ON A SUPPLY");
    }
    // a rig of any shape says the same (the kind is judged first, whatever its sides)
    expect([ITEMS.whetstone, ITEMS.longhaul, ITEMS.splitter, x, shaped].map((d) => enchantProblem(d, "massive"))).toEqual(Array(5).fill("ONLY ON A TURRET"));
    expect([ITEMS.whetstone, ITEMS.longhaul, ITEMS.splitter, x, shaped].map((d) => enchantProblem(d, "swift"))).toEqual(Array(5).fill("ONLY ON A FACTORY"));
    // every factory and turret of the catalogue answers every word by its kind alone, and every rig answers MASSIVE and SWIFT by its kind alone
    // (the other words on a rig also ask the rig itself: WIDE for a free side, below)
    let judged = 0;
    for (const d of Object.values(ITEMS)) {
      const kind = ENCHANT_KINDS[d.kind];
      if (!kind) continue;
      for (const w of ENCHANT_IDS) {
        if (kind === "rig" && w !== "massive" && w !== "swift") continue;
        expect(enchantProblem(d, w), `${w} on ${d.id} (a ${kind})`).toBe(wantProblem(w, kind));
        judged++;
      }
    }
    expect(judged).toBeGreaterThan(100);
    // WIDE on a rig: a shaped rig, an X rig and an arrow's own side say NO FREE SIDE
    expect(enchantProblem(shaped, "wide")).toBe("NO FREE SIDE");
    expect(enchantProblem(x, "wide")).toBe("NO FREE SIDE");
    expect(enchantProblem(ITEMS.longhaul, "wide")).toBeNull(); // II: sides 1 and 3 carry arrows, 0 and 2 are free
    expect(enchantProblem(ITEMS.longhaul, "wide", { enchDir: 0 })).toBeNull();
    expect(enchantProblem(ITEMS.longhaul, "wide", { enchDir: 1 })).toBe("NO FREE SIDE");
    expect(enchantProblem(ITEMS.splitter, "wide", { enchDir: 2 })).toBeNull(); // T: only the back is free
    expect(enchantProblem(ITEMS.splitter, "wide", { enchDir: 0 })).toBe("NO FREE SIDE");
    expect(freeSides(ITEMS.whetstone)).toEqual([1, 2, 3]);
    expect(freeSides(ITEMS.longhaul)).toEqual([0, 2]);
    expect(freeSides(ITEMS.splitter)).toEqual([2]);
    expect(freeSides(x)).toEqual([]);
    expect(freeSides(shaped)).toEqual([]);
    expect(enchantProblem("nope", "fiery")).toBe("UNKNOWN PART");
    expect(enchantProblem(rig, "keen")).toBe("NOT AN ENCHANTMENT");
  });

  it("the numbers: rate rule (MASSIVE halves rounding down, SWIFT doubles), DMG share, WIDE's belt slot", () => {
    expect([35, 36, 1, 2, 17].map((r) => enchantRate("massive", r))).toEqual([17, 18, 1, 1, 8]);
    expect([35, 1].map((r) => enchantRate("swift", r))).toEqual([70, 2]);
    expect(enchantRate("fiery", 35)).toBe(35);
    expect(enchantShare("massive")).toBe(ENCHANT_NUM.massiveShare);
    expect(enchantShare("swift")).toBe(0.5);
    expect(enchantShare("echoing")).toBe(1);
    expect(on(() => wideSlots({ ench: "wide" }))).toBe(1);
    expect(off(() => wideSlots({ ench: "wide" }))).toBe(0);
    expect(on(() => wideSlots({ ench: "fiery" }))).toBe(0);
  });
});

describe("ENCHANT-1 E1: the rules gate", () => {
  it("ENCHANT_RULES is today's literal; features, gate problem and world follow SHAPES2's form", () => {
    expect(ENCHANT_RULES).toBe("bb-0.11.0");
    expect(ENCHANT_RULES).toBe(RULES_VERSION); // the release's bump writes its own literal here
    const plain = deck(), held = deck({ ench: { 10: { ench: "fiery" } } });
    expect(enchantFeatures(plain)).toEqual([]);
    expect(enchantFeatures(held)).toEqual(["enchantments (ench, enchDir, grow)"]);
    expect(enchantFeatures({ items: [], turrets: [{ ench: "braced" }] })).toHaveLength(1);
    for (const none of [null, 7, "x", { items: "x" }, {}]) expect(enchantFeatures(none)).toEqual([]);
    // off: "not in this rules version yet"; on: only at or after ENCHANT_RULES
    expect(enchantGateProblem(RULES_VERSION, plain)).toBeNull();
    expect(enchantGateProblem(RULES_VERSION, held)).toBe("enchantments (ench, enchDir, grow): not in this rules version yet");
    expect(on(() => enchantGateProblem(RULES_VERSION, held))).toBeNull();
    expect(on(() => enchantGateProblem("bb-0.10.0", held))).toBe("rules bb-0.10.0 predate bb-0.11.0: enchantments (ench, enchDir, grow) need bb-0.11.0 or later");
    expect(on(() => enchantGateProblem("bb-garbled", held))).toContain("is not a bb-MAJOR.MINOR.PATCH version");
    expect(on(() => enchantWorld(RULES_VERSION))).toBe(true);
    expect(on(() => enchantWorld("bb-0.10.0"))).toBe(false);
    expect(enchantWorld(RULES_VERSION)).toBe(false);
    expect(rulesAtLeast(RULES_VERSION, ENCHANT_RULES)).toBe(true);
  });
});

describe("ENCHANT-1 E2: the snapshot, both checks, both switch states", () => {
  const fixtures = (): { name: string; s: GhostSnapshot; ok: boolean }[] => [
    { name: "rig fiery", s: snap(deck({ ench: { 10: { ench: "fiery" } } })), ok: true },
    { name: "rig wide side 2", s: snap(deck({ ench: { 10: { ench: "wide", enchDir: 2 } } })), ok: true },
    { name: "factory swift", s: snap(deck({ ench: { 11: { ench: "swift" } } })), ok: true }, // ENCHANT-1b (N1): was MASSIVE (now a turret's word; the shape checks judge no kind, the validators do)
    { name: "rig growing 2", s: snap(deck({ ench: { 10: { ench: "growing", grow: 2 } } })), ok: true },
    { name: "growing on a piece without it", s: snap(deck({ ench: { 10: { ench: "fiery", grow: 2 } } })), ok: false },
    { name: "grow with no word", s: snap({ ...deck(), items: deck().items.map((p) => (p.uid === 10 ? { ...p, grow: 1 } : p)) }), ok: false },
    { name: "enchDir with fiery", s: snap(deck({ ench: { 10: { ench: "fiery", enchDir: 1 } } })), ok: false },
    { name: "enchDir out of range", s: snap(deck({ ench: { 10: { ench: "wide", enchDir: 4 } } })), ok: false },
    { name: "an unknown word", s: snap(deck({ ench: { 10: { ench: "keen" } } })), ok: false },
    { name: "a v2 snapshot with grow", s: snap(deck({ ench: { 10: { ench: "growing", grow: 1 } } }), { v: 2, seed: undefined }), ok: false },
    { name: "a v1 snapshot with a word", s: snap(deck({ ench: { 10: { ench: "fiery" } } }), { v: 1, seed: undefined }), ok: false },
    { name: "older rules", s: snap(deck({ ench: { 10: { ench: "fiery" } } }), { rules: "bb-0.10.0" }), ok: false },
  ];

  it("off: every fixture with a key is refused by both checks (unknown field), a plain deck passes", () => {
    for (const f of fixtures()) {
      expect(refuses(f.s), `strict ${f.name}`).toMatch(/unknown field|not allowed|not in this rules version|expected|only with|predate/);
      expect(isSnapshot(JSON.parse(JSON.stringify(f.s))), `client ${f.name}`).toBe(false);
    }
    const plain = snap(deck());
    expect(refuses(plain)).toBeNull();
    expect(isSnapshot(JSON.parse(JSON.stringify(plain)))).toBe(true);
  });

  it("on: the strict decoder and the client's check say the same on every fixture, the listed verdict", () => {
    on(() => {
      for (const f of fixtures()) {
        const strict = refuses(f.s) === null, client = isSnapshot(JSON.parse(JSON.stringify(f.s)));
        expect(strict, `strict ${f.name}: ${refuses(f.s)}`).toBe(f.ok);
        expect(client, `client ${f.name}`).toBe(strict);
      }
    });
  });

  it("a turret carries ench (and grow while GROWING); mods take neither; older rules refuse them", () => {
    const b = deck();
    const t = (extra: Record<string, unknown>) => ({ ...b, turrets: [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ...extra }] }) as Build;
    on(() => {
      for (const [name, build, ok] of [
        ["fiery", t({ ench: "fiery" }), true], ["growing 3", t({ ench: "growing", grow: 3 }), true], ["grow on massive", t({ ench: "massive", grow: 3 }), false],
        ["enchDir on a turret", t({ ench: "wide", enchDir: 1 }), false], ["no word, grow", t({ grow: 1 }), false],
      ] as const) {
        const s = snap(build as Build);
        expect(refuses(s) === null, `${name}: ${refuses(s)}`).toBe(ok);
        expect(isSnapshot(JSON.parse(JSON.stringify(s))), `client ${name}`).toBe(ok);
      }
      const gear = { ...b, mods: [{ uid: 30, def: "calibrate", turret: 0, ench: "fiery" }] } as unknown as Build;
      expect(refuses(snap(gear))).toMatch(/mods\[0\]\.ench: unknown field/);
      expect(isSnapshot(JSON.parse(JSON.stringify(snap(gear))))).toBe(false);
      const gearGrow = { ...b, mods: [{ uid: 30, def: "calibrate", turret: 0, grow: 1 }] } as unknown as Build;
      expect(refuses(snap(gearGrow))).toMatch(/not in this rules version yet/);
      expect(refuses(snap(t({ ench: "fiery" }), { rules: "bb-0.10.0" }))).toMatch(/unknown field/);
    });
  });

  it("canonical form: ench, enchDir, then grow after the other keys; encode/decode is byte for byte; a plain build encodes the same in both states", () => {
    const plain = snap(deck());
    const a = off(() => encodeSnapshot(plain)), b = on(() => encodeSnapshot(plain));
    expect(a).toBe(b);
    expect(a).not.toMatch(/ench|grow/);
    const s = snap({ ...deck({ ench: { 10: { ench: "wide", enchDir: 2 }, 12: { ench: "growing", grow: 2 } } }), turrets: [{ slot: 0, def: "scrapcannon", uid: 90, stars: 2, free: true, ench: "fiery" }] });
    on(() => {
      const text = encodeSnapshot(s);
      expect(text).toContain('{"uid":10,"def":"whetstone","x":1,"y":5,"ench":"wide","enchDir":2}');
      expect(text).toContain('{"uid":12,"def":"longhaul","x":2,"y":2,"ench":"growing","grow":2}');
      expect(text).toContain('"turrets":[{"slot":0,"def":"scrapcannon","uid":90,"stars":2,"free":true,"ench":"fiery"}]');
      expect(JSON.stringify(decodeSnapshot(text))).toBe(text);
      // keys given in another order come back in the canonical one
      const shuffled = JSON.stringify({ ...JSON.parse(text), build: { ...JSON.parse(text).build, items: JSON.parse(text).build.items.map((p: Record<string, unknown>) => (p.ench ? { grow: p.grow, enchDir: p.enchDir, ench: p.ench, y: p.y, x: p.x, def: p.def, uid: p.uid } : p)) } });
      expect(JSON.stringify(decodeSnapshot(shuffled))).toBe(text);
    });
  });

  it("a stars/rot/ench item keeps stars and rot first (they joined v2 before)", () => {
    const s = snap(deck({ ench: { 10: { ench: "fiery" } } }));
    s.build.items = s.build.items.map((p) => (p.uid === 10 ? { uid: 10, def: "whetstone", x: 1, y: 5, stars: 2, rot: 1, ench: "fiery" } : p));
    on(() => expect(encodeSnapshot(s)).toContain('{"uid":10,"def":"whetstone","x":1,"y":5,"stars":2,"rot":1,"ench":"fiery"}'));
  });
});

describe("ENCHANT-1 E2: the stand-in word", () => {
  const withWords = (): Build => {
    const b = deck({ ench: { 10: { ench: "wide", enchDir: 2 }, 11: { ench: "echoing" }, 12: { ench: "growing", grow: 4 }, 13: { ench: "braced" } } });
    b.items = b.items.map((p) => (p.uid === 10 ? { ...p, stars: 2 } : p));
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "fiery" }]);
    return b;
  };

  it("`~<code>` after the stars: the codes, WIDE's side, GROWING's counter, a turret word before `!`", () => {
    const code = encodeStarred(withWords());
    expect(code).toContain("whetstone51*2~wi2"); // WIDE on a rig carries its side, after the stars (cells are <y><x>)
    expect(code).toContain("press77~ec");
    expect(code).toContain("longhaul22~gr4"); // GROWING carries its counter
    expect(code).toContain("overdrive48~br");
    expect(code).toContain("scrapcannon0~fi!"); // <id><slot>[*<stars>][~<code>][!]
    expect(encodeH(withWords())).toBe(code); // the harness codec writes the same word
    const whet = { ...deck(), items: deck().items.map((p) => (p.uid === 10 ? { ...p, rot: 1, stars: 2, ench: "fiery" } : p)) };
    expect(encodeStarred(whet)).toContain("whetstone51r1*2~fi"); // <id><yx>[r<rot>][*<stars>][~<code>]
  });

  it("round trip: every word on a rig, a factory and a turret, both codecs, equal to the build", () => {
    let trips = 0;
    for (const id of ENCHANT_IDS) {
      for (const [kind, uid] of [["rig", 10], ["factory", 11], ["turret", 0]] as const) {
        if (!GOES_ON[id].includes(kind)) continue; // ENCHANT-1b (N1): MASSIVE rides on a turret only, SWIFT on a factory only
        trips++;
        const b = deck();
        const extra = id === "wide" && kind === "rig" ? { enchDir: 3 } : id === "growing" ? { grow: 5 } : {};
        if (kind === "turret") setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: id, ...extra }]);
        else b.items = b.items.map((p) => (p.uid === uid ? { ...p, ench: id, ...extra } : p));
        const code = encodeStarred(b);
        expect(code, `${id} on a ${kind}`).toContain(`~${enchantCodeOf(id)}`);
        const back = decodeStarredRaw("furnace", code);
        const want = JSON.parse(JSON.stringify(b)) as Build;
        // the code renumbers uids (items 1..n); compare by position
        expect(back.items.map((p) => [p.def, p.x, p.y, p.ench, p.enchDir, p.grow]), `${id} ${kind}`).toEqual(want.items.map((p) => [p.def, p.x, p.y, p.ench, p.enchDir, p.grow]));
        expect(back.turrets?.map((t) => [t.slot, t.def, t.ench, t.grow]) ?? null).toEqual(want.turrets?.map((t) => [t.slot, t.def, t.ench, t.grow]) ?? null);
        expect(encodeStarred(decodeStarred("furnace", code))).toBe(code);
        expect(decodeH("furnace", code)).toEqual(decodeStarredRaw("furnace", code));
        expect(encodeH(decodeH("furnace", code))).toBe(code);
      }
    }
    expect(trips).toBe(20); // 8 words x 3 kinds, less MASSIVE on a rig and a factory and SWIFT on a rig and a turret (ENCHANT-1b, N1)
  });

  it("a word without `~` decodes exactly as before; a deck without a word encodes byte for byte as before", () => {
    const b = deck();
    const code = encodeStarred(b);
    expect(code).not.toContain("~");
    expect(encodeH(b)).toBe(code);
    expect(decodeStarredRaw("furnace", code).items.every((p) => p.ench === undefined && !("ench" in p) && !("enchDir" in p) && !("grow" in p))).toBe(true);
    // an old code (stars and rot, a turret section) decodes to the same objects as ever
    const old = "14 0/kiln64 temper15*2 press66/1:544434241404/calibrate0*3/scrapcannon0*2!";
    expect(decodeStarredRaw("furnace", old)).toEqual(decodeH("furnace", old));
    expect(encodeStarred(decodeStarred("furnace", old))).toBe(old);
    // the switch decides nothing for the codec (it is data); the validators refuse the fields while it is off
    expect(off(() => encodeStarred(withWords()))).toBe(on(() => encodeStarred(withWords())));
  });

  it("bad words are refused, not dropped: unknown code, digits where none belong, a v1 encode", () => {
    for (const bad of ["whetstone15~zz", "whetstone15~fi3", "whetstone15~wi7", "press77~gr0", "press77~gr", "whetstone15~", "whetstone15~f", "whetstone15~FI", "whetstone15~wi2~fi", "whetstone15~ec12"]) {
      const code = `14 0/kiln64 ${bad}/1:544434241404/`;
      if (bad === "press77~gr") { expect(decodeStarredRaw("furnace", code).items[1].ench).toBe("growing"); continue; } // ~gr alone is GROWING at 0
      expect(() => decodeStarredRaw("furnace", code), bad).toThrow(/bad (item|enchantment)/);
      expect(() => decodeH("furnace", code), bad).toThrow(/bad (item|enchantment)/);
    }
    expect(() => decodeStarredRaw("furnace", "14 0/kiln64/1:544434241404//scrapcannon0~wi1!")).toThrow(/bad enchantment/);
    expect(() => encodeStarred({ ...deck(), items: deck().items.map((p) => (p.uid === 10 ? { ...p, ench: "keen" } : p)) })).toThrow(/not one of the eight/);
    expect(() => encodeStandIn(withWords())).toThrow(/v1 code carries no/);
  });

  it("ENCHANT-1b (N1): a forged `~ma` on a rig or a factory and `~sw` on a rig or a turret read back as written (the codecs judge no kind); the validators refuse each with its reason, and the legal pair passes", () => {
    const strict = (b: Build) => on(() => validateBuild(b, 5, "strict"));
    const road = (name: string, b: Build, word: string): Build => {
      const code = encodeStarred(b);
      expect(code, name).toContain(word);
      expect(encodeH(b), name).toBe(code); // the harness codec writes the same word
      const back = decodeStarred("furnace", code);
      expect(decodeH("furnace", code), name).toEqual(decodeStarredRaw("furnace", code));
      expect(encodeStarred(back), name).toBe(code); // nothing was dropped or mended on the way
      return back;
    };
    for (const [name, b, word, why] of [
      ["~ma on a rig", deck({ ench: { 10: { ench: "massive" } } }), "whetstone51~ma", /WHETSTONE can't take MASSIVE: ONLY ON A TURRET/],
      ["~ma on a factory", deck({ ench: { 11: { ench: "massive" } } }), "press77~ma", /STAMP PRESS can't take MASSIVE: ONLY ON A TURRET/],
      ["~sw on a rig", deck({ ench: { 10: { ench: "swift" } } }), "whetstone51~sw", /WHETSTONE can't take SWIFT: ONLY ON A FACTORY/],
      ["~sw on a turret", withTurret(deck(), { ench: "swift" }), "scrapcannon0~sw!", /turret: uid \d+ SCRAP CANNON can't take SWIFT: ONLY ON A FACTORY/],
    ] as const) {
      const v = strict(road(name, b, word));
      expect(v.ok, name).toBe(false);
      expect(v.errors.join(" | "), name).toMatch(why);
    }
    for (const [name, b, word] of [
      ["~sw on a factory", deck({ ench: { 11: { ench: "swift" } } }), "press77~sw"],
      ["~ma on a turret", withTurret(deck(), { ench: "massive" }), "scrapcannon0~ma!"],
    ] as const) {
      const v = strict(road(name, b, word));
      expect(v.ok, `${name}: ${JSON.stringify(v.errors)}`).toBe(true);
    }
  });

  it("WIDE on a rig without a side and GROWING at 0 read back as written (the validators judge them)", () => {
    const b = deck({ ench: { 10: { ench: "wide" }, 12: { ench: "growing" } } });
    const code = encodeStarred(b);
    expect(code).toMatch(/whetstone51~wi[ \/]/);
    expect(code).toMatch(/longhaul22~gr[ \/]/);
    const back = decodeStarredRaw("furnace", code);
    expect(back.items[1]).toMatchObject({ def: "whetstone", ench: "wide" });
    expect("enchDir" in back.items[1]).toBe(false);
    expect("grow" in back.items[3]).toBe(false);
  });
});

describe("ENCHANT-1 E2: cargo, the deck's copies and GROWING's counter", () => {
  it("enchantField copies the word, WIDE's side and GROWING's counter (only above 0, only while GROWING), and nothing else", () => {
    expect(enchantField({ ench: "fiery" })).toEqual({ ench: "fiery" });
    expect(enchantField({ ench: "wide", enchDir: 2, grow: 3 })).toEqual({ ench: "wide", enchDir: 2 });
    expect(enchantField({ ench: "growing", grow: 3 })).toEqual({ ench: "growing", grow: 3 });
    expect(enchantField({ ench: "growing", grow: 0 })).toEqual({ ench: "growing" });
    expect(enchantField({})).toEqual({});
    expect(enchantField(undefined)).toEqual({});
    expect(enchantField({ grow: 3, enchDir: 1 })).toEqual({});
  });

  it("a rig stored to cargo and placed again, and a turret stored and installed again, keep their words", () => {
    const run = newRun("furnace", 7);
    run.build.items.push({ uid: 300, def: "whetstone", x: 1, y: 5, stars: 2, ench: "wide", enchDir: 3 }, { uid: 301, def: "longhaul", x: 2, y: 2, ench: "growing", grow: 4 });
    expect(storePlaced(run, 300)).toBe(true);
    expect(storePlaced(run, 301)).toBe(true);
    expect(run.inventory.find((i) => i.uid === 300)).toEqual({ uid: 300, def: "whetstone", stars: 2, ench: "wide", enchDir: 3 });
    expect(run.inventory.find((i) => i.uid === 301)).toEqual({ uid: 301, def: "longhaul", ench: "growing", grow: 4 });
    // a turret in slot 1 (the extra slot) with a word, to cargo and back
    setTurretList(run.build, [...turretSlots(run.build).filter((s) => s.turret).map((s) => s.turret!), { slot: 1, def: "deckgun", uid: 302, stars: 2, ench: "braced" }]);
    const r = storeTurret(run, 1);
    expect(r.ok).toBe(true);
    expect(run.inventory.find((i) => i.uid === 302)).toEqual({ uid: 302, def: "deckgun", stars: 2, ench: "braced" });
    expect(installFromCargo(run, 302, 1).ok).toBe(true);
    expect(installedTurrets(run.build).find((s) => s.slot === 1)?.turret).toMatchObject({ def: "deckgun", uid: 302, stars: 2, ench: "braced" });
    expect(takeFromInventory(run, 300)).toMatchObject({ ench: "wide" });
  });

  it("growPieces: +1 on every GROWING item and turret after a dusk fight, only with the switch on", () => {
    const b = deck({ ench: { 10: { ench: "growing" }, 12: { ench: "growing", grow: 2 }, 11: { ench: "fiery" } } });
    setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "growing", grow: 1 }]);
    expect(off(() => growPieces({ items: b.items, turrets: b.turrets }))).toBe(0);
    expect(b.items.find((p) => p.uid === 10)!.grow).toBeUndefined();
    expect(on(() => growPieces({ items: b.items, turrets: b.turrets }))).toBe(3);
    expect(b.items.find((p) => p.uid === 10)!.grow).toBe(1);
    expect(b.items.find((p) => p.uid === 12)!.grow).toBe(3);
    expect(b.items.find((p) => p.uid === 11)!.grow).toBeUndefined();
    expect(b.turrets![0].grow).toBe(2);
  });
});

describe("ENCHANT-1 E2/E3: WIDE's arrow turns with the rig; gear slots; belt slots", () => {
  it("a WIDE rig has one more arrow (enchDir at rotation 0, turned with the rig); off or on a full rig it adds none", () => {
    const rigAt = (rot: number, ench?: Partial<Placed>): Placed => ({ uid: 10, def: "whetstone", x: 5, y: 5, ...(rot ? { rot } : {}), ...ench });
    expect(arrowsOf(rigAt(0))).toEqual([0]);
    expect(on(() => arrowsOf(rigAt(0, { ench: "wide", enchDir: 2 })))).toEqual([0, 2]);
    expect(on(() => arrowsOf(rigAt(1, { ench: "wide", enchDir: 2 })))).toEqual([1, 3]); // turned with the rig
    expect(on(() => arrowsOf(rigAt(3, { ench: "wide", enchDir: 3 })))).toEqual([3, 2]);
    expect(off(() => arrowsOf(rigAt(0, { ench: "wide", enchDir: 2 })))).toEqual([0]); // off: nothing sees it
    expect(on(() => arrowsOf(rigAt(0, { ench: "wide", enchDir: 0 })))).toEqual([0]); // a side that carries an arrow adds none (the validators refuse it)
    expect(on(() => arrowsOf({ uid: 10, def: "overdrive", x: 5, y: 5, ench: "wide", enchDir: 1 }))).toEqual([0, 1, 2, 3]); // X: four already
    expect(on(() => arrowsOf(rigAt(0, { ench: "fiery" })))).toEqual([0]);
  });

  it("the extra arrow hits a belt tile (rigHits sees it) and WIDE adds a gear slot and a belt slot", () => {
    const b = heroStartBuild("furnace");
    // the starting FURNACE belt runs up column 4 from the KILN at (4,6): its tiles are (4,5)..(4,0); a rig at (3,3) facing 0 hits (3,2); WIDE on side 1 reaches (4,3)
    const rig: Placed = { uid: 10, def: "whetstone", x: 3, y: 3 };
    const plain = { ...b, items: [...b.items, rig] };
    const wide = { ...b, items: [...b.items, { ...rig, ench: "wide", enchDir: 1 }] };
    const hits = (bb: Build) => rigHits(bb).flat(2).filter((h) => h.uid === 10).length;
    expect(hits(plain)).toBe(0);
    expect(on(() => hits(wide))).toBe(1);
    expect(off(() => hits(wide))).toBe(0);
    // a turret: WIDE is +1 [GEAR] SLOT
    const t = cloneBuild(b);
    setTurretList(t, [{ slot: 0, def: "scrapcannon", uid: 90, free: true, ench: "wide" }]);
    const gearOf = (bb: Build) => turretSlots(bb)[0].gearSlots;
    expect(off(() => gearOf(t))).toBe(1);
    expect(on(() => gearOf(t))).toBe(2);
  });
});

describe("ENCHANT-1 E1/E6.1: the validators, both switch states", () => {
  it("validateBuild: a legal word passes; MASSIVE on a rig or a factory, SWIFT on a rig or a turret, WIDE on an X rig, a taken side, a missing side and a stray enchDir are refused", () => {
    const check = (build: Build) => on(() => validateBuild(build, 5, "strict"));
    expect(check(deck()).ok, JSON.stringify(check(deck()).errors)).toBe(true);
    const ok = (b: Build) => { const v = check(b); expect(v.ok, JSON.stringify(v.errors)).toBe(true); };
    ok(deck({ ench: { 10: { ench: "fiery" }, 11: { ench: "swift" }, 12: { ench: "wide", enchDir: 0 } } })); // ENCHANT-1b (N1): SWIFT on the STAMP PRESS (a factory)
    ok(withTurret(deck({ ench: { 10: { ench: "fiery" } } }), { ench: "massive" })); // and MASSIVE on the SCRAP CANNON (a turret)
    const bad = (b: Build, re: RegExp) => { const v = check(b); expect(v.ok).toBe(false); expect(v.errors.join(" | ")).toMatch(re); };
    bad(deck({ ench: { 10: { ench: "massive" } } }), /can't take MASSIVE: ONLY ON A TURRET/); // a rig
    bad(deck({ ench: { 10: { ench: "swift" } } }), /can't take SWIFT: ONLY ON A FACTORY/);
    bad(deck({ ench: { 11: { ench: "massive" } } }), /STAMP PRESS can't take MASSIVE: ONLY ON A TURRET/); // ENCHANT-1b (N1): a factory
    bad(deck({ ench: { [KILN]: { ench: "massive" } } }), /KILN can't take MASSIVE: ONLY ON A TURRET/); // and a signature factory
    bad(withTurret(deck(), { ench: "swift" }), /turret: uid 90 SCRAP CANNON can't take SWIFT: ONLY ON A FACTORY/); // a turret
    bad(deck({ ench: { 13: { ench: "wide", enchDir: 1 } } }), /can't take WIDE: NO FREE SIDE/);
    bad(deck({ ench: { 12: { ench: "wide", enchDir: 1 } } }), /can't take WIDE: NO FREE SIDE/);
    bad(deck({ ench: { 10: { ench: "wide" } } }), /has WIDE but no side/);
    bad(deck({ ench: { 11: { ench: "wide", enchDir: 1 } } }), /only WIDE on a rig has a side/);
    // off: the keys are unknown fields (a shape error), whatever the piece
    const v = validateBuild(deck({ ench: { 10: { ench: "fiery" } } }), 5, "strict");
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toMatch(/^shape: .*ench: unknown field/);
  });

  it("validateUpload: the gate speaks first off and under older rules; given the right rules the word is judged", () => {
    const b = withDawnRunes(deck({ ench: { 10: { ench: "fiery" } } }), 5);
    const off1 = validateUpload(b, 5, RULES_VERSION, {});
    expect(off1.ok).toBe(false);
    expect(off1.errors[0]).toBe("rules: enchantments (ench, enchDir, grow): not in this rules version yet");
    on(() => {
      const old = validateUpload(b, 5, "bb-0.10.0", {});
      expect(old.ok).toBe(false);
      expect(old.errors[0]).toMatch(/^rules: rules bb-0\.10\.0 predate bb-0\.11\.0: enchantments/);
      const judge = (build: Build) => validateUpload(withDawnRunes(build, 5), 5, RULES_VERSION, {});
      const bad = judge(deck({ ench: { 10: { ench: "massive" } } }));
      expect(bad.errors.join(" | ")).toMatch(/can't take MASSIVE: ONLY ON A TURRET/);
      // ENCHANT-1b (N1): the same on a factory (MASSIVE) and on a turret (SWIFT), and the pair that is legal passes
      expect(judge(deck({ ench: { 11: { ench: "massive" } } })).errors.join(" | ")).toMatch(/STAMP PRESS can't take MASSIVE: ONLY ON A TURRET/);
      expect(judge(withTurret(deck(), { ench: "swift" })).errors.join(" | ")).toMatch(/turret: uid 90 SCRAP CANNON can't take SWIFT: ONLY ON A FACTORY/);
      expect(judge(deck({ ench: { 10: { ench: "swift" } } })).errors.join(" | ")).toMatch(/can't take SWIFT: ONLY ON A FACTORY/);
      for (const legal of [deck({ ench: { 11: { ench: "swift" } } }), withTurret(deck(), { ench: "massive" })]) {
        const v = judge(legal);
        expect(v.ok, v.errors.join(" | ")).toBe(true);
      }
    });
  });

  it("the player mode judges a deck in its own rules' world: a deck under older rules is checked with the words off", () => {
    on(() => {
      // a deck WITHOUT a word under bb-0.10.0 is judged exactly as with the switch off
      const plain = deck();
      expect(validateUpload(plain, 5, "bb-0.10.0", {}).errors.join(" | ")).not.toMatch(/ench/);
    });
  });
});
