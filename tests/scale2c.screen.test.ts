// SCALE-2c (REQ-BFG-098, REQ-BFG-089, REQ-BFG-087, REQ-BFG-107, REQ-BFG-081; BRIEF-SCALE2c sections 2-3, M2): the 12
// scaling pieces on the screen with SCALE_RIGS on (withScaleRigs): each face's ability line (REPORT-SCALE1 3.1's, in the
// tokens), its fit (one line of 5x7 at 225 px at every star and day; the desk shop card's two effect lines; the phone
// gist's 39 px row A), LEVELS / NEXT★ on the switch-on numbers, the NOTES line (3.2's hover), the flavour rows and the
// art (ART-1E: each new id's own, no longer a stand-in's); off, every face, line, gist, note and list is as at M0.
import { describe, expect, it } from "vitest";
import { ITEMS, buyableModules, classFactor, type ItemDef } from "../src/sim/content";
import { SCALE_IDS, SCALE_PIECES, scaleRules, withScaleRigs } from "../src/sim/scale";
import { MAX_DAY } from "../src/net/snapshot";
import { glyphRows, icons, textWidth } from "../src/render/font";
import { FACE_IDS, NEXT_LINE_W, faceAt, faceLines, faceNext, hasFace, scaleNotes } from "../src/ui/faces";
import { abilityText, cardText, gist, hasAbilityText } from "../src/ui/abilityText";
import { PHONE_GISTS, SCALE_GISTS, phoneGist, shopChip } from "../src/ui/chips";
import { glossaryText } from "../src/ui/glossary";
import { KEPT_FLAVOUR, flavour } from "../src/screens/build/flavour";
import { CARD_EFFECT_LINES, CARD_MARK_X, cardEffectLines, cardEffectWidth, cardPriceX } from "../src/screens/build/shop";
import { CARD_W, wideCardW } from "../src/screens/build/layout";
import { lineText, lineWidth } from "../src/ui/richText";
import { explainPanel, type PanelText } from "../src/screens/build/inspector";
import { gateSprite } from "../src/render/sprites"; // ART-1E: the own-art test below (was SCALE_ART_FROM's stand-in test)

/** ART-1E: the least of a software canvas gateSprite needs (fillRect and a 2-argument drawImage; each pixel kept by its colour
 *  name), installed as `document` only inside the own-art test below. tests/art1e.test.ts has the whole raster. */
interface Ctx { fillStyle: string; imageSmoothingEnabled: boolean; fillRect(x: number, y: number, w: number, h: number): void; drawImage(img: Raster, dx: number, dy: number): void }
class Raster {
  w = 300;
  h = 150;
  px: (string | null)[] = new Array<string | null>(300 * 150).fill(null);
  private c: Ctx | null = null;
  get width(): number { return this.w; }
  set width(v: number) { this.w = v; this.px = new Array<string | null>(this.w * this.h).fill(null); }
  get height(): number { return this.h; }
  set height(v: number) { this.h = v; this.px = new Array<string | null>(this.w * this.h).fill(null); }
  getContext(): Ctx {
    if (this.c) return this.c;
    const cv = this;
    const ctx: Ctx = {
      fillStyle: "#000000",
      imageSmoothingEnabled: true,
      fillRect(x, y, w, h) {
        for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < cv.w && j < cv.h) cv.px[j * cv.w + i] = ctx.fillStyle;
      },
      drawImage(img, dx, dy) {
        for (let j = 0; j < img.h; j++) for (let i = 0; i < img.w; i++) {
          const p = img.px[j * img.w + i];
          if (p !== null && dx + i >= 0 && dy + j >= 0 && dx + i < cv.w && dy + j < cv.h) cv.px[(dy + j) * cv.w + dx + i] = p;
        }
      },
    };
    return (this.c = ctx);
  }
}
const pixels = (c: unknown): string => (c as Raster).px.map((p) => p ?? "-").join(",");

/** BRIEF-SCALE2c section 2's face lines at ★1 (day 1, k 1), in markup. */
const LINE: Record<string, string> = {
  quench: "HIT: +3 {DMG} FOR EACH {*BURN} ON THE FOE.",
  pressure: "SHOT: +8 {DMG} FOR EACH {SLUG} WAITING.", // SCALE-2e run 2: ★1 was +12
  shieldwall: "HIT: +3 {DMG} FOR EACH 10 {*PLATE} YOU HAVE.", // SCALE-2e E4: was +5
  spallcatcher: "SHOT: +1 {DMG} FOR EACH HIT ON YOU.", // SCALE-2e E4: was +3; run 2: was +2
  keg: "HIT: +2 {DMG} FOR EACH OF ITS HITS.", // SCALE-2e E4: was +3
  cindermail: "HIT: +2 {*PLATE} FOR EACH {*BURN} ON FOE.", // the brief's less THE: {*PLATE} draws SHIELD, past 225 px with it
  rotgauge: "HIT: +3 {DMG} FOR EACH {*POISON} ON THE FOE.",
  leechcoil: "HIT: {*HEAL} 3 TIMES THE FOE'S {*POISON}.",
  crowdpress: "HIT: +3 {DMG} FOR EACH {SLUG} ON ITS BELT.",
  aegisspike: "HIT: +40 {DMG} FOR EACH {*SHIELD} YOU HAVE.",
  grudgerod: "HIT: +6 {DMG} FOR EACH HEART LOST.",
  trophychain: "HIT: +8 {DMG} FOR EACH WIN.",
};
/** REPORT-SCALE1 3.2's hover line, each piece's NOTES (markup). */
const NOTE: Record<string, string> = {
  quench: "IT COUNTS THE {*BURN} ON THE FOE'S HULL AT THE HIT. THE SLUG KEEPS THE {DMG}.",
  cindermail: "IT COUNTS THE {*BURN} ON THE FOE'S HULL AT THE HIT.",
  rotgauge: "IT COUNTS THE {*POISON} ON THE FOE'S HULL AT THE HIT. THE SLUG KEEPS THE {DMG}.",
  leechcoil: "IT COUNTS THE {*POISON} ON THE FOE'S HULL AT THE HIT.",
  shieldwall: "IT COUNTS YOUR {*PLATE} AT THE HIT, ROUNDED DOWN: 29 {*PLATE} IS 2 TIMES.", // SCALE-2e E6: 3 x per - 1 in the face's units (was 239 ... 23 TIMES)
  aegisspike: "IT COUNTS YOUR {*SHIELD} AT THE HIT.",
  keg: "IT COUNTS ITS OWN HITS THIS FIGHT, THIS ONE TOO. THE COUNT SHOWS ON IT.",
  grudgerod: "IT COUNTS THE HEARTS YOU HAVE LOST THIS RUN, AS THE RUN BAR SHOWS THEM.",
  trophychain: "IT COUNTS YOUR WINS THIS RUN, AS THE RUN BAR SHOWS THEM.",
};
const REWORKS = ["quench", "pressure", "shieldwall", "spallcatcher", "keg"];
const DAYS = Array.from({ length: MAX_DAY }, (_, i) => i + 1);
const KS = [...new Set(Object.values(ITEMS).filter((d) => d.kind === "turret" && d.turret).map((d) => classFactor(d.turret!)))];
const optsFor = (d: ItemDef, day?: number, k = 1) => (d.kind === "core" ? { k, ...(day ? { day } : {}) } : day ? { day } : {});
/** The chip's room left of the coin (card5.test.ts's). */
const roomOf = (price: number): number => cardPriceX(0, CARD_W, price, false, true) - CARD_MARK_X - 1;
/** No plain PLATE word, and no SHIELD written out, outside the markup tokens (REQ-BFG-107). */
const bareWords = (markup: string): boolean => /\b(PLATE|PLATES|PLATED|PLATING|SHIELD|SHIELDS)\b/.test(markup.replace(/\{\*?[A-Z]+\}/g, " "));

// the switch-off world, captured at this file's load (the switch is off): every text the 12 make
function offTexts(): string {
  const out: string[] = [];
  for (const id of SCALE_PIECES) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) { out.push(`${id}: absent`); continue; }
    const d = ITEMS[id];
    for (const s of [1, 2, 3]) {
      out.push(JSON.stringify([id, s, faceLines(id, s, optsFor(d)), faceNext(id, s, optsFor(d)), abilityText(id, s, optsFor(d)), gist(id, s, optsFor(d))]));
      out.push(JSON.stringify([phoneGist(id, optsFor(d), s), glossaryText(id === "keg" ? "EVERY" : d.kind === "gate" ? "HIT" : "SHOT", { def: id, stars: s, o: optsFor(d) })]));
    }
    out.push(JSON.stringify([cardText(id, optsFor(d)), shopChip(id, optsFor(d)), flavour(id), scaleNotes(id)]));
  }
  return out.join("\n");
}
const OFF0 = offTexts();
const FACE_IDS0 = [...FACE_IDS];
const FLAVOUR_KEYS0 = Object.keys(KEPT_FLAVOUR).sort();

describe("SCALE-2c screen: with the switch off, every face, line, gist, note and list is as at M0", () => {
  it("the 5 reworks' texts are the same before and after a switch round trip; the 7 new ids have none", () => {
    expect(scaleRules()).toBe(false);
    withScaleRigs(() => offTexts());
    expect(offTexts()).toBe(OFF0);
    expect(OFF0).toContain("QUENCH TANK".length ? "TURNS EACH" : "");
    for (const id of SCALE_IDS) {
      expect([hasFace(id), hasAbilityText(id), phoneGist(id), scaleNotes(id)]).toEqual([false, false, null, []]);
      expect(Object.prototype.hasOwnProperty.call(KEPT_FLAVOUR, id)).toBe(false);
    }
    expect([...FACE_IDS]).toEqual(FACE_IDS0);
    expect(Object.keys(KEPT_FLAVOUR).sort()).toEqual(FLAVOUR_KEYS0);
    for (const id of REWORKS) expect(Object.prototype.hasOwnProperty.call(SCALE_GISTS, id) && PHONE_GISTS[id] !== undefined).toBe(true);
  });
});

describe("SCALE-2c screen: the 12 faces with the switch on", () => {
  it("each face's ability line is the brief's at ★1 (one line, its trigger in brass), with its keywords' reminders", () => {
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const d = ITEMS[id];
        expect(hasFace(id), id).toBe(true);
        const f = faceAt(id, 1, optsFor(d))!;
        expect(f.rules.map((r) => r.text), id).toEqual([LINE[id]]);
        expect(f.rules[0].label).toBe(LINE[id].startsWith("SHOT") ? "SHOT:" : "HIT:");
        const kws = [...LINE[id].matchAll(/\{\*([A-Z]+)\}/g)].map((m) => m[1]);
        expect(f.reminders.length, id).toBe(new Set(kws).size);
        kws.forEach((k) => expect(f.reminders.some((r) => r.includes(`{*${k}}`)), `${id} ${k}`).toBe(true));
        expect(bareWords(LINE[id]), id).toBe(false);
      }
    });
  });

  it("each ability line fits one line of 5x7 at 225 px at every star, every day and every class factor (a core)", () => {
    withScaleRigs(() => {
      const bad: string[] = [];
      for (const id of SCALE_PIECES) {
        const d = ITEMS[id];
        for (const s of [1, 2, 3]) for (const day of DAYS) for (const k of d.kind === "core" ? KS : [1]) {
          const fl = faceLines(id, s, optsFor(d, day, k))!;
          for (const r of fl.rules) if (textWidth(r.text, "5") > 225) bad.push(`${id} ★${s} d${day} k${k}: ${textWidth(r.text, "5")} px`);
          const nx = faceNext(id, s, optsFor(d, day, k));
          if (nx && textWidth(icons(nx.text), "5") > NEXT_LINE_W) bad.push(`${id} ★${s} d${day}: NEXT ${textWidth(icons(nx.text), "5")} px`);
        }
      }
      expect(bad).toEqual([]);
    });
  });

  it("LEVELS / NEXT★ read the switch-on numbers (★2's and ★3's)", () => {
    const next: Record<string, [string, string]> = {
      quench: ["+5", "+8"], pressure: ["+13", "+42"], shieldwall: ["+6", "+17"], spallcatcher: ["+2", "+7"], keg: ["+5", "+11"], // SCALE-2e E4: IRON WALL 3/6/17, SPALL CATCHER 2/3/7, POWDER KEG 2/5/11
      cindermail: ["+3", "+5"], rotgauge: ["+5", "+8"], leechcoil: ["4", "6"], crowdpress: ["+7", "+11"], aegisspike: ["+88", "+140"],
      grudgerod: ["+13", "+21"], trophychain: ["+12", "+28"], // SCALE-2e E4: TROPHY CHAIN 8/12/28
    };
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const o = optsFor(ITEMS[id]);
        expect(faceNext(id, 1, o)!.text, id).toMatch(new RegExp(`^NEXT ★2: \\S*\\s?${next[id][0].replace("+", "\\+")}\\b`));
        expect(faceNext(id, 2, o)!.text, id).toMatch(new RegExp(`^NEXT ★3: \\S*\\s?${next[id][1].replace("+", "\\+")}\\b`));
        expect(faceNext(id, 3, o)).toBeNull();
      }
    });
  });

  it("NOTES (default rules, behind the hover or tap): REPORT-SCALE1 3.2's line, in the ⓘ view's NOTES; never on the face", () => {
    withScaleRigs(() => {
      for (const id of SCALE_PIECES) {
        const [n] = scaleNotes(id, true);
        expect(n, id).toBeTruthy();
        if (NOTE[id]) expect(n, id).toBe(NOTE[id]);
        expect(scaleNotes(id)).toEqual([icons(n)]);
        expect(bareWords(n), id).toBe(false);
        const t = explainPanel({ title: "", color: "", sub: "", body: [], labels: [] } as unknown as PanelText, id);
        expect(t.notes!.map((b) => b.text), id).toContain(icons(n));
        expect(faceAt(id, 1, optsFor(ITEMS[id]))!.rules.some((r) => r.text.includes("IT COUNTS"))).toBe(false);
      }
      // PRESSURE BREECH's SHOT tap: no cap any more, NEVER JAMS kept
      expect(glossaryText("SHOT", { def: "pressure", stars: 1, o: { k: 1 } })).toBe("SHOT: IT COUNTS EVERY WAITING LOAD, AND IT NEVER JAMS.");
    });
  });

  it("the desk shop card's line fits its two effect lines at every landscape width; plain words, no PLATE", () => {
    withScaleRigs(() => {
      const bad: string[] = [];
      for (const id of SCALE_PIECES) {
        const d = ITEMS[id], line = cardText(id, optsFor(d));
        expect(line, id).toMatch(/^[A-Z0-9' ,]+\.$/);
        expect(/\b(PLATE|PLATES|PLATED|PLATING)\b/.test(line), id).toBe(false);
        for (const day of DAYS) {
          const l2 = cardText(id, optsFor(d, day));
          for (let W = 430; W <= 480; W++) {
            const w = wideCardW(W, 5), ls = cardEffectLines(l2, w);
            if (ls.length > CARD_EFFECT_LINES) bad.push(`${id} d${day} at ${w}: ${ls.length} lines`);
            for (const l of ls) if (lineWidth(l, "3") > cardEffectWidth(w)) bad.push(`${id} at ${w}: ${lineText(l)}`);
          }
        }
        for (const s of [1, 2, 3]) for (const t of abilityText(id, s, optsFor(d)).sentences) expect(/\b(PLATE|PLATES|PLATED|PLATING)\b/.test(t), `${id}: ${t}`).toBe(false);
      }
      expect(bad).toEqual([]);
      expect(cardText("quench")).toBe("3 DAMAGE FOR EACH FOE BURN.");
      expect(cardText("shieldwall")).toBe("3 DAMAGE FOR EACH 10 SHIELD."); // SCALE-2e E4: was 5
      expect(cardText("aegisspike")).toBe("40 DAMAGE FOR EACH WARD.");
      expect(cardText("leechcoil")).toBe("HEALS 3 TIMES THE FOE'S POISON.");
    });
  });

  it("PHONE_GISTS: a switch-on row for all 12: row A words at most 39 px of 3x5 and 10 capitals, no digit; row B the chip in its room", () => {
    withScaleRigs(() => {
      const bad: string[] = [];
      expect(Object.keys(SCALE_GISTS).sort()).toEqual([...SCALE_PIECES].sort());
      for (const id of SCALE_PIECES) {
        const d = ITEMS[id], room = roomOf(d.price);
        for (const s of [1, 2, 3]) for (const day of DAYS) for (const k of d.kind === "core" ? KS : [1]) {
          const g = phoneGist(id, optsFor(d, day, k), s);
          if (!g) { bad.push(`${id}: no gist`); continue; }
          const a = icons(g[0]), b = icons(g[1], "alone"), aw = textWidth(a, "3"), bw = textWidth(b, "3");
          const caps = (a.match(/[A-Z]/g) ?? []).length;
          if (aw > CARD_W - 2 * CARD_MARK_X - 1 || aw > 39 || caps > 10) bad.push(`${id}: row A ${g[0]} ${aw} px, ${caps} capitals`);
          if (/\d/.test(g[0])) bad.push(`${id}: a digit in row A ${g[0]}`);
          if (bw > room) bad.push(`${id} ★${s} d${day} k${k}: row B ${g[1]} ${bw} px of ${room}`);
          for (const ch of a + b) if (ch !== " " && !glyphRows(ch, "3")) bad.push(`${id}: no 3x5 glyph for ${JSON.stringify(ch)}`);
        }
      }
      expect(bad).toEqual([]);
      expect(phoneGist("quench")).toEqual(["PER FOE {BURN}", "{DMG}+3"]);
      expect(phoneGist("cindermail")).toEqual(["PER FOE {BURN}", "{PLATE}+2"]);
      expect(phoneGist("leechcoil")).toEqual(["PER FOE {POISON}", "{HEAL}3"]);
    });
  });

  it("flavour: the 7 new ids' rows (none kept) join KEPT_FLAVOUR with the switch on; the rows are the sold modules' exactly", () => {
    withScaleRigs(() => {
      for (const id of SCALE_IDS) expect([KEPT_FLAVOUR[id], flavour(id)]).toEqual([[], []]);
      for (const id of REWORKS) expect(flavour(id)).toEqual([]);
      const sold = buyableModules().map((d) => d.id);
      for (const id of sold) expect(Object.prototype.hasOwnProperty.call(KEPT_FLAVOUR, id), id).toBe(true);
    });
    expect(Object.keys(KEPT_FLAVOUR).sort()).toEqual(FLAVOUR_KEYS0);
  });

  it("own art: each new id draws its own picture, no longer its former stand-in's (SCALE-2c's artFrom map, kept here); the new ids are the seven", () => {
    // SCALE-2c drew each new id as a live rig's picture (sprites.ts SCALE_ART_FROM, LEECH COIL RIVETER's); ART-1E's render/scaleArt.ts
    // draws its own (tests/art1e.test.ts: every frame, the icons, the silhouettes)
    const FORMER: Readonly<Record<string, string>> = {
      cindermail: "plateroller", rotgauge: "heatjacket", leechcoil: "riveter", crowdpress: "pincer", aegisspike: "braceframe",
      grudgerod: "counterweight", trophychain: "overclocker",
    };
    for (const id of Object.values(FORMER)) expect(ITEMS[id]?.kind, id).toBe("gate");
    expect(Object.keys(FORMER).sort()).toEqual([...SCALE_IDS].sort());
    const world = globalThis as unknown as { document: unknown };
    const was = world.document;
    world.document = { createElement: () => new Raster() };
    try {
      for (const [id, from] of Object.entries(FORMER)) {
        expect(pixels(gateSprite(id, 0, false)), `${id} still draws ${from}'s picture`).not.toBe(pixels(gateSprite(from, 0, false)));
      }
    } finally {
      world.document = was;
    }
  });
});
