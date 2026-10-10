// AZ-PREP (REQ-BFG-077; BRIEF-AZPREP 2 (c); REVIEW-NPC1 Q4 and N2), behind NPC_DAY (turned on only through withNpcDay): in
// REFIT the shop is shut (run.ts shopShut: every sale is refused with REFIT_NO_SHOP), so the panels offer no SELL button (a
// cargo part's, a placed part's on touch, a fitted piece's; inspector.ts spec, which turretPanel.ts's turret buttons go
// through too) and the build bar names the stage, REFIT · DAY n/10 (chrome.ts barStage). Off (0.9.7's road REFIT keeps its
// sales), or at the dawn: SELL and DAWN as today.
import { describe, expect, it } from "vitest";
import { newRun, type Run } from "../src/game/run";
import { withNpcDay } from "../src/sim/npcDay";
import { computeView } from "../src/core/io";
import { UI } from "../src/ui/ui";
import { buildLayout, buildScale, type Sel } from "../src/screens/build/layout";
import { detailsPlan } from "../src/screens/build/inspector";
import { barStage } from "../src/screens/build/chrome";
import type { Ctx } from "../src/screens/build/actions";
import { rotField } from "../src/sim/deck";
import { installRaster } from "./raster.helpers";

installRaster(); // the panels' icons draw on a canvas (shoptap.panels's set-up)

/** The phone's build view (390x844 @3, the pack row's 33 px: shoptap.panels's PHONE) and its panel band. */
const V = (() => {
  const v0 = computeView(390, 844, 3, (pw, ph, portrait) => buildScale(pw, ph, portrait));
  const v = { ...v0, H: v0.H + 33 };
  return { v, area: buildLayout(v.W, v.H, v.portrait, 5).info };
})();
/** The labels of the buttons a selection's panel draws (detailsPlan: the layout reads exactly these). */
const buttons = (run: Run, sel: Sel, touch: boolean): string[] =>
  detailsPlan({ game: { ui: new UI(), t: 0, view: V.v }, run, touch } as unknown as Ctx, sel, null, V.area)!.t.labels;
const SELL = /^SELL \+\d+G$/;

describe("AZ-PREP (c): REFIT with NPC_DAY on has no SELL button and its bar says REFIT (REVIEW-NPC1 Q4, N2)", () => {
  it("a cargo part, a placed rig (touch) and a fitted gear: SELL in 0.9.7's road REFIT and at the dawn; none in REFIT with NPC_DAY on, every other button kept", () => {
    const run = newRun("furnace", 5, "azprep-refit");
    run.inventory = [{ uid: 900, def: "whetstone" }];
    run.build.items.push({ uid: 901, def: "temper", x: 3, y: 3, ...rotField("temper", 1) });
    run.build.mods = [{ uid: 902, def: "mantlet", turret: 0 }];
    const cases: [Sel, boolean][] = [[{ kind: "cargo", uid: 900 }, false], [{ kind: "cargo", uid: 900 }, true], [{ kind: "item", uid: 901 }, true], [{ kind: "fitted", uid: 902 }, true]];
    for (const [sel, touch] of cases) {
      const at = `${sel.kind} ${touch ? "touch" : "mouse"}`;
      run.stage = "caravan";
      const dawn = buttons(run, sel, touch), dawnOn = withNpcDay(() => buttons(run, sel, touch));
      run.stage = "refit";
      const off = buttons(run, sel, touch), on = withNpcDay(() => buttons(run, sel, touch));
      expect(dawn.some((l) => SELL.test(l)), at).toBe(true);
      expect([dawnOn, off], at).toEqual([dawn, dawn]); // the dawn with the switch on, and 0.9.7's road REFIT: as today
      expect(on, at).toEqual(dawn.filter((l) => !SELL.test(l))); // REFIT with NPC_DAY on: the same buttons but SELL
    }
    // the bar's stage word (chrome.ts drawTopBar): REFIT only in REFIT (and at its dusk) with NPC_DAY on
    const word = (stage: Run["stage"]) => [barStage({ stage }), withNpcDay(() => barStage({ stage }))];
    expect([word("caravan"), word("refit"), word("battle"), word("fork")]).toEqual([["DAWN", "DAWN"], ["DAWN", "REFIT"], ["DAWN", "REFIT"], ["DAWN", "DAWN"]]);
  });
});
