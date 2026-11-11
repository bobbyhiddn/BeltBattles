// PRESENT-6 N (REQ-BFG-081, REQ-BFG-004; the release lane's F8): the SWEEP of every first-sight box a new run would open (not a test file: tests/present6.sight.test.ts and the kit's n0sweep.test.ts import it).
// The harness is tests/present3.firstrun.test.ts's (framed, panelCtx, allPanels: the build screen as the game frames it, a panel's context drawn by the game's own drawDetails on the software raster), run for BOTH pointers (a mouse:
// ctx.touch false, the box in the hover tooltip's look, region `kwsight`; a finger: ctx.touch true, the navy definition box, region `kwdef`; the rig sentence is `kwsight` for both) on the five phone views of present3 plus the desks
// 1280x800, 1366x768 and 1920x1080. Every panel is opened with every tip and note new; the first-sight chain is walked (a press closes a note, the next opens: keywordsPressed, as tests/present3.firstrun.test.ts F does).
// What is measured per note (the box as drawn: its region): the TEXT ROWS of its own panel it covers (every drawn line that is not a rule divider: a rule row, a belt's hit row, the readout, the flavour, the hint; as inspector.ts rulesCovered
// the test is on y, the box being over the panel's x-range), the RULE rows among them (rulesCovered), the header and the buttons, the how-to strip, and the hard rects (the deck's cells, FIGHT, the cargo bar, the top bar, a shop card).
import { newRun } from "../src/game/run";
import { installRaster, fresh, G as gOf } from "./raster.helpers";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, phoneBarLift, phoneScreen, panelArea, screenRect, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { DECK } from "../src/render/frame";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import type { Run, DuskFoe } from "../src/game/run";
import { setTipsForTests } from "../src/ui/tips";
import { ITEMS, buyableModules } from "../src/sim/content";
import { fusible } from "../src/sim/stars";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { key as KEY, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { detailsPlan, drawDetails, hintStrip, panelFit, rulesCovered, visibleLines } from "../src/screens/build/inspector";
import { keywordsIdle, keywordsPressed, panelHead } from "../src/screens/build/keywords";
import { showcaseRun } from "../src/tooling";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

export type Pointer = "mouse" | "finger";
export type Kind = "belt" | "rig" | "factory" | "turret" | "core/gear" | "offer" | "cargo" | "other";
export const KINDS: Kind[] = ["belt", "rig", "factory", "turret", "core/gear", "offer", "cargo"];
export interface Panel { id: string; run: Run; sel: Sel }
export interface SweepView { name: string; w: number; h: number; dpr: number; runes: number }

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** The build screen as the game frames it (tests/card2.test.ts's framed, as tests/present3.firstrun.test.ts has it). */
export function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
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

/** The views the sweep runs: present3's five phone views (the ruling's), plus the desks the brief names. */
export const SWEEP_VIEWS: SweepView[] = [
  { name: "op-402x690, no rune", w: 402, h: 690, dpr: 3, runes: 0 }, { name: "op-402x690, a rune", w: 402, h: 690, dpr: 3, runes: 1 }, { name: "phone-390x844", w: 390, h: 844, dpr: 3, runes: 1 },
  { name: "phone-390x660", w: 390, h: 660, dpr: 3, runes: 1 }, { name: "iphone15pm-430x739", w: 430, h: 739, dpr: 3, runes: 1 },
  { name: "desk-1280x800", w: 1280, h: 800, dpr: 1, runes: 1 }, { name: "desk-1366x768", w: 1366, h: 768, dpr: 1, runes: 1 }, { name: "desk-1920x1080", w: 1920, h: 1080, dpr: 1, runes: 1 },
];

/** What a note never covers (cap's ruling 0d0ef2465804aafb): the deck's cells, FIGHT, the cargo bar, the top bar; and, here too, a shop card. */
export const hardRects = (L: BuildLayout): Record<string, Rect> => {
  const out: Record<string, Rect> = { deck: screenRect(L, { x: L.frame.dx, y: L.frame.dy, w: DECK, h: DECK }), FIGHT: L.fight, cargo: L.cargo, bar: L.bar };
  (L.cards ?? []).forEach((c, i) => { out[`card${i}`] = c; }); // the shop's slots in shop order, REROLL's last
  (L.packs ?? []).forEach((c, i) => { out[`pack${i}`] = c; });
  if (L.foe && !L.portrait) out.foe = L.foe; // beside FIGHT on a landscape layout (on a portrait phone the NEXT BATTLE card is the info band's own, gone while a panel is open)
  return out;
};
export const ov = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A build screen's panel context (tests/card3.test.ts's panelCtx), with the area planned for every frame as BuildScreen.panelArea does; `touch` is the pointer (true: a finger). */
export function panelCtx(run: Run, sel: Sel, f: Framed, touch: boolean) {
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const areaNow = (): Rect => panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  /** One frame: the area planned now, the panel drawn in it; its regions, the area and the plan it was drawn from. */
  const draw = () => {
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.pointer.kind = touch ? "touch" : "mouse";
    Object.assign(ui.pointer, { x: -1, y: -1, down: false });
    const area = areaNow();
    ui.begin();
    const cv = fresh(f.W, f.H);
    drawDetails(gOf(cv), ctx, sel, null, area, {} as DuskFoe);
    ui.end();
    return { ui, area, d: detailsPlan(ctx, sel, null, area), cv };
  };
  return { ctx, draw, areaNow };
}

const CARGO: Sel = { kind: "cargo", uid: 900 };
const SHORTB = [KEY(4, 5), KEY(4, 4), KEY(4, 3), KEY(4, 2), KEY(4, 1), KEY(4, 0)];
const rigAt = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
function furnaceRun(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "card4-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open (tests/card3.test.ts's allPanels: explain1's 899), as tests/present3.firstrun.test.ts has it. */
export function allPanels(): Panel[] {
  const out: Panel[] = [];
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
          const run = newRun(hero, 5, "card4-fit");
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
    const run = newRun(hero, 5, "card4-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnaceRun(), sel: { kind: "route", index: 0 } });
  return out;
}

/** The F8 scene's panel (the STAGE's: the `sides` showcase deck at day 5, its SPLITTER (uid 16) out and a SORTING ARM (uid 41) at (1,5) turned east, belt 0: COPIES 1.3) and every belt of the showcase decks (belts with several rigs beside them: the hit rows and the readout). */
export function beltPanels(): Panel[] {
  const out: Panel[] = [];
  const f8 = showcaseRun("sides");
  f8.build.items = f8.build.items.filter((p) => p.uid !== 16);
  f8.build.items.push({ uid: 41, def: "sorting", x: 1, y: 5, rot: 1 });
  out.push({ id: "F8: sides, SPLITTER out, SORTING ARM at (1,5) east, belt 1", run: f8, sel: { kind: "route", index: 0 } });
  for (const name of ["sides", "twobelts", "junction", "joins", "joinsopen"]) {
    const run = showcaseRun(name);
    run.build.routes.forEach((_, i) => out.push({ id: `showcase ${name} belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  return out;
}

/** The panel kind of a selection: belt, rig, factory, turret, core or gear, offer, cargo. */
export function kindOf(p: Panel): Kind {
  const s = p.sel;
  if (s.kind === "route") return "belt";
  if (s.kind === "turret") return "turret";
  if (s.kind === "fitted") return "core/gear";
  if (s.kind === "offer") return "offer";
  if (s.kind === "cargo") return "cargo";
  if (s.kind === "item") {
    const def = p.run.build.items.find((q) => q.uid === (s as { uid: number }).uid)?.def, k = def ? ITEMS[def]?.kind : undefined;
    return k === "gate" ? "rig" : k === "factory" ? "factory" : k === "turret" ? "turret" : k === "core" || k === "mod" ? "core/gear" : "other";
  }
  return "other";
}

/** One first-sight note as the sweep sees it. */
export interface Note {
  view: string;
  pointer: Pointer;
  state: TipState;
  panel: string;
  kind: Kind;
  /** the note's index in its panel's chain (1 = the first) */
  n: number;
  box: Rect;
  /** the panel's rect in that frame (a finger's panel may have grown for it) */
  r: Rect;
  textRows: number;
  ruleRows: number;
  /** covers the panel's header rows or a button's rect */
  head: boolean;
  /** covers the how-to strip drawn under the panel */
  strip: boolean;
  /** the hard rects (the deck's cells, FIGHT, the cargo bar, the top bar, a shop card) it covers: the names */
  hard: string[];
}

/** The region of the note in a frame: a finger's definition box (`kwdef`) or the hover look's / the rig sentence's (`kwsight`). */
export function noteRegion(ui: UI): Rect | null {
  const def = ui.regions.find((q) => q.id === "kwdef"), sight = ui.regions.find((q) => q.id === "kwsight");
  return def ? def.r : sight ? sight.r : null;
}

/** The two states a new run's first sights are swept in: `new` (every tip new: a panel that shows a how-to tip, in the body on the desk or in the strip under a phone's panel, shows no first sight box until its action is done) and
 *  `sight` (every tip done, every first-sight note new: tips.ts setTipsForTests's `sight`, where every panel's first sights show). */
export type TipState = "new" | "sight";
/** Every first sight a new run opens on `panels` at `view` with `pointer`, in turn (the chain, at most 16 a panel), measured. */
export function sweep(view: SweepView, pointer: Pointer, panels: readonly Panel[], state: TipState = "new"): Note[] {
  const f = framed(view.w, view.h, view.dpr, view.runes), hard = hardRects(f.L), out: Note[] = [];
  for (const p of panels) {
    setTipsForTests(state);
    const pc = panelCtx(p.run, p.sel, f, pointer === "finger");
    let prev = pc.draw();
    if (!prev.d) { keywordsIdle(pc.ctx); continue; }
    const kind = kindOf(p);
    for (let n = 1; n <= 16; n++) {
      const box = noteRegion(prev.ui);
      if (!box || !prev.d) break;
      const plan = prev.d.plan, rows = visibleLines(plan), text = rows.filter((v) => v.line !== "rule");
      // the panel's drawn buttons: the regions on the panel that are not the keyword layer's (a button's rect is narrower than the panel)
      const buttons = prev.ui.regions.filter((q) => !q.id.startsWith("kw") && q.r.w < plan.r.w - 8 && ov(q.r, plan.r)).map((q) => q.r);
      const inX = box.x < plan.r.x + plan.r.w && plan.r.x < box.x + box.w;
      const tr = inX ? text.filter((v) => { const h = (v.line as { font: string }).font === "5" ? 7 : 5; return v.y < box.y + box.h && box.y < v.y + h; }).length : 0;
      const head = panelHead(plan, buttons).some((q) => ov(box, q));
      const strip = prev.d.hint ? ov(box, hintStrip(prev.d.hint, plan.r, f.H).r) : false;
      out.push({
        view: view.name, pointer, state, panel: p.id, kind, n, box: { ...box }, r: { ...plan.r }, textRows: tr, ruleRows: inX ? rulesCovered(box, rows).length : 0, head, strip,
        hard: Object.entries(hard).filter(([, q]) => ov(box, q)).map(([k]) => k),
      });
      keywordsPressed(pc.ctx, null);
      prev = pc.draw();
    }
    keywordsIdle(pc.ctx);
  }
  return out;
}

/** The sweep's table: per view, pointer and kind: notes opened; notes that cover at least one text row of their own panel; of those, notes that cover a rule row; notes that cover a hard rect or the header. */
export interface Cell { notes: number; text: number; rule: number; hard: number; head: number; strip: number }
export function tabulate(notes: readonly Note[]): Record<string, Cell> {
  const t: Record<string, Cell> = {};
  for (const n of notes) {
    const c = (t[`${n.view} | ${n.pointer} | ${n.state} | ${n.kind}`] ??= { notes: 0, text: 0, rule: 0, hard: 0, head: 0, strip: 0 });
    c.notes++;
    if (n.textRows) { c.text++; if (n.ruleRows) c.rule++; }
    if (n.hard.length) c.hard++;
    if (n.head) c.head++;
    if (n.strip) c.strip++;
  }
  return t;
}
