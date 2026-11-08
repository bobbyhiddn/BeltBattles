// POLISH-3b (REQ-BFG-089, REQ-BFG-087): the corpus the tests/polish3b.*.test.ts files share (not a test file).
//   A = POLISH-3's corpus: every rival build (rivals x days 5/8/12/16 x the warlord deck and the dusk stand-in x every part: 2,242 faces, 280 turrets), read as the player's OWN faces (faceText without an owner:
//       no `subOwner`) or, with `foe`, as the FOE's (the owner given).
//   B = every shop piece that takes an enchant word (rig, factory, turret) x every star it has x plain and every word it takes, placed or installed on the player's own build, day 8: 1,809 faces, 312 turrets.
//   The six views of POLISH-3's measurement: the face column is 100 px at 1920x1080 (subMax 73), 136/136/135 px at 1366x768, 1280x800 and 844x390, a band at 402x690 and 360x640.
import { battleLayout, battleScale, laneLayout, battleGrid } from "../src/game/battleLayout";
import { viewWithSub } from "../src/game/viewGrid";
import { faceArea, faceRun, faceText, type PartSel } from "../src/screens/battleScout";
import { planPanel, rulesWhole, selFamilies, visibleLines, type Block, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { newRun } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { setTurretList, turretSlots, type Build } from "../src/sim/deck";
import { ENCHANT_DEFS, ENCHANT_IDS, enchantKindOf, freeSides, withEnchant, type EnchantId } from "../src/sim/enchant";
import { fusible } from "../src/sim/stars";
import { RIVAL_IDS, RIVALS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { tapPx } from "../src/ui/tap";
import { textWidth } from "../src/render/font";
import type { Rect } from "../src/ui/ui";

export const VIEWS = {
  "desk-1920x1080": [1920, 1080, 1], "laptop-1366x768": [1366, 768, 1], "desk-1280x800": [1280, 800, 1], "land-844x390": [844, 390, 3], "op-402x690": [402, 690, 3], "phone-360x640": [360, 640, 3],
} as const;
export type ViewName = keyof typeof VIEWS;
export const VIEW_NAMES = Object.keys(VIEWS) as ViewName[];
export const LINE = "THIS FIGHT: 7422 DAMAGE IN 8 SHOTS.";
export const DAYS = [5, 8, 12, 16];
type Maker = "rivalBuild" | "standInBuild";
const MAKERS: Record<Maker, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };
const pickSub = (pw: number, ph: number, p: boolean, scale: number): number => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };

export interface Face { tag: string; corpus: "A" | "B"; kind: PartSel["kind"]; sel: PartSel; t: PanelText; fam: ReturnType<typeof selFamilies> }

/** The parts of a build, as POLISH-3's corpus lists them: the placed items, the installed turrets, the belts. */
export function parts(b: Build): PartSel[] {
  const out: PartSel[] = b.items.map((p) => ({ kind: "item", uid: p.uid }) as PartSel);
  turretSlots(b).forEach((s, i) => { if (s.td) out.push({ kind: "turret", index: i }); });
  b.routes.forEach((_, i) => out.push({ kind: "route", index: i }));
  return out;
}

/** The player's own build holding one piece of a kind that takes an enchant word (corpus B): a rig or factory placed, a turret installed in slot 0. */
export function ownPiece(def: string, stars: number, word: EnchantId | null): { b: Build; sel: PartSel } | null {
  const d = ITEMS[def], kind = enchantKindOf(d);
  if (!kind) return null;
  const run = newRun("furnace", 5, "polish3b-own"), star = stars > 1 ? { stars } : {};
  const w = word ? { ench: word, ...(word === "wide" && kind === "rig" ? { enchDir: freeSides(d)[0] } : {}), ...(word === "growing" ? { grow: 2 } : {}) } : {};
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [], mods: [], beltCap: 40, hullBonus: 0 } as Build;
  if (kind === "turret") {
    setTurretList(run.build, [{ slot: 0, def, uid: 90, ...star, ...w } as Parameters<typeof setTurretList>[1][number]]);
    return { b: run.build, sel: { kind: "turret", index: 0 } };
  }
  run.build.items.push({ uid: 9, def, x: kind === "rig" ? 3 : 0, y: kind === "rig" ? 3 : 0, ...star, ...w } as Build["items"][number]);
  return { b: run.build, sel: { kind: "item", uid: 9 } };
}

const cache = new Map<string, Face[]>();
/** Every face of corpus A and B: read as the player's own (`foe` false) or as the foe's (the rival's name, or SPARKFANG's on corpus B). */
export function faces(foe: boolean): Face[] {
  const hit = cache.get(foe ? "foe" : "own");
  if (hit) return hit;
  return withEnchant(() => {
    const out: Face[] = [];
    for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) for (const day of DAYS.filter((d) => rivalDays(id, 16).includes(d))) {
      const b = MAKERS[maker](id, day);
      for (const sel of parts(b)) {
        out.push({
          tag: `A ${id} ${maker} d${day} ${sel.kind}${"index" in sel ? sel.index : "uid" in sel ? sel.uid : ""}`, corpus: "A", kind: sel.kind, sel,
          t: faceText(b, sel, LINE, day, foe ? RIVALS[id].name : undefined)!, fam: selFamilies(faceRun(b, day), sel),
        });
      }
    }
    for (const d of Object.values(ITEMS)) {
      const kind = enchantKindOf(d);
      if (!d.price || !kind) continue;
      const words: (EnchantId | null)[] = [null, ...ENCHANT_IDS.filter((w) => ENCHANT_DEFS[w].kinds.includes(kind))];
      for (const stars of fusible(d.id) ? [1, 2, 3] : [1]) for (const w of words) {
        const o = ownPiece(d.id, stars, w);
        const t = o ? faceText(o.b, o.sel, LINE, 8, foe ? "SPARKFANG" : undefined) : null;
        if (o && t) out.push({ tag: `B ${d.id} ${stars} ${w ?? "plain"}`, corpus: "B", kind: o.sel.kind, sel: o.sel, t, fam: selFamilies(faceRun(o.b, 8), o.sel) });
      }
    }
    cache.set(foe ? "foe" : "own", out);
    return out;
  });
}

const viewCache = new Map<string, { fa: { area: Rect; band: boolean }; tp: number }>();
/** A view's face area and finger target for a side's faces (0: yours, 1: the foe's). */
export function viewOf(name: ViewName, side: 0 | 1 = 0): { fa: { area: Rect; band: boolean }; tp: number } {
  const key = `${name}/${side}`;
  const hit = viewCache.get(key);
  if (hit) return hit;
  const [w, h, dpr] = VIEWS[name];
  const v = viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
  const out = { fa: faceArea(laneLayout(battleLayout(v.W, v.H, v.portrait)), side), tp: tapPx(v) };
  viewCache.set(key, out);
  return out;
}

/** The sub rows drawOn hands fitHead: the variant's own, else the planner's rows, else the short form where the whole one is wider than the room, else the sub. */
export const drawnSubs = (t: PanelText, p: PanelPlan): string[] => (p.body.sub ? [p.body.sub] : p.subs.length > 1 ? p.subs : [p.subFit ?? (t.subShort && textWidth(t.sub, "3") > p.subMax ? t.subShort : t.sub)]); // POLISH-5 (P5-3): + the band's subFit
/** Is the title cut with a dot as drawOn draws it: planOnce's two 3x5 rows that do not say the whole title or are wider than the room, else fitTitle's one row (the 5x7 face where it fits, else the 3x5 face, cut where that is wider)? */
export const titleCut = (t: PanelText, p: PanelPlan): boolean => (p.titleRows ? p.titleRows.join(" ") !== t.title || p.titleRows.some((r) => textWidth(r, "3") > p.subMax) : textWidth(t.title) > p.subMax && textWidth(t.title, "3") > p.subMax);

/** facePlan as POLISH-3 left it at polish3-accepted: planPanel's plan, the 3x5 plan where that is the rule text whole and planPanel's is not; no `wrap`, no tie-break. The reference the new rules are measured against. */
export function oldFacePlan(t: PanelText, fa: { area: Rect; band: boolean }, fam: ReturnType<typeof selFamilies>, tp: number): PanelPlan {
  // POLISH-4 (P4-5): `sub1: false`, the plans before the family head's sub1 rung (a battle face never has it: planPanel's `wrap`), so the reference stays polish3-accepted's plan
  const plan = planPanel(t, fa.area, fam, { tap: tp, band: fa.band, sub1: false, fewer: false }); // POLISH-5: `fewer: false` too (P5-2 moves the build screen's belt panel, not polish3-accepted's face plan)
  if (!plan.column || rulesWhole(plan)) return plan;
  const small = planPanel(t, fa.area, fam, { tap: tp, band: fa.band, small: true, sub1: false, fewer: false });
  return rulesWhole(small) ? small : plan;
}

/** The ability blocks of a face's FULL text (variant 0) that a plan does not draw whole: its own list, by block identity in `plan.body.shown` (a compact variant's shorter form is another block, so it counts as given away). */
export function abilityLeft(t: PanelText, plan: PanelPlan): Block[] {
  const drawn = new Set(visibleLines(plan).map((v) => v.line));
  const shown = plan.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln)));
  return t.body.filter((b) => b.role === "ability" && !shown.some((l) => l.b.role === b.role && l.b.text === b.text && l.b.label === b.label));
}

/** POLISH-3's SIX: SPARKFANG's RISING SCRAP CANNON (turret slot 0), days 8, 12 and 16, in the warlord deck and the dusk stand-in. */
export const SIX = ["sparkfang rivalBuild d8 turret0", "sparkfang rivalBuild d12 turret0", "sparkfang rivalBuild d16 turret0", "sparkfang standInBuild d8 turret0", "sparkfang standInBuild d12 turret0", "sparkfang standInBuild d16 turret0"];
export const isSix = (f: Face): boolean => SIX.includes(f.tag.replace(/^A /, ""));

/** The text of a drawn line, the private-use icon glyphs dropped (a stat row's `RATE 50  HOLDS 3  GEAR SLOTS` carries its icons). */
export const plain = (s: string): string => s.replace(/[-]/g, "").replace(/\s+/g, " ").trim();
