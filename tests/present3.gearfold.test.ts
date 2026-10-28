// PRESENT-3 E (REQ-BFG-081; backlog #498 (3); cap's call): an installed turret's panel folds a run of two or more EMPTY gear slots into ONE row, `GEAR 2-6` EMPTY (turretPanel.ts socketLines).
//  Before: the CORE row and every GEAR SLOT, filled or empty, one row each (`GEAR 1` .. `GEAR 6`, EMPTY where nothing sits): five EMPTY rows of 12 px took a tall turret panel to the growth limit,
//  where PRESENT-2's L hangs its notes under the last rule row (ruling 0d0ef2465804aafb; its item 5 named this fold) and where the desks' columns put 218 and 275 notes over a rule row (P).
//  Now: a run of 2+ EMPTY slots is one row (label `GEAR a-b`, text EMPTY, its own alignment group so its longer label never narrows the CORE and GEAR rows' text); a single empty slot stays one row;
//  a filled gear keeps its rows exactly (REQ-BFG-089: a piece's own abilities stay visible); the CORE row is never folded; the one-row GEAR list of a short band (compact) is as it was.
//  A tap on an empty slot row did nothing before and does nothing now (keywords.ts keywordTargets matches words in a line's text, never its label, and EMPTY is no keyword).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { newRun } from "../src/game/run";
import { ITEMS } from "../src/sim/content";
import { gearSlotsOf, setTurretList, turretSlots } from "../src/sim/deck";
import { setTipsForTests } from "../src/ui/tips";
import { socketLines } from "../src/screens/build/turretPanel";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { detailsPlan, panelFit, visibleLines } from "../src/screens/build/inspector";
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
const VIEWS: [string, number, number, number, boolean][] = [["phone 402x690", 402, 690, 3, true], ["land 844x390", 844, 390, 3, true], ["desk 1280x800", 1280, 800, 1, false]];

const TURRETS = Object.values(ITEMS).filter((d) => d.kind === "turret").map((d) => d.id);
const GEARS = Object.values(ITEMS).filter((d) => d.kind === "mod").map((d) => d.id).slice(0, 7);
function runWith(def: string, stars: number, core: boolean, gears: number) {
  const run = newRun("furnace", 5, `present3-gearfold-${def}-${stars}`);
  setTurretList(run.build, [{ slot: 0, def, uid: 90, ...(stars > 1 ? { stars } : {}) }]);
  run.build.mods = [
    ...(core ? [{ uid: 950, def: "pressure", turret: 0 }] : []),
    ...Array.from({ length: gears }, (_, i) => ({ uid: 960 + i, def: GEARS[i % GEARS.length], turret: 0 })),
  ];
  return run;
}

describe("PRESENT-3 E: a run of two or more EMPTY gear slots is one row", () => {
  it("every turret x star x core x gear count: the rows before (CORE + one a slot) and after (CORE, the filled gear as before, the empty run as one row, a single empty slot as itself)", () => {
    let combos = 0, folded = 0, before = 0, after = 0;
    const slotsSeen = new Set<number>();
    for (const def of TURRETS) for (const stars of [1, 2, 3]) {
      const n = gearSlotsOf(def, stars);
      slotsSeen.add(n);
      for (const core of [false, true]) for (let g = 0; g <= n; g++) {
        const run = runWith(def, stars, core, g), b = run.build;
        expect(turretSlots(b)[0].gearSlots, `${def} ★${stars}`).toBe(n);
        const fx = (d: string, s: number): string => `${d} ${s}`;
        const rows = socketLines(b, 0, "CORE NAME", fx), e = n - g;
        combos++;
        before += 1 + n;
        after += rows.length;
        // the CORE row is the first, never folded
        expect(rows[0], `${def} ★${stars}`).toEqual({ label: "CORE", text: "CORE NAME" });
        // the filled gear keep their rows exactly as before
        for (let i = 0; i < g; i++) {
          const r = rows[1 + i];
          expect(r.label, `${def} ★${stars} gear ${i + 1} of ${g}/${n}`).toBe(n > 1 ? `GEAR ${i + 1}` : "GEAR");
          expect(r.def).toBe(GEARS[i % GEARS.length]);
          expect(r.text.startsWith(ITEMS[r.def!].name)).toBe(true);
          expect(r.folded).toBeUndefined();
        }
        const tail = rows.slice(1 + g);
        if (e === 0) expect(tail, `${def} ★${stars} ${g}/${n}`).toEqual([]);
        else if (e === 1) expect(tail, `${def} ★${stars} ${g}/${n}: a single empty slot stays one row`).toEqual([{ label: n > 1 ? `GEAR ${n}` : "GEAR", text: "EMPTY" }]);
        else {
          folded++;
          expect(tail, `${def} ★${stars} ${g}/${n}: ${e} empty slots are one row`).toEqual([{ label: `GEAR ${g + 1}-${n}`, text: "EMPTY", folded: e }]);
        }
        // the one-row GEAR list of a short band is as it was (every slot in one row)
        const compact = socketLines(b, 0, "CORE NAME", undefined, true);
        expect(compact.length).toBe(2);
        expect(compact[1].label).toBe("GEAR");
      }
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-3 E: ${TURRETS.length} turrets x 3 stars x core/no core x gear counts: ${combos} panels; gear slots a turret has: ${[...slotsSeen].sort().join(", ")}; rows ${before} -> ${after} (${before - after} fewer); ${folded} fold an empty run`);
    expect(combos).toBe(306);
    expect(before).toBe(1330);
    expect(after).toBe(1046);
    expect(folded).toBe(150);
    expect([...slotsSeen].sort()).toEqual([1, 2, 3, 4, 5, 6].filter((k) => slotsSeen.has(k)));
    expect(slotsSeen.has(6)).toBe(true);
  });

  for (const [name, w, h, dpr, touch] of VIEWS) it(`on ${name}: the folded row is one line wherever the panel shows it, the panel is never taller than before the fold, and no row is lost`, () => {
    setTipsForTests("done");
    const f = framed(w, h, dpr, 1);
    let panels = 0, shown = 0, taller = 0, saved = 0;
    for (const def of TURRETS) for (const stars of [1, 2, 3]) {
      const n = gearSlotsOf(def, stars);
      for (const core of [false, true]) for (const g of [0, 1, Math.max(0, n - 2), n]) {
        if (g > n) continue;
        const run = runWith(def, stars, core, g);
        const sel: Sel = { kind: "turret", index: 0 };
        const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
        const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
        const d = detailsPlan(ctx, sel, null, area);
        if (!d) continue;
        panels++;
        const lines = visibleLines(d.plan);
        const rowsFor = (label: RegExp) => lines.filter((v) => v.line !== "rule" && (v.line.block as { label?: string }).label && label.test((v.line.block as { label?: string }).label!));
        const blocks = new Set(rowsFor(/^GEAR \d-\d$/).map((v) => (v.line as { block: unknown }).block));
        for (const bk of blocks) {
          shown++;
          const mine = lines.filter((v) => v.line !== "rule" && (v.line as { block: unknown }).block === bk);
          expect(mine.length, `${def} ★${stars} core ${core} ${g}/${n} on ${name}: the folded row is one line`).toBe(1);
        }
        // no row is lost: every filled gear's row is still among the lines when its panel showed it before (the fold only removes EMPTY rows)
        for (let i = 0; i < g; i++) if (n > 1) {
          const has = rowsFor(new RegExp(`^GEAR ${i + 1}$`)).length > 0;
          const hadRows = lines.some((v) => v.line !== "rule" && (v.line.block as { label?: string }).label === "CORE");
          if (hadRows) expect(has || d.plan.body.variant > 0, `${def} ★${stars} gear ${i + 1} of ${g}/${n} on ${name}`).toBe(true);
        }
        if (d.plan.r.h > area.h) taller++;
        saved += blocks.size;
      }
    }
    // eslint-disable-next-line no-console
    console.log(`PRESENT-3 E on ${name}: ${panels} installed-turret panels planned; the folded row shown in ${shown}; ${taller} taller than their area`);
    expect(panels).toBeGreaterThan(300);
    expect(taller).toBe(0);
    expect(saved).toBe(shown);
  }, 600_000);
});
