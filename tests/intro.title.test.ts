import { describe, expect, it } from "vitest";
import { computeView, defaultScale } from "../src/core/io";
import { GAP_SHARE, arenaIn, minGap } from "../src/game/battleLayout";
import { HULL_L, type Box } from "../src/render/frame";
import { wrap } from "../src/render/font";
import { HELP } from "../src/screens/title";
import { CUSTOMIZE_MIN, TITLE_CLEAR_PANEL, TITLE_GAP_SHARE, TITLE_OPEN_CSS, TITLE_OPEN_SHARE, TITLE_REACH_DOWN, TITLE_REACH_FLOOR, TITLE_REACH_SIDE, TITLE_REACH_UP, helpCard, titleGap, titleLayout, titleScale } from "../src/screens/titleLayout";
import { textWidth } from "../src/render/font"; // CUSTOM-2a: the CUSTOMIZE word fits its button

// intro (BeltBattles 0.8.0, REQ-BFG-038): "The intro screen's battle also has the two carriers too close." The title
// frames itself (src/screens/titleLayout.ts): the open floor between its two cruisers is at least the battle's GAP_SHARE
// (17%) of the firing axis and TITLE_GAP_SHARE (20%) where there is room; desktop and landscape keep the menu scale and
// 0350e5f's placement exactly; a portrait phone steps down one scale, its buttons k times as big so none shrinks.
// PRESENT-1 TITLE-1 (REQ-BFG-038; BRIEF-PRESENT1 T2): "well apart" is the open water between the DRAWN carriers, which introcheck
// measures at 14% of the firing axis and one CSS inch (96 CSS px), so the floor between the hull boxes is now titleGap's: the 20%
// floor, or the bar plus what the two drawn carriers take of the floor (TITLE_REACH_FLOOR) and TITLE_OPEN_PAD, whichever is more.
// Re-pinned old -> new: land 169 -> 179, desk 144 -> 161, desk2 115 -> 141, small 128 -> 132 (its 1 CSS px per px is the bar's
// 96 CSS px: 94 at the end of the first fight before), phone and safari unchanged (127, 132). The landscape cruisers lift clear
// of the panel by their drawn reach (up 5, down 18 px, 30 sideways) where the panel meets it (land and desk2, with a saved run),
// and on a short screen (desk2: 360 px) the panel's bottom margin gives way, 18 -> 12 px, to the room that reach needs.

/** The views of the job: the operator's iPhone (portrait), the part of it Safari shows, the iPhone on its side, the desk
 *  at 1x and 2x, and a small phone. `menu`: 0350e5f's scale (io.ts defaultScale); `scale`: the title's now; `gap`: the floor
 *  between the hull boxes (logical px) now (PRESENT-1), `old`: 0350e5f's and 0.9.14's (20% of the firing axis). */
const VIEWS: Record<string, { css: [number, number]; dpr: number; menu: number; scale: number; gap: number; old: number }> = {
  phone: { css: [390, 844], dpr: 3, menu: 5, scale: 4, gap: 127, old: 127 },
  safari: { css: [390, 660], dpr: 3, menu: 4, scale: 3, gap: 132, old: 132 },
  land: { css: [844, 390], dpr: 3, menu: 3, scale: 3, gap: 179, old: 169 },
  desk: { css: [1440, 900], dpr: 1, menu: 2, scale: 2, gap: 161, old: 144 },
  desk2: { css: [1440, 900], dpr: 2, menu: 5, scale: 5, gap: 141, old: 115 },
  small: { css: [360, 640], dpr: 2, menu: 3, scale: 2, gap: 132, old: 128 },
};

const meets = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (b: Box, W: number, H: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H;

/** The title's view and its buttons' size factor on a CSS viewport, as the game computes them (TitleScreen.pickScale). */
function titleView(cssW: number, cssH: number, dpr: number) {
  const v = computeView(cssW, cssH, dpr, (pw, ph, p) => titleScale(pw, ph, p, dpr));
  const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
  const menu = defaultScale(pw, ph, v.portrait);
  return { ...v, menu, k: menu / v.scale, pw, ph, css: v.scale / dpr }; // PRESENT-1: css, the CSS px per logical px titleLayout takes now
}

/** 0350e5f's title (screens/title.ts place() and draw()) on a W x H logical screen at the menu scale. */
function oldTitle(W: number, H: number, portrait: boolean, save: boolean) {
  const top = portrait ? 60 : Math.round(H * 0.08) + 40;
  const panelH = save ? 90 : 62;
  const box = { x: 0, y: top, w: W, h: Math.max(160, H - top - panelH - 14) };
  const a = arenaIn(box, portrait, Math.min(Math.round((portrait ? H : W) * 0.2), (portrait ? box.h : box.w) - 2 * HULL_L - 12));
  const ly = portrait ? 22 : Math.max(8, Math.round(H * 0.08));
  const bw = Math.min(W - 24, 132), bh = 22;
  const ph = 10 + bh + 6 + (save ? bh + 12 : 0) + (bh - 4) + 8;
  const px = Math.round(W / 2 - (bw + 16) / 2), py = portrait ? H - ph - 10 : H - ph - Math.max(8, Math.round(H * 0.05));
  let by = py + 8;
  const bx = px + 8;
  const nw = { x: bx, y: by, w: bw, h: bh };
  by += bh + 6;
  let cont: Box | null = null;
  if (save) {
    cont = { x: bx, y: by, w: bw, h: bh + 6 };
    by += bh + 12;
  }
  const hw = Math.floor((bw - 4) / 2);
  return {
    frames: a.frames, hulls: a.hulls, ly, panel: { x: px, y: py, w: bw + 16, h: ph }, sound: { x: W - 30, y: 4, w: 26, h: 13 },
    buttons: { new: nw, cont, help: { x: bx, y: by, w: hw, h: bh - 4 }, options: { x: bx + hw + 4, y: by, w: bw - hw - 4, h: bh - 4 } },
  };
}

/** CUSTOM-2a (REQ-BFG-072, REVIEW-CUSTOM1 Q5): 0350e5f's title (k = 1) with CUSTOMIZE as a third button in the HOW TO
 *  PLAY / OPTIONS row: HOW TO PLAY and OPTIONS keep their size and row; CUSTOMIZE takes 48 px (never under
 *  CUSTOMIZE_MIN) beside them; the panel, NEW RUN and CONTINUE are wider by its slot and stay centred. The panel keeps its
 *  height, so the cruisers keep their room (titleScale is unchanged on every touchcheck phone: REPORT section 7). */
function withCustomize(o: ReturnType<typeof oldTitle>, W: number) {
  const hw = o.buttons.help.w;
  const cw = Math.max(CUSTOMIZE_MIN, Math.min(48, W - 24 - (2 * hw + 8)));
  const bw = 2 * hw + 8 + cw;
  const px = Math.round(W / 2 - (bw + 16) / 2), bx = px + 8;
  return {
    ly: o.ly, sound: o.sound, panel: { ...o.panel, x: px, w: bw + 16 },
    buttons: {
      new: { ...o.buttons.new, x: bx, w: bw }, cont: o.buttons.cont ? { ...o.buttons.cont, x: bx, w: bw } : null,
      help: { ...o.buttons.help, x: bx }, options: { ...o.buttons.options, x: bx + hw + 4, w: hw },
      customize: { x: bx + 2 * (hw + 4), y: o.buttons.help.y, w: cw, h: o.buttons.help.h },
    },
  };
}

/** 0350e5f's HOW TO PLAY card (title.ts drawHelp). */
function oldHelp(W: number, H: number) {
  const w = Math.min(W - 16, 300);
  const rows = HELP.reduce((n, ln) => n + wrap(ln, w - 16, "3").length, 0);
  const h = 20 + rows * 7 + HELP.length * 3 + 5;
  return { x: Math.round((W - w) / 2), y: Math.round(Math.max(20, H / 2 - h / 2)), w, h };
}

describe("intro: the title's two cruisers keep open floor between them (REQ-BFG-038)", () => {
  for (const [name, t] of Object.entries(VIEWS)) {
    it(`${name} ${t.css[0]}x${t.css[1]} @${t.dpr}: scale ${t.scale} (menu ${t.menu}), floor ${t.gap} px (was ${t.old}), clear of the title`, () => {
      const v = titleView(t.css[0], t.css[1], t.dpr);
      expect(v.menu).toBe(t.menu);
      expect(v.scale).toBe(t.scale);
      const axis = v.portrait ? v.H : v.W, axisCss = v.portrait ? t.css[1] : t.css[0];
      for (const save of [false, true]) {
        const L = titleLayout(v.W, v.H, v.portrait, save, v.k, v.css);
        expect(L.fits).toBe(true);
        // the floor between the hull boxes: titleGap's on every view of the job (TITLE_GAP_SHARE of the firing axis, or more
        // where the drawn carriers' reach would take the open water below introcheck's bar)
        expect(L.gap).toBe(t.gap);
        expect(L.gap).toBe(titleGap(axis, v.portrait, v.css));
        expect(t.gap).toBeGreaterThanOrEqual(t.old);
        expect(t.gap).toBeGreaterThanOrEqual(Math.round(axis * TITLE_GAP_SHARE));
        const share = (L.gap * v.scale) / v.dpr / axisCss;
        expect(share).toBeGreaterThanOrEqual(GAP_SHARE);
        // TITLE-1: what is left of the floor after the two drawn carriers have taken their reach (the worst of introcheck's
        // three moments of the first fight) is at least 14% of the firing axis and one CSS inch
        const reach = v.portrait ? TITLE_REACH_FLOOR.port : TITLE_REACH_FLOOR.land;
        expect(((L.gap - reach) * v.scale) / v.dpr / axisCss, "open water share").toBeGreaterThanOrEqual(TITLE_OPEN_SHARE);
        expect((L.gap - reach) * v.css, "open water CSS px").toBeGreaterThanOrEqual(TITLE_OPEN_CSS);
        const [hp, he] = L.hulls;
        expect(v.portrait ? hp.y - (he.y + he.h) : he.x - (hp.x + hp.w)).toBe(L.gap);
        // both cruisers on screen, clear of the logo band, the panel and every button, the sound button and the version
        const ui = [L.logo, L.panel, L.sound, L.version, L.buttons.new, L.buttons.help, L.buttons.options, L.buttons.customize, ...(L.buttons.cont ? [L.buttons.cont] : [])];
        for (const h of L.hulls) {
          expect(inside(h, v.W, v.H)).toBe(true);
          for (const b of ui) expect(meets(h, b)).toBe(false);
        }
        expect(!!L.buttons.cont).toBe(save);
        for (const b of ui) expect(inside(b, v.W, v.H)).toBe(true);
      }
    });
  }

  it("0350e5f's floor on the portrait phones was the leftover: below the battle's 17%, the cruisers meeting at 360x640", () => {
    const rows: string[] = [];
    for (const name of ["phone", "safari", "small"]) {
      const t = VIEWS[name];
      const v = computeView(t.css[0], t.css[1], t.dpr); // 0350e5f: the menu scale
      expect(v.scale).toBe(t.menu);
      for (const save of [false, true]) {
        const o = oldTitle(v.W, v.H, true, save);
        const gap = o.hulls[0].y - (o.hulls[1].y + o.hulls[1].h);
        rows.push(`${name} ${save ? "save" : "new"} ${gap}`);
        expect(gap).toBeLessThan(minGap(v.H));
      }
    }
    expect(rows).toEqual(["phone new 78", "phone save 50", "safari new 67", "safari save 39", "small new 22", "small save 22"]);
    // 360x640 with a saved run: NEW RUN was drawn over the player's cruiser
    const v = computeView(360, 640, 2);
    const o = oldTitle(v.W, v.H, true, true);
    expect(meets(o.hulls[0], o.buttons.new)).toBe(true);
  });

  // PRESENT-1 TITLE-1 (re-pinned; was "...keep 0350e5f's frame; where its cruisers met the panel they lift clear" with the cruisers
  // exactly 0350e5f's wherever its hull boxes missed the panel): the logo band, buttons and sound button are still 0350e5f's; the
  // panel and its buttons are 0350e5f's too, moved down by `trim` px on a short screen (the bottom margin gives way to the drawn
  // carriers' reach, never below 8 px); the cruisers are 0350e5f's box with the floor titleGap's, and lift clear of the panel by
  // their DRAWN reach (TITLE_REACH_UP/DOWN/SIDE), never into the logo band's reach (was: by their hull boxes, at most 4 px)
  it("the desk and landscape keep the menu scale and 0350e5f's rects; the floor is titleGap's; the cruisers lift clear of the panel by their drawn reach", () => {
    let checked = 0, lifted = 0, trimmed = 0;
    for (const dpr of [1, 2, 3]) {
      for (let w = 568; w <= 2560; w += 61) {
        for (let h = 320; h <= Math.min(1440, w); h += 47) {
          const v = titleView(w, h, dpr);
          if (v.portrait) continue;
          expect(v.scale).toBe(v.menu);
          for (const save of [false, true]) {
            const L = titleLayout(v.W, v.H, false, save, v.k, v.css), o = oldTitle(v.W, v.H, false, save);
            expect(L.k).toBe(1);
            // CUSTOM-2a: 0350e5f's frame with CUSTOMIZE beside HOW TO PLAY and OPTIONS (withCustomize); TITLE-1: down by `trim`
            const oldF = withCustomize(o, v.W);
            const trim = L.panel.y - oldF.panel.y;
            expect(trim).toBeGreaterThanOrEqual(0);
            expect(trim).toBeLessThanOrEqual(Math.max(8, Math.round(v.H * 0.05)) - 8);
            const down = <T extends Box | null>(b: T): T => (b ? { ...b, y: b.y + trim } : b);
            expect({ ly: L.ly, panel: L.panel, buttons: L.buttons, sound: L.sound }).toEqual({
              ly: oldF.ly, panel: down(oldF.panel), sound: oldF.sound,
              buttons: { new: down(oldF.buttons.new), cont: down(oldF.buttons.cont), help: down(oldF.buttons.help), options: down(oldF.buttons.options), customize: down(oldF.buttons.customize) },
            });
            if (trim > 0) trimmed++;
            // the cruisers: 0350e5f's box, the floor titleGap's (at most what the box holds), lifted by `lift` >= 0
            const top = Math.round(v.H * 0.08) + 40;
            const box = { x: 0, y: top, w: v.W, h: Math.max(160, v.H - top - (save ? 90 : 62) - 14) };
            const base = arenaIn(box, false, Math.min(titleGap(v.W, false, v.css), box.w - 2 * HULL_L - 12));
            const lift = base.hulls[0].y - L.hulls[0].y;
            expect(lift).toBeGreaterThanOrEqual(0);
            expect(L.hulls).toEqual(base.hulls.map((hb) => ({ ...hb, y: hb.y - lift })));
            expect(L.frames).toEqual(base.frames.map((f) => ({ ...f, dy: f.dy - lift })));
            const reachBox = (hb: Box): Box => ({ x: hb.x - TITLE_REACH_SIDE, y: hb.y - TITLE_REACH_UP, w: hb.w + 2 * TITLE_REACH_SIDE, h: hb.h + TITLE_REACH_UP + TITLE_REACH_DOWN + TITLE_CLEAR_PANEL });
            if (!base.hulls.some((hb) => meets(reachBox(hb), L.panel))) {
              expect(lift).toBe(0); // the reach missed the panel: the cruisers stay where 0350e5f's box puts them
            } else {
              // lifted until the reach clears the panel, or as far as the logo band's reach allows (none, where the cruisers already stand within it)
              expect(!L.hulls.some((hb) => meets(reachBox(hb), L.panel)) || L.hulls[0].y - TITLE_REACH_UP <= L.logo.y + L.logo.h).toBe(true);
              if (lift > 0 && L.hulls.some((hb) => meets(reachBox(hb), L.panel))) expect(L.hulls[0].y - TITLE_REACH_UP).toBe(L.logo.y + L.logo.h);
              if (lift > 0) lifted++;
            }
            expect(meets(L.hulls[0], L.logo)).toBe(false);
            if (v.menu >= 2) expect(L.fits).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(800);
    expect(lifted).toBeGreaterThan(10);
    expect(trimmed).toBeGreaterThan(5);
  });

  it("a portrait screen that keeps the menu scale keeps 0350e5f's logo, panel, buttons and sound button", () => {
    let kept = 0;
    for (const dpr of [1, 2, 3]) {
      for (let w = 320; w <= 1200; w += 37) {
        for (let h = Math.ceil(w * 1.1); h <= 2000; h += 53) {
          const v = titleView(w, h, dpr);
          if (!v.portrait || v.scale !== v.menu) continue;
          for (const save of [false, true]) {
            const L = titleLayout(v.W, v.H, true, save, v.k, v.css), o = oldTitle(v.W, v.H, true, save);
            // CUSTOM-2a: 0350e5f's frame with CUSTOMIZE beside HOW TO PLAY and OPTIONS (withCustomize)
            expect({ ly: L.ly, panel: L.panel, buttons: L.buttons, sound: L.sound }).toEqual(withCustomize(o, v.W));
            kept++;
          }
        }
      }
    }
    expect(kept).toBeGreaterThan(20);
  });

  it("no title button shrinks: each is at least as tall and as wide in CSS px as 0350e5f drew it, on every view", () => {
    let checked = 0, stepped = 0;
    for (const dpr of [1, 2, 3]) {
      for (let w = 320; w <= 2560; w += 89) {
        for (let h = 320; h <= 2000; h += 71) {
          const v = titleView(w, h, dpr);
          const css = v.scale / dpr, oldCss = v.menu / dpr;
          const old = computeView(w, h, dpr);
          if (v.scale < v.menu) stepped++;
          for (const save of [false, true]) {
            const L = titleLayout(v.W, v.H, v.portrait, save, v.k, v.css), o = oldTitle(old.W, old.H, old.portrait, save);
            const pairs: [Box | null, Box | null][] = [[L.buttons.new, o.buttons.new], [L.buttons.cont, o.buttons.cont], [L.buttons.help, o.buttons.help], [L.buttons.options, o.buttons.options], [L.sound, o.sound]];
            for (const [n, b] of pairs) {
              if (!n || !b) continue;
              expect(n.h * css).toBeGreaterThanOrEqual(b.h * oldCss - 1e-9);
              expect(n.w * css).toBeGreaterThanOrEqual(b.w * oldCss - 1e-9);
            }
            // CUSTOM-2a: CUSTOMIZE, as tall as HOW TO PLAY, its word whole, in the panel, clear of HOW TO PLAY and OPTIONS
            const c = L.buttons.customize;
            expect(c.h).toBe(L.buttons.help.h);
            expect(c.w).toBeGreaterThanOrEqual(Math.max(CUSTOMIZE_MIN, textWidth("CUSTOMIZE", "3") + 4));
            expect(c.x >= L.panel.x && c.x + c.w <= L.panel.x + L.panel.w && c.y + c.h <= L.panel.y + L.panel.h).toBe(true);
            expect(meets(c, L.buttons.help) || meets(c, L.buttons.options)).toBe(false);
            expect(L.panel.x >= 0 && L.panel.x + L.panel.w <= v.W).toBe(true);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1500);
    expect(stepped).toBeGreaterThan(100);
  });

  it("the title steps its scale down only where the floor needs it, never below one CSS px per logical px", () => {
    let fits = 0, floorOnly = 0;
    for (const dpr of [1, 2, 3]) {
      for (let w = 320; w <= 2560; w += 89) {
        for (let h = 320; h <= 2000; h += 71) {
          const v = titleView(w, h, dpr);
          const least = Math.min(v.menu, Math.max(1, Math.ceil(dpr)));
          expect(v.scale).toBeLessThanOrEqual(v.menu);
          expect(v.scale).toBeGreaterThanOrEqual(least);
          // with CONTINUE showing (the taller panel), the scale picked fits, or it is the floor (nothing above it fits)
          const L = titleLayout(v.W, v.H, v.portrait, true, v.k, v.css);
          if (L.fits) fits++;
          else {
            expect(v.scale).toBe(least);
            floorOnly++;
          }
          // the menu scale is kept wherever it fits
          const atMenu = titleLayout(Math.floor(v.pw / v.menu), Math.floor(v.ph / v.menu), v.portrait, true, 1, v.menu / dpr);
          if (atMenu.fits) expect(v.scale).toBe(v.menu);
          // a larger scale than the one picked never fits (the title takes the largest that does)
          for (let s = v.scale + 1; s <= v.menu; s++) expect(titleLayout(Math.floor(v.pw / s), Math.floor(v.ph / s), v.portrait, true, v.menu / s, s / dpr).fits).toBe(false);
        }
      }
    }
    // 1,872 views: all but the smallest portrait screens fit (those 21 are under ~540 CSS px tall at one CSS px per px,
    // e.g. 320x462, and keep the menu scale, as 0350e5f did; and 6 tiny landscape ones at scale 1)
    // CUSTOM-2a (REQ-BFG-072, Q5): 24: CUSTOMIZE's slot widens the panel, and on three landscape windows only 320 CSS px
    // tall at DPR 1 (765, 854 and 943 wide; scale 1, the floor) the cruisers' boxes now meet its corners (one such window,
    // 1032 wide, fits now); every phone keeps its scale and its floor (REPORT section 7)
    expect(fits + floorOnly).toBe(1872);
    expect(floorOnly).toBeLessThanOrEqual(24);
  });

  it("only screens too small for any readable scale keep a floor under the battle's 17%", () => {
    for (const [w, h, dpr] of [[320, 462, 3], [320, 462, 2], [409, 533, 3], [320, 320, 1]] as const) {
      const v = titleView(w, h, dpr);
      expect(v.scale).toBe(Math.min(v.menu, Math.ceil(dpr)));
      expect(titleLayout(v.W, v.H, v.portrait, true, v.k, v.css).fits).toBe(false);
      // one scale smaller would fit, but below one CSS px per logical px
      if (v.scale > 1) expect(titleLayout(Math.floor(v.pw / (v.scale - 1)), Math.floor(v.ph / (v.scale - 1)), v.portrait, true, v.menu / (v.scale - 1), (v.scale - 1) / dpr).fits).toBe(true);
    }
  });

  it("the HOW TO PLAY card: 0350e5f's at k = 1; where the scale steps down, as wide in CSS px, the 5x7 face, on screen", () => {
    for (const [name, t] of Object.entries(VIEWS)) {
      const v = titleView(t.css[0], t.css[1], t.dpr);
      const old = computeView(t.css[0], t.css[1], t.dpr);
      const c = helpCard(v.W, v.H, v.k, HELP), o = oldHelp(old.W, old.H);
      expect(inside(c, v.W, v.H), name).toBe(true);
      const css = v.scale / t.dpr, oldCss = v.menu / t.dpr;
      if (v.k === 1) {
        expect({ x: c.x, y: c.y, w: c.w, h: c.h, font: c.font }).toEqual({ ...o, font: "3" });
      } else {
        expect(c.font).toBe("5");
        expect(c.w * css).toBeGreaterThanOrEqual(o.w * oldCss - 1e-9);
        // the text's cap height: the 5x7 face at the title's scale against the 3x5 face at the menu scale (at least 90%)
        expect(7 * css).toBeGreaterThanOrEqual(0.9 * 5 * oldCss);
      }
    }
  });
});
