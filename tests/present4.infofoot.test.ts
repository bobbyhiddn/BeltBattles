// PRESENT-4 N (REQ-BFG-089; STAGE-0915's F7 and F12): the ⓘ view's last page tells the truth. Every page read `TAP FOR MORE n/N`, the last one too, but a tap on the last page does not turn to another page:
//  drawView's `turn` sets the page to null past the last, so the view CLOSES. Now the last page's footer says `TAP TO CLOSE N/N`; the other pages' footers are as they were. Both phrases are 12 letters and
//  2 spaces in the 3x5 face (45 px), so the new words sit where the old ones did on every view (right-aligned 5 px in from the panel's edge, at infoDrawn's `foot`).
import { describe, expect, it } from "vitest";
import { installRaster, fresh, G as gOf, diffPx, type RasterCanvas } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { C } from "../src/render/palette";
import { drawText, textWidth } from "../src/render/font";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { cargoPanel, detailsPlan, drawDetails, panelFit, turretPanel } from "../src/screens/build/inspector";
import { explainWords, infoDrawn, infoFootText, infoFree, infoItems, infoLevels, keywordState, panelPiece } from "../src/screens/build/keywords";
import type { Ctx } from "../src/screens/build/actions";
import type { DuskFoe } from "../src/game/run";
import { setTurretList } from "../src/sim/deck";
import { setTipsForTests } from "../src/ui/tips";

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
function base(): Run {
  const run = newRun("furnace", 5, "present4-foot");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  return run;
}
/** MASSIVE SCRAP CANNON ★, installed, on 402x690: four pages (tests/polish2.infoPages.test.ts's list). */
function fourPages() {
  const f = framed(402, 690, 3, 1), run = base();
  setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90, ench: "massive" } as never]);
  const sel: Sel = { kind: "turret", index: 0 };
  void turretPanel;
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch: true, L: f.L } as unknown as Ctx;
  const area = () => panelArea(f.L, sel, { touch: true, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  return { f, run, sel, ctx, area };
}

describe("PRESENT-4 N: the ⓘ view's last page says what a tap does", () => {
  it("infoFootText: `TAP FOR MORE n/N` on every page but the last, `TAP TO CLOSE N/N` on the last; the same width", () => {
    for (let pages = 2; pages <= 6; pages++) {
      for (let page = 0; page < pages; page++) {
        const s = infoFootText(page, pages);
        expect(s, `${page + 1}/${pages}`).toBe(page === pages - 1 ? `TAP TO CLOSE ${pages}/${pages}` : `TAP FOR MORE ${page + 1}/${pages}`);
        expect(textWidth(s, "3"), `${s}: the width`).toBe(textWidth(`TAP FOR MORE ${page + 1}/${pages}`, "3"));
      }
    }
    expect(infoFootText(3, 4)).toBe("TAP TO CLOSE 4/4");
    expect(infoFootText(0, 4)).toBe("TAP FOR MORE 1/4");
    expect(textWidth("TAP TO CLOSE 4/4", "3")).toBe(textWidth("TAP FOR MORE 4/4", "3"));
    expect(textWidth("TAP TO CLOSE 4/4", "3")).toBe(60); // = the old footer's: 12 letters and spaces (45 px), a space, `4/4`
  });

  it("drawn: on the 4-page view of MASSIVE SCRAP CANNON ★ (402x690) pages 1-3 read TAP FOR MORE n/4 and page 4 TAP TO CLOSE 4/4, right-aligned 5 px in from the panel's edge at infoDrawn's foot; nothing else on the page moves", () => {
    setTipsForTests("done");
    const { f, run, sel, ctx, area } = fourPages();
    const frames: RasterCanvas[] = [];
    let a0: Rect | null = null;
    for (let page = 0; page < 4; page++) {
      const ui = (ctx.game as unknown as { ui: UI }).ui;
      ui.pointer.kind = "touch";
      Object.assign(ui.pointer, { x: -1, y: -1, down: false });
      const first = detailsPlan(ctx, sel, null, area())!; // the view opens from the ⓘ button
      const st = keywordState(ctx) as unknown as { page: number | null } | undefined;
      if (st) st.page = page;
      else { // open it once, then set the page (the state is made on the first draw)
        ui.begin(); drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area(), {} as DuskFoe); ui.end();
        (keywordState(ctx) as unknown as { page: number | null }).page = page;
      }
      ui.begin();
      const cv = fresh(f.W, f.H);
      drawDetails(gOf(cv), ctx, sel, null, area(), {} as DuskFoe);
      ui.end();
      frames.push(cv);
      const p = first.plan, d = detailsPlan(ctx, sel, null, area())!;
      const piece = panelPiece(run, d.show), words = explainWords(d.t, piece), notes = (d.t.notes ?? []).map((b) => b.text);
      const items = infoItems(infoLevels(run, sel), words, p.r.w - 10, notes);
      const dr = infoDrawn(items, p.r, p.y - 1, p.maxY + 2, infoFree(f.L, p.r, p.column), page);
      expect(dr.view.pages.length, "four pages").toBe(4);
      expect(dr.foot, `page ${page + 1}: a footer`).not.toBeNull();
      const want = infoFootText(page, 4), x = p.r.x + p.r.w - 5;
      expect(want).toBe(page === 3 ? "TAP TO CLOSE 4/4" : `TAP FOR MORE ${page + 1}/4`);
      // the footer's pixels: the same text drawn alone (colour slate4, right-aligned at x) lies on the frame
      const ref = fresh(f.W, f.H);
      drawText(gOf(ref), want, x, dr.foot!, C.slate4, { font: "3", align: "right" });
      let n = 0, hit = 0;
      for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) if (ref.at(i, j) !== null) { n++; if (cv.at(i, j) === ref.at(i, j)) hit++; }
      expect(hit, `page ${page + 1}: every footer pixel of "${want}" is on the frame`).toBe(n);
      // and the old words are not: the other phrase's pixels differ
      const other = fresh(f.W, f.H);
      drawText(gOf(other), page === 3 ? "TAP FOR MORE 4/4" : `TAP TO CLOSE ${page + 1}/4`, x, dr.foot!, C.slate4, { font: "3", align: "right" });
      let miss = 0;
      for (let j = 0; j < f.H; j++) for (let i = 0; i < f.W; i++) if (other.at(i, j) !== null && cv.at(i, j) !== other.at(i, j)) miss++;
      expect(miss, `page ${page + 1}: the other phrase is not drawn`).toBeGreaterThan(0);
      if (page === 0) a0 = p.r;
    }
    expect(a0).not.toBeNull();
    // a page's footer apart, the pages of the view hold what they held: page 1 and page 4 differ outside the footer's row only by their own entries (checked by the page counts and the panel's pin in tests/polish2.infoPages.test.ts); here: the frames differ
    expect(diffPx(frames[0], frames[3]).length).toBeGreaterThan(0);
  });

  it("a tap on the last page closes the view (the words say so): drawView's turn past the last page leaves page null; a tap before it turns", () => {
    setTipsForTests("done");
    const { f, ctx, sel, area } = fourPages();
    const ui = (ctx.game as unknown as { ui: UI }).ui;
    ui.begin(); drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area(), {} as DuskFoe); ui.end();
    const st = keywordState(ctx) as unknown as { page: number | null };
    st.page = 3;
    ui.begin(); drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area(), {} as DuskFoe); ui.end();
    const view = ui.regions.find((q) => q.id === "kw:view");
    expect(view, "the view's region").toBeTruthy();
    view!.onTap!();
    expect(st.page, "a tap on page 4/4 closes the view").toBeNull();
    st.page = 1;
    ui.begin(); drawDetails(gOf(fresh(f.W, f.H)), ctx, sel, null, area(), {} as DuskFoe); ui.end();
    ui.regions.find((q) => q.id === "kw:view")!.onTap!();
    expect(st.page, "a tap on page 2/4 turns to page 3").toBe(2);
    void cargoPanel;
  });
});
