// PRESENT-2 P (REQ-BFG-081; PRESENT-1's ruling af2c96863a44ab41 item 4; cap's ruling 26addce8293da756): a shown definition on the landscape COLUMN covers no rule row of its panel. The column never grows and
// sizes its panel to its content, so the note at the foot of the text covered a rule row on 965 of 2,484 boxes on 844x390 @3 (467 of 1,197 panels, finger, one rune). Now the note takes the first place that
// works, in turn: (today) where defBoxPlace puts it, if that covers no rule row; (under) under the panel's foot at the column's full width where the column has the room (the box and 2 px); (beside) beside the
// column, in the strip between its edge and the carrier's DRAWING (2 px right of the column to 2 px left of the carrier), its top level with its word's line, moved up only to end 2 px above the screen's
// foot; (fallback) else today's place, listed by name. Never over the carrier's drawing, a shop card, REROLL, a pack, the top bar, FIGHT, the foe card, the cargo bar or the panel; whole on the screen.
// The harness is tests/present1.s4b.test.ts's (card4's own): every panel a finger or a mouse can open, every keyword's note, on every landscape view the kit has.
import { describe, expect, it } from "vitest";
import { newRun } from "../src/game/run";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, carrierBox, phoneBarLift, phoneScreen, panelArea, screenRect, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { wagonPlace } from "../src/screens/build/enchantStrip";
import type { Run, DuskFoe } from "../src/game/run";
import { setTipsForTests } from "../src/ui/tips";
import { buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { key as KEY, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { detailsPlan, drawDetails, panelFit, visibleLines } from "../src/screens/build/inspector";
import { definitionLines as defLines, keywordState, keywordsIdle, keywordsPressed, smallFaceHolds } from "../src/screens/build/keywords";
import { glossaryEntry } from "../src/ui/glossary";
import { lineText, lineWidth, type RichLine } from "../src/ui/richText";
import { glossaryEntry as gEntry } from "../src/ui/glossary";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
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

/** The landscape views the kit has (card4's PHONES and DESK, and the two desk sizes the text sheets name): [label, w, h, dpr, runes held, a finger (else a mouse), the ENCHANTER's wagon up (PRESENT-3 D: the corner is closed)]. */
const VIEWS: [string, number, number, number, number, boolean, boolean][] = [
  ["land-844x390, finger, no rune", 844, 390, 3, 0, true, false], ["land-844x390, finger, a rune", 844, 390, 3, 1, true, false],
  ["land-844x390, mouse, no rune", 844, 390, 3, 0, false, false], ["land-844x390, mouse, a rune", 844, 390, 3, 1, false, false],
  ["desk-1920x1080, mouse", 1920, 1080, 1, 1, false, false], ["desk-1280x800, mouse", 1280, 800, 1, 1, false, false], ["laptop-1366x768, mouse", 1366, 768, 1, 1, false, false],
  ["desk-1920x1080, mouse, wagon up", 1920, 1080, 1, 1, false, true], ["desk-1280x800, mouse, wagon up", 1280, 800, 1, 1, false, true],
];
/** PRESENT-3 D: a layout with the ENCHANTER's wagon up (inspector.ts columnSpec reads only that L.wagon is there: the corner is closed). */
const withWagon = (f: ReturnType<typeof framed>, up: boolean): ReturnType<typeof framed> => (up ? { ...f, L: { ...f.L, wagon: { rects: [], hits: [], tag: null, shift: 0 } } } : f);

function panelCtx(run: Run, sel: Sel, f: ReturnType<typeof framed>, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
    ui.begin();
    drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return { ui, area, d: detailsPlan(ctx, sel, null, area) };
  };
  return { ctx, draw };
}
const CARGO: Sel = { kind: "cargo", uid: 900 };
const SHORTB = [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "present2-column");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open (tests/present1.s4b.test.ts's allPanels: 1,197). */
function allPanels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof allPanels> = [];
  const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnaceRun();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnaceRun();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: CARGO });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnaceRun([rigAt(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnaceRun([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "present2-column-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnaceRun();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "present2-column-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnaceRun(), sel: { kind: "route", index: 0 } });
  return out;
}
const RULE_ROLES = new Set(["ability", "hits", "warn", "next", "merges", "merge", "row", "grid", "note"]);
interface Row { y: number; h: number; role: string }
const rowsOf = (plan: Parameters<typeof visibleLines>[0]): Row[] => visibleLines(plan).filter((v) => v.line !== "rule").map((v) => {
  const l = v.line as unknown as { font: string; block: { role: string } };
  return { y: v.y, h: l.font === "5" ? 7 : 5, role: l.block.role };
});
const covered = (box: Rect, rows: Row[]): Row[] => rows.filter((r) => RULE_ROLES.has(r.role) && r.y < box.y + box.h && box.y < r.y + r.h);
const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const kwWords = (ui: UI): string[] => [...new Set(ui.regions.filter((q) => /^kw:\d+:/.test(q.id)).map((q) => q.id.split(":")[2]))];
const boxOf = (ui: UI): Rect | null => ui.regions.find((q) => q.id === "kwdef")?.r ?? null;
/** What a note never covers on the landscape screen (keywords.ts ColumnSpec.hard, rebuilt here from the layout alone). */
function hardOf(L: BuildLayout): Record<string, Rect> {
  const cb = carrierBox(false), out: Record<string, Rect> = { carrier: screenRect(L, { x: L.cam.x + cb.x0, y: L.cam.y + cb.y0, w: cb.w, h: cb.h }), reroll: L.reroll, bar: L.bar, FIGHT: L.fight, cargo: L.cargo };
  L.cards.forEach((c, i) => (out[`shop card ${i + 1}`] = c));
  L.packs.forEach((c, i) => (out[`pack ${i + 1}`] = c));
  if (L.foe) out.foe = L.foe;
  return out;
}
const BIG = 3_600_000;
/** The words of a note as one 5x7 line (no wrap): the small-face pass changes the face, never a word. */
const definitionLinesOf = (text: string): RichLine[] => defLines(text, 100000);
/**
 * The pins per view: [boxes, covering a rule row (= the listed fallbacks), today, under, beside, band, corner, fallback, in the 3x5 face (the small-face pass), the widest side box, the tallest side box].
 * PRESENT-2 P: 844x390 with a rune held (the strip is 78 px, 12 characters a line): 0 fallbacks, finger and mouse. 844x390 with no rune (scale 5: the strip is 55 px): 17 notes fell back, all the
 * SWARM FAMILY note ("FACTORIES," is 59 px, the box's text width 49 px) on a turret with a core and a gear (15) and the WEAVER's and FOUNDRY's starting turret (2); the laptop's 1366x768 (56 px): 15 of the
 * same; the desks' 1920x1080 and 1280x800: the strip between the column and the carrier's drawing is 19 and 35 px, under the 40 px a note needs, so every note that covered a row there fell back (275 and
 * 218; 170 after PRESENT-3 E folded a turret's EMPTY gear rows).
 * PRESENT-3 D (cap's ruling 6420b5479c7c7b92): the band (between the shop row's foot and the carrier) and the corner (above the column, left of the shop row, under the rune row; closed with the ENCHANTER's
 * wagon up) join the ladder after `beside`, then the same ladder once more in the 3x5 face for a note no place took in the 5x7 face (F's SWARM FAMILY notes included: it has no code of its own).
 */
const PINS: Record<string, number[]> = {
  "land-844x390, finger, no rune": [3369, 0, 2653, 458, 258, 0, 0, 0, 17, 55, 156], // PRESENT-3 D: was [3369, 17, 2653, 458, 241, 17, 55, 156] (E): the 17 SWARM FAMILY notes are set beside in 3x5 (F)
  "land-844x390, finger, a rune": [3330, 0, 1969, 162, 1199, 0, 0, 0, 0, 78, 102],
  "land-844x390, mouse, no rune": [3887, 0, 3055, 542, 290, 0, 0, 0, 17, 55, 156], // PRESENT-3 D: was [3887, 17, 3055, 542, 273, 17, 55, 156] (E): the same 17
  "land-844x390, mouse, a rune": [3848, 0, 3055, 467, 326, 0, 0, 0, 0, 78, 102],
  "desk-1920x1080, mouse": [3887, 0, 3055, 562, 0, 0, 270, 0, 119, 85, 48], // PRESENT-3 D: was [3887, 275, 3055, 557, 0, 275, 0, 0]: 270 go to the corner (156 in 5x7, 114 in 3x5), 5 under the panel in 3x5
  "desk-1280x800, mouse": [3887, 0, 3061, 656, 0, 170, 0, 0, 0, 345, 21], // PRESENT-3 D: was [3887, 170, 3061, 656, 0, 0, 0, 170] (E; 218 before E): all 170 go to the band (1-2 lines, 5x7)
  "laptop-1366x768, mouse": [3887, 0, 3061, 586, 225, 15, 0, 0, 0, 385, 156], // PRESENT-3 D: was [3887, 15, 3061, 586, 225, 0, 0, 15, 0, 56, 156]: the 15 SWARM FAMILY notes go to the band (5x7)
  "desk-1920x1080, mouse, wagon up": [3887, 270, 3055, 562, 0, 0, 0, 270, 5, 0, 0], // PRESENT-3 D: the corner is closed (the wagon uses that margin): 270 stay listed (the 5 under the panel in 3x5 are placed)
  "desk-1280x800, mouse, wagon up": [3887, 0, 3061, 656, 0, 170, 0, 0, 0, 345, 21], // the band is open with the wagon up (it is in the margin or at the column's top): as without it
};

describe("PRESENT-2 P: a shown definition on the landscape column covers no rule row (cap's ruling 26addce8293da756)", () => {
  for (const [name, w, h, dpr, runes, touch, wagon] of VIEWS) it(`T on ${name}: every keyword's note, opened by a ${touch ? "tap" : "click"}, covers 0 rule rows: today's place, else under the panel, else beside the column, else the band, else the corner, each in 5x7 and then in 3x5`, () => {
    setTipsForTests("done");
    const f = withWagon(framed(w, h, dpr, runes), wagon), L = f.L, hard = hardOf(L), info = L.info;
    const shopFoot = Math.max(...[...L.cards, L.reroll, ...L.packs].filter((q) => q.y < info.y).map((q) => q.y + q.h)), runeRow = L.cards[0].y - (L.bar.h + 9);
    let panels = 0, boxes = 0, mixed = 0, small = 0;
    const place = { today: 0, under: 0, beside: 0, band: 0, corner: 0, fallback: 0 } as Record<string, number>, smallBy: Record<string, number> = {};
    const bad: string[] = [], crossed: string[] = [], fallbacks: string[] = [];
    let widest = 0, tallest = 0, noGlyph = 0, again = 0;
    const tokens = (ls: readonly (readonly { t: string }[])[]): string => ls.map((l) => l.map((s) => s.t).join("")).join(" ").split(/\s+/).filter(Boolean).join(" ");
    for (const p of allPanels()) {
      const pc = panelCtx(p.run, p.sel, f, touch);
      const plain = pc.draw();
      if (!plain.d) continue;
      panels++;
      for (const wd of kwWords(plain.ui)) {
        const st = keywordState(pc.ctx) as { word: string | null };
        st.word = glossaryEntry(wd)?.word ?? wd;
        const fr = pc.draw(), box = boxOf(fr.ui), ks = keywordState(pc.ctx) as unknown as { place: string | null; face: string | null; note: RichLine[] | null; text: string | null };
        const pl = ks.place, face = (ks.face ?? "5") as "5" | "3", drawn = ks.note ?? [];
        st.word = null;
        if (!box || !fr.d) continue;
        boxes++;
        const r = fr.d.plan.r;
        place[pl ?? "none"] = (place[pl ?? "none"] ?? 0) + 1;
        if (face === "3") { small++; smallBy[pl ?? "none"] = (smallBy[pl ?? "none"] ?? 0) + 1; }
        // a box beside the column, in the band or in the corner is out of the panel by x or y (the rows are all inside the panel): it is held to the hard rects and the panel's rect below; the others to the rule rows
        const side = pl === "beside" || pl === "band" || pl === "corner";
        const bads = side ? [] : covered(box, rowsOf(fr.d.plan));
        if (bads.length) { (pl === "fallback" ? fallbacks : bad).push(`${p.id} | ${wd}: box y ${box.y}-${box.y + box.h} covers ${bads.map((q) => `${q.role}@${q.y}`).join(", ")} (place ${pl})`); mixed++; }
        if (pl === "fallback" && !smallFaceHolds(drawn.map((l) => l.map((s) => s.t).join("")).join(" "))) noGlyph++;
        // the box is as tall as its lines in its face, and no word of a line is wider than the box (no broken or clipped word)
        if (box.h !== drawn.length * (face === "3" ? 7 : 9) + 3 && pl !== "fallback") crossed.push(`${p.id} | ${wd}: the ${pl} note's ${drawn.length} lines in ${face} are not its box's height ${box.h}`);
        if (pl !== "fallback") { const wide = drawn.filter((l) => lineWidth(l, face) > box.w - 6); if (wide.length) crossed.push(`${p.id} | ${wd}: the ${pl} note has a line wider than its box (${wide.map(lineText).join(" / ")})`); }
        // the small-face pass changes the face, never a word: the same words in the same order as the 5x7 wrap of the note's text
        if (face === "3" && ks.text) { again++; if (tokens(drawn) !== tokens(definitionLinesOf(ks.text))) crossed.push(`${p.id} | ${wd}: the 3x5 note's words differ from its text`); }
        if (side) {
          tallest = Math.max(tallest, box.h);
          widest = Math.max(widest, box.w);
          // item 3's hard line, and the 2 px gaps: never over the carrier's drawing, a shop card, REROLL, a pack, the top bar, FIGHT, the foe card, the cargo bar or the panel; whole on the screen
          for (const [what, rr] of Object.entries(hard)) if (ov(box, rr)) crossed.push(`${p.id} | ${wd}: the ${pl} box ${JSON.stringify(box)} covers ${what} ${JSON.stringify(rr)}`);
          if (ov(box, r)) crossed.push(`${p.id} | ${wd}: the ${pl} box covers the panel`);
          if (box.x < 0 || box.y < 0 || box.x + box.w > f.W || box.y + box.h > f.H - 2) crossed.push(`${p.id} | ${wd}: the ${pl} box ${JSON.stringify(box)} is not whole on the screen`);
        }
        if (pl === "beside") {
          // 2 px right of the column's edge, 2 px left of the carrier's drawing, 2 px above the screen's foot, the top at or below the column's top
          if (box.x !== info.x + info.w + 2) crossed.push(`${p.id} | ${wd}: the beside box starts at x ${box.x}, not 2 px right of the column (${info.x + info.w + 2})`);
          if (box.x + box.w > hard.carrier.x - 2) crossed.push(`${p.id} | ${wd}: the beside box ends at ${box.x + box.w}, past 2 px left of the carrier (${hard.carrier.x - 2})`);
          if (box.y + box.h > f.H - 2) crossed.push(`${p.id} | ${wd}: the beside box ends at ${box.y + box.h}, under the screen's foot less 2 (${f.H - 2})`);
          if (box.y < info.y) crossed.push(`${p.id} | ${wd}: the beside box is above the column's top`);
        }
        if (pl === "band") {
          // left edge 2 px right of the column, under the shop row's foot (+2), over no carrier, short of FIGHT's column (-4)
          if (box.x !== info.x + info.w + 2) crossed.push(`${p.id} | ${wd}: the band box starts at x ${box.x}, not 2 px right of the column (${info.x + info.w + 2})`);
          if (box.y < shopFoot + 2) crossed.push(`${p.id} | ${wd}: the band box starts at y ${box.y}, above the shop row's foot + 2 (${shopFoot + 2})`);
          if (box.y + box.h > hard.carrier.y - 2) crossed.push(`${p.id} | ${wd}: the band box ends at ${box.y + box.h}, past 2 px above the carrier (${hard.carrier.y - 2})`);
          if (box.x + box.w > L.fight.x - 4) crossed.push(`${p.id} | ${wd}: the band box ends at x ${box.x + box.w}, past 4 px left of FIGHT's column (${L.fight.x - 4})`);
        }
        if (pl === "corner") {
          // above the column (2 px clear), left of the shop row (3 px clear), under the rune row (+2), never with the wagon up
          if (wagon) crossed.push(`${p.id} | ${wd}: a corner box with the ENCHANTER's wagon up`);
          if (box.y < L.bar.h + runeRow + 2) crossed.push(`${p.id} | ${wd}: the corner box starts at y ${box.y}, in the rune row (ends ${L.bar.h + runeRow})`);
          if (box.y + box.h > info.y - 2) crossed.push(`${p.id} | ${wd}: the corner box ends at ${box.y + box.h}, closer than 2 px to the column (${info.y})`);
          if (box.x < 3 || box.x + box.w > L.cards[0].x - 3) crossed.push(`${p.id} | ${wd}: the corner box x ${box.x}-${box.x + box.w} is not left of the shop row (${L.cards[0].x}) with 3 px clear`);
        }
        if (pl === "under") {
          for (const [what, rr] of Object.entries(hard)) if (what !== "carrier" && ov(box, rr)) crossed.push(`${p.id} | ${wd}: the under box covers ${what}`);
          if (box.y !== r.y + r.h + 2 || box.x !== r.x + 2 || box.w !== r.w - 4) crossed.push(`${p.id} | ${wd}: the under box ${JSON.stringify(box)} is not the panel's foot + 2 px at the column's width`);
          if (box.y + box.h > info.y + info.h) crossed.push(`${p.id} | ${wd}: the under box ends below the column`);
        }
        // the place is chosen once for the note's life, from its first frame: another frame of the same note is the same box (every 41st note)
        if (boxes % 41 === 0) { st.word = glossaryEntry(wd)?.word ?? wd; expect(boxOf(pc.draw().ui), `${p.id} | ${wd}: the same box on another frame`).toEqual(box); st.word = null; }
      }
      keywordsIdle(pc.ctx);
    }
    const row = [boxes, mixed, place.today, place.under, place.beside, place.band, place.corner, place.fallback, small, widest, tallest]; // PRESENT-3 D: the widest side box (was the last one's width)
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 P / PRESENT-3 D T ${name}: ${panels} panels, ${boxes} boxes; ${mixed} cover a rule row (${bad.length} of them not listed fallbacks); by place: today ${place.today}, under ${place.under}, beside ${place.beside}, band ${place.band}, corner ${place.corner}, fallback ${place.fallback} (${noGlyph} hold a character the 3x5 face lacks); by face: 5x7 ${boxes - small}, 3x5 ${small} (${JSON.stringify(smallBy)}); the side boxes are up to ${widest} px wide, ${tallest} px at their tallest; ${crossed.length} cross a hard line or a gap`
      + `${fallbacks.length ? "\nFALLBACKS:\n" + fallbacks.slice(0, 40).join("\n") : ""}${bad.length ? "\nCOVERING:\n" + bad.slice(0, 20).join("\n") : ""}${crossed.length ? "\nCROSSED:\n" + crossed.slice(0, 20).join("\n") : ""}`);
    expect(boxes).toBeGreaterThan(1500);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
    expect(crossed, crossed.slice(0, 5).join("\n")).toEqual([]);
    expect(fallbacks.length, `the fallbacks, by name: ${fallbacks.slice(0, 10).join("; ")}`).toBe(place.fallback);
    expect(again, "every 3x5 note kept its words").toBe(small);
    if (PINS[name] && PINS[name].length) expect(row, `${name}: [boxes, covering, today, under, beside, band, corner, fallback, in 3x5, side width, tallest side box]`).toEqual(PINS[name]);
  }, BIG);


  // PRESENT-3 D (cap's ruling 6420b5479c7c7b92 (1)b): everything that can draw in the band or the corner in some state is out of them, or closes the place. The ENCHANTER's wagon: its cards sit in the margin
  // left of the shop block (the corner: closed with the wagon up) or at the top of the details column (x 6-134, under the band's left edge); the band is never touched by them. A toast: the build screen puts it at
  // the hull's foot less 13 (build.ts toastY), centred, never higher than that. The first-run how-to strip and CARD-4's first-sight notes: the landscape column has no strip (inspector.ts detailsPlan: the hint is
  // the portrait band's), and its first-sight notes are placed by this same ladder (the F tests below). The desk's hover tips are drawn after the note and keep their place and order.
  for (const [name, w, h, dpr, runes] of VIEWS.filter((v) => !v[6] && (v[0].startsWith("desk") || v[0].startsWith("laptop")))) it(`on ${name}: the wagon's cards and a toast cannot be in the band or the corner`, () => {
    const f = framed(w, h, dpr, runes), L = f.L, info = L.info, hard = hardOf(L);
    const shopFoot = Math.max(...[...L.cards, L.reroll, ...L.packs].filter((q) => q.y < info.y).map((q) => q.y + q.h)), runeRow = L.cards[0].y - (L.bar.h + 9);
    const band: Rect = { x: info.x + info.w + 2, y: shopFoot + 2, w: L.fight.x - 4 - (info.x + info.w + 2), h: hard.carrier.y - 2 - (shopFoot + 2) };
    const corner: Rect = { x: 3, y: L.bar.h + runeRow + 2, w: L.cards[0].x - 6, h: info.y - 2 - (L.bar.h + runeRow + 2) };
    for (const n of [1, 2, 3]) {
      const wag = wagonPlace(L, n, 0);
      if (!wag) continue;
      for (const q of [...wag.rects, ...wag.hits]) expect(ov(q, band), `${name}: wagon (${n} cards) card ${JSON.stringify(q)} is out of the band`).toBe(false);
      if (wag.tag) expect(ov({ x: wag.tag.x, y: wag.tag.y, w: 60, h: 8 }, band), `${name}: wagon tag out of the band`).toBe(false);
    }
    const toastTop = L.hull.y + L.hull.h - 13; // BuildScreen.toastY (landscape): a toast is never higher
    expect(toastTop, `${name}: a toast is under the band`).toBeGreaterThan(band.y + band.h);
    expect(toastTop, `${name}: a toast is under the corner`).toBeGreaterThan(corner.y + corner.h);
    expect(band.h, `${name}: the band is a place`).toBeGreaterThanOrEqual(name.startsWith("desk-1920") ? 0 : 21);
  });

  // first sights on the finger's landscape view: every tip done, every note new: the first note opens on the panel's first frame and is placed once, from that frame
  for (const [name, w, h, dpr, runes, touch] of VIEWS.filter((v) => v[5])) it(`F on ${name}: the first sight opens already placed (no row covered), and keeps its place until it closes`, () => {
    const f = framed(w, h, dpr, runes), L = f.L, hard = hardOf(L), info = L.info;
    let panels = 0, notes = 0;
    const bad: string[] = [], where = { today: 0, under: 0, beside: 0, band: 0, corner: 0, fallback: 0 } as Record<string, number>;
    for (const p of allPanels()) {
      setTipsForTests("sight");
      const pc = panelCtx(p.run, p.sel, f, touch);
      let prev = pc.draw();
      if (!prev.d) continue;
      panels++;
      for (let n = 0; n < 16; n++) {
        const box = boxOf(prev.ui);
        if (!box) break;
        notes++;
        const pl = (keywordState(pc.ctx) as { place: string | null }).place ?? "none";
        where[pl] = (where[pl] ?? 0) + 1;
        const sidePl = pl === "beside" || pl === "band" || pl === "corner";
        if (pl !== "fallback" && !sidePl && covered(box, rowsOf(prev.d!.plan)).length) bad.push(`${p.id}: note ${n + 1} covers a rule row (place ${pl})`);
        if (sidePl && ov(box, prev.d!.plan.r)) bad.push(`${p.id}: note ${n + 1} ${pl} box covers the panel`);
        if (sidePl) for (const [what, rr] of Object.entries(hard)) if (ov(box, rr)) bad.push(`${p.id}: note ${n + 1} ${pl} box covers ${what}`);
        if (pl === "beside" && box.x !== info.x + info.w + 2) bad.push(`${p.id}: note ${n + 1} beside box at x ${box.x}`);
        // the place is chosen once for the note's life: another frame of the same note is the same box
        const again = pc.draw();
        if (JSON.stringify(boxOf(again.ui)) !== JSON.stringify(box)) bad.push(`${p.id}: note ${n + 1} moved between two frames`);
        keywordsPressed(pc.ctx, null);
        prev = pc.draw();
      }
      keywordsIdle(pc.ctx);
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-2 P F ${name}: ${panels} panels, ${notes} first-sight notes; by place: today ${where.today}, under ${where.under}, beside ${where.beside}, band ${where.band}, corner ${where.corner}, fallback ${where.fallback}; ${bad.length} faults${bad.length ? "\n" + bad.slice(0, 20).join("\n") : ""}`);
    expect(notes).toBeGreaterThan(300);
    expect(bad, bad.slice(0, 5).join("\n")).toEqual([]);
  }, BIG);

  for (const [name, w, h, dpr, runes, touch] of VIEWS.slice(0, 2)) it(`U on ${name}: with no note shown, the column is as it was (panelArea is the layout's column, every panel)`, () => {
    setTipsForTests("done");
    const f = framed(w, h, dpr, runes);
    let n = 0;
    for (const p of allPanels()) {
      const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run: p.run, touch, L: f.L } as unknown as Ctx;
      const area = panelArea(f.L, p.sel, { touch, hover: false, busy: false }, panelFit(ctx, p.sel, !!f.L.phone));
      expect(area, p.id).toEqual(f.L.info);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
  }, BIG);
});
