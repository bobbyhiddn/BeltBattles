// ROWS-1 (REQ-BFG-098, REQ-BFG-100; F2 of BUMP-1E's review, owed since 0.9.13; cap's design call): the belt timeline's row of a
// scaling reader says what it reads. Before, a rig whose gate has `reads` (IRON WALL, KINDLING, ...) was its bare name in the
// timeline (abilityText.ts hitRow had no `reads` case); now `<NAME> <clause>`: the card face's own clause (faces.ts readerFace,
// through the one function both use, readerClause.ts), as the timeline draws its words (bare words, no icons), without the face's
// full stop: `IRON WALL +3 DMG FOR EACH 10 SHIELD YOU HAVE`. The rig's own part, if it gives something on the hit, comes first and
// the clause after a comma. The numbers are the star's and the day's. Every expected string is written from the catalogue's numbers
// (scale.ts) and the day's multipliers (hullScale.ts), or read off the card face's drawn text, never from readerClause itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeView } from "../src/core/io";
import { ITEMS, type ItemDef, type ReadSpec } from "../src/sim/content";
import { SCALE_PIECES, withScaleRigs } from "../src/sim/scale";
import { clearStarCache, effectAt } from "../src/sim/stars";
import { dmgShown, sustShown } from "../src/sim/hullScale";
import { rotField, walkRoute, type Placed, type TimelineHit } from "../src/sim/deck";
import { ICON, icons, stripIcons, textWidth } from "../src/render/font";
import { lineText } from "../src/ui/richText";
import { fmtDmg } from "../src/ui/statFormat";
import { hitText, type BeltKind } from "../src/ui/abilityText";
import { faceLines } from "../src/ui/faces";
import { readerClause, readerRowWords } from "../src/ui/readerClause";
import { shownOn } from "../src/ui/dayShown";
import { newRun, type Run } from "../src/game/run";
import { buildLayout } from "../src/screens/build/layout";
import { isPhone, tapPx } from "../src/ui/tap";
import { lay, planPanel, routePanel, type Block } from "../src/screens/build/inspector";
import { spotBeside } from "./beltside.helpers";

/** The ten rigs whose gate has a reader line (scale.ts: KINDLING, IRON WALL and POWDER KEG of the five reworks, SPALL CATCHER's is a
 *  gun part's and PRESSURE BREECH has none, and the seven new ids). */
const READERS = ["quench", "shieldwall", "keg", "cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];
const STARS = [1, 2, 3];
const DAYS = [1, 5, 10, 24];
const BELTS: BeltKind[] = ["free", "locked", "slag"];
const hit = (def: string, stars: number, more: object = {}): TimelineHit => ({ uid: 1, def, dir: 1, stars, tier: 1, ...more }) as unknown as TimelineHit;
const reads = (id: string, s: number): ReadSpec => effectAt(id, s).gate!.reads!;
const D = (n: number, day: number): string => fmtDmg(dmgShown(n, day)); // a DMG amount on the day
const S = (n: number, day: number): string => fmtDmg(sustShown(n, day)); // a SHIELD / HEAL amount on the day

/** The row each reader should read, written by hand from the catalogue (scale.ts) and the day's multipliers: the face's words. */
function expectedRow(id: string, s: number, day: number): string {
  const r = reads(id, s), name = ITEMS[id].name;
  const give = r.give === "plate" ? `+${S(r.each, day)} SHIELD` : `+${D(r.each, day)} DMG`;
  const what: Record<string, string> = {
    foeBurn: "BURN ON THE FOE", foePoison: "POISON ON THE FOE", beltSlugs: "SLUG ON ITS BELT", ownPlate: `${S(r.per ?? 1, day)} SHIELD YOU HAVE`,
    ownShield: "WARD YOU HAVE", hitsTaken: "HIT ON YOU", ownHits: "OF ITS HITS", heartsLost: "HEART LOST", wins: "WIN",
  };
  if (r.give === "heal") return `${name} HEAL ${S(r.each, day)} TIMES THE FOE'S POISON`;
  // CINDER MAIL's face says ON FOE (its SHIELD is a letter longer than the design's PLATE; faces.ts' comment)
  return `${name} ${give} FOR EACH ${r.give === "plate" ? what[r.count].replace(" ON THE FOE", " ON FOE") : what[r.count]}`;
}

describe("ROWS-1 F2: which rigs are readers", () => {
  it("the ten rigs whose gate has `reads` at some star; SPALL CATCHER's is a gun part's and is no timeline row", () => {
    const found = Object.keys(ITEMS).filter((id) => ITEMS[id].kind === "gate" && STARS.some((s) => effectAt(id, s).gate?.reads));
    expect([...found].sort()).toEqual([...READERS].sort());
    for (const id of READERS) for (const s of STARS) expect(effectAt(id, s).gate!.reads, `${id} ★${s}`).toBeTruthy();
    for (const s of STARS) {
      expect(effectAt("spallcatcher", s).mod?.reads).toBeTruthy();
      expect(effectAt("spallcatcher", s).gate?.reads).toBeUndefined();
    }
    // the twelve scaling pieces: these ten, SPALL CATCHER and PRESSURE BREECH (an uncapped perQueued, no reader line)
    expect([...SCALE_PIECES].sort()).toEqual([...READERS, "spallcatcher", "pressure"].sort());
  });
});

describe("ROWS-1 F2: a reader's row is its name and the card face's clause, as bare words", () => {
  it("every reader, star, day (1, 5, 10, 24) and belt kind: the written row; the numbers are the star's and the day's", () => {
    let n = 0;
    for (const id of READERS) {
      for (const s of STARS) {
        for (const day of DAYS) {
          const want = expectedRow(id, s, day);
          for (const belt of BELTS) {
            expect(hitText(hit(id, s), belt, day), `${id} ★${s} day ${day} ${belt}`).toBe(want);
            n++;
          }
        }
      }
    }
    expect(n).toBe(READERS.length * STARS.length * DAYS.length * BELTS.length);
  });

  it("the clause in the row IS the face's clause: the face's drawn text (icons as the words they are) less its label and full stop", () => {
    for (const id of READERS) {
      for (const s of STARS) {
        for (const day of [1, 24]) {
          const face = faceLines(id, s, { day })!.rules[0].text; // "HIT: <clause>." in glyphs
          expect(face.startsWith("HIT: "), id).toBe(true);
          expect(face.endsWith("."), id).toBe(true);
          // the DMG and SLUG icons stand alone (no word after them): their names; a keyword's icon is followed by its word
          const clause = stripIcons(face.slice("HIT: ".length, -1).split(ICON.DMG).join("DMG").split(ICON.SLUG).join("SLUG"));
          const row = hitText(hit(id, s), "free", day);
          expect(row, `${id} ★${s} day ${day}`).toBe(`${ITEMS[id].name} ${clause}`);
          expect(row).not.toMatch(/[-]/); // no icon glyph: the timeline draws bare words
          expect(row).not.toMatch(/\.$/); // no full stop
        }
      }
    }
  });

  it("the row and the face take their clause from the one function: readerClause(reads) on the day", () => {
    for (const id of READERS) {
      for (const s of STARS) {
        for (const day of [1, 24]) {
          const { clause } = shownOn(day, () => readerClause(reads(id, s)));
          // the face draws `HIT: <clause>.` through icons() (the markup's tokens as glyphs); the row, the clause as bare words
          expect(faceLines(id, s, { day })!.rules[0].text, `${id} ★${s} day ${day}`).toBe(icons(`HIT: ${clause}.`));
          expect(hitText(hit(id, s), "free", day), `${id} ★${s} day ${day}`).toBe(`${ITEMS[id].name} ${readerRowWords(clause)}`);
        }
      }
    }
    // the source says it too: neither file keeps a clause of its own (a drift would need a second copy)
    const faces = readFileSync("src/ui/faces.ts", "utf8"), text = readFileSync("src/ui/abilityText.ts", "utf8");
    expect(faces).toContain("readerClause(r)");
    expect(text).toContain("readerClause(reads)");
    expect(faces).not.toMatch(/const READ_WORDS/);
    expect(text).not.toMatch(/const READ_WORDS/);
  });

  it("IRON WALL's rows, by hand: ★1 day 1, ★3 day 1 and ★3 day 24", () => {
    expect(hitText(hit("shieldwall", 1), "free", 1)).toBe("IRON WALL +3 DMG FOR EACH 10 SHIELD YOU HAVE");
    expect(hitText(hit("shieldwall", 3), "free", 1)).toBe("IRON WALL +17 DMG FOR EACH 10 SHIELD YOU HAVE");
    // day 24 (hullScale.ts D(24) and S(24)): the numbers the face shows there
    expect(hitText(hit("shieldwall", 3), "free", 24)).toBe(`IRON WALL +${D(17, 24)} DMG FOR EACH ${S(10, 24)} SHIELD YOU HAVE`);
    expect(hitText(hit("leechcoil", 1), "free", 1)).toBe("LEECH COIL HEAL 3 TIMES THE FOE'S POISON");
    expect(hitText(hit("cindermail", 3), "free", 1)).toBe("CINDER MAIL +5 SHIELD FOR EACH BURN ON FOE");
    expect(hitText(hit("quench", 2), "free", 1)).toBe("KINDLING +5 DMG FOR EACH BURN ON THE FOE");
    expect(hitText(hit("keg", 1), "free", 1)).toBe("POWDER KEG +2 DMG FOR EACH OF ITS HITS");
    expect(hitText(hit("crowdpress", 1), "free", 1)).toBe("CROWD PRESS +3 DMG FOR EACH SLUG ON ITS BELT");
    expect(hitText(hit("aegisspike", 1), "free", 1)).toBe("AEGIS SPIKE +40 DMG FOR EACH WARD YOU HAVE");
    expect(hitText(hit("grudgerod", 1), "free", 1)).toBe("GRUDGE ROD +6 DMG FOR EACH HEART LOST");
    expect(hitText(hit("trophychain", 1), "free", 1)).toBe("TROPHY CHAIN +8 DMG FOR EACH WIN");
    expect(hitText(hit("rotgauge", 1), "free", 1)).toBe("ROT GAUGE +3 DMG FOR EACH POISON ON THE FOE");
  });

  it("no day: day 1's numbers; the count is never a value (the row has no live count, and carries none from the walk's hit)", () => {
    expect(hitText(hit("shieldwall", 2), "free")).toBe("IRON WALL +6 DMG FOR EACH 10 SHIELD YOU HAVE");
    // a walk's hit carries the reader line as display data (deck.ts TimelineHit.reads) and flat 0: the row is the same
    const walked = hit("shieldwall", 2, { reads: { count: "ownPlate", each: 6, per: 10, give: "dmg" }, flat: 0 });
    expect(hitText(walked, "free", 1)).toBe(hitText(hit("shieldwall", 2), "free", 1));
  });
});

describe("ROWS-1 F2: the rig's own part comes first, then the clause after a comma", () => {
  const items = ITEMS as Record<string, ItemDef>;
  const own = (id: string, gate: object): void => {
    items[id] = {
      id, name: id.toUpperCase(), kind: "gate", rarity: "common", price: 3, size: 1, merchant: "tinker", desc: [], tags: ["FORGE"],
      gate: { ...gate, reads: { count: "foePoison", each: 3, give: "dmg" } },
    } as ItemDef;
    clearStarCache();
  };
  const drop = (id: string): void => { delete items[id]; clearStarCache(); };

  it("a plating rig that reads: `NAME +10 SHIELD, +3 DMG FOR EACH ...` (as the old IRON WALL row did); a flat; a heal; a keg's fuse", () => {
    try {
      own("rows1plate", { plate: 10 });
      expect(hitText(hit("rows1plate", 1), "free", 1)).toBe("ROWS1PLATE +10 SHIELD, +3 DMG FOR EACH POISON ON THE FOE");
      own("rows1flat", {});
      expect(hitText(hit("rows1flat", 1, { flat: 20 }), "free", 1)).toBe("ROWS1FLAT +20 DAMAGE, +3 DMG FOR EACH POISON ON THE FOE");
      own("rows1heal", { heal: 5 });
      expect(hitText(hit("rows1heal", 1), "free", 1)).toBe("ROWS1HEAL HEALS 5 HULL, +3 DMG FOR EACH POISON ON THE FOE");
      own("rows1keg", { keg: { flat: 90, fuse: 10 } });
      expect(hitText(hit("rows1keg", 1), "free", 1)).toBe("ROWS1KEG +90 DAMAGE EVERY 10 SEC, +3 DMG FOR EACH POISON ON THE FOE");
      // the own part's numbers go through the day as they always did (x S(d)): the plating, then the clause's own
      own("rows1plate", { plate: 10 });
      expect(hitText(hit("rows1plate", 1), "free", 24)).toBe(`ROWS1PLATE +${S(10, 24)} SHIELD, +${D(3, 24)} DMG FOR EACH POISON ON THE FOE`);
    } finally {
      for (const id of ["rows1plate", "rows1flat", "rows1heal", "rows1keg"]) drop(id);
    }
  });

  it("SCALE_RIGS off (an older rules version's view): IRON WALL keeps its old row, and no reader line is read", () => {
    withScaleRigs(() => {
      expect(effectAt("shieldwall", 1).gate?.reads).toBeUndefined();
      expect(hitText(hit("shieldwall", 1), "free", 1)).toBe("IRON WALL +10 SHIELD, +30 DAMAGE AT 120 SHIELD");
    }, false);
  });
});

describe("ROWS-1 F2: every reader's row fits whole at ★3 and day 24 on the desk and the two phones (the timeline's own rule: it wraps)", () => {
  // the timeline's rule for a long row (inspector.ts layBlock, role "row"): the text wraps at the panel's text width less the label
  // column (T4), the label on the first line and the rest indented under the text; the 5x7 face first, the 3x5 where the 5x7 does not
  // fit; when the panel runs out of room whole rows give way from the end, each counted in "+n MORE HIT TILES" (choose); a row is
  // never cut. So "fits whole" is: every word of the row is on a drawn line, no line is wider than its room, the row is not given way
  const VIEWS: [string, number, number, number][] = [["desk 1280x800", 1280, 800, 1], ["op690 402x690 @3", 402, 690, 3], ["small 360x640 @2", 360, 640, 2]];

  /** A furnace run on `day` holding `id` at `stars` beside a belt tile it works: [run, the rig's uid]. */
  function holding(id: string, stars: number, day: number): Run {
    const run = newRun("furnace", 4242);
    run.day = day;
    const b = run.build, cells = b.routes[0].cells;
    for (let i = cells.length - 1; i >= 0; i--) {
      let spot: { x: number; y: number; rot: number };
      try { spot = spotBeside(b, id, cells[i]); } catch { continue; }
      const p: Placed = { uid: 99, def: id, x: spot.x, y: spot.y, ...rotField(id, spot.rot), ...(stars > 1 ? { stars } : {}) };
      b.items.push(p);
      if (walkRoute(b, 0).timeline.some((r) => r.hits.some((h) => h.uid === 99))) return run;
      b.items.pop();
    }
    throw new Error(`no belt tile of the furnace's first route takes ${id}`);
  }

  it("the real belt panel on each view: the row is whole, in the 5x7 face, on as many lines as it needs", () => {
    let plans = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr), phone = isPhone(v), tap = phone ? tapPx(v) : 0;
      const L = buildLayout(v.W, v.H, v.portrait, 5, phone && v.portrait, tap);
      for (const id of READERS) {
        const run = holding(id, 3, 24);
        const want = expectedRow(id, 3, 24).slice(ITEMS[id].name.length + 1); // the row's own words after its name
        const plan = planPanel(routePanel(run, 0)!, L.info, [], phone ? { tap, band: true, inBand: true } : {});
        plans++;
        const row = plan.body.shown.find((l) => l.b.role === "row" && l.b.text.startsWith(ITEMS[id].name));
        expect(row, `${name}: ${id}'s row is not given way (shown: ${plan.body.shown.map((l) => l.b.text.slice(0, 24)).join(" | ")})`).toBeTruthy();
        const lines = row!.lines;
        expect(row!.b.text, `${name} ${id}`).toBe(`${ITEMS[id].name} ${want}`);
        expect(lines.map((l) => lineText(l.spans)).join(" "), `${name} ${id}: every word is drawn`).toBe(row!.b.text);
        expect(plan.body.fits, `${name} ${id}`).toBe(true);
        expect(plan.body.dropped.filter((b: Block) => b.role === "row"), `${name} ${id}: no row gave way`).toEqual([]);
        for (const l of lines) {
          const room = L.info.w - 10 - (l.indent ?? 0);
          expect(textWidth(lineText(l.spans), l.font), `${name} ${id}: a line wider than its room`).toBeLessThanOrEqual(room);
        }
        expect(lines[0].label, `${name} ${id}: the tile's label is on the first line`).toMatch(/^T\d+$/);
      }
    }
    expect(plans).toBe(VIEWS.length * READERS.length);
  });

  it("the row alone, in each face and each view's panel text width, the label column kept: whole in every case (the longest row is IRON WALL's)", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr), phone = isPhone(v);
      const L = buildLayout(v.W, v.H, v.portrait, 5, phone && v.portrait, phone ? tapPx(v) : 0);
      const width = L.info.w - 10;
      for (const id of READERS) {
        for (const day of [1, 24]) {
          const text = hitText(hit(id, 3), "free", day);
          for (const font of ["5", "3"] as const) {
            const laid = lay([{ role: "row", label: "T10", text, trim: true, tie: true } as Block], width, font);
            const lines = laid[0].lines;
            expect(lines.map((l) => lineText(l.spans)).join(" "), `${name} ${id} day ${day} font ${font}`).toBe(text);
            for (const l of lines) expect(textWidth(lineText(l.spans), font), `${name} ${id} ${font}`).toBeLessThanOrEqual(width - (l.indent ?? 0));
            // IRON WALL's row is the longest (263 px in 5x7 at ★3, day 24): two lines on the phones' 225 px text width, four on the desk column's 118
            expect(lines.length, `${name} ${id}`).toBeLessThanOrEqual(width >= 200 ? 2 : 4);
          }
        }
      }
    }
  });
});
