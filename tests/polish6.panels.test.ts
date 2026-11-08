// POLISH-6 P6-3 (REQ-BFG-087, REQ-BFG-089; RULING-REVIEW-POLISH5 N6, REVIEW-POLISH5 F2): no test pinned that P5-2's rungs (inspector.ts planRung: the 3x5 plan and the 3x5 plan at the tight pitch, taken where they give away
// fewer hit rows) reach the BELT panel only. This one does: every NON-BELT build-screen panel kind (cargo, rig, factory, turret, offer: tests/polish4.famcorpus.ts's 1,303 panels) is planned through planPanel as the build
// screen calls it (no `wrap`, no `band`; tap = tapPx) at the four landscape views (1920x1080, 1366x768, 844x390@3, 1280x800), in the harness's column (framed().L.info, no ENCHANTER row) and with the ENCHANTER's row up
// (the live column: framed(.., true), P6-4; 58 px shorter at 1920x1080, 1366x768 and 844x390; 1280x800's column is the same with and without the row), with the default options and with
// `fewer: false`: the two plans must be the same plan, panel for panel (0 of 9,121 differ at polish5-accepted). A positive control: the flag is live (some real belt panel of the rival builds does differ), so the test cannot
// pass vacuously. Green at polish5-accepted by design (it pins what is true); RED against a planRung that lets any dropped block, not only a belt's hit rows, start the rungs (37 panels differ at 1366x768 with the row up;
// kit/p6-patch-n6mut.py).
// Timing (one `it` a view-column, 7 of them): alone ~1.5 s each; the suite's per-test time-out is 30 s (vite.config.ts testTimeout).
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { framed } from "./polish2.guestCorpus";
import { corpus } from "./polish4.famcorpus";
import { faceRun } from "../src/screens/battleScout";
import { planPanel, routePanel, selFamilies, type PanelText } from "../src/screens/build/inspector";
import { withEnchant } from "../src/sim/enchant";
import { RIVAL_IDS, rivalBuild, rivalDays, standInBuild, type RivalId } from "../src/sim/rivals";
import { tapPx } from "../src/ui/tap";

installRaster();
const VIEWS: [string, number, number, number][] = [["desk-1920x1080", 1920, 1080, 1], ["laptop-1366x768", 1366, 768, 1], ["land-844x390", 844, 390, 3], ["desk-1280x800", 1280, 800, 1]];
const kindOf = (id: string): string => (id.startsWith("cargo") ? "cargo" : id.startsWith("rig") ? "rig" : id.startsWith("placed") ? "factory" : id.startsWith("installed") ? "turret" : id.startsWith("offer") ? "offer" : "other");
/** the whole plan, as data (rects, rows, face, gaps, family head, the drawn lines): what `planPanel` returned */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

describe("POLISH-6 P6-3: P5-2's rungs reach the belt panel only: every other build-screen panel plans the same with and without `fewer: false`", () => {
  const CASES = corpus();
  for (const [name, w, h, dpr] of VIEWS) {
    for (const col of ["harness", "enchanter"] as const) {
      if (col === "enchanter" && w === 1280) continue; // the same column as the harness's (128x324 with and without the row)
      it(`${name}, ${col === "harness" ? "the harness's column" : "the ENCHANTER's row up"}: ${CASES.length} panels (cargo, rig, factory, turret, offer) plan the same`, () => {
        const f = framed(w, h, dpr, 0, 5, col === "enchanter"), tp = tapPx(f.view); // the ENCHANTER's column: the page's own (enchantStrip.ts wordLayout), not a hand-set 58 px
        const area = f.L.info;
        const kinds: Record<string, number> = {};
        const differ: string[] = [];
        CASES.forEach((c, i) => {
          const kind = kindOf(c.id);
          expect(kind, `${c.id}: a corpus panel of a known kind`).not.toBe("other");
          kinds[kind] = (kinds[kind] ?? 0) + 1;
          const fam = selFamilies(c.run, c.sel);
          if (!same(planPanel(c.t, area, fam, { tap: tp }), planPanel(c.t, area, fam, { tap: tp, fewer: false }))) differ.push(`${i} ${kind} ${c.id}`);
        });
        expect(Object.keys(kinds).sort(), "every non-belt kind is in the corpus").toEqual(["cargo", "factory", "offer", "rig", "turret"]);
        expect(differ, `${name} ${col}: panels whose plan changes with \`fewer\` (only belt panels may)`).toEqual([]);
      });
    }
  }
  it("the control: `fewer` is live. Some real belt panel (rival builds, days 5-16) plans differently with and without it at 1920x1080", () => {
    const f = framed(1920, 1080, 1, 0), tp = tapPx(f.view);
    let differs = 0, belts = 0;
    withEnchant(() => {
      for (const id of RIVAL_IDS) for (const make of [rivalBuild, standInBuild]) for (const day of [5, 8, 12, 16].filter((x) => rivalDays(id, 16).includes(x))) {
        const b = make(id as RivalId, day);
        b.routes.forEach((_, i) => {
          const t: PanelText | null = routePanel(faceRun(b, day), i);
          if (!t) return;
          belts++;
          if (!same(planPanel(t, f.L.info, [], { tap: tp }), planPanel(t, f.L.info, [], { tap: tp, fewer: false }))) differs++;
        });
      }
    });
    expect(belts).toBeGreaterThan(300);
    expect(differs, "belt panels the P5-2 rungs re-plan at 1920x1080 (14 give rows away at the old plan, 4 at the new: P6-1's one-decimal COPIES)").toBeGreaterThan(0);
  });
});
