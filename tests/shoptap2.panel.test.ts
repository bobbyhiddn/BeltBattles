// shoptap2 (BeltBattles 0.8.0 phone controls, follow-up; REQ-BFG-034, REQ-BFG-035): on the operator's iPhone a tap on a
// shop card or a carrier part opened no description. The page sizes itself to the browser's viewport (innerWidth x
// innerHeight), and a phone's browser never gives it the whole screen: Safari's toolbars leave a 390x844 iPhone 390x664
// (Playwright's iPhone 13), iOS 26's Compact tab bar about 390x700 (an iPhone 16 Pro measures 402x718). The portrait band
// where the details panel goes gets what is left once the shop, the bow, the hull and the cargo tray have theirs: 40 px
// at 390x664, 8 px at 390x700 (drawDetails draws nothing under 14), against the 69 px of the 390x844 viewport every
// earlier check used. A finger's panel is now never shorter than that 69 px band, and taller where its kept text needs it
// (layout.ts panelArea, panelRect): grown over the bow for a shop card (the card stays in sight to drag), over the shop for
// anything else (the deck stays in sight to tap). Here: the rect on every portrait phone view, the decision (a finger's
// selection only; never the mouse, a hover, a drag or landscape), every touch panel's description whole in it on the short
// views and on every build-screen width a phone can have, and the belt X clear of it.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { newRun, type Run } from "../src/game/run";
import { ITEMS, buyableModules } from "../src/sim/content";
import { key as K, kx, ky, rotField, setTurretList, turretSlots, type Build, type Placed } from "../src/sim/deck";
import { fusible } from "../src/sim/stars";
import { computeView } from "../src/core/io";
import { UI } from "../src/ui/ui";
import { TAP_CSS } from "../src/ui/tap";
import { PANEL_STEP, PORT_BAND, buildLayout, buildScale, panelArea, panelRect, type BuildLayout, type Sel } from "../src/screens/build/layout";
import { detailsPlan, keptWhole, overhang, visibleLines } from "../src/screens/build/inspector";
import { beltXSide, placeBeltX } from "../src/screens/build/beltx";
import { SHOWCASE } from "../src/tooling";
import { heroStartBuild, PLAYABLE_HEROES } from "../src/sim/heroBuilds";
import { turretPivotX, turretPivotY } from "../src/render/cruiser";
import { footX, footY } from "../src/render/frame";
import type { Ctx } from "../src/screens/build/actions";

installRaster();

type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a: R, b: R) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

/** bb-0.8.6 (PACKS P5; oracle b24d14b979bbded9 (5)): 0.8.5's buildScale without the dpr, verbatim (the scale before the
 *  phone cap and before the pack-row guard). The guard now draws these views one step smaller wherever this scale can't
 *  hold the pack row and NEXT BATTLE (390x700 @3: x7 -> x6, 167x300 -> 195x350; output-packs/CHANGED-ASSERTIONS.md), so
 *  some of these legacy short bands no view produces any more; this file keeps measuring shoptap2's short-band fallback
 *  on them. */
function legacyScale(pw: number, ph: number, portrait: boolean): number {
  void buildScale; // the game's scale; see above
  for (let s = 12; s > 1; s--) {
    const W = Math.floor(pw / s), H = Math.floor(ph / s);
    if (!portrait && W >= 430 && H >= 14 + 6 + 46 + 4 + 156 + 3 + 22 + 2) return s;
    if (portrait && W >= 156 + 4 && H >= 14 + 3 + 2 * 42 + 3 + 2 + 15 + 2 + 140 + 4 + 22 + 3) return s;
  }
  return 1;
}

/** The build screen on a phone view: its own scale (buildScale), its layout with five offers, CSS px per logical px. */
function view(w: number, h: number, dpr: number) {
  // zoom (REQ-BFG-040): the build screen's scale before the phone cap (buildScale without the dpr) and its layout, the
  // short bands this fallback was made for (a phone now zooms out and its band holds its panels: tests/zoom.test.ts).
  // bb-0.8.6: that scale is legacyScale (0.8.5's), which the pack-row guard no longer picks for these views
  const v = computeView(w, h, dpr, (pw, ph, portrait) => legacyScale(pw, ph, portrait));
  return { v, L: buildLayout(v.W, v.H, v.portrait, 5), k: v.scale / v.dpr };
}
const TOUCH = { touch: true, hover: false, busy: false };
const OFFER: Sel = { kind: "offer", wagon: 0, slot: 0 };

/** The views of the reproduction (output-shoptap2/repro): the operator's phones as their browsers size the page. */
const SHORT: [string, number, number, number][] = [
  ["iPhone 13 in Safari 390x664", 390, 664, 3], ["390x660", 390, 660, 3], ["390x700 (iOS 26 Compact, about)", 390, 700, 3],
  ["iPhone 16 Pro iOS 26 Compact 402x718", 402, 718, 3], ["390x750", 390, 750, 3], ["iPhone 15 Pro Max in Safari 430x739", 430, 739, 3],
  ["iPhone 15 in Safari 393x659", 393, 659, 3], ["the narrowest build screen, 320x600 (160 px)", 320, 600, 3], ["small 360x640", 360, 640, 2],
];

describe("shoptap2: the panel's rect on every portrait phone view", () => {
  it("where the band is shorter than PORT_BAND a finger's panel is PORT_BAND tall over the band, under the top bar, above the cargo tray; else the band", () => {
    let short = 0, full = 0;
    for (const dpr of [2, 3]) for (let w = 320; w <= 430; w += 2) for (let h = 480; h <= 960; h += 2) {
      const { v, L } = view(w, h, dpr);
      if (!v.portrait) continue;
      const a = L.info, tag = `${w}x${h} @${dpr} (${v.W}x${v.H} x${v.scale}, band ${a.h})`;
      for (const grow of ["up", "down"] as const) {
        const r = panelRect(L, grow);
        if (a.h >= PORT_BAND) {
          expect(r, tag).toBe(a);
          full++;
          continue;
        }
        expect([r.x, r.w, r.h], tag).toEqual([a.x, a.w, PORT_BAND]);
        expect(r.y, `${tag}: under the top bar`).toBeGreaterThanOrEqual(L.bar.y + L.bar.h + 1);
        expect(r.y + r.h, `${tag}: above the cargo tray`).toBeLessThanOrEqual(L.cargo.y - 2);
        expect(r.y <= a.y && r.y + r.h >= a.y + a.h, `${tag}: over the band`).toBe(true);
        if (grow === "down") expect(r.y, `${tag}: down from the band's top`).toBe(a.y);
        else expect(r.y + r.h, `${tag}: up from the band's bottom`).toBe(a.y + a.h);
        expect(hit(r, L.fight) || hit(r, L.cargo), `${tag}: clear of FIGHT and cargo`).toBe(false);
        short++;
      }
    }
    // most phone views are short: only a viewport about 843 CSS px tall (at 390 wide) gives the band its 69 px
    expect(short).toBeGreaterThan(20000);
    expect(full).toBeGreaterThan(1000);
  });

  it("measured on the reproduction's views: the band, the panel grown down (a shop card) and up (anything else)", () => {
    const row = (w: number, h: number, dpr: number) => {
      const { v, L } = view(w, h, dpr), d = panelRect(L, "down"), u = panelRect(L, "up");
      return `${w}x${h}: ${v.W}x${v.H} x${v.scale}, band ${L.info.h} at y ${L.info.y}; down y ${d.y}-${d.y + d.h}; up y ${u.y}-${u.y + u.h}`;
    };
    // bb-0.8.6 (REQ-BFG-051 P5; oracles 43f2c3d185b37c07 (4), b24d14b979bbded9): these pre-cap layouts (167-195 px wide)
    // can't hold a pack slot in the grid's margin, so the two packs take a 30 px row under REROLL's (+33: the band starts
    // at y 139, not 106, and is 33 px shorter, down to 0); was: band 69 / 40 / 38 / 8 / 15 / 29 / 24 at y 106
    expect([[390, 844, 3], [390, 664, 3], [390, 660, 3], [390, 700, 3], [402, 718, 3], [390, 750, 3], [430, 739, 3]].map(([w, h, d]) => row(w, h, d))).toEqual([
      "390x844: 167x361 x7, band 36 at y 139; down y 139-208; up y 106-175",
      "390x664: 195x332 x6, band 7 at y 139; down y 139-208; up y 77-146",
      "390x660: 195x330 x6, band 5 at y 139; down y 139-208; up y 75-144",
      "390x700: 167x300 x7, band 0 at y 139; down y 139-208; up y 70-139",
      "402x718: 172x307 x7, band 0 at y 139; down y 139-208; up y 70-139",
      "390x750: 167x321 x7, band 0 at y 139; down y 139-208; up y 70-139",
      "430x739: 184x316 x7, band 0 at y 139; down y 139-208; up y 70-139",
    ]);
  });

  it("the decision: a finger's selection that has a panel; never the mouse, a hover, a drag, no selection, landscape or a full band", () => {
    // bb-0.8.6 (PACKS P5): 390x844's pre-cap band is 36 px now (the pack row); 390x1000's is the full 69 (was 390x844)
    const s = view(390, 664, 3).L, full = view(390, 1000, 3).L, land = view(844, 390, 3).L;
    expect(full.info.h).toBe(69);
    const fits = () => true;
    expect(panelArea(s, OFFER, TOUCH, fits)).toEqual(panelRect(s, "down"));
    for (const sel of [{ kind: "item", uid: 1 }, { kind: "turret", index: 0 }, { kind: "fitted", uid: 950 }, { kind: "route", index: 0 }, { kind: "cargo", uid: 9 }] as Sel[]) {
      expect(panelArea(s, sel, TOUCH, fits), sel.kind).toEqual(panelRect(s, "up"));
    }
    expect(panelArea(s, OFFER, { ...TOUCH, touch: false }, fits)).toBe(s.info); // the mouse: 0.8.0's band
    expect(panelArea(s, OFFER, { ...TOUCH, hover: true }, fits)).toBe(s.info); // a mouse hovering a card
    expect(panelArea(s, OFFER, { ...TOUCH, busy: true }, fits)).toBe(s.info); // a drag or a belt draw: the deck in sight
    expect(panelArea(s, { kind: "none" }, TOUCH, fits)).toBe(s.info); // idle: the hero card and NEXT BATTLE, as before
    expect(panelArea(s, { kind: "turret", index: 3 }, TOUCH, () => null)).toBe(s.info); // a selection without a panel
    expect(panelArea(full, OFFER, TOUCH, fits)).toBe(full.info); // a 69 px band that holds the panel is the panel's
    expect(panelArea(land, OFFER, TOUCH, fits)).toBe(land.info); // the landscape column
    let asked = 0;
    panelArea(s, OFFER, { ...TOUCH, touch: false }, () => { asked++; return true; });
    panelArea(land, OFFER, TOUCH, () => { asked++; return true; });
    panelArea(s, OFFER, { ...TOUCH, busy: true }, () => { asked++; return true; });
    expect(asked, "the panel is never planned twice for the mouse, landscape or a drag").toBe(0);
  });

  it("the grown panel's overhang (what a press goes through to): the parts above and below the band, nothing on a band-sized panel", () => {
    for (const [w, h] of [[390, 664], [390, 700], [430, 739], [390, 844]] as const) {
      const { L } = view(w, h, 3), b = L.info;
      for (const grow of ["up", "down"] as const) {
        const r = panelRect(L, grow), o = overhang(r, b), tag = `${w}x${h} ${grow}`;
        expect(o.reduce((s, q) => s + q.h, 0) + Math.min(b.h, r.h), tag).toBe(r.h); // the overhang and the band make the panel
        for (const q of o) {
          expect(within(q, r), tag).toBe(true);
          expect(hit(q, b), `${tag}: never over the band`).toBe(false);
        }
        if (b.h >= PORT_BAND) expect(o, tag).toEqual([]);
        else expect(o, tag).toEqual(grow === "down" ? [{ x: r.x, y: b.y + b.h, w: r.w, h: r.h - b.h }] : [{ x: r.x, y: r.y, w: r.w, h: r.h - b.h }]);
      }
    }
    // a panel clamped under the top bar can overhang on both sides of a band
    expect(overhang({ x: 3, y: 15, w: 161, h: 75 }, { x: 3, y: 40, w: 161, h: 10 })).toEqual([{ x: 3, y: 15, w: 161, h: 25 }, { x: 3, y: 50, w: 161, h: 40 }]);
  });

  it("a panel whose kept text doesn't fit PORT_BAND grows PANEL_STEP at a time until it does, at most to the room there is", () => {
    const s = view(390, 700, 3).L, full = view(390, 844, 3).L;
    const need = (n: number) => (r: R) => r.h >= n;
    expect(panelArea(s, { kind: "item", uid: 1 }, TOUCH, need(90)).h).toBe(PORT_BAND + 4 * PANEL_STEP); // 69, 75, 81, 87, 93
    expect(panelArea(s, OFFER, TOUCH, need(115))).toEqual(panelRect(s, "down", PORT_BAND + 8 * PANEL_STEP));
    // a full band that can't hold a panel grows too (no such panel on 390x844: every one fits its 69 px band there)
    expect(panelArea(full, { kind: "item", uid: 1 }, TOUCH, need(80)).h).toBe(PORT_BAND + 2 * PANEL_STEP);
    // never past the top bar or the cargo tray: a panel that never fits stops at the room there is
    const most = s.cargo.y - 2 - (s.bar.y + s.bar.h + 1);
    for (const sel of [OFFER, { kind: "item", uid: 1 } as Sel]) {
      const r = panelArea(s, sel, TOUCH, () => false);
      expect([r.y, r.h], sel.kind).toEqual([s.bar.y + s.bar.h + 1, most]);
    }
  });
});

// ---------------------------------------------------------------------------------------------------- every touch panel
const SHORTB = [K(4, 5), K(4, 4), K(4, 3), K(4, 2), K(4, 1), K(4, 0)];
const rig = (uid: number, def: string, x: number, y: number, rot = 0, stars = 1): Placed => ({ uid, def, x, y, ...rotField(def, rot), ...(stars > 1 ? { stars } : {}) });

/** FURNACE with the KILN's belt, `items` more, 2 gold. */
function furnace(items: Placed[] = []): Run {
  const run = newRun("furnace", 5, "shoptap2-panels");
  run.build = { hero: "furnace", items: [{ uid: 1, def: "kiln", x: 4, y: 6 }, ...items], routes: [{ factory: 1, cells: [...SHORTB] }], mods: [], beltCap: 40, hullBonus: 0 };
  run.inventory = [];
  run.gold = 2;
  return run;
}

/** Every panel a finger can open: each buyable module as a shop card and in cargo (every star it can have), each rig at
 *  three places and each factory placed (every star), each core and gear fitted (every star, on two heroes' guns), each
 *  turret installed (every star, with a core and gear), the heroes' starting parts (their signature factories), a belt. */
function panels(): { id: string; run: Run; sel: Sel; part: "offer" | "cargo" | "carrier" }[] {
  const out: ReturnType<typeof panels> = [];
  for (const d of buyableModules()) {
    const stars = fusible(d.id) ? [1, 2, 3] : [1];
    const o = furnace();
    o.shop.wagons = [{ merchant: d.merchant ?? "ironmonger", offers: [{ def: d.id, price: d.price, sold: false }] }] as Run["shop"]["wagons"];
    out.push({ id: `offer ${d.id}`, run: o, sel: OFFER, part: "offer" });
    for (const s of stars) {
      const c = furnace();
      c.inventory = [{ uid: 900, def: d.id, ...(s > 1 ? { stars: s } : {}) }];
      out.push({ id: `cargo ${d.id} ★${s}`, run: c, sel: { kind: "cargo", uid: 900 }, part: "cargo" });
      if (d.kind === "gate") {
        for (const [x, y, rot] of [[3, 3, 1], [0, 9, 0], [5, 3, 0]] as const) out.push({ id: `${d.id} ★${s} @${x},${y}`, run: furnace([rig(10, d.id, x, y, rot, s)]), sel: { kind: "item", uid: 10 }, part: "carrier" });
      } else if (d.kind === "factory") {
        out.push({ id: `${d.id} ★${s}`, run: furnace([{ uid: 10, def: d.id, x: 0, y: 6, ...(s > 1 ? { stars: s } : {}) }]), sel: { kind: "item", uid: 10 }, part: "carrier" });
      } else if (d.kind === "mod" || d.kind === "core") {
        for (const hero of ["furnace", "weaver"] as const) {
          const run = newRun(hero, 5, "shoptap2-fit");
          run.build.mods = [{ uid: 950, def: d.id, turret: 0, ...(s > 1 ? { stars: s } : {}) }];
          out.push({ id: `${d.id} ★${s} fitted on ${hero}`, run, sel: { kind: "fitted", uid: 950 }, part: "carrier" });
        }
      } else if (d.kind === "turret") {
        const run = furnace();
        setTurretList(run.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: d.id, uid: 700, ...(s > 1 ? { stars: s } : {}) }]);
        run.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
        out.push({ id: `turret ${d.id} ★${s} with a core and gear`, run, sel: { kind: "turret", index: 1 }, part: "carrier" });
      }
    }
  }
  for (const hero of PLAYABLE_HEROES) {
    const run = newRun(hero, 5, "shoptap2-start");
    for (const p of run.build.items) out.push({ id: `${hero}'s starting ${p.def}`, run, sel: { kind: "item", uid: p.uid }, part: "carrier" });
    if (turretSlots(run.build)[0]?.turret) out.push({ id: `${hero}'s starting turret`, run, sel: { kind: "turret", index: 0 }, part: "carrier" });
    run.build.routes.forEach((_, i) => out.push({ id: `${hero}'s belt ${i + 1}`, run, sel: { kind: "route", index: i }, part: "carrier" }));
  }
  out.push({ id: "the KILN's belt", run: furnace(), sel: { kind: "route", index: 0 }, part: "carrier" });
  return out;
}

/** The panel a finger opens for `c` on view `v` / layout `L`: the rect panelArea gives it and its plan there. */
function opened(v: ReturnType<typeof view>["v"], L: BuildLayout, c: ReturnType<typeof panels>[number]) {
  const ctx = { game: { ui: new UI(), t: 0, view: v }, run: c.run, touch: true, L } as unknown as Ctx;
  const memo = new Map<string, ReturnType<typeof detailsPlan>>();
  const plan = (r: R) => {
    const key = `${r.x},${r.y},${r.w},${r.h}`;
    if (!memo.has(key)) memo.set(key, detailsPlan(ctx, c.sel, null, r));
    return memo.get(key)!;
  };
  const area = panelArea(L, c.sel, TOUCH, (r) => { const d = plan(r); return d ? keptWhole(d.plan) : null; });
  return { area, d: plan(area) };
}

describe("shoptap2 (REQ-BFG-034, -035): on the short views every touch panel shows its description whole, in its grown rect", () => {
  const all = panels();
  for (const [name, w, h, dpr] of SHORT) {
    it(`${name}: every shop card, cargo part and carrier part: its kept text whole, at least one body line, its buttons inside, SELL on a sellable part`, () => {
      const { v, L, k } = view(w, h, dpr);
      expect(v.portrait, name).toBe(true);
      expect(L.info.h, `${name}: a short band`).toBeLessThan(PORT_BAND);
      let n = 0, sell = 0, taller = 0;
      for (const c of all) {
        const { area, d } = opened(v, L, c);
        const tag = `${name}: ${c.id}`;
        expect(d, tag).not.toBeNull();
        const p = d!.plan, lines = visibleLines(p).filter((q) => q.line !== "rule");
        expect(area.h, tag).toBeGreaterThanOrEqual(PORT_BAND);
        if (area.h > PORT_BAND) taller++;
        expect(p.r, tag).toEqual(area);
        expect(within(p.r, { x: 0, y: L.bar.y + L.bar.h + 1, w: v.W, h: L.cargo.y - 2 - (L.bar.y + L.bar.h + 1) }), `${tag}: under the top bar, above the cargo`).toBe(true);
        expect(keptWhole(p), `${tag}: kept text whole ${JSON.stringify(d!.t.labels)}`).toBe(true);
        expect(lines.length, `${tag}: a description`).toBeGreaterThanOrEqual(1);
        expect(p.headerOnly, `${tag}: not a header-only strip`).toBeNull();
        for (const b of p.rects ?? []) expect(within(b, p.r), `${tag}: button inside`).toBe(true);
        if (c.part === "offer") expect(d!.t.labels, tag).toEqual([expect.stringMatching(/^BUY(\+MERGE)? \d+G$/)]);
        if (c.part === "cargo") expect(d!.t.labels.at(-1), tag).toMatch(/^SELL \+\d+G$/);
        if (c.part === "carrier" && d!.t.labels.some((l) => /^SELL/.test(l))) sell++;
        n++;
      }
      expect(n).toBeGreaterThan(800);
      expect(sell).toBeGreaterThan(300);
      // only the narrowest build screen (160 px) has panels that need more than PORT_BAND
      // U2a (REQ-BFG-046): 10 (was 18): the new faces are shorter
      expect(taller, `${name}: panels taller than PORT_BAND`).toBe(v.W < 165 ? 10 : 0);
      expect(k * PORT_BAND, `${name}: the panel is at least a 69 px band in CSS px`).toBeGreaterThan(130);
    });
  }

  it("on the build-screen widths a portrait phone can have with a short band (160-298 px; every one to 170, then every 3rd): every panel whole; exactly PORT_BAND from 165 px", () => {
    // the rect test's view grid (320-430 x 480-960 CSS px, DPR 2 and 3) gives a short band at every width from 160 to 298
    // (below 299 the shop is always two rows); a wider build screen wraps no line more and seats its buttons no worse
    const widths = [...Array.from({ length: 11 }, (_, i) => 160 + i), ...Array.from({ length: 43 }, (_, i) => 172 + 3 * i), 298];
    const counts: string[] = [];
    for (const W of widths) {
      const v = { W, H: 300, scale: 7, dpr: 3, portrait: true }, L = buildLayout(W, 300, true, 5);
      expect(L.info.h).toBeLessThan(PORT_BAND);
      let taller = 0, most = 0;
      for (const c of all) {
        const { area, d } = opened(v as ReturnType<typeof view>["v"], L, c);
        expect(keptWhole(d!.plan), `W ${W}: ${c.id}`).toBe(true);
        if (area.h > PORT_BAND) taller++;
        most = Math.max(most, area.h);
      }
      if (taller) counts.push(`W ${W}: ${taller} taller, up to ${most}`);
      else expect(most, `W ${W}`).toBe(PORT_BAND);
    }
    // W 160-164: a 375-wide iPhone at x7 (375 x 3 / 7 = 160): a few panels need one line more (STATIC BRUSH, LIMPET ★2,
    // SABOT ★3, OVERDRIVE ★2, GATLING ★2 and GRAPNEL ★3 gear); 165 and up, every panel fits PORT_BAND
    // U2a (REQ-BFG-046): fewer, with the new faces (was 18 / 16 / 15 / 12 / 6 at 160-164); 164 and up, every panel fits
    expect(counts).toEqual([
      "W 160: 10 taller, up to 75", "W 161: 8 taller, up to 75", "W 162: 7 taller, up to 75", "W 163: 6 taller, up to 75",
    ]);
  }, 120_000); // about 47,000 panels planned: 13 s alone on a loaded host, more under the full suite's 8 workers

  it("the measured panels of the reproduction: the TEMPER, the BOMBARD and the GANTRY PRESS card now show their text at 390x700 (0350e5f: nothing)", () => {
    const { v, L } = view(390, 700, 3);
    const temper = furnace([rig(3, "temper", 3, 3, 1)]);
    const bombard = furnace();
    setTurretList(bombard.build, [{ slot: 0, def: "scrapcannon", uid: 90 }, { slot: 1, def: "bombard", uid: 700 }]);
    bombard.build.mods = [{ uid: 950, def: "pressure", turret: 1 }, { uid: 951, def: "hopper", turret: 1 }];
    const gantry = furnace();
    gantry.shop.wagons = [{ merchant: "quartermaster", offers: [{ def: "gantry", price: 7, sold: false }] }] as Run["shop"]["wagons"];
    const look = (run: Run, sel: Sel, area: R) => {
      const d = detailsPlan({ game: { ui: new UI(), t: 0, view: v }, run, touch: true, L } as unknown as Ctx, sel, null, area)!;
      return { title: d.t.title, labels: d.t.labels, lines: visibleLines(d.plan).filter((q) => q.line !== "rule").length, whole: keptWhole(d.plan) };
    };
    // 0350e5f drew these in the 8 px band (L.info), which drawDetails leaves empty (under 14 px). bb-0.8.6 (PACKS P5): the
    // pack row takes 33 px of this pre-cap layout's band, so it is 0 px now (was 8); the grown panel is unchanged
    expect(L.info.h).toBe(0);
    for (const [run, sel] of [[temper, { kind: "item", uid: 3 }], [bombard, { kind: "turret", index: 1 }], [gantry, OFFER]] as [Run, Sel][]) {
      const before = look(run, sel, L.info), after = look(run, sel, panelArea(L, sel, TOUCH, () => true));
      expect([before.lines, before.whole], `${after.title} in the band`).toEqual([0, false]);
      // U2a (REQ-BFG-046): GANTRY PRESS's new face is its stat row (and the hint): 2 lines, the others 3 or more
      expect(after.lines, after.title).toBeGreaterThanOrEqual(after.title === "GANTRY PRESS" ? 2 : 3);
      expect(after.whole, after.title).toBe(true);
    }
  });
});

describe("shoptap2: the belt X keeps clear of the grown panel", () => {
  const decks = (): [string, Build][] => [
    ...Object.entries(SHOWCASE).map(([n, s]) => [n, s.build()] as [string, Build]),
    ...PLAYABLE_HEROES.map((h) => [`start ${h}`, heroStartBuild(h)] as [string, Build]),
  ];
  const turretRects = (L: BuildLayout, b: Build): R[] => turretSlots(b).map((s) => {
    const x = turretPivotX(L.frame, s.col0, s.width), y = turretPivotY(L.frame, s.col0, s.width), r = !s.td || s.td.kind === "heavy" ? 12 : 9;
    return { x: Math.round(x - r), y: Math.round(y - r), w: r * 2, h: r * 2 };
  });

  it("on the short views, beside every tile of every belt: a 44 CSS px square on the screen, clear of the belt panel grown over the shop", () => {
    let n = 0;
    for (const [name, w, h, dpr] of SHORT) {
      const { v, L, k } = view(w, h, dpr), side = beltXSide(k), panel = panelRect(L, "up");
      for (const [deck, b] of decks()) {
        const tr = turretRects(L, b);
        b.routes.forEach((r, index) => r.cells.forEach((cell) => {
          const tag = `${name} ${deck} belt ${index + 1} tile (${kx(cell)},${ky(cell)})`;
          const q = placeBeltX(L, b, { index, cell, cells: r.cells.join(",") }, side, tr, [panel])!;
          expect(q, tag).not.toBeNull();
          expect(q.w * k, tag).toBeGreaterThanOrEqual(TAP_CSS);
          expect(q.x >= 0 && q.y >= L.bar.h && q.x + q.w <= v.W && q.y + q.h <= v.H, `${tag}: on the screen`).toBe(true);
          expect(hit(q, panel), `${tag}: clear of the panel`).toBe(false);
          const tile = { x: Math.round(footX(L.frame, kx(cell), ky(cell))), y: Math.round(footY(L.frame, kx(cell), ky(cell))), w: 12, h: 12 };
          expect(hit(q, tile), `${tag}: not on the tile`).toBe(false);
          n++;
        }));
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it("without a grown panel the X is placed exactly as before (keepOut empty)", () => {
    const { L, k } = view(390, 844, 3), b = SHOWCASE[Object.keys(SHOWCASE)[0]].build();
    const x = { index: 0, cell: b.routes[0].cells[2], cells: b.routes[0].cells.join(",") };
    expect(placeBeltX(L, b, x, beltXSide(k), [], [])).toEqual(placeBeltX(L, b, x, beltXSide(k), []));
    expect(ITEMS.temper).toBeTruthy();
  });
});
