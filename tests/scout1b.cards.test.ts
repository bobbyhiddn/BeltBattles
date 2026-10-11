// SCOUT-1b (REQ-BFG-082): VIEW BATTLEFIELD's two card fixes (cap's review of SCOUT-1). The warlord's card: with a part
// pick, the line "PICK 1 PART FROM THEIR DECK:" sits right over the picks it heads and VIEW BATTLEFIELD's row (and its tap
// target) above that line; every other card keeps its rows. The dusk card: with VIEW BATTLEFIELD's row it fits the
// screen (H - 4) on every view, with the most rows a card can have (10: FOUNDRY against BASTION), its rows apart and the
// INCOME line clear of the buttons; a card that already fit is unchanged, and a card without the row is as before.

import { describe, expect, it } from "vitest";
import { viewWithSub } from "../src/game/viewGrid";
import { battleGrid, battleScale } from "../src/game/battleLayout";
import { CARD_GAP_CUT, CARD_ROWS, VIEW_ROW_H, resultCard, resultRows } from "../src/screens/battleHud";
import { PICK_LINE, warlordRows } from "../src/screens/warlordHud";
import { tapRect } from "../src/ui/ui";
import { tapPx } from "../src/ui/tap";

const pickSub = (pw: number, ph: number, p: boolean, scale: number) => { const g = battleGrid(pw, ph, p); return g.close === scale ? g.sub : 1; };
/** The brief's views (phones at DPR 3, the desk and the laptops at 1), and two more phones and a laptop at DPR 2. */
const VIEWS: [number, number, number][] = [
  [390, 844, 3], [430, 932, 3], [844, 390, 3], [1920, 1080, 1], [1366, 768, 1], [1280, 720, 1],
  [375, 667, 2], [667, 375, 2], [1440, 900, 2],
];
const view = (w: number, h: number, dpr: number) => viewWithSub(w, h, dpr, (pw, ph, p) => battleScale(pw, ph, p), pickSub);
/** The most rows a dusk card can have: the 7, then FUSED SLUGS, PLATING GAINED and PLATING SPENT. */
const MOST = resultRows({
  player: { shots: 1, damage: 1, firstShot: 1, idle: 0, turretTime: 1, jams: 0, burnDealt: 0 },
  enemy: { shots: 1, damage: 1, firstShot: 1, idle: 0, turretTime: 1, jams: 0, burnDealt: 0 },
  race: { fused: [3, null], plated: [null, 30], spent: [null, 28] },
} as unknown as Parameters<typeof resultRows>[0]).length;

describe("SCOUT-1b: the dusk card fits every view with VIEW BATTLEFIELD's row", () => {
  it("the most rows a card can have is 10", () => {
    expect(MOST).toBe(10);
    expect(CARD_ROWS).toBe(7);
  });

  it("on every view, at 7 to 10 rows: the card with the row fits H - 4, its rows at least 6 apart, INCOME 7 px or more clear of the buttons", () => {
    const seen: string[] = [];
    for (const [w, h, dpr] of VIEWS) {
      const v = view(w, h, dpr);
      for (let n = CARD_ROWS; n <= MOST; n++) {
        const c = resultCard(n, v.H, VIEW_ROW_H);
        const total = c.h + VIEW_ROW_H;
        const at = `${w}x${h}@${dpr} (H ${v.H}), ${n} rows`;
        expect(total, at).toBeLessThanOrEqual(v.H - 4);
        expect(c.pitch, at).toBeGreaterThanOrEqual(6);
        // drawResult's rows: the YOU/FOE head at 53, n rows at the pitch, INCOME (5x7) 3 px under them; VIEW BATTLEFIELD's
        // button 52 px above the card's foot (the primary's 27, its own 25)
        const incomeFoot = 53 + c.pitch * (n + 1) + 3 + 7;
        expect(total - 52 - incomeFoot, at).toBeGreaterThanOrEqual(16 - CARD_GAP_CUT);
        if (n === CARD_ROWS || n === MOST) seen.push(`${at}: ${total} of ${v.H} (pitch ${c.pitch})`);
      }
    }
    expect(seen.length).toBe(VIEWS.length * 2);
  });

  it("the 1366x768 laptop: SCOUT-1's 195 of 192 px now fits; a card that already fit is SCOUT-1's; no row, as before", () => {
    const lap = view(1366, 768, 1);
    expect(lap.H).toBe(192);
    expect(resultCard(CARD_ROWS, lap.H - VIEW_ROW_H).h + VIEW_ROW_H).toBe(195); // SCOUT-1's sizing (3 px too tall)
    const now = resultCard(CARD_ROWS, lap.H, VIEW_ROW_H);
    expect(now).toEqual({ h: 162, pitch: 7 });
    expect(now.h + VIEW_ROW_H).toBeLessThanOrEqual(lap.H - 4);
    for (const [w, h, dpr] of VIEWS) {
      const v = view(w, h, dpr);
      for (let n = CARD_ROWS; n <= MOST; n++) {
        const old = resultCard(n, v.H - VIEW_ROW_H); // SCOUT-1's call
        if (old.h + VIEW_ROW_H <= v.H - 4) expect(resultCard(n, v.H, VIEW_ROW_H), `${w}x${h} ${n}`).toEqual(old);
        for (const H of [v.H, 120, 180, 1000]) expect(resultCard(n, H)).toEqual(resultCard(n, H, 0)); // no row: as before
      }
    }
  });
});

describe("SCOUT-1b: the warlord's card puts VIEW BATTLEFIELD above the PICK line", () => {
  it("with a pick: VIEW BATTLEFIELD, then the PICK line right over the picks; its tap target inside the card, above the line", () => {
    for (const [w, h, dpr] of VIEWS) {
      const v = view(w, h, dpr);
      const cw = Math.min(v.W - 10, 214), ch = 124 + VIEW_ROW_H;
      const x = Math.round(v.W / 2 - cw / 2), yy = Math.round(v.H / 2 - ch / 2);
      const r = warlordRows(yy, ch, true, true);
      expect(r.buttons).toBe(yy + ch - 26); // the picks, where they were
      expect(r.pickLine + 5 + 4).toBe(r.buttons); // the line's 3x5 text, 4 px, the picks
      expect(r.view + 21 + 4).toBe(r.pickLine); // VIEW BATTLEFIELD's 21 px button, 4 px, the line
      expect(r.view).toBeGreaterThan(yy + 62 + 7); // under the gold line
      const tp = tapPx(v);
      const b = { x: x + 10, y: r.view, w: cw - 20, h: 21 };
      const hit = tapRect(b, tp, { x, y: yy, w: cw, h: b.y + b.h + 2 - yy }, tp); // viewButton's
      const at = `${w}x${h}@${dpr}`;
      expect(hit.h, at).toBeGreaterThanOrEqual(Math.min(tp, 21 + 2 + (r.view - yy)));
      expect(hit.h, at).toBeGreaterThanOrEqual(tp); // TAP_CSS
      expect(hit.y + hit.h, at).toBeLessThanOrEqual(r.pickLine - 1); // never onto the line or the picks
      expect(hit.y, at).toBeGreaterThanOrEqual(yy);
    }
  });

  it("without a pick (REFIT and FIGHT NOW, ON TO DUSK, a loss) VIEW BATTLEFIELD is right above the buttons, as SCOUT-1 had it; without the view the PICK line is where it was", () => {
    const yy = 40, ch = 124 + VIEW_ROW_H;
    const r = warlordRows(yy, ch, false, true);
    expect(r.view).toBe(r.buttons - VIEW_ROW_H);
    expect(warlordRows(yy, 124, true, false).pickLine).toBe(yy + 74); // 0.9.8's place: under the gold line
    expect(PICK_LINE).toBe(9);
  });
});
