// POLISH-2 R1 (RULING-POLISH2-R1 (d)): the corpus and the planning harness of tests/polish2.guest.test.ts. Not a test file (no .test suffix); it is also what the scratch probe at polish2r-base
// (run 1's rule) runs to count the defect (kit/zz-p2guestprobe.test.ts.txt), so it uses only what both trees have: routePanel, planPanel, panelArea, panelFit, detailsPlan.
//
// THE CORPUS: belts a player can build (the Furnace bench: the Kiln at (4,6) on a straight 6-tile belt into the scrap cannon, tests/arsenal.bench.ts) with a rig on each tile worked:
//   - run 1's 23 belts (tests/polish2.hint.test.ts's fit list: each of the ten readers alone and with RISING, WHETSTONE+RISING, a factory with ECHOING, a turret with MASSIVE: one hit each);
//   - belt-multi's deck (the review's defect: a ★3 FIERY IRON WALL, a ★2 CROWD PRESS holding RISING, an ECHOING KILN, a MASSIVE turret: two hits);
//   - multi-hit belts: 2, 3, 4, 5 and 6 hits, readers and WHETSTONE, the counted words (FIERY, GROWING) and the uncounted ones (RISING, ECHOING) on the rigs, ECHOING / SWIFT / FIERY / GROWING
//     on the factory, MASSIVE / RISING / FIERY on the turret (every one a legal word on its kind).
// THE HARNESS: a view is framed as the game frames it (tests/present1.s4b.test.ts's framed); a belt's panel is planned in the band (no press) and, on a phone, after a finger's press (the area
// panelArea gives it, with the real panelFit), with the line (the game's own plan: detailsPlan) and without it (the same text without its `hold` block, planned in the same area with the options
// detailsPlanOf passes).
import { newRun, type Run } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { setTurretList, type Build } from "../src/sim/deck";
import { ENCHANT_DEFS, freeSides, type EnchantId } from "../src/sim/enchant";
import { textWidth } from "../src/render/font";
import { lineText } from "../src/ui/richText";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { TAP_CSS, tapPx } from "../src/ui/tap";
import { UI, type Rect } from "../src/ui/ui";
import type { Ctx } from "../src/screens/build/actions";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { detailsPlan, fullText, gapsAtLeast, panelFit, planPanel, visibleLines, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { bench, benchRigsCheck, factoryBench } from "./arsenal.bench";

export const READERS = ["quench", "shieldwall", "keg", "cindermail", "rotgauge", "leechcoil", "crowdpress", "aegisspike", "grudgerod", "trophychain"];

export interface CorpusBelt {
  label: string;
  run: Run;
  /** The hits on the belt (the rigs worked). */
  hits: number;
  /** Which part of the corpus: run1 (the 23), multi (belt-multi's deck), many (the multi-hit belts). */
  part: "run1" | "multi" | "many";
}

export const runOf = (b: Build, day = 6): Run => {
  const run = newRun("furnace", 5, "polish2-guest");
  run.day = day;
  run.build = b;
  return run;
};
export type Gate = [string, number, number, number];
/** A belt with rigs [def, x, y, stars] (the tile each works) and words on them. */
export function rigsRun(gates: Gate[], words: (EnchantId | undefined)[], kiln?: EnchantId, turret?: EnchantId, day = 6): Run {
  const b = bench(gates);
  benchRigsCheck(b, gates);
  gates.forEach(([id], i) => {
    const ench = words[i];
    if (ench) Object.assign(b.items.find((p) => p.uid === 10 + i)!, { ench, ...(ench === "wide" ? { enchDir: freeSides(ITEMS[id])[0] } : {}) });
  });
  if (kiln) Object.assign(b.items.find((p) => p.def === "kiln")!, { ench: kiln });
  if (turret) setTurretList(b, [{ slot: 0, def: "scrapcannon", uid: 90, ench: turret }]);
  return runOf(b, day);
}

/** Run 1's 23 belts (tests/polish2.hint.test.ts's fit list). */
export function run1Belts(): CorpusBelt[] {
  const out: CorpusBelt[] = [];
  for (const id of READERS) {
    out.push({ label: id, run: rigsRun([[id, 4, 4, 3]], [undefined]), hits: 1, part: "run1" });
    out.push({ label: `${id}+rising`, run: rigsRun([[id, 4, 4, 3]], ["rising"]), hits: 1, part: "run1" });
  }
  out.push({ label: "whetstone+rising", run: rigsRun([["whetstone", 4, 4, 1]], ["rising"]), hits: 1, part: "run1" });
  const f = factoryBench("press", 2, { only: true });
  Object.assign(f.items.find((p) => p.def === "press")!, { ench: "echoing" });
  out.push({ label: "factory echoing", run: runOf(f), hits: 0, part: "run1" });
  out.push({ label: "turret massive", run: rigsRun([], [], undefined, "massive"), hits: 0, part: "run1" });
  return out;
}

/** belt-multi's deck (img/before/belt-multi-*.png): IRON WALL ★3 on tile 3 and CROWD PRESS ★2 holding RISING on tile 5, an ECHOING KILN (the scene's FIERY on the wall is on it too). */
export function beltMulti(massive = false): CorpusBelt {
  return { label: massive ? "belt-multi+massive" : "belt-multi", run: rigsRun([["shieldwall", 4, 3, 3], ["crowdpress", 4, 1, 2]], ["fiery", "rising"], "echoing", massive ? "massive" : undefined), hits: 2, part: "multi" };
}

const RIGS = ["shieldwall", "crowdpress", "whetstone", "keg", "quench", "cindermail", "rotgauge", "leechcoil", "aegisspike", "grudgerod", "trophychain"];
const RIG_WORDS: (EnchantId | undefined)[] = [undefined, "fiery", "growing", "rising", "echoing"];
const KILN_WORDS: (EnchantId | undefined)[] = [undefined, "echoing", "fiery", "swift", "growing", "rising"];
const TURRET_WORDS: (EnchantId | undefined)[] = [undefined, "massive", "rising", "fiery", "growing"];

/** Multi-hit belts: n hits (2-6) x 10 variants each: the rigs, stars, words on the rigs, the kiln and the turret all rotate. */
export function manyBelts(): CorpusBelt[] {
  const out: CorpusBelt[] = [];
  for (const n of [2, 3, 4, 5, 6]) {
    for (let v = 0; v < 10; v++) {
      const tiles = [5, 4, 3, 2, 1, 0].slice(0, n), gates: Gate[] = [], words: (EnchantId | undefined)[] = [];
      for (let i = 0; i < n; i++) {
        const id = RIGS[(v * 3 + i * 2 + n) % RIGS.length];
        gates.push([id, 4, tiles[i], 1 + ((v + i) % 3)]);
        words.push(RIG_WORDS[(v + 2 * i + n) % RIG_WORDS.length]);
      }
      const kiln = KILN_WORDS[(v + n) % KILN_WORDS.length], turret = TURRET_WORDS[(v * 2 + n) % TURRET_WORDS.length];
      let run: Run;
      try {
        run = rigsRun(gates, words, kiln, turret);
      } catch {
        continue; // a deck the bench cannot stand (a rig that does not land its one arrow): not a belt of the corpus
      }
      out.push({ label: `${n} hits #${v}: ${gates.map(([id, , , s], i) => `${id}${s}${words[i] ? `+${words[i]}` : ""}`).join(",")}${kiln ? ` kiln+${kiln}` : ""}${turret ? ` turret+${turret}` : ""}`, run, hits: n, part: "many" });
    }
  }
  return out;
}

export const corpus = (): CorpusBelt[] => [...run1Belts(), beltMulti(), beltMulti(true), ...manyBelts()];

// ---------------------------------------------------------------------------------------------------------- the views

export interface ViewSpec {
  name: string;
  w: number;
  h: number;
  dpr: number;
  /** Runes held (tests/present1.s4b.test.ts's views): the rune row takes room from the band. */
  runes: number;
  /** A main view of the brief's list (the desk column and the two phone bands the belt-panel tests pin). */
  main: boolean;
}
export const VIEWS: ViewSpec[] = [
  { name: "desk 1280x800", w: 1280, h: 800, dpr: 1, runes: 0, main: true },
  { name: "op690 402x690 @3", w: 402, h: 690, dpr: 3, runes: 0, main: true },
  { name: "small 360x640 @2", w: 360, h: 640, dpr: 2, runes: 0, main: true },
  { name: "phone 390x844 @3", w: 390, h: 844, dpr: 3, runes: 0, main: false },
  { name: "desk 1920x1080", w: 1920, h: 1080, dpr: 1, runes: 0, main: false },
  { name: "land 844x390 @3", w: 844, h: 390, dpr: 3, runes: 0, main: false },
  { name: "op690 402x690 @3, a rune", w: 402, h: 690, dpr: 3, runes: 1, main: false },
];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/present1.s4b.test.ts's framed). */
export function framed(w: number, h: number, dpr: number, runes = 0, offers = 5) {
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
export type Framed = ReturnType<typeof framed>;

const ROUTE0: Sel = { kind: "route", index: 0 };

/** One belt panel planned on one view in one state: the game's plan with the line, and the plan of the same text without it in the same area. */
export interface Case {
  view: string;
  state: "band" | "press";
  /** The panel's text as the game draws it (with its `hold` block and its ⓘ notes). */
  t: PanelText;
  area: Rect;
  withLine: PanelPlan;
  without: PanelPlan;
  /** The area the same belt's panel would have grown to without the line (press only; = area). */
  areaWithout: Rect;
}

/** detailsPlanOf's options for a panel `t` planned in `area` (inspector.ts: tap, band, inBand and the grown panel's `small`). */
export function optsFor(f: Framed, tap: number, t: PanelText, area: Rect): { tap: number; band: boolean; gaps: boolean; inBand: boolean; small: boolean } {
  const I = f.L.info, onPhone = !!f.L.phone && tap > 0 && !!I;
  const inBand = onPhone && area.x === I.x && area.y === I.y && area.w === I.w && area.h === I.h;
  const grownUp = onPhone && !inBand && area.x === I.x && area.w === I.w && area.y + area.h === I.y + I.h && area.h > I.h;
  let small = false;
  if (grownUp) {
    const bp = planPanel(t, I, [], { tap, band: !!f.L.portrait, gaps: true, inBand: true });
    small = bp.body.font === "3" && fullText(bp) && gapsAtLeast(bp, bp.gaps.min);
  }
  return { tap, band: !!f.L.portrait, gaps: true, inBand, small };
}

export const noLine = (t: PanelText): PanelText => ({ ...t, body: t.body.filter((b) => !b.hold), ...(t.variants ? { variants: t.variants.map((v) => ({ ...v, body: v.body.filter((b) => !b.hold) })) } : {}) });

/** The cases of one belt on one view: the band (no press) and, on a phone, after a finger's press. */
export function casesOf(belt: CorpusBelt, spec: ViewSpec, f: Framed): Case[] {
  const out: Case[] = [];
  for (const touch of f.phone ? [false, true] : [false]) {
    const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run: belt.run, touch, L: f.L } as unknown as Ctx;
    const tap = touch ? tapPx(f.view) : 0;
    const area = touch ? panelArea(f.L, ROUTE0, { touch: true, hover: false, busy: false }, panelFit(ctx, ROUTE0, !!f.L.phone)) : f.L.info;
    const d = detailsPlan(ctx, ROUTE0, null, area);
    if (!d) throw new Error(`${belt.label}: no belt panel`);
    const t0 = noLine(d.t);
    const without = planPanel(t0, area, [], optsFor(f, tap, t0, area));
    let areaWithout = area;
    if (touch) {
      const phone = !!f.L.phone;
      const fit0 = (r: Rect, at: "band" | "grown"): boolean => {
        const p = planPanel(t0, r, [], optsFor(f, tap, t0, r));
        return phone ? fullText(p) && gapsAtLeast(p, at === "band" ? p.gaps.min : p.gaps.G) : false;
      };
      areaWithout = panelArea(f.L, ROUTE0, { touch: true, hover: false, busy: false }, fit0);
    }
    out.push({ view: spec.name, state: touch ? "press" : "band", t: d.t, area, withLine: d.plan, without, areaWithout });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------- the judgement

/** The drawn lines of a plan as keys with their place (visibleLines): the line's block's role and text, its face, its words and where it is drawn. */
export const drawnOf = (p: PanelPlan): string[] => visibleLines(p).map((v) => (v.line === "rule" ? `rule@${v.y}` : `${v.y}|${v.line.font}|${v.line.block.role}|${v.line.block.text}|${lineText(v.line.spans)}|${v.line.cells ? v.line.cells.map((c) => `${c.label}${lineText(c.spans)}`).join(",") : ""}`));
/** The faces a plan draws its blocks in, block by block (the guest line aside): `role|text` -> the faces of its lines. */
export const facesOf = (p: PanelPlan): string[] => p.body.shown.filter((l) => !l.b.hold).map((l) => `${l.b.role}|${l.b.text}|${l.lines.map((q) => q.font).join("")}`);
/** A plan as one string: its rect, header, buttons, body face and the lines it draws and where. */
export const planKey = (p: PanelPlan): string => JSON.stringify([p.r, p.column, p.shift, p.subs, p.famHead, p.rects, p.body.font, p.body.variant, p.body.tight, p.body.sub, !!p.headerOnly, p.body.fits, p.gaps.px, p.gaps.slots, p.body.dropped.map((b) => b.text), drawnOf(p)]);

export interface Verdict {
  /** (1) every block but the line has the same face with and without it. */
  faceSame: boolean;
  /** (2) every line drawn without the line is drawn with it (the same words, the same place). */
  rowsSame: boolean;
  /** The line is in the panel: drawn, whole. */
  inPanel: boolean;
  /** (3) where it is not, the panel's plan equals the plan without it. */
  equalWithout: boolean;
  /** (4) where it is: one line, the 3x5 face, within its room. */
  lineOk: boolean;
}

export function judge(c: Pick<Case, "withLine" | "without">): Verdict {
  const w = c.withLine, o = c.without;
  const guest = visibleLines(w).filter((v) => v.line !== "rule" && v.line.block.hold);
  const inPanel = guest.length > 0;
  const faceSame = w.body.font === o.body.font && JSON.stringify(facesOf(w)) === JSON.stringify(facesOf(o));
  const with_ = new Set(drawnOf(w));
  const rowsSame = drawnOf(o).every((k) => with_.has(k));
  const room = w.r.w - 10;
  let lineOk = true;
  if (inPanel) {
    const ln = guest[0].line;
    lineOk = guest.length === 1 && ln !== "rule" && ln.font === "3" && !ln.cells && lineText(ln.spans).startsWith("NOT COUNTED:") && textWidth(lineText(ln.spans), "3") <= room
      && visibleLines(w).every((v) => v.line === "rule" || v.y + (v.line.font === "5" ? 7 : 5) <= w.maxY);
  }
  return { faceSame, rowsSame, inPanel, equalWithout: inPanel || planKey(w) === planKey(o), lineOk };
}
