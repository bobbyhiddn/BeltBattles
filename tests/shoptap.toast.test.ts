// shoptap: a toast on a portrait phone. The one-output notice ("<NAME> HAS 1 OUTPUT · THIS MOVES ITS BELT") is wider than
// the 390x844 build screen (167 logical px) in the toast's 5x7 face, as several of 0.8.0's own toasts were (cut at both
// ends). A toast that doesn't fit takes the 3x5 face, on two lines where one won't hold it (game.ts toastFit); one that
// fits is drawn exactly as before.
import { describe, expect, it } from "vitest";
import { toastFit } from "../src/game/game";
import { textWidth } from "../src/render/font";
import { ITEMS } from "../src/sim/content";
import { movesNotice } from "../src/screens/build/edit";

describe("toastFit", () => {
  it("every one-output notice fits the narrowest phone build screen (360 CSS px: 167-180 logical px), whole", () => {
    const factories = Object.values(ITEMS).filter((d) => d.kind === "factory").map((d) => d.name);
    expect(factories.length).toBeGreaterThan(10);
    for (const W of [167, 180]) for (const name of factories) {
      const text = movesNotice(name), f = toastFit(text, W);
      expect(f.lines.join(" "), `${name} at ${W}`).toBe(text); // nothing cut
      expect(f.lines.length).toBeLessThanOrEqual(2);
      for (const l of f.lines) expect(textWidth(l, f.font), `${name} at ${W}`).toBeLessThanOrEqual(W - 4);
    }
    expect(toastFit(movesNotice("KILN"), 167)).toEqual({ font: "3", lines: ["KILN HAS 1 OUTPUT · THIS MOVES ITS BELT"] });
  });

  it("a toast that fits is drawn as before (the 5x7 face, one line): every toast on the desk, short ones on the phone", () => {
    for (const t of ["REFIT · CARAVAN GONE", "+2 BELT CAPACITY", "SOUND: SFX ONLY", "NEED 3 MORE GOLD"]) expect(toastFit(t, 167)).toEqual({ font: "5", lines: [t] });
    for (const t of [movesNotice("DRAG CHAIN FOUNDRY"), "ALL 3 LOOM OUTPUTS USED - DRAG A BELT TO REROUTE", "NO BELT FEEDS A TURRET! FIGHT AGAIN TO GO ANYWAY"]) {
      expect(toastFit(t, 480), t).toEqual({ font: "5", lines: [t] }); // the desk's 480 logical px (1920x1080 at x4)
    }
  });
});
