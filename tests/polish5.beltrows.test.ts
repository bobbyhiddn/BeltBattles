// POLISH-5 (REQ-BFG-089; P5-2, cap's ruling (A)): THE BUILD SCREEN'S BELT PANEL GIVES FEWER HIT ROWS AWAY.
//   POLISH-3 let a column panel take the 3x5 face only where that keeps every hit row; the real rival belts of 6 to 12 hits still lost rows to `+N MORE HIT TILES` (K/p4-snip-buildbelts.test.ts, 316 belts through planPanel in the build layout's info
//   rect): 18 belts (126 rows) at 1920x1080, 36 (255) at 1366x768, 9 (71) at 844x390, 0 at 1280x800. The panel is planned in the column's whole height (layout.ts L.info), so no room is spare; the room left is the type.
//   Now planRung (inspector.ts) takes, for the build screen's panel (no `wrap`), the plan that gives away FEWEST hit rows: the 5x7 plan, the 3x5 plan, or the 3x5 plan at the tight pitch (LH_TIGHT 6). A panel that gave none away is the plan it
//   was; no row is merged or reworded; a battle face (`wrap`) is untouched. The rows win the room: POLISH-2 R1's NOT COUNTED guest line uses only what is spare, so where the rows took its room its words are the first item of the ⓘ view
//   (cap's ruling: the brief's "no line dropped" is lifted for that line only, as R1's own move into the ⓘ view). `fewer: false` plans as POLISH-4c did: it is what the new plans are compared with here.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { framed, corpus } from "./polish2.guestCorpus";
import { faceRun } from "../src/screens/battleScout";
import { LH_TIGHT, planPanel, routePanel, visibleLines, type PanelPlan, type PanelText } from "../src/screens/build/inspector";
import { withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import type { Build } from "../src/sim/deck";
import { tapPx } from "../src/ui/tap";

installRaster();
type Maker = "rivalBuild" | "standInBuild";
const MAKERS: Record<Maker, (id: RivalId, day: number) => Build> = { rivalBuild, standInBuild };
const DAYS = [5, 8, 12, 16];
/** The three views of the brief and 1280x800: [name, w, h, dpr, belts giving rows away / rows lost at POLISH-4c, the same now].
 *  POLISH-6 (P6-1, REQ-BFG-089): COPIES prints 1.3 where it printed 1.3333333333333333 (the readout's grid rows are one line, not two): the rows have room, in the harness column (framed(), no ENCHANTER row):
 *  POLISH-4c's plans 18 / 126 -> 14 / 106 (1920x1080), 36 / 255 -> 30 / 227 (1366x768), 9 / 71 -> 6 / 50 (844x390@3); this tip's plans 6 / 16 -> 4 / 8, 10 / 34 -> 8 / 24, 4 / 12 -> 2 / 4. */
const VIEWS: [string, number, number, number, [number, number], [number, number]][] = [
  ["desk 1920x1080", 1920, 1080, 1, [14, 106], [4, 8]],
  ["laptop 1366x768", 1366, 768, 1, [30, 227], [8, 24]],
  ["desk 1280x800", 1280, 800, 1, [0, 0], [0, 0]],
  ["land 844x390@3", 844, 390, 3, [6, 50], [2, 4]],
];
const NOTE = /\+\d+ MORE HIT TILES?/;

/** The 316 belts of the real rival builds (K/p4-snip-buildbelts.test.ts): the panel text and the hits in the belt. */
function rivalBelts(): { t: PanelText; hits: number; label: string }[] {
  const out: { t: PanelText; hits: number; label: string }[] = [];
  for (const id of RIVAL_IDS) for (const maker of Object.keys(MAKERS) as Maker[]) for (const day of DAYS.filter((d) => rivalDays(id, 16).includes(d))) {
    const b = MAKERS[maker](id, day);
    b.routes.forEach((_, i) => {
      const t = routePanel(faceRun(b, day), i);
      if (t) out.push({ t, hits: t.body.filter((x) => x.trim && !x.join).length, label: `${id} ${maker} d${day} belt ${i}` });
    });
  }
  return out;
}
/** hit rows a plan gives away: the N of its `+N MORE HIT TILES` note when that note is drawn whole */
const moreN = (p: PanelPlan): number => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  const m = p.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln))).map((l) => /\+(\d+) MORE HIT TILE/.exec(l.b.text)).find((x) => x);
  return m ? Number(m[1]) : 0;
};
/** the blocks a plan draws whole, `role|text|label`, without the `+N MORE HIT TILES` note (the mark of a row given away: where the rows now fit it is gone, which is the point; the rows are compared one by one) and without the guest line (it yields to the rows, R1) */
const drawnBlocks = (p: PanelPlan): Set<string> => {
  const drawn = new Set(visibleLines(p).map((v) => v.line));
  return new Set(p.body.shown.filter((l) => l.lines.length > 0 && l.lines.every((ln) => drawn.has(ln)) && !NOTE.test(l.b.text) && !l.b.hold).map((l) => `${l.b.role}|${l.b.text}|${l.b.label ?? ""}`));
};
const hasGuest = (p: PanelPlan): boolean => visibleLines(p).some((v) => v.line !== "rule" && !!v.line.block.hold);

describe("POLISH-5 P5-2: the build screen's belt panel on the 316 real belts", () => {
  for (const [name, w, h, dpr, was, now] of VIEWS) {
    it(`${name}: belts giving hit rows away / rows lost ${was.join(" / ")} (POLISH-4c) -> ${now.join(" / ")}; no belt gives away more than before; a belt that gave none away is the plan it was; no block drawn before is dropped (the guest line aside)`, () => {
      const f = framed(w, h, dpr, 0), tp = tapPx(f.view);
      withEnchant(() => {
        const sum = { oldBelts: 0, oldRows: 0, newBelts: 0, newRows: 0, tight: 0, changed: 0 };
        for (const { t, label } of rivalBelts()) {
          const old = planPanel(t, f.L.info, [], { tap: tp, fewer: false }), cur = planPanel(t, f.L.info, [], { tap: tp });
          const a = moreN(old), b = moreN(cur);
          sum.oldBelts += a > 0 ? 1 : 0; sum.oldRows += a; sum.newBelts += b > 0 ? 1 : 0; sum.newRows += b;
          if (cur.body.tight) sum.tight++;
          expect(b, `${label}: rows given away ${a} -> ${b}`).toBeLessThanOrEqual(a);
          if (a === 0) expect(JSON.stringify(cur), `${label}: no row given away today, the plan is the same`).toBe(JSON.stringify(old));
          else if (JSON.stringify(cur) !== JSON.stringify(old)) sum.changed++;
          const was = drawnBlocks(old), is = drawnBlocks(cur);
          for (const k of was) expect(is.has(k), `${label}: ${k} was drawn and is not`).toBe(true);
          if (cur.body.tight) for (const l of cur.body.lines) if (l !== "rule") expect(l.pitch, `${label}: a tight plan's lines are at LH_TIGHT`).toBe(LH_TIGHT);
        }
        expect([sum.oldBelts, sum.oldRows], "POLISH-4c's plans, as K/p4-snip-buildbelts.test.ts counted them").toEqual(was);
        expect([sum.newBelts, sum.newRows], "P5-2's plans").toEqual(now);
        if (was[0] > 0) expect(sum.changed, "the belts that gave rows away now take another rung").toBeGreaterThan(0);
        if (name.startsWith("desk 1920")) expect(sum.tight, "the tight 3x5 rung is used").toBeGreaterThan(0);
      });
    });
  }
  it("a battle face is untouched: every one of the 316 belts, planned as a face (`wrap`), is the same plan with and without the new rungs", () => {
    for (const [, w, h, dpr] of VIEWS) {
      const f = framed(w, h, dpr, 0), tp = tapPx(f.view);
      withEnchant(() => {
        for (const { t, label } of rivalBelts()) {
          expect(JSON.stringify(planPanel(t, f.L.info, [], { tap: tp, wrap: true })), `${label} at ${w}x${h}`).toBe(JSON.stringify(planPanel(t, f.L.info, [], { tap: tp, wrap: true, fewer: false })));
        }
      });
    }
  });
});

describe("POLISH-5 P5-2: the guest line yields to the rows, R1's way (cap's ruling (A))", () => {
  it("the panels that show the NOT COUNTED line at POLISH-4c and not now are belts whose rows took its room: each gives away fewer rows; no panel gains rows and loses nothing else; panels that never gave rows away keep their line", () => {
    const moved: Record<string, number> = {}, gained: Record<string, number> = {};
    withEnchant(() => {
      const belts = [...corpus().map((b) => ({ t: routePanel(b.run, 0) as PanelText | null, label: b.label })), ...rivalBelts().map((b) => ({ t: b.t as PanelText | null, label: b.label }))];
      for (const [name, w, h, dpr] of VIEWS) {
        const f = framed(w, h, dpr, 0), tp = tapPx(f.view);
        for (const { t, label } of belts) {
          if (!t) continue;
          const old = planPanel(t, f.L.info, [], { tap: tp, fewer: false }), cur = planPanel(t, f.L.info, [], { tap: tp });
          if (hasGuest(old) && !hasGuest(cur)) {
            moved[name] = (moved[name] ?? 0) + 1;
            expect(moreN(cur), `${name} ${label}: the line left because the rows took its room`).toBeLessThan(moreN(old));
          }
          if (!hasGuest(old) && hasGuest(cur)) gained[name] = (gained[name] ?? 0) + 1;
          if (moreN(old) === 0) expect(hasGuest(cur), `${name} ${label}: no rows given away at POLISH-4c, the line is as it was`).toBe(hasGuest(old));
        }
      }
    });
    expect(moved, "panels whose NOT COUNTED line left the panel (its words are the first item of the ⓘ view)").toMatchObject({ "desk 1920x1080": expect.any(Number) });
    expect(moved["desk 1920x1080"]).toBeGreaterThan(0);
  });
});
