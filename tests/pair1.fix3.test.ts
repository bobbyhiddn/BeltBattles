// PAIR-CUE fix 3 (REQ-BFG-100; REVIEW-COUNT1, gap 4: the paused chip blocks taps): while paused, a press anywhere on the
// paused chip's body reaches no counter target under it (the body is a blocking region added after the counters' groups);
// MENU still opens the menu; off the chip the counter target still takes the press. Tests only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BattleScreen, PAUSE_CHIP } from "../src/screens/battle";
import { UI, inside } from "../src/ui/ui";
import { fakeCanvas, fakeDom } from "./pair1.helpers";

let restore: () => void = () => undefined;
beforeAll(() => { restore = fakeDom(); });
afterAll(() => restore());

/** The paused chip drawn as the battle draws it (BattleScreen's own drawPaused) over a counter target that covers it. */
function pausedOver(W: number, H: number) {
  const ui = new UI();
  ui.begin();
  // a counter group's finger target, as COUNT-1 adds them (earlier in the frame), right under the screen's middle
  const target = { x: Math.round(W / 2 - 60), y: Math.round(H / 2 - 30), w: 120, h: 60 };
  let tapped = 0;
  ui.add({ id: "cnt:gun1:0", r: target, onTap: () => { tapped++; } });
  let menu = 0;
  const self = { game: { W, H, ui }, openMenu: () => { menu++; } };
  (BattleScreen.prototype as unknown as { drawPaused: (g: unknown) => void }).drawPaused.call(self, fakeCanvas().getContext());
  ui.end();
  return { ui, target, chip: ui.regions.find((r) => r.id === PAUSE_CHIP)!, menuR: ui.regions.find((r) => r.id === "pmenu")!, taps: () => tapped, menus: () => menu };
}

describe("PAIR-CUE fix 3: the paused chip's body blocks counter taps", () => {
  for (const [W, H] of [[241, 414], [384, 216], [281, 130]]) {
    it(`${W}x${H}: every point of the chip's body hits the chip (a block), MENU hits MENU, off the chip the counter target`, () => {
      const { ui, target, chip, menuR } = pausedOver(W, H);
      expect(chip.block, "the body is a blocking region").toBe(true);
      expect(chip.onTap).toBeUndefined();
      let body = 0, onMenu = 0;
      for (let y = chip.r.y; y < chip.r.y + chip.r.h; y++) for (let x = chip.r.x; x < chip.r.x + chip.r.w; x++) {
        const id = ui.hit(x, y)?.id;
        if (inside(menuR.r, x, y)) { expect(id).toBe("pmenu"); onMenu++; } else { expect(id, `${x},${y}`).toBe(PAUSE_CHIP); body++; }
      }
      expect(body).toBeGreaterThan(0);
      expect(onMenu).toBeGreaterThan(0);
      // a point of the counter target off the chip still reaches it
      const off = { x: target.x + 1, y: target.y + 1 };
      expect(inside(chip.r, off.x, off.y)).toBe(false);
      expect(ui.hit(off.x, off.y)?.id).toBe("cnt:gun1:0");
    });
  }
});
