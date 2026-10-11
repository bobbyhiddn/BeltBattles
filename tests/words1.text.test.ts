// WORDS-1 (REQ-BFG-081; BRIEF-WORDS1 step 3; READ-1 6.1-6.3): plain words on the cards. Card text and tap notes only: no
// rule, id, number or layout changes (src/sim is untouched). Pinned here:
//   - the new lines: each turret's two plain lines under its stat row and its INNER COLUMN rule, the speed rigs' FROM THIS
//     TILE ON, READ-1 6.1's plain-word swaps on the faces, the desk cards and the rune cards, the kind words on a panel;
//   - no retired coined word (VOLLEY, MERGED, STAMP, MACHINE, NEXT RIG'S, BONUS DAMAGE, BLOCKS, WRECK, MATCHED) on any
//     buyable card's face, card line, panel or rune card, and no merchant's name or TURRET CORE / TURRET GEAR on a panel;
//   - every tappable word on every buyable card's panel opens a note (keywords.ts matches, familyTargets), and every
//     glossary word a face prints is tappable there; the core list (glossary.ts CORE_WORDS) holds 10 or fewer;
//   - no face or panel string, at any view, is wider than its box, and every panel's text fits it whole.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { turretRow } from "../src/screens/build/faceBlocks"; // CARD-2 (REQ-BFG-081, K4): the turret row in words
import { turretStats } from "../src/ui/faces"; // CARD-2 (K4)
import { newRun, type Run } from "../src/game/run";
import { ITEMS, MERCHANTS, buyableModules } from "../src/sim/content";
import { gearSlotsOf } from "../src/sim/deck";
import { effectAt, fusible } from "../src/sim/stars";
import { RUNE_LIST, SUSTAIN_RUNE_LIST } from "../src/sim/runes";
import { computeView, type View } from "../src/core/io";
import { ICON, icons, stripIcons, textWidth } from "../src/render/font";
import { UI, type Rect } from "../src/ui/ui";
import { tapPx } from "../src/ui/tap";
import { lineText, lineWidth } from "../src/ui/richText";
import { faceAt, faceLines, turretPlain } from "../src/ui/faces";
import { abilityText, cardText } from "../src/ui/abilityText";
import { CORE_WORDS, GLOSSARY, HERO_WORDS, RUNE_NOTE, SLUG_NOTES, GEAR_NOTE, glossaryEntry, glossaryHits, statIconNote } from "../src/ui/glossary";
import { FAMILY, FAMILY_ORDER, familiesOf, familyNote } from "../src/ui/families";
import { runeLine, runeReminder, runeTag } from "../src/ui/runeText";
import { shopChip } from "../src/ui/chips";
import { fmtCount } from "../src/ui/statFormat";
import { buildLayout, buildScale, panelArea, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { columnButtons, detailsPlan, fullText, visibleLines, type PanelPlan } from "../src/screens/build/inspector";
import { offerPanel, cargoPanel } from "../src/screens/build/inspector";
import { familyTargets, keywordTargets, panelPiece, panelWords, questionRect } from "../src/screens/build/keywords";
import { KIND_SUB, describe as describeKind } from "../src/screens/build/shop";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { flavourText } from "../src/screens/build/flavour";
import type { Ctx } from "../src/screens/build/actions";
import { tapRect } from "../src/ui/ui";

installRaster();

const BUYABLE = buyableModules();
const STARS = (def: string) => (fusible(def) ? [1, 2, 3] : [1]);
const TOUCH = { touch: true, hover: false, busy: false };

/** The retired coined words (READ-1 3.1, 6.1, 6.2): none on any buyable card's face, card line, panel or rune card. A
 *  piece's NAME is not checked (STAMP PRESS, DOUBLE STAMP are names). */
const RETIRED = [/\bVOLLEY/, /\bMERGED\b/, /\bSTAMPS?\b/, /\bMACHINES?\b/, /NEXT RIG'S/, /BONUS DAMAGE/, /\bBLOCKS \d/, /\bWRECK/, /\bMATCHED\b/, /\bPAYLOADS?\b/,
  /\bSHOCK/, /\bSTALL/, /\bCOPIES\b/, /\bAMMO\b/];

/** Every text a buyable piece's panel and cards draw at a star (glyphs as plain text): its face lines and plain lines, its
 *  caveats, its flavour, its desk card line, its hover tooltip's line and its chip. */
function drawnTexts(def: string, s: number): string[] {
  const o = ITEMS[def].kind === "core" ? { k: 1 } : def === "mimic" ? { hero: "furnace" as const } : {};
  const fl = faceLines(def, s, o);
  const out: string[] = [];
  if (fl) out.push(...(fl.plain ?? []), ...fl.rules.map((r) => r.text), ...(fl.caveats ?? []));
  else out.push(...abilityText(def, s, o).sentences);
  const f = flavourText(def, s, 1);
  if (f) out.push(f);
  if (s === 1) { out.push(cardText(def, o)); const chip = shopChip(def, o); if (chip) out.push(icons(chip)); }
  return out.map((t) => stripIcons(icons(t)));
}

describe("WORDS-1: the new lines", () => {
  it("each turret: its stat row, then HOLDS n {SLUG}: FIRES THEM ONE A SHOT, THEN RELOADS. and n {GEAR} SLOT(S) FOR TURRET GEAR., from its data", () => {
    const turrets = BUYABLE.filter((d) => d.kind === "turret");
    expect(turrets.length).toBe(13);
    for (const d of turrets) for (const s of STARS(d.id)) {
      const n = effectAt(d.id, s).turret!.window, g = gearSlotsOf(d.id, s);
      const want = [`HOLDS ${fmtCount(n)} {SLUG}: FIRES THEM ONE A SHOT, THEN RELOADS.`, `${fmtCount(g)} {GEAR} SLOT${g === 1 ? "" : "S"} FOR TURRET GEAR.`];
      expect(turretPlain(d.id, s), `${d.id} ★${s}`).toEqual(want);
      expect(faceLines(d.id, s)!.plain, `${d.id} ★${s}`).toEqual(want.map((t) => icons(t)));
      // under the stat row, kept, in the ability lines' face: the panel's blocks are the stat row, the two lines, then
      // the caveat (an inner turret's), nothing else
      const bs = faceBlocks(d.id, s, {})!;
      // CARD-2 (REQ-BFG-081, K4): the panel's stat row is in words (faceBlocks.ts turretRow: RATE n  HOLDS n  GEAR SLOTS n; was
      // faceLines' icon row, which the face data keeps)
      expect(bs.slice(0, 3).map((b) => b.text), d.id).toEqual([turretRow(turretStats(d.id, s)), ...want.map((t) => icons(t))]);
      expect(bs.every((b) => b.keep), d.id).toBe(true);
      expect(faceAt(d.id, s)!.rules).toEqual([]); // still no ability line: TEXT-STYLE 1.4 as ruled 2026-10-10
    }
    const inner = turrets.filter((d) => d.turret!.intake === "inner").map((d) => d.id).sort();
    expect(inner).toEqual(["dartgun", "hailgun", "spikegun"]);
    for (const id of inner) expect(faceLines(id, 1)!.caveats).toEqual(["TAKES A BELT ON ITS INNER COLUMN ONLY."]);
  });

  it("the speed rigs end FROM THIS TILE ON (FROM THESE TILES ON on many arrows), on the panel and the desk card", () => {
    expect(stripIcons(faceLines("grease", 1)!.rules[0].text)).toBe("ITS BELT RUNS 60% FASTER FROM THIS TILE ON.");
    expect(stripIcons(faceLines("brake", 1)!.rules[0].text)).toBe("ITS BELT RUNS AT 50% SPEED FROM THIS TILE ON.");
    expect(stripIcons(faceLines("overdrive", 1)!.rules[0].text)).toBe("ITS BELTS RUN 3 TIMES AS FAST FROM THESE TILES ON.");
    expect(["grease", "brake", "overdrive", "heatjacket"].map((d) => cardText(d))).toEqual([
      "60% FASTER FROM THIS TILE ON.", "HALF SPEED FROM THIS TILE ON.", "3 TIMES AS FAST FROM HERE ON.", "4 DAMAGE A SEC AFTER THIS TILE."]);
  });

  it("READ-1 6.1's plain-word swaps, on the faces and the desk cards", () => {
    const face = (d: string) => stripIcons(faceLines(d, 1, d === "drake" ? { k: 1 } : {})!.rules[0].text);
    expect(face("mimic")).toBe("MAKES YOUR HERO'S SLUGS TOO.");
    // CARD-2 (REQ-BFG-081, K3 g; READ-2 7.4): its first line of two (was "ITS ROUNDS STOP AN ENEMY RIG FOR THE WHOLE FIGHT.")
    expect(face("sabot")).toBe("A RIG IT HITS STOPS FOR THE WHOLE FIGHT.");
    expect(face("overclocker")).toBe("EVERY 4: THE NEXT RIG DOWN ITS BELT HITS TWICE.");
    expect(face("twingauge")).toBe("HIT: +30  IF ANOTHER BELT INTO ITS TURRET IS AS LONG.");
    expect(face("drake")).toBe("SHOT: EACH 25 DAMAGE RIGS ADDED TO ITS SLUG BECOMES 1 BURN.");
    expect(face("tollbooth")).toBe("THE FIRST 2 STUN ON ITS BELT'S PARTS EACH FIGHT DO NOTHING.");
    expect(face("mendingloom")).toBe("YOUR HULL: HEAL 50 EACH SEC.".replace("50", String(ITEMS.mendingloom.mod!.regen)));
    expect(["mimic", "sabot", "overclocker", "twingauge", "drake", "tollbooth"].map((d) => cardText(d, { k: 1 }))).toEqual([
      "MAKES YOUR HERO'S SLUGS TOO.", "STOPS ENEMY RIGS FOR THE FIGHT.", "NEXT RIG DOWN ITS BELT HITS TWICE.", "DAMAGE IF ANOTHER BELT IS AS LONG.",
      "TURNS RIG DAMAGE INTO BURN.", "FIRST 2 STUNS ON ITS BELT FAIL."]);
  });

  it("the rune cards: VOLLEY, MERGED, STAMP and MACHINES in plain words, each one line, the rest on the opened card", () => {
    const rune = (id: string) => [...RUNE_LIST, ...SUSTAIN_RUNE_LIST].find((r) => r.id === id)!;
    expect(["final_nail", "ember_shot", "first_blood", "scrap_halo", "scrap_saint", "forge_ward", "scrap_biter", "steady_iron", "thread_storm", "green_thread"]
      .map((id) => runeLine(rune(id)))).toEqual([
      "THE SHOT THAT EMPTIES A TURRET: +10 DMG.", "FIRST SHOT AFTER A GUN LOADS: +1 BURN.", "FIRST SHOT AFTER A GUN LOADS: +70% DMG.",
      // CARD-2 (REQ-BFG-081, K3 d; READ-3 6: ★2 and ★3 not read as merged): MERGED comes back on these two, glossed by the
      // stars (was "+60 HULL FOR EACH ★2 OR ★3 PIECE IN USE." and "+11% DMG FOR EACH ★2 OR ★3 PIECE IN USE.")
      "+60 HULL PER MERGED (★2/★3) PIECE IN USE.", "+11% DMG PER MERGED (★2/★3) PIECE IN USE.", "EACH SLUG YOUR FACTORY MAKES: +10 PLATE.",
      "YOUR HITS ON ENEMY PARTS: +10 DMG.", "STUN ON YOUR SHIP: -100%.", "YOUR HITS THAT ADD NO FRAY ADD 1 FRAY.", "YOUR HULL: HEAL 10 EACH SEC."]);
    // the opened card says what the one line can't (battle.ts:1889; runes.ts:566-569; battle.ts:1045-1047; battle.ts:570)
    expect(runeReminder(rune("final_nail"))).toBe("NOT ON A GATLING SPOOL: IT FIRES EACH LOAD AS IT COMES.");
    expect(runeReminder(rune("scrap_halo"))).toBe(RUNE_NOTE.scrap_halo);
    expect(runeReminder(rune("scrap_biter"))).toBe("PART: AN ENEMY RIG, FACTORY, GUN OR BELT TILE.");
    expect(runeTag(rune("last_stand"))).toBe("EPIC · GUNS AND FACTORIES");
    for (const r of [...RUNE_LIST, ...SUSTAIN_RUNE_LIST]) {
      // CARD-2 (K3 d): MERGED is the brief's word on SCRAP HALO and SCRAP SAINT (the MERGE badge's), so it is not retired there
      for (const re of RETIRED) if (!(String(re) === String(/\bMERGED\b/) && ["scrap_halo", "scrap_saint"].includes(r.id))) expect(runeLine(r), r.id).not.toMatch(re);
      expect(runeReminder(r), r.id).not.toMatch(/\d/);
      expect(textWidth(runeReminder(r), "3"), r.id).toBeLessThanOrEqual(223);
    }
  });

  it("no retired coined word on any buyable card's face, plain line, caveat, flavour, desk card, chip or family note", () => {
    let n = 0;
    for (const d of BUYABLE) for (const s of STARS(d.id)) for (const t of drawnTexts(d.id, s)) {
      for (const re of RETIRED) expect(t, `${d.id} ★${s}: ${t}`).not.toMatch(re);
      n++;
    }
    for (const t of FAMILY_ORDER) for (const re of RETIRED) expect(familyNote(t), t).not.toMatch(re);
    expect(n).toBeGreaterThan(400);
  });

  it("a panel names a core's and gear's kind in plain words and no merchant: the desk's wagon tags keep the names", () => {
    expect(KIND_SUB).toEqual({ core: "CHANGES HOW A GUN SHOOTS", mod: "FITS A GUN'S GEAR SLOT" });
    const names = Object.values(MERCHANTS).map((m) => m.name);
    for (const d of BUYABLE) {
      const run = newRun("furnace", 5, "w1");
      run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      const t = offerPanel(run, 0, 0)!;
      run.inventory = [{ uid: 900, def: d.id }];
      const c = cargoPanel(run, 900)!;
      for (const sub of [t.sub, t.subShort ?? "", c.sub, c.subShort ?? ""]) {
        for (const m of names) expect(sub, `${d.id}: ${sub}`).not.toContain(m);
        expect(sub, d.id).not.toMatch(/TURRET CORE|TURRET GEAR/);
      }
      if (KIND_SUB[d.kind]) expect(t.sub, d.id).toBe(KIND_SUB[d.kind]);
      else expect(t.sub, d.id).toBe(describeKind(d));
    }
  });
});

describe("WORDS-1: tap reach (TEXT-STYLE 7.4 as ruled 2026-10-10)", () => {
  it("the core list holds 10 or fewer, and each hero word is its hero's", () => {
    expect(CORE_WORDS.length).toBeLessThanOrEqual(10);
    expect([...CORE_WORDS]).toEqual(["SLUG", "BELT", "HIT", "RATE", "LOAD", "HULL", "BURN", "STUN", "PLATE", "MERGE"]);
    expect(HERO_WORDS).toEqual({ HEAT: "furnace", FRAY: "weaver", PAIR: "foundry" });
  });

  it("every word a buyable card's panel names opens a note, and every glossary word a face line prints is one of them", () => {
    let words = 0;
    for (const d of BUYABLE) for (const s of STARS(d.id)) {
      const o = d.kind === "core" ? { k: 1 } : { hero: "furnace" as const };
      const body = faceBlocks(d.id, s, o)!;
      const piece = { def: d.id, stars: s, o };
      const ws = panelWords(body, piece);
      for (const w of ws) {
        expect(w.text.length, `${d.id} ★${s} ${w.word}`).toBeGreaterThan(0);
        // a note leads with its word, its icon or (a tap note) its label's word, then a colon
        expect(icons(w.text).indexOf(":"), `${d.id} ★${s} ${w.word}: ${w.text}`).toBeGreaterThan(0);
        words++;
      }
      const named = new Set(ws.map((w) => w.word));
      for (const b of body) {
        if (b.role !== "ability" && b.role !== "caveat") continue;
        for (const h of glossaryHits(b.text)) if (h.row.word !== "RATE" && b.role === "ability") expect(named.has(h.row.word), `${d.id} ★${s}: ${h.row.word} in "${stripIcons(b.text)}"`).toBe(true);
        // the stat icons a face draws are tappable: {RATE}, {SLUG}, {GEAR}
        for (const k of ["RATE", "SLUG", "GEAR"] as const) if (b.role === "ability" && b.text.includes(ICON[k])) expect(named.has(k), `${d.id} ★${s}: {${k}}`).toBe(true);
      }
    }
    expect(words).toBeGreaterThan(300);
    // {SLUG} names a turret's loads, a core's or gear's load, else a slug (READ-1 6.5: one icon, two things)
    expect(statIconNote("SLUG", "turret", false)).toBe(SLUG_NOTES.gun);
    expect(statIconNote("SLUG", "factory", false)).toBe(SLUG_NOTES.slug);
    expect(statIconNote("SLUG", "mod", false)).toBe(SLUG_NOTES.load);
    expect(statIconNote("SLUG", undefined, true)).toBe(SLUG_NOTES.gun);
    expect(statIconNote("GEAR", "turret", true)).toBe(GEAR_NOTE);
    expect(statIconNote("RATE", "factory", false)).toBe(glossaryEntry("RATE")!.def);
    // the speed rigs' FROM THIS TILE ON opens SPEED's row (READ-1 3.3: the one sentence that fixes the misread, now reachable)
    for (const d of ["grease", "brake", "overdrive"]) {
      const ws = panelWords(faceBlocks(d, 1, {})!, { def: d, stars: 1, o: {} });
      expect(ws.find((w) => w.word === "SPEED")?.text, d).toBe(glossaryEntry("SPEED")!.def);
    }
    // POWDER KEG's EVERY tap says its whole belts; DRAKE NOZZLE's SHOT tap says scrap and fuses count, HEAT never
    expect(panelWords(faceBlocks("keg", 1, {})!, { def: "keg", stars: 1, o: {} }).find((w) => w.word === "EVERY")?.text).toMatch(/EACH SLUG ON ITS BELTS GETS IT/);
    expect(panelWords(faceBlocks("drake", 1, { k: 1 })!, { def: "drake", stars: 1, o: { k: 1 } }).find((w) => w.word === "SHOT")?.text).toMatch(/NEVER DOES/);
  });

  it("every coined glossary word a buyable card's face prints is in the core list, a hero word or tappable on that card", () => {
    const coined = GLOSSARY.filter((r) => r.scope === "text" && !CORE_WORDS.includes(r.word) && !(r.word in HERO_WORDS));
    for (const d of BUYABLE) for (const s of STARS(d.id)) {
      const o = d.kind === "core" ? { k: 1 } : { hero: "furnace" as const };
      const body = faceBlocks(d.id, s, o)!;
      const named = new Set(panelWords(body, { def: d.id, stars: s, o }).map((w) => w.word));
      for (const b of body) for (const h of glossaryHits(b.text)) {
        if (!coined.includes(h.row) || h.row.word === "RATE") continue;
        expect(named.has(h.row.word), `${d.id} ★${s}: ${h.row.word}`).toBe(true);
      }
    }
  });

  it("each family tag in a panel's header is a target with its families.ts line, inside the panel and clear of the buttons", () => {
    const run = newRun("furnace", 5, "fam");
    let n = 0;
    for (const d of BUYABLE.filter((x) => familiesOf(x.id).length)) {
      run.gold = 99;
      run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
      for (const [w, h, dpr] of [[402, 690, 3], [1920, 1080, 1]] as const) {
        const v = computeView(w, h, dpr, buildScale), touch = w < 1000, L = buildLayout(v.W, v.H, v.portrait, 5, touch);
        const ctx = { game: { ui: new UI(), t: 0, view: v }, run, touch, L } as unknown as Ctx;
        const d0 = detailsPlan(ctx, { kind: "offer", wagon: 0, slot: 0 }, null, L.info)!;
        const plan = d0.plan, tap = touch ? tapPx(v) : 0;
        const buttons = plan.column ? columnButtons(d0.t.labels.length, plan.r, tap) : (plan.rects ?? []).map((b) => (tap ? tapRect(b, tap, plan.r) : b));
        const q = questionRect(plan.r, plan.y, tap, buttons);
        const ts = familyTargets(plan, [...buttons, ...(q ? [q] : [])]);
        for (const t of ts) {
          const tag = t.word.replace(/ FAMILY$/, "") as keyof typeof FAMILY;
          expect(t.text, d.id).toBe(familyNote(tag));
          expect(t.r.x >= plan.r.x && t.r.y >= plan.r.y && t.r.x + t.r.w <= plan.r.x + plan.r.w && t.r.y + t.r.h <= plan.r.y + plan.r.h, `${d.id} ${t.word} inside`).toBe(true);
          for (const b of buttons) expect(t.r.x < b.x + b.w && b.x < t.r.x + t.r.w && t.r.y < b.y + b.h && b.y < t.r.y + t.r.h, `${d.id} ${t.word} clear of a button`).toBe(false);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(80);
  });
});

/** zoom.test's portrait phone views (keywords.tap.test.ts VIEWS), and the desks. */
const VIEWS: [number, number, number][] = [[390, 660, 3], [390, 664, 3], [402, 690, 3], [390, 844, 3], [430, 739, 3], [393, 659, 3], [402, 718, 3],
  [390, 700, 3], [360, 640, 2], [375, 667, 2], [414, 896, 2], [412, 915, 2.625], [320, 568, 2], [360, 780, 3], [428, 926, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 800, 1]];

function planned(v: View, L: BuildLayout, run: Run, sel: Sel, touch: boolean): PanelPlan | null {
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run, touch, L } as unknown as Ctx;
  const memo = new Map<string, ReturnType<typeof detailsPlan>>();
  const plan = (r: Rect) => { const k = `${r.x},${r.y},${r.w},${r.h}`; if (!memo.has(k)) memo.set(k, detailsPlan(ctx, sel, null, r)); return memo.get(k)!; };
  const area = touch ? panelArea(L, sel, TOUCH, (r) => { const d = plan(r); return d ? fullText(d.plan) : null; }) : L.info;
  return plan(area)?.plan ?? null;
}

describe("WORDS-1: widths (TEXT-STYLE 11) at every view", () => {
  it("every buyable card's offer and cargo panel: its kept text whole, each line inside its box, its sub lines uncut", () => {
    let checked = 0;
    for (const [w, h, dpr] of VIEWS) {
      const v = computeView(w, h, dpr, buildScale), touch = w < 1000, L = buildLayout(v.W, v.H, v.portrait, 5, touch);
      for (const d of BUYABLE) for (const s of STARS(d.id)) {
        const run = newRun("furnace", 5, "w1w");
        run.gold = 99;
        run.shop.wagons = [{ merchant: d.merchant!, offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
        run.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
        const sels: Sel[] = s === 1 ? [{ kind: "offer", wagon: 0, slot: 0 }, { kind: "cargo", uid: 900 }] : [{ kind: "cargo", uid: 900 }];
        for (const sel of sels) {
          const p = planned(v, L, run, sel, touch);
          if (!p || p.headerOnly) continue; // the header-only strip (360x640's) draws the card line instead
          const tag = `${w}x${h} ${sel.kind} ${d.id} ★${s}`;
          // its kept blocks show whole: nothing of the text's kept part is cut
          expect(p.body.fits, `${tag}: the kept text fits`).toBe(true);
          expect(p.body.dropped.filter((b) => b.keep), tag).toEqual([]);
          for (const vl of visibleLines(p)) {
            if (vl.line === "rule" || vl.line.cells) continue;
            const lw = lineWidth(vl.line.spans, vl.line.font) + (vl.line.indent ?? 0);
            expect(lw, `${tag}: "${lineText(vl.line.spans)}"`).toBeLessThanOrEqual(p.r.w - 10);
          }
          // the sub lines WORDS-1 writes draw whole (fitHead never cuts one short with a dot): an offer's (no merchant), a core's
          // and a gear's (KIND_SUB). A turret's cargo sub ("COMMON ADAPTABLE TURRET ·", 94 px) is cut on the 1366x768 laptop
          // at words1-base already: WORDS-1's REPORT lists it, unchanged
          if (sel.kind === "offer" || KIND_SUB[d.kind]) for (const sub of p.subs) expect(textWidth(sub, "3"), `${tag}: sub "${sub}"`).toBeLessThanOrEqual(p.subMax);
          // and every tap target of the panel lies inside it
          const piece = panelPiece(run, sel);
          for (const t of keywordTargets(visibleLines(p), p, piece)) {
            expect(t.r.x >= p.r.x && t.r.x + t.r.w <= p.r.x + p.r.w, `${tag}: ${t.word} inside`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });
});
