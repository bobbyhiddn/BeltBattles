// CARD-2 (REQ-BFG-081, REQ-BFG-004, REQ-BFG-089; K6 REQ-BFG-084): teach each keyword once, and fix what READ-3's readers
// missed. Presentation only.
//   (k1) first sight: a keyword's definition opens once by itself the first time a face shows it (rune cards and the build
//        screen's panels), the rig sentence on the first rig; one box per open; none with a how-to tip; kept after a
//        reload; once a session with no storage; never in a fight or off the build screen; no press changes the run;
//   (k2) every keyword on a rune card is a word target: its definition shows in the card's note room; on the picker a word
//        tap never takes the rune; the targets never overlap each other or the chip's;
//   (k3) .. (k6): the words, the turret row's labels, NOTES in 3x5, the plain rigs on LAST CHANCE and the desk hover.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { RUNES } from "../src/sim/runes";
import { UI, inside, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen } from "../src/screens/build/layout";
import {
  readoutW, runeCardH, runeChipTarget, runeRowFits, runeRowH, runeSightWord, runeWordBoxOn, runeWordOrder, runeWordTargets, runeWordText,
  runeKeywordOf, shiftLayout,
} from "../src/ui/runeBar";
import { KEYWORD_WORD, runeKeywords as runeKeywordsOf, runeReminder as runeReminderOf } from "../src/ui/runeText";
import { runeTextLines, runeCardTextW } from "../src/ui/runeBar";
import { textWidth } from "../src/render/font";
import { lineText } from "../src/ui/richText";
import type { RuneDef } from "../src/sim/runes";

const runeTextLinesOf = (def: RuneDef, cw: number): string[] => runeTextLines(def, runeCardTextW(cw)).map(lineText);
import { RunePicker, PICK_DEF } from "../src/screens/runePicker";
import { LastChancePicker } from "../src/screens/lastChancePicker";
import { FIRST_SIGHT_IDS, FIRST_SIGHT_WORDS, TIPS_KEY, setTipsForTests, sightDone, sightsDone, tipsDone } from "../src/ui/tips";
import { sawWord, sightWord } from "../src/ui/firstSight";

installRaster();

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/explain1.test.ts's framed). */
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
const PHONES: [string, number, number, number][] = [
  ["op-402x690", 402, 690, 3], ["phone-390x844", 390, 844, 3], ["phone-390x660", 390, 660, 3], ["iphone15pm-430x739", 430, 739, 3], ["land-844x390", 844, 390, 3],
];
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A build screen enough for the pickers (explain1.test.ts's screenOf). */
function screenOf(run: Run, w: number, h: number, dpr: number, touch: boolean) {
  const f = framed(w, h, dpr, 0);
  const ui = new UI();
  ui.pointer.kind = touch ? "touch" : "mouse";
  const s = {
    run, refit: false, touch, L: f.L,
    game: { W: f.W, H: f.H, ui, view: f.view, canvas: null, error: () => {}, resize: () => {}, toast: () => {} },
    touched: () => {},
  };
  const frame = (p: { draw: (g: ReturnType<typeof gOf>, s: never) => void }, pointer?: { x: number; y: number }) => {
    if (pointer) Object.assign(ui.pointer, { ...pointer, down: false, kind: "mouse" });
    ui.begin();
    p.draw(gOf(fresh(f.W, f.H)), s as never);
    ui.end();
    return ui;
  };
  return { s, f, ui, frame };
}
/** What a press must never change: gold, the shop, cargo, the build and the runes held. */
const state = (run: Run): string => JSON.stringify([run.gold, run.shop, run.inventory, run.build]);

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as { localStorage?: unknown };

const CASES = ["seam_rivets", "twin_salve", "hot_seam", "iron_temper"] as const;

describe("CARD-2 (k2): every keyword on a rune card can be reached", () => {
  afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });

  it("SEAM RIVETS, TWIN SALVE, HOT SEAM, IRON TEMPER: every keyword a target, its definition in the room, no overlap; sizes on every pinned phone", () => {
    expect(CASES.map((id) => runeWordOrder(RUNES[id]))).toEqual([["PAIR", "PLATE"], ["PAIR", "HEAL"], ["PAIR", "BURN"], ["PLATE", "DMG"]]);
    const rows: string[] = [];
    for (const [name, w, h, dpr] of PHONES) {
      const f = framed(w, h, dpr, 1);
      const cw = Math.min(f.W - 8, 300), css = f.S / dpr;
      let minW = Infinity, minH = Infinity;
      for (const id of CASES) {
        const def = RUNES[id];
        for (const reminder of [true]) {
          const r = { x: 4, y: 40, w: cw, h: runeCardH(def, cw, { reminder, hint: "TAP AGAIN TO TAKE IT" }) };
          const chip = runeChipTarget(r, def, f.tap);
          const ts = runeWordTargets(r, def, [chip]);
          // every keyword token has a target, in reading order
          expect(ts.map((t) => t.word), `${name} ${id}`).toEqual(runeWordOrder(def));
          for (const t of ts) {
            expect(overlaps(t.r, chip), `${name} ${id} ${t.word}: clear of the chip's target`).toBe(false);
            expect(inside(t.r, Math.floor(t.glyph.x + t.glyph.w / 2), Math.floor(t.glyph.y + 3)), `${name} ${id} ${t.word}: its middle`).toBe(true);
            for (const u of ts) if (u !== t) expect(overlaps(t.r, u.r), `${name} ${id} ${t.word}/${u.word}`).toBe(false);
            // its definition: the rune's own keyword reminder, the word first; the room shows it whole, inside the card
            expect(t.text.startsWith(`${t.word}: `), `${id} ${t.word}`).toBe(true);
            const box = runeWordBoxOn(r, def, t.word)!;
            expect(box.y >= r.y + 31 && box.y + box.h <= r.y + r.h, `${name} ${id} ${t.word}: the box in the card`).toBe(true);
            minW = Math.min(minW, t.r.w * css);
            minH = Math.min(minH, t.r.h * css);
          }
        }
      }
      rows.push(`${name} (S ${f.S}, card ${cw} art px): least word target ${minW.toFixed(1)} x ${minH.toFixed(1)} CSS px`);
    }
    console.log(`CARD-2 (k2) rune word targets:\n${rows.join("\n")}`);
    expect(runeWordText(RUNES.seam_rivets, runeKeywordOf(RUNES.seam_rivets, "PLATE")!)).toMatch(/^PLATE: /);
    expect(runeWordText(RUNES.twin_salve, runeKeywordOf(RUNES.twin_salve, "HEAL")!)).toMatch(/^HEAL: /);
    // SHATTER SHOT's SHIELD shows its own note (its hits break a SHIELD), not SHIELD's reminder
    expect(runeWordText(RUNES.shatter_shot, runeKeywordOf(RUNES.shatter_shot, "SHIELD")!)).toBe("SHIELD: IT BREAKS; THE HIT STILL LANDS.");
  });

  it("the dawn picker: a word tap shows its definition in the room and never takes the rune; the take tap still works off the words", () => {
    setTipsForTests("done");
    const run = newRun("foundry", 5, "card2-pick");
    const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
    picker.offer = () => ({ day: 1, tier: "common", ids: ["seam_rivets", "twin_salve", "hot_seam"] }) as never;
    let ui = sc.frame(picker as never);
    ui.regions.find((r) => r.id === "runepick-0")!.onTap!(); // open SEAM RIVETS
    ui = sc.frame(picker as never);
    const before = state(run);
    const words = ui.regions.filter((r) => r.id.startsWith("runepick-w"));
    expect(words.map((r) => r.id.split(":")[1])).toEqual(["PAIR", "PLATE"]);
    for (const wr of words) {
      expect(ui.hit(wr.r.x + 1, wr.r.y + 1)?.id, wr.id).toBe(wr.id); // over the card's region
      picker.pressed(wr.id);
      wr.onTap!();
      const w = wr.id.split(":")[1];
      expect([picker.open, picker.word, picker.note], wr.id).toEqual([0, w, false]);
      ui = sc.frame(picker as never);
      const def = ui.regions.find((r) => r.id === PICK_DEF);
      expect(def, `${wr.id}: the room shows it`).toBeDefined();
      expect(def!.r).toEqual(runeWordBoxOn(sc.f.L.info.x !== undefined ? ui.regions.find((r) => r.id === "runepick-0")!.r : def!.r, RUNES.seam_rivets, w));
      // a tap on the box is its own (never the card's take)
      expect(ui.hit(def!.r.x + 2, def!.r.y + 2)?.id).toBe(PICK_DEF);
      // again closes it
      picker.pressed(wr.id);
      ui.regions.find((r) => r.id === wr.id)!.onTap!();
      expect(picker.word).toBeNull();
      expect(state(run), `${wr.id}: the run unchanged`).toBe(before);
    }
    // a press anywhere else closes it
    words[1].onTap!();
    picker.pressed("runepick");
    expect(picker.word).toBeNull();
    expect(state(run)).toBe(before);
    // the take tap, on the card off its words, still takes it (the real offer)
    const real = new RunePicker();
    let u2 = sc.frame(real as never);
    const id0 = real.info(sc.s as never)!.ids[0];
    u2.regions.find((r) => r.id === "runepick-0")!.onTap!();
    u2 = sc.frame(real as never);
    const card = u2.regions.find((r) => r.id === "runepick-0")!;
    expect(u2.hit(card.r.x + card.r.w - 3, card.r.y + card.r.h - 3)?.id).toBe("runepick-0");
    card.onTap!();
    expect((run.build.runes ?? []).map((q) => q.id)).toContain(id0);
  });

  it("LAST CHANCE's RUNE card and the rune bar's read-out: word targets on the open card, the definition shown, nothing picked", () => {
    setTipsForTests("done");
    const run = newRun("furnace", 5, "explain1-lc");
    (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
    const sc = screenOf(run, 402, 690, 3, true), lc = new LastChancePicker();
    let ui = sc.frame(lc as never);
    const card = ui.regions.find((r) => r.id === "lcpick-rune");
    if (!card) return; // an offer with no rune: nothing to check
    expect(ui.regions.some((r) => r.id.startsWith("lcrune-w")), "a closed card has no word targets").toBe(false);
    const before = state(run);
    card.onTap!(); // open it
    ui = sc.frame(lc as never);
    const words = ui.regions.filter((r) => r.id.startsWith("lcrune-w"));
    expect(words.length).toBeGreaterThan(0);
    words[0].onTap!();
    const w = words[0].id.split(":")[1];
    expect(lc.word).toBe(w);
    ui = sc.frame(lc as never);
    const box = ui.regions.find((r) => r.id === "lcrune-def")!;
    expect(box).toBeDefined();
    const h0 = ui.regions.find((r) => r.id === "lcpick-rune")!.r.h;
    expect(lc.layout(sc.s as never, lc.offer(sc.s as never)!).cards[0].h, "the card keeps its size").toBe(h0);
    box.onTap!();
    expect(lc.word).toBeNull();
    expect([lc.open, state(run)]).toEqual([0, before]);
  });
});

describe("CARD-2 (k3): the words READ-3's readers missed, rune lines (a)-(f): new words, one line on the op card and the desk", () => {
  it("FIGHT START on every START: rune; SHIELD's reminder; SNARE KNOT's 15; MERGED; TOLL ROAD's load; TWIN SALVE's EACH PAIR", () => {
    const want: Record<string, string[]> = {
      rivet_hoard: ["FIGHT START: +60 PLATE."], grave_plates: ["FIGHT START: +240 PLATE."], loose_thread: ["FIGHT START: THE FOE HAS 2 FRAY."],
      tangle_wire: ["FIGHT START: THE FOE HAS 5 FRAY."], ash_kindle: ["FIGHT START: THE FOE HAS 4 BURN."], ward_stone: ["FIGHT START: +3 SHIELD."],
      bulwark_ward: ["FIGHT START: +2 SHIELD."], searing: ["FIGHT START: THE FOE HAS 5 BURN.", "FOE WITH YOUR BURN: NO HEAL."],
      snare_knot: ["AT 15 FRAY (FULL): YOUR HITS +20 DMG."], scrap_halo: ["+60 HULL PER MERGED (★2/★3) PIECE IN USE."],
      scrap_saint: ["+11% DMG PER MERGED (★2/★3) PIECE IN USE."], toll_road: ["EACH LOAD: +4% DMG PER RIG IT PASSED."], twin_salve: ["EACH PAIR: HEAL 20."],
    };
    const rows: string[] = [];
    for (const [id, lines] of Object.entries(want)) {
      const def = RUNES[id];
      for (const cw of [233, 300]) {
        // the op card (402x690: 233 wide, 223 of text) and the desk's (300): each sentence one line, the card's lines as wanted
        const got = runeTextLinesOf(def, cw);
        expect(got, `${id} at ${cw}`).toEqual(lines);
      }
      rows.push(`${id}: ${lines.map((l) => `"${l}" ${textWidth(l, "5")} px`).join(" / ")}`);
      // the tokens and the amount are RuneDef's: no keyword, number or rule moved
      expect(runeKeywordsOf(def).sort(), id).toEqual([...new Set([...def.text.matchAll(/\{\*?([A-Z]+)\}/g)].map((m) => m[1]).filter((k) => k !== "N"))].sort());
    }
    console.log(`CARD-2 (k3) rune lines (5x7 px; the op card's text is 223 px, the 390-wide phones' 216):\n${rows.join("\n")}`);
    expect(runeReminderOf(RUNES.ward_stone)).toBe("SHIELD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS.");
    expect(textWidth(runeReminderOf(RUNES.ward_stone), "3")).toBeLessThanOrEqual(223);
    expect(runeWordText(RUNES.ward_stone, "SHIELD")).toBe("SHIELD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS.");
  });
});

describe("CARD-2 (k1): the first-sight notes on rune cards (the store: src/ui/tips.ts)", () => {
  beforeEach(() => { g.localStorage = new Mem(); setTipsForTests("reload"); });
  afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });

  it("a new store: PAIR's definition opens by itself on the first card that shows it, and on no later one; one box per open; kept after a reload", () => {
    setTipsForTests("new");
    expect(sightsDone()).toEqual([]);
    const run = newRun("foundry", 5, "card2-k1");
    const sc = screenOf(run, 402, 690, 3, true), picker = new RunePicker();
    picker.offer = () => ({ day: 1, tier: "common", ids: ["seam_rivets", "twin_salve", "hot_seam"] }) as never;
    const before = state(run);
    let ui = sc.frame(picker as never);
    expect(picker.word, "a closed card shows none").toBeNull();
    ui.regions.find((r) => r.id === "runepick-0")!.onTap!(); // open SEAM RIVETS: EACH PAIR: +10 PLATE.
    expect(picker.word).toBe("PAIR");
    ui = sc.frame(picker as never);
    expect(ui.regions.some((r) => r.id === PICK_DEF)).toBe(true);
    expect(sightDone("kw:PAIR"), "done once its box was on screen").toBe(true);
    expect(sightDone("kw:PLATE"), "the next one waits for the next open").toBe(false);
    // the next open: TWIN SALVE (PAIR: HEAL 20.): PAIR is done, so HEAL
    picker.pressed("runepick-1");
    ui.regions.find((r) => r.id === "runepick-1")!.onTap!();
    expect(picker.word).toBe("HEAL");
    sc.frame(picker as never);
    // SEAM RIVETS again: PLATE now; HOT SEAM after: BURN (PAIR done)
    picker.pressed("runepick-0");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-0")!.onTap!();
    expect(picker.word).toBe("PLATE");
    sc.frame(picker as never);
    picker.pressed("runepick-2");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-2")!.onTap!();
    expect(picker.word).toBe("BURN");
    sc.frame(picker as never);
    // every keyword seen: an open shows none, never on every open
    picker.pressed("runepick-0");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-0")!.onTap!();
    expect(picker.word).toBeNull();
    expect(state(run), "no rune taken, nothing bought").toBe(before);
    // the store holds the notes with the tips' ids; a reload keeps them
    const stored = JSON.parse((g.localStorage as Mem).getItem(TIPS_KEY)!);
    expect(stored).toEqual(expect.arrayContaining(["kw:PAIR", "kw:HEAL", "kw:PLATE", "kw:BURN"]));
    setTipsForTests("reload");
    expect(["kw:PAIR", "kw:HEAL", "kw:PLATE", "kw:BURN"].every((id) => sightDone(id))).toBe(true);
    expect(runeSightWord(RUNES.seam_rivets)).toBeNull();
  });

  it("a word the player taps or the chip's own line counts as seen; bb.tips new and done cover the notes; with no storage each note shows once a session", () => {
    setTipsForTests("new");
    sawWord("STUNS"); // an alias reads as its row
    expect(sightDone("kw:STUN")).toBe(true);
    sawWord("RATE"); // a basic stat has no note
    expect(sightsDone()).toEqual(["kw:STUN"]);
    setTipsForTests("done");
    expect(sightsDone()).toEqual([...FIRST_SIGHT_IDS]);
    expect(sightWord(["PAIR", "FRAY"])).toBeNull();
    setTipsForTests("sight");
    expect([tipsDone().length > 0, sightsDone()]).toEqual([true, []]);
    // no storage at all: the notes live in memory, once a session
    delete g.localStorage;
    setTipsForTests("reload");
    expect(sightWord(["PAIR", "FRAY"])).toBe("PAIR");
    sawWord("PAIR");
    expect(sightWord(["PAIR", "FRAY"])).toBe("FRAY");
    sawWord("FRAY");
    expect(sightWord(["PAIR", "FRAY"])).toBeNull();
    // a throwing store too
    g.localStorage = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => {} };
    setTipsForTests("reload");
    expect(sightWord(["PAIR"])).toBe("PAIR");
    sawWord("PAIR");
    expect(sightWord(["PAIR"])).toBeNull();
    expect(FIRST_SIGHT_WORDS.every((w) => !["RATE", "DMG", "SLUG", "GEAR", "BELT", "HULL", "GOLD"].includes(w))).toBe(true);
    expect(Object.values(KEYWORD_WORD).filter((w) => FIRST_SIGHT_WORDS.includes(w)).sort()).toEqual(["BURN", "FRAY", "HEAL", "HEAT", "PAIR", "PLATE", "REGEN", "RIDE", "SHIELD", "STUN"]);
  });
});
