// SHOPCARD-1e (REQ-BFG-081, REQ-BFG-115; BRIEF-SHOPCARD1E section 3; READ-12's fix list): display only. One group per fix, each pinning the words, their rows
// and widths, the sim lines that make them true, and that they lay out whole:
//   E1  a factory's {BELT} stat icon has a tap note (glossary.ts BELT_NOTE), listed on its ⓘ KEYWORDS page beside RATE
//   E2  ASSEMBLY LINE: "FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING n% SOONER." (two rows; was YOUR RIGS)
//   E3  a sale offer's buy label says SALE: "SALE: BUY 6G" (inspector.ts offerLabel; a scout's deal cut the price: run.ts:454 priceOf, chrome.ts:148)
//   E4  a merge offer's buy label names the star the buy makes: "MERGE ★3: 7G" (was BUY+MERGE 7G, the same for ★2 and ★3)
//   E5  the desk's hover tooltip over a card: the details column is not drawn under it (chrome.ts tooltipOffer; the picture and the log are in the REPORT)
// Only glossary.ts, keywords.ts, faces.ts, inspector.ts and chrome.ts changed (git diff --name-only shopcard1d-accepted -- src); the sim is untouched.
import { describe, expect, it } from "vitest";
import { installRaster } from "./raster.helpers";
import { TAP_CSS } from "../src/ui/tap";
import { buildLayout, buildScale, panelArea, phoneBarLift, phoneScreen, type Sel } from "../src/screens/build/layout";
import { runeRowFits, runeRowH, shiftLayout } from "../src/ui/runeBar";
import { UI } from "../src/ui/ui";
import { detailsPlan, offerLabel, offerPanel, panelFit, portraitButtons, visibleLines } from "../src/screens/build/inspector";
import type { Ctx } from "../src/screens/build/actions";
import { newRun, rollShop, type Run } from "../src/game/run";
import { ITEMS, buyableModules, type ItemDef } from "../src/sim/content";
import { effectAt, fusible, outputsAt } from "../src/sim/stars";
import { icons, stripIcons, textWidth, wrap } from "../src/render/font";
import { faceAt } from "../src/ui/faces";
import { faceBlocks } from "../src/screens/build/faceBlocks";
import { BELT_NOTE, GLOSSARY_WRAP_W, STAT_ICONS, glossaryEntry, glossaryText, statIconNote } from "../src/ui/glossary";
import { keywordTargets, panelPiece, panelWords } from "../src/screens/build/keywords";
import { tooltipOffer } from "../src/screens/build/chrome";
import type { BuildScreen } from "../src/screens/build/build";
import { fmtCount } from "../src/ui/statFormat";
import { startIn } from "../src/ui/abilityText";

installRaster();

const BAND = GLOSSARY_WRAP_W; // 225 px: the phone panel's text width, 5x7
const STARS = [1, 2, 3];
const DAYS: (number | undefined)[] = [undefined, 5, 10];
const rowsOf = (markup: string, width = BAND): string[] => wrap(icons(markup), width, "5").map((r) => stripIcons(r).replace(/\s+/g, " ").trim());
const FACTORIES = Object.values(ITEMS).filter((d) => d.kind === "factory");
const BUYABLE = buyableModules();

/** The build screen as the game frames it (tests/shopcard1d.test.ts's framed). */
function framed(w: number, h: number, dpr: number, runes = 1, offers = 5) {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
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
const VIEWS: [string, number, number, number, boolean][] = [["phone 402x690", 402, 690, 3, true], ["phone 360x640", 360, 640, 2, true], ["desk 1920x1080", 1920, 1080, 1, false]];
/** The details panel of a piece in cargo (`stars`) on `day`, as the game plans it on view `vi`. */
function cargoPanelPlan(vi: number, def: string, stars: number, day: number) {
  const [, w, h, dpr, touch] = VIEWS[vi];
  const run = newRun("furnace", day, `shopcard1e-${def}-${stars}`);
  run.inventory = [{ uid: 900, def, ...(stars > 1 ? { stars } : {}) }];
  const sel: Sel = { kind: "cargo", uid: 900 }, f = framed(w, h, dpr);
  const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch, L: f.L } as unknown as Ctx;
  const area = panelArea(f.L, sel, { touch, hover: false, busy: false }, panelFit(ctx, sel, !!f.L.phone));
  const d = detailsPlan(ctx, sel, null, area)!;
  return { d, plan: d.plan, run, sel, ctx };
}

// ------------------------------------------------------------------------------------------------------------------ E1
describe("SHOPCARD-1e E1 (READ-12 fix 5): a factory's {BELT} stat icon has a tap note, listed on its KEYWORDS page beside RATE", () => {
  it("BELT_NOTE leads with its icon, says how many belts (not belt tiles), takes two rows of the 225 px note box at most and holds no digit; {BELT} joins the stat icons after {GEAR}", () => {
    expect(BELT_NOTE).toBe("{BELT}: HOW MANY BELTS IT CAN FEED, NOT BELT TILES.");
    expect(statIconNote("BELT", "factory", false)).toBe(BELT_NOTE);
    expect(statIconNote("BELT", undefined, false), "the note is the icon's, whatever the row").toBe(BELT_NOTE);
    expect([...STAT_ICONS]).toEqual(["RATE", "SLUG", "GEAR", "BELT"]);
    expect(rowsOf(BELT_NOTE).length).toBe(2); // 246 px at 5x7: 2 rows (": HOW MANY BELTS IT CAN FEED, NOT BELT" / "TILES.")
    expect(textWidth(icons(BELT_NOTE), "5")).toBe(246);
    expect(/\d/.test(BELT_NOTE)).toBe(false);
    expect(icons(BELT_NOTE).indexOf(":")).toBeGreaterThan(0); // a note leads with its icon, then a colon, as {SLUG}'s and {GEAR}'s
    // not "IN TURN": battle.ts:1123 stamp feeds its belts in turn, but a pour factory (TWIN MOULD, the CRUCIBLE) puts slugs on several at once, so the note says the count only
    expect(BELT_NOTE).not.toMatch(/IN TURN/);
  });

  it("the word BELT's own rune-only note and scope stay as they were (the new note is the stat icon's)", () => {
    const row = glossaryEntry("BELT")!;
    expect(row.def).toBe("BELT: YOUR BELT TILES, SHARED BY ALL YOUR BELTS.");
    expect(row.scope).toBe("rune");
    expect(glossaryText("BELT")).toBe("BELT: YOUR BELT TILES, SHARED BY ALL YOUR BELTS.");
  });

  it("every factory's stat row {BELT}n is outputsAt (stars.ts:161, the belts it can be laid: validate.ts:497-498), and its panel's KEYWORDS lists RATE then BELT with the note", () => {
    let rows = 0;
    for (const d of FACTORIES) for (const s of fusible(d.id) ? STARS : [1]) {
      const o = { hero: "furnace" as const, k: 1 }, f = faceAt(d.id, s, o);
      const belt = f?.stats?.find(([k]) => k === "BELT");
      if (!f || !belt) continue;
      expect(belt[1], `${d.id} ★${s}: the stat is outputsAt`).toBe(fmtCount(outputsAt(d.id, s)));
      const body = faceBlocks(d.id, s, o)!, ws = panelWords(body, { def: d.id, stars: s, o });
      const names = ws.map((w) => w.word);
      expect(names.filter((n) => n === "BELT").length, `${d.id} ★${s}: BELT once`).toBe(1);
      expect(ws.find((w) => w.word === "BELT")!.text, `${d.id} ★${s}`).toBe(BELT_NOTE);
      if (f.stats!.some(([k]) => k === "RATE")) expect(names.indexOf("BELT"), `${d.id} ★${s}: beside RATE`).toBe(names.indexOf("RATE") + 1);
      rows++;
    }
    expect(rows).toBeGreaterThan(40); // 15 bought factories x 3 stars and the heroes' signature factories
    // the numbers the READ-12 readers asked about: LIMPET WORKS and ASSEMBLY LINE 2 / 3 / 4 belts, GANTRY PRESS 4 / 5 / 6 (stars.ts BELT_SLOTS, lead, foot.ts footSlots)
    expect([1, 2, 3].map((s) => outputsAt("limpet", s))).toEqual([2, 3, 4]);
    expect([1, 2, 3].map((s) => outputsAt("assembly", s))).toEqual([2, 3, 4]);
    expect([1, 2, 3].map((s) => outputsAt("gantry", s))).toEqual([4, 5, 6]);
  });

  it("no other kind of piece draws a BELT word target: a rig, turret, core, gear or supply panel lists none", () => {
    let n = 0;
    for (const d of BUYABLE.filter((x) => x.kind !== "factory")) for (const s of fusible(d.id) ? STARS : [1]) {
      const o = d.kind === "core" ? { k: 1 } : { hero: "furnace" as const }, body = faceBlocks(d.id, s, o);
      if (!body) continue;
      expect(panelWords(body, { def: d.id, stars: s, o }).some((w) => w.word === "BELT"), `${d.id} ★${s}`).toBe(false);
      n++;
    }
    expect(n).toBeGreaterThan(150);
  });

  it("on the phone panel the {BELT} icon is a tap target with the note, inside the panel and clear of the buttons, on LIMPET WORKS, ASSEMBLY LINE and GANTRY PRESS (twice: its stat row and its BIGGER: +1 {BELT} line)", () => {
    for (const [def, targets] of [["limpet", 1], ["assembly", 1], ["gantry", 2]] as [string, number][]) for (const s of STARS) for (const day of [1, 5, 10]) {
      const { plan, run, sel } = cargoPanelPlan(0, def, s, day);
      const piece = panelPiece(run, sel);
      const bt = keywordTargets(visibleLines(plan), plan, piece, [], day).filter((t) => t.word === "BELT");
      expect(bt.length, `${def} ★${s} day ${day}`).toBe(targets);
      for (const t of bt) {
        expect(t.text, `${def} ★${s} day ${day}`).toBe(BELT_NOTE);
        expect(t.r.x >= plan.r.x && t.r.x + t.r.w <= plan.r.x + plan.r.w && t.r.y >= plan.r.y && t.r.y + t.r.h <= plan.r.y + plan.r.h, `${def} ★${s} day ${day}: inside the panel`).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------ E2
describe("SHOPCARD-1e E2 (READ-12 fix 1): ASSEMBLY LINE says ALL your rigs", () => {
  it("'FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING n% SOONER.' (★3: AT ONCE.) at every star on days 1, 5 and 10: two rows of the 225 px band, 350 / 350 / 332 px", () => {
    const px = [350, 350, 332];
    for (const s of STARS) for (const day of DAYS) {
      const [line] = faceAt("assembly", s, { k: 1, hero: "furnace", day })!.rules.map((r) => r.text);
      const soon = startIn(effectAt("assembly", s).factory!.commission!);
      expect(line, `★${s} day ${day}`).toBe(`FEEDS A GUN: EACH FIGHT, ALL YOUR RIGS START WORKING ${soon}.`);
      expect(soon, `★${s}`).toBe(["50% SOONER", "75% SOONER", "AT ONCE"][s - 1]);
      expect(rowsOf(line).length, `★${s} day ${day}`).toBe(2);
      expect(textWidth(icons(line), "5"), `★${s} day ${day}`).toBe(px[s - 1]);
    }
  });

  it("the second row lays out whole on the finger's panel, the narrow phone and the desk's column at every star on days 1, 5 and 10: every word in order, each line a pitch under the last and inside the panel", () => {
    let panels = 0;
    for (let vi = 0; vi < VIEWS.length; vi++) for (const day of [1, 5, 10]) for (const s of STARS) {
      const { plan } = cargoPanelPlan(vi, "assembly", s, day);
      const vis = visibleLines(plan).flatMap((v) => (v.line === "rule" ? [] : [{ y: v.y, line: v.line }]));
      const text = (l: { line: { spans: { t: string }[] } }): string => l.line.spans.map((sp) => sp.t).join("");
      const joined = vis.map(text).join(" ").replace(/\s+/g, " ");
      const rule = faceAt("assembly", s, { k: 1, hero: "furnace", day })!.rules[0].text;
      const words = stripIcons(icons(rule)).replace(/\s+/g, " ").split(" ").filter((x) => x && !/\d/.test(x));
      let at = 0;
      for (const word of words) {
        const i = joined.indexOf(word, at);
        expect(i, `${VIEWS[vi][0]} day ${day} ★${s}: "${word}" among the visible lines`).toBeGreaterThanOrEqual(0);
        at = i + word.length;
      }
      vis.forEach((l, i) => {
        if (i) expect(l.y - vis[i - 1].y, `${VIEWS[vi][0]} day ${day} ★${s}: line ${i} under line ${i - 1}`).toBeGreaterThanOrEqual((vis[i - 1].line as unknown as { pitch: number }).pitch);
        expect(l.y + ((l.line as unknown as { font: string }).font === "5" ? 7 : 5), `${VIEWS[vi][0]} day ${day} ★${s}: line ${i} inside the panel`).toBeLessThanOrEqual(plan.maxY);
      });
      panels++;
    }
    expect(panels).toBe(VIEWS.length * 3 * STARS.length);
  });
  // the sim's side (every rig of yours, the other belt's too, starts at x commission; cut off, nothing changes) is pinned by tests/txt096.faces.test.ts (battle.ts:714-736, 2574-2587)
});

// ------------------------------------------------------------------------------------------------------------------ E3, E4
describe("SHOPCARD-1e E3, E4 (READ-12 round S): a sale offer's buy label says SALE, a merge offer's names its star", () => {
  const SHOP_DEFS = Object.values(ITEMS).filter((d: ItemDef) => d.merchant && d.price > 0);
  const WIDEST = 60; // the least button is 64 px (inspector.ts topRowButtons, portraitButtons' even width; button = text + 4)

  it("offerLabel: BUY n, SALE: BUY n (a price under the list price), MERGE ★n: p (the star the buy makes; the merge wins over a sale), BUY+USE and SALE: BUY+USE for a supply", () => {
    const d = ITEMS.gantry; // list price 7
    expect(offerLabel(d, 7, null)).toBe("BUY 7G");
    expect(offerLabel(d, 6, null)).toBe("SALE: BUY 6G");
    expect(offerLabel(d, 7, 2)).toBe("MERGE ★2: 7G");
    expect(offerLabel(d, 7, 3)).toBe("MERGE ★3: 7G");
    expect(offerLabel(d, 6, 3), "a merge on sale: the merge label wins, the cut price is still the price (shop.ts:338-342's order)").toBe("MERGE ★3: 6G");
    const sup = Object.values(ITEMS).find((x) => x.kind === "supply" && x.merchant && x.price > 1)!;
    expect(offerLabel(sup, sup.price, null)).toBe(`BUY+USE ${sup.price}G`);
    expect(offerLabel(sup, sup.price - 1, null)).toBe(`SALE: BUY+USE ${sup.price - 1}G`);
  });

  it("every label fits its button at every price the game can show, and at 1-13 for every form: at most 60 px of 3x5 (the 360x640 strip's one 64 px button)", () => {
    const worst = { kind: "gate" as const, price: 99 } as ItemDef;
    for (let p = 1; p <= 13; p++) for (const l of [offerLabel(worst, p, null), offerLabel({ ...worst, price: p + 1 }, p, null), offerLabel(worst, p, 2), offerLabel(worst, p, 3)]) {
      expect(textWidth(l, "3"), `${l}`).toBeLessThanOrEqual(WIDEST);
    }
    // a supply (BELT PACK 2G, ARMOR PACK 5G: content.ts:977, 982) never costs two digits; its sale label is 59 px at 9G (two digits would be 63)
    expect(Math.max(...Object.values(ITEMS).filter((x) => x.kind === "supply").map((x) => x.price))).toBeLessThanOrEqual(9);
    for (let p = 1; p <= 9; p++) for (const l of [offerLabel({ ...worst, kind: "supply" }, p, null), offerLabel({ ...worst, kind: "supply", price: p + 1 }, p, null)]) {
      expect(textWidth(l, "3"), `${l}`).toBeLessThanOrEqual(WIDEST);
    }
    // the game's own dearest offer is 13G (THUNDERER, content.ts); the long forms, with their widths (REPORT section 2)
    expect(Math.max(...SHOP_DEFS.map((x) => x.price))).toBe(13);
    expect(textWidth("MERGE ★3: 13G", "3")).toBe(47);
    expect(textWidth("MERGE ★3: 7G", "3")).toBe(43);
    expect(textWidth("SALE: BUY 10G", "3")).toBe(47);
    expect(textWidth("SALE: BUY+USE 9G", "3")).toBe(59);
    expect(textWidth("BUY+MERGE 7G", "3"), "1d's label, for the width the new one must not exceed").toBe(46);
    // beside every title on the phone band (portraitButtons) and on the small strip: for every shop piece at every price from 1 to its list price, plain, sale and merged
    const band = { x: 3, y: 100, w: 161, h: 69 };
    for (const x of SHOP_DEFS) {
      const labels = [...Array.from({ length: x.price }, (_, i) => offerLabel(x, i + 1, null)), ...(x.kind === "supply" ? [] : [offerLabel(x, x.price, 2), offerLabel(x, x.price, 3)])];
      for (const l of labels) {
        const { rects } = portraitButtons(x.name, `${x.kind} · ${x.merchant}`, [l], band);
        expect(rects[0].w, `${x.id}: ${l}`).toBeGreaterThanOrEqual(textWidth(l, "3") + 4);
        expect(rects[0].x + rects[0].w, `${x.id}: ${l}`).toBeLessThanOrEqual(band.x + band.w - 4);
        expect(textWidth(l, "3") + 4, `${x.id}: ${l} on the 64 px strip`).toBeLessThanOrEqual(64);
      }
    }
  });

  /** A run whose first offer is `def` at `price`, with `owned` copies' stars in cargo (a merge offer: [1] makes ★2, [2, 1] makes ★3). */
  const offering = (def: string, price: number, owned: number[] = []): Run => {
    const run = newRun("furnace", 5, `shopcard1e-${def}`);
    run.gold = 99;
    run.inventory = owned.map((st, i) => ({ uid: 900 + i, def, ...(st > 1 ? { stars: st } : {}) }));
    run.shop.wagons = [{ merchant: ITEMS[def].merchant!, offers: [{ def, price, sold: false }] }] as Run["shop"]["wagons"];
    return run;
  };

  it("the real panel (offerPanel) of GANTRY PRESS and WHETSTONE in the six states READ-12's round S read: BUY, SALE: BUY, MERGE ★2, MERGE ★3; and SOLD", () => {
    for (const def of ["gantry", "whetstone"]) {
      const list = ITEMS[def].price;
      expect(offerPanel(offering(def, list), 0, 0)!.labels, `${def} plain`).toEqual([`BUY ${list}G`]);
      expect(offerPanel(offering(def, list - 1), 0, 0)!.labels, `${def} sale`).toEqual([`SALE: BUY ${list - 1}G`]);
      expect(offerPanel(offering(def, list, [1]), 0, 0)!.labels, `${def} merge ★2`).toEqual([`MERGE ★2: ${list}G`]);
      expect(offerPanel(offering(def, list, [2, 1]), 0, 0)!.labels, `${def} merge ★3`).toEqual([`MERGE ★3: ${list}G`]);
      expect(offerPanel(offering(def, list - 1, [2, 1]), 0, 0)!.labels, `${def} merge ★3 on sale: the merge wins`).toEqual([`MERGE ★3: ${list - 1}G`]);
      const sold = offering(def, list);
      sold.shop.wagons[0].offers[0].sold = true;
      expect(offerPanel(sold, 0, 0)!.labels, `${def} sold`).toEqual(["SOLD"]);
    }
    // the ★2 and ★3 panels of a piece differ now (they were one picture): the label names the star, and the merge line stays off the face (U2e step 4, REQ-BFG-070)
    const a = offerPanel(offering("gantry", 7, [1]), 0, 0)!, b = offerPanel(offering("gantry", 7, [2, 1]), 0, 0)!;
    expect(a.labels[0]).not.toBe(b.labels[0]);
    expect(a.body.some((x) => x.role === "merges") || b.body.some((x) => x.role === "merges")).toBe(false);
  });

  it("a sale is the game's own: with a scout's deal (run.shop.discount) every offer rollShop prices under its list price reads SALE, every other one does not (run.ts:454 priceOf, chrome.ts:148)", () => {
    let sale = 0, plain = 0;
    for (const discount of [0, 1, 2]) for (const day of [1, 4, 7]) for (let seed = 0; seed < 6; seed++) {
      const run = newRun("furnace", day, `shopcard1e-roll-${seed}`);
      run.shop.discount = discount;
      rollShop(run);
      run.gold = 99;
      run.shop.wagons.forEach((w, wi) => w.offers.forEach((o, oi) => {
        const t = offerPanel(run, wi, oi)!, cut = o.price < ITEMS[o.def].price;
        expect(o.price, `${o.def}: run.ts priceOf`).toBe(Math.max(1, ITEMS[o.def].price - discount));
        const label = t.labels[0];
        // a merge on sale shows the merge label (its cut price still the price); a plain offer shows SALE: only when cut
        if (/^MERGE /.test(label)) expect(label).toMatch(new RegExp(`^MERGE ★[23]: ${o.price}G$`));
        else expect(label.startsWith("SALE: "), `${o.def} price ${o.price} of ${ITEMS[o.def].price}`).toBe(cut);
        if (cut) sale++; else plain++;
      }));
    }
    expect(sale).toBeGreaterThan(20);
    expect(plain).toBeGreaterThan(20);
  });
});

// ------------------------------------------------------------------------------------------------------------------ E5
describe("SHOPCARD-1e E5 (cap's SHOPCARD-1d review): the desk's hover tooltip and the details column", () => {
  /** A stand-in for the build screen with the fields chrome.ts tooltipOffer reads. */
  const screen = (over: Record<string, unknown> = {}): BuildScreen => ({
    hover: { wagon: 0, slot: 0 }, ed: { carry: null }, caravan: { ready: true },
    offers: () => [{ wagon: 0, slot: 0 }],
    run: { shop: { wagons: [{ offers: [{ def: "whetstone", price: 3, sold: false }] }] } },
    L: { cards: [{ x: 12, y: 23, w: 70, h: 46 }] },
    ...over,
  }) as unknown as BuildScreen;

  it("the tooltip shows (and so the column is not drawn) exactly when a mouse rests on a parked card with nothing carried", () => {
    const t = tooltipOffer(screen())!;
    expect(t.idx).toBe(0);
    expect(t.o.def).toBe("whetstone");
    expect(tooltipOffer(screen({ hover: null })), "no hover").toBeNull();
    expect(tooltipOffer(screen({ ed: { carry: { src: {} } } })), "a piece carried").toBeNull();
    expect(tooltipOffer(screen({ caravan: { ready: false } })), "the caravan still rolling in").toBeNull();
    expect(tooltipOffer(screen({ offers: () => [] })), "the hovered offer is not in the row").toBeNull();
    expect(tooltipOffer(screen({ L: { cards: [] } })), "no card rect for it").toBeNull();
    expect(tooltipOffer(screen({ hover: { wagon: 0, slot: 3 }, offers: () => [{ wagon: 0, slot: 3 }] })), "no such offer").toBeNull();
  });

  it("a hover shows its panel without buttons (inspector.ts baseSpec: `hovering ? []`), so hiding the column removes no button or touch target", () => {
    const run = newRun("furnace", 5, "shopcard1e-hover");
    run.gold = 99;
    run.shop.wagons = [{ merchant: ITEMS.whetstone.merchant!, offers: [{ def: "whetstone", price: 3, sold: false }] }] as Run["shop"]["wagons"];
    const f = framed(1920, 1080, 1), sel: Sel = { kind: "none" } as Sel;
    const ctx = { game: { ui: new UI(), t: 0, view: f.view, W: f.W, H: f.H }, run, touch: false, L: f.L } as unknown as Ctx;
    const hovered = detailsPlan(ctx, sel, { wagon: 0, slot: 0 }, f.L.info)!;
    expect(hovered.sp.actions, "a hover's panel has no action").toEqual([]);
    expect(hovered.t.labels).toEqual([]);
    const selected = detailsPlan(ctx, { kind: "offer", wagon: 0, slot: 0 }, null, f.L.info)!;
    expect(selected.sp.actions.map((a) => a.id), "a selection's panel keeps its BUY").toEqual(["buy"]);
  });
});
