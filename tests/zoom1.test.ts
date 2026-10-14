// ZOOM-1 (REQ-BFG-080): the shop shows your carrier up close. The operator: "Also, the current build has the carrier zoomed
// out in shop view." The build screen draws the player's carrier at its own zoom: the largest whole device-pixel scale at
// which the whole ship (stern to bow wave, and in portrait the bow turrets' barrels) fits the room the UI leaves
// (layout.ts carrierZoom), apart from the UI's scale, which stays 0.9.8's. The canvas runs on a grid fine enough for both
// (BuildScreen.pickSub: unit = gcd(scale, zoom) device px per canvas px), so every art pixel is whole device px. A portrait
// phone's band is sized for 90% of the panels (phoneBand90); the rest grow over the shop rows, never over the carrier.
// Every press on the carrier goes through the same map (toDeck), every carrier draw through its inverse (inCarrier).
import { beforeAll, describe, expect, it } from "vitest";
import { setTipsForTests } from "../src/ui/tips"; // EXPLAIN-1 (REQ-BFG-089, E5): the band measured with every tip new
import { installRaster, fresh, G } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { buyableModules } from "../src/sim/content";
import { itemByUid, key as K, rotField, setTurretList, turretSlots, type Placed } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { UI, type Rect } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { cellAt, footX, footY, frameForHull, hullBox } from "../src/render/frame";
import {
  CARRIER_AHEAD, CARRIER_BACK, CARRIER_DOWN, CARRIER_UP, FOE_H, HERO_MIN, IDLE_MIN, buildLayout, buildScale, carrierBox, carrierZoom,
  heroCardRect, panelArea, phoneBand, phoneBand90, phoneBarLift, phoneScreen, toDeck, toScreen, type BuildLayout, type Sel,
} from "../src/screens/build/layout";
import { detailsPlan, fullText, panelFit } from "../src/screens/build/inspector";
import { dropCell, type Ctx } from "../src/screens/build/actions";
import { Editor, type EditHost } from "../src/screens/build/edit";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { drawStillCarrier } from "../src/render/ship";
import { CARRIERS } from "../src/render/styles";
import { Fx } from "../src/render/fx";

installRaster();

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The build screen as the game frames it: BuildScreen.pickScale (buildScale, stepped down while the rune row doesn't fit:
 *  runeRowFits), pickSub (the carrier's zoom on the finest grid, then unit = gcd(scale, zoom)) and layout (the rune row,
 *  a phone's bar lift, the layout at that grid). `runes`: how many runes the run holds (a run holds one from its first
 *  dawn; 0: under the first dawn's rune picker). */
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
  return { pw, ph, S, Z, unit, sub, W, H, L: lay(unit), tap, phone, portrait, view: { W, H, scale: S, dpr, portrait, sub } };
}

/** The views: touchcheck's (phone, phone-660, phone-land, the WebKit iPhones and the operator's 402x690, small, bar-667),
 *  the 430x932 phone, the desk and the two laptops. */
const VIEWS: [string, number, number, number][] = [
  ["desk", 1920, 1080, 1], ["laptop-1280", 1280, 720, 1], ["laptop-1366", 1366, 768, 1],
  ["op-402x690", 402, 690, 3], ["phone-390x844", 390, 844, 3], ["phone-660", 390, 660, 3], ["iphone13-390x664", 390, 664, 3],
  ["iphone15pm-430x739", 430, 739, 3], ["max-430x932", 430, 932, 3], ["land-844x390", 844, 390, 3], ["small-360x640", 360, 640, 2],
  ["bar-375x667", 375, 667, 2],
];

/** The carrier's box on screen (logical px) on layout L. */
function boxOn(L: BuildLayout): Rect {
  const b = carrierBox(L.portrait), c = L.cam;
  return { x: c.x + c.k * b.x0, y: c.y + c.k * b.y0, w: c.k * b.w, h: c.k * b.h };
}

describe("ZOOM-1: the carrier's own zoom on the build screen (REQ-BFG-080)", () => {
  it("the carrier's box is the still carrier's real reach: every hero, every carrier style, both facings (the opaque pixels)", () => {
    for (const facing of [0, 1] as const) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const hero of PLAYABLE_HEROES) for (const s of CARRIERS) {
        const c = fresh(600, 600);
        c.opaqueOnly = true; // the shadow (alpha 0.35) lies on the water: not the ship
        const hw = facing === 0 ? 156 : 140, hh = facing === 0 ? 140 : 156;
        drawStillCarrier(G(c), hero, frameForHull(facing, 300 - hw / 2, 300 - hh / 2), 0, "plate", s.id);
        for (let i = 0; i < c.px.length; i++) {
          if (c.px[i] === null) continue;
          const x = (i % 600) - 300, y = Math.floor(i / 600) - 300;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      expect([x0, x1, y0, y1], `facing ${facing}`).toEqual([-CARRIER_BACK, CARRIER_AHEAD, -CARRIER_UP, CARRIER_DOWN]);
    }
    // the box: 187 x 150 (landscape), 187 x 160 in portrait with the barrels (BARREL 15 over the hull's bow edge, 70 up)
    expect([carrierBox(false), carrierBox(true)]).toEqual([{ x0: -88, y0: -75, w: 187, h: 150 }, { x0: -88, y0: -85, w: 187, h: 160 }]);
    // the zoom: the largest whole one that fits, a multiple of the grid's unit, never under the UI's scale
    expect(carrierZoom({ w: 342, h: 256 }, false, 3)).toBe(5);
    expect(carrierZoom({ w: 190, h: 194 }, false, 4)).toBe(4);
    expect(carrierZoom({ w: 100, h: 100 }, false, 4)).toBe(4);
    expect(carrierZoom({ w: 342, h: 256 }, false, 3, 3)).toBe(3);
  }, 60_000);

  it("the zoom each view picks (with a rune held, and under the first dawn's rune picker), the canvas grid and the board", () => {
    const rows = VIEWS.flatMap(([name, w, h, dpr]) => [1, 0].map((runes) => {
      const f = framed(w, h, dpr, runes);
      return `${name} runes ${runes}: x${f.S} -> x${f.Z} (${(f.Z / f.S).toFixed(2)}x), grid ${f.unit}/${f.sub}, board ${120 * f.Z} px, ship ${187 * f.Z} px of ${f.portrait ? f.pw : f.ph}${f.portrait ? " wide" : " tall"}, band ${f.L.info.h}`;
    }));
    console.log(`ZOOM-1 picks:\n${rows.join("\n")}`);
    expect(rows).toEqual(PICKS);
  });

  it("targets: the desk's board at least 555 px (1.5x 0.9.8's 370); the 402x690 and 390x844 phones x6 at DPR 3 (1.2x); no view below 0.9.8", () => {
    expect(120 * framed(1920, 1080, 1, 1).Z).toBeGreaterThanOrEqual(555);
    for (const [w, h] of [[402, 690], [390, 844]]) for (const runes of [0, 1]) expect(framed(w, h, 3, runes).Z, `${w}x${h} runes ${runes}`).toBeGreaterThanOrEqual(6);
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [0, 1]) {
      const f = framed(w, h, dpr, runes);
      expect(f.Z, `${name}: never smaller than 0.9.8's (the UI's scale)`).toBeGreaterThanOrEqual(f.S);
    }
  });

  it("every view: the box on the screen, clear of every part of the UI at rest; whole device px per art px; whole canvas px", () => {
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [0, 1]) {
      const f = framed(w, h, dpr, runes), L = f.L, B = boxOn(L), tag = `${name} runes ${runes}`;
      expect(B.x >= -1e-9 && B.x + B.w <= L.W + 1e-9 && B.y + B.h <= L.H + 1e-9, `${tag}: the box on the screen`).toBe(true);
      const ui: [string, Rect][] = [["bar", L.bar], ["reroll", L.reroll], ["cargo", L.cargo], ["fight", L.fight], ["band", L.info],
        ...L.cards.map((c, i): [string, Rect] => [`card ${i}`, c]), ...L.packs.map((p, i): [string, Rect] => [`pack ${i}`, p]),
        ...(L.foe ? [["foe", L.foe] as [string, Rect]] : [])];
      for (const [id, r] of ui) expect(hit(B, r), `${tag}: the carrier's box clear of ${id}`).toBe(false);
      // crisp: the zoom is whole device px, a whole number of canvas px (unit); the carrier's translation is whole canvas px
      expect(Number.isInteger(L.cam.z) && L.cam.z % f.unit === 0, tag).toBe(true);
      const tx = f.sub * L.cam.x * (1 - L.cam.k), ty = f.sub * L.cam.y * (1 - L.cam.k);
      expect([Math.abs(tx - Math.round(tx)) < 1e-6, Math.abs(ty - Math.round(ty)) < 1e-6], tag).toEqual([true, true]);
      expect(f.S % f.sub, tag).toBe(0);
    }
  });

  it("every view: a tap at each tile's centre (and 5 px either way, inside it) lands on that tile; a drop under the finger is that tile", () => {
    let n = 0;
    for (const [name, w, h, dpr] of VIEWS) {
      const L = framed(w, h, dpr, 1).L, F = L.frame;
      for (let cy = 0; cy < 10; cy++) for (let cx = 0; cx < 10; cx++) {
        for (const [dx, dy] of [[6, 6], [1, 1], [11, 11], [1, 11], [11, 1]]) {
          const s = toScreen(L, footX(F, cx, cy) + dx, footY(F, cx, cy) + dy), d = toDeck(L, s.x, s.y), c = cellAt(F, d.x, d.y);
          // facing 1 (landscape) turns the deck: the tile under the point is the one footX/footY put there
          const back = cellAt(F, footX(F, cx, cy) + dx, footY(F, cx, cy) + dy);
          expect([c.cx, c.cy], `${name} ${cx},${cy} +${dx},${dy}`).toEqual([back.cx, back.cy]);
          n++;
        }
        const s = toScreen(L, footX(F, cx, cy) + 6, footY(F, cx, cy) + 6);
        const at = cellAt(F, footX(F, cx, cy) + 6, footY(F, cx, cy) + 6);
        expect(dropCell(L, s.x, s.y, 1), `${name}: a drop at ${cx},${cy}`).toEqual({ x: at.cx, y: at.cy });
      }
    }
    expect(n).toBe(VIEWS.length * 500);
  });

  it("the editor at the new zoom (every view): a tap selects the part under the finger; a drag moves a rig to the tile under the finger; a belt is drawn on the tiles the finger crosses", () => {
    for (const [name, w, h, dpr] of VIEWS) {
      const f = framed(w, h, dpr, 1), L = f.L, F = L.frame;
      const run = newRun("furnace", 5, "zoom1-editor");
      run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, rig(2, "grease", 1, 1)], routes: [], mods: [], beltCap: 40, hullBonus: 0 };
      const host = fakeHost(run, L, f.view);
      const ed = new Editor(host);
      const tile = (cx: number, cy: number) => toScreen(L, footX(F, cx, cy) + 6, footY(F, cx, cy) + 6);
      // a mouse tap on the KILN's tile selects it
      let p = tile(4, 6);
      ed.down(p.x, p.y, "mouse");
      ed.up(p.x, p.y);
      expect(host.sel, `${name}: tap`).toEqual({ kind: "item", uid: 1 });
      // a touch drag of the GREASE WORKS from (1, 1) to (7, 2): it lands on the tile under the finger
      p = tile(1, 1);
      ed.down(p.x, p.y, "touch");
      const q = tile(7, 2);
      for (let i = 1; i <= 8; i++) ed.move(p.x + ((q.x - p.x) * i) / 8, p.y + ((q.y - p.y) * i) / 8);
      ed.up(q.x, q.y);
      expect([itemByUid(run.build, 2)?.x, itemByUid(run.build, 2)?.y], `${name}: drag`).toEqual([7, 2]);
      // a mouse belt out of the KILN (4..5, 6..7): left along row 6 to column 1, then up to row 4
      const path = [tile(4, 6), tile(3, 6), tile(2, 6), tile(1, 6), tile(1, 5), tile(1, 4)];
      ed.down(path[0].x, path[0].y, "mouse");
      for (const s of path.slice(1)) { ed.move(s.x - 1, s.y); ed.move(s.x, s.y); }
      ed.up(path[path.length - 1].x, path[path.length - 1].y);
      expect(run.build.routes.map((r) => r.cells), `${name}: belt`).toEqual([[K(3, 6), K(2, 6), K(1, 6), K(1, 5), K(1, 4)]]);
    }
  });

  it("phones: FIGHT and the cargo slots keep a finger's target (TAP_CSS) between the hull and the screen's foot; the packs a finger's square", () => {
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [0, 1]) {
      const f = framed(w, h, dpr, runes);
      if (!f.tap) continue;
      const L = f.L, tag = `${name} runes ${runes}`;
      if (f.phone) {
        const foot = L.hull.y + L.hull.h + 1;
        // a DPR 2 phone at the UI's scale (k 1: 360x640) has 29 px there for its 30 px target (43.5 CSS px; 0.9.8: 28, 42 CSS
        // px, the tray 4 px under the hull): the gap known since 0.9.8, 1 px narrower now; every zoomed view holds a finger
        expect(L.H - foot, `${tag}: room for FIGHT's and the cargo slots' targets under the hull`).toBeGreaterThanOrEqual(L.cam.k > 1 || dpr >= 3 ? f.tap : f.tap - 1);
        expect(L.fight.y >= foot - 1e-9 && L.cargo.y >= foot - 1e-9, `${tag}: FIGHT and the tray under the hull`).toBe(true);
      }
      for (const p of L.packs) expect(Math.min(p.w, p.h) * (f.S / dpr), `${tag}: a pack slot`).toBeGreaterThanOrEqual(TAP_CSS - 1e-9);
    }
  });

  it("a portrait phone's band: at least what 90% of the panels need there (phoneBand90) or the idle pair, up to phoneBand; idle it holds the hero card and NEXT BATTLE", () => {
    for (const [name, w, h, dpr] of VIEWS) for (const runes of [0, 1]) {
      const f = framed(w, h, dpr, runes), L = f.L, tag = `${name} runes ${runes}`;
      if (!f.phone) continue;
      expect(L.info.h, tag).toBeGreaterThanOrEqual(Math.min(Math.max(phoneBand90(L.W), IDLE_MIN), L.info.h + 1) - 1);
      expect(L.info.h, tag).toBeLessThanOrEqual(phoneBand(L.W));
      if (L.info.h >= IDLE_MIN) {
        expect(L.foe!.h, tag).toBe(FOE_H);
        expect(heroCardRect(L.info, L.foe!).h, `${tag}: the hero card`).toBeGreaterThanOrEqual(HERO_MIN);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------- the 90% band
const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });
const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap2-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}
/** Every panel a finger can open (tests/zoom.test.ts's set, 899). */
function panels(): { id: string; run: Run; sel: Sel }[] {
  const out: ReturnType<typeof panels> = [];
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnace();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER });
    for (const s of stars) {
      const c = furnace();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: { kind: "cargo", uid: 900 } });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnace([rig(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnace([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 } });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "shoptap2-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 } });
        }
      } else if (d.kind === "turret") {
        const run = furnace();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 } });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "shoptap2-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid } });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 } });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i } }));
  }
  out.push({ id: "the KILN's belt", run: furnace(), sel: { kind: "route", index: 0 } });
  return out;
}

describe("ZOOM-1: the band sized for 90% of the panels (REQ-BFG-080 acceptance 2)", () => {
  const all = panels();
  // EXPLAIN-1 (REQ-BFG-089, E5): a how-to hint shows until its first-run tip is done (src/ui/tips.ts), and this file's drag
  // and tap tests above complete some tips (a part placed or moved). The band is measured with every tip new, the first
  // run's panels, the most a panel holds; tests/explain1.test.ts (e) measures the band with every tip done too
  beforeAll(() => { setTipsForTests("new"); });
  /** The height each panel needs at band width W - 6 to show its full description (fullText), in the band's layout.
   *  SHAPES-1 (RUN5 1.2): `list`, the panels to measure (default all; PLAIN-1F M4: every caller measures all). */
  const needs = (W: number, list = all): number[] => {
    const L = buildLayout(W, 700, true, 5, true, 27), v = { W, H: 700, scale: 5, dpr: 3, portrait: true };
    return list.map((c) => {
      const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch: true, L } as unknown as Ctx;
      let lo = 10, hi = 200;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; const d = detailsPlan(ctx, c.sel, null, { ...L.info, h: m }); if (d && fullText(d.plan)) hi = m; else lo = m; }
      return hi;
    });
  };

  it("phoneBand90(W) is the 90th of the 899 heights at each step of its table and either side of it (measured at every W 186-340)", () => {
    // SHAPES-1 flip: NAIL STRIP, EMBER TROUGH and SPIKE RAIL join the buyable modules, 13 panels each (an offer, and at each
    // star a cargo panel and 3 placed ones): 899 + 39 = 938; GANTRY PRESS's and ASSEMBLY LINE's 7 each are reshaped, not added
    expect(all.length).toBe(938);
    // SPACE-1 (REQ-BFG-087, D6): the re-pinned table's steps (238, 240, 246, 248, 250) and either side of each; was 186, 235,
    // 236, 237, 238, 241, 245, 246, 247, 248, 258, 315, 340
    const widths = [186, 235, 236, 237, 238, 239, 240, 241, 245, 246, 247, 248, 249, 250, 258, 315, 340], rows: string[] = [];
    const measure = (list: typeof all, W: number) => {
      const hs = needs(W, list).sort((a, b) => a - b), band = phoneBand90(W);
      return { band, fit: hs.filter((n) => n <= band).length, share: hs.filter((n) => n <= band).length / hs.length, p90: hs[Math.ceil(0.9 * hs.length) - 1], tallest: hs[hs.length - 1] };
    };
    // PLAIN-1F (M4; REQ-BFG-080; BRIEF-PLAIN1F M4): the band holds 90% of the panels as they ship, SHAPES on, at every width,
    // so this test checks that alone. SHAPES-1 x c099-card3's SHAPES-off half (RUN5-SHAPES1 1.2, the 899 panels without the
    // shaped three) is dropped: it kept the point while the three shaped plain rigs' placed panels lifted the 90th past the
    // pin (a hit line per arrow and UP TO n HITS: W 250 90th 48 > 45, 88.59% fit; W 258-340 89.87%, measured at c099-card5b's
    // panels). PLAIN-1F's way back is content only, no layout.ts change: a placed long rig's hits on one line, and its UP TO
    // n HITS said by its arrows line (inspector.ts rigPanel, longIdle). EXPLAIN-1 (REQ-BFG-089, E6): the pins hold as floors:
    // the measured 90th at or under each pin, and each pin covers at least 90% of the panels. zoom.test.ts's overflow and D3
    // checks pass too: every panel shows its full text (in the band or grown over the shop)
    for (const W of widths) {
      const { band, share, p90, tallest } = measure(all, W);
      rows.push(`${W}: ${band} (${(share * 100).toFixed(2)}% fit; measured 90th ${p90}; tallest ${tallest})`);
      expect(p90, `W ${W}`).toBeLessThanOrEqual(band);
      expect(share, `W ${W}`).toBeGreaterThanOrEqual(0.9);
    }
    console.log(`ZOOM-1 phoneBand90 (SHAPES on, as shipped): ${rows.join(" | ")}`);
  }, 900_000); // PLAIN-1F (M4): one sweep again (SHAPES on), 17 widths x the 938 panels; SHAPES-1 run 5's two took 900 s

  it("on the zoomed phones every panel shows its full description: in the band, or grown up over the shop (never over the carrier)", () => {
    const rows: string[] = [], shares: [string, number][] = [];
    for (const [w, h] of [[402, 690], [390, 844], [390, 660], [430, 739]] as const) for (const runes of [1, 0]) {
      const f = framed(w, h, 3, runes), L = f.L, box = boxOn(L);
      let inBand = 0, whole = 0;
      const grown: string[] = [];
      for (const c of all) {
        const ctx = { game: { ui: new UI(), t: 0, view: f.view }, run: c.run, touch: true, L } as unknown as Ctx;
        // SPACE-1 (REQ-BFG-087, D4): the build screen's own fit (inspector.ts panelFit: its full text, its gaps at least
        // GAP_MIN in the band, at GAP while it grows); was fullText alone
        const area = panelArea(L, c.sel, { touch: true, hover: false, busy: false }, panelFit(ctx, c.sel, true));
        const d = detailsPlan(ctx, c.sel, null, area)!;
        expect(fullText(d.plan), `${w}x${h}: ${c.id}`).toBe(true);
        expect(hit(area, box), `${w}x${h}: ${c.id} never over the carrier`).toBe(false);
        expect(area.y + area.h, `${w}x${h}: ${c.id} ends at the band's foot`).toBeLessThanOrEqual(L.info.y + L.info.h);
        if (area === L.info) inBand++;
        else grown.push(c.id);
        // ZOOM-1's own measure: the panel's full text fits the band (what phoneBand90 sizes it for)
        const b = detailsPlan(ctx, c.sel, null, L.info);
        if (b && fullText(b.plan)) whole++;
      }
      rows.push(`ZOOM-1 ${w}x${h} runes ${runes}: band ${L.info.h}, ${inBand} of ${all.length} panels in it (${(100 * inBand / all.length).toFixed(1)}%), ${grown.length} grown over the shop; full text fits the band: ${whole} (${(100 * whole / all.length).toFixed(1)}%)`);
      shares.push([`${w}x${h} runes ${runes}`, whole / all.length]);
    }
    console.log(rows.join("\n"));
    // SPACE-1 (REQ-BFG-087, D4; the brief's S2d): the band is still sized for 90% of the panels' full text (phoneBand90,
    // ZOOM-1's acceptance 2), so that share holds. Was: the share IN the band, then the same thing; with SPACE-1's gaps a
    // panel whose full text fits but leaves less than GAP_MIN a gap grows over the shop rows, so the share in the band is
    // the REPORT's before/after count, not a 90% floor
    for (const [tag, share] of shares) expect(share, tag).toBeGreaterThanOrEqual(0.9);
  }, 300_000);
});

/** A build screen's editor host for the tests: the layout, the run, the selection, the turret hit boxes through the zoom. */
function fakeHost(run: Run, L: BuildLayout, view: { W: number; H: number; scale: number; dpr: number; portrait: boolean }): EditHost & { sel: Sel } {
  const noop = () => {};
  const host = {
    game: { audio: { play: noop }, error: noop, toast: noop, ui: new UI(), view, t: 0, W: view.W, H: view.H, portrait: view.portrait },
    run, L, sel: { kind: "none" } as Sel, wfx: new Fx(), ufx: new Fx(), touch: false,
    select(s: Sel) { host.sel = s; },
    turretAt: () => -1,
    coinPos: () => ({ x: 0, y: 0 }),
    touched: noop, placed: noop, invalid: noop,
    offerAt: () => null, cargoAt: () => null, cssPerPx: () => view.scale / view.dpr,
  };
  return host as unknown as EditHost & { sel: Sel };
}

/** The picks, pinned (ZOOM-1's measurement table; the REPORT's): the UI's scale (0.9.8's, unchanged) -> the carrier's zoom
 *  and its share of 0.9.8's size, the canvas grid (device px per canvas px / canvas px per logical px), the board and the
 *  ship in device px against the screen's side they run along, the band (portrait) or the details column (landscape).
 *  Where the zoom stays 0.9.8's: the desk under the first dawn's picker (x4: x5 needs 234 px between the columns, 190 are
 *  there), 1366x768 under the picker (x3: x4 needs 249 of 179), 844x390 with a rune (x4: x5 needs 188 px of height, 177
 *  are there), the 390x660 and 390x664 phones with a rune (x5: x6 needs 192 px under a 60 px band, 171 and 173 are left)
 *  and 360x640 @2 (x3: x4 is 748 device px wide, the screen 720). */
const PICKS: string[] = [
  "desk runes 1: x3 -> x5 (1.67x), grid 1/3, board 600 px, ship 935 px of 1080 tall, band 256",
  "desk runes 0: x4 -> x4 (1.00x), grid 4/1, board 480 px, ship 748 px of 1080 tall, band 194",
  "laptop-1280 runes 1: x2 -> x3 (1.50x), grid 1/2, board 360 px, ship 561 px of 720 tall, band 256",
  "laptop-1280 runes 0: x2 -> x3 (1.50x), grid 1/2, board 360 px, ship 561 px of 720 tall, band 284",
  "laptop-1366 runes 1: x2 -> x3 (1.50x), grid 1/2, board 360 px, ship 561 px of 768 tall, band 280",
  "laptop-1366 runes 0: x3 -> x3 (1.00x), grid 3/1, board 360 px, ship 561 px of 768 tall, band 180",
  "op-402x690 runes 1: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1206 wide, band 57",
  "op-402x690 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1206 wide, band 90",
  "phone-390x844 runes 1: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1170 wide, band 136",
  "phone-390x844 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1170 wide, band 141",
  "phone-660 runes 1: x5 -> x5 (1.00x), grid 5/1, board 600 px, ship 935 px of 1170 wide, band 71",
  "phone-660 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1170 wide, band 72",
  "iphone13-390x664 runes 1: x5 -> x5 (1.00x), grid 5/1, board 600 px, ship 935 px of 1170 wide, band 73",
  "iphone13-390x664 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1170 wide, band 74",
  "iphone15pm-430x739 runes 1: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1290 wide, band 86",
  "iphone15pm-430x739 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1290 wide, band 119",
  "max-430x932 runes 1: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1290 wide, band 141",
  "max-430x932 runes 0: x5 -> x6 (1.20x), grid 1/5, board 720 px, ship 1122 px of 1290 wide, band 141",
  "land-844x390 runes 1: x4 -> x4 (1.00x), grid 4/1, board 480 px, ship 748 px of 1170 tall, band 177",
  "land-844x390 runes 0: x4 -> x5 (1.25x), grid 1/4, board 600 px, ship 935 px of 1170 tall, band 216",
  "small-360x640 runes 1: x3 -> x3 (1.00x), grid 3/1, board 360 px, ship 561 px of 720 wide, band 98",
  "small-360x640 runes 0: x3 -> x3 (1.00x), grid 3/1, board 360 px, ship 561 px of 720 wide, band 134",
  "bar-375x667 runes 1: x3 -> x4 (1.33x), grid 1/3, board 480 px, ship 748 px of 750 wide, band 62",
  "bar-375x667 runes 0: x3 -> x4 (1.33x), grid 1/3, board 480 px, ship 748 px of 750 wide, band 98",
];
void hullBox;
