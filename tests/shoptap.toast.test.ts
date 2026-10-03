// shoptap: a toast on a portrait phone. The one-output notice ("<NAME> HAS 1 OUTPUT · THIS MOVES ITS BELT") is wider than
// the 390x844 build screen (167 logical px) in the toast's 5x7 face, as several of 0.8.0's own toasts were (cut at both
// ends). A toast that doesn't fit takes the 3x5 face, on two lines where one won't hold it (game.ts toastFit); one that
// fits is drawn exactly as before.
// bb-0.8.3 (REQ-BFG-042 D6): no factory has one output now, and that notice is gone; a drag out of a full factory says
// fullNotice ("STAMP PRESS'S 2 BELTS ARE IN USE · ★2 OPENS A 3RD"), which these checks now read for every factory.
import { describe, expect, it } from "vitest";
import { toastFit } from "../src/game/game";
import { textWidth } from "../src/render/font";
import { ITEMS } from "../src/sim/content";
import { merges, outputsAt } from "../src/sim/stars";
import { fullNotice } from "../src/screens/build/edit";

/** Every factory's full notice, at each of its stars (every factory merges: the signature ones too, bb-0.8.3 D2). */
const notices = (): string[] => Object.values(ITEMS).filter((d) => d.kind === "factory").flatMap((d) =>
  [1, 2, 3].map((s) => fullNotice(d.name, outputsAt(d.id, s), s, merges(d.id))));

describe("toastFit", () => {
  it("every full-factory notice fits the narrowest phone build screen (360 CSS px: 167-180 logical px), whole", () => {
    const all = notices();
    expect(all.length).toBeGreaterThan(30);
    for (const W of [167, 180]) for (const text of all) {
      const f = toastFit(text, W);
      expect(f.lines.join(" "), `${text} at ${W}`).toBe(text); // nothing cut
      expect(f.lines.length).toBeLessThanOrEqual(2);
      for (const l of f.lines) expect(textWidth(l, f.font), `${text} at ${W}`).toBeLessThanOrEqual(W - 4);
    }
    expect(toastFit(fullNotice("KILN", 2, 1, true), 167)).toEqual({ font: "3", lines: ["KILN'S 2 BELTS ARE IN USE · ★2 OPENS A 3RD"] });
  });

  it("a toast that fits is drawn as before (the 5x7 face, one line): every toast on the desk, short ones on the phone", () => {
    for (const t of ["REFIT · CARAVAN GONE", "+2 BELT CAPACITY", "SOUND: SFX ONLY", "NEED 3 MORE GOLD"]) expect(toastFit(t, 167)).toEqual({ font: "5", lines: [t] });
    for (const t of [...notices(), "NO BELT FEEDS A TURRET! FIGHT AGAIN TO GO ANYWAY"]) {
      expect(toastFit(t, 480), t).toEqual({ font: "5", lines: [t] }); // the desk's 480 logical px (1920x1080 at x4)
    }
  });
});
