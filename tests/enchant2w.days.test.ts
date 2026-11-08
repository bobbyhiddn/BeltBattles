// ENCHANT-2W (REQ-BFG-085, REQ-BFG-089; BRIEF-ENCHANT2W W3, E2-05's carry-over): A WORD'S CARD, DRAWN DURING A RUN, GIVES THE RUN'S DAY'S AMOUNTS, AS THE PART'S PANEL DOES.
//   Why: ENCHANT-2's fix round (cap's ruling 2d9c4479a18adbf5) made RISING's and GROWING's lines on a PART's panel say the day's damage (step x stars x D(day), rounded down:
//   enchantFaces.ts wordLine's `day`), and left the word's own CARD at day 1's numbers, so on day 6 the ENCHANTER's GROWING card said +5 while the grown part's panel said +10.
//   The rule now: every word card drawn during a run uses the run's day: the ENCHANTER's offer and its tap panel, the warlord pick and REFIT's pick strip (apply.ts wordSpec),
//   the shrine's `?` card (wordInfo.ts, drawn by the event screen), APPLY (the same panel), and LAST CHANCE's detail (lcWordItem). A card drawn with no run (the text sheet's
//   word cards, any glossary) keeps day 1's numbers (+5, +1). Only RISING's and GROWING's DMG amounts move; the other six words' lines ignore the day. UI only.
import { afterEach, describe, expect, it, vi } from "vitest";
import { G, fresh, installRaster } from "./raster.helpers";

installRaster();

const rec = vi.hoisted(() => ({ text: [] as { s: string; x: number; y: number; font: string }[] }));
vi.mock("../src/render/font", async (importOriginal) => {
  const m = await importOriginal<typeof import("../src/render/font")>();
  const drawText: typeof m.drawText = (g, s, x, y, color, opts) => {
    rec.text.push({ s, x, y, font: opts?.font ?? "5" });
    return m.drawText(g, s, x, y, color, opts);
  };
  return { ...m, drawText };
});

import { newRun, type Run } from "../src/game/run";
import { makeEvent } from "../src/game/events";
import { shrineOffer } from "../src/game/shrine";
import { EventScreen } from "../src/screens/event/event";
import { drawWordInfo, wordInfoRows } from "../src/screens/event/wordInfo";
import { eventLayout } from "../src/screens/event/layout";
import { wordSpec } from "../src/screens/build/apply";
import { partInfo, lcWordItem } from "../src/screens/lastChancePicker";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS } from "../src/ui/tap";
import { UI } from "../src/ui/ui";
import { detailsPlan, fullText, itemPanel, keptWhole, panelFit } from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { setTipsForTests } from "../src/ui/tips";
import { ENCHANT, ENCHANT_DEFS, ENCHANT_IDS, ENCHANT_NUM, setEnchant, withEnchant, type EnchantId, type EnchantKind } from "../src/sim/enchant";
import { dmgMulTenths, withHullScale } from "../src/sim/hullScale";
import { ENCHANT_NOTES, RISING_CARD_RESETS, RISING_RESETS, pieceLine, wordFace, wordLine } from "../src/ui/enchantFaces";
/** POLISH-1 (P3a): a card row is wordLine's, but RISING's reset sentence stands once on its card, on the LAST row (all three rows do not keep whole in the phone band); FIX ROUND (the cold
 *  read's PW-01): there it says `ALL THREE RESET EACH FIGHT.` for the three rows above it (RISING_CARD_RESETS), not the part's own `IT STARTS OVER EACH FIGHT.`. */
const cardRow = (id: string, i: number, n: number, line: string | null): string | null => (id === "rising" && line !== null ? line.replace(` ${RISING_RESETS}`, i < n - 1 ? "" : ` ${n === 3 ? RISING_CARD_RESETS : RISING_RESETS}`) : line);
import { lineText } from "../src/ui/richText";
import { icons, textWidth } from "../src/render/font";
import { ITEMS } from "../src/sim/content";
import type { Game } from "../src/game/game";

afterEach(() => setEnchant(ENCHANT));
const on = <T>(fn: () => T): T => withEnchant(fn, true);
const KINDS: EnchantKind[] = ["rig", "factory", "turret"];
const DAYS = [1, 2, 3, 6, 8, 10, 12, 16, 18, 20, 24];
const SIX = ENCHANT_IDS.filter((id) => id !== "rising" && id !== "growing");
/** n x D(day), rounded down: the read-outs' rule (hullScale.ts dmgShown), written out from the table */
const onDay = (n: number, day: number): number => Math.floor((n * dmgMulTenths(day)) / 10);

describe("W3: wordFace(id, day) gives RISING's and GROWING's amounts on the day, as wordLine does; the other six words ignore the day; no day is day 1's", () => {
  it("the two examples of the brief: the ENCHANTER's GROWING card on day 6 says +10 (was +5), RISING's on day 8 says +2 (was +1)", () => {
    on(() => {
      for (const kind of KINDS) {
        expect(wordFace("growing", 6).lines.find((l) => l.kind === kind)?.text, `GROWING ${kind}`).toBe(`AFTER EACH DUSK FIGHT: ${kind === "rig" ? "ITS HIT" : kind === "factory" ? "ITS SLUGS" : "ITS SHOTS"} +10 {DMG}, FOR THE RUN.`);
        expect(wordFace("rising", 8).lines.find((l) => l.kind === kind)?.text, `RISING ${kind}`).toContain("+2 {DMG} MORE THAN THE LAST.");
      }
    });
  });

  it("every day 1-24: GROWING's card is +5 x D(day) and RISING's +1 x D(day) (rounded down, never under day 1's), on every kind; wordFace(id, day) rows are wordLine(id, kind, 1, day)", () => {
    on(() => {
      for (let day = 1; day <= 24; day++) {
        for (const id of ["growing", "rising"] as const) {
          const step = id === "growing" ? ENCHANT_NUM.growingStep : ENCHANT_NUM.risingStep;
          const rows = wordFace(id, day).lines;
          for (const [i, l] of rows.entries()) {
            expect(l.text, `${id} ${l.kind} day ${day}`).toBe(cardRow(id, i, rows.length, wordLine(id, l.kind, 1, day)));
            expect(l.text, `${id} ${l.kind} day ${day}`).toContain(`+${onDay(step, day)} {DMG}`);
            expect(onDay(step, day), `${id} day ${day}: never under day 1's`).toBeGreaterThanOrEqual(step);
          }
        }
      }
      // the day moves nothing else on the card: the name, the colour, the labels, the NOTES, the kinds
      for (const id of ENCHANT_IDS) {
        const a = wordFace(id, 20), b = wordFace(id);
        expect(a.name).toBe(b.name);
        expect(a.color).toBe(b.color);
        expect(a.notes).toEqual(ENCHANT_NOTES);
        expect(a.lines.map((l) => [l.kind, l.label, l.legal])).toEqual(b.lines.map((l) => [l.kind, l.label, l.legal]));
      }
    });
  });

  it("the other six words' lines ignore the day (every day 1-24, every kind)", () => {
    on(() => {
      for (const id of SIX) for (let day = 1; day <= 24; day++) expect(wordFace(id, day).lines, `${id} day ${day}`).toEqual(wordFace(id).lines);
    });
  });

  it("no day (the text sheet's word cards, a glossary, any card drawn with no run) is day 1's numbers, +5 and +1, as before; day 1 is the same", () => {
    on(() => {
      for (const id of ENCHANT_IDS) {
        expect(wordFace(id, undefined)).toEqual(wordFace(id));
        expect(wordFace(id, 1), id).toEqual(wordFace(id));
      }
      for (const kind of KINDS) {
        const g = wordFace("growing").lines.find((l) => l.kind === kind), r = wordFace("rising").lines.find((l) => l.kind === kind);
        expect(g?.text).toContain(`+${ENCHANT_NUM.growingStep} {DMG}`);
        expect(r?.text).toContain(`+${ENCHANT_NUM.risingStep} {DMG}`);
      }
    });
  });

  it("with the HULL_SCALE switch off the day scales nothing: the card says +5 and +1 on any day", () => {
    on(() => withHullScale(() => {
      for (const day of [6, 8, 24]) for (const id of ["growing", "rising"] as const) expect(wordFace(id, day).lines, `${id} day ${day}`).toEqual(wordFace(id).lines);
    }, false));
  });

  it("the card and the part's panel agree: at one star the card's line IS the panel's line (the panel adds `, ON TOP OF ITS OWN STATS` to FIERY's only), on every day and kind", () => {
    on(() => {
      for (let day = 1; day <= 24; day++) for (const kind of KINDS) for (const id of ENCHANT_IDS) {
        const rows = wordFace(id, day).lines, card = rows.find((l) => l.kind === kind)?.text ?? null, panel = pieceLine(id, kind, 1, day);
        if (card === null) { expect(panel).toBeNull(); continue; }
        if (id === "fiery") expect(panel).toBe(card.replace(/\.$/, ", ON TOP OF ITS OWN STATS."));
        else expect(cardRow(id, rows.findIndex((l) => l.kind === kind), rows.length, panel), `${id} ${kind} day ${day}`).toBe(card); // POLISH-1 (P3a): RISING's first two rows lack the reset sentence the panel has
      }
    });
  });
});

describe("W3: the grown part on day 6 and the ENCHANTER's card agree: what one dusk fight adds that day", () => {
  it("a GROWING WHETSTONE that has grown through three dusk fights, on day 6: its panel's line says +10 and the ENCHANTER's GROWING card says +10", () => {
    on(() => {
      const run = newRun("furnace", 5, "enchant2w-days");
      run.day = 6;
      run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, { uid: 9, def: "whetstone", x: 3, y: 3, rot: 3, ench: "growing", grow: 3 } as never], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
      run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0, enchanter: { day: 6, offers: [{ ench: "growing", price: 4, sold: false }, { ench: "rising", price: 4, sold: false }] } };
      const part = itemPanel(run, 9)!;
      const line = part.body.find((b) => b.colour === ENCHANT_DEFS.growing.color)!;
      expect(line.text).toBe(icons("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN."));
      const ctx = { game: { ui: new UI(), t: 0 }, run } as unknown as Ctx;
      const spec = wordSpec(ctx, { kind: "word", pick: false, i: 0 })!;
      const rig = spec.text.body.find((b) => b.text.startsWith("ON A RIG:"))!;
      expect(rig.text).toBe(`ON A RIG: ${icons("AFTER EACH DUSK FIGHT: ITS HIT +10 {DMG}, FOR THE RUN.")}`);
      expect(rig.text.endsWith(line.text), "the card's rig row ends with the part's own line").toBe(true);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the build screen's word panels (apply.ts wordSpec)

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/enchant1.faces.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const pw = Math.floor(w * dpr), ph = Math.floor(h * dpr), portrait = ph > pw * 1.05;
  const fake = { run: { build: { runes: Array.from({ length: runes }, () => ({ id: "many_hands" })) } }, refit: false, offers: () => Array.from({ length: offers }) } as unknown as Parameters<typeof runeRowFits>[0];
  let S = buildScale(pw, ph, portrait, dpr);
  while (S > 1 && !runeRowFits(fake, pw, ph, portrait, S, dpr)) S--;
  const isPh = phoneScreen(pw, ph, dpr), phone = portrait && isPh, tap = isPh ? Math.ceil(TAP_CSS / (S / dpr)) : 0;
  const v = { scale: S, dpr }, W = Math.floor(pw / S), H = Math.floor(ph / S);
  const lay = (unit: number) => {
    const row = runeRowH(v, runes), lift = phone ? phoneBarLift(W, H, offers, tap, runeRowH(v, 1)) : 0;
    return shiftLayout(buildLayout(W, H - row, portrait, offers, phone, tap, lift, { scale: S, unit }), row, H);
  };
  const Z = lay(1).cam.z, unit = gcd(S, Z), sub = S / unit;
  return { S, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}
const VIEWS = [["phone 402x690", framed(402, 690, 3, 1), true], ["desk 1280x800", framed(1280, 800, 1, 1), false]] as const;
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  return { ctx, area, d: () => detailsPlan(ctx, sel, null, area)! };
}

/** A furnace run on `day` with the ENCHANTER's wagon (growing, rising) and, for the pick cards, the warlord pick (growing, rising) and the shrine's word. */
function dayRun(day: number, words: [EnchantId, EnchantId] = ["growing", "rising"]): Run {
  return on(() => {
    const run = newRun("furnace", 7);
    run.day = day;
    run.gold = 99;
    run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0, enchanter: { day, offers: words.map((ench) => ({ ench, price: 4, sold: false })) } };
    return run;
  });
}

describe("W3: the ENCHANTER's tap panel, the warlord pick's, REFIT's one-card pick and APPLY give the day's amounts, whole, on the phone and the desk", () => {
  setTipsForTests("done");

  it("the ENCHANTER's offer (growing, rising): on every day the rows are wordFace(id, day)'s (labels and amounts), the panel's kept text is whole and every line shows, on both views", () => {
    on(() => {
      for (const day of DAYS) {
        for (const [view, f, touch] of VIEWS) {
          for (const i of [0, 1]) {
            const run = dayRun(day), id = run.shop.enchanter!.offers[i].ench as EnchantId;
            const sel: Sel = { kind: "word", pick: false, i };
            const dd = panelCtx(run, sel, f, touch).d();
            const tag = `${view} day ${day} ${id}`;
            const rows = dd.t.body.map((b) => b.text);
            for (const l of wordFace(id, day).lines) expect(rows, `${tag}: ${l.label}`).toContain(`${l.label}: ${icons(l.text)}`);
            expect(keptWhole(dd.plan), `${tag}: kept text whole`).toBe(true);
            expect(fullText(dd.plan), `${tag}: full text`).toBe(true);
          }
        }
      }
    });
  });

  it("the warlord pick's two words and the shrine's one word (REFIT's pick strip): the same rows on the run's day", () => {
    on(() => {
      for (const day of [6, 8, 16, 24]) {
        const run = dayRun(day);
        run.shop = { wagons: [], rerolls: 0, discount: 0, free: 0 };
        run.enchPick = { day, no: 1, words: ["growing", "rising"] };
        for (const i of [0, 1]) {
          const id = run.enchPick.words[i] as EnchantId;
          const spec = wordSpec({ run } as unknown as Ctx, { kind: "word", pick: true, i })!;
          for (const l of wordFace(id, day).lines) expect(spec.text.body.map((b) => b.text), `warlord pick ${id} day ${day}`).toContain(`${l.label}: ${icons(l.text)}`);
        }
        delete run.enchPick;
        run.enchShrine = { day, word: "growing" }; // the shrine's own word: a pick of 1
        const spec = wordSpec({ run } as unknown as Ctx, { kind: "word", pick: true, i: 0 })!;
        expect(spec.text.body.map((b) => b.text).join(" | "), `shrine pick day ${day}`).toContain(`+${onDay(ENCHANT_NUM.growingStep, day)} ${icons("{DMG}")}`);
      }
    });
  });

  it("the card's amounts by day, spelled out: day 1 +5 and +1; day 6 +10 and +2 (D 2.0); day 8 +11 and +2 (D 2.3); day 24 the table's last", () => {
    on(() => {
      const seen: string[] = [];
      for (const day of [1, 6, 8, 12, 16, 24]) {
        const g = /\+(\d+) /.exec(wordFace("growing", day).lines[0].text)![1], r = /\+(\d+) /.exec(wordFace("rising", day).lines[0].text)![1];
        seen.push(`day ${day}: GROWING +${g}, RISING +${r}`);
        expect(Number(g)).toBe(onDay(5, day));
        expect(Number(r)).toBe(onDay(1, day));
      }
      expect(seen[0]).toBe("day 1: GROWING +5, RISING +1");
      expect(seen[1]).toBe("day 6: GROWING +10, RISING +2");
      console.log(`ENCHANT-2W W3 amounts on a word's card: ${seen.join("; ")}`);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------ the shrine's `?` card (the event screen)

class MapStore { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }

function shrineGame(run: Run, W: number, H: number, portrait: boolean): Game {
  const audio = new Proxy({}, { get: () => () => undefined });
  return { run, audio, W, H, portrait, ui: new UI(), view: { scale: 2, dpr: 3, W, H, portrait }, transitioning: false, go() {}, toast() {}, error() {}, resize() {}, soundButton() {} } as unknown as Game;
}

describe("W3: the shrine's `?` card, drawn by the event screen during a run, gives the run's day", () => {
  it("on day 6 the card behind card 1's `?` (word A) says GROWING +10 when word A is GROWING, and day 1's +5 on day 1", () => {
    vi.stubGlobal("localStorage", new MapStore());
    try {
      on(() => {
        // a seed whose shrine offers GROWING as word A on day 6 and on day 1 (found, never pinned)
        let seed = 1;
        while (shrineOffer(seed, 6)[0] !== "growing" || shrineOffer(seed, 1)[0] !== "growing") seed++;
        for (const [W, H, portrait] of [[201, 345, true], [640, 400, false], [190, 330, true], [440, 250, false]] as [number, number, boolean][]) {
          for (const day of [1, 6]) {
            const run = newRun("furnace", seed);
            run.day = day;
            run.event = makeEvent(seed, day, "shrine");
            const [a] = shrineOffer(seed, day);
            if (a !== "growing") continue;
            const s = new EventScreen(shrineGame(run, W, H, portrait));
            s.info = 0;
            rec.text.length = 0;
            const c = fresh(W, H);
            s.game.ui.begin();
            s.draw(G(c));
            const rows = rec.text.filter((t) => t.font === "3").map((t) => t.s).join(" ");
            const want = onDay(ENCHANT_NUM.growingStep, day);
            expect(rows, `${W}x${H} day ${day}`).toContain(`+${want} ${icons("{DMG}")}`);
            expect(rows, `${W}x${H} day ${day}: not the other day's amount`).not.toContain(`+${day === 6 ? 5 : 10} ${icons("{DMG}")}`);
            expect(c.oob).toBe(0);
          }
        }
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("wordInfoRows / drawWordInfo with a day: every word, every day 1-24, the narrowest and the real event panels: the rows fit above the closing line and nothing is painted outside", () => {
    const panels = [eventLayout(190, 330, true, 3).panel, eventLayout(440, 250, false, 3).panel, eventLayout(201, 345, true, 3).panel, eventLayout(640, 400, false, 3).panel];
    let drawn = 0;
    on(() => {
      for (const p of panels) {
        const r = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 };
        for (const id of ENCHANT_IDS) for (let day = 1; day <= 24; day++) {
          const base = wordInfoRows(id, r.w - 12)!, dayRows = wordInfoRows(id, r.w - 12, day)!;
          expect(dayRows.rows.length, `${id} day ${day}: one row a kind`).toBe(base.rows.length);
          // an amount one digit wider can wrap one more line: never past the room the panel has (rows end above TAP TO CLOSE)
          const lines = dayRows.rows.reduce((n, q) => n + q.length, 0), most = Math.floor((r.h - 24) / 8);
          expect(lines, `${id} day ${day} in ${r.w}x${r.h}: rows of room ${most}`).toBeLessThanOrEqual(most);
          if (day === 1 || day === 6 || day === 24) {
            rec.text.length = 0;
            const c = fresh(r.x + r.w + 4, r.y + r.h + 4);
            drawWordInfo(G(c), r, id, day);
            expect(c.oob, `${id} day ${day} ${r.w}x${r.h}`).toBe(0);
            const tip = rec.text.find((t) => t.s === "TAP TO CLOSE")!;
            for (const t of rec.text.filter((q) => q.font === "3" && q.s !== "TAP TO CLOSE")) {
              expect(t.y + 5, `${id} day ${day}: a row ends above the closing line`).toBeLessThanOrEqual(tip.y);
              expect(t.x + textWidth(t.s, "3"), `${id} day ${day}: a row ends inside the panel`).toBeLessThanOrEqual(r.x + r.w - 6 + 1);
            }
            drawn++;
          }
        }
      }
    });
    expect(drawn).toBeGreaterThan(80);
  });
});

// ------------------------------------------------------------------------------------------------------------ LAST CHANCE's detail

describe("W3: LAST CHANCE's detail (a part that arrives enchanted) says the run's day's amounts; with no day, day 1's", () => {
  const run = (day?: number): Pick<Run, "hero" | "build"> => ({ hero: "furnace", build: { hero: "furnace", items: [], routes: [], mods: [], beltCap: 40, hullBonus: 0 }, ...(day === undefined ? {} : { day }) } as never);

  it("partInfo on a run's day passes it to the word's line: GROWING +10 on day 6, RISING +2 on day 8; no day: +5 and +1", () => {
    on(() => {
      const joined = (items: ReturnType<typeof partInfo>): string => items.map((it) => (Array.isArray(it) ? (it as unknown[]).map((l) => lineText(l as never)).join(" ") : "")).join(" | ");
      expect(joined(partInfo("whetstone", 400, run(6), 1, { ench: "growing" }))).toContain("+10 ");
      expect(joined(partInfo("scrapcannon", 400, run(8), 1, { ench: "rising" }))).toContain("+2 ");
      expect(joined(partInfo("whetstone", 400, run(), 1, { ench: "growing" }))).toContain("+5 ");
      expect(joined(partInfo("scrapcannon", 400, run(), 1, { ench: "rising" }))).toContain("+1 ");
      expect(joined(partInfo("whetstone", 400, run(1), 1, { ench: "growing" }))).toContain("+5 ");
    });
  });

  it("lcWordItem(def, id, tw, stars, day): GROWING and RISING at one to three stars on every day are step x stars x D(day), whole on the card's width (wrapped, never cut)", () => {
    on(() => {
      const pieces: [string, "growing" | "rising"][] = [["whetstone", "growing"], ["scrapcannon", "rising"], ["press", "growing"], ["kiln", "rising"]];
      for (let day = 1; day <= 24; day++) for (const [def, id] of pieces) for (const stars of [1, 2, 3]) {
        const step = id === "growing" ? ENCHANT_NUM.growingStep : ENCHANT_NUM.risingStep;
        for (const tw of [118, 182, 290]) {
          const item = lcWordItem(def, id, tw, stars, day);
          if (!item) continue; // a kind the word does not go on
          const joined = item.map(lineText).join(" ");
          expect(joined, `${id}/${def} ★${stars} day ${day} @${tw}`).toContain(`+${onDay(step * stars, day)} `);
          for (const l of item) expect(textWidth(lineText(l), "3"), `${id}/${def} ★${stars} day ${day} @${tw}: a line is within the card`).toBeLessThanOrEqual(tw);
        }
      }
    });
  });

  it("every part that has an ITEMS entry and takes the word gives a line; the card never prints an amount under day 1's", () => {
    on(() => {
      let n = 0;
      for (const d of Object.values(ITEMS)) {
        for (const day of [1, 6, 24]) {
          const item = lcWordItem(d.id, "growing", 290, 1, day);
          if (!item) continue;
          expect(Number(/\+(\d+) /.exec(item.map(lineText).join(" "))![1]), `${d.id} day ${day}`).toBeGreaterThanOrEqual(ENCHANT_NUM.growingStep);
          n++;
        }
      }
      expect(n).toBeGreaterThan(30);
    });
  });
});
