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
import { panelArea, type Sel } from "../src/screens/build/layout";
import { detailsPlan, drawDetails, panelFit } from "../src/screens/build/inspector";
import { SIGHT_REGION, rigTipRect, keywordState, keywordsIdle, keywordsPressed } from "../src/screens/build/keywords";
import { RIG_SENTENCE } from "../src/ui/faces";
import { plainRigStats } from "../src/ui/faces"; // MERGE-099D (BRIEF-MERGE-099D 1f): (k6) at the LAST CHANCE offer's star
import { BALLAST_LINE, CARRY_LINE, faceAt, plainNotes } from "../src/ui/faces"; // PLAIN-1F (M3): (k6) for the six
import { PLAIN_RIG_IDS, withPlainRigs } from "../src/sim/plainRigs"; // PLAIN-1F (M3)
import { partInfo, partLines } from "../src/screens/lastChancePicker"; // PLAIN-1F (M3): the PART card at each star
import { statRow } from "../src/ui/icons"; // MERGE-099D (1f)
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";

/** A build screen's panel context (explain1.test.ts's ctxOf and placed): the run, the framed layout, a finger or a mouse. */
function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const draw = (pointer?: { x: number; y: number }) => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    if (pointer) Object.assign(ui.pointer, { ...pointer, down: false, kind: "mouse" });
    else Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    ui.begin();
    drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return ui;
  };
  return { ctx, area, draw, d: () => detailsPlan(ctx, sel, null, area)! };
}
function cargoRun(hero: "foundry" | "furnace", def: string): Run {
  const run = newRun(hero, 5, `card2-${def}`);
  run.inventory = [{ uid: 900, def }];
  return run;
}
const CARGO: Sel = { kind: "cargo", uid: 900 };
import { buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { setTurretList } from "../src/sim/deck";
import { lineWidth } from "../src/ui/richText";
import { ICON, ICON_COLOUR, icons } from "../src/render/font";
import { shopChip } from "../src/ui/chips";
import { panelWords } from "../src/screens/build/keywords";
import { statIconNote, glossaryText } from "../src/ui/glossary";
import { faceLines } from "../src/ui/faces";
import { cardText as cardTextOf } from "../src/ui/abilityText";
import { withGuard } from "../src/sim/guard"; // MERGE-099F (REQ-BFG-097): RIVET HOARD's base line with GUARD off
import { colourize, wrapRich } from "../src/ui/richText";
import { C } from "../src/render/palette";
import { stripIcons as stripIconsOf } from "../src/render/font";
const wrapRichOf = (t: string, w: number) => wrapRich(colourize(icons(t), C.bone), w, "5");
import { offerTooltip } from "../src/screens/build/shop";
/** A turret in cargo's panel plan on a framed view (a finger's). */
function detailsPlanOf(f: ReturnType<typeof framed>, def: string) {
  const run = newRun("furnace", 5, "card2-plan");
  run.inventory = [{ uid: 900, def }];
  return panelCtx(run, CARGO, f, true).d();
}
import { RunePicker, PICK_DEF } from "../src/screens/runePicker";
import { PICK_BAR } from "../src/screens/runePicker"; // CARD-4 (REQ-BFG-081, P1)
import { WORD_ONLY } from "../src/ui/runeText"; // CARD-4 (REQ-BFG-081, T)
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
    expect(CASES.map((id) => runeWordOrder(RUNES[id]))).toEqual([["PAIR", "SHIELD"], ["PAIR", "HEAL"], ["PAIR", "BURN"], ["SHIELD", "DMG"]]); // CARD-3 (REQ-BFG-107): SHIELD
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
    expect(runeWordText(RUNES.seam_rivets, runeKeywordOf(RUNES.seam_rivets, "SHIELD")!)).toMatch(/^SHIELD: /); // CARD-3
    expect(runeWordText(RUNES.twin_salve, runeKeywordOf(RUNES.twin_salve, "HEAL")!)).toMatch(/^HEAL: /);
    // SHATTER SHOT's SHIELD shows its own note (its hits break a SHIELD), not SHIELD's reminder
    expect(runeWordText(RUNES.shatter_shot, runeKeywordOf(RUNES.shatter_shot, "WARD")!)).toBe("WARD: IT BREAKS; THE HIT STILL LANDS."); // CARD-3
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
    expect(words.map((r) => r.id.split(":")[1])).toEqual(["PAIR", "SHIELD"]); // CARD-3 (REQ-BFG-107)
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
    // the take tap, off the words, still takes it (the real offer). CARD-4 (REQ-BFG-081, P1, P2) changed what this checks:
    // the open card's body takes nothing; its TAP AGAIN bar's target does, once the guard after the open has passed
    // (tests/card4.test.ts (p) checks the rule itself)
    const real = new RunePicker(), clock = sc.s as unknown as { t: number };
    clock.t = 0;
    let u2 = sc.frame(real as never);
    const id0 = real.info(sc.s as never)!.ids[0];
    u2.regions.find((r) => r.id === "runepick-0")!.onTap!();
    u2 = sc.frame(real as never);
    const card = u2.regions.find((r) => r.id === "runepick-0")!;
    expect(u2.hit(card.r.x + card.r.w - 3, card.r.y + card.r.h - 3)?.id).toBe("runepick-0");
    expect(card.onTap, "CARD-4: the open card's body takes nothing").toBeUndefined();
    const bar = u2.regions.find((r) => r.id === PICK_BAR)!;
    expect(u2.hit(bar.r.x + bar.r.w / 2, bar.r.y + bar.r.h / 2)?.id).toBe(PICK_BAR);
    clock.t = 1;
    bar.onTap!();
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
    // MERGE-099F (REQ-BFG-097, -081): HULL-ON's GUARD on in c099's CARD-2 lines: RIVET HOARD's FIGHT START is GUARD's 180
    // (src/sim/guard.ts GUARD_RUNES); was +60 (c099's world, no GUARD), read below with GUARD off, as HULL-ON's flip
    // re-pinned its own GUARD text (cap's ruling 6f4568477e66a600)
    const want: Record<string, string[]> = {
      rivet_hoard: ["FIGHT START: +180 SHIELD."], grave_plates: ["FIGHT START: +240 SHIELD."], loose_thread: ["FIGHT START: THE FOE HAS 2 FRAY."],
      tangle_wire: ["FIGHT START: THE FOE HAS 5 FRAY."], ash_kindle: ["FIGHT START: THE FOE HAS 4 BURN."], ward_stone: ["FIGHT START: +3 WARD."],
      bulwark_ward: ["FIGHT START: +2 WARD."], searing: ["FIGHT START: THE FOE HAS 5 BURN.", "FOE WITH YOUR BURN: NO HEAL."],
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
      // the tokens and the amount are RuneDef's: no keyword, number or rule moved (CARD-4, T: the word-only keywords aside,
      // MERGED, LOAD and RIG, words with a note: runeText.ts WORD_ONLY)
      expect(runeKeywordsOf(def).filter((k) => !WORD_ONLY.has(k)).sort(), id).toEqual([...new Set([...def.text.matchAll(/\{\*?([A-Z]+)\}/g)].map((m) => m[1]).filter((k) => k !== "N"))].sort());
    }
    // MERGE-099F: RIVET HOARD's base line with GUARD off, on both cards (the c099 pin)
    expect(withGuard(() => [233, 300].map((cw) => runeTextLinesOf(RUNES.rivet_hoard, cw)), false)).toEqual([["FIGHT START: +60 SHIELD."], ["FIGHT START: +60 SHIELD."]]);
    console.log(`CARD-2 (k3) rune lines (5x7 px; the op card's text is 223 px, the 390-wide phones' 216):\n${rows.join("\n")}`);
    expect(runeReminderOf(RUNES.ward_stone)).toBe("WARD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS."); // CARD-3
    expect(textWidth(runeReminderOf(RUNES.ward_stone), "3")).toBeLessThanOrEqual(223);
    expect(runeWordText(RUNES.ward_stone, "SHIELD")).toBe("WARD: BLOCKS ALL OF ONE HIT'S DAMAGE, THEN BREAKS."); // CARD-3: the token SHIELD reads WARD
  });
});

describe("CARD-2 (k4): the turret row in words: RATE n  HOLDS n  GEAR SLOTS n", () => {
  it("every turret, every star, offer, cargo and installed: one line on the 402x690 @3 tap panel (a rune held), one label a line in the desk column; each label its note; the phone chip unchanged", () => {
    setTipsForTests("done");
    const turrets = buyableModules().filter((d) => d.kind === "turret").map((d) => d.id);
    expect(turrets.length).toBe(13);
    const phone = framed(402, 690, 3, 1), desk = framed(1920, 1080, 1, 1);
    const rows: string[] = [];
    let n = 0, widest = 0, widestId = "";
    for (const id of turrets) for (const s of fusible(id) ? [1, 2, 3] : [1]) {
      const cases: [string, Run, Sel][] = [];
      const c = newRun("furnace", 5, "card2-k4");
      c.inventory = [{ uid: 900, def: id, ...(s > 1 ? { stars: s } : {}) }];
      cases.push([`cargo ★${s}`, c, CARGO]);
      const t = newRun("furnace", 5, "card2-k4t");
      setTurretList(t.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
      cases.push([`installed ★${s}`, t, { kind: "turret", index: 1 }]);
      if (s === 1) {
        const o = newRun("furnace", 5, "card2-k4o");
        o.shop.wagons = [{ merchant: "ironmonger", offers: [{ def: id, price: 6, sold: false }] }] as Run["shop"]["wagons"];
        cases.push(["offer", o, { kind: "offer", wagon: 0, slot: 0 }]);
      }
      for (const [tag, run, sel] of cases) {
        for (const [view, f, touch] of [["phone", phone, true], ["desk", desk, false]] as const) {
          const p = panelCtx(run, sel, f, touch), d = p.d();
          const row = d.plan.body.lines.filter((l): l is Exclude<typeof l, "rule"> => l !== "rule" && !!l.block.pairs);
          const text = row.map((l) => lineText(l.spans)).join(" / ");
          expect(text, `${id} ${tag} ${view}`).toMatch(/^.RATE \d+ {2}.HOLDS \d+ {2}.GEAR SLOTS \d+$|^.RATE \d+ \/ .HOLDS \d+ \/ .GEAR SLOTS \d+$/);
          if (view === "phone") {
            expect(row.length, `${id} ${tag}: one line on the phone`).toBe(1);
            const w = lineWidth(row[0].spans, row[0].font);
            if (w > widest) { widest = w; widestId = `${id} ${tag}`; }
            expect(w).toBeLessThanOrEqual(d.plan.r.w - 10);
            // each label keeps its note: the icon and its word are one target (HOLDS shows {SLUG}'s turret note)
            const ui = p.draw();
            const tg = ui.regions.filter((r) => /^kw:\d+:(RATE|SLUG|GEAR)$/.test(r.id)).map((r) => r.id.split(":")[2]);
            expect(tg, `${id} ${tag}`).toEqual(expect.arrayContaining(["RATE", "SLUG", "GEAR"]));
          } else {
            expect(row.length, `${id} ${tag}: the desk column, one label a line`).toBe(d.plan.column ? 3 : 1);
          }
          n++;
        }
      }
    }
    expect(widest).toBeLessThanOrEqual(225);
    rows.push(`turret panels checked: ${n}; the widest row on the 402x690 @3 tap panel: ${widest} px of 225 (${widestId})`);
    // the phone shop card's chip keeps {RATE}n (chips.ts)
    for (const id of turrets) expect(icons(shopChip(id, {})!), id).toMatch(new RegExp(`^${ICON.RATE}\\d+$`));
    // the words a tap on each shows (glossary.ts statIconNote: RATE's row, the turret's {SLUG}, {GEAR})
    const words = Object.fromEntries(panelWords(detailsPlanOf(phone, "dartgun").t.body, null).map((w) => [w.word, w.text]));
    expect([words.RATE, words.SLUG, words.GEAR]).toEqual([statIconNote("RATE", "turret", true), statIconNote("SLUG", "turret", true), statIconNote("GEAR", "turret", true)]);
    console.log(`CARD-2 (k4):\n${rows.join("\n")}`);
  });
});

describe("CARD-2 (k1): the first-sight notes on the build screen's panels, and the rig sentence", () => {
  beforeEach(() => { g.localStorage = new Mem(); setTipsForTests("reload"); });
  afterEach(() => { delete g.localStorage; setTipsForTests("reload"); });

  it("the phone (402x690 @3, a finger): PAIR opens by itself on the first panel that shows it, as a tap opens it, and on no later one; one box per open", () => {
    setTipsForTests("sight"); // the how-to tips done (a panel that shows one shows no first-sight box), every note new
    const f = framed(402, 690, 3, 1);
    const run = cargoRun("foundry", "seamwelder"), p = panelCtx(run, CARGO, f, true);
    const before = state(run);
    let ui = p.draw();
    expect(keywordState(p.ctx)!.word, "SEAM WELDER: its first keyword, PAIR, as if tapped").toBe("PAIR");
    expect(ui.regions.some((r) => r.id === "kwdef")).toBe(true);
    expect(sightDone("kw:PAIR")).toBe(true);
    // a press anywhere closes it, as a tapped word's. CARD-5 (REQ-BFG-004, K; READ-5 11.1) changed this pin by design: the
    // panel is still open, so its next keyword not yet seen (PLATE, drawn SHIELD: CARD-3) opens its note the same way, one
    // box at a time (was: the same open shows nothing more, and SHIELD waited for the next open)
    keywordsPressed(p.ctx, null);
    ui = p.draw();
    expect([keywordState(p.ctx)!.word, ui.regions.filter((r) => r.id === "kwdef" || r.id === SIGHT_REGION).length]).toEqual(["SHIELD", 1]);
    // the next open of this panel: neither again (both done)
    keywordsPressed(p.ctx, null);
    keywordsIdle(p.ctx);
    p.draw();
    expect(["PAIR", "SHIELD"]).not.toContain(keywordState(p.ctx)!.word);
    // another panel with PAIR (TWIN TRIGGER): PAIR is done, so no PAIR box
    const run2 = cargoRun("foundry", "twintrigger"), p2 = panelCtx(run2, CARGO, f, true);
    p2.draw();
    expect(keywordState(p2.ctx)!.word, "PAIR shows once").not.toBe("PAIR");
    expect(state(run), "no press changed the run").toBe(before);
    // the store keeps them; a reload too
    setTipsForTests("reload");
    expect(sightDone("kw:PAIR") && sightDone("kw:SHIELD.107")).toBe(true); // CARD-3: the new id
  });

  it("TEMPER: the first open shows the rig sentence by the icon, the second BURN's definition; a how-to tip, a refit and the desk", () => {
    setTipsForTests("sight");
    const f = framed(402, 690, 3, 1);
    const run = cargoRun("furnace", "temper"), p = panelCtx(run, CARGO, f, true);
    const before = state(run);
    let ui = p.draw();
    const box = ui.regions.find((r) => r.id === SIGHT_REGION);
    expect([keywordState(p.ctx)!.rig, keywordState(p.ctx)!.word]).toEqual([true, null]);
    // CARD-4 run 2 (by design): on the phone, with no room beside the panel, under it (rigTipRect; iconTipRect put it above,
    // over the shop: READ-4 F step 7); no strip here (tips done)
    expect(box!.r).toEqual(rigTipRect([RIG_SENTENCE], p.d().plan.r, { W: f.W, H: f.H }, null));
    expect(box!.r.y).toBeGreaterThanOrEqual(p.d().plan.r.y + p.d().plan.r.h);
    expect(sightDone("rig")).toBe(true);
    // a press on the box is a UI region's (it closes it; nothing else)
    expect(ui.hit(box!.r.x + 2, box!.r.y + 2)?.id).toBe(SIGHT_REGION);
    keywordsPressed(p.ctx, SIGHT_REGION);
    expect(keywordState(p.ctx)!.rig).toBe(false);
    keywordsIdle(p.ctx);
    ui = p.draw();
    expect([keywordState(p.ctx)!.rig, keywordState(p.ctx)!.word]).toEqual([false, "BURN"]);
    expect(sightDone("kw:BURN")).toBe(true);
    expect(state(run)).toBe(before);
    // a panel that shows a how-to tip (the place hint, tips new). CARD-4 (REQ-BFG-004, K) changed what this checks: on the
    // phone the tip is a strip by the panel, and a strip is not a note, so the first sight opens beside it (here the rig
    // sentence by the icon; tests/card4.test.ts (k) checks the box keeps off the strip)
    setTipsForTests("new");
    const p2 = panelCtx(cargoRun("furnace", "temper"), CARGO, f, true);
    ui = p2.draw();
    expect([keywordState(p2.ctx)!.rig, keywordState(p2.ctx)!.word, ui.regions.some((r) => r.id === SIGHT_REGION)]).toEqual([true, null, true]);
    // a refit (the build screen between a fight's rounds): none
    setTipsForTests("sight");
    const r3 = cargoRun("furnace", "temper");
    (r3 as unknown as { stage: string }).stage = "refit";
    const p3 = panelCtx(r3, CARGO, f, true);
    p3.draw();
    expect([keywordState(p3.ctx)!.rig, keywordState(p3.ctx)!.word]).toEqual([false, null]);
    expect(sightDone("rig")).toBe(false);
    // the desk (a mouse): the rig sentence by the icon, then BURN's definition in the hover tooltip's look under the word
    const fd = framed(1920, 1080, 1, 1), pd = panelCtx(cargoRun("furnace", "temper"), CARGO, fd, false);
    pd.draw();
    expect(keywordState(pd.ctx)!.rig).toBe(true);
    keywordsIdle(pd.ctx);
    ui = pd.draw();
    expect([keywordState(pd.ctx)!.auto, keywordState(pd.ctx)!.word]).toEqual(["BURN", null]);
    expect(ui.regions.some((r) => r.id === SIGHT_REGION)).toBe(true);
  });
});

describe("CARD-2 (k3): the piece one-offs (g) and DRAKE NOZZLE's note (h): new words, each line in the op band (225 px)", () => {
  it("SHOT TOWER, ASSEMBLY LINE, SABOT, SCRAPPER, LIMPET, GATLING, PINCER, SPOTTER, COIL, TWIN LATCH's desk line, DRAKE's SHOT note", () => {
    const want: Record<string, string[][]> = {
      shottower: [["RIGS HIT EACH OF ITS 3 SLUGS ON ITS OWN."]], // run 2: true on a two-belt tower too (stamp is round-robin)
      assembly: [["WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 50% SOONER."], ["WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING 75% SOONER."], ["WHILE IT FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING AT ONCE."]], // SHOPCARD-1b (REQ-BFG-081): START (was WORK); SHOPCARD-1c (G8): when and what (EACH FIGHT, START WORKING), two rows // SHOPCARD-1e (E2; READ-12 fix 1): ALL YOUR RIGS (was YOUR RIGS): 3 of 5 answers below R hedged all or some rigs; battle.ts:714-736 scales every rig's commissionAt
      sabot: [["A RIG IT HITS STOPS FOR THE WHOLE FIGHT.", "ANY OTHER PART IT HITS: STUN 4."]],
      scrapper: [["EACH STUN YOU LAND: 1 EXTRA .", "ITS  DEAL 30 MORE  THAN PLAIN."]], // CARD-5 (REQ-BFG-081, L): + its scrap damage, by design
      limpet: [["THE  LANDS ONCE, AS A BLAST ON THE FOE'S HULL, 3 AFTER ITS SLUG HITS ANYTHING."]], // SHOPCARD-1b (REQ-BFG-081): the blast's number on the line; SHOPCARD-1c (G7): ITS DMG, no number; SHOPCARD-1d (H2): the DMG lands once, as a blast, two rows (335 px)
      gatling: [["FIRES EACH LOAD AS IT COMES.", "SPINS UP TO 67% FASTER."]],
      pincer: [["HIT: +20  FOR EACH OTHER RIG ON THE TILE."], ["HIT: +44  FOR EACH OTHER RIG ON THE TILE."], ["HIT: +70  FOR EACH OTHER RIG ON THE TILE."]], // SHOPCARD-1b (REQ-BFG-081)
      spotter: [["SHOTS AIMED AT NO PART AIM AGAIN ONCE."], ["SHOTS AIMED AT NO PART AIM AGAIN TWICE."], ["SHOTS AIMED AT NO PART AIM AGAIN 3 TIMES."]],
      coil: [["HIT: ITS  STUNS THE PART IT HITS 2."], ["HIT: ITS  STUNS 2 PARTS 2."], ["HIT: ITS  STUNS 2 PARTS 3."]],
    };
    const rows: string[] = [];
    for (const [id, stars] of Object.entries(want)) stars.forEach((lines, i) => {
      const fl = faceLines(id, i + 1, { k: 1 })!;
      const got = fl.rules.map((r) => stripIconsOf(r.text));
      expect(got, `${id} ★${i + 1}`).toEqual(lines);
      for (const r of fl.rules) {
        expect(textWidth(r.text, "5"), `${id} ★${i + 1}: ${r.text}`).toBeLessThanOrEqual(id === "assembly" || id === "limpet" ? 2 * 225 : 225); // SHOPCARD-1c (G8): ASSEMBLY LINE takes two rows of the band (328 px, ★3 310); SHOPCARD-1d (H2): so does LIMPET WORKS (335 px)
        rows.push(`${id} ★${i + 1}: "${stripIconsOf(r.text)}" ${textWidth(r.text, "5")} px`);
      }
    });
    // TEXT-STYLE 7.2's suffix keeps the keyword's colour (font.ts keywordColour): COIL's {*STUN}S, icon and word, in STUN's
    // colour at every star (it drew in the line's base colour before the fix); a bare STUNS (no icon) stays as it was
    for (const s of [1, 2, 3]) {
      const sp = colourize(icons(faceLines("coil", s, { k: 1 })!.rules[0].text), C.bone).find((x) => stripIconsOf(x.t) === "STUNS");
      expect(sp?.c, `coil ★${s}`).toBe(ICON_COLOUR[ICON.STUN]);
    }
    expect(colourize("STUNS", C.bone)[0].c).toBe(C.bone);
    expect(cardTextOf("twinlatch", {})).toBe("HOLDS A SLUG TO PAIR TWO BELTS.");
    const drake = glossaryText("SHOT", { def: "drake", stars: 1 })!;
    expect(drake).toBe("SHOT: SCRAP'S EXTRA DAMAGE COUNTS, AND ALL OF A FUSED SLUG'S. {*HEAT} NEVER DOES.");
    rows.push(`drake SHOT note: ${wrapRichOf(drake, 225).length} lines of 5x7 at 225 px; twinlatch desk card: ${textWidth("HOLDS A SLUG TO PAIR TWO BELTS.", "5")} px`);
    console.log(`CARD-2 (k3) piece lines:\n${rows.join("\n")}`);
  });
});

describe("CARD-2 (k6): the plain rigs' faces on LAST CHANCE's PART card and the desk shop card's hover (REQ-BFG-084)", () => {
  it("WHETSTONE, TEMPER, BARBED SPOOL: the stat row, no HIT: line; LAST CHANCE's i box leads with the rig sentence; every other rig unchanged", () => {
    const want: Record<string, string> = { whetstone: `${ICON.DMG}+20`, temper: `${ICON.BURN}+1`, barbed: `${ICON.FRAY}+1` };
    for (const [id, row] of Object.entries(want)) {
      expect(offerTooltip(id), id).toBe(row);
      expect(offerTooltip(id), id).not.toContain("HIT:");
    }
    // another rig keeps its face's first rule line (HEAT JACKET, PLATE ROLLER, RIVETER keep HIT:)
    expect(offerTooltip("plateroller")).toBe(faceLines("plateroller", 1)!.rules[0].text);
    // LAST CHANCE: a run whose pending pick offers each plain rig as its PART
    for (const id of Object.keys(want)) {
      const run = newRun("furnace", 5, `card2-k6-${id}`);
      (run as unknown as { lastChance: { lives: number; day: number } }).lastChance = { lives: 1, day: 3 };
      const sc = screenOf(run, 402, 690, 3, true), lc = new LastChancePicker();
      const o0 = lc.offer(sc.s as never);
      expect(o0, `${id}: a pending LAST CHANCE pick`).toBeTruthy();
      if (!o0) continue;
      lc.offer = () => ({ ...o0, part: id }) as never;
      // CARD-3 (REQ-BFG-087, D5): the card's text is items now (each its lines: drawBody puts G between items), so the lines
      // are the items' lines in order (was one list of lines)
      const lines = (lc as unknown as { texts(r: Run, o: unknown, w: number): { boon: string; lines: { t: string }[][][]; info: { t: string }[][][] }[] }).texts(run, lc.offer(sc.s as never), 300);
      const part = lines.find((t) => t.boon === "part")!;
      // MERGE-099D (BRIEF-MERGE-099D 1c, 1f): c099's LAST CHANCE PART card is the face at the offer's star (HULL-1d, REQ-BFG-073:
      // ★2 with HULL_SCALE on) on the run's day (HULL-1a/1d), so the plain rig's stat row is plainRigStats there (WHETSTONE ★2:
      // +40; was ★1's want[id] on bb-0.9.7, which had no part star); the switch off: ★1, want[id], as before
      expect(part.lines.flat().map((l) => l.map((s) => s.t).join("")), id).toEqual([statRow(plainRigStats(id, o0.partStars ?? 1, run.day)!)]);
      if ((o0.partStars ?? 1) === 1 && run.day === 1) expect(statRow(plainRigStats(id, 1, 1)!), id).toBe(want[id]);
      lc.info.add(lines.findIndex((t) => t.boon === "part"));
      const info = (lc as unknown as { texts(r: Run, o: unknown, w: number): { boon: string; info: { t: string }[][][] }[] }).texts(run, lc.offer(sc.s as never), 300).find((t) => t.boon === "part")!.info;
      expect(info.flat().map((l) => l.map((s) => s.t).join("")).join(" "), id).toMatch(/^EACH ARROW THAT POINTS AT A BELT TILE GIVES ITS STATS TO EVERY SLUG ON THAT TILE\. ONE ARROW, ONE HIT\. /);
    }
  });

  // PLAIN-1F (REQ-BFG-084, REQ-BFG-089, M3): the six plain stat rigs take the same path with PLAIN_RIGS on: the desk hover's
  // stat row, LAST CHANCE's PART card the stat row at the card's star, its ⓘ box the NOTES lead (faces.ts plainNotes: the
  // rig sentence, SCALE GUARD's carry line after it, BALLAST's own line in its place), then the reminders at that star
  // (BRANDING IRON's ★1 has no BURN, so no BURN reminder: cap's call on run 2's F7), then where it goes
  it("PLAIN-1F (M3): the six, with PLAIN_RIGS on: the hover's stat row, no HIT:; LAST CHANCE's PART card and ⓘ box at every star", () => withPlainRigs(() => {
    const run = newRun("furnace", 5, "plain1f-k6");
    const text = (items: { t: string }[][][]): string[] => items.map((it) => it.map((l) => l.map((s) => s.t).join("")).join(" "));
    for (const id of PLAIN_RIG_IDS) {
      expect(offerTooltip(id), id).toBe(statRow(plainRigStats(id, 1)!));
      expect(offerTooltip(id), id).not.toContain("HIT:");
      for (const s of [1, 2, 3]) {
        expect(text(partLines(id, 300, run, s)), `${id} ★${s}`).toEqual([statRow(plainRigStats(id, s, run.day)!)]);
        const want = [...plainNotes(id), ...faceAt(id, s, { day: run.day })!.reminders, `FREE. IT GOES TO CARGO AT ★${s}; PLACE IT AS ANY PART.`];
        expect(text(partInfo(id, 300, run, s)), `${id} ★${s}`).toEqual(want.map((t) => icons(t)));
      }
    }
    expect(plainNotes("ballast")).toEqual([BALLAST_LINE]);
    expect(plainNotes("scaleguard")).toEqual([RIG_SENTENCE, CARRY_LINE]);
    for (const id of ["rasp", "sparkgap", "grindstone", "brandingiron"]) expect(plainNotes(id), id).toEqual([RIG_SENTENCE]);
    // F7: BRANDING IRON's ⓘ box names BURN only from ★2, where its stat row has BURN
    const burnAt = [1, 2, 3].map((s) => text(partInfo("brandingiron", 300, run, s)).some((t) => t.includes("BURN")));
    expect(burnAt).toEqual([false, true, true]);
  }));
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
    expect(sightDone("kw:SHIELD.107"), "the next one waits for the next open").toBe(false); // CARD-3
    // the next open: TWIN SALVE (PAIR: HEAL 20.): PAIR is done, so HEAL. CARD-4 (REQ-BFG-081, P3) changed what this
    // checks: while PAIR's note (opened by itself) is up, the next press only closes it; the press after opens the card
    picker.pressed("runepick-1");
    ui.regions.find((r) => r.id === "runepick-1")!.onTap!();
    expect([picker.open, picker.word], "CARD-4 (P3): that press only closed PAIR's note").toEqual([0, null]);
    ui = sc.frame(picker as never);
    picker.pressed("runepick-1");
    ui.regions.find((r) => r.id === "runepick-1")!.onTap!();
    expect(picker.word).toBe("HEAL");
    sc.frame(picker as never);
    // SEAM RIVETS again: PLATE now; HOT SEAM after: BURN (PAIR done). CARD-4 (P3): a press on the picker's background
    // first closes each note that opened by itself
    picker.pressed("runepick");
    picker.pressed("runepick-0");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-0")!.onTap!();
    expect(picker.word).toBe("SHIELD"); // CARD-3 (REQ-BFG-107)
    sc.frame(picker as never);
    picker.pressed("runepick");
    picker.pressed("runepick-2");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-2")!.onTap!();
    expect(picker.word).toBe("BURN");
    sc.frame(picker as never);
    // every keyword seen: an open shows none, never on every open
    picker.pressed("runepick");
    picker.pressed("runepick-0");
    sc.frame(picker as never).regions.find((r) => r.id === "runepick-0")!.onTap!();
    expect(picker.word).toBeNull();
    expect(state(run), "no rune taken, nothing bought").toBe(before);
    // the store holds the notes with the tips' ids; a reload keeps them
    const stored = JSON.parse((g.localStorage as Mem).getItem(TIPS_KEY)!);
    expect(stored).toEqual(expect.arrayContaining(["kw:PAIR", "kw:HEAL", "kw:SHIELD.107", "kw:BURN"])); // CARD-3
    setTipsForTests("reload");
    expect(["kw:PAIR", "kw:HEAL", "kw:SHIELD.107", "kw:BURN"].every((id) => sightDone(id))).toBe(true);
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
    // CARD-4 (REQ-BFG-081, T) changed this list: LOAD is a rune word now (TOLL ROAD's), its first sight the LOAD label's
    expect(Object.values(KEYWORD_WORD).filter((w) => FIRST_SIGHT_WORDS.includes(w)).sort()).toEqual(["BURN", "FRAY", "HEAL", "HEAT", "LOAD", "PAIR", "REGEN", "RIDE", "SHIELD", "STUN", "WARD"]); // CARD-3
  });
});

import { definitionLines, explainWords, infoDrawn, infoItems, infoLevels, infoPages, panelPiece } from "../src/screens/build/keywords";
import { RIVALS, RIVAL_IDS } from "../src/sim/rivals";
import { readdirSync, readFileSync, statSync } from "node:fs";

describe("CARD-2 (k1): never in a fight, on hero screens or packs: the first-sight hooks' callers (a source scan)", () => {
  it("only drawDetails asks drawKeywordLayer for the notes, and only in the caravan; drawDetails only on the build screen; runeSightWord only on the three rune cards", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = `${d}/${f}`; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts")) files.push(p); } };
    walk("src");
    const code = (f: string) => readFileSync(f, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const callers = (re: RegExp) => files.filter((f) => re.test(code(f))).sort();
    // The arguments of the call whose "(" is at `at`: commas at the call's own depth, plus one
    const argCount = (src: string, at: number) => {
      let depth = 0, n = 1;
      for (let i = at; i < src.length; i++) {
        const c = src[i];
        if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) { if (--depth === 0) return n; }
        else if (c === "," && depth === 1) n++;
      }
      return -1;
    };
    // drawKeywordLayer's 12th parameter, `sight`, asks for the notes. keywords.ts defines it; inspector.ts's drawDetails
    // is the one caller that passes it, as ctx.run.stage === "caravan". Any other caller (after the motion lane's merge,
    // battleScout.ts's VIEW BATTLEFIELD faces, with 10) leaves it at its default, false. (cap's review: the merge onto
    // release-099 adds battleScout.ts as a caller, which the scan's first form refused)
    const asks = callers(/\bdrawKeywordLayer\(/).filter((f) => f !== "src/screens/build/keywords.ts").filter((f) => {
      const src = code(f);
      return [...src.matchAll(/\bdrawKeywordLayer\(/g)].some((m) => argCount(src, m.index! + m[0].length - 1) >= 12);
    });
    expect(asks).toEqual(["src/screens/build/inspector.ts"]);
    expect(code("src/screens/build/inspector.ts")).toMatch(/drawKeywordLayer\([^;]*ctx\.run\.stage === "caravan"\);/);
    expect(callers(/\bdrawDetails\(/)).toEqual(["src/screens/build/chrome.ts", "src/screens/build/inspector.ts"]);
    expect(callers(/\bruneSightWord\(/)).toEqual(["src/screens/lastChancePicker.ts", "src/screens/runePicker.ts", "src/ui/runeBar.ts"]);
    expect(code("src/ui/runeBar.ts")).toMatch(/s\.run\.stage === "caravan" \? runeSightWord\(/);
    // nothing in a fight's, a hero's or a pack's screen reaches the notes (a battle screen may draw keyword targets
    // through drawKeywordLayer, never asking for the notes: `asks` above)
    for (const f of files.filter((p) => /screens\/(battle|hero|packs?)/i.test(p))) expect(code(f), f).not.toMatch(/firstSight|runeSightWord|drawDetails/);
  });
});
import { captainSpans } from "../src/ui/captainText";

describe("CARD-2 (k3 (i)): the two captains' lines with retired words, drawn in the current words (captainText.ts)", () => {
  it("SPARKFANG's blurb and BRASSWICK's trick (alone and in the inspect panel's title); RIVALS unchanged; every other captain line as it was", () => {
    const shown = (t: string) => captainSpans(t, "#000000").map((s) => s.t).join("");
    // CARD-3 (REQ-BFG-107): PLATE leaves the game's text: two ARMOR PACKs (rivalBuilds.ts P()), three soak layers (SHIELD)
    const R107: Record<string, string> = {
      mothqueen: "SPLIT BOLTS, TWO ARMOR PACKS. FRAY PILES UP.", bulwark: "THREE ARMOR PACKS, A BRAKED COOKER.",
      grimhold: "THICK SHIELD MAKES EVERY SHOT HIT HARDER.", karsk: "A WALL OF SHIELD. HE BREAKS IT ON YOU.",
      thistlemail: "THREADS SHIELD HER. SHIELDED, HER GUNS SPIN.",
    };
    expect([RIVALS.sparkfang.blurb, RIVALS.brasswick.trick]).toEqual(["GALVANIC COILS STUN YOUR MACHINES.", "MATCHED POUR"]); // src/sim keeps them
    expect(shown(RIVALS.sparkfang.blurb)).toBe("GALVANIC COILS STUN YOUR PARTS.");
    expect(shown(RIVALS.brasswick.trick)).toBe("TWIN POUR");
    expect(shown(`${RIVALS.brasswick.name}, ${RIVALS.brasswick.trick}`)).toBe("BRASSWICK, TWIN POUR");
    // STUNS still draws in STUN's colour
    expect(captainSpans(RIVALS.sparkfang.blurb, "#000000").find((s) => s.t === "STUN")?.c).not.toBe("#000000");
    let same = 0;
    for (const id of RIVAL_IDS) for (const line of [RIVALS[id].trick, RIVALS[id].blurb, `${RIVALS[id].name}, ${RIVALS[id].trick}`]) {
      expect(/\bMACHINES?\b|\bMATCHED\b/.test(shown(line)), `${id}: ${shown(line)}`).toBe(false);
      // CARD-3 (REQ-BFG-107): five blurbs read the new words (captainText.ts: CAPTAIN_TEXT, then gameWords)
      if (R107[id] && line === RIVALS[id].blurb) { expect(shown(line), id).toBe(R107[id]); continue; }
      if (!(id === "sparkfang" && line === RIVALS[id].blurb) && !(id === "brasswick" && line.includes("MATCHED POUR"))) {
        expect(shown(line), id).toBe(line);
        same++;
      }
    }
    expect(same).toBe(RIVAL_IDS.length * 3 - 3 - Object.keys(R107).length); // CARD-3: and the five
  });
});

describe("CARD-2 (k5): NOTES in 3x5 in the ⓘ view (READ-3 fix 5; the page counts are keywords.tap.test.ts's U2F pins)", () => {
  afterEach(() => { setTipsForTests("reload"); });

  it("TEMPER, DART GUN, SEAM WELDER on 402x690 @3 with a rune and on the desk: each NOTES line its own 3x5 entry (7 px pitch, infoDrawn's gaps); LEVELS and KEYWORDS in 5x7 as before", () => {
    setTipsForTests("done");
    const rows: string[] = [];
    let nNotes = 0;
    for (const [view, f, touch] of [["op-402x690 runes 1", framed(402, 690, 3, 1), true], ["desk runes 1", framed(1920, 1080, 1, 1), false]] as const) {
      for (const def of ["temper", "dartgun", "seamwelder"]) {
        const run = cargoRun(def === "seamwelder" ? "foundry" : "furnace", def), d = panelCtx(run, CARGO, f, touch).d();
        const r = d.plan.r, w = r.w - 10, top = d.plan.y - 1, bottom = d.plan.maxY + 2;
        const notes = (d.t.notes ?? []).map((b) => b.text);
        const items = infoItems(infoLevels(run, CARGO), explainWords(d.t, panelPiece(run, CARGO)), w, notes);
        const ns = items.filter((it) => it.section === "NOTES");
        // every NOTES line is still its own entry, in order, with its gap; drawn in 3x5 (its keyword in its colour)
        expect(ns.map((it) => it.note), `${view} ${def}`).toEqual(notes);
        for (const it of ns) {
          expect([it.font, it.gap], `${view} ${def}: ${it.note}`).toEqual(["3", 2]);
          expect(it.lines).toEqual(wrapRich(colourize(icons(it.note!), C.bone), w, "3"));
          for (const ln of it.lines) expect(lineWidth(ln, "3")).toBeLessThanOrEqual(w);
        }
        // LEVELS and KEYWORDS as they were (5x7)
        for (const it of items.filter((x) => x.section !== "NOTES")) expect(it.font, `${view} ${def}: ${it.section}`).toBeUndefined();
        // as drawn: a NOTES line 5 px tall at a 7 px pitch, every other line 7 px at 9
        const drawn = infoDrawn(items, r, top, bottom, null, 0);
        const lines = drawn.rows.filter((q) => q.line);
        for (const q of lines) expect(q.h, `${view} ${def}`).toBe(q.font === "3" ? 5 : 7);
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].area === lines[i - 1].area && lines[i].font === "3" && lines[i - 1].font === "3" && lines[i].y - lines[i - 1].y < 9) expect(lines[i].y - lines[i - 1].y).toBe(7);
        }
        // the room NOTES takes: 5x7 (EXPLAIN-1) -> 3x5; the body-alone pages (U2e) before -> after
        const old = items.map((it) => (it.section === "NOTES" ? { ...it, lines: definitionLines(it.note!, w), font: undefined } : it));
        const h5 = ns.reduce((n, it) => n + definitionLines(it.note!, w).length * 9 + it.gap, 0), h3 = ns.reduce((n, it) => n + it.lines.length * 7 + it.gap, 0);
        nNotes += ns.length;
        rows.push(`${view} ${def}: ${ns.length} NOTES entries, ${h5} -> ${h3} px; body-alone pages ${infoPages(old, bottom - top).length} -> ${infoPages(items, bottom - top).length}`);
      }
    }
    expect(nNotes).toBeGreaterThan(0);
    console.log(`CARD-2 (k5) NOTES in 3x5:\n${rows.join("\n")}`);
  });
});
