// ROWS-1 run 3 (RULING-ROWS1-R1 W3; REQ-BFG-098): R3 (a scaling reader's belt timeline row says what it reads) at the merge with bb-0.13.0, where
// ENCHANT (enchant.ts: eight words on rigs, factories and turrets) and GATES (the converters FUSER, SCATTER MILL, SMELTER) are ON. The merge's risk:
// the bump's own part of a hit (an enchantment's effect, a gate's share) must stay FIRST after the name, with the reading clause after a comma.
// What the bump does with them, read off its code and pinned here:
//  - an enchantment's effect is a BATTLE effect (enchantFx.ts rigHitFx); the build view's walk (deck.ts walkRoute) carries none of it, so a timeline
//    hit of an enchanted reader holds exactly the keys a plain reader's does; the word shows in the placed rig's PANEL (the title's first word and
//    its own line under the face), never in a belt row;
//  - a gate changes the slug the belt panel's readout reads (DMG, BURN, TIME, COPIES: convert.ts convertWalk), not a rig's hit, and has no hit of its
//    own (its tile is no belt tile for an arrow), so a reader's row on a belt with a gate is its row on a belt without.
// So a reader's row is the same with every word that can sit on it and with every gate on its belt, and the own part (a flat, plating, a heal, a keg's
// fuse, or a walk value a rig's hit carries: flat, BURN, SHOCK) still comes first with the clause after a comma. Expected rows are written by hand from
// the catalogue's numbers (scale.ts) and the day's multipliers (hullScale.ts), as tests/rows1.reader.test.ts does; the cross-version proof (the
// bb-0.13.0 export against this tree: panels, faces and belt-panel heads identical in 654 cases, only the readers' rows differ) is in the REPORT.
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { ITEMS, type ReadSpec } from "../src/sim/content";
import { effectAt } from "../src/sim/stars";
import { dmgShown, sustShown } from "../src/sim/hullScale";
import { gatesRules, walkRoute, type Placed, type TimelineHit } from "../src/sim/deck";
import { GATES } from "../src/sim/gates";
import { ENCHANT, ENCHANT_IDS, enchantProblem, enchantRules, freeSides } from "../src/sim/enchant";
import { icons } from "../src/render/font";
import { textWidth } from "../src/render/font";
import { fmtDmg } from "../src/ui/statFormat";
import { hitText } from "../src/ui/abilityText";
import { faceLines } from "../src/ui/faces";
import { enchantedTitle, pieceLine, wordOn } from "../src/ui/enchantFaces";
import { lineText } from "../src/ui/richText";
import { newRun, type Run } from "../src/game/run";
import { buildLayout } from "../src/screens/build/layout";
import { isPhone, tapPx } from "../src/ui/tap";
import { beltKind, planPanel, rigPanel, routePanel, type Block } from "../src/screens/build/inspector";
import { bench, benchRigsCheck } from "./arsenal.bench";

const READERS = ["quench", "shieldwall", "keg", "cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];
const GATE_IDS = ["fuser", "scattermill", "smelter"];
const STARS = [1, 2, 3];
const DAYS = [1, 24];
const reads = (id: string, s: number): ReadSpec => effectAt(id, s).gate!.reads!;
const D = (n: number, day: number): string => fmtDmg(dmgShown(n, day));
const S = (n: number, day: number): string => fmtDmg(sustShown(n, day));

/** The row each reader should read (tests/rows1.reader.test.ts's, written by hand from the catalogue and the day's multipliers). */
function expectedRow(id: string, s: number, day: number): string {
  const r = reads(id, s), name = ITEMS[id].name;
  const give = r.give === "plate" ? `+${S(r.each, day)} SHIELD` : `+${D(r.each, day)} DAMAGE`;
  const what: Record<string, string> = {
    foeBurn: "BURN ON THE FOE", foePoison: "POISON ON THE FOE", beltSlugs: "SLUG ON ITS BELT", ownPlate: `${S(r.per ?? 1, day)} SHIELD YOU HAVE`,
    ownShield: "WARD YOU HAVE", hitsTaken: "HIT ON YOU", ownHits: "OF ITS HITS", heartsLost: "HEART LOST", wins: "WIN",
  };
  if (r.give === "heal") return `${name} HEAL ${S(r.each, day)} TIMES THE FOE'S POISON`;
  return `${name} ${give} FOR EACH ${r.give === "plate" ? what[r.count].replace(" ON THE FOE", " ON FOE") : what[r.count]}`;
}

/** The words that can sit on each reader (enchant.ts enchantProblem: a rig takes six of the eight; MASSIVE is a turret's and SWIFT a factory's;
 *  IRON WALL has no free side for WIDE's arrow). Pinned, so a rule change shows here. */
const SIX = ["fiery", "rising", "growing", "echoing", "wide", "braced"];
const LEGAL: Record<string, string[]> = Object.fromEntries(READERS.map((id) => [id, id === "shieldwall" ? SIX.filter((w) => w !== "wide") : SIX]));
const legalWords = (id: string): string[] => {
  const free = freeSides(ITEMS[id]);
  return ENCHANT_IDS.filter((w) => enchantProblem(id, w, w === "wide" ? { enchDir: free[0] } : undefined) === null);
};

interface Case { run: Run; uid: number; p: Placed }
/** The Furnace bench (tests/arsenal.bench.ts: a 6-tile belt up column 4; tile t = (4, 5 - t)) with `id` at ★`stars` working tile `tile` (the rig
 *  stands west of it facing it), optionally holding `word` (WIDE takes its first free side) and with `gate` (★3) standing on tile `gateTile`. */
function deckOf(id: string, stars: number, day: number, o: { word?: string; gate?: string; tile?: number; gateTile?: number } = {}): Case {
  const tile = o.tile ?? 1, y = 5 - tile;
  const b = bench([[id, 4, y, stars]]);
  benchRigsCheck(b, [[id, 4, y, stars]]);
  const p = b.items.find((q) => q.def === id)!;
  if (o.word) {
    p.ench = o.word;
    if (o.word === "wide") p.enchDir = freeSides(ITEMS[id])[0];
  }
  if (o.gate) b.items.push({ uid: 40, def: o.gate, x: 4, y: 5 - (o.gateTile ?? 3), stars: 3 });
  const run = newRun("furnace", 5, "rows1-merged");
  run.day = day;
  run.build = b;
  return { run, uid: p.uid, p };
}

/** The reader's timeline hits, walked as the belt panel walks (through the gates), and their rows on the day. */
function walked(c: Case): { hits: TimelineHit[]; rows: string[] } {
  const w = walkRoute(c.run.build, 0, undefined, { gates: true });
  const hits = w.timeline.flatMap((r) => r.hits).filter((h) => h.uid === c.uid);
  return { hits, rows: hits.map((h) => hitText(h, beltKind(w), c.run.day)) };
}

describe("ROWS-1 W3: the merged build has ENCHANT and GATES on, and the readers' words are the pinned ones", () => {
  it("ENCHANT, GATES and the scaling rigs are on; the three converters are in ITEMS; the ten readers are the ten rigs with a reader line", () => {
    expect([ENCHANT, enchantRules(), GATES, gatesRules()]).toEqual([true, true, true, true]);
    for (const g of GATE_IDS) expect(ITEMS[g]?.kind, g).toBe("converter");
    const found = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "gate" && STARS.some((s) => effectAt(id, s).gate?.reads));
    expect([...found].sort()).toEqual([...READERS].sort());
  });

  it("the words that can sit on each reader: six of the eight, five on IRON WALL (WIDE has no free side there); MASSIVE and SWIFT never", () => {
    for (const id of READERS) expect(legalWords(id), id).toEqual(LEGAL[id]);
    const pairs = READERS.reduce((n, id) => n + legalWords(id).length, 0);
    expect(pairs).toBe(59);
    for (const id of READERS) {
      expect(enchantProblem(id, "massive")).toBe("ONLY ON A TURRET");
      expect(enchantProblem(id, "swift")).toBe("ONLY ON A FACTORY");
    }
    expect(enchantProblem("shieldwall", "wide")).toBe("NO FREE SIDE");
  });
});

describe("ROWS-1 W3: a reader's belt row is the same with every word that can sit on it and with every gate on its belt", () => {
  it("every reader, star, day and word: one hit, carrying no enchantment (the keys of a plain reader's hit), and the row is the written one", () => {
    let n = 0;
    for (const id of READERS) {
      for (const stars of STARS) {
        for (const day of DAYS) {
          const plain = walked(deckOf(id, stars, day));
          expect(plain.hits, `${id} ★${stars}: one hit`).toHaveLength(1);
          expect(Object.keys(plain.hits[0]).sort(), `${id}: a plain reader's hit`).toEqual(["def", "dir", "reads", "stars", "tier", "uid"]);
          expect(plain.rows[0], `${id} ★${stars} day ${day}`).toBe(expectedRow(id, stars, day));
          for (const word of legalWords(id)) {
            const w = walked(deckOf(id, stars, day, { word }));
            expect(w.hits, `${id} ★${stars} ${word}: one hit`).toHaveLength(1);
            expect(w.hits[0], `${id} ★${stars} ${word}: the walk carries no word, no flat, no BURN, no SHOCK`).toEqual(plain.hits[0]);
            expect(w.rows[0], `${id} ★${stars} day ${day} ${word}`).toBe(expectedRow(id, stars, day));
            n++;
          }
        }
      }
    }
    expect(n).toBe(59 * STARS.length * DAYS.length);
  });

  it("every reader, star, day, gate and side of the gate (the reader before it, on tile 1; after it, on tile 4): the hit and the row are the plain belt's", () => {
    let n = 0;
    for (const id of READERS) {
      for (const stars of STARS) {
        for (const day of DAYS) {
          for (const gate of GATE_IDS) {
            for (const [tile, gateTile] of [[1, 3], [4, 3], [4, 2], [1, 2]]) {
              const plain = walked(deckOf(id, stars, day, { tile })), withGate = walked(deckOf(id, stars, day, { gate, tile, gateTile }));
              expect(withGate.hits, `${id} ★${stars} ${gate}: one hit`).toHaveLength(1);
              expect(withGate.hits[0], `${id} ★${stars} ${gate} on tile ${gateTile + 1}, reader on tile ${tile + 1}`).toEqual(plain.hits[0]);
              expect(withGate.rows[0], `${id} ★${stars} day ${day} ${gate}`).toBe(expectedRow(id, stars, day));
              n++;
            }
          }
        }
      }
    }
    expect(n).toBe(READERS.length * STARS.length * DAYS.length * GATE_IDS.length * 4);
  });

  it("a word and a gate together; and the belt panel's head and foot still read the gate's numbers (DMG changes with the gate, the row does not)", () => {
    for (const id of READERS) {
      const word = legalWords(id)[0];
      const c = deckOf(id, 3, 24, { word, gate: "fuser" });
      expect(walked(c).rows, id).toEqual([expectedRow(id, 3, 24)]);
      const plainFoot = routePanel(deckOf(id, 3, 24).run, 0)!.body.filter((b) => b.role === "grid");
      const gateFoot = routePanel(c.run, 0)!.body.filter((b) => b.role === "grid");
      expect(JSON.stringify(gateFoot), `${id}: a FUSER changes the readout's numbers`).not.toBe(JSON.stringify(plainFoot));
    }
  });
});

describe("ROWS-1 W3: the word is the placed rig's panel's: the title's first word and its own line under the reader's face, which is the face as before", () => {
  it("every reader, word, star and day: title `WORD NAME ★..`, the face's rule block first (HIT: the clause), then the word's line", () => {
    let n = 0;
    for (const id of READERS) {
      for (const stars of [1, 3]) {
        for (const day of DAYS) {
          for (const word of legalWords(id)) {
            const c = deckOf(id, stars, day, { word }), rp = rigPanel(c.run, c.uid)!;
            const rule = faceLines(id, stars, { day })!.rules[0].text, w = wordOn(c.p, ITEMS[id], stars)!;
            expect(rp.ench, `${id} ${word}`).toBe(word);
            expect(rp.title, `${id} ${word}`).toBe(enchantedTitle(word as never, stars > 1 ? `${ITEMS[id].name} ${"★".repeat(stars)}` : ITEMS[id].name)); // (a ★1 title has no star)
            const line = pieceLine(w.id, w.kind, w.stars, day);
            expect(line, `${id} ${word}: the word has a line on a rig`).toBeTruthy();
            const at = rp.body.findIndex((b) => b.text === rule), wl = rp.body.findIndex((b) => b.text === icons(line ?? ""));
            expect(at, `${id} ★${stars} ${word} day ${day}: the face's HIT rule is in the panel (${rp.body.map((b) => b.text).join(" | ")})`).toBeGreaterThanOrEqual(0);
            expect(wl, `${id} ★${stars} ${word} day ${day}: the word's own line`).toBeGreaterThan(at);
            expect(rule.startsWith("HIT: "), id).toBe(true);
            n++;
          }
        }
      }
    }
    expect(n).toBe(59 * 2 * DAYS.length);
  });
});

describe("ROWS-1 W3: the rig's own part still comes first, then the clause after a comma, whatever the walk's hit carries", () => {
  it("a reader's hit with a flat, BURN and SHOCK (what an own effect on a hit is made of): `NAME +n DAMAGE, +n BURN, SHOCK, <the clause>`", () => {
    for (const id of READERS) {
      const h = { uid: 1, def: id, dir: 1, stars: 3, tier: 1, reads: reads(id, 3), flat: 20, burn: 2, shock: true } as unknown as TimelineHit;
      const row = hitText(h, "free", 1), want = expectedRow(id, 3, 1), clause = want.slice(ITEMS[id].name.length + 1);
      expect(row, id).toBe(`${ITEMS[id].name} +${D(20, 1)} DAMAGE, +2 BURN, SHOCK, ${clause}`);
      expect(row.indexOf("SHOCK"), `${id}: the own part is before the clause`).toBeLessThan(row.indexOf(clause));
    }
  });
});

describe("ROWS-1 W3: every reader's row fits whole at ★3 and day 24 on the desk and the two phones, with a word on the reader and with a gate on its belt", () => {
  // the timeline's rule for a long row (inspector.ts layBlock, role "row"): the text wraps at the panel's text width less the label column, the 5x7
  // face first, the 3x5 where it does not fit; when the panel runs out of room whole rows give way from the end (counted in "+n MORE HIT TILES");
  // a row is never cut (tests/rows1.reader.test.ts says the same for a plain belt)
  const VIEWS: [string, number, number, number][] = [["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2]];
  it("the real belt panel on each view: the row is whole, in the 5x7 face, on as many lines as it needs, the tile's label on the first", () => {
    let plans = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr), phone = isPhone(v), tap = phone ? tapPx(v) : 0;
      const L = buildLayout(v.W, v.H, v.portrait, 5, phone && v.portrait, tap);
      for (const id of READERS) {
        const combos: { word?: string; gate?: string }[] = [{}, ...legalWords(id).map((word) => ({ word })), ...GATE_IDS.map((gate) => ({ gate })), { word: legalWords(id)[0], gate: "smelter" }];
        for (const o of combos) {
          const c = deckOf(id, 3, 24, o), want = expectedRow(id, 3, 24);
          const plan = planPanel(routePanel(c.run, 0)!, L.info, [], phone ? { tap, band: true, inBand: true } : {});
          plans++;
          const row = plan.body.shown.find((l) => l.b.role === "row" && l.b.text.startsWith(ITEMS[id].name));
          const label = `${name} ${id} ${JSON.stringify(o)}`;
          expect(row, `${label}: the row is not given way`).toBeTruthy();
          expect(row!.b.text, label).toBe(want);
          expect(row!.lines.map((l) => lineText(l.spans)).join(" "), `${label}: every word is drawn`).toBe(want);
          expect(plan.body.fits, label).toBe(true);
          expect(plan.body.dropped.filter((b: Block) => b.role === "row"), `${label}: no row gave way`).toEqual([]);
          for (const l of row!.lines) expect(textWidth(lineText(l.spans), l.font), `${label}: a line wider than its room`).toBeLessThanOrEqual(L.info.w - 10 - (l.indent ?? 0));
          expect(row!.lines[0].label, label).toMatch(/^T\d+$/);
        }
      }
    }
    expect(plans).toBe(VIEWS.length * READERS.reduce((n, id) => n + 1 + legalWords(id).length + GATE_IDS.length + 1, 0));
  });
});
